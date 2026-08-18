"""Tests for app.routers.projects."""

import uuid

from app.schemas import FieldType


async def test_create_project(authenticated_client):
    response = await authenticated_client.post(
        "/projects",
        json={"name": "New Project", "description": "A test project", "entry_schema": []},
    )
    assert response.status_code == 201
    data = response.json()
    assert data["name"] == "New Project"
    assert data["description"] == "A test project"
    assert data["entry_schema"] == []


async def test_get_project(authenticated_client):
    create_response = await authenticated_client.post(
        "/projects",
        json={"name": "Existing", "description": "Found it", "entry_schema": []},
    )
    project_id = create_response.json()["id"]

    response = await authenticated_client.get(f"/projects/{project_id}")
    assert response.status_code == 200
    data = response.json()
    assert data["name"] == "Existing"
    assert data["description"] == "Found it"


async def test_get_project_not_found(authenticated_client):
    response = await authenticated_client.get(f"/projects/{uuid.uuid4()}")
    assert response.status_code == 404
    assert response.json()["detail"] == "Project not found"


async def test_create_project_not_archived_by_default(authenticated_client):
    response = await authenticated_client.post(
        "/projects",
        json={"name": "New Project", "entry_schema": []},
    )
    assert response.status_code == 201
    assert response.json()["archived"] is False


async def test_archive_project(authenticated_client):
    create_response = await authenticated_client.post(
        "/projects",
        json={"name": "To Archive", "entry_schema": []},
    )
    project_id = create_response.json()["id"]

    response = await authenticated_client.post(f"/projects/{project_id}/archive")
    assert response.status_code == 200
    assert response.json()["archived"] is True

    get_response = await authenticated_client.get(f"/projects/{project_id}")
    assert get_response.json()["archived"] is True


async def test_unarchive_project(authenticated_client):
    create_response = await authenticated_client.post(
        "/projects",
        json={"name": "To Restore", "entry_schema": []},
    )
    project_id = create_response.json()["id"]
    await authenticated_client.post(f"/projects/{project_id}/archive")

    response = await authenticated_client.post(f"/projects/{project_id}/unarchive")
    assert response.status_code == 200
    assert response.json()["archived"] is False


async def test_archive_project_is_idempotent(authenticated_client):
    create_response = await authenticated_client.post(
        "/projects",
        json={"name": "Already Archived", "entry_schema": []},
    )
    project_id = create_response.json()["id"]

    first = await authenticated_client.post(f"/projects/{project_id}/archive")
    second = await authenticated_client.post(f"/projects/{project_id}/archive")
    assert first.status_code == 200
    assert second.status_code == 200
    assert second.json()["archived"] is True


async def test_archive_project_not_found(authenticated_client):
    response = await authenticated_client.post(f"/projects/{uuid.uuid4()}/archive")
    assert response.status_code == 404
    assert response.json()["detail"] == "Project not found"


async def test_unarchive_project_not_found(authenticated_client):
    response = await authenticated_client.post(f"/projects/{uuid.uuid4()}/unarchive")
    assert response.status_code == 404
    assert response.json()["detail"] == "Project not found"


async def test_update_project_schema(authenticated_client):
    create_response = await authenticated_client.post(
        "/projects",
        json={"name": "Project", "entry_schema": []},
    )
    project_id = create_response.json()["id"]

    schema = [
        {
            "id": "field-1",
            "name": "Hours",
            "type": FieldType.NUMBER.value,
        }
    ]
    response = await authenticated_client.put(
        f"/projects/{project_id}",
        json={"entry_schema": schema},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["name"] == "Project"
    assert len(data["entry_schema"]) == 1
    assert data["entry_schema"][0]["name"] == "Hours"
