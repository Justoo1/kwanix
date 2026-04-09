"""
Phase L integration tests.

L1: Vehicle Maintenance Log
L2: Passenger Manifest CSV
L3: Parcel Batch Unload
L4: Company Daily Stats
L5: Parcel Return Reason in tracking
"""

from datetime import UTC, datetime

import pytest

from app.models.parcel import Parcel, ParcelStatus
from app.models.ticket import PaymentStatus, Ticket, TicketSource, TicketStatus
from app.models.trip import Trip, TripStatus
from app.models.user import User, UserRole
from app.services.auth_service import create_access_token, hash_password

# ── Shared fixtures ────────────────────────────────────────────────────────────


@pytest.fixture
async def manager_user(db, company, station_accra):
    u = User(
        company_id=company.id,
        station_id=station_accra.id,
        full_name="Phase L Manager",
        phone="233209990001",
        email="manager_l@test.io",
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
async def admin_user(db, company, station_accra):
    u = User(
        company_id=company.id,
        station_id=station_accra.id,
        full_name="Phase L Admin",
        phone="233209990002",
        email="admin_l@test.io",
        hashed_password=hash_password("testpass123"),
        role=UserRole.company_admin,
    )
    db.add(u)
    await db.flush()
    return u


@pytest.fixture
async def admin_token(admin_user):
    return create_access_token(admin_user)


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
async def in_transit_parcel(db, company, station_accra, station_prestea, clerk_user, loading_trip):
    p = Parcel(
        company_id=company.id,
        tracking_number="KX-TST-L-00001",
        sender_name="Kweku Send",
        sender_phone="233541110001",
        receiver_name="Ama Recv",
        receiver_phone="233541110002",
        origin_station_id=station_accra.id,
        destination_station_id=station_prestea.id,
        fee_ghs=10.0,
        created_by_id=clerk_user.id,
        status=ParcelStatus.in_transit,
        current_trip_id=loading_trip.id,
    )
    db.add(p)
    await db.flush()
    return p


# ── L1: Vehicle Maintenance Log ────────────────────────────────────────────────


class TestVehicleMaintenance:
    @pytest.mark.asyncio
    async def test_log_maintenance_creates_entry(self, client, manager_token, vehicle):
        response = await client.post(
            f"/api/v1/vehicles/{vehicle.id}/maintenance",
            headers={"Authorization": f"Bearer {manager_token}"},
            json={"note": "Oil change done", "mark_unavailable": False},
        )
        assert response.status_code == 201
        body = response.json()
        assert body["note"] == "Oil change done"
        assert body["vehicle_id"] == vehicle.id

    @pytest.mark.asyncio
    async def test_log_maintenance_marks_unavailable(self, client, manager_token, vehicle):
        response = await client.post(
            f"/api/v1/vehicles/{vehicle.id}/maintenance",
            headers={"Authorization": f"Bearer {manager_token}"},
            json={"note": "Engine failure", "mark_unavailable": True},
        )
        assert response.status_code == 201
        # Check vehicle is now unavailable
        avail = await client.get(
            "/api/v1/vehicles",
            headers={"Authorization": f"Bearer {manager_token}"},
        )
        v = next(x for x in avail.json() if x["id"] == vehicle.id)
        assert v["is_available"] is False

    @pytest.mark.asyncio
    async def test_update_availability_to_true(self, client, manager_token, vehicle, db):
        # Mark unavailable first
        vehicle.is_available = False
        await db.flush()

        response = await client.patch(
            f"/api/v1/vehicles/{vehicle.id}/availability",
            headers={"Authorization": f"Bearer {manager_token}"},
            json={"is_available": True},
        )
        assert response.status_code == 200
        assert response.json()["is_available"] is True

    @pytest.mark.asyncio
    async def test_create_trip_with_unavailable_vehicle_returns_400(
        self, client, manager_token, vehicle, station_accra, station_prestea, db
    ):
        vehicle.is_available = False
        await db.flush()

        response = await client.post(
            "/api/v1/trips",
            headers={"Authorization": f"Bearer {manager_token}"},
            json={
                "vehicle_id": vehicle.id,
                "departure_station_id": station_accra.id,
                "destination_station_id": station_prestea.id,
                "departure_time": "2026-06-01T08:00:00Z",
            },
        )
        assert response.status_code == 400
        assert response.json()["detail"]["code"] == "VEHICLE_UNAVAILABLE"

    @pytest.mark.asyncio
    async def test_list_maintenance_logs(self, client, manager_token, vehicle):
        # Create a log first
        await client.post(
            f"/api/v1/vehicles/{vehicle.id}/maintenance",
            headers={"Authorization": f"Bearer {manager_token}"},
            json={"note": "Tyre replaced", "mark_unavailable": False},
        )
        response = await client.get(
            f"/api/v1/vehicles/{vehicle.id}/maintenance",
            headers={"Authorization": f"Bearer {manager_token}"},
        )
        assert response.status_code == 200
        logs = response.json()
        assert len(logs) >= 1
        assert logs[0]["note"] == "Tyre replaced"

    @pytest.mark.asyncio
    async def test_clerk_cannot_log_maintenance(self, client, clerk_token, vehicle):
        response = await client.post(
            f"/api/v1/vehicles/{vehicle.id}/maintenance",
            headers={"Authorization": f"Bearer {clerk_token}"},
            json={"note": "Test", "mark_unavailable": False},
        )
        assert response.status_code == 403

    @pytest.mark.asyncio
    async def test_vehicle_list_includes_is_available(self, client, manager_token, vehicle):
        response = await client.get(
            "/api/v1/vehicles",
            headers={"Authorization": f"Bearer {manager_token}"},
        )
        assert response.status_code == 200
        vehicles = response.json()
        assert len(vehicles) >= 1
        assert "is_available" in vehicles[0]


# ── L2: Passenger Manifest CSV ─────────────────────────────────────────────────


class TestManifestCSV:
    @pytest.fixture
    async def trip_with_tickets(
        self, db, company, vehicle, station_accra, station_prestea, clerk_user
    ):
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

        for i in range(3):
            t = Ticket(
                company_id=company.id,
                trip_id=trip.id,
                passenger_name=f"Passenger {i + 1}",
                passenger_phone=f"23354111000{i}",
                seat_number=i + 1,
                fare_ghs=45.0,
                status=TicketStatus.valid,
                payment_status=PaymentStatus.paid,
                source=TicketSource.counter,
            )
            db.add(t)
        await db.flush()
        return trip

    @pytest.mark.asyncio
    async def test_manifest_csv_returns_csv(self, client, manager_token, trip_with_tickets):
        response = await client.get(
            f"/api/v1/trips/{trip_with_tickets.id}/manifest.csv",
            headers={"Authorization": f"Bearer {manager_token}"},
        )
        assert response.status_code == 200
        assert "text/csv" in response.headers["content-type"]
        body = response.text
        assert "seat_number" in body
        assert "passenger_name" in body
        assert "Passenger 1" in body

    @pytest.mark.asyncio
    async def test_manifest_csv_excludes_cancelled(
        self, client, manager_token, db, company, vehicle, station_accra, station_prestea
    ):
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

        cancelled = Ticket(
            company_id=company.id,
            trip_id=trip.id,
            passenger_name="Cancelled Person",
            passenger_phone="233541230000",
            seat_number=99,
            fare_ghs=45.0,
            status=TicketStatus.cancelled,
            payment_status=PaymentStatus.pending,
            source=TicketSource.counter,
        )
        db.add(cancelled)
        await db.flush()

        response = await client.get(
            f"/api/v1/trips/{trip.id}/manifest.csv",
            headers={"Authorization": f"Bearer {manager_token}"},
        )
        assert response.status_code == 200
        assert "Cancelled Person" not in response.text

    @pytest.mark.asyncio
    async def test_manifest_csv_404_on_bad_trip(self, client, manager_token):
        response = await client.get(
            "/api/v1/trips/99999/manifest.csv",
            headers={"Authorization": f"Bearer {manager_token}"},
        )
        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_manifest_csv_requires_manager(self, client, clerk_token, loading_trip):
        response = await client.get(
            f"/api/v1/trips/{loading_trip.id}/manifest.csv",
            headers={"Authorization": f"Bearer {clerk_token}"},
        )
        assert response.status_code == 403


# ── L3: Parcel Batch Unload ────────────────────────────────────────────────────


class TestBatchUnload:
    @pytest.mark.asyncio
    async def test_batch_unload_succeeds(self, client, clerk_token, in_transit_parcel):
        response = await client.post(
            "/api/v1/parcels/batch-unload",
            headers={"Authorization": f"Bearer {clerk_token}"},
            json={"parcel_ids": [in_transit_parcel.id]},
        )
        assert response.status_code == 200
        body = response.json()
        assert in_transit_parcel.id in body["succeeded"]
        assert body["failed"] == []

    @pytest.mark.asyncio
    async def test_batch_unload_partial_failure(self, client, clerk_token, in_transit_parcel):
        response = await client.post(
            "/api/v1/parcels/batch-unload",
            headers={"Authorization": f"Bearer {clerk_token}"},
            json={"parcel_ids": [in_transit_parcel.id, 99999]},
        )
        assert response.status_code == 200
        body = response.json()
        assert in_transit_parcel.id in body["succeeded"]
        failed_ids = [f["id"] for f in body["failed"]]
        assert 99999 in failed_ids

    @pytest.mark.asyncio
    async def test_batch_unload_wrong_status_fails(
        self, client, clerk_token, db, company, station_accra, station_prestea, clerk_user
    ):
        # A pending parcel cannot be unloaded
        pending = Parcel(
            company_id=company.id,
            tracking_number="KX-TST-L-00099",
            sender_name="S",
            sender_phone="233541110099",
            receiver_name="R",
            receiver_phone="233541110100",
            origin_station_id=station_accra.id,
            destination_station_id=station_prestea.id,
            fee_ghs=5.0,
            created_by_id=clerk_user.id,
            status=ParcelStatus.pending,
        )
        db.add(pending)
        await db.flush()

        response = await client.post(
            "/api/v1/parcels/batch-unload",
            headers={"Authorization": f"Bearer {clerk_token}"},
            json={"parcel_ids": [pending.id]},
        )
        assert response.status_code == 200
        body = response.json()
        assert body["succeeded"] == []
        assert body["failed"][0]["id"] == pending.id

    @pytest.mark.asyncio
    async def test_batch_unload_requires_auth(self, client):
        response = await client.post(
            "/api/v1/parcels/batch-unload",
            json={"parcel_ids": [1]},
        )
        assert response.status_code == 401


# ── L4: Daily Stats Drilldown ─────────────────────────────────────────────────


class TestDailyStats:
    @pytest.mark.asyncio
    async def test_daily_stats_returns_seven_days(self, client, admin_token):
        response = await client.get(
            "/api/v1/admin/stats/daily",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 7
        # Check structure of each item
        for item in data:
            assert "date" in item
            assert "tickets_sold" in item
            assert "parcels_created" in item
            assert "revenue_ghs" in item

    @pytest.mark.asyncio
    async def test_daily_stats_requires_admin(self, client, clerk_token):
        response = await client.get(
            "/api/v1/admin/stats/daily",
            headers={"Authorization": f"Bearer {clerk_token}"},
        )
        assert response.status_code == 403

    @pytest.mark.asyncio
    async def test_daily_stats_counts_are_non_negative(self, client, admin_token):
        response = await client.get(
            "/api/v1/admin/stats/daily",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        data = response.json()
        for item in data:
            assert item["tickets_sold"] >= 0
            assert item["parcels_created"] >= 0
            assert item["revenue_ghs"] >= 0.0


# ── L5: Return Reason on Tracking ─────────────────────────────────────────────


class TestReturnReasonTracking:
    @pytest.mark.asyncio
    async def test_returned_parcel_shows_reason(
        self, client, clerk_token, db, company, station_accra, station_prestea, clerk_user
    ):
        parcel = Parcel(
            company_id=company.id,
            tracking_number="KX-TST-L-RETURN",
            sender_name="Kwesi S",
            sender_phone="233541110200",
            receiver_name="Ama R",
            receiver_phone="233541110201",
            origin_station_id=station_accra.id,
            destination_station_id=station_prestea.id,
            fee_ghs=10.0,
            created_by_id=clerk_user.id,
            status=ParcelStatus.returned,
            return_reason="Receiver not found",
        )
        db.add(parcel)
        await db.flush()

        response = await client.get("/api/v1/track/KX-TST-L-RETURN")
        assert response.status_code == 200
        body = response.json()
        assert body["status"] == "returned"
        assert body["return_reason"] == "Receiver not found"

    @pytest.mark.asyncio
    async def test_non_returned_parcel_has_null_reason(
        self, client, db, company, station_accra, station_prestea, clerk_user
    ):
        parcel = Parcel(
            company_id=company.id,
            tracking_number="KX-TST-L-PENDING",
            sender_name="Kwesi S",
            sender_phone="233541110300",
            receiver_name="Ama R",
            receiver_phone="233541110301",
            origin_station_id=station_accra.id,
            destination_station_id=station_prestea.id,
            fee_ghs=10.0,
            created_by_id=clerk_user.id,
            status=ParcelStatus.pending,
        )
        db.add(parcel)
        await db.flush()

        response = await client.get("/api/v1/track/KX-TST-L-PENDING")
        assert response.status_code == 200
        body = response.json()
        assert body["return_reason"] is None

    @pytest.mark.asyncio
    async def test_return_endpoint_saves_reason(
        self, client, clerk_token, db, company, station_accra, station_prestea, clerk_user
    ):
        """Return endpoint should set return_reason on the parcel."""
        parcel = Parcel(
            company_id=company.id,
            tracking_number="KX-TST-L-RET2",
            sender_name="S",
            sender_phone="233541110400",
            receiver_name="R",
            receiver_phone="233541110401",
            origin_station_id=station_accra.id,
            destination_station_id=station_prestea.id,
            fee_ghs=5.0,
            created_by_id=clerk_user.id,
            status=ParcelStatus.arrived,
        )
        db.add(parcel)
        await db.flush()

        response = await client.patch(
            f"/api/v1/parcels/{parcel.id}/return",
            headers={"Authorization": f"Bearer {clerk_token}"},
            json={"reason": "Address incorrect"},
        )
        assert response.status_code == 200

        # Verify via tracking
        track_resp = await client.get("/api/v1/track/KX-TST-L-RET2")
        assert track_resp.status_code == 200
        assert track_resp.json()["return_reason"] == "Address incorrect"
