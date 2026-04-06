from contextlib import asynccontextmanager

import structlog
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

from app.config import settings
from app.middleware.rate_limit import limiter
from app.middleware.security_headers import SecurityHeadersMiddleware
from app.routers import (
    admin,
    auth,
    parcels,
    public,
    stations,
    tickets,
    tracking,
    trips,
    vehicles,
    webhooks,
)

logger = structlog.get_logger()


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("RoutePass API starting", environment=settings.environment)
    yield
    logger.info("RoutePass API shutting down")


app = FastAPI(
    title="RoutePass API",
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
    allow_origins=settings.allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
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
app.include_router(public.router, prefix=f"{API_PREFIX}/public", tags=["public"])


@app.get("/health", tags=["system"])
async def health_check():
    return {"status": "ok", "version": "1.0.0"}
