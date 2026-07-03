from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from auth import create_access_token, decode_token, get_current_user, hash_password, make_token_pair, verify_password
from database import get_db
from models import Channel, ChannelGroup, Server, ServerMember, User
from schemas import AccessTokenResponse, LoginRequest, OkResponse, RefreshRequest, RegisterRequest, TokenResponse

router = APIRouter(prefix="/api/auth", tags=["auth"])


def get_or_create_admin_server(db: Session) -> Server:
    server = db.scalar(select(Server).where(Server.name == "管理员服务器"))
    if server is not None:
        return server

    owner = db.scalar(select(User).where(User.username == "demo2"))
    if owner is None:
        owner = db.scalar(select(User).order_by(User.id))
    if owner is None:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="admin server owner missing")

    server = Server(
        name="管理员服务器",
        short_name="管",
        color="av-6",
        description="系统默认服务器，用于公告、审核和管理通知。",
        owner_id=owner.id,
    )
    db.add(server)
    db.flush()

    group = ChannelGroup(server_id=server.id, name="管理 · 默认", position=0)
    db.add(group)
    db.flush()
    db.add(Channel(server_id=server.id, group_id=group.id, name="系统公告", kind="announce", position=0))
    db.add(Channel(server_id=server.id, group_id=group.id, name="帮助与反馈", kind="text", position=1))
    db.add(ServerMember(server_id=server.id, user_id=owner.id, role="founder"))
    db.flush()
    return server


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
def register(payload: RegisterRequest, db: Session = Depends(get_db)):
    existing = db.scalar(select(User).where(User.username == payload.username))
    if existing is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="该用户名已被使用，换一个试试")

    user = User(
        username=payload.username,
        display_name=payload.display_name,
        password_hash=hash_password(payload.password),
    )
    db.add(user)
    try:
        db.flush()
    except IntegrityError:
        # 并发同名注册：唯一约束兜底
        db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="该用户名已被使用，换一个试试")

    # 自动加入所有 auto_join=True 的服务器（含管理员服务器）
    auto_join_servers = db.scalars(
        select(Server).where(Server.auto_join == True).order_by(Server.join_order)
    ).all()
    admin_server = get_or_create_admin_server(db)
    # 确保管理员服务器也在列表中
    auto_join_ids = {s.id for s in auto_join_servers}
    all_servers = list(auto_join_servers)
    if admin_server.id not in auto_join_ids:
        all_servers.insert(0, admin_server)

    for server in all_servers:
        existing = db.scalar(
            select(ServerMember).where(
                ServerMember.server_id == server.id,
                ServerMember.user_id == user.id,
            )
        )
        if existing is None:
            db.add(ServerMember(
                server_id=server.id,
                user_id=user.id,
                role="member",
                position=server.join_order,
            ))

    db.commit()
    db.refresh(user)
    return make_token_pair(user)


@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(User.username == payload.username))
    if user is None or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="用户名或密码错误")
    if user.is_banned:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=user.banned_reason or "account banned")

    user.status = "online"
    db.commit()
    return make_token_pair(user)


@router.post("/refresh", response_model=TokenResponse)
def refresh(payload: RefreshRequest, db: Session = Depends(get_db)):
    token_payload = decode_token(payload.refresh_token)
    if token_payload.get("token_type") != "refresh":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid refresh token")

    user_id = token_payload.get("sub")
    user = db.get(User, int(user_id)) if user_id else None
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid refresh token")
    if user.is_banned:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=user.banned_reason or "account banned")

    return make_token_pair(user)


@router.post("/logout", response_model=OkResponse)
def logout(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    current_user.status = "offline"
    db.commit()
    return {"ok": True}
