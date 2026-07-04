from contextlib import asynccontextmanager
from pathlib import Path
import asyncio
import os
import uuid

from fastapi import Depends, FastAPI, File, HTTPException, Request, UploadFile, status
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import inspect, text

from auth import get_current_user
from database import engine
from models import Bot, FriendRequest, Friendship, JoinRequest, User
from routers import auth, channels, dm, friends, reports, servers, users, websocket
from routers import telegram_bot
from routers import admin as admin_router
import telegram_service


@asynccontextmanager
async def lifespan(app: FastAPI):
    admin_username = os.getenv("ADMIN_USERNAME", "")
    if admin_username:
        from sqlalchemy.orm import Session as _Session
        with _Session(engine) as _db:
            from sqlalchemy import select as _select
            _user = _db.scalar(_select(User).where(User.username == admin_username))
            if _user is None:
                import logging
                logging.warning(f"ADMIN_USERNAME '{admin_username}' not found in database")
            elif not _user.is_admin:
                _user.is_admin = True
                _db.commit()

    # Restore active bots
    from bot_runner import running_bots, BotRunner
    from sqlalchemy.orm import Session as _Session
    from sqlalchemy import select as _select
    api_base = os.getenv("API_BASE", "http://localhost:8000")
    with _Session(engine) as _db:
        active_bots = _db.scalars(_select(Bot).where(Bot.is_active == True)).all()
        for bot_obj in active_bots:
            admin_router._ensure_bot_server_memberships(bot_obj, _db)
            runner = BotRunner(bot_obj, api_base)
            running_bots[bot_obj.id] = runner
            runner.start()
        _db.commit()

    yield

    from bot_runner import running_bots
    for runner in list(running_bots.values()):
        await runner.stop()
    running_bots.clear()
    # 取消所有以 bot_ 开头的孤儿任务（--reload 模块重载后残留的）
    orphans = [t for t in asyncio.all_tasks() if t.get_name().startswith("bot_")]
    for t in orphans:
        t.cancel()
    if orphans:
        await asyncio.gather(*orphans, return_exceptions=True)


app = FastAPI(title="Biscord API", version="0.1.0", lifespan=lifespan)


def _translate_error(err: dict) -> str:
    etype = err.get("type", "")
    loc = err.get("loc", [])
    ctx = err.get("ctx", {})
    field = str(loc[-1]) if loc else ""

    FIELD_NAMES = {
        "username": "用户名", "display_name": "显示名", "password": "密码",
        "name": "名称", "content": "内容", "reason": "原因",
        "email": "邮箱", "short_name": "简称",
    }
    field_cn = FIELD_NAMES.get(field, field)

    if etype == "missing":
        return f"{field_cn}不能为空"
    if etype == "string_too_short":
        mn = ctx.get("min_length", "")
        if field == "password":
            return f"密码至少需要 {mn} 位"
        return f"{field_cn}至少需要 {mn} 个字符"
    if etype == "string_too_long":
        mx = ctx.get("max_length", "")
        if field == "password":
            return f"密码不能超过 {mx} 位"
        return f"{field_cn}不能超过 {mx} 个字符"
    if etype == "string_pattern_mismatch":
        if field == "username":
            return "用户名只能包含英文字母、数字和下划线"
        return f"{field_cn}格式不正确"
    if etype == "value_error":
        return err.get("msg", "输入格式有误").removeprefix("Value error, ")
    if etype in ("int_parsing", "float_parsing"):
        return f"{field_cn}必须是数字"
    if etype == "bool_parsing":
        return f"{field_cn}必须是 true 或 false"
    return err.get("msg", "输入格式有误")


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    errors = [_translate_error(e) for e in exc.errors()]
    detail = "；".join(errors) if errors else "请求参数有误"
    return JSONResponse(status_code=422, content={"detail": detail})
PROJECT_ROOT = Path(__file__).resolve().parent.parent
BACKEND_ROOT = Path(__file__).resolve().parent
UPLOAD_DIR = BACKEND_ROOT / "uploads"
UPLOAD_DIR.mkdir(exist_ok=True)
FRONTEND_ENTRY = PROJECT_ROOT / "Hearth Community.html"
ADMIN_ENTRY = PROJECT_ROOT / "admin.html"
FRONTEND_FILES = {
    "styles.css",
    "icons.jsx",
    "data.jsx",
    "sidebars.jsx",
    "chat.jsx",
    "modals.jsx",
    "extra.jsx",
    "api.jsx",
    "auth.jsx",
    "app.jsx",
    "browser-window.jsx",
    "admin.jsx",
}


def ensure_schema_compatibility() -> None:
    inspector = inspect(engine)
    with engine.begin() as connection:
        server_columns = {column["name"] for column in inspector.get_columns("servers")} if inspector.has_table("servers") else set()
        if "icon_url" not in server_columns:
            connection.execute(text("ALTER TABLE servers ADD COLUMN icon_url VARCHAR(256)"))
        if "description" not in server_columns:
            connection.execute(text("ALTER TABLE servers ADD COLUMN description VARCHAR(256)"))
        if "is_recommended" not in server_columns:
            connection.execute(text("ALTER TABLE servers ADD COLUMN is_recommended BOOLEAN NOT NULL DEFAULT false"))
        if "is_admin_server" not in server_columns:
            connection.execute(text("ALTER TABLE servers ADD COLUMN is_admin_server BOOLEAN NOT NULL DEFAULT false"))
            connection.execute(
                text("UPDATE servers SET is_admin_server = :flag WHERE name = '管理员服务器'"),
                {"flag": True},
            )
        if "join_policy" not in server_columns:
            connection.execute(text("ALTER TABLE servers ADD COLUMN join_policy VARCHAR(16) NOT NULL DEFAULT 'approval'"))
        if "auto_join" not in server_columns:
            connection.execute(text("ALTER TABLE servers ADD COLUMN auto_join BOOLEAN NOT NULL DEFAULT false"))
        if "join_order" not in server_columns:
            connection.execute(text("ALTER TABLE servers ADD COLUMN join_order INTEGER NOT NULL DEFAULT 999"))
        member_columns = {column["name"] for column in inspector.get_columns("server_members")} if inspector.has_table("server_members") else set()
        if "position" not in member_columns:
            connection.execute(text("ALTER TABLE server_members ADD COLUMN position INTEGER NOT NULL DEFAULT 999"))
        user_columns = {column["name"] for column in inspector.get_columns("users")} if inspector.has_table("users") else set()
        if "avatar_url" not in user_columns:
            connection.execute(text("ALTER TABLE users ADD COLUMN avatar_url VARCHAR(256)"))
        if "pronouns" not in user_columns:
            connection.execute(text("ALTER TABLE users ADD COLUMN pronouns VARCHAR(16) NOT NULL DEFAULT 'private'"))
        for table in (JoinRequest.__table__, FriendRequest.__table__, Friendship.__table__):
            table.create(bind=connection, checkfirst=True)
        recommended = {
            "山茶茶馆": "适合闲聊、茶饮、生活记录的温柔小厅。",
            "午夜读书会": "每周共读一本书，慢慢讨论，欢迎认真潜水。",
            "植物志同好": "植物辨认、养护经验和周末观察路线。",
            "胶片放映室": "电影、影评、放映计划和胶片美学。",
        }
        for name, description in recommended.items():
            connection.execute(
                text("UPDATE servers SET is_recommended = :is_recommended, description = :description WHERE name = :name"),
                {"name": name, "description": description, "is_recommended": True},
            )
        connection.execute(
            text("UPDATE servers SET is_recommended = :is_recommended, description = :description WHERE is_admin_server = :flag"),
            {"description": "系统默认服务器，用于公告、审核和管理通知。", "is_recommended": False, "flag": True},
        )


def no_store_file(path: Path) -> FileResponse:
    response = FileResponse(path)
    response.headers["Cache-Control"] = "no-store"
    return response

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost", "http://127.0.0.1",
                   *([o.strip() for o in os.getenv("CORS_ORIGINS", "").split(",") if o.strip()])],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


app.include_router(auth.router)
app.include_router(users.router)
app.include_router(servers.router)
app.include_router(channels.router)
app.include_router(dm.router)
app.include_router(friends.router)
app.include_router(websocket.router)
app.include_router(telegram_bot.router)
app.include_router(reports.router)
app.include_router(admin_router.router)
app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")
DOCS_DIR = PROJECT_ROOT / "docs"
DOCS_DIR.mkdir(exist_ok=True)
app.mount("/docs", StaticFiles(directory=DOCS_DIR), name="docs")
ensure_schema_compatibility()


@app.post("/api/upload")
async def upload_image(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
) -> dict[str, str]:
    allowed_exts = {".jpg", ".jpeg", ".png", ".gif", ".webp"}
    suffix = Path(file.filename or "").suffix.lower()
    if suffix not in allowed_exts or not (file.content_type or "").startswith("image/"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="only image files are allowed")

    # 最多读取 5MB + 1 字节：既能判断超限，又避免把超大文件整体读入内存
    max_bytes = 5 * 1024 * 1024
    content = await file.read(max_bytes + 1)
    if len(content) > max_bytes:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="file is too large")

    # magic-byte 校验：客户端提供的扩展名/content-type 可伪造，按真实字节确认是图片
    def _is_image(data: bytes) -> bool:
        return (
            data.startswith(b"\xff\xd8\xff")                       # jpeg
            or data.startswith(b"\x89PNG\r\n\x1a\n")               # png
            or data[:6] in (b"GIF87a", b"GIF89a")                  # gif
            or (data[:4] == b"RIFF" and data[8:12] == b"WEBP")     # webp
        )

    if not _is_image(content):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="only image files are allowed")

    filename = f"{uuid.uuid4().hex}{suffix}"
    target = UPLOAD_DIR / filename
    target.write_bytes(content)
    return {"url": f"/uploads/{filename}"}


@app.get("/", include_in_schema=False)
def serve_frontend_root():
    return no_store_file(FRONTEND_ENTRY)


@app.get("/Hearth Community.html", include_in_schema=False)
def serve_frontend_entry():
    return no_store_file(FRONTEND_ENTRY)


@app.get("/admin.html", include_in_schema=False)
def serve_admin_html():
    return no_store_file(ADMIN_ENTRY)


@app.get("/{filename}", include_in_schema=False)
def serve_frontend_asset(filename: str):
    if filename not in FRONTEND_FILES:
        return {"detail": "Not Found"}
    return no_store_file(PROJECT_ROOT / filename)
