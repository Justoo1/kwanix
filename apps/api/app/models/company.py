from datetime import datetime
from typing import Any

from sqlalchemy import JSON, Boolean, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin


class Company(Base, TimestampMixin):
    __tablename__ = "companies"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    subdomain: Mapped[str | None] = mapped_column(String(50), unique=True)
    company_code: Mapped[str] = mapped_column(String(10), unique=True, nullable=False)
    api_key: Mapped[str | None] = mapped_column(String(100), unique=True)
    logo_url: Mapped[str | None] = mapped_column(Text)
    brand_color: Mapped[str | None] = mapped_column(String(7))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    weight_tiers: Mapped[list[dict[str, Any]] | None] = mapped_column(JSON, nullable=True)
    max_parcel_weight_kg: Mapped[float | None] = mapped_column(nullable=True)
    sla_threshold_days: Mapped[int] = mapped_column(default=2, nullable=False, server_default="2")

    # ── Subscription / billing fields ──────────────────────────────────────────
    # trialing | active | grace | suspended | cancelled
    subscription_status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="trialing", server_default="'trialing'"
    )
    subscription_plan_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("subscription_plans.id", ondelete="SET NULL"), nullable=True
    )
    billing_cycle: Mapped[str | None] = mapped_column(String(10), nullable=True)  # monthly|annual
    trial_ends_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    current_period_end: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    paystack_customer_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    paystack_auth_code: Mapped[str | None] = mapped_column(String(100), nullable=True)
    paystack_subaccount_code: Mapped[str | None] = mapped_column(String(100), nullable=True)
    billing_email: Mapped[str | None] = mapped_column(String(150), nullable=True)
    bank_account_number: Mapped[str | None] = mapped_column(String(30), nullable=True)
    bank_account_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    bank_code: Mapped[str | None] = mapped_column(String(10), nullable=True)

    # Relationships
    stations: Mapped[list["Station"]] = relationship(back_populates="company")  # noqa: F821
    users: Mapped[list["User"]] = relationship(back_populates="company")  # noqa: F821
    vehicles: Mapped[list["Vehicle"]] = relationship(back_populates="company")  # noqa: F821
    trips: Mapped[list["Trip"]] = relationship(back_populates="company")  # noqa: F821
    parcels: Mapped[list["Parcel"]] = relationship(back_populates="company")  # noqa: F821
    subscription_plan: Mapped["SubscriptionPlan | None"] = relationship(  # noqa: F821
        back_populates="companies", foreign_keys=[subscription_plan_id]
    )
    invoices: Mapped[list["SubscriptionInvoice"]] = relationship(  # noqa: F821
        back_populates="company", order_by="SubscriptionInvoice.created_at.desc()"
    )
    transaction_invoices: Mapped[list["TransactionInvoice"]] = relationship(  # noqa: F821
        back_populates="company", order_by="TransactionInvoice.created_at.desc()"
    )
    corporate_accounts: Mapped[list["CorporateAccount"]] = relationship(  # noqa: F821
        back_populates="company", order_by="CorporateAccount.name"
    )
    loyalty_accounts: Mapped[list["LoyaltyAccount"]] = relationship(  # noqa: F821
        back_populates="company"
    )
