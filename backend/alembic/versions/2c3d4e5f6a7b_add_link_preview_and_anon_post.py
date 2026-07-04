"""add link preview embed + anonymous posting support

链接预览卡片：messages.embed_json 缓存抓取到的 OG 元数据。
匿名树洞：channels.allow_anonymous 开关 + messages.is_anonymous 标记 +
channel_anon_identities 表（同一用户在同一频道匿名发言时保持同一个编号）。

Revision ID: 2c3d4e5f6a7b
Revises: 1b2c3d4e5f6a
Create Date: 2026-07-05 00:00:00.000000
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = '2c3d4e5f6a7b'
down_revision: Union[str, None] = '1b2c3d4e5f6a'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('channels', sa.Column('allow_anonymous', sa.Boolean(), nullable=False, server_default='0'))
    op.add_column('messages', sa.Column('is_anonymous', sa.Boolean(), nullable=False, server_default='0'))
    op.add_column('messages', sa.Column('embed_json', sa.Text(), nullable=True))
    op.create_table(
        'channel_anon_identities',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('channel_id', sa.Integer(), sa.ForeignKey('channels.id'), nullable=False),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('anon_number', sa.Integer(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint('channel_id', 'user_id', name='uq_channel_anon_identity'),
    )


def downgrade() -> None:
    op.drop_table('channel_anon_identities')
    op.drop_column('messages', 'embed_json')
    op.drop_column('messages', 'is_anonymous')
    op.drop_column('channels', 'allow_anonymous')
