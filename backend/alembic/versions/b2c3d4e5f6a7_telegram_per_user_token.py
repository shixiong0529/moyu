"""telegram per-user bot token, drop bind code fields

Revision ID: b2c3d4e5f6a7
Revises: a1b2c3d4e5f6
Create Date: 2026-04-26 12:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "b2c3d4e5f6a7"
down_revision: Union[str, None] = "a1b2c3d4e5f6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    user_columns = {col["name"] for col in inspector.get_columns("users")}

    if "telegram_bot_token" not in user_columns:
        op.add_column("users", sa.Column("telegram_bot_token", sa.String(length=128), nullable=True))

    # Remove old bind-code fields (no longer used in per-user-token model)
    if "telegram_bind_code" in user_columns:
        op.drop_column("users", "telegram_bind_code")
    if "telegram_bind_expires_at" in user_columns:
        op.drop_column("users", "telegram_bind_expires_at")


def downgrade() -> None:
    op.drop_column("users", "telegram_bot_token")
    op.add_column("users", sa.Column("telegram_bind_code", sa.String(length=4), nullable=True))
    op.add_column("users", sa.Column("telegram_bind_expires_at", sa.DateTime(), nullable=True))
