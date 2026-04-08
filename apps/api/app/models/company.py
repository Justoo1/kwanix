from typing import Any

from sqlalchemy import JSON, Boolean, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin


class Company(Base, TimestampMixin):
    __tablename__ = "companies"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    subdomain: Mapped[str | None] = mapped_column(String(50), unique=True)
    company_code: Mapped[str] = mapped_column(String(10), unique=True, nullable=False)
    api_key: Mapped[str | None] = mapped_column(String(100), unique=True)
    logo_url: Mapped[str | None] = mapped_column(Text)
    brand_color: Mapped[str | None] = mapped_column(String(7))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    weight_tiers: Mapped[list[dict[str, Any]] | None] = mapped_column(JSON, nullable=True)
    max_parcel_weight_kg: Mapped[float | None] = mapped_column(nullable=True)
    sla_threshold_days: Mapped[int] = mapped_column(default=2, nullable=False, server_default="2")

    # Relationships
    stations: Mapped[list["Station"]] = relationship(back_populates="company")  # noqa: F821
    users: Mapped[list["User"]] = relationship(back_populates="company")  # noqa: F821
    vehicles: Mapped[list["Vehicle"]] = relationship(back_populates="company")  # noqa: F821
    trips: Mapped[list["Trip"]] = relationship(back_populates="company")  # noqa: F821
    parcels: Mapped[list["Parcel"]] = relationship(back_populates="company")  # noqa: F821
