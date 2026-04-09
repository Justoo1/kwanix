"""enable row-level security policies and create app role

Revision ID: 0002
Revises: 0001
Create Date: 2026-03-28

RLS ensures that even if a query forgets to filter by company_id,
PostgreSQL will block cross-tenant row access automatically.
The app sets the session variable 'app.current_company_id' at the
start of each authenticated request (see dependencies/auth.py).

Architecture note on roles:
  - routpass (superuser) — used only for migrations; bypasses RLS automatically.
  - routpass_app (non-superuser) — used by the live application; subject to RLS.
    DATABASE_URL in production/dev must point to routpass_app.
    DATABASE_ADMIN_URL (or Alembic's sqlalchemy.url) uses routpass for DDL.

super_admin users bypass RLS because no session variable is set for them.
"""

import os
from collections.abc import Sequence

from alembic import op

revision: str = "0002"
down_revision: str | None = "0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# Tables to protect with RLS (all company-scoped tables)
RLS_TABLES = ["parcels", "trips", "tickets", "stations", "vehicles", "users"]

# Application role — non-superuser so RLS is enforced
APP_ROLE = "routpass_app"
APP_ROLE_PASSWORD = os.environ.get("APP_ROLE_PASSWORD", "secret_app")


def upgrade() -> None:
    # ── Create the application role ───────────────────────────────────────────
    # IF NOT EXISTS keeps this idempotent across environments.
    op.execute(f"""
        DO $$
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '{APP_ROLE}') THEN
                CREATE ROLE {APP_ROLE} LOGIN PASSWORD '{APP_ROLE_PASSWORD}';
            END IF;
        END
        $$
    """)

    # Grant connect + usage
    op.execute(f"GRANT CONNECT ON DATABASE routpass_db TO {APP_ROLE}")
    op.execute(f"GRANT USAGE ON SCHEMA public TO {APP_ROLE}")

    # Grant DML on all current tables; new tables added later need separate grants.
    op.execute(
        f"GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO {APP_ROLE}"
    )
    op.execute(f"GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO {APP_ROLE}")

    # ── Enable RLS on each company-scoped table ───────────────────────────────
    for table in RLS_TABLES:
        op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")

        # FORCE RLS applies to the table owner (routpass) too, but not to
        # Postgres superusers. routpass_app (non-superuser) is always subject to RLS.
        op.execute(f"ALTER TABLE {table} FORCE ROW LEVEL SECURITY")

        # Policy: rows are visible when company_id matches the session variable,
        # OR when the variable is not set (migrations / super_admin requests).
        op.execute(f"""
            CREATE POLICY {table}_company_isolation ON {table}
            USING (
                current_setting('app.current_company_id', true) IS NULL
                OR current_setting('app.current_company_id', true) = ''
                OR company_id = current_setting('app.current_company_id', true)::integer
            )
        """)


def downgrade() -> None:
    for table in reversed(RLS_TABLES):
        op.execute(f"DROP POLICY IF EXISTS {table}_company_isolation ON {table}")
        op.execute(f"ALTER TABLE {table} DISABLE ROW LEVEL SECURITY")

    # Revoke permissions only if the role exists
    op.execute(f"""
        DO $$
        BEGIN
            IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '{APP_ROLE}') THEN
                REVOKE ALL ON ALL TABLES IN SCHEMA public FROM {APP_ROLE};
                REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM {APP_ROLE};
                REVOKE USAGE ON SCHEMA public FROM {APP_ROLE};
            END IF;
        END
        $$
    """)
    op.execute(f"DROP ROLE IF EXISTS {APP_ROLE}")
