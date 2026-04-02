from datetime import UTC, datetime
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, field_validator
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.config import settings
from app.dependencies.auth import get_current_user, get_db_for_user, require_role
from app.integrations.arkesel import send_sms
from app.integrations.paystack import initialize_transaction
from app.models.company import Company
from app.models.ticket import PaymentStatus, Ticket, TicketSource, TicketStatus
from app.models.trip import Trip, TripStatus
from app.models.user import User, UserRole
from app.utils.phone import normalize_gh_phone

router = APIRouter()


class CreateTicketRequest(BaseModel):
    trip_id: int
    passenger_name: str
    passenger_phone: str
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


@router.get("", response_model=list[TicketResponse])
async def list_tickets(
    trip_id: int | None = None,
    db: AsyncSession = Depends(get_db_for_user),
    current_user: User = Depends(get_current_user),
):
    q = select(Ticket).order_by(Ticket.id.desc())
    if trip_id is not None:
        q = q.where(Ticket.trip_id == trip_id)
    result = await db.execute(q)
    return result.scalars().all()


@router.post("", response_model=TicketResponse, status_code=status.HTTP_201_CREATED)
async def create_ticket(
    body: CreateTicketRequest,
    db: AsyncSession = Depends(get_db_for_user),
    current_user: User = Depends(get_current_user),
):
    # Validate trip exists and is accepting passengers
    trip_result = await db.execute(select(Trip).where(Trip.id == body.trip_id))
    trip = trip_result.scalar_one_or_none()
    if trip is None:
        raise HTTPException(status_code=404, detail="Trip not found")
    if trip.status != TripStatus.loading:
        raise HTTPException(
            status_code=400,
            detail=f"Trip is not accepting passengers (status: {trip.status.value})",
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
        payment_status=PaymentStatus.paid,  # counter = cash already received
    )
    db.add(ticket)
    await db.commit()
    await db.refresh(ticket)
    return ticket


class InitiatePaymentRequest(BaseModel):
    email: str | None = None  # Optional — falls back to {phone}@routepass.app


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

    email = body.email or f"{ticket.passenger_phone}@routepass.app"
    reference = f"RP-{ticket.id}-{uuid4().hex[:8]}"
    amount_pesewas = int(ticket.fare_ghs * 100)

    data = await initialize_transaction(
        amount_kobo=amount_pesewas,
        email=email,
        reference=reference,
    )

    ticket.payment_ref = reference
    await db.commit()

    return InitiatePaymentResponse(
        authorization_url=data["authorization_url"],
        reference=reference,
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
    company_result = await db.execute(
        select(Company).where(Company.id == ticket.company_id)
    )
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
    )
    return detail


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
        select(Ticket)
        .where(Ticket.id == ticket_id)
        .options(selectinload(Ticket.trip))
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
            dst_name = loaded_trip.destination_station.name if loaded_trip.destination_station else ""
            route = f"{dep_name} → {dst_name}"

    message = (
        f"Your RoutePass ticket is ready!\n"
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
