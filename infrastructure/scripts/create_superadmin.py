"""
Create a super_admin user for production/staging.

Usage (on the VPS):
    docker compose --env-file .env.production -f docker-compose.prod.yml \
        exec api python /infrastructure/scripts/create_superadmin.py \
            --email admin@kwanix.com \
            --name "Kwanix Admin" \
            --phone 233200000000

The script is idempotent — re-running with the same email updates the password.
"""

import argparse
import asyncio
import secrets
import string
import sys
from pathlib import Path

try:
    from app.config import settings  # already on path (inside container)
    from app.models import User, UserRole
except ImportError:
    # Running directly on host — add apps/api to path
    sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "apps" / "api"))
    from app.config import settings
    from app.models import User, UserRole

from passlib.context import CryptContext
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# Prefer the admin URL (superuser) so this script works even when
# kwanix_app's password hasn't been synced yet.
_db_url = getattr(settings, "database_admin_url", None) or settings.database_url
engine = create_async_engine(_db_url, echo=False)
SessionLocal = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


def generate_password(length: int = 16) -> str:
    alphabet = string.ascii_letters + string.digits + "!@#$%^&*"
    return "".join(secrets.choice(alphabet) for _ in range(length))


async def create_superadmin(email: str, name: str, phone: str, password: str | None) -> None:
    async with SessionLocal() as db:
        await db.execute(text("SET LOCAL app.current_company_id = ''"))

        existing = (
            await db.execute(select(User).where(User.email == email))
        ).scalar_one_or_none()

        if password is None:
            password = generate_password()
            print(f"Generated password: {password}")
            print("  Save this — it will not be shown again.")

        hashed = pwd_context.hash(password)

        if existing:
            existing.hashed_password = hashed
            existing.full_name = name
            existing.phone = phone
            existing.role = UserRole.super_admin
            print(f"✓ Updated existing user: {email}")
        else:
            user = User(
                company_id=None,
                station_id=None,
                full_name=name,
                phone=phone,
                email=email,
                hashed_password=hashed,
                role=UserRole.super_admin,
            )
            db.add(user)
            print(f"✓ Created super_admin: {email}")

        await db.commit()

    print("\nLogin credentials:")
    print(f"  Email   : {email}")
    print(f"  Password: {password}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Create or reset a Kwanix super admin account")
    parser.add_argument("--email", required=True, help="Admin email address")
    parser.add_argument("--name", required=True, help="Admin full name")
    parser.add_argument("--phone", required=True, help="Phone number (e.g. 233200000000)")
    parser.add_argument("--password", default=None, help="Password (auto-generated if omitted)")
    args = parser.parse_args()

    asyncio.run(create_superadmin(args.email, args.name, args.phone, args.password))
