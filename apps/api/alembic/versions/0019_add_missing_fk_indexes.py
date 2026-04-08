"""add missing foreign key indexes

Revision ID: 0019
Revises: 0018
Create Date: 2026-04-07

Adds indexes on foreign key columns that were missing, causing full table
scans on joins/filters. Covers:
  - parcels: current_trip_id, created_by_id, destination_station_id
  - trips: vehicle_id, departure_station_id, destination_station_id
  - users: station_id
  - tickets: created_by_id
  - sms_logs: parcel_id
  - payment_events: ticket_id
"""

from collections.abc import Sequence

from alembic import op

revision: str = "0019"
down_revision: str | None = "0018"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_INDEXES = [
    # (index_name, table, columns)
    ("ix_parcels_current_trip_id", "parcels", ["current_trip_id"]),
    ("ix_parcels_created_by_id", "parcels", ["created_by_id"]),
    ("ix_parcels_destination_station_id", "parcels", ["destination_station_id"]),
    ("ix_trips_vehicle_id", "trips", ["vehicle_id"]),
    ("ix_trips_departure_station_id", "trips", ["departure_station_id"]),
    ("ix_trips_destination_station_id", "trips", ["destination_station_id"]),
    ("ix_users_station_id", "users", ["station_id"]),
    ("ix_tickets_created_by_id", "tickets", ["created_by_id"]),
    ("ix_sms_logs_parcel_id", "sms_logs", ["parcel_id"]),
    ("ix_payment_events_ticket_id", "payment_events", ["ticket_id"]),
]


def upgrade() -> None:
    for name, table, columns in _INDEXES:
        op.create_index(name, table, columns)


def downgrade() -> None:
    for name, table, _ in reversed(_INDEXES):
        op.drop_index(name, table_name=table)
