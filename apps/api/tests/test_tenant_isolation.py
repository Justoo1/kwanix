"""
Tenant isolation tests — requires a live PostgreSQL instance.

These tests verify that PostgreSQL Row-Level Security (RLS) policies
correctly prevent clerks from Company A from reading Company B's data.
They run against the real Postgres defined by DATABASE_URL (the same
container used in docker-compose) and are marked `postgres` so they
can be targeted or skipped independently:

    pytest -m postgres           # run only these
    pytest -m "not postgres"     # skip these (SQLite-only CI)

Architecture tested:
  - routpass (superuser) → seeds data and cleans up; bypasses RLS
  - routpass_app (non-superuser) → the role the live app uses; subject to RLS
  The test seeds via admin, queries via app, verifies isolation, then deletes.
"""

import os
import uuid

import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy.pool import NullPool

pytestmark = pytest.mark.postgres

# ── Connection strings ────────────────────────────────────────────────────────

# routpass_app is the non-superuser application role — RLS is enforced.
_APP_URL = os.getenv(
    "DATABASE_URL",
    "postgresql+asyncpg://routpass_app:secret_app@postgres:5432/routpass_db",
)

# routpass is the superuser role — used for seeding and cleanup only.
_ADMIN_URL = os.getenv(
    "DATABASE_ADMIN_URL",
    "postgresql+asyncpg://routpass:secret@postgres:5432/routpass_db",
)


def _app_engine():
    return create_async_engine(_APP_URL, poolclass=NullPool)


def _admin_engine():
    return create_async_engine(_ADMIN_URL, poolclass=NullPool)


# ── Tests ──────────────────────────────────────────────────────────────────────


class TestRLSTenantIsolation:
    @pytest.mark.asyncio
    async def test_clerk_cannot_read_other_company_parcel(self):
        """
        Company A clerk sets RLS context, then queries Company B's parcel ID.
        RLS must return zero rows → parcel_service raises 404.
        """
        suffix = uuid.uuid4().hex[:6].upper()
        code_a, code_b = f"A{suffix}", f"B{suffix}"

        admin_engine = _admin_engine()
        app_engine = _app_engine()
        parcel_b_id = None

        try:
            # ── Seed via admin (commits so app connection can see it) ──────────
            async with admin_engine.connect() as conn:
                await conn.execute(text("BEGIN"))
                r = await conn.execute(
                    text(
                        "INSERT INTO companies (name, company_code, is_active)"
                        " VALUES (:n, :c, true) RETURNING id"
                    ),
                    {"n": f"Company {code_a}", "c": code_a},
                )
                cid_a = r.scalar()
                r = await conn.execute(
                    text(
                        "INSERT INTO companies (name, company_code, is_active)"
                        " VALUES (:n, :c, true) RETURNING id"
                    ),
                    {"n": f"Company {code_b}", "c": code_b},
                )
                cid_b = r.scalar()

                r = await conn.execute(
                    text(
                        "INSERT INTO stations (company_id, name, location_code)"
                        " VALUES (:c, 'StaA', 'SAA') RETURNING id"
                    ),
                    {"c": cid_a},
                )
                _sid_a = r.scalar()
                r = await conn.execute(
                    text(
                        "INSERT INTO stations (company_id, name, location_code)"
                        " VALUES (:c, 'StaB1', 'SB1') RETURNING id"
                    ),
                    {"c": cid_b},
                )
                sid_b = r.scalar()
                r = await conn.execute(
                    text(
                        "INSERT INTO stations (company_id, name, location_code)"
                        " VALUES (:c, 'StaB2', 'SB2') RETURNING id"
                    ),
                    {"c": cid_b},
                )
                sid_b2 = r.scalar()

                r = await conn.execute(
                    text(
                        "INSERT INTO users"
                        " (company_id, station_id, full_name, phone, hashed_password, role)"
                        " VALUES (:c, :s, 'Clerk B', '233541000099', 'x', 'station_clerk')"
                        " RETURNING id"
                    ),
                    {"c": cid_b, "s": sid_b},
                )
                uid_b = r.scalar()

                r = await conn.execute(
                    text(
                        "INSERT INTO parcels"
                        " (company_id, tracking_number, sender_name, sender_phone,"
                        "  receiver_name, receiver_phone, origin_station_id,"
                        "  destination_station_id, fee_ghs, created_by_id, status)"
                        " VALUES (:c, :tn, 'S', '233541111111', 'R', '233542222222',"
                        "         :o, :d, 10, :u, 'pending') RETURNING id"
                    ),
                    {
                        "c": cid_b,
                        "tn": f"RP-{code_b}-2026-00001",
                        "o": sid_b,
                        "d": sid_b2,
                        "u": uid_b,
                    },
                )
                parcel_b_id = r.scalar()
                await conn.execute(text("COMMIT"))

            # ── Query via app role with RLS set to company A ──────────────────
            async with app_engine.connect() as conn:
                await conn.execute(text("BEGIN"))
                await conn.execute(text(f"SET LOCAL app.current_company_id = {int(cid_a)}"))
                result = await conn.execute(
                    text("SELECT id FROM parcels WHERE id = :pid"),
                    {"pid": parcel_b_id},
                )
                visible_ids = [row[0] for row in result.fetchall()]
                await conn.execute(text("ROLLBACK"))

            assert visible_ids == [], (
                f"RLS FAILED: Company A (id={cid_a}) can see Company B's parcel "
                f"(id={parcel_b_id}, company_id={cid_b}). "
                f"visible_ids={visible_ids}"
            )

        finally:
            # ── Cleanup ───────────────────────────────────────────────────────
            if parcel_b_id is not None:
                async with admin_engine.connect() as conn:
                    await conn.execute(text("BEGIN"))
                    await conn.execute(
                        text("DELETE FROM companies WHERE company_code IN (:ca, :cb)"),
                        {"ca": code_a, "cb": code_b},
                    )
                    await conn.execute(text("COMMIT"))
            await admin_engine.dispose()
            await app_engine.dispose()

    @pytest.mark.asyncio
    async def test_clerk_can_read_own_company_parcel(self):
        """
        Clerk reads their own company's parcel → row is visible (RLS allows it).
        """
        suffix = uuid.uuid4().hex[:6].upper()
        code = f"C{suffix}"

        admin_engine = _admin_engine()
        app_engine = _app_engine()
        parcel_id = None

        try:
            async with admin_engine.connect() as conn:
                await conn.execute(text("BEGIN"))
                r = await conn.execute(
                    text(
                        "INSERT INTO companies (name, company_code, is_active)"
                        " VALUES (:n, :c, true) RETURNING id"
                    ),
                    {"n": f"Company {code}", "c": code},
                )
                cid = r.scalar()

                r = await conn.execute(
                    text(
                        "INSERT INTO stations (company_id, name, location_code)"
                        " VALUES (:c, 'Sta1', 'S11') RETURNING id"
                    ),
                    {"c": cid},
                )
                sid1 = r.scalar()
                r = await conn.execute(
                    text(
                        "INSERT INTO stations (company_id, name, location_code)"
                        " VALUES (:c, 'Sta2', 'S22') RETURNING id"
                    ),
                    {"c": cid},
                )
                sid2 = r.scalar()

                r = await conn.execute(
                    text(
                        "INSERT INTO users"
                        " (company_id, station_id, full_name, phone, hashed_password, role)"
                        " VALUES (:c, :s, 'Clerk C', '233541000098', 'x', 'station_clerk')"
                        " RETURNING id"
                    ),
                    {"c": cid, "s": sid1},
                )
                uid = r.scalar()

                r = await conn.execute(
                    text(
                        "INSERT INTO parcels"
                        " (company_id, tracking_number, sender_name, sender_phone,"
                        "  receiver_name, receiver_phone, origin_station_id,"
                        "  destination_station_id, fee_ghs, created_by_id, status)"
                        " VALUES (:c, :tn, 'S', '233541111111', 'R', '233542222222',"
                        "         :o, :d, 10, :u, 'pending') RETURNING id"
                    ),
                    {
                        "c": cid,
                        "tn": f"RP-{code}-2026-00001",
                        "o": sid1,
                        "d": sid2,
                        "u": uid,
                    },
                )
                parcel_id = r.scalar()
                await conn.execute(text("COMMIT"))

            async with app_engine.connect() as conn:
                await conn.execute(text("BEGIN"))
                await conn.execute(text(f"SET LOCAL app.current_company_id = {int(cid)}"))
                result = await conn.execute(
                    text("SELECT id FROM parcels WHERE id = :pid"),
                    {"pid": parcel_id},
                )
                visible_ids = [row[0] for row in result.fetchall()]
                await conn.execute(text("ROLLBACK"))

            assert visible_ids == [parcel_id], (
                f"RLS should allow Company {code} clerk to see their own parcel. "
                f"visible_ids={visible_ids}"
            )

        finally:
            if parcel_id is not None:
                async with admin_engine.connect() as conn:
                    await conn.execute(text("BEGIN"))
                    await conn.execute(
                        text("DELETE FROM companies WHERE company_code = :c"),
                        {"c": code},
                    )
                    await conn.execute(text("COMMIT"))
            await admin_engine.dispose()
            await app_engine.dispose()

    @pytest.mark.asyncio
    async def test_set_local_is_transaction_scoped(self):
        """
        SET LOCAL app.current_company_id applies within a transaction
        and is readable via current_setting().
        """
        engine = _app_engine()
        try:
            async with engine.connect() as conn:
                await conn.execute(text("BEGIN"))
                await conn.execute(text("SET LOCAL app.current_company_id = 999"))
                result = await conn.execute(
                    text("SELECT current_setting('app.current_company_id', true)")
                )
                val = result.scalar()
                await conn.execute(text("ROLLBACK"))
            assert val == "999"
        finally:
            await engine.dispose()
