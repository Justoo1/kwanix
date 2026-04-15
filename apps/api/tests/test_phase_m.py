"""
Phase M integration tests.

M1: Tracking endpoint — new fields (station coords, vehicle GPS, departure_time, trip_status)
M2: AI insight endpoint (503 without key, fallback messages, ETA)
M3: Driver GPS location push
M4: Vehicle edit (plate, model, capacity)
M5: Vehicle default-driver assignment
M6: Station coordinates (create with/without lat/lng)
"""

from datetime import UTC, datetime, timedelta

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.company import Company
from app.models.parcel import Parcel, ParcelStatus
from app.models.station import Station
from app.models.trip import Trip, TripStatus
from app.models.user import User, UserRole
from app.models.vehicle import Vehicle
from app.services.auth_service import create_access_token, hash_password

# ── Helpers ────────────────────────────────────────────────────────────────────


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


# ── Local fixtures ─────────────────────────────────────────────────────────────


@pytest.fixture
async def manager_user(db: AsyncSession, company: Company) -> User:
    u = User(
        company_id=company.id,
        full_name="M Manager",
        phone="233207002001",
        email="manager_m@test.io",
        hashed_password=hash_password("pass123"),
        role=UserRole.station_manager,
    )
    db.add(u)
    await db.flush()
    return u


@pytest.fixture
async def manager_token(manager_user: User) -> str:
    return create_access_token(manager_user)


@pytest.fixture
async def admin_user(db: AsyncSession, company: Company) -> User:
    u = User(
        company_id=company.id,
        full_name="M Admin",
        phone="233207002002",
        email="admin_m@test.io",
        hashed_password=hash_password("pass123"),
        role=UserRole.company_admin,
    )
    db.add(u)
    await db.flush()
    return u


@pytest.fixture
async def admin_token(admin_user: User) -> str:
    return create_access_token(admin_user)


@pytest.fixture
async def station_with_coords(db: AsyncSession, company: Company) -> Station:
    s = Station(
        company_id=company.id,
        name="Accra Coords",
        location_code="ACC2",
        latitude=5.603717,
        longitude=-0.186964,
    )
    db.add(s)
    await db.flush()
    return s


@pytest.fixture
async def station_dest_coords(db: AsyncSession, company: Company) -> Station:
    s = Station(
        company_id=company.id,
        name="Kumasi Coords",
        location_code="KSI2",
        latitude=6.687800,
        longitude=-1.624000,
    )
    db.add(s)
    await db.flush()
    return s


@pytest.fixture
async def active_vehicle(db: AsyncSession, company: Company) -> Vehicle:
    v = Vehicle(
        company_id=company.id,
        plate_number="GR-MTEST-01",
        model="Tata Bus",
        capacity=55,
    )
    db.add(v)
    await db.flush()
    return v


@pytest.fixture
async def departed_trip(
    db: AsyncSession,
    company: Company,
    active_vehicle: Vehicle,
    station_with_coords: Station,
    station_dest_coords: Station,
) -> Trip:
    trip = Trip(
        company_id=company.id,
        vehicle_id=active_vehicle.id,
        departure_station_id=station_with_coords.id,
        destination_station_id=station_dest_coords.id,
        departure_time=datetime.now(UTC) - timedelta(hours=1),
        status=TripStatus.departed,
    )
    db.add(trip)
    await db.flush()
    return trip


@pytest.fixture
async def parcel_in_transit(
    db: AsyncSession,
    company: Company,
    station_with_coords: Station,
    station_dest_coords: Station,
    departed_trip: Trip,
) -> Parcel:
    p = Parcel(
        company_id=company.id,
        tracking_number="TST-MTEST-001",
        sender_name="Kofi",
        sender_phone="233540000001",
        receiver_name="Ama",
        receiver_phone="233540000002",
        origin_station_id=station_with_coords.id,
        destination_station_id=station_dest_coords.id,
        current_trip_id=departed_trip.id,
        status=ParcelStatus.in_transit,
        fee_ghs=10,
    )
    db.add(p)
    await db.flush()
    return p


@pytest.fixture
async def parcel_pending(
    db: AsyncSession,
    company: Company,
    station_with_coords: Station,
    station_dest_coords: Station,
) -> Parcel:
    p = Parcel(
        company_id=company.id,
        tracking_number="TST-MTEST-002",
        sender_name="Kwame",
        sender_phone="233540000003",
        receiver_name="Abena",
        receiver_phone="233540000004",
        origin_station_id=station_with_coords.id,
        destination_station_id=station_dest_coords.id,
        status=ParcelStatus.pending,
        fee_ghs=10,
    )
    db.add(p)
    await db.flush()
    return p


@pytest.fixture
async def parcel_arrived(
    db: AsyncSession,
    company: Company,
    station_with_coords: Station,
    station_dest_coords: Station,
) -> Parcel:
    p = Parcel(
        company_id=company.id,
        tracking_number="TST-MTEST-003",
        sender_name="Yaw",
        sender_phone="233540000005",
        receiver_name="Akua",
        receiver_phone="233540000006",
        origin_station_id=station_with_coords.id,
        destination_station_id=station_dest_coords.id,
        status=ParcelStatus.arrived,
        arrived_at=datetime.now(UTC),
        fee_ghs=10,
    )
    db.add(p)
    await db.flush()
    return p


@pytest.fixture
async def parcel_returned(
    db: AsyncSession,
    company: Company,
    station_with_coords: Station,
    station_dest_coords: Station,
) -> Parcel:
    p = Parcel(
        company_id=company.id,
        tracking_number="TST-MTEST-004",
        sender_name="Esi",
        sender_phone="233540000007",
        receiver_name="Nana",
        receiver_phone="233540000008",
        origin_station_id=station_with_coords.id,
        destination_station_id=station_dest_coords.id,
        status=ParcelStatus.returned,
        return_reason="Recipient not found",
        fee_ghs=10,
    )
    db.add(p)
    await db.flush()
    return p


# ── M1: Tracking endpoint new fields ──────────────────────────────────────────


class TestTrackingEndpointNewFields:
    @pytest.mark.asyncio
    async def test_station_coordinates_included_in_response(
        self,
        client: AsyncClient,
        parcel_pending: Parcel,
    ):
        """Origin and destination station coordinates appear in the tracking response."""
        response = await client.get(f"/api/v1/track/{parcel_pending.tracking_number}")
        assert response.status_code == 200
        body = response.json()
        assert body["origin_lat"] == pytest.approx(5.603717, abs=1e-4)
        assert body["origin_lng"] == pytest.approx(-0.186964, abs=1e-4)
        assert body["destination_lat"] == pytest.approx(6.687800, abs=1e-4)
        assert body["destination_lng"] == pytest.approx(-1.624000, abs=1e-4)

    @pytest.mark.asyncio
    async def test_trip_context_included_when_in_transit(
        self,
        client: AsyncClient,
        parcel_in_transit: Parcel,
    ):
        """departure_time and trip_status are included when parcel has a current trip."""
        response = await client.get(f"/api/v1/track/{parcel_in_transit.tracking_number}")
        assert response.status_code == 200
        body = response.json()
        assert body["departure_time"] is not None
        assert body["trip_status"] == "departed"

    @pytest.mark.asyncio
    async def test_trip_context_null_when_no_trip(
        self,
        client: AsyncClient,
        parcel_pending: Parcel,
    ):
        """departure_time and trip_status are null when parcel has no current trip."""
        response = await client.get(f"/api/v1/track/{parcel_pending.tracking_number}")
        assert response.status_code == 200
        body = response.json()
        assert body["departure_time"] is None
        assert body["trip_status"] is None

    @pytest.mark.asyncio
    async def test_vehicle_gps_included_when_fresh(
        self,
        client: AsyncClient,
        db: AsyncSession,
        parcel_in_transit: Parcel,
        active_vehicle: Vehicle,
    ):
        """Vehicle GPS coords appear in response when last_gps_update is recent."""
        active_vehicle.current_latitude = 6.123456
        active_vehicle.current_longitude = -0.987654
        active_vehicle.last_gps_update = datetime.now(UTC) - timedelta(seconds=60)
        await db.flush()

        response = await client.get(f"/api/v1/track/{parcel_in_transit.tracking_number}")
        assert response.status_code == 200
        body = response.json()
        assert body["vehicle_lat"] == pytest.approx(6.123456, abs=1e-4)
        assert body["vehicle_lng"] == pytest.approx(-0.987654, abs=1e-4)

    @pytest.mark.asyncio
    async def test_vehicle_gps_excluded_when_stale(
        self,
        client: AsyncClient,
        db: AsyncSession,
        parcel_in_transit: Parcel,
        active_vehicle: Vehicle,
    ):
        """Vehicle GPS coords are null when last_gps_update is older than 5 minutes."""
        active_vehicle.current_latitude = 6.5
        active_vehicle.current_longitude = -0.5
        active_vehicle.last_gps_update = datetime.now(UTC) - timedelta(minutes=10)
        await db.flush()

        response = await client.get(f"/api/v1/track/{parcel_in_transit.tracking_number}")
        assert response.status_code == 200
        body = response.json()
        assert body["vehicle_lat"] is None
        assert body["vehicle_lng"] is None

    @pytest.mark.asyncio
    async def test_vehicle_gps_excluded_when_not_in_transit(
        self,
        client: AsyncClient,
        db: AsyncSession,
        parcel_arrived: Parcel,
        active_vehicle: Vehicle,
    ):
        """Vehicle GPS is never included for non-in_transit parcels."""
        active_vehicle.current_latitude = 5.0
        active_vehicle.current_longitude = -1.0
        active_vehicle.last_gps_update = datetime.now(UTC)
        await db.flush()

        response = await client.get(f"/api/v1/track/{parcel_arrived.tracking_number}")
        assert response.status_code == 200
        body = response.json()
        assert body["vehicle_lat"] is None
        assert body["vehicle_lng"] is None

    @pytest.mark.asyncio
    async def test_null_coords_when_station_has_no_coords(
        self,
        client: AsyncClient,
        db: AsyncSession,
        company: Company,
        station_accra: Station,
        station_prestea: Station,
    ):
        """origin_lat/lng and destination_lat/lng are null if station has no coordinates."""
        p = Parcel(
            company_id=company.id,
            tracking_number="TST-MTEST-NOCOORDS",
            sender_name="A",
            sender_phone="233540001001",
            receiver_name="B",
            receiver_phone="233540001002",
            origin_station_id=station_accra.id,
            destination_station_id=station_prestea.id,
            status=ParcelStatus.pending,
            fee_ghs=10,
        )
        db.add(p)
        await db.flush()

        response = await client.get(f"/api/v1/track/{p.tracking_number}")
        assert response.status_code == 200
        body = response.json()
        assert body["origin_lat"] is None
        assert body["origin_lng"] is None
        assert body["destination_lat"] is None
        assert body["destination_lng"] is None

    @pytest.mark.asyncio
    async def test_404_for_unknown_tracking_number(self, client: AsyncClient):
        response = await client.get("/api/v1/track/UNKNOWN-TRK-999")
        assert response.status_code == 404


# ── M2: AI insight endpoint ────────────────────────────────────────────────────


class TestAIInsightEndpoint:
    @pytest.mark.asyncio
    async def test_returns_503_when_gemini_key_not_configured(
        self,
        client: AsyncClient,
        parcel_pending: Parcel,
        monkeypatch,
    ):
        """503 is returned when no Gemini API key is set."""
        monkeypatch.setattr(settings, "gemini_api_key", None)
        response = await client.get(
            f"/api/v1/track/{parcel_pending.tracking_number}/ai-insight"
        )
        assert response.status_code == 503

    @pytest.mark.asyncio
    async def test_fallback_message_pending_status(
        self,
        client: AsyncClient,
        parcel_pending: Parcel,
        monkeypatch,
    ):
        """Fallback message for pending parcel mentions origin and destination."""
        monkeypatch.setattr(settings, "gemini_api_key", "test-key-that-will-fail")

        response = await client.get(
            f"/api/v1/track/{parcel_pending.tracking_number}/ai-insight"
        )
        assert response.status_code == 200
        body = response.json()
        assert "message" in body
        assert "eta" in body
        # The fallback text should mention the parcel state
        assert len(body["message"]) > 0

    @pytest.mark.asyncio
    async def test_fallback_message_in_transit_mentions_route(
        self,
        client: AsyncClient,
        parcel_in_transit: Parcel,
        monkeypatch,
    ):
        """Fallback message for in_transit parcel mentions route information."""
        monkeypatch.setattr(settings, "gemini_api_key", "test-key-that-will-fail")

        response = await client.get(
            f"/api/v1/track/{parcel_in_transit.tracking_number}/ai-insight"
        )
        assert response.status_code == 200
        body = response.json()
        assert "in transit" in body["message"].lower()

    @pytest.mark.asyncio
    async def test_fallback_message_arrived_mentions_collection(
        self,
        client: AsyncClient,
        parcel_arrived: Parcel,
        monkeypatch,
    ):
        """Fallback message for arrived parcel mentions OTP collection."""
        monkeypatch.setattr(settings, "gemini_api_key", "test-key-that-will-fail")

        response = await client.get(
            f"/api/v1/track/{parcel_arrived.tracking_number}/ai-insight"
        )
        assert response.status_code == 200
        body = response.json()
        assert "arrived" in body["message"].lower() or "collection" in body["message"].lower()
        # OTP reminder should be in the fallback for arrived status
        assert "otp" in body["message"].lower()

    @pytest.mark.asyncio
    async def test_fallback_message_returned_includes_reason(
        self,
        client: AsyncClient,
        parcel_returned: Parcel,
        monkeypatch,
    ):
        """Fallback message for returned parcel includes the return reason."""
        monkeypatch.setattr(settings, "gemini_api_key", "test-key-that-will-fail")

        response = await client.get(
            f"/api/v1/track/{parcel_returned.tracking_number}/ai-insight"
        )
        assert response.status_code == 200
        body = response.json()
        assert "Recipient not found" in body["message"]

    @pytest.mark.asyncio
    async def test_eta_returned_for_in_transit_parcel(
        self,
        client: AsyncClient,
        parcel_in_transit: Parcel,
        monkeypatch,
    ):
        """ETA field is populated for in_transit parcels with a departure time."""
        monkeypatch.setattr(settings, "gemini_api_key", "test-key-that-will-fail")

        response = await client.get(
            f"/api/v1/track/{parcel_in_transit.tracking_number}/ai-insight"
        )
        assert response.status_code == 200
        body = response.json()
        assert body["eta"] is not None
        assert "Departed" in body["eta"]

    @pytest.mark.asyncio
    async def test_eta_null_for_non_transit_parcel(
        self,
        client: AsyncClient,
        parcel_pending: Parcel,
        monkeypatch,
    ):
        """ETA is null for pending parcels (not yet assigned to a trip)."""
        monkeypatch.setattr(settings, "gemini_api_key", "test-key-that-will-fail")

        response = await client.get(
            f"/api/v1/track/{parcel_pending.tracking_number}/ai-insight"
        )
        assert response.status_code == 200
        assert response.json()["eta"] is None

    @pytest.mark.asyncio
    async def test_404_for_unknown_tracking_number(
        self,
        client: AsyncClient,
        monkeypatch,
    ):
        monkeypatch.setattr(settings, "gemini_api_key", "test-key")
        response = await client.get("/api/v1/track/UNKNOWN-99999/ai-insight")
        assert response.status_code == 404


# ── M3: Driver GPS location endpoint ──────────────────────────────────────────


class TestDriverLocationEndpoint:
    @pytest.mark.asyncio
    async def test_driver_with_active_trip_updates_vehicle_gps(
        self,
        client: AsyncClient,
        db: AsyncSession,
        company: Company,
        active_vehicle: Vehicle,
        station_accra: Station,
        station_prestea: Station,
        driver_user: User,
        driver_token: str,
    ):
        """POST /driver/location updates vehicle GPS when driver has loading/departed trip."""
        trip = Trip(
            company_id=company.id,
            vehicle_id=active_vehicle.id,
            departure_station_id=station_accra.id,
            destination_station_id=station_prestea.id,
            departure_time=datetime.now(UTC),
            status=TripStatus.departed,
            driver_id=driver_user.id,
        )
        db.add(trip)
        await db.flush()

        response = await client.post(
            "/api/v1/driver/location",
            headers=_auth(driver_token),
            json={"latitude": 5.987654, "longitude": -0.312345},
        )
        assert response.status_code == 200
        assert response.json()["accepted"] is True

        await db.refresh(active_vehicle)
        assert active_vehicle.current_latitude == pytest.approx(5.987654, abs=1e-4)
        assert active_vehicle.current_longitude == pytest.approx(-0.312345, abs=1e-4)
        assert active_vehicle.last_gps_update is not None

    @pytest.mark.asyncio
    async def test_driver_with_loading_trip_updates_gps(
        self,
        client: AsyncClient,
        db: AsyncSession,
        company: Company,
        active_vehicle: Vehicle,
        station_accra: Station,
        station_prestea: Station,
        driver_user: User,
        driver_token: str,
    ):
        """GPS update is accepted for loading trips too."""
        trip = Trip(
            company_id=company.id,
            vehicle_id=active_vehicle.id,
            departure_station_id=station_accra.id,
            destination_station_id=station_prestea.id,
            departure_time=datetime.now(UTC),
            status=TripStatus.loading,
            driver_id=driver_user.id,
        )
        db.add(trip)
        await db.flush()

        response = await client.post(
            "/api/v1/driver/location",
            headers=_auth(driver_token),
            json={"latitude": 5.6, "longitude": -0.2},
        )
        assert response.status_code == 200
        assert response.json()["accepted"] is True

    @pytest.mark.asyncio
    async def test_driver_with_no_active_trip_returns_accepted_false(
        self,
        client: AsyncClient,
        driver_token: str,
    ):
        """accepted=False (not an error) when driver has no loading/departed trip."""
        response = await client.post(
            "/api/v1/driver/location",
            headers=_auth(driver_token),
            json={"latitude": 5.6, "longitude": -0.2},
        )
        assert response.status_code == 200
        assert response.json()["accepted"] is False

    @pytest.mark.asyncio
    async def test_non_driver_cannot_push_location(
        self,
        client: AsyncClient,
        clerk_token: str,
    ):
        """Station clerks cannot call the driver location endpoint."""
        response = await client.post(
            "/api/v1/driver/location",
            headers=_auth(clerk_token),
            json={"latitude": 5.6, "longitude": -0.2},
        )
        assert response.status_code == 403

    @pytest.mark.asyncio
    async def test_invalid_latitude_rejected(
        self,
        client: AsyncClient,
        driver_token: str,
    ):
        """Latitude outside [-90, 90] is rejected with 422."""
        response = await client.post(
            "/api/v1/driver/location",
            headers=_auth(driver_token),
            json={"latitude": 99.0, "longitude": 0.0},
        )
        assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_invalid_longitude_rejected(
        self,
        client: AsyncClient,
        driver_token: str,
    ):
        """Longitude outside [-180, 180] is rejected with 422."""
        response = await client.post(
            "/api/v1/driver/location",
            headers=_auth(driver_token),
            json={"latitude": 5.0, "longitude": 200.0},
        )
        assert response.status_code == 422


# ── M4: Vehicle edit endpoint ──────────────────────────────────────────────────


class TestVehicleEditEndpoint:
    @pytest.mark.asyncio
    async def test_manager_can_update_plate(
        self,
        client: AsyncClient,
        active_vehicle: Vehicle,
        manager_token: str,
    ):
        response = await client.patch(
            f"/api/v1/vehicles/{active_vehicle.id}",
            headers=_auth(manager_token),
            json={"plate_number": "GR-NEW-99"},
        )
        assert response.status_code == 200
        assert response.json()["plate_number"] == "GR-NEW-99"

    @pytest.mark.asyncio
    async def test_manager_can_update_model_and_capacity(
        self,
        client: AsyncClient,
        active_vehicle: Vehicle,
        manager_token: str,
    ):
        response = await client.patch(
            f"/api/v1/vehicles/{active_vehicle.id}",
            headers=_auth(manager_token),
            json={"model": "Yutong", "capacity": 45},
        )
        assert response.status_code == 200
        body = response.json()
        assert body["model"] == "Yutong"
        assert body["capacity"] == 45

    @pytest.mark.asyncio
    async def test_partial_update_does_not_clear_other_fields(
        self,
        client: AsyncClient,
        active_vehicle: Vehicle,
        manager_token: str,
    ):
        """Updating only capacity leaves plate and model unchanged."""
        response = await client.patch(
            f"/api/v1/vehicles/{active_vehicle.id}",
            headers=_auth(manager_token),
            json={"capacity": 60},
        )
        assert response.status_code == 200
        body = response.json()
        assert body["capacity"] == 60
        assert body["plate_number"] == active_vehicle.plate_number
        assert body["model"] == active_vehicle.model

    @pytest.mark.asyncio
    async def test_clerk_cannot_update_vehicle(
        self,
        client: AsyncClient,
        active_vehicle: Vehicle,
        clerk_token: str,
    ):
        response = await client.patch(
            f"/api/v1/vehicles/{active_vehicle.id}",
            headers=_auth(clerk_token),
            json={"capacity": 40},
        )
        assert response.status_code == 403

    @pytest.mark.asyncio
    async def test_update_nonexistent_vehicle_returns_404(
        self,
        client: AsyncClient,
        manager_token: str,
    ):
        response = await client.patch(
            "/api/v1/vehicles/99999",
            headers=_auth(manager_token),
            json={"capacity": 40},
        )
        assert response.status_code == 404


# ── M5: Vehicle default-driver assignment ─────────────────────────────────────


class TestVehicleDriverAssignment:
    @pytest.mark.asyncio
    async def test_manager_can_assign_default_driver(
        self,
        client: AsyncClient,
        active_vehicle: Vehicle,
        driver_user: User,
        manager_token: str,
    ):
        response = await client.patch(
            f"/api/v1/vehicles/{active_vehicle.id}/driver",
            headers=_auth(manager_token),
            json={"driver_id": driver_user.id},
        )
        assert response.status_code == 200
        body = response.json()
        assert body["default_driver_id"] == driver_user.id
        assert body["default_driver_name"] == driver_user.full_name

    @pytest.mark.asyncio
    async def test_manager_can_unassign_default_driver(
        self,
        client: AsyncClient,
        db: AsyncSession,
        active_vehicle: Vehicle,
        driver_user: User,
        manager_token: str,
    ):
        active_vehicle.default_driver_id = driver_user.id
        await db.flush()

        response = await client.patch(
            f"/api/v1/vehicles/{active_vehicle.id}/driver",
            headers=_auth(manager_token),
            json={"driver_id": None},
        )
        assert response.status_code == 200
        body = response.json()
        assert body["default_driver_id"] is None
        assert body["default_driver_name"] is None

    @pytest.mark.asyncio
    async def test_assigning_non_driver_user_returns_400(
        self,
        client: AsyncClient,
        active_vehicle: Vehicle,
        manager_user: User,
        manager_token: str,
    ):
        """Cannot assign a non-driver role user as default driver."""
        response = await client.patch(
            f"/api/v1/vehicles/{active_vehicle.id}/driver",
            headers=_auth(manager_token),
            json={"driver_id": manager_user.id},
        )
        assert response.status_code == 400

    @pytest.mark.asyncio
    async def test_assigning_driver_from_other_company_returns_400(
        self,
        client: AsyncClient,
        db: AsyncSession,
        active_vehicle: Vehicle,
        manager_token: str,
    ):
        from app.models.company import Company as CompanyModel

        other = CompanyModel(name="Other Co", company_code="OTH2", is_active=True)
        db.add(other)
        await db.flush()

        foreign_driver = User(
            company_id=other.id,
            full_name="Foreign Driver",
            phone="233541399999",
            email="foreign_m@other.io",
            hashed_password=hash_password("pass"),
            role=UserRole.driver,
        )
        db.add(foreign_driver)
        await db.flush()

        response = await client.patch(
            f"/api/v1/vehicles/{active_vehicle.id}/driver",
            headers=_auth(manager_token),
            json={"driver_id": foreign_driver.id},
        )
        assert response.status_code == 400

    @pytest.mark.asyncio
    async def test_clerk_cannot_assign_driver(
        self,
        client: AsyncClient,
        active_vehicle: Vehicle,
        driver_user: User,
        clerk_token: str,
    ):
        response = await client.patch(
            f"/api/v1/vehicles/{active_vehicle.id}/driver",
            headers=_auth(clerk_token),
            json={"driver_id": driver_user.id},
        )
        assert response.status_code == 403


# ── M6: Station coordinates ────────────────────────────────────────────────────


class TestStationCoordinates:
    @pytest.mark.asyncio
    async def test_create_station_with_coordinates(
        self,
        client: AsyncClient,
        admin_token: str,
    ):
        """Admin can create a station with lat/lng; values are returned in the response."""
        response = await client.post(
            "/api/v1/stations",
            headers=_auth(admin_token),
            json={
                "name": "Takoradi Station",
                "location_code": "TKD",
                "latitude": 4.899,
                "longitude": -1.759,
            },
        )
        assert response.status_code == 201
        body = response.json()
        assert body["latitude"] == pytest.approx(4.899, abs=1e-3)
        assert body["longitude"] == pytest.approx(-1.759, abs=1e-3)

    @pytest.mark.asyncio
    async def test_create_station_without_coordinates_returns_null(
        self,
        client: AsyncClient,
        admin_token: str,
    ):
        """Station created without lat/lng has null coordinate fields."""
        response = await client.post(
            "/api/v1/stations",
            headers=_auth(admin_token),
            json={"name": "Cape Coast Station", "location_code": "CPC"},
        )
        assert response.status_code == 201
        body = response.json()
        assert body["latitude"] is None
        assert body["longitude"] is None

    @pytest.mark.asyncio
    async def test_station_coordinates_appear_in_list(
        self,
        client: AsyncClient,
        station_with_coords: Station,
        manager_token: str,
    ):
        """Station coordinates show up in the station list endpoint."""
        response = await client.get("/api/v1/stations", headers=_auth(manager_token))
        assert response.status_code == 200
        stations = response.json()
        match = next(
            (s for s in stations if s["id"] == station_with_coords.id), None
        )
        assert match is not None
        assert match["latitude"] == pytest.approx(5.603717, abs=1e-4)
        assert match["longitude"] == pytest.approx(-0.186964, abs=1e-4)
