"""Tests for entry endpoints."""

import asyncio
from datetime import datetime, timedelta, timezone
from uuid import UUID, uuid4

import pytest_asyncio

from app.schemas import FieldType


@pytest_asyncio.fixture(loop_scope="function")
async def project_with_schema(authenticated_client):
    schema = [
        {"id": "field-1", "name": "Hours", "type": FieldType.NUMBER.value},
        {"id": "field-2", "name": "Notes", "type": FieldType.TEXT.value},
        {
            "id": "field-3",
            "name": "Status",
            "type": FieldType.DROPDOWN.value,
            "options": ["Open", "Closed"],
        },
    ]
    response = await authenticated_client.post(
        "/projects",
        json={"name": "Logbook Project", "entry_schema": schema},
    )
    return response.json()


async def test_create_entry_valid(authenticated_client, project_with_schema):
    project_id = project_with_schema["id"]
    response = await authenticated_client.post(
        f"/projects/{project_id}/entries",
        json={"data": {"field-1": 5, "field-2": "Worked on UI", "field-3": "Open"}},
    )
    assert response.status_code == 201
    data = response.json()
    assert data["data"]["field-1"] == 5
    assert data["data"]["field-2"] == "Worked on UI"
    assert data["project_id"] == project_id
    assert data["time_spent"] is None


async def test_create_entry_with_time_spent(authenticated_client, project_with_schema):
    project_id = project_with_schema["id"]
    response = await authenticated_client.post(
        f"/projects/{project_id}/entries",
        json={
            "data": {"field-1": 5, "field-2": "Worked on UI", "field-3": "Open"},
            "time_spent": 90,
        },
    )
    assert response.status_code == 201
    data = response.json()
    assert data["time_spent"] == 90


async def test_create_entry_rejects_negative_time_spent(
    authenticated_client, project_with_schema
):
    project_id = project_with_schema["id"]
    response = await authenticated_client.post(
        f"/projects/{project_id}/entries",
        json={
            "data": {"field-1": 5, "field-2": "Worked on UI", "field-3": "Open"},
            "time_spent": -10,
        },
    )
    assert response.status_code == 422


async def test_create_entry_missing_field(authenticated_client, project_with_schema):
    project_id = project_with_schema["id"]
    response = await authenticated_client.post(
        f"/projects/{project_id}/entries",
        json={"data": {"field-1": 5}},
    )
    assert response.status_code == 422


async def test_create_entry_wrong_type(authenticated_client, project_with_schema):
    project_id = project_with_schema["id"]
    response = await authenticated_client.post(
        f"/projects/{project_id}/entries",
        json={
            "data": {
                "field-1": "not a number",
                "field-2": "notes",
                "field-3": "Open",
            }
        },
    )
    assert response.status_code == 422


async def test_create_entry_invalid_dropdown(authenticated_client, project_with_schema):
    project_id = project_with_schema["id"]
    response = await authenticated_client.post(
        f"/projects/{project_id}/entries",
        json={
            "data": {
                "field-1": 5,
                "field-2": "notes",
                "field-3": "Invalid",
            }
        },
    )
    assert response.status_code == 422


async def test_create_entry_blocked_when_archived(authenticated_client, project_with_schema):
    project_id = project_with_schema["id"]
    await authenticated_client.post(f"/projects/{project_id}/archive")

    response = await authenticated_client.post(
        f"/projects/{project_id}/entries",
        json={"data": {"field-1": 5, "field-2": "notes", "field-3": "Open"}},
    )
    assert response.status_code == 409
    assert response.json()["detail"] == "Cannot add entries to an archived project."


async def test_list_entries(authenticated_client, project_with_schema):
    project_id = project_with_schema["id"]
    await authenticated_client.post(
        f"/projects/{project_id}/entries",
        json={"data": {"field-1": 1, "field-2": "first", "field-3": "Open"}},
    )
    await authenticated_client.post(
        f"/projects/{project_id}/entries",
        json={"data": {"field-1": 2, "field-2": "second", "field-3": "Closed"}},
    )

    response = await authenticated_client.get(f"/projects/{project_id}/entries")
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 2


async def test_search_entries_by_keyword(authenticated_client, project_with_schema):
    project_id = project_with_schema["id"]
    await authenticated_client.post(
        f"/projects/{project_id}/entries",
        json={"data": {"field-1": 1, "field-2": "first task", "field-3": "Open"}},
    )
    await authenticated_client.post(
        f"/projects/{project_id}/entries",
        json={"data": {"field-1": 2, "field-2": "second task", "field-3": "Closed"}},
    )

    response = await authenticated_client.get("/entries?q=first")
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert "first" in data[0]["data"]["field-2"].lower()


async def test_search_entries_includes_time_spent(
    authenticated_client, project_with_schema
):
    project_id = project_with_schema["id"]
    await authenticated_client.post(
        f"/projects/{project_id}/entries",
        json={
            "data": {"field-1": 1, "field-2": "timed entry", "field-3": "Open"},
            "time_spent": 75,
        },
    )

    response = await authenticated_client.get("/entries?q=timed")
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert data[0]["time_spent"] == 75


async def test_search_entries_includes_title_snapshot_and_author(
    authenticated_client, project_with_schema
):
    """Global search builds its own response row rather than returning the
    ORM entry directly — easy for a field to be added to the response model
    but never actually copied into that row. Guards against exactly that."""
    project_id = project_with_schema["id"]
    created = await authenticated_client.post(
        f"/projects/{project_id}/entries",
        json={
            "title": "Named entry",
            "data": {"field-1": 1, "field-2": "labelled task", "field-3": "Open"},
        },
    )
    assert created.status_code == 201

    response = await authenticated_client.get("/entries?q=labelled")
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert data[0]["title"] == "Named entry"
    assert data[0]["schema_snapshot"] == project_with_schema["entry_schema"]
    assert data[0]["created_by"] is not None
    assert data[0]["created_by_name"]


async def test_search_entries_filters_by_project(authenticated_client, project_with_schema):
    second = await authenticated_client.post(
        "/projects",
        json={"name": "Second Project", "entry_schema": []},
    )
    second_id = second.json()["id"]

    first_id = project_with_schema["id"]
    await authenticated_client.post(
        f"/projects/{first_id}/entries",
        json={"data": {"field-1": 1, "field-2": "shared note", "field-3": "Open"}},
    )
    await authenticated_client.post(
        f"/projects/{second_id}/entries",
        json={"data": {}},
    )

    response = await authenticated_client.get(f"/entries?project_id={first_id}")
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert data[0]["project_id"] == str(first_id)


async def test_search_entries_combined(authenticated_client, project_with_schema):
    project_id = project_with_schema["id"]
    await authenticated_client.post(
        f"/projects/{project_id}/entries",
        json={"data": {"field-1": 1, "field-2": "alpha note", "field-3": "Open"}},
    )
    await authenticated_client.post(
        f"/projects/{project_id}/entries",
        json={"data": {"field-1": 2, "field-2": "beta note", "field-3": "Closed"}},
    )

    response = await authenticated_client.get(f"/entries?q=alpha&project_id={project_id}")
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert data[0]["data"]["field-2"] == "alpha note"


async def test_search_entries_pagination(authenticated_client, project_with_schema):
    project_id = project_with_schema["id"]

    for i in range(5):
        await authenticated_client.post(
            f"/projects/{project_id}/entries",
            json={
                "data": {
                    "field-1": i,
                    "field-2": f"entry {i}",
                    "field-3": "Open",
                }
            },
        )

    first_page = await authenticated_client.get(
        "/entries?page=1&page_size=2"
    )
    assert first_page.status_code == 200

    first_data = first_page.json()
    assert len(first_data) == 2

    second_page = await authenticated_client.get(
        "/entries?page=2&page_size=2"
    )
    assert second_page.status_code == 200

    second_data = second_page.json()
    assert len(second_data) == 2

    first_ids = {entry["id"] for entry in first_data}
    second_ids = {entry["id"] for entry in second_data}

    assert first_ids.isdisjoint(second_ids)


async def test_search_entries_rejects_invalid_pagination(
    authenticated_client,
):
    response = await authenticated_client.get("/entries?page=0")
    assert response.status_code == 422

    response = await authenticated_client.get("/entries?page_size=0")
    assert response.status_code == 422

    response = await authenticated_client.get("/entries?page_size=101")
    assert response.status_code == 422


async def test_search_entries_returns_newest_first(
    authenticated_client,
    project_with_schema,
):
    project_id = project_with_schema["id"]

    first = await authenticated_client.post(
        f"/projects/{project_id}/entries",
        json={
            "data": {
                "field-1": 1,
                "field-2": "older entry",
                "field-3": "Open",
            }
        },
    )

    # created_at comes from datetime.now() in Python, and the sort tie-breaks on
    # a random UUID. Two inserts landing in the same clock tick therefore order
    # arbitrarily, which made this assertion a coin flip under a loaded suite.
    await asyncio.sleep(0.01)

    second = await authenticated_client.post(
        f"/projects/{project_id}/entries",
        json={
            "data": {
                "field-1": 2,
                "field-2": "newer entry",
                "field-3": "Closed",
            }
        },
    )

    assert first.status_code == 201
    assert second.status_code == 201

    response = await authenticated_client.get(
        f"/entries?project_id={project_id}&page=1&page_size=20"
    )

    assert response.status_code == 200

    data = response.json()

    assert data[0]["id"] == second.json()["id"]
    assert data[1]["id"] == first.json()["id"]


async def test_search_entries_matches_keyword_beyond_default_page_size(
    authenticated_client, project_with_schema
):
    """Regression test for the pagination-before-filter bug.

    Keyword filtering must run against the full result set, not just the
    rows on the requested page. Create more entries than the default
    page_size (20) so that a matching entry sits outside the first page
    when ordered newest-first, and confirm it's still found.
    """
    project_id = project_with_schema["id"]

    # Create 25 "noise" entries first (these end up newest, so the match
    # created next will be pushed onto page 2 if filtering ran before
    # pagination).
    for i in range(25):
        await authenticated_client.post(
            f"/projects/{project_id}/entries",
            json={
                "data": {
                    "field-1": i,
                    "field-2": f"filler entry {i}",
                    "field-3": "Open",
                }
            },
        )

    # Oldest entry contains the keyword we'll search for.
    await authenticated_client.post(
        f"/projects/{project_id}/entries",
        json={
            "data": {
                "field-1": 999,
                "field-2": "needle in a haystack",
                "field-3": "Closed",
            }
        },
    )

    response = await authenticated_client.get("/entries?q=needle")
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert "needle" in data[0]["data"]["field-2"].lower()


async def test_search_entries_pagination_applies_after_keyword_filter(
    authenticated_client, project_with_schema
):
    """Pagination should slice the filtered result set, not the raw one."""
    project_id = project_with_schema["id"]

    for i in range(5):
        await authenticated_client.post(
            f"/projects/{project_id}/entries",
            json={
                "data": {
                    "field-1": i,
                    "field-2": f"match entry {i}",
                    "field-3": "Open",
                }
            },
        )
    await authenticated_client.post(
        f"/projects/{project_id}/entries",
        json={"data": {"field-1": 0, "field-2": "no keyword here", "field-3": "Open"}},
    )

    response = await authenticated_client.get("/entries?q=match&page=1&page_size=2")
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 2
    for entry in data:
        assert "match" in entry["data"]["field-2"].lower()

    second_page = await authenticated_client.get("/entries?q=match&page=2&page_size=2")
    assert second_page.status_code == 200
    second_data = second_page.json()
    assert len(second_data) == 2
    for entry in second_data:
        assert "match" in entry["data"]["field-2"].lower()

    third_page = await authenticated_client.get("/entries?q=match&page=3&page_size=2")
    assert third_page.status_code == 200
    third_data = third_page.json()
    assert len(third_data) == 1
    assert "match" in third_data[0]["data"]["field-2"].lower()

async def test_search_entries_filters_by_start_date(
    authenticated_client, project_with_schema
):
    project_id = project_with_schema["id"]

    old = await authenticated_client.post(
        f"/projects/{project_id}/entries",
        json={
            "data": VALID_DATA,
            "created_at": datetime(
                2026, 1, 10, 9, 0, tzinfo=timezone.utc
            ).isoformat(),
        },
    )

    recent = await authenticated_client.post(
        f"/projects/{project_id}/entries",
        json={
            "data": VALID_DATA,
            "created_at": datetime(
                2026, 6, 10, 9, 0, tzinfo=timezone.utc
            ).isoformat(),
        },
    )

    response = await authenticated_client.get(
        "/entries?start=2026-05-01T00:00:00%2B00:00"
    )

    assert response.status_code == 200

    ids = [entry["id"] for entry in response.json()]

    assert recent.json()["id"] in ids
    assert old.json()["id"] not in ids


async def test_search_entries_filters_by_end_date(
    authenticated_client, project_with_schema
):
    project_id = project_with_schema["id"]

    old = await authenticated_client.post(
        f"/projects/{project_id}/entries",
        json={
            "data": VALID_DATA,
            "created_at": datetime(
                2026, 1, 10, 9, 0, tzinfo=timezone.utc
            ).isoformat(),
        },
    )

    recent = await authenticated_client.post(
        f"/projects/{project_id}/entries",
        json={
            "data": VALID_DATA,
            "created_at": datetime(
                2026, 6, 10, 9, 0, tzinfo=timezone.utc
            ).isoformat(),
        },
    )

    response = await authenticated_client.get(
        "/entries?end=2026-02-01T23:59:59%2B00:00"
    )

    assert response.status_code == 200

    ids = [entry["id"] for entry in response.json()]

    assert old.json()["id"] in ids
    assert recent.json()["id"] not in ids


async def test_search_entries_filters_by_date_range(
    authenticated_client, project_with_schema
):
    project_id = project_with_schema["id"]

    timestamps = [
        datetime(2026, 1, 10, 9, 0, tzinfo=timezone.utc),
        datetime(2026, 3, 10, 9, 0, tzinfo=timezone.utc),
        datetime(2026, 6, 10, 9, 0, tzinfo=timezone.utc),
    ]

    created = []

    for index, timestamp in enumerate(timestamps):
        response = await authenticated_client.post(
            f"/projects/{project_id}/entries",
            json={
                "data": {
                    "field-1": index,
                    "field-2": f"timeline entry {index}",
                    "field-3": "Open",
                },
                "created_at": timestamp.isoformat(),
            },
        )
        assert response.status_code == 201
        created.append(response.json())

    response = await authenticated_client.get(
        "/entries"
        "?start=2026-03-01T00:00:00%2B00:00"
        "&end=2026-04-01T23:59:59%2B00:00"
    )

    assert response.status_code == 200

    ids = [entry["id"] for entry in response.json()]

    assert created[1]["id"] in ids
    assert created[0]["id"] not in ids
    assert created[2]["id"] not in ids


async def test_search_entries_rejects_reversed_date_range(authenticated_client):
    response = await authenticated_client.get(
        "/entries"
        "?start=2026-09-30T00:00:00%2B00:00"
        "&end=2026-09-01T23:59:59%2B00:00"
    )

    assert response.status_code == 422
    assert response.json()["detail"] == "Start date must be on or before end date."


async def test_search_entries_order_is_deterministic_when_timestamps_match(
    authenticated_client, project_with_schema
):
    project_id = project_with_schema["id"]
    captured_at = datetime(2026, 5, 10, 9, 0, tzinfo=timezone.utc).isoformat()
    ids = [
        "00000000-0000-0000-0000-000000000001",
        "00000000-0000-0000-0000-000000000003",
        "00000000-0000-0000-0000-000000000002",
    ]

    for entry_id in ids:
        response = await authenticated_client.post(
            f"/projects/{project_id}/entries",
            json={"id": entry_id, "created_at": captured_at, "data": VALID_DATA},
        )
        assert response.status_code == 201

    newest = await authenticated_client.get("/entries?sort=newest&page_size=2")
    newest_page_two = await authenticated_client.get("/entries?sort=newest&page=2&page_size=2")
    oldest = await authenticated_client.get("/entries?sort=oldest&page_size=3")

    assert [item["id"] for item in newest.json()] == [ids[1], ids[2]]
    assert [item["id"] for item in newest_page_two.json()] == [ids[0]]
    assert [item["id"] for item in oldest.json()] == sorted(ids)


# ── Client-supplied id and created_at ────────────────────────────────
#
# Shared foundation for offline sync (US-2.16) and import (US-2.17). Both
# replay requests that may already have landed, and both need the entry's
# original capture time rather than the moment it reached the server.


VALID_DATA = {"field-1": 5, "field-2": "Worked on UI", "field-3": "Open"}


async def test_create_entry_without_id_is_server_assigned(
    authenticated_client, project_with_schema
):
    """The ordinary online path is unchanged: server assigns id and timestamp."""
    project_id = project_with_schema["id"]
    before = datetime.now(timezone.utc)

    response = await authenticated_client.post(
        f"/projects/{project_id}/entries",
        json={"data": VALID_DATA},
    )

    assert response.status_code == 201
    body = response.json()
    assert body["id"]
    created_at = datetime.fromisoformat(body["created_at"])
    if created_at.tzinfo is None:
        created_at = created_at.replace(tzinfo=timezone.utc)
    assert created_at >= before - timedelta(seconds=5)


async def test_create_entry_honours_client_supplied_id(
    authenticated_client, project_with_schema
):
    project_id = project_with_schema["id"]
    entry_id = str(uuid4())

    response = await authenticated_client.post(
        f"/projects/{project_id}/entries",
        json={"id": entry_id, "data": VALID_DATA},
    )

    assert response.status_code == 201
    assert response.json()["id"] == entry_id


async def test_replaying_the_same_id_does_not_duplicate(
    authenticated_client, project_with_schema
):
    """A lost response must not turn one captured entry into two."""
    project_id = project_with_schema["id"]
    entry_id = str(uuid4())
    payload = {"id": entry_id, "data": VALID_DATA}

    first = await authenticated_client.post(
        f"/projects/{project_id}/entries", json=payload
    )
    second = await authenticated_client.post(
        f"/projects/{project_id}/entries", json=payload
    )

    assert first.status_code == 201
    # 200 rather than 201 tells the sync engine this one had already landed.
    assert second.status_code == 200
    assert second.json()["id"] == entry_id

    listing = await authenticated_client.get(f"/projects/{project_id}/entries")
    assert len([e for e in listing.json() if e["id"] == entry_id]) == 1


async def test_replay_returns_existing_entry_even_when_archived(
    authenticated_client, project_with_schema
):
    """An entry that synced before archiving should replay, not 409."""
    project_id = project_with_schema["id"]
    entry_id = str(uuid4())
    payload = {"id": entry_id, "data": VALID_DATA}

    await authenticated_client.post(f"/projects/{project_id}/entries", json=payload)
    await authenticated_client.post(f"/projects/{project_id}/archive")

    replay = await authenticated_client.post(
        f"/projects/{project_id}/entries", json=payload
    )

    assert replay.status_code == 200
    assert replay.json()["id"] == entry_id


async def test_create_entry_preserves_client_created_at(
    authenticated_client, project_with_schema
):
    """Import and delayed sync must keep the original capture time."""
    project_id = project_with_schema["id"]
    captured = datetime(2026, 3, 14, 9, 30, tzinfo=timezone.utc)

    response = await authenticated_client.post(
        f"/projects/{project_id}/entries",
        json={"data": VALID_DATA, "created_at": captured.isoformat()},
    )

    assert response.status_code == 201
    stored = datetime.fromisoformat(response.json()["created_at"])
    if stored.tzinfo is None:
        stored = stored.replace(tzinfo=timezone.utc)
    assert stored == captured


async def test_naive_created_at_is_treated_as_utc(
    authenticated_client, project_with_schema
):
    """An offline device may send a timestamp with no timezone attached."""
    project_id = project_with_schema["id"]

    response = await authenticated_client.post(
        f"/projects/{project_id}/entries",
        json={"data": VALID_DATA, "created_at": "2026-03-14T09:30:00"},
    )

    assert response.status_code == 201
    stored = datetime.fromisoformat(response.json()["created_at"])
    if stored.tzinfo is None:
        stored = stored.replace(tzinfo=timezone.utc)
    assert stored == datetime(2026, 3, 14, 9, 30, tzinfo=timezone.utc)


async def test_future_created_at_is_rejected(
    authenticated_client, project_with_schema
):
    """A skewed device clock would otherwise pin an entry to the top forever."""
    project_id = project_with_schema["id"]
    future = datetime.now(timezone.utc) + timedelta(days=2)

    response = await authenticated_client.post(
        f"/projects/{project_id}/entries",
        json={"data": VALID_DATA, "created_at": future.isoformat()},
    )

    assert response.status_code == 422


async def test_id_belonging_to_another_user_is_rejected_not_disclosed(
    authenticated_client,
    second_authenticated_client,
    project_with_schema,
):
    """A colliding id must never return the other user's entry."""
    owner_project = project_with_schema["id"]
    entry_id = str(uuid4())

    created = await authenticated_client.post(
        f"/projects/{owner_project}/entries",
        json={"id": entry_id, "data": VALID_DATA},
    )
    assert created.status_code == 201

    intruder_project = await second_authenticated_client.post(
        "/projects",
        json={"name": "Other User Project", "entry_schema": []},
    )
    intruder_project_id = intruder_project.json()["id"]

    response = await second_authenticated_client.post(
        f"/projects/{intruder_project_id}/entries",
        json={"id": entry_id, "data": {}},
    )

    assert response.status_code == 409
    assert "data" not in response.json()
    assert response.json()["detail"] == "An entry with this id already exists."


# ── Read, update and delete a single entry ───────────────────────────


@pytest_asyncio.fixture(loop_scope="function")
async def existing_entry(authenticated_client, project_with_schema):
    project_id = project_with_schema["id"]
    response = await authenticated_client.post(
        f"/projects/{project_id}/entries",
        json={"data": VALID_DATA, "time_spent": 45},
    )
    return response.json()


async def test_get_single_entry(
    authenticated_client, project_with_schema, existing_entry
):
    project_id = project_with_schema["id"]

    response = await authenticated_client.get(
        f"/projects/{project_id}/entries/{existing_entry['id']}"
    )

    assert response.status_code == 200
    assert response.json()["id"] == existing_entry["id"]


async def test_get_entry_from_wrong_project_is_404(
    authenticated_client, project_with_schema, existing_entry
):
    other = await authenticated_client.post(
        "/projects", json={"name": "Elsewhere", "entry_schema": []}
    )
    other_id = other.json()["id"]

    response = await authenticated_client.get(
        f"/projects/{other_id}/entries/{existing_entry['id']}"
    )

    assert response.status_code == 404


async def test_entry_history_keeps_immutable_snapshots(
    authenticated_client, project_with_schema, existing_entry
):
    project_id = project_with_schema["id"]
    entry_id = existing_entry["id"]

    initial = await authenticated_client.get(
        f"/projects/{project_id}/entries/{entry_id}/history"
    )
    assert initial.status_code == 200
    assert len(initial.json()) == 1
    assert initial.json()[0]["revision"] == 1
    assert initial.json()[0]["data"]["field-2"] == "Worked on UI"

    edited = await authenticated_client.put(
        f"/projects/{project_id}/entries/{entry_id}",
        json={"data": {**VALID_DATA, "field-2": "Corrected the typo"}, "time_spent": 75},
    )
    assert edited.status_code == 200

    history = await authenticated_client.get(
        f"/projects/{project_id}/entries/{entry_id}/history"
    )
    assert history.status_code == 200
    revisions = history.json()
    assert [revision["revision"] for revision in revisions] == [2, 1]
    assert revisions[0]["data"]["field-2"] == "Corrected the typo"
    assert revisions[0]["time_spent"] == 75
    assert revisions[1]["data"]["field-2"] == "Worked on UI"
    assert revisions[1]["time_spent"] == existing_entry["time_spent"]
    assert revisions[0]["changed_by_name"] == "Test User"


async def test_entry_history_is_not_visible_outside_the_project(
    authenticated_client, second_authenticated_client, project_with_schema, existing_entry
):
    response = await second_authenticated_client.get(
        f"/projects/{project_with_schema['id']}/entries/{existing_entry['id']}/history"
    )
    assert response.status_code == 404


async def test_update_entry_data(
    authenticated_client, project_with_schema, existing_entry
):
    project_id = project_with_schema["id"]
    updated = {**VALID_DATA, "field-2": "Corrected the typo"}

    response = await authenticated_client.put(
        f"/projects/{project_id}/entries/{existing_entry['id']}",
        json={"data": updated},
    )

    assert response.status_code == 200
    assert response.json()["data"]["field-2"] == "Corrected the typo"


async def test_update_entry_preserves_created_at(
    authenticated_client, project_with_schema, existing_entry
):
    """Editing an entry must not move it in the timeline."""
    project_id = project_with_schema["id"]

    response = await authenticated_client.put(
        f"/projects/{project_id}/entries/{existing_entry['id']}",
        json={"data": {**VALID_DATA, "field-1": 99}},
    )

    assert response.status_code == 200
    assert response.json()["created_at"] == existing_entry["created_at"]


async def test_update_entry_leaves_time_spent_when_omitted(
    authenticated_client, project_with_schema, existing_entry
):
    project_id = project_with_schema["id"]

    response = await authenticated_client.put(
        f"/projects/{project_id}/entries/{existing_entry['id']}",
        json={"data": VALID_DATA},
    )

    assert response.status_code == 200
    assert response.json()["time_spent"] == 45


async def test_update_entry_clears_time_spent_when_explicitly_null(
    authenticated_client, project_with_schema, existing_entry
):
    """An explicit null means "remove the duration", unlike an omitted field."""
    project_id = project_with_schema["id"]

    response = await authenticated_client.put(
        f"/projects/{project_id}/entries/{existing_entry['id']}",
        json={"time_spent": None},
    )

    assert response.status_code == 200
    assert response.json()["time_spent"] is None


async def test_update_entry_rejects_fields_outside_the_schema(
    authenticated_client, project_with_schema, existing_entry
):
    project_id = project_with_schema["id"]

    response = await authenticated_client.put(
        f"/projects/{project_id}/entries/{existing_entry['id']}",
        json={"data": {**VALID_DATA, "field-removed": "stale"}},
    )

    assert response.status_code == 422


async def test_update_entry_validates_against_the_entrys_own_shape_by_default(
    authenticated_client, project_with_schema, existing_entry
):
    """An ordinary edit is validated against the shape this entry actually
    recorded (``schema_snapshot``), not the project's current schema — an
    entry stays frozen until it is explicitly migrated. See
    schema_migration.py and docs/api/entries.md, "Editing an entry after the
    schema has changed".
    """
    project_id = project_with_schema["id"]

    schema_update = await authenticated_client.put(
        f"/projects/{project_id}",
        json={
            "name": "Logbook Project",
            "entry_schema": [
                {"id": "field-1", "name": "Hours", "type": FieldType.NUMBER.value},
                {"id": "field-2", "name": "Notes", "type": FieldType.TEXT.value},
                {"id": "field-4", "name": "Mood", "type": FieldType.TEXT.value},
            ],
        },
    )
    assert schema_update.status_code == 200

    # An edit in the entry's own original shape still succeeds — the schema
    # change above never touched it.
    own_shape = await authenticated_client.put(
        f"/projects/{project_id}/entries/{existing_entry['id']}",
        json={"data": VALID_DATA},
    )
    assert own_shape.status_code == 200
    assert own_shape.json()["data"]["field-3"] == "Open"

    # A field that's new to the *project* is still unknown to *this entry*
    # until it opts in to being migrated — field-3 is included here so the
    # rejection is unambiguously about field-4, not a missing field-3.
    current_shape = await authenticated_client.put(
        f"/projects/{project_id}/entries/{existing_entry['id']}",
        json={
            "data": {
                "field-1": 5,
                "field-2": "Worked on UI",
                "field-3": "Open",
                "field-4": "Focused",
            }
        },
    )
    assert current_shape.status_code == 422
    assert "Unknown field" in current_shape.json()["detail"]

    # Opting in to the migration is what makes the current shape acceptable.
    migrated = await authenticated_client.put(
        f"/projects/{project_id}/entries/{existing_entry['id']}",
        json={
            "migrate_to_current_schema": True,
            "data": {
                "field-1": 5,
                "field-2": "Worked on UI",
                "field-4": "Focused",
            },
        },
    )
    assert migrated.status_code == 200
    assert migrated.json()["data"]["field-4"] == "Focused"
    assert "field-3" not in migrated.json()["data"]


async def test_schema_change_leaves_an_untouched_entrys_snapshot_alone(
    authenticated_client, project_with_schema, existing_entry
):
    """A schema save changes the project; it does not reach into any entry.
    An entry's own schema_version/schema_snapshot move forward only when
    that entry is individually migrated during an edit — see
    test_schema_change_migration_updates_the_entrys_snapshot below."""
    project_id = project_with_schema["id"]
    original_version = project_with_schema["schema_version"]
    new_schema = [
        {"id": "field-1", "name": "Hours", "type": FieldType.NUMBER.value},
        {"id": "field-2", "name": "Notes", "type": FieldType.TEXT.value},
        {"id": "field-4", "name": "Mood", "type": FieldType.TEXT.value},
    ]

    schema_update = await authenticated_client.put(
        f"/projects/{project_id}", json={"entry_schema": new_schema}
    )
    assert schema_update.status_code == 200
    assert schema_update.json()["schema_version"] > original_version

    entry = await authenticated_client.get(
        f"/projects/{project_id}/entries/{existing_entry['id']}"
    )
    assert entry.status_code == 200
    body = entry.json()
    assert body["schema_version"] == original_version
    assert body["schema_snapshot"] == project_with_schema["entry_schema"]


async def test_migrating_an_entry_updates_its_own_snapshot(
    authenticated_client, project_with_schema, existing_entry
):
    """Migrating an entry keeps its own schema_snapshot in step with what
    its data was just migrated onto — so a later edit, or statistics
    reading historical values, isn't looking at a schema this entry's data
    no longer actually matches."""
    project_id = project_with_schema["id"]
    new_schema = [
        {"id": "field-1", "name": "Hours", "type": FieldType.NUMBER.value},
        {"id": "field-2", "name": "Notes", "type": FieldType.TEXT.value},
        {"id": "field-4", "name": "Mood", "type": FieldType.TEXT.value},
    ]

    schema_update = await authenticated_client.put(
        f"/projects/{project_id}", json={"entry_schema": new_schema}
    )
    assert schema_update.status_code == 200
    new_version = schema_update.json()["schema_version"]

    migrated = await authenticated_client.put(
        f"/projects/{project_id}/entries/{existing_entry['id']}",
        json={"migrate_to_current_schema": True},
    )
    assert migrated.status_code == 200
    body = migrated.json()
    assert body["schema_version"] == new_version
    assert body["schema_snapshot"] == new_schema


async def test_update_entry_rejects_incomplete_data(
    authenticated_client, project_with_schema, existing_entry
):
    project_id = project_with_schema["id"]

    response = await authenticated_client.put(
        f"/projects/{project_id}/entries/{existing_entry['id']}",
        json={"data": {"field-1": 5}},
    )

    assert response.status_code == 422


async def test_update_entry_blocked_when_archived(
    authenticated_client, project_with_schema, existing_entry
):
    project_id = project_with_schema["id"]
    await authenticated_client.post(f"/projects/{project_id}/archive")

    response = await authenticated_client.put(
        f"/projects/{project_id}/entries/{existing_entry['id']}",
        json={"data": VALID_DATA},
    )

    assert response.status_code == 409


async def test_delete_entry(
    authenticated_client, project_with_schema, existing_entry
):
    project_id = project_with_schema["id"]
    entry_id = existing_entry["id"]

    response = await authenticated_client.delete(
        f"/projects/{project_id}/entries/{entry_id}"
    )
    assert response.status_code == 204

    follow_up = await authenticated_client.get(
        f"/projects/{project_id}/entries/{entry_id}"
    )
    assert follow_up.status_code == 404


async def test_delete_entry_blocked_when_archived(
    authenticated_client, project_with_schema, existing_entry
):
    project_id = project_with_schema["id"]
    await authenticated_client.post(f"/projects/{project_id}/archive")

    response = await authenticated_client.delete(
        f"/projects/{project_id}/entries/{existing_entry['id']}"
    )

    assert response.status_code == 409


async def test_another_user_cannot_read_update_or_delete_your_entry(
    authenticated_client,
    second_authenticated_client,
    project_with_schema,
    existing_entry,
):
    project_id = project_with_schema["id"]
    entry_id = existing_entry["id"]
    url = f"/projects/{project_id}/entries/{entry_id}"

    assert (await second_authenticated_client.get(url)).status_code == 404
    assert (
        await second_authenticated_client.put(url, json={"data": VALID_DATA})
    ).status_code == 404
    assert (await second_authenticated_client.delete(url)).status_code == 404

    # And the entry is untouched.
    survivor = await authenticated_client.get(url)
    assert survivor.status_code == 200
    assert survivor.json()["data"]["field-2"] == VALID_DATA["field-2"]


async def test_list_entries_returns_newest_first(
    authenticated_client, project_with_schema
):
    """The listing had no ORDER BY, so ordering was whatever the database chose."""
    project_id = project_with_schema["id"]

    older = await authenticated_client.post(
        f"/projects/{project_id}/entries",
        json={
            "data": VALID_DATA,
            "created_at": datetime(2026, 1, 1, tzinfo=timezone.utc).isoformat(),
        },
    )
    newer = await authenticated_client.post(
        f"/projects/{project_id}/entries",
        json={
            "data": VALID_DATA,
            "created_at": datetime(2026, 6, 1, tzinfo=timezone.utc).isoformat(),
        },
    )

    response = await authenticated_client.get(f"/projects/{project_id}/entries")

    assert response.status_code == 200
    ids = [entry["id"] for entry in response.json()]
    assert ids.index(newer.json()["id"]) < ids.index(older.json()["id"])


# ── Outstanding work (US-2.15) ───────────────────────────────────────


async def test_create_entry_defaults_to_completed_work(
    authenticated_client, project_with_schema
):
    """An ordinary log entry records work already done, so todo stays false."""
    project_id = project_with_schema["id"]

    response = await authenticated_client.post(
        f"/projects/{project_id}/entries",
        json={"data": VALID_DATA},
    )

    assert response.status_code == 201
    assert response.json()["todo"] is False
    assert response.json()["due_date"] is None


async def test_create_entry_as_outstanding_work(
    authenticated_client, project_with_schema
):
    project_id = project_with_schema["id"]

    response = await authenticated_client.post(
        f"/projects/{project_id}/entries",
        json={"data": VALID_DATA, "todo": True, "due_date": "2026-10-01"},
    )

    assert response.status_code == 201
    assert response.json()["todo"] is True
    assert response.json()["due_date"] == "2026-10-01"


async def test_update_entry_marks_outstanding_work_done(
    authenticated_client, project_with_schema
):
    project_id = project_with_schema["id"]
    created = await authenticated_client.post(
        f"/projects/{project_id}/entries",
        json={"data": VALID_DATA, "todo": True, "due_date": "2026-10-01"},
    )
    entry_id = created.json()["id"]

    response = await authenticated_client.put(
        f"/projects/{project_id}/entries/{entry_id}",
        json={"todo": False},
    )

    assert response.status_code == 200
    assert response.json()["todo"] is False
    # Completing the work leaves the deadline it was set against intact.
    assert response.json()["due_date"] == "2026-10-01"


async def test_update_entry_clears_due_date_with_explicit_null(
    authenticated_client, project_with_schema
):
    project_id = project_with_schema["id"]
    created = await authenticated_client.post(
        f"/projects/{project_id}/entries",
        json={"data": VALID_DATA, "todo": True, "due_date": "2026-10-01"},
    )
    entry_id = created.json()["id"]

    response = await authenticated_client.put(
        f"/projects/{project_id}/entries/{entry_id}",
        json={"due_date": None},
    )

    assert response.status_code == 200
    assert response.json()["due_date"] is None


async def test_entry_due_time_is_saved_updated_and_cleared_with_its_date(
    authenticated_client, project_with_schema
):
    project_id = project_with_schema["id"]
    created = await authenticated_client.post(
        f"/projects/{project_id}/entries",
        json={"data": VALID_DATA, "todo": True, "due_date": "2026-10-01", "due_time": "14:30:00"},
    )
    assert created.status_code == 201
    assert created.json()["due_time"] == "14:30:00"
    entry_id = created.json()["id"]

    changed = await authenticated_client.put(
        f"/projects/{project_id}/entries/{entry_id}", json={"due_time": "09:15:00"}
    )
    assert changed.json()["due_time"] == "09:15:00"

    cleared = await authenticated_client.put(
        f"/projects/{project_id}/entries/{entry_id}", json={"due_date": None}
    )
    assert cleared.json()["due_date"] is None
    assert cleared.json()["due_time"] is None


async def test_entry_due_time_without_a_date_is_not_kept(
    authenticated_client, project_with_schema
):
    response = await authenticated_client.post(
        f"/projects/{project_with_schema['id']}/entries",
        json={"data": VALID_DATA, "todo": True, "due_time": "14:30:00"},
    )
    assert response.status_code == 201
    assert response.json()["due_time"] is None


async def test_update_entry_leaves_outstanding_fields_when_omitted(
    authenticated_client, project_with_schema
):
    project_id = project_with_schema["id"]
    created = await authenticated_client.post(
        f"/projects/{project_id}/entries",
        json={"data": VALID_DATA, "todo": True, "due_date": "2026-10-01"},
    )
    entry_id = created.json()["id"]

    response = await authenticated_client.put(
        f"/projects/{project_id}/entries/{entry_id}",
        json={"time_spent": 30},
    )

    assert response.status_code == 200
    assert response.json()["todo"] is True
    assert response.json()["due_date"] == "2026-10-01"


async def test_search_entries_filters_outstanding_work(
    authenticated_client, project_with_schema
):
    project_id = project_with_schema["id"]
    outstanding = await authenticated_client.post(
        f"/projects/{project_id}/entries",
        json={"data": VALID_DATA, "todo": True},
    )
    await authenticated_client.post(
        f"/projects/{project_id}/entries",
        json={"data": VALID_DATA},
    )

    response = await authenticated_client.get("/entries?todo=true")

    assert response.status_code == 200
    data = response.json()
    assert [entry["id"] for entry in data] == [outstanding.json()["id"]]


async def test_search_entries_sorted_by_due_date_puts_undated_last(
    authenticated_client, project_with_schema
):
    """A deadline that exists outranks one that was never set."""
    project_id = project_with_schema["id"]

    undated = await authenticated_client.post(
        f"/projects/{project_id}/entries",
        json={"data": VALID_DATA, "todo": True},
    )
    later = await authenticated_client.post(
        f"/projects/{project_id}/entries",
        json={"data": VALID_DATA, "todo": True, "due_date": "2026-12-01"},
    )
    sooner = await authenticated_client.post(
        f"/projects/{project_id}/entries",
        json={"data": VALID_DATA, "todo": True, "due_date": "2026-10-01"},
    )

    response = await authenticated_client.get("/entries?todo=true&sort=due_date")

    assert response.status_code == 200
    assert [entry["id"] for entry in response.json()] == [
        sooner.json()["id"],
        later.json()["id"],
        undated.json()["id"],
    ]


async def test_search_entries_sorted_oldest_first(
    authenticated_client, project_with_schema
):
    project_id = project_with_schema["id"]

    older = await authenticated_client.post(
        f"/projects/{project_id}/entries",
        json={
            "data": VALID_DATA,
            "created_at": datetime(2026, 1, 1, tzinfo=timezone.utc).isoformat(),
        },
    )
    newer = await authenticated_client.post(
        f"/projects/{project_id}/entries",
        json={
            "data": VALID_DATA,
            "created_at": datetime(2026, 6, 1, tzinfo=timezone.utc).isoformat(),
        },
    )

    response = await authenticated_client.get("/entries?sort=oldest")

    assert response.status_code == 200
    ids = [entry["id"] for entry in response.json()]
    assert ids.index(older.json()["id"]) < ids.index(newer.json()["id"])


async def test_search_entries_rejects_unknown_sort(authenticated_client):
    response = await authenticated_client.get("/entries?sort=whenever")

    assert response.status_code == 422


# API Performance, Load & Robustness, Finding 4: an unknown top-level field on
# entry creation used to be silently ignored rather than rejected. A typo'd
# schema field id inside `data` is unaffected by this and stays flexible, by
# design — `data` is a free-form dict of the project's own field ids.


async def test_create_entry_rejects_an_unknown_top_level_field(authenticated_client, project_with_schema):
    project_id = project_with_schema["id"]
    response = await authenticated_client.post(
        f"/projects/{project_id}/entries",
        json={"data": {}, "todoo": True},
    )
    assert response.status_code == 422


async def test_an_entry_cannot_record_more_than_ten_thousand_hours(authenticated_client):
    project = (await authenticated_client.post("/projects", json={"name": "Time", "entry_schema": []})).json()
    base = f"/projects/{project['id']}/entries"

    over = await authenticated_client.post(base, json={"data": {}, "time_spent": 10000 * 60 + 1})
    assert over.status_code == 422

    top = await authenticated_client.post(base, json={"data": {}, "time_spent": 10000 * 60})
    assert top.status_code == 201

    edit = await authenticated_client.put(f"{base}/{top.json()['id']}", json={"time_spent": 10000 * 60 + 1})
    assert edit.status_code == 422


async def test_an_entry_already_above_the_ceiling_keeps_its_time_but_new_ones_cannot_exceed_it(
    authenticated_client, db_session
):
    from sqlalchemy import update

    from app.models import Entry

    project = (await authenticated_client.post("/projects", json={"name": "Old", "entry_schema": []})).json()
    base = f"/projects/{project['id']}/entries"
    entry = (await authenticated_client.post(base, json={"data": {}, "time_spent": 60})).json()

    # An entry recorded before the ceiling existed.
    await db_session.execute(update(Entry).where(Entry.id == UUID(entry["id"])).values(time_spent=20000 * 60))
    await db_session.commit()

    # Editing something else, or sending the same time back, is fine.
    renamed = await authenticated_client.put(f"{base}/{entry['id']}", json={"title": "Renamed", "time_spent": 20000 * 60})
    assert renamed.status_code == 200 and renamed.json()["time_spent"] == 20000 * 60

    # So is lowering it, but not raising it, and a new entry cannot start above the ceiling.
    assert (await authenticated_client.put(f"{base}/{entry['id']}", json={"time_spent": 20001 * 60})).status_code == 422
    assert (await authenticated_client.put(f"{base}/{entry['id']}", json={"time_spent": 5000 * 60})).status_code == 200
    assert (await authenticated_client.post(base, json={"data": {}, "time_spent": 10001 * 60})).status_code == 422


async def test_fields_are_only_required_once_an_entry_is_done(authenticated_client):
    project = (
        await authenticated_client.post(
            "/projects",
            json={"name": "Plan", "entry_schema": [{"id": "f-hours", "name": "Hours", "type": "number"}, {"id": "f-note", "name": "Note", "type": "text"}]},
        )
    ).json()
    base = f"/projects/{project['id']}/entries"

    # Finished work must be complete.
    refused = await authenticated_client.post(base, json={"data": {}})
    assert refused.status_code == 422 and "Missing required field" in refused.text

    # Planned work need not be.
    planned = await authenticated_client.post(base, json={"data": {}, "todo": True, "title": "Later"})
    assert planned.status_code == 201

    # What is given is still checked.
    wrong = await authenticated_client.post(base, json={"data": {"f-hours": "lots"}, "todo": True})
    assert wrong.status_code == 422

    # Finishing it through the form (which sends the data) means it must be complete.
    entry_id = planned.json()["id"]
    incomplete = await authenticated_client.put(f"{base}/{entry_id}", json={"todo": False, "data": {"f-hours": 2}})
    assert incomplete.status_code == 422 and "Note" in incomplete.text
    done = await authenticated_client.put(f"{base}/{entry_id}", json={"todo": False, "data": {"f-hours": 2, "f-note": "ok"}})
    assert done.status_code == 200 and done.json()["todo"] is False

    # And an entry still to do can be edited with fields left empty.
    again = await authenticated_client.put(f"{base}/{entry_id}", json={"todo": True, "data": {}})
    assert again.status_code == 200


async def test_a_planned_entry_cannot_be_finished_without_its_fields_but_can_once_they_are_filled(authenticated_client):
    project = (
        await authenticated_client.post(
            "/projects",
            json={"name": "Finish", "entry_schema": [{"id": "f-hours", "name": "Hours", "type": "number"}, {"id": "f-note", "name": "Note", "type": "text"}]},
        )
    ).json()
    base = f"/projects/{project['id']}/entries"
    entry = (await authenticated_client.post(base, json={"data": {"f-note": "x"}, "todo": True, "title": "Later"})).json()

    # Moved to Done with nothing else sent, as the Board and Outstanding do.
    refused = await authenticated_client.put(f"{base}/{entry['id']}", json={"status": "Done"})
    assert refused.status_code == 422 and "Fill in Hours before finishing this entry" in refused.text
    refused_todo = await authenticated_client.put(f"{base}/{entry['id']}", json={"todo": False})
    assert refused_todo.status_code == 422

    # It stays planned, and other edits to a planned entry are untouched.
    still = (await authenticated_client.get(base)).json()[0]
    assert still["todo"] is True
    assert (await authenticated_client.put(f"{base}/{entry['id']}", json={"title": "Later still"})).status_code == 200

    # Once the field is filled in, finishing works.
    assert (await authenticated_client.put(f"{base}/{entry['id']}", json={"data": {"f-hours": 2, "f-note": "x"}})).status_code == 200
    done = await authenticated_client.put(f"{base}/{entry['id']}", json={"status": "Done"})
    assert done.status_code == 200 and done.json()["todo"] is False


async def test_finishing_a_complete_planned_entry_or_editing_a_finished_one_is_not_blocked(authenticated_client):
    project = (
        await authenticated_client.post("/projects", json={"name": "Ok", "entry_schema": [{"id": "f-note", "name": "Note", "type": "text"}]})
    ).json()
    base = f"/projects/{project['id']}/entries"
    planned = (await authenticated_client.post(base, json={"data": {"f-note": "x"}, "todo": True})).json()

    assert (await authenticated_client.put(f"{base}/{planned['id']}", json={"todo": False})).status_code == 200
    # Already finished: a later edit with no field values does not re-judge it.
    assert (await authenticated_client.put(f"{base}/{planned['id']}", json={"title": "Renamed"})).status_code == 200
