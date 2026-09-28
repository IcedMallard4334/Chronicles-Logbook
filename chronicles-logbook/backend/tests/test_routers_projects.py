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


async def test_get_project_includes_total_time_spent(authenticated_client):
    create_response = await authenticated_client.post(
        "/projects",
        json={"name": "Timed Project", "entry_schema": []},
    )
    project_id = create_response.json()["id"]

    for time_spent in [60, 90]:
        await authenticated_client.post(
            f"/projects/{project_id}/entries",
            json={"data": {}, "time_spent": time_spent},
        )

    response = await authenticated_client.get(f"/projects/{project_id}")
    assert response.status_code == 200
    data = response.json()
    assert data["total_time_spent"] == 150


async def test_list_projects_includes_total_time_spent(authenticated_client):
    create_response = await authenticated_client.post(
        "/projects",
        json={"name": "Timed Project", "entry_schema": []},
    )
    project_id = create_response.json()["id"]

    await authenticated_client.post(
        f"/projects/{project_id}/entries",
        json={"data": {}, "time_spent": 45},
    )

    response = await authenticated_client.get("/projects")
    assert response.status_code == 200
    data = response.json()
    project = next((p for p in data if p["id"] == project_id), None)
    assert project is not None
    assert project["total_time_spent"] == 45


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

async def test_update_project_not_found(authenticated_client):
    response = await authenticated_client.put(
        f"/projects/{uuid.uuid4()}",
        json={"name": "Should Not Exist"},
    )

    assert response.status_code == 404
    assert response.json()["detail"] == "Project not found"

async def test_update_project_rejects_other_users_project(
    authenticated_client,
    second_authenticated_client,
):
    create_response = await authenticated_client.post(
        "/projects",
        json={
            "name": "Private Project",
            "description": "Belongs to first user",
            "entry_schema": [],
        },
    )

    assert create_response.status_code == 201
    project_id = create_response.json()["id"]

    response = await second_authenticated_client.put(
        f"/projects/{project_id}",
        json={"name": "Hacked Project"},
    )

    assert response.status_code == 404
    assert response.json()["detail"] == "Project not found"


async def _make_project(client, name="Disposable"):
    response = await client.post(
        "/projects", json={"name": name, "description": None, "entry_schema": []}
    )
    assert response.status_code == 201
    return response.json()["id"]


async def test_owner_can_delete_a_project(authenticated_client):
    project_id = await _make_project(authenticated_client)

    response = await authenticated_client.delete(f"/projects/{project_id}")

    assert response.status_code == 204
    assert (await authenticated_client.get(f"/projects/{project_id}")).status_code == 404

    listed = [project["id"] for project in (await authenticated_client.get("/projects")).json()]
    assert project_id not in listed


async def test_deleting_a_project_removes_its_entries(authenticated_client):
    project_id = await _make_project(authenticated_client)
    created = await authenticated_client.post(
        f"/projects/{project_id}/entries", json={"data": {}}
    )
    assert created.status_code == 201

    assert (await authenticated_client.delete(f"/projects/{project_id}")).status_code == 204

    # The entry is only reachable through its project, so the project going
    # means the listing is gone too.
    assert (await authenticated_client.get(f"/projects/{project_id}/entries")).status_code == 404


async def test_deleting_a_project_removes_its_tasks(authenticated_client):
    # tasks.project_id declares no ON DELETE behaviour, so a project with tasks
    # is exactly the case PostgreSQL would refuse if they were not removed
    # first. SQLite will not fail on it, so this asserts the rows are gone.
    project_id = await _make_project(authenticated_client)
    created = await authenticated_client.post(
        f"/projects/{project_id}/tasks", json={"title": "Still to do"}
    )
    assert created.status_code == 201

    assert (await authenticated_client.delete(f"/projects/{project_id}")).status_code == 204
    assert (await authenticated_client.get(f"/projects/{project_id}/tasks")).status_code == 404


async def test_someone_else_cannot_delete_your_project(
    authenticated_client, second_authenticated_client
):
    project_id = await _make_project(authenticated_client)

    response = await second_authenticated_client.delete(f"/projects/{project_id}")

    assert response.status_code == 404
    assert (await authenticated_client.get(f"/projects/{project_id}")).status_code == 200


async def test_a_member_cannot_delete_a_shared_project(
    authenticated_client, second_authenticated_client, second_test_user
):
    project_id = await _make_project(authenticated_client)
    shared = await authenticated_client.post(
        f"/projects/{project_id}/members", json={"email": "second@example.com"}
    )
    assert shared.status_code == 201

    response = await second_authenticated_client.delete(f"/projects/{project_id}")

    assert response.status_code == 404
    assert (await authenticated_client.get(f"/projects/{project_id}")).status_code == 200


async def test_deleting_a_project_twice_is_not_an_error_the_second_time(authenticated_client):
    project_id = await _make_project(authenticated_client)

    assert (await authenticated_client.delete(f"/projects/{project_id}")).status_code == 204
    # It is already gone, so it is no longer yours to delete.
    assert (await authenticated_client.delete(f"/projects/{project_id}")).status_code == 404


# API Performance, Load & Robustness, Findings 4 & 5: a body with only unknown
# fields used to be accepted as a silent no-op, and description had no length
# cap. Both are load-test findings, verified here rather than only by hand.


async def test_create_project_rejects_an_unknown_field(authenticated_client):
    response = await authenticated_client.post(
        "/projects", json={"name": "Typo test", "nmae": "oops"}
    )
    assert response.status_code == 422


async def test_update_project_with_only_unknown_fields_is_rejected_not_a_silent_noop(
    authenticated_client,
):
    project_id = await _make_project(authenticated_client)

    response = await authenticated_client.put(
        f"/projects/{project_id}", json={"title": 12345}
    )

    assert response.status_code == 422


async def test_create_project_rejects_an_oversized_description(authenticated_client):
    response = await authenticated_client.post(
        "/projects", json={"name": "Too long", "description": "x" * 4001}
    )
    assert response.status_code == 422


async def test_update_project_rejects_an_oversized_description(authenticated_client):
    project_id = await _make_project(authenticated_client)

    response = await authenticated_client.put(
        f"/projects/{project_id}", json={"description": "x" * 4001}
    )

    assert response.status_code == 422