"""add sla_threshold_days to companies

Revision ID: 0018
Revises: 0017
Create Date: 2026-04-06

S2: Adds sla_threshold_days column to companies so operations staff can
    configure what counts as "late" for parcel delivery SLA reports
    without a code deploy.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0018"
down_revision: str | None = "0017"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "companies",
        sa.Column(
            "sla_threshold_days",
            sa.Integer(),
            nullable=False,
            server_default="2",
        ),
    )


def downgrade() -> None:
    op.drop_column("companies", "sla_threshold_days")
