"""
Central configuration, loaded from environment variables.

On Azure App Service, set these as "Application settings" in the portal —
they get injected as env vars automatically, so nothing here needs to change
between local dev and deployment.

Locally, copy .env.example to .env and fill it in.
"""
from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # --- App ---
    APP_NAME: str = "Chronicles API"
    ENVIRONMENT: str = "development"  # development | production
    API_PREFIX: str = "/api/v1"

    # --- Database ---
    # Postgres in prod (Azure Database for PostgreSQL via asyncpg), SQLite
    # (via aiosqlite) for quick local work or CI tests. Both need an async
    # driver since app/core/database.py uses create_async_engine. Example
    # values:
    #   postgres:  postgresql+asyncpg://user:password@host:5432/chronicles
    #   sqlite:    sqlite+aiosqlite:///./chronicles.db
    DATABASE_URL: str = "sqlite+aiosqlite:///./chronicles.db"

    # --- CORS ---
    # The deployed React frontend's URL (Azure Web App gives you something
    # like https://chronicles-frontend.azurewebsites.net). Comma-separated
    # if you need more than one (e.g. local dev + deployed).
    FRONTEND_ORIGINS: str = "http://localhost:5173,http://localhost:3000"

    # --- Auth (used once Ethan wires up US4, but declared here so the
    # skeleton's config surface doesn't need to change later) ---
    SECRET_KEY: str = "change-me-in-azure-app-settings"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24

    @property
    def cors_origins(self) -> list[str]:
        return [origin.strip() for origin in self.FRONTEND_ORIGINS.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    # lru_cache means the .env / environment is only read once per process
    return Settings()
