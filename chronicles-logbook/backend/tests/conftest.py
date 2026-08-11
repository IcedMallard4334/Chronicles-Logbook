"""Shared test fixtures for the Chronicles backend."""

import os

# app.config reads DATABASE_URL at import time, so set it before importing.
os.environ["DATABASE_URL"] = "postgresql+asyncpg://test:test@localhost/test"

import uuid
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi.testclient import TestClient

from app.database import get_db
from main import app


@pytest.fixture
def mock_session():
    """Return a mock async SQLAlchemy session."""
    session = MagicMock()
    session._added = []

    def capture_add(obj):
        session._added.append(obj)

    session.add = MagicMock(side_effect=capture_add)

    async def fake_refresh(obj):
        # Simulate the database populating default/generated columns.
        if getattr(obj, "id", None) is None:
            obj.id = uuid.uuid4()
        if getattr(obj, "created_at", None) is None:
            obj.created_at = datetime.now(timezone.utc)
        if getattr(obj, "updated_at", None) is None:
            obj.updated_at = datetime.now(timezone.utc)
        if getattr(obj, "entry_schema", None) is None:
            obj.entry_schema = []

    session.refresh = AsyncMock(side_effect=fake_refresh)
    session.commit = AsyncMock()
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
