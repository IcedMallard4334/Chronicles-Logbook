"""Tests for app.database."""

from sqlalchemy.ext.asyncio import AsyncSession

from app.database import AsyncSessionFactory, Base, async_engine, get_db


def test_base_is_declarative():
    assert Base is not None


def test_async_engine_exists():
    assert async_engine is not None


def test_async_session_factory_exists():
    assert AsyncSessionFactory is not None


async def test_get_db_yields_async_session(db_session):
    assert isinstance(db_session, AsyncSession)
