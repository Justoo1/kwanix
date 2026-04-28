"""
Public tracking endpoint — no authentication required.
Returns a sanitized view of the parcel status (no OTP, no internal IDs).
"""

from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.config import settings
from app.database import get_db
from app.middleware.rate_limit import limiter
from app.models.parcel import Parcel, ParcelLog, ParcelStatus
from app.models.trip import Trip

router = APIRouter()


class PublicParcelStatus(BaseModel):
    tracking_number: str
    status: str
    origin: str
    destination: str
    bus_plate: str | None = None
    last_updated: str
    return_reason: str | None = None
    # Station coordinates for map rendering (null if not configured)
    origin_lat: float | None = None
    origin_lng: float | None = None
    destination_lat: float | None = None
    destination_lng: float | None = None
    # Vehicle GPS (null if not available or stale)
    vehicle_lat: float | None = None
    vehicle_lng: float | None = None
    # Trip context for AI insight
    departure_time: str | None = None
    trip_status: str | None = None

    model_config = {"from_attributes": True}


class AIInsightResponse(BaseModel):
    message: str
    eta: str | None = None


class ChatRequest(BaseModel):
    message: str


class ChatResponse(BaseModel):
    reply: str


@router.get("/{tracking_id}", response_model=PublicParcelStatus)
@limiter.limit("100/minute")
async def track_parcel(request: Request, tracking_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Parcel)
        .where(Parcel.tracking_number == tracking_id)
        .options(
            selectinload(Parcel.origin_station),
            selectinload(Parcel.destination_station),
            selectinload(Parcel.current_trip).selectinload(Trip.vehicle),
        )
    )
    parcel = result.scalar_one_or_none()
    if parcel is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tracking ID not found")

    bus_plate = None
    if parcel.current_trip and parcel.status == ParcelStatus.arrived:
        bus_plate = parcel.current_trip.vehicle.plate_number

    # Vehicle GPS — only include if fresh (< 5 minutes old) and in transit
    vehicle_lat = None
    vehicle_lng = None
    if (
        parcel.status == ParcelStatus.in_transit
        and parcel.current_trip
        and parcel.current_trip.vehicle
    ):
        vehicle = parcel.current_trip.vehicle
        if vehicle.last_gps_update:
            age_seconds = (datetime.now(UTC) - vehicle.last_gps_update).total_seconds()
            if age_seconds < 300:  # 5 minutes
                vehicle_lat = vehicle.current_latitude
                vehicle_lng = vehicle.current_longitude

    trip = parcel.current_trip
    return PublicParcelStatus(
        tracking_number=parcel.tracking_number,
        status=parcel.status.value,
        origin=parcel.origin_station.name,
        destination=parcel.destination_station.name,
        bus_plate=bus_plate,
        last_updated=parcel.updated_at.isoformat(),
        return_reason=parcel.return_reason if parcel.status == ParcelStatus.returned else None,
        origin_lat=parcel.origin_station.latitude,
        origin_lng=parcel.origin_station.longitude,
        destination_lat=parcel.destination_station.latitude,
        destination_lng=parcel.destination_station.longitude,
        vehicle_lat=vehicle_lat,
        vehicle_lng=vehicle_lng,
        departure_time=trip.departure_time.isoformat() if trip else None,
        trip_status=trip.status.value if trip else None,
    )


@router.get("/{tracking_id}/ai-insight", response_model=AIInsightResponse)
@limiter.limit("10/minute")
async def parcel_ai_insight(request: Request, tracking_id: str, db: AsyncSession = Depends(get_db)):
    """Return an AI-generated natural language status update for the parcel recipient."""
    if not settings.gemini_api_key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="AI insights not configured",
        )

    # Fetch parcel with relationships
    result = await db.execute(
        select(Parcel)
        .where(Parcel.tracking_number == tracking_id)
        .options(
            selectinload(Parcel.origin_station),
            selectinload(Parcel.destination_station),
            selectinload(Parcel.current_trip).selectinload(Trip.vehicle),
        )
    )
    parcel = result.scalar_one_or_none()
    if parcel is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tracking ID not found")

    # Fetch last 5 audit log entries
    log_result = await db.execute(
        select(ParcelLog)
        .where(ParcelLog.parcel_id == parcel.id)
        .order_by(ParcelLog.occurred_at.desc())
        .limit(5)
    )
    logs = log_result.scalars().all()

    # Build compact context for the prompt
    trip = parcel.current_trip

    def _fmt_log(e: ParcelLog) -> str:
        ts = e.occurred_at.strftime("%Y-%m-%d %H:%M")
        prev = e.previous_status or "created"
        note = e.note or ""
        return f"  - {prev} → {e.new_status} at {ts} UTC: {note}"

    log_lines = "\n".join(_fmt_log(e) for e in reversed(logs))

    now_str = datetime.now(UTC).strftime("%Y-%m-%d %H:%M UTC")
    departure_str = (
        trip.departure_time.strftime("%Y-%m-%d %H:%M UTC")
        if trip and trip.departure_time
        else "unknown"
    )
    vehicle_plate = trip.vehicle.plate_number if trip and trip.vehicle else "unknown"

    def _ts(dt: datetime | None) -> str:
        return dt.strftime("%Y-%m-%d %H:%M UTC") if dt else "unknown"

    trip_status_str = trip.status.value if trip else "none"
    created_str = _ts(parcel.created_at)
    loaded_str = _ts(parcel.loaded_at) if parcel.loaded_at else "not yet"
    arrived_str = _ts(parcel.arrived_at) if parcel.arrived_at else "not yet"

    prompt = (
        "You are a helpful parcel tracking assistant for a Ghanaian bus transport company.\n\n"
        f"Current time: {now_str}\n\n"
        f"Parcel {parcel.tracking_number}:\n"
        f"  Route: {parcel.origin_station.name} → {parcel.destination_station.name}\n"
        f"  Status: {parcel.status.value}\n"
        f"  Created: {created_str}\n"
        f"  Loaded onto bus: {loaded_str}\n"
        f"  Arrived at destination: {arrived_str}\n"
        f"  Bus plate: {vehicle_plate}\n"
        f"  Trip departure time: {departure_str}\n"
        f"  Trip status: {trip_status_str}\n"
        f"  Return reason: {parcel.return_reason or 'none'}\n\n"
        "Recent history:\n"
        f"{log_lines or '  (no history yet)'}\n\n"
        "Write a SHORT (2-3 sentence) friendly plain-English update for the person "
        "waiting for this parcel.\n"
        "- If in_transit: mention the bus and give an estimated arrival based on "
        "the departure time (typical Ghana inter-city bus journey is 2-6 hours).\n"
        "- If arrived: tell them to go collect it and remind them they need an OTP "
        "code from an SMS.\n"
        "- If pending: tell them it's been registered and will be loaded soon.\n"
        "- If picked_up: congratulate them.\n"
        "- If returned: explain it was returned and give the reason.\n"
        "Do NOT use markdown, bullet points, or any formatting. "
        "Plain text only. Keep it warm and conversational."
    )

    try:
        from google import genai  # noqa: PLC0415

        client = genai.Client(api_key=settings.gemini_api_key)
        response = await client.aio.models.generate_content(
            model="gemini-2.0-flash-lite",
            contents=prompt,
        )
        message = response.text.strip()
    except Exception as exc:
        # Propagate quota/auth errors so the client knows AI is unavailable
        _raise_if_quota_error(exc)
        # Fall back to a deterministic message if Gemini is unavailable
        message = _fallback_message(parcel)

    # Deterministic ETA extraction
    eta: str | None = None
    if trip and trip.departure_time and parcel.status == ParcelStatus.in_transit:
        eta = trip.departure_time.strftime("Departed at %I:%M %p on %b %d")

    return AIInsightResponse(message=message, eta=eta)


@router.post("/{tracking_id}/chat", response_model=ChatResponse)
@limiter.limit("20/minute")
async def chat_about_parcel(
    request: Request,
    tracking_id: str,
    body: ChatRequest,
    db: AsyncSession = Depends(get_db),
):
    """Answer recipient questions about their parcel using AI."""
    if not settings.gemini_api_key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="AI chat not configured",
        )

    result = await db.execute(
        select(Parcel)
        .where(Parcel.tracking_number == tracking_id)
        .options(
            selectinload(Parcel.origin_station),
            selectinload(Parcel.destination_station),
            selectinload(Parcel.current_trip).selectinload(Trip.vehicle),
        )
    )
    parcel = result.scalar_one_or_none()
    if parcel is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tracking ID not found")

    log_result = await db.execute(
        select(ParcelLog)
        .where(ParcelLog.parcel_id == parcel.id)
        .order_by(ParcelLog.occurred_at.desc())
        .limit(5)
    )
    logs = log_result.scalars().all()

    trip = parcel.current_trip
    now_str = datetime.now(UTC).strftime("%Y-%m-%d %H:%M UTC")
    departure_str = (
        trip.departure_time.strftime("%Y-%m-%d %H:%M UTC")
        if trip and trip.departure_time
        else "unknown"
    )
    vehicle_plate = trip.vehicle.plate_number if trip and trip.vehicle else "unknown"

    def _fmt(e: ParcelLog) -> str:
        ts = e.occurred_at.strftime("%Y-%m-%d %H:%M")
        prev = e.previous_status or "created"
        note = e.note or ""
        return f"  - {prev} → {e.new_status} at {ts} UTC: {note}"

    log_lines = "\n".join(_fmt(e) for e in reversed(logs)) or "  (no history yet)"

    system_context = (
        "You are a helpful parcel tracking assistant for a Ghanaian bus transport company "
        "called Kwanix. Answer the recipient's question about their parcel concisely and "
        "in plain English. Do NOT reveal OTP codes. If you don't know, say so.\n\n"
        f"Current time: {now_str}\n"
        f"Parcel {parcel.tracking_number}:\n"
        f"  Route: {parcel.origin_station.name} → {parcel.destination_station.name}\n"
        f"  Status: {parcel.status.value}\n"
        f"  Bus plate: {vehicle_plate}\n"
        f"  Trip departure: {departure_str}\n"
        f"  Return reason: {parcel.return_reason or 'none'}\n"
        "Recent history:\n"
        f"{log_lines}\n\n"
        "Answer in 1-3 sentences. Plain text only, no markdown."
    )

    prompt = f"{system_context}\n\nRecipient asks: {body.message}"

    try:
        from google import genai  # noqa: PLC0415

        client = genai.Client(api_key=settings.gemini_api_key)
        response = await client.aio.models.generate_content(
            model="gemini-2.0-flash-lite",
            contents=prompt,
        )
        reply = response.text.strip()
    except Exception as exc:
        _raise_if_quota_error(exc)
        reply = _smart_fallback(parcel, body.message)

    return ChatResponse(reply=reply)


def _raise_if_quota_error(exc: BaseException) -> None:
    """Re-raise as HTTP 503 if the Gemini error indicates quota exhaustion."""
    try:
        from google.genai import errors as _ge  # noqa: PLC0415

        if isinstance(exc, _ge.ClientError) and getattr(exc, "status_code", 0) in (429, 503):
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="AI service is temporarily unavailable. Please try again later.",
            ) from exc
    except ImportError:
        pass


def _smart_fallback(parcel: Parcel, question: str) -> str:
    """Question-aware fallback when AI is unavailable."""
    q = question.lower()
    origin = parcel.origin_station.name
    destination = parcel.destination_station.name
    s = parcel.status.value
    trip = parcel.current_trip

    # OTP / collection questions
    if any(w in q for w in ("otp", "code", "collect", "pick up", "pickup", "how do i get")):
        if s == "arrived":
            return (
                f"Your parcel is ready at {destination}. "
                "You should have received an OTP code via SMS — show that to the "
                "station clerk to collect your parcel."
            )
        if s == "picked_up":
            return f"Your parcel has already been collected at {destination}."
        return (
            "You will receive an OTP collection code via SMS once your parcel "
            "arrives at the destination station."
        )

    # Arrival / ETA questions
    eta_words = ("when", "arrive", "arrival", "eta", "time", "long", "how soon", "depart")
    if any(w in q for w in eta_words):
        if s == "arrived":
            return f"Your parcel has already arrived at {destination} and is ready for collection."
        if s == "in_transit":
            plate = ""
            if trip and trip.vehicle:
                plate = f" on bus {trip.vehicle.plate_number}"
            dep = ""
            if trip and trip.departure_time:
                dep = f" It departed at {trip.departure_time.strftime('%I:%M %p on %b %d')}."
            return (
                f"Your parcel is currently in transit{plate} from {origin} to {destination}.{dep} "
                "Inter-city journeys in Ghana typically take 2–6 hours."
            )
        if s == "pending":
            return (
                f"Your parcel is still at {origin} waiting to be loaded onto a bus. "
                "You will get an SMS when it departs."
            )
        return _fallback_message(parcel)

    # Location questions
    loc_words = ("where", "location", "station", "which bus", "bus", "vehicle", "plate")
    if any(w in q for w in loc_words):
        if s == "in_transit":
            plate = ""
            if trip and trip.vehicle:
                plate = f" on bus {trip.vehicle.plate_number}"
            return f"Your parcel is in transit{plate}, travelling from {origin} to {destination}."
        if s == "arrived":
            return f"Your parcel is at {destination} station, waiting for collection."
        if s == "pending":
            return f"Your parcel is currently at {origin} station, not yet loaded."
        return _fallback_message(parcel)

    # Status questions
    if any(w in q for w in ("status", "update", "what", "happening", "progress")):
        return _fallback_message(parcel)

    # Return questions
    if any(w in q for w in ("return", "sent back", "why", "reason")):
        if s == "returned":
            reason = f" Reason given: {parcel.return_reason}." if parcel.return_reason else ""
            return (
                f"Your parcel was returned to {origin}.{reason} "
                "Please contact the station for next steps."
            )
        return "Your parcel has not been returned — " + _fallback_message(parcel)

    # Default
    return _fallback_message(parcel)


def _fallback_message(parcel: Parcel) -> str:
    """Plain-text fallback when AI is unavailable."""
    origin = parcel.origin_station.name
    destination = parcel.destination_station.name
    s = parcel.status.value
    if s == "pending":
        return (
            f"Your parcel has been registered at {origin} and is waiting "
            f"to be loaded onto a bus heading to {destination}."
        )
    if s == "in_transit":
        plate = ""
        if parcel.current_trip and parcel.current_trip.vehicle:
            plate = f" on bus {parcel.current_trip.vehicle.plate_number}"
        return (
            f"Your parcel is currently in transit{plate}, "
            f"on its way from {origin} to {destination}."
        )
    if s == "arrived":
        return (
            f"Your parcel has arrived at {destination} and is ready for collection. "
            "Please visit the station with your OTP collection code."
        )
    if s == "picked_up":
        return f"Your parcel was successfully collected at {destination}. Thank you!"
    if s == "returned":
        reason = f" Reason: {parcel.return_reason}." if parcel.return_reason else ""
        return (
            f"Your parcel has been returned to {origin}.{reason} "
            "Please contact the station for next steps."
        )
    return f"Parcel status: {s}."
