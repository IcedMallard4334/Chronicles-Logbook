"""Tests for the project activity feed and for telling an owner an invitation was answered."""

from datetime import datetime, timedelta, timezone

from sqlalchemy import update

from app.models import ProjectMember

MEMBER_EMAIL = "second@example.com"


async def _project(client):
    response = await client.post("/projects", json={"name": "Feed Project", "entry_schema": []})
    assert response.status_code == 201
    return response.json()["id"]


async def _share(owner, member, project_id):
    assert (await owner.post(f"/projects/{project_id}/members", json={"email": MEMBER_EMAIL})).status_code == 201
    assert (await member.post(f"/invitations/{project_id}/accept")).status_code == 204


async def _feed(client, project_id, **params):
    response = await client.get(f"/projects/{project_id}/activity", params=params)
    assert response.status_code == 200, response.text
    return response.json()["items"]


def _kinds(items):
    return [item["kind"] for item in items]


# ── The activity feed ────────────────────────────────────────────────────────


async def test_an_empty_project_has_an_empty_feed(authenticated_client):
    project_id = await _project(authenticated_client)

    assert await _feed(authenticated_client, project_id) == []


async def test_the_feed_says_who_did_what_newest_first(authenticated_client, second_authenticated_client):
    project_id = await _project(authenticated_client)
    await _share(authenticated_client, second_authenticated_client, project_id)
    planned = (
        await second_authenticated_client.post(
            f"/projects/{project_id}/entries", json={"title": "Plan the lab", "data": {}, "todo": True}
        )
    ).json()
    await second_authenticated_client.put(f"/projects/{project_id}/entries/{planned['id']}", json={"todo": False})
    task = (await authenticated_client.post(f"/projects/{project_id}/tasks", json={"title": "Book room"})).json()
    await second_authenticated_client.patch(f"/projects/{project_id}/tasks/{task['id']}/toggle")

    items = await _feed(authenticated_client, project_id)

    by_kind = {item["kind"]: item for item in items}
    assert {"entry_logged", "entry_completed", "task_added", "task_completed", "member_joined"} <= set(_kinds(items))
    assert by_kind["entry_logged"]["actor_name"] == "Second User"
    assert by_kind["entry_logged"]["subject"] == "Plan the lab"
    assert by_kind["entry_completed"]["actor_name"] == "Second User"
    assert by_kind["task_added"]["actor_name"] == "Test User"
    assert by_kind["task_completed"]["actor_name"] == "Second User"
    assert by_kind["task_completed"]["subject"] == "Book room"
    times = [item["at"] for item in items]
    assert times == sorted(times, reverse=True)


async def test_an_edit_that_does_not_finish_anything_is_just_an_edit(authenticated_client):
    project_id = await _project(authenticated_client)
    entry = (await authenticated_client.post(f"/projects/{project_id}/entries", json={"title": "A", "data": {}})).json()
    await authenticated_client.put(f"/projects/{project_id}/entries/{entry['id']}", json={"title": "B"})

    kinds = _kinds(await _feed(authenticated_client, project_id))

    assert kinds.count("entry_edited") == 1
    assert "entry_completed" not in kinds


async def test_deleting_an_entry_still_shows_in_the_feed(authenticated_client):
    project_id = await _project(authenticated_client)
    entry = (await authenticated_client.post(f"/projects/{project_id}/entries", json={"title": "Gone", "data": {}})).json()
    await authenticated_client.delete(f"/projects/{project_id}/entries/{entry['id']}")

    items = await _feed(authenticated_client, project_id)

    deleted = next(item for item in items if item["kind"] == "entry_deleted")
    assert deleted["subject"] == "Gone"
    assert "entry_logged" in _kinds(items)


async def test_reverting_is_reported_as_a_revert(authenticated_client):
    project_id = await _project(authenticated_client)
    entry = (await authenticated_client.post(f"/projects/{project_id}/entries", json={"title": "One", "data": {}})).json()
    await authenticated_client.put(f"/projects/{project_id}/entries/{entry['id']}", json={"title": "Two"})
    reverted = await authenticated_client.post(f"/projects/{project_id}/entries/{entry['id']}/revert", json={"revision": 1})
    assert reverted.status_code == 200, reverted.text

    assert "entry_reverted" in _kinds(await _feed(authenticated_client, project_id))


async def test_a_schema_change_names_what_changed(authenticated_client):
    project_id = await _project(authenticated_client)
    await authenticated_client.put(
        f"/projects/{project_id}/schema",
        json={"entry_schema": [{"id": "f-w", "name": "Weight", "type": "number"}]},
    )

    changed = next(item for item in await _feed(authenticated_client, project_id) if item["kind"] == "schema_changed")

    assert "Weight" in changed["subject"]
    assert changed["actor_name"] == "Test User"


async def test_a_declined_invitation_is_in_the_feed(authenticated_client, second_authenticated_client):
    project_id = await _project(authenticated_client)
    await authenticated_client.post(f"/projects/{project_id}/members", json={"email": MEMBER_EMAIL})
    await second_authenticated_client.post(f"/invitations/{project_id}/decline")

    items = await _feed(authenticated_client, project_id)

    assert [item["kind"] for item in items] == ["member_declined"]
    assert items[0]["actor_name"] == "Second User"


async def test_the_limit_caps_the_feed(authenticated_client):
    project_id = await _project(authenticated_client)
    for index in range(5):
        await authenticated_client.post(f"/projects/{project_id}/entries", json={"title": f"E{index}", "data": {}})

    assert len(await _feed(authenticated_client, project_id, limit=3)) == 3
    assert (await authenticated_client.get(f"/projects/{project_id}/activity?limit=0")).status_code == 422
    assert (await authenticated_client.get(f"/projects/{project_id}/activity?limit=101")).status_code == 422


async def test_the_feed_is_for_people_who_can_read_the_project(
    authenticated_client, second_authenticated_client, async_client
):
    project_id = await _project(authenticated_client)

    assert (await second_authenticated_client.get(f"/projects/{project_id}/activity")).status_code == 404
    await authenticated_client.post(f"/projects/{project_id}/members", json={"email": MEMBER_EMAIL})
    assert (await second_authenticated_client.get(f"/projects/{project_id}/activity")).status_code == 404
    await second_authenticated_client.post(f"/invitations/{project_id}/accept")
    assert (await second_authenticated_client.get(f"/projects/{project_id}/activity")).status_code == 200


async def test_an_author_who_is_not_recorded_is_called_someone(authenticated_client, db_session):
    from app.models import Entry, EntryRevision

    project_id = await _project(authenticated_client)
    await authenticated_client.post(f"/projects/{project_id}/entries", json={"title": "Old", "data": {}})
    await db_session.execute(update(Entry).values(created_by=None))
    await db_session.execute(update(EntryRevision).values(changed_by=None))
    await db_session.commit()

    items = await _feed(authenticated_client, project_id)

    assert items[0]["actor_name"] == "Someone"
    assert items[0]["actor_id"] is None


# ── Telling the owner an invitation was answered ─────────────────────────────


async def test_the_owner_is_told_when_an_invitation_is_accepted_or_declined(
    authenticated_client, second_authenticated_client
):
    joined = await _project(authenticated_client)
    declined = await _project(authenticated_client)
    await _share(authenticated_client, second_authenticated_client, joined)
    await authenticated_client.post(f"/projects/{declined}/members", json={"email": MEMBER_EMAIL})
    await second_authenticated_client.post(f"/invitations/{declined}/decline")

    response = await authenticated_client.get("/invitations/answers")

    assert response.status_code == 200
    answers = {item["project_id"]: item for item in response.json()}
    assert answers[joined]["answer"] == "accepted"
    assert answers[declined]["answer"] == "declined"
    assert answers[joined]["person_name"] == "Second User"
    assert answers[joined]["project_name"] == "Feed Project"


async def test_an_unanswered_invitation_is_not_an_answer(authenticated_client, second_test_user):
    project_id = await _project(authenticated_client)
    await authenticated_client.post(f"/projects/{project_id}/members", json={"email": MEMBER_EMAIL})

    assert (await authenticated_client.get("/invitations/answers")).json() == []


async def test_only_the_owner_is_told(authenticated_client, second_authenticated_client):
    project_id = await _project(authenticated_client)
    await _share(authenticated_client, second_authenticated_client, project_id)

    # The person who answered is not the one who asked.
    assert (await second_authenticated_client.get("/invitations/answers")).json() == []


async def test_dismissing_clears_the_notices_and_they_stay_cleared(authenticated_client, second_authenticated_client):
    project_id = await _project(authenticated_client)
    await _share(authenticated_client, second_authenticated_client, project_id)
    assert len((await authenticated_client.get("/invitations/answers")).json()) == 1

    dismissed = await authenticated_client.post("/invitations/answers/seen")

    assert dismissed.status_code == 204
    assert (await authenticated_client.get("/invitations/answers")).json() == []
    assert (await authenticated_client.get("/invitations/answers")).json() == []


async def test_dismissing_does_not_touch_other_peoples_notices(authenticated_client, second_authenticated_client):
    project_id = await _project(authenticated_client)
    await _share(authenticated_client, second_authenticated_client, project_id)

    await second_authenticated_client.post("/invitations/answers/seen")

    assert len((await authenticated_client.get("/invitations/answers")).json()) == 1


async def test_an_answer_older_than_two_weeks_is_not_offered(authenticated_client, second_authenticated_client, db_session):
    project_id = await _project(authenticated_client)
    await _share(authenticated_client, second_authenticated_client, project_id)
    await db_session.execute(
        update(ProjectMember).values(responded_at=datetime.now(timezone.utc) - timedelta(days=15))
    )
    await db_session.commit()

    assert (await authenticated_client.get("/invitations/answers")).json() == []


async def test_a_member_added_before_answers_were_recorded_gives_no_notice(
    authenticated_client, second_authenticated_client, db_session
):
    project_id = await _project(authenticated_client)
    await _share(authenticated_client, second_authenticated_client, project_id)
    await db_session.execute(update(ProjectMember).values(responded_at=None))
    await db_session.commit()

    assert (await authenticated_client.get("/invitations/answers")).json() == []


async def test_the_answers_need_a_signed_in_user(async_client):
    assert (await async_client.get("/invitations/answers")).status_code == 401
    assert (await async_client.post("/invitations/answers/seen")).status_code == 401
