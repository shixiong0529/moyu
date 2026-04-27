from collections import Counter
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.encoders import jsonable_encoder
from sqlalchemy import delete, select
from sqlalchemy.orm import Session, selectinload

from auth import get_current_user
from database import get_db
from models import Channel, ChannelGroup, Message, PinnedMessage, Reaction, ServerMember, User
from schemas import ChannelUpdateRequest, MessageCreateRequest, MessageUpdateRequest, ReactionRequest
from routers.websocket import manager
from telegram_service import notify as tg_notify

router = APIRouter(tags=["channels"])


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
    }


def message_to_dict(message: Message, current_user_id: int) -> dict:
    counts = Counter(reaction.emoji for reaction in message.reactions)
    mine = {(reaction.emoji, reaction.user_id) for reaction in message.reactions}
    return {
        "id": message.id,
        "channel_id": message.channel_id,
        "content": "此消息已被删除" if message.is_deleted else message.content,
        "reply_to_id": message.reply_to_id,
        "is_edited": message.is_edited,
        "edited_at": message.edited_at,
        "created_at": message.created_at,
        "is_deleted": message.is_deleted,
        "author": {
            "id": message.author.id,
            "username": message.author.username,
            "display_name": message.author.display_name,
            "avatar_color": message.author.avatar_color,
            "avatar_url": message.author.avatar_url,
            "status": message.author.status,
            "bio": message.author.bio,
            "created_at": message.author.created_at,
        },
        "reactions": [
            {"emoji": emoji, "count": count, "mine": (emoji, current_user_id) in mine}
            for emoji, count in counts.items()
        ],
    }


def reaction_summary(message: Message, current_user_id: int) -> list[dict]:
    counts = Counter(reaction.emoji for reaction in message.reactions)
    mine = {(reaction.emoji, reaction.user_id) for reaction in message.reactions}
    return [
        {"emoji": emoji, "count": count, "mine": (emoji, current_user_id) in mine}
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
                {
                    "id": channel.id,
                    "server_id": channel.server_id,
                    "group_id": channel.group_id,
                    "name": channel.name,
                    "kind": channel.kind,
                    "topic": channel.topic,
                    "position": channel.position,
                }
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
    require_channel_member(db, channel_id, current_user.id)
    limit = max(1, min(limit, 100))
    query = (
        select(Message)
        .where(Message.channel_id == channel_id)
        .options(selectinload(Message.author), selectinload(Message.reactions))
        .order_by(Message.id.desc())
        .limit(limit + 1)
    )
    if before is not None:
        query = query.where(Message.id < before)
    rows = db.scalars(query).all()
    has_more = len(rows) > limit
    messages = list(reversed(rows[:limit]))
    return {"messages": [message_to_dict(message, current_user.id) for message in messages], "has_more": has_more}


@router.patch("/api/channels/{channel_id}")
def update_channel(
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
    return channel_to_dict(channel)


@router.delete("/api/channels/{channel_id}")
def delete_channel(
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
    return {"ok": True, "server_id": server_id, "channel_id": channel_id}


@router.post("/api/channels/{channel_id}/messages", status_code=status.HTTP_201_CREATED)
async def create_message(
    channel_id: int,
    payload: MessageCreateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    channel = require_channel_member(db, channel_id, current_user.id)
    message = Message(
        channel_id=channel_id,
        author_id=current_user.id,
        content=payload.content,
        reply_to_id=payload.reply_to_id,
    )
    db.add(message)
    db.commit()
    message = db.scalar(
        select(Message)
        .where(Message.id == message.id)
        .options(selectinload(Message.author), selectinload(Message.reactions))
    )
    data = message_to_dict(message, current_user.id)
    await manager.broadcast_to_channel(channel_id, {"type": "message.new", "data": jsonable_encoder(data)})
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
    if message.author_id != current_user.id and (member is None or member.role not in {"founder", "mod"}):
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
    db.commit()
    db.refresh(message)
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
