"""
Loyalty Points — 1 point per GHS 1.00 spent, 100 points = GHS 1.00 discount.

GET    /loyalty/account/{phone}         — get or create account for phone
POST   /loyalty/earn                    — accrue points after a paid ticket/parcel
POST   /loyalty/redeem                  — redeem points for a discount
GET    /loyalty/account/{phone}/history — transaction history
GET    /loyalty/leaderboard             — top earners (company_admin+)
"""

import contextlib
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.dependencies.auth import get_db_for_user, require_role
from app.models.loyalty import LoyaltyAccount, LoyaltyTransaction
from app.models.user import User, UserRole
from app.utils.phone import normalize_gh_phone

router = APIRouter()

_ADMIN_ROLES = (UserRole.company_admin, UserRole.super_admin)
_CLERK_ROLES = (
    UserRole.station_clerk,
    UserRole.station_manager,
    UserRole.company_admin,
    UserRole.super_admin,
)

_POINTS_PER_GHS = 1  # 1 point per GHS 1 spent
_GHS_PER_100_POINTS = 1.0  # 100 points = GHS 1.00


# ── Schemas ────────────────────────────────────────────────────────────────────


class LoyaltyAccountResponse(BaseModel):
    id: int
    phone: str
    full_name: str | None
    points_balance: int
    ghs_value: float


class EarnRequest(BaseModel):
    phone: str
    full_name: str | None = None
    amount_ghs: float = Field(..., gt=0)
    source_type: str = Field(..., pattern="^(ticket|parcel)$")
    source_id: int


class RedeemRequest(BaseModel):
    phone: str
    points_to_redeem: int = Field(..., gt=0, le=10000)


class RedeemResponse(BaseModel):
    points_redeemed: int
    ghs_discount: float
    remaining_balance: int


class LoyaltyTxResponse(BaseModel):
    id: int
    transaction_type: str
    points: int
    source_type: str | None
    source_id: int | None
    note: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Helpers ────────────────────────────────────────────────────────────────────


async def _get_or_create_account(
    db: AsyncSession,
    company_id: int,
    phone: str,
    full_name: str | None = None,
) -> LoyaltyAccount:
    with contextlib.suppress(ValueError):
        phone = normalize_gh_phone(phone)

    result = await db.execute(
        select(LoyaltyAccount).where(
            LoyaltyAccount.company_id == company_id,
            LoyaltyAccount.phone == phone,
        )
    )
    account = result.scalar_one_or_none()
    if account is None:
        account = LoyaltyAccount(
            company_id=company_id,
            phone=phone,
            full_name=full_name,
            points_balance=0,
        )
        db.add(account)
        await db.flush()
    elif full_name and not account.full_name:
        account.full_name = full_name
    return account


# ── Endpoints ──────────────────────────────────────────────────────────────────


@router.get("/account/{phone}", response_model=LoyaltyAccountResponse)
async def get_loyalty_account(
    phone: str,
    db: AsyncSession = Depends(get_db_for_user),
    current_user: User = Depends(require_role(*_CLERK_ROLES)),
):
    with contextlib.suppress(ValueError):
        phone = normalize_gh_phone(phone)

    result = await db.execute(
        select(LoyaltyAccount).where(
            LoyaltyAccount.company_id == current_user.company_id,
            LoyaltyAccount.phone == phone,
        )
    )
    account = result.scalar_one_or_none()
    if account is None:
        raise HTTPException(
            status_code=404, detail="No loyalty account found for this phone number."
        )

    return LoyaltyAccountResponse(
        id=account.id,
        phone=account.phone,
        full_name=account.full_name,
        points_balance=account.points_balance,
        ghs_value=round(account.points_balance / 100 * _GHS_PER_100_POINTS, 2),
    )


@router.post("/earn", response_model=LoyaltyAccountResponse, status_code=status.HTTP_200_OK)
async def earn_points(
    body: EarnRequest,
    db: AsyncSession = Depends(get_db_for_user),
    current_user: User = Depends(require_role(*_CLERK_ROLES)),
):
    """Accrue points for a paid ticket or parcel. 1 point per GHS 1 spent."""
    points_earned = max(1, int(body.amount_ghs * _POINTS_PER_GHS))

    account = await _get_or_create_account(
        db,
        current_user.company_id,
        body.phone,
        body.full_name,
    )
    account.points_balance += points_earned

    tx = LoyaltyTransaction(
        account_id=account.id,
        transaction_type="earn",
        points=points_earned,
        source_type=body.source_type,
        source_id=body.source_id,
        note=f"Earned {points_earned} pts for {body.source_type} #{body.source_id}",
        created_at=datetime.now(UTC),
    )
    db.add(tx)
    await db.commit()
    await db.refresh(account)

    return LoyaltyAccountResponse(
        id=account.id,
        phone=account.phone,
        full_name=account.full_name,
        points_balance=account.points_balance,
        ghs_value=round(account.points_balance / 100 * _GHS_PER_100_POINTS, 2),
    )


@router.post("/redeem", response_model=RedeemResponse)
async def redeem_points(
    body: RedeemRequest,
    db: AsyncSession = Depends(get_db_for_user),
    current_user: User = Depends(require_role(*_CLERK_ROLES)),
):
    """Redeem loyalty points for a GHS discount. 100 points = GHS 1.00."""
    try:
        phone = normalize_gh_phone(body.phone)
    except ValueError:
        phone = body.phone

    result = await db.execute(
        select(LoyaltyAccount).where(
            LoyaltyAccount.company_id == current_user.company_id,
            LoyaltyAccount.phone == phone,
        )
    )
    account = result.scalar_one_or_none()
    if account is None:
        raise HTTPException(status_code=404, detail="No loyalty account found.")

    if account.points_balance < body.points_to_redeem:
        raise HTTPException(
            status_code=400,
            detail={
                "code": "INSUFFICIENT_POINTS",
                "available": account.points_balance,
                "requested": body.points_to_redeem,
            },
        )

    ghs_discount = round(body.points_to_redeem / 100 * _GHS_PER_100_POINTS, 2)
    account.points_balance -= body.points_to_redeem

    tx = LoyaltyTransaction(
        account_id=account.id,
        transaction_type="redeem",
        points=-body.points_to_redeem,
        note=f"Redeemed {body.points_to_redeem} pts for GHS {ghs_discount:.2f} discount",
        created_at=datetime.now(UTC),
    )
    db.add(tx)
    await db.commit()
    await db.refresh(account)

    return RedeemResponse(
        points_redeemed=body.points_to_redeem,
        ghs_discount=ghs_discount,
        remaining_balance=account.points_balance,
    )


@router.get("/account/{phone}/history", response_model=list[LoyaltyTxResponse])
async def get_loyalty_history(
    phone: str,
    limit: int = Query(30, ge=1, le=100),
    db: AsyncSession = Depends(get_db_for_user),
    current_user: User = Depends(require_role(*_CLERK_ROLES)),
):
    with contextlib.suppress(ValueError):
        phone = normalize_gh_phone(phone)

    result = await db.execute(
        select(LoyaltyAccount)
        .where(
            LoyaltyAccount.company_id == current_user.company_id,
            LoyaltyAccount.phone == phone,
        )
        .options(selectinload(LoyaltyAccount.transactions))
    )
    account = result.scalar_one_or_none()
    if account is None:
        raise HTTPException(status_code=404, detail="No loyalty account found.")

    return [
        LoyaltyTxResponse(
            id=tx.id,
            transaction_type=tx.transaction_type,
            points=tx.points,
            source_type=tx.source_type,
            source_id=tx.source_id,
            note=tx.note,
            created_at=tx.created_at,
        )
        for tx in account.transactions[:limit]
    ]


@router.get("/leaderboard", response_model=list[LoyaltyAccountResponse])
async def get_leaderboard(
    limit: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db_for_user),
    current_user: User = Depends(require_role(*_ADMIN_ROLES)),
):
    """Top loyalty earners for this company."""
    result = await db.execute(
        select(LoyaltyAccount)
        .where(LoyaltyAccount.company_id == current_user.company_id)
        .order_by(LoyaltyAccount.points_balance.desc())
        .limit(limit)
    )
    accounts = result.scalars().all()
    return [
        LoyaltyAccountResponse(
            id=a.id,
            phone=a.phone,
            full_name=a.full_name,
            points_balance=a.points_balance,
            ghs_value=round(a.points_balance / 100 * _GHS_PER_100_POINTS, 2),
        )
        for a in accounts
    ]
