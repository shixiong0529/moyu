"""
Telegram notification service — per-user bot token model.

Each user stores their own bot token + chat_id.
Biscord uses those credentials to send notifications directly to that user.
No server-side polling or webhook needed.
"""
from __future__ import annotations

import httpx

from database import SessionLocal
from models import User

_TG_API = "https://api.telegram.org/bot{token}/sendMessage"


async def _send(bot_token: str, chat_id: int, text: str) -> dict:
    """
    Send a Telegram message. Returns the parsed JSON response from Telegram.
    Raises httpx.HTTPError or ValueError on failure.
    """
    async with httpx.AsyncClient(timeout=8.0) as client:
        resp = await client.post(
            f"https://api.telegram.org/bot{bot_token}/sendMessage",
            json={"chat_id": chat_id, "text": text, "parse_mode": "HTML"},
        )
    data = resp.json()
    if not data.get("ok"):
        description = data.get("description", "unknown error")
        raise ValueError(description)
    return data


async def test_and_save(user_id: int, bot_token: str, chat_id: int) -> None:
    """
    Test the credentials by sending a verification message.
    Saves bot_token + chat_id to the user record and enables notifications on success.
    Raises ValueError with a human-readable message on failure.
    """
    bot_token = bot_token.strip()
    if not bot_token:
        raise ValueError("请填写 Bot Token")

    # Try sending a test message first — if it fails, credentials are wrong
    try:
        await _send(
            bot_token,
            chat_id,
            "✅ <b>Biscord 绑定成功！</b>\n\n"
            "你的 Biscord 账号已和此 Telegram 关联，\n"
            "收到好友申请、私信或 @提及 时会在这里推送通知。",
        )
    except ValueError as e:
        raise ValueError(f"Telegram 返回错误：{e}")
    except Exception:
        raise ValueError("无法连接到 Telegram，请检查 Bot Token 和 Chat ID 是否正确")

    # Credentials work — save them
    with SessionLocal() as db:
        user = db.get(User, user_id)
        if user:
            user.telegram_bot_token = bot_token
            user.telegram_chat_id = chat_id
            user.telegram_notify_enabled = True
            db.commit()


async def notify(user_id: int, text: str) -> None:
    """
    Push a Telegram message to a user if they have notifications enabled.
    Uses the user's own bot token. Never raises — failure is silently ignored.
    """
    with SessionLocal() as db:
        user = db.get(User, user_id)
        if (
            not user
            or not user.telegram_bot_token
            or not user.telegram_chat_id
            or not user.telegram_notify_enabled
        ):
            return
        token = user.telegram_bot_token
        chat_id = user.telegram_chat_id

    try:
        await _send(token, chat_id, text)
    except Exception:
        pass  # notification failure must never affect the main request
