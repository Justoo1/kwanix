from datetime import datetime

from fastapi import APIRouter, Depends, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.dependencies.auth import get_current_user, get_db_for_user, require_role
from app.models.trip import Trip, TripStatus
from app.models.user import User, UserRole

router = APIRouter()


class CreateTripRequest(BaseModel):
    vehicle_id: int
    departure_station_id: int
    destination_station_id: int
    departure_time: datetime
    price_parcel_base: float | None = None
    price_ticket_base: float | None = None


class TripResponse(BaseModel):
    id: int
    vehicle_id: int
    departure_station_id: int
    destination_station_id: int
    departure_time: datetime
    status: str

    model_config = {"from_attributes": True}


class UpdateTripStatusRequest(BaseModel):
    status: TripStatus


@router.post(
    "",
    response_model=TripResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[
        Depends(
            require_role(UserRole.station_manager, UserRole.company_admin, UserRole.super_admin)
        )
    ],
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
        price_parcel_base=body.price_parcel_base,
        price_ticket_base=body.price_ticket_base,
    )
    db.add(trip)
    await db.commit()
    await db.refresh(trip)
    return trip


@router.get("", response_model=list[TripResponse])
async def list_trips(
    db: AsyncSession = Depends(get_db_for_user),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(Trip).order_by(Trip.departure_time.desc()))
    return result.scalars().all()


@router.get("/{trip_id}", response_model=TripResponse)
async def get_trip(
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
            selectinload(Trip.parcels),
            selectinload(Trip.tickets),
        )
    )
    trip = result.scalar_one_or_none()
    if trip is None:
        from fastapi import HTTPException

        raise HTTPException(status_code=404, detail="Trip not found")
    return trip


@router.patch(
    "/{trip_id}/status",
    dependencies=[
        Depends(
            require_role(UserRole.station_manager, UserRole.company_admin, UserRole.super_admin)
        )
    ],
)
async def update_trip_status(
    trip_id: int,
    body: UpdateTripStatusRequest,
    db: AsyncSession = Depends(get_db_for_user),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(Trip).where(Trip.id == trip_id))
    trip = result.scalar_one_or_none()
    if trip is None:
        from fastapi import HTTPException

        raise HTTPException(status_code=404, detail="Trip not found")

    trip.status = body.status
    await db.commit()
    return {"success": True, "status": body.status.value}
