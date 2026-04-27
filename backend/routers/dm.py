from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.encoders import jsonable_encoder
from sqlalchemy import or_, select, update
from sqlalchemy.orm import Session, selectinload

from auth import get_current_user
from database import get_db
from models import DirectMessage, User
from schemas import DMCreateRequest
from routers.websocket import manager
from telegram_service import notify as tg_notify

router = APIRouter(prefix="/api/dm", tags=["dm"])


def user_to_dict(user: User) -> dict:
    return {
        "id": user.id,
        "username": user.username,
        "display_name": user.display_name,
        "avatar_color": user.avatar_color,
        "avatar_url": user.avatar_url,
        "status": user.status,
        "bio": user.bio,
        "created_at": user.created_at,
    }


def dm_to_dict(message: DirectMessage) -> dict:
    return {
        "id": message.id,
        "sender_id": message.sender_id,
        "receiver_id": message.receiver_id,
        "content": "此消息已被删除" if message.is_deleted else message.content,
        "created_at": message.created_at,
        "is_read": message.is_read,
        "is_deleted": message.is_deleted,
        "sender": user_to_dict(message.sender),
        "receiver": user_to_dict(message.receiver),
    }


@router.get("/conversations")
def list_conversations(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    messages = db.scalars(
        select(DirectMessage)
        .where(or_(DirectMessage.sender_id == current_user.id, DirectMessage.receiver_id == current_user.id))
        .options(selectinload(DirectMessage.sender), selectinload(DirectMessage.receiver))
        .order_by(DirectMessage.created_at.desc(), DirectMessage.id.desc())
    ).all()
    conversations: dict[int, DirectMessage] = {}
    unread_counts: dict[int, int] = {}
    for message in messages:
        other_id = message.receiver_id if message.sender_id == current_user.id else message.sender_id
        conversations.setdefault(other_id, message)
        if message.receiver_id == current_user.id and not message.is_read:
            unread_counts[other_id] = unread_counts.get(other_id, 0) + 1

    return [
        {
            "user": user_to_dict(message.receiver if message.sender_id == current_user.id else message.sender),
            "last_message": dm_to_dict(message),
            "unread_count": unread_counts.get(other_id, 0),
        }
        for other_id, message in conversations.items()
    ]


@router.get("/{user_id}/messages")
def list_dm_messages(
    user_id: int,
    limit: int = 50,
    before: int | None = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    other = db.get(User, user_id)
    if other is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="user not found")

    db.execute(
        update(DirectMessage)
        .where(DirectMessage.sender_id == user_id, DirectMessage.receiver_id == current_user.id, DirectMessage.is_read.is_(False))
        .values(is_read=True)
    )
    db.commit()

    limit = max(1, min(limit, 100))
    query = (
        select(DirectMessage)
        .where(
            or_(
                (DirectMessage.sender_id == current_user.id) & (DirectMessage.receiver_id == user_id),
                (DirectMessage.sender_id == user_id) & (DirectMessage.receiver_id == current_user.id),
            )
        )
        .options(selectinload(DirectMessage.sender), selectinload(DirectMessage.receiver))
        .order_by(DirectMessage.id.desc())
        .limit(limit + 1)
    )
    if before is not None:
        query = query.where(DirectMessage.id < before)
    rows = db.scalars(query).all()
    has_more = len(rows) > limit
    messages = list(reversed(rows[:limit]))
    return {"messages": [dm_to_dict(message) for message in messages], "has_more": has_more}


@router.post("/{user_id}/messages", status_code=status.HTTP_201_CREATED)
async def create_dm_message(
    user_id: int,
    payload: DMCreateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if db.get(User, user_id) is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="user not found")
    message = DirectMessage(sender_id=current_user.id, receiver_id=user_id, content=payload.content)
    db.add(message)
    db.commit()
    message = db.scalar(
        select(DirectMessage)
        .where(DirectMessage.id == message.id)
        .options(selectinload(DirectMessage.sender), selectinload(DirectMessage.receiver))
    )
    data = dm_to_dict(message)
    encoded = jsonable_encoder(data)
    await manager.send_to_user(user_id, {"type": "dm.new", "data": encoded})
    await manager.send_to_user(current_user.id, {"type": "dm.new", "data": encoded})
    preview = payload.content[:60] + ("…" if len(payload.content) > 60 else "")
    await tg_notify(user_id, f"💬 <b>{current_user.display_name}</b>：{preview}")
    return data
