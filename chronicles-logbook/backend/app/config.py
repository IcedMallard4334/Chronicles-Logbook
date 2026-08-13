import os

from dotenv import load_dotenv

# Loads variables from a local .env file if one exists.
# On Azure, environment variables come from Application Settings instead,
# so this line has no effect there — it's purely a local-dev convenience.
load_dotenv()

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
