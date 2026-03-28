from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.config import settings
from app.database import get_db
from app.models.user import User, UserRole

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login")


async def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    credentials_exc = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm])
        user_id: int | None = payload.get("sub")
        if user_id is None:
            raise credentials_exc
    except JWTError:
        raise credentials_exc from None

    result = await db.execute(
        select(User)
        .where(User.id == int(user_id))
        .options(selectinload(User.company))
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
    """
    if current_user.role != UserRole.super_admin and current_user.company_id:
        # SET LOCAL does not support asyncpg positional parameters — inline the integer.
        # company_id is always a trusted integer from the database, never user-supplied text.
        await db.execute(
            text(f"SET LOCAL app.current_company_id = {int(current_user.company_id)}")
        )
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
