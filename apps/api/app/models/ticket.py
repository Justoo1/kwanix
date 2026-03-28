import enum

from sqlalchemy import Enum, ForeignKey, Integer, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin


class TicketStatus(enum.StrEnum):
    valid = "valid"
    used = "used"
    cancelled = "cancelled"


class PaymentStatus(enum.StrEnum):
    pending = "pending"
    paid = "paid"
    failed = "failed"
    refunded = "refunded"


class Ticket(Base, TimestampMixin):
    __tablename__ = "tickets"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    company_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("companies.id", ondelete="CASCADE"), nullable=False
    )
    trip_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("trips.id", ondelete="RESTRICT"), nullable=False
    )
    created_by_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    passenger_name: Mapped[str] = mapped_column(String(100), nullable=False)
    passenger_phone: Mapped[str] = mapped_column(String(20), nullable=False)
    seat_number: Mapped[int] = mapped_column(Integer, nullable=False)
    fare_ghs: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
    status: Mapped[TicketStatus] = mapped_column(
        Enum(TicketStatus, name="ticketstatus"), default=TicketStatus.valid, nullable=False
    )
    payment_status: Mapped[PaymentStatus] = mapped_column(
        Enum(PaymentStatus, name="paymentstatus"), default=PaymentStatus.pending, nullable=False
    )
    payment_ref: Mapped[str | None] = mapped_column(String(100))

    # Relationships
    trip: Mapped["Trip"] = relationship(back_populates="tickets")  # noqa: F821
    created_by: Mapped["User | None"] = relationship()  # noqa: F821
    payment_events: Mapped[list["PaymentEvent"]] = relationship(back_populates="ticket")  # noqa: F821
