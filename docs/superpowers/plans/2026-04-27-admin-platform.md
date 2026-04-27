# Admin Platform Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a standalone system admin platform (`admin.html` + `admin.jsx`) with full backend API for managing users, servers, channels, reports, invites, and join requests.

**Architecture:** Separate `admin.html` entry point (independent of main app), single `admin.jsx` file with all UI, single `backend/routers/admin.py` with all admin routes under `/api/admin/`. Two new DB tables (`reports`, `audit_logs`) and three new fields on `users`. Fixed forest theme, isolated JWT token.

**Tech Stack:** FastAPI, SQLAlchemy 2.x, Alembic, React 18 + Babel Standalone (no build tools), existing `styles.css`

**Spec:** `docs/superpowers/specs/2026-04-27-admin-platform-design.md`

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Modify | `backend/models.py` | Add `is_admin`, `is_banned`, `banned_reason` to User; add Report, AuditLog models |
| Create | `backend/alembic/versions/e5f6a7b8c9d0_admin_platform.py` | Migration: new fields + new tables |
| Modify | `backend/routers/auth.py` | Add `is_banned` check to login endpoint |
| Modify | `backend/main.py` | Bootstrap `ADMIN_USERNAME` in lifespan; add admin + reports routers to FRONTEND_FILES |
| Create | `backend/routers/reports.py` | `POST /api/reports` — user report submission |
| Create | `backend/routers/admin.py` | All `/api/admin/*` routes |
| Modify | `backend/schemas.py` | Admin-facing Pydantic schemas |
| Create | `admin.html` | Standalone entry point |
| Create | `admin.jsx` | Complete admin UI |

---

## Task 1: Add models for admin fields, Report, AuditLog

**Files:**
- Modify: `backend/models.py`

- [ ] **Step 1: Add three fields to the User model**

In `backend/models.py`, after the `telegram_notify_enabled` line (line 24), add:

```python
    is_admin: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="0")
    is_banned: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="0")
    banned_reason: Mapped[str | None] = mapped_column(String(256), nullable=True, default=None)
```

- [ ] **Step 2: Add JSON type import and Report + AuditLog models**

At the top of `backend/models.py`, add `JSON` to the sqlalchemy imports line:
```python
from sqlalchemy import BigInteger, Boolean, DateTime, ForeignKey, Integer, JSON, String, Text, UniqueConstraint, func
```

Then at the end of `backend/models.py`, append:

```python
class Report(Base):
    __tablename__ = "reports"
    __table_args__ = (
        UniqueConstraint("reporter_id", "target_type", "target_id", "status",
                         name="uq_reports_reporter_target_pending"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    reporter_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    target_type: Mapped[str] = mapped_column(String(16), nullable=False)  # message / user / server
    target_id: Mapped[int] = mapped_column(Integer, nullable=False)
    content_snapshot: Mapped[str | None] = mapped_column(Text, nullable=True)
    reason: Mapped[str] = mapped_column(String(512), nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="pending", server_default="pending")
    resolution_note: Mapped[str | None] = mapped_column(String(512), nullable=True)
    resolved_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())

    reporter: Mapped["User"] = relationship(foreign_keys=[reporter_id])
    resolver: Mapped["User | None"] = relationship(foreign_keys=[resolved_by])


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    admin_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    action: Mapped[str] = mapped_column(String(32), nullable=False)
    target_type: Mapped[str] = mapped_column(String(32), nullable=False)
    target_id: Mapped[int] = mapped_column(Integer, nullable=False)
    detail: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())

    admin: Mapped["User"] = relationship(foreign_keys=[admin_id])
```

- [ ] **Step 3: Verify models load**

```bash
cd backend && python -c "from models import User, Report, AuditLog; print('OK')"
```
Expected: `OK`

- [ ] **Step 4: Commit**

```bash
git add backend/models.py
git commit -m "feat: add admin/ban fields to User, add Report and AuditLog models"
```

---

## Task 2: Create Alembic migration

**Files:**
- Create: `backend/alembic/versions/e5f6a7b8c9d0_admin_platform.py`

- [ ] **Step 1: Create migration file**

Create `backend/alembic/versions/e5f6a7b8c9d0_admin_platform.py`:

```python
"""admin platform: user fields, reports, audit_logs

Revision ID: e5f6a7b8c9d0
Revises: d4e5f6a7b8c9
Create Date: 2026-04-27 00:00:00.000000
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = 'e5f6a7b8c9d0'
down_revision: Union[str, None] = 'd4e5f6a7b8c9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('users', sa.Column('is_admin', sa.Boolean(), nullable=False, server_default='0'))
    op.add_column('users', sa.Column('is_banned', sa.Boolean(), nullable=False, server_default='0'))
    op.add_column('users', sa.Column('banned_reason', sa.String(256), nullable=True))

    op.create_table(
        'reports',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('reporter_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('target_type', sa.String(16), nullable=False),
        sa.Column('target_id', sa.Integer(), nullable=False),
        sa.Column('content_snapshot', sa.Text(), nullable=True),
        sa.Column('reason', sa.String(512), nullable=False),
        sa.Column('status', sa.String(16), nullable=False, server_default='pending'),
        sa.Column('resolution_note', sa.String(512), nullable=True),
        sa.Column('resolved_by', sa.Integer(), sa.ForeignKey('users.id'), nullable=True),
        sa.Column('resolved_at', sa.DateTime(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint('reporter_id', 'target_type', 'target_id', 'status',
                            name='uq_reports_reporter_target_pending'),
    )

    op.create_table(
        'audit_logs',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('admin_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('action', sa.String(32), nullable=False),
        sa.Column('target_type', sa.String(32), nullable=False),
        sa.Column('target_id', sa.Integer(), nullable=False),
        sa.Column('detail', sa.JSON(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )


def downgrade() -> None:
    op.drop_table('audit_logs')
    op.drop_table('reports')
    op.drop_column('users', 'banned_reason')
    op.drop_column('users', 'is_banned')
    op.drop_column('users', 'is_admin')
```

- [ ] **Step 2: Run migration**

```bash
cd backend && source .venv/bin/activate && python -m alembic upgrade head
```
Expected: `Running upgrade d4e5f6a7b8c9 -> e5f6a7b8c9d0, admin platform: user fields, reports, audit_logs`

- [ ] **Step 3: Verify schema**

```bash
cd backend && python -c "
from database import engine
from sqlalchemy import inspect
i = inspect(engine)
print('users:', [c['name'] for c in i.get_columns('users') if c['name'] in ('is_admin','is_banned','banned_reason')])
print('reports:', [c['name'] for c in i.get_columns('reports')])
print('audit_logs:', [c['name'] for c in i.get_columns('audit_logs')])
"
```
Expected: all three field groups printed.

- [ ] **Step 4: Commit**

```bash
git add backend/alembic/versions/e5f6a7b8c9d0_admin_platform.py
git commit -m "feat: alembic migration for admin platform tables and user fields"
```

---

## Task 3: Bootstrap ADMIN_USERNAME + is_banned login check

**Files:**
- Modify: `backend/main.py`
- Modify: `backend/routers/auth.py`

- [ ] **Step 1: Add `is_admin` field to `UserSchema` in `backend/schemas.py`**

The frontend's `/api/users/me` returns `UserSchema`. The admin login check reads `me.is_admin`, so `is_admin` must be exposed. In `backend/schemas.py`, add one line to `UserSchema`:

```python
class UserSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    username: str
    display_name: str
    avatar_color: str
    avatar_url: str | None = None
    status: str
    bio: str | None = None
    created_at: datetime | None = None
    is_admin: bool = False     # ← add this line
```

- [ ] **Step 2: Add ADMIN_USERNAME bootstrap to lifespan in `backend/main.py`**

Replace the lifespan function:

```python
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Per-user bot token model: no server-side webhook or polling needed.
    yield
```

With:

```python
@asynccontextmanager
async def lifespan(app: FastAPI):
    admin_username = os.getenv("ADMIN_USERNAME", "")
    if admin_username:
        from sqlalchemy.orm import Session
        from database import engine as _engine
        with Session(_engine) as _db:
            from sqlalchemy import select as _select
            _user = _db.scalar(_select(User).where(User.username == admin_username))
            if _user is None:
                import logging
                logging.warning(f"ADMIN_USERNAME '{admin_username}' not found in database")
            elif not _user.is_admin:
                _user.is_admin = True
                _db.commit()
    yield
```

- [ ] **Step 3: Add `is_banned` check to login in `backend/routers/auth.py`**

In the `login` function, after the password check line:
```python
    if user is None or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid username or password")
```

Add immediately after:
```python
    if user.is_banned:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=user.banned_reason or "account banned")
```

- [ ] **Step 4: Add `ADMIN_USERNAME` to `.env.example`**

In `backend/.env.example`, append:
```env
# System admin account (auto-promoted to is_admin=True on startup)
ADMIN_USERNAME=
```

- [ ] **Step 5: Restart server and verify bootstrap**

Set `ADMIN_USERNAME=demo1` in `backend/.env`, restart server, then:
```bash
cd backend && python -c "
from database import engine
from sqlalchemy import text
with engine.connect() as c:
    r = c.execute(text(\"SELECT username, is_admin FROM users WHERE username='demo1'\"))
    print(r.fetchone())
"
```
Expected: `('demo1', True)` (or 1 depending on DB driver)

- [ ] **Step 6: Commit**

```bash
git add backend/schemas.py backend/main.py backend/routers/auth.py backend/.env.example
git commit -m "feat: ADMIN_USERNAME bootstrap on startup, is_banned login check, is_admin in UserSchema"
```

---

## Task 4: Add admin Pydantic schemas

**Files:**
- Modify: `backend/schemas.py`

- [ ] **Step 1: Append admin schemas to `backend/schemas.py`**

```python
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
```

- [ ] **Step 2: Verify schemas load**

```bash
cd backend && python -c "from schemas import AdminUserSchema, ReportSchema, AuditLogSchema; print('OK')"
```
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add backend/schemas.py
git commit -m "feat: add admin Pydantic schemas"
```

---

## Task 5: User report submission endpoint

**Files:**
- Create: `backend/routers/reports.py`
- Modify: `backend/main.py`

- [ ] **Step 1: Create `backend/routers/reports.py`**

```python
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from auth import get_current_user
from database import get_db
from models import AuditLog, Channel, Message, Report, Server, User
from schemas import OkResponse, ReportCreateRequest, ReportSchema

router = APIRouter(prefix="/api/reports", tags=["reports"])


def _snapshot(db: Session, target_type: str, target_id: int) -> str | None:
    if target_type == "message":
        msg = db.get(Message, target_id)
        return msg.content[:500] if msg and not msg.is_deleted else None
    if target_type == "user":
        u = db.get(User, target_id)
        return f"{u.username} ({u.display_name})" if u else None
    if target_type == "server":
        s = db.get(Server, target_id)
        return s.name if s else None
    return None


@router.post("", response_model=ReportSchema, status_code=status.HTTP_201_CREATED)
def create_report(
    payload: ReportCreateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # Prevent duplicate pending report from same user on same target
    existing = db.scalar(
        select(Report).where(
            Report.reporter_id == current_user.id,
            Report.target_type == payload.target_type,
            Report.target_id == payload.target_id,
            Report.status == "pending",
        )
    )
    if existing is not None:
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail="already reported")

    snapshot = _snapshot(db, payload.target_type, payload.target_id)
    report = Report(
        reporter_id=current_user.id,
        target_type=payload.target_type,
        target_id=payload.target_id,
        content_snapshot=snapshot,
        reason=payload.reason,
    )
    db.add(report)
    db.commit()
    db.refresh(report)
    return report
```

- [ ] **Step 2: Create `backend/routers/admin.py` placeholder first (required before main.py import)**

```python
from fastapi import APIRouter
router = APIRouter(prefix="/api/admin", tags=["admin"])
```

- [ ] **Step 3: Register reports and admin routers in `backend/main.py`**

Change the imports line from:
```python
from routers import auth, channels, dm, friends, servers, users, websocket
from routers import telegram_bot
```
To:
```python
from routers import auth, channels, dm, friends, reports, servers, users, websocket
from routers import telegram_bot
from routers import admin as admin_router
```

After `app.include_router(telegram_bot.router)` add:
```python
app.include_router(reports.router)
app.include_router(admin_router.router)
```

Also add `"admin.jsx"` to the `FRONTEND_FILES` set.

- [ ] **Step 4: Restart server and verify report endpoint exists**

```bash
curl -s http://localhost:8000/api/health
```
Expected: `{"status":"ok"}`

- [ ] **Step 5: Commit**

```bash
git add backend/routers/reports.py backend/routers/admin.py backend/main.py
git commit -m "feat: user report submission endpoint, register admin router placeholder"
```

---

## Task 6: Admin router — helper + stats + user management

**Files:**
- Modify: `backend/routers/admin.py`

- [ ] **Step 1: Replace placeholder with full admin.py — Part 1 (helper + stats + users)**

Replace `backend/routers/admin.py` with:

```python
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from auth import get_current_user
from database import get_db
from models import (
    AuditLog, Channel, ChannelGroup, Invite, JoinRequest,
    Message, Report, Server, ServerMember, User,
)
from schemas import (
    AdminServerSchema, AdminStatsSchema, AdminUserSchema,
    AuditLogSchema, BanRequest, ChannelSchema, OkResponse, ReportSchema,
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
```

- [ ] **Step 2: Restart server and verify stats endpoint**

First get a token (replace with a valid admin user's credentials):
```bash
TOKEN=$(curl -s -X POST http://localhost:8000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"demo1","password":"demo1234"}' | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])")

curl -s http://localhost:8000/api/admin/stats \
  -H "Authorization: Bearer $TOKEN" | python3 -m json.tool
```
Expected: JSON with `total_users`, `total_servers`, etc.

- [ ] **Step 3: Commit**

```bash
git add backend/routers/admin.py
git commit -m "feat: admin router — stats and user management endpoints"
```

---

## Task 7: Admin router — servers, channels, reports, invites, join-requests, audit-logs

**Files:**
- Modify: `backend/routers/admin.py`

- [ ] **Step 1: Append server management routes to admin.py**

At the end of `backend/routers/admin.py`, append:

```python
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
    d = AdminServerSchema.model_validate(s)
    d.member_count = count
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
    # pending first
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
```

- [ ] **Step 2: Restart server and verify a few endpoints**

```bash
curl -s http://localhost:8000/api/admin/servers \
  -H "Authorization: Bearer $TOKEN" | python3 -m json.tool | head -20
```
Expected: JSON array of server objects.

```bash
curl -s http://localhost:8000/api/admin/reports \
  -H "Authorization: Bearer $TOKEN"
```
Expected: `[]` (empty array, no reports yet).

- [ ] **Step 3: Commit**

```bash
git add backend/routers/admin.py
git commit -m "feat: admin router — servers, channels, reports, invites, join-requests, audit-logs"
```

---

## Task 8: Create admin.html

**Files:**
- Create: `admin.html` (project root)

- [ ] **Step 1: Create `admin.html`**

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>摸鱼社区 · 管理后台</title>
  <link rel="stylesheet" href="styles.css" />
  <script src="https://unpkg.com/react@18/umd/react.development.js" crossorigin></script>
  <script src="https://unpkg.com/react-dom@18/umd/react-dom.development.js" crossorigin></script>
  <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
  <style>
    body { margin: 0; font-family: var(--ff-sans, 'IBM Plex Sans', sans-serif); }
  </style>
</head>
<body>
  <div id="root"></div>
  <script type="text/babel" src="admin.jsx"></script>
</body>
</html>
```

- [ ] **Step 2: Verify admin.html is served**

Open `http://localhost:8000/admin.html` in browser — should load without 404 (blank page with console errors is OK at this stage; `admin.jsx` doesn't exist yet).

- [ ] **Step 3: Commit**

```bash
git add admin.html
git commit -m "feat: admin.html entry point"
```

---

## Task 9: admin.jsx — Login, Shell, Dashboard, Users

**Files:**
- Create: `admin.jsx` (project root)

- [ ] **Step 1: Create `admin.jsx` with login, shell layout, dashboard, and users pages**

Create `admin.jsx` with the following content (this is the main file — replace the placeholder if it exists):

```jsx
// ─── Constants ──────────────────────────────────────────────────
const BASE = '';
const TOKEN_KEY = 'hearth-admin-token';
const REFRESH_KEY = 'hearth-admin-refresh';

// ─── API client ─────────────────────────────────────────────────
const api = {
  _token: () => localStorage.getItem(TOKEN_KEY),
  async _req(method, path, body) {
    const res = await fetch(BASE + path, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(this._token() ? { Authorization: `Bearer ${this._token()}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 401) {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(REFRESH_KEY);
      window.location.reload();
      return;
    }
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(err.detail || res.statusText);
    }
    return res.status === 204 ? null : res.json();
  },
  get: (path) => api._req('GET', path),
  post: (path, body) => api._req('POST', path, body),
  patch: (path, body) => api._req('PATCH', path, body),
  del: (path) => api._req('DELETE', path),
};

// ─── Hooks ──────────────────────────────────────────────────────
function useAsync(fn, deps = []) {
  const [state, setState] = React.useState({ loading: true, data: null, error: null });
  React.useEffect(() => {
    setState({ loading: true, data: null, error: null });
    fn().then(data => setState({ loading: false, data, error: null }))
       .catch(e => setState({ loading: false, data: null, error: e.message }));
  }, deps);
  return state;
}

// ─── Small UI helpers ────────────────────────────────────────────
function Spinner() {
  return <div style={{ padding: 32, textAlign: 'center', color: 'var(--ink-2)' }}>加载中…</div>;
}
function ErrorMsg({ msg }) {
  return <div style={{ padding: 16, color: 'var(--clr-danger, #e06c75)' }}>错误：{msg}</div>;
}
function Badge({ label, color }) {
  return (
    <span style={{
      display: 'inline-block', padding: '2px 8px', borderRadius: 4,
      fontSize: 12, fontWeight: 600,
      background: color || 'var(--paper-2)', color: 'var(--ink-1)',
    }}>{label}</span>
  );
}
function Btn({ onClick, children, danger, small, disabled }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: small ? '4px 10px' : '7px 16px',
        fontSize: small ? 12 : 14,
        borderRadius: 6, border: 'none', cursor: disabled ? 'not-allowed' : 'pointer',
        background: danger ? 'var(--clr-danger, #e06c75)' : 'var(--accent)',
        color: 'var(--accent-ink, #fff)',
        opacity: disabled ? 0.5 : 1,
      }}
    >{children}</button>
  );
}
function Table({ cols, rows, onRowClick }) {
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
      <thead>
        <tr>{cols.map(c => (
          <th key={c.key} style={{ textAlign: 'left', padding: '8px 12px', borderBottom: '1px solid var(--paper-2)', color: 'var(--ink-2)', fontWeight: 600 }}>
            {c.label}
          </th>
        ))}</tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={i}
            onClick={() => onRowClick && onRowClick(row)}
            style={{ cursor: onRowClick ? 'pointer' : 'default', borderBottom: '1px solid var(--paper-2)' }}
            onMouseEnter={e => { if (onRowClick) e.currentTarget.style.background = 'var(--paper-1)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = ''; }}
          >
            {cols.map(c => (
              <td key={c.key} style={{ padding: '10px 12px', verticalAlign: 'middle' }}>
                {c.render ? c.render(row) : row[c.key]}
              </td>
            ))}
          </tr>
        ))}
        {rows.length === 0 && (
          <tr><td colSpan={cols.length} style={{ padding: 24, textAlign: 'center', color: 'var(--ink-2)' }}>暂无数据</td></tr>
        )}
      </tbody>
    </table>
  );
}

// ─── Login ───────────────────────────────────────────────────────
function AdminLogin({ onLogin }) {
  const [username, setUsername] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [error, setError] = React.useState('');
  const [loading, setLoading] = React.useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true); setError('');
    try {
      const res = await api.post('/api/auth/login', { username, password });
      localStorage.setItem(TOKEN_KEY, res.access_token);
      localStorage.setItem(REFRESH_KEY, res.refresh_token);
      // Verify admin
      const me = await api.get('/api/users/me');
      if (!me.is_admin) {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(REFRESH_KEY);
        setError('该账号没有管理员权限');
        return;
      }
      onLogin(me);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--paper-0)' }}>
      <form onSubmit={handleSubmit} style={{ width: 320, background: 'var(--paper-1)', borderRadius: 12, padding: 32, boxShadow: '0 4px 24px rgba(0,0,0,.18)' }}>
        <h2 style={{ margin: '0 0 24px', fontSize: 20, color: 'var(--ink-0)' }}>摸鱼社区 · 管理后台</h2>
        {error && <div style={{ marginBottom: 12, padding: '8px 12px', background: 'var(--paper-2)', borderRadius: 6, color: 'var(--clr-danger, #e06c75)', fontSize: 13 }}>{error}</div>}
        <label style={{ display: 'block', marginBottom: 12 }}>
          <span style={{ fontSize: 12, color: 'var(--ink-2)' }}>用户名</span>
          <input value={username} onChange={e => setUsername(e.target.value)} required
            style={{ display: 'block', width: '100%', marginTop: 4, padding: '8px 10px', borderRadius: 6, border: '1px solid var(--paper-2)', background: 'var(--paper-0)', color: 'var(--ink-0)', fontSize: 14, boxSizing: 'border-box' }} />
        </label>
        <label style={{ display: 'block', marginBottom: 20 }}>
          <span style={{ fontSize: 12, color: 'var(--ink-2)' }}>密码</span>
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} required
            style={{ display: 'block', width: '100%', marginTop: 4, padding: '8px 10px', borderRadius: 6, border: '1px solid var(--paper-2)', background: 'var(--paper-0)', color: 'var(--ink-0)', fontSize: 14, boxSizing: 'border-box' }} />
        </label>
        <Btn disabled={loading}>{loading ? '登录中…' : '登录'}</Btn>
      </form>
    </div>
  );
}

// ─── Sidebar ─────────────────────────────────────────────────────
const NAV = [
  { id: 'dashboard', label: '概览' },
  { id: 'users', label: '用户管理' },
  { id: 'servers', label: '服务器管理' },
  { id: 'reports', label: '举报队列' },
  { id: 'invites', label: '邀请码' },
  { id: 'join-requests', label: '加入申请' },
  { id: 'audit-logs', label: '操作日志' },
];

function AdminSidebar({ page, onNav, onLogout, adminUser }) {
  return (
    <div style={{ width: 200, background: 'var(--paper-1)', display: 'flex', flexDirection: 'column', borderRight: '1px solid var(--paper-2)', flexShrink: 0 }}>
      <div style={{ padding: '20px 16px 12px', borderBottom: '1px solid var(--paper-2)' }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink-0)' }}>管理后台</div>
        <div style={{ fontSize: 12, color: 'var(--ink-2)', marginTop: 2 }}>{adminUser?.display_name}</div>
      </div>
      <nav style={{ flex: 1, padding: '8px 0' }}>
        {NAV.map(n => (
          <div key={n.id} onClick={() => onNav(n.id)}
            style={{
              padding: '8px 16px', cursor: 'pointer', fontSize: 14,
              color: page === n.id ? 'var(--accent)' : 'var(--ink-1)',
              background: page === n.id ? 'var(--paper-2)' : 'transparent',
              borderLeft: page === n.id ? '3px solid var(--accent)' : '3px solid transparent',
            }}
          >{n.label}</div>
        ))}
      </nav>
      <div style={{ padding: 16, borderTop: '1px solid var(--paper-2)' }}>
        <Btn small danger onClick={onLogout}>退出登录</Btn>
      </div>
    </div>
  );
}

// ─── Dashboard ───────────────────────────────────────────────────
function DashboardPage() {
  const { loading, data, error } = useAsync(() => api.get('/api/admin/stats'), []);
  if (loading) return <Spinner />;
  if (error) return <ErrorMsg msg={error} />;
  const cards = [
    { label: '注册用户', value: data.total_users },
    { label: '服务器', value: data.total_servers },
    { label: '频道', value: data.total_channels },
    { label: '消息数', value: data.total_messages },
    { label: '今日新增', value: data.new_users_today },
    { label: '待处理举报', value: data.pending_reports },
  ];
  return (
    <div style={{ padding: 24 }}>
      <h2 style={{ margin: '0 0 20px', fontSize: 18 }}>概览</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 16 }}>
        {cards.map(c => (
          <div key={c.label} style={{ background: 'var(--paper-1)', borderRadius: 10, padding: '20px 16px', border: '1px solid var(--paper-2)' }}>
            <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--accent)' }}>{c.value.toLocaleString()}</div>
            <div style={{ fontSize: 13, color: 'var(--ink-2)', marginTop: 4 }}>{c.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Users ───────────────────────────────────────────────────────
function UsersPage({ onNav }) {
  const [q, setQ] = React.useState('');
  const [search, setSearch] = React.useState('');
  const { loading, data, error } = useAsync(() => api.get(`/api/admin/users?q=${encodeURIComponent(search)}&limit=100`), [search]);

  const cols = [
    { key: 'id', label: 'ID', render: r => <span style={{ color: 'var(--ink-2)', fontSize: 12 }}>{r.id}</span> },
    { key: 'username', label: '用户名' },
    { key: 'display_name', label: '显示名' },
    { key: 'status', label: '状态', render: r => <Badge label={r.status} /> },
    { key: 'is_admin', label: '管理员', render: r => r.is_admin ? <Badge label="管理员" color="var(--accent-soft)" /> : null },
    { key: 'is_banned', label: '封禁', render: r => r.is_banned ? <Badge label="已封禁" color="#e06c7540" /> : null },
    { key: 'created_at', label: '注册时间', render: r => r.created_at ? new Date(r.created_at).toLocaleDateString('zh-CN') : '-' },
  ];

  return (
    <div style={{ padding: 24 }}>
      <h2 style={{ margin: '0 0 16px', fontSize: 18 }}>用户管理</h2>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <input value={q} onChange={e => setQ(e.target.value)}
          placeholder="搜索用户名 / 显示名"
          onKeyDown={e => e.key === 'Enter' && setSearch(q)}
          style={{ flex: 1, padding: '7px 12px', borderRadius: 6, border: '1px solid var(--paper-2)', background: 'var(--paper-0)', color: 'var(--ink-0)', fontSize: 14 }} />
        <Btn onClick={() => setSearch(q)}>搜索</Btn>
      </div>
      {loading ? <Spinner /> : error ? <ErrorMsg msg={error} /> : (
        <Table cols={cols} rows={data || []} onRowClick={r => onNav('user-detail', { userId: r.id })} />
      )}
    </div>
  );
}

function UserDetailPage({ userId, onBack }) {
  const { loading, data: user, error } = useAsync(() => api.get(`/api/admin/users/${userId}`), [userId]);
  const [banReason, setBanReason] = React.useState('');
  const [msg, setMsg] = React.useState('');

  async function doBan() {
    if (!banReason.trim()) return setMsg('请填写封禁原因');
    try { await api.post(`/api/admin/users/${userId}/ban`, { reason: banReason }); setMsg('已封禁'); } catch (e) { setMsg(e.message); }
  }
  async function doUnban() {
    try { await api.post(`/api/admin/users/${userId}/unban`); setMsg('已解封'); } catch (e) { setMsg(e.message); }
  }
  async function toggleAdmin(val) {
    try { await api.patch(`/api/admin/users/${userId}/admin`, { is_admin: val }); setMsg(val ? '已提升为管理员' : '已撤销管理员'); } catch (e) { setMsg(e.message); }
  }

  if (loading) return <Spinner />;
  if (error) return <ErrorMsg msg={error} />;

  return (
    <div style={{ padding: 24 }}>
      <div style={{ marginBottom: 16 }}>
        <Btn small onClick={onBack}>← 返回</Btn>
      </div>
      <h2 style={{ margin: '0 0 20px' }}>{user.display_name} <span style={{ fontSize: 14, color: 'var(--ink-2)' }}>@{user.username}</span></h2>
      {msg && <div style={{ marginBottom: 12, padding: '8px 12px', background: 'var(--paper-2)', borderRadius: 6, fontSize: 13 }}>{msg}</div>}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 24 }}>
        {[['ID', user.id], ['状态', user.status], ['管理员', user.is_admin ? '是' : '否'], ['封禁', user.is_banned ? `是：${user.banned_reason}` : '否'], ['注册时间', user.created_at ? new Date(user.created_at).toLocaleString('zh-CN') : '-']].map(([k, v]) => (
          <div key={k} style={{ background: 'var(--paper-1)', borderRadius: 8, padding: '12px 16px' }}>
            <div style={{ fontSize: 12, color: 'var(--ink-2)' }}>{k}</div>
            <div style={{ fontSize: 14, marginTop: 4 }}>{String(v)}</div>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input value={banReason} onChange={e => setBanReason(e.target.value)} placeholder="封禁原因"
            style={{ flex: 1, padding: '7px 12px', borderRadius: 6, border: '1px solid var(--paper-2)', background: 'var(--paper-0)', color: 'var(--ink-0)', fontSize: 14 }} />
          <Btn danger onClick={doBan}>封禁</Btn>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Btn onClick={doUnban}>解封</Btn>
          <Btn onClick={() => toggleAdmin(!user.is_admin)}>{user.is_admin ? '撤销管理员' : '提升为管理员'}</Btn>
        </div>
      </div>
    </div>
  );
}

// ─── Placeholder pages (filled in next task) ─────────────────────
function ServersPage({ onNav }) { return <div style={{ padding: 24 }}><Spinner /></div>; }
function ServerDetailPage({ serverId, onBack }) { return <div style={{ padding: 24 }}><Spinner /></div>; }
function ReportsPage({ onNav }) { return <div style={{ padding: 24 }}><Spinner /></div>; }
function ReportDetailPage({ reportId, onBack }) { return <div style={{ padding: 24 }}><Spinner /></div>; }
function InvitesPage() { return <div style={{ padding: 24 }}><Spinner /></div>; }
function JoinRequestsPage() { return <div style={{ padding: 24 }}><Spinner /></div>; }
function AuditLogPage() { return <div style={{ padding: 24 }}><Spinner /></div>; }

// ─── Shell ───────────────────────────────────────────────────────
function AdminShell({ adminUser }) {
  const [nav, setNav] = React.useState({ page: 'dashboard', params: {} });

  function goTo(page, params = {}) { setNav({ page, params }); }

  function renderPage() {
    const { page, params } = nav;
    switch (page) {
      case 'dashboard': return <DashboardPage />;
      case 'users': return <UsersPage onNav={goTo} />;
      case 'user-detail': return <UserDetailPage userId={params.userId} onBack={() => goTo('users')} />;
      case 'servers': return <ServersPage onNav={goTo} />;
      case 'server-detail': return <ServerDetailPage serverId={params.serverId} onBack={() => goTo('servers')} />;
      case 'reports': return <ReportsPage onNav={goTo} />;
      case 'report-detail': return <ReportDetailPage reportId={params.reportId} onBack={() => goTo('reports')} />;
      case 'invites': return <InvitesPage />;
      case 'join-requests': return <JoinRequestsPage />;
      case 'audit-logs': return <AuditLogPage />;
      default: return <DashboardPage />;
    }
  }

  function logout() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(REFRESH_KEY);
    window.location.reload();
  }

  return (
    <div style={{ display: 'flex', height: '100vh', background: 'var(--paper-0)', color: 'var(--ink-0)' }}>
      <AdminSidebar page={nav.page} onNav={goTo} onLogout={logout} adminUser={adminUser} />
      <main style={{ flex: 1, overflow: 'auto' }}>{renderPage()}</main>
    </div>
  );
}

// ─── Root ────────────────────────────────────────────────────────
function AdminApp() {
  const [adminUser, setAdminUser] = React.useState(null);
  const [checking, setChecking] = React.useState(true);

  React.useEffect(() => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) { setChecking(false); return; }
    api.get('/api/users/me')
      .then(me => {
        if (me?.is_admin) setAdminUser(me);
        else { localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(REFRESH_KEY); }
      })
      .catch(() => { localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(REFRESH_KEY); })
      .finally(() => setChecking(false));
  }, []);

  if (checking) return <div className="app theme-forest density-default" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: 'var(--paper-0)' }}><Spinner /></div>;

  return (
    <div className="app theme-forest density-default">
      {adminUser ? <AdminShell adminUser={adminUser} /> : <AdminLogin onLogin={setAdminUser} />}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<AdminApp />);
```

- [ ] **Step 2: Open `http://localhost:8000/admin.html` in browser**

Should show login form with forest theme. Log in with the admin user credentials. Should land on dashboard showing stats cards.

- [ ] **Step 3: Test user management**

Click "用户管理", verify user list loads. Click a user row, verify detail page with ban/unban/admin controls.

- [ ] **Step 4: Commit**

```bash
git add admin.jsx
git commit -m "feat: admin.jsx — login, shell, dashboard, users pages"
```

---

## Task 10: admin.jsx — Servers, Reports, Invites, Join Requests, Audit Log pages

**Files:**
- Modify: `admin.jsx`

- [ ] **Step 1: Replace ServersPage placeholder in admin.jsx**

Find `function ServersPage({ onNav }) { return <div style={{ padding: 24 }}><Spinner /></div>; }` and replace with:

```jsx
function ServersPage({ onNav }) {
  const [q, setQ] = React.useState('');
  const [search, setSearch] = React.useState('');
  const { loading, data, error } = useAsync(() => api.get(`/api/admin/servers?q=${encodeURIComponent(search)}&limit=100`), [search]);

  const cols = [
    { key: 'id', label: 'ID', render: r => <span style={{ color: 'var(--ink-2)', fontSize: 12 }}>{r.id}</span> },
    { key: 'name', label: '名称' },
    { key: 'member_count', label: '成员数' },
    { key: 'join_policy', label: '加入策略', render: r => <Badge label={r.join_policy} /> },
    { key: 'is_recommended', label: '推荐', render: r => r.is_recommended ? <Badge label="推荐" color="var(--accent-soft)" /> : null },
    { key: 'created_at', label: '创建时间', render: r => r.created_at ? new Date(r.created_at).toLocaleDateString('zh-CN') : '-' },
  ];

  return (
    <div style={{ padding: 24 }}>
      <h2 style={{ margin: '0 0 16px', fontSize: 18 }}>服务器管理</h2>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="搜索服务器名"
          onKeyDown={e => e.key === 'Enter' && setSearch(q)}
          style={{ flex: 1, padding: '7px 12px', borderRadius: 6, border: '1px solid var(--paper-2)', background: 'var(--paper-0)', color: 'var(--ink-0)', fontSize: 14 }} />
        <Btn onClick={() => setSearch(q)}>搜索</Btn>
      </div>
      {loading ? <Spinner /> : error ? <ErrorMsg msg={error} /> : (
        <Table cols={cols} rows={data || []} onRowClick={r => onNav('server-detail', { serverId: r.id })} />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Replace ServerDetailPage placeholder**

```jsx
function ServerDetailPage({ serverId, onBack }) {
  const { loading, data: server, error } = useAsync(() => api.get(`/api/admin/servers/${serverId}`), [serverId]);
  const { data: channels } = useAsync(() => api.get(`/api/admin/servers/${serverId}/channels`), [serverId]);
  const [msg, setMsg] = React.useState('');

  async function doDelete() {
    if (!confirm('确认强制删除该服务器？此操作不可撤销。')) return;
    try { await api.del(`/api/admin/servers/${serverId}`); setMsg('已删除'); } catch (e) { setMsg(e.message); }
  }
  async function doToggleRecommended() {
    try { await api.patch(`/api/admin/servers/${serverId}/recommended`); setMsg('推荐状态已切换'); } catch (e) { setMsg(e.message); }
  }
  async function doDeleteChannel(chId, chName) {
    if (!confirm(`删除频道「${chName}」？`)) return;
    try { await api.del(`/api/admin/channels/${chId}`); setMsg(`频道「${chName}」已删除`); } catch (e) { setMsg(e.message); }
  }

  if (loading) return <Spinner />;
  if (error) return <ErrorMsg msg={error} />;

  return (
    <div style={{ padding: 24 }}>
      <div style={{ marginBottom: 16 }}><Btn small onClick={onBack}>← 返回</Btn></div>
      <h2 style={{ margin: '0 0 20px' }}>{server.name}</h2>
      {msg && <div style={{ marginBottom: 12, padding: '8px 12px', background: 'var(--paper-2)', borderRadius: 6, fontSize: 13 }}>{msg}</div>}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
        {[['成员数', server.member_count], ['加入策略', server.join_policy], ['推荐', server.is_recommended ? '是' : '否'], ['创建时间', server.created_at ? new Date(server.created_at).toLocaleString('zh-CN') : '-']].map(([k, v]) => (
          <div key={k} style={{ background: 'var(--paper-1)', borderRadius: 8, padding: '12px 16px' }}>
            <div style={{ fontSize: 12, color: 'var(--ink-2)' }}>{k}</div>
            <div style={{ fontSize: 14, marginTop: 4 }}>{String(v)}</div>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
        <Btn onClick={doToggleRecommended}>切换推荐状态</Btn>
        <Btn danger onClick={doDelete}>强制删除服务器</Btn>
      </div>
      <h3 style={{ margin: '0 0 12px', fontSize: 15 }}>频道列表</h3>
      <Table
        cols={[
          { key: 'name', label: '频道名' },
          { key: 'kind', label: '类型', render: r => <Badge label={r.kind} /> },
          { key: 'actions', label: '', render: r => <Btn small danger onClick={e => { e.stopPropagation(); doDeleteChannel(r.id, r.name); }}>删除</Btn> },
        ]}
        rows={channels || []}
      />
    </div>
  );
}
```

- [ ] **Step 3: Replace ReportsPage and ReportDetailPage placeholders**

```jsx
function ReportsPage({ onNav }) {
  const [statusFilter, setStatusFilter] = React.useState('pending');
  const { loading, data, error } = useAsync(
    () => api.get(`/api/admin/reports?status_filter=${statusFilter}&limit=100`),
    [statusFilter]
  );
  const cols = [
    { key: 'id', label: 'ID' },
    { key: 'target_type', label: '类型', render: r => <Badge label={r.target_type} /> },
    { key: 'reason', label: '原因', render: r => <span style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>{r.reason}</span> },
    { key: 'status', label: '状态', render: r => <Badge label={r.status} color={r.status === 'pending' ? 'var(--accent-soft)' : undefined} /> },
    { key: 'created_at', label: '时间', render: r => new Date(r.created_at).toLocaleDateString('zh-CN') },
  ];
  return (
    <div style={{ padding: 24 }}>
      <h2 style={{ margin: '0 0 16px', fontSize: 18 }}>举报队列</h2>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {['pending', 'resolved', 'dismissed', ''].map(s => (
          <Btn key={s} small onClick={() => setStatusFilter(s)}>{s || '全部'}</Btn>
        ))}
      </div>
      {loading ? <Spinner /> : error ? <ErrorMsg msg={error} /> : (
        <Table cols={cols} rows={data || []} onRowClick={r => onNav('report-detail', { reportId: r.id })} />
      )}
    </div>
  );
}

function ReportDetailPage({ reportId, onBack }) {
  const { loading, data: report, error } = useAsync(() => api.get(`/api/admin/reports/${reportId}`), [reportId]);
  const [note, setNote] = React.useState('');
  const [msg, setMsg] = React.useState('');

  async function doAction(action) {
    try {
      await api.post(`/api/admin/reports/${reportId}/${action}`, { note });
      setMsg(action === 'resolve' ? '已处理' : '已驳回');
    } catch (e) { setMsg(e.message); }
  }

  if (loading) return <Spinner />;
  if (error) return <ErrorMsg msg={error} />;

  return (
    <div style={{ padding: 24 }}>
      <div style={{ marginBottom: 16 }}><Btn small onClick={onBack}>← 返回</Btn></div>
      <h2 style={{ margin: '0 0 20px' }}>举报详情 #{report.id}</h2>
      {msg && <div style={{ marginBottom: 12, padding: '8px 12px', background: 'var(--paper-2)', borderRadius: 6, fontSize: 13 }}>{msg}</div>}
      <div style={{ display: 'grid', gap: 12, marginBottom: 20 }}>
        {[['举报类型', report.target_type], ['目标 ID', report.target_id], ['状态', report.status], ['原因', report.reason]].map(([k, v]) => (
          <div key={k} style={{ background: 'var(--paper-1)', borderRadius: 8, padding: '12px 16px' }}>
            <div style={{ fontSize: 12, color: 'var(--ink-2)' }}>{k}</div>
            <div style={{ fontSize: 14, marginTop: 4 }}>{String(v)}</div>
          </div>
        ))}
        {report.content_snapshot && (
          <div style={{ background: 'var(--paper-1)', borderRadius: 8, padding: '12px 16px' }}>
            <div style={{ fontSize: 12, color: 'var(--ink-2)' }}>内容快照</div>
            <div style={{ fontSize: 14, marginTop: 4, fontStyle: 'italic' }}>{report.content_snapshot}</div>
          </div>
        )}
      </div>
      {report.status === 'pending' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <input value={note} onChange={e => setNote(e.target.value)} placeholder="处理备注（可选）"
            style={{ padding: '7px 12px', borderRadius: 6, border: '1px solid var(--paper-2)', background: 'var(--paper-0)', color: 'var(--ink-0)', fontSize: 14 }} />
          <div style={{ display: 'flex', gap: 8 }}>
            <Btn onClick={() => doAction('resolve')}>标记已处理</Btn>
            <Btn danger onClick={() => doAction('dismiss')}>驳回举报</Btn>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Replace InvitesPage, JoinRequestsPage, AuditLogPage placeholders**

```jsx
function InvitesPage() {
  const [serverId, setServerId] = React.useState('');
  const [search, setSearch] = React.useState('');
  const [msg, setMsg] = React.useState('');
  const url = `/api/admin/invites?limit=100${search ? `&server_id=${search}` : ''}`;
  const { loading, data, error } = useAsync(() => api.get(url), [search]);

  async function doRevoke(code) {
    if (!confirm(`撤销邀请码 ${code}？`)) return;
    try { await api.del(`/api/admin/invites/${code}`); setMsg(`已撤销 ${code}`); } catch (e) { setMsg(e.message); }
  }

  const cols = [
    { key: 'code', label: '邀请码' },
    { key: 'server_id', label: '服务器 ID' },
    { key: 'uses', label: '已用次数' },
    { key: 'max_uses', label: '上限', render: r => r.max_uses ?? '无限' },
    { key: 'expires_at', label: '过期时间', render: r => r.expires_at ? new Date(r.expires_at).toLocaleDateString('zh-CN') : '永不' },
    { key: 'actions', label: '', render: r => <Btn small danger onClick={e => { e.stopPropagation(); doRevoke(r.code); }}>撤销</Btn> },
  ];

  return (
    <div style={{ padding: 24 }}>
      <h2 style={{ margin: '0 0 16px', fontSize: 18 }}>邀请码管理</h2>
      {msg && <div style={{ marginBottom: 12, padding: '8px 12px', background: 'var(--paper-2)', borderRadius: 6, fontSize: 13 }}>{msg}</div>}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <input value={serverId} onChange={e => setServerId(e.target.value)} placeholder="按服务器 ID 筛选（留空显示全部）"
          onKeyDown={e => e.key === 'Enter' && setSearch(serverId)}
          style={{ flex: 1, padding: '7px 12px', borderRadius: 6, border: '1px solid var(--paper-2)', background: 'var(--paper-0)', color: 'var(--ink-0)', fontSize: 14 }} />
        <Btn onClick={() => setSearch(serverId)}>筛选</Btn>
      </div>
      {loading ? <Spinner /> : error ? <ErrorMsg msg={error} /> : (
        <Table cols={cols} rows={data || []} />
      )}
    </div>
  );
}

function JoinRequestsPage() {
  const [serverId, setServerId] = React.useState('');
  const [search, setSearch] = React.useState('');
  const url = `/api/admin/join-requests?limit=100${search ? `&server_id=${search}` : ''}`;
  const { loading, data, error } = useAsync(() => api.get(url), [search]);

  const cols = [
    { key: 'id', label: 'ID' },
    { key: 'server_id', label: '服务器 ID' },
    { key: 'user_id', label: '用户 ID' },
    { key: 'status', label: '状态', render: r => <Badge label={r.status} /> },
    { key: 'note', label: '申请理由', render: r => r.note || '-' },
    { key: 'created_at', label: '时间', render: r => new Date(r.created_at).toLocaleDateString('zh-CN') },
  ];

  return (
    <div style={{ padding: 24 }}>
      <h2 style={{ margin: '0 0 16px', fontSize: 18 }}>加入申请</h2>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <input value={serverId} onChange={e => setServerId(e.target.value)} placeholder="按服务器 ID 筛选"
          onKeyDown={e => e.key === 'Enter' && setSearch(serverId)}
          style={{ flex: 1, padding: '7px 12px', borderRadius: 6, border: '1px solid var(--paper-2)', background: 'var(--paper-0)', color: 'var(--ink-0)', fontSize: 14 }} />
        <Btn onClick={() => setSearch(serverId)}>筛选</Btn>
      </div>
      {loading ? <Spinner /> : error ? <ErrorMsg msg={error} /> : (
        <Table cols={cols} rows={data || []} />
      )}
    </div>
  );
}

function AuditLogPage() {
  const [action, setAction] = React.useState('');
  const [search, setSearch] = React.useState('');
  const url = `/api/admin/audit-logs?limit=100${search ? `&action=${search}` : ''}`;
  const { loading, data, error } = useAsync(() => api.get(url), [search]);

  const ACTIONS = ['ban_user','unban_user','grant_admin','revoke_admin','delete_server','toggle_recommended','delete_channel','delete_channel_group','resolve_report','dismiss_report','revoke_invite'];

  const cols = [
    { key: 'id', label: 'ID' },
    { key: 'admin_id', label: '管理员 ID' },
    { key: 'action', label: '操作', render: r => <Badge label={r.action} /> },
    { key: 'target_type', label: '对象类型' },
    { key: 'target_id', label: '对象 ID' },
    { key: 'created_at', label: '时间', render: r => new Date(r.created_at).toLocaleString('zh-CN') },
  ];

  return (
    <div style={{ padding: 24 }}>
      <h2 style={{ margin: '0 0 16px', fontSize: 18 }}>操作日志</h2>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <select value={action} onChange={e => { setAction(e.target.value); setSearch(e.target.value); }}
          style={{ padding: '7px 12px', borderRadius: 6, border: '1px solid var(--paper-2)', background: 'var(--paper-0)', color: 'var(--ink-0)', fontSize: 14 }}>
          <option value="">全部操作</option>
          {ACTIONS.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
      </div>
      {loading ? <Spinner /> : error ? <ErrorMsg msg={error} /> : (
        <Table cols={cols} rows={data || []} />
      )}
    </div>
  );
}
```

- [ ] **Step 5: Full browser test**

Open `http://localhost:8000/admin.html`. Test all 7 nav sections:
- Dashboard: cards show real numbers
- Users: list loads, click row → detail, test ban/unban with a non-admin test account
- Servers: list loads, click row → detail, verify channel list
- Reports: shows empty list (no reports yet), filter buttons work
- Invites: list loads, revoke button visible
- Join Requests: list loads
- Audit Logs: after doing ban/unban above, logs appear here

- [ ] **Step 6: Commit**

```bash
git add admin.jsx
git commit -m "feat: admin.jsx — servers, reports, invites, join-requests, audit-log pages complete"
```

---

## Task 11: Final wiring + serve admin.jsx from backend

**Files:**
- Modify: `backend/main.py`

- [ ] **Step 1: Add admin.html and admin.jsx to served files**

In `backend/main.py`, find the `FRONTEND_FILES` set and add `"admin.jsx"`. Then:

After the `FRONTEND_ENTRY` definition add:
```python
ADMIN_ENTRY = PROJECT_ROOT / "admin.html"
```

**IMPORTANT:** Add the `/admin.html` route **BEFORE** the existing `@app.get("/{filename}")` wildcard route. FastAPI matches routes in registration order — if `/{filename}` is registered first it will catch `/admin.html` and return 404.

```python
@app.get("/admin.html")
def serve_admin_html():
    return no_store_file(ADMIN_ENTRY)

# ... existing @app.get("/{filename}") route stays AFTER this
```

- [ ] **Step 2: Restart and final smoke test**

```bash
curl -s http://localhost:8000/api/health
```
Expected: `{"status":"ok"}`

Open `http://localhost:8000/admin.html` — full admin platform works end-to-end.

- [ ] **Step 3: Push to remote**

```bash
git push origin main
```

- [ ] **Step 4: Deploy on server**

```bash
cd /opt/biscord/current
git remote set-url origin https://github.com/shixiong0529/moyu.git  # if not already done
git pull origin main
cd /opt/biscord/current/backend
source .venv/bin/activate
python -m alembic upgrade head
sudo systemctl restart biscord
sudo systemctl status biscord --no-pager
curl https://shi.show/api/health
```

---

## Summary

| Task | Files | Outcome |
|------|-------|---------|
| 1 | `models.py` | User + Report + AuditLog models |
| 2 | `alembic/versions/e5f6…` | Schema applied to DB |
| 3 | `main.py`, `routers/auth.py` | Admin bootstrap + ban login check |
| 4 | `schemas.py` | All admin Pydantic schemas |
| 5 | `routers/reports.py`, `main.py` | User report submission |
| 6 | `routers/admin.py` (part 1) | Stats + user management API |
| 7 | `routers/admin.py` (part 2) | Servers/channels/reports/invites/join-requests/audit-logs API |
| 8 | `admin.html` | Entry point |
| 9 | `admin.jsx` (part 1) | Login + shell + dashboard + users |
| 10 | `admin.jsx` (part 2) | All remaining pages |
| 11 | `main.py` | Route wiring + deploy |
