from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # Database
    database_url: str = "postgresql+asyncpg://routpass:secret@localhost:5432/routpass_db"

    # Security
    jwt_secret_key: str = "change-me-in-production"
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
    public_app_url: str = "http://localhost:3000"
    allowed_origins: list[str] = ["http://localhost:3000"]

    # Arkesel low-balance alert threshold (units)
    sms_low_balance_threshold: int = 50

    # Manifest email — optional distribution address for trip departure emails
    manifest_email: str | None = None

    # Resend — optional; required only when manifest_email is set
    resend_api_key: str | None = None
    resend_from_email: str = "manifest@routepass.com"

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )


settings = Settings()
