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

    @pytest.mark.asyncio
    async def test_change_password_success(self, client, clerk_user, clerk_token):
        response = await client.post(
            "/api/v1/auth/change-password",
            json={"current_password": "testpass123", "new_password": "newpass456"},
            headers={"Authorization": f"Bearer {clerk_token}"},
        )
        assert response.status_code == 204

    @pytest.mark.asyncio
    async def test_change_password_wrong_current_returns_400(self, client, clerk_user, clerk_token):
        response = await client.post(
            "/api/v1/auth/change-password",
            json={"current_password": "wrongpassword", "new_password": "newpass456"},
            headers={"Authorization": f"Bearer {clerk_token}"},
        )
        assert response.status_code == 400

    @pytest.mark.asyncio
    async def test_change_password_unauthenticated_returns_401(self, client):
        response = await client.post(
            "/api/v1/auth/change-password",
            json={"current_password": "testpass123", "new_password": "newpass456"},
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

    @pytest.mark.asyncio
    async def test_parcel_summary_counts_by_status(
        self, client, clerk_token, db, company, station_accra, station_prestea, clerk_user
    ):
        from app.models.parcel import Parcel, ParcelStatus

        def _parcel(status: ParcelStatus, n: int) -> Parcel:
            return Parcel(
                company_id=company.id,
                tracking_number=f"RP-TST-SUM-{n:05d}",
                sender_name="Sender",
                sender_phone="233541234567",
                receiver_name="Receiver",
                receiver_phone="233549876543",
                origin_station_id=station_accra.id,
                destination_station_id=station_prestea.id,
                fee_ghs=5.0,
                created_by_id=clerk_user.id,
                status=status,
            )

        db.add_all(
            [
                _parcel(ParcelStatus.pending, 1),
                _parcel(ParcelStatus.pending, 2),
                _parcel(ParcelStatus.in_transit, 3),
                _parcel(ParcelStatus.arrived, 4),
            ]
        )
        await db.flush()

        response = await client.get(
            f"/api/v1/stations/{station_accra.id}/parcel-summary",
            headers={"Authorization": f"Bearer {clerk_token}"},
        )
        assert response.status_code == 200
        body = response.json()
        assert body["pending"] == 2
        assert body["in_transit"] == 1
        assert body["arrived"] == 1
        assert body["picked_up"] == 0
        assert body["returned"] == 0

    @pytest.mark.asyncio
    async def test_parcel_summary_requires_auth(self, client, station_accra):
        response = await client.get(f"/api/v1/stations/{station_accra.id}/parcel-summary")
        assert response.status_code == 401


class TestStationSoftDelete:
    @pytest.fixture
    async def admin_token(self, db, company, station_accra):
        from app.models.user import User, UserRole
        from app.services.auth_service import create_access_token, hash_password

        u = User(
            company_id=company.id,
            station_id=station_accra.id,
            full_name="Admin User",
            phone="233201111111",
            email="admin@test.io",
            hashed_password=hash_password("adminpass"),
            role=UserRole.company_admin,
        )
        db.add(u)
        await db.flush()
        return create_access_token(u)

    @pytest.mark.asyncio
    async def test_deactivate_station(self, client, admin_token, station_accra):
        response = await client.patch(
            f"/api/v1/stations/{station_accra.id}/deactivate",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert response.status_code == 200
        assert response.json()["is_active"] is False

    @pytest.mark.asyncio
    async def test_deactivate_idempotent(self, client, admin_token, station_accra):
        # First deactivation
        await client.patch(
            f"/api/v1/stations/{station_accra.id}/deactivate",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        # Second deactivation should still return 200
        response = await client.patch(
            f"/api/v1/stations/{station_accra.id}/deactivate",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert response.status_code == 200
        assert response.json()["is_active"] is False

    @pytest.mark.asyncio
    async def test_activate_station(self, client, admin_token, station_accra):
        # Deactivate first
        await client.patch(
            f"/api/v1/stations/{station_accra.id}/deactivate",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        # Then activate
        response = await client.patch(
            f"/api/v1/stations/{station_accra.id}/activate",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert response.status_code == 200
        assert response.json()["is_active"] is True

    @pytest.mark.asyncio
    async def test_deactivate_requires_admin(self, client, clerk_token, station_accra):
        response = await client.patch(
            f"/api/v1/stations/{station_accra.id}/deactivate",
            headers={"Authorization": f"Bearer {clerk_token}"},
        )
        assert response.status_code == 403

    @pytest.mark.asyncio
    async def test_deactivate_nonexistent_returns_404(self, client, admin_token):
        response = await client.patch(
            "/api/v1/stations/99999/deactivate",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert response.status_code == 404


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


# ── /api/v1/parcels — search ──────────────────────────────────────────────────


class TestParcelSearchEndpoint:
    def _parcel(
        self,
        company,
        station_accra,
        station_prestea,
        clerk_user,
        tracking,
        sender,
        receiver,
        status_val,
    ):
        from app.models.parcel import Parcel

        return Parcel(
            company_id=company.id,
            tracking_number=tracking,
            sender_name=sender,
            sender_phone="233541234567",
            receiver_name=receiver,
            receiver_phone="233249876543",
            origin_station_id=station_accra.id,
            destination_station_id=station_prestea.id,
            fee_ghs=5.0,
            created_by_id=clerk_user.id,
            status=status_val,
        )

    @pytest.mark.asyncio
    async def test_search_by_tracking_fragment(
        self, client, clerk_token, db, company, station_accra, station_prestea, clerk_user
    ):
        from app.models.parcel import ParcelStatus

        db.add(
            self._parcel(
                company,
                station_accra,
                station_prestea,
                clerk_user,
                "RP-TST-SRCH-00001",
                "Kwame",
                "Akosua",
                ParcelStatus.pending,
            )
        )
        db.add(
            self._parcel(
                company,
                station_accra,
                station_prestea,
                clerk_user,
                "RP-TST-SRCH-00002",
                "Kofi",
                "Ama",
                ParcelStatus.pending,
            )
        )
        await db.flush()

        response = await client.get(
            "/api/v1/parcels?q=SRCH-00001",
            headers={"Authorization": f"Bearer {clerk_token}"},
        )
        assert response.status_code == 200
        body = response.json()
        assert len(body) == 1
        assert body[0]["tracking_number"] == "RP-TST-SRCH-00001"

    @pytest.mark.asyncio
    async def test_search_by_sender_name(
        self, client, clerk_token, db, company, station_accra, station_prestea, clerk_user
    ):
        from app.models.parcel import ParcelStatus

        db.add(
            self._parcel(
                company,
                station_accra,
                station_prestea,
                clerk_user,
                "RP-TST-SRCH-00003",
                "UniqueKwame",
                "Receiver",
                ParcelStatus.pending,
            )
        )
        await db.flush()

        response = await client.get(
            "/api/v1/parcels?q=uniquekwame",
            headers={"Authorization": f"Bearer {clerk_token}"},
        )
        assert response.status_code == 200
        body = response.json()
        assert any(p["sender_name"] == "UniqueKwame" for p in body)

    @pytest.mark.asyncio
    async def test_filter_by_status(
        self, client, clerk_token, db, company, station_accra, station_prestea, clerk_user
    ):
        from app.models.parcel import ParcelStatus

        db.add(
            self._parcel(
                company,
                station_accra,
                station_prestea,
                clerk_user,
                "RP-TST-SRCH-00004",
                "Alpha",
                "Beta",
                ParcelStatus.arrived,
            )
        )
        db.add(
            self._parcel(
                company,
                station_accra,
                station_prestea,
                clerk_user,
                "RP-TST-SRCH-00005",
                "Gamma",
                "Delta",
                ParcelStatus.pending,
            )
        )
        await db.flush()

        response = await client.get(
            "/api/v1/parcels?status=arrived",
            headers={"Authorization": f"Bearer {clerk_token}"},
        )
        assert response.status_code == 200
        body = response.json()
        assert all(p["status"] == "arrived" for p in body)

    @pytest.mark.asyncio
    async def test_pagination_limit_offset(
        self, client, clerk_token, db, company, station_accra, station_prestea, clerk_user
    ):
        from app.models.parcel import ParcelStatus

        for i in range(5):
            db.add(
                self._parcel(
                    company,
                    station_accra,
                    station_prestea,
                    clerk_user,
                    f"RP-TST-PAGE-{i:05d}",
                    f"Sender{i}",
                    f"Recv{i}",
                    ParcelStatus.pending,
                )
            )
        await db.flush()

        response = await client.get(
            "/api/v1/parcels?q=PAGE&limit=3&offset=0",
            headers={"Authorization": f"Bearer {clerk_token}"},
        )
        assert response.status_code == 200
        first_page = response.json()
        assert len(first_page) == 3

        response2 = await client.get(
            "/api/v1/parcels?q=PAGE&limit=3&offset=3",
            headers={"Authorization": f"Bearer {clerk_token}"},
        )
        assert response2.status_code == 200
        second_page = response2.json()
        assert len(second_page) == 2

        # No overlap
        first_ids = {p["id"] for p in first_page}
        second_ids = {p["id"] for p in second_page}
        assert first_ids.isdisjoint(second_ids)


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
            sender_name="Kwame",
            sender_phone="233541234567",
            receiver_name="Akosua",
            receiver_phone="233249876543",
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
            sender_name="Kwame",
            sender_phone="233541234567",
            receiver_name="Akosua",
            receiver_phone="233249876543",
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
        self,
        company,
        station_accra,
        station_prestea,
        clerk_user,
        otp,
        expires_at,
        attempt_count=0,
        tracking="RP-TST-2026-40001",
    ):
        from app.models.parcel import Parcel, ParcelStatus

        return Parcel(
            company_id=company.id,
            tracking_number=tracking,
            sender_name="Kwame",
            sender_phone="233541234567",
            receiver_name="Akosua",
            receiver_phone="233249876543",
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
            company,
            station_accra,
            station_prestea,
            clerk_user,
            otp_code,
            expires_at,
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
            company,
            station_accra,
            station_prestea,
            clerk_user,
            otp_code,
            expires_at,
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


# ── /api/v1/parcels/{id}/logs ─────────────────────────────────────────────────


class TestParcelLogsEndpoint:
    @pytest.mark.asyncio
    async def test_logs_returns_entries_ordered_by_time(
        self, client, db, company, station_accra, station_prestea, clerk_user
    ):
        from datetime import datetime

        from app.models.parcel import Parcel, ParcelLog, ParcelStatus
        from app.models.user import User, UserRole
        from app.services.auth_service import create_access_token, hash_password

        # Create a manager user for the role-protected endpoint
        manager = User(
            company_id=company.id,
            station_id=station_accra.id,
            full_name="Test Manager",
            phone="233541110001",
            email="manager@test.io",
            hashed_password=hash_password("testpass123"),
            role=UserRole.station_manager,
        )
        db.add(manager)
        await db.flush()
        manager_token = create_access_token(manager)

        parcel = Parcel(
            company_id=company.id,
            tracking_number="RP-TST-2026-50001",
            sender_name="Kwame",
            sender_phone="233541234567",
            receiver_name="Akosua",
            receiver_phone="233249876543",
            origin_station_id=station_accra.id,
            destination_station_id=station_prestea.id,
            fee_ghs=10.0,
            created_by_id=clerk_user.id,
            status=ParcelStatus.in_transit,
        )
        db.add(parcel)
        await db.flush()

        now = datetime.now(UTC)
        log1 = ParcelLog(
            parcel_id=parcel.id,
            clerk_id=clerk_user.id,
            previous_status="pending",
            new_status="in_transit",
            note="Loaded onto bus",
            occurred_at=now,
        )
        log2 = ParcelLog(
            parcel_id=parcel.id,
            clerk_id=clerk_user.id,
            previous_status="in_transit",
            new_status="arrived",
            note="Arrived at destination",
            occurred_at=now,
        )
        db.add(log1)
        db.add(log2)
        await db.flush()

        response = await client.get(
            f"/api/v1/parcels/{parcel.id}/logs",
            headers={"Authorization": f"Bearer {manager_token}"},
        )
        assert response.status_code == 200
        body = response.json()
        assert len(body) == 2
        assert body[0]["new_status"] == "in_transit"
        assert body[1]["new_status"] == "arrived"

    @pytest.mark.asyncio
    async def test_logs_requires_manager_role(
        self, client, clerk_token, db, company, station_accra, station_prestea, clerk_user
    ):
        from app.models.parcel import Parcel, ParcelStatus

        parcel = Parcel(
            company_id=company.id,
            tracking_number="RP-TST-2026-50002",
            sender_name="Kwame",
            sender_phone="233541234567",
            receiver_name="Akosua",
            receiver_phone="233249876543",
            origin_station_id=station_accra.id,
            destination_station_id=station_prestea.id,
            fee_ghs=10.0,
            created_by_id=clerk_user.id,
            status=ParcelStatus.pending,
        )
        db.add(parcel)
        await db.flush()

        response = await client.get(
            f"/api/v1/parcels/{parcel.id}/logs",
            headers={"Authorization": f"Bearer {clerk_token}"},
        )
        assert response.status_code == 403


# ── /api/v1/parcels/{id}/return ──────────────────────────────────────────────


class TestReturnParcelEndpoint:
    @pytest.mark.asyncio
    async def test_return_arrived_parcel_returns_200(
        self, client, clerk_token, db, company, station_accra, station_prestea, clerk_user
    ):
        from app.models.parcel import Parcel, ParcelStatus

        parcel = Parcel(
            company_id=company.id,
            tracking_number="RP-TST-2026-60001",
            sender_name="Kwame",
            sender_phone="233541234567",
            receiver_name="Akosua",
            receiver_phone="233249876543",
            origin_station_id=station_accra.id,
            destination_station_id=station_prestea.id,
            fee_ghs=10.0,
            created_by_id=clerk_user.id,
            status=ParcelStatus.arrived,
        )
        db.add(parcel)
        await db.flush()

        response = await client.patch(
            f"/api/v1/parcels/{parcel.id}/return",
            headers={"Authorization": f"Bearer {clerk_token}"},
            json={"reason": "Receiver not available"},
        )
        assert response.status_code == 200
        assert response.json()["status"] == "returned"

    @pytest.mark.asyncio
    async def test_return_non_arrived_parcel_returns_400(
        self, client, clerk_token, db, company, station_accra, station_prestea, clerk_user
    ):
        from app.models.parcel import Parcel, ParcelStatus

        parcel = Parcel(
            company_id=company.id,
            tracking_number="RP-TST-2026-60002",
            sender_name="Kwame",
            sender_phone="233541234567",
            receiver_name="Akosua",
            receiver_phone="233249876543",
            origin_station_id=station_accra.id,
            destination_station_id=station_prestea.id,
            fee_ghs=10.0,
            created_by_id=clerk_user.id,
            status=ParcelStatus.pending,
        )
        db.add(parcel)
        await db.flush()

        response = await client.patch(
            f"/api/v1/parcels/{parcel.id}/return",
            headers={"Authorization": f"Bearer {clerk_token}"},
            json={},
        )
        assert response.status_code == 400


# ── Admin user management (E3) ────────────────────────────────────────────────


class TestAdminUserManagement:
    """Tests for invite-user and deactivate-user endpoints."""

    @pytest.fixture
    async def admin_user(self, db, company):
        from app.models.user import User, UserRole
        from app.services.auth_service import hash_password

        u = User(
            company_id=company.id,
            full_name="Test Admin",
            phone="233200000001",
            email="admin@test.io",
            hashed_password=hash_password("testpass123"),
            role=UserRole.company_admin,
        )
        db.add(u)
        await db.flush()
        return u

    @pytest.fixture
    async def admin_token(self, admin_user):
        from app.services.auth_service import create_access_token

        return create_access_token(admin_user)

    @pytest.mark.asyncio
    async def test_create_user_with_temp_password(self, client, admin_token):
        response = await client.post(
            "/api/v1/admin/users",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={
                "full_name": "New Clerk",
                "phone": "233200000099",
                "role": "station_clerk",
            },
        )
        assert response.status_code == 201
        body = response.json()
        assert body["full_name"] == "New Clerk"
        assert body["is_active"] is True
        # auto-generated temp password must be present
        assert body["temp_password"] is not None
        assert len(body["temp_password"]) >= 12

    @pytest.mark.asyncio
    async def test_create_user_with_explicit_password_no_temp(self, client, admin_token):
        response = await client.post(
            "/api/v1/admin/users",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={
                "full_name": "Explicit Pass",
                "phone": "233200000098",
                "role": "station_clerk",
                "password": "mySecretPass1",
            },
        )
        assert response.status_code == 201
        body = response.json()
        # No temp_password when caller supplied one
        assert body["temp_password"] is None

    @pytest.mark.asyncio
    async def test_deactivate_user(self, client, admin_token, clerk_user):
        response = await client.patch(
            f"/api/v1/admin/users/{clerk_user.id}/deactivate",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert response.status_code == 200
        assert response.json()["is_active"] is False

    @pytest.mark.asyncio
    async def test_deactivate_self_returns_400(self, client, admin_user, admin_token):
        response = await client.patch(
            f"/api/v1/admin/users/{admin_user.id}/deactivate",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert response.status_code == 400

    @pytest.mark.asyncio
    async def test_deactivate_requires_admin(self, client, clerk_token, clerk_user):
        response = await client.patch(
            f"/api/v1/admin/users/{clerk_user.id}/deactivate",
            headers={"Authorization": f"Bearer {clerk_token}"},
        )
        assert response.status_code == 403

    @pytest.mark.asyncio
    async def test_activate_user(self, client, admin_token, clerk_user, db):
        # First deactivate
        clerk_user.is_active = False
        await db.flush()

        response = await client.patch(
            f"/api/v1/admin/users/{clerk_user.id}/activate",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert response.status_code == 200
        assert response.json()["is_active"] is True

    @pytest.mark.asyncio
    async def test_activate_idempotent(self, client, admin_token, clerk_user):
        # Activating an already-active user is idempotent
        response = await client.patch(
            f"/api/v1/admin/users/{clerk_user.id}/activate",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert response.status_code == 200
        assert response.json()["is_active"] is True

    @pytest.mark.asyncio
    async def test_activate_requires_admin(self, client, clerk_token, clerk_user):
        response = await client.patch(
            f"/api/v1/admin/users/{clerk_user.id}/activate",
            headers={"Authorization": f"Bearer {clerk_token}"},
        )
        assert response.status_code == 403


# ── Vehicle capacity guard (E4) ───────────────────────────────────────────────


class TestVehicleCapacityGuard:
    """Ticket creation must be blocked when trip is at vehicle capacity."""

    @pytest.fixture
    async def small_vehicle(self, db, company):
        from app.models.vehicle import Vehicle

        v = Vehicle(company_id=company.id, plate_number="GR-SMALL-01", capacity=2)
        db.add(v)
        await db.flush()
        return v

    @pytest.fixture
    async def loading_trip_small(self, db, company, small_vehicle, station_accra, station_prestea):
        from datetime import UTC, datetime

        from app.models.trip import Trip, TripStatus

        trip = Trip(
            company_id=company.id,
            vehicle_id=small_vehicle.id,
            departure_station_id=station_accra.id,
            destination_station_id=station_prestea.id,
            departure_time=datetime.now(UTC),
            status=TripStatus.loading,
        )
        db.add(trip)
        await db.flush()
        return trip

    @pytest.mark.asyncio
    async def test_overbooking_blocked(
        self, client, clerk_token, db, company, loading_trip_small, clerk_user
    ):
        from app.models.ticket import PaymentStatus, Ticket, TicketSource, TicketStatus

        # Fill the 2-seat vehicle
        for seat in (1, 2):
            db.add(
                Ticket(
                    company_id=company.id,
                    trip_id=loading_trip_small.id,
                    created_by_id=clerk_user.id,
                    passenger_name=f"Passenger {seat}",
                    passenger_phone="233541234567",
                    seat_number=seat,
                    fare_ghs=20.0,
                    status=TicketStatus.valid,
                    source=TicketSource.counter,
                    payment_status=PaymentStatus.pending,
                )
            )
        await db.flush()

        response = await client.post(
            "/api/v1/tickets",
            headers={"Authorization": f"Bearer {clerk_token}"},
            json={
                "trip_id": loading_trip_small.id,
                "passenger_name": "Late Arrival",
                "passenger_phone": "233241000000",
                "seat_number": 3,
                "fare_ghs": 20.0,
            },
        )
        assert response.status_code == 400
        assert response.json()["detail"]["code"] == "TRIP_FULL"

    @pytest.mark.asyncio
    async def test_cancelled_tickets_do_not_count_toward_capacity(
        self, client, clerk_token, db, company, loading_trip_small, clerk_user
    ):
        from app.models.ticket import PaymentStatus, Ticket, TicketSource, TicketStatus

        # Two cancelled tickets should NOT block new booking
        for seat in (1, 2):
            db.add(
                Ticket(
                    company_id=company.id,
                    trip_id=loading_trip_small.id,
                    created_by_id=clerk_user.id,
                    passenger_name=f"Cancelled {seat}",
                    passenger_phone="233541234567",
                    seat_number=seat,
                    fare_ghs=20.0,
                    status=TicketStatus.cancelled,
                    source=TicketSource.counter,
                    payment_status=PaymentStatus.pending,
                )
            )
        await db.flush()

        response = await client.post(
            "/api/v1/tickets",
            headers={"Authorization": f"Bearer {clerk_token}"},
            json={
                "trip_id": loading_trip_small.id,
                "passenger_name": "New Passenger",
                "passenger_phone": "233241000001",
                "seat_number": 1,
                "fare_ghs": 20.0,
            },
        )
        assert response.status_code == 201


# ── Parcel receipt PDF (E5) ───────────────────────────────────────────────────


class TestParcelReceiptEndpoint:
    """GET /api/v1/parcels/{id}/receipt — PDF download for collected parcels."""

    @pytest.fixture
    async def picked_up_parcel(self, db, company, station_accra, station_prestea, clerk_user):
        from app.models.parcel import Parcel, ParcelStatus

        p = Parcel(
            company_id=company.id,
            tracking_number="RP-TST-RCPT-001",
            sender_name="Sender Name",
            sender_phone="233541111111",
            receiver_name="Receiver Name",
            receiver_phone="233542222222",
            origin_station_id=station_accra.id,
            destination_station_id=station_prestea.id,
            fee_ghs=15.0,
            created_by_id=clerk_user.id,
            status=ParcelStatus.picked_up,
        )
        db.add(p)
        await db.flush()
        return p

    @pytest.fixture
    async def pending_parcel(self, db, company, station_accra, station_prestea, clerk_user):
        from app.models.parcel import Parcel, ParcelStatus

        p = Parcel(
            company_id=company.id,
            tracking_number="RP-TST-RCPT-002",
            sender_name="Sender",
            sender_phone="233541111112",
            receiver_name="Receiver",
            receiver_phone="233542222223",
            origin_station_id=station_accra.id,
            destination_station_id=station_prestea.id,
            fee_ghs=10.0,
            created_by_id=clerk_user.id,
            status=ParcelStatus.pending,
        )
        db.add(p)
        await db.flush()
        return p

    @pytest.mark.asyncio
    async def test_receipt_returns_pdf_for_picked_up_parcel(
        self, client, clerk_token, picked_up_parcel
    ):
        response = await client.get(
            f"/api/v1/parcels/{picked_up_parcel.id}/receipt",
            headers={"Authorization": f"Bearer {clerk_token}"},
        )
        assert response.status_code == 200
        assert response.headers["content-type"] == "application/pdf"
        assert b"%PDF" in response.content  # valid PDF header

    @pytest.mark.asyncio
    async def test_receipt_400_if_not_picked_up(self, client, clerk_token, pending_parcel):
        response = await client.get(
            f"/api/v1/parcels/{pending_parcel.id}/receipt",
            headers={"Authorization": f"Bearer {clerk_token}"},
        )
        assert response.status_code == 400
        assert response.json()["detail"]["code"] == "NOT_COLLECTED"

    @pytest.mark.asyncio
    async def test_receipt_requires_auth(self, client, picked_up_parcel):
        response = await client.get(f"/api/v1/parcels/{picked_up_parcel.id}/receipt")
        assert response.status_code == 401

    @pytest.mark.asyncio
    async def test_receipt_404_for_unknown_parcel(self, client, clerk_token):
        response = await client.get(
            "/api/v1/parcels/999999/receipt",
            headers={"Authorization": f"Bearer {clerk_token}"},
        )
        assert response.status_code == 404


# ── G2: Parcel CSV Export ──────────────────────────────────────────────────────


class TestParcelExportEndpoint:
    """GET /api/v1/parcels/export — CSV download for managers+."""

    @pytest.fixture
    async def manager_user(self, db, company, station_accra):
        from app.models.user import User, UserRole
        from app.services.auth_service import hash_password

        u = User(
            company_id=company.id,
            station_id=station_accra.id,
            full_name="Export Manager",
            phone="233201111111",
            email="exportmgr@test.io",
            hashed_password=hash_password("testpass123"),
            role=UserRole.station_manager,
        )
        db.add(u)
        await db.flush()
        return u

    @pytest.fixture
    async def manager_token(self, manager_user):
        from app.services.auth_service import create_access_token

        return create_access_token(manager_user)

    @pytest.fixture
    async def sample_parcel(self, db, company, station_accra, station_prestea, clerk_user):
        from app.models.parcel import Parcel, ParcelStatus

        p = Parcel(
            company_id=company.id,
            tracking_number="RP-TST-EXP-001",
            sender_name="Export Sender",
            sender_phone="233541234567",
            receiver_name="Export Receiver",
            receiver_phone="233249876543",
            origin_station_id=station_accra.id,
            destination_station_id=station_prestea.id,
            fee_ghs=12.0,
            created_by_id=clerk_user.id,
            status=ParcelStatus.pending,
        )
        db.add(p)
        await db.flush()
        return p

    @pytest.mark.asyncio
    async def test_export_returns_csv(self, client, manager_token, sample_parcel):
        response = await client.get(
            "/api/v1/parcels/export",
            headers={"Authorization": f"Bearer {manager_token}"},
        )
        assert response.status_code == 200
        assert "text/csv" in response.headers["content-type"]
        assert "parcels.csv" in response.headers["content-disposition"]
        lines = response.text.strip().splitlines()
        assert lines[0].startswith("tracking_number")
        assert any("RP-TST-EXP-001" in line for line in lines[1:])

    @pytest.mark.asyncio
    async def test_export_filters_by_status(
        self, client, manager_token, db, company, station_accra, station_prestea, clerk_user
    ):
        from app.models.parcel import Parcel, ParcelStatus

        db.add(
            Parcel(
                company_id=company.id,
                tracking_number="RP-TST-EXP-002",
                sender_name="Sender2",
                sender_phone="233541234568",
                receiver_name="Receiver2",
                receiver_phone="233249876544",
                origin_station_id=station_accra.id,
                destination_station_id=station_prestea.id,
                fee_ghs=5.0,
                created_by_id=clerk_user.id,
                status=ParcelStatus.in_transit,
            )
        )
        await db.flush()

        response = await client.get(
            "/api/v1/parcels/export?status=in_transit",
            headers={"Authorization": f"Bearer {manager_token}"},
        )
        assert response.status_code == 200
        lines = response.text.strip().splitlines()
        data_lines = lines[1:]
        assert all("in_transit" in line for line in data_lines)

    @pytest.mark.asyncio
    async def test_export_requires_manager_role(self, client, clerk_token, sample_parcel):
        response = await client.get(
            "/api/v1/parcels/export",
            headers={"Authorization": f"Bearer {clerk_token}"},
        )
        assert response.status_code == 403

    @pytest.mark.asyncio
    async def test_export_requires_auth(self, client):
        response = await client.get("/api/v1/parcels/export")
        assert response.status_code == 401


# ── G5: Admin Stats ───────────────────────────────────────────────────────────


class TestAdminStats:
    """GET /api/v1/admin/stats — super_admin only."""

    @pytest.fixture
    async def super_admin_user(self, db):
        from app.models.company import Company
        from app.models.user import User, UserRole
        from app.services.auth_service import hash_password

        company = Company(name="RoutePass HQ", company_code="RPH", is_active=True)
        db.add(company)
        await db.flush()

        u = User(
            company_id=company.id,
            full_name="Super Admin",
            phone="233200000099",
            email="superadmin@test.io",
            hashed_password=hash_password("testpass123"),
            role=UserRole.super_admin,
        )
        db.add(u)
        await db.flush()
        return u

    @pytest.fixture
    async def super_admin_token(self, super_admin_user):
        from app.services.auth_service import create_access_token

        return create_access_token(super_admin_user)

    @pytest.mark.asyncio
    async def test_stats_returns_expected_shape(self, client, super_admin_token):
        response = await client.get(
            "/api/v1/admin/stats",
            headers={"Authorization": f"Bearer {super_admin_token}"},
        )
        assert response.status_code == 200
        body = response.json()
        assert "companies" in body
        assert "active_trips" in body
        assert "parcels_today" in body
        assert "revenue_today_ghs" in body

    @pytest.mark.asyncio
    async def test_stats_counts_companies(self, client, super_admin_token, company):
        response = await client.get(
            "/api/v1/admin/stats",
            headers={"Authorization": f"Bearer {super_admin_token}"},
        )
        body = response.json()
        # At least the fixture company + superadmin's company
        assert body["companies"] >= 1

    @pytest.mark.asyncio
    async def test_stats_requires_super_admin(self, client, clerk_token):
        response = await client.get(
            "/api/v1/admin/stats",
            headers={"Authorization": f"Bearer {clerk_token}"},
        )
        assert response.status_code == 403

    @pytest.mark.asyncio
    async def test_stats_requires_auth(self, client):
        response = await client.get("/api/v1/admin/stats")
        assert response.status_code == 401


# ── H1: Ticket QR code ────────────────────────────────────────────────────────


class TestTicketQr:
    """GET /api/v1/tickets/{ticket_id}/qr — PNG QR code for boarding verification."""

    @pytest.fixture
    async def loading_trip(self, db, company, vehicle, station_accra, station_prestea):
        from datetime import datetime

        from app.models.trip import Trip, TripStatus

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
    async def ticket(self, db, company, loading_trip, clerk_user):
        from app.models.ticket import PaymentStatus, Ticket, TicketSource

        t = Ticket(
            company_id=company.id,
            trip_id=loading_trip.id,
            created_by_id=clerk_user.id,
            passenger_name="QR Test Passenger",
            passenger_phone="233209999888",
            seat_number=7,
            fare_ghs=45.0,
            source=TicketSource.counter,
            payment_status=PaymentStatus.pending,
        )
        db.add(t)
        await db.flush()
        return t

    @pytest.mark.asyncio
    async def test_qr_returns_png_image(self, client, clerk_token, ticket):
        response = await client.get(
            f"/api/v1/tickets/{ticket.id}/qr",
            headers={"Authorization": f"Bearer {clerk_token}"},
        )
        assert response.status_code == 200
        assert response.headers["content-type"] == "image/png"
        # PNG magic bytes
        assert response.content[:4] == b"\x89PNG"

    @pytest.mark.asyncio
    async def test_qr_content_is_non_empty(self, client, clerk_token, ticket):
        response = await client.get(
            f"/api/v1/tickets/{ticket.id}/qr",
            headers={"Authorization": f"Bearer {clerk_token}"},
        )
        assert len(response.content) > 100

    @pytest.mark.asyncio
    async def test_qr_nonexistent_ticket_returns_404(self, client, clerk_token):
        response = await client.get(
            "/api/v1/tickets/99999/qr",
            headers={"Authorization": f"Bearer {clerk_token}"},
        )
        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_qr_requires_auth(self, client):
        response = await client.get("/api/v1/tickets/1/qr")
        assert response.status_code == 401


# ── H2: Parcel age alert ──────────────────────────────────────────────────────


class TestParcelOverdue:
    """GET /api/v1/parcels/overdue — arrived parcels uncollected > 3 days."""

    @pytest.fixture
    async def manager_user(self, db, company, station_accra):
        from app.models.user import User, UserRole
        from app.services.auth_service import hash_password

        u = User(
            company_id=company.id,
            station_id=station_accra.id,
            full_name="Overdue Manager",
            phone="233207770001",
            email="mgr.overdue@test.io",
            hashed_password=hash_password("testpass"),
            role=UserRole.station_manager,
        )
        db.add(u)
        await db.flush()
        return u

    @pytest.fixture
    async def manager_token(self, manager_user):
        from app.services.auth_service import create_access_token

        return create_access_token(manager_user)

    @pytest.fixture
    async def overdue_parcel(self, db, company, station_accra, station_prestea):
        from datetime import datetime, timedelta

        from app.models.parcel import Parcel, ParcelStatus

        p = Parcel(
            company_id=company.id,
            tracking_number="RP-TST-ODUE-001",
            sender_name="Sender",
            sender_phone="233541111201",
            receiver_name="Receiver",
            receiver_phone="233541111202",
            origin_station_id=station_accra.id,
            destination_station_id=station_prestea.id,
            fee_ghs=10.0,
            status=ParcelStatus.arrived,
            arrived_at=datetime.now(UTC) - timedelta(days=4),
        )
        db.add(p)
        await db.flush()
        return p

    @pytest.fixture
    async def recent_arrived_parcel(self, db, company, station_accra, station_prestea):
        from datetime import datetime, timedelta

        from app.models.parcel import Parcel, ParcelStatus

        p = Parcel(
            company_id=company.id,
            tracking_number="RP-TST-ODUE-002",
            sender_name="Sender2",
            sender_phone="233541111203",
            receiver_name="Receiver2",
            receiver_phone="233541111204",
            origin_station_id=station_accra.id,
            destination_station_id=station_prestea.id,
            fee_ghs=10.0,
            status=ParcelStatus.arrived,
            arrived_at=datetime.now(UTC) - timedelta(hours=12),
        )
        db.add(p)
        await db.flush()
        return p

    @pytest.mark.asyncio
    async def test_overdue_returns_stale_arrivals(self, client, manager_token, overdue_parcel):
        response = await client.get(
            "/api/v1/parcels/overdue",
            headers={"Authorization": f"Bearer {manager_token}"},
        )
        assert response.status_code == 200
        ids = [p["id"] for p in response.json()]
        assert overdue_parcel.id in ids

    @pytest.mark.asyncio
    async def test_overdue_excludes_recently_arrived(
        self, client, manager_token, recent_arrived_parcel
    ):
        response = await client.get(
            "/api/v1/parcels/overdue",
            headers={"Authorization": f"Bearer {manager_token}"},
        )
        assert response.status_code == 200
        ids = [p["id"] for p in response.json()]
        assert recent_arrived_parcel.id not in ids

    @pytest.mark.asyncio
    async def test_overdue_requires_manager_role(self, client, clerk_token):
        response = await client.get(
            "/api/v1/parcels/overdue",
            headers={"Authorization": f"Bearer {clerk_token}"},
        )
        assert response.status_code == 403

    @pytest.mark.asyncio
    async def test_overdue_requires_auth(self, client):
        response = await client.get("/api/v1/parcels/overdue")
        assert response.status_code == 401


# ── H3: Trip occupancy rates ──────────────────────────────────────────────────


class TestTripOccupancy:
    """GET /api/v1/admin/trips/occupancy — route-level occupancy aggregation."""

    @pytest.fixture
    async def admin_user(self, db, company):
        from app.models.user import User, UserRole
        from app.services.auth_service import hash_password

        u = User(
            company_id=company.id,
            full_name="Occ Admin",
            phone="233207770002",
            email="occ.admin@test.io",
            hashed_password=hash_password("testpass"),
            role=UserRole.company_admin,
        )
        db.add(u)
        await db.flush()
        return u

    @pytest.fixture
    async def admin_token(self, admin_user):
        from app.services.auth_service import create_access_token

        return create_access_token(admin_user)

    @pytest.mark.asyncio
    async def test_occupancy_returns_list(self, client, admin_token):
        response = await client.get(
            "/api/v1/admin/trips/occupancy",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert response.status_code == 200
        assert isinstance(response.json(), list)

    @pytest.mark.asyncio
    async def test_occupancy_item_has_expected_fields(
        self, client, admin_token, db, company, vehicle, station_accra, station_prestea
    ):
        from datetime import datetime

        from app.models.ticket import PaymentStatus, Ticket, TicketSource
        from app.models.trip import Trip, TripStatus

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

        ticket = Ticket(
            company_id=company.id,
            trip_id=trip.id,
            passenger_name="Occ Passenger",
            passenger_phone="233209988001",
            seat_number=1,
            fare_ghs=60.0,
            source=TicketSource.counter,
            payment_status=PaymentStatus.pending,
        )
        db.add(ticket)
        await db.flush()

        response = await client.get(
            "/api/v1/admin/trips/occupancy",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert response.status_code == 200
        body = response.json()
        assert len(body) >= 1
        item = body[0]
        assert "route" in item
        assert "trips" in item
        assert "avg_occupancy_pct" in item
        assert "total_revenue_ghs" in item
        assert item["total_revenue_ghs"] >= 60.0

    @pytest.mark.asyncio
    async def test_occupancy_requires_company_admin(self, client, clerk_token):
        response = await client.get(
            "/api/v1/admin/trips/occupancy",
            headers={"Authorization": f"Bearer {clerk_token}"},
        )
        assert response.status_code == 403


# ── H4: Company branding on PDFs ─────────────────────────────────────────────


class TestPdfCompanyBranding:
    """Unit tests for company branding in receipt and manifest PDFs."""

    def test_receipt_pdf_is_valid_pdf(self):
        from app.utils.pdf import generate_receipt_pdf

        class FakeParcel:
            tracking_number = "RP-TEST-001"
            sender_name = "Sender"
            receiver_name = "Receiver"
            fee_ghs = 10.0
            created_at = None
            origin_station = None
            destination_station = None

        pdf = generate_receipt_pdf(FakeParcel(), company_name="AcmeBus Ltd")
        assert pdf[:4] == b"%PDF"
        assert len(pdf) > 200

    def test_receipt_pdf_branded_differs_from_default(self):
        """Passing a company name must produce different PDF bytes."""
        from app.utils.pdf import generate_receipt_pdf

        class FakeParcel:
            tracking_number = "RP-TEST-001"
            sender_name = "Sender"
            receiver_name = "Receiver"
            fee_ghs = 10.0
            created_at = None
            origin_station = None
            destination_station = None

        branded = generate_receipt_pdf(FakeParcel(), company_name="AcmeBus Ltd")
        default = generate_receipt_pdf(FakeParcel())
        assert branded != default

    def test_manifest_pdf_is_valid_pdf(self):
        from app.utils.pdf import generate_manifest_pdf

        class FakeTrip:
            departure_station = None
            destination_station = None
            vehicle = None
            departure_time = None
            status = "loading"
            tickets = []

        pdf = generate_manifest_pdf(FakeTrip(), company_name="GoldenBus Co")
        assert pdf[:4] == b"%PDF"
        assert len(pdf) > 200

    def test_manifest_pdf_branded_differs_from_default(self):
        """Passing a company name must produce different PDF bytes."""
        from app.utils.pdf import generate_manifest_pdf

        class FakeTrip:
            departure_station = None
            destination_station = None
            vehicle = None
            departure_time = None
            status = "loading"
            tickets = []

        branded = generate_manifest_pdf(FakeTrip(), company_name="GoldenBus Co")
        default = generate_manifest_pdf(FakeTrip())
        assert branded != default


# ── H5: Parcel delivery SLA report ───────────────────────────────────────────


class TestSlaReport:
    """POST /api/v1/admin/reports/sla-email — 7-day delivery SLA summary."""

    @pytest.fixture
    async def admin_user(self, db, company):
        from app.models.user import User, UserRole
        from app.services.auth_service import hash_password

        u = User(
            company_id=company.id,
            full_name="SLA Admin",
            phone="233207770003",
            email="sla.admin@test.io",
            hashed_password=hash_password("testpass"),
            role=UserRole.company_admin,
        )
        db.add(u)
        await db.flush()
        return u

    @pytest.fixture
    async def admin_token(self, admin_user):
        from app.services.auth_service import create_access_token

        return create_access_token(admin_user)

    @pytest.mark.asyncio
    async def test_sla_report_returns_expected_shape(self, client, admin_token, monkeypatch):
        from app.config import settings

        monkeypatch.setattr(settings, "resend_api_key", "")
        response = await client.post(
            "/api/v1/admin/reports/sla-email",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert response.status_code == 200
        body = response.json()
        assert "total" in body
        assert "on_time" in body
        assert "late" in body
        assert "on_time_pct" in body
        assert "message" in body

    @pytest.mark.asyncio
    async def test_sla_report_counts_on_time_and_late(
        self, client, admin_token, db, company, station_accra, station_prestea, monkeypatch
    ):
        from datetime import datetime, timedelta

        from app.config import settings
        from app.models.parcel import Parcel, ParcelStatus

        monkeypatch.setattr(settings, "resend_api_key", "")

        now = datetime.now(UTC)

        # On-time: arrived within 48h of creation
        on_time = Parcel(
            company_id=company.id,
            tracking_number="RP-TST-SLA-001",
            sender_name="S1",
            sender_phone="233541110001",
            receiver_name="R1",
            receiver_phone="233541110002",
            origin_station_id=station_accra.id,
            destination_station_id=station_prestea.id,
            fee_ghs=10.0,
            status=ParcelStatus.arrived,
            created_at=now - timedelta(hours=36),
            arrived_at=now - timedelta(hours=12),  # 24h transit — on time
        )
        # Late: arrived more than 48h after creation
        late = Parcel(
            company_id=company.id,
            tracking_number="RP-TST-SLA-002",
            sender_name="S2",
            sender_phone="233541110003",
            receiver_name="R2",
            receiver_phone="233541110004",
            origin_station_id=station_accra.id,
            destination_station_id=station_prestea.id,
            fee_ghs=10.0,
            status=ParcelStatus.arrived,
            created_at=now - timedelta(days=5),
            arrived_at=now - timedelta(days=1),  # 4-day transit — late
        )
        db.add(on_time)
        db.add(late)
        await db.flush()

        response = await client.post(
            "/api/v1/admin/reports/sla-email",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert response.status_code == 200
        body = response.json()
        assert body["total"] >= 2
        assert body["on_time"] >= 1
        assert body["late"] >= 1

    @pytest.mark.asyncio
    async def test_sla_report_requires_company_admin(self, client, clerk_token):
        response = await client.post(
            "/api/v1/admin/reports/sla-email",
            headers={"Authorization": f"Bearer {clerk_token}"},
        )
        assert response.status_code == 403

    @pytest.mark.asyncio
    async def test_sla_report_requires_auth(self, client):
        response = await client.post("/api/v1/admin/reports/sla-email")
        assert response.status_code == 401


# ── I2: Station throughput ─────────────────────────────────────────────────────


class TestStationThroughput:
    @pytest.fixture
    async def manager_user(self, db, company, station_accra):
        from app.models.user import User, UserRole
        from app.services.auth_service import hash_password

        u = User(
            company_id=company.id,
            station_id=station_accra.id,
            full_name="Mgr Throughput",
            phone="233201234560",
            email="mgr.throughput@test.io",
            hashed_password=hash_password("testpass"),
            role=UserRole.station_manager,
        )
        db.add(u)
        await db.flush()
        return u

    @pytest.fixture
    async def manager_token(self, manager_user):
        from app.services.auth_service import create_access_token

        return create_access_token(manager_user)

    @pytest.mark.asyncio
    async def test_throughput_returns_daily_points(
        self, client, manager_token, db, company, station_accra, station_prestea
    ):
        from datetime import datetime

        from app.models.parcel import Parcel, ParcelStatus

        now = datetime.now(UTC)
        # A parcel arrived at station_accra (received)
        p = Parcel(
            company_id=company.id,
            tracking_number="RP-TST-THRU-001",
            sender_name="S",
            sender_phone="233541000001",
            receiver_name="R",
            receiver_phone="233541000002",
            origin_station_id=station_prestea.id,
            destination_station_id=station_accra.id,
            fee_ghs=5.0,
            status=ParcelStatus.arrived,
            arrived_at=now,
        )
        db.add(p)
        await db.flush()

        response = await client.get(
            f"/api/v1/stations/{station_accra.id}/throughput?days=7",
            headers={"Authorization": f"Bearer {manager_token}"},
        )
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 7
        # Today's entry should have received >= 1
        today_entry = data[-1]
        assert today_entry["received"] >= 1
        assert "dispatched" in today_entry
        assert "date" in today_entry

    @pytest.mark.asyncio
    async def test_throughput_requires_auth(self, client, station_accra):
        response = await client.get(f"/api/v1/stations/{station_accra.id}/throughput")
        assert response.status_code == 401


# ── I3: Parcel pickup reminder SMS ────────────────────────────────────────────


class TestParcelPickupReminder:
    @pytest.fixture
    async def arrived_parcel(self, db, company, station_accra, station_prestea, clerk_user):
        from datetime import datetime, timedelta

        from app.models.parcel import Parcel, ParcelStatus

        now = datetime.now(UTC)
        p = Parcel(
            company_id=company.id,
            tracking_number="RP-TST-REMIND-001",
            sender_name="Sender",
            sender_phone="233541000010",
            receiver_name="Receiver",
            receiver_phone="233541000011",
            origin_station_id=station_accra.id,
            destination_station_id=station_prestea.id,
            fee_ghs=5.0,
            status=ParcelStatus.arrived,
            arrived_at=now - timedelta(hours=30),  # >24h ago
        )
        db.add(p)
        await db.flush()
        return p

    @pytest.fixture
    async def fresh_arrived_parcel(self, db, company, station_accra, station_prestea):
        from datetime import datetime

        from app.models.parcel import Parcel, ParcelStatus

        now = datetime.now(UTC)
        p = Parcel(
            company_id=company.id,
            tracking_number="RP-TST-REMIND-002",
            sender_name="Sender2",
            sender_phone="233541000012",
            receiver_name="Receiver2",
            receiver_phone="233541000013",
            origin_station_id=station_accra.id,
            destination_station_id=station_prestea.id,
            fee_ghs=5.0,
            status=ParcelStatus.arrived,
            arrived_at=now,  # Just arrived — too soon for reminder
        )
        db.add(p)
        await db.flush()
        return p

    @pytest.mark.asyncio
    async def test_remind_sends_sms(self, client, clerk_token, arrived_parcel):
        response = await client.post(
            f"/api/v1/parcels/{arrived_parcel.id}/remind",
            headers={"Authorization": f"Bearer {clerk_token}"},
        )
        assert response.status_code == 200
        assert response.json()["sms_sent"] is True

    @pytest.mark.asyncio
    async def test_remind_too_soon_returns_400(self, client, clerk_token, fresh_arrived_parcel):
        response = await client.post(
            f"/api/v1/parcels/{fresh_arrived_parcel.id}/remind",
            headers={"Authorization": f"Bearer {clerk_token}"},
        )
        assert response.status_code == 400
        assert response.json()["detail"]["code"] == "TOO_SOON"

    @pytest.mark.asyncio
    async def test_remind_requires_auth(self, client, arrived_parcel):
        response = await client.post(f"/api/v1/parcels/{arrived_parcel.id}/remind")
        assert response.status_code == 401


# ── I4: API key authentication ────────────────────────────────────────────────


class TestApiKeyAuth:
    @pytest.fixture
    async def company_with_key(self, db, company):
        company.api_key = "test-api-key-12345"
        await db.flush()
        return company

    @pytest.fixture
    async def admin_user(self, db, company, station_accra):
        from app.models.user import User, UserRole
        from app.services.auth_service import hash_password

        u = User(
            company_id=company.id,
            station_id=station_accra.id,
            full_name="Admin Key",
            phone="233201234590",
            email="admin.key@test.io",
            hashed_password=hash_password("testpass"),
            role=UserRole.company_admin,
        )
        db.add(u)
        await db.flush()
        return u

    @pytest.fixture
    async def admin_token(self, admin_user):
        from app.services.auth_service import create_access_token

        return create_access_token(admin_user)

    @pytest.mark.asyncio
    async def test_api_key_auth_on_protected_endpoint(self, client, company_with_key):
        response = await client.get(
            "/api/v1/stations",
            headers={"X-API-Key": "test-api-key-12345"},
        )
        assert response.status_code == 200

    @pytest.mark.asyncio
    async def test_invalid_api_key_returns_401(self, client, company_with_key):
        response = await client.get(
            "/api/v1/stations",
            headers={"X-API-Key": "totally-wrong-key"},
        )
        assert response.status_code == 401

    @pytest.mark.asyncio
    async def test_rotate_api_key_returns_new_key(self, client, admin_token, company):
        response = await client.post(
            "/api/v1/admin/companies/me/rotate-api-key",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert response.status_code == 200
        body = response.json()
        assert "api_key" in body
        assert len(body["api_key"]) > 20

    @pytest.mark.asyncio
    async def test_rotate_api_key_requires_company_admin(self, client, clerk_token):
        response = await client.post(
            "/api/v1/admin/companies/me/rotate-api-key",
            headers={"Authorization": f"Bearer {clerk_token}"},
        )
        assert response.status_code == 403


# ── I5: Trip revenue summary ──────────────────────────────────────────────────


class TestTripRevenue:
    @pytest.fixture
    async def manager_user(self, db, company, station_accra):
        from app.models.user import User, UserRole
        from app.services.auth_service import hash_password

        u = User(
            company_id=company.id,
            station_id=station_accra.id,
            full_name="Mgr Revenue",
            phone="233201234599",
            email="mgr.revenue@test.io",
            hashed_password=hash_password("testpass"),
            role=UserRole.station_manager,
        )
        db.add(u)
        await db.flush()
        return u

    @pytest.fixture
    async def manager_token(self, manager_user):
        from app.services.auth_service import create_access_token

        return create_access_token(manager_user)

    @pytest.fixture
    async def trip_with_tickets(self, db, company, vehicle, station_accra, station_prestea):
        from datetime import datetime

        from app.models.ticket import PaymentStatus, Ticket, TicketSource, TicketStatus
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

        # 2 paid, 1 pending, 1 cancelled
        for i, (pstatus, status) in enumerate(
            [
                (PaymentStatus.paid, TicketStatus.valid),
                (PaymentStatus.paid, TicketStatus.valid),
                (PaymentStatus.pending, TicketStatus.valid),
                (PaymentStatus.pending, TicketStatus.cancelled),
            ]
        ):
            t = Ticket(
                company_id=company.id,
                trip_id=trip.id,
                passenger_name=f"P{i}",
                passenger_phone=f"23354100000{i}",
                seat_number=i + 1,
                fare_ghs=50.0,
                source=TicketSource.counter,
                payment_status=pstatus,
                status=status,
            )
            db.add(t)
        await db.flush()
        return trip

    @pytest.mark.asyncio
    async def test_revenue_returns_correct_totals(self, client, manager_token, trip_with_tickets):
        response = await client.get(
            f"/api/v1/trips/{trip_with_tickets.id}/revenue",
            headers={"Authorization": f"Bearer {manager_token}"},
        )
        assert response.status_code == 200
        body = response.json()
        # 3 non-cancelled tickets × GHS 50.0 = 150.0
        assert body["ticket_count"] == 3
        assert body["total_revenue_ghs"] == 150.0
        assert body["avg_fare_ghs"] == 50.0
        assert body["paid_count"] == 2
        assert body["pending_count"] == 1

    @pytest.mark.asyncio
    async def test_revenue_404_for_missing_trip(self, client, manager_token):
        response = await client.get(
            "/api/v1/trips/99999/revenue",
            headers={"Authorization": f"Bearer {manager_token}"},
        )
        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_revenue_requires_auth(self, client, trip_with_tickets):
        response = await client.get(f"/api/v1/trips/{trip_with_tickets.id}/revenue")
        assert response.status_code == 401


# ── I1: Public booking flow ───────────────────────────────────────────────────


class TestPublicBookingFlow:
    @pytest.fixture
    async def bookable_trip(self, db, company, vehicle, station_accra, station_prestea):
        from datetime import datetime, timedelta

        from app.models.trip import Trip, TripStatus

        trip = Trip(
            company_id=company.id,
            vehicle_id=vehicle.id,
            departure_station_id=station_accra.id,
            destination_station_id=station_prestea.id,
            departure_time=datetime.now(UTC) + timedelta(hours=2),
            status=TripStatus.scheduled,
            booking_open=True,
            price_ticket_base=30.0,
        )
        db.add(trip)
        await db.flush()
        return trip

    @pytest.mark.asyncio
    async def test_list_public_trips_returns_bookable(self, client, bookable_trip):
        response = await client.get("/api/v1/public/trips")
        assert response.status_code == 200
        ids = [t["id"] for t in response.json()]
        assert bookable_trip.id in ids

    @pytest.mark.asyncio
    async def test_get_seat_map(self, client, bookable_trip):
        response = await client.get(f"/api/v1/public/trips/{bookable_trip.id}/seats")
        assert response.status_code == 200
        body = response.json()
        assert body["capacity"] == 50
        assert body["taken"] == []

    @pytest.mark.asyncio
    async def test_book_ticket_returns_payment_url(self, client, bookable_trip, monkeypatch):
        async def _fake_init(**kwargs):
            return {"authorization_url": "https://paystack.test/pay/abc123"}

        monkeypatch.setattr(
            "app.routers.public.initialize_transaction",
            _fake_init,
        )
        response = await client.post(
            f"/api/v1/public/trips/{bookable_trip.id}/book",
            json={
                "passenger_name": "Kwame Test",
                "passenger_phone": "0551234567",
                "seat_number": 5,
            },
        )
        assert response.status_code == 201
        body = response.json()
        assert "authorization_url" in body
        assert "ticket_id" in body

    @pytest.mark.asyncio
    async def test_book_closed_trip_returns_400(
        self, client, db, company, vehicle, station_accra, station_prestea
    ):
        from datetime import datetime, timedelta

        from app.models.trip import Trip, TripStatus

        trip = Trip(
            company_id=company.id,
            vehicle_id=vehicle.id,
            departure_station_id=station_accra.id,
            destination_station_id=station_prestea.id,
            departure_time=datetime.now(UTC) + timedelta(hours=2),
            status=TripStatus.scheduled,
            booking_open=False,
            price_ticket_base=30.0,
        )
        db.add(trip)
        await db.flush()

        response = await client.post(
            f"/api/v1/public/trips/{trip.id}/book",
            json={
                "passenger_name": "Test",
                "passenger_phone": "0551234567",
                "seat_number": 1,
            },
        )
        assert response.status_code == 400


# ── Phase K tests ─────────────────────────────────────────────────────────────


class TestWebhookDLQ:
    """K1 — GET /admin/webhooks/failed and POST /admin/webhooks/{id}/retry."""

    @pytest.fixture
    async def admin_user(self, db, company):
        from app.models.user import User, UserRole
        from app.services.auth_service import hash_password

        u = User(
            company_id=company.id,
            full_name="DLQ Admin",
            phone="233209000001",
            email="dlq@test.io",
            hashed_password=hash_password("pass"),
            role=UserRole.company_admin,
        )
        db.add(u)
        await db.flush()
        return u

    @pytest.fixture
    async def admin_token(self, admin_user):
        from app.services.auth_service import create_access_token

        return create_access_token(admin_user)

    @pytest.fixture
    async def failed_event(self, db):
        from datetime import UTC, datetime

        from app.models.webhook_event import WebhookEvent

        ev = WebhookEvent(
            event_type="charge.success",
            payload='{"event":"charge.success"}',
            attempts=3,
            last_error="connection error",
            processed_at=None,
            created_at=datetime.now(UTC),
        )
        db.add(ev)
        await db.flush()
        return ev

    @pytest.mark.asyncio
    async def test_list_failed_returns_exhausted_events(self, client, admin_token, failed_event):
        resp = await client.get(
            "/api/v1/admin/webhooks/failed",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert resp.status_code == 200
        ids = [e["id"] for e in resp.json()]
        assert failed_event.id in ids

    @pytest.mark.asyncio
    async def test_list_failed_excludes_processed(self, client, admin_token, db):
        from datetime import UTC, datetime

        from app.models.webhook_event import WebhookEvent

        ev = WebhookEvent(
            event_type="charge.success",
            payload="{}",
            attempts=3,
            processed_at=datetime.now(UTC),
            created_at=datetime.now(UTC),
        )
        db.add(ev)
        await db.flush()

        resp = await client.get(
            "/api/v1/admin/webhooks/failed",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert resp.status_code == 200
        ids = [e["id"] for e in resp.json()]
        assert ev.id not in ids

    @pytest.mark.asyncio
    async def test_retry_resets_attempts(self, client, admin_token, failed_event, db):
        resp = await client.post(
            f"/api/v1/admin/webhooks/{failed_event.id}/retry",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert resp.status_code == 200
        await db.refresh(failed_event)
        assert failed_event.attempts == 0
        assert failed_event.processed_at is None

    @pytest.mark.asyncio
    async def test_retry_nonexistent_returns_404(self, client, admin_token):
        resp = await client.post(
            "/api/v1/admin/webhooks/999999/retry",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_list_failed_requires_auth(self, client):
        resp = await client.get("/api/v1/admin/webhooks/failed")
        assert resp.status_code == 401


class TestTicketEmailReceipt:
    """K2 — passenger_email stored on ticket; send_ticket_email called after payment."""

    @pytest.mark.asyncio
    async def test_book_ticket_stores_passenger_email(
        self, client, db, company, vehicle, station_accra, station_prestea, monkeypatch
    ):
        from datetime import UTC, datetime, timedelta

        from app.models.trip import Trip, TripStatus

        async def _fake_init(**kwargs):
            return {"authorization_url": "https://paystack.test/pay/x"}

        monkeypatch.setattr("app.routers.public.initialize_transaction", _fake_init)

        trip = Trip(
            company_id=company.id,
            vehicle_id=vehicle.id,
            departure_station_id=station_accra.id,
            destination_station_id=station_prestea.id,
            departure_time=datetime.now(UTC) + timedelta(hours=4),
            status=TripStatus.scheduled,
            booking_open=True,
            price_ticket_base=25.0,
        )
        db.add(trip)
        await db.flush()

        resp = await client.post(
            f"/api/v1/public/trips/{trip.id}/book",
            json={
                "passenger_name": "Akosua",
                "passenger_phone": "0551234567",
                "seat_number": 3,
                "passenger_email": "akosua@example.com",
            },
        )
        assert resp.status_code == 201

        from sqlalchemy import select

        from app.models.ticket import Ticket

        result = await db.execute(select(Ticket).where(Ticket.id == resp.json()["ticket_id"]))
        ticket = result.scalar_one()
        assert ticket.passenger_email == "akosua@example.com"

    @pytest.mark.asyncio
    async def test_send_ticket_email_called_on_payment(self, monkeypatch):
        """send_ticket_email must never raise — smoke test the happy path."""
        from app.integrations.email import send_ticket_email

        called = []

        def _fake_post(*args, **kwargs):
            called.append(True)

            class R:
                def raise_for_status(self):
                    pass

            return R()

        monkeypatch.setattr("app.integrations.email.httpx.post", _fake_post)
        monkeypatch.setattr(
            "app.integrations.email.settings",
            type(
                "S",
                (),
                {
                    "resend_api_key": "test-key",
                    "resend_from_email": "noreply@test.com",
                },
            )(),
        )

        send_ticket_email(
            passenger_name="Kwame",
            passenger_email="kwame@example.com",
            trip_route="Accra → Kumasi",
            departure_time="06 Apr 2026 08:00",
            seat_number=5,
            fare_ghs=30.0,
            payment_ref="RP-123",
            company_name="STC",
        )
        assert called, "httpx.post should have been called"

    @pytest.mark.asyncio
    async def test_send_ticket_email_skips_without_api_key(self, monkeypatch):
        from app.integrations.email import send_ticket_email

        called = []
        monkeypatch.setattr(
            "app.integrations.email.httpx.post", lambda *a, **kw: called.append(True)
        )
        monkeypatch.setattr(
            "app.integrations.email.settings",
            type("S", (), {"resend_api_key": "", "resend_from_email": "x@x.com"})(),
        )

        send_ticket_email(
            passenger_name="A",
            passenger_email="a@example.com",
            trip_route="X → Y",
            departure_time="now",
            seat_number=1,
            fare_ghs=10.0,
            payment_ref=None,
            company_name="Co",
        )
        assert not called


class TestGenerateSchedule:
    """K3 — POST /trips/generate-schedule."""

    @pytest.fixture
    async def manager_user(self, db, company, station_accra):
        from app.models.user import User, UserRole
        from app.services.auth_service import hash_password

        u = User(
            company_id=company.id,
            station_id=station_accra.id,
            full_name="Manager",
            phone="233209000010",
            hashed_password=hash_password("pass"),
            role=UserRole.station_manager,
        )
        db.add(u)
        await db.flush()
        return u

    @pytest.fixture
    async def manager_token(self, manager_user):
        from app.services.auth_service import create_access_token

        return create_access_token(manager_user)

    @pytest.mark.asyncio
    async def test_generate_schedule_creates_trips(
        self, client, manager_token, vehicle, station_accra, station_prestea
    ):
        resp = await client.post(
            "/api/v1/trips/generate-schedule",
            headers={"Authorization": f"Bearer {manager_token}"},
            json={
                "vehicle_id": vehicle.id,
                "departure_station_id": station_accra.id,
                "destination_station_id": station_prestea.id,
                "departure_time": "08:00",
                "days_ahead": 3,
                "base_fare_ghs": 20.0,
            },
        )
        assert resp.status_code == 201
        body = resp.json()
        assert body["created"] == 3
        assert len(body["trip_ids"]) == 3

    @pytest.mark.asyncio
    async def test_generate_schedule_invalid_time_returns_400(
        self, client, manager_token, vehicle, station_accra, station_prestea
    ):
        resp = await client.post(
            "/api/v1/trips/generate-schedule",
            headers={"Authorization": f"Bearer {manager_token}"},
            json={
                "vehicle_id": vehicle.id,
                "departure_station_id": station_accra.id,
                "destination_station_id": station_prestea.id,
                "departure_time": "25:99",
                "days_ahead": 3,
            },
        )
        assert resp.status_code == 400

    @pytest.mark.asyncio
    async def test_generate_schedule_days_ahead_out_of_range(
        self, client, manager_token, vehicle, station_accra, station_prestea
    ):
        resp = await client.post(
            "/api/v1/trips/generate-schedule",
            headers={"Authorization": f"Bearer {manager_token}"},
            json={
                "vehicle_id": vehicle.id,
                "departure_station_id": station_accra.id,
                "destination_station_id": station_prestea.id,
                "departure_time": "08:00",
                "days_ahead": 31,
            },
        )
        assert resp.status_code == 422

    @pytest.mark.asyncio
    async def test_generate_schedule_requires_manager(self, client, clerk_token):
        resp = await client.post(
            "/api/v1/trips/generate-schedule",
            headers={"Authorization": f"Bearer {clerk_token}"},
            json={
                "vehicle_id": 1,
                "departure_station_id": 1,
                "destination_station_id": 2,
                "departure_time": "08:00",
                "days_ahead": 1,
            },
        )
        assert resp.status_code == 403


class TestWeightTierPricing:
    """K4 — weight tier CRUD and auto-fee on parcel creation."""

    @pytest.fixture
    async def admin_user(self, db, company, station_accra):
        from app.models.user import User, UserRole
        from app.services.auth_service import hash_password

        u = User(
            company_id=company.id,
            station_id=station_accra.id,
            full_name="Weight Admin",
            phone="233209000020",
            hashed_password=hash_password("pass"),
            role=UserRole.company_admin,
        )
        db.add(u)
        await db.flush()
        return u

    @pytest.fixture
    async def admin_token(self, admin_user):
        from app.services.auth_service import create_access_token

        return create_access_token(admin_user)

    @pytest.mark.asyncio
    async def test_set_and_get_weight_tiers(self, client, admin_token):
        tiers = [
            {"max_kg": 1.0, "fee_ghs": 5.0},
            {"max_kg": 5.0, "fee_ghs": 10.0},
            {"max_kg": None, "fee_ghs": 20.0},
        ]
        resp = await client.put(
            "/api/v1/admin/companies/me/weight-tiers",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={"tiers": tiers},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert len(body["tiers"]) == 3
        assert body["tiers"][0]["fee_ghs"] == 5.0

        get_resp = await client.get(
            "/api/v1/admin/companies/me/weight-tiers",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert get_resp.status_code == 200
        assert len(get_resp.json()["tiers"]) == 3

    @pytest.mark.asyncio
    async def test_parcel_auto_fee_from_weight_tiers(
        self,
        client,
        admin_token,
        admin_user,
        db,
        company,
        station_accra,
        station_prestea,
        tracking_seq,
    ):
        # Set weight tiers
        await client.put(
            "/api/v1/admin/companies/me/weight-tiers",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={
                "tiers": [
                    {"max_kg": 2.0, "fee_ghs": 8.0},
                    {"max_kg": None, "fee_ghs": 15.0},
                ]
            },
        )

        # Create parcel with fee=0 and weight within first tier
        resp = await client.post(
            "/api/v1/parcels",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={
                "sender_name": "Ama",
                "sender_phone": "0241234567",
                "receiver_name": "Kofi",
                "receiver_phone": "0551234568",
                "origin_station_id": station_accra.id,
                "destination_station_id": station_prestea.id,
                "weight_kg": 1.5,
                "fee_ghs": 0,
            },
        )
        assert resp.status_code == 201
        assert resp.json()["fee_ghs"] == 8.0

    @pytest.mark.asyncio
    async def test_parcel_explicit_fee_not_overridden(
        self, client, admin_token, db, company, station_accra, station_prestea, tracking_seq
    ):
        # Set weight tiers
        await client.put(
            "/api/v1/admin/companies/me/weight-tiers",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={"tiers": [{"max_kg": None, "fee_ghs": 15.0}]},
        )

        resp = await client.post(
            "/api/v1/parcels",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={
                "sender_name": "Ama",
                "sender_phone": "0241234567",
                "receiver_name": "Kofi",
                "receiver_phone": "0551234568",
                "origin_station_id": station_accra.id,
                "destination_station_id": station_prestea.id,
                "weight_kg": 1.0,
                "fee_ghs": 5.0,
            },
        )
        assert resp.status_code == 201
        assert resp.json()["fee_ghs"] == 5.0  # explicit fee wins

    @pytest.mark.asyncio
    async def test_weight_tiers_requires_company_admin(self, client, clerk_token):
        resp = await client.get(
            "/api/v1/admin/companies/me/weight-tiers",
            headers={"Authorization": f"Bearer {clerk_token}"},
        )
        assert resp.status_code == 403


class TestStationAssignment:
    """K5 — PATCH /admin/users/{user_id}/station."""

    @pytest.fixture
    async def admin_user(self, db, company, station_accra):
        from app.models.user import User, UserRole
        from app.services.auth_service import hash_password

        u = User(
            company_id=company.id,
            station_id=station_accra.id,
            full_name="Station Admin",
            phone="233209000030",
            hashed_password=hash_password("pass"),
            role=UserRole.company_admin,
        )
        db.add(u)
        await db.flush()
        return u

    @pytest.fixture
    async def admin_token(self, admin_user):
        from app.services.auth_service import create_access_token

        return create_access_token(admin_user)

    @pytest.mark.asyncio
    async def test_assign_station_updates_user(
        self, client, admin_token, clerk_user, station_prestea
    ):
        resp = await client.patch(
            f"/api/v1/admin/users/{clerk_user.id}/station",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={"station_id": station_prestea.id},
        )
        assert resp.status_code == 200
        assert resp.json()["station_id"] == station_prestea.id

    @pytest.mark.asyncio
    async def test_assign_station_clear_to_none(self, client, admin_token, clerk_user):
        resp = await client.patch(
            f"/api/v1/admin/users/{clerk_user.id}/station",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={"station_id": None},
        )
        assert resp.status_code == 200
        assert resp.json()["station_id"] is None

    @pytest.mark.asyncio
    async def test_assign_station_nonexistent_user_404(self, client, admin_token):
        resp = await client.patch(
            "/api/v1/admin/users/999999/station",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={"station_id": 1},
        )
        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_assign_station_requires_company_admin(self, client, clerk_token, clerk_user):
        resp = await client.patch(
            f"/api/v1/admin/users/{clerk_user.id}/station",
            headers={"Authorization": f"Bearer {clerk_token}"},
            json={"station_id": 1},
        )
        assert resp.status_code == 403
