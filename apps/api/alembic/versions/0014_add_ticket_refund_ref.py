"""add refund_ref column to tickets

Revision ID: 0014
Revises: 0013
Create Date: 2026-04-06

M2: Stores the external Paystack refund reference when a ticket is manually
    marked as refunded via the dashboard.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0014"
down_revision: str | None = "0013"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "tickets",
        sa.Column("refund_ref", sa.String(100), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("tickets", "refund_ref")
