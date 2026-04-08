"""Email integration via Resend REST API — uses httpx.AsyncClient."""

import base64

import httpx
import structlog

from app.config import settings

logger = structlog.get_logger()

RESEND_API_URL = "https://api.resend.com/emails"


async def send_sla_report_email(
    to_email: str | None,
    total: int,
    on_time: int,
    late: int,
    on_time_pct: float,
) -> None:
    """Email a parcel delivery SLA summary to the requesting user via Resend.

    Silently skips if RESEND_API_KEY is not configured or to_email is blank.
    All errors are caught and logged — never raises.
    """
    if not to_email:
        return
    if not settings.resend_api_key:
        logger.warning("RESEND_API_KEY not configured — skipping SLA report email")
        return

    body = (
        "RoutePass — Parcel Delivery SLA Report (last 7 days)\n\n"
        f"Total parcels:  {total}\n"
        f"On-time:        {on_time}\n"
        f"Late:           {late}\n"
        f"On-time rate:   {on_time_pct}%\n\n"
        "(SLA definition: parcel arrived within 48 hours of being logged.)\n"
    )

    try:
        payload = {
            "from": settings.resend_from_email,
            "to": [to_email],
            "subject": "RoutePass — Parcel Delivery SLA Report",
            "text": body,
        }

        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(
                RESEND_API_URL,
                json=payload,
                headers={
                    "Authorization": f"Bearer {settings.resend_api_key}",
                    "Content-Type": "application/json",
                },
            )
        response.raise_for_status()
        logger.info("SLA report email sent via Resend", to=to_email)

    except Exception as exc:  # noqa: BLE001
        logger.error("failed to send SLA report email", to=to_email, error=str(exc))


async def send_ticket_email(
    passenger_name: str,
    passenger_email: str,
    trip_route: str,
    departure_time: str,
    seat_number: int,
    fare_ghs: float,
    payment_ref: str | None,
    company_name: str,
) -> None:
    """Email a ticket receipt to the passenger after successful payment.

    Silently skips if RESEND_API_KEY is not configured or passenger_email is blank.
    All errors are caught and logged — never raises.
    """
    if not passenger_email:
        return
    if not settings.resend_api_key:
        logger.warning("RESEND_API_KEY not configured — skipping ticket receipt email")
        return

    html_body = f"""
<html><body style="font-family:sans-serif;max-width:600px;margin:auto;padding:24px">
<h2 style="color:#1a1a1a">{company_name} — Ticket Receipt</h2>
<p>Dear <strong>{passenger_name}</strong>,</p>
<p>Your booking has been confirmed. Here are your travel details:</p>
<table style="border-collapse:collapse;width:100%">
  <tr><td style="padding:8px;border:1px solid #e5e5e5"><strong>Route</strong></td>
      <td style="padding:8px;border:1px solid #e5e5e5">{trip_route}</td></tr>
  <tr><td style="padding:8px;border:1px solid #e5e5e5"><strong>Departure</strong></td>
      <td style="padding:8px;border:1px solid #e5e5e5">{departure_time}</td></tr>
  <tr><td style="padding:8px;border:1px solid #e5e5e5"><strong>Seat</strong></td>
      <td style="padding:8px;border:1px solid #e5e5e5">{seat_number}</td></tr>
  <tr><td style="padding:8px;border:1px solid #e5e5e5"><strong>Fare</strong></td>
      <td style="padding:8px;border:1px solid #e5e5e5">GHS {fare_ghs:.2f}</td></tr>
  {
        f'<tr><td style="padding:8px;border:1px solid #e5e5e5">'
        f"<strong>Reference</strong></td>"
        f'<td style="padding:8px;border:1px solid #e5e5e5">{payment_ref}</td></tr>'
        if payment_ref
        else ""
    }
</table>
<p style="margin-top:24px;color:#555">Thank you for travelling with {company_name}!</p>
</body></html>
"""

    try:
        payload = {
            "from": settings.resend_from_email,
            "to": [passenger_email],
            "subject": f"{company_name} — Your Ticket Receipt",
            "html": html_body,
        }

        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(
                RESEND_API_URL,
                json=payload,
                headers={
                    "Authorization": f"Bearer {settings.resend_api_key}",
                    "Content-Type": "application/json",
                },
            )
        response.raise_for_status()
        logger.info("ticket receipt email sent", to=passenger_email)

    except Exception as exc:  # noqa: BLE001
        logger.error("failed to send ticket receipt email", to=passenger_email, error=str(exc))


async def send_manifest_email(trip_id: int, pdf_bytes: bytes) -> None:
    """Send the trip manifest PDF to settings.manifest_email via Resend.

    Silently skips if RESEND_API_KEY or manifest_email is not configured.
    All errors are caught and logged — never raises.
    """
    if not settings.manifest_email:
        return
    if not settings.resend_api_key:
        logger.warning("manifest_email set but RESEND_API_KEY not configured — skipping email")
        return

    try:
        pdf_b64 = base64.b64encode(pdf_bytes).decode()
        payload = {
            "from": settings.resend_from_email,
            "to": [settings.manifest_email],
            "subject": f"RoutePass — Trip {trip_id} Manifest",
            "text": f"Please find attached the passenger manifest for trip #{trip_id}.",
            "attachments": [
                {
                    "filename": f"manifest-trip-{trip_id}.pdf",
                    "content": pdf_b64,
                }
            ],
        }

        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(
                RESEND_API_URL,
                json=payload,
                headers={
                    "Authorization": f"Bearer {settings.resend_api_key}",
                    "Content-Type": "application/json",
                },
            )
        response.raise_for_status()
        logger.info("manifest email sent via Resend", trip_id=trip_id, to=settings.manifest_email)

    except Exception as exc:  # noqa: BLE001
        logger.error("failed to send manifest email", trip_id=trip_id, error=str(exc))
