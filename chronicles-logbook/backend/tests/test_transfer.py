"""Tests for export and import (US-2.17)."""

import csv
import io
from datetime import datetime, timezone
from uuid import uuid4

import pytest_asyncio

from app.schemas import FieldType

SCHEMA = [
    {"id": "topic", "name": "Topic", "type": FieldType.TEXT.value},
    {"id": "pages", "name": "Pages", "type": FieldType.NUMBER.value},
]


def at(year, month, day):
    return datetime(year, month, day, 9, tzinfo=timezone.utc).isoformat()


@pytest_asyncio.fixture(loop_scope="function")
async def logbook(authenticated_client):
    """A project with two entries, one of them on an earlier date."""
    project = (
        await authenticated_client.post(
            "/projects", json={"name": "Field Notes", "entry_schema": SCHEMA}
        )
    ).json()

    for topic, pages, when in [
        ("Shading", 12, at(2026, 3, 2)),
        ("Lighting", 8, at(2026, 4, 15)),
    ]:
        await authenticated_client.post(
            f"/projects/{project['id']}/entries",
            json={
                "data": {"topic": topic, "pages": pages},
                "time_spent": 45,
                "created_at": when,
            },
        )

    return project


async def test_export_requires_authentication(async_client):
    assert (await async_client.get("/export")).status_code == 401


async def test_export_contains_projects_schemas_and_entries(
    authenticated_client, logbook
):
    response = await authenticated_client.get("/export")

    assert response.status_code == 200
    body = response.json()
    assert body["format"] == "chronicles-export"
    assert body["version"] == 1
    assert len(body["projects"]) == 1

    project = body["projects"][0]
    assert project["name"] == "Field Notes"
    assert [field["id"] for field in project["entry_schema"]] == ["topic", "pages"]
    assert len(project["entries"]) == 2
    assert project["entries"][0]["data"]["topic"] == "Shading"
    assert project["entries"][0]["created_at"].startswith("2026-03-02")


async def test_export_includes_archived_projects(authenticated_client, logbook):
    """An export that quietly omitted archived work would not be a record."""
    await authenticated_client.post(f"/projects/{logbook['id']}/archive")

    body = (await authenticated_client.get("/export")).json()

    assert len(body["projects"]) == 1
    assert body["projects"][0]["archived"] is True


async def test_export_excludes_other_users(
    authenticated_client, second_authenticated_client, logbook
):
    body = (await second_authenticated_client.get("/export")).json()
    assert body["projects"] == []


async def test_round_trip_restores_a_deleted_project(
    authenticated_client, second_authenticated_client, logbook
):
    """The real restore case: export, lose the project, import it back.

    Imported into a second account here because the test database has no
    delete-project endpoint to lose it with; the mechanics are the same —
    the ids are free, so everything comes back as it was.
    """
    exported = (await authenticated_client.get("/export")).json()

    response = await second_authenticated_client.post("/import", json=exported)

    assert response.status_code == 200
    assert response.json() == {
        "projects_created": 1,
        "projects_reused": 0,
        "entries_created": 2,
        "entries_skipped": 0,
        "issues": [],
    }

    restored = (await second_authenticated_client.get("/export")).json()["projects"][0]
    assert restored["name"] == "Field Notes"
    assert [field["id"] for field in restored["entry_schema"]] == ["topic", "pages"]
    assert len(restored["entries"]) == 2
    # The original capture dates survive the round trip.
    assert restored["entries"][0]["created_at"].startswith("2026-03-02")
    assert restored["entries"][0]["time_spent"] == 45


async def test_importing_your_own_export_changes_nothing(
    authenticated_client, logbook
):
    """Re-importing a backup must not double the logbook."""
    exported = (await authenticated_client.get("/export")).json()

    summary = (await authenticated_client.post("/import", json=exported)).json()

    assert summary["projects_created"] == 0
    assert summary["projects_reused"] == 1
    assert summary["entries_created"] == 0
    assert summary["entries_skipped"] == 2

    after = (await authenticated_client.get("/export")).json()
    assert len(after["projects"]) == 1
    assert len(after["projects"][0]["entries"]) == 2


async def test_repeat_import_into_another_account_creates_fresh_copies(
    authenticated_client, second_authenticated_client, logbook
):
    """Known limitation, asserted so it stays deliberate.

    Importing into your own account is idempotent, because every project and
    entry is found by the id it carries. Importing someone else's export is
    not: those ids belong to them, so each run creates copies under new ids
    and nothing records which exported id they came from.

    Reconciling repeat cross-account imports would need provenance stored on
    the rows — a column and a migration. Documented in docs/api/transfer.md
    rather than built, since the acceptance criteria do not require it.
    """
    exported = (await authenticated_client.get("/export")).json()

    first = (await second_authenticated_client.post("/import", json=exported)).json()
    second = (await second_authenticated_client.post("/import", json=exported)).json()

    assert first["projects_created"] == 1
    assert second["projects_created"] == 1

    after = (await second_authenticated_client.get("/export")).json()
    assert len(after["projects"]) == 2


async def test_import_reports_entries_that_no_longer_fit_the_schema(
    authenticated_client, logbook
):
    """A reused project whose schema has moved on since the export.

    The entries cannot be restored into it, and saying so is the point —
    silently dropping them would lose work without telling anyone.
    """
    exported = (await authenticated_client.get("/export")).json()

    await authenticated_client.put(
        f"/projects/{logbook['id']}",
        json={
            "name": "Field Notes",
            "entry_schema": [
                {"id": "summary", "name": "Summary", "type": FieldType.TEXT.value}
            ],
        },
    )

    summary = (await authenticated_client.post("/import", json=exported)).json()

    assert summary["entries_created"] == 0
    assert summary["entries_skipped"] == 2
    assert len(summary["issues"]) == 2
    assert "Field Notes" in summary["issues"][0]


async def test_import_rejects_a_newer_format(authenticated_client):
    response = await authenticated_client.post(
        "/import",
        json={
            "format": "chronicles-export",
            "version": 99,
            "exported_at": datetime.now(timezone.utc).isoformat(),
            "projects": [],
        },
    )

    assert response.status_code == 422
    assert "newer version" in response.json()["detail"]


async def test_import_rejects_a_file_that_is_not_an_export(authenticated_client):
    response = await authenticated_client.post(
        "/import", json={"some": "unrelated json"}
    )

    assert response.status_code == 422


async def test_import_requires_authentication(async_client):
    response = await async_client.post(
        "/import",
        json={
            "format": "chronicles-export",
            "version": 1,
            "exported_at": datetime.now(timezone.utc).isoformat(),
            "projects": [],
        },
    )

    assert response.status_code == 401


async def test_import_does_not_overwrite_a_project_you_still_have(
    authenticated_client, logbook
):
    """Restoring an old backup must not clobber the live project."""
    await authenticated_client.put(
        f"/projects/{logbook['id']}",
        json={"name": "Renamed Since Export", "entry_schema": SCHEMA},
    )

    exported_before_rename = {
        "format": "chronicles-export",
        "version": 1,
        "exported_at": datetime.now(timezone.utc).isoformat(),
        "projects": [
            {
                "id": logbook["id"],
                "name": "Field Notes",
                "description": None,
                "archived": False,
                "entry_schema": SCHEMA,
                "created_at": at(2026, 1, 1),
                "entries": [],
            }
        ],
    }

    await authenticated_client.post("/import", json=exported_before_rename)

    current = (await authenticated_client.get(f"/projects/{logbook['id']}")).json()
    assert current["name"] == "Renamed Since Export"


# ── CSV ───────────────────────────────────────────────────────────────


async def test_csv_export_has_a_header_of_field_names(authenticated_client, logbook):
    response = await authenticated_client.get(f"/projects/{logbook['id']}/export.csv")

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/csv")
    assert "Field Notes.csv" in response.headers["content-disposition"]

    rows = list(csv.reader(io.StringIO(response.text)))
    assert rows[0] == ["Captured at", "Topic", "Pages", "Time spent (minutes)"]
    assert rows[1][1] == "Shading"
    assert rows[1][2] == "12"
    assert rows[1][3] == "45"


async def test_csv_export_is_scoped_to_the_owner(
    second_authenticated_client, logbook
):
    response = await second_authenticated_client.get(
        f"/projects/{logbook['id']}/export.csv"
    )
    assert response.status_code == 404


async def test_csv_export_of_an_unknown_project_is_404(authenticated_client):
    response = await authenticated_client.get(f"/projects/{uuid4()}/export.csv")
    assert response.status_code == 404
