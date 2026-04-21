"""
Corporate Accounts — company_admin+ only.

GET    /corporate                       — list accounts
POST   /corporate                       — create account
GET    /corporate/{id}                  — detail
PATCH  /corporate/{id}                  — update (name, credit_limit, notes, is_active)
POST   /corporate/{id}/credit-used      — record credit usage (after invoicing)
"""

import contextlib
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies.auth import get_db_for_user, require_role
from app.models.corporate_account import CorporateAccount
from app.models.user import User, UserRole
from app.utils.phone import normalize_gh_phone

router = APIRouter()

_ADMIN = (UserRole.company_admin, UserRole.super_admin)


# ── Schemas ────────────────────────────────────────────────────────────────────


class CorporateAccountCreate(BaseModel):
    name: str = Field(..., max_length=150)
    contact_name: str | None = Field(None, max_length=100)
    contact_phone: str | None = Field(None, max_length=20)
    contact_email: EmailStr | None = None
    credit_limit_ghs: float = Field(0.0, ge=0)
    notes: str | None = None

    def normalize(self) -> "CorporateAccountCreate":
        if self.contact_phone:
            with contextlib.suppress(ValueError):
                self.contact_phone = normalize_gh_phone(self.contact_phone)
        return self


class CorporateAccountUpdate(BaseModel):
    name: str | None = Field(None, max_length=150)
    contact_name: str | None = Field(None, max_length=100)
    contact_phone: str | None = Field(None, max_length=20)
    contact_email: EmailStr | None = None
    credit_limit_ghs: float | None = Field(None, ge=0)
    notes: str | None = None
    is_active: bool | None = None


class CreditUsageRequest(BaseModel):
    amount_ghs: float = Field(..., gt=0)


class CorporateAccountResponse(BaseModel):
    id: int
    company_id: int
    name: str
    contact_name: str | None
    contact_phone: str | None
    contact_email: str | None
    credit_limit_ghs: float
    credit_used_ghs: float
    credit_available_ghs: float
    notes: str | None
    is_active: bool

    model_config = {"from_attributes": True}


def _to_response(acc: CorporateAccount) -> CorporateAccountResponse:
    limit = float(acc.credit_limit_ghs)
    used = float(acc.credit_used_ghs)
    return CorporateAccountResponse(
        id=acc.id,
        company_id=acc.company_id,
        name=acc.name,
        contact_name=acc.contact_name,
        contact_phone=acc.contact_phone,
        contact_email=acc.contact_email,
        credit_limit_ghs=limit,
        credit_used_ghs=used,
        credit_available_ghs=round(max(0.0, limit - used), 2),
        notes=acc.notes,
        is_active=acc.is_active,
    )


# ── Endpoints ──────────────────────────────────────────────────────────────────


@router.get("", response_model=list[CorporateAccountResponse])
async def list_corporate_accounts(
    active_only: bool = Query(True),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db_for_user),
    current_user: User = Depends(require_role(*_ADMIN)),
):
    q = select(CorporateAccount)
    if active_only:
        q = q.where(CorporateAccount.is_active.is_(True))
    q = q.order_by(CorporateAccount.name).limit(limit).offset(offset)
    result = await db.execute(q)
    return [_to_response(a) for a in result.scalars().all()]


@router.post("", response_model=CorporateAccountResponse, status_code=status.HTTP_201_CREATED)
async def create_corporate_account(
    body: CorporateAccountCreate,
    db: AsyncSession = Depends(get_db_for_user),
    current_user: User = Depends(require_role(*_ADMIN)),
):
    body = body.normalize()
    acc = CorporateAccount(
        company_id=current_user.company_id,
        name=body.name,
        contact_name=body.contact_name,
        contact_phone=body.contact_phone,
        contact_email=body.contact_email,
        credit_limit_ghs=Decimal(str(body.credit_limit_ghs)),
        notes=body.notes,
    )
    db.add(acc)
    await db.commit()
    await db.refresh(acc)
    return _to_response(acc)


@router.get("/{account_id}", response_model=CorporateAccountResponse)
async def get_corporate_account(
    account_id: int,
    db: AsyncSession = Depends(get_db_for_user),
    current_user: User = Depends(require_role(*_ADMIN)),
):
    result = await db.execute(select(CorporateAccount).where(CorporateAccount.id == account_id))
    acc = result.scalar_one_or_none()
    if acc is None:
        raise HTTPException(status_code=404, detail="Corporate account not found")
    return _to_response(acc)


@router.patch("/{account_id}", response_model=CorporateAccountResponse)
async def update_corporate_account(
    account_id: int,
    body: CorporateAccountUpdate,
    db: AsyncSession = Depends(get_db_for_user),
    current_user: User = Depends(require_role(*_ADMIN)),
):
    result = await db.execute(select(CorporateAccount).where(CorporateAccount.id == account_id))
    acc = result.scalar_one_or_none()
    if acc is None:
        raise HTTPException(status_code=404, detail="Corporate account not found")

    if body.name is not None:
        acc.name = body.name
    if body.contact_name is not None:
        acc.contact_name = body.contact_name
    if body.contact_phone is not None:
        try:
            acc.contact_phone = normalize_gh_phone(body.contact_phone)
        except ValueError:
            acc.contact_phone = body.contact_phone
    if body.contact_email is not None:
        acc.contact_email = body.contact_email
    if body.credit_limit_ghs is not None:
        acc.credit_limit_ghs = Decimal(str(body.credit_limit_ghs))
    if body.notes is not None:
        acc.notes = body.notes
    if body.is_active is not None:
        acc.is_active = body.is_active

    await db.commit()
    await db.refresh(acc)
    return _to_response(acc)


@router.post("/{account_id}/credit-used", response_model=CorporateAccountResponse)
async def record_credit_usage(
    account_id: int,
    body: CreditUsageRequest,
    db: AsyncSession = Depends(get_db_for_user),
    current_user: User = Depends(require_role(*_ADMIN)),
):
    """Record credit usage (e.g. after issuing a monthly invoice)."""
    result = await db.execute(select(CorporateAccount).where(CorporateAccount.id == account_id))
    acc = result.scalar_one_or_none()
    if acc is None:
        raise HTTPException(status_code=404, detail="Corporate account not found")

    new_used = float(acc.credit_used_ghs) + body.amount_ghs
    if new_used > float(acc.credit_limit_ghs):
        raise HTTPException(
            status_code=400,
            detail={
                "code": "CREDIT_LIMIT_EXCEEDED",
                "credit_limit_ghs": float(acc.credit_limit_ghs),
                "credit_used_ghs": float(acc.credit_used_ghs),
                "requested_ghs": body.amount_ghs,
            },
        )
    acc.credit_used_ghs = Decimal(str(round(new_used, 2)))
    await db.commit()
    await db.refresh(acc)
    return _to_response(acc)
