import enum
from datetime import datetime

from sqlalchemy import DateTime, Enum, ForeignKey, Integer, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin


class ParcelStatus(enum.StrEnum):
    pending = "pending"
    in_transit = "in_transit"
    arrived = "arrived"
    picked_up = "picked_up"
    returned = "returned"


class Parcel(Base, TimestampMixin):
    __tablename__ = "parcels"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    company_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("companies.id", ondelete="CASCADE"), nullable=False
    )
    tracking_number: Mapped[str] = mapped_column(String(25), unique=True, nullable=False)

    # Sender info
    sender_name: Mapped[str] = mapped_column(String(100), nullable=False)
    sender_phone: Mapped[str] = mapped_column(String(20), nullable=False)

    # Receiver info
    receiver_name: Mapped[str] = mapped_column(String(100), nullable=False)
    receiver_phone: Mapped[str] = mapped_column(String(20), nullable=False)

    # Locations
    origin_station_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("stations.id", ondelete="RESTRICT"), nullable=False
    )
    destination_station_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("stations.id", ondelete="RESTRICT"), nullable=False
    )

    # Trip linkage — this is the "which bus" field used for mismatch detection
    current_trip_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("trips.id", ondelete="SET NULL"), nullable=True
    )

    # Clerk who created the parcel (accountability)
    created_by_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    # Physical details
    weight_kg: Mapped[float | None] = mapped_column(Numeric(10, 2))
    description: Mapped[str | None] = mapped_column(Text)
    fee_ghs: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False, default=0)
    declared_value_ghs: Mapped[float | None] = mapped_column(Numeric(10, 2), nullable=True)

    # Transition timestamps (populated when status changes)
    loaded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    arrived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    collected_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Status & OTP
    status: Mapped[ParcelStatus] = mapped_column(
        Enum(ParcelStatus, name="parcelstatus"), default=ParcelStatus.pending, nullable=False
    )
    otp_code: Mapped[str | None] = mapped_column(String(6))
    otp_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    otp_attempt_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    # Return reason (populated when status transitions to 'returned')
    return_reason: Mapped[str | None] = mapped_column(String(200), nullable=True)

    # Idempotency key from client (prevents duplicate on retry)
    idempotency_key: Mapped[str | None] = mapped_column(String(64), unique=True)

    # Relationships
    company: Mapped["Company"] = relationship(back_populates="parcels")  # noqa: F821
    origin_station: Mapped["Station"] = relationship(  # noqa: F821
        back_populates="origin_parcels",
        foreign_keys=[origin_station_id],
    )
    destination_station: Mapped["Station"] = relationship(  # noqa: F821
        back_populates="destination_parcels",
        foreign_keys=[destination_station_id],
    )
    current_trip: Mapped["Trip | None"] = relationship(back_populates="parcels")  # noqa: F821
    created_by: Mapped["User | None"] = relationship()  # noqa: F821
    logs: Mapped[list["ParcelLog"]] = relationship(back_populates="parcel")  # noqa: F821
    sms_logs: Mapped[list["SmsLog"]] = relationship(back_populates="parcel")  # noqa: F821


class ParcelLog(Base):
    """Immutable audit trail — every status change is recorded here."""

    __tablename__ = "parcel_logs"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    parcel_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("parcels.id", ondelete="CASCADE"), nullable=False
    )
    clerk_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    previous_status: Mapped[str | None] = mapped_column(String(20))
    new_status: Mapped[str] = mapped_column(String(20), nullable=False)
    note: Mapped[str | None] = mapped_column(Text)
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    # Relationships
    parcel: Mapped["Parcel"] = relationship(back_populates="logs")
    clerk: Mapped["User | None"] = relationship()  # noqa: F821
