"""add subscription plans, invoices, and billing fields on companies

Revision ID: 0020
Revises: 0019
Create Date: 2026-04-08

Adds:
  - subscription_plans table (super_admin-managed plan catalog)
  - subscription_invoices table (per-company billing events, RLS-protected)
  - billing columns on companies (status, plan FK, dates, Paystack refs, bank details)

Existing companies are backfilled with trial_ends_at = created_at + 30 days
and subscription_status = 'trialing'.

Three default plans are seeded: Starter, Growth, Enterprise.
"""

from collections.abc import Sequence
from datetime import datetime, timezone

import sqlalchemy as sa
from alembic import op

revision: str = "0020"
down_revision: str | None = "0019"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

APP_ROLE = "kwanix_app"


def upgrade() -> None:
    # ── 1. Create subscription_plans table (no FK dependencies) ──────────────
    op.create_table(
        "subscription_plans",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("name", sa.String(50), nullable=False),
        sa.Column("max_vehicles", sa.Integer, nullable=True),  # NULL = unlimited
        sa.Column("price_ghs_month", sa.Numeric(10, 2), nullable=False),
        sa.Column("price_ghs_annual", sa.Numeric(10, 2), nullable=False),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default="true"),
        sa.Column("sort_order", sa.Integer, nullable=False, server_default="0"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    )

    # ── 2. Add billing columns to companies ───────────────────────────────────
    op.add_column(
        "companies",
        sa.Column(
            "subscription_status",
            sa.String(20),
            nullable=False,
            server_default="'trialing'",
        ),
    )
    op.add_column(
        "companies",
        sa.Column("subscription_plan_id", sa.Integer, sa.ForeignKey("subscription_plans.id", ondelete="SET NULL"), nullable=True),
    )
    op.add_column("companies", sa.Column("billing_cycle", sa.String(10), nullable=True))
    op.add_column("companies", sa.Column("trial_ends_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("companies", sa.Column("current_period_end", sa.DateTime(timezone=True), nullable=True))
    op.add_column("companies", sa.Column("paystack_customer_id", sa.String(100), nullable=True))
    op.add_column("companies", sa.Column("paystack_auth_code", sa.String(100), nullable=True))
    op.create_index(
        "uq_companies_paystack_auth_code",
        "companies",
        ["paystack_auth_code"],
        unique=True,
        postgresql_where=sa.text("paystack_auth_code IS NOT NULL"),
    )
    op.add_column("companies", sa.Column("paystack_subaccount_code", sa.String(100), nullable=True))
    op.add_column("companies", sa.Column("billing_email", sa.String(150), nullable=True))
    op.add_column("companies", sa.Column("bank_account_number", sa.String(30), nullable=True))
    op.add_column("companies", sa.Column("bank_account_name", sa.String(100), nullable=True))
    op.add_column("companies", sa.Column("bank_code", sa.String(10), nullable=True))
    op.create_index(
        "ix_companies_subscription_status",
        "companies",
        ["subscription_status"],
    )

    # ── 3. Create subscription_invoices table ─────────────────────────────────
    op.create_table(
        "subscription_invoices",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column(
            "company_id",
            sa.Integer,
            sa.ForeignKey("companies.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column(
            "plan_id",
            sa.Integer,
            sa.ForeignKey("subscription_plans.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("amount_ghs", sa.Numeric(10, 2), nullable=False),
        sa.Column("billing_cycle", sa.String(10), nullable=False),
        sa.Column("period_start", sa.DateTime(timezone=True), nullable=False),
        sa.Column("period_end", sa.DateTime(timezone=True), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="'pending'"),
        sa.Column("paystack_reference", sa.String(100), unique=True, nullable=True),
        sa.Column("paystack_tx_id", sa.String(100), nullable=True),
        sa.Column("failure_reason", sa.String(255), nullable=True),
        sa.Column("paid_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    )

    # ── 4. RLS on subscription_invoices ───────────────────────────────────────
    op.execute("ALTER TABLE subscription_invoices ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE subscription_invoices FORCE ROW LEVEL SECURITY")
    op.execute("""
        CREATE POLICY subscription_invoices_company_isolation ON subscription_invoices
        USING (
            current_setting('app.current_company_id', true) IS NULL
            OR current_setting('app.current_company_id', true) = ''
            OR company_id = current_setting('app.current_company_id', true)::integer
        )
    """)

    # ── 5. Grant permissions to app role ──────────────────────────────────────
    op.execute(
        f"GRANT SELECT, INSERT, UPDATE, DELETE ON subscription_plans TO {APP_ROLE}"
    )
    op.execute(
        f"GRANT SELECT, INSERT, UPDATE, DELETE ON subscription_invoices TO {APP_ROLE}"
    )
    op.execute(f"GRANT USAGE, SELECT ON subscription_plans_id_seq TO {APP_ROLE}")
    op.execute(f"GRANT USAGE, SELECT ON subscription_invoices_id_seq TO {APP_ROLE}")

    # ── 6. Backfill trial_ends_at for existing companies ──────────────────────
    op.execute("""
        UPDATE companies
        SET trial_ends_at = created_at + INTERVAL '30 days'
        WHERE trial_ends_at IS NULL
    """)

    # ── 7. Seed default plans ─────────────────────────────────────────────────
    op.execute("""
        INSERT INTO subscription_plans (name, max_vehicles, price_ghs_month, price_ghs_annual, sort_order)
        VALUES
            ('Starter',    5,    500.00,  5500.00,  0),
            ('Growth',     20,   1500.00, 16500.00, 1),
            ('Enterprise', NULL, 3500.00, 38500.00, 2)
    """)


def downgrade() -> None:
    # Drop RLS first, then tables/columns in reverse dependency order
    op.execute("DROP POLICY IF EXISTS subscription_invoices_company_isolation ON subscription_invoices")
    op.execute("ALTER TABLE subscription_invoices DISABLE ROW LEVEL SECURITY")
    op.drop_table("subscription_invoices")

    op.drop_column("companies", "bank_code")
    op.drop_column("companies", "bank_account_name")
    op.drop_column("companies", "bank_account_number")
    op.drop_column("companies", "billing_email")
    op.drop_column("companies", "paystack_subaccount_code")
    op.drop_index("uq_companies_paystack_auth_code", "companies")
    op.drop_column("companies", "paystack_auth_code")
    op.drop_column("companies", "paystack_customer_id")
    op.drop_column("companies", "current_period_end")
    op.drop_column("companies", "trial_ends_at")
    op.drop_column("companies", "billing_cycle")
    op.drop_column("companies", "subscription_plan_id")
    op.drop_index("ix_companies_subscription_status", "companies")
    op.drop_column("companies", "subscription_status")

    op.drop_table("subscription_plans")
