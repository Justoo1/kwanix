"""
Integration tests for billing endpoints.

TestBillingStatusGuard              — 403 for suspended/cancelled companies
TestSetupPaymentMethodCreateCustomer — create_customer failure and success paths
TestSelectPlanEmailValidation        — email validation on select-plan
"""

from decimal import Decimal
from unittest.mock import AsyncMock, patch

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.subscription import SubscriptionPlan
from app.models.user import User, UserRole
from app.services.auth_service import create_access_token, hash_password

# ── Local fixtures ─────────────────────────────────────────────────────────────


@pytest.fixture
async def admin_user(db, company):
    u = User(
        company_id=company.id,
        full_name="Billing Admin",
        phone="233209990099",
        email="billing_admin@test.io",
        hashed_password=hash_password("testpass123"),
        role=UserRole.company_admin,
        is_active=True,
    )
    db.add(u)
    await db.flush()
    return u


@pytest.fixture
async def admin_token(admin_user):
    return create_access_token(admin_user)


@pytest.fixture
async def active_plan(db):
    plan = SubscriptionPlan(
        name="Starter",
        max_vehicles=5,
        price_ghs_month=Decimal("100.00"),
        price_ghs_annual=Decimal("1000.00"),
        is_active=True,
        sort_order=1,
    )
    db.add(plan)
    await db.flush()
    return plan


# ── Test class 1: TestBillingStatusGuard ──────────────────────────────────────


class TestBillingStatusGuard:
    @pytest.mark.asyncio
    async def test_select_plan_blocked_when_suspended(
        self, client, admin_token, db, company, active_plan
    ):
        company.subscription_status = "suspended"
        await db.flush()
        response = await client.post(
            "/api/v1/billing/select-plan",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={
                "plan_id": active_plan.id,
                "billing_cycle": "monthly",
                "billing_email": "billing@example.com",
            },
        )
        assert response.status_code == 403

    @pytest.mark.asyncio
    async def test_select_plan_blocked_when_cancelled(
        self, client, admin_token, db, company, active_plan
    ):
        company.subscription_status = "cancelled"
        await db.flush()
        response = await client.post(
            "/api/v1/billing/select-plan",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={
                "plan_id": active_plan.id,
                "billing_cycle": "monthly",
                "billing_email": "billing@example.com",
            },
        )
        assert response.status_code == 403

    @pytest.mark.asyncio
    async def test_setup_subaccount_blocked_when_suspended(self, client, admin_token, db, company):
        company.subscription_status = "suspended"
        await db.flush()
        response = await client.post(
            "/api/v1/billing/setup-subaccount",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={
                "bank_code": "030100",
                "account_number": "0012345678",
                "account_name": "Test Company",
            },
        )
        assert response.status_code == 403

    @pytest.mark.asyncio
    async def test_setup_subaccount_blocked_when_cancelled(self, client, admin_token, db, company):
        company.subscription_status = "cancelled"
        await db.flush()
        response = await client.post(
            "/api/v1/billing/setup-subaccount",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={
                "bank_code": "030100",
                "account_number": "0012345678",
                "account_name": "Test Company",
            },
        )
        assert response.status_code == 403

    @pytest.mark.asyncio
    async def test_cancel_blocked_when_suspended(self, client, admin_token, db, company):
        company.subscription_status = "suspended"
        await db.flush()
        response = await client.post(
            "/api/v1/billing/cancel",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert response.status_code == 403

    @pytest.mark.asyncio
    async def test_cancel_blocked_when_cancelled(self, client, admin_token, db, company):
        company.subscription_status = "cancelled"
        await db.flush()
        response = await client.post(
            "/api/v1/billing/cancel",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert response.status_code == 403


# ── Test class 2: TestSetupPaymentMethodCreateCustomer ────────────────────────


class TestSetupPaymentMethodCreateCustomer:
    @pytest.mark.asyncio
    async def test_create_customer_failure_returns_502(self, client, admin_token, db, company):
        with (
            patch(
                "app.routers.billing.verify_transaction",
                new=AsyncMock(
                    return_value={
                        "status": "success",
                        "authorization": {"authorization_code": "AUTH_testxyz"},
                    }
                ),
            ),
            patch(
                "app.routers.billing.create_customer",
                new=AsyncMock(return_value={}),
            ),
        ):
            response = await client.post(
                "/api/v1/billing/setup-payment-method",
                headers={"Authorization": f"Bearer {admin_token}"},
                json={"reference": "sub_test_ref001"},
            )
        assert response.status_code == 502

    @pytest.mark.asyncio
    async def test_create_customer_success_saves_customer_id(
        self, client, admin_token, db: AsyncSession, company
    ):
        with (
            patch(
                "app.routers.billing.verify_transaction",
                new=AsyncMock(
                    return_value={
                        "status": "success",
                        "authorization": {"authorization_code": "AUTH_testxyz"},
                    }
                ),
            ),
            patch(
                "app.routers.billing.create_customer",
                new=AsyncMock(return_value={"customer_code": "CUS_abc123"}),
            ),
        ):
            response = await client.post(
                "/api/v1/billing/setup-payment-method",
                headers={"Authorization": f"Bearer {admin_token}"},
                json={"reference": "sub_test_ref002"},
            )
        assert response.status_code == 200

        await db.refresh(company)
        assert company.paystack_customer_id == "CUS_abc123"


# ── Test class 3: TestSelectPlanEmailValidation ───────────────────────────────


class TestSelectPlanEmailValidation:
    @pytest.mark.asyncio
    async def test_invalid_email_returns_422(self, client, admin_token, active_plan):
        response = await client.post(
            "/api/v1/billing/select-plan",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={
                "plan_id": active_plan.id,
                "billing_cycle": "monthly",
                "billing_email": "not-an-email",
            },
        )
        assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_valid_email_accepted(self, client, admin_token, db, company, active_plan):
        response = await client.post(
            "/api/v1/billing/select-plan",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={
                "plan_id": active_plan.id,
                "billing_cycle": "monthly",
                "billing_email": "billing@example.com",
            },
        )
        assert response.status_code == 200
