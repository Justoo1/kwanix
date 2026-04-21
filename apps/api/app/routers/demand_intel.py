"""
Demand Intelligence endpoints — aggregated occupancy, forecast, pricing suggestions,
SLA risk, and revenue opportunity analysis.  All endpoints require company_admin or
super_admin; RLS is enforced automatically by get_db_for_user().
"""

import statistics
from datetime import UTC, date, datetime, timedelta

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.dependencies.auth import get_db_for_user, require_role
from app.models.company import Company
from app.models.parcel import Parcel, ParcelStatus
from app.models.station import Station
from app.models.ticket import Ticket, TicketStatus
from app.models.trip import Trip, TripStatus
from app.models.user import User, UserRole

router = APIRouter()

_ADMIN_ROLES = (UserRole.company_admin, UserRole.super_admin)
_require_admin = require_role(*_ADMIN_ROLES)

# ── Schemas ────────────────────────────────────────────────────────────────────


class HeatmapCell(BaseModel):
    departure_station_id: int
    departure_station_name: str
    destination_station_id: int
    destination_station_name: str
    day_of_week: int        # 0=Monday … 6=Sunday
    hour_of_day: int        # 0–23
    trip_count: int
    avg_occupancy_pct: float


class HeatmapResponse(BaseModel):
    days_back: int
    cells: list[HeatmapCell]


class ForecastResponse(BaseModel):
    departure_station_id: int
    destination_station_id: int
    target_date: date
    day_of_week: int
    sample_trips: int
    predicted_occupancy_pct: float
    occupancy_std: float
    confidence: str   # "high" | "medium" | "low"
    similar_trips: list[dict]


class PricingSuggestion(BaseModel):
    trip_id: int
    departure_station_name: str
    destination_station_name: str
    departure_time: datetime
    current_price_ghs: float | None
    seats_available: int
    vehicle_capacity: int
    occupancy_pct: float
    suggested_discount_pct: int
    suggested_price_ghs: float | None


class SlaRisk(BaseModel):
    parcel_id: int
    tracking_number: str
    sender_name: str
    receiver_name: str
    origin_station_name: str
    destination_station_name: str
    created_at: datetime
    hours_remaining: float
    severity: str   # "critical" | "warning" | "watch"


class Opportunity(BaseModel):
    departure_station_id: int
    departure_station_name: str
    destination_station_id: int
    destination_station_name: str
    day_of_week: int
    hour_of_day: int
    historical_avg_occupancy_pct: float
    historical_trip_count: int
    next_occurrence: date | None


# ── Helpers ────────────────────────────────────────────────────────────────────


def _day_of_week(dt: datetime) -> int:
    """Return Python weekday 0=Monday … 6=Sunday."""
    return dt.weekday()


def _confidence(sample_size: int) -> str:
    if sample_size >= 4:
        return "high"
    if sample_size >= 2:
        return "medium"
    return "low"


def _next_weekday(weekday: int) -> date:
    """Return the next calendar date (from today UTC) that falls on `weekday`."""
    today = datetime.now(UTC).date()
    days_ahead = (weekday - today.weekday()) % 7
    if days_ahead == 0:
        days_ahead = 7
    return today + timedelta(days=days_ahead)


# ── Endpoints ──────────────────────────────────────────────────────────────────


@router.get("/heatmap", response_model=HeatmapResponse)
async def get_demand_heatmap(
    days_back: int = Query(90, ge=7, le=365),
    db: AsyncSession = Depends(get_db_for_user),
    current_user: User = Depends(_require_admin),
):
    """
    Returns average occupancy % per (route × day-of-week × hour-of-day) cell
    for the last `days_back` days.  Only completed/arrived trips are included.
    """
    cutoff = datetime.now(UTC) - timedelta(days=days_back)

    result = await db.execute(
        select(Trip)
        .where(
            Trip.departure_time >= cutoff,
            Trip.status.in_([TripStatus.arrived, TripStatus.departed]),
        )
        .options(
            selectinload(Trip.departure_station),
            selectinload(Trip.destination_station),
            selectinload(Trip.tickets),
            selectinload(Trip.vehicle),
        )
    )
    trips = result.scalars().all()

    # Aggregate into (route, dow, hour) buckets
    from collections import defaultdict  # noqa: PLC0415
    buckets: dict[tuple, list[float]] = defaultdict(list)
    station_names: dict[int, str] = {}

    for trip in trips:
        if trip.vehicle is None or trip.vehicle.capacity <= 0:
            continue
        dep_id = trip.departure_station_id
        dst_id = trip.destination_station_id
        dow = _day_of_week(trip.departure_time)
        hour = trip.departure_time.hour

        non_cancelled = sum(1 for t in trip.tickets if t.status != TicketStatus.cancelled)
        occ_pct = round((non_cancelled / trip.vehicle.capacity) * 100, 1)
        buckets[(dep_id, dst_id, dow, hour)].append(occ_pct)

        if trip.departure_station:
            station_names[dep_id] = trip.departure_station.name
        if trip.destination_station:
            station_names[dst_id] = trip.destination_station.name

    cells = [
        HeatmapCell(
            departure_station_id=dep_id,
            departure_station_name=station_names.get(dep_id, str(dep_id)),
            destination_station_id=dst_id,
            destination_station_name=station_names.get(dst_id, str(dst_id)),
            day_of_week=dow,
            hour_of_day=hour,
            trip_count=len(occs),
            avg_occupancy_pct=round(sum(occs) / len(occs), 1),
        )
        for (dep_id, dst_id, dow, hour), occs in buckets.items()
    ]

    cells.sort(key=lambda c: (-c.avg_occupancy_pct, c.day_of_week, c.hour_of_day))
    return HeatmapResponse(days_back=days_back, cells=cells)


@router.get("/forecast", response_model=ForecastResponse)
async def get_occupancy_forecast(
    route_from: int = Query(...),
    route_to: int = Query(...),
    target_date: date = Query(...),
    days_back: int = Query(90, ge=14, le=365),
    db: AsyncSession = Depends(get_db_for_user),
    current_user: User = Depends(_require_admin),
):
    """
    Predict occupancy for a specific route on a specific date using Python statistics
    over historical trips on the same day-of-week.
    """
    target_dt = datetime(target_date.year, target_date.month, target_date.day, tzinfo=UTC)
    target_dow = target_dt.weekday()
    cutoff = datetime.now(UTC) - timedelta(days=days_back)

    result = await db.execute(
        select(Trip)
        .where(
            Trip.departure_station_id == route_from,
            Trip.destination_station_id == route_to,
            Trip.departure_time >= cutoff,
            Trip.departure_time < target_dt,
            Trip.status.in_([TripStatus.arrived, TripStatus.departed]),
        )
        .options(selectinload(Trip.tickets), selectinload(Trip.vehicle))
    )
    trips = result.scalars().all()

    same_dow = [t for t in trips if _day_of_week(t.departure_time) == target_dow]

    occupancies: list[float] = []
    similar: list[dict] = []
    for trip in same_dow:
        if trip.vehicle is None or trip.vehicle.capacity <= 0:
            continue
        sold = sum(1 for t in trip.tickets if t.status != TicketStatus.cancelled)
        occ = round((sold / trip.vehicle.capacity) * 100, 1)
        occupancies.append(occ)
        similar.append({
            "trip_id": trip.id,
            "departure_time": trip.departure_time.isoformat(),
            "occupancy_pct": occ,
        })

    predicted = round(statistics.mean(occupancies), 1) if occupancies else 0.0
    std = round(statistics.stdev(occupancies), 1) if len(occupancies) >= 2 else 0.0

    return ForecastResponse(
        departure_station_id=route_from,
        destination_station_id=route_to,
        target_date=target_date,
        day_of_week=target_dow,
        sample_trips=len(occupancies),
        predicted_occupancy_pct=predicted,
        occupancy_std=std,
        confidence=_confidence(len(occupancies)),
        similar_trips=similar,
    )


@router.get("/pricing-suggestions", response_model=list[PricingSuggestion])
async def get_pricing_suggestions(
    hours_ahead: int = Query(3, ge=1, le=24),
    occupancy_threshold: float = Query(70.0, ge=0, le=100),
    db: AsyncSession = Depends(get_db_for_user),
    current_user: User = Depends(_require_admin),
):
    """
    Returns scheduled/loading trips departing within `hours_ahead` hours where
    occupancy is below `occupancy_threshold` %.  Suggests a discount to fill seats.
    """
    now = datetime.now(UTC)
    window_end = now + timedelta(hours=hours_ahead)

    result = await db.execute(
        select(Trip)
        .where(
            Trip.departure_time.between(now, window_end),
            Trip.status.in_([TripStatus.scheduled, TripStatus.loading]),
        )
        .options(
            selectinload(Trip.departure_station),
            selectinload(Trip.destination_station),
            selectinload(Trip.tickets),
            selectinload(Trip.vehicle),
        )
    )
    trips = result.scalars().all()

    suggestions: list[PricingSuggestion] = []
    for trip in trips:
        if trip.vehicle is None or trip.vehicle.capacity <= 0:
            continue
        sold = sum(1 for t in trip.tickets if t.status != TicketStatus.cancelled)
        capacity = trip.vehicle.capacity
        occ_pct = round((sold / capacity) * 100, 1)
        if occ_pct >= occupancy_threshold:
            continue

        seats_available = capacity - sold
        # Simple discount ladder: >50% empty → 15%, >30% → 10%, otherwise 5%
        empty_pct = 100 - occ_pct
        if empty_pct > 50:
            discount = 15
        elif empty_pct > 30:
            discount = 10
        else:
            discount = 5

        base_price = float(trip.price_ticket_base) if trip.price_ticket_base else None
        suggested = round(base_price * (1 - discount / 100), 2) if base_price else None

        suggestions.append(
            PricingSuggestion(
                trip_id=trip.id,
                departure_station_name=trip.departure_station.name if trip.departure_station else "",
                destination_station_name=trip.destination_station.name if trip.destination_station else "",
                departure_time=trip.departure_time,
                current_price_ghs=base_price,
                seats_available=seats_available,
                vehicle_capacity=capacity,
                occupancy_pct=occ_pct,
                suggested_discount_pct=discount,
                suggested_price_ghs=suggested,
            )
        )

    suggestions.sort(key=lambda s: s.occupancy_pct)
    return suggestions


@router.get("/sla-risk", response_model=list[SlaRisk])
async def get_sla_risk(
    db: AsyncSession = Depends(get_db_for_user),
    current_user: User = Depends(_require_admin),
):
    """
    Returns parcels at risk of breaching the company SLA (sla_threshold_days).
    Severity: critical (<4h remaining), warning (4–12h), watch (12–24h).
    """
    now = datetime.now(UTC)

    # Load company SLA — super_admin sees all, but without RLS company_id is unset;
    # for simplicity we fall back to 2 days when company is unavailable.
    company_result = await db.execute(
        select(Company).where(Company.id == current_user.company_id)
    )
    company = company_result.scalar_one_or_none()
    sla_days = company.sla_threshold_days if company else 2

    # Parcels that are pending/in_transit and approaching the SLA window
    sla_deadline_start = now + timedelta(hours=0)
    sla_window_end = now + timedelta(hours=24)

    # Find parcels whose created_at + sla_days falls within the next 24 hours
    sla_cutoff_min = now - timedelta(days=sla_days) + timedelta(hours=0)
    sla_cutoff_max = now - timedelta(days=sla_days) + timedelta(hours=24)

    result = await db.execute(
        select(Parcel)
        .where(
            Parcel.status.in_([ParcelStatus.pending, ParcelStatus.in_transit]),
            Parcel.created_at >= sla_cutoff_min,
            Parcel.created_at <= sla_cutoff_max,
        )
        .options(
            selectinload(Parcel.origin_station),
            selectinload(Parcel.destination_station),
        )
    )
    parcels = result.scalars().all()

    risks: list[SlaRisk] = []
    for parcel in parcels:
        deadline = parcel.created_at + timedelta(days=sla_days)
        if deadline.tzinfo is None:
            deadline = deadline.replace(tzinfo=UTC)
        hours_remaining = (deadline - now).total_seconds() / 3600

        if hours_remaining > 24 or hours_remaining < 0:
            continue

        if hours_remaining < 4:
            severity = "critical"
        elif hours_remaining < 12:
            severity = "warning"
        else:
            severity = "watch"

        risks.append(
            SlaRisk(
                parcel_id=parcel.id,
                tracking_number=parcel.tracking_number,
                sender_name=parcel.sender_name,
                receiver_name=parcel.receiver_name,
                origin_station_name=parcel.origin_station.name if parcel.origin_station else "",
                destination_station_name=parcel.destination_station.name if parcel.destination_station else "",
                created_at=parcel.created_at,
                hours_remaining=round(hours_remaining, 1),
                severity=severity,
            )
        )

    risks.sort(key=lambda r: r.hours_remaining)
    return risks


@router.get("/opportunities", response_model=list[Opportunity])
async def get_opportunities(
    days_back: int = Query(90, ge=14, le=365),
    min_occupancy: float = Query(75.0, ge=50, le=100),
    db: AsyncSession = Depends(get_db_for_user),
    current_user: User = Depends(_require_admin),
):
    """
    Identifies route × day-of-week × hour slots with high historical occupancy (≥ min_occupancy%)
    but no scheduled trip in the next 14 days.  These are revenue opportunities.
    """
    now = datetime.now(UTC)
    cutoff = now - timedelta(days=days_back)
    look_ahead = now + timedelta(days=14)

    # Historical completed trips
    hist_result = await db.execute(
        select(Trip)
        .where(
            Trip.departure_time >= cutoff,
            Trip.departure_time < now,
            Trip.status.in_([TripStatus.arrived, TripStatus.departed]),
        )
        .options(
            selectinload(Trip.departure_station),
            selectinload(Trip.destination_station),
            selectinload(Trip.tickets),
            selectinload(Trip.vehicle),
        )
    )
    hist_trips = hist_result.scalars().all()

    from collections import defaultdict  # noqa: PLC0415
    buckets: dict[tuple, list[float]] = defaultdict(list)
    station_names: dict[int, str] = {}

    for trip in hist_trips:
        if trip.vehicle is None or trip.vehicle.capacity <= 0:
            continue
        dep_id = trip.departure_station_id
        dst_id = trip.destination_station_id
        dow = _day_of_week(trip.departure_time)
        hour = trip.departure_time.hour
        sold = sum(1 for t in trip.tickets if t.status != TicketStatus.cancelled)
        occ = round((sold / trip.vehicle.capacity) * 100, 1)
        buckets[(dep_id, dst_id, dow, hour)].append(occ)
        if trip.departure_station:
            station_names[dep_id] = trip.departure_station.name
        if trip.destination_station:
            station_names[dst_id] = trip.destination_station.name

    # Scheduled trips in the next 14 days
    future_result = await db.execute(
        select(Trip)
        .where(
            Trip.departure_time.between(now, look_ahead),
            Trip.status != TripStatus.cancelled,
        )
    )
    future_trips = future_result.scalars().all()
    scheduled_slots: set[tuple] = {
        (
            t.departure_station_id,
            t.destination_station_id,
            _day_of_week(t.departure_time),
            t.departure_time.hour,
        )
        for t in future_trips
    }

    opps: list[Opportunity] = []
    for (dep_id, dst_id, dow, hour), occs in buckets.items():
        avg = round(sum(occs) / len(occs), 1)
        if avg < min_occupancy:
            continue
        if (dep_id, dst_id, dow, hour) in scheduled_slots:
            continue

        opps.append(
            Opportunity(
                departure_station_id=dep_id,
                departure_station_name=station_names.get(dep_id, str(dep_id)),
                destination_station_id=dst_id,
                destination_station_name=station_names.get(dst_id, str(dst_id)),
                day_of_week=dow,
                hour_of_day=hour,
                historical_avg_occupancy_pct=avg,
                historical_trip_count=len(occs),
                next_occurrence=_next_weekday(dow),
            )
        )

    opps.sort(key=lambda o: -o.historical_avg_occupancy_pct)
    return opps
