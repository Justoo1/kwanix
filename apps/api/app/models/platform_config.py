from __future__ import annotations

from datetime import datetime
from decimal import Decimal

from sqlalchemy import CheckConstraint, DateTime, Numeric, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class PlatformConfig(Base):
    """Singleton table — exactly one row (id=1). No RLS, no company_id.

    Billing mode and the transaction fee percentage are per-company
    (see Company.billing_mode / Company.transaction_fee_pct). This table only
    holds the platform-wide default fee percentage used as a fallback for
    companies that don't have a custom rate set.
    """

    __tablename__ = "platform_config"
    __table_args__ = (CheckConstraint("id = 1", name="ck_platform_config_singleton"),)

    id: Mapped[int] = mapped_column(primary_key=True, default=1)
    # Default percentage (e.g. 5.00 = 5%) applied to per_transaction companies
    # that don't have their own Company.transaction_fee_pct set.
    default_fee_pct: Mapped[Decimal] = mapped_column(
        Numeric(5, 2), nullable=False, default=Decimal("5.00"), server_default="5.00"
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=func.now(),
        onupdate=func.now(),
        server_default=func.now(),
    )
