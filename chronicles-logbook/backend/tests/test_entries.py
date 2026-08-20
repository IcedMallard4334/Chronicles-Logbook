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


async def test_search_entries_by_keyword(async_client, project_with_schema):
    project_id = project_with_schema["id"]
    await async_client.post(
        f"/projects/{project_id}/entries",
        json={"data": {"field-1": 1, "field-2": "first task", "field-3": "Open"}},
    )
    await async_client.post(
        f"/projects/{project_id}/entries",
        json={"data": {"field-1": 2, "field-2": "second task", "field-3": "Closed"}},
    )

    response = await async_client.get("/entries?q=first")
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert "first" in data[0]["data"]["field-2"].lower()


async def test_search_entries_filters_by_project(async_client, project_with_schema):
    second = await async_client.post(
        "/projects",
        json={"name": "Second Project", "entry_schema": []},
    )
    second_id = second.json()["id"]

    first_id = project_with_schema["id"]
    await async_client.post(
        f"/projects/{first_id}/entries",
        json={"data": {"field-1": 1, "field-2": "shared note", "field-3": "Open"}},
    )
    await async_client.post(
        f"/projects/{second_id}/entries",
        json={"data": {}},
    )

    response = await async_client.get(f"/entries?project_id={first_id}")
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert data[0]["project_id"] == str(first_id)


async def test_search_entries_combined(async_client, project_with_schema):
    project_id = project_with_schema["id"]
    await async_client.post(
        f"/projects/{project_id}/entries",
        json={"data": {"field-1": 1, "field-2": "alpha note", "field-3": "Open"}},
    )
    await async_client.post(
        f"/projects/{project_id}/entries",
        json={"data": {"field-1": 2, "field-2": "beta note", "field-3": "Closed"}},
    )

    response = await async_client.get(f"/entries?q=alpha&project_id={project_id}")
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert data[0]["data"]["field-2"] == "alpha note"
