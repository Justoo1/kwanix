"""
Subscription billing endpoints — accessible by company_admin.

All endpoints use get_current_user + bare get_db (NOT get_db_for_user) so that
suspended companies can still access billing to pay their overdue invoice.

POST /billing/select-plan           — choose plan + billing cycle (no charge yet)
POST /billing/pay                   — charge now (recurring) or return checkout URL (first time)
GET  /billing/pay/callback          — Paystack redirect after hosted payment
POST /billing/setup-payment-method  — store authorization_code after first payment
POST /billing/setup-subaccount      — link company bank account for ticket revenue pass-through
GET  /billing/plans                 — list active plans
GET  /billing/status                — own subscription state
GET  /billing/invoices              — invoice history
POST /billing/cancel                — cancel subscription
"""

import secrets
from datetime import UTC, datetime, timedelta
from typing import Literal

import structlog
from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, EmailStr
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.config import settings
from app.database import get_db
from app.dependencies.auth import require_role
from app.integrations.paystack import (
    charge_authorization,
    create_customer,
    create_subaccount,
    initialize_transaction,
    verify_transaction,
)
from app.models.company import Company
from app.models.subscription import SubscriptionInvoice, SubscriptionPlan
from app.models.user import User, UserRole

logger = structlog.get_logger()
router = APIRouter()


# ── Schemas ────────────────────────────────────────────────────────────────────


class PlanResponse(BaseModel):
    id: int
    name: str
    max_vehicles: int | None
    price_ghs_month: float
    price_ghs_annual: float

    model_config = {"from_attributes": True}

    @classmethod
    def from_orm(cls, plan: SubscriptionPlan) -> "PlanResponse":
        return cls(
            id=plan.id,
            name=plan.name,
            max_vehicles=plan.max_vehicles,
            price_ghs_month=float(plan.price_ghs_month),
            price_ghs_annual=float(plan.price_ghs_annual),
        )


class SubscriptionStatusResponse(BaseModel):
    subscription_status: str
    plan_name: str | None
    max_vehicles: int | None
    billing_cycle: str | None
    trial_ends_at: datetime | None
    current_period_end: datetime | None
    has_payment_method: bool
    has_subaccount: bool
    billing_email: str | None


class SelectPlanRequest(BaseModel):
    plan_id: int
    billing_cycle: Literal["monthly", "annual"]
    billing_email: EmailStr


class SetupPaymentMethodRequest(BaseModel):
    reference: str


class SetupSubaccountRequest(BaseModel):
    bank_code: str
    account_number: str
    account_name: str


class InvoiceResponse(BaseModel):
    id: int
    amount_ghs: float
    billing_cycle: str
    period_start: datetime
    period_end: datetime
    status: str
    paystack_reference: str | None
    paid_at: datetime | None
    created_at: datetime

    model_config = {"from_attributes": True}

    @classmethod
    def from_orm(cls, inv: SubscriptionInvoice) -> "InvoiceResponse":
        return cls(
            id=inv.id,
            amount_ghs=float(inv.amount_ghs),
            billing_cycle=inv.billing_cycle,
            period_start=inv.period_start,
            period_end=inv.period_end,
            status=inv.status,
            paystack_reference=inv.paystack_reference,
            paid_at=inv.paid_at,
            created_at=inv.created_at,
        )


# ── Helpers ────────────────────────────────────────────────────────────────────


async def _get_company_or_403(current_user: User, db: AsyncSession) -> Company:
    """Load the company for a company_admin. Raises 403 if user has no company."""
    if not current_user.company_id:
        raise HTTPException(status_code=403, detail="No company associated with this account.")
    result = await db.execute(
        select(Company)
        .where(Company.id == current_user.company_id)
        .options(selectinload(Company.subscription_plan))
    )
    company = result.scalar_one_or_none()
    if company is None:
        raise HTTPException(status_code=404, detail="Company not found.")
    return company


def _period_end_for(billing_cycle: str, start: datetime) -> datetime:
    if billing_cycle == "annual":
        return start + timedelta(days=365)
    return start + timedelta(days=30)


def _amount_for(plan: SubscriptionPlan, billing_cycle: str) -> float:
    return float(plan.price_ghs_annual if billing_cycle == "annual" else plan.price_ghs_month)


# ── Endpoints ──────────────────────────────────────────────────────────────────


@router.get("/plans", response_model=list[PlanResponse])
async def list_plans(db: AsyncSession = Depends(get_db)):
    """Public — list active subscription plans ordered by sort_order."""
    result = await db.execute(
        select(SubscriptionPlan)
        .where(SubscriptionPlan.is_active.is_(True))
        .order_by(SubscriptionPlan.sort_order)
    )
    return [PlanResponse.from_orm(p) for p in result.scalars().all()]


@router.get("/status", response_model=SubscriptionStatusResponse)
async def get_billing_status(
    current_user: User = Depends(require_role(UserRole.company_admin)),
    db: AsyncSession = Depends(get_db),
):
    company = await _get_company_or_403(current_user, db)
    plan = company.subscription_plan
    return SubscriptionStatusResponse(
        subscription_status=company.subscription_status,
        plan_name=plan.name if plan else None,
        max_vehicles=plan.max_vehicles if plan else None,
        billing_cycle=company.billing_cycle,
        trial_ends_at=company.trial_ends_at,
        current_period_end=company.current_period_end,
        has_payment_method=bool(company.paystack_auth_code),
        has_subaccount=bool(company.paystack_subaccount_code),
        billing_email=company.billing_email,
    )


@router.post("/select-plan", status_code=status.HTTP_200_OK)
async def select_plan(
    body: SelectPlanRequest,
    current_user: User = Depends(require_role(UserRole.company_admin)),
    db: AsyncSession = Depends(get_db),
):
    """Store the chosen plan + billing cycle. Does NOT charge yet."""
    plan_result = await db.execute(
        select(SubscriptionPlan).where(
            SubscriptionPlan.id == body.plan_id,
            SubscriptionPlan.is_active.is_(True),
        )
    )
    plan = plan_result.scalar_one_or_none()
    if plan is None:
        raise HTTPException(status_code=404, detail="Plan not found or inactive.")

    company = await _get_company_or_403(current_user, db)
    if company.subscription_status in ("suspended", "cancelled"):
        raise HTTPException(
            status_code=403,
            detail="Resolve your outstanding balance before making changes.",
        )
    company.subscription_plan_id = plan.id
    company.billing_cycle = body.billing_cycle
    company.billing_email = body.billing_email
    db.add(company)
    await db.commit()
    return {"message": "Plan selected. Use POST /billing/pay to complete payment."}


@router.post("/pay")
async def pay_now(
    current_user: User = Depends(require_role(UserRole.company_admin)),
    db: AsyncSession = Depends(get_db),
):
    """
    Initiate or execute a subscription payment.

    - If a stored authorization_code exists → charge it immediately (recurring).
    - If not → return a Paystack checkout_url for the user to complete payment.
    """
    company = await _get_company_or_403(current_user, db)

    if not company.subscription_plan_id:
        raise HTTPException(
            status_code=400,
            detail="Select a plan first via POST /billing/select-plan.",
        )

    plan_result = await db.execute(
        select(SubscriptionPlan).where(SubscriptionPlan.id == company.subscription_plan_id)
    )
    plan = plan_result.scalar_one_or_none()
    if plan is None:
        raise HTTPException(status_code=400, detail="Selected plan no longer exists.")

    billing_cycle = company.billing_cycle or "monthly"
    amount_ghs = _amount_for(plan, billing_cycle)
    amount_pesewas = int(amount_ghs * 100)
    now = datetime.now(UTC)
    period_start = now
    period_end = _period_end_for(billing_cycle, now)
    reference = f"sub_{company.id}_{secrets.token_urlsafe(8)}"

    email = company.billing_email or (current_user.email or "")
    if not email:
        raise HTTPException(
            status_code=400,
            detail="A billing_email is required. Set it via POST /billing/select-plan.",
        )

    # Create a pending invoice before initiating payment
    invoice = SubscriptionInvoice(
        company_id=company.id,
        plan_id=plan.id,
        amount_ghs=amount_ghs,
        billing_cycle=billing_cycle,
        period_start=period_start,
        period_end=period_end,
        status="pending",
        paystack_reference=reference,
    )
    db.add(invoice)
    await db.flush()  # get invoice.id

    if company.paystack_auth_code:
        # ── Recurring charge ───────────────────────────────────────────────────
        data = await charge_authorization(
            authorization_code=company.paystack_auth_code,
            email=email,
            amount_kobo=amount_pesewas,
            reference=reference,
        )
        gateway_status = data.get("status")

        if gateway_status == "success":
            invoice.status = "paid"
            invoice.paid_at = now
            invoice.paystack_tx_id = str(data.get("id", ""))
            company.subscription_status = "active"
            company.current_period_end = period_end
            # Refresh auth code if Paystack rotated it
            new_auth = data.get("authorization", {}).get("authorization_code")
            if new_auth:
                company.paystack_auth_code = new_auth
            db.add(company)
            await db.commit()
            return {"status": "paid", "invoice_id": invoice.id}
        else:
            # Card declined or MoMo OTP required
            invoice.status = "failed"
            invoice.failure_reason = gateway_status
            company.subscription_status = "grace"
            db.add(company)
            await db.commit()
            raise HTTPException(
                status_code=402,
                detail={
                    "code": "PAYMENT_FAILED",
                    "gateway_status": gateway_status,
                    "message": "Card charge failed. Please update your payment method.",
                },
            )
    else:
        # ── First-time: redirect to Paystack hosted page ───────────────────────
        callback_url = f"{settings.api_public_url}/api/v1/billing/pay/callback"
        data = await initialize_transaction(
            amount_kobo=amount_pesewas,
            email=email,
            reference=reference,
            callback_url=callback_url,
        )
        await db.commit()
        return {"checkout_url": data.get("authorization_url"), "invoice_id": invoice.id}


@router.get("/pay/callback")
async def pay_callback(reference: str = Query(...), db: AsyncSession = Depends(get_db)):
    """
    Paystack redirects here after the user completes the hosted payment.
    Verifies the transaction, updates the invoice, and redirects to the settings page.
    """
    redirect_base = f"{settings.public_app_url}/settings"

    # Look up the pending invoice
    inv_result = await db.execute(
        select(SubscriptionInvoice)
        .where(SubscriptionInvoice.paystack_reference == reference)
        .options(selectinload(SubscriptionInvoice.company))
    )
    invoice = inv_result.scalar_one_or_none()
    if invoice is None:
        return RedirectResponse(f"{redirect_base}?billing=error&reason=invoice_not_found")

    if invoice.status == "paid":
        return RedirectResponse(f"{redirect_base}?billing=already_paid")

    # Verify with Paystack
    data = await verify_transaction(reference)
    gateway_status = data.get("status")

    now = datetime.now(UTC)
    company = invoice.company

    if gateway_status == "success":
        invoice.status = "paid"
        invoice.paid_at = now
        invoice.paystack_tx_id = str(data.get("id", ""))
        company.subscription_status = "active"
        company.current_period_end = invoice.period_end
        auth_code = data.get("authorization", {}).get("authorization_code")
        if auth_code:
            company.paystack_auth_code = auth_code
        db.add(invoice)
        db.add(company)
        await db.commit()
        return RedirectResponse(f"{redirect_base}?billing=success")
    else:
        invoice.status = "failed"
        invoice.failure_reason = gateway_status
        db.add(invoice)
        await db.commit()
        return RedirectResponse(f"{redirect_base}?billing=failed")


@router.post("/setup-payment-method")
async def setup_payment_method(
    body: SetupPaymentMethodRequest,
    current_user: User = Depends(require_role(UserRole.company_admin)),
    db: AsyncSession = Depends(get_db),
):
    """
    Called after a successful Paystack hosted payment to store the authorization_code
    for future recurring charges without redirecting the user.
    """
    data = await verify_transaction(body.reference)
    if data.get("status") != "success":
        raise HTTPException(status_code=400, detail="Transaction not successful.")

    auth_code = data.get("authorization", {}).get("authorization_code")
    if not auth_code:
        raise HTTPException(status_code=400, detail="No authorization code returned by Paystack.")

    company = await _get_company_or_403(current_user, db)
    company.paystack_auth_code = auth_code

    # Create / update Paystack customer record
    if not company.paystack_customer_id and current_user.email:
        customer_data = await create_customer(
            email=current_user.email,
            full_name=current_user.full_name,
            phone=current_user.phone or "",
        )
        customer_code = customer_data.get("customer_code")
        if not customer_code:
            raise HTTPException(status_code=502, detail="Failed to register with payment provider.")
        company.paystack_customer_id = customer_code

    db.add(company)
    await db.commit()
    return {"message": "Payment method saved successfully."}


@router.post("/setup-subaccount")
async def setup_subaccount(
    body: SetupSubaccountRequest,
    current_user: User = Depends(require_role(UserRole.company_admin)),
    db: AsyncSession = Depends(get_db),
):
    """
    Link a company bank account so that online ticket payments flow 100% to them
    via a Paystack subaccount (RoutePass takes 0% per transaction).
    """
    company = await _get_company_or_403(current_user, db)
    if company.subscription_status in ("suspended", "cancelled"):
        raise HTTPException(
            status_code=403,
            detail="Resolve your outstanding balance before making changes.",
        )
    email = company.billing_email or (current_user.email or "")
    if not email:
        raise HTTPException(status_code=400, detail="Set a billing_email first.")

    data = await create_subaccount(
        business_name=company.name,
        bank_code=body.bank_code,
        account_number=body.account_number,
        primary_contact_email=email,
        percentage_charge=0.0,
    )
    subaccount_code = data.get("subaccount_code")
    if not subaccount_code:
        raise HTTPException(status_code=502, detail="Paystack did not return a subaccount code.")

    company.paystack_subaccount_code = subaccount_code
    company.bank_code = body.bank_code
    company.bank_account_number = body.account_number
    company.bank_account_name = body.account_name
    db.add(company)
    await db.commit()
    return {
        "subaccount_code": subaccount_code,
        "message": "Subaccount linked. Ticket revenue will now flow directly to your bank.",
    }


@router.get("/invoices", response_model=list[InvoiceResponse])
async def list_invoices(
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    current_user: User = Depends(require_role(UserRole.company_admin)),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(SubscriptionInvoice)
        .where(SubscriptionInvoice.company_id == current_user.company_id)
        .order_by(SubscriptionInvoice.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    return [InvoiceResponse.from_orm(inv) for inv in result.scalars().all()]


@router.post("/cancel", status_code=status.HTTP_200_OK)
async def cancel_subscription(
    current_user: User = Depends(require_role(UserRole.company_admin)),
    db: AsyncSession = Depends(get_db),
):
    """
    Cancel subscription. Access continues until current_period_end, then suspended.
    Clears the stored authorization code so no further automatic charges occur.
    """
    company = await _get_company_or_403(current_user, db)
    if company.subscription_status in ("suspended", "cancelled"):
        raise HTTPException(
            status_code=403,
            detail="Resolve your outstanding balance before making changes.",
        )
    company.subscription_status = "cancelled"
    company.paystack_auth_code = None
    db.add(company)
    await db.commit()
    period_end = company.current_period_end
    message = (
        f"Subscription cancelled. You retain access until {period_end.strftime('%d %b %Y')}."
        if period_end
        else "Subscription cancelled."
    )
    return {"message": message}
