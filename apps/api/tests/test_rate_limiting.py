"""
Rate limiting and request validation tests.

Rate limit tests verify slowapi decorators are wired up correctly.
We reset the in-memory storage before each test to avoid cross-test
interference (all httpx clients share the same "testclient" IP).
"""

import contextlib

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app
from app.middleware.rate_limit import limiter


def _reset_limiter():
    """Clear all in-memory rate-limit counters between tests."""
    with contextlib.suppress(AttributeError):
        # slowapi 0.1.x — storage lives on the internal FixedWindowRateLimiter
        limiter._limiter._storage.reset()


@pytest.fixture(autouse=True)
def reset_rate_limit_storage():
    _reset_limiter()
    yield
    _reset_limiter()


@pytest.mark.asyncio
async def test_tracking_endpoint_rate_limited():
    """Calling the tracking endpoint 101 times should trigger a 429 on the 101st."""
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://testclient"
    ) as client:
        status_codes = []
        for _ in range(101):
            r = await client.get("/api/v1/track/RP-DOES-NOT-EXIST")
            status_codes.append(r.status_code)

    # First 100 should pass (404 — tracking number doesn't exist)
    assert all(s != 429 for s in status_codes[:100]), (
        f"Expected no 429s in first 100 calls; got: {status_codes[:100]}"
    )
    assert status_codes[100] == 429, f"Expected 429 on 101st call; got: {status_codes[100]}"


@pytest.mark.asyncio
async def test_book_endpoint_rate_limited(db):
    """Calling the booking endpoint 11 times from the same IP should 429 on the 11th."""
    from app.database import get_db
    from app.dependencies.auth import get_db_public

    async def _override_db():
        yield db

    app.dependency_overrides[get_db] = _override_db
    app.dependency_overrides[get_db_public] = _override_db

    try:
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://testclient"
        ) as client:
            status_codes = []
            for _ in range(11):
                r = await client.post(
                    "/api/v1/public/trips/9999/book",
                    json={
                        "passenger_name": "Test Passenger",
                        "passenger_phone": "0541234567",
                        "seat_number": 1,
                    },
                )
                status_codes.append(r.status_code)
    finally:
        app.dependency_overrides.pop(get_db, None)
        app.dependency_overrides.pop(get_db_public, None)

    assert all(s != 429 for s in status_codes[:10]), (
        f"Expected no 429s in first 10 calls; got: {status_codes[:10]}"
    )
    assert status_codes[10] == 429, f"Expected 429 on 11th call; got: {status_codes[10]}"


# ── Security headers tests ────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_security_headers_present():
    """Every response should include X-Content-Type-Options: nosniff."""
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://testclient"
    ) as client:
        r = await client.get("/health")
    assert r.headers.get("x-content-type-options") == "nosniff"
    assert r.headers.get("x-frame-options") == "DENY"
    assert "default-src" in r.headers.get("content-security-policy", "")


# ── Field length validation tests ─────────────────────────────────────────────


@pytest.mark.asyncio
async def test_create_parcel_rejects_oversized_sender_name(client, clerk_token):
    """POST /parcels with sender_name > 100 chars should return 422."""
    r = await client.post(
        "/api/v1/parcels",
        json={
            "sender_name": "A" * 500,
            "sender_phone": "0541234567",
            "receiver_name": "Receiver",
            "receiver_phone": "0541234568",
            "origin_station_id": 1,
            "destination_station_id": 2,
        },
        headers={"Authorization": f"Bearer {clerk_token}"},
    )
    assert r.status_code == 422
