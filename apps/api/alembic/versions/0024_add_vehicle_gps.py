"""Add GPS tracking fields to vehicles table.

Revision ID: 0024
Revises: 0023
Create Date: 2026-04-14
"""

import sqlalchemy as sa
from alembic import op

revision = "0024"
down_revision = "0023"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("vehicles", sa.Column("current_latitude", sa.Float(), nullable=True))
    op.add_column("vehicles", sa.Column("current_longitude", sa.Float(), nullable=True))
    op.add_column(
        "vehicles",
        sa.Column("last_gps_update", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("vehicles", "last_gps_update")
    op.drop_column("vehicles", "current_longitude")
    op.drop_column("vehicles", "current_latitude")
