from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class SmsLog(Base):
    __tablename__ = "sms_logs"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    parcel_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("parcels.id", ondelete="SET NULL"), nullable=True
    )
    event_type: Mapped[str] = mapped_column(String(50), nullable=False)
    recipient_phone: Mapped[str] = mapped_column(String(20), nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    # "success", "failed", "pending"
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending")
    arkesel_message_id: Mapped[str | None] = mapped_column(String(100))
    error_detail: Mapped[str | None] = mapped_column(Text)
    sent_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    # Relationships
    parcel: Mapped["Parcel | None"] = relationship(back_populates="sms_logs")  # noqa: F821
