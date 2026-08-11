"""Tests for app.config."""

import importlib
import os

import pytest

import app.config as config_module


def test_database_url_matches_environment():
    assert config_module.DATABASE_URL == os.environ["DATABASE_URL"]


def test_sql_debug_default_false():
    assert config_module.SQL_DEBUG is False


def test_sql_debug_true(monkeypatch):
    monkeypatch.setenv("SQL_DEBUG", "true")
    importlib.reload(config_module)
    assert config_module.SQL_DEBUG is True


def test_missing_database_url_raises(monkeypatch):
    monkeypatch.delenv("DATABASE_URL", raising=False)
    with pytest.raises(RuntimeError, match="DATABASE_URL environment variable is not set"):
        importlib.reload(config_module)
    # Restore the expected environment for any subsequent imports/tests.
    monkeypatch.setenv("DATABASE_URL", "postgresql+asyncpg://test:test@localhost/test")
    importlib.reload(config_module)
