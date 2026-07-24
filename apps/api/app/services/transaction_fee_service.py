"""
Per-transaction billing service.

Billing mode and the fee percentage are per-company (Company.billing_mode /
Company.transaction_fee_pct); PlatformConfig only holds the platform-wide
default percentage used when a company has no custom rate.

get_platform_config      — fetch singleton PlatformConfig with a 60-second in-process cache
effective_fee_pct        — resolve the percentage a company is actually charged
compute_fee_ghs          — percentage * amount, rounded to the nearest pesewa
schedule_fee_record      — fire-and-forget fee row insertion after ticket/parcel creation
run_transaction_fee_sweeper — daily sweeper that batches pending fees and charges companies
"""

from __future__ import annotations

import asyncio
import secrets
import string
from datetime import UTC, date, datetime
from decimal import ROUND_HALF_UP, Decimal
from typing import TYPE_CHECKING

import structlog
from sqlalchemy import func, select

from app.models.platform_config import PlatformConfig
from app.models.transaction_fee import TransactionFee, TransactionInvoice

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession

    from app.models.company import Company
    from app.models.ticket import Ticket

logger = structlog.get_logger()

# ── In-process cache for PlatformConfig ───────────────────────────────────────
# Avoids a DB hit on every authenticated request. TTL = 60 seconds.
_config_cache: tuple[datetime, PlatformConfig] | None = None
_CACHE_TTL_SECONDS = 60


def invalidate_config_cache() -> None:
    global _config_cache
    _config_cache = None


async def get_platform_config(db: AsyncSession) -> PlatformConfig:
    global _config_cache
    now = datetime.now(UTC)
    if _config_cache is not None:
        cached_at, config = _config_cache
        if (now - cached_at).total_seconds() < _CACHE_TTL_SECONDS:
            return config

    result = await db.execute(select(PlatformConfig).where(PlatformConfig.id == 1))
    config = result.scalar_one_or_none()
    if config is None:
        # Defensive: seed the singleton if it somehow doesn't exist
        config = PlatformConfig(id=1)
        db.add(config)
        await db.commit()
        await db.refresh(config)

    _config_cache = (now, config)
    return config


def effective_fee_pct(company: Company, platform: PlatformConfig) -> Decimal:
    """The percentage a company is actually charged per transaction.

    Falls back to the platform-wide default when the company has no custom
    rate set.
    """
    return (
        company.transaction_fee_pct
        if company.transaction_fee_pct is not None
        else platform.default_fee_pct
    )


def compute_fee_ghs(amount_ghs: float | Decimal, pct: Decimal) -> Decimal:
    """Compute pct% of amount_ghs, rounded to the nearest pesewa (2dp)."""
    return (Decimal(str(amount_ghs)) * pct / Decimal("100")).quantize(
        Decimal("0.01"), rounding=ROUND_HALF_UP
    )


async def record_ticket_fee(db: AsyncSession, ticket: Ticket, company: Company | None) -> None:
    """
    Call once a ticket's payment is confirmed. Always records the platform's
    cut in the TransactionFee ledger for per_transaction companies, so
    "how much did I make from company X" is complete and accurate regardless
    of payment method:

    - Company has a Paystack subaccount linked → the transaction_charge split
      already deducted the fee in real time; record it as already "charged"
      so it's counted in the totals (it previously wasn't tracked anywhere).
    - No subaccount → there was nothing to split against; record it "pending",
      collected later by the daily sweeper (same fallback cash sales use).

    Idempotent via Ticket.fee_recorded_at — safe to call from both the
    webhook and the synchronous verify path for the same ticket.
    """
    if ticket.fee_recorded_at is not None:
        return
    if company is None or company.billing_mode != "per_transaction":
        return

    platform = await get_platform_config(db)
    pct = effective_fee_pct(company, platform)
    fee_ghs = compute_fee_ghs(ticket.fare_ghs, pct)
    ticket.fee_recorded_at = datetime.now(UTC)
    status = "charged" if company.paystack_subaccount_code else "pending"
    schedule_fee_record(company.id, "ticket", ticket.id, fee_ghs, status=status)


# ── Fire-and-forget fee recording ─────────────────────────────────────────────


async def _record_fee_task(
    company_id: int,
    fee_type: str,
    source_id: int,
    amount_ghs: Decimal,
    status: str,
) -> None:
    try:
        from app.database import SessionLocal  # noqa: PLC0415

        async with SessionLocal() as db:
            fee = TransactionFee(
                company_id=company_id,
                fee_type=fee_type,
                source_id=source_id,
                amount_ghs=amount_ghs,
                status=status,
            )
            db.add(fee)
            await db.commit()
            logger.info(
                "transaction_fee.recorded",
                company_id=company_id,
                fee_type=fee_type,
                source_id=source_id,
                amount_ghs=str(amount_ghs),
                status=status,
            )
    except Exception:
        logger.exception(
            "transaction_fee.record_failed",
            company_id=company_id,
            fee_type=fee_type,
            source_id=source_id,
        )


def schedule_fee_record(
    company_id: int,
    fee_type: str,
    source_id: int,
    amount_ghs: Decimal,
    status: str = "pending",
) -> None:
    """
    Schedule a background task to record a transaction fee row. Never raises.

    status defaults to "pending" (owed, collected later by the sweeper).
    Pass status="charged" when the fee was already deducted in real time
    (e.g. via a Paystack transaction_charge split) so it's counted as
    collected rather than owed.
    """
    asyncio.create_task(
        _record_fee_task(company_id, fee_type, source_id, amount_ghs, status),
        name=f"fee_record_{fee_type}_{source_id}",
    )


# ── Daily sweeper ──────────────────────────────────────────────────────────────


def _make_reference(company_id: int) -> str:
    alphabet = string.ascii_uppercase + string.digits
    suffix = "".join(secrets.choice(alphabet) for _ in range(8))
    return f"KX-TXF-{company_id}-{suffix}"


async def _charge_company_fees(
    db: AsyncSession,
    company_id: int,
    total_ghs: Decimal,
    fee_count: int,
    today: date,
) -> None:
    from app.integrations.paystack import charge_authorization  # noqa: PLC0415
    from app.models.company import Company  # noqa: PLC0415

    company_result = await db.execute(
        select(Company).where(Company.id == company_id).with_for_update()
    )
    company = company_result.scalar_one_or_none()
    if company is None:
        return

    if not company.paystack_auth_code or not company.billing_email:
        logger.warning(
            "transaction_fee_sweeper.skipping_no_auth",
            company_id=company_id,
            total_ghs=str(total_ghs),
        )
        return

    reference = _make_reference(company_id)
    amount_pesewas = int(total_ghs * 100)

    invoice = TransactionInvoice(
        company_id=company_id,
        amount_ghs=total_ghs,
        fee_count=fee_count,
        period_date=today,
        status="pending",
        paystack_reference=reference,
    )
    db.add(invoice)
    await db.flush()  # get invoice.id

    # Link pending fees to this invoice
    pending_result = await db.execute(
        select(TransactionFee)
        .where(TransactionFee.company_id == company_id, TransactionFee.status == "pending")
        .with_for_update()
    )
    pending_fees = pending_result.scalars().all()
    for fee in pending_fees:
        fee.batch_invoice_id = invoice.id

    await db.flush()

    try:
        data = await charge_authorization(
            authorization_code=company.paystack_auth_code,
            email=company.billing_email,
            amount_kobo=amount_pesewas,
            reference=reference,
        )
        gateway_status = data.get("status", "failed")
        tx_id = str(data.get("id", ""))
    except Exception as exc:
        gateway_status = "failed"
        tx_id = ""
        logger.warning(
            "transaction_fee_sweeper.charge_error",
            company_id=company_id,
            reference=reference,
            error=str(exc),
        )

    if gateway_status == "success":
        invoice.status = "paid"
        invoice.paid_at = datetime.now(UTC)
        if tx_id:
            invoice.paystack_tx_id = tx_id
        for fee in pending_fees:
            fee.status = "charged"
        logger.info(
            "transaction_fee_sweeper.charged",
            company_id=company_id,
            reference=reference,
            total_ghs=str(total_ghs),
            fee_count=fee_count,
        )
    else:
        invoice.status = "failed"
        invoice.failure_reason = f"gateway_status={gateway_status}"
        for fee in pending_fees:
            fee.status = "failed"
        logger.warning(
            "transaction_fee_sweeper.charge_failed",
            company_id=company_id,
            reference=reference,
            gateway_status=gateway_status,
        )

    await db.commit()


async def run_transaction_fee_sweeper(get_session_fn) -> None:  # type: ignore[type-arg]
    """
    Background sweeper: batch-charge pending transaction fees once per day.
    Catches all exceptions so it never crashes the app.
    """
    while True:
        await asyncio.sleep(86400)  # 24 hours
        try:
            async with get_session_fn() as db:
                # Billing mode is per-company now — pending TransactionFee rows are
                # only ever created for per_transaction companies (see schedule_fee_record
                # call sites in tickets.py/parcels.py), so no global gate is needed here.
                today = date.today()
                rows = await db.execute(
                    select(
                        TransactionFee.company_id,
                        func.sum(TransactionFee.amount_ghs).label("total_ghs"),
                        func.count().label("fee_count"),
                    )
                    .where(TransactionFee.status == "pending")
                    .group_by(TransactionFee.company_id)
                )
                companies_with_fees = rows.all()

                for row in companies_with_fees:
                    await _charge_company_fees(
                        db,
                        company_id=row.company_id,
                        total_ghs=Decimal(str(row.total_ghs)),
                        fee_count=row.fee_count,
                        today=today,
                    )

                logger.info(
                    "transaction_fee_sweeper.completed",
                    companies_billed=len(companies_with_fees),
                )
        except Exception:
            logger.exception("transaction_fee_sweeper.error")
