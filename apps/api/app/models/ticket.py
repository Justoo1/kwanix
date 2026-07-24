import enum
from datetime import datetime

from sqlalchemy import DateTime, Enum, ForeignKey, Integer, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin


class TicketSource(enum.StrEnum):
    counter = "counter"
    online = "online"


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
    passenger_email: Mapped[str | None] = mapped_column(String(254), nullable=True)
    source: Mapped[TicketSource] = mapped_column(
        Enum(TicketSource, name="ticketsource"), default=TicketSource.counter, nullable=False
    )
    booking_expires_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    reminder_sent_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    refund_ref: Mapped[str | None] = mapped_column(String(100), nullable=True)
    eta_sms_sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    pickup_station_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("stations.id", ondelete="SET NULL"), nullable=True
    )
    tracking_link_sent_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    # "cash" | "momo" | "card" | "online" — how the passenger paid (or is paying).
    payment_method: Mapped[str | None] = mapped_column(String(20), nullable=True)
    # Set once the platform's per-transaction fee has been recorded for this
    # ticket (either via a Paystack transaction_charge split, or — when the
    # company has no subaccount linked to split against — via the
    # TransactionFee ledger, same as cash). Prevents double-recording across
    # the webhook and synchronous verify paths.
    fee_recorded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Relationships
    trip: Mapped["Trip"] = relationship(back_populates="tickets")  # noqa: F821
    created_by: Mapped["User | None"] = relationship()  # noqa: F821
    payment_events: Mapped[list["PaymentEvent"]] = relationship(back_populates="ticket")  # noqa: F821
    pickup_station: Mapped["Station | None"] = relationship()  # noqa: F821
