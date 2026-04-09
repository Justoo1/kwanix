"""add webhook event retry queue

Revision ID: 0007
Revises: 0006
Create Date: 2026-04-05

Adds webhook_events table to persist failed webhook payloads for replay.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0007"
down_revision: str | None = "0006"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "webhook_events",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("event_type", sa.String(60), nullable=False),
        sa.Column("payload", sa.Text(), nullable=False),
        sa.Column("attempts", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("last_error", sa.Text(), nullable=True),
        sa.Column("processed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("idx_webhook_event_unprocessed", "webhook_events", ["processed_at"])


def downgrade() -> None:
    op.drop_index("idx_webhook_event_unprocessed", table_name="webhook_events")
    op.drop_table("webhook_events")
