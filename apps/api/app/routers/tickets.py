from datetime import UTC, datetime
from uuid import uuid4

import structlog
from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import Response
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.config import settings
from app.dependencies.auth import get_current_user, get_db_for_user, require_role
from app.integrations.arkesel import send_sms
from app.integrations.paystack import initialize_transaction, refund_transaction
from app.models.company import Company
from app.models.ticket import PaymentStatus, Ticket, TicketSource, TicketStatus
from app.models.trip import Trip, TripStatus
from app.models.user import User, UserRole
from app.services.qr_service import generate_qr_png_bytes
from app.utils.phone import normalize_gh_phone

logger = structlog.get_logger()

router = APIRouter()


class CreateTicketRequest(BaseModel):
    trip_id: int
    passenger_name: str = Field(..., max_length=100)
    passenger_phone: str = Field(..., max_length=20)
    seat_number: int
    fare_ghs: float

    @field_validator("passenger_phone", mode="before")
    @classmethod
    def normalize_phone(cls, v: str) -> str:
        try:
            return normalize_gh_phone(v)
        except ValueError as exc:
            raise ValueError(str(exc)) from exc


class TicketResponse(BaseModel):
    id: int
    trip_id: int
    passenger_name: str
    passenger_phone: str
    seat_number: int
    fare_ghs: float
    status: str
    payment_status: str
    source: str = "counter"

    model_config = {"from_attributes": True}


class TicketDetailResponse(TicketResponse):
    """Enriched response used by the print/detail view."""

    company_name: str | None = None
    brand_color: str | None = None
    departure_station: str | None = None
    destination_station: str | None = None
    departure_time: str | None = None
    vehicle_plate: str | None = None
    refund_ref: str | None = None


@router.get("", response_model=list[TicketResponse])
async def list_tickets(
    trip_id: int | None = None,
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db_for_user),
    current_user: User = Depends(get_current_user),
):
    q = select(Ticket).order_by(Ticket.id.desc())
    if trip_id is not None:
        q = q.where(Ticket.trip_id == trip_id)
    result = await db.execute(q.limit(limit).offset(offset))
    return result.scalars().all()


@router.post(
    "",
    response_model=TicketResponse,
    status_code=status.HTTP_201_CREATED,
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
async def create_ticket(
    body: CreateTicketRequest,
    db: AsyncSession = Depends(get_db_for_user),
    current_user: User = Depends(get_current_user),
):
    # Validate trip exists and is accepting passengers
    trip_result = await db.execute(
        select(Trip).where(Trip.id == body.trip_id).options(selectinload(Trip.vehicle))
    )
    trip = trip_result.scalar_one_or_none()
    if trip is None:
        raise HTTPException(status_code=404, detail="Trip not found")
    if trip.status not in (TripStatus.scheduled, TripStatus.loading):
        raise HTTPException(
            status_code=400,
            detail=f"Trip is not accepting passengers (status: {trip.status.value})",
        )

    # Check vehicle capacity — count non-cancelled tickets
    count_result = await db.execute(
        select(func.count(Ticket.id)).where(
            Ticket.trip_id == body.trip_id,
            Ticket.status != TicketStatus.cancelled,
        )
    )
    ticket_count = count_result.scalar() or 0
    if ticket_count >= trip.vehicle.capacity:
        raise HTTPException(
            status_code=400,
            detail={"code": "TRIP_FULL", "available": 0},
        )

    # Cancel any expired online holds for this seat before checking availability
    await db.execute(
        update(Ticket)
        .where(
            Ticket.trip_id == body.trip_id,
            Ticket.seat_number == body.seat_number,
            Ticket.source == TicketSource.online,
            Ticket.payment_status == PaymentStatus.pending,
            Ticket.booking_expires_at < datetime.now(UTC),
        )
        .values(status=TicketStatus.cancelled)
    )

    # Check seat not already taken — SELECT FOR UPDATE prevents race conditions
    existing = await db.execute(
        select(Ticket)
        .where(
            Ticket.trip_id == body.trip_id,
            Ticket.seat_number == body.seat_number,
            Ticket.status != TicketStatus.cancelled,
        )
        .with_for_update()
    )
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": "SEAT_TAKEN", "seat_number": body.seat_number},
        )

    ticket = Ticket(
        company_id=current_user.company_id,
        trip_id=body.trip_id,
        created_by_id=current_user.id,
        passenger_name=body.passenger_name,
        passenger_phone=body.passenger_phone,
        seat_number=body.seat_number,
        fare_ghs=body.fare_ghs,
        source=TicketSource.counter,
        payment_status=PaymentStatus.pending,
    )
    db.add(ticket)
    await db.commit()
    await db.refresh(ticket)
    return ticket


class InitiatePaymentRequest(BaseModel):
    email: str | None = None  # Optional — falls back to {phone}@kwanix.app


class InitiatePaymentResponse(BaseModel):
    authorization_url: str
    reference: str


@router.post(
    "/{ticket_id}/initiate-payment",
    response_model=InitiatePaymentResponse,
)
async def initiate_payment(
    ticket_id: int,
    body: InitiatePaymentRequest,
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
    result = await db.execute(select(Ticket).where(Ticket.id == ticket_id))
    ticket = result.scalar_one_or_none()
    if ticket is None:
        raise HTTPException(status_code=404, detail="Ticket not found")
    if ticket.payment_status != PaymentStatus.pending:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot initiate payment: payment_status is '{ticket.payment_status.value}'",
        )

    # Load company to get subaccount code and billing config
    company_result = await db.execute(select(Company).where(Company.id == ticket.company_id))
    company = company_result.scalar_one_or_none()

    email = body.email or f"{ticket.passenger_phone}@kwanix.app"
    reference = f"KX-{ticket.id}-{uuid4().hex[:8]}"
    amount_pesewas = int(ticket.fare_ghs * 100)

    # Determine platform fee split for per_transaction billing mode
    from app.services.transaction_fee_service import get_platform_config  # noqa: PLC0415

    platform = await get_platform_config(db)
    platform_fee_pesewas: int | None = None
    if (
        platform.billing_mode == "per_transaction"
        and company is not None
        and company.paystack_subaccount_code
    ):
        platform_fee_pesewas = int(platform.ticket_fee_ghs * 100)

    data = await initialize_transaction(
        amount_kobo=amount_pesewas,
        email=email,
        reference=reference,
        subaccount=company.paystack_subaccount_code if company else None,
        transaction_charge=platform_fee_pesewas,
    )

    ticket.payment_ref = reference
    await db.commit()

    return InitiatePaymentResponse(
        authorization_url=data["authorization_url"],
        reference=reference,
    )


class InitiateMomoRequest(BaseModel):
    phone: str | None = None  # override passenger phone; defaults to the ticket's passenger_phone


class InitiateMomoResponse(BaseModel):
    reference: str
    status: str  # "pending" | "pay_offline" | "success" | "failed"
    display_text: str  # USSD string or message — show this to the passenger


@router.post(
    "/{ticket_id}/initiate-momo-payment",
    response_model=InitiateMomoResponse,
)
async def initiate_ticket_momo_payment(
    ticket_id: int,
    body: InitiateMomoRequest,
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
    Clerk-initiated MoMo payment for a walk-in counter ticket.
    The clerk enters the passenger's phone number; a USSD prompt or push
    notification is sent to the passenger's phone for approval.
    """
    from app.integrations.paystack import charge_mobile_money  # noqa: PLC0415
    from app.services.transaction_fee_service import get_platform_config  # noqa: PLC0415
    from app.utils.phone import detect_momo_provider, normalize_gh_phone  # noqa: PLC0415

    result = await db.execute(select(Ticket).where(Ticket.id == ticket_id))
    ticket = result.scalar_one_or_none()
    if ticket is None:
        raise HTTPException(status_code=404, detail="Ticket not found")
    if ticket.payment_status != PaymentStatus.pending:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot initiate payment: payment_status is '{ticket.payment_status.value}'",
        )

    phone = body.phone or ticket.passenger_phone
    try:
        provider = detect_momo_provider(phone)
        phone_normalized = normalize_gh_phone(phone)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    company_result = await db.execute(select(Company).where(Company.id == ticket.company_id))
    company = company_result.scalar_one_or_none()

    platform = await get_platform_config(db)
    platform_fee_pesewas: int | None = None
    if (
        platform.billing_mode == "per_transaction"
        and company is not None
        and company.paystack_subaccount_code
    ):
        platform_fee_pesewas = int(platform.ticket_fee_ghs * 100)

    reference = f"KX-{ticket.id}-{uuid4().hex[:8]}"
    email = f"{phone_normalized}@kwanix.app"
    amount_pesewas = int(ticket.fare_ghs * 100)

    data = await charge_mobile_money(
        amount_pesewas=amount_pesewas,
        email=email,
        phone=phone,
        provider=provider,
        reference=reference,
        subaccount=company.paystack_subaccount_code if company else None,
        transaction_charge=platform_fee_pesewas,
    )

    ticket.payment_ref = reference
    await db.commit()

    gateway_status = data.get("status", "pending")
    display_text = data.get("display_text") or "Ask the passenger to approve the prompt on their phone."

    return InitiateMomoResponse(
        reference=reference,
        status=gateway_status,
        display_text=display_text,
    )


class VerifyPaymentResponse(BaseModel):
    payment_status: str
    updated: bool


@router.post(
    "/{ticket_id}/verify-payment",
    response_model=VerifyPaymentResponse,
)
async def verify_ticket_payment(
    ticket_id: int,
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
    Check the current payment status of a ticket with Paystack and update
    the DB if the payment has been confirmed. Called by the clerk after the
    customer approves the MoMo prompt.
    """
    from app.integrations.paystack import verify_transaction  # noqa: PLC0415

    result = await db.execute(select(Ticket).where(Ticket.id == ticket_id))
    ticket = result.scalar_one_or_none()
    if ticket is None:
        raise HTTPException(status_code=404, detail="Ticket not found")

    if ticket.payment_status == PaymentStatus.paid:
        return VerifyPaymentResponse(payment_status="paid", updated=False)

    if not ticket.payment_ref:
        return VerifyPaymentResponse(
            payment_status=ticket.payment_status.value, updated=False
        )

    data = await verify_transaction(ticket.payment_ref)
    gateway_status = data.get("status")
    updated = False

    if gateway_status == "success" and ticket.payment_status != PaymentStatus.paid:
        ticket.payment_status = PaymentStatus.paid
        ticket.booking_expires_at = None
        db.add(ticket)
        await db.commit()
        updated = True
    elif gateway_status == "failed" and ticket.payment_status != PaymentStatus.failed:
        ticket.payment_status = PaymentStatus.failed
        db.add(ticket)
        await db.commit()
        updated = True

    return VerifyPaymentResponse(
        payment_status=ticket.payment_status.value,
        updated=updated,
    )


@router.get("/{ticket_id}", response_model=TicketDetailResponse)
async def get_ticket(
    ticket_id: int,
    db: AsyncSession = Depends(get_db_for_user),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Ticket)
        .where(Ticket.id == ticket_id)
        .options(
            selectinload(Ticket.trip).selectinload(Trip.departure_station),
            selectinload(Ticket.trip).selectinload(Trip.destination_station),
            selectinload(Ticket.trip).selectinload(Trip.vehicle),
        )
    )
    ticket = result.scalar_one_or_none()
    if ticket is None:
        raise HTTPException(status_code=404, detail="Ticket not found")

    # Fetch company for brand_color
    company_result = await db.execute(select(Company).where(Company.id == ticket.company_id))
    company = company_result.scalar_one_or_none()

    detail = TicketDetailResponse(
        id=ticket.id,
        trip_id=ticket.trip_id,
        passenger_name=ticket.passenger_name,
        passenger_phone=ticket.passenger_phone,
        seat_number=ticket.seat_number,
        fare_ghs=float(ticket.fare_ghs),
        status=ticket.status,
        payment_status=ticket.payment_status,
        company_name=company.name if company else None,
        brand_color=company.brand_color if company else None,
        departure_station=ticket.trip.departure_station.name if ticket.trip else None,
        destination_station=ticket.trip.destination_station.name if ticket.trip else None,
        departure_time=ticket.trip.departure_time.isoformat() if ticket.trip else None,
        vehicle_plate=ticket.trip.vehicle.plate_number if ticket.trip else None,
        refund_ref=ticket.refund_ref,
    )
    return detail


@router.patch(
    "/{ticket_id}/cancel",
    response_model=TicketResponse,
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
async def cancel_ticket(
    ticket_id: int,
    db: AsyncSession = Depends(get_db_for_user),
    current_user: User = Depends(get_current_user),
):
    """
    Cancel a ticket. Cancellation is always committed first.
    If payment_status=paid a Paystack refund is attempted afterwards;
    if the refund call fails the ticket stays cancelled and payment_status
    remains 'paid' so an operator can process the refund manually.
    """
    result = await db.execute(select(Ticket).where(Ticket.id == ticket_id))
    ticket = result.scalar_one_or_none()
    if ticket is None:
        raise HTTPException(status_code=404, detail="Ticket not found")
    if ticket.status == TicketStatus.cancelled:
        raise HTTPException(status_code=400, detail="Ticket is already cancelled")

    needs_refund = ticket.payment_status == PaymentStatus.paid and bool(ticket.payment_ref)
    payment_ref = ticket.payment_ref
    amount_kobo = int(float(ticket.fare_ghs) * 100)

    ticket.status = TicketStatus.cancelled
    await db.commit()
    await db.refresh(ticket)

    if needs_refund:
        try:
            await refund_transaction(payment_ref, amount_kobo)
            ticket.payment_status = PaymentStatus.refunded
            await db.commit()
            await db.refresh(ticket)
        except Exception:  # noqa: BLE001
            logger.error(
                "refund.failed_after_cancel",
                ticket_id=ticket_id,
                payment_ref=payment_ref,
            )

    return ticket


class BatchCancelRequest(BaseModel):
    ticket_ids: list[int] = Field(..., min_length=1)


class BatchCancelResponse(BaseModel):
    succeeded: list[int]
    failed: list[int]


@router.post(
    "/batch-cancel",
    response_model=BatchCancelResponse,
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
async def batch_cancel_tickets(
    body: BatchCancelRequest,
    db: AsyncSession = Depends(get_db_for_user),
    current_user: User = Depends(get_current_user),
):
    """
    Cancel multiple tickets by ID.

    Phase 1: mark all requested tickets as cancelled and commit. This is
    always atomic — a DB error on one ticket adds it to `failed` without
    affecting the rest.

    Phase 2: attempt Paystack refunds for any previously-paid tickets.
    Refund failures are logged but do NOT un-cancel the ticket. The
    payment_status stays 'paid' so operators can process refunds manually.
    """
    succeeded: list[int] = []
    failed: list[int] = []
    tickets_to_refund: list[Ticket] = []

    # ── Phase 1: cancel ───────────────────────────────────────────────────────
    for ticket_id in body.ticket_ids:
        try:
            result = await db.execute(select(Ticket).where(Ticket.id == ticket_id))
            ticket = result.scalar_one_or_none()
            if ticket is None or ticket.status == TicketStatus.cancelled:
                failed.append(ticket_id)
                continue
            if ticket.payment_status == PaymentStatus.paid and ticket.payment_ref:
                tickets_to_refund.append(ticket)
            ticket.status = TicketStatus.cancelled
            await db.flush()
            succeeded.append(ticket_id)
        except Exception:  # noqa: BLE001
            failed.append(ticket_id)

    await db.commit()  # commit all cancellations; expire_on_commit=False keeps objects live

    # ── Phase 2: refund (non-fatal) ───────────────────────────────────────────
    for ticket in tickets_to_refund:
        try:
            amount_kobo = int(float(ticket.fare_ghs) * 100)
            await refund_transaction(ticket.payment_ref, amount_kobo)
            ticket.payment_status = PaymentStatus.refunded
            await db.commit()
        except Exception:  # noqa: BLE001
            logger.error(
                "batch_cancel.refund_failed",
                ticket_id=ticket.id,
                payment_ref=ticket.payment_ref,
            )

    return BatchCancelResponse(succeeded=succeeded, failed=failed)


class RefundTicketRequest(BaseModel):
    refund_ref: str | None = None


@router.patch(
    "/{ticket_id}/refund",
    response_model=TicketResponse,
    dependencies=[Depends(require_role(UserRole.company_admin, UserRole.super_admin))],
)
async def refund_ticket(
    ticket_id: int,
    body: RefundTicketRequest,
    db: AsyncSession = Depends(get_db_for_user),
    current_user: User = Depends(require_role(UserRole.company_admin, UserRole.super_admin)),
):
    """Mark a ticket as refunded, storing an optional Paystack refund reference."""
    result = await db.execute(select(Ticket).where(Ticket.id == ticket_id))
    ticket = result.scalar_one_or_none()
    if ticket is None:
        raise HTTPException(status_code=404, detail="Ticket not found")
    if ticket.payment_status == PaymentStatus.refunded:
        raise HTTPException(status_code=400, detail="Ticket is already marked as refunded")

    ticket.status = TicketStatus.cancelled
    ticket.payment_status = PaymentStatus.refunded
    ticket.refund_ref = body.refund_ref

    await db.commit()
    await db.refresh(ticket)
    return ticket


@router.get("/{ticket_id}/qr")
async def get_ticket_qr(
    ticket_id: int,
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
    """Return a PNG QR code image for the given ticket (encodes TICKET:{id}:{trip_id}:{seat})."""
    result = await db.execute(select(Ticket).where(Ticket.id == ticket_id))
    ticket = result.scalar_one_or_none()
    if ticket is None:
        raise HTTPException(status_code=404, detail="Ticket not found")

    payload = f"TICKET:{ticket.id}:{ticket.trip_id}:{ticket.seat_number}"
    png_bytes = generate_qr_png_bytes(payload)
    return Response(content=png_bytes, media_type="image/png")


class VerifyTicketRequest(BaseModel):
    payload: str  # format: TICKET:{id}:{trip_id}:{seat}


class VerifyTicketResponse(BaseModel):
    valid: bool
    passenger_name: str | None = None
    seat_number: int | None = None
    status: str | None = None
    trip_info: str | None = None
    reason: str | None = None


@router.post(
    "/verify",
    response_model=VerifyTicketResponse,
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
async def verify_ticket(
    body: VerifyTicketRequest,
    db: AsyncSession = Depends(get_db_for_user),
    current_user: User = Depends(get_current_user),
):
    """Verify a ticket QR code payload (TICKET:{id}:{trip_id}:{seat})."""
    parts = body.payload.strip().split(":")
    if len(parts) != 4 or parts[0] != "TICKET":
        return VerifyTicketResponse(valid=False, reason="Invalid QR payload format")

    try:
        ticket_id = int(parts[1])
        trip_id = int(parts[2])
        seat_number = int(parts[3])
    except (ValueError, IndexError):
        return VerifyTicketResponse(valid=False, reason="Invalid QR payload format")

    result = await db.execute(
        select(Ticket)
        .where(Ticket.id == ticket_id)
        .options(
            selectinload(Ticket.trip).selectinload(Trip.departure_station),
            selectinload(Ticket.trip).selectinload(Trip.destination_station),
        )
    )
    ticket = result.scalar_one_or_none()
    if ticket is None:
        return VerifyTicketResponse(valid=False, reason="Ticket not found")

    if ticket.trip_id != trip_id:
        return VerifyTicketResponse(valid=False, reason="Trip mismatch")
    if ticket.seat_number != seat_number:
        return VerifyTicketResponse(valid=False, reason="Seat mismatch")
    if ticket.status == TicketStatus.cancelled:
        return VerifyTicketResponse(
            valid=False,
            passenger_name=ticket.passenger_name,
            seat_number=ticket.seat_number,
            status=ticket.status.value,
            reason="Ticket is cancelled",
        )
    if ticket.status == TicketStatus.used:
        return VerifyTicketResponse(
            valid=False,
            passenger_name=ticket.passenger_name,
            seat_number=ticket.seat_number,
            status=ticket.status.value,
            reason="Ticket already used",
        )

    trip_info = None
    if ticket.trip:
        dep = ticket.trip.departure_station.name if ticket.trip.departure_station else "?"
        dst = ticket.trip.destination_station.name if ticket.trip.destination_station else "?"
        trip_info = f"{dep} → {dst} · {ticket.trip.departure_time.strftime('%d %b %Y %H:%M')}"

    return VerifyTicketResponse(
        valid=True,
        passenger_name=ticket.passenger_name,
        seat_number=ticket.seat_number,
        status=ticket.status.value,
        trip_info=trip_info,
    )


class ShareTicketRequest(BaseModel):
    phone: str

    @field_validator("phone", mode="before")
    @classmethod
    def normalize_phone(cls, v: str) -> str:
        try:
            return normalize_gh_phone(v)
        except ValueError as exc:
            raise ValueError(str(exc)) from exc


class ShareTicketResponse(BaseModel):
    url: str
    sms_sent: bool


@router.post("/{ticket_id}/share", response_model=ShareTicketResponse)
async def share_ticket(
    ticket_id: int,
    body: ShareTicketRequest,
    db: AsyncSession = Depends(get_db_for_user),
    current_user: User = Depends(get_current_user),
):
    """Send the passenger a link to view and download their ticket."""
    result = await db.execute(
        select(Ticket).where(Ticket.id == ticket_id).options(selectinload(Ticket.trip))
    )
    ticket = result.scalar_one_or_none()
    if ticket is None:
        raise HTTPException(status_code=404, detail="Ticket not found")

    ticket_url = f"{settings.public_app_url}/ticket/{ticket_id}"

    route = ""
    if ticket.trip:
        dep = await db.execute(
            select(Trip)
            .where(Trip.id == ticket.trip_id)
            .options(
                selectinload(Trip.departure_station),
                selectinload(Trip.destination_station),
            )
        )
        loaded_trip = dep.scalar_one_or_none()
        if loaded_trip:
            dep_name = loaded_trip.departure_station.name if loaded_trip.departure_station else ""
            dst_name = (
                loaded_trip.destination_station.name if loaded_trip.destination_station else ""
            )
            route = f"{dep_name} → {dst_name}"

    message = (
        f"Your Kwanix ticket is ready!\n"
        f"Seat {ticket.seat_number}"
        + (f" | {route}" if route else "")
        + f"\nView & save your ticket:\n{ticket_url}"
    )

    sms_result = await send_sms(
        recipient=body.phone,
        message=message,
        event_type="ticket_share",
    )
    sms_sent = sms_result.get("status") not in ("skipped", "error", None)

    return ShareTicketResponse(url=ticket_url, sms_sent=sms_sent)
