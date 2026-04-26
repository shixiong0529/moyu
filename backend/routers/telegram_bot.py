"""
Telegram Bot router — per-user bot token model.
Users provide their own bot token + chat_id.
Binding is verified by sending a test message.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from auth import get_current_user
from database import get_db
from models import User
from telegram_service import test_and_save

router = APIRouter(prefix="/api/telegram", tags=["telegram"])


class ConnectRequest(BaseModel):
    bot_token: str = Field(min_length=1, max_length=128)
    chat_id: int


class NotifyToggle(BaseModel):
    enabled: bool


@router.post("/connect")
async def connect_telegram(
    payload: ConnectRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Verify credentials by sending a test message to the user's Telegram.
    Saves bot_token + chat_id and enables notifications on success.
    """
    try:
        await test_and_save(current_user.id, payload.bot_token, payload.chat_id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    return {"ok": True}


@router.get("/status")
def get_status(current_user: User = Depends(get_current_user)):
    """Return current binding and notification state."""
    return {
        "bound": current_user.telegram_chat_id is not None,
        "notify_enabled": current_user.telegram_notify_enabled,
    }


@router.patch("/notify")
def toggle_notifications(
    payload: NotifyToggle,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Enable or disable Telegram notifications."""
    if not current_user.telegram_chat_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="请先绑定 Telegram",
        )
    current_user.telegram_notify_enabled = payload.enabled
    db.commit()
    return {"ok": True}


@router.delete("/bind")
def unbind_telegram(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Remove Telegram binding and disable notifications."""
    current_user.telegram_bot_token = None
    current_user.telegram_chat_id = None
    current_user.telegram_notify_enabled = False
    db.commit()
    return {"ok": True}
