"""add webhook_url to workflows

Revision ID: e5f6a7b8c9d0
Revises: d4e5f6a7b8c9
Create Date: 2026-05-30 12:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = 'e5f6a7b8c9d0'
down_revision: Union[str, Sequence[str], None] = 'd4e5f6a7b8c9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('workflows', sa.Column('webhook_url', sa.Text(), nullable=True))
    op.add_column('runs', sa.Column('output_data', sa.dialects.postgresql.JSONB(), nullable=True))


def downgrade() -> None:
    op.drop_column('runs', 'output_data')
    op.drop_column('workflows', 'webhook_url')
