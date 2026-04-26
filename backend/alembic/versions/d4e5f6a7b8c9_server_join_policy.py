"""server join policy

Revision ID: d4e5f6a7b8c9
Revises: c3d4e5f6a7b8
Create Date: 2026-04-26 19:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "d4e5f6a7b8c9"
down_revision: Union[str, None] = "c3d4e5f6a7b8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    columns = {column["name"] for column in inspector.get_columns("servers")}
    if "join_policy" not in columns:
        op.add_column(
            "servers",
            sa.Column("join_policy", sa.String(length=16), server_default="approval", nullable=False),
        )


def downgrade() -> None:
    op.drop_column("servers", "join_policy")
