"""add parcel transition timestamps

Revision ID: 0006
Revises: 0005
Create Date: 2026-04-05

Adds loaded_at, arrived_at, collected_at to parcels table for SLA tracking.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0006"
down_revision: str | None = "0005"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("parcels", sa.Column("loaded_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("parcels", sa.Column("arrived_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("parcels", sa.Column("collected_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column("parcels", "collected_at")
    op.drop_column("parcels", "arrived_at")
    op.drop_column("parcels", "loaded_at")
