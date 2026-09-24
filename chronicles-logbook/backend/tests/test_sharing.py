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


async def _invite(client, project_id, email=MEMBER_EMAIL):
    """The owner's half: an invitation is sent, and nothing is granted yet."""
    return await client.post(f"/projects/{project_id}/members", json={"email": email})


async def _share(owner_client, member_client, project_id, email=MEMBER_EMAIL):
    """Invite and accept, for the tests about what an accepted member can do.

    Access begins at the acceptance, not the invitation, so the two halves are
    spelled out here once rather than in every test that needs a collaborator.
    """
    invited = await _invite(owner_client, project_id, email=email)
    assert invited.status_code == 201, invited.text
    accepted = await member_client.post(f"/invitations/{project_id}/accept")
    assert accepted.status_code == 204, accepted.text
    return invited


async def test_owner_can_share_a_project_by_email(authenticated_client, second_test_user):
    project_id = await _create_project(authenticated_client)

    response = await _invite(authenticated_client, project_id)

    assert response.status_code == 201
    body = response.json()
    assert body["email"] == MEMBER_EMAIL
    assert body["user_id"] == str(second_test_user.id)


async def test_shared_project_appears_in_the_members_list(
    authenticated_client, second_authenticated_client, second_test_user
):
    project_id = await _create_project(authenticated_client)
    await _share(authenticated_client, second_authenticated_client, project_id)

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
    await _share(authenticated_client, second_authenticated_client, project_id)

    to_the_member = await second_authenticated_client.get(f"/projects/{project_id}")
    to_the_owner = await authenticated_client.get(f"/projects/{project_id}")

    assert to_the_member.json()["shared"] is True
    assert to_the_owner.json()["shared"] is False


async def test_member_can_read_the_project_and_add_entries(
    authenticated_client, second_authenticated_client, second_test_user
):
    project_id = await _create_project(authenticated_client)
    await _share(authenticated_client, second_authenticated_client, project_id)

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
    await _share(authenticated_client, second_authenticated_client, project_id)

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
    await _share(authenticated_client, second_authenticated_client, project_id)

    passed_on = await _invite(second_authenticated_client, project_id, email=OWNER_EMAIL)

    assert passed_on.status_code == 404


async def test_sharing_with_an_unknown_address_is_rejected(authenticated_client):
    project_id = await _create_project(authenticated_client)

    response = await _invite(authenticated_client, project_id, email="nobody@example.com")

    assert response.status_code == 404


async def test_sharing_with_yourself_is_rejected(authenticated_client):
    project_id = await _create_project(authenticated_client)

    response = await _invite(authenticated_client, project_id, email=OWNER_EMAIL)

    assert response.status_code == 400


async def test_sharing_twice_does_not_duplicate_the_member(
    authenticated_client, second_test_user
):
    project_id = await _create_project(authenticated_client)

    first = await _invite(authenticated_client, project_id)
    again = await _invite(authenticated_client, project_id)

    assert first.status_code == 201
    assert again.status_code == 201

    members = await authenticated_client.get(f"/projects/{project_id}/members")
    assert len(members.json()) == 1


async def test_reinviting_a_pending_member_leaves_the_invitation_unchanged(
    authenticated_client, second_test_user
):
    """Distinct from re-inviting someone who declined (which does reset the
    invitation): re-inviting someone who has not yet answered is a no-op."""
    project_id = await _create_project(authenticated_client)

    first = await _invite(authenticated_client, project_id)
    assert first.status_code == 201
    assert first.json()["status"] == "pending"
    first_invited_at = first.json()["invited_at"]

    again = await _invite(authenticated_client, project_id)
    assert again.status_code == 201
    assert again.json()["status"] == "pending"
    assert again.json()["invited_at"] == first_invited_at

    members = (await authenticated_client.get(f"/projects/{project_id}/members")).json()
    assert len(members) == 1
    assert members[0]["status"] == "pending"


async def test_unsharing_revokes_access(
    authenticated_client, second_authenticated_client, second_test_user
):
    project_id = await _create_project(authenticated_client)
    await _share(authenticated_client, second_authenticated_client, project_id)
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
    await _share(authenticated_client, second_authenticated_client, project_id)

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
    await _share(authenticated_client, second_authenticated_client, project_id)

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
    await _share(authenticated_client, second_authenticated_client, project_id)

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
    await _share(authenticated_client, second_authenticated_client, project_id)

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
    await _share(authenticated_client, second_authenticated_client, project_id)

    changed = await authenticated_client.put(
        f"/projects/{project_id}/schema",
        json={"entry_schema": [{"id": "field-1", "name": "Hours", "type": "number"}]},
    )
    assert changed.status_code == 200

    seen = await second_authenticated_client.get(f"/projects/{project_id}")
    assert [field["name"] for field in seen.json()["entry_schema"]] == ["Hours"]


# ── Being invited, and being able to say no (US-2.20) ────────────────────────
#
# Sharing used to grant access the moment an owner typed an email: the project
# appeared in that person's sidebar unasked, and there was no way to give it
# back. An invitation is offered, answered, and can be walked away from.


async def test_an_invitation_grants_nothing_until_it_is_accepted(
    authenticated_client, second_authenticated_client, second_test_user
):
    project_id = await _create_project(authenticated_client)
    await _invite(authenticated_client, project_id)

    listed = await second_authenticated_client.get("/projects")
    assert all(project["id"] != project_id for project in listed.json())

    unreadable = await second_authenticated_client.get(f"/projects/{project_id}")
    assert unreadable.status_code == 404

    refused = await second_authenticated_client.post(
        f"/projects/{project_id}/entries", json={"data": {}}
    )
    assert refused.status_code == 404


async def test_an_invitation_reaches_the_person_it_names(
    authenticated_client, second_authenticated_client, second_test_user
):
    project_id = await _create_project(authenticated_client, name="Fieldwork")
    await authenticated_client.post(f"/projects/{project_id}/entries", json={"data": {}})
    await _invite(authenticated_client, project_id)

    waiting = await second_authenticated_client.get("/invitations")

    assert waiting.status_code == 200
    invitation = waiting.json()[0]
    assert invitation["project_id"] == project_id
    assert invitation["project_name"] == "Fieldwork"
    assert invitation["invited_by_name"] == "Test User"
    # Enough to decide on: an empty project and one with a term's work in it
    # are different propositions.
    assert invitation["entry_count"] == 1


async def test_accepting_an_invitation_opens_the_project(
    authenticated_client, second_authenticated_client, second_test_user
):
    project_id = await _create_project(authenticated_client)
    await _invite(authenticated_client, project_id)

    accepted = await second_authenticated_client.post(f"/invitations/{project_id}/accept")
    assert accepted.status_code == 204

    listed = {project["id"]: project for project in (await second_authenticated_client.get("/projects")).json()}
    assert listed[project_id]["shared"] is True
    assert (await second_authenticated_client.get("/invitations")).json() == []


async def test_declining_an_invitation_keeps_the_project_out_of_the_workspace(
    authenticated_client, second_authenticated_client, second_test_user
):
    project_id = await _create_project(authenticated_client)
    await _invite(authenticated_client, project_id)

    declined = await second_authenticated_client.post(f"/invitations/{project_id}/decline")
    assert declined.status_code == 204

    assert (await second_authenticated_client.get("/invitations")).json() == []
    assert (await second_authenticated_client.get(f"/projects/{project_id}")).status_code == 404


async def test_the_owner_sees_an_invitation_that_has_not_been_answered(
    authenticated_client, second_test_user
):
    """Without this the owner re-sends, because silence looks like failure."""
    project_id = await _create_project(authenticated_client)
    await _invite(authenticated_client, project_id)

    members = (await authenticated_client.get(f"/projects/{project_id}/members")).json()

    assert [member["status"] for member in members] == ["pending"]


async def test_the_owner_sees_that_an_invitation_was_declined(
    authenticated_client, second_authenticated_client, second_test_user
):
    project_id = await _create_project(authenticated_client)
    await _invite(authenticated_client, project_id)
    await second_authenticated_client.post(f"/invitations/{project_id}/decline")

    members = (await authenticated_client.get(f"/projects/{project_id}/members")).json()

    assert [member["status"] for member in members] == ["declined"]


async def test_someone_who_declined_can_be_asked_again(
    authenticated_client, second_authenticated_client, second_test_user
):
    project_id = await _create_project(authenticated_client)
    await _invite(authenticated_client, project_id)
    await second_authenticated_client.post(f"/invitations/{project_id}/decline")

    again = await _invite(authenticated_client, project_id)
    assert again.status_code == 201
    assert again.json()["status"] == "pending"

    waiting = (await second_authenticated_client.get("/invitations")).json()
    assert [invitation["project_id"] for invitation in waiting] == [project_id]

    # And still exactly one row, rather than a second invitation stacked on
    # top of the first.
    members = (await authenticated_client.get(f"/projects/{project_id}/members")).json()
    assert len(members) == 1


async def test_answering_the_same_invitation_twice_is_reported_not_repeated(
    authenticated_client, second_authenticated_client, second_test_user
):
    """A double click or a stale tab, not a server error."""
    project_id = await _create_project(authenticated_client)
    await _invite(authenticated_client, project_id)

    assert (await second_authenticated_client.post(f"/invitations/{project_id}/accept")).status_code == 204
    again = await second_authenticated_client.post(f"/invitations/{project_id}/accept")

    assert again.status_code == 404


async def test_a_member_can_leave_a_project_they_no_longer_contribute_to(
    authenticated_client, second_authenticated_client, second_test_user
):
    project_id = await _create_project(authenticated_client)
    await _share(authenticated_client, second_authenticated_client, project_id)

    left = await second_authenticated_client.delete(f"/projects/{project_id}/membership")
    assert left.status_code == 204

    assert (await second_authenticated_client.get(f"/projects/{project_id}")).status_code == 404
    listed = (await second_authenticated_client.get("/projects")).json()
    assert all(project["id"] != project_id for project in listed)


async def test_leaving_a_project_keeps_the_entries_you_wrote_in_it(
    authenticated_client, second_authenticated_client, second_test_user
):
    """They are part of that project's record, not of your access to it."""
    project_id = await _create_project(authenticated_client)
    await _share(authenticated_client, second_authenticated_client, project_id)
    await second_authenticated_client.post(f"/projects/{project_id}/entries", json={"data": {}})

    await second_authenticated_client.delete(f"/projects/{project_id}/membership")

    entries = (await authenticated_client.get(f"/projects/{project_id}/entries")).json()
    assert [entry["created_by_name"] for entry in entries] == ["Second User"]


async def test_the_owner_cannot_leave_their_own_project(authenticated_client):
    """Archiving and deleting are how an owner finishes with a project.
    Leaving would orphan a record that has nobody else responsible for it."""
    project_id = await _create_project(authenticated_client)

    response = await authenticated_client.delete(f"/projects/{project_id}/membership")

    assert response.status_code == 404


# ── Editing an entry in a shared project ──────────────────────────────────
#
# Membership grants writing your own entries, not rewriting somebody else's.


async def test_a_member_can_correct_an_entry_they_wrote(
    authenticated_client, second_authenticated_client, second_test_user
):
    """A contributor who cannot fix their own typo has to ask the owner to."""
    project_id = await _create_project(authenticated_client)
    await _share(authenticated_client, second_authenticated_client, project_id)
    entry = await second_authenticated_client.post(
        f"/projects/{project_id}/entries", json={"data": {}, "time_spent": 30}
    )
    entry_id = entry.json()["id"]

    corrected = await second_authenticated_client.put(
        f"/projects/{project_id}/entries/{entry_id}", json={"time_spent": 45}
    )

    assert corrected.status_code == 200
    assert corrected.json()["time_spent"] == 45


async def test_a_member_cannot_rewrite_somebody_elses_entry(
    authenticated_client, second_authenticated_client, second_test_user
):
    project_id = await _create_project(authenticated_client)
    await _share(authenticated_client, second_authenticated_client, project_id)
    entry = await authenticated_client.post(
        f"/projects/{project_id}/entries", json={"data": {}}
    )
    entry_id = entry.json()["id"]

    response = await second_authenticated_client.put(
        f"/projects/{project_id}/entries/{entry_id}", json={"time_spent": 999}
    )

    assert response.status_code == 403


async def test_a_member_cannot_delete_somebody_elses_entry(
    authenticated_client, second_authenticated_client, second_test_user
):
    project_id = await _create_project(authenticated_client)
    await _share(authenticated_client, second_authenticated_client, project_id)
    entry = await authenticated_client.post(
        f"/projects/{project_id}/entries", json={"data": {}}
    )
    entry_id = entry.json()["id"]

    response = await second_authenticated_client.delete(
        f"/projects/{project_id}/entries/{entry_id}"
    )

    assert response.status_code == 403


async def test_the_owner_can_correct_an_entry_a_member_wrote(
    authenticated_client, second_authenticated_client, second_test_user
):
    project_id = await _create_project(authenticated_client)
    await _share(authenticated_client, second_authenticated_client, project_id)
    entry = await second_authenticated_client.post(
        f"/projects/{project_id}/entries", json={"data": {}}
    )
    entry_id = entry.json()["id"]

    response = await authenticated_client.delete(
        f"/projects/{project_id}/entries/{entry_id}"
    )

    assert response.status_code == 204
