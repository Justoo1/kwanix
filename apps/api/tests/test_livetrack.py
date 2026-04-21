"""
Tests for LiveTrack — Pillar 1 of the Kwanix Journey Intelligence Platform.

Covers:
  GET /livetrack/trip/{trip_id}
    - 404 when trip does not exist
    - returns trip info with no GPS when broadcast is disabled
    - returns GPS when broadcast enabled and GPS is fresh
    - hides GPS when broadcast enabled but GPS is stale (>5min)
    - hides GPS when trip is not yet departed

  GET /livetrack/fleet
    - requires company_admin or station_manager role
    - returns vehicles with GPS for the caller's company
    - marks vehicle as stale when last_gps_update > 15min

  GET /livetrack/dead-vehicles
    - returns trips with stale GPS on departed trips
    - does not return trips where GPS is fresh

  POST /driver/broadcast
    - driver can enable broadcast
    - driver can disable broadcast
    - returns live_url when enabling

  POST /driver/share-link
    - requires broadcast enabled
    - returns 400 when broadcast disabled
    - returns sms_sent count when enabled

  proximity SMS (_check_eta_proximity_sms unit test)
    - SMS sent when bus is within 30km of destination
    - SMS not sent when bus is outside 30km
    - SMS not sent again if eta_sms_sent_at already set
"""

from datetime import UTC, datetime, timedelta

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.company import Company
from app.models.station import Station
from app.models.ticket import PaymentStatus, Ticket, TicketSource, TicketStatus
from app.models.trip import Trip, TripStatus
from app.models.user import User
from app.models.vehicle import Vehicle
from app.routers.driver import _check_eta_proximity_sms, _haversine_km

# ── Helpers ────────────────────────────────────────────────────────────────────


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


async def _make_trip(
    db: AsyncSession,
    company: Company,
    vehicle: Vehicle,
    dep: Station,
    dst: Station,
    status: TripStatus = TripStatus.departed,
    driver_id: int | None = None,
) -> Trip:
    trip = Trip(
        company_id=company.id,
        vehicle_id=vehicle.id,
        departure_station_id=dep.id,
        destination_station_id=dst.id,
        departure_time=datetime.now(UTC),
        status=status,
        driver_id=driver_id,
    )
    db.add(trip)
    await db.flush()
    return trip


async def _make_ticket(
    db: AsyncSession,
    company: Company,
    trip: Trip,
    phone: str = "233541000001",
    seat: int = 1,
) -> Ticket:
    t = Ticket(
        company_id=company.id,
        trip_id=trip.id,
        passenger_name="Ama Test",
        passenger_phone=phone,
        seat_number=seat,
        fare_ghs=50.00,
        status=TicketStatus.valid,
        payment_status=PaymentStatus.paid,
        source=TicketSource.counter,
    )
    db.add(t)
    await db.flush()
    return t


# ── Haversine unit test ────────────────────────────────────────────────────────


class TestHaversine:
    def test_same_point_is_zero(self):
        assert _haversine_km(5.55, -0.19, 5.55, -0.19) == pytest.approx(0.0, abs=0.001)

    def test_accra_to_kumasi_approx_200km(self):
        # Accra ~5.55°N -0.19°E, Kumasi ~6.69°N -1.62°E
        # Straight-line (haversine) distance is ~200km; road distance is ~250km
        dist = _haversine_km(5.55, -0.19, 6.69, -1.62)
        assert 180 < dist < 220

    def test_within_30km_threshold(self):
        # 20km apart should be < 30
        lat1, lng1 = 6.0, -1.0
        lat2 = lat1 + (20 / 111.0)  # ~20km north
        dist = _haversine_km(lat1, lng1, lat2, lng1)
        assert dist < 30

    def test_outside_30km_threshold(self):
        lat1, lng1 = 6.0, -1.0
        lat2 = lat1 + (50 / 111.0)  # ~50km north
        dist = _haversine_km(lat1, lng1, lat2, lng1)
        assert dist > 30


# ── GET /livetrack/trip/{id} ───────────────────────────────────────────────────


class TestGetTripPosition:
    async def test_returns_404_for_missing_trip(self, client: AsyncClient):
        resp = await client.get("/api/v1/livetrack/trip/9999")
        assert resp.status_code == 404

    async def test_returns_trip_info_no_gps_when_broadcast_disabled(
        self,
        client: AsyncClient,
        db: AsyncSession,
        company: Company,
        station_accra: Station,
        station_prestea: Station,
        vehicle: Vehicle,
    ):
        vehicle.current_latitude = 5.9
        vehicle.current_longitude = -1.2
        vehicle.last_gps_update = datetime.now(UTC)
        vehicle.location_broadcast_enabled = False
        await db.flush()

        trip = await _make_trip(db, company, vehicle, station_accra, station_prestea)
        resp = await client.get(f"/api/v1/livetrack/trip/{trip.id}")
        assert resp.status_code == 200
        data = resp.json()
        assert data["trip_id"] == trip.id
        assert data["status"] == "departed"
        # GPS must NOT be revealed when broadcast is off
        assert data["vehicle_lat"] is None
        assert data["vehicle_lng"] is None
        assert data["gps_fresh"] is False

    async def test_returns_gps_when_broadcast_enabled_and_fresh(
        self,
        client: AsyncClient,
        db: AsyncSession,
        company: Company,
        station_accra: Station,
        station_prestea: Station,
        vehicle: Vehicle,
    ):
        vehicle.current_latitude = 5.9
        vehicle.current_longitude = -1.2
        vehicle.last_gps_update = datetime.now(UTC)
        vehicle.location_broadcast_enabled = True
        await db.flush()

        trip = await _make_trip(db, company, vehicle, station_accra, station_prestea)
        resp = await client.get(f"/api/v1/livetrack/trip/{trip.id}")
        assert resp.status_code == 200
        data = resp.json()
        assert data["vehicle_lat"] == pytest.approx(5.9)
        assert data["vehicle_lng"] == pytest.approx(-1.2)
        assert data["gps_fresh"] is True

    async def test_hides_gps_when_stale(
        self,
        client: AsyncClient,
        db: AsyncSession,
        company: Company,
        station_accra: Station,
        station_prestea: Station,
        vehicle: Vehicle,
    ):
        vehicle.current_latitude = 5.9
        vehicle.current_longitude = -1.2
        vehicle.last_gps_update = datetime.now(UTC) - timedelta(minutes=10)  # stale
        vehicle.location_broadcast_enabled = True
        await db.flush()

        trip = await _make_trip(db, company, vehicle, station_accra, station_prestea)
        resp = await client.get(f"/api/v1/livetrack/trip/{trip.id}")
        assert resp.status_code == 200
        data = resp.json()
        assert data["vehicle_lat"] is None
        assert data["gps_fresh"] is False

    async def test_hides_gps_when_trip_not_departed(
        self,
        client: AsyncClient,
        db: AsyncSession,
        company: Company,
        station_accra: Station,
        station_prestea: Station,
        vehicle: Vehicle,
    ):
        vehicle.current_latitude = 5.5
        vehicle.current_longitude = -0.2
        vehicle.last_gps_update = datetime.now(UTC)
        vehicle.location_broadcast_enabled = True
        await db.flush()

        trip = await _make_trip(
            db, company, vehicle, station_accra, station_prestea, status=TripStatus.loading
        )
        resp = await client.get(f"/api/v1/livetrack/trip/{trip.id}")
        assert resp.status_code == 200
        data = resp.json()
        assert data["vehicle_lat"] is None
        assert data["status"] == "loading"

    async def test_returns_station_names_in_response(
        self,
        client: AsyncClient,
        db: AsyncSession,
        company: Company,
        station_accra: Station,
        station_prestea: Station,
        vehicle: Vehicle,
    ):
        trip = await _make_trip(db, company, vehicle, station_accra, station_prestea)
        resp = await client.get(f"/api/v1/livetrack/trip/{trip.id}")
        assert resp.status_code == 200
        data = resp.json()
        assert data["departure_station_name"] == station_accra.name
        assert data["destination_station_name"] == station_prestea.name


# ── GET /livetrack/fleet ───────────────────────────────────────────────────────


class TestFleetMap:
    async def test_requires_company_admin_role(
        self,
        client: AsyncClient,
        clerk_token: str,
    ):
        resp = await client.get("/api/v1/livetrack/fleet", headers=_auth(clerk_token))
        assert resp.status_code == 403

    async def test_returns_vehicles_with_gps(
        self,
        client: AsyncClient,
        db: AsyncSession,
        company: Company,
        company_admin_token: str,
        station_accra: Station,
        station_prestea: Station,
        vehicle: Vehicle,
    ):
        vehicle.current_latitude = 5.5
        vehicle.current_longitude = -0.2
        vehicle.last_gps_update = datetime.now(UTC)
        await db.flush()

        resp = await client.get("/api/v1/livetrack/fleet", headers=_auth(company_admin_token))
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 1
        assert data[0]["plate_number"] == vehicle.plate_number
        assert data[0]["lat"] == pytest.approx(5.5)
        assert data[0]["is_stale"] is False

    async def test_marks_vehicle_as_stale(
        self,
        client: AsyncClient,
        db: AsyncSession,
        company: Company,
        company_admin_token: str,
        vehicle: Vehicle,
    ):
        vehicle.current_latitude = 5.5
        vehicle.current_longitude = -0.2
        vehicle.last_gps_update = datetime.now(UTC) - timedelta(minutes=20)
        await db.flush()

        resp = await client.get("/api/v1/livetrack/fleet", headers=_auth(company_admin_token))
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 1
        assert data[0]["is_stale"] is True

    async def test_excludes_vehicles_without_gps(
        self,
        client: AsyncClient,
        db: AsyncSession,
        company: Company,
        company_admin_token: str,
        vehicle: Vehicle,
    ):
        # vehicle fixture has no GPS by default
        vehicle.current_latitude = None
        vehicle.current_longitude = None
        await db.flush()

        resp = await client.get("/api/v1/livetrack/fleet", headers=_auth(company_admin_token))
        assert resp.status_code == 200
        assert resp.json() == []


# ── GET /livetrack/dead-vehicles ──────────────────────────────────────────────


class TestDeadVehicles:
    async def test_returns_departed_trip_with_stale_gps(
        self,
        client: AsyncClient,
        db: AsyncSession,
        company: Company,
        company_admin_token: str,
        station_accra: Station,
        station_prestea: Station,
        vehicle: Vehicle,
    ):
        vehicle.current_latitude = 5.5
        vehicle.current_longitude = -0.2
        vehicle.last_gps_update = datetime.now(UTC) - timedelta(minutes=20)
        await db.flush()

        await _make_trip(db, company, vehicle, station_accra, station_prestea)
        resp = await client.get(
            "/api/v1/livetrack/dead-vehicles", headers=_auth(company_admin_token)
        )
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 1
        assert data[0]["plate_number"] == vehicle.plate_number
        assert data[0]["minutes_silent"] >= 20

    async def test_does_not_return_fresh_gps(
        self,
        client: AsyncClient,
        db: AsyncSession,
        company: Company,
        company_admin_token: str,
        station_accra: Station,
        station_prestea: Station,
        vehicle: Vehicle,
    ):
        vehicle.current_latitude = 5.5
        vehicle.current_longitude = -0.2
        vehicle.last_gps_update = datetime.now(UTC)
        await db.flush()

        await _make_trip(db, company, vehicle, station_accra, station_prestea)
        resp = await client.get(
            "/api/v1/livetrack/dead-vehicles", headers=_auth(company_admin_token)
        )
        assert resp.status_code == 200
        assert resp.json() == []

    async def test_does_not_return_non_departed_trip(
        self,
        client: AsyncClient,
        db: AsyncSession,
        company: Company,
        company_admin_token: str,
        station_accra: Station,
        station_prestea: Station,
        vehicle: Vehicle,
    ):
        vehicle.current_latitude = 5.5
        vehicle.current_longitude = -0.2
        vehicle.last_gps_update = datetime.now(UTC) - timedelta(minutes=30)
        await db.flush()

        await _make_trip(
            db, company, vehicle, station_accra, station_prestea, status=TripStatus.scheduled
        )
        resp = await client.get(
            "/api/v1/livetrack/dead-vehicles", headers=_auth(company_admin_token)
        )
        assert resp.status_code == 200
        assert resp.json() == []


# ── POST /driver/broadcast ────────────────────────────────────────────────────


class TestBroadcastToggle:
    async def test_enable_broadcast_returns_live_url(
        self,
        client: AsyncClient,
        db: AsyncSession,
        company: Company,
        station_accra: Station,
        station_prestea: Station,
        vehicle: Vehicle,
        driver_user: User,
        driver_token: str,
    ):
        await _make_trip(
            db,
            company,
            vehicle,
            station_accra,
            station_prestea,
            status=TripStatus.loading,
            driver_id=driver_user.id,
        )
        resp = await client.post(
            "/api/v1/driver/broadcast",
            json={"enabled": True},
            headers=_auth(driver_token),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["enabled"] is True
        assert data["live_url"] is not None
        assert "track/bus/" in data["live_url"]

    async def test_disable_broadcast_returns_no_url(
        self,
        client: AsyncClient,
        db: AsyncSession,
        company: Company,
        station_accra: Station,
        station_prestea: Station,
        vehicle: Vehicle,
        driver_user: User,
        driver_token: str,
    ):
        await _make_trip(
            db,
            company,
            vehicle,
            station_accra,
            station_prestea,
            status=TripStatus.loading,
            driver_id=driver_user.id,
        )
        resp = await client.post(
            "/api/v1/driver/broadcast",
            json={"enabled": False},
            headers=_auth(driver_token),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["enabled"] is False
        assert data["live_url"] is None

    async def test_broadcast_requires_driver_role(
        self,
        client: AsyncClient,
        clerk_token: str,
    ):
        resp = await client.post(
            "/api/v1/driver/broadcast",
            json={"enabled": True},
            headers=_auth(clerk_token),
        )
        assert resp.status_code == 403

    async def test_broadcast_without_trip_returns_404(
        self,
        client: AsyncClient,
        driver_token: str,
    ):
        resp = await client.post(
            "/api/v1/driver/broadcast",
            json={"enabled": True},
            headers=_auth(driver_token),
        )
        assert resp.status_code == 404


# ── POST /driver/share-link ───────────────────────────────────────────────────


class TestShareLink:
    async def test_share_link_requires_broadcast_enabled(
        self,
        client: AsyncClient,
        db: AsyncSession,
        company: Company,
        station_accra: Station,
        station_prestea: Station,
        vehicle: Vehicle,
        driver_user: User,
        driver_token: str,
    ):
        vehicle.location_broadcast_enabled = False
        await db.flush()

        await _make_trip(
            db,
            company,
            vehicle,
            station_accra,
            station_prestea,
            status=TripStatus.departed,
            driver_id=driver_user.id,
        )
        resp = await client.post(
            "/api/v1/driver/share-link",
            headers=_auth(driver_token),
        )
        assert resp.status_code == 400

    async def test_share_link_returns_sms_count(
        self,
        client: AsyncClient,
        db: AsyncSession,
        company: Company,
        station_accra: Station,
        station_prestea: Station,
        vehicle: Vehicle,
        driver_user: User,
        driver_token: str,
    ):
        vehicle.location_broadcast_enabled = True
        await db.flush()

        trip = await _make_trip(
            db,
            company,
            vehicle,
            station_accra,
            station_prestea,
            status=TripStatus.departed,
            driver_id=driver_user.id,
        )
        await _make_ticket(db, company, trip, phone="233541000001", seat=1)
        await _make_ticket(db, company, trip, phone="233541000002", seat=2)

        resp = await client.post(
            "/api/v1/driver/share-link",
            headers=_auth(driver_token),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["sms_sent"] == 2

    async def test_share_link_excludes_cancelled_tickets(
        self,
        client: AsyncClient,
        db: AsyncSession,
        company: Company,
        station_accra: Station,
        station_prestea: Station,
        vehicle: Vehicle,
        driver_user: User,
        driver_token: str,
    ):
        vehicle.location_broadcast_enabled = True
        await db.flush()

        trip = await _make_trip(
            db,
            company,
            vehicle,
            station_accra,
            station_prestea,
            status=TripStatus.departed,
            driver_id=driver_user.id,
        )
        await _make_ticket(db, company, trip, phone="233541000001", seat=1)
        # Add cancelled ticket
        t2 = Ticket(
            company_id=company.id,
            trip_id=trip.id,
            passenger_name="Cancelled",
            passenger_phone="233541000003",
            seat_number=3,
            fare_ghs=50.00,
            status=TicketStatus.cancelled,
            payment_status=PaymentStatus.refunded,
            source=TicketSource.counter,
        )
        db.add(t2)
        await db.flush()

        resp = await client.post(
            "/api/v1/driver/share-link",
            headers=_auth(driver_token),
        )
        assert resp.status_code == 200
        # Only 1 non-cancelled ticket
        assert resp.json()["sms_sent"] == 1


# ── Proximity SMS unit tests ───────────────────────────────────────────────────


class TestProximitySms:
    async def test_no_sms_outside_30km(
        self,
        db: AsyncSession,
        company: Company,
        station_accra: Station,
        station_prestea: Station,
        vehicle: Vehicle,
        driver_user: User,
    ):
        station_prestea.latitude = 5.43
        station_prestea.longitude = -2.15
        await db.flush()

        trip = await _make_trip(
            db,
            company,
            vehicle,
            station_accra,
            station_prestea,
            status=TripStatus.departed,
            driver_id=driver_user.id,
        )
        ticket = await _make_ticket(db, company, trip, phone="233541000001")

        # Vehicle is 200km away — no SMS should fire.
        # Pass db directly so the function doesn't open a new Postgres connection.
        await _check_eta_proximity_sms(trip.id, 7.5, -1.0, db)

        await db.refresh(ticket)
        assert ticket.eta_sms_sent_at is None

    async def test_sms_sent_within_30km(
        self,
        db: AsyncSession,
        company: Company,
        station_accra: Station,
        station_prestea: Station,
        vehicle: Vehicle,
        driver_user: User,
    ):
        station_prestea.latitude = 5.450
        station_prestea.longitude = -2.150
        await db.flush()

        trip = await _make_trip(
            db,
            company,
            vehicle,
            station_accra,
            station_prestea,
            status=TripStatus.departed,
            driver_id=driver_user.id,
        )
        ticket = await _make_ticket(db, company, trip, phone="233541000002")

        # Vehicle 15km from destination — should trigger SMS
        close_lat = station_prestea.latitude + (15.0 / 111.0)
        await _check_eta_proximity_sms(trip.id, close_lat, station_prestea.longitude, db)

        await db.refresh(ticket)
        assert ticket.eta_sms_sent_at is not None

    async def test_no_duplicate_sms_if_already_sent(
        self,
        db: AsyncSession,
        company: Company,
        station_accra: Station,
        station_prestea: Station,
        vehicle: Vehicle,
        driver_user: User,
    ):
        station_prestea.latitude = 5.450
        station_prestea.longitude = -2.150
        await db.flush()

        trip = await _make_trip(
            db,
            company,
            vehicle,
            station_accra,
            station_prestea,
            status=TripStatus.departed,
            driver_id=driver_user.id,
        )
        ticket = await _make_ticket(db, company, trip, phone="233541000003")

        # Mark SMS already sent
        sent_at = datetime.now(UTC) - timedelta(minutes=5)
        ticket.eta_sms_sent_at = sent_at
        await db.flush()

        close_lat = station_prestea.latitude + (10.0 / 111.0)
        await _check_eta_proximity_sms(trip.id, close_lat, station_prestea.longitude, db)

        await db.refresh(ticket)
        # Timestamp should not have changed — no new SMS was sent.
        # SQLite returns naive datetimes so strip tz for comparison.
        stored = ticket.eta_sms_sent_at
        if stored is not None and stored.tzinfo is None:
            stored = stored.replace(tzinfo=UTC)
        assert stored is not None
        assert abs((stored - sent_at).total_seconds()) < 2


# ── Location update fires background task ─────────────────────────────────────


class TestLocationUpdate:
    async def test_location_update_accepted(
        self,
        client: AsyncClient,
        db: AsyncSession,
        company: Company,
        station_accra: Station,
        station_prestea: Station,
        vehicle: Vehicle,
        driver_user: User,
        driver_token: str,
        monkeypatch,
    ):
        # Patch the background task so it doesn't attempt a real Postgres connection
        async def _noop(*args, **kwargs):
            pass

        import app.routers.driver as driver_module

        monkeypatch.setattr(driver_module, "_check_eta_proximity_sms", _noop)

        await _make_trip(
            db,
            company,
            vehicle,
            station_accra,
            station_prestea,
            status=TripStatus.loading,
            driver_id=driver_user.id,
        )
        resp = await client.post(
            "/api/v1/driver/location",
            json={"latitude": 5.55, "longitude": -0.20},
            headers=_auth(driver_token),
        )
        assert resp.status_code == 200
        assert resp.json()["accepted"] is True

    async def test_location_update_without_trip_is_silently_rejected(
        self,
        client: AsyncClient,
        driver_token: str,
        monkeypatch,
    ):
        async def _noop(*args, **kwargs):
            pass

        import app.routers.driver as driver_module

        monkeypatch.setattr(driver_module, "_check_eta_proximity_sms", _noop)

        resp = await client.post(
            "/api/v1/driver/location",
            json={"latitude": 5.55, "longitude": -0.20},
            headers=_auth(driver_token),
        )
        assert resp.status_code == 200
        assert resp.json()["accepted"] is False
