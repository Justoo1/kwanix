"""
Subscription and billing models.

SubscriptionPlan  — super_admin-managed plan catalog (Starter / Growth / Enterprise)
SubscriptionInvoice — one row per billing event per company
"""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin

if TYPE_CHECKING:
    from app.models.company import Company


class SubscriptionPlan(Base, TimestampMixin):
    __tablename__ = "subscription_plans"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(50), nullable=False)
    # NULL = unlimited vehicles
    max_vehicles: Mapped[int | None] = mapped_column(Integer, nullable=True)
    price_ghs_month: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    price_ghs_annual: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    companies: Mapped[list[Company]] = relationship(back_populates="subscription_plan")
    invoices: Mapped[list[SubscriptionInvoice]] = relationship(back_populates="plan")


class SubscriptionInvoice(Base, TimestampMixin):
    __tablename__ = "subscription_invoices"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    company_id: Mapped[int] = mapped_column(
        ForeignKey("companies.id", ondelete="CASCADE"), nullable=False, index=True
    )
    plan_id: Mapped[int | None] = mapped_column(
        ForeignKey("subscription_plans.id", ondelete="SET NULL"), nullable=True
    )
    amount_ghs: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    # "monthly" or "annual"
    billing_cycle: Mapped[str] = mapped_column(String(10), nullable=False)
    period_start: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    period_end: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    # "pending" | "paid" | "failed" | "refunded"
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending")
    paystack_reference: Mapped[str | None] = mapped_column(String(100), unique=True, nullable=True)
    paystack_tx_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    failure_reason: Mapped[str | None] = mapped_column(String(255), nullable=True)
    paid_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    company: Mapped[Company] = relationship(back_populates="invoices")
    plan: Mapped[SubscriptionPlan | None] = relationship(back_populates="invoices")
