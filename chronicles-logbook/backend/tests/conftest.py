"""Shared test fixtures for the Chronicles backend."""

import os

# app.config reads DATABASE_URL at import time, so set it before importing.
os.environ["DATABASE_URL"] = "postgresql+asyncpg://test:test@localhost/test"

from unittest.mock import AsyncMock, MagicMock  # noqa: E402

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.database import get_db  # noqa: E402
from main import app  # noqa: E402


@pytest.fixture
def mock_session():
    """Return a mock async SQLAlchemy session."""
    session = MagicMock()
    session.add = MagicMock()
    session.commit = AsyncMock()
    session.refresh = AsyncMock()
    session.get = AsyncMock(return_value=None)
    return session


@pytest.fixture
def client(mock_session):
    """Return a FastAPI TestClient with a mocked database dependency."""

    async def override_get_db():
        yield mock_session

    app.dependency_overrides[get_db] = override_get_db
    yield TestClient(app)
    app.dependency_overrides.clear()
