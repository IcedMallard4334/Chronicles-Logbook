"""
Chronicles API — application entrypoint.

Run locally with:
    uvicorn app.main:app --reload

On Azure App Service, the startup command (see .deployment / README) points
Gunicorn at `app.main:app` using the uvicorn worker class.
"""
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import auth, entries, health, projects
from app.core.config import get_settings
from app.core.database import Base, engine
from app.core.errors import register_exception_handlers

# Importing the model modules registers them on Base.metadata even though
# they're not referenced directly below — required for create_all() to know
# about them.
from app.models import entry, project, user  # noqa: F401

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Sprint-1 pragmatic choice: create tables directly from the models on
    # startup rather than requiring Alembic migrations yet. Fine for a
    # skeleton; swap for `alembic upgrade head` once the schema stabilises
    # and multiple people are editing models concurrently.
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield


app = FastAPI(
    title=settings.APP_NAME,
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

register_exception_handlers(app)

app.include_router(health.router, prefix=settings.API_PREFIX)
app.include_router(auth.router, prefix=settings.API_PREFIX)
app.include_router(projects.router, prefix=settings.API_PREFIX)
app.include_router(entries.router, prefix=settings.API_PREFIX)
