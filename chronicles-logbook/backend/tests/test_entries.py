"""Tests for entry endpoints."""

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