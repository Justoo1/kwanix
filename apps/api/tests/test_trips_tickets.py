"""
Integration tests for Phase 5 — Trips + Tickets CRUD.

Steps 22–24: trip CRUD, status transitions, ticket creation with seat
conflict prevention, and trip manifest PDF download.
"""
from datetime import UTC, datetime

import pytest

from app.models.ticket import Ticket
from app.models.trip import Trip, TripStatus
from app.models.user import User, UserRole
from app.services.auth_service import create_access_token, hash_password

# ── Local fixtures ─────────────────────────────────────────────────────────────


@pytest.fixture
async def manager_user(db, company, station_accra):
    u = User(
        company_id=company.id,
        station_id=station_accra.id,
        full_name="Test Manager",
        phone="233207654321",
        email="manager@test.io",
        hashed_password=hash_password("testpass123"),
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


# ── Step 22: Trip CRUD ─────────────────────────────────────────────────────────


class TestCreateTrip:
    @pytest.mark.asyncio
    async def test_manager_can_create_trip(
        self, client, manager_token, vehicle, station_accra, station_prestea
    ):
        response = await client.post(
            "/api/v1/trips",
            headers={"Authorization": f"Bearer {manager_token}"},
            json={
                "vehicle_id": vehicle.id,
                "departure_station_id": station_accra.id,
                "destination_station_id": station_prestea.id,
                "departure_time": "2026-04-01T08:00:00Z",
            },
        )
        assert response.status_code == 201
        body = response.json()
        assert body["status"] == "scheduled"
        assert body["vehicle_plate"] == vehicle.plate_number
        assert body["departure_station_name"] == station_accra.name
        assert body["destination_station_name"] == station_prestea.name
        assert body["parcel_count"] == 0

    @pytest.mark.asyncio
    async def test_clerk_cannot_create_trip(
        self, client, clerk_token, vehicle, station_accra, station_prestea
    ):
        response = await client.post(
            "/api/v1/trips",
            headers={"Authorization": f"Bearer {clerk_token}"},
            json={
                "vehicle_id": vehicle.id,
                "departure_station_id": station_accra.id,
                "destination_station_id": station_prestea.id,
                "departure_time": "2026-04-01T08:00:00Z",
            },
        )
        assert response.status_code == 403

    @pytest.mark.asyncio
    async def test_create_trip_unauthenticated_returns_401(self, client):
        response = await client.post("/api/v1/trips", json={})
        assert response.status_code == 401


class TestListTrips:
    @pytest.mark.asyncio
    async def test_list_trips_returns_enriched_fields(
        self, client, clerk_token, loading_trip
    ):
        response = await client.get(
            "/api/v1/trips",
            headers={"Authorization": f"Bearer {clerk_token}"},
        )
        assert response.status_code == 200
        trips = response.json()
        assert len(trips) >= 1
        first = trips[0]
        assert "vehicle_plate" in first
        assert "departure_station_name" in first
        assert "destination_station_name" in first
        assert "parcel_count" in first

    @pytest.mark.asyncio
    async def test_filter_by_status_loading(
        self, client, clerk_token, loading_trip, db, company, vehicle,
        station_accra, station_prestea
    ):
        # Add a scheduled trip alongside the loading one
        scheduled = Trip(
            company_id=company.id,
            vehicle_id=vehicle.id,
            departure_station_id=station_accra.id,
            destination_station_id=station_prestea.id,
            departure_time=datetime.now(UTC),
            status=TripStatus.scheduled,
        )
        db.add(scheduled)
        await db.flush()

        response = await client.get(
            "/api/v1/trips?status=loading",
            headers={"Authorization": f"Bearer {clerk_token}"},
        )
        assert response.status_code == 200
        assert all(t["status"] == "loading" for t in response.json())

    @pytest.mark.asyncio
    async def test_filter_by_status_scheduled(
        self, client, clerk_token, db, company, vehicle, station_accra, station_prestea
    ):
        scheduled = Trip(
            company_id=company.id,
            vehicle_id=vehicle.id,
            departure_station_id=station_accra.id,
            destination_station_id=station_prestea.id,
            departure_time=datetime.now(UTC),
            status=TripStatus.scheduled,
        )
        db.add(scheduled)
        await db.flush()

        response = await client.get(
            "/api/v1/trips?status=scheduled",
            headers={"Authorization": f"Bearer {clerk_token}"},
        )
        assert response.status_code == 200
        assert all(t["status"] == "scheduled" for t in response.json())


class TestGetTrip:
    @pytest.mark.asyncio
    async def test_get_trip_returns_full_detail(
        self, client, clerk_token, loading_trip, vehicle, station_accra, station_prestea
    ):
        response = await client.get(
            f"/api/v1/trips/{loading_trip.id}",
            headers={"Authorization": f"Bearer {clerk_token}"},
        )
        assert response.status_code == 200
        body = response.json()
        assert body["id"] == loading_trip.id
        assert body["status"] == "loading"
        assert body["vehicle_plate"] == vehicle.plate_number
        assert body["departure_station_name"] == station_accra.name
        assert body["destination_station_name"] == station_prestea.name

    @pytest.mark.asyncio
    async def test_get_nonexistent_trip_returns_404(self, client, clerk_token):
        response = await client.get(
            "/api/v1/trips/99999",
            headers={"Authorization": f"Bearer {clerk_token}"},
        )
        assert response.status_code == 404


# ── Step 22: Status transitions ────────────────────────────────────────────────


class TestTripStatusTransitions:
    @pytest.mark.asyncio
    async def test_scheduled_to_loading(
        self, client, manager_token, db, company, vehicle, station_accra, station_prestea
    ):
        trip = Trip(
            company_id=company.id,
            vehicle_id=vehicle.id,
            departure_station_id=station_accra.id,
            destination_station_id=station_prestea.id,
            departure_time=datetime.now(UTC),
            status=TripStatus.scheduled,
        )
        db.add(trip)
        await db.flush()

        response = await client.patch(
            f"/api/v1/trips/{trip.id}/status",
            headers={"Authorization": f"Bearer {manager_token}"},
            json={"status": "loading"},
        )
        assert response.status_code == 200
        assert response.json()["status"] == "loading"

    @pytest.mark.asyncio
    async def test_loading_to_departed(
        self, client, manager_token, loading_trip
    ):
        response = await client.patch(
            f"/api/v1/trips/{loading_trip.id}/status",
            headers={"Authorization": f"Bearer {manager_token}"},
            json={"status": "departed"},
        )
        assert response.status_code == 200
        assert response.json()["status"] == "departed"

    @pytest.mark.asyncio
    async def test_departed_to_arrived(
        self, client, manager_token, db, company, vehicle, station_accra, station_prestea
    ):
        trip = Trip(
            company_id=company.id,
            vehicle_id=vehicle.id,
            departure_station_id=station_accra.id,
            destination_station_id=station_prestea.id,
            departure_time=datetime.now(UTC),
            status=TripStatus.departed,
        )
        db.add(trip)
        await db.flush()

        response = await client.patch(
            f"/api/v1/trips/{trip.id}/status",
            headers={"Authorization": f"Bearer {manager_token}"},
            json={"status": "arrived"},
        )
        assert response.status_code == 200
        assert response.json()["status"] == "arrived"

    @pytest.mark.asyncio
    async def test_any_to_cancelled(self, client, manager_token, loading_trip):
        response = await client.patch(
            f"/api/v1/trips/{loading_trip.id}/status",
            headers={"Authorization": f"Bearer {manager_token}"},
            json={"status": "cancelled"},
        )
        assert response.status_code == 200
        assert response.json()["status"] == "cancelled"

    @pytest.mark.asyncio
    async def test_invalid_transition_loading_to_scheduled_returns_400(
        self, client, manager_token, loading_trip
    ):
        response = await client.patch(
            f"/api/v1/trips/{loading_trip.id}/status",
            headers={"Authorization": f"Bearer {manager_token}"},
            json={"status": "scheduled"},
        )
        assert response.status_code == 400

    @pytest.mark.asyncio
    async def test_invalid_transition_scheduled_to_arrived_returns_400(
        self, client, manager_token, db, company, vehicle, station_accra, station_prestea
    ):
        trip = Trip(
            company_id=company.id,
            vehicle_id=vehicle.id,
            departure_station_id=station_accra.id,
            destination_station_id=station_prestea.id,
            departure_time=datetime.now(UTC),
            status=TripStatus.scheduled,
        )
        db.add(trip)
        await db.flush()

        response = await client.patch(
            f"/api/v1/trips/{trip.id}/status",
            headers={"Authorization": f"Bearer {manager_token}"},
            json={"status": "arrived"},
        )
        assert response.status_code == 400

    @pytest.mark.asyncio
    async def test_cancelled_trip_cannot_transition_returns_400(
        self, client, manager_token, db, company, vehicle, station_accra, station_prestea
    ):
        trip = Trip(
            company_id=company.id,
            vehicle_id=vehicle.id,
            departure_station_id=station_accra.id,
            destination_station_id=station_prestea.id,
            departure_time=datetime.now(UTC),
            status=TripStatus.cancelled,
        )
        db.add(trip)
        await db.flush()

        response = await client.patch(
            f"/api/v1/trips/{trip.id}/status",
            headers={"Authorization": f"Bearer {manager_token}"},
            json={"status": "loading"},
        )
        assert response.status_code == 400

    @pytest.mark.asyncio
    async def test_clerk_cannot_change_status_returns_403(
        self, client, clerk_token, loading_trip
    ):
        response = await client.patch(
            f"/api/v1/trips/{loading_trip.id}/status",
            headers={"Authorization": f"Bearer {clerk_token}"},
            json={"status": "departed"},
        )
        assert response.status_code == 403


# ── Step 23: Ticket creation ───────────────────────────────────────────────────


class TestCreateTicket:
    @pytest.mark.asyncio
    async def test_happy_path_returns_201(self, client, clerk_token, loading_trip):
        response = await client.post(
            "/api/v1/tickets",
            headers={"Authorization": f"Bearer {clerk_token}"},
            json={
                "trip_id": loading_trip.id,
                "passenger_name": "Kofi Mensah",
                "passenger_phone": "0541234567",
                "seat_number": 5,
                "fare_ghs": 45.0,
            },
        )
        assert response.status_code == 201
        body = response.json()
        assert body["seat_number"] == 5
        assert body["passenger_name"] == "Kofi Mensah"
        assert body["passenger_phone"] == "233541234567"  # normalized
        assert body["status"] == "valid"
        assert body["payment_status"] == "pending"

    @pytest.mark.asyncio
    async def test_duplicate_seat_returns_409_seat_taken(
        self, client, clerk_token, loading_trip, db, company, clerk_user
    ):
        existing = Ticket(
            company_id=company.id,
            trip_id=loading_trip.id,
            created_by_id=clerk_user.id,
            passenger_name="Already Seated",
            passenger_phone="233541234567",
            seat_number=10,
            fare_ghs=45.0,
        )
        db.add(existing)
        await db.flush()

        response = await client.post(
            "/api/v1/tickets",
            headers={"Authorization": f"Bearer {clerk_token}"},
            json={
                "trip_id": loading_trip.id,
                "passenger_name": "New Passenger",
                "passenger_phone": "0249876543",
                "seat_number": 10,  # same seat
                "fare_ghs": 45.0,
            },
        )
        assert response.status_code == 409
        assert response.json()["detail"]["code"] == "SEAT_TAKEN"

    @pytest.mark.asyncio
    async def test_trip_not_loading_returns_400(
        self, client, clerk_token, db, company, vehicle, station_accra, station_prestea
    ):
        scheduled_trip = Trip(
            company_id=company.id,
            vehicle_id=vehicle.id,
            departure_station_id=station_accra.id,
            destination_station_id=station_prestea.id,
            departure_time=datetime.now(UTC),
            status=TripStatus.scheduled,
        )
        db.add(scheduled_trip)
        await db.flush()

        response = await client.post(
            "/api/v1/tickets",
            headers={"Authorization": f"Bearer {clerk_token}"},
            json={
                "trip_id": scheduled_trip.id,
                "passenger_name": "Kofi",
                "passenger_phone": "0541234567",
                "seat_number": 1,
                "fare_ghs": 45.0,
            },
        )
        assert response.status_code == 400

    @pytest.mark.asyncio
    async def test_departed_trip_returns_400(
        self, client, clerk_token, db, company, vehicle, station_accra, station_prestea
    ):
        departed_trip = Trip(
            company_id=company.id,
            vehicle_id=vehicle.id,
            departure_station_id=station_accra.id,
            destination_station_id=station_prestea.id,
            departure_time=datetime.now(UTC),
            status=TripStatus.departed,
        )
        db.add(departed_trip)
        await db.flush()

        response = await client.post(
            "/api/v1/tickets",
            headers={"Authorization": f"Bearer {clerk_token}"},
            json={
                "trip_id": departed_trip.id,
                "passenger_name": "Kofi",
                "passenger_phone": "0541234567",
                "seat_number": 2,
                "fare_ghs": 45.0,
            },
        )
        assert response.status_code == 400

    @pytest.mark.asyncio
    async def test_invalid_gh_phone_returns_422(self, client, clerk_token, loading_trip):
        response = await client.post(
            "/api/v1/tickets",
            headers={"Authorization": f"Bearer {clerk_token}"},
            json={
                "trip_id": loading_trip.id,
                "passenger_name": "Kofi",
                "passenger_phone": "0301234567",  # invalid Ghana prefix
                "seat_number": 3,
                "fare_ghs": 45.0,
            },
        )
        assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_nonexistent_trip_returns_404(self, client, clerk_token):
        response = await client.post(
            "/api/v1/tickets",
            headers={"Authorization": f"Bearer {clerk_token}"},
            json={
                "trip_id": 999999,
                "passenger_name": "Kofi",
                "passenger_phone": "0541234567",
                "seat_number": 1,
                "fare_ghs": 45.0,
            },
        )
        assert response.status_code == 404


class TestGetTicket:
    @pytest.mark.asyncio
    async def test_get_ticket_returns_200(
        self, client, clerk_token, loading_trip, db, company, clerk_user
    ):
        ticket = Ticket(
            company_id=company.id,
            trip_id=loading_trip.id,
            created_by_id=clerk_user.id,
            passenger_name="Abena Test",
            passenger_phone="233541234567",
            seat_number=7,
            fare_ghs=50.0,
        )
        db.add(ticket)
        await db.flush()

        response = await client.get(
            f"/api/v1/tickets/{ticket.id}",
            headers={"Authorization": f"Bearer {clerk_token}"},
        )
        assert response.status_code == 200
        body = response.json()
        assert body["seat_number"] == 7
        assert body["passenger_name"] == "Abena Test"

    @pytest.mark.asyncio
    async def test_get_nonexistent_ticket_returns_404(self, client, clerk_token):
        response = await client.get(
            "/api/v1/tickets/99999",
            headers={"Authorization": f"Bearer {clerk_token}"},
        )
        assert response.status_code == 404


# ── Step 24: Trip manifest PDF ─────────────────────────────────────────────────


class TestTripManifest:
    @pytest.mark.asyncio
    async def test_manifest_returns_pdf_bytes(
        self, client, manager_token, loading_trip
    ):
        response = await client.get(
            f"/api/v1/trips/{loading_trip.id}/manifest",
            headers={"Authorization": f"Bearer {manager_token}"},
        )
        assert response.status_code == 200
        assert "application/pdf" in response.headers["content-type"]
        assert len(response.content) > 0

    @pytest.mark.asyncio
    async def test_manifest_with_passengers_is_non_empty(
        self, client, manager_token, loading_trip, db, company, clerk_user
    ):
        # Add a ticket first
        ticket = Ticket(
            company_id=company.id,
            trip_id=loading_trip.id,
            created_by_id=clerk_user.id,
            passenger_name="Manifest Passenger",
            passenger_phone="233541234567",
            seat_number=1,
            fare_ghs=40.0,
        )
        db.add(ticket)
        await db.flush()

        response = await client.get(
            f"/api/v1/trips/{loading_trip.id}/manifest",
            headers={"Authorization": f"Bearer {manager_token}"},
        )
        assert response.status_code == 200
        assert len(response.content) > 1000  # real PDF with content

    @pytest.mark.asyncio
    async def test_clerk_cannot_get_manifest_returns_403(
        self, client, clerk_token, loading_trip
    ):
        response = await client.get(
            f"/api/v1/trips/{loading_trip.id}/manifest",
            headers={"Authorization": f"Bearer {clerk_token}"},
        )
        assert response.status_code == 403

    @pytest.mark.asyncio
    async def test_manifest_nonexistent_trip_returns_404(self, client, manager_token):
        response = await client.get(
            "/api/v1/trips/99999/manifest",
            headers={"Authorization": f"Bearer {manager_token}"},
        )
        assert response.status_code == 404
