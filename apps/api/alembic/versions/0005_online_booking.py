"""add online booking support

Revision ID: 0005
Revises: 0004
Create Date: 2026-03-29

Adds:
  - trips.booking_open         — company toggles to open a trip for passenger self-booking
  - tickets.source             — 'counter' (clerk walk-in) | 'online' (passenger app)
  - tickets.booking_expires_at — 15-min hold for unpaid online bookings; NULL = no expiry

Also fixes the unique seat index to be partial (exclude cancelled tickets), so expired
and cancelled seats can be re-booked.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0005"
down_revision: str | None = "0004"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # trips.booking_open
    op.add_column(
        "trips",
        sa.Column("booking_open", sa.Boolean(), nullable=False, server_default="false"),
    )

    # tickets.source
    op.execute("CREATE TYPE ticketsource AS ENUM ('counter', 'online')")
    op.add_column(
        "tickets",
        sa.Column(
            "source",
            sa.Enum("counter", "online", name="ticketsource"),
            nullable=False,
            server_default="counter",
        ),
    )

    # tickets.booking_expires_at
    op.add_column(
        "tickets",
        sa.Column("booking_expires_at", sa.DateTime(timezone=True), nullable=True),
    )

    # Fix unique seat index: allow re-booking of cancelled seats
    op.drop_index("idx_ticket_trip_seat", table_name="tickets")
    op.execute(
        """
        CREATE UNIQUE INDEX idx_ticket_trip_seat
        ON tickets (trip_id, seat_number)
        WHERE status != 'cancelled'
        """
    )


def downgrade() -> None:
    op.drop_index("idx_ticket_trip_seat", table_name="tickets")
    op.execute(
        "CREATE UNIQUE INDEX idx_ticket_trip_seat ON tickets (trip_id, seat_number)"
    )
    op.drop_column("tickets", "booking_expires_at")
    op.drop_column("tickets", "source")
    op.execute("DROP TYPE IF EXISTS ticketsource")
    op.drop_column("trips", "booking_open")
