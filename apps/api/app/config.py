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

    # Arkesel low-balance alert threshold (units)
    sms_low_balance_threshold: int = 50

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )


settings = Settings()
