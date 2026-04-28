from __future__ import annotations

from datetime import datetime
from decimal import Decimal

from sqlalchemy import CheckConstraint, DateTime, Numeric, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class PlatformConfig(Base):
    """Singleton table — exactly one row (id=1). No RLS, no company_id."""

    __tablename__ = "platform_config"
    __table_args__ = (CheckConstraint("id = 1", name="ck_platform_config_singleton"),)

    id: Mapped[int] = mapped_column(primary_key=True, default=1)
    # "subscription" | "per_transaction"
    billing_mode: Mapped[str] = mapped_column(
        String(20), nullable=False, default="subscription", server_default="'subscription'"
    )
    ticket_fee_ghs: Mapped[Decimal] = mapped_column(
        Numeric(10, 2), nullable=False, default=Decimal("0.50"), server_default="0.50"
    )
    parcel_fee_ghs: Mapped[Decimal] = mapped_column(
        Numeric(10, 2), nullable=False, default=Decimal("0.50"), server_default="0.50"
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=func.now(),
        onupdate=func.now(),
        server_default=func.now(),
    )
