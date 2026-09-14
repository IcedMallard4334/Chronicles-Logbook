"""Tests for main."""

import re
from pathlib import Path

from main import _ADDED_COLUMNS

_MIGRATIONS = Path(__file__).resolve().parent.parent / "migrations"
_ADD_COLUMN = re.compile(
    r"ALTER TABLE\s+(\w+)\s+ADD COLUMN IF NOT EXISTS\s+(\w+)", re.IGNORECASE
)


async def test_health_check(async_client):
    response = await async_client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_added_columns_covers_every_migration_column():
    # Deployment never runs the migrations/ files, so _ADDED_COLUMNS is the only
    # thing that reaches an existing production database. A column present in a
    # migration but missing here works locally (create_all builds it from the
    # models) and 500s in production on every query that selects it.
    declared = {(table, column) for table, column, _ in _ADDED_COLUMNS}
    from_migrations = {
        (table.lower(), column.lower())
        for path in _MIGRATIONS.glob("*.sql")
        for table, column in _ADD_COLUMN.findall(path.read_text(encoding="utf-8"))
    }
    missing = from_migrations - declared
    assert not missing, f"migrations add columns _ADDED_COLUMNS omits: {sorted(missing)}"
