from sqlalchemy import JSON, Boolean, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin


class Station(Base, TimestampMixin):
    __tablename__ = "stations"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    company_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("companies.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    location_code: Mapped[str | None] = mapped_column(String(10))
    # JSON list of local aliases e.g. ["Neoplan", "Accra Station"]
    # Using JSON instead of ARRAY for cross-DB compatibility (SQLite in tests, Postgres in prod)
    search_aliases: Mapped[list[str] | None] = mapped_column(JSON)
    contact_number: Mapped[str | None] = mapped_column(String(20))
    address: Mapped[str | None] = mapped_column(String(255))
    is_hub: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    # Relationships
    company: Mapped["Company"] = relationship(back_populates="stations")  # noqa: F821
    users: Mapped[list["User"]] = relationship(back_populates="station")  # noqa: F821
    vehicles: Mapped[list["Vehicle"]] = relationship(back_populates="home_station")  # noqa: F821
    departing_trips: Mapped[list["Trip"]] = relationship(  # noqa: F821
        back_populates="departure_station",
        foreign_keys="Trip.departure_station_id",
    )
    arriving_trips: Mapped[list["Trip"]] = relationship(  # noqa: F821
        back_populates="destination_station",
        foreign_keys="Trip.destination_station_id",
    )
    origin_parcels: Mapped[list["Parcel"]] = relationship(  # noqa: F821
        back_populates="origin_station",
        foreign_keys="Parcel.origin_station_id",
    )
    destination_parcels: Mapped[list["Parcel"]] = relationship(  # noqa: F821
        back_populates="destination_station",
        foreign_keys="Parcel.destination_station_id",
    )
