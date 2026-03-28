from sqlalchemy import ForeignKey, Integer
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class TrackingSequence(Base):
    """
    Per-company atomic serial counter for tracking number generation.
    Uses SELECT ... FOR UPDATE to prevent race conditions under concurrent requests.
    """

    __tablename__ = "tracking_sequences"

    company_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("companies.id", ondelete="CASCADE"), primary_key=True
    )
    last_serial: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
