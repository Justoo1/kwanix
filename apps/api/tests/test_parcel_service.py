"""Tests for app/services/parcel_service.py — the core business logic engine."""

from datetime import UTC, datetime, timedelta

import pytest
from fastapi import HTTPException

from app.models.parcel import Parcel, ParcelStatus
from app.models.trip import Trip, TripStatus
from app.services.parcel_service import (
    collect_parcel,
    unload_parcel,
    validate_and_load,
)

# ── Helpers ───────────────────────────────────────────────────────────────────


async def _make_parcel(db, company, station_accra, station_prestea, clerk_user) -> Parcel:
    p = Parcel(
        company_id=company.id,
        tracking_number="KX-TST-2026-00001",
        sender_name="Kwesi Sender",
        sender_phone="233541111111",
        receiver_name="Ama Receiver",
        receiver_phone="233542222222",
        origin_station_id=station_accra.id,
        destination_station_id=station_prestea.id,
        fee_ghs=10.0,
        created_by_id=clerk_user.id,
        status=ParcelStatus.pending,
    )
    db.add(p)
    await db.flush()
    return p


async def _make_trip(db, company, vehicle, departure, destination) -> Trip:
    t = Trip(
        company_id=company.id,
        vehicle_id=vehicle.id,
        departure_station_id=departure.id,
        destination_station_id=destination.id,
        departure_time=datetime.now(UTC),
        status=TripStatus.loading,
    )
    db.add(t)
    await db.flush()
    return t


# ── validate_and_load ─────────────────────────────────────────────────────────


class TestValidateAndLoad:
    @pytest.mark.asyncio
    async def test_happy_path_loads_parcel(
        self, db, company, station_accra, station_prestea, vehicle, clerk_user
    ):
        """Parcel going to Prestea, bus going to Prestea → should succeed."""
        parcel = await _make_parcel(db, company, station_accra, station_prestea, clerk_user)
        trip = await _make_trip(db, company, vehicle, station_accra, station_prestea)

        result = await validate_and_load(db, parcel.id, trip.id, clerk_user.id)

        assert result.status == ParcelStatus.in_transit
        assert result.current_trip_id == trip.id

    @pytest.mark.asyncio
    async def test_destination_mismatch_raises_400(
        self, db, company, station_accra, station_prestea, vehicle, clerk_user
    ):
        """Parcel going to Prestea, bus going to Accra → must raise DESTINATION_MISMATCH."""
        parcel = await _make_parcel(db, company, station_accra, station_prestea, clerk_user)
        # Bus goes back to Accra — WRONG direction for this parcel
        wrong_trip = await _make_trip(db, company, vehicle, station_prestea, station_accra)

        with pytest.raises(HTTPException) as exc_info:
            await validate_and_load(db, parcel.id, wrong_trip.id, clerk_user.id)

        assert exc_info.value.status_code == 400
        assert exc_info.value.detail["code"] == "DESTINATION_MISMATCH"
        assert "Prestea" in exc_info.value.detail["correct_destination"]
        assert "Accra" in exc_info.value.detail["bus_destination"]

    @pytest.mark.asyncio
    async def test_cannot_load_parcel_already_in_transit(
        self, db, company, station_accra, station_prestea, vehicle, clerk_user
    ):
        parcel = await _make_parcel(db, company, station_accra, station_prestea, clerk_user)
        trip = await _make_trip(db, company, vehicle, station_accra, station_prestea)
        # Load it once
        await validate_and_load(db, parcel.id, trip.id, clerk_user.id)

        # Try to load again
        with pytest.raises(HTTPException) as exc_info:
            await validate_and_load(db, parcel.id, trip.id, clerk_user.id)
        assert exc_info.value.status_code == 400
        assert "in_transit" in exc_info.value.detail

    @pytest.mark.asyncio
    async def test_nonexistent_parcel_raises_404(
        self, db, company, station_accra, station_prestea, vehicle, clerk_user
    ):
        trip = await _make_trip(db, company, vehicle, station_accra, station_prestea)
        with pytest.raises(HTTPException) as exc_info:
            await validate_and_load(db, 99999, trip.id, clerk_user.id)
        assert exc_info.value.status_code == 404

    @pytest.mark.asyncio
    async def test_nonexistent_trip_raises_404(
        self, db, company, station_accra, station_prestea, clerk_user
    ):
        parcel = await _make_parcel(db, company, station_accra, station_prestea, clerk_user)
        with pytest.raises(HTTPException) as exc_info:
            await validate_and_load(db, parcel.id, 99999, clerk_user.id)
        assert exc_info.value.status_code == 404

    @pytest.mark.asyncio
    async def test_audit_log_is_created(
        self, db, company, station_accra, station_prestea, vehicle, clerk_user
    ):
        parcel = await _make_parcel(db, company, station_accra, station_prestea, clerk_user)
        trip = await _make_trip(db, company, vehicle, station_accra, station_prestea)
        await validate_and_load(db, parcel.id, trip.id, clerk_user.id)

        await db.refresh(parcel, ["logs"])
        assert len(parcel.logs) == 1
        log = parcel.logs[0]
        assert log.new_status == "in_transit"
        assert log.previous_status == "pending"
        assert log.clerk_id == clerk_user.id


# ── unload_parcel ─────────────────────────────────────────────────────────────


class TestUnloadParcel:
    @pytest.mark.asyncio
    async def test_happy_path_marks_arrived_and_returns_otp(
        self, db, company, station_accra, station_prestea, vehicle, clerk_user
    ):
        parcel = await _make_parcel(db, company, station_accra, station_prestea, clerk_user)
        trip = await _make_trip(db, company, vehicle, station_accra, station_prestea)
        await validate_and_load(db, parcel.id, trip.id, clerk_user.id)

        result_parcel, otp_code = await unload_parcel(db, parcel.id, clerk_user.id)

        assert result_parcel.status == ParcelStatus.arrived
        assert len(otp_code) == 6
        assert otp_code.isdigit()
        assert result_parcel.otp_code == otp_code
        assert result_parcel.otp_expires_at is not None

    @pytest.mark.asyncio
    async def test_cannot_unload_pending_parcel(
        self, db, company, station_accra, station_prestea, clerk_user
    ):
        parcel = await _make_parcel(db, company, station_accra, station_prestea, clerk_user)
        with pytest.raises(HTTPException) as exc_info:
            await unload_parcel(db, parcel.id, clerk_user.id)
        assert exc_info.value.status_code == 400

    @pytest.mark.asyncio
    async def test_otp_attempt_count_reset_on_unload(
        self, db, company, station_accra, station_prestea, vehicle, clerk_user
    ):
        parcel = await _make_parcel(db, company, station_accra, station_prestea, clerk_user)
        trip = await _make_trip(db, company, vehicle, station_accra, station_prestea)
        await validate_and_load(db, parcel.id, trip.id, clerk_user.id)
        parcel.otp_attempt_count = 3  # Simulate prior failed attempts
        result_parcel, _ = await unload_parcel(db, parcel.id, clerk_user.id)
        assert result_parcel.otp_attempt_count == 0


# ── collect_parcel ────────────────────────────────────────────────────────────


class TestCollectParcel:
    async def _arrived_parcel(
        self, db, company, station_accra, station_prestea, vehicle, clerk_user
    ) -> tuple[Parcel, str]:
        parcel = await _make_parcel(db, company, station_accra, station_prestea, clerk_user)
        trip = await _make_trip(db, company, vehicle, station_accra, station_prestea)
        await validate_and_load(db, parcel.id, trip.id, clerk_user.id)
        return await unload_parcel(db, parcel.id, clerk_user.id)

    @pytest.mark.asyncio
    async def test_correct_otp_marks_picked_up(
        self, db, company, station_accra, station_prestea, vehicle, clerk_user
    ):
        parcel, otp = await self._arrived_parcel(
            db, company, station_accra, station_prestea, vehicle, clerk_user
        )
        result = await collect_parcel(db, parcel.tracking_number, otp, clerk_user.id)
        assert result.status == ParcelStatus.picked_up
        assert result.otp_code is None
        assert result.otp_expires_at is None

    @pytest.mark.asyncio
    async def test_wrong_otp_raises_403(
        self, db, company, station_accra, station_prestea, vehicle, clerk_user
    ):
        parcel, _ = await self._arrived_parcel(
            db, company, station_accra, station_prestea, vehicle, clerk_user
        )
        with pytest.raises(HTTPException) as exc_info:
            await collect_parcel(db, parcel.tracking_number, "000000", clerk_user.id)
        assert exc_info.value.status_code == 403

    @pytest.mark.asyncio
    async def test_wrong_otp_increments_attempt_count(
        self, db, company, station_accra, station_prestea, vehicle, clerk_user
    ):
        parcel, _ = await self._arrived_parcel(
            db, company, station_accra, station_prestea, vehicle, clerk_user
        )
        with pytest.raises(HTTPException):
            await collect_parcel(db, parcel.tracking_number, "000000", clerk_user.id)

        await db.refresh(parcel)
        assert parcel.otp_attempt_count == 1

    @pytest.mark.asyncio
    async def test_locked_after_5_wrong_attempts(
        self, db, company, station_accra, station_prestea, vehicle, clerk_user
    ):
        parcel, _ = await self._arrived_parcel(
            db, company, station_accra, station_prestea, vehicle, clerk_user
        )
        # Simulate 5 failed attempts by setting the counter directly
        parcel.otp_attempt_count = 5
        await db.flush()

        with pytest.raises(HTTPException) as exc_info:
            await collect_parcel(db, parcel.tracking_number, "000000", clerk_user.id)
        assert exc_info.value.status_code == 400
        assert "Too many" in exc_info.value.detail

    @pytest.mark.asyncio
    async def test_expired_otp_raises_403(
        self, db, company, station_accra, station_prestea, vehicle, clerk_user
    ):
        parcel, otp = await self._arrived_parcel(
            db, company, station_accra, station_prestea, vehicle, clerk_user
        )
        # Force the OTP to be expired
        parcel.otp_expires_at = datetime.now(UTC) - timedelta(minutes=1)
        await db.flush()

        with pytest.raises(HTTPException) as exc_info:
            await collect_parcel(db, parcel.tracking_number, otp, clerk_user.id)
        assert exc_info.value.status_code == 403

    @pytest.mark.asyncio
    async def test_already_picked_up_raises_400(
        self, db, company, station_accra, station_prestea, vehicle, clerk_user
    ):
        parcel, otp = await self._arrived_parcel(
            db, company, station_accra, station_prestea, vehicle, clerk_user
        )
        await collect_parcel(db, parcel.tracking_number, otp, clerk_user.id)

        with pytest.raises(HTTPException) as exc_info:
            await collect_parcel(db, parcel.tracking_number, otp, clerk_user.id)
        assert exc_info.value.status_code == 400
        assert "already collected" in exc_info.value.detail

    @pytest.mark.asyncio
    async def test_unknown_tracking_number_raises_404(self, db):
        with pytest.raises(HTTPException) as exc_info:
            await collect_parcel(db, "KX-FAKE-0000-00000", "123456", 1)
        assert exc_info.value.status_code == 404
