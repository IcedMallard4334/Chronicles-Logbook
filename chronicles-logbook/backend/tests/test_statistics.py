"""Tests for the statistics endpoint."""

from datetime import datetime, timezone

import pytest_asyncio

from app.schemas import FieldType

SCHEMA = [{"id": "note", "name": "Note", "type": FieldType.TEXT.value}]

STATS_SCHEMA = [
    {"id": "hours", "name": "Hours", "type": FieldType.NUMBER.value},
    {
        "id": "category",
        "name": "Category",
        "type": FieldType.DROPDOWN.value,
        "options": ["Work", "Study", "Personal"],
    },
]

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

async def test_field_statistics_sums_and_averages_numeric_fields(
    authenticated_client,
):
    response = await authenticated_client.post(
        "/projects",
        json={"name": "Statistics Test", "entry_schema": STATS_SCHEMA},
    )
    assert response.status_code == 201

    project_id = response.json()["id"]

    await authenticated_client.post(
        f"/projects/{project_id}/entries",
        json={"data": {"hours": 2, "category": "Work"}},
    )
    await authenticated_client.post(
        f"/projects/{project_id}/entries",
        json={"data": {"hours": 4, "category": "Study"}},
    )
    await authenticated_client.post(
        f"/projects/{project_id}/entries",
        json={"data": {"hours": 6, "category": "Work"}},
    )

    response = await authenticated_client.get(
        f"/statistics/projects/{project_id}/fields"
    )

    assert response.status_code == 200

    body = response.json()

    assert body["project_id"] == project_id
    assert body["schema_version"] == 1

    hours = next(field for field in body["fields"] if field["field_id"] == "hours")

    assert hours["name"] == "Hours"
    assert hours["type"] == "number"
    assert hours["count"] == 3
    assert hours["total"] == 12
    assert hours["average"] == 4
    assert hours["groups"] == []


async def test_field_statistics_include_empty_and_historical_only_fields(authenticated_client):
    project = await authenticated_client.post(
        "/projects",
        json={"name": "Empty fields", "entry_schema": [{"id": "old", "name": "Old", "type": "text"}]},
    )
    project_id = project.json()["id"]
    await authenticated_client.post(f"/projects/{project_id}/entries", json={"data": {"old": "kept"}})
    await authenticated_client.put(
        f"/projects/{project_id}",
        json={"entry_schema": [{"id": "new", "name": "New", "type": "number"}]},
    )

    response = await authenticated_client.get(f"/statistics/projects/{project_id}/fields")

    assert response.status_code == 200
    fields = {field["field_id"]: field for field in response.json()["fields"]}
    assert fields["old"]["groups"] == [{"value": "kept", "count": 1}]
    assert fields["new"]["count"] == 0
    assert fields["new"]["total"] is None


async def test_field_statistics_hide_another_users_project(
    authenticated_client, second_authenticated_client
):
    project = await authenticated_client.post(
        "/projects", json={"name": "Private statistics", "entry_schema": STATS_SCHEMA}
    )

    response = await second_authenticated_client.get(
        f"/statistics/projects/{project.json()['id']}/fields"
    )

    assert response.status_code == 404
    assert response.json()["detail"] == "Project not found"
    
async def test_field_statistics_groups_categorical_fields(authenticated_client):
    response = await authenticated_client.post(
        "/projects",
        json={"name": "Category Statistics", "entry_schema": STATS_SCHEMA},
    )
    assert response.status_code == 201

    project_id = response.json()["id"]

    for category in ["Work", "Study", "Work", "Personal", "Work", "Study"]:
        response = await authenticated_client.post(
            f"/projects/{project_id}/entries",
            json={"data": {"hours": 1, "category": category}},
        )
        assert response.status_code == 201

    response = await authenticated_client.get(
        f"/statistics/projects/{project_id}/fields"
    )

    assert response.status_code == 200

    body = response.json()

    category = next(
        field for field in body["fields"] if field["field_id"] == "category"
    )

    assert category["name"] == "Category"
    assert category["type"] == "dropdown"
    assert category["count"] == 6
    assert category["total"] is None
    assert category["average"] is None

    groups = {
        group["value"]: group["count"]
        for group in category["groups"]
    }

    assert groups == {
        "Work": 3,
        "Study": 2,
        "Personal": 1,
    }

async def test_field_statistics_respect_historical_schema_versions(
    authenticated_client,
):
    original_schema = [
        {
            "id": "hours",
            "name": "Hours",
            "type": FieldType.NUMBER.value,
        }
    ]

    response = await authenticated_client.post(
        "/projects",
        json={"name": "Versioned Statistics", "entry_schema": original_schema},
    )
    assert response.status_code == 201

    project_id = response.json()["id"]
    assert response.json()["schema_version"] == 1

    old_entry = await authenticated_client.post(
        f"/projects/{project_id}/entries",
        json={"data": {"hours": 5}},
    )
    assert old_entry.status_code == 201
    assert old_entry.json()["schema_version"] == 1

    updated_schema = [
        {
            "id": "hours",
            "name": "Hours",
            "type": FieldType.NUMBER.value,
        },
        {
            "id": "category",
            "name": "Category",
            "type": FieldType.DROPDOWN.value,
            "options": ["Work", "Study"],
        },
    ]

    response = await authenticated_client.put(
        f"/projects/{project_id}",
        json={"entry_schema": updated_schema},
    )
    assert response.status_code == 200
    assert response.json()["schema_version"] == 2

    new_entry = await authenticated_client.post(
        f"/projects/{project_id}/entries",
        json={
            "data": {
                "hours": 10,
                "category": "Work",
            }
        },
    )
    assert new_entry.status_code == 201
    assert new_entry.json()["schema_version"] == 2

    response = await authenticated_client.get(
        f"/statistics/projects/{project_id}/fields"
    )

    assert response.status_code == 200

    body = response.json()

    assert body["schema_version"] == 2

    hours = next(
        field for field in body["fields"] if field["field_id"] == "hours"
    )

    assert hours["count"] == 2
    assert hours["total"] == 15
    assert hours["average"] == 7.5

    category = next(
        field for field in body["fields"] if field["field_id"] == "category"
    )

    # old_entry predates "category" and was never touched by the schema
    # change — a save no longer migrates any entry (see
    # schema_migration.py), so old_entry's own schema_snapshot still says
    # it only ever had "hours". It correctly contributes nothing to a field
    # it never recorded, rather than being counted against a value it was
    # never actually given.
    assert category["count"] == 1
    assert category["groups"] == [
        {"value": "Work", "count": 1}
    ]

async def test_field_timeline_returns_values_in_chronological_order(
    authenticated_client,
):
    schema = [
        {
            "id": "hours",
            "name": "Hours",
            "type": FieldType.NUMBER.value,
        }
    ]

    response = await authenticated_client.post(
        "/projects",
        json={"name": "Timeline Test", "entry_schema": schema},
    )
    assert response.status_code == 201

    project_id = response.json()["id"]

    await authenticated_client.post(
        f"/projects/{project_id}/entries",
        json={
            "data": {"hours": 8},
            "created_at": at(2026, 5, 10),
        },
    )

    await authenticated_client.post(
        f"/projects/{project_id}/entries",
        json={
            "data": {"hours": 3},
            "created_at": at(2026, 5, 2),
        },
    )

    await authenticated_client.post(
        f"/projects/{project_id}/entries",
        json={
            "data": {"hours": 6},
            "created_at": at(2026, 5, 7),
        },
    )

    response = await authenticated_client.get(
        f"/statistics/projects/{project_id}/fields/hours/timeline"
    )

    assert response.status_code == 200

    body = response.json()

    assert body["project_id"] == project_id
    assert body["field_id"] == "hours"
    assert body["field_name"] == "Hours"
    assert body["field_type"] == "number"

    assert [point["value"] for point in body["points"]] == [3, 6, 8]

    assert [
        point["schema_version"] for point in body["points"]
    ] == [1, 1, 1]

    assert body["points"][0]["created_at"].startswith("2026-05-02")
    assert body["points"][1]["created_at"].startswith("2026-05-07")
    assert body["points"][2]["created_at"].startswith("2026-05-10")

async def test_field_timeline_respects_start_and_end_dates(
    authenticated_client,
):
    schema = [
        {
            "id": "hours",
            "name": "Hours",
            "type": FieldType.NUMBER.value,
        }
    ]

    response = await authenticated_client.post(
        "/projects",
        json={"name": "Timeline Range Test", "entry_schema": schema},
    )
    assert response.status_code == 201

    project_id = response.json()["id"]

    await authenticated_client.post(
        f"/projects/{project_id}/entries",
        json={
            "data": {"hours": 2},
            "created_at": at(2026, 5, 1),
        },
    )

    await authenticated_client.post(
        f"/projects/{project_id}/entries",
        json={
            "data": {"hours": 5},
            "created_at": at(2026, 5, 5),
        },
    )

    await authenticated_client.post(
        f"/projects/{project_id}/entries",
        json={
            "data": {"hours": 8},
            "created_at": at(2026, 5, 10),
        },
    )

    response = await authenticated_client.get(
        f"/statistics/projects/{project_id}/fields/hours/timeline",
        params={
            "start": at(2026, 5, 4),
            "end": at(2026, 5, 9),
        },
    )

    assert response.status_code == 200

    body = response.json()

    assert body["start"].startswith("2026-05-04")
    assert body["end"].startswith("2026-05-09")

    assert [point["value"] for point in body["points"]] == [5]
    assert body["points"][0]["created_at"].startswith("2026-05-05")


async def test_field_timeline_rejects_a_reversed_date_range(authenticated_client):
    project = await authenticated_client.post(
        "/projects",
        json={"name": "Range validation", "entry_schema": [{"id": "hours", "name": "Hours", "type": "number"}]},
    )

    response = await authenticated_client.get(
        f"/statistics/projects/{project.json()['id']}/fields/hours/timeline",
        params={"start": at(2026, 5, 10), "end": at(2026, 5, 1)},
    )

    assert response.status_code == 422
    assert response.json()["detail"] == "Start date must be on or before end date."


async def test_field_timeline_allows_a_retired_field_with_an_empty_range(authenticated_client):
    project = await authenticated_client.post(
        "/projects",
        json={"name": "Retired timeline", "entry_schema": [{"id": "weight", "name": "Weight", "type": "number"}]},
    )
    project_id = project.json()["id"]
    await authenticated_client.post(
        f"/projects/{project_id}/entries", json={"data": {"weight": 70}, "created_at": at(2026, 1, 1)}
    )
    await authenticated_client.put(f"/projects/{project_id}", json={"entry_schema": []})

    response = await authenticated_client.get(
        f"/statistics/projects/{project_id}/fields/weight/timeline",
        params={"start": at(2026, 6, 1), "end": at(2026, 6, 30)},
    )

    assert response.status_code == 200
    assert response.json()["field_name"] == "Weight"
    assert response.json()["points"] == []

async def test_field_timeline_respects_historical_schema_versions(
    authenticated_client,
):
    schema_v1 = [
        {
            "id": "hours",
            "name": "Hours",
            "type": FieldType.NUMBER.value,
        }
    ]

    response = await authenticated_client.post(
        "/projects",
        json={"name": "Versioned Timeline Test", "entry_schema": schema_v1},
    )
    assert response.status_code == 201

    project_id = response.json()["id"]

    # Entry created using schema version 1.
    response = await authenticated_client.post(
        f"/projects/{project_id}/entries",
        json={
            "data": {"hours": 4},
            "created_at": at(2026, 5, 1),
        },
    )
    assert response.status_code == 201

    # Change the project schema to version 2.
    schema_v2 = [
        {
            "id": "hours",
            "name": "Hours",
            "type": FieldType.NUMBER.value,
        },
        {
            "id": "category",
            "name": "Category",
            "type": FieldType.TEXT.value,
        },
    ]

    response = await authenticated_client.put(
        f"/projects/{project_id}",
        json={"entry_schema": schema_v2},
    )
    assert response.status_code == 200

    # Entry created using schema version 2.
    response = await authenticated_client.post(
        f"/projects/{project_id}/entries",
        json={
            "data": {
                "hours": 8,
                "category": "Work",
            },
            "created_at": at(2026, 5, 5),
        },
    )
    assert response.status_code == 201

    response = await authenticated_client.get(
        f"/statistics/projects/{project_id}/fields/hours/timeline"
    )

    assert response.status_code == 200

    body = response.json()

    assert [point["value"] for point in body["points"]] == [4, 8]

    # The first point stays pinned at schema_version 1: the schema change
    # that added "category" never touched the entry that predates it (see
    # schema_migration.py — a save migrates no entry), so its own
    # schema_snapshot, and the version reported here, are exactly what they
    # were when it was written. Its "hours" value is unaffected either way,
    # since "hours" exists unchanged in both versions.
    assert [
        point["schema_version"] for point in body["points"]
    ] == [1, 2]

    assert body["points"][0]["created_at"].startswith("2026-05-01")
    assert body["points"][1]["created_at"].startswith("2026-05-05")

async def test_field_timeline_returns_404_for_unknown_field(
    authenticated_client,
):
    schema = [
        {
            "id": "hours",
            "name": "Hours",
            "type": FieldType.NUMBER.value,
        }
    ]

    response = await authenticated_client.post(
        "/projects",
        json={"name": "Missing Field Timeline Test", "entry_schema": schema},
    )
    assert response.status_code == 201

    project_id = response.json()["id"]

    response = await authenticated_client.get(
        f"/statistics/projects/{project_id}/fields/not-a-field/timeline"
    )

    assert response.status_code == 404
    assert response.json()["detail"] == "Field not found"

async def test_field_timeline_cannot_access_another_users_project(
    authenticated_client,
    second_authenticated_client,
):
    schema = [
        {
            "id": "hours",
            "name": "Hours",
            "type": FieldType.NUMBER.value,
        }
    ]

    # Create a project for the first user.
    response = await authenticated_client.post(
        "/projects",
        json={"name": "Private Timeline", "entry_schema": schema},
    )
    assert response.status_code == 201

    project_id = response.json()["id"]

    # The second user must not be able to access the first user's project.
    response = await second_authenticated_client.get(
        f"/statistics/projects/{project_id}/fields/hours/timeline"
    )

    assert response.status_code == 404
    assert response.json()["detail"] == "Project not found"


# ── Streaks (basic tier: "where a run of days has been kept up") ─────────────
#
# Dates are built relative to today so the "is the run still alive" rule can be
# tested honestly rather than against a fixed calendar that will drift.

from datetime import date, timedelta  # noqa: E402

from app.routers.statistics import _streaks  # noqa: E402


def _days_ago(n: int) -> str:
    # Keeps the current time of day rather than pinning one: "today at 09:00"
    # is in the future for anyone running the suite before 09:00 UTC, and the
    # API rightly refuses a future-dated entry.
    return (datetime.now(timezone.utc) - timedelta(days=n)).isoformat()


def test_streaks_of_an_empty_logbook_are_zero():
    assert _streaks(set(), date(2026, 9, 15)) == (0, 0)


def test_a_single_day_is_a_streak_of_one():
    today = date(2026, 9, 15)
    assert _streaks({today}, today) == (1, 1)


def test_consecutive_days_count_as_one_run():
    today = date(2026, 9, 15)
    days = {today - timedelta(days=i) for i in range(4)}
    assert _streaks(days, today) == (4, 4)


def test_a_gap_ends_the_run_and_the_longest_survives_it():
    today = date(2026, 9, 15)
    # Five days, a gap, then two days ending today.
    earlier = {today - timedelta(days=i) for i in range(4, 9)}
    recent = {today, today - timedelta(days=1)}
    assert _streaks(earlier | recent, today) == (2, 5)


def test_a_run_that_reached_yesterday_is_still_alive():
    # Not having written *yet* today is not the same as having stopped.
    today = date(2026, 9, 15)
    days = {today - timedelta(days=i) for i in range(1, 4)}
    assert _streaks(days, today) == (3, 3)


def test_a_run_that_ended_two_days_ago_has_been_broken():
    today = date(2026, 9, 15)
    days = {today - timedelta(days=i) for i in range(2, 6)}
    assert _streaks(days, today) == (0, 4)


def test_input_order_does_not_matter():
    today = date(2026, 9, 15)
    days = [today - timedelta(days=i) for i in (2, 0, 1)]
    assert _streaks(set(days), today) == (3, 3)


async def test_statistics_report_the_current_and_longest_streak(
    authenticated_client, project
):
    project_id = project["id"]
    for n in (0, 1, 2):
        await _log(authenticated_client, project_id, f"day -{n}", when=_days_ago(n))
    # An older, longer run that has since been broken.
    for n in (10, 11, 12, 13):
        await _log(authenticated_client, project_id, f"day -{n}", when=_days_ago(n))

    body = (await authenticated_client.get("/statistics")).json()

    assert body["totals"]["current_streak"] == 3
    assert body["totals"]["longest_streak"] == 4
    assert body["projects"][0]["current_streak"] == 3
    assert body["projects"][0]["longest_streak"] == 4


async def test_the_overall_streak_joins_days_across_projects(authenticated_client):
    # Writing in project A yesterday and project B today is two days kept up,
    # even though neither project alone has a run longer than one.
    a = (await authenticated_client.post(
        "/projects", json={"name": "A", "entry_schema": SCHEMA}
    )).json()["id"]
    b = (await authenticated_client.post(
        "/projects", json={"name": "B", "entry_schema": SCHEMA}
    )).json()["id"]
    await _log(authenticated_client, a, "yesterday", when=_days_ago(1))
    await _log(authenticated_client, b, "today", when=_days_ago(0))

    body = (await authenticated_client.get("/statistics")).json()

    assert body["totals"]["current_streak"] == 2
    by_name = {p["name"]: p for p in body["projects"]}
    # Each project alone is a run of one — A's is still alive because
    # yesterday counts as kept up — but only the logbook as a whole reaches 2.
    assert by_name["A"]["current_streak"] == 1
    assert by_name["B"]["current_streak"] == 1


async def test_a_project_with_no_entries_has_no_streak(authenticated_client, project):
    body = (await authenticated_client.get("/statistics")).json()

    assert body["projects"][0]["current_streak"] == 0
    assert body["projects"][0]["longest_streak"] == 0
    assert body["totals"]["current_streak"] == 0
