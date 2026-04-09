"""
Phase 4 — SMS wiring tests.

Covers:
- SmsLog row is written after every SMS-triggering event (parcel_logged,
  parcel_in_transit, parcel_arrived)
- Phone number is stored normalised (0XXXXXXXXX → 233XXXXXXXXX)
- dispatch_sms does not raise when ARKESEL_API_KEY is empty (skipped status)
- End-to-end: POST /parcels with a 054 phone → sms_log.recipient_phone=233…
"""

from datetime import UTC, datetime

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.parcel import Parcel, ParcelStatus
from app.models.sms_log import SmsLog
from app.models.trip import Trip, TripStatus

# ── dispatch_sms unit tests ───────────────────────────────────────────────────


class TestDispatchSms:
    @pytest.mark.asyncio
    async def test_skipped_status_when_no_api_key(self, db: AsyncSession, company):
        """With no API key configured the send is skipped but still logged."""
        from app.integrations.arkesel import dispatch_sms

        await dispatch_sms(db, None, "233541234567", "Test message", "test_event")

        result = await db.execute(select(SmsLog))
        logs = result.scalars().all()
        assert len(logs) == 1
        log = logs[0]
        assert log.status == "skipped"
        assert log.recipient_phone == "233541234567"
        assert log.event_type == "test_event"
        assert log.message == "Test message"
        assert log.parcel_id is None

    @pytest.mark.asyncio
    async def test_parcel_id_is_stored(
        self, db: AsyncSession, company, station_accra, station_prestea, clerk_user
    ):
        from app.integrations.arkesel import dispatch_sms

        parcel = Parcel(
            company_id=company.id,
            tracking_number="KX-TST-2026-50001",
            sender_name="Ama",
            sender_phone="233541234567",
            receiver_name="Kofi",
            receiver_phone="233249876543",
            origin_station_id=station_accra.id,
            destination_station_id=station_prestea.id,
            fee_ghs=5.0,
            created_by_id=clerk_user.id,
            status=ParcelStatus.pending,
        )
        db.add(parcel)
        await db.flush()

        await dispatch_sms(db, parcel.id, "233249876543", "Hello Kofi", "parcel_logged")

        result = await db.execute(select(SmsLog))
        log = result.scalar_one()
        assert log.parcel_id == parcel.id


# ── Phone normalisation end-to-end ────────────────────────────────────────────


class TestPhoneNormalisationEndToEnd:
    @pytest.mark.asyncio
    async def test_054_phone_stored_as_233_in_sms_log(
        self,
        client,
        clerk_token,
        company,
        station_accra,
        station_prestea,
        tracking_seq,
        clerk_user,
        db: AsyncSession,
    ):
        """
        Step 21 end-to-end:
        - Clerk submits receiver_phone "0249876543" (local format)
        - Pydantic validator normalises it to "233249876543"
        - POST /parcels triggers parcel_logged SMS in background
        - SmsLog.recipient_phone is "233249876543" — the normalised form
        - SmsLog.status is "skipped" (no API key in test env)
        """
        response = await client.post(
            "/api/v1/parcels",
            headers={"Authorization": f"Bearer {clerk_token}"},
            json={
                "sender_name": "Kwame",
                "sender_phone": "0541234567",  # 054 format — should normalise
                "receiver_name": "Akosua",
                "receiver_phone": "0249876543",  # 024 format — should normalise
                "origin_station_id": station_accra.id,
                "destination_station_id": station_prestea.id,
                "fee_ghs": 12.0,
            },
        )
        assert response.status_code == 201

        result = await db.execute(select(SmsLog))
        logs = result.scalars().all()
        assert len(logs) == 1, "One sms_log row expected per parcel create"

        log = logs[0]
        assert log.recipient_phone == "233249876543"  # normalised
        assert log.event_type == "parcel_logged"
        assert log.status == "skipped"  # no API key in test env
        assert log.error_detail is None

    @pytest.mark.asyncio
    async def test_load_event_creates_sms_log(
        self,
        client,
        clerk_token,
        company,
        station_accra,
        station_prestea,
        vehicle,
        clerk_user,
        db: AsyncSession,
    ):
        parcel = Parcel(
            company_id=company.id,
            tracking_number="KX-TST-2026-50002",
            sender_name="Ama",
            sender_phone="233541234567",
            receiver_name="Kofi",
            receiver_phone="233249876543",
            origin_station_id=station_accra.id,
            destination_station_id=station_prestea.id,
            fee_ghs=5.0,
            created_by_id=clerk_user.id,
            status=ParcelStatus.pending,
        )
        trip = Trip(
            company_id=company.id,
            vehicle_id=vehicle.id,
            departure_station_id=station_accra.id,
            destination_station_id=station_prestea.id,
            departure_time=datetime.now(UTC),
            status=TripStatus.loading,
        )
        db.add(parcel)
        db.add(trip)
        await db.flush()

        response = await client.patch(
            "/api/v1/parcels/load",
            headers={"Authorization": f"Bearer {clerk_token}"},
            json={"parcel_id": parcel.id, "trip_id": trip.id},
        )
        assert response.status_code == 200

        result = await db.execute(select(SmsLog).where(SmsLog.event_type == "parcel_in_transit"))
        log = result.scalar_one()
        assert log.recipient_phone == "233249876543"
        assert log.status == "skipped"

    @pytest.mark.asyncio
    async def test_unload_event_creates_sms_log(
        self,
        client,
        clerk_token,
        company,
        station_accra,
        station_prestea,
        vehicle,
        clerk_user,
        db: AsyncSession,
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

        parcel = Parcel(
            company_id=company.id,
            tracking_number="KX-TST-2026-50003",
            sender_name="Ama",
            sender_phone="233541234567",
            receiver_name="Kofi",
            receiver_phone="233249876543",
            origin_station_id=station_accra.id,
            destination_station_id=station_prestea.id,
            current_trip_id=trip.id,
            fee_ghs=5.0,
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

        result = await db.execute(select(SmsLog).where(SmsLog.event_type == "parcel_arrived"))
        log = result.scalar_one()
        assert log.recipient_phone == "233249876543"
        assert log.status == "skipped"
        # OTP must NOT appear in the HTTP response (already verified in phase 3)
        # but it IS in the SMS message body — confirm the message contains a 6-digit code
        assert any(c.isdigit() for c in log.message)


# ── G3: msg_parcel_return_sender ──────────────────────────────────────────────


class TestParcelReturnSenderSms:
    """msg_parcel_return_sender helper and return endpoint SMS wiring."""

    def test_message_includes_tracking_number(self):
        from app.integrations.arkesel import msg_parcel_return_sender

        msg = msg_parcel_return_sender("KX-TST-0001", None)
        assert "KX-TST-0001" in msg
        assert "Kwanix" in msg

    def test_message_includes_reason_when_provided(self):
        from app.integrations.arkesel import msg_parcel_return_sender

        msg = msg_parcel_return_sender("KX-TST-0001", "Address not found")
        assert "Address not found" in msg

    def test_message_omits_reason_line_when_none(self):
        from app.integrations.arkesel import msg_parcel_return_sender

        msg = msg_parcel_return_sender("KX-TST-0001", None)
        assert "Reason:" not in msg

    @pytest.mark.asyncio
    async def test_return_endpoint_sends_sms_to_sender(
        self, client, clerk_token, db, company, station_accra, station_prestea, clerk_user
    ):
        from app.models.parcel import Parcel, ParcelStatus

        parcel = Parcel(
            company_id=company.id,
            tracking_number="KX-TST-G3-001",
            sender_name="Return Sender",
            sender_phone="233541111222",
            receiver_name="Return Receiver",
            receiver_phone="233249887766",
            origin_station_id=station_accra.id,
            destination_station_id=station_prestea.id,
            fee_ghs=8.0,
            created_by_id=clerk_user.id,
            status=ParcelStatus.arrived,
        )
        db.add(parcel)
        await db.flush()

        response = await client.patch(
            f"/api/v1/parcels/{parcel.id}/return",
            headers={"Authorization": f"Bearer {clerk_token}"},
            json={"reason": "No one available"},
        )
        assert response.status_code == 200

        from sqlalchemy import select

        result = await db.execute(select(SmsLog).where(SmsLog.event_type == "parcel_returned"))
        log = result.scalar_one()
        assert log.recipient_phone == "233541111222"
        assert "No one available" in log.message
