"""
LiveTrack — real-time bus tracking endpoints.

Public endpoint: GET /livetrack/trip/{trip_id}
  No auth. Returns vehicle GPS if the driver has enabled broadcast and GPS is fresh.

Operator endpoints (company_admin / station_manager):
  GET /livetrack/fleet         — all active vehicles with GPS for the company
  GET /livetrack/dead-vehicles — departed trips with stale GPS
"""

import math
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.dependencies.auth import get_db_for_user, require_role
from app.middleware.rate_limit import limiter
from app.models.trip import Trip, TripStatus
from app.models.user import User, UserRole
from app.models.vehicle import Vehicle

router = APIRouter()

_GPS_STALE_SECONDS = 300       # 5 minutes — GPS older than this is not shown to passengers
_DEAD_VEHICLE_MINUTES = 15     # alert threshold for fleet-level monitoring


# ── Helpers ────────────────────────────────────────────────────────────────────


def _haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Great-circle distance in kilometres between two lat/lng points."""
    R = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlng = math.radians(lng2 - lng1)
    a = (
        math.sin(dlat / 2) ** 2
        + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlng / 2) ** 2
    )
    return R * 2 * math.asin(math.sqrt(a))


def _eta_minutes(distance_km: float, avg_speed_kmh: float = 80.0) -> int:
    return max(1, round(distance_km / avg_speed_kmh * 60))


# ── Schemas ────────────────────────────────────────────────────────────────────


class TripPositionResponse(BaseModel):
    trip_id: int
    status: str
    departure_station_name: str
    destination_station_name: str
    departure_station_lat: float | None
    departure_station_lng: float | None
    destination_lat: float | None
    destination_lng: float | None
    departure_time: str
    vehicle_lat: float | None
    vehicle_lng: float | None
    vehicle_last_update: str | None
    eta_minutes: int | None
    gps_fresh: bool


class FleetVehicleItem(BaseModel):
    vehicle_id: int
    plate_number: str
    trip_id: int | None
    trip_status: str | None
    route: str | None
    lat: float
    lng: float
    last_update: str
    is_stale: bool


class DeadVehicleAlert(BaseModel):
    vehicle_id: int
    plate_number: str
    trip_id: int
    route: str
    minutes_silent: int
    departure_time: str


# ── Public: trip position ──────────────────────────────────────────────────────


@router.get("/trip/{trip_id}", response_model=TripPositionResponse)
@limiter.limit("120/minute")
async def get_trip_position(
    request: Request,
    trip_id: int,
    db: AsyncSession = Depends(get_db),
):
    """
    Public — no auth required.
    Returns the live position of the bus assigned to this trip.
    GPS is only revealed when:
      - trip status is 'departed'
      - driver has enabled location broadcast
      - GPS was updated within the last 5 minutes
    """
    result = await db.execute(
        select(Trip)
        .where(Trip.id == trip_id)
        .options(
            selectinload(Trip.vehicle),
            selectinload(Trip.departure_station),
            selectinload(Trip.destination_station),
        )
    )
    trip = result.scalar_one_or_none()
    if trip is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Trip not found")

    now = datetime.now(UTC)
    vehicle = trip.vehicle
    vehicle_lat: float | None = None
    vehicle_lng: float | None = None
    vehicle_last_update: str | None = None
    gps_fresh = False
    eta_mins: int | None = None

    if (
        trip.status == TripStatus.departed
        and vehicle is not None
        and vehicle.location_broadcast_enabled
        and vehicle.current_latitude is not None
        and vehicle.current_longitude is not None
        and vehicle.last_gps_update is not None
    ):
        age_seconds = (now - vehicle.last_gps_update).total_seconds()
        gps_fresh = age_seconds < _GPS_STALE_SECONDS
        if gps_fresh:
            vehicle_lat = vehicle.current_latitude
            vehicle_lng = vehicle.current_longitude
            vehicle_last_update = vehicle.last_gps_update.isoformat()

            # Compute ETA to destination if station has coordinates
            dest = trip.destination_station
            if dest and dest.latitude is not None and dest.longitude is not None:
                dist_km = _haversine_km(
                    vehicle_lat, vehicle_lng, dest.latitude, dest.longitude
                )
                eta_mins = _eta_minutes(dist_km)

    dep_station = trip.departure_station
    dst_station = trip.destination_station

    return TripPositionResponse(
        trip_id=trip.id,
        status=trip.status.value,
        departure_station_name=dep_station.name if dep_station else "",
        destination_station_name=dst_station.name if dst_station else "",
        departure_station_lat=dep_station.latitude if dep_station else None,
        departure_station_lng=dep_station.longitude if dep_station else None,
        destination_lat=dst_station.latitude if dst_station else None,
        destination_lng=dst_station.longitude if dst_station else None,
        departure_time=trip.departure_time.isoformat(),
        vehicle_lat=vehicle_lat,
        vehicle_lng=vehicle_lng,
        vehicle_last_update=vehicle_last_update,
        eta_minutes=eta_mins,
        gps_fresh=gps_fresh,
    )


# ── Operator: fleet map ────────────────────────────────────────────────────────


@router.get("/fleet", response_model=list[FleetVehicleItem])
async def get_fleet_map(
    db: AsyncSession = Depends(get_db_for_user),
    current_user: User = Depends(require_role(UserRole.company_admin, UserRole.station_manager)),
):
    """
    Returns all company vehicles with a known GPS position.
    Includes active trip context when one exists.
    """
    result = await db.execute(
        select(Vehicle)
        .where(
            Vehicle.company_id == current_user.company_id,
            Vehicle.current_latitude.is_not(None),
            Vehicle.current_longitude.is_not(None),
            Vehicle.is_active.is_(True),
        )
        .options(
            selectinload(Vehicle.trips).selectinload(Trip.departure_station),
            selectinload(Vehicle.trips).selectinload(Trip.destination_station),
        )
    )
    vehicles = result.scalars().all()

    now = datetime.now(UTC)
    items: list[FleetVehicleItem] = []

    for v in vehicles:
        if v.current_latitude is None or v.current_longitude is None:
            continue

        is_stale = True
        if v.last_gps_update:
            is_stale = (now - v.last_gps_update).total_seconds() > _DEAD_VEHICLE_MINUTES * 60

        # Find the most recent active trip for this vehicle
        active_trip = None
        for t in v.trips:
            if t.status in (TripStatus.loading, TripStatus.departed):
                if active_trip is None or t.departure_time > active_trip.departure_time:
                    active_trip = t

        route: str | None = None
        trip_id: int | None = None
        trip_status: str | None = None
        if active_trip:
            trip_id = active_trip.id
            trip_status = active_trip.status.value
            dep = active_trip.departure_station.name if active_trip.departure_station else "?"
            dst = active_trip.destination_station.name if active_trip.destination_station else "?"
            route = f"{dep} → {dst}"

        items.append(
            FleetVehicleItem(
                vehicle_id=v.id,
                plate_number=v.plate_number,
                trip_id=trip_id,
                trip_status=trip_status,
                route=route,
                lat=v.current_latitude,
                lng=v.current_longitude,
                last_update=v.last_gps_update.isoformat() if v.last_gps_update else "",
                is_stale=is_stale,
            )
        )

    return items


# ── Operator: dead vehicle alerts ─────────────────────────────────────────────


@router.get("/dead-vehicles", response_model=list[DeadVehicleAlert])
async def get_dead_vehicles(
    db: AsyncSession = Depends(get_db_for_user),
    current_user: User = Depends(require_role(UserRole.company_admin, UserRole.station_manager)),
):
    """
    Returns departed trips where the vehicle GPS has been silent for more than 15 minutes.
    This indicates the driver may have stopped broadcasting or there is a connectivity issue.
    """
    result = await db.execute(
        select(Trip)
        .where(
            Trip.company_id == current_user.company_id,
            Trip.status == TripStatus.departed,
        )
        .options(
            selectinload(Trip.vehicle),
            selectinload(Trip.departure_station),
            selectinload(Trip.destination_station),
        )
    )
    trips = result.scalars().all()

    now = datetime.now(UTC)
    threshold = timedelta(minutes=_DEAD_VEHICLE_MINUTES)
    alerts: list[DeadVehicleAlert] = []

    for trip in trips:
        v = trip.vehicle
        if v is None:
            continue

        if v.last_gps_update is None:
            silent_minutes = int((now - trip.updated_at).total_seconds() / 60)
        else:
            silent_delta = now - v.last_gps_update
            if silent_delta < threshold:
                continue
            silent_minutes = int(silent_delta.total_seconds() / 60)

        dep = trip.departure_station.name if trip.departure_station else "?"
        dst = trip.destination_station.name if trip.destination_station else "?"

        alerts.append(
            DeadVehicleAlert(
                vehicle_id=v.id,
                plate_number=v.plate_number,
                trip_id=trip.id,
                route=f"{dep} → {dst}",
                minutes_silent=silent_minutes,
                departure_time=trip.departure_time.isoformat(),
            )
        )

    alerts.sort(key=lambda a: a.minutes_silent, reverse=True)
    return alerts
