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

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.dependencies.auth import require_role
from app.integrations.email import send_sla_report_email
from app.models.company import Company
from app.models.subscription import SubscriptionPlan
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
    max_parcel_weight_kg: float | None = None
    sla_threshold_days: int = 2

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
            max_parcel_weight_kg=company.max_parcel_weight_kg,
            sla_threshold_days=company.sla_threshold_days,
        )


class CompanyUpdate(BaseModel):
    brand_color: str | None = None
    max_parcel_weight_kg: float | None = None


class CompanySettings(BaseModel):
    sla_threshold_days: int


class UserCreate(BaseModel):
    full_name: str
    phone: str
    email: str | None = None
    password: str | None = None  # auto-generated if omitted
    role: UserRole
    station_id: int | None = None
    company_id: int | None = None  # required when called by super_admin


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
        api_key=secrets.token_urlsafe(32),
        subscription_status="trialing",
        trial_ends_at=datetime.now(UTC) + timedelta(days=30),
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
async def list_companies(
    limit: int = Query(default=200, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Company).order_by(Company.name).limit(limit).offset(offset))
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


_tiers_roles = require_role(UserRole.company_admin, UserRole.super_admin, UserRole.station_clerk)


@router.get(
    "/companies/me/weight-tiers",
    response_model=WeightTiersResponse,
    dependencies=[Depends(_tiers_roles)],
)
async def get_weight_tiers(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(_tiers_roles),
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
    if body.max_parcel_weight_kg is not None:
        company.max_parcel_weight_kg = body.max_parcel_weight_kg
    await db.commit()
    await db.refresh(company)
    return CompanyResponse.from_orm_with_prefix(company)


@router.patch(
    "/company/settings",
    response_model=CompanyResponse,
    dependencies=[Depends(require_role(UserRole.company_admin))],
)
async def update_company_settings(
    body: CompanySettings,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.company_admin)),
):
    """Update configurable company settings (e.g. SLA threshold)."""
    if not (1 <= body.sla_threshold_days <= 30):
        raise HTTPException(
            status_code=400,
            detail="sla_threshold_days must be between 1 and 30",
        )
    result = await db.execute(select(Company).where(Company.id == current_user.company_id))
    company = result.scalar_one_or_none()
    if company is None:
        raise HTTPException(status_code=404, detail="Company not found.")
    company.sla_threshold_days = body.sla_threshold_days
    await db.commit()
    await db.refresh(company)
    return CompanyResponse.from_orm_with_prefix(company)


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
    # Prevent anyone from creating super_admin accounts via this endpoint
    if body.role == UserRole.super_admin:
        raise HTTPException(
            status_code=403,
            detail="Cannot create a super_admin account.",
        )

    # Determine which company this user belongs to
    if current_user.role == UserRole.super_admin:
        if body.company_id is None:
            raise HTTPException(
                status_code=400,
                detail="company_id is required when creating a user as super_admin.",
            )
        target_company_id = body.company_id
    else:
        target_company_id = current_user.company_id

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
        company_id=target_company_id,
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
    limit: int = Query(default=200, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    role: UserRole | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(
        require_role(
            UserRole.super_admin,
            UserRole.company_admin,
            UserRole.station_manager,
        )
    ),
):
    if current_user.role == UserRole.super_admin:
        q = select(User).order_by(User.company_id, User.full_name)
    else:
        q = select(User).where(User.company_id == current_user.company_id).order_by(User.full_name)
    if role is not None:
        q = q.where(User.role == role)
    result = await db.execute(q.limit(limit).offset(offset))
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


class ResetPasswordRequest(BaseModel):
    new_password: str


@router.patch("/users/{user_id}/password", response_model=UserResponse)
async def reset_user_password(
    user_id: int,
    body: ResetPasswordRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.company_admin, UserRole.super_admin)),
):
    """Reset any user's password (company_admin for own company, super_admin for all)."""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=404, detail="User not found.")

    if current_user.role == UserRole.company_admin and user.company_id != current_user.company_id:
        raise HTTPException(status_code=403, detail="Cannot modify a user from another company.")

    if len(body.new_password) < 8:
        raise HTTPException(status_code=422, detail="Password must be at least 8 characters.")

    user.hashed_password = hash_password(body.new_password)
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


# ── Vehicle utilisation report (company_admin+) ───────────────────────────────


class VehicleUtilisationItem(BaseModel):
    vehicle_id: int
    plate_number: str
    trips_total: int
    trips_last_30_days: int
    avg_occupancy_pct: float
    total_revenue_ghs: float
    is_available: bool


@router.get(
    "/vehicles/utilisation",
    response_model=list[VehicleUtilisationItem],
)
async def get_vehicle_utilisation(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.company_admin, UserRole.super_admin)),
):
    """Return utilisation stats per vehicle for the company (last 30 days highlighted)."""
    from app.models.ticket import TicketStatus
    from app.models.trip import Trip
    from app.models.vehicle import Vehicle

    now = datetime.now(UTC)
    thirty_days_ago = now - timedelta(days=30)

    stmt = select(Vehicle).options(
        selectinload(Vehicle.trips).selectinload(Trip.tickets),
    )
    if current_user.role == UserRole.company_admin:
        stmt = stmt.where(Vehicle.company_id == current_user.company_id)

    result = await db.execute(stmt)
    vehicles = result.scalars().all()

    items = []
    for v in vehicles:
        trips_last_30 = 0
        occupancy_sum = 0.0
        trips_with_capacity = 0
        revenue = 0.0

        for trip in v.trips:
            dt = trip.departure_time
            if dt is not None:
                if dt.tzinfo is None:
                    dt = dt.replace(tzinfo=UTC)
                if dt >= thirty_days_ago:
                    trips_last_30 += 1

            active_tickets = [t for t in trip.tickets if t.status != TicketStatus.cancelled]
            revenue += sum(float(t.fare_ghs) for t in active_tickets)

            if v.capacity:
                occupancy_sum += len(active_tickets) / v.capacity * 100
                trips_with_capacity += 1

        avg_occ = round(occupancy_sum / trips_with_capacity, 1) if trips_with_capacity else 0.0

        items.append(
            VehicleUtilisationItem(
                vehicle_id=v.id,
                plate_number=v.plate_number,
                trips_total=len(v.trips),
                trips_last_30_days=trips_last_30,
                avg_occupancy_pct=avg_occ,
                total_revenue_ghs=round(revenue, 2),
                is_available=v.is_available,
            )
        )

    return sorted(items, key=lambda x: x.trips_total, reverse=True)


# ── Station performance dashboard (company_admin+) ────────────────────────────


class StationPerformanceItem(BaseModel):
    station_id: int
    station_name: str
    parcels_originated: int
    parcels_arrived: int
    trips_departed: int
    revenue_ghs: float


@router.get(
    "/stations/performance",
    response_model=list[StationPerformanceItem],
)
async def get_stations_performance(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.company_admin, UserRole.super_admin)),
):
    """Return 30-day throughput stats per station for the company."""
    from app.models.parcel import Parcel, ParcelStatus
    from app.models.station import Station
    from app.models.ticket import Ticket, TicketStatus
    from app.models.trip import Trip, TripStatus

    now = datetime.now(UTC)
    thirty_days_ago = now - timedelta(days=30)

    stations_stmt = select(Station)
    if current_user.role == UserRole.company_admin:
        stations_stmt = stations_stmt.where(Station.company_id == current_user.company_id)
    stations_result = await db.execute(stations_stmt)
    stations = stations_result.scalars().all()

    items = []
    for s in stations:
        # Parcels that originated here in last 30 days
        orig_q = (
            select(func.count())
            .select_from(Parcel)
            .where(
                Parcel.origin_station_id == s.id,
                Parcel.created_at >= thirty_days_ago,
            )
        )
        parcels_originated = (await db.execute(orig_q)).scalar_one()

        # Parcels that arrived at this station in last 30 days
        arr_q = (
            select(func.count())
            .select_from(Parcel)
            .where(
                Parcel.destination_station_id == s.id,
                Parcel.status.in_([ParcelStatus.arrived, ParcelStatus.picked_up]),
                Parcel.arrived_at >= thirty_days_ago,
            )
        )
        parcels_arrived = (await db.execute(arr_q)).scalar_one()

        # Trips that departed from this station in last 30 days
        dep_q = (
            select(func.count())
            .select_from(Trip)
            .where(
                Trip.departure_station_id == s.id,
                Trip.status == TripStatus.departed,
                Trip.departure_time >= thirty_days_ago,
            )
        )
        trips_departed = (await db.execute(dep_q)).scalar_one()

        # Revenue: sum of non-cancelled ticket fares for trips departing from this station
        rev_q = (
            select(func.sum(Ticket.fare_ghs))
            .join(Trip, Trip.id == Ticket.trip_id)
            .where(
                Trip.departure_station_id == s.id,
                Trip.departure_time >= thirty_days_ago,
                Ticket.status != TicketStatus.cancelled,
            )
        )
        revenue = (await db.execute(rev_q)).scalar_one()

        items.append(
            StationPerformanceItem(
                station_id=s.id,
                station_name=s.name,
                parcels_originated=parcels_originated,
                parcels_arrived=parcels_arrived,
                trips_departed=trips_departed,
                revenue_ghs=round(float(revenue or 0), 2),
            )
        )

    return sorted(items, key=lambda x: x.parcels_originated, reverse=True)


# ── Audit log viewer (company_admin+) ─────────────────────────────────────────


class AuditLogEntry(BaseModel):
    id: int
    parcel_tracking_number: str | None
    clerk_name: str | None
    previous_status: str | None
    new_status: str
    note: str | None
    occurred_at: datetime


@router.get(
    "/audit-log",
    response_model=list[AuditLogEntry],
)
async def get_audit_log(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.company_admin, UserRole.super_admin)),
):
    """Return the 100 most recent parcel audit log entries for the company."""
    from app.models.parcel import Parcel, ParcelLog

    stmt = (
        select(ParcelLog)
        .join(ParcelLog.parcel)
        .options(
            selectinload(ParcelLog.parcel),
            selectinload(ParcelLog.clerk),
        )
        .order_by(ParcelLog.occurred_at.desc())
        .limit(100)
    )
    if current_user.role == UserRole.company_admin:
        stmt = stmt.where(Parcel.company_id == current_user.company_id)

    result = await db.execute(stmt)
    logs = result.scalars().all()

    return [
        AuditLogEntry(
            id=log.id,
            parcel_tracking_number=log.parcel.tracking_number if log.parcel else None,
            clerk_name=log.clerk.full_name if log.clerk else None,
            previous_status=log.previous_status,
            new_status=log.new_status,
            note=log.note,
            occurred_at=log.occurred_at,
        )
        for log in logs
    ]


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

    # Load company to get the configurable SLA threshold
    sla_days = 2  # fallback for super_admin (cross-company view)
    if current_user.role == UserRole.company_admin:
        company_result = await db.execute(
            select(Company).where(Company.id == current_user.company_id)
        )
        company_obj = company_result.scalar_one_or_none()
        if company_obj is not None:
            sla_days = company_obj.sla_threshold_days

    stmt = select(Parcel).where(
        Parcel.created_at >= seven_days_ago,
        Parcel.status.in_([ParcelStatus.arrived, ParcelStatus.picked_up]),
        Parcel.arrived_at.isnot(None),
    )
    if current_user.role == UserRole.company_admin:
        stmt = stmt.where(Parcel.company_id == current_user.company_id)

    result = await db.execute(stmt)
    parcels = result.scalars().all()

    threshold_seconds = sla_days * 24 * 3600
    total = len(parcels)
    on_time = sum(
        1
        for p in parcels
        if p.arrived_at and (p.arrived_at - p.created_at).total_seconds() <= threshold_seconds
    )
    late = total - on_time
    on_time_pct = round(on_time / total * 100, 1) if total > 0 else 0.0

    await send_sla_report_email(
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


# ── Subscription plan management (super_admin only) ───────────────────────────


class PlanCreate(BaseModel):
    name: str
    max_vehicles: int | None = None  # None = unlimited
    price_ghs_month: float
    price_ghs_annual: float
    sort_order: int = 0


class PlanUpdate(BaseModel):
    name: str | None = None
    max_vehicles: int | None = None
    price_ghs_month: float | None = None
    price_ghs_annual: float | None = None
    sort_order: int | None = None
    is_active: bool | None = None


class PlanResponse(BaseModel):
    id: int
    name: str
    max_vehicles: int | None
    price_ghs_month: float
    price_ghs_annual: float
    is_active: bool
    sort_order: int

    model_config = {"from_attributes": True}

    @classmethod
    def from_orm(cls, plan: SubscriptionPlan) -> "PlanResponse":
        return cls(
            id=plan.id,
            name=plan.name,
            max_vehicles=plan.max_vehicles,
            price_ghs_month=float(plan.price_ghs_month),
            price_ghs_annual=float(plan.price_ghs_annual),
            is_active=plan.is_active,
            sort_order=plan.sort_order,
        )


@router.get(
    "/plans",
    response_model=list[PlanResponse],
    dependencies=[Depends(require_role(UserRole.super_admin))],
)
async def list_plans_admin(db: AsyncSession = Depends(get_db)):
    """super_admin: list all plans including inactive ones."""
    result = await db.execute(select(SubscriptionPlan).order_by(SubscriptionPlan.sort_order))
    return [PlanResponse.from_orm(p) for p in result.scalars().all()]


@router.post(
    "/plans",
    response_model=PlanResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_role(UserRole.super_admin))],
)
async def create_plan(body: PlanCreate, db: AsyncSession = Depends(get_db)):
    plan = SubscriptionPlan(
        name=body.name,
        max_vehicles=body.max_vehicles,
        price_ghs_month=body.price_ghs_month,
        price_ghs_annual=body.price_ghs_annual,
        sort_order=body.sort_order,
        is_active=True,
    )
    db.add(plan)
    await db.commit()
    await db.refresh(plan)
    return PlanResponse.from_orm(plan)


@router.patch(
    "/plans/{plan_id}",
    response_model=PlanResponse,
    dependencies=[Depends(require_role(UserRole.super_admin))],
)
async def update_plan(plan_id: int, body: PlanUpdate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(SubscriptionPlan).where(SubscriptionPlan.id == plan_id))
    plan = result.scalar_one_or_none()
    if plan is None:
        raise HTTPException(status_code=404, detail="Plan not found.")
    if body.name is not None:
        plan.name = body.name
    if body.max_vehicles is not None:
        plan.max_vehicles = body.max_vehicles
    if body.price_ghs_month is not None:
        plan.price_ghs_month = body.price_ghs_month
    if body.price_ghs_annual is not None:
        plan.price_ghs_annual = body.price_ghs_annual
    if body.sort_order is not None:
        plan.sort_order = body.sort_order
    if body.is_active is not None:
        plan.is_active = body.is_active
    db.add(plan)
    await db.commit()
    await db.refresh(plan)
    return PlanResponse.from_orm(plan)


@router.delete(
    "/plans/{plan_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_role(UserRole.super_admin))],
)
async def deactivate_plan(plan_id: int, db: AsyncSession = Depends(get_db)):
    """Soft-delete: sets is_active=False. Companies on this plan keep it until renewal."""
    result = await db.execute(select(SubscriptionPlan).where(SubscriptionPlan.id == plan_id))
    plan = result.scalar_one_or_none()
    if plan is None:
        raise HTTPException(status_code=404, detail="Plan not found.")
    plan.is_active = False
    db.add(plan)
    await db.commit()


# ── Company billing override (super_admin only) ───────────────────────────────


class BillingOverrideRequest(BaseModel):
    subscription_status: str | None = None
    current_period_end: datetime | None = None
    subscription_plan_id: int | None = None


@router.get(
    "/companies/{company_id}/billing",
    dependencies=[Depends(require_role(UserRole.super_admin))],
)
async def get_company_billing(company_id: int, db: AsyncSession = Depends(get_db)):
    """super_admin: view full billing state for any company."""
    result = await db.execute(
        select(Company)
        .where(Company.id == company_id)
        .options(selectinload(Company.subscription_plan))
    )
    company = result.scalar_one_or_none()
    if company is None:
        raise HTTPException(status_code=404, detail="Company not found.")
    plan = company.subscription_plan
    return {
        "company_id": company.id,
        "company_name": company.name,
        "subscription_status": company.subscription_status,
        "plan_name": plan.name if plan else None,
        "billing_cycle": company.billing_cycle,
        "trial_ends_at": company.trial_ends_at,
        "current_period_end": company.current_period_end,
        "has_payment_method": bool(company.paystack_auth_code),
        "has_subaccount": bool(company.paystack_subaccount_code),
    }


@router.post(
    "/companies/{company_id}/billing/override",
    dependencies=[Depends(require_role(UserRole.super_admin))],
)
async def override_company_billing(
    company_id: int,
    body: BillingOverrideRequest,
    db: AsyncSession = Depends(get_db),
):
    """super_admin: manually override subscription status or period end (e.g. extend trial)."""
    VALID_STATUSES = {"trialing", "active", "grace", "suspended", "cancelled"}
    if body.subscription_status and body.subscription_status not in VALID_STATUSES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid status. Must be one of: {VALID_STATUSES}",
        )

    result = await db.execute(select(Company).where(Company.id == company_id))
    company = result.scalar_one_or_none()
    if company is None:
        raise HTTPException(status_code=404, detail="Company not found.")

    if body.subscription_status:
        company.subscription_status = body.subscription_status
    if body.current_period_end is not None:
        company.current_period_end = body.current_period_end
    if body.subscription_plan_id is not None:
        company.subscription_plan_id = body.subscription_plan_id

    db.add(company)
    await db.commit()
    return {"message": "Billing override applied.", "company_id": company_id}


# ── Platform config (super_admin only) ────────────────────────────────────────


class PlatformConfigResponse(BaseModel):
    billing_mode: str
    ticket_fee_ghs: float
    parcel_fee_ghs: float


class PlatformConfigUpdate(BaseModel):
    billing_mode: str | None = None  # "subscription" | "per_transaction"
    ticket_fee_ghs: float | None = None
    parcel_fee_ghs: float | None = None


_VALID_BILLING_MODES = {"subscription", "per_transaction"}


@router.get(
    "/platform-config",
    response_model=PlatformConfigResponse,
    dependencies=[Depends(require_role(UserRole.super_admin))],
)
async def get_platform_config_endpoint(db: AsyncSession = Depends(get_db)):
    """Return the current platform-wide billing configuration."""
    from app.services.transaction_fee_service import get_platform_config

    config = await get_platform_config(db)
    return PlatformConfigResponse(
        billing_mode=config.billing_mode,
        ticket_fee_ghs=float(config.ticket_fee_ghs),
        parcel_fee_ghs=float(config.parcel_fee_ghs),
    )


@router.patch(
    "/platform-config",
    response_model=PlatformConfigResponse,
    dependencies=[Depends(require_role(UserRole.super_admin))],
)
async def update_platform_config(
    body: PlatformConfigUpdate,
    db: AsyncSession = Depends(get_db),
):
    """Update platform billing mode and/or per-transaction fee amounts."""
    from app.services.transaction_fee_service import (
        get_platform_config,
        invalidate_config_cache,
    )

    if body.billing_mode is not None and body.billing_mode not in _VALID_BILLING_MODES:
        raise HTTPException(
            status_code=400,
            detail=f"billing_mode must be one of: {_VALID_BILLING_MODES}",
        )
    if body.ticket_fee_ghs is not None and body.ticket_fee_ghs < 0:
        raise HTTPException(status_code=400, detail="ticket_fee_ghs must be non-negative")
    if body.parcel_fee_ghs is not None and body.parcel_fee_ghs < 0:
        raise HTTPException(status_code=400, detail="parcel_fee_ghs must be non-negative")

    config = await get_platform_config(db)
    if body.billing_mode is not None:
        config.billing_mode = body.billing_mode
    if body.ticket_fee_ghs is not None:
        config.ticket_fee_ghs = body.ticket_fee_ghs  # type: ignore[assignment]
    if body.parcel_fee_ghs is not None:
        config.parcel_fee_ghs = body.parcel_fee_ghs  # type: ignore[assignment]
    db.add(config)
    await db.commit()
    await db.refresh(config)

    # Invalidate in-process cache so next requests pick up the new values
    invalidate_config_cache()

    return PlatformConfigResponse(
        billing_mode=config.billing_mode,
        ticket_fee_ghs=float(config.ticket_fee_ghs),
        parcel_fee_ghs=float(config.parcel_fee_ghs),
    )


# ── Per-transaction fee summaries (super_admin only) ──────────────────────────


class TransactionFeeInvoiceItem(BaseModel):
    id: int
    period_date: str
    amount_ghs: float
    fee_count: int
    status: str
    paid_at: datetime | None


class CompanyTransactionFeeSummary(BaseModel):
    pending_amount_ghs: float
    pending_count: int
    total_charged_ghs: float
    invoices: list[TransactionFeeInvoiceItem]


class PlatformFeeRow(BaseModel):
    company_id: int
    company_name: str
    pending_ghs: float
    charged_ghs: float


@router.get(
    "/companies/{company_id}/transaction-fees",
    response_model=CompanyTransactionFeeSummary,
    dependencies=[Depends(require_role(UserRole.super_admin))],
)
async def get_company_transaction_fees(
    company_id: int,
    db: AsyncSession = Depends(get_db),
):
    """super_admin: view transaction fee summary for a specific company."""
    from app.models.transaction_fee import TransactionFee, TransactionInvoice

    company_result = await db.execute(select(Company).where(Company.id == company_id))
    if company_result.scalar_one_or_none() is None:
        raise HTTPException(status_code=404, detail="Company not found.")

    pending_result = await db.execute(
        select(
            func.sum(TransactionFee.amount_ghs).label("total"),
            func.count().label("cnt"),
        ).where(
            TransactionFee.company_id == company_id,
            TransactionFee.status == "pending",
        )
    )
    pending_row = pending_result.one()

    charged_result = await db.execute(
        select(func.sum(TransactionFee.amount_ghs)).where(
            TransactionFee.company_id == company_id,
            TransactionFee.status == "charged",
        )
    )
    total_charged = charged_result.scalar_one() or 0

    invoices_result = await db.execute(
        select(TransactionInvoice)
        .where(TransactionInvoice.company_id == company_id)
        .order_by(TransactionInvoice.created_at.desc())
        .limit(50)
    )
    invoices = invoices_result.scalars().all()

    return CompanyTransactionFeeSummary(
        pending_amount_ghs=float(pending_row.total or 0),
        pending_count=int(pending_row.cnt or 0),
        total_charged_ghs=float(total_charged),
        invoices=[
            TransactionFeeInvoiceItem(
                id=inv.id,
                period_date=str(inv.period_date),
                amount_ghs=float(inv.amount_ghs),
                fee_count=inv.fee_count,
                status=inv.status,
                paid_at=inv.paid_at,
            )
            for inv in invoices
        ],
    )


@router.get(
    "/transaction-fees/summary",
    response_model=list[PlatformFeeRow],
    dependencies=[Depends(require_role(UserRole.super_admin))],
)
async def get_platform_transaction_fee_summary(db: AsyncSession = Depends(get_db)):
    """super_admin: platform-wide pending and charged fee totals grouped by company."""
    from sqlalchemy import case

    from app.models.transaction_fee import TransactionFee

    rows = await db.execute(
        select(
            TransactionFee.company_id,
            Company.name.label("company_name"),
            func.sum(
                case((TransactionFee.status == "pending", TransactionFee.amount_ghs), else_=0)
            ).label("pending_ghs"),
            func.sum(
                case((TransactionFee.status == "charged", TransactionFee.amount_ghs), else_=0)
            ).label("charged_ghs"),
        )
        .join(Company, Company.id == TransactionFee.company_id)
        .group_by(TransactionFee.company_id, Company.name)
        .order_by(Company.name)
    )

    return [
        PlatformFeeRow(
            company_id=row.company_id,
            company_name=row.company_name,
            pending_ghs=float(row.pending_ghs or 0),
            charged_ghs=float(row.charged_ghs or 0),
        )
        for row in rows.all()
    ]
