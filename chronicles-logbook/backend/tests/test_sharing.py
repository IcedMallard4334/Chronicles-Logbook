"""Tests for sharing a project with another account (US-2.20).

The split these cover is that reading a project and adding to it are shared,
while reshaping or removing it stays with the owner. A collaborator who could
archive the project or rewrite its schema would be able to destroy the record
they were only invited to contribute to.
"""

OWNER_EMAIL = "test@example.com"
MEMBER_EMAIL = "second@example.com"


async def _create_project(client, name="Shared Project"):
    response = await client.post(
        "/projects",
        json={"name": name, "description": "Worked on together", "entry_schema": []},
    )
    assert response.status_code == 201
    return response.json()["id"]


async def _share(client, project_id, email=MEMBER_EMAIL):
    return await client.post(f"/projects/{project_id}/members", json={"email": email})


async def test_owner_can_share_a_project_by_email(authenticated_client, second_test_user):
    project_id = await _create_project(authenticated_client)

    response = await _share(authenticated_client, project_id)

    assert response.status_code == 201
    body = response.json()
    assert body["email"] == MEMBER_EMAIL
    assert body["user_id"] == str(second_test_user.id)


async def test_shared_project_appears_in_the_members_list(
    authenticated_client, second_authenticated_client, second_test_user
):
    project_id = await _create_project(authenticated_client)
    await _share(authenticated_client, project_id)

    response = await second_authenticated_client.get("/projects")

    assert response.status_code == 200
    listed = {project["id"]: project for project in response.json()}
    assert project_id in listed
    assert listed[project_id]["shared"] is True


async def test_an_owned_project_is_not_marked_shared(authenticated_client):
    project_id = await _create_project(authenticated_client)

    response = await authenticated_client.get("/projects")

    listed = {project["id"]: project for project in response.json()}
    assert listed[project_id]["shared"] is False


async def test_fetching_a_shared_project_directly_reports_it_as_shared(
    authenticated_client, second_authenticated_client, second_test_user
):
    # The detail view hides the owner-only controls on this flag, so a project
    # fetched by id has to agree with the same project seen in the list.
    project_id = await _create_project(authenticated_client)
    await _share(authenticated_client, project_id)

    to_the_member = await second_authenticated_client.get(f"/projects/{project_id}")
    to_the_owner = await authenticated_client.get(f"/projects/{project_id}")

    assert to_the_member.json()["shared"] is True
    assert to_the_owner.json()["shared"] is False


async def test_member_can_read_the_project_and_add_entries(
    authenticated_client, second_authenticated_client, second_test_user
):
    project_id = await _create_project(authenticated_client)
    await _share(authenticated_client, project_id)

    readable = await second_authenticated_client.get(f"/projects/{project_id}")
    assert readable.status_code == 200

    created = await second_authenticated_client.post(
        f"/projects/{project_id}/entries", json={"data": {}}
    )
    assert created.status_code == 201

    entries = await second_authenticated_client.get(f"/projects/{project_id}/entries")
    assert entries.status_code == 200
    assert len(entries.json()) == 1


async def test_member_cannot_reshape_or_remove_the_project(
    authenticated_client, second_authenticated_client, second_test_user
):
    project_id = await _create_project(authenticated_client)
    await _share(authenticated_client, project_id)

    archived = await second_authenticated_client.post(f"/projects/{project_id}/archive")
    assert archived.status_code == 404

    renamed = await second_authenticated_client.put(
        f"/projects/{project_id}", json={"name": "Taken over"}
    )
    assert renamed.status_code == 404


async def test_member_cannot_share_the_project_onward(
    authenticated_client, second_authenticated_client, second_test_user
):
    project_id = await _create_project(authenticated_client)
    await _share(authenticated_client, project_id)

    passed_on = await _share(second_authenticated_client, project_id, email=OWNER_EMAIL)

    assert passed_on.status_code == 404


async def test_sharing_with_an_unknown_address_is_rejected(authenticated_client):
    project_id = await _create_project(authenticated_client)

    response = await _share(authenticated_client, project_id, email="nobody@example.com")

    assert response.status_code == 404


async def test_sharing_with_yourself_is_rejected(authenticated_client):
    project_id = await _create_project(authenticated_client)

    response = await _share(authenticated_client, project_id, email=OWNER_EMAIL)

    assert response.status_code == 400


async def test_sharing_twice_does_not_duplicate_the_member(
    authenticated_client, second_test_user
):
    project_id = await _create_project(authenticated_client)

    first = await _share(authenticated_client, project_id)
    again = await _share(authenticated_client, project_id)

    assert first.status_code == 201
    assert again.status_code == 201

    members = await authenticated_client.get(f"/projects/{project_id}/members")
    assert len(members.json()) == 1


async def test_unsharing_revokes_access(
    authenticated_client, second_authenticated_client, second_test_user
):
    project_id = await _create_project(authenticated_client)
    await _share(authenticated_client, project_id)
    assert (await second_authenticated_client.get(f"/projects/{project_id}")).status_code == 200

    removed = await authenticated_client.delete(
        f"/projects/{project_id}/members/{second_test_user.id}"
    )
    assert removed.status_code == 204

    revoked = await second_authenticated_client.get(f"/projects/{project_id}")
    assert revoked.status_code == 404


async def test_a_project_shared_with_nobody_stays_private(
    authenticated_client, second_authenticated_client
):
    project_id = await _create_project(authenticated_client)

    response = await second_authenticated_client.get(f"/projects/{project_id}")

    assert response.status_code == 404


# ── Who did what (US-2.21) ───────────────────────────────────────────────────
#
# A shared logbook that records what was done but not who did it is only half a
# record, so every entry and task carries its author.


async def test_an_entry_records_who_wrote_it(authenticated_client):
    project_id = await _create_project(authenticated_client)

    created = await authenticated_client.post(
        f"/projects/{project_id}/entries", json={"data": {}}
    )

    assert created.status_code == 201
    assert created.json()["created_by_name"] == "Test User"


async def test_an_entry_added_by_a_member_is_attributed_to_them(
    authenticated_client, second_authenticated_client, second_test_user
):
    project_id = await _create_project(authenticated_client)
    await _share(authenticated_client, project_id)

    await second_authenticated_client.post(
        f"/projects/{project_id}/entries", json={"data": {}}
    )

    # The owner sees who wrote it, which is the point of recording it.
    entries = await authenticated_client.get(f"/projects/{project_id}/entries")
    assert [entry["created_by_name"] for entry in entries.json()] == ["Second User"]


async def test_a_member_can_see_and_add_tasks(
    authenticated_client, second_authenticated_client, second_test_user
):
    project_id = await _create_project(authenticated_client)
    await authenticated_client.post(
        f"/projects/{project_id}/tasks", json={"title": "Owner's task"}
    )
    await _share(authenticated_client, project_id)

    visible = await second_authenticated_client.get(f"/projects/{project_id}/tasks")
    assert visible.status_code == 200
    assert [task["title"] for task in visible.json()] == ["Owner's task"]

    added = await second_authenticated_client.post(
        f"/projects/{project_id}/tasks", json={"title": "Member's task"}
    )
    assert added.status_code == 201
    assert added.json()["created_by_name"] == "Second User"


async def test_completing_a_task_records_who_completed_it(
    authenticated_client, second_authenticated_client, second_test_user
):
    project_id = await _create_project(authenticated_client)
    task = await authenticated_client.post(
        f"/projects/{project_id}/tasks", json={"title": "Shared work"}
    )
    task_id = task.json()["id"]
    assert task.json()["completed_by_name"] is None
    await _share(authenticated_client, project_id)

    done = await second_authenticated_client.patch(
        f"/projects/{project_id}/tasks/{task_id}/toggle"
    )

    assert done.status_code == 200
    assert done.json()["completed"] is True
    assert done.json()["completed_by_name"] == "Second User"


async def test_reopening_a_task_forgets_who_completed_it(authenticated_client):
    project_id = await _create_project(authenticated_client)
    task = await authenticated_client.post(
        f"/projects/{project_id}/tasks", json={"title": "Back and forth"}
    )
    task_id = task.json()["id"]

    await authenticated_client.patch(f"/projects/{project_id}/tasks/{task_id}/toggle")
    reopened = await authenticated_client.patch(
        f"/projects/{project_id}/tasks/{task_id}/toggle"
    )

    assert reopened.json()["completed"] is False
    assert reopened.json()["completed_by_name"] is None


async def test_a_member_cannot_delete_a_task(
    authenticated_client, second_authenticated_client, second_test_user
):
    project_id = await _create_project(authenticated_client)
    task = await authenticated_client.post(
        f"/projects/{project_id}/tasks", json={"title": "Not yours to remove"}
    )
    task_id = task.json()["id"]
    await _share(authenticated_client, project_id)

    response = await second_authenticated_client.delete(
        f"/projects/{project_id}/tasks/{task_id}"
    )

    assert response.status_code == 404


async def test_a_schema_change_by_the_owner_is_seen_by_the_member(
    authenticated_client, second_authenticated_client, second_test_user
):
    # The schema lives on the project, so there is one of it — but this is the
    # assumption the shared entry form depends on, so it is worth pinning.
    project_id = await _create_project(authenticated_client)
    await _share(authenticated_client, project_id)

    changed = await authenticated_client.put(
        f"/projects/{project_id}/schema",
        json={"entry_schema": [{"id": "field-1", "name": "Hours", "type": "number"}]},
    )
    assert changed.status_code == 200

    seen = await second_authenticated_client.get(f"/projects/{project_id}")
    assert [field["name"] for field in seen.json()["entry_schema"]] == ["Hours"]
