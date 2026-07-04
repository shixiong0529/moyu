from __future__ import annotations

import logging

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from jose import JWTError, jwt
from sqlalchemy import select

from auth import ALGORITHM, SECRET_KEY
from database import SessionLocal
from models import Channel, ServerMember, User

router = APIRouter(tags=["websocket"])
log = logging.getLogger("websocket")


class ConnectionManager:
    def __init__(self) -> None:
        self.channel_connections: dict[int, set[WebSocket]] = {}
        self.channel_users: dict[WebSocket, User] = {}
        # 每个用户可能同时开多个标签页/设备，用 set 存多条 DM 连接，全部广播
        self.user_connections: dict[int, set[WebSocket]] = {}
        self.dm_users: dict[WebSocket, User] = {}

    async def connect_channel(self, channel_id: int, websocket: WebSocket, user: User) -> None:
        self.channel_connections.setdefault(channel_id, set()).add(websocket)
        self.channel_users[websocket] = user

    async def disconnect_channel(self, channel_id: int, websocket: WebSocket) -> None:
        connections = self.channel_connections.get(channel_id)
        if connections is not None:
            connections.discard(websocket)
            if not connections:
                self.channel_connections.pop(channel_id, None)
        self.channel_users.pop(websocket, None)

    async def connect_dm(self, websocket: WebSocket, user: User) -> None:
        self.user_connections.setdefault(user.id, set()).add(websocket)
        self.dm_users[websocket] = user

    async def disconnect_dm(self, websocket: WebSocket) -> None:
        user = self.dm_users.pop(websocket, None)
        if user is not None:
            connections = self.user_connections.get(user.id)
            if connections is not None:
                connections.discard(websocket)
                if not connections:
                    self.user_connections.pop(user.id, None)

    async def broadcast_to_channel(self, channel_id: int, message: dict) -> None:
        dead: list[WebSocket] = []
        for websocket in list(self.channel_connections.get(channel_id, set())):
            try:
                await websocket.send_json(message)
            except Exception:
                dead.append(websocket)
        for websocket in dead:
            await self.disconnect_channel(channel_id, websocket)

    async def broadcast_to_channel_masked(
        self,
        channel_id: int,
        full_message: dict,
        masked_message: dict,
        unmask_user_ids: set[int],
    ) -> None:
        """匿名消息广播：unmask_user_ids（该服务器的 founder/mod）收到真实作者信息，
        其他人收到脱敏后的版本。同一事件按接收者身份分别下发，不能只发一份。"""
        dead: list[WebSocket] = []
        for websocket in list(self.channel_connections.get(channel_id, set())):
            user = self.channel_users.get(websocket)
            payload = full_message if (user and user.id in unmask_user_ids) else masked_message
            try:
                await websocket.send_json(payload)
            except Exception:
                dead.append(websocket)
        for websocket in dead:
            await self.disconnect_channel(channel_id, websocket)

    async def disconnect_user_channels(self, user_id: int, channel_ids: list[int]) -> None:
        """关闭某用户在指定频道上的所有 WS 连接（用于踢人/退群后即时断开）。"""
        targets: list[tuple[int, WebSocket]] = []
        for channel_id in channel_ids:
            for websocket in list(self.channel_connections.get(channel_id, set())):
                user = self.channel_users.get(websocket)
                if user is not None and user.id == user_id:
                    targets.append((channel_id, websocket))
        for channel_id, websocket in targets:
            try:
                await websocket.send_json({"type": "error", "detail": "forbidden"})
                await websocket.close(code=1008)
            except Exception:
                pass
            await self.disconnect_channel(channel_id, websocket)

    async def send_to_user(self, user_id: int, message: dict) -> None:
        dead: list[WebSocket] = []
        for websocket in list(self.user_connections.get(user_id, set())):
            try:
                await websocket.send_json(message)
            except Exception:
                dead.append(websocket)
        for websocket in dead:
            await self.disconnect_dm(websocket)


manager = ConnectionManager()


async def notify_server_members(db, server_id: int, message: dict) -> None:
    """向服务器全体成员的用户级连接推送事件（频道/分组结构变更等）。"""
    member_ids = db.scalars(
        select(ServerMember.user_id).where(ServerMember.server_id == server_id)
    ).all()
    for user_id in member_ids:
        await manager.send_to_user(user_id, message)


async def notify_channels_changed(db, server_id: int) -> None:
    await notify_server_members(db, server_id, {"type": "server.channels_changed", "data": {"server_id": server_id}})


def effective_status(user: User) -> str:
    """按 WebSocket 实时连接计算用户的有效在线状态。

    数据库里的 status 只在登录/登出时写入：直接关掉浏览器的用户会永远显示"在线"。
    前端登录后始终保持一条 /ws/dm 连接，因此用它作为真实在线信号：
    - 无任何连接 → 离线（不管库里存的是什么）
    - 有连接 → 尊重用户自选的 idle/dnd，否则视为在线
    机器人不走这里（成员列表按 bot 进程运行状态单独展示）。
    """
    if user.is_bot:
        return user.status or "offline"
    if not manager.user_connections.get(user.id):
        return "offline"
    return user.status if user.status in ("idle", "dnd") else "online"


def user_from_token(token: str) -> User | None:
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError:
        return None
    if payload.get("token_type") == "refresh":
        return None
    user_id = payload.get("sub")
    if user_id is None:
        return None
    with SessionLocal() as db:
        return db.get(User, int(user_id))


def can_access_channel(user_id: int, channel_id: int) -> bool:
    with SessionLocal() as db:
        channel = db.get(Channel, channel_id)
        if channel is None:
            return False
        member = db.scalar(
            select(ServerMember).where(
                ServerMember.server_id == channel.server_id,
                ServerMember.user_id == user_id,
            )
        )
        return member is not None


async def authenticate(websocket: WebSocket, send_ok: bool = True) -> User | None:
    try:
        payload = await websocket.receive_json()
    except Exception:
        await websocket.send_json({"type": "error", "detail": "unauthorized"})
        await websocket.close(code=1008)
        return None

    if payload.get("type") != "auth":
        await websocket.send_json({"type": "error", "detail": "unauthorized"})
        await websocket.close(code=1008)
        return None

    user = user_from_token(payload.get("token", ""))
    if user is None:
        await websocket.send_json({"type": "error", "detail": "unauthorized"})
        await websocket.close(code=1008)
        return None

    if send_ok:
        await websocket.send_json({"type": "auth.ok", "data": {"user_id": user.id}})
    return user


@router.websocket("/ws/channel/{channel_id}")
async def channel_socket(websocket: WebSocket, channel_id: int):
    await websocket.accept()
    user = await authenticate(websocket, send_ok=False)
    if user is None:
        return
    if not can_access_channel(user.id, channel_id):
        log.warning("channel websocket forbidden: channel=%s user=%s username=%s", channel_id, user.id, user.username)
        await websocket.send_json({"type": "error", "detail": "forbidden"})
        await websocket.close(code=1008)
        return

    await websocket.send_json({"type": "auth.ok", "data": {"user_id": user.id}})
    log.info("channel websocket connected: channel=%s user=%s username=%s", channel_id, user.id, user.username)
    await manager.connect_channel(channel_id, websocket, user)
    try:
        while True:
            payload = await websocket.receive_json()
            if payload.get("type") != "typing":
                continue
            event_type = "typing.start" if payload.get("typing") else "typing.stop"
            await manager.broadcast_to_channel(
                channel_id,
                {
                    "type": event_type,
                    "data": {"user_id": user.id, "display_name": user.display_name},
                },
            )
    except WebSocketDisconnect:
        log.info("channel websocket disconnected: channel=%s user=%s username=%s", channel_id, user.id, user.username)
        await manager.disconnect_channel(channel_id, websocket)


@router.websocket("/ws/dm")
async def dm_socket(websocket: WebSocket):
    await websocket.accept()
    user = await authenticate(websocket)
    if user is None:
        return
    await manager.connect_dm(websocket, user)
    try:
        while True:
            await websocket.receive_json()
    except WebSocketDisconnect:
        await manager.disconnect_dm(websocket)
