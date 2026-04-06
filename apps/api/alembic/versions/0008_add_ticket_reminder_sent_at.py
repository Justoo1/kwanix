"""add ticket reminder_sent_at

Revision ID: 0008
Revises: 0007
Create Date: 2026-04-05

Adds reminder_sent_at to tickets table for idempotent trip departure reminders.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0008"
down_revision: str | None = "0007"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "tickets",
        sa.Column("reminder_sent_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("tickets", "reminder_sent_at")
