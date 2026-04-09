"""fix RLS integer cast error on empty company_id setting

Revision ID: 0003
Revises: 0002
Create Date: 2026-03-28

PostgreSQL does not guarantee short-circuit evaluation of OR in USING clauses.
When app.current_company_id is '' (empty string) the previous policy evaluated
    company_id = ''::integer
before the '' guard could fire, causing:
    invalid input syntax for type integer: ""

Fix: compare company_id::text against the setting string instead of casting
the setting to integer. This avoids the failing cast entirely.
"""

from collections.abc import Sequence

from alembic import op

revision: str = "0003"
down_revision: str | None = "0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

RLS_TABLES = ["parcels", "trips", "tickets", "stations", "vehicles", "users"]


def upgrade() -> None:
    for table in RLS_TABLES:
        op.execute(f"DROP POLICY IF EXISTS {table}_company_isolation ON {table}")
        op.execute(f"""
            CREATE POLICY {table}_company_isolation ON {table}
            USING (
                current_setting('app.current_company_id', true) IS NULL
                OR current_setting('app.current_company_id', true) = ''
                OR company_id::text = current_setting('app.current_company_id', true)
            )
        """)


def downgrade() -> None:
    for table in RLS_TABLES:
        op.execute(f"DROP POLICY IF EXISTS {table}_company_isolation ON {table}")
        op.execute(f"""
            CREATE POLICY {table}_company_isolation ON {table}
            USING (
                current_setting('app.current_company_id', true) IS NULL
                OR current_setting('app.current_company_id', true) = ''
                OR company_id = current_setting('app.current_company_id', true)::integer
            )
        """)
