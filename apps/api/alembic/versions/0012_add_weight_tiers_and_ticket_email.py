"""add company weight_tiers and ticket passenger_email

Revision ID: 0012
Revises: 0011
Create Date: 2026-04-06

K4: Adds weight_tiers JSON column to companies for auto-pricing parcels by weight.
K2: Adds passenger_email to tickets so receipts can be emailed after payment.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0012"
down_revision: str | None = "0011"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("companies", sa.Column("weight_tiers", sa.JSON(), nullable=True))
    op.add_column("tickets", sa.Column("passenger_email", sa.String(254), nullable=True))


def downgrade() -> None:
    op.drop_column("tickets", "passenger_email")
    op.drop_column("companies", "weight_tiers")
