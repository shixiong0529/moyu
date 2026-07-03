import json
import os
from datetime import datetime, timezone

_API_BASE = os.getenv("API_BASE", "http://localhost:8000")

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import delete as sa_delete, func, select, update as sa_update
from sqlalchemy.orm import Session

from auth import get_current_user, hash_password
from crypto_utils import decrypt_secret, encrypt_secret
from database import get_db
from models import (
    AuditLog, Bot, Channel, ChannelGroup, DirectMessage, FriendRequest,
    Friendship, Invite, JoinRequest, Message, PinnedMessage,
    Reaction, Report, Server, ServerMember, User,
)
from schemas import (
    AdminServerSchema, AdminStatsSchema, AdminUserSchema,
    AuditLogSchema, BanRequest, BotCreate, BotOut, BotUpdate,
    ChannelSchema, OkResponse, ReportSchema,
    ResolveReportRequest, SetAdminRequest,
)

router = APIRouter(prefix="/api/admin", tags=["admin"])


def require_admin(current_user: User = Depends(get_current_user)) -> User:
    if not current_user.is_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="admin required")
    return current_user


def write_audit(db: Session, admin_id: int, action: str, target_type: str, target_id: int, detail: dict | None = None):
    db.add(AuditLog(admin_id=admin_id, action=action, target_type=target_type, target_id=target_id, detail=detail))


# ── Stats ────────────────────────────────────────────────────────

@router.get("/stats", response_model=AdminStatsSchema)
def get_stats(admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    today = datetime.now(timezone.utc).date()
    today_start = datetime(today.year, today.month, today.day)
    return AdminStatsSchema(
        total_users=db.scalar(select(func.count()).select_from(User)),
        total_servers=db.scalar(select(func.count()).select_from(Server)),
        total_channels=db.scalar(select(func.count()).select_from(Channel)),
        total_messages=db.scalar(select(func.count()).select_from(Message).where(Message.is_deleted == False)),
        new_users_today=db.scalar(select(func.count()).select_from(User).where(User.created_at >= today_start)),
        pending_reports=db.scalar(select(func.count()).select_from(Report).where(Report.status == "pending")),
    )


# ── Users ────────────────────────────────────────────────────────

@router.get("/users", response_model=list[AdminUserSchema])
def list_users(
    q: str = "",
    offset: int = 0,
    limit: int = 50,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    stmt = select(User)
    if q:
        stmt = stmt.where(
            (User.username.ilike(f"%{q}%")) | (User.display_name.ilike(f"%{q}%"))
        )
    stmt = stmt.order_by(User.id).offset(offset).limit(limit)
    return db.scalars(stmt).all()


@router.get("/users/{user_id}", response_model=AdminUserSchema)
def get_user(user_id: int, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="user not found")
    return user


@router.post("/users/{user_id}/ban", response_model=OkResponse)
def ban_user(
    user_id: int,
    payload: BanRequest,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    if user_id == admin.id:
        raise HTTPException(status_code=400, detail="cannot ban yourself")
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="user not found")
    if user.is_admin:
        raise HTTPException(status_code=400, detail="revoke admin rights before banning")
    user.is_banned = True
    user.banned_reason = payload.reason
    write_audit(db, admin.id, "ban_user", "user", user_id, {"reason": payload.reason})
    db.commit()
    return OkResponse(ok=True)


@router.post("/users/{user_id}/unban", response_model=OkResponse)
def unban_user(user_id: int, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="user not found")
    user.is_banned = False
    user.banned_reason = None
    write_audit(db, admin.id, "unban_user", "user", user_id)
    db.commit()
    return OkResponse(ok=True)


@router.patch("/users/{user_id}/admin", response_model=OkResponse)
def set_admin(
    user_id: int,
    payload: SetAdminRequest,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    if user_id == admin.id:
        raise HTTPException(status_code=400, detail="cannot change your own admin status")
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="user not found")
    if not payload.is_admin:
        admin_count = db.scalar(select(func.count()).select_from(User).where(User.is_admin == True))
        if admin_count <= 1:
            raise HTTPException(status_code=400, detail="must keep at least one admin")
    action = "grant_admin" if payload.is_admin else "revoke_admin"
    user.is_admin = payload.is_admin
    write_audit(db, admin.id, action, "user", user_id)
    db.commit()
    return OkResponse(ok=True)


@router.delete("/users/{user_id}", response_model=OkResponse)
def delete_user(user_id: int, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    if user_id == admin.id:
        raise HTTPException(status_code=400, detail="cannot delete yourself")
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="user not found")
    if user.is_admin:
        raise HTTPException(status_code=400, detail="revoke admin rights before deleting")

    write_audit(db, admin.id, "delete_user", "user", user_id, {"username": user.username})
    db.flush()

    # ── 1. 处理所属服务器（全用 Core 操作）──────────────────────────
    admin_server = db.scalar(
        select(Server).where(Server.name == "管理员服务器", Server.owner_id == user_id)
    )
    if admin_server:
        other = db.scalar(select(User).where(User.is_admin == True, User.id != user_id))
        if other:
            admin_server.owner_id = other.id
            m = db.scalar(select(ServerMember).where(
                ServerMember.server_id == admin_server.id, ServerMember.user_id == other.id
            ))
            if m:
                m.role = "founder"
            else:
                db.add(ServerMember(server_id=admin_server.id, user_id=other.id, role="founder"))

    owned_ids = db.scalars(
        select(Server.id).where(Server.owner_id == user_id, Server.name != "管理员服务器")
    ).all()
    if owned_ids:
        ch_ids = db.scalars(select(Channel.id).where(Channel.server_id.in_(owned_ids))).all()
        if ch_ids:
            msg_sub = select(Message.id).where(Message.channel_id.in_(ch_ids))
            db.execute(sa_delete(Reaction).where(Reaction.message_id.in_(msg_sub)))
            db.execute(sa_delete(PinnedMessage).where(PinnedMessage.message_id.in_(msg_sub)))
            db.execute(sa_delete(Message).where(Message.channel_id.in_(ch_ids)))
            db.execute(sa_delete(PinnedMessage).where(PinnedMessage.channel_id.in_(ch_ids)))
            db.execute(sa_delete(Channel).where(Channel.id.in_(ch_ids)))
        db.execute(sa_delete(ChannelGroup).where(ChannelGroup.server_id.in_(owned_ids)))
        db.execute(sa_delete(ServerMember).where(ServerMember.server_id.in_(owned_ids)))
        db.execute(sa_delete(Invite).where(Invite.server_id.in_(owned_ids)))
        db.execute(sa_delete(JoinRequest).where(JoinRequest.server_id.in_(owned_ids)))
        db.execute(sa_delete(Server).where(Server.id.in_(owned_ids)))
    db.flush()

    # ── 2. 删除用户在其他服务器的消息（hard delete，author_id NOT NULL）──
    user_msg_sub = select(Message.id).where(Message.author_id == user_id)
    db.execute(sa_delete(Reaction).where(Reaction.message_id.in_(user_msg_sub)))
    db.execute(sa_delete(PinnedMessage).where(PinnedMessage.message_id.in_(user_msg_sub)))
    db.execute(sa_delete(Message).where(Message.author_id == user_id))

    # ── 3. 其余关联数据 ───────────────────────────────────────────
    db.execute(sa_delete(Reaction).where(Reaction.user_id == user_id))
    db.execute(sa_delete(PinnedMessage).where(PinnedMessage.pinned_by == user_id))
    db.execute(sa_delete(DirectMessage).where(
        (DirectMessage.sender_id == user_id) | (DirectMessage.receiver_id == user_id)
    ))
    db.execute(sa_delete(Invite).where(Invite.creator_id == user_id))
    db.execute(sa_delete(JoinRequest).where(JoinRequest.user_id == user_id))
    db.execute(sa_delete(Friendship).where((Friendship.user_id == user_id) | (Friendship.friend_id == user_id)))
    db.execute(sa_delete(FriendRequest).where(
        (FriendRequest.requester_id == user_id) | (FriendRequest.receiver_id == user_id)
    ))
    db.execute(sa_delete(Report).where(Report.reporter_id == user_id))
    db.execute(sa_update(Report).where(Report.resolved_by == user_id).values(resolved_by=None, resolved_at=None))
    db.execute(sa_delete(AuditLog).where(AuditLog.admin_id == user_id))
    db.execute(sa_delete(ServerMember).where(ServerMember.user_id == user_id))

    db.flush()
    db.delete(user)
    db.commit()
    return OkResponse(ok=True)


# ── Servers ──────────────────────────────────────────────────────

@router.get("/servers", response_model=list[AdminServerSchema])
def list_servers(
    q: str = "",
    offset: int = 0,
    limit: int = 50,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    stmt = select(Server)
    if q:
        stmt = stmt.where(Server.name.ilike(f"%{q}%"))
    stmt = stmt.order_by(Server.id).offset(offset).limit(limit)
    servers = db.scalars(stmt).all()
    result = []
    for s in servers:
        count = db.scalar(select(func.count()).select_from(ServerMember).where(ServerMember.server_id == s.id))
        d = AdminServerSchema.model_validate(s)
        d.member_count = count
        result.append(d)
    return result


@router.get("/servers/{server_id}", response_model=AdminServerSchema)
def get_server(server_id: int, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    s = db.get(Server, server_id)
    if s is None:
        raise HTTPException(status_code=404, detail="server not found")
    count = db.scalar(select(func.count()).select_from(ServerMember).where(ServerMember.server_id == server_id))
    owner = db.get(User, s.owner_id)
    mod_members = db.scalars(
        select(ServerMember).where(ServerMember.server_id == server_id, ServerMember.role == "mod")
    ).all()
    mod_users = [db.get(User, m.user_id) for m in mod_members]
    d = AdminServerSchema.model_validate(s)
    d.member_count = count
    d.owner_username = owner.username if owner else ""
    d.owner_display_name = owner.display_name if owner else ""
    d.mods = [f"{u.display_name}（@{u.username}）" for u in mod_users if u]
    return d


@router.delete("/servers/{server_id}", response_model=OkResponse)
def delete_server(server_id: int, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    s = db.get(Server, server_id)
    if s is None:
        raise HTTPException(status_code=404, detail="server not found")
    if s.name == "管理员服务器":
        raise HTTPException(status_code=400, detail="cannot delete admin server")
    write_audit(db, admin.id, "delete_server", "server", server_id, {"name": s.name})
    db.delete(s)
    db.commit()
    return OkResponse(ok=True)


@router.patch("/servers/{server_id}/recommended", response_model=OkResponse)
def toggle_recommended(server_id: int, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    s = db.get(Server, server_id)
    if s is None:
        raise HTTPException(status_code=404, detail="server not found")
    s.is_recommended = not s.is_recommended
    write_audit(db, admin.id, "toggle_recommended", "server", server_id, {"is_recommended": s.is_recommended})
    db.commit()
    return OkResponse(ok=True)


class ServerAdminSettingsRequest(BaseModel):
    auto_join: bool | None = None
    join_order: int | None = None


@router.patch("/servers/{server_id}/admin-settings", response_model=OkResponse)
def update_server_admin_settings(
    server_id: int,
    payload: ServerAdminSettingsRequest,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    s = db.get(Server, server_id)
    if s is None:
        raise HTTPException(status_code=404, detail="server not found")
    if payload.auto_join is not None:
        s.auto_join = payload.auto_join
    if payload.join_order is not None:
        s.join_order = payload.join_order
    write_audit(db, admin.id, "update_server_settings", "server", server_id,
                {"auto_join": payload.auto_join, "join_order": payload.join_order})
    db.commit()
    return OkResponse(ok=True)


# ── Channels ─────────────────────────────────────────────────────

@router.get("/servers/{server_id}/channels", response_model=list[ChannelSchema])
def list_server_channels(server_id: int, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    return db.scalars(select(Channel).where(Channel.server_id == server_id).order_by(Channel.position)).all()


@router.delete("/channels/{channel_id}", response_model=OkResponse)
def delete_channel(channel_id: int, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    ch = db.get(Channel, channel_id)
    if ch is None:
        raise HTTPException(status_code=404, detail="channel not found")
    write_audit(db, admin.id, "delete_channel", "channel", channel_id, {"name": ch.name})
    db.delete(ch)
    db.commit()
    return OkResponse(ok=True)


@router.delete("/channel-groups/{group_id}", response_model=OkResponse)
def delete_channel_group(group_id: int, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    grp = db.get(ChannelGroup, group_id)
    if grp is None:
        raise HTTPException(status_code=404, detail="channel group not found")
    # 组内频道要有去处，否则 group_id 被置空后频道会从侧边栏消失（隐形孤儿）
    channel_count = db.scalar(select(func.count()).select_from(Channel).where(Channel.group_id == group_id))
    if channel_count:
        other = db.scalar(
            select(ChannelGroup)
            .where(ChannelGroup.server_id == grp.server_id, ChannelGroup.id != group_id)
            .order_by(ChannelGroup.position)
        )
        if other is None:
            raise HTTPException(status_code=400, detail="该分组下还有频道且无其它分组可移动，请先创建其它分组或删除组内频道")
        # 用 Core UPDATE 重分配，并 flush，避免 db.delete(grp) 的关系级联再把 group_id 置空
        db.execute(sa_update(Channel).where(Channel.group_id == group_id).values(group_id=other.id))
        db.flush()
        db.expire(grp)
    write_audit(db, admin.id, "delete_channel_group", "channel_group", group_id, {"name": grp.name})
    db.delete(grp)
    db.commit()
    return OkResponse(ok=True)


# ── Reports ──────────────────────────────────────────────────────

@router.get("/reports", response_model=list[ReportSchema])
def list_reports(
    status_filter: str = "",
    target_type: str = "",
    offset: int = 0,
    limit: int = 50,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    stmt = select(Report)
    if status_filter:
        stmt = stmt.where(Report.status == status_filter)
    if target_type:
        stmt = stmt.where(Report.target_type == target_type)
    stmt = stmt.order_by(
        (Report.status == "pending").desc(), Report.created_at.desc()
    ).offset(offset).limit(limit)
    return db.scalars(stmt).all()


@router.get("/reports/{report_id}", response_model=ReportSchema)
def get_report(report_id: int, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    r = db.get(Report, report_id)
    if r is None:
        raise HTTPException(status_code=404, detail="report not found")
    return r


@router.post("/reports/{report_id}/resolve", response_model=OkResponse)
def resolve_report(
    report_id: int,
    payload: ResolveReportRequest,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    r = db.get(Report, report_id)
    if r is None:
        raise HTTPException(status_code=404, detail="report not found")
    if r.status != "pending":
        raise HTTPException(status_code=400, detail="report already handled")
    r.status = "resolved"
    r.resolution_note = payload.note
    r.resolved_by = admin.id
    r.resolved_at = datetime.now(timezone.utc)
    write_audit(db, admin.id, "resolve_report", "report", report_id)
    db.commit()
    return OkResponse(ok=True)


@router.post("/reports/{report_id}/dismiss", response_model=OkResponse)
def dismiss_report(
    report_id: int,
    payload: ResolveReportRequest,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    r = db.get(Report, report_id)
    if r is None:
        raise HTTPException(status_code=404, detail="report not found")
    if r.status != "pending":
        raise HTTPException(status_code=400, detail="report already handled")
    r.status = "dismissed"
    r.resolution_note = payload.note
    r.resolved_by = admin.id
    r.resolved_at = datetime.now(timezone.utc)
    write_audit(db, admin.id, "dismiss_report", "report", report_id)
    db.commit()
    return OkResponse(ok=True)


# ── Invites ──────────────────────────────────────────────────────

@router.get("/invites")
def list_invites(
    server_id: int | None = None,
    offset: int = 0,
    limit: int = 50,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    stmt = select(Invite)
    if server_id is not None:
        stmt = stmt.where(Invite.server_id == server_id)
    stmt = stmt.order_by(Invite.created_at.desc()).offset(offset).limit(limit)
    invites = db.scalars(stmt).all()
    return [
        {
            "id": inv.id, "server_id": inv.server_id, "creator_id": inv.creator_id,
            "code": inv.code, "uses": inv.uses, "max_uses": inv.max_uses,
            "expires_at": inv.expires_at, "created_at": inv.created_at,
        }
        for inv in invites
    ]


@router.delete("/invites/{code}", response_model=OkResponse)
def revoke_invite(code: str, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    inv = db.scalar(select(Invite).where(Invite.code == code))
    if inv is None:
        raise HTTPException(status_code=404, detail="invite not found")
    write_audit(db, admin.id, "revoke_invite", "invite", inv.id, {"code": code})
    db.delete(inv)
    db.commit()
    return OkResponse(ok=True)


# ── Join Requests ─────────────────────────────────────────────────

@router.get("/join-requests")
def list_join_requests(
    server_id: int | None = None,
    offset: int = 0,
    limit: int = 50,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    stmt = select(JoinRequest).where(JoinRequest.status == "pending")
    if server_id is not None:
        stmt = stmt.where(JoinRequest.server_id == server_id)
    stmt = stmt.order_by(JoinRequest.created_at.desc()).offset(offset).limit(limit)
    reqs = db.scalars(stmt).all()
    return [
        {
            "id": r.id, "server_id": r.server_id, "user_id": r.user_id,
            "status": r.status, "note": r.note, "created_at": r.created_at,
        }
        for r in reqs
    ]


# ── Audit Logs ────────────────────────────────────────────────────

@router.get("/audit-logs", response_model=list[AuditLogSchema])
def list_audit_logs(
    admin_id: int | None = None,
    action: str = "",
    offset: int = 0,
    limit: int = 50,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    stmt = select(AuditLog)
    if admin_id is not None:
        stmt = stmt.where(AuditLog.admin_id == admin_id)
    if action:
        stmt = stmt.where(AuditLog.action == action)
    stmt = stmt.order_by(AuditLog.created_at.desc()).offset(offset).limit(limit)
    return db.scalars(stmt).all()


# ── Bots ─────────────────────────────────────────────────────────

def _bot_is_running(bot_id: int) -> bool:
    from bot_runner import running_bots
    r = running_bots.get(bot_id)
    return r is not None and r.is_running()


def _ensure_user_for_bot(bot: Bot, db: Session) -> None:
    if bot.user_id:
        user = db.get(User, bot.user_id)
        if user:
            user.display_name = bot.display_name
            user.password_hash = hash_password(decrypt_secret(bot.password))
            db.flush()
            return
    user = db.scalar(select(User).where(User.username == bot.username))
    if user:
        user.display_name = bot.display_name
        user.password_hash = hash_password(decrypt_secret(bot.password))
        bot.user_id = user.id
        db.flush()
        return
    user = User(
        username=bot.username,
        display_name=bot.display_name,
        password_hash=hash_password(decrypt_secret(bot.password)),
        avatar_color=bot.avatar_color,
        status="online",
        is_bot=True,
    )
    db.add(user)
    db.flush()
    bot.user_id = user.id
    auto_join_servers = db.scalars(
        select(Server).where(Server.auto_join == True).order_by(Server.join_order)
    ).all()
    existing_ids = {
        sm.server_id for sm in db.scalars(
            select(ServerMember).where(
                ServerMember.user_id == user.id,
                ServerMember.server_id.in_([s.id for s in auto_join_servers]),
            )
        ).all()
    }
    for srv in auto_join_servers:
        if srv.id not in existing_ids:
            db.add(ServerMember(server_id=srv.id, user_id=user.id, role="member"))
    db.flush()


def _ensure_bot_server_memberships(bot: Bot, db: Session) -> None:
    if not bot.user_id:
        return
    try:
        channel_ids = json.loads(bot.channel_ids or "[]")
    except Exception:
        return
    if not channel_ids:
        return
    channels = db.scalars(select(Channel).where(Channel.id.in_(channel_ids))).all()
    server_ids = {ch.server_id for ch in channels}
    existing = {
        sm.server_id for sm in db.scalars(
            select(ServerMember).where(
                ServerMember.user_id == bot.user_id,
                ServerMember.server_id.in_(server_ids),
            )
        ).all()
    }
    for srv_id in server_ids - existing:
        db.add(ServerMember(server_id=srv_id, user_id=bot.user_id, role="member"))
    db.flush()


@router.get("/bots", response_model=list[BotOut])
def list_bots(admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    return db.scalars(select(Bot).order_by(Bot.id)).all()


@router.post("/bots", response_model=BotOut, status_code=201)
def create_bot(payload: BotCreate, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    if db.scalar(select(Bot).where(Bot.username == payload.username)):
        raise HTTPException(status_code=409, detail="username already taken")
    bot = Bot(
        name=payload.name,
        username=payload.username,
        password=encrypt_secret(payload.password),
        display_name=payload.display_name,
        llm_api_key=payload.llm_api_key,
        llm_base_url=payload.llm_base_url,
        llm_model=payload.llm_model,
        system_prompt=payload.system_prompt,
        channel_ids=json.dumps(payload.channel_ids),
        is_active=False,
    )
    db.add(bot)
    db.flush()
    _ensure_user_for_bot(bot, db)
    _ensure_bot_server_memberships(bot, db)
    write_audit(db, admin.id, "create_bot", "bot", bot.id, {"username": bot.username})
    db.commit()
    db.refresh(bot)
    return BotOut.model_validate(bot)


@router.get("/bots/{bot_id}", response_model=BotOut)
def get_bot(bot_id: int, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    bot = db.get(Bot, bot_id)
    if bot is None:
        raise HTTPException(status_code=404, detail="bot not found")
    return bot


@router.patch("/bots/{bot_id}", response_model=BotOut)
async def update_bot(
    bot_id: int,
    payload: BotUpdate,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    bot = db.get(Bot, bot_id)
    if bot is None:
        raise HTTPException(status_code=404, detail="bot not found")
    was_running = _bot_is_running(bot_id)
    if was_running:
        from bot_runner import running_bots
        await running_bots[bot_id].stop()
    for field, value in payload.model_dump(exclude_none=True).items():
        if field == "channel_ids":
            setattr(bot, field, json.dumps(value))
        elif field == "password":
            setattr(bot, field, encrypt_secret(value))
        else:
            setattr(bot, field, value)
    if payload.display_name or payload.password:
        _ensure_user_for_bot(bot, db)
    if payload.channel_ids is not None:
        _ensure_bot_server_memberships(bot, db)
    write_audit(db, admin.id, "update_bot", "bot", bot_id)
    db.commit()
    db.refresh(bot)
    if was_running:
        from bot_runner import running_bots, BotRunner
        api_base = _API_BASE
        runner = BotRunner(bot, api_base)
        running_bots[bot_id] = runner
        runner.start()
        bot.is_active = True
        db.commit()
    out = BotOut.model_validate(bot)
    out.is_active = _bot_is_running(bot_id)
    return out


@router.delete("/bots/{bot_id}", response_model=OkResponse)
async def delete_bot(bot_id: int, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    bot = db.get(Bot, bot_id)
    if bot is None:
        raise HTTPException(status_code=404, detail="bot not found")
    if _bot_is_running(bot_id):
        from bot_runner import running_bots
        await running_bots[bot_id].stop()
        running_bots.pop(bot_id, None)
    write_audit(db, admin.id, "delete_bot", "bot", bot_id, {"username": bot.username})
    if bot.user_id:
        user = db.get(User, bot.user_id)
        if user:
            user_msg_sub = select(Message.id).where(Message.author_id == user.id)
            db.execute(sa_delete(Reaction).where(Reaction.message_id.in_(user_msg_sub)))
            db.execute(sa_delete(PinnedMessage).where(PinnedMessage.message_id.in_(user_msg_sub)))
            db.execute(sa_delete(Message).where(Message.author_id == user.id))
            db.execute(sa_delete(ServerMember).where(ServerMember.user_id == user.id))
            db.flush()
            db.delete(user)
            db.flush()
    db.delete(bot)
    db.commit()
    return OkResponse(ok=True)


@router.post("/bots/{bot_id}/start", response_model=OkResponse)
async def start_bot(bot_id: int, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    bot = db.get(Bot, bot_id)
    if bot is None:
        raise HTTPException(status_code=404, detail="bot not found")
    if _bot_is_running(bot_id):
        return OkResponse(ok=True)
    from bot_runner import running_bots, BotRunner
    if bot_id in running_bots:
        await running_bots[bot_id].stop()
    api_base = _API_BASE
    runner = BotRunner(bot, api_base)
    running_bots[bot_id] = runner
    runner.start()
    bot.is_active = True
    db.commit()
    return OkResponse(ok=True)


@router.post("/bots/{bot_id}/stop", response_model=OkResponse)
async def stop_bot(bot_id: int, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    bot = db.get(Bot, bot_id)
    if bot is None:
        raise HTTPException(status_code=404, detail="bot not found")
    if _bot_is_running(bot_id):
        from bot_runner import running_bots
        await running_bots[bot_id].stop()
        running_bots.pop(bot_id, None)
    bot.is_active = False
    db.commit()
    return OkResponse(ok=True)


@router.get("/bots/{bot_id}/available-channels")
def get_available_channels(bot_id: int, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    """Return text channels grouped by server, for bot channel assignment UI."""
    bot = db.get(Bot, bot_id)
    if bot is None:
        raise HTTPException(status_code=404, detail="bot not found")
    servers = db.scalars(select(Server).order_by(Server.name)).all()
    result = []
    for srv in servers:
        channels = db.scalars(
            select(Channel)
            .where(Channel.server_id == srv.id, Channel.kind == "text")
            .order_by(Channel.position)
        ).all()
        if channels:
            result.append({
                "server_id": srv.id,
                "server_name": srv.name,
                "channels": [{"id": ch.id, "name": ch.name, "kind": ch.kind} for ch in channels],
            })
    return result
