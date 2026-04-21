from datetime import UTC, date, datetime, timedelta
from typing import Any

import structlog
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from fastapi.responses import Response
from pydantic import BaseModel, Field, model_validator
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.dependencies.auth import get_current_user, get_db_for_user, require_role
from app.integrations.arkesel import msg_trip_arrived, msg_trip_departed, msg_trip_loading, send_sms
from app.integrations.email import send_manifest_email
from app.models.company import Company
from app.models.parcel import Parcel, ParcelStatus
from app.models.trip import Trip, TripStatus, TripStop
from app.models.user import User, UserRole
from app.models.vehicle import Vehicle
from app.utils.pdf import generate_manifest_pdf

router = APIRouter()
logger = structlog.get_logger()

# Allowed next states for each current state
VALID_TRANSITIONS: dict[TripStatus, set[TripStatus]] = {
    TripStatus.scheduled: {TripStatus.loading, TripStatus.cancelled},
    TripStatus.loading: {TripStatus.departed, TripStatus.cancelled},
    TripStatus.departed: {TripStatus.arrived, TripStatus.cancelled},
    TripStatus.arrived: {TripStatus.cancelled},
    TripStatus.cancelled: set(),
}

_MANAGER_ROLES = (UserRole.station_manager, UserRole.company_admin, UserRole.super_admin)

_TRIP_OPTS = [
    selectinload(Trip.vehicle).selectinload(Vehicle.default_driver),
    selectinload(Trip.departure_station),
    selectinload(Trip.destination_station),
    selectinload(Trip.parcels),
    selectinload(Trip.tickets),
    selectinload(Trip.driver),
]


# ── Schemas ────────────────────────────────────────────────────────────────────


class StopInput(BaseModel):
    station_id: int
    eta: datetime | None = None


class CreateTripRequest(BaseModel):
    vehicle_id: int
    departure_station_id: int
    destination_station_id: int
    departure_time: datetime
    base_fare_ghs: float | None = None
    booking_open: bool = False
    stops: list[StopInput] = []


class TripResponse(BaseModel):
    id: int
    vehicle_id: int
    departure_station_id: int
    destination_station_id: int
    departure_time: datetime
    status: str
    booking_open: bool = False
    price_ticket_base: float | None = None
    vehicle_plate: str | None = None
    vehicle_capacity: int | None = None
    vehicle_model: str | None = None
    vehicle_default_driver_id: int | None = None
    vehicle_default_driver_name: str | None = None
    departure_station_name: str | None = None
    destination_station_name: str | None = None
    parcel_count: int = 0
    tickets_sold: int = 0
    occupancy_pct: float = 0.0
    is_near_full: bool = False
    driver_id: int | None = None
    driver_name: str | None = None

    model_config = {"from_attributes": True}

    @model_validator(mode="before")
    @classmethod
    def _enrich(cls, data: Any) -> Any:
        """Extract relationship fields from ORM object when present."""
        if isinstance(data, dict):
            return data
        result: dict[str, Any] = {
            "id": data.id,
            "vehicle_id": data.vehicle_id,
            "departure_station_id": data.departure_station_id,
            "destination_station_id": data.destination_station_id,
            "departure_time": data.departure_time,
            "status": data.status,
            "booking_open": getattr(data, "booking_open", False),
            "price_ticket_base": getattr(data, "price_ticket_base", None),
            "occupancy_pct": 0.0,
            "is_near_full": False,
            "driver_id": getattr(data, "driver_id", None),
        }
        try:
            result["vehicle_plate"] = data.vehicle.plate_number
            result["vehicle_capacity"] = data.vehicle.capacity
            result["vehicle_model"] = data.vehicle.model
            result["vehicle_default_driver_id"] = data.vehicle.default_driver_id
            result["vehicle_default_driver_name"] = (
                data.vehicle.default_driver.full_name
                if data.vehicle.default_driver
                else None
            )
        except Exception as exc:
            logger.debug("vehicle not loaded on trip", trip_id=data.id, error=str(exc))
        try:
            result["departure_station_name"] = data.departure_station.name
        except Exception as exc:
            logger.debug("departure_station not loaded on trip", trip_id=data.id, error=str(exc))
        try:
            result["destination_station_name"] = data.destination_station.name
        except Exception as exc:
            logger.debug("destination_station not loaded on trip", trip_id=data.id, error=str(exc))
        try:
            result["parcel_count"] = len(data.parcels)
        except Exception as exc:
            logger.debug("parcels not loaded on trip", trip_id=data.id, error=str(exc))
        try:
            from app.models.ticket import TicketStatus

            tickets_sold = sum(1 for t in data.tickets if t.status != TicketStatus.cancelled)
            result["tickets_sold"] = tickets_sold
            cap = result.get("vehicle_capacity")
            if cap and cap > 0:
                occ = (tickets_sold / cap) * 100
                result["occupancy_pct"] = round(occ, 1)
                result["is_near_full"] = occ >= 80.0
        except Exception as exc:
            logger.debug("tickets not loaded on trip", trip_id=data.id, error=str(exc))
        try:
            result["driver_name"] = data.driver.full_name if data.driver else None
        except Exception as exc:
            logger.debug("driver not loaded on trip", trip_id=data.id, error=str(exc))
        return result


class UpdateTripStatusRequest(BaseModel):
    status: TripStatus


class ToggleBookingRequest(BaseModel):
    booking_open: bool


class TripStopRequest(BaseModel):
    station_id: int
    sequence_order: int
    eta: datetime | None = None


class TripStopResponse(BaseModel):
    id: int
    trip_id: int
    station_id: int
    sequence_order: int
    eta: datetime | None
    station_name: str | None = None

    model_config = {"from_attributes": True}


# ── Helpers ────────────────────────────────────────────────────────────────────


async def _get_trip_or_404(trip_id: int, db: AsyncSession) -> Trip:
    result = await db.execute(select(Trip).where(Trip.id == trip_id).options(*_TRIP_OPTS))
    trip = result.scalar_one_or_none()
    if trip is None:
        raise HTTPException(status_code=404, detail="Trip not found")
    return trip


# ── Endpoints ──────────────────────────────────────────────────────────────────


@router.post(
    "",
    response_model=TripResponse,
    status_code=201,
    dependencies=[Depends(require_role(*_MANAGER_ROLES))],
)
async def create_trip(
    body: CreateTripRequest,
    db: AsyncSession = Depends(get_db_for_user),
    current_user: User = Depends(get_current_user),
):
    vehicle_result = await db.execute(select(Vehicle).where(Vehicle.id == body.vehicle_id))
    vehicle = vehicle_result.scalar_one_or_none()
    if vehicle is None:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    if not vehicle.is_available:
        raise HTTPException(
            status_code=400,
            detail={
                "code": "VEHICLE_UNAVAILABLE",
                "message": "Vehicle is marked as unavailable for service.",
            },
        )

    trip = Trip(
        company_id=current_user.company_id,
        vehicle_id=body.vehicle_id,
        departure_station_id=body.departure_station_id,
        destination_station_id=body.destination_station_id,
        departure_time=body.departure_time,
        price_ticket_base=body.base_fare_ghs,
        booking_open=body.booking_open,
        driver_id=vehicle.default_driver_id,
    )
    db.add(trip)
    await db.flush()

    for i, stop_input in enumerate(body.stops, start=1):
        db.add(TripStop(
            trip_id=trip.id,
            station_id=stop_input.station_id,
            sequence_order=i,
            eta=stop_input.eta,
        ))

    await db.commit()

    result = await db.execute(select(Trip).where(Trip.id == trip.id).options(*_TRIP_OPTS))
    return result.scalar_one()


class GenerateScheduleRequest(BaseModel):
    vehicle_id: int
    departure_station_id: int
    destination_station_id: int
    departure_time: str  # HH:MM
    days_ahead: int = Field(..., ge=1, le=30)
    base_fare_ghs: float | None = None
    stops: list[StopInput] = []


class GenerateScheduleResponse(BaseModel):
    trip_ids: list[int]
    created: int


@router.post(
    "/generate-schedule",
    response_model=GenerateScheduleResponse,
    status_code=201,
    dependencies=[Depends(require_role(*_MANAGER_ROLES))],
)
async def generate_schedule(
    body: GenerateScheduleRequest,
    db: AsyncSession = Depends(get_db_for_user),
    current_user: User = Depends(get_current_user),
):
    """Create one trip per day for the next N days at the given departure time."""
    try:
        hour, minute = (int(x) for x in body.departure_time.split(":"))
        if not (0 <= hour <= 23 and 0 <= minute <= 59):
            raise ValueError
    except (ValueError, AttributeError) as exc:
        raise HTTPException(
            status_code=400, detail="departure_time must be a valid HH:MM string"
        ) from exc

    vehicle_result = await db.execute(select(Vehicle).where(Vehicle.id == body.vehicle_id))
    vehicle = vehicle_result.scalar_one_or_none()
    if vehicle is None:
        raise HTTPException(status_code=404, detail="Vehicle not found")

    today = datetime.now(UTC).date()
    trip_ids: list[int] = []

    for i in range(body.days_ahead):
        day: date = today + timedelta(days=i + 1)
        dt = datetime(day.year, day.month, day.day, hour, minute, tzinfo=UTC)
        trip = Trip(
            company_id=current_user.company_id,
            vehicle_id=body.vehicle_id,
            departure_station_id=body.departure_station_id,
            destination_station_id=body.destination_station_id,
            departure_time=dt,
            price_ticket_base=body.base_fare_ghs,
            driver_id=vehicle.default_driver_id,
        )
        db.add(trip)
        await db.flush()
        for seq, stop_input in enumerate(body.stops, start=1):
            db.add(TripStop(
                trip_id=trip.id,
                station_id=stop_input.station_id,
                sequence_order=seq,
                eta=stop_input.eta,
            ))
        trip_ids.append(trip.id)

    await db.commit()
    return GenerateScheduleResponse(trip_ids=trip_ids, created=len(trip_ids))


@router.get("", response_model=list[TripResponse])
async def list_trips(
    status: TripStatus | None = Query(None),
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db_for_user),
    current_user: User = Depends(get_current_user),
):
    q = select(Trip).options(*_TRIP_OPTS).order_by(Trip.departure_time.desc())
    if status is not None:
        q = q.where(Trip.status == status)
    result = await db.execute(q.limit(limit).offset(offset))
    return result.scalars().all()


@router.get(
    "/{trip_id}/manifest",
    dependencies=[Depends(require_role(*_MANAGER_ROLES))],
)
async def get_trip_manifest(
    trip_id: int,
    db: AsyncSession = Depends(get_db_for_user),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Trip)
        .where(Trip.id == trip_id)
        .options(
            selectinload(Trip.vehicle),
            selectinload(Trip.departure_station),
            selectinload(Trip.destination_station),
            selectinload(Trip.tickets),
        )
    )
    trip = result.scalar_one_or_none()
    if trip is None:
        raise HTTPException(status_code=404, detail="Trip not found")

    company_result = await db.execute(select(Company).where(Company.id == trip.company_id))
    company = company_result.scalar_one_or_none()
    pdf_bytes = generate_manifest_pdf(
        trip,
        company_name=company.name if company else None,
        brand_color=company.brand_color if company else None,
    )
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="manifest-trip-{trip_id}.pdf"'},
    )


@router.get(
    "/{trip_id}/manifest.csv",
    dependencies=[Depends(require_role(*_MANAGER_ROLES))],
)
async def get_trip_manifest_csv(
    trip_id: int,
    db: AsyncSession = Depends(get_db_for_user),
    current_user: User = Depends(get_current_user),
):
    """Stream a CSV passenger manifest for the trip."""
    import csv
    import io

    from app.models.ticket import Ticket, TicketStatus

    trip_result = await db.execute(select(Trip).where(Trip.id == trip_id))
    if trip_result.scalar_one_or_none() is None:
        raise HTTPException(status_code=404, detail="Trip not found")

    tickets_result = await db.execute(
        select(Ticket)
        .where(
            Ticket.trip_id == trip_id,
            Ticket.status != TicketStatus.cancelled,
        )
        .order_by(Ticket.seat_number)
    )
    tickets = tickets_result.scalars().all()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(
        ["seat_number", "passenger_name", "passenger_phone", "payment_status", "source"]
    )
    for t in tickets:
        writer.writerow(
            [
                t.seat_number,
                t.passenger_name,
                t.passenger_phone,
                t.payment_status.value,
                t.source.value,
            ]
        )

    csv_bytes = output.getvalue().encode("utf-8")
    return Response(
        content=csv_bytes,
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="manifest-trip-{trip_id}.csv"'},
    )


@router.get("/{trip_id}", response_model=TripResponse)
async def get_trip(
    trip_id: int,
    db: AsyncSession = Depends(get_db_for_user),
    current_user: User = Depends(get_current_user),
):
    return await _get_trip_or_404(trip_id, db)


async def _sms_passengers(trip: Trip, message: str) -> None:
    """Fire-and-forget SMS to all non-cancelled passengers on a trip."""
    import contextlib

    from app.models.ticket import TicketStatus as TS  # local to avoid circular imports

    for ticket in getattr(trip, "tickets", []):
        if ticket.status != TS.cancelled:
            with contextlib.suppress(Exception):
                await send_sms(ticket.passenger_phone, message, event_type="trip_status")


@router.patch(
    "/{trip_id}/status",
    response_model=TripResponse,
    dependencies=[Depends(require_role(*_MANAGER_ROLES))],
)
async def update_trip_status(
    trip_id: int,
    body: UpdateTripStatusRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db_for_user),
    current_user: User = Depends(get_current_user),
):
    trip = await _get_trip_or_404(trip_id, db)

    if body.status not in VALID_TRANSITIONS[trip.status]:
        allowed = [s.value for s in VALID_TRANSITIONS[trip.status]]
        raise HTTPException(
            status_code=400,
            detail=(
                f"Cannot transition from '{trip.status}' to '{body.status}'. Allowed: {allowed}"
            ),
        )

    if body.status == TripStatus.departed:
        result = await db.execute(
            select(Parcel).where(
                Parcel.current_trip_id == trip.id,
                Parcel.status == ParcelStatus.pending,
            )
        )
        pending_parcels = result.scalars().all()
        if pending_parcels:
            raise HTTPException(
                status_code=400,
                detail={"code": "PARCELS_NOT_LOADED", "count": len(pending_parcels)},
            )

    trip.status = body.status
    await db.commit()

    result = await db.execute(select(Trip).where(Trip.id == trip_id).options(*_TRIP_OPTS))
    updated_trip = result.scalar_one()

    if body.status == TripStatus.loading:
        plate = updated_trip.vehicle.plate_number if updated_trip.vehicle else "the bus"
        from_name = (
            updated_trip.departure_station.name if updated_trip.departure_station else "origin"
        )
        dep_time = updated_trip.departure_time.strftime("%I:%M %p") if updated_trip.departure_time else ""
        sms_msg = msg_trip_loading(plate, from_name, dep_time)
        background_tasks.add_task(_sms_passengers, updated_trip, sms_msg)

    elif body.status == TripStatus.departed:
        try:
            company_result = await db.execute(
                select(Company).where(Company.id == updated_trip.company_id)
            )
            company = company_result.scalar_one_or_none()
            pdf_bytes = generate_manifest_pdf(
                updated_trip,
                company_name=company.name if company else None,
                brand_color=company.brand_color if company else None,
            )
            await send_manifest_email(trip_id, pdf_bytes)
        except Exception as exc:  # noqa: BLE001
            logger.error("manifest email step failed", trip_id=trip_id, error=str(exc))

        # SMS passengers: bus has departed
        plate = updated_trip.vehicle.plate_number if updated_trip.vehicle else "the bus"
        from_name = (
            updated_trip.departure_station.name if updated_trip.departure_station else "origin"
        )
        sms_msg = msg_trip_departed(plate, from_name)
        background_tasks.add_task(_sms_passengers, updated_trip, sms_msg)

    elif body.status == TripStatus.arrived:
        # SMS passengers: bus has arrived
        dest_name = (
            updated_trip.destination_station.name
            if updated_trip.destination_station
            else "destination"
        )
        sms_msg = msg_trip_arrived(dest_name)
        background_tasks.add_task(_sms_passengers, updated_trip, sms_msg)

    return updated_trip


class TripRevenueResponse(BaseModel):
    total_revenue_ghs: float
    ticket_count: int
    avg_fare_ghs: float
    paid_count: int
    pending_count: int


@router.get(
    "/{trip_id}/revenue",
    response_model=TripRevenueResponse,
    dependencies=[Depends(require_role(*_MANAGER_ROLES))],
)
async def get_trip_revenue(
    trip_id: int,
    db: AsyncSession = Depends(get_db_for_user),
    current_user: User = Depends(get_current_user),
):
    """Return revenue summary for a trip (non-cancelled tickets only)."""
    from app.models.ticket import PaymentStatus, Ticket, TicketStatus

    trip_result = await db.execute(select(Trip).where(Trip.id == trip_id))
    if trip_result.scalar_one_or_none() is None:
        raise HTTPException(status_code=404, detail="Trip not found")

    tickets_result = await db.execute(
        select(Ticket).where(
            Ticket.trip_id == trip_id,
            Ticket.status != TicketStatus.cancelled,
        )
    )
    tickets = tickets_result.scalars().all()

    ticket_count = len(tickets)
    total_revenue = sum(float(t.fare_ghs) for t in tickets)
    avg_fare = total_revenue / ticket_count if ticket_count else 0.0
    paid_count = sum(1 for t in tickets if t.payment_status == PaymentStatus.paid)
    pending_count = sum(1 for t in tickets if t.payment_status == PaymentStatus.pending)

    return TripRevenueResponse(
        total_revenue_ghs=round(total_revenue, 2),
        ticket_count=ticket_count,
        avg_fare_ghs=round(avg_fare, 2),
        paid_count=paid_count,
        pending_count=pending_count,
    )


@router.patch(
    "/{trip_id}/booking",
    response_model=TripResponse,
    dependencies=[Depends(require_role(*_MANAGER_ROLES))],
)
async def toggle_booking(
    trip_id: int,
    body: ToggleBookingRequest,
    db: AsyncSession = Depends(get_db_for_user),
    current_user: User = Depends(get_current_user),
):
    trip = await _get_trip_or_404(trip_id, db)
    if body.booking_open and trip.status == TripStatus.cancelled:
        raise HTTPException(
            status_code=400,
            detail="Cannot open booking on a cancelled trip.",
        )
    trip.booking_open = body.booking_open
    await db.commit()
    result = await db.execute(select(Trip).where(Trip.id == trip_id).options(*_TRIP_OPTS))
    return result.scalar_one()


@router.get(
    "/{trip_id}/stops",
    response_model=list[TripStopResponse],
    dependencies=[Depends(require_role(*_MANAGER_ROLES))],
)
async def list_trip_stops(
    trip_id: int,
    db: AsyncSession = Depends(get_db_for_user),
    current_user: User = Depends(get_current_user),
):
    """Return ordered stops for a trip."""
    trip_result = await db.execute(select(Trip).where(Trip.id == trip_id))
    if trip_result.scalar_one_or_none() is None:
        raise HTTPException(status_code=404, detail="Trip not found")

    result = await db.execute(
        select(TripStop)
        .where(TripStop.trip_id == trip_id)
        .options(selectinload(TripStop.station))
        .order_by(TripStop.sequence_order)
    )
    stops = result.scalars().all()
    return [
        TripStopResponse(
            id=s.id,
            trip_id=s.trip_id,
            station_id=s.station_id,
            sequence_order=s.sequence_order,
            eta=s.eta,
            station_name=s.station.name if s.station else None,
        )
        for s in stops
    ]


@router.delete(
    "/{trip_id}/stops/{stop_id}",
    status_code=204,
    dependencies=[Depends(require_role(*_MANAGER_ROLES))],
)
async def delete_trip_stop(
    trip_id: int,
    stop_id: int,
    db: AsyncSession = Depends(get_db_for_user),
    current_user: User = Depends(get_current_user),
):
    """Remove an intermediate stop from a scheduled trip."""
    stop_result = await db.execute(
        select(TripStop).where(TripStop.id == stop_id, TripStop.trip_id == trip_id)
    )
    stop = stop_result.scalar_one_or_none()
    if stop is None:
        raise HTTPException(status_code=404, detail="Stop not found on this trip")

    trip_result = await db.execute(select(Trip).where(Trip.id == trip_id))
    trip = trip_result.scalar_one_or_none()
    if trip and trip.status != TripStatus.scheduled:
        raise HTTPException(status_code=400, detail="Stops can only be removed from scheduled trips.")

    await db.delete(stop)
    await db.commit()


class AssignDriverRequest(BaseModel):
    driver_id: int | None = None


@router.patch(
    "/{trip_id}/driver",
    response_model=TripResponse,
    dependencies=[Depends(require_role(*_MANAGER_ROLES))],
)
async def assign_driver(
    trip_id: int,
    body: AssignDriverRequest,
    db: AsyncSession = Depends(get_db_for_user),
    current_user: User = Depends(get_current_user),
):
    """Assign or unassign a driver to a trip."""
    trip = await _get_trip_or_404(trip_id, db)

    driver: User | None = None
    if body.driver_id is not None:
        driver_result = await db.execute(
            select(User).where(
                User.id == body.driver_id,
                User.role == UserRole.driver,
                User.is_active.is_(True),
                User.company_id == trip.company_id,
            )
        )
        driver = driver_result.scalar_one_or_none()
        if driver is None:
            raise HTTPException(
                status_code=404,
                detail="Driver not found or does not belong to this company.",
            )

    trip.driver_id = body.driver_id
    trip.driver = driver  # keep relationship in sync so identity map is current
    await db.commit()
    result = await db.execute(select(Trip).where(Trip.id == trip_id).options(*_TRIP_OPTS))
    return result.scalar_one()


@router.post(
    "/{trip_id}/stops",
    response_model=TripStopResponse,
    status_code=201,
    dependencies=[Depends(require_role(*_MANAGER_ROLES))],
)
async def add_trip_stop(
    trip_id: int,
    body: TripStopRequest,
    db: AsyncSession = Depends(get_db_for_user),
    current_user: User = Depends(get_current_user),
):
    """Add an intermediate stop to a trip."""
    trip_result = await db.execute(select(Trip).where(Trip.id == trip_id))
    if trip_result.scalar_one_or_none() is None:
        raise HTTPException(status_code=404, detail="Trip not found")

    stop = TripStop(
        trip_id=trip_id,
        station_id=body.station_id,
        sequence_order=body.sequence_order,
        eta=body.eta,
    )
    db.add(stop)
    await db.commit()
    await db.refresh(stop, ["station"])
    return TripStopResponse(
        id=stop.id,
        trip_id=stop.trip_id,
        station_id=stop.station_id,
        sequence_order=stop.sequence_order,
        eta=stop.eta,
        station_name=stop.station.name if stop.station else None,
    )


# ── Flash discount / price update ─────────────────────────────────────────────


class TripPriceUpdateRequest(BaseModel):
    price_ticket_base: float = Field(..., gt=0)


class TripPriceUpdateResponse(BaseModel):
    trip_id: int
    price_ticket_base: float


@router.patch("/{trip_id}/price", response_model=TripPriceUpdateResponse)
async def update_trip_price(
    trip_id: int,
    body: TripPriceUpdateRequest,
    db: AsyncSession = Depends(get_db_for_user),
    current_user: User = Depends(require_role(UserRole.company_admin, UserRole.super_admin)),
):
    """Update the base ticket price for a trip (for flash discounts)."""
    result = await db.execute(select(Trip).where(Trip.id == trip_id))
    trip = result.scalar_one_or_none()
    if trip is None:
        raise HTTPException(status_code=404, detail="Trip not found")

    trip.price_ticket_base = body.price_ticket_base
    await db.commit()
    return TripPriceUpdateResponse(trip_id=trip.id, price_ticket_base=float(trip.price_ticket_base))


# ── Apply demand-intel pricing suggestion ─────────────────────────────────────


class ApplyDiscountRequest(BaseModel):
    discount_pct: int = Field(..., ge=1, le=50)


class ApplyDiscountResponse(BaseModel):
    trip_id: int
    original_price_ghs: float | None
    discounted_price_ghs: float | None
    applied_discount_pct: int


@router.patch(
    "/{trip_id}/apply-discount",
    response_model=ApplyDiscountResponse,
    dependencies=[Depends(require_role(UserRole.company_admin, UserRole.super_admin))],
)
async def apply_discount(
    trip_id: int,
    body: ApplyDiscountRequest,
    db: AsyncSession = Depends(get_db_for_user),
):
    """
    Apply a percentage discount to the trip's ticket price.
    Records the discount percentage for audit purposes.
    """
    result = await db.execute(select(Trip).where(Trip.id == trip_id))
    trip = result.scalar_one_or_none()
    if trip is None:
        raise HTTPException(status_code=404, detail="Trip not found")
    if trip.status not in (TripStatus.scheduled, TripStatus.loading):
        raise HTTPException(
            status_code=400,
            detail="Discounts can only be applied to scheduled or loading trips.",
        )

    original = float(trip.price_ticket_base) if trip.price_ticket_base else None
    discounted: float | None = None
    if original is not None:
        discounted = round(original * (1 - body.discount_pct / 100), 2)
        trip.price_ticket_base = discounted

    trip.applied_discount_pct = body.discount_pct
    await db.commit()
    return ApplyDiscountResponse(
        trip_id=trip.id,
        original_price_ghs=original,
        discounted_price_ghs=discounted,
        applied_discount_pct=body.discount_pct,
    )
