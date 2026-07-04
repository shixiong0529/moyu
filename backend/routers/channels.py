from collections import Counter
from datetime import datetime
import json

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.encoders import jsonable_encoder
from sqlalchemy import delete, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from auth import get_current_user
from database import get_db
from link_preview import fetch_link_preview, find_first_url
from models import Channel, ChannelAnonIdentity, ChannelGroup, Message, PinnedMessage, Reaction, ServerMember, User
from schemas import ChannelUpdateRequest, MessageCreateRequest, MessageUpdateRequest, ReactionRequest
from routers.websocket import manager, notify_channels_changed
from telegram_service import notify as tg_notify

router = APIRouter(tags=["channels"])


def get_or_assign_anon_number(db: Session, channel_id: int, user_id: int) -> int:
    """同一用户在同一频道匿名发言时保持同一个编号；不同频道之间不复用，避免互相关联。"""
    identity = db.scalar(
        select(ChannelAnonIdentity).where(
            ChannelAnonIdentity.channel_id == channel_id,
            ChannelAnonIdentity.user_id == user_id,
        )
    )
    if identity is not None:
        return identity.anon_number

    next_number = (
        db.scalar(
            select(func.coalesce(func.max(ChannelAnonIdentity.anon_number), 0)).where(
                ChannelAnonIdentity.channel_id == channel_id
            )
        )
        or 0
    ) + 1
    identity = ChannelAnonIdentity(channel_id=channel_id, user_id=user_id, anon_number=next_number)
    db.add(identity)
    try:
        db.flush()
    except IntegrityError:
        # 并发下两个请求同时给同一用户分配编号，撞了唯一约束：直接查回已经存在的那条
        db.rollback()
        identity = db.scalar(
            select(ChannelAnonIdentity).where(
                ChannelAnonIdentity.channel_id == channel_id,
                ChannelAnonIdentity.user_id == user_id,
            )
        )
    return identity.anon_number


def require_channel_member(db: Session, channel_id: int, user_id: int) -> Channel:
    channel = db.get(Channel, channel_id)
    if channel is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="channel not found")
    member = db.scalar(
        select(ServerMember).where(
            ServerMember.server_id == channel.server_id,
            ServerMember.user_id == user_id,
        )
    )
    if member is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="not a server member")
    return channel


def require_server_member(db: Session, server_id: int, user_id: int) -> None:
    member = db.scalar(
        select(ServerMember).where(
            ServerMember.server_id == server_id,
            ServerMember.user_id == user_id,
        )
    )
    if member is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="not a server member")


def get_server_member(db: Session, server_id: int, user_id: int) -> ServerMember | None:
    return db.scalar(
        select(ServerMember).where(
            ServerMember.server_id == server_id,
            ServerMember.user_id == user_id,
        )
    )


def require_mod(db: Session, server_id: int, user_id: int) -> ServerMember:
    member = get_server_member(db, server_id, user_id)
    if member is None or member.role not in {"founder", "mod"}:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="insufficient permissions")
    return member


def channel_to_dict(channel: Channel) -> dict:
    return {
        "id": channel.id,
        "server_id": channel.server_id,
        "group_id": channel.group_id,
        "name": channel.name,
        "kind": channel.kind,
        "topic": channel.topic,
        "position": channel.position,
        "allow_anonymous": channel.allow_anonymous,
    }


def anon_author_dict(anon_number: int) -> dict:
    """匿名身份的假 author：编号决定头像色，保证同一身份视觉上始终一致。"""
    return {
        "id": None,
        "username": None,
        "display_name": f"🎭 树洞居民 #{anon_number}",
        "avatar_color": f"av-{(anon_number - 1) % 8 + 1}",
        "avatar_url": None,
        "status": "offline",
        "bio": None,
        "is_bot": False,
        "created_at": None,
    }


def message_to_dict(
    message: Message,
    current_user_id: int,
    privileged: bool = False,
    anon_number: int | None = None,
) -> dict:
    counts = Counter(reaction.emoji for reaction in message.reactions)
    mine = {(reaction.emoji, reaction.user_id) for reaction in message.reactions}
    if message.is_anonymous and not privileged:
        author = anon_author_dict(anon_number or 0)
    else:
        author = {
            "id": message.author.id,
            "username": message.author.username,
            "display_name": message.author.display_name,
            "avatar_color": message.author.avatar_color,
            "avatar_url": message.author.avatar_url,
            "status": message.author.status,
            "bio": message.author.bio,
            "is_bot": message.author.is_bot,
            "created_at": message.author.created_at,
        }
    return {
        "id": message.id,
        "channel_id": message.channel_id,
        "content": "此消息已被删除" if message.is_deleted else message.content,
        "reply_to_id": message.reply_to_id,
        "is_edited": message.is_edited,
        "edited_at": message.edited_at,
        "created_at": message.created_at,
        "is_deleted": message.is_deleted,
        "is_anonymous": message.is_anonymous,
        "embed": json.loads(message.embed_json) if message.embed_json else None,
        "author": author,
        "reactions": [
            {"emoji": emoji, "count": count, "mine": (emoji, current_user_id) in mine}
            for emoji, count in counts.items()
        ],
    }


def reaction_summary(message: Message, current_user_id: int) -> list[dict]:
    counts = Counter(reaction.emoji for reaction in message.reactions)
    mine = {(reaction.emoji, reaction.user_id) for reaction in message.reactions}
    users_by_emoji: dict[str, list[int]] = {}
    for reaction in message.reactions:
        users_by_emoji.setdefault(reaction.emoji, []).append(reaction.user_id)
    return [
        {
            "emoji": emoji,
            "count": count,
            # mine 只对"请求发起者"正确；广播场景下客户端应使用 user_ids 自行判断
            "mine": (emoji, current_user_id) in mine,
            "user_ids": users_by_emoji.get(emoji, []),
        }
        for emoji, count in counts.items()
    ]


async def notify_mentions(content: str, channel: Channel, sender: User, db: Session) -> None:
    """
    Check the message content for @display_name mentions and push Telegram notifications
    to matched server members. Uses exact full-name contains-check to support names with spaces.
    """
    if "@" not in content:
        return
    members = db.scalars(
        select(ServerMember)
        .where(ServerMember.server_id == channel.server_id)
        .options(selectinload(ServerMember.user))
    ).all()
    preview = content[:80] + ("…" if len(content) > 80 else "")
    notified: set[int] = set()
    for member in members:
        user = member.user
        if user.id == sender.id or user.id in notified:
            continue
        if f"@{user.display_name}" in content:
            notified.add(user.id)
            await tg_notify(
                user.id,
                f"📢 <b>{sender.display_name}</b> 在 <b>#{channel.name}</b> 提到了你：\n{preview}",
            )


def pinned_to_dict(pin: PinnedMessage, current_user_id: int) -> dict:
    return {
        "id": pin.id,
        "channel_id": pin.channel_id,
        "message_id": pin.message_id,
        "pinned_by": pin.pinned_by,
        "pinned_at": pin.pinned_at,
        "message": message_to_dict(pin.message, current_user_id),
    }


@router.get("/api/servers/{server_id}/channels")
def list_channels(server_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    require_server_member(db, server_id, current_user.id)
    groups = db.scalars(
        select(ChannelGroup)
        .where(ChannelGroup.server_id == server_id)
        .options(selectinload(ChannelGroup.channels))
        .order_by(ChannelGroup.position)
    ).all()
    return [
        {
            "id": group.id,
            "group": group.name,
            "items": [
                channel_to_dict(channel)
                for channel in sorted(group.channels, key=lambda item: item.position)
            ],
        }
        for group in groups
    ]


@router.get("/api/channels/{channel_id}/messages")
def list_messages(
    channel_id: int,
    limit: int = 50,
    before: int | None = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    channel = require_channel_member(db, channel_id, current_user.id)
    limit = max(1, min(limit, 100))
    query = (
        select(Message)
        .where(Message.channel_id == channel_id, Message.is_deleted == False)
        .options(selectinload(Message.author), selectinload(Message.reactions))
        .order_by(Message.id.desc())
        .limit(limit + 1)
    )
    if before is not None:
        query = query.where(Message.id < before)
    rows = db.scalars(query).all()
    has_more = len(rows) > limit
    messages = list(reversed(rows[:limit]))

    member = get_server_member(db, channel.server_id, current_user.id)
    privileged = bool(member and member.role in {"founder", "mod"})
    anon_author_ids = {message.author_id for message in messages if message.is_anonymous}
    anon_numbers: dict[int, int] = {}
    if anon_author_ids and not privileged:
        identities = db.scalars(
            select(ChannelAnonIdentity).where(
                ChannelAnonIdentity.channel_id == channel_id,
                ChannelAnonIdentity.user_id.in_(anon_author_ids),
            )
        ).all()
        anon_numbers = {identity.user_id: identity.anon_number for identity in identities}

    return {
        "messages": [
            message_to_dict(message, current_user.id, privileged, anon_numbers.get(message.author_id))
            for message in messages
        ],
        "has_more": has_more,
    }


@router.patch("/api/channels/{channel_id}")
async def update_channel(
    channel_id: int,
    payload: ChannelUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    channel = require_channel_member(db, channel_id, current_user.id)
    require_mod(db, channel.server_id, current_user.id)
    updates = payload.model_dump(exclude_unset=True)
    for field, value in updates.items():
        if isinstance(value, str):
            value = value.strip()
        setattr(channel, field, value or None if field == "topic" else value)
    db.add(channel)
    db.commit()
    db.refresh(channel)
    await notify_channels_changed(db, channel.server_id)
    return channel_to_dict(channel)


@router.delete("/api/channels/{channel_id}")
async def delete_channel(
    channel_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    channel = require_channel_member(db, channel_id, current_user.id)
    require_mod(db, channel.server_id, current_user.id)
    server_id = channel.server_id
    message_ids = db.scalars(select(Message.id).where(Message.channel_id == channel_id)).all()
    if message_ids:
        db.execute(delete(Reaction).where(Reaction.message_id.in_(message_ids)))
        db.execute(delete(PinnedMessage).where(PinnedMessage.message_id.in_(message_ids)))
        db.execute(delete(Message).where(Message.id.in_(message_ids)))
    db.execute(delete(PinnedMessage).where(PinnedMessage.channel_id == channel_id))
    db.delete(channel)
    db.commit()
    await notify_channels_changed(db, server_id)
    return {"ok": True, "server_id": server_id, "channel_id": channel_id}


@router.post("/api/channels/{channel_id}/messages", status_code=status.HTTP_201_CREATED)
async def create_message(
    channel_id: int,
    payload: MessageCreateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    channel = require_channel_member(db, channel_id, current_user.id)
    actor_member = get_server_member(db, channel.server_id, current_user.id)
    if channel.kind == "announce":
        if actor_member is None or actor_member.role not in {"founder", "mod"}:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="只有管理员可以在公告频道发布消息")
    if payload.reply_to_id is not None:
        parent = db.get(Message, payload.reply_to_id)
        if parent is None or parent.channel_id != channel_id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="invalid reply target")
    if payload.is_anonymous and not channel.allow_anonymous:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="该频道未开启匿名发言")

    embed_json = None
    url = find_first_url(payload.content)
    if url:
        try:
            preview = await fetch_link_preview(url)
        except Exception:
            preview = None
        if preview:
            embed_json = json.dumps(preview, ensure_ascii=False)

    anon_number = None
    if payload.is_anonymous:
        anon_number = get_or_assign_anon_number(db, channel_id, current_user.id)

    message = Message(
        channel_id=channel_id,
        author_id=current_user.id,
        content=payload.content,
        reply_to_id=payload.reply_to_id,
        is_anonymous=payload.is_anonymous,
        embed_json=embed_json,
    )
    db.add(message)
    db.commit()
    message = db.scalar(
        select(Message)
        .where(Message.id == message.id)
        .options(selectinload(Message.author), selectinload(Message.reactions))
    )

    actor_privileged = bool(actor_member and actor_member.role in {"founder", "mod"})
    data = message_to_dict(message, current_user.id, actor_privileged, anon_number)

    if payload.is_anonymous:
        privileged_ids = set(
            db.scalars(
                select(ServerMember.user_id).where(
                    ServerMember.server_id == channel.server_id,
                    ServerMember.role.in_(["founder", "mod"]),
                )
            ).all()
        )
        full_data = message_to_dict(message, current_user.id, True, anon_number)
        masked_data = message_to_dict(message, current_user.id, False, anon_number)
        await manager.broadcast_to_channel_masked(
            channel_id,
            {"type": "message.new", "data": jsonable_encoder(full_data)},
            {"type": "message.new", "data": jsonable_encoder(masked_data)},
            privileged_ids,
        )
    else:
        await manager.broadcast_to_channel(channel_id, {"type": "message.new", "data": jsonable_encoder(data)})
    if not payload.is_anonymous:
        # 匿名消息不做 @提及 通知：Telegram 推送文案会带上发送者身份，等于变相解除匿名
        await notify_mentions(payload.content, channel, current_user, db)
    return data


@router.patch("/api/messages/{message_id}")
async def update_message(
    message_id: int,
    payload: MessageUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    message = db.scalar(
        select(Message)
        .where(Message.id == message_id)
        .options(selectinload(Message.author), selectinload(Message.reactions))
    )
    if message is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="message not found")
    if message.author_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="only author can edit")

    message.content = payload.content
    message.is_edited = True
    message.edited_at = datetime.utcnow()
    db.add(message)
    db.commit()
    db.refresh(message)
    data = message_to_dict(message, current_user.id)
    await manager.broadcast_to_channel(
        message.channel_id,
        {"type": "message.edit", "data": jsonable_encoder({"id": message.id, "content": message.content, "edited_at": message.edited_at})},
    )
    return data


@router.delete("/api/messages/{message_id}")
async def delete_message(
    message_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    message = db.scalar(select(Message).where(Message.id == message_id).options(selectinload(Message.channel)))
    if message is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="message not found")
    member = get_server_member(db, message.channel.server_id, current_user.id)
    can_delete = (
        message.author_id == current_user.id
        or current_user.is_admin
        or (member is not None and member.role in {"founder", "mod"})
    )
    if not can_delete:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="insufficient permissions")

    message.is_deleted = True
    db.add(message)
    db.commit()
    await manager.broadcast_to_channel(message.channel_id, {"type": "message.delete", "data": {"id": message.id}})
    return {"ok": True}


@router.post("/api/messages/{message_id}/reactions")
async def toggle_reaction(
    message_id: int,
    payload: ReactionRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    message = db.scalar(
        select(Message)
        .where(Message.id == message_id)
        .options(selectinload(Message.channel), selectinload(Message.reactions))
    )
    if message is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="message not found")
    require_server_member(db, message.channel.server_id, current_user.id)

    existing = db.scalar(
        select(Reaction).where(
            Reaction.message_id == message.id,
            Reaction.user_id == current_user.id,
            Reaction.emoji == payload.emoji,
        )
    )
    if existing:
        db.delete(existing)
    else:
        db.add(Reaction(message_id=message.id, user_id=current_user.id, emoji=payload.emoji))
    try:
        db.commit()
    except IntegrityError:
        # 并发重复添加同一表情：唯一约束兜底，最终态就是该表情存在
        db.rollback()
    message = db.scalar(select(Message).where(Message.id == message_id).options(selectinload(Message.reactions)))
    data = {"message_id": message.id, "reactions": reaction_summary(message, current_user.id)}
    await manager.broadcast_to_channel(message.channel_id, {"type": "reaction.update", "data": jsonable_encoder(data)})
    return {"reactions": data["reactions"]}


@router.get("/api/channels/{channel_id}/pins")
def list_pins(
    channel_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    require_channel_member(db, channel_id, current_user.id)
    pins = db.scalars(
        select(PinnedMessage)
        .where(PinnedMessage.channel_id == channel_id)
        .options(selectinload(PinnedMessage.message).selectinload(Message.author), selectinload(PinnedMessage.message).selectinload(Message.reactions))
        .order_by(PinnedMessage.pinned_at.desc())
    ).all()
    return [pinned_to_dict(pin, current_user.id) for pin in pins]


@router.post("/api/channels/{channel_id}/pins/{message_id}")
async def pin_message(
    channel_id: int,
    message_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    channel = require_channel_member(db, channel_id, current_user.id)
    require_mod(db, channel.server_id, current_user.id)
    message = db.get(Message, message_id)
    if message is None or message.channel_id != channel_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="message not found")

    pin = db.scalar(select(PinnedMessage).where(PinnedMessage.channel_id == channel_id, PinnedMessage.message_id == message_id))
    if pin is None:
        pin = PinnedMessage(channel_id=channel_id, message_id=message_id, pinned_by=current_user.id)
        db.add(pin)
        db.commit()
        db.refresh(pin)
    pin = db.scalar(
        select(PinnedMessage)
        .where(PinnedMessage.id == pin.id)
        .options(selectinload(PinnedMessage.message).selectinload(Message.author), selectinload(PinnedMessage.message).selectinload(Message.reactions))
    )
    data = pinned_to_dict(pin, current_user.id)
    await manager.broadcast_to_channel(channel_id, {"type": "pin.update", "data": jsonable_encoder({"channel_id": channel_id})})
    return data


@router.delete("/api/channels/{channel_id}/pins/{message_id}")
async def unpin_message(
    channel_id: int,
    message_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    channel = require_channel_member(db, channel_id, current_user.id)
    require_mod(db, channel.server_id, current_user.id)
    db.execute(delete(PinnedMessage).where(PinnedMessage.channel_id == channel_id, PinnedMessage.message_id == message_id))
    db.commit()
    await manager.broadcast_to_channel(channel_id, {"type": "pin.update", "data": jsonable_encoder({"channel_id": channel_id})})
    return {"ok": True}
