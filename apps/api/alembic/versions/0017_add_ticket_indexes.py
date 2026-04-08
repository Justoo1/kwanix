"""add ticket payment_ref and booking_expires_at indexes

Revision ID: 0017
Revises: 0016
Create Date: 2026-04-06

R3: Adds indexes on tickets.payment_ref (used by webhook lookup) and
    tickets.booking_expires_at (used by seat-map expiry queries) to prevent
    full table scans as ticket volume grows.
"""

from collections.abc import Sequence

from alembic import op

revision: str = "0017"
down_revision: str | None = "0016"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_index("ix_ticket_payment_ref", "tickets", ["payment_ref"])
    op.create_index("ix_ticket_booking_expires_at", "tickets", ["booking_expires_at"])


def downgrade() -> None:
    op.drop_index("ix_ticket_payment_ref", table_name="tickets")
    op.drop_index("ix_ticket_booking_expires_at", table_name="tickets")
