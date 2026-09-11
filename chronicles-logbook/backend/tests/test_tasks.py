"""Tests for task endpoints."""

import pytest_asyncio


@pytest_asyncio.fixture(loop_scope="function")
async def test_project(authenticated_client):
    response = await authenticated_client.post(
        "/projects",
        json={"name": "Task Test Project", "entry_schema": []},
    )
    return response.json()


async def test_create_task_minimal(authenticated_client, test_project):
    project_id = test_project["id"]
    response = await authenticated_client.post(
        f"/projects/{project_id}/tasks",
        json={"title": "Simple task"},
    )

    assert response.status_code == 201
    data = response.json()
    assert data["title"] == "Simple task"
    assert data["completed"] is False
    assert data["checklist"] == []
    assert data["project_id"] == project_id


async def test_create_task_with_checklist(authenticated_client, test_project):
    project_id = test_project["id"]
    response = await authenticated_client.post(
        f"/projects/{project_id}/tasks",
        json={
            "title": "Task with checklist",
            "description": "A detailed task",
            "due_date": "2026-08-30",
            "checklist": [
                {"id": "chk-1", "text": "Step one", "completed": False},
                {"id": "chk-2", "text": "Step two", "completed": True},
            ],
        },
    )

    assert response.status_code == 201
    data = response.json()
    assert data["title"] == "Task with checklist"
    assert data["description"] == "A detailed task"
    assert data["due_date"] == "2026-08-30"
    assert len(data["checklist"]) == 2
    assert data["checklist"][0]["text"] == "Step one"
    assert data["checklist"][1]["completed"] is True


async def test_list_tasks(authenticated_client, test_project):
    project_id = test_project["id"]
    await authenticated_client.post(
        f"/projects/{project_id}/tasks",
        json={"title": "First task", "due_date": "2026-08-25"},
    )
    await authenticated_client.post(
        f"/projects/{project_id}/tasks",
        json={"title": "Second task"},
    )

    response = await authenticated_client.get(f"/projects/{project_id}/tasks")
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 2


async def test_filter_tasks_by_completion(authenticated_client, test_project):
    project_id = test_project["id"]
    open_task = await authenticated_client.post(
        f"/projects/{project_id}/tasks",
        json={"title": "Open task"},
    )
    done_task = await authenticated_client.post(
        f"/projects/{project_id}/tasks",
        json={"title": "Done task"},
    )
    await authenticated_client.patch(
        f"/projects/{project_id}/tasks/{done_task.json()['id']}/toggle"
    )

    open_response = await authenticated_client.get(
        f"/projects/{project_id}/tasks?completed=false"
    )
    assert open_response.status_code == 200
    assert len(open_response.json()) == 1
    assert open_response.json()[0]["id"] == open_task.json()["id"]

    done_response = await authenticated_client.get(
        f"/projects/{project_id}/tasks?completed=true"
    )
    assert done_response.status_code == 200
    assert len(done_response.json()) == 1
    assert done_response.json()[0]["id"] == done_task.json()["id"]


async def test_get_task(authenticated_client, test_project):
    project_id = test_project["id"]
    created = await authenticated_client.post(
        f"/projects/{project_id}/tasks",
        json={"title": "Get me"},
    )
    task_id = created.json()["id"]

    response = await authenticated_client.get(f"/projects/{project_id}/tasks/{task_id}")
    assert response.status_code == 200
    assert response.json()["title"] == "Get me"


async def test_get_task_not_found(authenticated_client, test_project):
    project_id = test_project["id"]
    from uuid import uuid4

    response = await authenticated_client.get(f"/projects/{project_id}/tasks/{uuid4()}")
    assert response.status_code == 404


async def test_update_task_checklist(authenticated_client, test_project):
    project_id = test_project["id"]
    created = await authenticated_client.post(
        f"/projects/{project_id}/tasks",
        json={
            "title": "Update me",
            "checklist": [{"id": "chk-1", "text": "Old item", "completed": False}],
        },
    )
    task_id = created.json()["id"]

    response = await authenticated_client.put(
        f"/projects/{project_id}/tasks/{task_id}",
        json={
            "title": "Updated title",
            "checklist": [
                {"id": "chk-1", "text": "Old item", "completed": True},
                {"id": "chk-2", "text": "New item", "completed": False},
            ],
        },
    )

    assert response.status_code == 200
    data = response.json()
    assert data["title"] == "Updated title"
    assert len(data["checklist"]) == 2
    assert data["checklist"][0]["completed"] is True


async def test_toggle_task_completion(authenticated_client, test_project):
    project_id = test_project["id"]
    created = await authenticated_client.post(
        f"/projects/{project_id}/tasks",
        json={"title": "Toggle me"},
    )
    task_id = created.json()["id"]
    assert created.json()["completed"] is False

    response = await authenticated_client.patch(
        f"/projects/{project_id}/tasks/{task_id}/toggle"
    )
    assert response.status_code == 200
    assert response.json()["completed"] is True

    second = await authenticated_client.patch(
        f"/projects/{project_id}/tasks/{task_id}/toggle"
    )
    assert second.json()["completed"] is False


async def test_delete_task(authenticated_client, test_project):
    project_id = test_project["id"]
    created = await authenticated_client.post(
        f"/projects/{project_id}/tasks",
        json={"title": "Delete me"},
    )
    task_id = created.json()["id"]

    response = await authenticated_client.delete(
        f"/projects/{project_id}/tasks/{task_id}"
    )
    assert response.status_code == 204

    get_response = await authenticated_client.get(
        f"/projects/{project_id}/tasks/{task_id}"
    )
    assert get_response.status_code == 404


async def test_task_belongs_to_project(authenticated_client, test_project):
    project_id = test_project["id"]
    created = await authenticated_client.post(
        f"/projects/{project_id}/tasks",
        json={"title": "Bound task"},
    )
    task_id = created.json()["id"]

    second_project = await authenticated_client.post(
        "/projects",
        json={"name": "Other project", "entry_schema": []},
    )
    other_id = second_project.json()["id"]

    response = await authenticated_client.get(
        f"/projects/{other_id}/tasks/{task_id}"
    )
    assert response.status_code == 404


# ── Authentication and authorization ─────────────────────────────────
#
# Every test above uses an authenticated client, which is why this router
# shipped with no auth at all and nobody noticed. These exercise the paths
# that were never covered: no credentials, and someone else's project.


async def test_task_endpoints_reject_anonymous_callers(
    async_client, authenticated_client, test_project
):
    """No endpoint may be reachable without a token."""
    project_id = test_project["id"]
    created = await authenticated_client.post(
        f"/projects/{project_id}/tasks",
        json={"title": "Private task"},
    )
    task_id = created.json()["id"]

    base = f"/projects/{project_id}/tasks"
    calls = [
        ("GET", base, None),
        ("POST", base, {"title": "Injected"}),
        ("GET", f"{base}/{task_id}", None),
        ("PUT", f"{base}/{task_id}", {"title": "Hijacked"}),
        ("PATCH", f"{base}/{task_id}/toggle", None),
        ("DELETE", f"{base}/{task_id}", None),
    ]

    for method, url, body in calls:
        response = await async_client.request(method, url, json=body)
        assert response.status_code == 401, f"{method} {url} was reachable"


async def test_tasks_are_not_readable_by_another_user(
    authenticated_client, second_authenticated_client, test_project
):
    project_id = test_project["id"]
    await authenticated_client.post(
        f"/projects/{project_id}/tasks",
        json={"title": "Owner's task"},
    )

    response = await second_authenticated_client.get(
        f"/projects/{project_id}/tasks"
    )

    # 404 rather than 403: the response must not confirm the project exists.
    assert response.status_code == 404
    assert response.json()["detail"] == "Project not found"


async def test_another_user_cannot_create_a_task_in_your_project(
    second_authenticated_client, test_project
):
    project_id = test_project["id"]

    response = await second_authenticated_client.post(
        f"/projects/{project_id}/tasks",
        json={"title": "Injected task"},
    )

    assert response.status_code == 404


async def test_another_user_cannot_delete_your_task(
    authenticated_client, second_authenticated_client, test_project
):
    project_id = test_project["id"]
    created = await authenticated_client.post(
        f"/projects/{project_id}/tasks",
        json={"title": "Do not delete"},
    )
    task_id = created.json()["id"]

    response = await second_authenticated_client.delete(
        f"/projects/{project_id}/tasks/{task_id}"
    )
    assert response.status_code == 404

    # The task must still be there afterwards.
    survivor = await authenticated_client.get(
        f"/projects/{project_id}/tasks/{task_id}"
    )
    assert survivor.status_code == 200
    assert survivor.json()["title"] == "Do not delete"
