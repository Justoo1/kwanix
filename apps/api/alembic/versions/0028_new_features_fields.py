"""add parcel insurance, trip discount, user whatsapp_opt_in

Revision ID: 0028
Revises: 0027
Create Date: 2026-04-18

Adds:
  - parcels.insurance_opted_in (bool, default false)
  - parcels.insurance_fee_ghs  (numeric 10,2, nullable)
  - trips.applied_discount_pct (integer, nullable)
  - users.whatsapp_opt_in      (bool, default false)
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0028"
down_revision: str | None = "0031"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "parcels",
        sa.Column("insurance_opted_in", sa.Boolean(), nullable=False, server_default="false"),
    )
    op.add_column(
        "parcels",
        sa.Column("insurance_fee_ghs", sa.Numeric(10, 2), nullable=True),
    )
    op.add_column(
        "trips",
        sa.Column("applied_discount_pct", sa.Integer(), nullable=True),
    )
    op.add_column(
        "users",
        sa.Column("whatsapp_opt_in", sa.Boolean(), nullable=False, server_default="false"),
    )


def downgrade() -> None:
    op.drop_column("users", "whatsapp_opt_in")
    op.drop_column("trips", "applied_discount_pct")
    op.drop_column("parcels", "insurance_fee_ghs")
    op.drop_column("parcels", "insurance_opted_in")
