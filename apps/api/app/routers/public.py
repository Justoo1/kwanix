"""Public (unauthenticated) endpoints for passenger-facing mobile app."""

from datetime import UTC, datetime, timedelta
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.responses import Response
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.config import settings
from app.dependencies.auth import get_db_public
from app.integrations.paystack import initialize_transaction, verify_transaction
from app.middleware.rate_limit import limiter
from app.models.company import Company
from app.models.station import Station
from app.models.ticket import PaymentStatus, Ticket, TicketSource, TicketStatus
from app.models.trip import Trip, TripStatus
from app.services.qr_service import generate_qr_png_bytes
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
    company_code: str
    brand_color: str | None
    booking_open: bool
    status: str


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


class PublicRouteResult(BaseModel):
    company_name: str
    company_code: str
    brand_color: str | None
    trip_id: int
    departure_time: str
    departure_station_name: str
    departure_station_city: str | None
    destination_station_name: str
    destination_station_city: str | None
    price_ticket_base: float | None
    seats_available: int
    booking_open: bool
    status: str


class PublicCompanyResult(BaseModel):
    id: int
    name: str
    company_code: str
    brand_color: str | None
    logo_url: str | None


# ── Endpoints ─────────────────────────────────────────────────────────────────


@router.get("/routes", response_model=list[PublicRouteResult])
@limiter.limit("60/minute")
async def search_public_routes(
    request: Request,
    from_city: str | None = None,
    to_city: str | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db_public),
):
    """
    Cross-tenant route search for passengers. Returns scheduled and loading
    trips, optionally filtered by departure/destination city and date range.
    Does not require booking_open — shows all upcoming trips.
    No authentication required.
    """
    from datetime import date as date_type

    q = (
        select(Trip)
        .where(
            Trip.status.in_([TripStatus.scheduled, TripStatus.loading]),
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

    if date_from or date_to:
        try:
            if date_from:
                q = q.where(func.date(Trip.departure_time) >= date_type.fromisoformat(date_from))
            if date_to:
                q = q.where(func.date(Trip.departure_time) <= date_type.fromisoformat(date_to))
        except ValueError as err:
            raise HTTPException(
                status_code=400, detail="Invalid date format, use YYYY-MM-DD"
            ) from err

    if from_city:
        from sqlalchemy import or_
        term = f"%{from_city.strip()}%"
        dep_sub = select(Station.id).where(
            or_(Station.city.ilike(term), Station.name.ilike(term))
        )
        q = q.where(Trip.departure_station_id.in_(dep_sub))
    if to_city:
        from sqlalchemy import or_
        term = f"%{to_city.strip()}%"
        dest_sub = select(Station.id).where(
            or_(Station.city.ilike(term), Station.name.ilike(term))
        )
        q = q.where(Trip.destination_station_id.in_(dest_sub))

    result = await db.execute(q.limit(limit).offset(offset))
    trips = result.scalars().all()

    output: list[PublicRouteResult] = []
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
        dep_station = trip.departure_station
        dst_station = trip.destination_station

        output.append(
            PublicRouteResult(
                company_name=trip.company.name,
                company_code=trip.company.company_code,
                brand_color=trip.company.brand_color,
                trip_id=trip.id,
                departure_time=trip.departure_time.isoformat(),
                departure_station_name=dep_station.name if dep_station else "",
                departure_station_city=getattr(dep_station, "city", None),
                destination_station_name=dst_station.name if dst_station else "",
                destination_station_city=getattr(dst_station, "city", None),
                price_ticket_base=float(trip.price_ticket_base) if trip.price_ticket_base else None,
                seats_available=max(0, capacity - active_seats),
                booking_open=trip.booking_open,
                status=trip.status.value,
            )
        )
    return output


@router.get("/companies", response_model=list[PublicCompanyResult])
@limiter.limit("60/minute")
async def list_public_companies(
    request: Request,
    db: AsyncSession = Depends(get_db_public),
):
    """All active companies on the platform."""
    result = await db.execute(
        select(Company).where(Company.is_active.is_(True)).order_by(Company.name.asc())
    )
    companies = result.scalars().all()
    return [
        PublicCompanyResult(
            id=c.id,
            name=c.name,
            company_code=c.company_code,
            brand_color=c.brand_color,
            logo_url=c.logo_url,
        )
        for c in companies
    ]


@router.get("/trips", response_model=list[PublicTripResponse])
@limiter.limit("100/minute")
async def list_public_trips(
    request: Request,
    from_station_id: int | None = None,
    to_station_id: int | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
    company_code: str | None = None,
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db_public),
):
    """Return all non-cancelled trips (bookable and historical) for public display."""
    q = (
        select(Trip)
        .where(
            Trip.status.in_(
                [
                    TripStatus.scheduled,
                    TripStatus.loading,
                    TripStatus.departed,
                    TripStatus.arrived,
                ]
            ),
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
    if date_from is not None or date_to is not None:
        try:
            from datetime import date as date_type

            if date_from:
                day_from = date_type.fromisoformat(date_from)
                q = q.where(func.date(Trip.departure_time) >= day_from)
            if date_to:
                day_to = date_type.fromisoformat(date_to)
                q = q.where(func.date(Trip.departure_time) <= day_to)
        except ValueError as err:
            raise HTTPException(
                status_code=400, detail="Invalid date format, use YYYY-MM-DD"
            ) from err
    else:
        # Default: show today's trips and all future trips
        from datetime import date as date_type

        q = q.where(func.date(Trip.departure_time) >= date_type.today())
    if company_code is not None:
        company_sub = (
            select(Company.id)
            .where(Company.company_code == company_code, Company.is_active.is_(True))
            .scalar_subquery()
        )
        q = q.where(Trip.company_id == company_sub)

    result = await db.execute(q.limit(limit).offset(offset))
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
                company_code=trip.company.company_code,
                brand_color=trip.company.brand_color,
                booking_open=trip.booking_open,
                status=trip.status.value,
            )
        )
    return output


@router.get("/trips/{trip_id}", response_model=PublicTripResponse)
@limiter.limit("100/minute")
async def get_public_trip(
    request: Request,
    trip_id: int,
    db: AsyncSession = Depends(get_db_public),
):
    """Return a single trip by ID. Returns 200 even if booking_open=False."""
    result = await db.execute(
        select(Trip)
        .where(Trip.id == trip_id)
        .options(
            selectinload(Trip.vehicle),
            selectinload(Trip.departure_station),
            selectinload(Trip.destination_station),
            selectinload(Trip.company),
            selectinload(Trip.tickets),
        )
    )
    trip = result.scalar_one_or_none()
    if trip is None:
        raise HTTPException(status_code=404, detail="Trip not found")

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
    return PublicTripResponse(
        id=trip.id,
        departure_station_name=trip.departure_station.name,
        destination_station_name=trip.destination_station.name,
        departure_time=trip.departure_time.isoformat(),
        vehicle_capacity=capacity,
        available_seat_count=max(0, capacity - active_seats),
        price_ghs=float(trip.price_ticket_base) if trip.price_ticket_base else None,
        company_name=trip.company.name,
        company_code=trip.company.company_code,
        brand_color=trip.company.brand_color,
        booking_open=trip.booking_open,
        status=trip.status.value,
    )


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

    # Lazily cancel expired holds for the whole trip before computing taken seats
    await db.execute(
        update(Ticket)
        .where(
            Ticket.trip_id == trip_id,
            Ticket.payment_status == PaymentStatus.pending,
            Ticket.booking_expires_at < func.now(),
        )
        .values(status=TicketStatus.cancelled)
    )

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

    email = body.passenger_email or f"{ticket.passenger_phone}@kwanix.app"
    reference = f"KX-{ticket.id}-{uuid4().hex[:8]}"
    amount_pesewas = int(float(trip.price_ticket_base) * 100)
    callback_url = f"{settings.public_app_url}/payment/success?reference={reference}"
    cancel_action = f"{settings.public_app_url}/payment/cancelled"

    data = await initialize_transaction(
        amount_kobo=amount_pesewas,
        email=email,
        reference=reference,
        callback_url=callback_url,
        cancel_action=cancel_action,
    )

    ticket.payment_ref = reference
    await db.commit()

    return BookResponse(
        ticket_id=ticket.id,
        authorization_url=data["authorization_url"],
        reference=reference,
    )


@router.get("/tickets/{ticket_id}", response_model=PublicTicketResponse)
@limiter.limit("30/minute")
async def get_public_ticket(
    request: Request,
    ticket_id: int,
    payment_ref: str = Query(..., description="Payment reference from booking"),
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
    if ticket is None or ticket.payment_ref != payment_ref:
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


@router.post("/payments/{reference}/verify", response_model=PublicTicketResponse)
@limiter.limit("20/minute")
async def verify_payment(
    request: Request,
    reference: str,
    db: AsyncSession = Depends(get_db_public),
):
    """
    Called by the payment success page when the passenger returns from Paystack.
    Verifies the transaction directly with Paystack and marks the ticket paid
    if confirmed — without waiting for the async webhook to arrive.
    Safe to call multiple times (idempotent).
    """
    result = await db.execute(select(Ticket).where(Ticket.payment_ref == reference))
    ticket = result.scalar_one_or_none()
    if ticket is None:
        raise HTTPException(status_code=404, detail="Ticket not found")

    if ticket.payment_status != PaymentStatus.paid:
        data = await verify_transaction(reference)
        if data.get("status") == "success":
            ticket.payment_status = PaymentStatus.paid
            ticket.booking_expires_at = None
            await db.commit()
            await db.refresh(ticket)

    # Re-query with relationships for the response
    result2 = await db.execute(
        select(Ticket)
        .where(Ticket.id == ticket.id)
        .options(
            selectinload(Ticket.trip).selectinload(Trip.departure_station),
            selectinload(Ticket.trip).selectinload(Trip.destination_station),
            selectinload(Ticket.trip).selectinload(Trip.vehicle),
        )
    )
    ticket = result2.scalar_one()
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


@router.get("/tickets/{ticket_id}/qr")
@limiter.limit("20/minute")
async def get_public_ticket_qr(
    request: Request,
    ticket_id: int,
    db: AsyncSession = Depends(get_db_public),
):
    """Return a PNG QR code for a paid ticket (no auth required)."""
    result = await db.execute(select(Ticket).where(Ticket.id == ticket_id))
    ticket = result.scalar_one_or_none()
    if ticket is None or ticket.payment_status != PaymentStatus.paid:
        raise HTTPException(status_code=404, detail="Ticket not found or not yet paid")

    payload = f"TICKET:{ticket.id}:{ticket.trip_id}:{ticket.seat_number}"
    png_bytes = generate_qr_png_bytes(payload)
    return Response(content=png_bytes, media_type="image/png")
