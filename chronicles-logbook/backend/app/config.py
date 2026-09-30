import os
from pathlib import Path

from dotenv import load_dotenv

# Loads variables from a local .env file if one exists.
# On Azure, environment variables come from Application Settings instead,
# so this line has no effect there — it's purely a local-dev convenience.
#
# We pass an explicit path (backend/.env) instead of calling load_dotenv()
# bare. The no-arg form auto-detects the .env location by inspecting the
# call stack, which is unreliable inside uvicorn --reload's spawned child
# process on Windows — it silently fails to find the file there, so
# DATABASE_URL never gets set even though .env is present and correct.
load_dotenv(dotenv_path=Path(__file__).resolve().parent.parent / ".env")

try:
    DATABASE_URL = os.environ["DATABASE_URL"]
except KeyError:
    # `from None` because the underlying KeyError adds nothing the message
    # does not already say, and it keeps the startup failure readable.
    raise RuntimeError(
        "CRITICAL: DATABASE_URL environment variable is not set. "
        "Provide a valid asyncpg connection string "
        "(e.g. 'postgresql+asyncpg://user:pass@host:5432/dbname')."
    ) from None

# Off by default. Set SQL_DEBUG=true locally to see every SQL statement
# SQLAlchemy runs — useful while developing, noisy and slightly sensitive
# in production, so we never want this on by accident on Azure.
SQL_DEBUG = os.environ.get("SQL_DEBUG", "false").lower() == "true"

try:
    JWT_SECRET_KEY = os.environ["JWT_SECRET_KEY"]
except KeyError:
    raise RuntimeError(
        "CRITICAL: JWT_SECRET_KEY environment variable is not set. "
        "Generate a long random value and keep it outside source control."
    ) from None

if len(JWT_SECRET_KEY) < 32:
    raise RuntimeError("CRITICAL: JWT_SECRET_KEY must be at least 32 characters long.")

JWT_ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.environ.get("ACCESS_TOKEN_EXPIRE_MINUTES", "60"))

# Google OpenID Connect. Credentials are injected through local/Azure
# environment settings and must never be committed.
GOOGLE_CLIENT_ID = os.environ.get("GOOGLE_CLIENT_ID", "")
GOOGLE_CLIENT_SECRET = os.environ.get("GOOGLE_CLIENT_SECRET", "")
OAUTH_REDIRECT_URI = os.environ.get(
    "OAUTH_REDIRECT_URI", "http://localhost:8000/auth/google/callback"
)
FRONTEND_URL = os.environ.get("FRONTEND_URL", "http://localhost:5173").rstrip("/")
SESSION_SECRET_KEY = os.environ.get("SESSION_SECRET_KEY", JWT_SECRET_KEY)

# Off by default, everywhere. The team's shared Google OAuth client only has
# http://localhost:8000/auth/google/callback registered for whoever
# administers it, so a real Google sign-in doesn't work on every teammate's
# machine. Setting this to true in a *local* .env file (never in Azure
# Application Settings) opens POST /auth/dev-login, which mints a real
# session for any email without going through Google at all — so it must
# never be reachable anywhere but a developer's own machine.
ENABLE_DEV_LOGIN = os.environ.get("ENABLE_DEV_LOGIN", "false").lower() == "true"
COOKIE_SECURE = os.environ.get("COOKIE_SECURE", "false").lower() == "true"
DATABASE_SSL = os.environ.get("DATABASE_SSL", "false").lower() == "true"

RESEND_API_KEY = os.getenv("RESEND_API_KEY")
EMAIL_FROM = os.getenv("EMAIL_FROM")

# Derived from OAUTH_REDIRECT_URI when unset, so a deployment that only
# configures the sign-in callback doesn't send Calendar consent to localhost.
GOOGLE_CALENDAR_REDIRECT_URI = os.environ.get(
    "GOOGLE_CALENDAR_REDIRECT_URI",
    OAUTH_REDIRECT_URI.replace("/auth/google/callback", "/auth/google/calendar/callback"),
)

if COOKIE_SECURE:
    import logging as _logging

    for _name, _value in (
        ("FRONTEND_URL", FRONTEND_URL),
        ("OAUTH_REDIRECT_URI", OAUTH_REDIRECT_URI),
        ("GOOGLE_CALENDAR_REDIRECT_URI", GOOGLE_CALENDAR_REDIRECT_URI),
    ):
        if "localhost" in _value or "127.0.0.1" in _value:
            _logging.getLogger("uvicorn.error").warning(
                "%s points at localhost (%s) while COOKIE_SECURE is on; "
                "Google sign-in and Calendar connect will send users to localhost. "
                "Set it in the deployment's Application Settings.",
                _name, _value,
            )

# Gemini AI assistant. The API key is supplied through the local .env file
# or through Azure Application Settings in production.
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")
GEMINI_MODEL = os.environ.get("GEMINI_MODEL", "gemini-3.5-flash-lite")