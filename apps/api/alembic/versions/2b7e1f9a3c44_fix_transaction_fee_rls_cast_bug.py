"""fix RLS policy cast bug on transaction_invoices/transaction_fees

Revision ID: 2b7e1f9a3c44
Revises: 1ca50942d045
Create Date: 2026-07-24

The policies added in migration 0025 compared company_id to the session
setting by casting the *setting* to integer:

    company_id = current_setting('app.current_company_id', true)::integer

Every other RLS-protected table (see migration 0002) instead casts
company_id to text:

    (company_id)::text = current_setting('app.current_company_id', true)

The difference matters: when the setting is unset/empty (super_admin
requests, which never SET app.current_company_id), '' ::integer raises
"invalid input syntax for type integer", crashing any query against these
two tables for super_admin — regardless of the guarding IS NULL / = ''
OR-branches, since Postgres does not guarantee short-circuit evaluation
order for security-barrier policy quals. Casting company_id to text instead
never fails, matching the pattern already proven safe everywhere else.
"""
from collections.abc import Sequence

from alembic import op

revision: str = "2b7e1f9a3c44"
down_revision: str | None = "1ca50942d045"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("DROP POLICY IF EXISTS transaction_invoices_company_isolation ON transaction_invoices")
    op.execute(
        """
        CREATE POLICY transaction_invoices_company_isolation ON transaction_invoices
        USING (
            current_setting('app.current_company_id', true) IS NULL
            OR current_setting('app.current_company_id', true) = ''
            OR (company_id)::text = current_setting('app.current_company_id', true)
        )
        """
    )

    op.execute("DROP POLICY IF EXISTS transaction_fees_company_isolation ON transaction_fees")
    op.execute(
        """
        CREATE POLICY transaction_fees_company_isolation ON transaction_fees
        USING (
            current_setting('app.current_company_id', true) IS NULL
            OR current_setting('app.current_company_id', true) = ''
            OR (company_id)::text = current_setting('app.current_company_id', true)
        )
        """
    )


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS transaction_invoices_company_isolation ON transaction_invoices")
    op.execute(
        """
        CREATE POLICY transaction_invoices_company_isolation ON transaction_invoices
        USING (
            current_setting('app.current_company_id', true) IS NULL
            OR current_setting('app.current_company_id', true) = ''
            OR company_id = (current_setting('app.current_company_id', true))::integer
        )
        """
    )

    op.execute("DROP POLICY IF EXISTS transaction_fees_company_isolation ON transaction_fees")
    op.execute(
        """
        CREATE POLICY transaction_fees_company_isolation ON transaction_fees
        USING (
            current_setting('app.current_company_id', true) IS NULL
            OR current_setting('app.current_company_id', true) = ''
            OR company_id = (current_setting('app.current_company_id', true))::integer
        )
        """
    )
