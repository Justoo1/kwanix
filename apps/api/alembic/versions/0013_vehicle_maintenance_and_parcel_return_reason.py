"""vehicle maintenance log, vehicle is_available, and parcel return_reason

Revision ID: 0013
Revises: 0012
Create Date: 2026-04-06

L1: Adds is_available flag to vehicles + vehicle_maintenance_logs table.
L5: Adds return_reason to parcels for public tracking display.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0013"
down_revision: str | None = "0012"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # L1: vehicles
    op.add_column(
        "vehicles",
        sa.Column("is_available", sa.Boolean(), nullable=False, server_default="true"),
    )
    op.create_table(
        "vehicle_maintenance_logs",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("vehicle_id", sa.Integer(), nullable=False),
        sa.Column("created_by_id", sa.Integer(), nullable=True),
        sa.Column("note", sa.Text(), nullable=False),
        sa.Column("occurred_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["created_by_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["vehicle_id"], ["vehicles.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )

    # L5: parcels
    op.add_column(
        "parcels",
        sa.Column("return_reason", sa.String(200), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("parcels", "return_reason")
    op.drop_table("vehicle_maintenance_logs")
    op.drop_column("vehicles", "is_available")
