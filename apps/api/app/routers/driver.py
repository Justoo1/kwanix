from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.dependencies.auth import get_db_for_user, require_role
from app.models.ticket import Ticket, TicketStatus
from app.models.trip import Trip, TripStatus
from app.models.user import User, UserRole
from app.models.vehicle import Vehicle

router = APIRouter()

_ACTIVE_STATUSES = (TripStatus.scheduled, TripStatus.loading, TripStatus.departed)
_SCAN_STATUSES = (TripStatus.loading, TripStatus.departed)


# ── Schemas ────────────────────────────────────────────────────────────────────


class DriverTripResponse(BaseModel):
    id: int
    departure_station_name: str
    destination_station_name: str
    departure_time: datetime
    status: str
    vehicle_plate: str
    passenger_count: int


class DriverPassengerResponse(BaseModel):
    ticket_id: int
    seat_number: int
    passenger_name: str
    passenger_phone: str
    status: str
    payment_status: str


class ScanTicketRequest(BaseModel):
    payload: str  # format: TICKET:{ticket_id}:{trip_id}:{seat_number}


class LocationUpdateRequest(BaseModel):
    latitude: float = Field(..., ge=-90, le=90)
    longitude: float = Field(..., ge=-180, le=180)


class LocationUpdateResponse(BaseModel):
    accepted: bool


class ScanTicketResponse(BaseModel):
    valid: bool
    marked_used: bool = False
    passenger_name: str | None = None
    seat_number: int | None = None
    status: str | None = None
    trip_info: str | None = None
    reason: str | None = None


# ── Helpers ────────────────────────────────────────────────────────────────────


async def _get_driver_active_trip(
    current_user: User, db: AsyncSession, statuses: tuple = _ACTIVE_STATUSES
) -> Trip | None:
    result = await db.execute(
        select(Trip)
        .where(
            Trip.driver_id == current_user.id,
            Trip.status.in_(statuses),
        )
        .options(
            selectinload(Trip.vehicle),
            selectinload(Trip.departure_station),
            selectinload(Trip.destination_station),
            selectinload(Trip.tickets),
        )
        .order_by(Trip.departure_time.asc())
        .limit(1)
    )
    return result.scalar_one_or_none()


# ── Endpoints ──────────────────────────────────────────────────────────────────


@router.get("/trip", response_model=DriverTripResponse)
async def get_my_trip(
    db: AsyncSession = Depends(get_db_for_user),
    current_user: User = Depends(require_role(UserRole.driver)),
):
    """Return the driver's current or upcoming assigned trip."""
    trip = await _get_driver_active_trip(current_user, db)
    if trip is None:
        raise HTTPException(status_code=404, detail="No active trip assigned to this driver.")

    non_cancelled = sum(
        1 for t in trip.tickets if t.status != TicketStatus.cancelled
    )
    return DriverTripResponse(
        id=trip.id,
        departure_station_name=trip.departure_station.name if trip.departure_station else "",
        destination_station_name=trip.destination_station.name if trip.destination_station else "",
        departure_time=trip.departure_time,
        status=trip.status.value,
        vehicle_plate=trip.vehicle.plate_number if trip.vehicle else "",
        passenger_count=non_cancelled,
    )


@router.get("/trip/passengers", response_model=list[DriverPassengerResponse])
async def get_my_passengers(
    db: AsyncSession = Depends(get_db_for_user),
    current_user: User = Depends(require_role(UserRole.driver)),
):
    """Return the full passenger manifest for the driver's active trip."""
    trip = await _get_driver_active_trip(current_user, db)
    if trip is None:
        raise HTTPException(status_code=404, detail="No active trip assigned to this driver.")

    tickets_result = await db.execute(
        select(Ticket)
        .where(
            Ticket.trip_id == trip.id,
            Ticket.status != TicketStatus.cancelled,
        )
        .order_by(Ticket.seat_number)
    )
    tickets = tickets_result.scalars().all()

    return [
        DriverPassengerResponse(
            ticket_id=t.id,
            seat_number=t.seat_number,
            passenger_name=t.passenger_name,
            passenger_phone=t.passenger_phone,
            status=t.status.value,
            payment_status=t.payment_status.value,
        )
        for t in tickets
    ]


@router.post("/scan", response_model=ScanTicketResponse)
async def scan_ticket(
    body: ScanTicketRequest,
    db: AsyncSession = Depends(get_db_for_user),
    current_user: User = Depends(require_role(UserRole.driver)),
):
    """Scan a ticket QR code. Validates it belongs to the driver's trip and marks it used."""
    parts = body.payload.strip().split(":")
    if len(parts) != 4 or parts[0] != "TICKET":
        return ScanTicketResponse(valid=False, reason="Invalid QR payload format")

    try:
        ticket_id = int(parts[1])
        trip_id = int(parts[2])
        seat_number = int(parts[3])
    except (ValueError, IndexError):
        return ScanTicketResponse(valid=False, reason="Invalid QR payload format")

    # Driver must have a currently active (loading or departed) trip
    trip = await _get_driver_active_trip(current_user, db, statuses=_SCAN_STATUSES)
    if trip is None:
        raise HTTPException(
            status_code=403,
            detail="No active boarding trip. Trip must be in 'loading' or 'departed' status.",
        )

    # Ticket must belong to this driver's trip
    if trip_id != trip.id:
        return ScanTicketResponse(valid=False, reason="Ticket is not for your trip")

    ticket_result = await db.execute(
        select(Ticket)
        .where(Ticket.id == ticket_id)
        .options(
            selectinload(Ticket.trip).selectinload(Trip.departure_station),
            selectinload(Ticket.trip).selectinload(Trip.destination_station),
        )
    )
    ticket = ticket_result.scalar_one_or_none()

    if ticket is None:
        return ScanTicketResponse(valid=False, reason="Ticket not found")

    if ticket.trip_id != trip_id:
        return ScanTicketResponse(valid=False, reason="Ticket is not for your trip")

    if ticket.seat_number != seat_number:
        return ScanTicketResponse(valid=False, reason="Seat number mismatch")

    if ticket.status == TicketStatus.cancelled:
        return ScanTicketResponse(
            valid=False,
            passenger_name=ticket.passenger_name,
            seat_number=ticket.seat_number,
            status=ticket.status.value,
            reason="Ticket is cancelled",
        )

    if ticket.status == TicketStatus.used:
        return ScanTicketResponse(
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

    ticket.status = TicketStatus.used
    await db.commit()

    return ScanTicketResponse(
        valid=True,
        marked_used=True,
        passenger_name=ticket.passenger_name,
        seat_number=ticket.seat_number,
        status=TicketStatus.used.value,
        trip_info=trip_info,
    )


@router.post("/location", response_model=LocationUpdateResponse)
async def update_location(
    body: LocationUpdateRequest,
    db: AsyncSession = Depends(get_db_for_user),
    current_user: User = Depends(require_role(UserRole.driver)),
):
    """Push the driver's current GPS coordinates to their active trip's vehicle."""
    trip = await _get_driver_active_trip(current_user, db, statuses=_SCAN_STATUSES)
    if trip is None or trip.vehicle_id is None:
        # No active trip — accept silently (driver may be between trips)
        return LocationUpdateResponse(accepted=False)

    vehicle_result = await db.execute(select(Vehicle).where(Vehicle.id == trip.vehicle_id))
    vehicle = vehicle_result.scalar_one_or_none()
    if vehicle is None:
        return LocationUpdateResponse(accepted=False)

    vehicle.current_latitude = body.latitude
    vehicle.current_longitude = body.longitude
    vehicle.last_gps_update = datetime.now(UTC)
    await db.commit()
    return LocationUpdateResponse(accepted=True)
