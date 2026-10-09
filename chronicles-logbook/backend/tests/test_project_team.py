"""Tests for the team view: who is working on a project and what each person has done.

Every figure is counted from stored work, so these build real work through the API
as two different people and read it back, rather than seeding rows.
"""

from sqlalchemy import select, update

from app.models import Entry, ProjectSchemaChange, User

MEMBER_EMAIL = "second@example.com"


async def _project(client, schema=None):
    response = await client.post(
        "/projects",
        json={"name": "Team Project", "entry_schema": schema if schema is not None else []},
    )
    assert response.status_code == 201
    return response.json()["id"]


async def _share(owner, member, project_id):
    assert (await owner.post(f"/projects/{project_id}/members", json={"email": MEMBER_EMAIL})).status_code == 201
    assert (await member.post(f"/invitations/{project_id}/accept")).status_code == 204


async def _team(client, project_id):
    response = await client.get(f"/projects/{project_id}/team")
    assert response.status_code == 200, response.text
    return response.json()


def _person(team, email):
    return next(person for person in team["contributors"] if person["email"] == email)


async def test_a_new_project_has_one_person_with_no_work(authenticated_client):
    project_id = await _project(authenticated_client)

    team = await _team(authenticated_client, project_id)

    assert team["people_working"] == 1
    assert team["people_invited"] == 0
    assert [person["role"] for person in team["contributors"]] == ["owner"]
    assert team["totals"]["entries_logged"] == 0
    assert team["totals"]["last_active"] is None
    assert team["schema_changes_recorded_since"] is None


async def test_entries_and_time_are_counted_per_author(
    authenticated_client, second_authenticated_client
):
    project_id = await _project(authenticated_client)
    await _share(authenticated_client, second_authenticated_client, project_id)
    for client, minutes in [(authenticated_client, 30), (authenticated_client, 15), (second_authenticated_client, 60)]:
        created = await client.post(
            f"/projects/{project_id}/entries", json={"title": "Done", "data": {}, "time_spent": minutes}
        )
        assert created.status_code == 201

    team = await _team(authenticated_client, project_id)

    owner = _person(team, "test@example.com")
    member = _person(team, MEMBER_EMAIL)
    assert (owner["stats"]["entries_logged"], owner["stats"]["time_logged_minutes"]) == (2, 45)
    assert (member["stats"]["entries_logged"], member["stats"]["time_logged_minutes"]) == (1, 60)
    assert team["totals"]["entries_logged"] == 3
    assert team["totals"]["time_logged_minutes"] == 105
    assert team["people_working"] == 2
    assert member["role"] == "member" and member["status"] == "accepted"


async def test_finishing_planned_work_counts_as_completed_for_whoever_finished_it(
    authenticated_client, second_authenticated_client
):
    project_id = await _project(authenticated_client)
    await _share(authenticated_client, second_authenticated_client, project_id)
    planned = await second_authenticated_client.post(
        f"/projects/{project_id}/entries", json={"title": "Plan", "data": {}, "todo": True}
    )
    finished_already = await second_authenticated_client.post(
        f"/projects/{project_id}/entries", json={"title": "Already done", "data": {}}
    )
    assert planned.status_code == finished_already.status_code == 201

    # The owner may edit any entry; the author finishes their own.
    finished = await second_authenticated_client.put(
        f"/projects/{project_id}/entries/{planned.json()['id']}", json={"todo": False}
    )
    assert finished.status_code == 200, finished.text

    team = await _team(authenticated_client, project_id)

    member = _person(team, MEMBER_EMAIL)["stats"]
    assert member["entries_logged"] == 2
    # Only the one that was outstanding and then finished; "Already done" never was.
    assert member["entries_completed"] == 1
    assert member["entries_edited"] == 1
    assert _person(team, "test@example.com")["stats"]["entries_completed"] == 0


async def test_an_edit_by_the_owner_is_credited_to_the_owner_not_the_author(
    authenticated_client, second_authenticated_client
):
    project_id = await _project(authenticated_client)
    await _share(authenticated_client, second_authenticated_client, project_id)
    entry = await second_authenticated_client.post(
        f"/projects/{project_id}/entries", json={"title": "Typo", "data": {}}
    )
    fixed = await authenticated_client.put(
        f"/projects/{project_id}/entries/{entry.json()['id']}", json={"title": "Fixed"}
    )
    assert fixed.status_code == 200

    team = await _team(authenticated_client, project_id)

    assert _person(team, "test@example.com")["stats"]["entries_edited"] == 1
    assert _person(team, MEMBER_EMAIL)["stats"]["entries_edited"] == 0
    assert _person(team, MEMBER_EMAIL)["stats"]["entries_logged"] == 1


async def test_tasks_created_and_completed_are_credited_to_different_people(
    authenticated_client, second_authenticated_client
):
    project_id = await _project(authenticated_client)
    await _share(authenticated_client, second_authenticated_client, project_id)
    task = await authenticated_client.post(f"/projects/{project_id}/tasks", json={"title": "Ship it"})
    assert task.status_code == 201
    toggled = await second_authenticated_client.patch(f"/projects/{project_id}/tasks/{task.json()['id']}/toggle")
    assert toggled.status_code == 200

    team = await _team(authenticated_client, project_id)

    assert _person(team, "test@example.com")["stats"]["tasks_created"] == 1
    assert _person(team, "test@example.com")["stats"]["tasks_completed"] == 0
    assert _person(team, MEMBER_EMAIL)["stats"]["tasks_completed"] == 1
    assert team["totals"]["tasks_created"] == 1
    assert team["totals"]["tasks_completed"] == 1


async def test_a_reopened_task_is_no_longer_counted_as_completed(authenticated_client):
    project_id = await _project(authenticated_client)
    task = (await authenticated_client.post(f"/projects/{project_id}/tasks", json={"title": "Flip"})).json()
    for _ in range(2):
        await authenticated_client.patch(f"/projects/{project_id}/tasks/{task['id']}/toggle")

    team = await _team(authenticated_client, project_id)

    assert team["totals"]["tasks_completed"] == 0


async def test_a_schema_change_is_recorded_with_who_made_it(authenticated_client):
    project_id = await _project(authenticated_client)
    new_schema = [{"id": "f-weight", "name": "Weight", "type": "number"}]

    saved = await authenticated_client.put(f"/projects/{project_id}/schema", json={"entry_schema": new_schema})
    assert saved.status_code == 200, saved.text
    team = await _team(authenticated_client, project_id)

    assert _person(team, "test@example.com")["stats"]["schema_changes"] == 1
    assert team["schema_changes_recorded_since"] is not None


async def test_resending_the_same_schema_to_rename_a_project_is_not_a_schema_change(authenticated_client):
    schema = [{"id": "f-weight", "name": "Weight", "type": "number"}]
    project_id = await _project(authenticated_client, schema)

    renamed = await authenticated_client.put(
        f"/projects/{project_id}", json={"name": "New name", "entry_schema": schema}
    )
    assert renamed.status_code == 200, renamed.text

    team = await _team(authenticated_client, project_id)
    assert team["totals"]["schema_changes"] == 0


async def test_invited_people_are_listed_but_do_not_count_as_working(
    authenticated_client, second_test_user
):
    project_id = await _project(authenticated_client)
    await authenticated_client.post(f"/projects/{project_id}/members", json={"email": MEMBER_EMAIL})

    team = await _team(authenticated_client, project_id)

    assert team["people_working"] == 1
    assert team["people_invited"] == 1
    invited = _person(team, MEMBER_EMAIL)
    assert invited["status"] == "pending"
    assert invited["stats"]["entries_logged"] == 0


async def test_someone_who_left_still_appears_with_their_work(
    authenticated_client, second_authenticated_client
):
    project_id = await _project(authenticated_client)
    await _share(authenticated_client, second_authenticated_client, project_id)
    await second_authenticated_client.post(f"/projects/{project_id}/entries", json={"title": "Mine", "data": {}})
    left = await second_authenticated_client.delete(f"/projects/{project_id}/membership")
    assert left.status_code == 204

    team = await _team(authenticated_client, project_id)

    former = _person(team, MEMBER_EMAIL)
    assert former["role"] == "former"
    assert former["stats"]["entries_logged"] == 1
    assert team["people_working"] == 1


async def test_work_with_no_recorded_author_is_shown_as_one_unknown_row(
    authenticated_client, db_session
):
    project_id = await _project(authenticated_client)
    await authenticated_client.post(f"/projects/{project_id}/entries", json={"title": "Old", "data": {}})
    await db_session.execute(update(Entry).values(created_by=None))
    await db_session.commit()

    team = await _team(authenticated_client, project_id)

    unknown = next(person for person in team["contributors"] if person["role"] == "unknown")
    assert unknown["user_id"] is None
    assert unknown["stats"]["entries_logged"] == 1


async def test_deleted_entries_are_not_counted(authenticated_client):
    project_id = await _project(authenticated_client)
    entry = (
        await authenticated_client.post(f"/projects/{project_id}/entries", json={"title": "Gone", "data": {}})
    ).json()
    await authenticated_client.delete(f"/projects/{project_id}/entries/{entry['id']}")

    team = await _team(authenticated_client, project_id)

    assert team["totals"]["entries_logged"] == 0


async def test_a_project_you_cannot_read_is_not_found(authenticated_client, second_authenticated_client):
    project_id = await _project(authenticated_client)

    response = await second_authenticated_client.get(f"/projects/{project_id}/team")

    assert response.status_code == 404


async def test_a_pending_invitee_cannot_read_the_team(authenticated_client, second_authenticated_client):
    project_id = await _project(authenticated_client)
    await authenticated_client.post(f"/projects/{project_id}/members", json={"email": MEMBER_EMAIL})

    assert (await second_authenticated_client.get(f"/projects/{project_id}/team")).status_code == 404


async def test_an_accepted_member_can_read_the_team(authenticated_client, second_authenticated_client):
    project_id = await _project(authenticated_client)
    await _share(authenticated_client, second_authenticated_client, project_id)

    team = await _team(second_authenticated_client, project_id)

    assert team["people_working"] == 2


async def test_the_team_needs_a_signed_in_user(async_client, authenticated_client):
    project_id = await _project(authenticated_client)

    assert (await async_client.get(f"/projects/{project_id}/team")).status_code == 401


async def test_a_schema_change_survives_its_author_leaving(authenticated_client, db_session, test_user):
    project_id = await _project(authenticated_client)
    await authenticated_client.put(
        f"/projects/{project_id}/schema",
        json={"entry_schema": [{"id": "f-x", "name": "X", "type": "text"}]},
    )
    # An account being deleted clears the author rather than the record.
    await db_session.execute(update(ProjectSchemaChange).values(changed_by=None))
    await db_session.commit()
    rows = (await db_session.scalars(select(ProjectSchemaChange))).all()
    assert len(rows) == 1 and rows[0].changed_by is None

    team = await _team(authenticated_client, project_id)

    unknown = next(person for person in team["contributors"] if person["role"] == "unknown")
    assert unknown["stats"]["schema_changes"] == 1
    assert test_user.email == "test@example.com"
    assert isinstance(test_user, User)
