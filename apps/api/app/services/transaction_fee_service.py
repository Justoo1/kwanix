"""
Per-transaction billing service.

get_platform_config      — fetch singleton PlatformConfig with a 60-second in-process cache
schedule_fee_record      — fire-and-forget fee row insertion after ticket/parcel creation
run_transaction_fee_sweeper — daily sweeper that batches pending fees and charges companies
"""

from __future__ import annotations

import asyncio
import secrets
import string
from datetime import UTC, date, datetime
from decimal import Decimal
from typing import TYPE_CHECKING

import structlog
from sqlalchemy import func, select

from app.models.platform_config import PlatformConfig
from app.models.transaction_fee import TransactionFee, TransactionInvoice

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession

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
        config = PlatformConfig(id=1, billing_mode="subscription")
        db.add(config)
        await db.commit()
        await db.refresh(config)

    _config_cache = (now, config)
    return config


# ── Fire-and-forget fee recording ─────────────────────────────────────────────


async def _record_fee_task(
    company_id: int,
    fee_type: str,
    source_id: int,
    amount_ghs: Decimal,
) -> None:
    try:
        from app.database import SessionLocal  # noqa: PLC0415

        async with SessionLocal() as db:
            fee = TransactionFee(
                company_id=company_id,
                fee_type=fee_type,
                source_id=source_id,
                amount_ghs=amount_ghs,
                status="pending",
            )
            db.add(fee)
            await db.commit()
            logger.info(
                "transaction_fee.recorded",
                company_id=company_id,
                fee_type=fee_type,
                source_id=source_id,
                amount_ghs=str(amount_ghs),
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
) -> None:
    """Schedule a background task to record a transaction fee row. Never raises."""
    asyncio.create_task(
        _record_fee_task(company_id, fee_type, source_id, amount_ghs),
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
                config = await get_platform_config(db)
                if config.billing_mode != "per_transaction":
                    logger.info(
                        "transaction_fee_sweeper.skipped", reason="not in per_transaction mode"
                    )
                    continue

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
