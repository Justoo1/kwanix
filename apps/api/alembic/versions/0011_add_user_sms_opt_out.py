"""add user sms_opt_out

Revision ID: 0011
Revises: 0010
Create Date: 2026-04-05

Adds sms_opt_out boolean to users table for per-user SMS notification preferences.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0011"
down_revision: str | None = "0010"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("sms_opt_out", sa.Boolean(), nullable=False, server_default="false"),
    )


def downgrade() -> None:
    op.drop_column("users", "sms_opt_out")
