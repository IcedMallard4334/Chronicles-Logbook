"""Shared test fixtures for the Chronicles backend."""

import os
import tempfile
from pathlib import Path

# Patch create_async_engine before any app import so the PostgreSQL SSL args are
# stripped for the SQLite test database.
import sqlalchemy.ext.asyncio as sa_asyncio

_original_create_async_engine = sa_asyncio.create_async_engine


def _patched_create_async_engine(url, **kwargs):
    kwargs.pop("connect_args", None)
    return _original_create_async_engine(url, **kwargs)


sa_asyncio.create_async_engine = _patched_create_async_engine

# app.config reads DATABASE_URL at import time, so set it before importing.
_db_file = Path(tempfile.mktemp(suffix=".db")).as_posix()
os.environ["DATABASE_URL"] = f"sqlite+aiosqlite:///{_db_file}"
os.environ["JWT_SECRET_KEY"] = "test-only-secret-key-that-is-long-enough"
os.environ["SESSION_SECRET_KEY"] = "test-session-secret-key-that-is-long-enough"
os.environ["GOOGLE_CLIENT_ID"] = "test-google-client-id"
os.environ["GOOGLE_CLIENT_SECRET"] = "test-google-client-secret"
os.environ["FRONTEND_URL"] = "http://frontend.test"

import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine

from app.database import Base, get_db
from main import app
from app.models import User
from app.security import create_access_token

@pytest_asyncio.fixture(scope="session", loop_scope="session")
async def test_engine():
    engine = create_async_engine(os.environ["DATABASE_URL"])
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield engine
    await engine.dispose()
    if os.path.exists(_db_file):
        os.remove(_db_file)


@pytest_asyncio.fixture(loop_scope="function")
async def db_session(test_engine):
    # Use a nested transaction so each test rolls back its changes even if the
    # application code commits.
    async with test_engine.connect() as conn:
        await conn.begin()
        await conn.begin_nested()
        session = AsyncSession(bind=conn, expire_on_commit=False)
        yield session
        await session.close()
        await conn.rollback()

@pytest_asyncio.fixture
async def test_user(db_session):
    user = User(
        google_sub="test-google-user",
        full_name="Test User",
        email="test@example.com",
        avatar_url=None,
    )

    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)

    return user

@pytest_asyncio.fixture(loop_scope="function")
async def async_client(db_session):
    """Return an unauthenticated httpx AsyncClient wired to the test database."""

    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db

    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as client:
        yield client

    app.dependency_overrides.clear()


@pytest_asyncio.fixture(loop_scope="function")
async def authenticated_client(db_session, test_user):
    """Return an authenticated httpx AsyncClient wired to the test database."""

    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db

    token = create_access_token(test_user.id)

    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
        headers={"Authorization": f"Bearer {token}"},
    ) as client:
        yield client

    app.dependency_overrides.clear()
