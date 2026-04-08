from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

_INSECURE_DEFAULTS = {"change-me-in-production", "", "secret"}


class Settings(BaseSettings):
    # Database
    database_url: str = "postgresql+asyncpg://routpass:secret@localhost:5432/routpass_db"

    # Security
    jwt_secret_key: str
    jwt_algorithm: str = "HS256"
    jwt_access_token_expire_minutes: int = 60
    jwt_refresh_token_expire_days: int = 7

    # Arkesel SMS
    arkesel_api_key: str = ""
    arkesel_sender_id: str = "RoutePass"

    # Payments
    paystack_secret_key: str = ""
    paystack_public_key: str = ""
    flutterwave_secret_key: str = ""

    # App
    environment: str = "development"
    debug: bool = True
    public_app_url: str = "http://localhost:3000"  # Next.js frontend (for post-payment redirects)
    api_public_url: str = "http://localhost:8000"  # FastAPI backend (for Paystack callback URL)
    allowed_origins: list[str] = ["http://localhost:3000"]

    # Arkesel low-balance alert threshold (units)
    sms_low_balance_threshold: int = 50

    # Manifest email — optional distribution address for trip departure emails
    manifest_email: str | None = None

    # Resend — optional; required only when manifest_email is set
    resend_api_key: str | None = None
    resend_from_email: str = "manifest@routepass.com"

    # Sentry — optional; set DSN to enable error tracking
    sentry_dsn: str | None = None
    sentry_traces_sample_rate: float = 0.1

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
