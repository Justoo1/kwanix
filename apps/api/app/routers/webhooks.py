"""
Payment provider webhook handlers.
Each webhook is verified with HMAC before processing.
Idempotency is enforced via the payment_events table.

Failed payloads are persisted to webhook_events for later replay.
"""

import contextlib
import json
import traceback
from datetime import UTC, datetime

import structlog
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.config import settings
from app.database import get_db
from app.integrations.email import send_ticket_email
from app.integrations.paystack import verify_paystack_signature
from app.middleware.rate_limit import limiter
from app.models.company import Company
from app.models.parcel import Parcel
from app.models.payment_event import PaymentEvent
from app.models.subscription import SubscriptionInvoice
from app.models.ticket import PaymentStatus, Ticket
from app.models.trip import Trip
from app.models.webhook_event import WebhookEvent
from app.services.billing_service import _process_subscription_payment

logger = structlog.get_logger()

router = APIRouter()

MAX_REPLAY_ATTEMPTS = 3


async def _process_paystack_payload(payload: dict, db: AsyncSession) -> str:
    """Core processing logic, extracted so it can be called from replay endpoint."""
    event_id = payload.get("id") or payload.get("data", {}).get("id")
    event_type = payload.get("event", "unknown")

    if not event_id:
        return "ignored"

    # Idempotency check
    existing = await db.execute(
        select(PaymentEvent).where(PaymentEvent.provider_event_id == str(event_id))
    )
    if existing.scalar_one_or_none():
        return "already_processed"

    payment_status = "success" if event_type == "charge.success" else "failed"
    payment_ref = payload.get("data", {}).get("reference")

    # ── Check if this reference belongs to a subscription invoice first ────────
    if payment_ref and event_type == "charge.success":
        inv_result = await db.execute(
            select(SubscriptionInvoice)
            .where(SubscriptionInvoice.paystack_reference == payment_ref)
            .options(selectinload(SubscriptionInvoice.company))
        )
        sub_invoice = inv_result.scalar_one_or_none()
        if sub_invoice and sub_invoice.status != "paid":
            # Phase 1 — commit dedup sentinel in its own transaction so it
            # survives a crash during processing and blocks webhook retries.
            from app.database import SessionLocal  # noqa: PLC0415

            async with SessionLocal() as sentinel_session:
                sentinel_event = PaymentEvent(
                    ticket_id=None,
                    provider_event_id=str(event_id),
                    provider="paystack",
                    event_type=event_type,
                    status=payment_status,
                    raw_payload=json.dumps(payload),
                    received_at=datetime.now(UTC),
                )
                sentinel_session.add(sentinel_event)
                await sentinel_session.commit()

            # Phase 2 — process the payment in the original session.
            try:
                await _process_subscription_payment(sub_invoice, payload, db)
                await db.commit()
            except Exception:  # noqa: BLE001
                await db.rollback()
                raise

            return "processed_subscription"

    # ── Check if this reference belongs to a parcel MoMo payment ────────────────
    if payment_ref and payment_ref.startswith("KX-PAR-"):
        parcel_result = await db.execute(select(Parcel).where(Parcel.payment_ref == payment_ref))
        parcel = parcel_result.scalar_one_or_none()
        if parcel:
            if event_type == "charge.success":
                parcel.fee_payment_status = "paid"
            elif event_type == "charge.failed":
                parcel.fee_payment_status = "failed"
            db.add(parcel)
            event = PaymentEvent(
                ticket_id=None,
                provider_event_id=str(event_id),
                provider="paystack",
                event_type=event_type,
                status=payment_status,
                raw_payload=json.dumps(payload),
                received_at=datetime.now(UTC),
            )
            db.add(event)
            await db.commit()
            return "processed_parcel"

    ticket = None
    if payment_ref:
        result = await db.execute(select(Ticket).where(Ticket.payment_ref == payment_ref))
        ticket = result.scalar_one_or_none()

    if ticket and event_type == "charge.success":
        ticket.payment_status = PaymentStatus.paid
        ticket.booking_expires_at = None

        # Email receipt to passenger in the background (fire-and-forget)
        if ticket.passenger_email:
            try:
                trip_result = await db.execute(
                    select(Trip)
                    .where(Trip.id == ticket.trip_id)
                    .options(
                        selectinload(Trip.departure_station),
                        selectinload(Trip.destination_station),
                    )
                )
                trip_obj = trip_result.scalar_one_or_none()
                company_result = await db.execute(
                    select(Company).where(Company.id == ticket.company_id)
                )
                company_obj = company_result.scalar_one_or_none()
                if trip_obj and company_obj:
                    route = (
                        f"{trip_obj.departure_station.name} → {trip_obj.destination_station.name}"
                    )
                    departure_str = trip_obj.departure_time.strftime("%d %b %Y %H:%M")
                    await send_ticket_email(
                        passenger_name=ticket.passenger_name,
                        passenger_email=ticket.passenger_email,
                        trip_route=route,
                        departure_time=departure_str,
                        seat_number=ticket.seat_number,
                        fare_ghs=float(ticket.fare_ghs),
                        payment_ref=ticket.payment_ref,
                        company_name=company_obj.name,
                    )
            except Exception as exc:  # noqa: BLE001
                # Email errors must never fail payment processing, but log
                # them so Sentry surfaces delivery problems.
                logger.warning(
                    "webhook.ticket_email_failed",
                    ticket_id=ticket.id,
                    error=str(exc),
                )

    elif ticket and event_type == "charge.failed":
        ticket.payment_status = PaymentStatus.failed

    event = PaymentEvent(
        ticket_id=ticket.id if ticket else None,
        provider_event_id=str(event_id),
        provider="paystack",
        event_type=event_type,
        status=payment_status,
        raw_payload=json.dumps(payload),
        received_at=datetime.now(UTC),
    )
    db.add(event)
    await db.commit()
    return "processed"


@router.post("/paystack")
@limiter.limit("60/minute")
async def paystack_webhook(request: Request, db: AsyncSession = Depends(get_db)):
    # 0. Reject if Paystack is not configured (only hard-fail in production)
    if not settings.paystack_secret_key and settings.environment == "production":
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail="Payment provider not configured",
        )

    # 1. Verify HMAC signature
    signature = request.headers.get("x-paystack-signature", "")
    body_bytes = await request.body()

    if not verify_paystack_signature(body_bytes, signature, settings.paystack_secret_key):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid signature")

    payload = json.loads(body_bytes)
    event_type = payload.get("event", "unknown")

    # 2. Process — on failure, persist for replay
    try:
        result = await _process_paystack_payload(payload, db)
        return {"status": result}
    except Exception:
        error_detail = traceback.format_exc()
        webhook_event = WebhookEvent(
            event_type=event_type,
            payload=body_bytes.decode(),
            attempts=1,
            last_error=error_detail[-2000:],  # truncate to avoid huge rows
            processed_at=None,
            created_at=datetime.now(UTC),
        )
        db.add(webhook_event)
        with contextlib.suppress(Exception):
            await db.commit()
        return {"status": "queued_for_retry"}
