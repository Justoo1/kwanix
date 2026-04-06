"""
Super-admin and company-admin management endpoints.

POST /admin/companies       — super_admin only: onboard a new transport company
GET  /admin/companies       — super_admin only: list all companies
POST /admin/users           — company_admin+:   create a user within their company
GET  /admin/users           — company_admin+:   list users within their company
PATCH /admin/users/{id}/deactivate — company_admin+: deactivate a user
PATCH /admin/users/{id}/activate   — company_admin+: reactivate a user
"""

import json
import secrets
import string
import traceback
from collections import defaultdict
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.dependencies.auth import require_role
from app.integrations.email import send_sla_report_email
from app.models.company import Company
from app.models.ticket import TicketStatus
from app.models.trip import Trip, TripStatus
from app.models.user import User, UserRole
from app.models.webhook_event import WebhookEvent
from app.services.auth_service import hash_password

router = APIRouter()


# ── Schemas ────────────────────────────────────────────────────────────────────


class CompanyCreate(BaseModel):
    name: str
    company_code: str
    subdomain: str | None = None
    brand_color: str | None = None


class CompanyResponse(BaseModel):
    id: int
    name: str
    company_code: str
    subdomain: str | None
    brand_color: str | None
    is_active: bool
    api_key_prefix: str | None = None  # first 8 chars of api_key, never full key

    model_config = {"from_attributes": True}

    @classmethod
    def from_orm_with_prefix(cls, company: "Company") -> "CompanyResponse":
        prefix = company.api_key[:8] if company.api_key else None
        return cls(
            id=company.id,
            name=company.name,
            company_code=company.company_code,
            subdomain=company.subdomain,
            brand_color=company.brand_color,
            is_active=company.is_active,
            api_key_prefix=prefix,
        )


class CompanyUpdate(BaseModel):
    brand_color: str | None = None


class UserCreate(BaseModel):
    full_name: str
    phone: str
    email: str | None = None
    password: str | None = None  # auto-generated if omitted
    role: UserRole
    station_id: int | None = None


class UserResponse(BaseModel):
    id: int
    full_name: str
    phone: str
    email: str | None
    role: str
    company_id: int | None
    station_id: int | None
    is_active: bool

    model_config = {"from_attributes": True}


class UserCreateResponse(UserResponse):
    """Returned from POST /admin/users — includes temp_password only when auto-generated."""

    temp_password: str | None = None


# ── Helpers ────────────────────────────────────────────────────────────────────


def _generate_temp_password(length: int = 12) -> str:
    alphabet = string.ascii_letters + string.digits
    return "".join(secrets.choice(alphabet) for _ in range(length))


# ── Company endpoints (super_admin only) ───────────────────────────────────────


@router.post(
    "/companies",
    response_model=CompanyResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_role(UserRole.super_admin))],
)
async def create_company(
    body: CompanyCreate,
    db: AsyncSession = Depends(get_db),
):
    existing = await db.execute(
        select(Company).where(Company.company_code == body.company_code.upper())
    )
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=400,
            detail=f"Company code '{body.company_code.upper()}' is already taken.",
        )

    company = Company(
        name=body.name,
        company_code=body.company_code.upper(),
        subdomain=body.subdomain,
        brand_color=body.brand_color,
        is_active=True,
    )
    db.add(company)
    await db.commit()
    await db.refresh(company)
    return company


@router.get(
    "/companies",
    response_model=list[CompanyResponse],
    dependencies=[Depends(require_role(UserRole.super_admin))],
)
async def list_companies(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Company).order_by(Company.name))
    return result.scalars().all()


# ── Company self-service (company_admin only) ─────────────────────────────────


@router.get(
    "/companies/me",
    response_model=CompanyResponse,
)
async def get_my_company(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(
        require_role(UserRole.company_admin, UserRole.station_manager, UserRole.station_clerk)
    ),
):
    result = await db.execute(select(Company).where(Company.id == current_user.company_id))
    company = result.scalar_one_or_none()
    if company is None:
        raise HTTPException(status_code=404, detail="Company not found.")
    return CompanyResponse.from_orm_with_prefix(company)


class RotateApiKeyResponse(BaseModel):
    api_key: str


@router.post(
    "/companies/me/rotate-api-key",
    response_model=RotateApiKeyResponse,
    dependencies=[Depends(require_role(UserRole.company_admin, UserRole.super_admin))],
)
async def rotate_api_key(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.company_admin, UserRole.super_admin)),
):
    """Generate a new API key for the current company (shown once only)."""
    result = await db.execute(select(Company).where(Company.id == current_user.company_id))
    company = result.scalar_one_or_none()
    if company is None:
        raise HTTPException(status_code=404, detail="Company not found.")
    new_key = secrets.token_urlsafe(32)
    company.api_key = new_key
    await db.commit()
    return RotateApiKeyResponse(api_key=new_key)


class WeightTierItem(BaseModel):
    max_kg: float | None = None  # None means "everything above"
    fee_ghs: float


class WeightTiersResponse(BaseModel):
    tiers: list[WeightTierItem]


@router.get(
    "/companies/me/weight-tiers",
    response_model=WeightTiersResponse,
    dependencies=[Depends(require_role(UserRole.company_admin, UserRole.super_admin))],
)
async def get_weight_tiers(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.company_admin, UserRole.super_admin)),
):
    """Return parcel weight-tier pricing for the company."""
    result = await db.execute(select(Company).where(Company.id == current_user.company_id))
    company = result.scalar_one_or_none()
    if company is None:
        raise HTTPException(status_code=404, detail="Company not found.")
    tiers = [WeightTierItem(**t) for t in (company.weight_tiers or [])]
    return WeightTiersResponse(tiers=tiers)


@router.put(
    "/companies/me/weight-tiers",
    response_model=WeightTiersResponse,
    dependencies=[Depends(require_role(UserRole.company_admin))],
)
async def set_weight_tiers(
    body: WeightTiersResponse,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.company_admin)),
):
    """Replace the full weight-tier pricing list for the company."""
    result = await db.execute(select(Company).where(Company.id == current_user.company_id))
    company = result.scalar_one_or_none()
    if company is None:
        raise HTTPException(status_code=404, detail="Company not found.")
    company.weight_tiers = [t.model_dump() for t in body.tiers]
    await db.commit()
    await db.refresh(company)
    tiers = [WeightTierItem(**t) for t in (company.weight_tiers or [])]
    return WeightTiersResponse(tiers=tiers)


@router.patch(
    "/companies/me",
    response_model=CompanyResponse,
    dependencies=[Depends(require_role(UserRole.company_admin))],
)
async def update_my_company(
    body: CompanyUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.company_admin)),
):
    result = await db.execute(select(Company).where(Company.id == current_user.company_id))
    company = result.scalar_one_or_none()
    if company is None:
        raise HTTPException(status_code=404, detail="Company not found.")
    if body.brand_color is not None:
        company.brand_color = body.brand_color
    await db.commit()
    await db.refresh(company)
    return company


# ── User endpoints (company_admin+) ───────────────────────────────────────────


@router.post(
    "/users",
    response_model=UserCreateResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_user(
    body: UserCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(
        require_role(
            UserRole.super_admin,
            UserRole.company_admin,
        )
    ),
):
    # Determine which company this user belongs to
    if current_user.role == UserRole.super_admin:
        # super_admin must explicitly set company via station_id lookup or
        # we rely on company_id being set externally — for now require a
        # company_admin to own the user
        raise HTTPException(
            status_code=400,
            detail="super_admin cannot create users directly. Log in as a company_admin.",
        )

    # Prevent company_admin from creating super_admin accounts
    if body.role == UserRole.super_admin:
        raise HTTPException(
            status_code=403,
            detail="Cannot create a super_admin account.",
        )

    # Check for duplicate phone
    dup = await db.execute(select(User).where(User.phone == body.phone))
    if dup.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Phone number already in use.")

    # Auto-generate password if not supplied
    temp_password: str | None = None
    if body.password:
        plain_password = body.password
    else:
        plain_password = _generate_temp_password()
        temp_password = plain_password

    user = User(
        company_id=current_user.company_id,
        station_id=body.station_id,
        full_name=body.full_name,
        phone=body.phone,
        email=body.email,
        hashed_password=hash_password(plain_password),
        role=body.role,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return UserCreateResponse(
        id=user.id,
        full_name=user.full_name,
        phone=user.phone,
        email=user.email,
        role=user.role,
        company_id=user.company_id,
        station_id=user.station_id,
        is_active=user.is_active,
        temp_password=temp_password,
    )


@router.get("/users", response_model=list[UserResponse])
async def list_users(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(
        require_role(
            UserRole.super_admin,
            UserRole.company_admin,
        )
    ),
):
    if current_user.role == UserRole.super_admin:
        result = await db.execute(select(User).order_by(User.company_id, User.full_name))
    else:
        result = await db.execute(
            select(User).where(User.company_id == current_user.company_id).order_by(User.full_name)
        )
    return result.scalars().all()


@router.patch("/users/{user_id}/deactivate", response_model=UserResponse)
async def deactivate_user(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.company_admin, UserRole.super_admin)),
):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=404, detail="User not found.")

    # company_admin can only deactivate users within their own company
    if current_user.role == UserRole.company_admin and user.company_id != current_user.company_id:
        raise HTTPException(
            status_code=403,
            detail="Cannot deactivate a user from another company.",
        )

    # Prevent self-deactivation
    if user.id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot deactivate your own account.")

    user.is_active = False
    await db.commit()
    await db.refresh(user)
    return user


@router.patch("/users/{user_id}/activate", response_model=UserResponse)
async def activate_user(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.company_admin, UserRole.super_admin)),
):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=404, detail="User not found.")

    # company_admin can only activate users within their own company
    if current_user.role == UserRole.company_admin and user.company_id != current_user.company_id:
        raise HTTPException(
            status_code=403,
            detail="Cannot activate a user from another company.",
        )

    user.is_active = True
    await db.commit()
    await db.refresh(user)
    return user


class AssignStationRequest(BaseModel):
    station_id: int | None = None


@router.patch("/users/{user_id}/station", response_model=UserResponse)
async def assign_user_station(
    user_id: int,
    body: AssignStationRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.company_admin, UserRole.super_admin)),
):
    """Reassign a clerk/manager to a different station."""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=404, detail="User not found.")

    if current_user.role == UserRole.company_admin and user.company_id != current_user.company_id:
        raise HTTPException(
            status_code=403,
            detail="Cannot modify a user from another company.",
        )

    user.station_id = body.station_id
    await db.commit()
    await db.refresh(user)
    return user


# ── SMS balance (company_admin+) ──────────────────────────────────────────────


@router.get(
    "/arkesel-balance",
    dependencies=[Depends(require_role(UserRole.company_admin, UserRole.super_admin))],
)
async def get_arkesel_balance() -> dict:
    """Return current Arkesel SMS credit balance."""
    from app.integrations.arkesel import check_balance

    data = await check_balance()
    # Arkesel v2 returns {"balance": "123.45"} or {"balance": None} on error
    try:
        balance = float(data.get("balance") or 0)
    except (ValueError, TypeError):
        balance = 0.0
    return {"balance": balance}


# ── Webhook DLQ (company_admin+) + replay (super_admin only) ──────────────────

MAX_REPLAY_ATTEMPTS = 3


class WebhookEventResponse(BaseModel):
    id: int
    event_type: str
    attempts: int
    last_error: str | None
    created_at: datetime
    processed_at: datetime | None

    model_config = {"from_attributes": True}


class WebhookReplayResponse(BaseModel):
    replayed: int
    failed: int
    skipped: int


@router.get(
    "/webhooks/failed",
    response_model=list[WebhookEventResponse],
    dependencies=[Depends(require_role(UserRole.company_admin, UserRole.super_admin))],
)
async def list_failed_webhooks(db: AsyncSession = Depends(get_db)):
    """Return webhook events that have exhausted all retry attempts."""
    result = await db.execute(
        select(WebhookEvent)
        .where(
            WebhookEvent.processed_at.is_(None),
            WebhookEvent.attempts >= MAX_REPLAY_ATTEMPTS,
        )
        .order_by(WebhookEvent.created_at.desc())
        .limit(100)
    )
    return result.scalars().all()


@router.post(
    "/webhooks/{event_id}/retry",
    response_model=WebhookEventResponse,
    dependencies=[Depends(require_role(UserRole.company_admin, UserRole.super_admin))],
)
async def retry_webhook_event(event_id: int, db: AsyncSession = Depends(get_db)):
    """Reset a failed webhook event so it is picked up by the next replay run."""
    result = await db.execute(select(WebhookEvent).where(WebhookEvent.id == event_id))
    event = result.scalar_one_or_none()
    if event is None:
        raise HTTPException(status_code=404, detail="Webhook event not found.")
    event.attempts = 0
    event.processed_at = None
    await db.commit()
    await db.refresh(event)
    return event


@router.post(
    "/webhooks/replay",
    response_model=WebhookReplayResponse,
    dependencies=[Depends(require_role(UserRole.super_admin))],
)
async def replay_webhooks(db: AsyncSession = Depends(get_db)):
    """Reprocess unhandled webhook events up to MAX_REPLAY_ATTEMPTS times."""
    from app.routers.webhooks import _process_paystack_payload

    result = await db.execute(
        select(WebhookEvent)
        .where(
            WebhookEvent.processed_at.is_(None),
            WebhookEvent.attempts < MAX_REPLAY_ATTEMPTS,
        )
        .order_by(WebhookEvent.created_at)
        .limit(100)
    )
    events = result.scalars().all()

    replayed = 0
    failed = 0
    skipped = 0

    for event in events:
        try:
            payload = json.loads(event.payload)
            await _process_paystack_payload(payload, db)
            event.processed_at = datetime.now(UTC)
            event.attempts += 1
            await db.flush()
            replayed += 1
        except Exception:
            event.attempts += 1
            event.last_error = traceback.format_exc()[-2000:]
            await db.flush()
            failed += 1

    await db.commit()
    return WebhookReplayResponse(replayed=replayed, failed=failed, skipped=skipped)


# ── Trip reminders (super_admin / company_admin) ───────────────────────────────


class SendRemindersResponse(BaseModel):
    reminders_sent: int
    trips_checked: int


@router.post(
    "/trips/send-reminders",
    response_model=SendRemindersResponse,
    dependencies=[Depends(require_role(UserRole.super_admin, UserRole.company_admin))],
)
async def send_trip_reminders(
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.super_admin, UserRole.company_admin)),
):
    """
    Send SMS departure reminders for all scheduled trips departing within 2 hours.
    Idempotent: skips tickets that already have reminder_sent_at set.
    """
    from app.integrations.arkesel import dispatch_sms, msg_trip_reminder

    now = datetime.now(UTC)
    window_end = now + timedelta(hours=2)

    stmt = (
        select(Trip)
        .where(
            Trip.status == TripStatus.scheduled,
            Trip.departure_time >= now,
            Trip.departure_time <= window_end,
        )
        .options(
            selectinload(Trip.tickets),
            selectinload(Trip.departure_station),
            selectinload(Trip.destination_station),
        )
    )
    # company_admin: only their company's trips
    if current_user.role == UserRole.company_admin:
        stmt = stmt.where(Trip.company_id == current_user.company_id)

    result = await db.execute(stmt)
    trips = result.scalars().all()

    reminders_sent = 0
    now_ts = datetime.now(UTC)

    for trip in trips:
        try:
            from_name = trip.departure_station.name
            to_name = trip.destination_station.name
        except Exception:
            from_name = str(trip.departure_station_id)
            to_name = str(trip.destination_station_id)

        departure_str = trip.departure_time.strftime("%H:%M")

        for ticket in trip.tickets:
            if ticket.status == TicketStatus.cancelled:
                continue
            if ticket.reminder_sent_at is not None:
                continue

            ticket.reminder_sent_at = now_ts
            message = msg_trip_reminder(ticket.passenger_name, from_name, to_name, departure_str)
            background_tasks.add_task(
                dispatch_sms,
                db,
                None,
                ticket.passenger_phone,
                message,
                "trip_reminder",
            )
            reminders_sent += 1

    await db.commit()
    return SendRemindersResponse(reminders_sent=reminders_sent, trips_checked=len(trips))


# ── Trip occupancy rates (company_admin+) ─────────────────────────────────────


class OccupancyRouteItem(BaseModel):
    route: str
    trips: int
    avg_occupancy_pct: float
    total_revenue_ghs: float


@router.get(
    "/trips/occupancy",
    response_model=list[OccupancyRouteItem],
)
async def get_trips_occupancy(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.company_admin, UserRole.super_admin)),
):
    """Return occupancy rates grouped by route (departure → destination)."""
    from app.models.ticket import TicketStatus

    stmt = select(Trip).options(
        selectinload(Trip.departure_station),
        selectinload(Trip.destination_station),
        selectinload(Trip.vehicle),
        selectinload(Trip.tickets),
    )
    if current_user.role == UserRole.company_admin:
        stmt = stmt.where(Trip.company_id == current_user.company_id)

    result = await db.execute(stmt)
    trips = result.scalars().all()

    route_data: dict[str, dict] = defaultdict(
        lambda: {"trips": 0, "occupancy_sum": 0.0, "revenue": 0.0}
    )

    for trip in trips:
        try:
            dep = trip.departure_station.name
            dst = trip.destination_station.name
            capacity = trip.vehicle.capacity
        except Exception:  # noqa: BLE001
            continue
        if not capacity:
            continue

        active = [t for t in trip.tickets if t.status != TicketStatus.cancelled]
        revenue = sum(float(t.fare_ghs) for t in active)
        occupancy_pct = len(active) / capacity * 100

        route = f"{dep} → {dst}"
        route_data[route]["trips"] += 1
        route_data[route]["occupancy_sum"] += occupancy_pct
        route_data[route]["revenue"] += revenue

    return [
        OccupancyRouteItem(
            route=route,
            trips=data["trips"],
            avg_occupancy_pct=round(data["occupancy_sum"] / data["trips"], 1),
            total_revenue_ghs=round(data["revenue"], 2),
        )
        for route, data in sorted(route_data.items())
    ]


# ── Company daily stats drilldown (company_admin+) ────────────────────────────


class DailyStatItem(BaseModel):
    date: str  # YYYY-MM-DD
    tickets_sold: int
    parcels_created: int
    revenue_ghs: float


@router.get(
    "/stats/daily",
    response_model=list[DailyStatItem],
    dependencies=[Depends(require_role(UserRole.company_admin, UserRole.super_admin))],
)
async def get_daily_stats(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.company_admin, UserRole.super_admin)),
):
    """Return the last 7 days of tickets_sold, parcels_created, and revenue."""
    from app.models.parcel import Parcel
    from app.models.ticket import Ticket, TicketStatus

    now = datetime.now(UTC)
    days = []
    for i in range(6, -1, -1):
        day_start = (now - timedelta(days=i)).replace(hour=0, minute=0, second=0, microsecond=0)
        day_end = day_start + timedelta(days=1)

        # Tickets sold (non-cancelled)
        tickets_q = (
            select(func.count())
            .select_from(Ticket)
            .where(
                Ticket.created_at >= day_start,
                Ticket.created_at < day_end,
                Ticket.status != TicketStatus.cancelled,
            )
        )
        if current_user.role == UserRole.company_admin:
            tickets_q = tickets_q.where(Ticket.company_id == current_user.company_id)
        tickets_count = (await db.execute(tickets_q)).scalar_one()

        # Parcels created
        parcels_q = (
            select(func.count())
            .select_from(Parcel)
            .where(
                Parcel.created_at >= day_start,
                Parcel.created_at < day_end,
            )
        )
        if current_user.role == UserRole.company_admin:
            parcels_q = parcels_q.where(Parcel.company_id == current_user.company_id)
        parcels_count = (await db.execute(parcels_q)).scalar_one()

        # Revenue (parcel fees)
        revenue_q = select(func.sum(Parcel.fee_ghs)).where(
            Parcel.created_at >= day_start,
            Parcel.created_at < day_end,
        )
        if current_user.role == UserRole.company_admin:
            revenue_q = revenue_q.where(Parcel.company_id == current_user.company_id)
        revenue = (await db.execute(revenue_q)).scalar_one()

        days.append(
            DailyStatItem(
                date=day_start.strftime("%Y-%m-%d"),
                tickets_sold=tickets_count,
                parcels_created=parcels_count,
                revenue_ghs=round(float(revenue or 0), 2),
            )
        )

    return days


# ── Super-admin platform stats ─────────────────────────────────────────────────


class AdminStatsResponse(BaseModel):
    companies: int
    active_trips: int
    parcels_today: int
    revenue_today_ghs: float


@router.get(
    "/stats",
    response_model=AdminStatsResponse,
    dependencies=[Depends(require_role(UserRole.super_admin))],
)
async def get_admin_stats(db: AsyncSession = Depends(get_db)):
    """Platform-wide metrics for the super_admin dashboard."""
    from app.models.parcel import Parcel

    today_start = datetime.now(UTC).replace(hour=0, minute=0, second=0, microsecond=0)
    tomorrow_start = today_start + timedelta(days=1)

    companies_count = (await db.execute(select(func.count()).select_from(Company))).scalar_one()

    active_trips_count = (
        await db.execute(
            select(func.count())
            .select_from(Trip)
            .where(Trip.status.in_([TripStatus.loading, TripStatus.departed]))
        )
    ).scalar_one()

    parcels_today_count = (
        await db.execute(
            select(func.count())
            .select_from(Parcel)
            .where(Parcel.created_at >= today_start, Parcel.created_at < tomorrow_start)
        )
    ).scalar_one()

    revenue_today = (
        await db.execute(
            select(func.sum(Parcel.fee_ghs)).where(
                Parcel.created_at >= today_start, Parcel.created_at < tomorrow_start
            )
        )
    ).scalar_one()

    return AdminStatsResponse(
        companies=companies_count,
        active_trips=active_trips_count,
        parcels_today=parcels_today_count,
        revenue_today_ghs=float(revenue_today or 0),
    )


# ── Parcel delivery SLA report (company_admin+) ────────────────────────────────


class SlaReportResponse(BaseModel):
    message: str
    total: int
    on_time: int
    late: int
    on_time_pct: float


@router.post(
    "/reports/sla-email",
    response_model=SlaReportResponse,
)
async def send_sla_email(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.company_admin, UserRole.super_admin)),
):
    """Compute 7-day parcel SLA stats and email a summary to the requesting user."""
    from app.models.parcel import Parcel, ParcelStatus

    now = datetime.now(UTC)
    seven_days_ago = now - timedelta(days=7)

    stmt = select(Parcel).where(
        Parcel.created_at >= seven_days_ago,
        Parcel.status.in_([ParcelStatus.arrived, ParcelStatus.picked_up]),
        Parcel.arrived_at.isnot(None),
    )
    if current_user.role == UserRole.company_admin:
        stmt = stmt.where(Parcel.company_id == current_user.company_id)

    result = await db.execute(stmt)
    parcels = result.scalars().all()

    total = len(parcels)
    on_time = sum(
        1
        for p in parcels
        if p.arrived_at and (p.arrived_at - p.created_at).total_seconds() <= 48 * 3600
    )
    late = total - on_time
    on_time_pct = round(on_time / total * 100, 1) if total > 0 else 0.0

    send_sla_report_email(
        to_email=current_user.email,
        total=total,
        on_time=on_time,
        late=late,
        on_time_pct=on_time_pct,
    )

    msg = "SLA report sent" if current_user.email else "No email address on file — report not sent"
    return SlaReportResponse(
        message=msg,
        total=total,
        on_time=on_time,
        late=late,
        on_time_pct=on_time_pct,
    )
