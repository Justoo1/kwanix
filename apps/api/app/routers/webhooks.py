"""
Payment provider webhook handlers.
Each webhook is verified with HMAC before processing.
Idempotency is enforced via the payment_events table.
"""

import hashlib
import hmac
import json
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.models.payment_event import PaymentEvent
from app.models.ticket import PaymentStatus, Ticket

router = APIRouter()


@router.post("/paystack")
async def paystack_webhook(request: Request, db: AsyncSession = Depends(get_db)):
    # 1. Verify HMAC signature
    signature = request.headers.get("x-paystack-signature", "")
    body_bytes = await request.body()

    expected = hmac.new(
        settings.paystack_secret_key.encode(),
        body_bytes,
        hashlib.sha512,
    ).hexdigest()

    if not hmac.compare_digest(expected, signature):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid signature")

    payload = json.loads(body_bytes)
    event_id = payload.get("id") or payload.get("data", {}).get("id")
    event_type = payload.get("event", "unknown")

    if not event_id:
        return {"status": "ignored", "reason": "no event id"}

    # 2. Idempotency check
    existing = await db.execute(
        select(PaymentEvent).where(PaymentEvent.provider_event_id == str(event_id))
    )
    if existing.scalar_one_or_none():
        return {"status": "already_processed"}

    # 3. Process
    payment_status = "success" if event_type == "charge.success" else "failed"
    payment_ref = payload.get("data", {}).get("reference")

    ticket = None
    if payment_ref:
        result = await db.execute(select(Ticket).where(Ticket.payment_ref == payment_ref))
        ticket = result.scalar_one_or_none()

    if ticket and event_type == "charge.success":
        ticket.payment_status = PaymentStatus.paid
    elif ticket and event_type == "charge.failed":
        ticket.payment_status = PaymentStatus.failed

    # 4. Record event
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

    return {"status": "processed"}
