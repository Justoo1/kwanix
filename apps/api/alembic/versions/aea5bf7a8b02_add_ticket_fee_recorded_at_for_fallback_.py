"""add ticket fee_recorded_at for fallback platform fee tracking

Revision ID: aea5bf7a8b02
Revises: 2b7e1f9a3c44
Create Date: 2026-07-24 21:41:11.271387

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'aea5bf7a8b02'
down_revision: Union[str, None] = '2b7e1f9a3c44'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('tickets', sa.Column('fee_recorded_at', sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column('tickets', 'fee_recorded_at')
