from __future__ import annotations

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from jose import JWTError, jwt
from sqlalchemy import select

from auth import ALGORITHM, SECRET_KEY
from database import SessionLocal
from models import Channel, ServerMember, User

router = APIRouter(tags=["websocket"])


class ConnectionManager:
    def __init__(self) -> None:
        self.channel_connections: dict[int, set[WebSocket]] = {}
        self.channel_users: dict[WebSocket, User] = {}
        self.user_connections: dict[int, WebSocket] = {}
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
        self.user_connections[user.id] = websocket
        self.dm_users[websocket] = user

    async def disconnect_dm(self, websocket: WebSocket) -> None:
        user = self.dm_users.pop(websocket, None)
        if user and self.user_connections.get(user.id) is websocket:
            self.user_connections.pop(user.id, None)

    async def broadcast_to_channel(self, channel_id: int, message: dict) -> None:
        dead: list[WebSocket] = []
        for websocket in list(self.channel_connections.get(channel_id, set())):
            try:
                await websocket.send_json(message)
            except RuntimeError:
                dead.append(websocket)
        for websocket in dead:
            await self.disconnect_channel(channel_id, websocket)

    async def send_to_user(self, user_id: int, message: dict) -> None:
        websocket = self.user_connections.get(user_id)
        if websocket is None:
            return
        try:
            await websocket.send_json(message)
        except RuntimeError:
            await self.disconnect_dm(websocket)


manager = ConnectionManager()


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


async def authenticate(websocket: WebSocket) -> User | None:
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

    await websocket.send_json({"type": "auth.ok", "data": {"user_id": user.id}})
    return user


@router.websocket("/ws/channel/{channel_id}")
async def channel_socket(websocket: WebSocket, channel_id: int):
    await websocket.accept()
    user = await authenticate(websocket)
    if user is None:
        return
    if not can_access_channel(user.id, channel_id):
        await websocket.send_json({"type": "error", "detail": "forbidden"})
        await websocket.close(code=1008)
        return

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
