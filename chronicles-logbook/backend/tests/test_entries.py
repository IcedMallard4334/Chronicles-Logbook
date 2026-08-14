"""Tests for entry endpoints."""

import pytest_asyncio

from app.schemas import FieldType


@pytest_asyncio.fixture(loop_scope="function")
async def project_with_schema(async_client):
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
    response = await async_client.post(
        "/projects",
        json={"name": "Logbook Project", "entry_schema": schema},
    )
    return response.json()


async def test_create_entry_valid(async_client, project_with_schema):
    project_id = project_with_schema["id"]
    response = await async_client.post(
        f"/projects/{project_id}/entries",
        json={"data": {"field-1": 5, "field-2": "Worked on UI", "field-3": "Open"}},
    )
    assert response.status_code == 201
    data = response.json()
    assert data["data"]["field-1"] == 5
    assert data["data"]["field-2"] == "Worked on UI"
    assert data["project_id"] == project_id


async def test_create_entry_missing_field(async_client, project_with_schema):
    project_id = project_with_schema["id"]
    response = await async_client.post(
        f"/projects/{project_id}/entries",
        json={"data": {"field-1": 5}},
    )
    assert response.status_code == 422


async def test_create_entry_wrong_type(async_client, project_with_schema):
    project_id = project_with_schema["id"]
    response = await async_client.post(
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


async def test_create_entry_invalid_dropdown(async_client, project_with_schema):
    project_id = project_with_schema["id"]
    response = await async_client.post(
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


async def test_create_entry_blocked_when_archived(async_client, project_with_schema):
    project_id = project_with_schema["id"]
    await async_client.post(f"/projects/{project_id}/archive")

    response = await async_client.post(
        f"/projects/{project_id}/entries",
        json={"data": {"field-1": 5, "field-2": "notes", "field-3": "Open"}},
    )
    assert response.status_code == 409
    assert response.json()["detail"] == "Cannot add entries to an archived project."


async def test_list_entries(async_client, project_with_schema):
    project_id = project_with_schema["id"]
    await async_client.post(
        f"/projects/{project_id}/entries",
        json={"data": {"field-1": 1, "field-2": "first", "field-3": "Open"}},
    )
    await async_client.post(
        f"/projects/{project_id}/entries",
        json={"data": {"field-1": 2, "field-2": "second", "field-3": "Closed"}},
    )

    response = await async_client.get(f"/projects/{project_id}/entries")
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 2
