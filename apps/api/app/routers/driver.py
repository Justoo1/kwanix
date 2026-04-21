import math
from datetime import UTC, datetime

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker
from sqlalchemy.orm import selectinload

from app.config import settings
from app.dependencies.auth import get_db_for_user, require_role
from app.integrations import arkesel
from app.models.ticket import Ticket, TicketStatus
from app.models.trip import Trip, TripStatus
from app.models.user import User, UserRole
from app.models.vehicle import Vehicle

router = APIRouter()

_ACTIVE_STATUSES = (TripStatus.scheduled, TripStatus.loading, TripStatus.departed)
_SCAN_STATUSES = (TripStatus.loading, TripStatus.departed)
_ETA_PROXIMITY_KM = 30.0       # trigger SMS when bus is within this distance
_GPS_AVG_SPEED_KMH = 80.0      # used for ETA estimation


# ── Schemas ────────────────────────────────────────────────────────────────────


class DriverTripResponse(BaseModel):
    id: int
    departure_station_name: str
    destination_station_name: str
    departure_time: datetime
    status: str
    vehicle_plate: str
    passenger_count: int
    location_broadcast_enabled: bool


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


class BroadcastToggleRequest(BaseModel):
    enabled: bool


class BroadcastToggleResponse(BaseModel):
    enabled: bool
    live_url: str | None = None


class ShareLinkResponse(BaseModel):
    sms_sent: int


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


def _haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    R = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlng = math.radians(lng2 - lng1)
    a = (
        math.sin(dlat / 2) ** 2
        + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlng / 2) ** 2
    )
    return R * 2 * math.asin(math.sqrt(a))


# ── Background task: proximity ETA SMS ────────────────────────────────────────


async def _check_eta_proximity_sms(
    trip_id: int,
    vehicle_lat: float,
    vehicle_lng: float,
    session_or_factory,
) -> None:
    """
    Fired after every GPS update. Sends an ETA SMS to all passengers on the trip
    when the bus enters the 30 km proximity window around the destination.
    Each ticket gets at most one such SMS (eta_sms_sent_at is set to prevent repeats).

    session_or_factory can be:
      - None (production): opens a new session from SessionLocal
      - an AsyncSession (tests): uses the provided session directly
      - an async_sessionmaker: opens a new session from the factory
    """
    from app.database import SessionLocal  # local import avoids circular deps  # noqa: PLC0415

    if isinstance(session_or_factory, AsyncSession):
        # Test path — reuse the provided session directly
        await _do_proximity_check(trip_id, vehicle_lat, vehicle_lng, session_or_factory)
        return

    factory = session_or_factory or SessionLocal
    async with factory() as db:
        await _do_proximity_check(trip_id, vehicle_lat, vehicle_lng, db)


async def _do_proximity_check(
    trip_id: int,
    vehicle_lat: float,
    vehicle_lng: float,
    db: AsyncSession,
) -> None:
    result = await db.execute(
        select(Trip)
        .where(Trip.id == trip_id, Trip.status == TripStatus.departed)
        .options(
            selectinload(Trip.destination_station),
            selectinload(Trip.tickets),
        )
    )
    trip = result.scalar_one_or_none()
    if trip is None:
        return

    dest = trip.destination_station
    if dest is None or dest.latitude is None or dest.longitude is None:
        return

    dist_km = _haversine_km(vehicle_lat, vehicle_lng, dest.latitude, dest.longitude)
    if dist_km > _ETA_PROXIMITY_KM:
        return

    eta_minutes = max(1, round(dist_km / _GPS_AVG_SPEED_KMH * 60))
    now = datetime.now(UTC)

    tickets_to_notify = [
        t for t in trip.tickets
        if t.status != TicketStatus.cancelled
        and t.eta_sms_sent_at is None
        and t.passenger_phone
    ]
    if not tickets_to_notify:
        return

    message = arkesel.msg_bus_approaching(dest.name, eta_minutes)

    for ticket in tickets_to_notify:
        await arkesel.send_sms(ticket.passenger_phone, message, "bus_approaching")
        ticket.eta_sms_sent_at = now

    await db.commit()


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
        location_broadcast_enabled=trip.vehicle.location_broadcast_enabled if trip.vehicle else False,
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
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db_for_user),
    current_user: User = Depends(require_role(UserRole.driver)),
):
    """Push the driver's current GPS coordinates to their active trip's vehicle."""
    trip = await _get_driver_active_trip(current_user, db, statuses=_SCAN_STATUSES)
    if trip is None or trip.vehicle_id is None:
        return LocationUpdateResponse(accepted=False)

    vehicle_result = await db.execute(select(Vehicle).where(Vehicle.id == trip.vehicle_id))
    vehicle = vehicle_result.scalar_one_or_none()
    if vehicle is None:
        return LocationUpdateResponse(accepted=False)

    vehicle.current_latitude = body.latitude
    vehicle.current_longitude = body.longitude
    vehicle.last_gps_update = datetime.now(UTC)
    await db.commit()

    # Fire proximity check as a background task — does not block the driver's response
    background_tasks.add_task(
        _check_eta_proximity_sms,
        trip.id,
        body.latitude,
        body.longitude,
        None,  # will default to SessionLocal inside the background task
    )

    return LocationUpdateResponse(accepted=True)


@router.post("/broadcast", response_model=BroadcastToggleResponse)
async def toggle_broadcast(
    body: BroadcastToggleRequest,
    db: AsyncSession = Depends(get_db_for_user),
    current_user: User = Depends(require_role(UserRole.driver)),
):
    """Enable or disable live location broadcasting for the driver's current trip."""
    trip = await _get_driver_active_trip(current_user, db)
    if trip is None or trip.vehicle is None:
        raise HTTPException(status_code=404, detail="No active trip assigned to this driver.")

    trip.vehicle.location_broadcast_enabled = body.enabled
    await db.commit()

    live_url: str | None = None
    if body.enabled:
        live_url = f"{settings.public_app_url}/track/bus/{trip.id}"

    return BroadcastToggleResponse(enabled=body.enabled, live_url=live_url)


@router.post("/share-link", response_model=ShareLinkResponse)
async def share_tracking_link(
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db_for_user),
    current_user: User = Depends(require_role(UserRole.driver)),
):
    """
    SMS the live tracking URL to all active passengers on the driver's current trip.
    The driver must have broadcast enabled — this ensures the link will actually show data.
    """
    trip = await _get_driver_active_trip(current_user, db)
    if trip is None:
        raise HTTPException(status_code=404, detail="No active trip assigned to this driver.")

    if trip.vehicle is None or not trip.vehicle.location_broadcast_enabled:
        raise HTTPException(
            status_code=400,
            detail="Enable location broadcast before sharing the tracking link.",
        )

    dep = trip.departure_station.name if trip.departure_station else "?"
    dst = trip.destination_station.name if trip.destination_station else "?"
    url = f"{settings.public_app_url}/track/bus/{trip.id}"
    message = arkesel.msg_live_tracking_link(dep, dst, url)

    tickets = [
        t for t in trip.tickets
        if t.status != TicketStatus.cancelled and t.passenger_phone
    ]

    for ticket in tickets:
        background_tasks.add_task(
            arkesel.send_sms,
            ticket.passenger_phone,
            message,
            "live_tracking_link",
        )

    return ShareLinkResponse(sms_sent=len(tickets))
