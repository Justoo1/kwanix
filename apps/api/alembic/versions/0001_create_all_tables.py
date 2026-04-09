"""create all tables

Revision ID: 0001
Revises:
Create Date: 2026-03-28

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # ── companies ────────────────────────────────────────────────────────────
    op.create_table(
        "companies",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("subdomain", sa.String(50), nullable=True),
        sa.Column("company_code", sa.String(10), nullable=False),
        sa.Column("api_key", sa.String(100), nullable=True),
        sa.Column("logo_url", sa.Text(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("subdomain"),
        sa.UniqueConstraint("company_code"),
        sa.UniqueConstraint("api_key"),
    )

    # ── stations ─────────────────────────────────────────────────────────────
    op.create_table(
        "stations",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("company_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("location_code", sa.String(10), nullable=True),
        sa.Column("search_aliases", sa.JSON(), nullable=True),
        sa.Column("contact_number", sa.String(20), nullable=True),
        sa.Column("address", sa.String(255), nullable=True),
        sa.Column("is_hub", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["company_id"], ["companies.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )

    # ── users ─────────────────────────────────────────────────────────────────
    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("company_id", sa.Integer(), nullable=True),
        sa.Column("station_id", sa.Integer(), nullable=True),
        sa.Column("full_name", sa.String(100), nullable=False),
        sa.Column("phone", sa.String(20), nullable=False),
        sa.Column("email", sa.String(150), nullable=True),
        sa.Column("hashed_password", sa.String(255), nullable=False),
        sa.Column(
            "role",
            sa.Enum(
                "super_admin",
                "company_admin",
                "station_manager",
                "station_clerk",
                name="userrole",
            ),
            nullable=False,
        ),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["company_id"], ["companies.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["station_id"], ["stations.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("email"),
    )

    # ── vehicles ──────────────────────────────────────────────────────────────
    op.create_table(
        "vehicles",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("company_id", sa.Integer(), nullable=False),
        sa.Column("home_station_id", sa.Integer(), nullable=True),
        sa.Column("plate_number", sa.String(20), nullable=False),
        sa.Column("model", sa.String(100), nullable=True),
        sa.Column("capacity", sa.Integer(), nullable=False, server_default="50"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["company_id"], ["companies.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["home_station_id"], ["stations.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("plate_number"),
    )

    # ── trips ─────────────────────────────────────────────────────────────────
    op.create_table(
        "trips",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("company_id", sa.Integer(), nullable=False),
        sa.Column("vehicle_id", sa.Integer(), nullable=False),
        sa.Column("departure_station_id", sa.Integer(), nullable=False),
        sa.Column("destination_station_id", sa.Integer(), nullable=False),
        sa.Column("departure_time", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "status",
            sa.Enum(
                "scheduled", "loading", "departed", "arrived", "cancelled", name="tripstatus"
            ),
            nullable=False,
            server_default="scheduled",
        ),
        sa.Column("price_parcel_base", sa.Numeric(10, 2), nullable=True),
        sa.Column("price_ticket_base", sa.Numeric(10, 2), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["company_id"], ["companies.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["vehicle_id"], ["vehicles.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(
            ["departure_station_id"], ["stations.id"], ondelete="RESTRICT"
        ),
        sa.ForeignKeyConstraint(
            ["destination_station_id"], ["stations.id"], ondelete="RESTRICT"
        ),
        sa.PrimaryKeyConstraint("id"),
    )

    # ── parcels ───────────────────────────────────────────────────────────────
    op.create_table(
        "parcels",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("company_id", sa.Integer(), nullable=False),
        sa.Column("tracking_number", sa.String(25), nullable=False),
        sa.Column("sender_name", sa.String(100), nullable=False),
        sa.Column("sender_phone", sa.String(20), nullable=False),
        sa.Column("receiver_name", sa.String(100), nullable=False),
        sa.Column("receiver_phone", sa.String(20), nullable=False),
        sa.Column("origin_station_id", sa.Integer(), nullable=False),
        sa.Column("destination_station_id", sa.Integer(), nullable=False),
        sa.Column("current_trip_id", sa.Integer(), nullable=True),
        sa.Column("created_by_id", sa.Integer(), nullable=True),
        sa.Column("weight_kg", sa.Numeric(10, 2), nullable=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("fee_ghs", sa.Numeric(10, 2), nullable=False, server_default="0"),
        sa.Column(
            "status",
            sa.Enum(
                "pending", "in_transit", "arrived", "picked_up", "returned", name="parcelstatus"
            ),
            nullable=False,
            server_default="pending",
        ),
        sa.Column("otp_code", sa.String(6), nullable=True),
        sa.Column("otp_expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("otp_attempt_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("idempotency_key", sa.String(64), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["company_id"], ["companies.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["origin_station_id"], ["stations.id"], ondelete="RESTRICT"
        ),
        sa.ForeignKeyConstraint(
            ["destination_station_id"], ["stations.id"], ondelete="RESTRICT"
        ),
        sa.ForeignKeyConstraint(["current_trip_id"], ["trips.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["created_by_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("tracking_number"),
        sa.UniqueConstraint("idempotency_key"),
    )

    # ── parcel_logs ───────────────────────────────────────────────────────────
    op.create_table(
        "parcel_logs",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("parcel_id", sa.Integer(), nullable=False),
        sa.Column("clerk_id", sa.Integer(), nullable=True),
        sa.Column("previous_status", sa.String(20), nullable=True),
        sa.Column("new_status", sa.String(20), nullable=False),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("occurred_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["parcel_id"], ["parcels.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["clerk_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )

    # ── tickets ───────────────────────────────────────────────────────────────
    op.create_table(
        "tickets",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("company_id", sa.Integer(), nullable=False),
        sa.Column("trip_id", sa.Integer(), nullable=False),
        sa.Column("created_by_id", sa.Integer(), nullable=True),
        sa.Column("passenger_name", sa.String(100), nullable=False),
        sa.Column("passenger_phone", sa.String(20), nullable=False),
        sa.Column("seat_number", sa.Integer(), nullable=False),
        sa.Column("fare_ghs", sa.Numeric(10, 2), nullable=False),
        sa.Column(
            "status",
            sa.Enum("valid", "used", "cancelled", name="ticketstatus"),
            nullable=False,
            server_default="valid",
        ),
        sa.Column(
            "payment_status",
            sa.Enum("pending", "paid", "failed", "refunded", name="paymentstatus"),
            nullable=False,
            server_default="pending",
        ),
        sa.Column("payment_ref", sa.String(100), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["company_id"], ["companies.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["trip_id"], ["trips.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["created_by_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )

    # ── sms_logs ──────────────────────────────────────────────────────────────
    op.create_table(
        "sms_logs",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("parcel_id", sa.Integer(), nullable=True),
        sa.Column("event_type", sa.String(50), nullable=False),
        sa.Column("recipient_phone", sa.String(20), nullable=False),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="pending"),
        sa.Column("arkesel_message_id", sa.String(100), nullable=True),
        sa.Column("error_detail", sa.Text(), nullable=True),
        sa.Column("sent_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["parcel_id"], ["parcels.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )

    # ── payment_events ────────────────────────────────────────────────────────
    op.create_table(
        "payment_events",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("ticket_id", sa.Integer(), nullable=True),
        sa.Column("provider_event_id", sa.String(150), nullable=False),
        sa.Column("provider", sa.String(30), nullable=False),
        sa.Column("event_type", sa.String(60), nullable=False),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("raw_payload", sa.Text(), nullable=True),
        sa.Column("received_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["ticket_id"], ["tickets.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("provider_event_id"),
    )

    # ── tracking_sequences ────────────────────────────────────────────────────
    op.create_table(
        "tracking_sequences",
        sa.Column("company_id", sa.Integer(), nullable=False),
        sa.Column("last_serial", sa.Integer(), nullable=False, server_default="0"),
        sa.ForeignKeyConstraint(["company_id"], ["companies.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("company_id"),
    )

    # ── Indexes for frequent lookups ──────────────────────────────────────────
    op.create_index("idx_parcel_tracking", "parcels", ["tracking_number"])
    op.create_index("idx_parcel_receiver_phone", "parcels", ["receiver_phone"])
    op.create_index("idx_parcel_company_status", "parcels", ["company_id", "status"])
    op.create_index("idx_parcel_origin_station", "parcels", ["origin_station_id", "status"])
    op.create_index("idx_trip_company_status", "trips", ["company_id", "status"])
    op.create_index("idx_ticket_trip_seat", "tickets", ["trip_id", "seat_number"], unique=True)
    op.create_index("idx_user_company", "users", ["company_id"])


def downgrade() -> None:
    op.drop_index("idx_user_company", table_name="users")
    op.drop_index("idx_ticket_trip_seat", table_name="tickets")
    op.drop_index("idx_trip_company_status", table_name="trips")
    op.drop_index("idx_parcel_origin_station", table_name="parcels")
    op.drop_index("idx_parcel_company_status", table_name="parcels")
    op.drop_index("idx_parcel_receiver_phone", table_name="parcels")
    op.drop_index("idx_parcel_tracking", table_name="parcels")
    op.drop_table("tracking_sequences")
    op.drop_table("payment_events")
    op.drop_table("sms_logs")
    op.drop_table("tickets")
    op.drop_table("parcel_logs")
    op.drop_table("parcels")
    op.drop_table("trips")
    op.drop_table("vehicles")
    op.drop_table("users")
    op.drop_table("stations")
    op.drop_table("companies")
    op.execute("DROP TYPE IF EXISTS userrole")
    op.execute("DROP TYPE IF EXISTS tripstatus")
    op.execute("DROP TYPE IF EXISTS parcelstatus")
    op.execute("DROP TYPE IF EXISTS ticketstatus")
    op.execute("DROP TYPE IF EXISTS paymentstatus")
