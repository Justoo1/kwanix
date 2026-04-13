import enum
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Enum, ForeignKey, Integer, Numeric
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin


class TripStop(Base):
    """Ordered intermediate/final stops for a trip."""

    __tablename__ = "trip_stops"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    trip_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("trips.id", ondelete="CASCADE"), nullable=False
    )
    station_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("stations.id", ondelete="RESTRICT"), nullable=False
    )
    sequence_order: Mapped[int] = mapped_column(Integer, nullable=False)
    eta: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Relationships
    trip: Mapped["Trip"] = relationship(back_populates="stops")
    station: Mapped["Station"] = relationship()  # noqa: F821


class TripStatus(enum.StrEnum):
    scheduled = "scheduled"
    loading = "loading"
    departed = "departed"
    arrived = "arrived"
    cancelled = "cancelled"


class Trip(Base, TimestampMixin):
    __tablename__ = "trips"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    company_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("companies.id", ondelete="CASCADE"), nullable=False
    )
    vehicle_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("vehicles.id", ondelete="RESTRICT"), nullable=False
    )
    departure_station_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("stations.id", ondelete="RESTRICT"), nullable=False
    )
    destination_station_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("stations.id", ondelete="RESTRICT"), nullable=False
    )
    departure_time: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    status: Mapped[TripStatus] = mapped_column(
        Enum(TripStatus, name="tripstatus"), default=TripStatus.scheduled, nullable=False
    )
    price_parcel_base: Mapped[float | None] = mapped_column(Numeric(10, 2))
    price_ticket_base: Mapped[float | None] = mapped_column(Numeric(10, 2))
    booking_open: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    driver_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    # Relationships
    company: Mapped["Company"] = relationship(back_populates="trips")  # noqa: F821
    vehicle: Mapped["Vehicle"] = relationship(back_populates="trips")  # noqa: F821
    departure_station: Mapped["Station"] = relationship(  # noqa: F821
        back_populates="departing_trips",
        foreign_keys=[departure_station_id],
    )
    destination_station: Mapped["Station"] = relationship(  # noqa: F821
        back_populates="arriving_trips",
        foreign_keys=[destination_station_id],
    )
    parcels: Mapped[list["Parcel"]] = relationship(back_populates="current_trip")  # noqa: F821
    tickets: Mapped[list["Ticket"]] = relationship(back_populates="trip")  # noqa: F821
    stops: Mapped[list["TripStop"]] = relationship(  # noqa: F821
        back_populates="trip", order_by="TripStop.sequence_order"
    )
    driver: Mapped["User | None"] = relationship(foreign_keys=[driver_id])  # noqa: F821
