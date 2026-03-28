from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies.auth import get_current_user, get_db_for_user
from app.models.parcel import Parcel, ParcelStatus
from app.models.station import Station
from app.models.user import User

router = APIRouter()


class StationResponse(BaseModel):
    id: int
    name: str
    location_code: str | None
    is_hub: bool

    model_config = {"from_attributes": True}


class PendingParcelSummary(BaseModel):
    tracking_number: str
    receiver_name: str
    destination: str
    fee_ghs: float


@router.get("", response_model=list[StationResponse])
async def list_stations(
    db: AsyncSession = Depends(get_db_for_user),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(Station).where(Station.is_active == True))  # noqa: E712
    return result.scalars().all()


@router.get("/{station_id}/pending-parcels", response_model=list[PendingParcelSummary])
async def get_pending_parcels(
    station_id: int,
    db: AsyncSession = Depends(get_db_for_user),
    current_user: User = Depends(get_current_user),
):
    """
    Returns all parcels waiting at this station to be loaded onto a bus.
    Used by the Station Manager dashboard (the 'inventory view').
    """
    from sqlalchemy.orm import selectinload

    result = await db.execute(
        select(Parcel)
        .where(
            Parcel.origin_station_id == station_id,
            Parcel.status == ParcelStatus.pending,
        )
        .options(selectinload(Parcel.destination_station))
        .order_by(Parcel.created_at.asc())  # FIFO
    )
    parcels = result.scalars().all()

    return [
        PendingParcelSummary(
            tracking_number=p.tracking_number,
            receiver_name=p.receiver_name,
            destination=p.destination_station.name,
            fee_ghs=float(p.fee_ghs),
        )
        for p in parcels
    ]
