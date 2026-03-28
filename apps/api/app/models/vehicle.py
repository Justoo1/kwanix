from sqlalchemy import Boolean, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

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

    # Relationships
    company: Mapped["Company"] = relationship(back_populates="vehicles")  # noqa: F821
    home_station: Mapped["Station | None"] = relationship(back_populates="vehicles")  # noqa: F821
    trips: Mapped[list["Trip"]] = relationship(back_populates="vehicle")  # noqa: F821
