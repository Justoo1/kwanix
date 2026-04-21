from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin

if TYPE_CHECKING:
    from app.models.company import Company


class LoyaltyAccount(Base, TimestampMixin):
    """One loyalty account per phone number per company."""

    __tablename__ = "loyalty_accounts"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    company_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("companies.id", ondelete="CASCADE"), nullable=False, index=True
    )
    phone: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    full_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    points_balance: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    company: Mapped[Company] = relationship(back_populates="loyalty_accounts")
    transactions: Mapped[list[LoyaltyTransaction]] = relationship(
        back_populates="account", order_by="LoyaltyTransaction.created_at.desc()"
    )


class LoyaltyTransaction(Base):
    """Immutable ledger entry for loyalty point accrual or redemption."""

    __tablename__ = "loyalty_transactions"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    account_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("loyalty_accounts.id", ondelete="CASCADE"), nullable=False, index=True
    )
    # "earn" | "redeem" | "adjustment"
    transaction_type: Mapped[str] = mapped_column(String(20), nullable=False)
    points: Mapped[int] = mapped_column(Integer, nullable=False)
    # Reference to the source (ticket_id or parcel_id)
    source_type: Mapped[str | None] = mapped_column(String(20), nullable=True)
    source_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )

    account: Mapped[LoyaltyAccount] = relationship(back_populates="transactions")
