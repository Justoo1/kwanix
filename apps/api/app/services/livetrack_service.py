"""
LiveTrack background services.

run_dead_vehicle_sweeper — runs every 10 minutes, SMS-alerts company admin
  when a departed vehicle has gone GPS-silent for more than 15 minutes.
"""

import asyncio
from datetime import UTC, datetime, timedelta

import structlog
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker
from sqlalchemy.orm import selectinload

from app.integrations import arkesel
from app.models.sms_log import SmsLog
from app.models.trip import Trip, TripStatus
from app.models.user import User, UserRole
from app.models.vehicle import Vehicle

logger = structlog.get_logger()

_SWEEP_INTERVAL_SECONDS = 600   # 10 minutes
_DEAD_THRESHOLD_MINUTES = 15
_ALERT_COOLDOWN_MINUTES = 60    # don't re-alert for the same trip within 1 hour


async def run_dead_vehicle_sweeper(session_factory: async_sessionmaker) -> None:
    """
    Periodic task: alert the company admin by SMS when a vehicle on a departed trip
    has stopped reporting GPS for more than 15 minutes.

    Fires at most once per hour per trip to avoid SMS spam.
    """
    while True:
        await asyncio.sleep(_SWEEP_INTERVAL_SECONDS)
        try:
            await _sweep_once(session_factory)
        except Exception:
            logger.exception("livetrack.dead_vehicle_sweeper.error")


async def _sweep_once(session_factory: async_sessionmaker) -> None:
    now = datetime.now(UTC)
    dead_threshold = now - timedelta(minutes=_DEAD_THRESHOLD_MINUTES)
    cooldown_threshold = now - timedelta(minutes=_ALERT_COOLDOWN_MINUTES)

    async with session_factory() as db:
        # Load all departed trips (across all companies — no RLS needed here)
        trip_result = await db.execute(
            select(Trip)
            .where(Trip.status == TripStatus.departed)
            .options(
                selectinload(Trip.vehicle),
                selectinload(Trip.departure_station),
                selectinload(Trip.destination_station),
                selectinload(Trip.company),
            )
        )
        trips = trip_result.scalars().all()

        for trip in trips:
            v = trip.vehicle
            if v is None:
                continue

            # Check if GPS is stale
            if v.last_gps_update is not None and v.last_gps_update > dead_threshold:
                continue  # GPS is fresh — no alert needed

            # Determine how long it's been silent
            if v.last_gps_update is None:
                # Never updated — use trip updated_at as proxy
                silent_since = trip.updated_at
            else:
                silent_since = v.last_gps_update

            # Check cooldown: has an alert been sent for this trip in the last hour?
            log_result = await db.execute(
                select(SmsLog)
                .where(
                    SmsLog.event_type == "dead_vehicle_alert",
                    SmsLog.parcel_id == trip.id,  # repurposed field as trip_id
                    SmsLog.sent_at >= cooldown_threshold,
                )
                .limit(1)
            )
            recent_alert = log_result.scalar_one_or_none()
            if recent_alert is not None:
                continue  # Already alerted recently

            # Find company admin phone number
            admin_result = await db.execute(
                select(User).where(
                    User.company_id == trip.company_id,
                    User.role == UserRole.company_admin,
                    User.is_active.is_(True),
                )
            )
            admin = admin_result.scalars().first()
            if admin is None or not admin.phone:
                continue

            dep = trip.departure_station.name if trip.departure_station else "?"
            dst = trip.destination_station.name if trip.destination_station else "?"
            plate = v.plate_number
            silent_minutes = int((now - silent_since).total_seconds() / 60)

            message = (
                f"[Kwanix Alert] Vehicle {plate} ({dep}→{dst}) has not updated GPS "
                f"for {silent_minutes} minutes. Please check driver connection. - Kwanix"
            )

            result = await arkesel.send_sms(admin.phone, message, "dead_vehicle_alert")
            raw_status = result.get("status", "failed")
            log_status = "success" if raw_status == "success" else (
                "skipped" if raw_status == "skipped" else "failed"
            )

            # Log using parcel_id column as a repurposed trip reference for cooldown check
            log = SmsLog(
                parcel_id=trip.id,
                event_type="dead_vehicle_alert",
                recipient_phone=admin.phone,
                message=message,
                status=log_status,
                sent_at=now,
            )
            db.add(log)

        await db.commit()
        logger.info("livetrack.dead_vehicle_sweeper.completed", trips_checked=len(trips))
