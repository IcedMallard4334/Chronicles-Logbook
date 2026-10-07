"""A development SQLite file from an older release is brought up to date at startup."""

import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

from main import add_missing_sqlite_columns


@pytest.mark.asyncio
async def test_missing_columns_are_added_once_and_existing_rows_survive():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        # How the tables looked a few releases ago: no due_time, no trigger columns.
        await conn.execute(text("CREATE TABLE tasks (id INTEGER PRIMARY KEY, title TEXT, due_date DATE)"))
        await conn.execute(text("CREATE TABLE entry_rules (id INTEGER PRIMARY KEY, name TEXT)"))
        await conn.execute(text("INSERT INTO tasks (title) VALUES ('keep me')"))
        await conn.execute(text("INSERT INTO entry_rules (name) VALUES ('old rule')"))

        added = await add_missing_sqlite_columns(conn)

        assert "tasks.due_time" in added and "entry_rules.trigger" in added
        assert (await conn.execute(text("SELECT title, due_time FROM tasks"))).one() == ("keep me", None)
        assert (await conn.execute(text("SELECT name, trigger FROM entry_rules"))).one() == ("old rule", "created")

        # Running it again changes nothing.
        assert await add_missing_sqlite_columns(conn) == []
    await engine.dispose()


@pytest.mark.asyncio
async def test_a_table_that_does_not_exist_yet_is_left_to_create_all():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        assert await add_missing_sqlite_columns(conn) == []
    await engine.dispose()
