import contextlib
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, Request, status
from fastapi.responses import Response
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.dependencies.auth import get_current_user, get_db_for_user, require_role
from app.integrations.arkesel import (
    dispatch_sms,
    msg_parcel_arrived,
    msg_parcel_in_transit,
    msg_parcel_logged,
    msg_parcel_pickup_reminder,
    msg_parcel_return_sender,
)
from app.middleware.rate_limit import limiter
from app.models.company import Company
from app.models.parcel import Parcel, ParcelLog, ParcelStatus
from app.models.user import User, UserRole
from app.services.parcel_service import (
    collect_parcel,
    get_parcel_or_404,
    return_parcel,
    unload_parcel,
    validate_and_load,
)
from app.services.qr_service import generate_qr_base64
from app.services.tracking_number import generate_tracking_number
from app.utils.pdf import generate_receipt_pdf
from app.utils.phone import normalize_gh_phone

router = APIRouter()


# ── Schemas ───────────────────────────────────────────────────────────────────


class CreateParcelRequest(BaseModel):
    sender_name: str = Field(..., max_length=100)
    sender_phone: str = Field(..., max_length=20)
    receiver_name: str = Field(..., max_length=100)
    receiver_phone: str = Field(..., max_length=20)
    origin_station_id: int
    destination_station_id: int
    weight_kg: float | None = None
    description: str | None = Field(None, max_length=500)
    fee_ghs: float = 0.0
    declared_value_ghs: float | None = None
    insurance_opted_in: bool = False
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
    declared_value_ghs: float | None = None
    insurance_opted_in: bool = False
    insurance_fee_ghs: float | None = None
    description: str | None = None
    created_at: datetime | None = None
    loaded_at: datetime | None = None
    arrived_at: datetime | None = None
    collected_at: datetime | None = None
    qr_code_base64: str | None = None
    fee_payment_status: str = "cash"

    model_config = {"from_attributes": True}


class LoadParcelRequest(BaseModel):
    parcel_id: int
    trip_id: int


class UnloadParcelRequest(BaseModel):
    parcel_id: int


class CollectParcelRequest(BaseModel):
    tracking_number: str = Field(..., max_length=25)
    otp: str = Field(..., max_length=6)


class ReturnParcelRequest(BaseModel):
    reason: str | None = Field(None, max_length=200)


class BatchUnloadRequest(BaseModel):
    parcel_ids: list[int] = Field(..., min_length=1)


class BatchUnloadFailure(BaseModel):
    id: int
    error: str


class BatchUnloadResponse(BaseModel):
    succeeded: list[int]
    failed: list[BatchUnloadFailure]


class ParcelLogEntry(BaseModel):
    id: int
    previous_status: str | None
    new_status: str
    note: str | None
    occurred_at: datetime
    clerk_name: str | None = None

    model_config = {"from_attributes": True}


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

    # Load company for weight checks
    company_result = await db.execute(select(Company).where(Company.id == current_user.company_id))
    company_obj = company_result.scalar_one_or_none()

    # Enforce max parcel weight guard
    if (
        body.weight_kg is not None
        and company_obj is not None
        and company_obj.max_parcel_weight_kg is not None
        and body.weight_kg > company_obj.max_parcel_weight_kg
    ):
        raise HTTPException(
            status_code=400,
            detail={
                "code": "WEIGHT_EXCEEDED",
                "max_kg": company_obj.max_parcel_weight_kg,
                "provided_kg": body.weight_kg,
            },
        )

    # Auto-calculate fee from company weight tiers when fee is 0 and weight is given
    resolved_fee = body.fee_ghs
    if (
        resolved_fee == 0
        and body.weight_kg is not None
        and company_obj
        and company_obj.weight_tiers
    ):
        for tier in company_obj.weight_tiers:
            max_kg = tier.get("max_kg")
            if max_kg is None or body.weight_kg <= max_kg:
                resolved_fee = float(tier.get("fee_ghs", 0))
                break

    tracking_number = await generate_tracking_number(
        db,
        current_user.company_id,
        current_user.company.company_code,  # type: ignore[union-attr]
    )

    # Calculate insurance fee: GHS 2.00 flat, or 1% of declared value (whichever is higher)
    insurance_fee: float | None = None
    if body.insurance_opted_in:
        base_insurance = 2.0
        if body.declared_value_ghs and body.declared_value_ghs > 0:
            pct_fee = round(body.declared_value_ghs * 0.01, 2)
            base_insurance = max(base_insurance, pct_fee)
        insurance_fee = base_insurance

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
        fee_ghs=resolved_fee,
        declared_value_ghs=body.declared_value_ghs,
        insurance_opted_in=body.insurance_opted_in,
        insurance_fee_ghs=insurance_fee,
        created_by_id=current_user.id,
        idempotency_key=body.idempotency_key,
        status=ParcelStatus.pending,
    )
    db.add(parcel)
    await db.commit()
    await db.refresh(parcel, ["origin_station", "destination_station"])

    from app.services.transaction_fee_service import (  # noqa: PLC0415
        get_platform_config,
        schedule_fee_record,
    )

    platform = await get_platform_config(db)
    if platform.billing_mode == "per_transaction" and current_user.company_id:
        schedule_fee_record(current_user.company_id, "parcel", parcel.id, platform.parcel_fee_ghs)

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
        current_user.sms_opt_out,
    )

    response = _parcel_to_response(parcel, include_stations=True)
    response.qr_code_base64 = generate_qr_base64(parcel.tracking_number)
    return response


class InitiateMomoPaymentRequest(BaseModel):
    phone: str | None = None  # override sender phone; defaults to the parcel's sender_phone


class InitiateMomoPaymentResponse(BaseModel):
    reference: str
    status: str  # "pending" | "pay_offline" | "success" | "failed"
    display_text: str  # USSD string or message — show this to the sender/clerk


@router.post(
    "/{parcel_id}/initiate-momo-payment",
    response_model=InitiateMomoPaymentResponse,
)
async def initiate_parcel_momo_payment(
    parcel_id: int,
    body: InitiateMomoPaymentRequest,
    db: AsyncSession = Depends(get_db_for_user),
    current_user: User = Depends(
        require_role(
            UserRole.station_clerk,
            UserRole.station_manager,
            UserRole.company_admin,
            UserRole.super_admin,
        )
    ),
):
    """
    Clerk-initiated MoMo payment for a parcel's shipping fee.
    The clerk enters the sender's phone number; a USSD prompt or push
    notification is sent to the sender's phone for approval.
    The platform fee (if in per_transaction mode) is automatically split
    to the Kwanix account via Paystack subaccount.
    """
    from uuid import uuid4  # noqa: PLC0415

    from sqlalchemy import update  # noqa: PLC0415

    from app.integrations.paystack import charge_mobile_money  # noqa: PLC0415
    from app.models.transaction_fee import TransactionFee  # noqa: PLC0415
    from app.services.transaction_fee_service import get_platform_config  # noqa: PLC0415
    from app.utils.phone import detect_momo_provider, normalize_gh_phone  # noqa: PLC0415

    result = await db.execute(
        select(Parcel)
        .where(Parcel.id == parcel_id)
        .options(selectinload(Parcel.origin_station), selectinload(Parcel.destination_station))
    )
    parcel = result.scalar_one_or_none()
    if parcel is None:
        raise HTTPException(status_code=404, detail="Parcel not found")
    if parcel.fee_payment_status == "paid":
        raise HTTPException(status_code=400, detail="Parcel fee has already been paid via MoMo")
    if parcel.fee_payment_status == "momo_pending":
        raise HTTPException(
            status_code=400,
            detail=(
                "A MoMo payment is already pending for this parcel."
                " Wait for the customer to approve or retry."
            ),
        )
    if float(parcel.fee_ghs) <= 0:
        raise HTTPException(status_code=400, detail="This parcel has no shipping fee to collect")

    phone = body.phone if body.phone else parcel.sender_phone
    try:
        provider = detect_momo_provider(phone)
        phone_normalized = normalize_gh_phone(phone)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    company_result = await db.execute(select(Company).where(Company.id == parcel.company_id))
    company = company_result.scalar_one_or_none()

    platform = await get_platform_config(db)
    platform_fee_pesewas: int | None = None
    if (
        platform.billing_mode == "per_transaction"
        and company is not None
        and company.paystack_subaccount_code
    ):
        platform_fee_pesewas = int(platform.parcel_fee_ghs * 100)

    reference = f"KX-PAR-{parcel.id}-{uuid4().hex[:8]}"
    email = f"{phone_normalized}@kwanix.app"
    amount_pesewas = int(float(parcel.fee_ghs) * 100)

    data = await charge_mobile_money(
        amount_pesewas=amount_pesewas,
        email=email,
        phone=phone,
        provider=provider,
        reference=reference,
        subaccount=company.paystack_subaccount_code if company else None,
        transaction_charge=platform_fee_pesewas,
    )

    parcel.payment_ref = reference
    parcel.fee_payment_status = "momo_pending"

    # If the platform fee is handled by Paystack split, cancel the pending
    # TransactionFee record so the sweeper doesn't double-charge the company.
    if platform_fee_pesewas is not None:
        await db.execute(
            update(TransactionFee)
            .where(
                TransactionFee.source_id == parcel.id,
                TransactionFee.fee_type == "parcel",
                TransactionFee.status == "pending",
            )
            .values(status="charged")
        )

    await db.commit()

    gateway_status = data.get("status", "pending")
    display_text = (
        data.get("display_text") or "Ask the sender to approve the prompt on their phone."
    )

    return InitiateMomoPaymentResponse(
        reference=reference,
        status=gateway_status,
        display_text=display_text,
    )


class VerifyParcelPaymentResponse(BaseModel):
    payment_status: str
    updated: bool


@router.post("/{parcel_id}/verify-payment", response_model=VerifyParcelPaymentResponse)
async def verify_parcel_payment(
    parcel_id: int,
    db: AsyncSession = Depends(get_db_for_user),
    current_user: User = Depends(get_current_user),
):
    """Check Paystack and update parcel fee_payment_status if MoMo has completed."""
    from app.integrations.paystack import verify_transaction  # noqa: PLC0415

    parcel = await get_parcel_or_404(db, parcel_id)

    if parcel.fee_payment_status == "paid":
        return VerifyParcelPaymentResponse(payment_status="paid", updated=False)

    if not parcel.payment_ref:
        return VerifyParcelPaymentResponse(payment_status=parcel.fee_payment_status, updated=False)

    try:
        data = await verify_transaction(parcel.payment_ref)
        if data.get("status") == "success":
            parcel.fee_payment_status = "paid"
            await db.commit()
            return VerifyParcelPaymentResponse(payment_status="paid", updated=True)
    except Exception:
        pass

    return VerifyParcelPaymentResponse(payment_status=parcel.fee_payment_status, updated=False)


@router.get("", response_model=list[ParcelResponse])
async def list_parcels(
    parcel_status: str | None = Query(None, alias="status"),
    q: str | None = Query(None),
    origin_station_id: int | None = Query(None),
    destination_station_id: int | None = Query(None),
    limit: int = Query(200, ge=1, le=1000),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db_for_user),
    current_user: User = Depends(get_current_user),
):
    stmt = (
        select(Parcel)
        .options(
            selectinload(Parcel.origin_station),
            selectinload(Parcel.destination_station),
        )
        .order_by(Parcel.id.desc())
    )
    if parcel_status and parcel_status in ParcelStatus.__members__:
        stmt = stmt.where(Parcel.status == ParcelStatus[parcel_status])
    if q:
        pattern = f"%{q}%"
        stmt = stmt.where(
            or_(
                Parcel.tracking_number.ilike(pattern),
                Parcel.sender_name.ilike(pattern),
                Parcel.receiver_name.ilike(pattern),
                Parcel.receiver_phone.ilike(pattern),
            )
        )
    if origin_station_id is not None:
        stmt = stmt.where(Parcel.origin_station_id == origin_station_id)
    if destination_station_id is not None:
        stmt = stmt.where(Parcel.destination_station_id == destination_station_id)
    stmt = stmt.offset(offset).limit(limit)
    result = await db.execute(stmt)
    return [_parcel_to_response(p, include_stations=True) for p in result.scalars().all()]


@router.patch("/load")
async def load_parcel(
    body: LoadParcelRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db_for_user),
    current_user: User = Depends(get_current_user),
):
    parcel = await validate_and_load(db, body.parcel_id, body.trip_id, current_user.id)
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
        current_user.sms_opt_out,
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
        current_user.sms_opt_out,
    )

    return {
        "success": True,
        "message": "Parcel marked as arrived. OTP sent to receiver.",
        "tracking_number": parcel.tracking_number,
    }


@router.post("/batch-unload", response_model=BatchUnloadResponse)
async def batch_unload_parcels(
    body: BatchUnloadRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db_for_user),
    current_user: User = Depends(
        require_role(
            UserRole.station_clerk,
            UserRole.station_manager,
            UserRole.company_admin,
            UserRole.super_admin,
        )
    ),
):
    """
    Bulk-unload multiple parcels. Returns per-parcel success/failure.
    Sends a single consolidated SMS per unique receiver phone.
    """
    succeeded: list[int] = []
    failed: list[BatchUnloadFailure] = []
    # phone -> (otp_code, station_name, [tracking_numbers])
    arrivals: dict[str, tuple[str, str, list[str]]] = {}

    for parcel_id in body.parcel_ids:
        try:
            parcel, otp_code = await unload_parcel(db, parcel_id, current_user.id)
            await db.flush()
            await db.refresh(parcel, ["destination_station"])
            station_name = parcel.destination_station.name
            phone = parcel.receiver_phone
            if phone not in arrivals:
                arrivals[phone] = (otp_code, station_name, [parcel.tracking_number])
            else:
                arrivals[phone][2].append(parcel.tracking_number)
            succeeded.append(parcel_id)
        except HTTPException as exc:
            detail = exc.detail
            error_msg = detail if isinstance(detail, str) else str(detail)
            failed.append(BatchUnloadFailure(id=parcel_id, error=error_msg))

    await db.commit()

    # Send one SMS per unique receiver phone
    for phone, (otp_code, station_name, tracking_numbers) in arrivals.items():
        if len(tracking_numbers) == 1:
            sms_body = msg_parcel_arrived(station_name, otp_code, tracking_numbers[0])
        else:
            joined = ", ".join(tracking_numbers)
            sms_body = (
                f"Your {len(tracking_numbers)} parcels ({joined}) have arrived at {station_name}. "
                f"OTP for collection: {otp_code}"
            )
        background_tasks.add_task(
            dispatch_sms,
            db,
            None,
            phone,
            sms_body,
            "parcel_arrived",
            current_user.sms_opt_out,
        )

    return BatchUnloadResponse(succeeded=succeeded, failed=failed)


@router.post("/collect")
@limiter.limit("5/minute")
async def collect_parcel_endpoint(
    request: Request,
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


@router.get(
    "/export",
    dependencies=[
        Depends(
            require_role(
                UserRole.station_manager,
                UserRole.company_admin,
                UserRole.super_admin,
            )
        )
    ],
)
async def export_parcels_csv(
    parcel_status: str | None = Query(None, alias="status"),
    q: str | None = Query(None),
    origin_station_id: int | None = Query(None),
    destination_station_id: int | None = Query(None),
    db: AsyncSession = Depends(get_db_for_user),
    current_user: User = Depends(get_current_user),
):
    """Export parcels matching the given filters as a CSV file."""
    import csv
    import io

    stmt = (
        select(Parcel)
        .options(
            selectinload(Parcel.origin_station),
            selectinload(Parcel.destination_station),
        )
        .order_by(Parcel.id.desc())
    )
    if parcel_status and parcel_status in ParcelStatus.__members__:
        stmt = stmt.where(Parcel.status == ParcelStatus[parcel_status])
    if q:
        pattern = f"%{q}%"
        stmt = stmt.where(
            or_(
                Parcel.tracking_number.ilike(pattern),
                Parcel.sender_name.ilike(pattern),
                Parcel.receiver_name.ilike(pattern),
            )
        )
    if origin_station_id is not None:
        stmt = stmt.where(Parcel.origin_station_id == origin_station_id)
    if destination_station_id is not None:
        stmt = stmt.where(Parcel.destination_station_id == destination_station_id)

    result = await db.execute(stmt)
    parcels = result.scalars().all()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(
        [
            "tracking_number",
            "status",
            "sender_name",
            "sender_phone",
            "receiver_name",
            "receiver_phone",
            "origin_station",
            "destination_station",
            "weight_kg",
            "fee_ghs",
            "description",
            "created_at",
            "loaded_at",
            "arrived_at",
            "collected_at",
        ]
    )
    for p in parcels:
        origin_name: str | None = None
        dest_name: str | None = None
        with contextlib.suppress(Exception):
            origin_name = p.origin_station.name
        with contextlib.suppress(Exception):
            dest_name = p.destination_station.name
        writer.writerow(
            [
                p.tracking_number,
                p.status.value,
                p.sender_name,
                p.sender_phone,
                p.receiver_name,
                p.receiver_phone,
                origin_name if origin_name else p.origin_station_id,
                dest_name if dest_name else p.destination_station_id,
                p.weight_kg,
                float(p.fee_ghs),
                p.description or "",
                p.created_at.isoformat() if p.created_at else "",
                p.loaded_at.isoformat() if p.loaded_at else "",
                p.arrived_at.isoformat() if p.arrived_at else "",
                p.collected_at.isoformat() if p.collected_at else "",
            ]
        )

    csv_bytes = output.getvalue().encode("utf-8")
    return Response(
        content=csv_bytes,
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="parcels.csv"'},
    )


@router.get(
    "/overdue",
    response_model=list[ParcelResponse],
    dependencies=[
        Depends(
            require_role(
                UserRole.station_manager,
                UserRole.company_admin,
                UserRole.super_admin,
            )
        )
    ],
)
async def get_overdue_parcels(
    db: AsyncSession = Depends(get_db_for_user),
    current_user: User = Depends(get_current_user),
):
    """Return arrived parcels that have been uncollected for more than 3 days."""
    cutoff = datetime.now(UTC) - timedelta(days=3)
    stmt = (
        select(Parcel)
        .options(
            selectinload(Parcel.origin_station),
            selectinload(Parcel.destination_station),
        )
        .where(
            Parcel.status == ParcelStatus.arrived,
            Parcel.arrived_at < cutoff,
        )
        .order_by(Parcel.arrived_at.asc())
    )
    result = await db.execute(stmt)
    return [_parcel_to_response(p, include_stations=True) for p in result.scalars().all()]


@router.get("/{parcel_id}", response_model=ParcelResponse)
async def get_parcel(
    parcel_id: int,
    db: AsyncSession = Depends(get_db_for_user),
    current_user: User = Depends(get_current_user),
):
    parcel = await get_parcel_or_404(db, parcel_id)
    return _parcel_to_response(parcel)


@router.get("/{parcel_id}/logs", response_model=list[ParcelLogEntry])
async def get_parcel_logs(
    parcel_id: int,
    db: AsyncSession = Depends(get_db_for_user),
    _: User = Depends(
        require_role(UserRole.station_manager, UserRole.company_admin, UserRole.super_admin)
    ),
):
    result = await db.execute(
        select(ParcelLog)
        .where(ParcelLog.parcel_id == parcel_id)
        .options(selectinload(ParcelLog.clerk))
        .order_by(ParcelLog.occurred_at.asc())
    )
    logs = result.scalars().all()
    return [
        ParcelLogEntry(
            id=log.id,
            previous_status=log.previous_status,
            new_status=log.new_status,
            note=log.note,
            occurred_at=log.occurred_at,
            clerk_name=log.clerk.full_name if log.clerk else None,
        )
        for log in logs
    ]


@router.patch("/{parcel_id}/return", response_model=ParcelResponse)
async def return_parcel_endpoint(
    parcel_id: int,
    body: ReturnParcelRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db_for_user),
    current_user: User = Depends(
        require_role(
            UserRole.station_clerk,
            UserRole.station_manager,
            UserRole.company_admin,
            UserRole.super_admin,
        )
    ),
):
    parcel = await return_parcel(db, parcel_id, current_user.id, body.reason)
    await db.commit()
    await db.refresh(parcel, ["origin_station", "destination_station"])

    background_tasks.add_task(
        dispatch_sms,
        db,
        parcel.id,
        parcel.sender_phone,
        msg_parcel_return_sender(parcel.tracking_number, body.reason),
        "parcel_returned",
        current_user.sms_opt_out,
    )

    return _parcel_to_response(parcel, include_stations=True)


@router.get("/{parcel_id}/receipt")
async def get_parcel_receipt(
    parcel_id: int,
    db: AsyncSession = Depends(get_db_for_user),
    current_user: User = Depends(
        require_role(
            UserRole.station_clerk,
            UserRole.station_manager,
            UserRole.company_admin,
            UserRole.super_admin,
        )
    ),
):
    """Download a PDF receipt for a collected parcel (status must be picked_up)."""
    parcel = await get_parcel_or_404(db, parcel_id)
    if parcel.status != ParcelStatus.picked_up:
        raise HTTPException(
            status_code=400,
            detail={
                "code": "NOT_COLLECTED",
                "message": "Receipt is only available for collected parcels.",
            },
        )
    company_result = await db.execute(select(Company).where(Company.id == parcel.company_id))
    company = company_result.scalar_one_or_none()
    pdf_bytes = generate_receipt_pdf(
        parcel,
        company_name=company.name if company else None,
        brand_color=company.brand_color if company else None,
    )
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="receipt-{parcel.tracking_number}.pdf"'
        },
    )


class ResendOtpResponse(BaseModel):
    sent: bool


@router.post(
    "/{parcel_id}/resend-otp",
    response_model=ResendOtpResponse,
    dependencies=[
        Depends(
            require_role(
                UserRole.station_clerk,
                UserRole.station_manager,
                UserRole.company_admin,
                UserRole.super_admin,
            )
        )
    ],
)
async def resend_otp(
    parcel_id: int,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db_for_user),
    current_user: User = Depends(get_current_user),
):
    """Regenerate OTP and resend to receiver. Only valid when parcel status is 'arrived'."""
    from app.services.otp_service import generate_otp

    parcel = await get_parcel_or_404(db, parcel_id)

    if parcel.status != ParcelStatus.arrived:
        raise HTTPException(
            status_code=400,
            detail={
                "code": "NOT_ARRIVED",
                "message": "OTP can only be resent for parcels that have arrived.",
            },
        )

    otp_code, otp_expires_at = generate_otp()
    parcel.otp_code = otp_code
    parcel.otp_expires_at = otp_expires_at
    parcel.otp_attempt_count = 0
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
        current_user.sms_opt_out,
    )

    return ResendOtpResponse(sent=True)


class RemindResponse(BaseModel):
    sms_sent: bool


@router.post(
    "/{parcel_id}/remind",
    response_model=RemindResponse,
)
async def remind_pickup(
    parcel_id: int,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db_for_user),
    current_user: User = Depends(
        require_role(
            UserRole.station_clerk,
            UserRole.station_manager,
            UserRole.company_admin,
            UserRole.super_admin,
        )
    ),
):
    """Send a pickup reminder SMS to the receiver if the parcel has been arrived >24h."""
    from app.models.sms_log import SmsLog

    parcel = await get_parcel_or_404(db, parcel_id)

    if parcel.status != ParcelStatus.arrived:
        raise HTTPException(
            status_code=400,
            detail={
                "code": "NOT_ARRIVED",
                "message": "Reminders can only be sent for arrived parcels.",
            },  # noqa: E501
        )

    cutoff_24h = datetime.now(UTC) - timedelta(hours=24)
    if parcel.arrived_at is None or parcel.arrived_at > cutoff_24h:
        raise HTTPException(
            status_code=400,
            detail={
                "code": "TOO_SOON",
                "message": "Parcel must have been arrived for at least 24 hours.",
            },
        )

    # Spam guard: skip if a reminder was sent in the last 24h for this parcel
    recent_result = await db.execute(
        select(SmsLog).where(
            SmsLog.parcel_id == parcel_id,
            SmsLog.event_type == "parcel_pickup_reminder",
            SmsLog.sent_at >= cutoff_24h,
        )
    )
    if recent_result.scalar_one_or_none():
        return RemindResponse(sms_sent=False)

    await db.refresh(parcel, ["destination_station"])
    station_name = parcel.destination_station.name

    background_tasks.add_task(
        dispatch_sms,
        db,
        parcel.id,
        parcel.receiver_phone,
        msg_parcel_pickup_reminder(parcel.tracking_number, station_name),
        "parcel_pickup_reminder",
    )
    return RemindResponse(sms_sent=True)


# ── Helpers ───────────────────────────────────────────────────────────────────


def _parcel_to_response(parcel: Parcel, include_stations: bool = False) -> ParcelResponse:
    origin_name: str | None = None
    dest_name: str | None = None
    if include_stations:
        with contextlib.suppress(Exception):
            origin_name = parcel.origin_station.name
        with contextlib.suppress(Exception):
            dest_name = parcel.destination_station.name
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
        declared_value_ghs=(
            float(parcel.declared_value_ghs) if parcel.declared_value_ghs is not None else None
        ),
        insurance_opted_in=getattr(parcel, "insurance_opted_in", False),
        insurance_fee_ghs=(
            float(parcel.insurance_fee_ghs)
            if getattr(parcel, "insurance_fee_ghs", None) is not None
            else None
        ),
        description=parcel.description,
        created_at=parcel.created_at,
        loaded_at=parcel.loaded_at,
        arrived_at=parcel.arrived_at,
        collected_at=parcel.collected_at,
        fee_payment_status=parcel.fee_payment_status,
    )
