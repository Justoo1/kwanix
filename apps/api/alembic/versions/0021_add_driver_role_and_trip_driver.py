"""Add driver role to userrole enum and driver_id FK to trips.

Revision ID: 0021
Revises: 0e34c655efa3
Create Date: 2026-04-13

NOTE: PostgreSQL does not support removing enum values. The downgrade for this
migration drops the driver_id column and index but cannot remove 'driver' from
the userrole enum type. Manual intervention would be required to roll back the
enum change.
"""

from typing import Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0021"
down_revision: Union[str, None] = "0e34c655efa3"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ALTER TYPE ADD VALUE cannot run inside a transaction block in PostgreSQL.
    # We explicitly close the Alembic transaction, run the DDL, then reopen it.
    bind = op.get_bind()
    bind.execute(sa.text("COMMIT"))
    bind.execute(sa.text("ALTER TYPE userrole ADD VALUE IF NOT EXISTS 'driver'"))
    bind.execute(sa.text("BEGIN"))

    op.add_column(
        "trips",
        sa.Column(
            "driver_id",
            sa.Integer,
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.create_index("ix_trips_driver_id", "trips", ["driver_id"])


def downgrade() -> None:
    op.drop_index("ix_trips_driver_id", table_name="trips")
    op.drop_column("trips", "driver_id")
    # Cannot remove 'driver' from userrole enum in PostgreSQL.
