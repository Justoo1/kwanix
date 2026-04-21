"""
Arkesel SMS API v2 integration.
Docs: https://developers.arkesel.com/
"""

from datetime import UTC, datetime

import httpx
import structlog
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings

logger = structlog.get_logger()

ARKESEL_URL = "https://sms.arkesel.com/api/v2/sms/send"
ARKESEL_WHATSAPP_URL = "https://sms.arkesel.com/api/v2/whatsapp/send"
ARKESEL_BALANCE_URL = "https://sms.arkesel.com/api/v2/clients/balance-details"


async def send_sms(recipient: str, message: str, event_type: str = "generic") -> dict:
    """
    Sends an SMS via Arkesel v2. recipient must be in 233XXXXXXXXX format.
    Returns the Arkesel API response dict.
    Failures are logged but do not raise — SMS is non-blocking.
    """
    if not settings.arkesel_api_key:
        logger.warning("arkesel.send_sms.skipped", reason="API key not configured")
        return {"status": "skipped"}

    headers = {"api-key": settings.arkesel_api_key}
    payload = {
        "sender": settings.arkesel_sender_id,
        "message": message,
        "recipients": [recipient],
    }

    async with httpx.AsyncClient(timeout=10.0) as client:
        try:
            response = await client.post(ARKESEL_URL, json=payload, headers=headers)
            data = response.json()
            logger.info(
                "arkesel.send_sms.sent",
                event_type=event_type,
                recipient=recipient,
                status=data.get("status"),
            )
            return data
        except Exception as exc:
            logger.error("arkesel.send_sms.failed", event_type=event_type, error=str(exc))
            return {"status": "failed", "error": str(exc)}


async def send_whatsapp(recipient: str, message: str, event_type: str = "generic") -> dict:
    """
    Sends a WhatsApp message via Arkesel. recipient must be in 233XXXXXXXXX format.
    Falls back silently if API key is not configured.
    """
    if not settings.arkesel_api_key:
        logger.warning("arkesel.send_whatsapp.skipped", reason="API key not configured")
        return {"status": "skipped"}

    headers = {"api-key": settings.arkesel_api_key}
    payload = {
        "sender": settings.arkesel_sender_id,
        "message": message,
        "recipients": [recipient],
    }

    async with httpx.AsyncClient(timeout=10.0) as client:
        try:
            response = await client.post(ARKESEL_WHATSAPP_URL, json=payload, headers=headers)
            data = response.json()
            logger.info(
                "arkesel.send_whatsapp.sent",
                event_type=event_type,
                recipient=recipient,
                status=data.get("status"),
            )
            return data
        except Exception as exc:
            logger.error("arkesel.send_whatsapp.failed", event_type=event_type, error=str(exc))
            return {"status": "failed", "error": str(exc)}


async def check_balance() -> dict:
    """Returns the current Arkesel SMS balance."""
    if not settings.arkesel_api_key:
        return {"balance": None}

    headers = {"api-key": settings.arkesel_api_key}
    async with httpx.AsyncClient(timeout=5.0) as client:
        try:
            response = await client.get(ARKESEL_BALANCE_URL, headers=headers)
            return response.json()
        except Exception as exc:
            logger.error("arkesel.check_balance.failed", error=str(exc))
            return {"balance": None, "error": str(exc)}


# ── Logged dispatcher ─────────────────────────────────────────────────────────


async def dispatch_sms(
    db: AsyncSession,
    parcel_id: int | None,
    recipient: str,
    message: str,
    event_type: str,
    sms_opt_out: bool = False,
    whatsapp_opt_in: bool = False,
) -> None:
    """
    Sends an SMS via send_sms() then persists the outcome to sms_logs.

    Designed for use as a FastAPI BackgroundTask — the request-scoped session
    (db) is still live when background tasks run, so we reuse it for the log
    write rather than opening a second connection.
    """
    from app.models.sms_log import SmsLog  # local import avoids circular deps

    if sms_opt_out:
        logger.info("arkesel.dispatch_sms.skipped", reason="sms_opt_out", event_type=event_type)
        return

    if whatsapp_opt_in:
        await send_whatsapp(recipient, message, event_type)

    result = await send_sms(recipient, message, event_type)

    raw_status = result.get("status", "failed")
    # Arkesel returns "success" on delivery; treat "skipped" (no API key) as its own status
    if raw_status == "skipped":
        log_status = "skipped"
    elif raw_status == "success":
        log_status = "success"
    else:
        log_status = "failed"

    # Arkesel v2 response: {"status": "success", "data": [{"recipient": "...", "id": "..."}]}
    data = result.get("data")
    arkesel_message_id = None
    if isinstance(data, list) and data:
        arkesel_message_id = data[0].get("id")

    log = SmsLog(
        parcel_id=parcel_id,
        event_type=event_type,
        recipient_phone=recipient,
        message=message,
        status=log_status,
        arkesel_message_id=arkesel_message_id,
        error_detail=result.get("error"),
        sent_at=datetime.now(UTC),
    )
    db.add(log)
    await db.commit()


# ── SMS message templates ─────────────────────────────────────────────────────


def msg_parcel_logged(sender_name: str, destination: str, tracking_id: str) -> str:
    url = f"{settings.public_app_url}/track/{tracking_id}"
    return (
        f"Hi! A parcel from {sender_name} has been logged for {destination}. "
        f"Track it here: {url} - Kwanix"
    )


def msg_parcel_in_transit(plate_number: str, destination: str, tracking_id: str) -> str:
    url = f"{settings.public_app_url}/track/{tracking_id}"
    return (
        f"Good news! Your parcel ({tracking_id}) is on Bus {plate_number} heading to "
        f"{destination}. Track it here: {url} - Kwanix"
    )


def msg_parcel_arrived(station_name: str, otp_code: str, tracking_id: str) -> str:
    return (
        f"Your parcel ({tracking_id}) has arrived at {station_name}. "
        f"Collection code: {otp_code}. Show this to the clerk. - Kwanix"
    )


def msg_parcel_returned(tracking_id: str) -> str:
    return (
        f"Your parcel ({tracking_id}) could not be delivered and has been returned to the sender. "
        f"Please contact your station for more information. - Kwanix"
    )


def msg_parcel_return_sender(tracking_id: str, reason: str | None) -> str:
    base = (
        f"Your parcel ({tracking_id}) has been returned to the origin station. "
        f"Please visit the station to arrange re-collection."
    )
    if reason:
        base += f" Reason: {reason}."
    return base + " - Kwanix"


def msg_parcel_pickup_reminder(tracking_id: str, station_name: str) -> str:
    return (
        f"Reminder: your parcel ({tracking_id}) is waiting for collection at "
        f"{station_name}. Please collect it at your earliest convenience. - Kwanix"
    )


def msg_trip_loading(plate_number: str, from_station: str, departure_time: str) -> str:
    return (
        f"Your bus {plate_number} is now loading at {from_station}. "
        f"Departure is scheduled for {departure_time}. Please proceed to the station. - Kwanix"
    )


def msg_trip_departed(plate_number: str, from_station: str, eta_str: str | None = None) -> str:
    msg = f"Your bus {plate_number} has departed {from_station}."
    if eta_str:
        msg += f" ETA approx {eta_str}."
    msg += " - Kwanix"
    return msg


def msg_trip_arrived(destination: str) -> str:
    return (
        f"Your bus has arrived at {destination}. "
        "Please proceed to collect your luggage. - Kwanix"
    )


def msg_bus_approaching(destination: str, eta_minutes: int) -> str:
    return (
        f"Your bus is approximately {eta_minutes} minutes from {destination}. "
        f"Please make your way to the arrival point. - Kwanix"
    )


def msg_live_tracking_link(from_station: str, to_station: str, url: str) -> str:
    return f"Track your {from_station}→{to_station} bus live: {url} - Kwanix"


def msg_trip_reminder(
    passenger_name: str, from_station: str, to_station: str, departure_time: str
) -> str:
    first = passenger_name.split()[0] if passenger_name else "Passenger"
    return (
        f"Hi {first}, reminder: your trip from {from_station} to {to_station} departs at "
        f"{departure_time}. Please arrive 30 minutes early. - Kwanix"
    )
