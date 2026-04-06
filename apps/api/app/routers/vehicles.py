from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.dependencies.auth import get_current_user, get_db_for_user, require_role
from app.models.user import User, UserRole
from app.models.vehicle import Vehicle, VehicleMaintenanceLog

router = APIRouter()

_MANAGER_ROLES = (UserRole.station_manager, UserRole.company_admin, UserRole.super_admin)


class CreateVehicleRequest(BaseModel):
    plate_number: str
    model: str | None = None
    capacity: int = 50
    home_station_id: int | None = None


class VehicleResponse(BaseModel):
    id: int
    plate_number: str
    model: str | None
    capacity: int
    is_active: bool
    is_available: bool

    model_config = {"from_attributes": True}


class MaintenanceLogRequest(BaseModel):
    note: str = Field(..., min_length=1, max_length=500)
    mark_unavailable: bool = False


class MaintenanceLogResponse(BaseModel):
    id: int
    vehicle_id: int
    note: str
    occurred_at: datetime
    created_by_name: str | None = None

    model_config = {"from_attributes": True}


class AvailabilityRequest(BaseModel):
    is_available: bool


@router.post(
    "",
    response_model=VehicleResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_role(UserRole.company_admin, UserRole.super_admin))],
)
async def create_vehicle(
    body: CreateVehicleRequest,
    db: AsyncSession = Depends(get_db_for_user),
    current_user: User = Depends(get_current_user),
):
    vehicle = Vehicle(
        company_id=current_user.company_id,
        plate_number=body.plate_number,
        model=body.model,
        capacity=body.capacity,
        home_station_id=body.home_station_id,
    )
    db.add(vehicle)
    await db.commit()
    await db.refresh(vehicle)
    return vehicle


@router.get("", response_model=list[VehicleResponse])
async def list_vehicles(
    db: AsyncSession = Depends(get_db_for_user),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(Vehicle).where(Vehicle.is_active == True))  # noqa: E712
    return result.scalars().all()


@router.post(
    "/{vehicle_id}/maintenance",
    response_model=MaintenanceLogResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_role(*_MANAGER_ROLES))],
)
async def log_maintenance(
    vehicle_id: int,
    body: MaintenanceLogRequest,
    db: AsyncSession = Depends(get_db_for_user),
    current_user: User = Depends(get_current_user),
):
    """Log a maintenance event. Optionally marks the vehicle as unavailable."""
    result = await db.execute(select(Vehicle).where(Vehicle.id == vehicle_id))
    vehicle = result.scalar_one_or_none()
    if vehicle is None:
        raise HTTPException(status_code=404, detail="Vehicle not found")

    if body.mark_unavailable:
        vehicle.is_available = False

    log = VehicleMaintenanceLog(
        vehicle_id=vehicle.id,
        created_by_id=current_user.id,
        note=body.note,
        occurred_at=datetime.now(UTC),
    )
    db.add(log)
    await db.commit()
    await db.refresh(log, ["created_by"])

    return MaintenanceLogResponse(
        id=log.id,
        vehicle_id=log.vehicle_id,
        note=log.note,
        occurred_at=log.occurred_at,
        created_by_name=log.created_by.full_name if log.created_by else None,
    )


@router.patch(
    "/{vehicle_id}/availability",
    response_model=VehicleResponse,
    dependencies=[Depends(require_role(*_MANAGER_ROLES))],
)
async def update_availability(
    vehicle_id: int,
    body: AvailabilityRequest,
    db: AsyncSession = Depends(get_db_for_user),
    current_user: User = Depends(get_current_user),
):
    """Mark a vehicle as available or unavailable."""
    result = await db.execute(select(Vehicle).where(Vehicle.id == vehicle_id))
    vehicle = result.scalar_one_or_none()
    if vehicle is None:
        raise HTTPException(status_code=404, detail="Vehicle not found")

    vehicle.is_available = body.is_available
    await db.commit()
    await db.refresh(vehicle)
    return vehicle


@router.get(
    "/{vehicle_id}/maintenance",
    response_model=list[MaintenanceLogResponse],
    dependencies=[Depends(require_role(*_MANAGER_ROLES))],
)
async def list_maintenance_logs(
    vehicle_id: int,
    db: AsyncSession = Depends(get_db_for_user),
    current_user: User = Depends(get_current_user),
):
    """Return maintenance log entries for a vehicle, newest first."""
    result = await db.execute(
        select(VehicleMaintenanceLog)
        .where(VehicleMaintenanceLog.vehicle_id == vehicle_id)
        .options(selectinload(VehicleMaintenanceLog.created_by))
        .order_by(VehicleMaintenanceLog.occurred_at.desc())
    )
    logs = result.scalars().all()
    return [
        MaintenanceLogResponse(
            id=log.id,
            vehicle_id=log.vehicle_id,
            note=log.note,
            occurred_at=log.occurred_at,
            created_by_name=log.created_by.full_name if log.created_by else None,
        )
        for log in logs
    ]
