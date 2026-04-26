from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.encoders import jsonable_encoder
from pydantic import BaseModel, Field
from sqlalchemy import and_, delete, or_, select
from sqlalchemy.orm import Session, selectinload

from auth import get_current_user
from database import get_db
from models import FriendRequest, Friendship, User
from routers.websocket import manager
from telegram_service import notify as tg_notify

router = APIRouter(prefix="/api/friends", tags=["friends"])


class FriendRequestCreate(BaseModel):
    username: str = Field(min_length=1, max_length=32)


def user_to_dict(user: User) -> dict:
    return {
        "id": user.id,
        "username": user.username,
        "display_name": user.display_name,
        "avatar_color": user.avatar_color,
        "status": user.status,
        "bio": user.bio,
        "created_at": user.created_at,
    }


def request_to_dict(item: FriendRequest, current_user_id: int) -> dict:
    incoming = item.receiver_id == current_user_id
    other = item.requester if incoming else item.receiver
    return {
        "id": item.id,
        "status": item.status,
        "direction": "incoming" if incoming else "outgoing",
        "created_at": item.created_at,
        "decided_at": item.decided_at,
        "user": user_to_dict(other),
    }


def request_event_payload(item: FriendRequest) -> dict:
    return jsonable_encoder({
        "id": item.id,
        "status": item.status,
        "created_at": item.created_at,
        "decided_at": item.decided_at,
        "requester": user_to_dict(item.requester),
        "receiver": user_to_dict(item.receiver),
    })


def are_friends(db: Session, user_id: int, friend_id: int) -> bool:
    return db.scalar(
        select(Friendship).where(Friendship.user_id == user_id, Friendship.friend_id == friend_id)
    ) is not None


@router.get("")
def list_friends(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = db.scalars(
        select(Friendship)
        .where(Friendship.user_id == current_user.id)
        .options(selectinload(Friendship.friend))
        .order_by(Friendship.created_at)
    ).all()
    return [user_to_dict(item.friend) for item in rows]


@router.delete("/{friend_id}")
async def delete_friend(
    friend_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if db.get(User, friend_id) is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="用户不存在")
    removed = db.execute(
        delete(Friendship).where(
            or_(
                and_(Friendship.user_id == current_user.id, Friendship.friend_id == friend_id),
                and_(Friendship.user_id == friend_id, Friendship.friend_id == current_user.id),
            )
        )
    ).rowcount
    if not removed:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="你们还不是好友")
    db.commit()
    await manager.send_to_user(current_user.id, {"type": "friend.deleted", "data": {"friend_id": friend_id}})
    await manager.send_to_user(friend_id, {"type": "friend.deleted", "data": {"friend_id": current_user.id}})
    return {"ok": True}


@router.get("/requests")
def list_friend_requests(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = db.scalars(
        select(FriendRequest)
        .where(
            or_(
                FriendRequest.requester_id == current_user.id,
                FriendRequest.receiver_id == current_user.id,
            )
        )
        .options(selectinload(FriendRequest.requester), selectinload(FriendRequest.receiver))
        .order_by(FriendRequest.created_at.desc())
    ).all()
    return [request_to_dict(item, current_user.id) for item in rows]


@router.post("/requests", status_code=status.HTTP_201_CREATED)
async def create_friend_request(
    payload: FriendRequestCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    username = payload.username.strip()
    target = db.scalar(select(User).where(User.username == username))
    if target is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="用户不存在")
    if target.id == current_user.id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="不能添加自己为好友")
    if are_friends(db, current_user.id, target.id):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="你们已经是好友")

    existing = db.scalar(
        select(FriendRequest)
        .where(
            or_(
                and_(FriendRequest.requester_id == current_user.id, FriendRequest.receiver_id == target.id),
                and_(FriendRequest.requester_id == target.id, FriendRequest.receiver_id == current_user.id),
            ),
            FriendRequest.status == "pending",
        )
        .options(selectinload(FriendRequest.requester), selectinload(FriendRequest.receiver))
    )
    if existing is not None:
        return request_to_dict(existing, current_user.id)

    item = FriendRequest(requester_id=current_user.id, receiver_id=target.id)
    db.add(item)
    db.commit()
    item = db.scalar(
        select(FriendRequest)
        .where(FriendRequest.id == item.id)
        .options(selectinload(FriendRequest.requester), selectinload(FriendRequest.receiver))
    )
    payload = request_event_payload(item)
    await manager.send_to_user(target.id, {"type": "friend.request", "data": payload})
    await manager.send_to_user(current_user.id, {"type": "friend.request", "data": payload})
    await tg_notify(target.id, f"👤 <b>{current_user.display_name}</b> 向你发送了好友申请")
    return request_to_dict(item, current_user.id)


@router.post("/requests/{request_id}/approve")
async def approve_friend_request(
    request_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    item = db.scalar(
        select(FriendRequest)
        .where(FriendRequest.id == request_id)
        .options(selectinload(FriendRequest.requester), selectinload(FriendRequest.receiver))
    )
    if item is None or item.receiver_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="好友申请不存在")
    if item.status == "pending":
        item.status = "approved"
        item.decided_at = datetime.utcnow()
        if not are_friends(db, item.requester_id, item.receiver_id):
            db.add(Friendship(user_id=item.requester_id, friend_id=item.receiver_id))
            db.add(Friendship(user_id=item.receiver_id, friend_id=item.requester_id))
        db.commit()
        db.refresh(item)
    payload = request_event_payload(item)
    await manager.send_to_user(item.requester_id, {"type": "friend.update", "data": payload})
    await manager.send_to_user(item.receiver_id, {"type": "friend.update", "data": payload})
    await tg_notify(item.requester_id, f"✅ <b>{current_user.display_name}</b> 通过了你的好友申请")
    return request_to_dict(item, current_user.id)


@router.post("/requests/{request_id}/reject")
async def reject_friend_request(
    request_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    item = db.scalar(
        select(FriendRequest)
        .where(FriendRequest.id == request_id)
        .options(selectinload(FriendRequest.requester), selectinload(FriendRequest.receiver))
    )
    if item is None or item.receiver_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="好友申请不存在")
    if item.status == "pending":
        item.status = "rejected"
        item.decided_at = datetime.utcnow()
        db.commit()
        db.refresh(item)
    payload = request_event_payload(item)
    await manager.send_to_user(item.requester_id, {"type": "friend.update", "data": payload})
    await manager.send_to_user(item.receiver_id, {"type": "friend.update", "data": payload})
    return request_to_dict(item, current_user.id)
