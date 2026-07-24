import contextlib
from datetime import UTC, datetime, timedelta

from jose import jwt
from passlib.context import CryptContext
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.user import User
from app.utils.phone import normalize_gh_phone

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def hash_password(plain: str) -> str:
    return pwd_context.hash(plain)


def create_access_token(user: User) -> str:
    expire = datetime.now(UTC) + timedelta(minutes=settings.jwt_access_token_expire_minutes)
    payload = {
        "sub": str(user.id),
        "company_id": user.company_id,
        "station_id": user.station_id,
        "role": user.role.value,
        "token_version": user.token_version,
        "exp": expire,
    }
    return jwt.encode(payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)


def create_refresh_token(user: User) -> str:
    expire = datetime.now(UTC) + timedelta(days=settings.jwt_refresh_token_expire_days)
    payload = {
        "sub": str(user.id),
        "type": "refresh",
        "token_version": user.token_version,
        "exp": expire,
    }
    return jwt.encode(payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)


async def authenticate_user(db: AsyncSession, identifier: str, password: str) -> User | None:
    """Authenticate by email OR phone number (Ghana formats, normalized before comparison)."""
    conditions = [User.email == identifier]
    with contextlib.suppress(ValueError):
        conditions.append(User.phone == normalize_gh_phone(identifier))

    result = await db.execute(
        select(User).where(or_(*conditions), User.is_active == True)  # noqa: E712
    )
    user = result.scalar_one_or_none()
    if not user or not verify_password(password, user.hashed_password):
        return None
    return user
