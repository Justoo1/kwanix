from collections.abc import AsyncGenerator

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from app.config import settings

engine = create_async_engine(
    settings.database_url,
    echo=settings.debug,
    pool_pre_ping=True,
    pool_size=10,
    max_overflow=20,
    # Kill queries that run longer than 30 s so a single slow request
    # cannot hold a connection and starve the pool.
    connect_args={"command_timeout": 30},
)

SessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,
)


class Base(DeclarativeBase):
    pass


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """
    Yields an async DB session.
    RLS context (app.current_company_id) is set by the auth dependency
    after the user is resolved — see dependencies/auth.py.
    """
    async with SessionLocal() as session:
        yield session


async def get_db_with_rls(company_id: int) -> AsyncGenerator[AsyncSession, None]:
    """
    Yields a DB session with the RLS session variable set for the given company.
    Used by authenticated endpoints to enforce row-level isolation.
    """
    async with SessionLocal() as session:
        await session.execute(
            text("SET LOCAL app.current_company_id = :cid"),
            {"cid": company_id},
        )
        yield session
