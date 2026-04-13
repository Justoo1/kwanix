import asyncio
import contextlib
from contextlib import asynccontextmanager

import sentry_sdk
import structlog
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

from app.config import settings

if settings.sentry_dsn:
    sentry_sdk.init(
        dsn=settings.sentry_dsn,
        traces_sample_rate=settings.sentry_traces_sample_rate,
        environment=settings.environment,
        send_default_pii=False,
    )
from app.database import SessionLocal
from app.middleware.rate_limit import limiter
from app.middleware.security_headers import SecurityHeadersMiddleware
from app.routers import (
    admin,
    auth,
    billing,
    driver,
    parcels,
    public,
    stations,
    tickets,
    tracking,
    trips,
    vehicles,
    webhooks,
)
from app.services.billing_service import run_subscription_sweeper, run_webhook_retry_sweeper

logger = structlog.get_logger()


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Kwanix API starting", environment=settings.environment)
    subscription_sweeper = asyncio.create_task(run_subscription_sweeper(SessionLocal))
    webhook_sweeper = asyncio.create_task(run_webhook_retry_sweeper(SessionLocal))
    yield
    subscription_sweeper.cancel()
    webhook_sweeper.cancel()
    with contextlib.suppress(asyncio.CancelledError):
        await subscription_sweeper
    with contextlib.suppress(asyncio.CancelledError):
        await webhook_sweeper
    logger.info("Kwanix API shutting down")


app = FastAPI(
    title="Kwanix API",
    description="Unified Transit Management — Ticketing & Parcel Logistics",
    version="1.0.0",
    docs_url="/docs" if settings.debug else None,
    redoc_url="/redoc" if settings.debug else None,
    lifespan=lifespan,
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(SlowAPIMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.get_allowed_origins(),
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
    allow_headers=["Content-Type", "Authorization"],
)
app.add_middleware(SecurityHeadersMiddleware)

# Routers
API_PREFIX = "/api/v1"

app.include_router(auth.router, prefix=f"{API_PREFIX}/auth", tags=["auth"])
app.include_router(admin.router, prefix=f"{API_PREFIX}/admin", tags=["admin"])
app.include_router(tracking.router, prefix=f"{API_PREFIX}/track", tags=["public"])
app.include_router(parcels.router, prefix=f"{API_PREFIX}/parcels", tags=["parcels"])
app.include_router(trips.router, prefix=f"{API_PREFIX}/trips", tags=["trips"])
app.include_router(tickets.router, prefix=f"{API_PREFIX}/tickets", tags=["tickets"])
app.include_router(stations.router, prefix=f"{API_PREFIX}/stations", tags=["stations"])
app.include_router(vehicles.router, prefix=f"{API_PREFIX}/vehicles", tags=["vehicles"])
app.include_router(webhooks.router, prefix=f"{API_PREFIX}/webhooks", tags=["webhooks"])
app.include_router(billing.router, prefix=f"{API_PREFIX}/billing", tags=["billing"])
app.include_router(public.router, prefix=f"{API_PREFIX}/public", tags=["public"])
app.include_router(driver.router, prefix=f"{API_PREFIX}/driver", tags=["driver"])


@app.get("/health", tags=["system"])
async def health_check():
    return {"status": "ok", "version": "1.0.0"}
