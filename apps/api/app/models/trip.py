import enum
from datetime import datetime

from sqlalchemy import DateTime, Enum, ForeignKey, Integer, Numeric
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin


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
