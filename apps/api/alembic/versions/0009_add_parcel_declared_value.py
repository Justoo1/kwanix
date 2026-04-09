"""add parcel declared_value_ghs

Revision ID: 0009
Revises: 0008
Create Date: 2026-04-05

Adds declared_value_ghs to parcels table for insurance / fee-by-value support.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0009"
down_revision: str | None = "0008"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "parcels",
        sa.Column("declared_value_ghs", sa.Numeric(10, 2), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("parcels", "declared_value_ghs")
