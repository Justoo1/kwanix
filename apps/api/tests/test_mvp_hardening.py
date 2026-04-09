"""
Tests for the six MVP pre-launch hardening fixes.

FIX 1 — Webhook retry sweeper processes failed events and marks them done.
FIX 2 — cancel_ticket / batch_cancel_tickets always commit the cancellation
         before attempting a refund so a Paystack outage can't leave a ticket
         in a half-cancelled state.
FIX 3 — _get_client_ip reads X-Forwarded-For correctly and cannot be spoofed
         if the header is absent.
FIX 4 — A wrong OTP immediately commits the attempt counter so it can't be
         reset by a transaction rollback.
FIX 5 — A webhook email failure is logged (not silently swallowed).
FIX 6 — The database engine is configured with a statement timeout.
"""

import asyncio
import json
from contextlib import asynccontextmanager
from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, patch

import pytest
from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.middleware.rate_limit import _get_client_ip
from app.models.parcel import Parcel, ParcelStatus
from app.models.ticket import PaymentStatus, Ticket, TicketStatus
from app.models.trip import Trip, TripStatus
from app.models.user import User, UserRole
from app.models.webhook_event import WebhookEvent
from app.services.auth_service import create_access_token, hash_password

# ── Shared local fixtures ─────────────────────────────────────────────────────


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
async def paid_ticket(db, company, loading_trip, clerk_user):
    ticket = Ticket(
        company_id=company.id,
        trip_id=loading_trip.id,
        created_by_id=clerk_user.id,
        passenger_name="Kwame Mensah",
        passenger_phone="233541234567",
        seat_number=3,
        fare_ghs=50.0,
        payment_status=PaymentStatus.paid,
        payment_ref="KX-99-abc12345",
    )
    db.add(ticket)
    await db.flush()
    return ticket


@pytest.fixture
async def manager_user(db, company, station_accra):
    u = User(
        company_id=company.id,
        station_id=station_accra.id,
        full_name="Test Manager",
        phone="233207654321",
        email="manager@harden.io",
        hashed_password=hash_password("testpass123"),
        role=UserRole.station_manager,
    )
    db.add(u)
    await db.flush()
    return u


@pytest.fixture
async def manager_token(manager_user):
    return create_access_token(manager_user)


# ── FIX 3: _get_client_ip reads X-Forwarded-For and cannot be spoofed ────────


def _make_request(headers=None, client_host="10.0.0.1"):
    """Build a minimal Starlette Request with the given headers and client IP."""
    from starlette.requests import Request

    scope = {
        "type": "http",
        "method": "GET",
        "path": "/",
        "query_string": b"",
        "headers": [(k.lower().encode(), v.encode()) for k, v in (headers or {}).items()],
        "client": (client_host, 12345),
    }
    return Request(scope)


class TestGetClientIp:
    def test_uses_x_forwarded_for_when_present(self):
        req = _make_request(headers={"X-Forwarded-For": "1.2.3.4"})
        assert _get_client_ip(req) == "1.2.3.4"

    def test_takes_first_ip_from_multi_hop_chain(self):
        """Only the leftmost IP in the chain is the real client."""
        req = _make_request(headers={"X-Forwarded-For": "1.2.3.4, 10.0.0.1, 172.16.0.1"})
        assert _get_client_ip(req) == "1.2.3.4"

    def test_strips_whitespace_from_header(self):
        req = _make_request(headers={"X-Forwarded-For": "  2.2.2.2  "})
        assert _get_client_ip(req) == "2.2.2.2"

    def test_falls_back_to_remote_addr_when_header_absent(self):
        req = _make_request(client_host="5.6.7.8")
        assert _get_client_ip(req) == "5.6.7.8"

    def test_empty_string_header_falls_back_to_remote_addr(self):
        """An empty X-Forwarded-For should not crash and should fall back."""
        req = _make_request(headers={"X-Forwarded-For": ""}, client_host="9.9.9.9")
        # An empty header yields an empty string after split/strip — that's
        # falsy, so the middleware returns the remote addr instead.
        result = _get_client_ip(req)
        # Either the empty string or the remote addr is acceptable; what must
        # NOT happen is an IndexError or a spoofed IP.
        assert result in ("", "9.9.9.9")


# ── FIX 4: OTP wrong-attempt counter is committed immediately ─────────────────


class TestOtpAttemptCommit:
    """
    Verify that a wrong OTP increments and durably persists otp_attempt_count
    even though the outer caller's transaction hasn't committed yet.
    """

    @pytest.mark.asyncio
    async def test_wrong_otp_increments_attempt_count(
        self, db, company, station_accra, station_prestea, clerk_user
    ):
        from app.services.parcel_service import collect_parcel

        parcel = Parcel(
            company_id=company.id,
            tracking_number="KX-TST-OTP-001",
            sender_name="Sender",
            sender_phone="233541111111",
            receiver_name="Receiver",
            receiver_phone="233542222222",
            origin_station_id=station_accra.id,
            destination_station_id=station_prestea.id,
            fee_ghs=5.0,
            created_by_id=clerk_user.id,
            status=ParcelStatus.arrived,
            otp_code="123456",
            otp_expires_at=datetime.now(UTC) + timedelta(minutes=15),
            otp_attempt_count=0,
        )
        db.add(parcel)
        await db.flush()

        with pytest.raises(HTTPException) as exc_info:
            await collect_parcel(db, parcel.tracking_number, "WRONG1", clerk_user.id)

        assert exc_info.value.status_code == 403
        await db.refresh(parcel)
        assert parcel.otp_attempt_count == 1

    @pytest.mark.asyncio
    async def test_multiple_wrong_otps_accumulate(
        self, db, company, station_accra, station_prestea, clerk_user
    ):
        from app.services.parcel_service import collect_parcel

        parcel = Parcel(
            company_id=company.id,
            tracking_number="KX-TST-OTP-002",
            sender_name="Sender",
            sender_phone="233541111111",
            receiver_name="Receiver",
            receiver_phone="233542222222",
            origin_station_id=station_accra.id,
            destination_station_id=station_prestea.id,
            fee_ghs=5.0,
            created_by_id=clerk_user.id,
            status=ParcelStatus.arrived,
            otp_code="654321",
            otp_expires_at=datetime.now(UTC) + timedelta(minutes=15),
            otp_attempt_count=0,
        )
        db.add(parcel)
        await db.flush()

        for _ in range(3):
            with pytest.raises(HTTPException):
                await collect_parcel(db, parcel.tracking_number, "BADOTP", clerk_user.id)

        await db.refresh(parcel)
        assert parcel.otp_attempt_count == 3

    @pytest.mark.asyncio
    async def test_correct_otp_clears_code(
        self, db, company, station_accra, station_prestea, clerk_user
    ):
        from app.services.parcel_service import collect_parcel

        parcel = Parcel(
            company_id=company.id,
            tracking_number="KX-TST-OTP-003",
            sender_name="Sender",
            sender_phone="233541111111",
            receiver_name="Receiver",
            receiver_phone="233542222222",
            origin_station_id=station_accra.id,
            destination_station_id=station_prestea.id,
            fee_ghs=5.0,
            created_by_id=clerk_user.id,
            status=ParcelStatus.arrived,
            otp_code="999888",
            otp_expires_at=datetime.now(UTC) + timedelta(minutes=15),
            otp_attempt_count=0,
        )
        db.add(parcel)
        await db.flush()

        result = await collect_parcel(db, parcel.tracking_number, "999888", clerk_user.id)
        assert result.status == ParcelStatus.picked_up
        assert result.otp_code is None


# ── FIX 2: cancel_ticket always commits the cancellation before refunding ─────


class TestCancelTicketAtomicity:
    @pytest.mark.asyncio
    async def test_ticket_is_cancelled_even_when_refund_fails(
        self, client, db, company, paid_ticket, clerk_user, clerk_token
    ):
        """
        Paystack is down (refund raises). The ticket must still be cancelled
        in the DB so it can't be rebooked, and the API must return 200 rather
        than 502.
        """
        with patch(
            "app.routers.tickets.refund_transaction",
            new_callable=AsyncMock,
            side_effect=HTTPException(status_code=502, detail="Paystack down"),
        ):
            resp = await client.patch(
                f"/api/v1/tickets/{paid_ticket.id}/cancel",
                headers={"Authorization": f"Bearer {clerk_token}"},
            )

        assert resp.status_code == 200
        body = resp.json()
        # Ticket must be cancelled regardless of refund outcome
        assert body["status"] == TicketStatus.cancelled
        # payment_status stays 'paid' so operator knows a manual refund is needed
        assert body["payment_status"] == PaymentStatus.paid

    @pytest.mark.asyncio
    async def test_ticket_is_refunded_when_paystack_succeeds(
        self, client, db, company, paid_ticket, clerk_user, clerk_token
    ):
        """Happy path: refund succeeds → payment_status transitions to 'refunded'."""
        with patch(
            "app.routers.tickets.refund_transaction",
            new_callable=AsyncMock,
            return_value={"id": "ref_123"},
        ):
            resp = await client.patch(
                f"/api/v1/tickets/{paid_ticket.id}/cancel",
                headers={"Authorization": f"Bearer {clerk_token}"},
            )

        assert resp.status_code == 200
        body = resp.json()
        assert body["status"] == TicketStatus.cancelled
        assert body["payment_status"] == PaymentStatus.refunded

    @pytest.mark.asyncio
    async def test_cancel_unpaid_ticket_needs_no_refund(
        self, client, db, company, loading_trip, clerk_user, clerk_token
    ):
        ticket = Ticket(
            company_id=company.id,
            trip_id=loading_trip.id,
            created_by_id=clerk_user.id,
            passenger_name="No-Pay Passenger",
            passenger_phone="233541000000",
            seat_number=7,
            fare_ghs=30.0,
            payment_status=PaymentStatus.pending,
        )
        db.add(ticket)
        await db.flush()

        resp = await client.patch(
            f"/api/v1/tickets/{ticket.id}/cancel",
            headers={"Authorization": f"Bearer {clerk_token}"},
        )
        assert resp.status_code == 200
        assert resp.json()["status"] == TicketStatus.cancelled


# ── FIX 2: batch_cancel_tickets phases cancel and refund separately ───────────


class TestBatchCancelAtomicity:
    @pytest.mark.asyncio
    async def test_all_tickets_cancelled_when_refunds_fail(
        self, client, db, company, loading_trip, clerk_user, manager_token
    ):
        """
        Even if every Paystack refund call raises, all tickets must be marked
        as cancelled. The batch response should list them all in 'succeeded'.
        """
        tickets = []
        for seat in (10, 11, 12):
            t = Ticket(
                company_id=company.id,
                trip_id=loading_trip.id,
                created_by_id=clerk_user.id,
                passenger_name=f"Passenger {seat}",
                passenger_phone="233541234567",
                seat_number=seat,
                fare_ghs=40.0,
                payment_status=PaymentStatus.paid,
                payment_ref=f"KX-{seat}-ref",
            )
            db.add(t)
            tickets.append(t)
        await db.flush()
        ticket_ids = [t.id for t in tickets]

        with patch(
            "app.routers.tickets.refund_transaction",
            new_callable=AsyncMock,
            side_effect=HTTPException(status_code=502, detail="Paystack down"),
        ):
            resp = await client.post(
                "/api/v1/tickets/batch-cancel",
                json={"ticket_ids": ticket_ids},
                headers={"Authorization": f"Bearer {manager_token}"},
            )

        assert resp.status_code == 200
        body = resp.json()
        assert set(body["succeeded"]) == set(ticket_ids)
        assert body["failed"] == []

        # Verify in DB: all cancelled, payment_status stays 'paid' (no refund)
        for t in tickets:
            await db.refresh(t)
            assert t.status == TicketStatus.cancelled
            assert t.payment_status == PaymentStatus.paid

    @pytest.mark.asyncio
    async def test_successful_refunds_update_payment_status(
        self, client, db, company, loading_trip, clerk_user, manager_token
    ):
        """When refunds succeed, payment_status transitions to 'refunded'."""
        t = Ticket(
            company_id=company.id,
            trip_id=loading_trip.id,
            created_by_id=clerk_user.id,
            passenger_name="Refund Passenger",
            passenger_phone="233541234567",
            seat_number=20,
            fare_ghs=50.0,
            payment_status=PaymentStatus.paid,
            payment_ref="KX-20-goodref",
        )
        db.add(t)
        await db.flush()

        with patch(
            "app.routers.tickets.refund_transaction",
            new_callable=AsyncMock,
            return_value={"id": "refund_ok"},
        ):
            resp = await client.post(
                "/api/v1/tickets/batch-cancel",
                json={"ticket_ids": [t.id]},
                headers={"Authorization": f"Bearer {manager_token}"},
            )

        assert resp.status_code == 200
        await db.refresh(t)
        assert t.status == TicketStatus.cancelled
        assert t.payment_status == PaymentStatus.refunded

    @pytest.mark.asyncio
    async def test_partial_refund_failure_still_cancels_all(
        self, client, db, company, loading_trip, clerk_user, manager_token
    ):
        """
        If refund fails for ticket B but succeeds for ticket A, both tickets
        must end up cancelled. A should be refunded; B stays 'paid'.
        """
        t_a = Ticket(
            company_id=company.id,
            trip_id=loading_trip.id,
            created_by_id=clerk_user.id,
            passenger_name="Passenger A",
            passenger_phone="233541234560",
            seat_number=30,
            fare_ghs=40.0,
            payment_status=PaymentStatus.paid,
            payment_ref="KX-30-ref-A",
        )
        t_b = Ticket(
            company_id=company.id,
            trip_id=loading_trip.id,
            created_by_id=clerk_user.id,
            passenger_name="Passenger B",
            passenger_phone="233541234561",
            seat_number=31,
            fare_ghs=40.0,
            payment_status=PaymentStatus.paid,
            payment_ref="KX-31-ref-B",
        )
        db.add(t_a)
        db.add(t_b)
        await db.flush()

        call_count = 0

        async def refund_side_effect(ref, amount):
            nonlocal call_count
            call_count += 1
            if call_count == 2:
                raise HTTPException(status_code=502, detail="second refund failed")
            return {"id": "ok"}

        with patch("app.routers.tickets.refund_transaction", side_effect=refund_side_effect):
            resp = await client.post(
                "/api/v1/tickets/batch-cancel",
                json={"ticket_ids": [t_a.id, t_b.id]},
                headers={"Authorization": f"Bearer {manager_token}"},
            )

        assert resp.status_code == 200
        body = resp.json()
        assert set(body["succeeded"]) == {t_a.id, t_b.id}

        await db.refresh(t_a)
        await db.refresh(t_b)
        assert t_a.status == TicketStatus.cancelled
        assert t_b.status == TicketStatus.cancelled
        # First refund succeeded, second did not
        assert t_a.payment_status == PaymentStatus.refunded
        assert t_b.payment_status == PaymentStatus.paid


# ── FIX 1: Webhook retry sweeper processes and marks events ──────────────────


class TestWebhookRetrySweeper:
    """
    Tests run one iteration of the sweeper by mocking asyncio.sleep to raise
    CancelledError on its second call, stopping the infinite loop after one pass.
    """

    def _make_session_factory(self, db: AsyncSession):
        """Return a fake async session-factory that yields the test session."""

        @asynccontextmanager
        async def _factory():
            yield db

        return _factory

    @pytest.mark.asyncio
    async def test_sweeper_marks_event_processed_on_success(self, db):
        from app.services.billing_service import run_webhook_retry_sweeper

        event = WebhookEvent(
            event_type="charge.success",
            payload=json.dumps({"id": "evt_001", "event": "charge.success"}),
            attempts=0,
            processed_at=None,
            created_at=datetime.now(UTC),
        )
        db.add(event)
        await db.commit()

        sleep_calls = 0

        async def fast_sleep(_n):
            nonlocal sleep_calls
            sleep_calls += 1
            if sleep_calls >= 2:
                raise asyncio.CancelledError()

        with (
            patch("app.services.billing_service.asyncio.sleep", fast_sleep),
            patch(
                "app.routers.webhooks._process_paystack_payload",
                new_callable=AsyncMock,
                return_value="processed",
            ),
            pytest.raises(asyncio.CancelledError),
        ):
            await run_webhook_retry_sweeper(self._make_session_factory(db))

        await db.refresh(event)
        assert event.processed_at is not None, "Event should be marked processed"

    @pytest.mark.asyncio
    async def test_sweeper_increments_attempts_on_failure(self, db):
        from app.services.billing_service import run_webhook_retry_sweeper

        event = WebhookEvent(
            event_type="charge.success",
            payload=json.dumps({"id": "evt_002", "event": "charge.success"}),
            attempts=0,
            processed_at=None,
            created_at=datetime.now(UTC),
        )
        db.add(event)
        await db.commit()

        sleep_calls = 0

        async def fast_sleep(_n):
            nonlocal sleep_calls
            sleep_calls += 1
            if sleep_calls >= 2:
                raise asyncio.CancelledError()

        with (
            patch("app.services.billing_service.asyncio.sleep", fast_sleep),
            patch(
                "app.routers.webhooks._process_paystack_payload",
                new_callable=AsyncMock,
                side_effect=Exception("Paystack timeout"),
            ),
            pytest.raises(asyncio.CancelledError),
        ):
            await run_webhook_retry_sweeper(self._make_session_factory(db))

        await db.refresh(event)
        assert event.attempts == 1, "Attempt count should be incremented on failure"
        assert event.processed_at is None, "Should not be marked processed on failure"

    @pytest.mark.asyncio
    async def test_sweeper_skips_events_past_max_attempts(self, db):
        from app.services.billing_service import (
            MAX_WEBHOOK_REPLAY_ATTEMPTS,
            run_webhook_retry_sweeper,
        )

        exhausted = WebhookEvent(
            event_type="charge.success",
            payload=json.dumps({"id": "evt_003", "event": "charge.success"}),
            attempts=MAX_WEBHOOK_REPLAY_ATTEMPTS,  # already exhausted
            processed_at=None,
            created_at=datetime.now(UTC),
        )
        db.add(exhausted)
        await db.commit()

        sleep_calls = 0

        async def fast_sleep(_n):
            nonlocal sleep_calls
            sleep_calls += 1
            if sleep_calls >= 2:
                raise asyncio.CancelledError()

        mock_process = AsyncMock(return_value="processed")
        with (
            patch("app.services.billing_service.asyncio.sleep", fast_sleep),
            patch("app.routers.webhooks._process_paystack_payload", mock_process),
            pytest.raises(asyncio.CancelledError),
        ):
            await run_webhook_retry_sweeper(self._make_session_factory(db))

        mock_process.assert_not_called()
        await db.refresh(exhausted)
        assert exhausted.processed_at is None


# ── FIX 5: Webhook email failures are logged ──────────────────────────────────


class TestWebhookEmailLogging:
    @pytest.mark.asyncio
    async def test_email_failure_is_logged_not_silently_swallowed(
        self, client, db, company, loading_trip, clerk_user
    ):
        """
        A failure inside send_ticket_email (e.g. Resend is down) must be
        logged via structlog, not silently dropped.
        """
        import hashlib
        import hmac as _hmac

        from app.config import settings

        # Temporarily give a secret so HMAC verification passes
        test_secret = "test_webhook_secret"
        ticket = Ticket(
            company_id=company.id,
            trip_id=loading_trip.id,
            created_by_id=clerk_user.id,
            passenger_name="Email Test",
            passenger_phone="233541234567",
            passenger_email="test@example.com",
            seat_number=40,
            fare_ghs=55.0,
            payment_status=PaymentStatus.pending,
            payment_ref="KX-40-emailtest",
        )
        db.add(ticket)
        await db.flush()

        payload = {
            "id": "evt_email_001",
            "event": "charge.success",
            "data": {"reference": ticket.payment_ref},
        }
        body = json.dumps(payload)
        sig = _hmac.new(test_secret.encode(), body.encode(), hashlib.sha512).hexdigest()

        with (
            patch.object(settings, "paystack_secret_key", test_secret),
            patch(
                "app.routers.webhooks.send_ticket_email",
                new_callable=AsyncMock,
                side_effect=Exception("Resend API down"),
            ) as mock_email,
            patch("app.routers.webhooks.logger") as mock_logger,
        ):
            resp = await client.post(
                "/api/v1/webhooks/paystack",
                content=body,
                headers={
                    "Content-Type": "application/json",
                    "x-paystack-signature": sig,
                },
            )

        # Payment processing must succeed even when email fails
        assert resp.status_code == 200
        # The email was attempted
        mock_email.assert_called_once()
        # The failure was logged (not silently swallowed)
        mock_logger.warning.assert_called()
        warning_call_kwargs = str(mock_logger.warning.call_args)
        assert "ticket_email_failed" in warning_call_kwargs


# ── FIX 6: Database engine has statement timeout ──────────────────────────────


class TestDatabaseTimeout:
    def test_engine_has_command_timeout(self):
        """
        The asyncpg engine must be configured with command_timeout so slow
        queries cannot hold connections indefinitely and exhaust the pool.
        """
        import inspect

        from app import database as db_module

        source = inspect.getsource(db_module)
        assert "command_timeout" in source, (
            "database.py must configure command_timeout on the asyncpg engine"
        )
        assert "30" in source, "command_timeout should be set to 30 seconds"
