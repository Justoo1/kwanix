
from datetime import datetime

from fastapi import APIRouter, BackgroundTasks, Depends, Query, status
from pydantic import BaseModel, field_validator
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.dependencies.auth import get_current_user, get_db_for_user
from app.integrations.arkesel import (
    dispatch_sms,
    msg_parcel_arrived,
    msg_parcel_in_transit,
    msg_parcel_logged,
)
from app.models.parcel import Parcel, ParcelStatus
from app.models.user import User
from app.services.parcel_service import (
    collect_parcel,
    get_parcel_by_tracking_or_404,
    get_parcel_or_404,
    unload_parcel,
    validate_and_load,
)
from app.services.qr_service import generate_qr_base64
from app.services.tracking_number import generate_tracking_number
from app.utils.phone import normalize_gh_phone

router = APIRouter()


# ── Schemas ───────────────────────────────────────────────────────────────────


class CreateParcelRequest(BaseModel):
    sender_name: str
    sender_phone: str
    receiver_name: str
    receiver_phone: str
    origin_station_id: int
    destination_station_id: int
    weight_kg: float | None = None
    description: str | None = None
    fee_ghs: float = 0.0
    idempotency_key: str | None = None

    @field_validator("sender_phone", "receiver_phone", mode="before")
    @classmethod
    def normalize_phone(cls, v: str) -> str:
        try:
            return normalize_gh_phone(v)
        except ValueError as exc:
            raise ValueError(str(exc)) from exc


class ParcelResponse(BaseModel):
    id: int
    tracking_number: str
    status: str
    sender_name: str
    receiver_name: str
    receiver_phone: str
    origin_station_id: int
    destination_station_id: int
    origin_station_name: str | None = None
    destination_station_name: str | None = None
    weight_kg: float | None = None
    fee_ghs: float
    description: str | None = None
    created_at: datetime | None = None
    qr_code_base64: str | None = None

    model_config = {"from_attributes": True}


class LoadParcelRequest(BaseModel):
    tracking_number: str
    trip_id: int


class UnloadParcelRequest(BaseModel):
    parcel_id: int


class CollectParcelRequest(BaseModel):
    tracking_number: str
    otp: str


# ── Endpoints ─────────────────────────────────────────────────────────────────


@router.post("", response_model=ParcelResponse, status_code=status.HTTP_201_CREATED)
async def create_parcel(
    body: CreateParcelRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db_for_user),
    current_user: User = Depends(get_current_user),
):
    # Handle idempotency — if key already exists, return existing parcel
    if body.idempotency_key:
        existing = await db.execute(
            select(Parcel).where(Parcel.idempotency_key == body.idempotency_key)
        )
        if existing_parcel := existing.scalar_one_or_none():
            return _parcel_to_response(existing_parcel)

    tracking_number = await generate_tracking_number(
        db,
        current_user.company_id,
        current_user.company.company_code,  # type: ignore[union-attr]
    )

    parcel = Parcel(
        company_id=current_user.company_id,
        tracking_number=tracking_number,
        sender_name=body.sender_name,
        sender_phone=body.sender_phone,
        receiver_name=body.receiver_name,
        receiver_phone=body.receiver_phone,
        origin_station_id=body.origin_station_id,
        destination_station_id=body.destination_station_id,
        weight_kg=body.weight_kg,
        description=body.description,
        fee_ghs=body.fee_ghs,
        created_by_id=current_user.id,
        idempotency_key=body.idempotency_key,
        status=ParcelStatus.pending,
    )
    db.add(parcel)
    await db.commit()
    await db.refresh(parcel, ["origin_station", "destination_station"])

    # SMS in background — also persists outcome to sms_logs
    background_tasks.add_task(
        dispatch_sms,
        db,
        parcel.id,
        parcel.receiver_phone,
        msg_parcel_logged(
            parcel.sender_name,
            parcel.destination_station.name,
            parcel.tracking_number,
        ),
        "parcel_logged",
    )

    response = _parcel_to_response(parcel, include_stations=True)
    response.qr_code_base64 = generate_qr_base64(parcel.tracking_number)
    return response


@router.get("", response_model=list[ParcelResponse])
async def list_parcels(
    parcel_status: str | None = Query(None, alias="status"),
    db: AsyncSession = Depends(get_db_for_user),
    current_user: User = Depends(get_current_user),
):
    q = (
        select(Parcel)
        .options(
            selectinload(Parcel.origin_station),
            selectinload(Parcel.destination_station),
        )
        .order_by(Parcel.id.desc())
        .limit(200)
    )
    if parcel_status and parcel_status in ParcelStatus.__members__:
        q = q.where(Parcel.status == ParcelStatus[parcel_status])
    result = await db.execute(q)
    return [_parcel_to_response(p, include_stations=True) for p in result.scalars().all()]


@router.patch("/load")
async def load_parcel(
    body: LoadParcelRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db_for_user),
    current_user: User = Depends(get_current_user),
):
    parcel_lookup = await get_parcel_by_tracking_or_404(db, body.tracking_number)
    parcel = await validate_and_load(db, parcel_lookup.id, body.trip_id, current_user.id)
    await db.commit()
    await db.refresh(parcel, ["destination_station", "current_trip"])

    trip = parcel.current_trip
    await db.refresh(trip, ["vehicle"])
    background_tasks.add_task(
        dispatch_sms,
        db,
        parcel.id,
        parcel.receiver_phone,
        msg_parcel_in_transit(
            trip.vehicle.plate_number,
            parcel.destination_station.name,
            parcel.tracking_number,
        ),
        "parcel_in_transit",
    )

    return {
        "success": True,
        "message": f"Loaded onto bus {trip.vehicle.plate_number}",
        "tracking_number": parcel.tracking_number,
    }


@router.patch("/unload")
async def unload_parcel_endpoint(
    body: UnloadParcelRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db_for_user),
    current_user: User = Depends(get_current_user),
):
    parcel, otp_code = await unload_parcel(db, body.parcel_id, current_user.id)
    await db.commit()
    await db.refresh(parcel, ["destination_station"])

    background_tasks.add_task(
        dispatch_sms,
        db,
        parcel.id,
        parcel.receiver_phone,
        msg_parcel_arrived(
            parcel.destination_station.name,
            otp_code,
            parcel.tracking_number,
        ),
        "parcel_arrived",
    )

    return {
        "success": True,
        "message": "Parcel marked as arrived. OTP sent to receiver.",
        "tracking_number": parcel.tracking_number,
    }


@router.post("/collect")
async def collect_parcel_endpoint(
    body: CollectParcelRequest,
    db: AsyncSession = Depends(get_db_for_user),
    current_user: User = Depends(get_current_user),
):
    parcel = await collect_parcel(db, body.tracking_number, body.otp, current_user.id)
    await db.commit()

    return {
        "success": True,
        "message": "Parcel released to recipient successfully.",
        "tracking_number": parcel.tracking_number,
    }


@router.get("/{parcel_id}", response_model=ParcelResponse)
async def get_parcel(
    parcel_id: int,
    db: AsyncSession = Depends(get_db_for_user),
    current_user: User = Depends(get_current_user),
):
    parcel = await get_parcel_or_404(db, parcel_id)
    return _parcel_to_response(parcel)


# ── Helpers ───────────────────────────────────────────────────────────────────


def _parcel_to_response(parcel: Parcel, include_stations: bool = False) -> ParcelResponse:
    origin_name: str | None = None
    dest_name: str | None = None
    if include_stations:
        try:
            origin_name = parcel.origin_station.name
        except Exception:
            pass
        try:
            dest_name = parcel.destination_station.name
        except Exception:
            pass
    return ParcelResponse(
        id=parcel.id,
        tracking_number=parcel.tracking_number,
        status=parcel.status.value,
        sender_name=parcel.sender_name,
        receiver_name=parcel.receiver_name,
        receiver_phone=parcel.receiver_phone,
        origin_station_id=parcel.origin_station_id,
        destination_station_id=parcel.destination_station_id,
        origin_station_name=origin_name,
        destination_station_name=dest_name,
        weight_kg=float(parcel.weight_kg) if parcel.weight_kg is not None else None,
        fee_ghs=float(parcel.fee_ghs),
        description=parcel.description,
        created_at=parcel.created_at,
    )
