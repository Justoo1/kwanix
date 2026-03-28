"""
Shared test fixtures.

Unit tests (services, utils) use in-memory / mock objects — no DB needed.
Integration tests (API endpoints) use an async SQLite in-memory DB via
SQLAlchemy so they can run without a real Postgres instance in CI.
"""

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.database import Base
from app.main import app
from app.models.company import Company
from app.models.station import Station
from app.models.tracking_sequence import TrackingSequence
from app.models.user import User, UserRole
from app.models.vehicle import Vehicle
from app.services.auth_service import create_access_token, hash_password

# ── In-memory SQLite engine for integration tests ─────────────────────────────
TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"

test_engine = create_async_engine(TEST_DATABASE_URL, echo=False)
TestSessionLocal = async_sessionmaker(
    test_engine, class_=AsyncSession, expire_on_commit=False
)


@pytest.fixture(scope="session", autouse=True)
async def create_test_tables():
    """Create all tables once per test session."""
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


@pytest.fixture
async def db() -> AsyncSession:
    """Yields a fresh DB session that is rolled back after each test."""
    async with TestSessionLocal() as session:
        yield session
        await session.rollback()


# ── Seed helpers ──────────────────────────────────────────────────────────────

@pytest.fixture
async def company(db: AsyncSession) -> Company:
    c = Company(name="Test STC", company_code="TST", is_active=True)
    db.add(c)
    await db.flush()
    return c


@pytest.fixture
async def station_accra(db: AsyncSession, company: Company) -> Station:
    s = Station(company_id=company.id, name="Accra", location_code="ACC")
    db.add(s)
    await db.flush()
    return s


@pytest.fixture
async def station_prestea(db: AsyncSession, company: Company) -> Station:
    s = Station(company_id=company.id, name="Prestea", location_code="PRE")
    db.add(s)
    await db.flush()
    return s


@pytest.fixture
async def vehicle(db: AsyncSession, company: Company) -> Vehicle:
    v = Vehicle(company_id=company.id, plate_number="GR-TEST-01", capacity=50)
    db.add(v)
    await db.flush()
    return v


@pytest.fixture
async def clerk_user(db: AsyncSession, company: Company, station_accra: Station) -> User:
    u = User(
        company_id=company.id,
        station_id=station_accra.id,
        full_name="Test Clerk",
        phone="233541234567",
        email="clerk@test.io",
        hashed_password=hash_password("testpass123"),
        role=UserRole.station_clerk,
    )
    db.add(u)
    await db.flush()
    return u


@pytest.fixture
async def tracking_seq(db: AsyncSession, company: Company) -> TrackingSequence:
    seq = TrackingSequence(company_id=company.id, last_serial=0)
    db.add(seq)
    await db.flush()
    return seq


@pytest.fixture
async def clerk_token(clerk_user: User) -> str:
    return create_access_token(clerk_user)


# ── FastAPI test client ───────────────────────────────────────────────────────

@pytest.fixture
async def client(db: AsyncSession) -> AsyncClient:
    """
    Async HTTP test client. Overrides the DB dependency so integration
    tests use the in-memory SQLite session instead of a real Postgres DB.
    """
    from app.database import get_db
    from app.dependencies.auth import get_db_for_user

    async def _override_db():
        yield db

    app.dependency_overrides[get_db] = _override_db
    app.dependency_overrides[get_db_for_user] = _override_db

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as ac:
        yield ac

    app.dependency_overrides.clear()
