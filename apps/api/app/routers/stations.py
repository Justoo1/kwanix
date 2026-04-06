from datetime import UTC, date, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies.auth import get_current_user, get_db_for_user, require_role
from app.models.parcel import Parcel, ParcelStatus
from app.models.station import Station
from app.models.user import User, UserRole

router = APIRouter()


class CreateStationRequest(BaseModel):
    name: str
    location_code: str | None = None
    contact_number: str | None = None
    address: str | None = None
    is_hub: bool = False


class StationResponse(BaseModel):
    id: int
    name: str
    location_code: str | None
    contact_number: str | None
    address: str | None
    is_hub: bool
    is_active: bool

    model_config = {"from_attributes": True}


class PendingParcelSummary(BaseModel):
    tracking_number: str
    receiver_name: str
    destination: str
    fee_ghs: float


class StationParcelCounts(BaseModel):
    pending: int = 0
    in_transit: int = 0
    arrived: int = 0
    picked_up: int = 0
    returned: int = 0


class ThroughputPoint(BaseModel):
    date: str
    received: int
    dispatched: int


_MANAGER_ROLES = (UserRole.station_manager, UserRole.company_admin, UserRole.super_admin)


@router.post(
    "",
    response_model=StationResponse,
    status_code=201,
    dependencies=[Depends(require_role(*_MANAGER_ROLES))],
)
async def create_station(
    body: CreateStationRequest,
    db: AsyncSession = Depends(get_db_for_user),
    current_user: User = Depends(get_current_user),
):
    station = Station(
        company_id=current_user.company_id,
        name=body.name,
        location_code=body.location_code,
        contact_number=body.contact_number,
        address=body.address,
        is_hub=body.is_hub,
    )
    db.add(station)
    await db.commit()
    await db.refresh(station)
    return station


@router.get("", response_model=list[StationResponse])
async def list_stations(
    db: AsyncSession = Depends(get_db_for_user),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Station).where(Station.is_active == True).order_by(Station.name)  # noqa: E712
    )
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


@router.patch(
    "/{station_id}/deactivate",
    response_model=StationResponse,
    dependencies=[Depends(require_role(UserRole.company_admin, UserRole.super_admin))],
)
async def deactivate_station(
    station_id: int,
    db: AsyncSession = Depends(get_db_for_user),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(Station).where(Station.id == station_id))
    station = result.scalar_one_or_none()
    if station is None:
        raise HTTPException(status_code=404, detail="Station not found")
    station.is_active = False
    await db.commit()
    await db.refresh(station)
    return station


@router.patch(
    "/{station_id}/activate",
    response_model=StationResponse,
    dependencies=[Depends(require_role(UserRole.company_admin, UserRole.super_admin))],
)
async def activate_station(
    station_id: int,
    db: AsyncSession = Depends(get_db_for_user),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(Station).where(Station.id == station_id))
    station = result.scalar_one_or_none()
    if station is None:
        raise HTTPException(status_code=404, detail="Station not found")
    station.is_active = True
    await db.commit()
    await db.refresh(station)
    return station


@router.get("/{station_id}/parcel-summary", response_model=StationParcelCounts)
async def get_station_parcel_summary(
    station_id: int,
    db: AsyncSession = Depends(get_db_for_user),
    current_user: User = Depends(get_current_user),
):
    """Return parcel counts grouped by status for parcels at this station."""
    rows = await db.execute(
        select(Parcel.status, func.count().label("cnt"))
        .where(
            or_(
                Parcel.origin_station_id == station_id,
                Parcel.destination_station_id == station_id,
            )
        )
        .group_by(Parcel.status)
    )
    counts: dict[str, int] = {row.status.value: row.cnt for row in rows}
    return StationParcelCounts(
        pending=counts.get("pending", 0),
        in_transit=counts.get("in_transit", 0),
        arrived=counts.get("arrived", 0),
        picked_up=counts.get("picked_up", 0),
        returned=counts.get("returned", 0),
    )


@router.get(
    "/{station_id}/throughput",
    response_model=list[ThroughputPoint],
    dependencies=[Depends(require_role(*_MANAGER_ROLES))],
)
async def get_station_throughput(
    station_id: int,
    days: int = Query(7, ge=1, le=90),
    db: AsyncSession = Depends(get_db_for_user),
    current_user: User = Depends(get_current_user),
) -> list[ThroughputPoint]:
    """Return daily received/dispatched parcel counts for a station over the given window."""
    now = datetime.now(UTC)
    window_start = now - timedelta(days=days)

    # received = parcels that arrived at this station in the window
    received_rows = await db.execute(
        select(Parcel.arrived_at).where(
            Parcel.destination_station_id == station_id,
            Parcel.arrived_at >= window_start,
            Parcel.arrived_at.isnot(None),
        )
    )
    # dispatched = parcels that were loaded (dispatched) from this station in the window
    dispatched_rows = await db.execute(
        select(Parcel.loaded_at).where(
            Parcel.origin_station_id == station_id,
            Parcel.loaded_at >= window_start,
            Parcel.loaded_at.isnot(None),
        )
    )

    received_by_day: dict[date, int] = {}
    for (ts,) in received_rows.all():
        if ts is not None:
            d = ts.astimezone(UTC).date() if ts.tzinfo else ts.date()
            received_by_day[d] = received_by_day.get(d, 0) + 1

    dispatched_by_day: dict[date, int] = {}
    for (ts,) in dispatched_rows.all():
        if ts is not None:
            d = ts.astimezone(UTC).date() if ts.tzinfo else ts.date()
            dispatched_by_day[d] = dispatched_by_day.get(d, 0) + 1

    result = []
    for i in range(days):
        day = (now - timedelta(days=days - 1 - i)).date()
        result.append(
            ThroughputPoint(
                date=day.isoformat(),
                received=received_by_day.get(day, 0),
                dispatched=dispatched_by_day.get(day, 0),
            )
        )
    return result
