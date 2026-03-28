from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class PaymentEvent(Base):
    """
    Idempotency table for payment provider webhooks.
    A duplicate event (provider retries) is silently acknowledged if already present.
    """

    __tablename__ = "payment_events"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    ticket_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("tickets.id", ondelete="SET NULL"), nullable=True
    )
    # Unique ID from Paystack/Flutterwave — used to detect duplicate webhooks
    provider_event_id: Mapped[str] = mapped_column(String(150), unique=True, nullable=False)
    provider: Mapped[str] = mapped_column(String(30), nullable=False)  # "paystack" | "flutterwave"
    event_type: Mapped[str] = mapped_column(String(60), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False)  # "success" | "failed"
    raw_payload: Mapped[str | None] = mapped_column(Text)
    received_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    # Relationships
    ticket: Mapped["Ticket | None"] = relationship(back_populates="payment_events")  # noqa: F821
