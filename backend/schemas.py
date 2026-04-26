from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class UserSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    username: str
    display_name: str
    avatar_color: str
    status: str
    bio: str | None = None
    created_at: datetime | None = None


class ServerSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    short_name: str
    color: str
    icon_url: str | None = None
    description: str | None = None
    is_recommended: bool = False
    join_policy: str = "approval"
    owner_id: int
    created_at: datetime | None = None


class ChannelSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    server_id: int
    group_id: int | None = None
    name: str
    kind: str
    topic: str | None = None
    position: int


class ServerCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=64)
    short_name: str = Field(min_length=1, max_length=4)
    color: str = Field(default="av-1", pattern=r"^av-[1-8]$")
    icon_url: str | None = Field(default=None, max_length=256)


class ServerUpdateRequest(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=64)
    short_name: str | None = Field(default=None, min_length=1, max_length=4)
    color: str | None = Field(default=None, pattern=r"^av-[1-8]$")
    icon_url: str | None = Field(default=None, max_length=256)
    description: str | None = Field(default=None, max_length=256)
    join_policy: str | None = Field(default=None, pattern=r"^(open|closed|approval)$")


class ServerJoinRequest(BaseModel):
    code: str = Field(min_length=1, max_length=64)


class JoinRequestCreateRequest(BaseModel):
    note: str | None = Field(default=None, max_length=256)


class ChannelGroupCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=64)


class ChannelCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=64)
    kind: str = Field(default="text", pattern=r"^(text|announce|voice)$")
    group_id: int | None = None
    group_name: str | None = Field(default=None, max_length=64)
    topic: str | None = Field(default=None, max_length=256)


class ChannelUpdateRequest(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=64)
    topic: str | None = Field(default=None, max_length=256)


class InviteCreateRequest(BaseModel):
    max_uses: int | None = Field(default=None, ge=1, le=1000)
    expires_hours: int | None = Field(default=None, ge=1, le=720)


class MessageCreateRequest(BaseModel):
    content: str = Field(min_length=1)
    reply_to_id: int | None = None


class MessageUpdateRequest(BaseModel):
    content: str = Field(min_length=1)


class ReactionRequest(BaseModel):
    emoji: str = Field(min_length=1, max_length=8)


class DMCreateRequest(BaseModel):
    content: str = Field(min_length=1)


class HealthSchema(BaseModel):
    status: str


class RegisterRequest(BaseModel):
    username: str = Field(min_length=3, max_length=32, pattern=r"^[A-Za-z0-9_]+$")
    display_name: str = Field(min_length=1, max_length=32)
    password: str = Field(min_length=6)


class LoginRequest(BaseModel):
    username: str = Field(min_length=1, max_length=32)
    password: str = Field(min_length=1)


class RefreshRequest(BaseModel):
    refresh_token: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    user: UserSchema


class AccessTokenResponse(BaseModel):
    access_token: str


class OkResponse(BaseModel):
    ok: bool


class UserUpdateRequest(BaseModel):
    display_name: str | None = Field(default=None, min_length=1, max_length=32)
    bio: str | None = Field(default=None, max_length=256)
    status: str | None = Field(default=None, pattern=r"^(online|idle|dnd|offline)$")
    avatar_color: str | None = Field(default=None, pattern=r"^av-[1-8]$")


class TelegramNotifyUpdate(BaseModel):
    enabled: bool
