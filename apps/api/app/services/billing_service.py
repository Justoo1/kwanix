"""
Subscription billing business logic.

advance_company_status_if_needed — idempotent lazy status transitions,
    called on every authenticated request from get_db_for_user.

run_subscription_sweeper — sweeps all non-terminal companies once per hour,
    started as a background task in main.py lifespan.

_process_subscription_payment — updates invoice + company on successful charge,
    called from the webhooks router.
"""

import asyncio
from datetime import UTC, datetime, timedelta

import structlog
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.company import Company
from app.models.subscription import SubscriptionInvoice

logger = structlog.get_logger()

# Grace period after trial/subscription expiry before full lockout
GRACE_DAYS = 4


def _grace_deadline(company: Company) -> datetime | None:
    """Return the datetime when the grace period ends (4 days after period/trial expiry)."""
    base = company.current_period_end or company.trial_ends_at
    if base is None:
        return None
    return base + timedelta(days=GRACE_DAYS)


async def advance_company_status_if_needed(company: Company, db: AsyncSession) -> None:
    """
    Idempotently advance the company's subscription_status based on current time.
    Mutates company in-place and commits only when a transition occurs.

    State machine:
      trialing  → grace     (when now > trial_ends_at)
      active    → grace     (when now > current_period_end)
      grace     → suspended (when now > trial/period end + 4 days)
      cancelled → suspended (when now > current_period_end)
    """
    now = datetime.now(UTC)
    changed = False
    old_status = company.subscription_status

    if company.subscription_status == "trialing":
        if company.trial_ends_at and now > company.trial_ends_at:
            company.subscription_status = "grace"
            changed = True

    elif company.subscription_status == "active":
        if company.current_period_end and now > company.current_period_end:
            company.subscription_status = "grace"
            changed = True

    elif company.subscription_status == "grace":
        deadline = _grace_deadline(company)
        if deadline and now > deadline:
            company.subscription_status = "suspended"
            changed = True

    elif company.subscription_status == "cancelled" and (
        company.current_period_end and now > company.current_period_end
    ):
        company.subscription_status = "suspended"
        changed = True

    if changed:
        db.add(company)
        await db.commit()
        logger.info(
            "subscription.status_advanced",
            company_id=company.id,
            old_status=old_status,
            new_status=company.subscription_status,
        )


async def _process_subscription_payment(
    invoice: SubscriptionInvoice,
    payload: dict,
    db: AsyncSession,
) -> None:
    """
    Mark an invoice as paid and activate the company's subscription.
    Called from the webhooks router on charge.success events.
    """
    now = datetime.now(UTC)
    data = payload.get("data", {})
    tx_id = str(data.get("id", ""))
    auth_code = data.get("authorization", {}).get("authorization_code")

    invoice.status = "paid"
    invoice.paid_at = now
    if tx_id:
        invoice.paystack_tx_id = tx_id

    company = invoice.company
    company.subscription_status = "active"
    company.current_period_end = invoice.period_end

    # Store authorization_code for future recurring charges
    if auth_code:
        company.paystack_auth_code = auth_code

    db.add(invoice)
    db.add(company)
    # Caller commits


async def run_subscription_sweeper(get_session_fn) -> None:  # type: ignore[type-arg]
    """
    Background sweeper: advance subscription statuses for all non-terminal companies.
    Runs every 60 minutes. Catches all exceptions so it never crashes the app.

    get_session_fn is the async context manager factory (SessionLocal from database.py).
    """
    while True:
        await asyncio.sleep(3600)
        try:
            async with get_session_fn() as db:
                result = await db.execute(
                    select(Company).where(
                        Company.subscription_status.not_in(["suspended", "cancelled"])
                    )
                )
                companies = result.scalars().all()
                for company in companies:
                    await advance_company_status_if_needed(company, db)
                logger.info("subscription_sweeper.completed", companies_checked=len(companies))
        except Exception:
            logger.exception("subscription_sweeper.error")
