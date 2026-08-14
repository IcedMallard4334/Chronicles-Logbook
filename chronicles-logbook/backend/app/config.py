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
    raise RuntimeError(
        "CRITICAL: DATABASE_URL environment variable is not set. "
        "Provide a valid asyncpg connection string "
        "(e.g. 'postgresql+asyncpg://user:pass@host:5432/dbname')."
    )

# Off by default. Set SQL_DEBUG=true locally to see every SQL statement
# SQLAlchemy runs — useful while developing, noisy and slightly sensitive
# in production, so we never want this on by accident on Azure.
SQL_DEBUG = os.environ.get("SQL_DEBUG", "false").lower() == "true"
