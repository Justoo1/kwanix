"""add city column to stations

Revision ID: 0015
Revises: 0014
Create Date: 2026-04-06

O2: Adds city field to stations for passenger-facing route search.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0015"
down_revision: str | None = "0014"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "stations",
        sa.Column("city", sa.String(100), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("stations", "city")
