"""
Seed script: creates demo data for local development.

Run from the apps/api directory:
    python ../../infrastructure/scripts/seed_db.py

Creates:
  - 1 demo company: STC (Intercity STC)
  - 3 stations:     Accra (hub), Kumasi, Prestea
  - 1 vehicle:      GR-1234-24
  - 1 super_admin user
  - 1 company_admin user
  - 1 station_clerk user (Accra station)
  - tracking_sequences row for STC
"""

import asyncio
import sys
from pathlib import Path

# Allow running from repo root or apps/api
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "apps" / "api"))

from passlib.context import CryptContext
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.config import settings
from app.models import (  # noqa: F401 — needed for table creation
    Company,
    Parcel,
    ParcelLog,
    PaymentEvent,
    SmsLog,
    Station,
    Ticket,
    TrackingSequence,
    Trip,
    User,
    UserRole,
    Vehicle,
)
from app.database import Base

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

engine = create_async_engine(settings.database_url, echo=False)
SessionLocal = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


async def seed():
    # Create tables if they don't exist (useful for fresh dev env without running alembic)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with SessionLocal() as db:
        # Bypass RLS for seeding
        await db.execute(text("SET LOCAL app.current_company_id = ''"))

        # ── Company ───────────────────────────────────────────────────────────
        company = Company(
            name="Intercity STC",
            subdomain="stc",
            company_code="STC",
            is_active=True,
        )
        db.add(company)
        await db.flush()
        print(f"✓ Company created: {company.name} (id={company.id})")

        # ── Stations ──────────────────────────────────────────────────────────
        accra = Station(
            company_id=company.id,
            name="Accra — Neoplan",
            location_code="ACC",
            search_aliases=["Neoplan", "Accra", "Accra Station"],
            contact_number="233302123456",
            is_hub=True,
            latitude=5.603717,
            longitude=-0.186964,
        )
        kumasi = Station(
            company_id=company.id,
            name="Kumasi — Kejetia",
            location_code="KSI",
            search_aliases=["Kejetia", "Kumasi"],
            contact_number="233322123456",
            latitude=6.687800,
            longitude=-1.624000,
        )
        prestea = Station(
            company_id=company.id,
            name="Prestea",
            location_code="PRE",
            search_aliases=["Prestea Bondaye"],
            contact_number="233312123456",
            latitude=5.432500,
            longitude=-2.143600,
        )
        db.add_all([accra, kumasi, prestea])
        await db.flush()
        print(f"✓ Stations created: {accra.name}, {kumasi.name}, {prestea.name}")

        # ── Vehicle ───────────────────────────────────────────────────────────
        vehicle = Vehicle(
            company_id=company.id,
            home_station_id=accra.id,
            plate_number="GR-1234-24",
            model="DAF CF",
            capacity=50,
        )
        db.add(vehicle)
        await db.flush()
        print(f"✓ Vehicle created: {vehicle.plate_number}")

        # ── Users ─────────────────────────────────────────────────────────────
        super_admin = User(
            company_id=None,
            station_id=None,
            full_name="Kwanix Admin",
            phone="233200000000",
            email="admin@kwanix.io",
            hashed_password=pwd_context.hash("admin123!"),
            role=UserRole.super_admin,
        )
        company_admin = User(
            company_id=company.id,
            station_id=None,
            full_name="STC Manager",
            phone="233201111111",
            email="manager@stc.kwanix.io",
            hashed_password=pwd_context.hash("manager123!"),
            role=UserRole.company_admin,
        )
        clerk = User(
            company_id=company.id,
            station_id=accra.id,
            full_name="Ama Clerk",
            phone="233542222222",
            email="ama@stc.kwanix.io",
            hashed_password=pwd_context.hash("clerk123!"),
            role=UserRole.station_clerk,
        )
        demo_driver = User(
            company_id=company.id,
            station_id=None,
            full_name="Kwame Driver",
            phone="233541234567",
            email="driver@stc.kwanix.io",
            hashed_password=pwd_context.hash("driver123!"),
            role=UserRole.driver,
        )
        db.add_all([super_admin, company_admin, clerk, demo_driver])
        await db.flush()
        print(
            f"✓ Users created: {super_admin.email}, {company_admin.email}, "
            f"{clerk.email}, {demo_driver.email}"
        )

        # ── Tracking sequence ─────────────────────────────────────────────────
        seq = TrackingSequence(company_id=company.id, last_serial=0)
        db.add(seq)
        await db.flush()
        print(f"✓ Tracking sequence initialized for company {company.company_code}")

        await db.commit()

    print("\n✅ Seed complete.")
    print("\nDemo credentials:")
    print("  super_admin  : admin@kwanix.io       / admin123!")
    print("  company_admin: manager@stc.kwanix.io / manager123!")
    print("  clerk        : ama@stc.kwanix.io     / clerk123!")
    print("  driver       : driver@stc.kwanix.io  / driver123!")


if __name__ == "__main__":
    asyncio.run(seed())
