"""Add latitude and longitude to stations table.

Revision ID: 0023
Revises: 0022
Create Date: 2026-04-14
"""

import sqlalchemy as sa
from alembic import op

revision = "0023"
down_revision = "0022"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("stations", sa.Column("latitude", sa.Float(), nullable=True))
    op.add_column("stations", sa.Column("longitude", sa.Float(), nullable=True))


def downgrade() -> None:
    op.drop_column("stations", "longitude")
    op.drop_column("stations", "latitude")
