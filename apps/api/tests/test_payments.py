"""
Integration tests for Phase 6 — Payments.

Step 25: POST /tickets/{id}/initiate-payment
Step 26: POST /webhooks/paystack (HMAC-verified callback)
"""

import hashlib
import hmac as _hmac
import json
from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.payment_event import PaymentEvent
from app.models.ticket import PaymentStatus, Ticket
from app.models.trip import Trip, TripStatus

# ── Local fixtures ─────────────────────────────────────────────────────────────


@pytest.fixture
async def loading_trip(db: AsyncSession, company, vehicle, station_accra, station_prestea):
    trip = Trip(
        company_id=company.id,
        vehicle_id=vehicle.id,
        departure_station_id=station_accra.id,
        destination_station_id=station_prestea.id,
        departure_time=datetime.now(UTC),
        status=TripStatus.loading,
    )
    db.add(trip)
    await db.flush()
    return trip


@pytest.fixture
async def pending_ticket(db: AsyncSession, company, loading_trip, clerk_user):
    ticket = Ticket(
        company_id=company.id,
        trip_id=loading_trip.id,
        created_by_id=clerk_user.id,
        passenger_name="Kwame Mensah",
        passenger_phone="233541234567",
        seat_number=3,
        fare_ghs=50.0,
    )
    db.add(ticket)
    await db.flush()
    return ticket


@pytest.fixture
async def paid_ticket(db: AsyncSession, company, loading_trip, clerk_user):
    ticket = Ticket(
        company_id=company.id,
        trip_id=loading_trip.id,
        created_by_id=clerk_user.id,
        passenger_name="Ama Owusu",
        passenger_phone="233207654321",
        seat_number=5,
        fare_ghs=45.0,
        payment_status=PaymentStatus.paid,
        payment_ref="RP-99-abc12345",
    )
    db.add(ticket)
    await db.flush()
    return ticket


def _paystack_sig(body: str) -> str:
    """Compute valid Paystack HMAC-SHA512 signature for test body."""
    return _hmac.new(
        settings.paystack_secret_key.encode(),
        body.encode(),
        hashlib.sha512,
    ).hexdigest()


def _fake_httpx_client(authorization_url: str = "https://checkout.paystack.com/fake_url"):
    """Returns a mock httpx.AsyncClient that returns a successful Paystack response."""
    mock_response = MagicMock()
    mock_response.is_success = True
    mock_response.json.return_value = {
        "status": True,
        "message": "Authorization URL created",
        "data": {
            "authorization_url": authorization_url,
            "access_code": "fake_access_code",
            "reference": "RP-1-fake0001",
        },
    }
    mock_client = AsyncMock()
    mock_client.post = AsyncMock(return_value=mock_response)
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)
    return mock_client


# ── Step 25: POST /tickets/{id}/initiate-payment ───────────────────────────────


class TestInitiatePayment:
    @pytest.mark.asyncio
    async def test_happy_path_returns_authorization_url(
        self, client, clerk_token, pending_ticket
    ):
        with patch(
            "app.integrations.paystack.httpx.AsyncClient",
            return_value=_fake_httpx_client(),
        ):
            response = await client.post(
                f"/api/v1/tickets/{pending_ticket.id}/initiate-payment",
                headers={"Authorization": f"Bearer {clerk_token}"},
                json={},
            )

        assert response.status_code == 200
        body = response.json()
        assert "authorization_url" in body
        assert body["authorization_url"] == "https://checkout.paystack.com/fake_url"
        assert "reference" in body
        assert body["reference"].startswith(f"RP-{pending_ticket.id}-")

    @pytest.mark.asyncio
    async def test_payment_ref_stored_on_ticket(
        self, client, clerk_token, pending_ticket, db: AsyncSession
    ):
        with patch(
            "app.integrations.paystack.httpx.AsyncClient",
            return_value=_fake_httpx_client(),
        ):
            response = await client.post(
                f"/api/v1/tickets/{pending_ticket.id}/initiate-payment",
                headers={"Authorization": f"Bearer {clerk_token}"},
                json={},
            )

        assert response.status_code == 200
        returned_ref = response.json()["reference"]

        result = await db.execute(select(Ticket).where(Ticket.id == pending_ticket.id))
        ticket = result.scalar_one()
        assert ticket.payment_ref == returned_ref

    @pytest.mark.asyncio
    async def test_custom_email_accepted(
        self, client, clerk_token, pending_ticket, db: AsyncSession
    ):
        captured = {}

        async def mock_post(url, **kwargs):
            captured["payload"] = kwargs.get("json", {})
            mock_response = MagicMock()
            mock_response.is_success = True
            mock_response.json.return_value = {
                "data": {
                    "authorization_url": "https://checkout.paystack.com/x",
                    "access_code": "ac",
                    "reference": "ref",
                }
            }
            return mock_response

        mock_client = AsyncMock()
        mock_client.post = mock_post
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)

        with patch("app.integrations.paystack.httpx.AsyncClient", return_value=mock_client):
            response = await client.post(
                f"/api/v1/tickets/{pending_ticket.id}/initiate-payment",
                headers={"Authorization": f"Bearer {clerk_token}"},
                json={"email": "kwame@example.com"},
            )

        assert response.status_code == 200
        assert captured["payload"]["email"] == "kwame@example.com"

    @pytest.mark.asyncio
    async def test_ticket_not_found_returns_404(self, client, clerk_token):
        response = await client.post(
            "/api/v1/tickets/99999/initiate-payment",
            headers={"Authorization": f"Bearer {clerk_token}"},
            json={},
        )
        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_already_paid_ticket_returns_400(self, client, clerk_token, paid_ticket):
        response = await client.post(
            f"/api/v1/tickets/{paid_ticket.id}/initiate-payment",
            headers={"Authorization": f"Bearer {clerk_token}"},
            json={},
        )
        assert response.status_code == 400

    @pytest.mark.asyncio
    async def test_unauthenticated_returns_401(self, client, pending_ticket):
        response = await client.post(
            f"/api/v1/tickets/{pending_ticket.id}/initiate-payment",
            json={},
        )
        assert response.status_code == 401

    @pytest.mark.asyncio
    async def test_paystack_error_returns_502(self, client, clerk_token, pending_ticket):
        mock_response = MagicMock()
        mock_response.is_success = False
        mock_response.status_code = 401
        mock_response.text = "Unauthorized"

        mock_client = AsyncMock()
        mock_client.post = AsyncMock(return_value=mock_response)
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)

        with patch("app.integrations.paystack.httpx.AsyncClient", return_value=mock_client):
            response = await client.post(
                f"/api/v1/tickets/{pending_ticket.id}/initiate-payment",
                headers={"Authorization": f"Bearer {clerk_token}"},
                json={},
            )

        assert response.status_code == 502


# ── Step 26: POST /webhooks/paystack ──────────────────────────────────────────


class TestPaystackWebhook:
    def _build_charge_event(
        self,
        event_type: str,
        ticket: Ticket,
        event_id: int = 1001,
    ) -> tuple[str, str]:
        """Returns (body_str, signature) for a Paystack charge event."""
        payload = {
            "id": event_id,
            "event": event_type,
            "data": {
                "id": event_id,
                "reference": ticket.payment_ref or f"RP-{ticket.id}-test0001",
                "amount": int(ticket.fare_ghs * 100),
                "status": "success" if event_type == "charge.success" else "failed",
            },
        }
        body = json.dumps(payload)
        sig = _paystack_sig(body)
        return body, sig

    @pytest.mark.asyncio
    async def test_charge_success_sets_ticket_paid(
        self, client, pending_ticket, db: AsyncSession
    ):
        pending_ticket.payment_ref = f"RP-{pending_ticket.id}-abc00001"
        await db.flush()

        body, sig = self._build_charge_event("charge.success", pending_ticket)
        response = await client.post(
            "/api/v1/webhooks/paystack",
            content=body,
            headers={
                "Content-Type": "application/json",
                "X-Paystack-Signature": sig,
            },
        )

        assert response.status_code == 200
        result = await db.execute(select(Ticket).where(Ticket.id == pending_ticket.id))
        ticket = result.scalar_one()
        assert ticket.payment_status == PaymentStatus.paid

    @pytest.mark.asyncio
    async def test_charge_failed_sets_ticket_failed(
        self, client, pending_ticket, db: AsyncSession
    ):
        pending_ticket.payment_ref = f"RP-{pending_ticket.id}-abc00002"
        await db.flush()

        body, sig = self._build_charge_event(
            "charge.failed", pending_ticket, event_id=2002
        )
        response = await client.post(
            "/api/v1/webhooks/paystack",
            content=body,
            headers={
                "Content-Type": "application/json",
                "X-Paystack-Signature": sig,
            },
        )

        assert response.status_code == 200
        result = await db.execute(select(Ticket).where(Ticket.id == pending_ticket.id))
        ticket = result.scalar_one()
        assert ticket.payment_status == PaymentStatus.failed

    @pytest.mark.asyncio
    async def test_invalid_hmac_returns_400(self, client, pending_ticket):
        payload = json.dumps({"id": 9999, "event": "charge.success", "data": {}})
        response = await client.post(
            "/api/v1/webhooks/paystack",
            content=payload,
            headers={
                "Content-Type": "application/json",
                "X-Paystack-Signature": "invalid_signature_hex",
            },
        )
        assert response.status_code == 400

    @pytest.mark.asyncio
    async def test_duplicate_event_returns_200_no_double_update(
        self, client, pending_ticket, db: AsyncSession
    ):
        pending_ticket.payment_ref = f"RP-{pending_ticket.id}-abc00003"
        await db.flush()

        # Pre-insert the payment event to simulate prior processing
        existing_event = PaymentEvent(
            ticket_id=pending_ticket.id,
            provider_event_id="3003",
            provider="paystack",
            event_type="charge.success",
            status="success",
            raw_payload="{}",
            received_at=datetime.now(UTC),
        )
        db.add(existing_event)
        await db.flush()

        # Now send the "duplicate" webhook
        payload = {
            "id": 3003,
            "event": "charge.success",
            "data": {
                "id": 3003,
                "reference": pending_ticket.payment_ref,
                "amount": int(pending_ticket.fare_ghs * 100),
                "status": "success",
            },
        }
        body = json.dumps(payload)
        sig = _paystack_sig(body)

        response = await client.post(
            "/api/v1/webhooks/paystack",
            content=body,
            headers={
                "Content-Type": "application/json",
                "X-Paystack-Signature": sig,
            },
        )

        assert response.status_code == 200
        assert response.json()["status"] == "already_processed"

        # Ticket should still be pending — not double-updated
        result = await db.execute(select(Ticket).where(Ticket.id == pending_ticket.id))
        ticket = result.scalar_one()
        assert ticket.payment_status == PaymentStatus.pending

    @pytest.mark.asyncio
    async def test_unknown_event_type_returns_200_no_action(
        self, client, pending_ticket, db: AsyncSession
    ):
        pending_ticket.payment_ref = f"RP-{pending_ticket.id}-abc00004"
        await db.flush()

        payload = {
            "id": 4004,
            "event": "subscription.create",
            "data": {
                "id": 4004,
                "reference": pending_ticket.payment_ref,
            },
        }
        body = json.dumps(payload)
        sig = _paystack_sig(body)

        response = await client.post(
            "/api/v1/webhooks/paystack",
            content=body,
            headers={
                "Content-Type": "application/json",
                "X-Paystack-Signature": sig,
            },
        )

        assert response.status_code == 200
        result = await db.execute(select(Ticket).where(Ticket.id == pending_ticket.id))
        ticket = result.scalar_one()
        assert ticket.payment_status == PaymentStatus.pending
