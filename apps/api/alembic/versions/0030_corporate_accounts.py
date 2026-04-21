"""add corporate_accounts table

Revision ID: 0030
Revises: 0029
Create Date: 2026-04-18
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0030"
down_revision: str | None = "0029"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

APP_ROLE = "kwanix_app"


def upgrade() -> None:
    op.create_table(
        "corporate_accounts",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column(
            "company_id",
            sa.Integer,
            sa.ForeignKey("companies.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("name", sa.String(150), nullable=False),
        sa.Column("contact_name", sa.String(100), nullable=True),
        sa.Column("contact_phone", sa.String(20), nullable=True),
        sa.Column("contact_email", sa.String(150), nullable=True),
        sa.Column("credit_limit_ghs", sa.Numeric(12, 2), nullable=False, server_default="0.00"),
        sa.Column("credit_used_ghs", sa.Numeric(12, 2), nullable=False, server_default="0.00"),
        sa.Column("notes", sa.Text, nullable=True),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default="true"),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False
        ),
    )

    op.execute("ALTER TABLE corporate_accounts ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE corporate_accounts FORCE ROW LEVEL SECURITY")
    op.execute("""
        CREATE POLICY corporate_accounts_company_isolation ON corporate_accounts
        USING (
            current_setting('app.current_company_id', true) IS NULL
            OR current_setting('app.current_company_id', true) = ''
            OR company_id = current_setting('app.current_company_id', true)::integer
        )
    """)
    op.execute(f"GRANT SELECT, INSERT, UPDATE, DELETE ON corporate_accounts TO {APP_ROLE}")
    op.execute(f"GRANT USAGE, SELECT ON corporate_accounts_id_seq TO {APP_ROLE}")


def downgrade() -> None:
    op.execute(
        "DROP POLICY IF EXISTS corporate_accounts_company_isolation ON corporate_accounts"
    )
    op.execute("ALTER TABLE corporate_accounts DISABLE ROW LEVEL SECURITY")
    op.drop_table("corporate_accounts")
