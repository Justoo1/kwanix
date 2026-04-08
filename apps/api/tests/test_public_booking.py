"""
End-to-end integration tests for the public passenger booking flow.

Covers the full journey:
  search trip → book seat → webhook confirms payment → ticket marked paid
"""

import hashlib
import hmac
import json
from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.models.ticket import PaymentStatus, Ticket, TicketSource
from app.models.trip import Trip, TripStatus


class TestPublicBookingFlow:
    """End-to-end tests for the passenger booking journey."""

    # ── Local fixtures ─────────────────────────────────────────────────────────

    @pytest.fixture
    async def open_trip(self, db, company, vehicle, station_accra, station_prestea):
        """A scheduled trip with booking_open=True and a fare set."""
        trip = Trip(
            company_id=company.id,
            vehicle_id=vehicle.id,
            departure_station_id=station_accra.id,
            destination_station_id=station_prestea.id,
            departure_time=datetime.now(UTC) + timedelta(hours=3),
            status=TripStatus.scheduled,
            booking_open=True,
            price_ticket_base=50.0,
        )
        db.add(trip)
        await db.flush()
        return trip

    @pytest.fixture
    async def closed_trip(self, db, company, vehicle, station_accra, station_prestea):
        trip = Trip(
            company_id=company.id,
            vehicle_id=vehicle.id,
            departure_station_id=station_accra.id,
            destination_station_id=station_prestea.id,
            departure_time=datetime.now(UTC) + timedelta(hours=3),
            status=TripStatus.scheduled,
            booking_open=False,
            price_ticket_base=50.0,
        )
        db.add(trip)
        await db.flush()
        return trip

    @pytest.fixture
    async def paid_ticket(self, db, company, open_trip):
        """A ticket that has already been paid (holds seat 5)."""
        ticket = Ticket(
            company_id=company.id,
            trip_id=open_trip.id,
            passenger_name="Kwame Mensah",
            passenger_phone="233241234567",
            seat_number=5,
            fare_ghs=50.0,
            source=TicketSource.online,
            payment_status=PaymentStatus.paid,
            payment_ref="RP-TEST-PAID-001",
        )
        db.add(ticket)
        await db.flush()
        return ticket

    @pytest.fixture
    async def pending_ticket(self, db, company, open_trip):
        """A pending ticket with a payment_ref for webhook testing (seat 7)."""
        ticket = Ticket(
            company_id=company.id,
            trip_id=open_trip.id,
            passenger_name="Ama Boateng",
            passenger_phone="233501234567",
            seat_number=7,
            fare_ghs=50.0,
            source=TicketSource.online,
            payment_status=PaymentStatus.pending,
            payment_ref="RP-999-webhook01",
            booking_expires_at=datetime.now(UTC) + timedelta(minutes=15),
        )
        db.add(ticket)
        await db.flush()
        return ticket

    # ── S1-3: Search for open trips ────────────────────────────────────────────

    @pytest.mark.asyncio
    async def test_search_returns_open_trips(self, client, open_trip):
        response = await client.get("/api/v1/public/trips")
        assert response.status_code == 200
        trips = response.json()
        trip_ids = [t["id"] for t in trips]
        assert open_trip.id in trip_ids
        matched = next(t for t in trips if t["id"] == open_trip.id)
        assert matched["booking_open"] is True

    # ── S1-4: Book a seat ─────────────────────────────────────────────────────

    @pytest.mark.asyncio
    async def test_book_creates_ticket_and_returns_auth_url(self, client, open_trip):
        mock_response = MagicMock()
        mock_response.is_success = True
        mock_response.json.return_value = {
            "data": {
                "authorization_url": "https://checkout.paystack.com/test123",
                "access_code": "test_access",
                "reference": "RP-test-ref",
            }
        }

        mock_client_instance = AsyncMock()
        mock_client_instance.post.return_value = mock_response
        mock_context = MagicMock()
        mock_context.__aenter__ = AsyncMock(return_value=mock_client_instance)
        mock_context.__aexit__ = AsyncMock(return_value=False)

        with patch("app.integrations.paystack.httpx.AsyncClient", return_value=mock_context):
            response = await client.post(
                f"/api/v1/public/trips/{open_trip.id}/book",
                json={
                    "passenger_name": "Kofi Adu",
                    "passenger_phone": "0241234567",
                    "seat_number": 1,
                    "passenger_email": "kofi@test.com",
                },
            )

        assert response.status_code == 201
        body = response.json()
        assert "ticket_id" in body
        assert "authorization_url" in body
        assert body["authorization_url"] == "https://checkout.paystack.com/test123"

    # ── S1-5: Seat taken after booking ────────────────────────────────────────

    @pytest.mark.asyncio
    async def test_seat_taken_after_booking(self, client, open_trip, paid_ticket):
        """paid_ticket holds seat 5 — seat map must report it as taken."""
        response = await client.get(f"/api/v1/public/trips/{open_trip.id}/seats")
        assert response.status_code == 200
        body = response.json()
        assert paid_ticket.seat_number in body["taken"]

    # ── S1-6: Webhook confirms payment ────────────────────────────────────────

    @pytest.mark.asyncio
    async def test_webhook_confirms_payment_and_ticket_becomes_paid(
        self, client, db, pending_ticket
    ):
        payload = {
            "id": 55667788,
            "event": "charge.success",
            "data": {
                "reference": pending_ticket.payment_ref,
                "status": "success",
                "amount": 5000,
            },
        }
        body_bytes = json.dumps(payload).encode()
        # conftest patches paystack_secret_key to "" — compute HMAC with that
        sig = hmac.new(b"", body_bytes, hashlib.sha512).hexdigest()

        response = await client.post(
            "/api/v1/webhooks/paystack",
            content=body_bytes,
            headers={
                "Content-Type": "application/json",
                "x-paystack-signature": sig,
            },
        )
        assert response.status_code == 200
        assert response.json()["status"] in ("processed", "already_processed")

        # Re-query the ticket to verify payment_status was updated
        from sqlalchemy import select

        result = await db.execute(select(Ticket).where(Ticket.id == pending_ticket.id))
        ticket = result.scalar_one_or_none()
        assert ticket is not None
        assert ticket.payment_status == PaymentStatus.paid

    # ── S1-7: Paid ticket accessible via public endpoint ──────────────────────

    @pytest.mark.asyncio
    async def test_paid_ticket_accessible_via_public_endpoint(self, client, paid_ticket):
        response = await client.get(f"/api/v1/public/tickets/{paid_ticket.id}")
        assert response.status_code == 200
        body = response.json()
        assert body["payment_status"] == "paid"

    # ── S1-8: Booking closed trip returns 400 ─────────────────────────────────

    @pytest.mark.asyncio
    async def test_booking_closed_trip_returns_400(self, client, closed_trip):
        response = await client.post(
            f"/api/v1/public/trips/{closed_trip.id}/book",
            json={
                "passenger_name": "Test User",
                "passenger_phone": "0241234567",
                "seat_number": 1,
            },
        )
        assert response.status_code == 400

    # ── S1-9: Double booking same seat returns 409 ────────────────────────────

    @pytest.mark.asyncio
    async def test_double_booking_same_seat_returns_409(self, client, open_trip, paid_ticket):
        """paid_ticket holds seat 5; booking seat 5 again must return 409 SEAT_TAKEN."""
        mock_response = MagicMock()
        mock_response.is_success = True
        mock_response.json.return_value = {
            "data": {
                "authorization_url": "https://checkout.paystack.com/test456",
                "access_code": "test_access2",
                "reference": "RP-test-ref2",
            }
        }

        mock_client_instance = AsyncMock()
        mock_client_instance.post.return_value = mock_response
        mock_context = MagicMock()
        mock_context.__aenter__ = AsyncMock(return_value=mock_client_instance)
        mock_context.__aexit__ = AsyncMock(return_value=False)

        with patch("app.integrations.paystack.httpx.AsyncClient", return_value=mock_context):
            response = await client.post(
                f"/api/v1/public/trips/{open_trip.id}/book",
                json={
                    "passenger_name": "Second User",
                    "passenger_phone": "0551234567",
                    "seat_number": paid_ticket.seat_number,
                },
            )

        assert response.status_code == 409
        body = response.json()
        assert body["detail"]["code"] == "SEAT_TAKEN"
