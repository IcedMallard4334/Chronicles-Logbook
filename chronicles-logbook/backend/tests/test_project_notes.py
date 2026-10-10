"""Project notes: private to the author, or shared with the team.

The rule that matters most is that a private note is never visible to anyone else, so
those tests read as the other person and as the owner, through every route.
"""

from uuid import uuid4

from sqlalchemy import select, update

from app.models import ProjectNote
from app.schemas import MAX_NOTE_LENGTH

MEMBER_EMAIL = "second@example.com"


async def _project(client):
    response = await client.post("/projects", json={"name": "Noted", "entry_schema": []})
    assert response.status_code == 201
    return response.json()["id"]


async def _share(owner, member, project_id):
    assert (await owner.post(f"/projects/{project_id}/members", json={"email": MEMBER_EMAIL})).status_code == 201
    assert (await member.post(f"/invitations/{project_id}/accept")).status_code == 204


async def _note(client, project_id, body="Remember", **extra):
    response = await client.post(f"/projects/{project_id}/notes", json={"body": body, **extra})
    assert response.status_code == 201, response.text
    return response.json()


async def _bodies(client, project_id, query=""):
    response = await client.get(f"/projects/{project_id}/notes{query}")
    assert response.status_code == 200, response.text
    return [note["body"] for note in response.json()]


async def test_a_note_is_private_unless_it_is_shared(authenticated_client):
    project_id = await _project(authenticated_client)

    note = await _note(authenticated_client, project_id)

    assert note["visibility"] == "private"
    assert note["pinned"] is False
    assert note["mine"] and note["can_edit"] and note["can_delete"]
    assert note["author"]["full_name"]


async def test_a_private_note_is_invisible_to_everyone_else_including_the_owner(
    authenticated_client, second_authenticated_client
):
    project_id = await _project(authenticated_client)
    await _share(authenticated_client, second_authenticated_client, project_id)
    secret = await _note(second_authenticated_client, project_id, "member secret")
    url = f"/projects/{project_id}/notes/{secret['id']}"

    assert await _bodies(authenticated_client, project_id) == []
    assert await _bodies(authenticated_client, project_id, "?visibility=private") == []
    assert (await authenticated_client.put(url, json={"body": "x"})).status_code == 404
    assert (await authenticated_client.delete(url)).status_code == 404
    assert await _bodies(second_authenticated_client, project_id) == ["member secret"]


async def test_a_shared_note_is_seen_by_the_team_with_its_author(
    authenticated_client, second_authenticated_client
):
    project_id = await _project(authenticated_client)
    await _share(authenticated_client, second_authenticated_client, project_id)
    written = await _note(second_authenticated_client, project_id, "for everyone", visibility="shared")

    seen = (await authenticated_client.get(f"/projects/{project_id}/notes")).json()

    assert [note["body"] for note in seen] == ["for everyone"]
    assert seen[0]["author"]["full_name"] == written["author"]["full_name"]
    assert seen[0]["author"]["user_id"] == written["author"]["user_id"]
    assert seen[0]["mine"] is False
    assert seen[0]["can_edit"] is False


async def test_only_the_author_can_edit_a_shared_note(authenticated_client, second_authenticated_client):
    project_id = await _project(authenticated_client)
    await _share(authenticated_client, second_authenticated_client, project_id)
    note = await _note(second_authenticated_client, project_id, "mine", visibility="shared")
    url = f"/projects/{project_id}/notes/{note['id']}"

    assert (await authenticated_client.put(url, json={"body": "hijack"})).status_code == 403
    assert (await second_authenticated_client.put(url, json={"body": "edited"})).json()["body"] == "edited"


async def test_the_owner_can_delete_a_shared_note_but_a_member_cannot_delete_the_owners(
    authenticated_client, second_authenticated_client
):
    project_id = await _project(authenticated_client)
    await _share(authenticated_client, second_authenticated_client, project_id)
    theirs = await _note(second_authenticated_client, project_id, "theirs", visibility="shared")
    ours = await _note(authenticated_client, project_id, "ours", visibility="shared")

    as_owner = (await authenticated_client.get(f"/projects/{project_id}/notes")).json()
    assert {n["body"]: n["can_delete"] for n in as_owner} == {"theirs": True, "ours": True}
    as_member = (await second_authenticated_client.get(f"/projects/{project_id}/notes")).json()
    assert {n["body"]: n["can_delete"] for n in as_member} == {"theirs": True, "ours": False}

    assert (await second_authenticated_client.delete(f"/projects/{project_id}/notes/{ours['id']}")).status_code == 403
    assert (await authenticated_client.delete(f"/projects/{project_id}/notes/{theirs['id']}")).status_code == 204
    assert await _bodies(authenticated_client, project_id) == ["ours"]


async def test_switching_a_note_back_to_private_hides_it_again(
    authenticated_client, second_authenticated_client
):
    project_id = await _project(authenticated_client)
    await _share(authenticated_client, second_authenticated_client, project_id)
    note = await _note(authenticated_client, project_id, "was shared", visibility="shared")
    assert await _bodies(second_authenticated_client, project_id) == ["was shared"]

    updated = await authenticated_client.put(
        f"/projects/{project_id}/notes/{note['id']}", json={"visibility": "private"}
    )

    assert updated.json()["visibility"] == "private"
    assert await _bodies(second_authenticated_client, project_id) == []


async def test_pinned_notes_come_first_then_the_most_recently_changed(authenticated_client):
    project_id = await _project(authenticated_client)
    first = await _note(authenticated_client, project_id, "first")
    await _note(authenticated_client, project_id, "second")
    await authenticated_client.put(f"/projects/{project_id}/notes/{first['id']}", json={"pinned": True})

    assert await _bodies(authenticated_client, project_id) == ["first", "second"]


async def test_the_list_can_be_narrowed_to_one_kind(authenticated_client):
    project_id = await _project(authenticated_client)
    await _note(authenticated_client, project_id, "mine only")
    await _note(authenticated_client, project_id, "for all", visibility="shared")

    assert await _bodies(authenticated_client, project_id, "?visibility=shared") == ["for all"]
    assert await _bodies(authenticated_client, project_id, "?visibility=private") == ["mine only"]
    assert (await authenticated_client.get(f"/projects/{project_id}/notes?visibility=other")).status_code == 422


async def test_someone_with_no_access_to_the_project_gets_not_found(
    authenticated_client, second_authenticated_client
):
    project_id = await _project(authenticated_client)
    note = await _note(authenticated_client, project_id, "x", visibility="shared")

    assert (await second_authenticated_client.get(f"/projects/{project_id}/notes")).status_code == 404
    post = await second_authenticated_client.post(f"/projects/{project_id}/notes", json={"body": "hi"})
    assert post.status_code == 404
    assert (await second_authenticated_client.delete(f"/projects/{project_id}/notes/{note['id']}")).status_code == 404


async def test_an_invitation_not_yet_accepted_grants_no_notes(authenticated_client, second_authenticated_client):
    project_id = await _project(authenticated_client)
    await _note(authenticated_client, project_id, "x", visibility="shared")
    await authenticated_client.post(f"/projects/{project_id}/members", json={"email": MEMBER_EMAIL})

    assert (await second_authenticated_client.get(f"/projects/{project_id}/notes")).status_code == 404


async def test_a_note_must_have_text_and_stay_within_the_limit(authenticated_client):
    project_id = await _project(authenticated_client)
    url = f"/projects/{project_id}/notes"

    assert (await authenticated_client.post(url, json={"body": "   "})).status_code == 422
    assert (await authenticated_client.post(url, json={"body": ""})).status_code == 422
    assert (await authenticated_client.post(url, json={"body": "x" * (MAX_NOTE_LENGTH + 1)})).status_code == 422
    assert (await authenticated_client.post(url, json={"body": "x" * MAX_NOTE_LENGTH})).status_code == 201

    note = await _note(authenticated_client, project_id, "keep")
    assert (await authenticated_client.put(f"{url}/{note['id']}", json={"body": "  "})).status_code == 422


async def test_a_note_in_another_project_is_not_reachable_through_this_one(authenticated_client):
    one = await _project(authenticated_client)
    two = await _project(authenticated_client)
    note = await _note(authenticated_client, one, "in one")

    assert (await authenticated_client.delete(f"/projects/{two}/notes/{note['id']}")).status_code == 404
    assert (await authenticated_client.delete(f"/projects/{one}/notes/{uuid4()}")).status_code == 404


async def test_deleting_a_project_removes_its_notes(authenticated_client, db_session):
    project_id = await _project(authenticated_client)
    await _note(authenticated_client, project_id)

    assert (await authenticated_client.delete(f"/projects/{project_id}")).status_code == 204
    assert (await db_session.scalars(select(ProjectNote))).all() == []


async def test_a_shared_note_outlives_its_authors_account_as_former_member(
    authenticated_client, second_authenticated_client, db_session
):
    project_id = await _project(authenticated_client)
    await _share(authenticated_client, second_authenticated_client, project_id)
    await _note(second_authenticated_client, project_id, "left behind", visibility="shared")
    await _note(second_authenticated_client, project_id, "private left behind")
    await db_session.execute(update(ProjectNote).values(author_id=None))
    await db_session.commit()

    notes = (await authenticated_client.get(f"/projects/{project_id}/notes")).json()

    assert [n["body"] for n in notes] == ["left behind"]
    assert notes[0]["author"]["full_name"] == "Former member"
    assert notes[0]["can_edit"] is False
    assert notes[0]["can_delete"] is True  # the owner may take it down
