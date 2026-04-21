"""add composite indexes for demand intelligence queries

Revision ID: 0029
Revises: 0027
Create Date: 2026-04-17
"""

from collections.abc import Sequence

from alembic import op

revision: str = "0029"
down_revision: str | None = "0027"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_index(
        "idx_tickets_trip_status",
        "tickets",
        ["trip_id", "created_at"],
        postgresql_where="status != 'cancelled'",
    )
    op.create_index(
        "idx_trips_route_departure",
        "trips",
        ["departure_station_id", "destination_station_id", "departure_time"],
        postgresql_where="status NOT IN ('cancelled')",
    )


def downgrade() -> None:
    op.drop_index("idx_trips_route_departure", table_name="trips")
    op.drop_index("idx_tickets_trip_status", table_name="tickets")
