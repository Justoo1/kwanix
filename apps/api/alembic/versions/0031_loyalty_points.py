"""add loyalty_accounts and loyalty_transactions tables

Revision ID: 0031
Revises: 0030
Create Date: 2026-04-18

Points accrual: 1 point per GHS 1.00 spent on tickets or parcels.
Redemption: 100 points = GHS 1.00 discount.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0031"
down_revision: str | None = "0030"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

APP_ROLE = "kwanix_app"


def upgrade() -> None:
    op.create_table(
        "loyalty_accounts",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column(
            "company_id",
            sa.Integer,
            sa.ForeignKey("companies.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("phone", sa.String(20), nullable=False, index=True),
        sa.Column("full_name", sa.String(100), nullable=True),
        sa.Column("points_balance", sa.Integer, nullable=False, server_default="0"),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False
        ),
    )
    op.create_index(
        "ix_loyalty_accounts_company_phone",
        "loyalty_accounts",
        ["company_id", "phone"],
        unique=True,
    )

    op.create_table(
        "loyalty_transactions",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column(
            "account_id",
            sa.Integer,
            sa.ForeignKey("loyalty_accounts.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("transaction_type", sa.String(20), nullable=False),
        sa.Column("points", sa.Integer, nullable=False),
        sa.Column("source_type", sa.String(20), nullable=True),
        sa.Column("source_id", sa.Integer, nullable=True),
        sa.Column("note", sa.Text, nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False
        ),
    )

    # RLS for loyalty_accounts
    op.execute("ALTER TABLE loyalty_accounts ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE loyalty_accounts FORCE ROW LEVEL SECURITY")
    op.execute("""
        CREATE POLICY loyalty_accounts_company_isolation ON loyalty_accounts
        USING (
            current_setting('app.current_company_id', true) IS NULL
            OR current_setting('app.current_company_id', true) = ''
            OR company_id = current_setting('app.current_company_id', true)::integer
        )
    """)
    op.execute(f"GRANT SELECT, INSERT, UPDATE, DELETE ON loyalty_accounts TO {APP_ROLE}")
    op.execute(f"GRANT USAGE, SELECT ON loyalty_accounts_id_seq TO {APP_ROLE}")

    # loyalty_transactions inherits RLS via account_id FK — no separate policy needed
    op.execute(f"GRANT SELECT, INSERT ON loyalty_transactions TO {APP_ROLE}")
    op.execute(f"GRANT USAGE, SELECT ON loyalty_transactions_id_seq TO {APP_ROLE}")


def downgrade() -> None:
    op.drop_index("ix_loyalty_accounts_company_phone", table_name="loyalty_accounts")
    op.drop_table("loyalty_transactions")
    op.execute(
        "DROP POLICY IF EXISTS loyalty_accounts_company_isolation ON loyalty_accounts"
    )
    op.execute("ALTER TABLE loyalty_accounts DISABLE ROW LEVEL SECURITY")
    op.drop_table("loyalty_accounts")
