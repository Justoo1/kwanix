from contextlib import asynccontextmanager

import structlog
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.routers import auth, parcels, stations, tickets, tracking, trips, vehicles, webhooks

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

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"] if settings.environment == "development" else [],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routers
API_PREFIX = "/api/v1"

app.include_router(auth.router, prefix=f"{API_PREFIX}/auth", tags=["auth"])
app.include_router(tracking.router, prefix=f"{API_PREFIX}/track", tags=["public"])
app.include_router(parcels.router, prefix=f"{API_PREFIX}/parcels", tags=["parcels"])
app.include_router(trips.router, prefix=f"{API_PREFIX}/trips", tags=["trips"])
app.include_router(tickets.router, prefix=f"{API_PREFIX}/tickets", tags=["tickets"])
app.include_router(stations.router, prefix=f"{API_PREFIX}/stations", tags=["stations"])
app.include_router(vehicles.router, prefix=f"{API_PREFIX}/vehicles", tags=["vehicles"])
app.include_router(webhooks.router, prefix=f"{API_PREFIX}/webhooks", tags=["webhooks"])


@app.get("/health", tags=["system"])
async def health_check():
    return {"status": "ok", "version": "1.0.0"}
