"""
Tests for Phase J features:
  J1 — Ticket Cancellation & Refund
  J2 — Parcel Declared Value
  J3 — Multi-stop Trip Support
  J4 — SMS Opt-out Preferences
"""

from datetime import UTC, datetime

import pytest

from app.models.ticket import PaymentStatus, Ticket, TicketSource, TicketStatus
from app.models.trip import Trip, TripStatus
from app.models.user import User, UserRole
from app.services.auth_service import create_access_token, hash_password

# ── Local fixtures ────────────────────────────────────────────────────────────


@pytest.fixture
async def manager_user(db, company, station_accra):
    u = User(
        company_id=company.id,
        station_id=station_accra.id,
        full_name="J Manager",
        phone="233207001001",
        email="jmanager@test.io",
        hashed_password=hash_password("pass123"),
        role=UserRole.station_manager,
    )
    db.add(u)
    await db.flush()
    return u


@pytest.fixture
async def manager_token(manager_user):
    return create_access_token(manager_user)


@pytest.fixture
async def loading_trip(db, company, vehicle, station_accra, station_prestea):
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
async def valid_ticket(db, company, loading_trip, clerk_user):
    t = Ticket(
        company_id=company.id,
        trip_id=loading_trip.id,
        created_by_id=clerk_user.id,
        passenger_name="Kwame Mensah",
        passenger_phone="233541234567",
        seat_number=5,
        fare_ghs=30.0,
        source=TicketSource.counter,
        payment_status=PaymentStatus.pending,
    )
    db.add(t)
    await db.flush()
    return t


@pytest.fixture
async def paid_ticket(db, company, loading_trip, clerk_user):
    t = Ticket(
        company_id=company.id,
        trip_id=loading_trip.id,
        created_by_id=clerk_user.id,
        passenger_name="Ama Boateng",
        passenger_phone="233541234568",
        seat_number=6,
        fare_ghs=30.0,
        source=TicketSource.counter,
        payment_status=PaymentStatus.paid,
        payment_ref="RP-test-ref-001",
    )
    db.add(t)
    await db.flush()
    return t


# ── J1: Ticket Cancellation ──────────────────────────────────────────────────���


class TestTicketCancellation:
    @pytest.mark.asyncio
    async def test_clerk_can_cancel_pending_ticket(self, client, clerk_token, valid_ticket):
        response = await client.patch(
            f"/api/v1/tickets/{valid_ticket.id}/cancel",
            headers={"Authorization": f"Bearer {clerk_token}"},
        )
        assert response.status_code == 200
        body = response.json()
        assert body["status"] == "cancelled"
        assert body["payment_status"] == "pending"

    @pytest.mark.asyncio
    async def test_cancel_already_cancelled_returns_400(
        self, client, clerk_token, db, valid_ticket
    ):
        valid_ticket.status = TicketStatus.cancelled
        await db.flush()
        response = await client.patch(
            f"/api/v1/tickets/{valid_ticket.id}/cancel",
            headers={"Authorization": f"Bearer {clerk_token}"},
        )
        assert response.status_code == 400

    @pytest.mark.asyncio
    async def test_cancel_paid_ticket_sets_refunded(self, client, clerk_token, paid_ticket):
        """Paystack key is blank in tests so refund is skipped; ticket cancelled successfully."""
        response = await client.patch(
            f"/api/v1/tickets/{paid_ticket.id}/cancel",
            headers={"Authorization": f"Bearer {clerk_token}"},
        )
        assert response.status_code == 200
        body = response.json()
        assert body["status"] == "cancelled"
        assert body["payment_status"] == "refunded"

    @pytest.mark.asyncio
    async def test_cancel_nonexistent_ticket_returns_404(self, client, clerk_token):
        response = await client.patch(
            "/api/v1/tickets/99999/cancel",
            headers={"Authorization": f"Bearer {clerk_token}"},
        )
        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_unauthenticated_cancel_returns_401(self, client, valid_ticket):
        response = await client.patch(f"/api/v1/tickets/{valid_ticket.id}/cancel")
        assert response.status_code == 401


# ── J2: Parcel Declared Value ───────────────────────────────────────────────��─


class TestParcelDeclaredValue:
    @pytest.mark.asyncio
    async def test_create_parcel_with_declared_value(
        self, client, clerk_token, station_accra, station_prestea, tracking_seq
    ):
        response = await client.post(
            "/api/v1/parcels",
            headers={"Authorization": f"Bearer {clerk_token}"},
            json={
                "sender_name": "Kofi",
                "sender_phone": "0241234567",
                "receiver_name": "Ama",
                "receiver_phone": "0541234568",
                "origin_station_id": station_accra.id,
                "destination_station_id": station_prestea.id,
                "fee_ghs": 5.0,
                "declared_value_ghs": 250.0,
            },
        )
        assert response.status_code == 201
        body = response.json()
        assert body["declared_value_ghs"] == 250.0

    @pytest.mark.asyncio
    async def test_create_parcel_without_declared_value_defaults_null(
        self, client, clerk_token, station_accra, station_prestea, tracking_seq
    ):
        response = await client.post(
            "/api/v1/parcels",
            headers={"Authorization": f"Bearer {clerk_token}"},
            json={
                "sender_name": "Kwesi",
                "sender_phone": "0241234569",
                "receiver_name": "Abena",
                "receiver_phone": "0541234570",
                "origin_station_id": station_accra.id,
                "destination_station_id": station_prestea.id,
                "fee_ghs": 3.0,
            },
        )
        assert response.status_code == 201
        assert response.json()["declared_value_ghs"] is None


# ── J3: Multi-stop Trip Support ───────────────────────────────────────────────


class TestTripStops:
    @pytest.mark.asyncio
    async def test_manager_can_add_stop(self, client, manager_token, loading_trip, station_accra):
        response = await client.post(
            f"/api/v1/trips/{loading_trip.id}/stops",
            headers={"Authorization": f"Bearer {manager_token}"},
            json={
                "station_id": station_accra.id,
                "sequence_order": 1,
                "eta": None,
            },
        )
        assert response.status_code == 201
        body = response.json()
        assert body["sequence_order"] == 1
        assert body["trip_id"] == loading_trip.id
        assert body["station_name"] == station_accra.name

    @pytest.mark.asyncio
    async def test_manager_can_list_stops(
        self, client, manager_token, loading_trip, station_accra, station_prestea
    ):
        # Add two stops
        for seq, station in [(1, station_accra), (2, station_prestea)]:
            await client.post(
                f"/api/v1/trips/{loading_trip.id}/stops",
                headers={"Authorization": f"Bearer {manager_token}"},
                json={"station_id": station.id, "sequence_order": seq},
            )

        response = await client.get(
            f"/api/v1/trips/{loading_trip.id}/stops",
            headers={"Authorization": f"Bearer {manager_token}"},
        )
        assert response.status_code == 200
        stops = response.json()
        assert len(stops) == 2
        assert stops[0]["sequence_order"] == 1
        assert stops[1]["sequence_order"] == 2

    @pytest.mark.asyncio
    async def test_clerk_cannot_add_stop(self, client, clerk_token, loading_trip, station_accra):
        response = await client.post(
            f"/api/v1/trips/{loading_trip.id}/stops",
            headers={"Authorization": f"Bearer {clerk_token}"},
            json={"station_id": station_accra.id, "sequence_order": 1},
        )
        assert response.status_code == 403

    @pytest.mark.asyncio
    async def test_stops_for_nonexistent_trip_returns_404(self, client, manager_token):
        response = await client.get(
            "/api/v1/trips/99999/stops",
            headers={"Authorization": f"Bearer {manager_token}"},
        )
        assert response.status_code == 404


# ── J4: SMS Opt-out Preferences ───────────────────────────────────────────────


class TestSmsPreferences:
    @pytest.mark.asyncio
    async def test_user_can_opt_out(self, client, clerk_token):
        response = await client.patch(
            "/api/v1/auth/sms-preferences",
            headers={"Authorization": f"Bearer {clerk_token}"},
            json={"sms_opt_out": True},
        )
        assert response.status_code == 200
        assert response.json()["sms_opt_out"] is True

    @pytest.mark.asyncio
    async def test_user_can_opt_back_in(self, client, clerk_token):
        await client.patch(
            "/api/v1/auth/sms-preferences",
            headers={"Authorization": f"Bearer {clerk_token}"},
            json={"sms_opt_out": True},
        )
        response = await client.patch(
            "/api/v1/auth/sms-preferences",
            headers={"Authorization": f"Bearer {clerk_token}"},
            json={"sms_opt_out": False},
        )
        assert response.status_code == 200
        assert response.json()["sms_opt_out"] is False

    @pytest.mark.asyncio
    async def test_me_endpoint_includes_sms_opt_out(self, client, clerk_token):
        response = await client.get(
            "/api/v1/auth/me",
            headers={"Authorization": f"Bearer {clerk_token}"},
        )
        assert response.status_code == 200
        assert "sms_opt_out" in response.json()

    @pytest.mark.asyncio
    async def test_unauthenticated_sms_preferences_returns_401(self, client):
        response = await client.patch(
            "/api/v1/auth/sms-preferences",
            json={"sms_opt_out": True},
        )
        assert response.status_code == 401
