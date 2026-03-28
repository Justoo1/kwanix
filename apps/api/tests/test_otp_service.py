"""Tests for app/services/otp_service.py"""

from datetime import UTC, datetime, timedelta

from app.services.otp_service import (
    OTP_LENGTH,
    OTP_MAX_ATTEMPTS,
    generate_otp,
    is_otp_locked,
    verify_otp,
)


class TestGenerateOtp:
    def test_code_has_correct_length(self):
        code, _ = generate_otp()
        assert len(code) == OTP_LENGTH

    def test_code_is_numeric_string(self):
        code, _ = generate_otp()
        assert code.isdigit()

    def test_expiry_is_in_the_future(self):
        _, expires_at = generate_otp()
        assert expires_at > datetime.now(UTC)

    def test_expiry_is_approximately_15_minutes(self):
        before = datetime.now(UTC)
        _, expires_at = generate_otp()
        delta = expires_at - before
        assert timedelta(minutes=14) < delta < timedelta(minutes=16)

    def test_two_codes_are_not_always_equal(self):
        """Randomness check — statistically will pass; failure would indicate broken RNG."""
        codes = {generate_otp()[0] for _ in range(10)}
        assert len(codes) > 1


class TestVerifyOtp:
    def test_correct_otp_returns_true(self):
        code, expires_at = generate_otp()
        assert verify_otp(code, expires_at, code) is True

    def test_wrong_otp_returns_false(self):
        code, expires_at = generate_otp()
        assert verify_otp(code, expires_at, "000000") is False

    def test_expired_otp_returns_false(self):
        code = "123456"
        expired_at = datetime.now(UTC) - timedelta(minutes=1)
        assert verify_otp(code, expired_at, code) is False

    def test_none_stored_otp_returns_false(self):
        _, expires_at = generate_otp()
        assert verify_otp(None, expires_at, "123456") is False

    def test_none_expires_at_returns_false(self):
        assert verify_otp("123456", None, "123456") is False

    def test_both_none_returns_false(self):
        assert verify_otp(None, None, "123456") is False

    def test_otp_just_before_expiry_is_valid(self):
        code = "654321"
        expires_at = datetime.now(UTC) + timedelta(seconds=5)
        assert verify_otp(code, expires_at, code) is True


class TestIsOtpLocked:
    def test_below_max_attempts_not_locked(self):
        assert is_otp_locked(OTP_MAX_ATTEMPTS - 1) is False

    def test_at_max_attempts_is_locked(self):
        assert is_otp_locked(OTP_MAX_ATTEMPTS) is True

    def test_above_max_attempts_is_locked(self):
        assert is_otp_locked(OTP_MAX_ATTEMPTS + 5) is True

    def test_zero_attempts_not_locked(self):
        assert is_otp_locked(0) is False
