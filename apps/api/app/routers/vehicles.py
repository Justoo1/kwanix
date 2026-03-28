from fastapi import APIRouter, Depends, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies.auth import get_current_user, get_db_for_user, require_role
from app.models.user import User, UserRole
from app.models.vehicle import Vehicle

router = APIRouter()


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

    model_config = {"from_attributes": True}


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
