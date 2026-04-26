"""friend requests and friendships

Revision ID: c3d4e5f6a7b8
Revises: b2c3d4e5f6a7
Create Date: 2026-04-26 18:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "c3d4e5f6a7b8"
down_revision: Union[str, None] = "b2c3d4e5f6a7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())

    if not inspector.has_table("friend_requests"):
        op.create_table(
            "friend_requests",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("requester_id", sa.Integer(), nullable=False),
            sa.Column("receiver_id", sa.Integer(), nullable=False),
            sa.Column("status", sa.String(length=16), server_default="pending", nullable=False),
            sa.Column("decided_at", sa.DateTime(), nullable=True),
            sa.Column("created_at", sa.DateTime(), server_default=sa.text("(CURRENT_TIMESTAMP)"), nullable=False),
            sa.ForeignKeyConstraint(["requester_id"], ["users.id"]),
            sa.ForeignKeyConstraint(["receiver_id"], ["users.id"]),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("requester_id", "receiver_id", "status", name="uq_friend_requests_pair_status"),
        )
        op.create_index(op.f("ix_friend_requests_id"), "friend_requests", ["id"], unique=False)

    if not inspector.has_table("friendships"):
        op.create_table(
            "friendships",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("user_id", sa.Integer(), nullable=False),
            sa.Column("friend_id", sa.Integer(), nullable=False),
            sa.Column("created_at", sa.DateTime(), server_default=sa.text("(CURRENT_TIMESTAMP)"), nullable=False),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
            sa.ForeignKeyConstraint(["friend_id"], ["users.id"]),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("user_id", "friend_id", name="uq_friendships_pair"),
        )
        op.create_index(op.f("ix_friendships_id"), "friendships", ["id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_friendships_id"), table_name="friendships")
    op.drop_table("friendships")
    op.drop_index(op.f("ix_friend_requests_id"), table_name="friend_requests")
    op.drop_table("friend_requests")
