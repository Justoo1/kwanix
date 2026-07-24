"""
Automatic SMS pickup/departure reminders.

run_trip_reminder_sweeper — runs every 10 minutes, SMS-reminds passengers
  of trips departing within REMINDER_WINDOW_HOURS hours (idempotent per
  ticket via Ticket.reminder_sent_at). The reminder references the
  passenger's actual pickup point (station + time) when one was selected,
  falling back to the trip's departure station/time otherwise.
"""

import asyncio
from datetime import UTC, datetime, timedelta

import structlog
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker
from sqlalchemy.orm import selectinload

from app.integrations.arkesel import dispatch_sms, msg_trip_reminder
from app.models.ticket import TicketStatus
from app.models.trip import Trip, TripStatus, TripStop
from app.services.pickup_service import resolve_pickup

logger = structlog.get_logger()

_SWEEP_INTERVAL_SECONDS = 600  # 10 minutes
REMINDER_WINDOW_HOURS = 2


async def run_trip_reminder_sweeper(session_factory: async_sessionmaker) -> None:
    """Periodic task: send departure/pickup reminders for trips in the next reminder window."""
    while True:
        await asyncio.sleep(_SWEEP_INTERVAL_SECONDS)
        try:
            async with session_factory() as db:
                await send_due_reminders(db)
        except Exception:
            logger.exception("trip_reminder_sweeper.error")


async def send_due_reminders(db: AsyncSession, company_id: int | None = None) -> tuple[int, int]:
    """
    Send SMS reminders for tickets on trips departing within REMINDER_WINDOW_HOURS.
    Idempotent: skips tickets that already have reminder_sent_at set.
    Commits internally. Returns (reminders_sent, trips_checked).
    """
    now = datetime.now(UTC)
    window_end = now + timedelta(hours=REMINDER_WINDOW_HOURS)

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
            selectinload(Trip.stops).selectinload(TripStop.station),
        )
    )
    if company_id is not None:
        stmt = stmt.where(Trip.company_id == company_id)

    result = await db.execute(stmt)
    trips = result.scalars().all()

    reminders_sent = 0
    now_ts = datetime.now(UTC)

    for trip in trips:
        to_name = trip.destination_station.name if trip.destination_station else str(
            trip.destination_station_id
        )
        default_from_name = (
            trip.departure_station.name
            if trip.departure_station
            else str(trip.departure_station_id)
        )

        for ticket in trip.tickets:
            if ticket.status == TicketStatus.cancelled:
                continue
            if ticket.reminder_sent_at is not None:
                continue

            pickup_name, pickup_time = resolve_pickup(ticket, trip)
            from_name = pickup_name or default_from_name
            departure_dt = pickup_time or trip.departure_time
            departure_str = departure_dt.strftime("%H:%M")

            ticket.reminder_sent_at = now_ts
            message = msg_trip_reminder(ticket.passenger_name, from_name, to_name, departure_str)
            await dispatch_sms(db, None, ticket.passenger_phone, message, "trip_reminder")
            reminders_sent += 1

    await db.commit()
    return reminders_sent, len(trips)
