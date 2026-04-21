"""add payment_ref and fee_payment_status to parcels for MoMo payment tracking

Revision ID: 0026
Revises: 0025
Create Date: 2026-04-17
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0026"
down_revision: str | None = "0025"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "parcels",
        sa.Column("payment_ref", sa.String(100), unique=True, nullable=True),
    )
    op.add_column(
        "parcels",
        sa.Column(
            "fee_payment_status",
            sa.String(20),
            nullable=False,
            server_default="'cash'",
        ),
    )
    op.create_index("ix_parcels_payment_ref", "parcels", ["payment_ref"], unique=True,
                    postgresql_where=sa.text("payment_ref IS NOT NULL"))


def downgrade() -> None:
    op.drop_index("ix_parcels_payment_ref", "parcels")
    op.drop_column("parcels", "fee_payment_status")
    op.drop_column("parcels", "payment_ref")
