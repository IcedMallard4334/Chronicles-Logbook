"""Tests for the new archive and single-entry endpoints on app.routers.projects."""
import uuid

from app.schemas import FieldType


async def test_archive_and_unarchive_project(async_client):
    create_response = await async_client.post(
        "/projects", json={"name": "To Archive", "entry_schema": []}
    )
    project_id = create_response.json()["id"]

    archive_response = await async_client.post(f"/projects/{project_id}/archive")
    assert archive_response.status_code == 200
    assert archive_response.json()["is_archived"] is True

    list_response = await async_client.get("/projects")
    assert project_id not in [p["id"] for p in list_response.json()]

    list_with_archived = await async_client.get("/projects?include_archived=true")
    assert project_id in [p["id"] for p in list_with_archived.json()]

    unarchive_response = await async_client.post(f"/projects/{project_id}/unarchive")
    assert unarchive_response.status_code == 200
    assert unarchive_response.json()["is_archived"] is False


async def test_archive_project_not_found(async_client):
    response = await async_client.post(f"/projects/{uuid.uuid4()}/archive")
    assert response.status_code == 404


async def test_get_update_delete_entry(async_client):
    schema = [{"id": "field-1", "name": "Notes", "type": FieldType.TEXT.value}]
    project_response = await async_client.post(
        "/projects", json={"name": "Entry CRUD", "entry_schema": schema}
    )
    project_id = project_response.json()["id"]

    create_response = await async_client.post(
        f"/projects/{project_id}/entries", json={"data": {"field-1": "first draft"}}
    )
    entry_id = create_response.json()["id"]

    get_response = await async_client.get(f"/projects/{project_id}/entries/{entry_id}")
    assert get_response.status_code == 200
    assert get_response.json()["data"]["field-1"] == "first draft"

    update_response = await async_client.put(
        f"/projects/{project_id}/entries/{entry_id}",
        json={"data": {"field-1": "corrected"}},
    )
    assert update_response.status_code == 200
    assert update_response.json()["data"]["field-1"] == "corrected"

    delete_response = await async_client.delete(f"/projects/{project_id}/entries/{entry_id}")
    assert delete_response.status_code == 204

    missing_response = await async_client.get(f"/projects/{project_id}/entries/{entry_id}")
    assert missing_response.status_code == 404


async def test_entry_not_found_for_wrong_project(async_client):
    project_a = (await async_client.post("/projects", json={"name": "A", "entry_schema": []})).json()
    project_b = (await async_client.post("/projects", json={"name": "B", "entry_schema": []})).json()

    entry = (
        await async_client.post(f"/projects/{project_a['id']}/entries", json={"data": {}})
    ).json()

    # Requesting project A's entry through project B's URL should 404, not
    # leak data across projects.
    response = await async_client.get(f"/projects/{project_b['id']}/entries/{entry['id']}")
    assert response.status_code == 404
