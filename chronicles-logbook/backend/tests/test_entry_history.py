"""Entry history & corrections (US-3.10): versions, as-of views, reverts, tombstones."""

from uuid import UUID

import pytest_asyncio

from app.models import Entry
from app.schemas import FieldType

SCHEMA = [
    {"id": "hours", "name": "Hours", "type": FieldType.NUMBER.value},
    {"id": "notes", "name": "Notes", "type": FieldType.TEXT.value},
    {"id": "link", "name": "Follows", "type": FieldType.LINK.value},
]


@pytest_asyncio.fixture(loop_scope="function")
async def project(authenticated_client):
    response = await authenticated_client.post(
        "/projects", json={"name": "History", "entry_schema": SCHEMA}
    )
    return response.json()


@pytest_asyncio.fixture(loop_scope="function")
async def entry(authenticated_client, project):
    response = await authenticated_client.post(
        f"/projects/{project['id']}/entries",
        json={"title": "Original", "data": {"hours": 2, "notes": "First draft", "link": ""}},
    )
    assert response.status_code == 201
    return response.json()


async def _history(client, project, entry_id):
    response = await client.get(f"/projects/{project['id']}/entries/{entry_id}/history")
    assert response.status_code == 200
    return response.json()


async def test_the_initial_entry_is_version_one(authenticated_client, project, entry):
    [first] = await _history(authenticated_client, project, entry["id"])
    assert first["revision"] == 1
    assert first["action"] == "created"
    assert first["title"] == "Original"
    assert first["data"]["notes"] == "First draft"


async def test_an_edit_keeps_the_previous_version_and_records_what_changed(
    authenticated_client, project, entry
):
    response = await authenticated_client.put(
        f"/projects/{project['id']}/entries/{entry['id']}",
        json={"data": {"hours": 3, "notes": "First draft", "link": ""}, "note": "Miscounted hours"},
    )
    assert response.status_code == 200

    latest, original = await _history(authenticated_client, project, entry["id"])
    assert latest["revision"] == 2
    assert latest["action"] == "edited"
    assert latest["note"] == "Miscounted hours"
    assert latest["changed_fields"] == ["data.hours"]
    assert latest["previous_values"] == {"data.hours": 2}
    assert latest["entry_id"] == original["entry_id"] == entry["id"]
    assert original["data"]["hours"] == 2


async def test_a_save_that_changes_nothing_adds_no_version(authenticated_client, project, entry):
    await authenticated_client.put(
        f"/projects/{project['id']}/entries/{entry['id']}",
        json={"data": {"hours": 2, "notes": "First draft", "link": ""}},
    )
    assert len(await _history(authenticated_client, project, entry["id"])) == 1


async def test_an_entry_without_history_keeps_its_original_on_first_edit(
    authenticated_client, db_session, project
):
    # As entries saved before history existed look: a row with no versions.
    legacy = Entry(
        project_id=UUID(project["id"]),
        title="Legacy",
        data={"hours": 1, "notes": "Before history", "link": ""},
        schema_version=project["schema_version"],
        schema_snapshot=SCHEMA,
    )
    db_session.add(legacy)
    await db_session.commit()

    await authenticated_client.put(
        f"/projects/{project['id']}/entries/{legacy.id}",
        json={"data": {"hours": 1, "notes": "Corrected", "link": ""}},
    )

    latest, original = await _history(authenticated_client, project, legacy.id)
    assert (original["revision"], original["action"]) == (1, "created")
    assert original["data"]["notes"] == "Before history"
    assert latest["data"]["notes"] == "Corrected"
    assert latest["previous_values"] == {"data.notes": "Before history"}


async def test_revert_adds_a_version_matching_the_target(authenticated_client, project, entry):
    url = f"/projects/{project['id']}/entries/{entry['id']}"
    await authenticated_client.put(url, json={"title": "Second", "data": {"hours": 5, "notes": "v2", "link": ""}})
    await authenticated_client.put(url, json={"title": "Third", "data": {"hours": 9, "notes": "v3", "link": ""}})

    response = await authenticated_client.post(f"{url}/revert", json={"revision": 1, "note": "Typo"})
    assert response.status_code == 200
    reverted = response.json()
    assert reverted["id"] == entry["id"]
    assert reverted["title"] == "Original"
    assert reverted["data"] == {"hours": 2, "notes": "First draft", "link": ""}

    history = await _history(authenticated_client, project, entry["id"])
    assert [version["revision"] for version in history] == [4, 3, 2, 1]
    assert history[0]["action"] == "reverted"
    assert history[0]["reverted_to"] == 1
    assert history[0]["note"] == "Reverted to v1. Typo"
    assert history[1]["data"]["notes"] == "v3"

    current = await authenticated_client.get(url)
    assert current.json()["data"] == {"hours": 2, "notes": "First draft", "link": ""}


async def test_revert_rejects_the_current_or_a_missing_version(authenticated_client, project, entry):
    url = f"/projects/{project['id']}/entries/{entry['id']}/revert"
    assert (await authenticated_client.post(url, json={"revision": 1})).status_code == 422
    assert (await authenticated_client.post(url, json={"revision": 7})).status_code == 404


async def test_delete_is_a_tombstone_and_revert_restores(authenticated_client, project, entry):
    base = f"/projects/{project['id']}/entries"
    response = await authenticated_client.delete(f"{base}/{entry['id']}?note=Duplicate")
    assert response.status_code == 204

    assert (await authenticated_client.get(f"{base}/{entry['id']}")).status_code == 404
    listed = await authenticated_client.get(base)
    assert entry["id"] not in [item["id"] for item in listed.json()]
    deleted = await authenticated_client.get(f"{base}/deleted")
    assert [item["id"] for item in deleted.json()] == [entry["id"]]

    tombstone, original = await _history(authenticated_client, project, entry["id"])
    assert (tombstone["revision"], tombstone["action"], tombstone["note"]) == (2, "deleted", "Duplicate")
    assert tombstone["data"] == original["data"]

    refused = await authenticated_client.post(f"{base}/{entry['id']}/revert", json={"revision": 2})
    assert refused.status_code == 422

    restored = await authenticated_client.post(f"{base}/{entry['id']}/revert", json={"revision": 1})
    assert restored.status_code == 200
    assert restored.json()["deleted_at"] is None
    assert (await authenticated_client.get(f"{base}/{entry['id']}")).status_code == 200
    assert (await authenticated_client.get(f"{base}/deleted")).json() == []
    latest = (await _history(authenticated_client, project, entry["id"]))[0]
    assert latest["note"] == "Restored and reverted to v1."


async def test_a_deleted_entry_cannot_be_edited(authenticated_client, project, entry):
    url = f"/projects/{project['id']}/entries/{entry['id']}"
    await authenticated_client.delete(url)
    response = await authenticated_client.put(url, json={"title": "Sneaky"})
    assert response.status_code == 404


async def test_replaying_a_create_for_a_deleted_entry_does_not_resurrect_it(
    authenticated_client, project, entry
):
    base = f"/projects/{project['id']}/entries"
    await authenticated_client.delete(f"{base}/{entry['id']}")
    replay = await authenticated_client.post(
        base, json={"id": entry["id"], "data": {"hours": 2, "notes": "First draft", "link": ""}}
    )
    assert replay.status_code == 409


async def test_clearing_a_link_on_delete_is_versioned(authenticated_client, project, entry):
    base = f"/projects/{project['id']}/entries"
    follower = await authenticated_client.post(
        base, json={"data": {"hours": 1, "notes": "Next", "link": entry["id"]}}
    )
    await authenticated_client.delete(f"{base}/{entry['id']}")

    latest, original = await _history(authenticated_client, project, follower.json()["id"])
    assert original["data"]["link"] == entry["id"]
    assert latest["data"]["link"] is None
    assert latest["previous_values"] == {"data.link": entry["id"]}


async def test_a_collaborator_cannot_revert_the_owners_entry(
    authenticated_client, second_authenticated_client, project, entry
):
    response = await second_authenticated_client.post(
        f"/projects/{project['id']}/entries/{entry['id']}/revert", json={"revision": 1}
    )
    assert response.status_code == 404
