"""Tests for the statistics endpoint."""

from datetime import datetime, timezone

import pytest_asyncio

from app.schemas import FieldType

SCHEMA = [{"id": "note", "name": "Note", "type": FieldType.TEXT.value}]


def at(year: int, month: int, day: int, hour: int = 9) -> str:
    return datetime(year, month, day, hour, tzinfo=timezone.utc).isoformat()


@pytest_asyncio.fixture(loop_scope="function")
async def project(authenticated_client):
    response = await authenticated_client.post(
        "/projects",
        json={"name": "Field Notes", "entry_schema": SCHEMA},
    )
    return response.json()


async def _log(client, project_id, note, when=None, minutes=None):
    payload = {"data": {"note": note}}
    if when is not None:
        payload["created_at"] = when
    if minutes is not None:
        payload["time_spent"] = minutes
    return await client.post(f"/projects/{project_id}/entries", json=payload)


async def test_statistics_requires_authentication(async_client):
    response = await async_client.get("/statistics")
    assert response.status_code == 401


async def test_statistics_for_an_empty_logbook(authenticated_client):
    response = await authenticated_client.get("/statistics")

    assert response.status_code == 200
    totals = response.json()["totals"]
    assert totals["projects"] == 0
    assert totals["entries"] == 0
    assert totals["time_spent"] == 0
    assert totals["active_days"] == 0
    assert totals["first_entry_at"] is None
    assert totals["last_entry_at"] is None
    assert response.json()["projects"] == []


async def test_project_with_no_entries_reports_zeros(authenticated_client, project):
    """The outer join must still list a project that has never been used."""
    response = await authenticated_client.get("/statistics")

    body = response.json()
    assert body["totals"]["projects"] == 1
    assert len(body["projects"]) == 1

    only = body["projects"][0]
    assert only["project_id"] == project["id"]
    assert only["entries"] == 0
    assert only["time_spent"] == 0
    assert only["active_days"] == 0
    assert only["first_entry_at"] is None


async def test_counts_entries_and_sums_time_spent(authenticated_client, project):
    project_id = project["id"]
    await _log(authenticated_client, project_id, "one", minutes=30)
    await _log(authenticated_client, project_id, "two", minutes=45)
    await _log(authenticated_client, project_id, "three")  # no duration recorded

    body = (await authenticated_client.get("/statistics")).json()

    assert body["totals"]["entries"] == 3
    assert body["totals"]["time_spent"] == 75
    assert body["projects"][0]["entries"] == 3
    assert body["projects"][0]["time_spent"] == 75


async def test_active_days_counts_days_not_entries(authenticated_client, project):
    project_id = project["id"]
    await _log(authenticated_client, project_id, "morning", when=at(2026, 3, 2, 9))
    await _log(authenticated_client, project_id, "afternoon", when=at(2026, 3, 2, 15))
    await _log(authenticated_client, project_id, "next day", when=at(2026, 3, 3))

    body = (await authenticated_client.get("/statistics")).json()

    assert body["totals"]["entries"] == 3
    assert body["totals"]["active_days"] == 2


async def test_overall_active_days_does_not_double_count_a_shared_day(
    authenticated_client, project
):
    """A day worked across two projects is one active day overall."""
    second = await authenticated_client.post(
        "/projects", json={"name": "Thesis", "entry_schema": SCHEMA}
    )
    second_id = second.json()["id"]

    await _log(authenticated_client, project["id"], "a", when=at(2026, 4, 1))
    await _log(authenticated_client, second_id, "b", when=at(2026, 4, 1))

    body = (await authenticated_client.get("/statistics")).json()

    # One day overall, but each project counts it as its own active day.
    assert body["totals"]["active_days"] == 1
    assert all(project_row["active_days"] == 1 for project_row in body["projects"])


async def test_reports_first_and_last_entry_times(authenticated_client, project):
    project_id = project["id"]
    await _log(authenticated_client, project_id, "middle", when=at(2026, 5, 10))
    await _log(authenticated_client, project_id, "earliest", when=at(2026, 1, 4))
    await _log(authenticated_client, project_id, "latest", when=at(2026, 8, 22))

    totals = (await authenticated_client.get("/statistics")).json()["totals"]

    assert totals["first_entry_at"].startswith("2026-01-04")
    assert totals["last_entry_at"].startswith("2026-08-22")


async def test_separates_active_and_archived_project_counts(
    authenticated_client, project
):
    archived = await authenticated_client.post(
        "/projects", json={"name": "Finished", "entry_schema": SCHEMA}
    )
    await authenticated_client.post(f"/projects/{archived.json()['id']}/archive")

    totals = (await authenticated_client.get("/statistics")).json()["totals"]

    assert totals["projects"] == 2
    assert totals["active_projects"] == 1
    assert totals["archived_projects"] == 1


async def test_statistics_exclude_other_users_data(
    authenticated_client, second_authenticated_client, project
):
    await _log(authenticated_client, project["id"], "mine", minutes=60)

    body = (await second_authenticated_client.get("/statistics")).json()

    assert body["totals"]["projects"] == 0
    assert body["totals"]["entries"] == 0
    assert body["totals"]["time_spent"] == 0
    assert body["projects"] == []
