"""
Public tracking endpoint — no authentication required.
Returns a sanitized view of the parcel status (no OTP, no internal IDs).
"""

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.middleware.rate_limit import limiter
from app.models.parcel import Parcel, ParcelStatus
from app.models.trip import Trip

router = APIRouter()


class PublicParcelStatus(BaseModel):
    tracking_number: str
    status: str
    origin: str
    destination: str
    bus_plate: str | None = None
    last_updated: str
    return_reason: str | None = None

    model_config = {"from_attributes": True}


@router.get("/{tracking_id}", response_model=PublicParcelStatus)
@limiter.limit("100/minute")
async def track_parcel(request: Request, tracking_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Parcel)
        .where(Parcel.tracking_number == tracking_id)
        .options(
            selectinload(Parcel.origin_station),
            selectinload(Parcel.destination_station),
            selectinload(Parcel.current_trip).selectinload(Trip.vehicle),
        )
    )
    parcel = result.scalar_one_or_none()
    if parcel is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tracking ID not found")

    bus_plate = None
    if parcel.current_trip and parcel.status == ParcelStatus.arrived:
        bus_plate = parcel.current_trip.vehicle.plate_number

    return PublicParcelStatus(
        tracking_number=parcel.tracking_number,
        status=parcel.status.value,
        origin=parcel.origin_station.name,
        destination=parcel.destination_station.name,
        bus_plate=bus_plate,
        last_updated=parcel.updated_at.isoformat(),
        return_reason=parcel.return_reason if parcel.status == ParcelStatus.returned else None,
    )
