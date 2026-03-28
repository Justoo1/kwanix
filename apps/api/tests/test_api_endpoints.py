"""
Integration tests for FastAPI endpoints.

These tests exercise the HTTP layer — routing, request/response shapes,
status codes, and auth. Business logic edge cases are covered in the
service-layer tests; here we focus on what the API surface guarantees.
"""

from datetime import UTC

import pytest

# ── /health ───────────────────────────────────────────────────────────────────

class TestHealthEndpoint:
    @pytest.mark.asyncio
    async def test_health_returns_200(self, client):
        response = await client.get("/health")
        assert response.status_code == 200
        assert response.json()["status"] == "ok"


# ── /api/v1/auth ──────────────────────────────────────────────────────────────

class TestAuthEndpoints:
    @pytest.mark.asyncio
    async def test_login_valid_credentials_returns_token(self, client, clerk_user):
        response = await client.post(
            "/api/v1/auth/login",
            data={"username": "clerk@test.io", "password": "testpass123"},
        )
        assert response.status_code == 200
        body = response.json()
        assert "access_token" in body
        assert body["token_type"] == "bearer"

    @pytest.mark.asyncio
    async def test_login_wrong_password_returns_401(self, client, clerk_user):
        response = await client.post(
            "/api/v1/auth/login",
            data={"username": "clerk@test.io", "password": "wrongpassword"},
        )
        assert response.status_code == 401

    @pytest.mark.asyncio
    async def test_login_unknown_user_returns_401(self, client):
        response = await client.post(
            "/api/v1/auth/login",
            data={"username": "ghost@test.io", "password": "anything"},
        )
        assert response.status_code == 401

    @pytest.mark.asyncio
    async def test_get_me_with_valid_token(self, client, clerk_user, clerk_token):
        response = await client.get(
            "/api/v1/auth/me",
            headers={"Authorization": f"Bearer {clerk_token}"},
        )
        assert response.status_code == 200
        body = response.json()
        assert body["email"] == "clerk@test.io"
        assert body["role"] == "station_clerk"

    @pytest.mark.asyncio
    async def test_get_me_without_token_returns_401(self, client):
        response = await client.get("/api/v1/auth/me")
        assert response.status_code == 401

    @pytest.mark.asyncio
    async def test_get_me_with_invalid_token_returns_401(self, client):
        response = await client.get(
            "/api/v1/auth/me",
            headers={"Authorization": "Bearer totally.invalid.token"},
        )
        assert response.status_code == 401


# ── /api/v1/track ─────────────────────────────────────────────────────────────

class TestPublicTrackingEndpoint:
    @pytest.mark.asyncio
    async def test_unknown_tracking_id_returns_404(self, client):
        response = await client.get("/api/v1/track/RP-FAKE-0000-00000")
        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_no_auth_required(self, client):
        """Public endpoint — must work without Authorization header."""
        response = await client.get("/api/v1/track/RP-FAKE-0000-00000")
        # 404 is fine — the point is it's not 401/403
        assert response.status_code != 401
        assert response.status_code != 403

    @pytest.mark.asyncio
    async def test_existing_parcel_returns_sanitized_status(
        self, client, db, company, station_accra, station_prestea, clerk_user
    ):
        from app.models.parcel import Parcel, ParcelStatus

        parcel = Parcel(
            company_id=company.id,
            tracking_number="RP-TST-2026-99001",
            sender_name="Kwame",
            sender_phone="233541234567",
            receiver_name="Akosua",
            receiver_phone="233549876543",
            origin_station_id=station_accra.id,
            destination_station_id=station_prestea.id,
            fee_ghs=15.0,
            created_by_id=clerk_user.id,
            status=ParcelStatus.pending,
        )
        db.add(parcel)
        await db.flush()

        response = await client.get("/api/v1/track/RP-TST-2026-99001")
        assert response.status_code == 200
        body = response.json()
        assert body["tracking_number"] == "RP-TST-2026-99001"
        assert body["status"] == "pending"
        assert body["origin"] == "Accra"
        assert body["destination"] == "Prestea"
        # OTP must NOT be exposed
        assert "otp" not in body
        assert "otp_code" not in body


# ── /api/v1/stations ──────────────────────────────────────────────────────────

class TestStationsEndpoints:
    @pytest.mark.asyncio
    async def test_list_stations_requires_auth(self, client):
        response = await client.get("/api/v1/stations")
        assert response.status_code == 401

    @pytest.mark.asyncio
    async def test_list_stations_returns_list(self, client, clerk_token, station_accra):
        response = await client.get(
            "/api/v1/stations",
            headers={"Authorization": f"Bearer {clerk_token}"},
        )
        assert response.status_code == 200
        assert isinstance(response.json(), list)
        assert len(response.json()) >= 1

    @pytest.mark.asyncio
    async def test_pending_parcels_unknown_station_returns_empty(
        self, client, clerk_token, station_accra
    ):
        response = await client.get(
            f"/api/v1/stations/{station_accra.id}/pending-parcels",
            headers={"Authorization": f"Bearer {clerk_token}"},
        )
        assert response.status_code == 200
        assert response.json() == []


# ── /api/v1/vehicles ─────────────────────────────────────────────────────────

class TestVehiclesEndpoints:
    @pytest.mark.asyncio
    async def test_list_vehicles_requires_auth(self, client):
        response = await client.get("/api/v1/vehicles")
        assert response.status_code == 401

    @pytest.mark.asyncio
    async def test_list_vehicles_with_auth(self, client, clerk_token, vehicle):
        response = await client.get(
            "/api/v1/vehicles",
            headers={"Authorization": f"Bearer {clerk_token}"},
        )
        assert response.status_code == 200
        assert isinstance(response.json(), list)


# ── /api/v1/trips ─────────────────────────────────────────────────────────────

class TestTripsEndpoints:
    @pytest.mark.asyncio
    async def test_list_trips_requires_auth(self, client):
        response = await client.get("/api/v1/trips")
        assert response.status_code == 401

    @pytest.mark.asyncio
    async def test_clerk_cannot_create_trip(
        self, client, clerk_token, vehicle, station_accra, station_prestea
    ):
        """station_clerk role is not allowed to create trips."""
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
    async def test_get_nonexistent_trip_returns_404(self, client, clerk_token):
        response = await client.get(
            "/api/v1/trips/99999",
            headers={"Authorization": f"Bearer {clerk_token}"},
        )
        assert response.status_code == 404


# ── /api/v1/tickets ───────────────────────────────────────────────────────────

class TestTicketsEndpoints:
    @pytest.mark.asyncio
    async def test_get_nonexistent_ticket_returns_404(self, client, clerk_token):
        response = await client.get(
            "/api/v1/tickets/99999",
            headers={"Authorization": f"Bearer {clerk_token}"},
        )
        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_invalid_phone_number_returns_422(
        self, client, clerk_token, station_accra, station_prestea, vehicle, db
    ):
        """Pydantic validator should reject bad Ghana phone numbers."""
        from datetime import datetime

        from app.models.trip import Trip, TripStatus

        trip = Trip(
            company_id=1,
            vehicle_id=vehicle.id,
            departure_station_id=station_accra.id,
            destination_station_id=station_prestea.id,
            departure_time=datetime.now(UTC),
            status=TripStatus.loading,
        )
        db.add(trip)
        await db.flush()

        response = await client.post(
            "/api/v1/tickets",
            headers={"Authorization": f"Bearer {clerk_token}"},
            json={
                "trip_id": trip.id,
                "passenger_name": "Kofi Test",
                "passenger_phone": "0301234567",  # Invalid prefix
                "seat_number": 5,
                "fare_ghs": 50.0,
            },
        )
        assert response.status_code == 422


# ── /api/v1/parcels — create ───────────────────────────────────────────────────

class TestCreateParcelEndpoint:
    @pytest.mark.asyncio
    async def test_create_returns_201_with_tracking_and_qr(
        self, client, clerk_token, company, station_accra, station_prestea, tracking_seq
    ):
        response = await client.post(
            "/api/v1/parcels",
            headers={"Authorization": f"Bearer {clerk_token}"},
            json={
                "sender_name": "Kwame",
                "sender_phone": "0541234567",
                "receiver_name": "Akosua",
                "receiver_phone": "0249876543",
                "origin_station_id": station_accra.id,
                "destination_station_id": station_prestea.id,
                "fee_ghs": 15.0,
            },
        )
        assert response.status_code == 201
        body = response.json()
        assert "tracking_number" in body
        assert body["tracking_number"].startswith("RP-TST-")
        assert body["qr_code_base64"] is not None
        assert len(body["qr_code_base64"]) > 0

    @pytest.mark.asyncio
    async def test_create_missing_required_field_returns_422(self, client, clerk_token):
        response = await client.post(
            "/api/v1/parcels",
            headers={"Authorization": f"Bearer {clerk_token}"},
            json={"sender_name": "Kwame"},  # missing phones, stations, receiver_name
        )
        assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_create_bad_phone_returns_422(
        self, client, clerk_token, station_accra, station_prestea
    ):
        response = await client.post(
            "/api/v1/parcels",
            headers={"Authorization": f"Bearer {clerk_token}"},
            json={
                "sender_name": "Kwame",
                "sender_phone": "0301234567",  # invalid Ghana prefix
                "receiver_name": "Akosua",
                "receiver_phone": "0249876543",
                "origin_station_id": station_accra.id,
                "destination_station_id": station_prestea.id,
            },
        )
        assert response.status_code == 422


# ── /api/v1/parcels/load ──────────────────────────────────────────────────────

class TestLoadParcelEndpoint:
    def _make_parcel(
        self, company, station_accra, station_prestea, clerk_user, tracking="RP-TST-2026-20001"
    ):
        from app.models.parcel import Parcel, ParcelStatus
        return Parcel(
            company_id=company.id,
            tracking_number=tracking,
            sender_name="Kwame", sender_phone="233541234567",
            receiver_name="Akosua", receiver_phone="233249876543",
            origin_station_id=station_accra.id,
            destination_station_id=station_prestea.id,
            fee_ghs=10.0,
            created_by_id=clerk_user.id,
            status=ParcelStatus.pending,
        )

    def _make_trip(self, company, vehicle, station_accra, dest_station):
        from datetime import datetime

        from app.models.trip import Trip, TripStatus
        return Trip(
            company_id=company.id,
            vehicle_id=vehicle.id,
            departure_station_id=station_accra.id,
            destination_station_id=dest_station.id,
            departure_time=datetime.now(UTC),
            status=TripStatus.loading,
        )

    @pytest.mark.asyncio
    async def test_matching_destination_returns_200(
        self, client, clerk_token, db, company, station_accra, station_prestea, vehicle, clerk_user
    ):
        parcel = self._make_parcel(company, station_accra, station_prestea, clerk_user)
        trip = self._make_trip(company, vehicle, station_accra, station_prestea)
        db.add(parcel)
        db.add(trip)
        await db.flush()

        response = await client.patch(
            "/api/v1/parcels/load",
            headers={"Authorization": f"Bearer {clerk_token}"},
            json={"parcel_id": parcel.id, "trip_id": trip.id},
        )
        assert response.status_code == 200
        body = response.json()
        assert body["success"] is True
        assert "tracking_number" in body

    @pytest.mark.asyncio
    async def test_mismatched_destination_returns_400(
        self, client, clerk_token, db, company, station_accra, station_prestea, vehicle, clerk_user
    ):
        # Parcel goes to Prestea; trip goes to Accra (mismatch)
        parcel = self._make_parcel(
            company, station_accra, station_prestea, clerk_user, "RP-TST-2026-20002"
        )
        trip = self._make_trip(company, vehicle, station_prestea, station_accra)
        db.add(parcel)
        db.add(trip)
        await db.flush()

        response = await client.patch(
            "/api/v1/parcels/load",
            headers={"Authorization": f"Bearer {clerk_token}"},
            json={"parcel_id": parcel.id, "trip_id": trip.id},
        )
        assert response.status_code == 400
        detail = response.json()["detail"]
        assert detail["code"] == "DESTINATION_MISMATCH"
        assert "correct_destination" in detail
        assert "bus_destination" in detail

    @pytest.mark.asyncio
    async def test_nonexistent_parcel_returns_404(
        self, client, clerk_token, db, company, station_accra, station_prestea, vehicle
    ):
        trip = self._make_trip(company, vehicle, station_accra, station_prestea)
        db.add(trip)
        await db.flush()

        response = await client.patch(
            "/api/v1/parcels/load",
            headers={"Authorization": f"Bearer {clerk_token}"},
            json={"parcel_id": 999999, "trip_id": trip.id},
        )
        assert response.status_code == 404


# ── /api/v1/parcels/unload ────────────────────────────────────────────────────

class TestUnloadParcelEndpoint:
    @pytest.mark.asyncio
    async def test_happy_path_otp_not_in_response(
        self, client, clerk_token, db, company, station_accra, station_prestea, vehicle, clerk_user
    ):
        from datetime import datetime

        from app.models.parcel import Parcel, ParcelStatus
        from app.models.trip import Trip, TripStatus

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

        parcel = Parcel(
            company_id=company.id,
            tracking_number="RP-TST-2026-30001",
            sender_name="Kwame", sender_phone="233541234567",
            receiver_name="Akosua", receiver_phone="233249876543",
            origin_station_id=station_accra.id,
            destination_station_id=station_prestea.id,
            current_trip_id=trip.id,
            fee_ghs=10.0,
            created_by_id=clerk_user.id,
            status=ParcelStatus.in_transit,
        )
        db.add(parcel)
        await db.flush()

        response = await client.patch(
            "/api/v1/parcels/unload",
            headers={"Authorization": f"Bearer {clerk_token}"},
            json={"parcel_id": parcel.id},
        )
        assert response.status_code == 200
        body = response.json()
        assert body["success"] is True
        # OTP must NOT be in the HTTP response — it's sent via SMS only
        assert "otp" not in body
        assert "otp_code" not in body


# ── /api/v1/parcels/collect ───────────────────────────────────────────────────

class TestCollectParcelEndpoint:
    def _make_arrived_parcel(
        self, company, station_accra, station_prestea, clerk_user,
        otp, expires_at, attempt_count=0, tracking="RP-TST-2026-40001",
    ):
        from app.models.parcel import Parcel, ParcelStatus
        return Parcel(
            company_id=company.id,
            tracking_number=tracking,
            sender_name="Kwame", sender_phone="233541234567",
            receiver_name="Akosua", receiver_phone="233249876543",
            origin_station_id=station_accra.id,
            destination_station_id=station_prestea.id,
            fee_ghs=10.0,
            created_by_id=clerk_user.id,
            status=ParcelStatus.arrived,
            otp_code=otp,
            otp_expires_at=expires_at,
            otp_attempt_count=attempt_count,
        )

    @pytest.mark.asyncio
    async def test_correct_otp_returns_200_with_success_true(
        self, client, clerk_token, db, company, station_accra, station_prestea, clerk_user
    ):
        from app.services.otp_service import generate_otp

        otp_code, expires_at = generate_otp()
        parcel = self._make_arrived_parcel(
            company, station_accra, station_prestea, clerk_user, otp_code, expires_at
        )
        db.add(parcel)
        await db.flush()

        response = await client.post(
            "/api/v1/parcels/collect",
            headers={"Authorization": f"Bearer {clerk_token}"},
            json={"tracking_number": parcel.tracking_number, "otp": otp_code},
        )
        assert response.status_code == 200
        body = response.json()
        assert body["success"] is True

    @pytest.mark.asyncio
    async def test_wrong_otp_returns_403(
        self, client, clerk_token, db, company, station_accra, station_prestea, clerk_user
    ):
        from app.services.otp_service import generate_otp

        otp_code, expires_at = generate_otp()
        parcel = self._make_arrived_parcel(
            company, station_accra, station_prestea, clerk_user, otp_code, expires_at,
            tracking="RP-TST-2026-40002",
        )
        db.add(parcel)
        await db.flush()

        response = await client.post(
            "/api/v1/parcels/collect",
            headers={"Authorization": f"Bearer {clerk_token}"},
            json={"tracking_number": parcel.tracking_number, "otp": "000000"},
        )
        assert response.status_code == 403

    @pytest.mark.asyncio
    async def test_five_wrong_attempts_returns_400_too_many(
        self, client, clerk_token, db, company, station_accra, station_prestea, clerk_user
    ):
        from app.services.otp_service import generate_otp

        otp_code, expires_at = generate_otp()
        parcel = self._make_arrived_parcel(
            company, station_accra, station_prestea, clerk_user, otp_code, expires_at,
            attempt_count=5,  # already locked
            tracking="RP-TST-2026-40003",
        )
        db.add(parcel)
        await db.flush()

        response = await client.post(
            "/api/v1/parcels/collect",
            headers={"Authorization": f"Bearer {clerk_token}"},
            json={"tracking_number": parcel.tracking_number, "otp": "000000"},
        )
        assert response.status_code == 400
        assert "Too many" in response.json()["detail"]
