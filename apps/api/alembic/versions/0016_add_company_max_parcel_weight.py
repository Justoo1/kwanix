"""add max_parcel_weight_kg to companies

Revision ID: 0016
Revises: 0015
Create Date: 2026-04-06

O5: Enables per-company maximum parcel weight guard at booking time.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0016"
down_revision: str | None = "0015"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "companies",
        sa.Column("max_parcel_weight_kg", sa.Float(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("companies", "max_parcel_weight_kg")
