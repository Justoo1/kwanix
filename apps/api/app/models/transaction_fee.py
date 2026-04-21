from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import Date, DateTime, ForeignKey, Integer, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin

if TYPE_CHECKING:
    from app.models.company import Company


class TransactionInvoice(Base, TimestampMixin):
    __tablename__ = "transaction_invoices"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    company_id: Mapped[int] = mapped_column(
        ForeignKey("companies.id", ondelete="CASCADE"), nullable=False, index=True
    )
    amount_ghs: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    fee_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    period_date: Mapped[date] = mapped_column(Date, nullable=False)
    # "pending" | "paid" | "failed"
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending")
    paystack_reference: Mapped[str | None] = mapped_column(String(100), unique=True, nullable=True)
    paystack_tx_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    failure_reason: Mapped[str | None] = mapped_column(String(255), nullable=True)
    paid_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    company: Mapped[Company] = relationship(back_populates="transaction_invoices")
    fees: Mapped[list[TransactionFee]] = relationship(back_populates="batch_invoice")


class TransactionFee(Base, TimestampMixin):
    __tablename__ = "transaction_fees"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    company_id: Mapped[int] = mapped_column(
        ForeignKey("companies.id", ondelete="CASCADE"), nullable=False, index=True
    )
    # "ticket" | "parcel"
    fee_type: Mapped[str] = mapped_column(String(10), nullable=False)
    source_id: Mapped[int] = mapped_column(Integer, nullable=False)
    amount_ghs: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    # "pending" | "charged" | "failed"
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending")
    batch_invoice_id: Mapped[int | None] = mapped_column(
        ForeignKey("transaction_invoices.id", ondelete="SET NULL"), nullable=True
    )

    batch_invoice: Mapped[TransactionInvoice | None] = relationship(back_populates="fees")
