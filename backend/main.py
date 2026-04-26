from contextlib import asynccontextmanager
from pathlib import Path
import os
import uuid

from fastapi import Depends, FastAPI, File, HTTPException, UploadFile, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import inspect, text

from auth import get_current_user
from database import engine
from models import FriendRequest, Friendship, JoinRequest, User
from routers import auth, channels, dm, friends, servers, users, websocket
from routers import telegram_bot
import telegram_service


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Per-user bot token model: no server-side webhook or polling needed.
    yield


app = FastAPI(title="Biscord API", version="0.1.0", lifespan=lifespan)
PROJECT_ROOT = Path(__file__).resolve().parent.parent
BACKEND_ROOT = Path(__file__).resolve().parent
UPLOAD_DIR = BACKEND_ROOT / "uploads"
UPLOAD_DIR.mkdir(exist_ok=True)
FRONTEND_ENTRY = PROJECT_ROOT / "Hearth Community.html"
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
        if "join_policy" not in server_columns:
            connection.execute(text("ALTER TABLE servers ADD COLUMN join_policy VARCHAR(16) NOT NULL DEFAULT 'approval'"))
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
            text("UPDATE servers SET is_recommended = :is_recommended, description = :description WHERE name = '管理员服务器'"),
            {"description": "系统默认服务器，用于公告、审核和管理通知。", "is_recommended": False},
        )


def no_store_file(path: Path) -> FileResponse:
    response = FileResponse(path)
    response.headers["Cache-Control"] = "no-store"
    return response

app.add_middleware(
    CORSMiddleware,
    allow_origins=["null", "http://localhost", "http://127.0.0.1"],
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

    filename = f"{uuid.uuid4().hex}{suffix}"
    target = UPLOAD_DIR / filename
    content = await file.read()
    if len(content) > 5 * 1024 * 1024:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="file is too large")
    target.write_bytes(content)
    return {"url": f"/uploads/{filename}"}


@app.get("/", include_in_schema=False)
def serve_frontend_root():
    return no_store_file(FRONTEND_ENTRY)


@app.get("/Hearth Community.html", include_in_schema=False)
def serve_frontend_entry():
    return no_store_file(FRONTEND_ENTRY)


@app.get("/{filename}", include_in_schema=False)
def serve_frontend_asset(filename: str):
    if filename not in FRONTEND_FILES:
        return {"detail": "Not Found"}
    return no_store_file(PROJECT_ROOT / filename)
