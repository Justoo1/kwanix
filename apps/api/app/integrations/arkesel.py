"""
Arkesel SMS API v2 integration.
Docs: https://developers.arkesel.com/
"""


import httpx
import structlog

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


# ── SMS message templates ─────────────────────────────────────────────────────


def msg_parcel_logged(sender_name: str, destination: str, tracking_id: str) -> str:
    return (
        f"Hi! A parcel from {sender_name} has been logged for {destination}. "
        f"Track it with ID: {tracking_id}. - RoutePass"
    )


def msg_parcel_in_transit(plate_number: str, destination: str, tracking_id: str) -> str:
    return (
        f"Good news! Your parcel ({tracking_id}) is on Bus {plate_number} heading to "
        f"{destination}. - RoutePass"
    )


def msg_parcel_arrived(station_name: str, otp_code: str, tracking_id: str) -> str:
    return (
        f"Your parcel ({tracking_id}) has arrived at {station_name}. "
        f"Collection code: {otp_code}. Show this to the clerk. - RoutePass"
    )
