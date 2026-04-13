from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload as _selectinload

from app.dependencies.auth import get_current_user, get_db_for_user, require_role
from app.models.subscription import SubscriptionPlan
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
    default_driver_id: int | None = None
    default_driver_name: str | None = None

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


class UpdateVehicleRequest(BaseModel):
    plate_number: str | None = None
    model: str | None = None
    capacity: int | None = None


class AssignDriverRequest(BaseModel):
    driver_id: int | None = None


def _vehicle_response(v: Vehicle) -> VehicleResponse:
    return VehicleResponse(
        id=v.id,
        plate_number=v.plate_number,
        model=v.model,
        capacity=v.capacity,
        is_active=v.is_active,
        is_available=v.is_available,
        default_driver_id=v.default_driver_id,
        default_driver_name=v.default_driver.full_name if v.default_driver else None,
    )


_VEHICLE_OPTS = [_selectinload(Vehicle.default_driver)]


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
    # Enforce max_vehicles limit from subscription plan
    company = current_user.company
    if company and company.subscription_plan_id:
        plan_result = await db.execute(
            select(SubscriptionPlan).where(SubscriptionPlan.id == company.subscription_plan_id)
        )
        plan = plan_result.scalar_one_or_none()
        if plan and plan.max_vehicles is not None:
            count_result = await db.execute(
                select(func.count()).where(
                    Vehicle.company_id == current_user.company_id,
                    Vehicle.is_active.is_(True),
                )
            )
            count = count_result.scalar_one()
            if count >= plan.max_vehicles:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=(
                        f"Vehicle limit reached ({plan.max_vehicles}) for your "
                        f"'{plan.name}' plan. Upgrade your subscription to add more vehicles."
                    ),
                )

    vehicle = Vehicle(
        company_id=current_user.company_id,
        plate_number=body.plate_number,
        model=body.model,
        capacity=body.capacity,
        home_station_id=body.home_station_id,
    )
    db.add(vehicle)
    await db.commit()
    await db.refresh(vehicle, ["default_driver"])
    return _vehicle_response(vehicle)


@router.get("", response_model=list[VehicleResponse])
async def list_vehicles(
    limit: int = Query(default=500, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db_for_user),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Vehicle)
        .where(Vehicle.is_active == True)  # noqa: E712
        .options(*_VEHICLE_OPTS)
        .limit(limit)
        .offset(offset)
    )
    return [_vehicle_response(v) for v in result.scalars().all()]


@router.patch(
    "/{vehicle_id}",
    response_model=VehicleResponse,
    dependencies=[Depends(require_role(*_MANAGER_ROLES))],
)
async def update_vehicle(
    vehicle_id: int,
    body: UpdateVehicleRequest,
    db: AsyncSession = Depends(get_db_for_user),
    current_user: User = Depends(get_current_user),
):
    """Update vehicle plate number, model, or capacity."""
    result = await db.execute(
        select(Vehicle).where(Vehicle.id == vehicle_id).options(*_VEHICLE_OPTS)
    )
    vehicle = result.scalar_one_or_none()
    if vehicle is None:
        raise HTTPException(status_code=404, detail="Vehicle not found")

    if body.plate_number is not None:
        vehicle.plate_number = body.plate_number
    if body.model is not None:
        vehicle.model = body.model
    if body.capacity is not None:
        vehicle.capacity = body.capacity

    await db.commit()
    await db.refresh(vehicle, ["default_driver"])
    return _vehicle_response(vehicle)


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
    result = await db.execute(
        select(Vehicle).where(Vehicle.id == vehicle_id).options(*_VEHICLE_OPTS)
    )
    vehicle = result.scalar_one_or_none()
    if vehicle is None:
        raise HTTPException(status_code=404, detail="Vehicle not found")

    vehicle.is_available = body.is_available
    await db.commit()
    await db.refresh(vehicle, ["default_driver"])
    return _vehicle_response(vehicle)


@router.patch(
    "/{vehicle_id}/driver",
    response_model=VehicleResponse,
    dependencies=[Depends(require_role(*_MANAGER_ROLES))],
)
async def assign_vehicle_driver(
    vehicle_id: int,
    body: AssignDriverRequest,
    db: AsyncSession = Depends(get_db_for_user),
    current_user: User = Depends(get_current_user),
):
    """Assign or unassign a default driver for this vehicle."""
    result = await db.execute(
        select(Vehicle).where(Vehicle.id == vehicle_id).options(*_VEHICLE_OPTS)
    )
    vehicle = result.scalar_one_or_none()
    if vehicle is None:
        raise HTTPException(status_code=404, detail="Vehicle not found")

    if body.driver_id is not None:
        driver_result = await db.execute(
            select(User).where(
                User.id == body.driver_id,
                User.role == UserRole.driver,
                User.is_active == True,  # noqa: E712
                User.company_id == current_user.company_id,
            )
        )
        driver = driver_result.scalar_one_or_none()
        if driver is None:
            raise HTTPException(status_code=400, detail="Driver not found or not eligible")
        vehicle.default_driver_id = driver.id
        vehicle.default_driver = driver
    else:
        vehicle.default_driver_id = None
        vehicle.default_driver = None

    await db.commit()
    return _vehicle_response(vehicle)


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
        .options(_selectinload(VehicleMaintenanceLog.created_by))
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
