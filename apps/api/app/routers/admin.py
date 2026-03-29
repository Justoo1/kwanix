"""
Super-admin and company-admin management endpoints.

POST /admin/companies       — super_admin only: onboard a new transport company
GET  /admin/companies       — super_admin only: list all companies
POST /admin/users           — company_admin+:   create a user within their company
GET  /admin/users           — company_admin+:   list users within their company
"""

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies.auth import require_role
from app.models.company import Company
from app.models.user import User, UserRole
from app.services.auth_service import hash_password

router = APIRouter()


# ── Schemas ────────────────────────────────────────────────────────────────────


class CompanyCreate(BaseModel):
    name: str
    company_code: str
    subdomain: str | None = None
    brand_color: str | None = None


class CompanyResponse(BaseModel):
    id: int
    name: str
    company_code: str
    subdomain: str | None
    brand_color: str | None
    is_active: bool

    model_config = {"from_attributes": True}


class CompanyUpdate(BaseModel):
    brand_color: str | None = None


class UserCreate(BaseModel):
    full_name: str
    phone: str
    email: str | None = None
    password: str
    role: UserRole
    station_id: int | None = None


class UserResponse(BaseModel):
    id: int
    full_name: str
    phone: str
    email: str | None
    role: str
    company_id: int | None
    station_id: int | None
    is_active: bool

    model_config = {"from_attributes": True}


# ── Company endpoints (super_admin only) ───────────────────────────────────────


@router.post(
    "/companies",
    response_model=CompanyResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_role(UserRole.super_admin))],
)
async def create_company(
    body: CompanyCreate,
    db: AsyncSession = Depends(get_db),
):
    existing = await db.execute(
        select(Company).where(Company.company_code == body.company_code.upper())
    )
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=400,
            detail=f"Company code '{body.company_code.upper()}' is already taken.",
        )

    company = Company(
        name=body.name,
        company_code=body.company_code.upper(),
        subdomain=body.subdomain,
        brand_color=body.brand_color,
        is_active=True,
    )
    db.add(company)
    await db.commit()
    await db.refresh(company)
    return company


@router.get(
    "/companies",
    response_model=list[CompanyResponse],
    dependencies=[Depends(require_role(UserRole.super_admin))],
)
async def list_companies(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Company).order_by(Company.name))
    return result.scalars().all()


# ── Company self-service (company_admin only) ─────────────────────────────────


@router.get(
    "/companies/me",
    response_model=CompanyResponse,
)
async def get_my_company(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(
        require_role(UserRole.company_admin, UserRole.station_manager, UserRole.station_clerk)
    ),
):
    result = await db.execute(
        select(Company).where(Company.id == current_user.company_id)
    )
    company = result.scalar_one_or_none()
    if company is None:
        raise HTTPException(status_code=404, detail="Company not found.")
    return company


@router.patch(
    "/companies/me",
    response_model=CompanyResponse,
    dependencies=[Depends(require_role(UserRole.company_admin))],
)
async def update_my_company(
    body: CompanyUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.company_admin)),
):
    result = await db.execute(
        select(Company).where(Company.id == current_user.company_id)
    )
    company = result.scalar_one_or_none()
    if company is None:
        raise HTTPException(status_code=404, detail="Company not found.")
    if body.brand_color is not None:
        company.brand_color = body.brand_color
    await db.commit()
    await db.refresh(company)
    return company


# ── User endpoints (company_admin+) ───────────────────────────────────────────


@router.post(
    "/users",
    response_model=UserResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_user(
    body: UserCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(
        require_role(
            UserRole.super_admin,
            UserRole.company_admin,
        )
    ),
):
    # Determine which company this user belongs to
    if current_user.role == UserRole.super_admin:
        # super_admin must explicitly set company via station_id lookup or
        # we rely on company_id being set externally — for now require a
        # company_admin to own the user
        raise HTTPException(
            status_code=400,
            detail="super_admin cannot create users directly. Log in as a company_admin.",
        )

    # Prevent company_admin from creating super_admin accounts
    if body.role == UserRole.super_admin:
        raise HTTPException(
            status_code=403,
            detail="Cannot create a super_admin account.",
        )

    # Check for duplicate phone
    dup = await db.execute(select(User).where(User.phone == body.phone))
    if dup.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Phone number already in use.")

    user = User(
        company_id=current_user.company_id,
        station_id=body.station_id,
        full_name=body.full_name,
        phone=body.phone,
        email=body.email,
        hashed_password=hash_password(body.password),
        role=body.role,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


@router.get("/users", response_model=list[UserResponse])
async def list_users(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(
        require_role(
            UserRole.super_admin,
            UserRole.company_admin,
        )
    ),
):
    if current_user.role == UserRole.super_admin:
        result = await db.execute(select(User).order_by(User.company_id, User.full_name))
    else:
        result = await db.execute(
            select(User)
            .where(User.company_id == current_user.company_id)
            .order_by(User.full_name)
        )
    return result.scalars().all()
