from datetime import datetime

from sqlalchemy import BigInteger, Boolean, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    username: Mapped[str] = mapped_column(String(32), unique=True, nullable=False, index=True)
    display_name: Mapped[str] = mapped_column(String(32), nullable=False)
    password_hash: Mapped[str] = mapped_column(String, nullable=False)
    avatar_color: Mapped[str] = mapped_column(String(8), nullable=False, default="av-1", server_default="av-1")
    avatar_url: Mapped[str | None] = mapped_column(String(256), nullable=True, default=None)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="online", server_default="online")
    bio: Mapped[str | None] = mapped_column(String(256), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
    # Telegram notification fields (per-user bot token model)
    telegram_bot_token: Mapped[str | None] = mapped_column(String(128), nullable=True, default=None)
    telegram_chat_id: Mapped[int | None] = mapped_column(BigInteger, nullable=True, default=None)
    telegram_notify_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="0")

    owned_servers: Mapped[list["Server"]] = relationship(back_populates="owner")
    memberships: Mapped[list["ServerMember"]] = relationship(back_populates="user", cascade="all, delete-orphan")
    messages: Mapped[list["Message"]] = relationship(back_populates="author")


class Server(Base):
    __tablename__ = "servers"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(64), nullable=False)
    short_name: Mapped[str] = mapped_column(String(4), nullable=False)
    color: Mapped[str] = mapped_column(String(8), nullable=False, default="av-1", server_default="av-1")
    icon_url: Mapped[str | None] = mapped_column(String(256), nullable=True)
    description: Mapped[str | None] = mapped_column(String(256), nullable=True)
    is_recommended: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="0")
    join_policy: Mapped[str] = mapped_column(String(16), nullable=False, default="approval", server_default="approval")
    owner_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())

    owner: Mapped["User"] = relationship(back_populates="owned_servers")
    members: Mapped[list["ServerMember"]] = relationship(back_populates="server", cascade="all, delete-orphan")
    channel_groups: Mapped[list["ChannelGroup"]] = relationship(back_populates="server", cascade="all, delete-orphan")
    channels: Mapped[list["Channel"]] = relationship(back_populates="server", cascade="all, delete-orphan")
    invites: Mapped[list["Invite"]] = relationship(back_populates="server", cascade="all, delete-orphan")
    join_requests: Mapped[list["JoinRequest"]] = relationship(back_populates="server", cascade="all, delete-orphan")


class JoinRequest(Base):
    __tablename__ = "join_requests"
    __table_args__ = (UniqueConstraint("server_id", "user_id", "status", name="uq_join_requests_server_user_status"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    server_id: Mapped[int] = mapped_column(ForeignKey("servers.id"), nullable=False)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="pending", server_default="pending")
    note: Mapped[str | None] = mapped_column(String(256), nullable=True)
    decided_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    decided_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())

    server: Mapped["Server"] = relationship(back_populates="join_requests")
    user: Mapped["User"] = relationship(foreign_keys=[user_id])
    reviewer: Mapped["User | None"] = relationship(foreign_keys=[decided_by])


class FriendRequest(Base):
    __tablename__ = "friend_requests"
    __table_args__ = (UniqueConstraint("requester_id", "receiver_id", "status", name="uq_friend_requests_pair_status"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    requester_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    receiver_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="pending", server_default="pending")
    decided_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())

    requester: Mapped["User"] = relationship(foreign_keys=[requester_id])
    receiver: Mapped["User"] = relationship(foreign_keys=[receiver_id])


class Friendship(Base):
    __tablename__ = "friendships"
    __table_args__ = (UniqueConstraint("user_id", "friend_id", name="uq_friendships_pair"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    friend_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())

    user: Mapped["User"] = relationship(foreign_keys=[user_id])
    friend: Mapped["User"] = relationship(foreign_keys=[friend_id])


class ServerMember(Base):
    __tablename__ = "server_members"
    __table_args__ = (UniqueConstraint("server_id", "user_id", name="uq_server_members_server_user"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    server_id: Mapped[int] = mapped_column(ForeignKey("servers.id"), nullable=False)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    role: Mapped[str] = mapped_column(String(16), nullable=False, default="member", server_default="member")
    joined_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())

    server: Mapped["Server"] = relationship(back_populates="members")
    user: Mapped["User"] = relationship(back_populates="memberships")


class ChannelGroup(Base):
    __tablename__ = "channel_groups"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    server_id: Mapped[int] = mapped_column(ForeignKey("servers.id"), nullable=False)
    name: Mapped[str] = mapped_column(String(64), nullable=False)
    position: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")

    server: Mapped["Server"] = relationship(back_populates="channel_groups")
    channels: Mapped[list["Channel"]] = relationship(back_populates="group")


class Channel(Base):
    __tablename__ = "channels"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    server_id: Mapped[int] = mapped_column(ForeignKey("servers.id"), nullable=False)
    group_id: Mapped[int | None] = mapped_column(ForeignKey("channel_groups.id"), nullable=True)
    name: Mapped[str] = mapped_column(String(64), nullable=False)
    kind: Mapped[str] = mapped_column(String(16), nullable=False, default="text", server_default="text")
    topic: Mapped[str | None] = mapped_column(String(256), nullable=True)
    position: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")

    server: Mapped["Server"] = relationship(back_populates="channels")
    group: Mapped["ChannelGroup | None"] = relationship(back_populates="channels")
    messages: Mapped[list["Message"]] = relationship(back_populates="channel", cascade="all, delete-orphan")
    pins: Mapped[list["PinnedMessage"]] = relationship(back_populates="channel", cascade="all, delete-orphan")


class Message(Base):
    __tablename__ = "messages"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    channel_id: Mapped[int] = mapped_column(ForeignKey("channels.id"), nullable=False)
    author_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    reply_to_id: Mapped[int | None] = mapped_column(ForeignKey("messages.id"), nullable=True)
    is_edited: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="0")
    edited_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
    is_deleted: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="0")

    channel: Mapped["Channel"] = relationship(back_populates="messages")
    author: Mapped["User"] = relationship(back_populates="messages")
    reply_to: Mapped["Message | None"] = relationship(remote_side=[id])
    reactions: Mapped[list["Reaction"]] = relationship(back_populates="message", cascade="all, delete-orphan")
    pins: Mapped[list["PinnedMessage"]] = relationship(back_populates="message", cascade="all, delete-orphan")


class Reaction(Base):
    __tablename__ = "reactions"
    __table_args__ = (UniqueConstraint("message_id", "user_id", "emoji", name="uq_reactions_message_user_emoji"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    message_id: Mapped[int] = mapped_column(ForeignKey("messages.id"), nullable=False)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    emoji: Mapped[str] = mapped_column(String(8), nullable=False)

    message: Mapped["Message"] = relationship(back_populates="reactions")
    user: Mapped["User"] = relationship()


class DirectMessage(Base):
    __tablename__ = "direct_messages"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    sender_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    receiver_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
    is_read: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="0")
    is_deleted: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="0")

    sender: Mapped["User"] = relationship(foreign_keys=[sender_id])
    receiver: Mapped["User"] = relationship(foreign_keys=[receiver_id])


class PinnedMessage(Base):
    __tablename__ = "pinned_messages"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    channel_id: Mapped[int] = mapped_column(ForeignKey("channels.id"), nullable=False)
    message_id: Mapped[int] = mapped_column(ForeignKey("messages.id"), nullable=False)
    pinned_by: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    pinned_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())

    channel: Mapped["Channel"] = relationship(back_populates="pins")
    message: Mapped["Message"] = relationship(back_populates="pins")
    user: Mapped["User"] = relationship()


class Invite(Base):
    __tablename__ = "invites"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    server_id: Mapped[int] = mapped_column(ForeignKey("servers.id"), nullable=False)
    creator_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    code: Mapped[str] = mapped_column(String(16), unique=True, nullable=False, index=True)
    uses: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    max_uses: Mapped[int | None] = mapped_column(Integer, nullable=True)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())

    server: Mapped["Server"] = relationship(back_populates="invites")
    creator: Mapped["User"] = relationship()
