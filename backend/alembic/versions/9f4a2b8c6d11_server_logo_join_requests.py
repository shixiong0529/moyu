"""server logo and join requests

Revision ID: 9f4a2b8c6d11
Revises: 3b5d616c0dfb
Create Date: 2026-04-25 20:45:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "9f4a2b8c6d11"
down_revision: Union[str, None] = "3b5d616c0dfb"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    server_columns = {column["name"] for column in inspector.get_columns("servers")}
    if "icon_url" not in server_columns:
        op.add_column("servers", sa.Column("icon_url", sa.String(length=256), nullable=True))
    if "description" not in server_columns:
        op.add_column("servers", sa.Column("description", sa.String(length=256), nullable=True))
    if "is_recommended" not in server_columns:
        op.add_column("servers", sa.Column("is_recommended", sa.Boolean(), server_default="0", nullable=False))

    if not inspector.has_table("join_requests"):
        op.create_table(
            "join_requests",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("server_id", sa.Integer(), nullable=False),
            sa.Column("user_id", sa.Integer(), nullable=False),
            sa.Column("status", sa.String(length=16), server_default="pending", nullable=False),
            sa.Column("note", sa.String(length=256), nullable=True),
            sa.Column("decided_by", sa.Integer(), nullable=True),
            sa.Column("decided_at", sa.DateTime(), nullable=True),
            sa.Column("created_at", sa.DateTime(), server_default=sa.text("(CURRENT_TIMESTAMP)"), nullable=False),
            sa.ForeignKeyConstraint(["decided_by"], ["users.id"]),
            sa.ForeignKeyConstraint(["server_id"], ["servers.id"]),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("server_id", "user_id", "status", name="uq_join_requests_server_user_status"),
        )
        op.create_index(op.f("ix_join_requests_id"), "join_requests", ["id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_join_requests_id"), table_name="join_requests")
    op.drop_table("join_requests")
    op.drop_column("servers", "is_recommended")
    op.drop_column("servers", "description")
    op.drop_column("servers", "icon_url")
