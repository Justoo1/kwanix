"""Public (unauthenticated) endpoints for passenger-facing mobile app."""

from datetime import UTC, datetime, timedelta
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.dependencies.auth import get_db_public
from app.integrations.paystack import initialize_transaction
from app.middleware.rate_limit import limiter
from app.models.company import Company
from app.models.ticket import PaymentStatus, Ticket, TicketSource, TicketStatus
from app.models.trip import Trip, TripStatus
from app.utils.phone import normalize_gh_phone

router = APIRouter()

BOOKING_HOLD_MINUTES = 15

# Statuses that represent an active (seat-occupying) ticket
_ACTIVE_PAYMENT_CONDITIONS = [
    (Ticket.payment_status == PaymentStatus.paid),
    ((Ticket.payment_status == PaymentStatus.pending) & (Ticket.booking_expires_at > func.now())),
]


def _is_active_ticket():
    """SQLAlchemy condition: ticket is paid OR unexpired pending hold."""
    from sqlalchemy import or_

    return or_(
        Ticket.payment_status == PaymentStatus.paid,
        (Ticket.payment_status == PaymentStatus.pending) & (Ticket.booking_expires_at > func.now()),
    )


# ── Response schemas ───────────────────────────────────────────────────────────


class PublicTripResponse(BaseModel):
    id: int
    departure_station_name: str
    destination_station_name: str
    departure_time: str
    vehicle_capacity: int
    available_seat_count: int
    price_ghs: float | None
    company_name: str
    brand_color: str | None


class SeatMapResponse(BaseModel):
    capacity: int
    taken: list[int]


class BookRequest(BaseModel):
    passenger_name: str = Field(..., max_length=100)
    passenger_phone: str = Field(..., max_length=20)
    seat_number: int
    passenger_email: str | None = None

    @field_validator("passenger_phone", mode="before")
    @classmethod
    def normalize_phone(cls, v: str) -> str:
        try:
            return normalize_gh_phone(v)
        except ValueError as exc:
            raise ValueError(str(exc)) from exc


class BookResponse(BaseModel):
    ticket_id: int
    authorization_url: str
    reference: str


class PublicTicketResponse(BaseModel):
    id: int
    passenger_name: str
    seat_number: int
    fare_ghs: float
    status: str
    payment_status: str
    departure_station: str | None
    destination_station: str | None
    departure_time: str | None
    vehicle_plate: str | None
    company_name: str | None
    brand_color: str | None


# ── Endpoints ─────────────────────────────────────────────────────────────────


@router.get("/trips", response_model=list[PublicTripResponse])
@limiter.limit("100/minute")
async def list_public_trips(
    request: Request,
    from_station_id: int | None = None,
    to_station_id: int | None = None,
    date: str | None = None,
    db: AsyncSession = Depends(get_db_public),
):
    """Return trips open for online booking."""
    q = (
        select(Trip)
        .where(
            Trip.booking_open.is_(True),
            Trip.status.in_([TripStatus.scheduled, TripStatus.loading]),
            Trip.departure_time > func.now(),
        )
        .options(
            selectinload(Trip.vehicle),
            selectinload(Trip.departure_station),
            selectinload(Trip.destination_station),
            selectinload(Trip.company),
            selectinload(Trip.tickets),
        )
        .order_by(Trip.departure_time.asc())
    )
    if from_station_id is not None:
        q = q.where(Trip.departure_station_id == from_station_id)
    if to_station_id is not None:
        q = q.where(Trip.destination_station_id == to_station_id)
    if date is not None:
        try:
            from datetime import date as date_type

            day = date_type.fromisoformat(date)
        except ValueError as err:
            raise HTTPException(
                status_code=400, detail="Invalid date format, use YYYY-MM-DD"
            ) from err
        q = q.where(func.date(Trip.departure_time) == day)

    result = await db.execute(q)
    trips = result.scalars().all()

    output = []
    for trip in trips:
        active_seats = sum(
            1
            for t in trip.tickets
            if t.status != TicketStatus.cancelled
            and (
                t.payment_status == PaymentStatus.paid
                or (
                    t.payment_status == PaymentStatus.pending
                    and t.booking_expires_at is not None
                    and t.booking_expires_at > datetime.now(UTC)
                )
            )
        )
        capacity = trip.vehicle.capacity if trip.vehicle else 0
        output.append(
            PublicTripResponse(
                id=trip.id,
                departure_station_name=trip.departure_station.name,
                destination_station_name=trip.destination_station.name,
                departure_time=trip.departure_time.isoformat(),
                vehicle_capacity=capacity,
                available_seat_count=max(0, capacity - active_seats),
                price_ghs=float(trip.price_ticket_base) if trip.price_ticket_base else None,
                company_name=trip.company.name,
                brand_color=trip.company.brand_color,
            )
        )
    return output


@router.get("/trips/{trip_id}/seats", response_model=SeatMapResponse)
@limiter.limit("100/minute")
async def get_seat_map(
    request: Request,
    trip_id: int,
    db: AsyncSession = Depends(get_db_public),
):
    """Return capacity and list of taken seat numbers for a trip."""
    trip_result = await db.execute(
        select(Trip).where(Trip.id == trip_id).options(selectinload(Trip.vehicle))
    )
    trip = trip_result.scalar_one_or_none()
    if trip is None:
        raise HTTPException(status_code=404, detail="Trip not found")

    tickets_result = await db.execute(
        select(Ticket.seat_number).where(
            Ticket.trip_id == trip_id,
            Ticket.status != TicketStatus.cancelled,
            _is_active_ticket(),
        )
    )
    taken = [row[0] for row in tickets_result.all()]
    capacity = trip.vehicle.capacity if trip.vehicle else 0
    return SeatMapResponse(capacity=capacity, taken=taken)


@router.post(
    "/trips/{trip_id}/book",
    response_model=BookResponse,
    status_code=status.HTTP_201_CREATED,
)
@limiter.limit("10/minute")
async def book_ticket(
    request: Request,
    trip_id: int,
    body: BookRequest,
    db: AsyncSession = Depends(get_db_public),
):
    """Passenger books a seat and gets a Paystack payment URL."""
    trip_result = await db.execute(select(Trip).where(Trip.id == trip_id))
    trip = trip_result.scalar_one_or_none()
    if trip is None:
        raise HTTPException(status_code=404, detail="Trip not found")
    if not trip.booking_open:
        raise HTTPException(status_code=400, detail="Online booking is not open for this trip")
    if trip.status not in (TripStatus.scheduled, TripStatus.loading):
        raise HTTPException(
            status_code=400,
            detail=f"Trip is not accepting bookings (status: {trip.status.value})",
        )
    if trip.price_ticket_base is None:
        raise HTTPException(status_code=400, detail="Trip has no base fare set")

    # Cancel expired holds for this seat (lazy expiry)
    await db.execute(
        update(Ticket)
        .where(
            Ticket.trip_id == trip_id,
            Ticket.seat_number == body.seat_number,
            Ticket.source == TicketSource.online,
            Ticket.payment_status == PaymentStatus.pending,
            Ticket.booking_expires_at < datetime.now(UTC),
        )
        .values(status=TicketStatus.cancelled)
    )

    # SELECT FOR UPDATE: prevent race conditions on seat
    existing_result = await db.execute(
        select(Ticket)
        .where(
            Ticket.trip_id == trip_id,
            Ticket.seat_number == body.seat_number,
            Ticket.status != TicketStatus.cancelled,
        )
        .with_for_update()
    )
    if existing_result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": "SEAT_TAKEN", "seat_number": body.seat_number},
        )

    expires_at = datetime.now(UTC) + timedelta(minutes=BOOKING_HOLD_MINUTES)
    ticket = Ticket(
        company_id=trip.company_id,
        trip_id=trip_id,
        passenger_name=body.passenger_name,
        passenger_phone=body.passenger_phone,
        passenger_email=body.passenger_email,
        seat_number=body.seat_number,
        fare_ghs=trip.price_ticket_base,
        source=TicketSource.online,
        payment_status=PaymentStatus.pending,
        booking_expires_at=expires_at,
    )
    db.add(ticket)
    await db.flush()  # get ticket.id before commit

    email = body.passenger_email or f"{ticket.passenger_phone}@routepass.app"
    reference = f"RP-{ticket.id}-{uuid4().hex[:8]}"
    amount_pesewas = int(float(trip.price_ticket_base) * 100)

    data = await initialize_transaction(
        amount_kobo=amount_pesewas,
        email=email,
        reference=reference,
    )

    ticket.payment_ref = reference
    await db.commit()

    return BookResponse(
        ticket_id=ticket.id,
        authorization_url=data["authorization_url"],
        reference=reference,
    )


@router.get("/tickets/{ticket_id}", response_model=PublicTicketResponse)
async def get_public_ticket(
    ticket_id: int,
    db: AsyncSession = Depends(get_db_public),
):
    """Passenger polls this after returning from Paystack payment flow."""
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

    company_result = await db.execute(select(Company).where(Company.id == ticket.company_id))
    company = company_result.scalar_one_or_none()

    return PublicTicketResponse(
        id=ticket.id,
        passenger_name=ticket.passenger_name,
        seat_number=ticket.seat_number,
        fare_ghs=float(ticket.fare_ghs),
        status=ticket.status,
        payment_status=ticket.payment_status,
        departure_station=ticket.trip.departure_station.name if ticket.trip else None,
        destination_station=ticket.trip.destination_station.name if ticket.trip else None,
        departure_time=ticket.trip.departure_time.isoformat() if ticket.trip else None,
        vehicle_plate=(
            ticket.trip.vehicle.plate_number if ticket.trip and ticket.trip.vehicle else None
        ),
        company_name=company.name if company else None,
        brand_color=company.brand_color if company else None,
    )
