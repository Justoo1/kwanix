"""add location_broadcast_enabled to vehicles and eta_sms_sent_at to tickets for LiveTrack

Revision ID: 0027
Revises: 0026
Create Date: 2026-04-17
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0027"
down_revision: str | None = "0026"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "vehicles",
        sa.Column(
            "location_broadcast_enabled",
            sa.Boolean(),
            nullable=False,
            server_default="false",
        ),
    )
    op.add_column(
        "tickets",
        sa.Column("eta_sms_sent_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("tickets", "eta_sms_sent_at")
    op.drop_column("vehicles", "location_broadcast_enabled")
