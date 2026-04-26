"""add telegram notification fields to users

Revision ID: a1b2c3d4e5f6
Revises: 9f4a2b8c6d11
Create Date: 2026-04-26 10:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "a1b2c3d4e5f6"
down_revision: Union[str, None] = "9f4a2b8c6d11"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    user_columns = {col["name"] for col in inspector.get_columns("users")}

    if "telegram_chat_id" not in user_columns:
        op.add_column("users", sa.Column("telegram_chat_id", sa.BigInteger(), nullable=True))
    if "telegram_notify_enabled" not in user_columns:
        op.add_column("users", sa.Column("telegram_notify_enabled", sa.Boolean(), server_default="0", nullable=False))
    if "telegram_bind_code" not in user_columns:
        op.add_column("users", sa.Column("telegram_bind_code", sa.String(length=4), nullable=True))
    if "telegram_bind_expires_at" not in user_columns:
        op.add_column("users", sa.Column("telegram_bind_expires_at", sa.DateTime(), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "telegram_bind_expires_at")
    op.drop_column("users", "telegram_bind_code")
    op.drop_column("users", "telegram_notify_enabled")
    op.drop_column("users", "telegram_chat_id")
