"""add platform_config singleton and per-transaction billing tables

Revision ID: 0025
Revises: 0024
Create Date: 2026-04-17

Adds:
  - platform_config table (singleton, no RLS) — controls billing_mode and fee amounts
  - transaction_invoices table (RLS-scoped) — daily batch invoice per company
  - transaction_fees table (RLS-scoped) — one row per ticket/parcel fee event
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0025"
down_revision: str | None = "0024"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

APP_ROLE = "kwanix_app"


def upgrade() -> None:
    # ── 1. platform_config — singleton, no RLS ────────────────────────────────
    op.create_table(
        "platform_config",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column(
            "billing_mode",
            sa.String(20),
            nullable=False,
            server_default="'subscription'",
        ),
        sa.Column(
            "ticket_fee_ghs",
            sa.Numeric(10, 2),
            nullable=False,
            server_default="0.50",
        ),
        sa.Column(
            "parcel_fee_ghs",
            sa.Numeric(10, 2),
            nullable=False,
            server_default="0.50",
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint("id = 1", name="ck_platform_config_singleton"),
    )

    # Seed the single row with defaults (subscription mode, 0.50 GHS per event)
    op.execute(
        "INSERT INTO platform_config (id, billing_mode, ticket_fee_ghs, parcel_fee_ghs) "
        "VALUES (1, 'subscription', 0.50, 0.50)"
    )

    op.execute(f"GRANT SELECT, INSERT, UPDATE, DELETE ON platform_config TO {APP_ROLE}")

    # ── 2. transaction_invoices — RLS-scoped ─────────────────────────────────
    op.create_table(
        "transaction_invoices",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column(
            "company_id",
            sa.Integer,
            sa.ForeignKey("companies.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("amount_ghs", sa.Numeric(10, 2), nullable=False),
        sa.Column("fee_count", sa.Integer, nullable=False, server_default="0"),
        sa.Column("period_date", sa.Date, nullable=False),
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

    op.execute("ALTER TABLE transaction_invoices ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE transaction_invoices FORCE ROW LEVEL SECURITY")
    op.execute("""
        CREATE POLICY transaction_invoices_company_isolation ON transaction_invoices
        USING (
            current_setting('app.current_company_id', true) IS NULL
            OR current_setting('app.current_company_id', true) = ''
            OR company_id = current_setting('app.current_company_id', true)::integer
        )
    """)

    op.execute(f"GRANT SELECT, INSERT, UPDATE, DELETE ON transaction_invoices TO {APP_ROLE}")
    op.execute(f"GRANT USAGE, SELECT ON transaction_invoices_id_seq TO {APP_ROLE}")

    # ── 3. transaction_fees — RLS-scoped ─────────────────────────────────────
    op.create_table(
        "transaction_fees",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column(
            "company_id",
            sa.Integer,
            sa.ForeignKey("companies.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("fee_type", sa.String(10), nullable=False),
        sa.Column("source_id", sa.Integer, nullable=False),
        sa.Column("amount_ghs", sa.Numeric(10, 2), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="'pending'"),
        sa.Column(
            "batch_invoice_id",
            sa.Integer,
            sa.ForeignKey("transaction_invoices.id", ondelete="SET NULL"),
            nullable=True,
        ),
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

    op.create_index(
        "ix_transaction_fees_company_status",
        "transaction_fees",
        ["company_id", "status"],
    )

    op.execute("ALTER TABLE transaction_fees ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE transaction_fees FORCE ROW LEVEL SECURITY")
    op.execute("""
        CREATE POLICY transaction_fees_company_isolation ON transaction_fees
        USING (
            current_setting('app.current_company_id', true) IS NULL
            OR current_setting('app.current_company_id', true) = ''
            OR company_id = current_setting('app.current_company_id', true)::integer
        )
    """)

    op.execute(f"GRANT SELECT, INSERT, UPDATE, DELETE ON transaction_fees TO {APP_ROLE}")
    op.execute(f"GRANT USAGE, SELECT ON transaction_fees_id_seq TO {APP_ROLE}")


def downgrade() -> None:
    op.execute(
        "DROP POLICY IF EXISTS transaction_fees_company_isolation ON transaction_fees"
    )
    op.execute("ALTER TABLE transaction_fees DISABLE ROW LEVEL SECURITY")
    op.drop_index("ix_transaction_fees_company_status", "transaction_fees")
    op.drop_table("transaction_fees")

    op.execute(
        "DROP POLICY IF EXISTS transaction_invoices_company_isolation ON transaction_invoices"
    )
    op.execute("ALTER TABLE transaction_invoices DISABLE ROW LEVEL SECURITY")
    op.drop_table("transaction_invoices")

    op.drop_table("platform_config")
