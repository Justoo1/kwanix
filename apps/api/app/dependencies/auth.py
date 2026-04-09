from fastapi import Depends, Header, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.config import settings
from app.database import get_db
from app.models.company import Company
from app.models.user import User, UserRole

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login", auto_error=False)


async def get_company_from_api_key(api_key: str, db: AsyncSession) -> Company:
    """Look up an active company by its API key. Raises 401 if not found."""
    result = await db.execute(
        select(Company).where(Company.api_key == api_key, Company.is_active.is_(True))
    )
    company = result.scalar_one_or_none()
    if company is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid API key",
            headers={"WWW-Authenticate": "X-API-Key"},
        )
    return company


async def get_current_user(
    token: str | None = Depends(oauth2_scheme),
    x_api_key: str | None = Header(None, alias="X-API-Key"),
    db: AsyncSession = Depends(get_db),
) -> User:
    credentials_exc = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

    # ── API key path ──────────────────────────────────────────────────────────
    if x_api_key:
        company = await get_company_from_api_key(x_api_key, db)
        # Return a synthetic user representing the company with company_admin permissions
        synthetic = User(
            company_id=company.id,
            full_name=f"{company.name} (API)",
            phone="",
            hashed_password="",
            role=UserRole.company_admin,
            is_active=True,
        )
        synthetic.company = company  # type: ignore[attr-defined]
        return synthetic

    # ── JWT path ──────────────────────────────────────────────────────────────
    if not token:
        raise credentials_exc

    try:
        payload = jwt.decode(token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm])
        user_id: int | None = payload.get("sub")
        if user_id is None:
            raise credentials_exc
    except JWTError:
        raise credentials_exc from None

    result = await db.execute(
        select(User).where(User.id == int(user_id)).options(selectinload(User.company))
    )
    user = result.scalar_one_or_none()

    if user is None or not user.is_active:
        raise credentials_exc
    return user


async def get_db_for_user(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> AsyncSession:
    """
    Returns a DB session with RLS context set for the current user's company.
    super_admin users get an unfiltered session.
    Also enforces subscription status — suspended companies receive HTTP 402.
    """
    if current_user.role != UserRole.super_admin and current_user.company_id:
        # SET LOCAL does not support asyncpg positional parameters — inline the integer.
        # company_id is always a trusted integer from the database, never user-supplied text.
        await db.execute(text(f"SET LOCAL app.current_company_id = {int(current_user.company_id)}"))

        # Subscription guard — advance status lazily then check
        company = current_user.company
        if company is not None:
            from app.services.billing_service import (
                advance_company_status_if_needed,  # noqa: PLC0415
            )

            locked = await db.execute(
                select(Company).where(Company.id == company.id).with_for_update()
            )
            company = locked.scalar_one()
            await advance_company_status_if_needed(company, db)
            if company.subscription_status == "suspended":
                raise HTTPException(
                    status_code=status.HTTP_402_PAYMENT_REQUIRED,
                    detail={
                        "code": "SUBSCRIPTION_SUSPENDED",
                        "message": "Your subscription has been suspended. "
                        "Go to Settings → Billing to reactivate.",
                    },
                )
    yield db


async def get_db_public(
    db: AsyncSession = Depends(get_db),
) -> AsyncSession:
    """
    Returns an unscoped DB session for public (unauthenticated) endpoints.
    RLS is not set — public endpoints must only query publicly-accessible data.
    """
    yield db


def require_role(*roles: UserRole):
    """
    Dependency factory: raises 403 if the current user doesn't have one of the given roles.

    Usage:
        @router.post("/...", dependencies=[Depends(require_role(UserRole.station_manager))])
    """

    def _check(current_user: User = Depends(get_current_user)) -> User:
        if current_user.role not in roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Role '{current_user.role}' is not authorized for this action.",
            )
        return current_user

    return _check
