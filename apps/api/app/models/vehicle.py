from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

if TYPE_CHECKING:
    from app.models.user import User

from app.models.base import Base, TimestampMixin


class Vehicle(Base, TimestampMixin):
    __tablename__ = "vehicles"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    company_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("companies.id", ondelete="CASCADE"), nullable=False
    )
    home_station_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("stations.id", ondelete="SET NULL"), nullable=True
    )
    plate_number: Mapped[str] = mapped_column(String(20), unique=True, nullable=False)
    model: Mapped[str | None] = mapped_column(String(100))
    capacity: Mapped[int] = mapped_column(Integer, default=50, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    is_available: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    default_driver_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    # Relationships
    company: Mapped["Company"] = relationship(back_populates="vehicles")  # noqa: F821
    home_station: Mapped["Station | None"] = relationship(back_populates="vehicles")  # noqa: F821
    trips: Mapped[list["Trip"]] = relationship(back_populates="vehicle")  # noqa: F821
    default_driver: Mapped["User | None"] = relationship(foreign_keys=[default_driver_id])  # noqa: F821
    maintenance_logs: Mapped[list["VehicleMaintenanceLog"]] = relationship(  # noqa: F821
        back_populates="vehicle", order_by="VehicleMaintenanceLog.occurred_at.desc()"
    )


class VehicleMaintenanceLog(Base):
    """Immutable maintenance audit trail for a vehicle."""

    __tablename__ = "vehicle_maintenance_logs"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    vehicle_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("vehicles.id", ondelete="CASCADE"), nullable=False
    )
    created_by_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    note: Mapped[str] = mapped_column(Text, nullable=False)
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    # Relationships
    vehicle: Mapped["Vehicle"] = relationship(back_populates="maintenance_logs")
    created_by: Mapped["User | None"] = relationship()  # noqa: F821
