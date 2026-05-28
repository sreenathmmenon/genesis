"""add schedule_expr to workflows

Revision ID: b1c2d3e4f5a6
Revises: a83547bb0e90
Create Date: 2026-05-28 18:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = 'b1c2d3e4f5a6'
down_revision: Union[str, Sequence[str], None] = 'a83547bb0e90'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('workflows', sa.Column('schedule_expr', sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column('workflows', 'schedule_expr')
