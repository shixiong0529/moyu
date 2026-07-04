"""add servers.is_admin_server flag

管理员服务器的删除保护此前按名字判断，改名可绕过；改为持久化 flag。

Revision ID: 1b2c3d4e5f6a
Revises: 0a1b2c3d4e5f
Create Date: 2026-07-04 00:00:00.000000
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = '1b2c3d4e5f6a'
down_revision: Union[str, None] = '0a1b2c3d4e5f'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('servers', sa.Column('is_admin_server', sa.Boolean(), nullable=False, server_default='0'))
    op.execute(
        sa.text("UPDATE servers SET is_admin_server = :flag WHERE name = '管理员服务器'").bindparams(flag=True)
    )


def downgrade() -> None:
    op.drop_column('servers', 'is_admin_server')
