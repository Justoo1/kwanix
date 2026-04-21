"""
Integration tests for the driver feature.

Covers:
  - Creating driver users via admin endpoint
  - Driver cannot create tickets
  - Assigning a driver to a trip
  - Assigning a driver from another company fails
  - GET /driver/trip — no assignment → 404
  - GET /driver/trip — with assignment → returns trip
  - GET /driver/trip/passengers — returns manifest
  - POST /driver/scan — valid ticket → marked used
  - POST /driver/scan — wrong trip → valid=False
  - POST /driver/scan — already used → valid=False
  - POST /driver/scan — cancelled ticket → valid=False
  - Non-driver cannot access driver endpoints
"""

from datetime import UTC, datetime

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.company import Company
from app.models.station import Station
from app.models.ticket import PaymentStatus, Ticket, TicketSource, TicketStatus
from app.models.trip import Trip, TripStatus
from app.models.user import User, UserRole
from app.models.vehicle import Vehicle
from app.services.auth_service import hash_password

# ── Helpers ────────────────────────────────────────────────────────────────────


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


async def _make_trip(
    db: AsyncSession,
    company: Company,
    vehicle: Vehicle,
    departure_station: Station,
    destination_station: Station,
    status: TripStatus = TripStatus.loading,
    driver_id: int | None = None,
) -> Trip:
    trip = Trip(
        company_id=company.id,
        vehicle_id=vehicle.id,
        departure_station_id=departure_station.id,
        destination_station_id=destination_station.id,
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
    seat: int = 1,
    status: TicketStatus = TicketStatus.valid,
) -> Ticket:
    t = Ticket(
        company_id=company.id,
        trip_id=trip.id,
        passenger_name="Kofi Test",
        passenger_phone="233541000001",
        seat_number=seat,
        fare_ghs=50.00,
        status=status,
        payment_status=PaymentStatus.paid,
        source=TicketSource.counter,
    )
    db.add(t)
    await db.flush()
    return t


# ── Creating driver users ──────────────────────────────────────────────────────


class TestCreateDriverUser:
    @pytest.mark.asyncio
    async def test_company_admin_can_create_driver(
        self,
        client: AsyncClient,
        db: AsyncSession,
        company: Company,
        company_admin_token: str,
    ):
        """Company admins can create a driver user via the admin endpoint."""
        response = await client.post(
            "/api/v1/admin/users",
            headers=_auth(company_admin_token),
            json={
                "full_name": "Kwame Driver",
                "phone": "233541199999",
                "email": "kwame.driver@test.io",
                "password": "driverpass123",
                "role": "driver",
            },
        )
        assert response.status_code == 201
        body = response.json()
        assert body["role"] == "driver"
        assert body["full_name"] == "Kwame Driver"


# ── Driver cannot create tickets ───────────────────────────────────────────────


class TestDriverCannotCreateTickets:
    @pytest.mark.asyncio
    async def test_driver_cannot_create_ticket(
        self,
        client: AsyncClient,
        db: AsyncSession,
        company: Company,
        vehicle: Vehicle,
        station_accra: Station,
        station_prestea: Station,
        driver_user: User,
        driver_token: str,
    ):
        trip = await _make_trip(db, company, vehicle, station_accra, station_prestea)

        response = await client.post(
            "/api/v1/tickets",
            headers=_auth(driver_token),
            json={
                "trip_id": trip.id,
                "passenger_name": "Test Passenger",
                "passenger_phone": "0241234567",
                "seat_number": 1,
                "fare_ghs": 50.0,
            },
        )
        assert response.status_code == 403


# ── Assign driver to trip ──────────────────────────────────────────────────────


class TestAssignDriverToTrip:
    @pytest.mark.asyncio
    async def test_manager_can_assign_driver(
        self,
        client: AsyncClient,
        db: AsyncSession,
        company: Company,
        vehicle: Vehicle,
        station_accra: Station,
        station_prestea: Station,
        driver_user: User,
        manager_token: str,
    ):
        trip = await _make_trip(db, company, vehicle, station_accra, station_prestea)

        response = await client.patch(
            f"/api/v1/trips/{trip.id}/driver",
            headers=_auth(manager_token),
            json={"driver_id": driver_user.id},
        )
        assert response.status_code == 200
        body = response.json()
        assert body["driver_id"] == driver_user.id
        assert body["driver_name"] == driver_user.full_name

    @pytest.mark.asyncio
    async def test_manager_can_unassign_driver(
        self,
        client: AsyncClient,
        db: AsyncSession,
        company: Company,
        vehicle: Vehicle,
        station_accra: Station,
        station_prestea: Station,
        driver_user: User,
        manager_token: str,
    ):
        trip = await _make_trip(
            db, company, vehicle, station_accra, station_prestea, driver_id=driver_user.id
        )

        response = await client.patch(
            f"/api/v1/trips/{trip.id}/driver",
            headers=_auth(manager_token),
            json={"driver_id": None},
        )
        assert response.status_code == 200
        assert response.json()["driver_id"] is None

    @pytest.mark.asyncio
    async def test_assign_nonexistent_driver_returns_404(
        self,
        client: AsyncClient,
        db: AsyncSession,
        company: Company,
        vehicle: Vehicle,
        station_accra: Station,
        station_prestea: Station,
        manager_token: str,
    ):
        trip = await _make_trip(db, company, vehicle, station_accra, station_prestea)

        response = await client.patch(
            f"/api/v1/trips/{trip.id}/driver",
            headers=_auth(manager_token),
            json={"driver_id": 99999},
        )
        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_assign_driver_from_other_company_returns_404(
        self,
        client: AsyncClient,
        db: AsyncSession,
        company: Company,
        vehicle: Vehicle,
        station_accra: Station,
        station_prestea: Station,
        manager_token: str,
    ):
        other_company = Company(name="Other Bus", company_code="OTH", is_active=True)
        db.add(other_company)
        await db.flush()

        other_driver = User(
            company_id=other_company.id,
            full_name="Foreign Driver",
            phone="233541299999",
            email="foreign@other.io",
            hashed_password=hash_password("pass"),
            role=UserRole.driver,
        )
        db.add(other_driver)
        await db.flush()

        trip = await _make_trip(db, company, vehicle, station_accra, station_prestea)

        response = await client.patch(
            f"/api/v1/trips/{trip.id}/driver",
            headers=_auth(manager_token),
            json={"driver_id": other_driver.id},
        )
        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_clerk_cannot_assign_driver(
        self,
        client: AsyncClient,
        db: AsyncSession,
        company: Company,
        vehicle: Vehicle,
        station_accra: Station,
        station_prestea: Station,
        driver_user: User,
        clerk_token: str,
    ):
        trip = await _make_trip(db, company, vehicle, station_accra, station_prestea)

        response = await client.patch(
            f"/api/v1/trips/{trip.id}/driver",
            headers=_auth(clerk_token),
            json={"driver_id": driver_user.id},
        )
        assert response.status_code == 403


# ── GET /driver/trip ───────────────────────────────────────────────────────────


class TestDriverGetTrip:
    @pytest.mark.asyncio
    async def test_no_assignment_returns_404(self, client: AsyncClient, driver_token: str):
        response = await client.get(
            "/api/v1/driver/trip",
            headers=_auth(driver_token),
        )
        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_assigned_trip_returned(
        self,
        client: AsyncClient,
        db: AsyncSession,
        company: Company,
        vehicle: Vehicle,
        station_accra: Station,
        station_prestea: Station,
        driver_user: User,
        driver_token: str,
    ):
        trip = await _make_trip(
            db, company, vehicle, station_accra, station_prestea, driver_id=driver_user.id
        )

        response = await client.get(
            "/api/v1/driver/trip",
            headers=_auth(driver_token),
        )
        assert response.status_code == 200
        body = response.json()
        assert body["id"] == trip.id
        assert body["vehicle_plate"] == vehicle.plate_number
        assert body["status"] == "loading"

    @pytest.mark.asyncio
    async def test_non_driver_cannot_access(self, client: AsyncClient, clerk_token: str):
        response = await client.get(
            "/api/v1/driver/trip",
            headers=_auth(clerk_token),
        )
        assert response.status_code == 403


# ── GET /driver/trip/passengers ────────────────────────────────────────────────


class TestDriverGetPassengers:
    @pytest.mark.asyncio
    async def test_returns_non_cancelled_tickets(
        self,
        client: AsyncClient,
        db: AsyncSession,
        company: Company,
        vehicle: Vehicle,
        station_accra: Station,
        station_prestea: Station,
        driver_user: User,
        driver_token: str,
    ):
        trip = await _make_trip(
            db, company, vehicle, station_accra, station_prestea, driver_id=driver_user.id
        )
        t1 = await _make_ticket(db, company, trip, seat=1)
        t2 = await _make_ticket(db, company, trip, seat=2)
        await _make_ticket(db, company, trip, seat=3, status=TicketStatus.cancelled)

        response = await client.get(
            "/api/v1/driver/trip/passengers",
            headers=_auth(driver_token),
        )
        assert response.status_code == 200
        body = response.json()
        assert len(body) == 2
        seat_numbers = {p["seat_number"] for p in body}
        assert seat_numbers == {t1.seat_number, t2.seat_number}

    @pytest.mark.asyncio
    async def test_no_trip_returns_404(self, client: AsyncClient, driver_token: str):
        response = await client.get(
            "/api/v1/driver/trip/passengers",
            headers=_auth(driver_token),
        )
        assert response.status_code == 404


# ── POST /driver/scan ──────────────────────────────────────────────────────────


class TestDriverScan:
    @pytest.mark.asyncio
    async def test_valid_ticket_is_marked_used(
        self,
        client: AsyncClient,
        db: AsyncSession,
        company: Company,
        vehicle: Vehicle,
        station_accra: Station,
        station_prestea: Station,
        driver_user: User,
        driver_token: str,
    ):
        trip = await _make_trip(
            db, company, vehicle, station_accra, station_prestea, driver_id=driver_user.id
        )
        ticket = await _make_ticket(db, company, trip, seat=5)

        payload = f"TICKET:{ticket.id}:{trip.id}:{ticket.seat_number}"
        response = await client.post(
            "/api/v1/driver/scan",
            headers=_auth(driver_token),
            json={"payload": payload},
        )
        assert response.status_code == 200
        body = response.json()
        assert body["valid"] is True
        assert body["marked_used"] is True
        assert body["passenger_name"] == ticket.passenger_name
        assert body["seat_number"] == ticket.seat_number

        # Verify status changed in DB
        await db.refresh(ticket)
        assert ticket.status == TicketStatus.used

    @pytest.mark.asyncio
    async def test_wrong_trip_returns_invalid(
        self,
        client: AsyncClient,
        db: AsyncSession,
        company: Company,
        vehicle: Vehicle,
        station_accra: Station,
        station_prestea: Station,
        driver_user: User,
        driver_token: str,
    ):
        # Driver is assigned to their own trip, but scans a ticket for another trip
        await _make_trip(
            db, company, vehicle, station_accra, station_prestea, driver_id=driver_user.id
        )
        trip2 = await _make_trip(db, company, vehicle, station_accra, station_prestea)
        ticket = await _make_ticket(db, company, trip2, seat=7)

        payload = f"TICKET:{ticket.id}:{trip2.id}:{ticket.seat_number}"
        response = await client.post(
            "/api/v1/driver/scan",
            headers=_auth(driver_token),
            json={"payload": payload},
        )
        assert response.status_code == 200
        body = response.json()
        assert body["valid"] is False
        assert "trip" in body["reason"].lower()

        # Ticket must NOT be marked used
        await db.refresh(ticket)
        assert ticket.status == TicketStatus.valid

    @pytest.mark.asyncio
    async def test_already_used_ticket_returns_invalid(
        self,
        client: AsyncClient,
        db: AsyncSession,
        company: Company,
        vehicle: Vehicle,
        station_accra: Station,
        station_prestea: Station,
        driver_user: User,
        driver_token: str,
    ):
        trip = await _make_trip(
            db, company, vehicle, station_accra, station_prestea, driver_id=driver_user.id
        )
        ticket = await _make_ticket(db, company, trip, seat=3, status=TicketStatus.used)

        payload = f"TICKET:{ticket.id}:{trip.id}:{ticket.seat_number}"
        response = await client.post(
            "/api/v1/driver/scan",
            headers=_auth(driver_token),
            json={"payload": payload},
        )
        assert response.status_code == 200
        body = response.json()
        assert body["valid"] is False
        assert "used" in body["reason"].lower()

    @pytest.mark.asyncio
    async def test_cancelled_ticket_returns_invalid(
        self,
        client: AsyncClient,
        db: AsyncSession,
        company: Company,
        vehicle: Vehicle,
        station_accra: Station,
        station_prestea: Station,
        driver_user: User,
        driver_token: str,
    ):
        trip = await _make_trip(
            db, company, vehicle, station_accra, station_prestea, driver_id=driver_user.id
        )
        ticket = await _make_ticket(db, company, trip, seat=2, status=TicketStatus.cancelled)

        payload = f"TICKET:{ticket.id}:{trip.id}:{ticket.seat_number}"
        response = await client.post(
            "/api/v1/driver/scan",
            headers=_auth(driver_token),
            json={"payload": payload},
        )
        assert response.status_code == 200
        body = response.json()
        assert body["valid"] is False
        assert "cancel" in body["reason"].lower()

    @pytest.mark.asyncio
    async def test_invalid_qr_format_returns_invalid(
        self,
        client: AsyncClient,
        db: AsyncSession,
        company: Company,
        vehicle: Vehicle,
        station_accra: Station,
        station_prestea: Station,
        driver_user: User,
        driver_token: str,
    ):
        await _make_trip(
            db, company, vehicle, station_accra, station_prestea, driver_id=driver_user.id
        )

        response = await client.post(
            "/api/v1/driver/scan",
            headers=_auth(driver_token),
            json={"payload": "INVALID_QR_DATA"},
        )
        assert response.status_code == 200
        body = response.json()
        assert body["valid"] is False

    @pytest.mark.asyncio
    async def test_scan_requires_active_boarding_trip(
        self,
        client: AsyncClient,
        db: AsyncSession,
        company: Company,
        vehicle: Vehicle,
        station_accra: Station,
        station_prestea: Station,
        driver_user: User,
        driver_token: str,
    ):
        """Driver with only a 'scheduled' trip cannot scan — trip must be loading/departed."""
        trip = await _make_trip(
            db,
            company,
            vehicle,
            station_accra,
            station_prestea,
            status=TripStatus.scheduled,
            driver_id=driver_user.id,
        )
        ticket = await _make_ticket(db, company, trip, seat=1)

        payload = f"TICKET:{ticket.id}:{trip.id}:{ticket.seat_number}"
        response = await client.post(
            "/api/v1/driver/scan",
            headers=_auth(driver_token),
            json={"payload": payload},
        )
        # Should get 403 since no loading/departed trip
        assert response.status_code == 403

    @pytest.mark.asyncio
    async def test_non_driver_cannot_scan(
        self,
        client: AsyncClient,
        db: AsyncSession,
        company: Company,
        vehicle: Vehicle,
        station_accra: Station,
        station_prestea: Station,
        clerk_token: str,
    ):
        response = await client.post(
            "/api/v1/driver/scan",
            headers=_auth(clerk_token),
            json={"payload": "TICKET:1:1:1"},
        )
        assert response.status_code == 403
