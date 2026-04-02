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
) -> None:
    """
    Sends an SMS via send_sms() then persists the outcome to sms_logs.

    Designed for use as a FastAPI BackgroundTask — the request-scoped session
    (db) is still live when background tasks run, so we reuse it for the log
    write rather than opening a second connection.
    """
    from app.models.sms_log import SmsLog  # local import avoids circular deps

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
        f"Track it here: {url} - RoutePass"
    )


def msg_parcel_in_transit(plate_number: str, destination: str, tracking_id: str) -> str:
    url = f"{settings.public_app_url}/track/{tracking_id}"
    return (
        f"Good news! Your parcel ({tracking_id}) is on Bus {plate_number} heading to "
        f"{destination}. Track it here: {url} - RoutePass"
    )


def msg_parcel_arrived(station_name: str, otp_code: str, tracking_id: str) -> str:
    return (
        f"Your parcel ({tracking_id}) has arrived at {station_name}. "
        f"Collection code: {otp_code}. Show this to the clerk. - RoutePass"
    )
