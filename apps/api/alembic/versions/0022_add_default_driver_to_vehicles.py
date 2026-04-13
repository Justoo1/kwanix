"""Add default_driver_id FK to vehicles table.

Revision ID: 0022
Revises: 0021
Create Date: 2026-04-13
"""

from alembic import op
import sqlalchemy as sa

revision = "0022"
down_revision = "0021"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "vehicles",
        sa.Column(
            "default_driver_id",
            sa.Integer(),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.create_index("ix_vehicles_default_driver_id", "vehicles", ["default_driver_id"])


def downgrade() -> None:
    op.drop_index("ix_vehicles_default_driver_id", table_name="vehicles")
    op.drop_column("vehicles", "default_driver_id")
