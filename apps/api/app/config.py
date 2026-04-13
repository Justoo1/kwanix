import json

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

_INSECURE_DEFAULTS = {"change-me-in-production", "", "secret"}


class Settings(BaseSettings):
    # Database
    database_url: str = "postgresql+asyncpg://kwanix:secret@localhost:5432/kwanix_db"
    database_admin_url: str | None = None  # superuser URL for migrations/admin scripts

    # Security
    jwt_secret_key: str
    jwt_algorithm: str = "HS256"
    jwt_access_token_expire_minutes: int = 60
    jwt_refresh_token_expire_days: int = 7

    # Arkesel SMS
    arkesel_api_key: str = ""
    arkesel_sender_id: str = "Kwanix"

    # Payments
    paystack_secret_key: str = ""
    paystack_public_key: str = ""
    flutterwave_secret_key: str = ""

    # App
    environment: str = "development"
    debug: bool = True
    public_app_url: str = "http://localhost:3000"  # Next.js frontend (for post-payment redirects)
    api_public_url: str = "http://localhost:8000"  # FastAPI backend (for Paystack callback URL)
    # Stored as str — pydantic-settings v2 tries json.loads() on list[str] fields,
    # which breaks comma-separated env values. Parse manually via get_allowed_origins().
    allowed_origins: str = "http://localhost:3000"

    # Arkesel low-balance alert threshold (units)
    sms_low_balance_threshold: int = 50

    # Manifest email — optional distribution address for trip departure emails
    manifest_email: str | None = None

    # Resend — optional; required only when manifest_email is set
    resend_api_key: str | None = None
    resend_from_email: str = "manifest@kwanix.com"

    # Sentry — optional; set DSN to enable error tracking
    sentry_dsn: str | None = None
    sentry_traces_sample_rate: float = 0.1

    def get_allowed_origins(self) -> list[str]:
        """Parse allowed_origins into a list, accepting comma-separated or JSON array."""
        v = self.allowed_origins.strip()
        if v.startswith("["):
            return json.loads(v)
        return [origin.strip() for origin in v.split(",") if origin.strip()]

    @model_validator(mode="after")
    def _require_strong_secrets(self) -> "Settings":
        if self.environment == "production":
            if self.jwt_secret_key in _INSECURE_DEFAULTS:
                raise ValueError("JWT_SECRET_KEY must be set to a strong secret in production")
            if len(self.jwt_secret_key) < 32:
                raise ValueError("JWT_SECRET_KEY must be at least 32 characters")
        return self

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )


settings = Settings()
