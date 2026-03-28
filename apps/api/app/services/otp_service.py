import secrets
from datetime import UTC, datetime, timedelta

OTP_LENGTH = 6
OTP_EXPIRY_MINUTES = 15
OTP_MAX_ATTEMPTS = 5


def generate_otp() -> tuple[str, datetime]:
    """Returns a (otp_code, expires_at) tuple."""
    code = "".join([str(secrets.randbelow(10)) for _ in range(OTP_LENGTH)])
    expires_at = datetime.now(UTC) + timedelta(minutes=OTP_EXPIRY_MINUTES)
    return code, expires_at


def verify_otp(stored_otp: str | None, expires_at: datetime | None, user_otp: str) -> bool:
    """
    Returns True if the OTP matches and has not expired.
    Does NOT handle attempt counting — callers must check otp_attempt_count first.
    """
    if stored_otp is None or expires_at is None:
        return False
    if datetime.now(UTC) > expires_at:
        return False
    return secrets.compare_digest(stored_otp, user_otp)


def is_otp_locked(attempt_count: int) -> bool:
    return attempt_count >= OTP_MAX_ATTEMPTS
