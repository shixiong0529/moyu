from datetime import datetime

import json as _json

from pydantic import BaseModel, ConfigDict, Field, field_validator


class UserSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    username: str
    display_name: str
    avatar_color: str
    avatar_url: str | None = None
    status: str
    bio: str | None = None
    pronouns: str = "private"
    created_at: datetime | None = None
    is_bot: bool = False
    is_admin: bool = False


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


class MemberRoleUpdateRequest(BaseModel):
    role: str = Field(pattern=r"^(mod|member)$")


class JoinRequestCreateRequest(BaseModel):
    note: str | None = Field(default=None, max_length=256)


class ChannelGroupCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=64)

    @field_validator("name")
    @classmethod
    def name_not_blank(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("名称不能为空白")
        return value


class ChannelCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=64)
    kind: str = Field(default="text", pattern=r"^(text|announce|voice)$")
    group_id: int | None = None
    group_name: str | None = Field(default=None, max_length=64)
    topic: str | None = Field(default=None, max_length=256)

    @field_validator("name")
    @classmethod
    def name_not_blank(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("名称不能为空白")
        return value

    @field_validator("group_name")
    @classmethod
    def group_name_not_blank(cls, value: str | None) -> str | None:
        if value is None:
            return None
        value = value.strip()
        return value or None


class ChannelUpdateRequest(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=64)
    topic: str | None = Field(default=None, max_length=256)


class InviteCreateRequest(BaseModel):
    max_uses: int | None = Field(default=None, ge=1, le=1000)
    expires_hours: int | None = Field(default=24, ge=1, le=720)


class ServerFriendInviteRequest(BaseModel):
    user_id: int


class MessageCreateRequest(BaseModel):
    content: str = Field(min_length=1, max_length=4000)
    reply_to_id: int | None = None


class MessageUpdateRequest(BaseModel):
    content: str = Field(min_length=1, max_length=4000)


class ReactionRequest(BaseModel):
    emoji: str = Field(min_length=1, max_length=8)


class DMCreateRequest(BaseModel):
    content: str = Field(min_length=1, max_length=4000)


class HealthSchema(BaseModel):
    status: str


class RegisterRequest(BaseModel):
    username: str = Field(min_length=3, max_length=32, pattern=r"^[A-Za-z0-9_]+$")
    display_name: str = Field(min_length=1, max_length=32)
    password: str = Field(min_length=6, max_length=64)


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
    pronouns: str | None = Field(default=None, pattern=r"^(man|woman|private)$")
    status: str | None = Field(default=None, pattern=r"^(online|idle|dnd|offline)$")
    avatar_color: str | None = Field(default=None, pattern=r"^av-[1-8]$")
    avatar_url: str | None = Field(default=None, max_length=256)


class PasswordChangeRequest(BaseModel):
    current_password: str = Field(min_length=1, max_length=128)
    new_password: str = Field(min_length=6, max_length=128)


class TelegramNotifyUpdate(BaseModel):
    enabled: bool


# ── Admin schemas ──────────────────────────────────────────────

class AdminUserSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    username: str
    display_name: str
    avatar_color: str
    avatar_url: str | None = None
    status: str
    bio: str | None = None
    created_at: datetime | None = None
    is_admin: bool = False
    is_banned: bool = False
    banned_reason: str | None = None


class AdminServerSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    short_name: str
    color: str
    icon_url: str | None = None
    description: str | None = None
    is_recommended: bool = False
    join_policy: str
    owner_id: int
    created_at: datetime | None = None
    member_count: int = 0
    owner_username: str = ""
    owner_display_name: str = ""
    mods: list[str] = []
    auto_join: bool = False
    join_order: int = 999


class ReportSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    reporter_id: int
    target_type: str
    target_id: int
    content_snapshot: str | None = None
    reason: str
    status: str
    resolution_note: str | None = None
    resolved_by: int | None = None
    resolved_at: datetime | None = None
    created_at: datetime


class AuditLogSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    admin_id: int
    action: str
    target_type: str
    target_id: int
    detail: dict | None = None
    created_at: datetime


class AdminStatsSchema(BaseModel):
    total_users: int
    total_servers: int
    total_channels: int
    total_messages: int
    new_users_today: int
    pending_reports: int


class BanRequest(BaseModel):
    reason: str = Field(min_length=1, max_length=256)


class ResolveReportRequest(BaseModel):
    note: str = Field(default="", max_length=512)


class SetAdminRequest(BaseModel):
    is_admin: bool


class ReportCreateRequest(BaseModel):
    target_type: str = Field(pattern=r"^(message|user|server)$")
    target_id: int
    reason: str = Field(min_length=1, max_length=512)


# ── Bot schemas ────────────────────────────────────────────────────

class BotCreate(BaseModel):
    name: str = Field(min_length=1, max_length=64)
    username: str = Field(min_length=3, max_length=32, pattern=r"^[A-Za-z0-9_]+$")
    password: str = Field(min_length=6, max_length=128)
    display_name: str = Field(min_length=1, max_length=32)
    llm_api_key: str = Field(min_length=1, max_length=256)
    llm_base_url: str = Field(default="https://api.deepseek.com", max_length=256)
    llm_model: str = Field(default="deepseek-chat", max_length=64)
    system_prompt: str = Field(default="你是摸鱼社区的 AI 助手，风格轻松友好，回答简洁，适当使用中文网络用语。")
    channel_ids: list[int] = []


class BotUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=64)
    display_name: str | None = Field(default=None, min_length=1, max_length=32)
    password: str | None = Field(default=None, min_length=6, max_length=128)
    llm_api_key: str | None = Field(default=None, min_length=1, max_length=256)
    llm_base_url: str | None = Field(default=None, max_length=256)
    llm_model: str | None = Field(default=None, max_length=64)
    system_prompt: str | None = None
    channel_ids: list[int] | None = None


class BotOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    username: str
    display_name: str
    avatar_color: str
    llm_base_url: str
    llm_model: str
    system_prompt: str
    channel_ids: list[int]
    is_active: bool
    user_id: int | None = None
    created_at: datetime

    @field_validator("channel_ids", mode="before")
    @classmethod
    def parse_channel_ids(cls, v):
        if isinstance(v, str):
            try:
                return _json.loads(v)
            except Exception:
                return []
        return v or []
