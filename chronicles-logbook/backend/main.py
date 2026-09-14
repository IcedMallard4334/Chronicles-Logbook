import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from starlette.middleware.sessions import SessionMiddleware

from app.config import COOKIE_SECURE, SESSION_SECRET_KEY
from app.database import Base, async_engine
from app.routers import (
    activities,
    ai,
    auth,
    calendar,
    entries,
    projects,
    saved_filters,
    statistics,
    tasks,
    transfer,
)

_DEFAULT_ORIGINS = [
    "http://localhost:5173",
    "https://localhost:5173",
]

# Columns added to an existing table after it was first created. ``create_all``
# below adds missing *tables* but never missing *columns*, so without this a
# database created before US-2.15 keeps an ``entries`` table with no ``todo``
# and every entry query fails on the deployed API while working locally.
# Still not a substitute for Alembic — it only ever adds, never changes or
# removes — but it keeps the two in step until a migration tool arrives.
_ADDED_COLUMNS = (
    ("entries", "todo", "BOOLEAN NOT NULL DEFAULT false"),
    ("entries", "due_date", "DATE"),
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Dev-convenience: creates tables directly from the models if they don't
    # exist yet. Fine for Sprint 1. Once the schema starts changing between
    # sprints, replace this with a real migration tool (Alembic) so existing
    # data isn't at risk of being silently out of sync with the models.
    async with async_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        # Only Postgres understands the conditional form. SQLite is used for
        # fresh test databases, which ``create_all`` already builds correctly.
        if async_engine.dialect.name == "postgresql":
            for table, column, definition in _ADDED_COLUMNS:
                await conn.execute(
                    text(f"ALTER TABLE {table} ADD COLUMN IF NOT EXISTS {column} {definition}")
                )
    yield


app = FastAPI(title="Chronicles API", lifespan=lifespan)

app.add_middleware(
    SessionMiddleware,
    secret_key=SESSION_SECRET_KEY,
    same_site="lax",
    https_only=COOKIE_SECURE,
)

_cors_origins = [
    origin.strip()
    for origin in os.environ.get("CORS_ORIGINS", "").split(",")
    if origin.strip()
] or _DEFAULT_ORIGINS

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(projects.router)
app.include_router(entries.router)
app.include_router(saved_filters.router)
app.include_router(statistics.router)
app.include_router(transfer.router)
app.include_router(auth.router)
app.include_router(tasks.router)
app.include_router(calendar.router)
app.include_router(activities.router)
app.include_router(ai.router)


@app.get("/health")
async def health_check():
    return {"status": "ok"}
