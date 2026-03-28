from datetime import datetime
from typing import Any

import structlog
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from pydantic import BaseModel, model_validator
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.dependencies.auth import get_current_user, get_db_for_user, require_role
from app.models.trip import Trip, TripStatus
from app.models.user import User, UserRole
from app.utils.pdf import generate_manifest_pdf

router = APIRouter()
logger = structlog.get_logger()

# Allowed next states for each current state
VALID_TRANSITIONS: dict[TripStatus, set[TripStatus]] = {
    TripStatus.scheduled: {TripStatus.loading, TripStatus.cancelled},
    TripStatus.loading: {TripStatus.departed, TripStatus.cancelled},
    TripStatus.departed: {TripStatus.arrived, TripStatus.cancelled},
    TripStatus.arrived: {TripStatus.cancelled},
    TripStatus.cancelled: set(),
}

_MANAGER_ROLES = (UserRole.station_manager, UserRole.company_admin, UserRole.super_admin)

_TRIP_OPTS = [
    selectinload(Trip.vehicle),
    selectinload(Trip.departure_station),
    selectinload(Trip.destination_station),
    selectinload(Trip.parcels),
    selectinload(Trip.tickets),
]


# ── Schemas ────────────────────────────────────────────────────────────────────


class CreateTripRequest(BaseModel):
    vehicle_id: int
    departure_station_id: int
    destination_station_id: int
    departure_time: datetime
    base_fare_ghs: float | None = None


class TripResponse(BaseModel):
    id: int
    vehicle_id: int
    departure_station_id: int
    destination_station_id: int
    departure_time: datetime
    status: str
    vehicle_plate: str | None = None
    departure_station_name: str | None = None
    destination_station_name: str | None = None
    parcel_count: int = 0

    model_config = {"from_attributes": True}

    @model_validator(mode="before")
    @classmethod
    def _enrich(cls, data: Any) -> Any:
        """Extract relationship fields from ORM object when present."""
        if isinstance(data, dict):
            return data
        result: dict[str, Any] = {
            "id": data.id,
            "vehicle_id": data.vehicle_id,
            "departure_station_id": data.departure_station_id,
            "destination_station_id": data.destination_station_id,
            "departure_time": data.departure_time,
            "status": data.status,
        }
        try:
            result["vehicle_plate"] = data.vehicle.plate_number
        except Exception as exc:
            logger.debug("vehicle not loaded on trip", trip_id=data.id, error=str(exc))
        try:
            result["departure_station_name"] = data.departure_station.name
        except Exception as exc:
            logger.debug("departure_station not loaded on trip", trip_id=data.id, error=str(exc))
        try:
            result["destination_station_name"] = data.destination_station.name
        except Exception as exc:
            logger.debug("destination_station not loaded on trip", trip_id=data.id, error=str(exc))
        try:
            result["parcel_count"] = len(data.parcels)
        except Exception as exc:
            logger.debug("parcels not loaded on trip", trip_id=data.id, error=str(exc))
        return result


class UpdateTripStatusRequest(BaseModel):
    status: TripStatus


# ── Helpers ────────────────────────────────────────────────────────────────────


async def _get_trip_or_404(trip_id: int, db: AsyncSession) -> Trip:
    result = await db.execute(
        select(Trip).where(Trip.id == trip_id).options(*_TRIP_OPTS)
    )
    trip = result.scalar_one_or_none()
    if trip is None:
        raise HTTPException(status_code=404, detail="Trip not found")
    return trip


# ── Endpoints ──────────────────────────────────────────────────────────────────


@router.post(
    "",
    response_model=TripResponse,
    status_code=201,
    dependencies=[Depends(require_role(*_MANAGER_ROLES))],
)
async def create_trip(
    body: CreateTripRequest,
    db: AsyncSession = Depends(get_db_for_user),
    current_user: User = Depends(get_current_user),
):
    trip = Trip(
        company_id=current_user.company_id,
        vehicle_id=body.vehicle_id,
        departure_station_id=body.departure_station_id,
        destination_station_id=body.destination_station_id,
        departure_time=body.departure_time,
        price_ticket_base=body.base_fare_ghs,
    )
    db.add(trip)
    await db.commit()

    result = await db.execute(
        select(Trip).where(Trip.id == trip.id).options(*_TRIP_OPTS)
    )
    return result.scalar_one()


@router.get("", response_model=list[TripResponse])
async def list_trips(
    status: TripStatus | None = Query(None),
    db: AsyncSession = Depends(get_db_for_user),
    current_user: User = Depends(get_current_user),
):
    q = select(Trip).options(*_TRIP_OPTS).order_by(Trip.departure_time.desc())
    if status is not None:
        q = q.where(Trip.status == status)
    result = await db.execute(q)
    return result.scalars().all()


@router.get(
    "/{trip_id}/manifest",
    dependencies=[Depends(require_role(*_MANAGER_ROLES))],
)
async def get_trip_manifest(
    trip_id: int,
    db: AsyncSession = Depends(get_db_for_user),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Trip)
        .where(Trip.id == trip_id)
        .options(
            selectinload(Trip.vehicle),
            selectinload(Trip.departure_station),
            selectinload(Trip.destination_station),
            selectinload(Trip.tickets),
        )
    )
    trip = result.scalar_one_or_none()
    if trip is None:
        raise HTTPException(status_code=404, detail="Trip not found")

    pdf_bytes = generate_manifest_pdf(trip)
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="manifest-trip-{trip_id}.pdf"'
        },
    )


@router.get("/{trip_id}", response_model=TripResponse)
async def get_trip(
    trip_id: int,
    db: AsyncSession = Depends(get_db_for_user),
    current_user: User = Depends(get_current_user),
):
    return await _get_trip_or_404(trip_id, db)


@router.patch(
    "/{trip_id}/status",
    response_model=TripResponse,
    dependencies=[Depends(require_role(*_MANAGER_ROLES))],
)
async def update_trip_status(
    trip_id: int,
    body: UpdateTripStatusRequest,
    db: AsyncSession = Depends(get_db_for_user),
    current_user: User = Depends(get_current_user),
):
    trip = await _get_trip_or_404(trip_id, db)

    if body.status not in VALID_TRANSITIONS[trip.status]:
        allowed = [s.value for s in VALID_TRANSITIONS[trip.status]]
        raise HTTPException(
            status_code=400,
            detail=(
                f"Cannot transition from '{trip.status}' to '{body.status}'. "
                f"Allowed: {allowed}"
            ),
        )

    trip.status = body.status
    await db.commit()

    result = await db.execute(
        select(Trip).where(Trip.id == trip_id).options(*_TRIP_OPTS)
    )
    return result.scalar_one()
