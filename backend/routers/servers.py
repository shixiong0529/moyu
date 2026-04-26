from datetime import datetime, timedelta
import secrets

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import case, delete, func, select
from sqlalchemy.orm import Session, selectinload

from auth import get_current_user
from database import get_db
from models import Channel, ChannelGroup, Invite, JoinRequest, Message, PinnedMessage, Reaction, Server, ServerMember, User
from schemas import (
    ChannelCreateRequest,
    ChannelGroupCreateRequest,
    InviteCreateRequest,
    JoinRequestCreateRequest,
    ServerCreateRequest,
    ServerJoinRequest,
    ServerUpdateRequest,
)

router = APIRouter(prefix="/api/servers", tags=["servers"])


def public_asset_url(path: str | None, request: Request | None = None) -> str | None:
    if not path or path.startswith(("http://", "https://")):
        return path
    if request is None:
        return path
    return f"{str(request.base_url).rstrip('/')}{path if path.startswith('/') else '/' + path}"


def server_to_dict(
    server: Server,
    role: str | None = None,
    include_channels: bool = False,
    request: Request | None = None,
) -> dict:
    data = {
        "id": server.id,
        "name": server.name,
        "short_name": server.short_name,
        "color": server.color,
        "icon_url": server.icon_url,
        "logo_url": public_asset_url(server.icon_url, request),
        "description": server.description,
        "is_recommended": server.is_recommended,
        "owner_id": server.owner_id,
        "created_at": server.created_at,
        "role": role,
    }
    if role in {"founder", "mod"}:
        data["pending_join_requests"] = len([request for request in server.join_requests if request.status == "pending"])
    if include_channels:
        groups = sorted(server.channel_groups, key=lambda group: group.position)
        data["channel_groups"] = [
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
    return data


def require_member(db: Session, server_id: int, user_id: int) -> ServerMember:
    member = db.scalar(
        select(ServerMember).where(
            ServerMember.server_id == server_id,
            ServerMember.user_id == user_id,
        )
    )
    if member is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="not a server member")
    return member


def require_manager(db: Session, server_id: int, user_id: int) -> ServerMember:
    member = require_member(db, server_id, user_id)
    if member.role not in {"founder", "mod"}:
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


@router.get("")
def list_servers(
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    rows = db.execute(
        select(Server, ServerMember.role)
        .join(ServerMember, ServerMember.server_id == Server.id)
        .where(ServerMember.user_id == current_user.id)
        .order_by(case((Server.name == "管理员服务器", 0), else_=1), Server.created_at)
    ).all()
    return [server_to_dict(server, role, request=request) for server, role in rows]


@router.post("", status_code=status.HTTP_201_CREATED)
def create_server(
    payload: ServerCreateRequest,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    server = Server(
        name=payload.name,
        short_name=payload.short_name,
        color=payload.color,
        icon_url=payload.icon_url,
        owner_id=current_user.id,
    )
    db.add(server)
    db.flush()

    default_group = ChannelGroup(server_id=server.id, name="General · 综合", position=0)
    db.add(default_group)
    db.flush()
    db.add(Channel(server_id=server.id, group_id=default_group.id, name="general", kind="text", position=0))
    db.add(ServerMember(server_id=server.id, user_id=current_user.id, role="founder"))
    db.commit()
    db.refresh(server)
    return server_to_dict(server, "founder", request=request)


@router.patch("/{server_id}")
def update_server(
    server_id: int,
    payload: ServerUpdateRequest,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    server = db.scalar(
        select(Server)
        .where(Server.id == server_id)
        .options(selectinload(Server.channel_groups).selectinload(ChannelGroup.channels))
    )
    if server is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="server not found")
    member = require_manager(db, server_id, current_user.id)

    updates = payload.model_dump(exclude_unset=True)
    for field, value in updates.items():
        if isinstance(value, str):
            value = value.strip()
        setattr(server, field, value)

    db.add(server)
    db.commit()
    db.refresh(server)
    return server_to_dict(server, member.role, include_channels=True, request=request)


@router.delete("/{server_id}")
def delete_server(
    server_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    server = db.get(Server, server_id)
    if server is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="server not found")
    if server.name == "管理员服务器":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="admin server cannot be deleted")

    member = require_member(db, server_id, current_user.id)
    if member.role != "founder":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="only founder can delete server")

    channel_ids = db.scalars(select(Channel.id).where(Channel.server_id == server_id)).all()
    message_ids = (
        db.scalars(select(Message.id).where(Message.channel_id.in_(channel_ids))).all()
        if channel_ids
        else []
    )

    if message_ids:
        db.execute(delete(Reaction).where(Reaction.message_id.in_(message_ids)))
        db.execute(delete(PinnedMessage).where(PinnedMessage.message_id.in_(message_ids)))
        db.execute(delete(Message).where(Message.id.in_(message_ids)))
    if channel_ids:
        db.execute(delete(PinnedMessage).where(PinnedMessage.channel_id.in_(channel_ids)))
        db.execute(delete(Channel).where(Channel.id.in_(channel_ids)))
    db.execute(delete(ChannelGroup).where(ChannelGroup.server_id == server_id))
    db.execute(delete(Invite).where(Invite.server_id == server_id))
    db.execute(delete(JoinRequest).where(JoinRequest.server_id == server_id))
    db.execute(delete(ServerMember).where(ServerMember.server_id == server_id))
    db.delete(server)
    db.commit()
    return {"ok": True}


@router.get("/recommended")
def list_recommended_servers(
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    servers = db.scalars(
        select(Server)
        .where(Server.is_recommended == True)  # noqa: E712
        .options(selectinload(Server.members), selectinload(Server.join_requests))
        .order_by(Server.created_at)
    ).all()
    joined_ids = set(
        db.scalars(select(ServerMember.server_id).where(ServerMember.user_id == current_user.id)).all()
    )
    pending_ids = set(
        db.scalars(
            select(JoinRequest.server_id).where(
                JoinRequest.user_id == current_user.id,
                JoinRequest.status == "pending",
            )
        ).all()
    )
    return [
        {
            **server_to_dict(server, request=request),
            "member_count": len(server.members),
            "request_status": "member" if server.id in joined_ids else "pending" if server.id in pending_ids else "none",
        }
        for server in servers
    ]


@router.get("/{server_id}")
def get_server(
    server_id: int,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    member = require_member(db, server_id, current_user.id)
    server = db.scalar(
        select(Server)
        .where(Server.id == server_id)
        .options(selectinload(Server.channel_groups).selectinload(ChannelGroup.channels))
    )
    if server is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="server not found")
    return server_to_dict(server, member.role, include_channels=True, request=request)


@router.post("/{server_id}/join-requests", status_code=status.HTTP_201_CREATED)
def create_join_request(
    server_id: int,
    request: Request,
    payload: JoinRequestCreateRequest | None = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    server = db.get(Server, server_id)
    if server is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="server not found")

    existing_member = db.scalar(
        select(ServerMember).where(
            ServerMember.server_id == server_id,
            ServerMember.user_id == current_user.id,
        )
    )
    if existing_member is not None:
        return {"status": "member", "server": server_to_dict(server, existing_member.role, request=request)}

    existing_request = db.scalar(
        select(JoinRequest).where(
            JoinRequest.server_id == server_id,
            JoinRequest.user_id == current_user.id,
            JoinRequest.status == "pending",
        )
    )
    if existing_request is not None:
        return {"status": "pending", "request": join_request_to_dict(existing_request)}

    payload = payload or JoinRequestCreateRequest()
    join_request = JoinRequest(
        server_id=server_id,
        user_id=current_user.id,
        note=payload.note,
    )
    db.add(join_request)
    db.commit()
    db.refresh(join_request)
    return {"status": "pending", "request": join_request_to_dict(join_request)}


def join_request_to_dict(join_request: JoinRequest) -> dict:
    user = join_request.user
    return {
        "id": join_request.id,
        "server_id": join_request.server_id,
        "status": join_request.status,
        "note": join_request.note,
        "created_at": join_request.created_at,
        "decided_at": join_request.decided_at,
        "user": {
            "id": user.id,
            "username": user.username,
            "display_name": user.display_name,
            "avatar_color": user.avatar_color,
            "status": user.status,
            "bio": user.bio,
        } if user else None,
    }


@router.get("/{server_id}/join-requests")
def list_join_requests(server_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    require_manager(db, server_id, current_user.id)
    requests = db.scalars(
        select(JoinRequest)
        .where(JoinRequest.server_id == server_id, JoinRequest.status == "pending")
        .options(selectinload(JoinRequest.user))
        .order_by(JoinRequest.created_at)
    ).all()
    return [join_request_to_dict(item) for item in requests]


@router.post("/{server_id}/join-requests/{request_id}/approve")
def approve_join_request(
    server_id: int,
    request_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    require_manager(db, server_id, current_user.id)
    join_request = db.scalar(
        select(JoinRequest)
        .where(JoinRequest.id == request_id, JoinRequest.server_id == server_id)
        .options(selectinload(JoinRequest.user))
    )
    if join_request is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="join request not found")
    if join_request.status != "pending":
        return join_request_to_dict(join_request)

    existing_member = db.scalar(
        select(ServerMember).where(
            ServerMember.server_id == server_id,
            ServerMember.user_id == join_request.user_id,
        )
    )
    if existing_member is None:
        db.add(ServerMember(server_id=server_id, user_id=join_request.user_id, role="member"))

    join_request.status = "approved"
    join_request.decided_by = current_user.id
    join_request.decided_at = datetime.utcnow()
    db.commit()
    db.refresh(join_request)
    return join_request_to_dict(join_request)


@router.post("/{server_id}/join-requests/{request_id}/reject")
def reject_join_request(
    server_id: int,
    request_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    require_manager(db, server_id, current_user.id)
    join_request = db.scalar(
        select(JoinRequest)
        .where(JoinRequest.id == request_id, JoinRequest.server_id == server_id)
        .options(selectinload(JoinRequest.user))
    )
    if join_request is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="join request not found")
    if join_request.status == "pending":
        join_request.status = "rejected"
        join_request.decided_by = current_user.id
        join_request.decided_at = datetime.utcnow()
        db.commit()
        db.refresh(join_request)
    return join_request_to_dict(join_request)


@router.get("/{server_id}/members")
def list_members(server_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    require_member(db, server_id, current_user.id)
    members = db.scalars(
        select(ServerMember)
        .where(ServerMember.server_id == server_id)
        .options(selectinload(ServerMember.user))
        .order_by(ServerMember.role, ServerMember.joined_at)
    ).all()
    return [
        {
            "id": member.id,
            "role": member.role,
            "joined_at": member.joined_at,
            "user": {
                "id": member.user.id,
                "username": member.user.username,
                "display_name": member.user.display_name,
                "avatar_color": member.user.avatar_color,
                "status": member.user.status,
                "bio": member.user.bio,
                "created_at": member.user.created_at,
            },
        }
        for member in members
    ]


@router.post("/{server_id}/channels", status_code=status.HTTP_201_CREATED)
def create_channel(
    server_id: int,
    payload: ChannelCreateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    require_manager(db, server_id, current_user.id)
    server = db.get(Server, server_id)
    if server is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="server not found")

    group = None
    if payload.group_id is not None:
        group = db.get(ChannelGroup, payload.group_id)
        if group is None or group.server_id != server_id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="invalid channel group")
    elif payload.group_name:
        group = db.scalar(
            select(ChannelGroup).where(ChannelGroup.server_id == server_id, ChannelGroup.name == payload.group_name)
        )
        if group is None:
            next_group_position = db.scalar(
                select(func.coalesce(func.max(ChannelGroup.position), -1)).where(ChannelGroup.server_id == server_id)
            ) + 1
            group = ChannelGroup(server_id=server_id, name=payload.group_name, position=next_group_position)
            db.add(group)
            db.flush()
    else:
        group = db.scalar(
            select(ChannelGroup).where(ChannelGroup.server_id == server_id).order_by(ChannelGroup.position)
        )
        if group is None:
            group = ChannelGroup(server_id=server_id, name="General", position=0)
            db.add(group)
            db.flush()

    next_position = db.scalar(
        select(func.coalesce(func.max(Channel.position), -1)).where(Channel.group_id == group.id)
    ) + 1
    channel = Channel(
        server_id=server_id,
        group_id=group.id,
        name=payload.name.strip(),
        kind=payload.kind,
        topic=payload.topic,
        position=next_position,
    )
    db.add(channel)
    db.commit()
    db.refresh(channel)
    return channel_to_dict(channel)


@router.post("/{server_id}/channel-groups", status_code=status.HTTP_201_CREATED)
def create_channel_group(
    server_id: int,
    payload: ChannelGroupCreateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if db.get(Server, server_id) is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="server not found")
    require_manager(db, server_id, current_user.id)

    next_position = db.scalar(
        select(func.coalesce(func.max(ChannelGroup.position), -1)).where(ChannelGroup.server_id == server_id)
    ) + 1
    group = ChannelGroup(server_id=server_id, name=payload.name.strip(), position=next_position)
    db.add(group)
    db.commit()
    db.refresh(group)
    return {
        "id": group.id,
        "server_id": group.server_id,
        "name": group.name,
        "position": group.position,
    }


@router.post("/{server_id}/invite", status_code=status.HTTP_201_CREATED)
def create_invite(
    server_id: int,
    request: Request,
    payload: InviteCreateRequest | None = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    require_manager(db, server_id, current_user.id)
    if db.get(Server, server_id) is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="server not found")

    payload = payload or InviteCreateRequest()
    code = secrets.token_urlsafe(8).replace("-", "").replace("_", "")[:10]
    while db.scalar(select(Invite).where(Invite.code == code)) is not None:
        code = secrets.token_urlsafe(8).replace("-", "").replace("_", "")[:10]

    invite = Invite(
        server_id=server_id,
        creator_id=current_user.id,
        code=code,
        max_uses=payload.max_uses,
        expires_at=datetime.utcnow() + timedelta(hours=payload.expires_hours) if payload.expires_hours else None,
    )
    db.add(invite)
    db.commit()
    db.refresh(invite)
    return {
        "code": invite.code,
        "url": f"hearth://invite/{invite.code}",
        "web_url": f"{str(request.base_url).rstrip('/')}/?invite={invite.code}",
        "uses": invite.uses,
        "max_uses": invite.max_uses,
        "expires_at": invite.expires_at,
    }


@router.post("/join")
def join_server(
    payload: ServerJoinRequest,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    code = payload.code.strip()
    server = None
    invite = db.scalar(select(Invite).where(Invite.code == code))
    if invite:
        if invite.expires_at and invite.expires_at < datetime.utcnow():
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="invite expired")
        if invite.max_uses is not None and invite.uses >= invite.max_uses:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="invite exhausted")
        server = db.get(Server, invite.server_id)
    elif code.isdigit():
        server = db.get(Server, int(code))

    if server is None:
        server = db.scalar(select(Server).where(Server.name == code))

    if server is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="invalid invite code")

    existing = db.scalar(
        select(ServerMember).where(
            ServerMember.server_id == server.id,
            ServerMember.user_id == current_user.id,
        )
    )
    if existing is None:
        db.add(ServerMember(server_id=server.id, user_id=current_user.id, role="member"))
        if invite:
            invite.uses += 1
        db.commit()
        return server_to_dict(server, "member", request=request)
    return server_to_dict(server, existing.role, request=request)


@router.delete("/{server_id}/members/me")
def leave_server(
    server_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    member = require_member(db, server_id, current_user.id)
    if member.role == "founder":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="founder cannot leave their own server")
    db.delete(member)
    db.commit()
    return {"ok": True}
