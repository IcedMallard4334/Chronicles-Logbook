"""Tests for Person 1 rich-field types: tags (US-2.1), checklist (US-2.2), link (US-2.3)."""

from uuid import uuid4

import pytest_asyncio

from app.schemas import FieldType

# ── Fixtures ──────────────────────────────────────────────────────────


@pytest_asyncio.fixture(loop_scope="function")
async def rich_project(authenticated_client):
    """Project with tags, checklist, and link fields in its schema."""
    schema = [
        {"id": "f-title", "name": "Title", "type": FieldType.TEXT.value},
        {"id": "f-tags", "name": "Tags", "type": FieldType.TAGS.value},
        {
            "id": "f-checklist",
            "name": "Sub-tasks",
            "type": FieldType.CHECKLIST.value,
        },
        {"id": "f-link", "name": "Related entry", "type": FieldType.LINK.value},
    ]
    response = await authenticated_client.post(
        "/projects",
        json={"name": "Rich Fields Project", "entry_schema": schema},
    )
    assert response.status_code == 201
    return response.json()


@pytest_asyncio.fixture(loop_scope="function")
async def entry_a(authenticated_client, rich_project):
    """A baseline entry with all rich-field types populated."""
    pid = rich_project["id"]
    response = await authenticated_client.post(
        f"/projects/{pid}/entries",
        json={
            "data": {
                "f-title": "Entry A",
                "f-tags": ["backend", "api"],
                "f-checklist": [
                    {"id": "ci-1", "text": "Write tests", "completed": False},
                    {"id": "ci-2", "text": "Review PR", "completed": True},
                ],
                "f-link": "",
            },
        },
    )
    assert response.status_code == 201
    return response.json()


# ── US-2.1  Tag entries ─────────────────────────────────────────────


async def test_create_entry_with_tags(authenticated_client, rich_project):
    """Tags stored as a list of strings and round-tripped correctly."""
    pid = rich_project["id"]
    response = await authenticated_client.post(
        f"/projects/{pid}/entries",
        json={
            "data": {
                "f-title": "Tagged entry",
                "f-tags": ["sprint-2", "testing"],
                "f-checklist": [],
                "f-link": "",
            },
        },
    )
    assert response.status_code == 201
    assert response.json()["data"]["f-tags"] == ["sprint-2", "testing"]


async def test_tags_reject_non_list(authenticated_client, rich_project):
    """Tags field must be a list — a bare string is rejected."""
    pid = rich_project["id"]
    response = await authenticated_client.post(
        f"/projects/{pid}/entries",
        json={
            "data": {
                "f-title": "Bad tags",
                "f-tags": "not-a-list",
                "f-checklist": [],
                "f-link": "",
            },
        },
    )
    assert response.status_code == 422


async def test_tags_reject_non_string_items(authenticated_client, rich_project):
    """Every item in the tags list must be a string."""
    pid = rich_project["id"]
    response = await authenticated_client.post(
        f"/projects/{pid}/entries",
        json={
            "data": {
                "f-title": "Bad tag items",
                "f-tags": ["ok", 123],
                "f-checklist": [],
                "f-link": "",
            },
        },
    )
    assert response.status_code == 422


async def test_tags_reject_empty_list(authenticated_client, rich_project):
    """A tags field needs at least one tag — an empty list is rejected."""
    pid = rich_project["id"]
    response = await authenticated_client.post(
        f"/projects/{pid}/entries",
        json={
            "data": {
                "f-title": "Untagged entry",
                "f-tags": [],
                "f-checklist": [],
                "f-link": "",
            },
        },
    )
    assert response.status_code == 422
    assert "at least one tag" in response.json()["detail"].lower()


async def test_tags_reject_too_many(authenticated_client, rich_project):
    """More than ten tags on one entry is rejected."""
    pid = rich_project["id"]
    response = await authenticated_client.post(
        f"/projects/{pid}/entries",
        json={
            "data": {
                "f-title": "Over-tagged entry",
                "f-tags": [f"tag-{index}" for index in range(11)],
                "f-checklist": [],
                "f-link": "",
            },
        },
    )
    assert response.status_code == 422
    assert "10" in response.json()["detail"]


async def test_tags_reject_overlong_tag(authenticated_client, rich_project):
    """A single tag longer than thirty characters is rejected."""
    pid = rich_project["id"]
    response = await authenticated_client.post(
        f"/projects/{pid}/entries",
        json={
            "data": {
                "f-title": "Long tag",
                "f-tags": ["x" * 31],
                "f-checklist": [],
                "f-link": "",
            },
        },
    )
    assert response.status_code == 422
    assert "30" in response.json()["detail"]


async def test_tags_reject_blank_tag(authenticated_client, rich_project):
    """A tag made only of whitespace is rejected."""
    pid = rich_project["id"]
    response = await authenticated_client.post(
        f"/projects/{pid}/entries",
        json={
            "data": {
                "f-title": "Blank tag",
                "f-tags": ["   "],
                "f-checklist": [],
                "f-link": "",
            },
        },
    )
    assert response.status_code == 422


async def test_update_entry_adds_and_removes_tags(
    authenticated_client, rich_project, entry_a
):
    """Tags can be added and removed via PUT without a page reload."""
    pid = rich_project["id"]
    eid = entry_a["id"]
    response = await authenticated_client.put(
        f"/projects/{pid}/entries/{eid}",
        json={
            "data": {
                "f-title": "Entry A",
                "f-tags": ["backend", "api", "new-tag"],
                "f-checklist": entry_a["data"]["f-checklist"],
                "f-link": "",
            },
        },
    )
    assert response.status_code == 200
    assert "new-tag" in response.json()["data"]["f-tags"]


async def test_global_search_filters_by_tag(
    authenticated_client, rich_project, entry_a
):
    """GET /entries?tag=... returns only entries containing that tag."""
    # Create a second entry with different tags
    pid = rich_project["id"]
    await authenticated_client.post(
        f"/projects/{pid}/entries",
        json={
            "data": {
                "f-title": "Entry B",
                "f-tags": ["frontend"],
                "f-checklist": [],
                "f-link": "",
            },
        },
    )

    # Filter for "frontend" — should return exactly one entry
    response = await authenticated_client.get("/entries", params={"tag": "frontend"})
    assert response.status_code == 200
    results = response.json()
    assert len(results) == 1
    assert "frontend" in results[0]["data"]["f-tags"]

    # Filter for "backend" — should return entry_a
    response = await authenticated_client.get("/entries", params={"tag": "backend"})
    assert response.status_code == 200
    results = response.json()
    assert len(results) == 1
    assert results[0]["id"] == entry_a["id"]


async def test_global_search_returns_schema_snapshot(
    authenticated_client, rich_project, entry_a
):
    """Global search carries each entry's schema snapshot.

    The snapshot is what lets a reader render a link value as words instead
    of showing the target's bare id: without it, an entry id is
    indistinguishable from an id-shaped text value (US-2.3).
    """
    response = await authenticated_client.get("/entries", params={"tag": "backend"})
    assert response.status_code == 200
    results = response.json()
    assert len(results) == 1
    types_by_id = {
        field["id"]: field["type"] for field in results[0]["schema_snapshot"]
    }
    assert types_by_id.get("f-link") == FieldType.LINK.value
    assert types_by_id.get("f-tags") == FieldType.TAGS.value
    assert types_by_id.get("f-checklist") == FieldType.CHECKLIST.value


# ── US-2.2  Add checklists to an entry ───────────────────────────────


async def test_create_entry_with_checklist(authenticated_client, rich_project):
    """Checklist items with id, text, and completed are stored correctly."""
    pid = rich_project["id"]
    response = await authenticated_client.post(
        f"/projects/{pid}/entries",
        json={
            "data": {
                "f-title": "Checklist entry",
                "f-tags": ["general"],
                "f-checklist": [
                    {"id": "ci-a", "text": "Design schema", "completed": True},
                    {"id": "ci-b", "text": "Build form", "completed": False},
                    {"id": "ci-c", "text": "Deploy", "completed": False},
                ],
                "f-link": "",
            },
        },
    )
    assert response.status_code == 201
    items = response.json()["data"]["f-checklist"]
    assert len(items) == 3
    completed = sum(1 for i in items if i["completed"])
    assert completed == 1  # 1/3 complete — visible on the entry preview


async def test_checklist_rejects_missing_text(authenticated_client, rich_project):
    """Checklist items must have both 'id' and 'text' keys."""
    pid = rich_project["id"]
    response = await authenticated_client.post(
        f"/projects/{pid}/entries",
        json={
            "data": {
                "f-title": "Bad checklist",
                "f-tags": ["general"],
                "f-checklist": [{"id": "ci-1"}],  # missing 'text'
                "f-link": "",
            },
        },
    )
    assert response.status_code == 422


async def test_checklist_rejects_non_list(authenticated_client, rich_project):
    """Checklist field must be a list — a dict is rejected."""
    pid = rich_project["id"]
    response = await authenticated_client.post(
        f"/projects/{pid}/entries",
        json={
            "data": {
                "f-title": "Bad checklist",
                "f-tags": ["general"],
                "f-checklist": "not-a-list",
                "f-link": "",
            },
        },
    )
    assert response.status_code == 422


async def test_checklist_rejects_duplicate_items(authenticated_client, rich_project):
    """Two items with the same text are rejected — steps must be unique."""
    pid = rich_project["id"]
    response = await authenticated_client.post(
        f"/projects/{pid}/entries",
        json={
            "data": {
                "f-title": "Duplicate steps",
                "f-tags": ["general"],
                "f-checklist": [
                    {"id": "ci-1", "text": "Write tests", "completed": False},
                    {"id": "ci-2", "text": "write tests", "completed": True},
                ],
                "f-link": "",
            },
        },
    )
    assert response.status_code == 422
    assert "unique" in response.json()["detail"].lower()


async def test_checklist_rejects_overlong_item(authenticated_client, rich_project):
    """An item longer than thirty characters is rejected."""
    pid = rich_project["id"]
    response = await authenticated_client.post(
        f"/projects/{pid}/entries",
        json={
            "data": {
                "f-title": "Long step",
                "f-tags": ["general"],
                "f-checklist": [
                    {"id": "ci-1", "text": "y" * 31, "completed": False},
                ],
                "f-link": "",
            },
        },
    )
    assert response.status_code == 422
    assert "30" in response.json()["detail"]


async def test_checklist_rejects_too_many_items(authenticated_client, rich_project):
    """More than twenty items in one checklist is rejected."""
    pid = rich_project["id"]
    response = await authenticated_client.post(
        f"/projects/{pid}/entries",
        json={
            "data": {
                "f-title": "Long checklist",
                "f-tags": ["general"],
                "f-checklist": [
                    {"id": f"ci-{index}", "text": f"Step {index}", "completed": False}
                    for index in range(21)
                ],
                "f-link": "",
            },
        },
    )
    assert response.status_code == 422
    assert "20" in response.json()["detail"]


async def test_checklist_rejects_non_boolean_completed(
    authenticated_client, rich_project
):
    """A non-boolean completion state is rejected."""
    pid = rich_project["id"]
    response = await authenticated_client.post(
        f"/projects/{pid}/entries",
        json={
            "data": {
                "f-title": "Bad completion flag",
                "f-tags": ["general"],
                "f-checklist": [
                    {"id": "ci-1", "text": "Write tests", "completed": "yes"},
                ],
                "f-link": "",
            },
        },
    )
    assert response.status_code == 422


async def test_checklist_items_can_be_toggled(
    authenticated_client, rich_project, entry_a
):
    """Checklist completion state updates via PUT (check/uncheck)."""
    pid = rich_project["id"]
    eid = entry_a["id"]

    # Toggle the first item to completed
    updated_checklist = [
        {"id": "ci-1", "text": "Write tests", "completed": True},
        {"id": "ci-2", "text": "Review PR", "completed": True},
    ]
    response = await authenticated_client.put(
        f"/projects/{pid}/entries/{eid}",
        json={
            "data": {
                "f-title": "Entry A",
                "f-tags": entry_a["data"]["f-tags"],
                "f-checklist": updated_checklist,
                "f-link": "",
            },
        },
    )
    assert response.status_code == 200
    items = response.json()["data"]["f-checklist"]
    assert all(item["completed"] for item in items)  # 2/2 complete


async def test_checklist_items_can_be_reordered_and_deleted(
    authenticated_client, rich_project, entry_a
):
    """Checklist items can be reordered and deleted via PUT."""
    pid = rich_project["id"]
    eid = entry_a["id"]

    # Delete ci-1, keep ci-2 (now first)
    updated_checklist = [
        {"id": "ci-2", "text": "Review PR", "completed": True},
    ]
    response = await authenticated_client.put(
        f"/projects/{pid}/entries/{eid}",
        json={
            "data": {
                "f-title": "Entry A",
                "f-tags": entry_a["data"]["f-tags"],
                "f-checklist": updated_checklist,
                "f-link": "",
            },
        },
    )
    assert response.status_code == 200
    assert len(response.json()["data"]["f-checklist"]) == 1
    assert response.json()["data"]["f-checklist"][0]["id"] == "ci-2"


# ── US-2.3  Link entries together ────────────────────────────────────


async def test_create_entry_with_link(authenticated_client, rich_project, entry_a):
    """A link field storing a valid entry id is accepted."""
    pid = rich_project["id"]
    response = await authenticated_client.post(
        f"/projects/{pid}/entries",
        json={
            "data": {
                "f-title": "Linked entry",
                "f-tags": ["general"],
                "f-checklist": [],
                "f-link": entry_a["id"],
            },
        },
    )
    assert response.status_code == 201
    assert response.json()["data"]["f-link"] == entry_a["id"]


async def test_link_rejects_nonexistent_entry(
    authenticated_client, rich_project
):
    """A link pointing to a non-existent entry id is rejected."""
    pid = rich_project["id"]
    fake_id = str(uuid4())
    response = await authenticated_client.post(
        f"/projects/{pid}/entries",
        json={
            "data": {
                "f-title": "Broken link",
                "f-tags": ["general"],
                "f-checklist": [],
                "f-link": fake_id,
            },
        },
    )
    assert response.status_code == 422
    assert "does not exist" in response.json()["detail"].lower()


async def test_link_rejects_invalid_uuid(authenticated_client, rich_project):
    """A link value that isn't a valid UUID is rejected."""
    pid = rich_project["id"]
    response = await authenticated_client.post(
        f"/projects/{pid}/entries",
        json={
            "data": {
                "f-title": "Bad link",
                "f-tags": ["general"],
                "f-checklist": [],
                "f-link": "not-a-uuid",
            },
        },
    )
    assert response.status_code == 422


async def test_link_rejects_self_link(authenticated_client, rich_project, entry_a):
    """An entry cannot be linked to itself."""
    pid = rich_project["id"]
    response = await authenticated_client.put(
        f"/projects/{pid}/entries/{entry_a['id']}",
        json={
            "data": {
                "f-title": "Entry A",
                "f-tags": entry_a["data"]["f-tags"],
                "f-checklist": entry_a["data"]["f-checklist"],
                "f-link": entry_a["id"],
            },
        },
    )
    assert response.status_code == 422
    assert "itself" in response.json()["detail"].lower()


async def test_link_rejects_self_link_on_create(authenticated_client, rich_project):
    """A create that names its own id and links to it is rejected."""
    pid = rich_project["id"]
    chosen_id = str(uuid4())
    response = await authenticated_client.post(
        f"/projects/{pid}/entries",
        json={
            "id": chosen_id,
            "data": {
                "f-title": "Self-referencing entry",
                "f-tags": ["general"],
                "f-checklist": [],
                "f-link": chosen_id,
            },
        },
    )
    assert response.status_code == 422
    assert "itself" in response.json()["detail"].lower()


async def test_link_rejects_entry_in_another_project(
    authenticated_client, rich_project, entry_a
):
    """A link must point at an entry in the same project."""
    response = await authenticated_client.post(
        "/projects",
        json={
            "name": "Somewhere Else",
            "entry_schema": [{"id": "f-note", "name": "Note", "type": "text"}],
        },
    )
    other_project = response.json()
    response = await authenticated_client.post(
        f"/projects/{other_project['id']}/entries",
        json={"data": {"f-note": "Work in another project"}},
    )
    outsider = response.json()

    response = await authenticated_client.post(
        f"/projects/{rich_project['id']}/entries",
        json={
            "data": {
                "f-title": "Cross-project link",
                "f-tags": ["general"],
                "f-checklist": [],
                "f-link": outsider["id"],
            },
        },
    )
    assert response.status_code == 422
    assert "different project" in response.json()["detail"].lower()


async def test_bidirectional_link_lookup(
    authenticated_client, rich_project, entry_a
):
    """GET .../links returns entries that link back to the target entry."""
    pid = rich_project["id"]

    # Create entry_b that links to entry_a
    response = await authenticated_client.post(
        f"/projects/{pid}/entries",
        json={
            "data": {
                "f-title": "Entry B links to A",
                "f-tags": ["general"],
                "f-checklist": [],
                "f-link": entry_a["id"],
            },
        },
    )
    assert response.status_code == 201
    entry_b = response.json()

    # Ask for backlinks on entry_a — should include entry_b
    response = await authenticated_client.get(
        f"/projects/{pid}/entries/{entry_a['id']}/links"
    )
    assert response.status_code == 200
    backlinks = response.json()
    backlink_ids = [bl["id"] for bl in backlinks]
    assert entry_b["id"] in backlink_ids


async def test_delete_entry_clears_broken_links(
    authenticated_client, rich_project, entry_a
):
    """Deleting an entry nulls-out link fields pointing to it."""
    pid = rich_project["id"]

    # Create entry_b linking to entry_a
    response = await authenticated_client.post(
        f"/projects/{pid}/entries",
        json={
            "data": {
                "f-title": "Entry B links to A",
                "f-tags": ["general"],
                "f-checklist": [],
                "f-link": entry_a["id"],
            },
        },
    )
    entry_b = response.json()

    # Delete entry_a
    delete_response = await authenticated_client.delete(
        f"/projects/{pid}/entries/{entry_a['id']}"
    )
    assert delete_response.status_code == 204

    # entry_b's link field should now be None (broken link cleared)
    get_response = await authenticated_client.get(
        f"/projects/{pid}/entries/{entry_b['id']}"
    )
    assert get_response.status_code == 200
    assert get_response.json()["data"]["f-link"] is None


async def test_empty_link_value_is_accepted(authenticated_client, rich_project):
    """An empty string or None for a link field is valid (no link)."""
    pid = rich_project["id"]
    response = await authenticated_client.post(
        f"/projects/{pid}/entries",
        json={
            "data": {
                "f-title": "No link",
                "f-tags": ["general"],
                "f-checklist": [],
                "f-link": "",
            },
        },
    )
    assert response.status_code == 201
    assert response.json()["data"]["f-link"] == ""


# ── Project-reference and computed fields (US-2.4, US-2.5) ──────────────────


async def _create_project(client, name, schema):
    response = await client.post("/projects", json={"name": name, "entry_schema": schema})
    assert response.status_code == 201, response.text
    return response.json()


@pytest_asyncio.fixture(loop_scope="function")
async def linked_projects(authenticated_client):
    """A project whose schema links it to another project (US-2.4)."""
    target = await _create_project(authenticated_client, "Dissertation", [])
    source = await _create_project(
        authenticated_client,
        "Reading log",
        [
            {"id": "field-notes", "name": "Notes", "type": FieldType.TEXT.value},
            {
                "id": "field-for",
                "name": "Read for",
                "type": FieldType.PROJECT_REFERENCE.value,
                "linked_project_id": target["id"],
            },
        ],
    )
    return source, target


@pytest_asyncio.fixture(loop_scope="function")
async def costed_project(authenticated_client):
    """A project with a rate, hours, and a cost worked out from both (US-2.5)."""
    return await _create_project(
        authenticated_client,
        "Consulting",
        [
            {"id": "field-hours", "name": "Hours", "type": FieldType.NUMBER.value},
            {"id": "field-rate", "name": "Rate", "type": FieldType.NUMBER.value},
            {
                "id": "field-cost",
                "name": "Cost",
                "type": FieldType.COMPUTED.value,
                "expression": "{field-hours} * {field-rate}",
            },
        ],
    )


# ── Project reference (US-2.4) ────────────────────────────────────────────────


async def test_an_entry_stores_the_link_the_schema_names(
    authenticated_client, linked_projects
):
    """The link is a fact about the schema, so an entry written against it
    carries the target without being asked for it."""
    source, target = linked_projects
    response = await authenticated_client.post(
        f"/projects/{source['id']}/entries",
        json={"data": {"field-notes": "Chapter 3"}},
    )
    assert response.status_code == 201
    assert response.json()["data"]["field-for"] == target["id"]


async def test_a_value_sent_for_a_link_is_ignored(authenticated_client, linked_projects):
    """The form shows the link rather than asking for it, but offline sync
    replays whatever payload it captured, so the server derives it regardless
    — the same contract a computed field has."""
    source, target = linked_projects
    response = await authenticated_client.post(
        f"/projects/{source['id']}/entries",
        json={"data": {"field-notes": "Chapter 3", "field-for": None}},
    )
    assert response.status_code == 201
    assert response.json()["data"]["field-for"] == target["id"]


async def test_an_update_cannot_repoint_a_link_either(authenticated_client, linked_projects):
    source, target = linked_projects
    created = await authenticated_client.post(
        f"/projects/{source['id']}/entries",
        json={"data": {"field-notes": "Chapter 3"}},
    )
    entry_id = created.json()["id"]

    response = await authenticated_client.put(
        f"/projects/{source['id']}/entries/{entry_id}",
        json={"data": {"field-notes": "Chapter 4", "field-for": None}},
    )
    assert response.status_code == 200
    assert response.json()["data"]["field-for"] == target["id"]


async def test_a_schema_link_must_name_a_project(authenticated_client):
    response = await authenticated_client.post(
        "/projects",
        json={
            "name": "Unlinked",
            "entry_schema": [
                {"id": "field-for", "name": "Read for", "type": FieldType.PROJECT_REFERENCE.value},
            ],
        },
    )
    assert response.status_code == 422
    assert "needs to say which project" in response.json()["detail"]


async def test_a_schema_link_must_name_a_project_that_exists(authenticated_client):
    response = await authenticated_client.post(
        "/projects",
        json={
            "name": "Broken",
            "entry_schema": [
                {
                    "id": "field-for",
                    "name": "Read for",
                    "type": FieldType.PROJECT_REFERENCE.value,
                    "linked_project_id": str(uuid4()),
                },
            ],
        },
    )
    assert response.status_code == 422
    assert "does not exist" in response.json()["detail"]


async def test_a_schema_link_cannot_name_another_users_project(
    authenticated_client, second_authenticated_client
):
    """A link is scoped to the caller's own projects, so it cannot be used to
    confirm that somebody else's project id exists."""
    theirs = await _create_project(second_authenticated_client, "Their work", [])

    response = await authenticated_client.post(
        "/projects",
        json={
            "name": "Broken",
            "entry_schema": [
                {
                    "id": "field-for",
                    "name": "Read for",
                    "type": FieldType.PROJECT_REFERENCE.value,
                    "linked_project_id": theirs["id"],
                },
            ],
        },
    )
    assert response.status_code == 422
    assert "does not exist" in response.json()["detail"]


async def test_a_schema_link_cannot_point_at_its_own_project(authenticated_client):
    """A project linking to itself is a dead end dressed as a connection; the
    builder only ever offers other projects, so the server holds the same
    line."""
    project = await _create_project(authenticated_client, "Recursive", [])
    response = await authenticated_client.put(
        f"/projects/{project['id']}",
        json={
            "entry_schema": [
                {
                    "id": "field-for",
                    "name": "Related to",
                    "type": FieldType.PROJECT_REFERENCE.value,
                    "linked_project_id": project["id"],
                },
            ],
        },
    )
    assert response.status_code == 422
    assert "cannot link to its own project" in response.json()["detail"]


# ── Computed fields (US-2.5) ──────────────────────────────────────────────────


async def test_a_computed_field_is_worked_out_on_create(authenticated_client, costed_project):
    response = await authenticated_client.post(
        f"/projects/{costed_project['id']}/entries",
        json={"data": {"field-hours": 3, "field-rate": 250}},
    )
    assert response.status_code == 201
    assert response.json()["data"]["field-cost"] == 750


async def test_a_computed_field_is_reworked_on_update(authenticated_client, costed_project):
    created = await authenticated_client.post(
        f"/projects/{costed_project['id']}/entries",
        json={"data": {"field-hours": 3, "field-rate": 250}},
    )
    entry_id = created.json()["id"]

    response = await authenticated_client.put(
        f"/projects/{costed_project['id']}/entries/{entry_id}",
        json={"data": {"field-hours": 4, "field-rate": 250}},
    )
    assert response.status_code == 200
    assert response.json()["data"]["field-cost"] == 1000


async def test_a_value_sent_for_a_computed_field_is_ignored(
    authenticated_client, costed_project
):
    """The form makes the field read-only, but offline sync replays whatever
    payload it captured, so the server derives the value regardless."""
    response = await authenticated_client.post(
        f"/projects/{costed_project['id']}/entries",
        json={"data": {"field-hours": 3, "field-rate": 250, "field-cost": 1}},
    )
    assert response.status_code == 201
    assert response.json()["data"]["field-cost"] == 750


async def test_a_computed_field_is_null_when_the_arithmetic_cannot_be_done(
    authenticated_client,
):
    """An average over a day with nothing logged divides by zero. That is a
    state the data can legitimately be in, so the field is left unknown rather
    than the whole entry refused."""
    project = await _create_project(
        authenticated_client,
        "Averages",
        [
            {"id": "field-total", "name": "Total", "type": FieldType.NUMBER.value},
            {"id": "field-days", "name": "Days", "type": FieldType.NUMBER.value},
            {
                "id": "field-mean",
                "name": "Daily mean",
                "type": FieldType.COMPUTED.value,
                "expression": "{field-total} / {field-days}",
            },
        ],
    )

    response = await authenticated_client.post(
        f"/projects/{project['id']}/entries",
        json={"data": {"field-total": 10, "field-days": 0}},
    )
    assert response.status_code == 201
    assert response.json()["data"]["field-mean"] is None


async def test_a_computed_field_need_not_be_sent_at_all(authenticated_client, costed_project):
    response = await authenticated_client.post(
        f"/projects/{costed_project['id']}/entries",
        json={"data": {"field-hours": 3, "field-rate": 250}},
    )
    assert response.status_code == 201
    assert "field-cost" in response.json()["data"]


async def test_a_computed_value_reaches_the_csv_export(authenticated_client, costed_project):
    """Computed results are stored, not resolved at read time, so every
    existing reader sees them without knowing what a computed field is."""
    await authenticated_client.post(
        f"/projects/{costed_project['id']}/entries",
        json={"data": {"field-hours": 3, "field-rate": 250}},
    )

    response = await authenticated_client.get(f"/projects/{costed_project['id']}/export.csv")
    assert response.status_code == 200
    assert "Cost" in response.text
    assert "750" in response.text


async def test_schema_rejects_a_field_name_containing_braces(authenticated_client):
    """A calculation refers to a field by its name in braces, so a brace in a
    name would be read as half a reference."""
    response = await authenticated_client.post(
        "/projects",
        json={
            "name": "Broken",
            "entry_schema": [
                {"id": "field-a", "name": "Hours {ok}", "type": FieldType.NUMBER.value},
            ],
        },
    )
    assert response.status_code == 422
    assert "cannot contain braces" in response.text


async def test_a_computed_field_can_be_written_with_field_names(authenticated_client):
    """Names are what a person knows, so the expression accepts them; ids are
    how expressions were stored before names were allowed, and still work."""
    project = await _create_project(
        authenticated_client,
        "Named",
        [
            {"id": "field-hours", "name": "Hours", "type": FieldType.NUMBER.value},
            {
                "id": "field-cost",
                "name": "Cost",
                "type": FieldType.COMPUTED.value,
                "expression": "{Hours} * 3",
            },
        ],
    )

    response = await authenticated_client.post(
        f"/projects/{project['id']}/entries",
        json={"data": {"field-hours": 3}},
    )
    assert response.status_code == 201
    assert response.json()["data"]["field-cost"] == 9


# ── Schemas the builder must refuse (US-2.5) ──────────────────────────────────


async def test_schema_rejects_a_computed_field_reading_a_text_field(authenticated_client):
    response = await authenticated_client.post(
        "/projects",
        json={
            "name": "Broken",
            "entry_schema": [
                {"id": "field-notes", "name": "Notes", "type": FieldType.TEXT.value},
                {
                    "id": "field-total",
                    "name": "Total",
                    "type": FieldType.COMPUTED.value,
                    "expression": "{field-notes} * 2",
                },
            ],
        },
    )
    assert response.status_code == 422


async def test_schema_rejects_two_computed_fields_that_depend_on_each_other(
    authenticated_client,
):
    response = await authenticated_client.post(
        "/projects",
        json={
            "name": "Broken",
            "entry_schema": [
                {
                    "id": "field-a",
                    "name": "A",
                    "type": FieldType.COMPUTED.value,
                    "expression": "{field-b} + 1",
                },
                {
                    "id": "field-b",
                    "name": "B",
                    "type": FieldType.COMPUTED.value,
                    "expression": "{field-a} + 1",
                },
            ],
        },
    )
    assert response.status_code == 422


async def test_schema_rejects_an_expression_that_is_not_arithmetic(authenticated_client):
    response = await authenticated_client.post(
        "/projects",
        json={
            "name": "Broken",
            "entry_schema": [
                {
                    "id": "field-total",
                    "name": "Total",
                    "type": FieldType.COMPUTED.value,
                    "expression": "__import__('os').system('echo hi')",
                },
            ],
        },
    )
    assert response.status_code == 422


async def test_schema_rejects_a_computed_field_without_an_expression(authenticated_client):
    response = await authenticated_client.post(
        "/projects",
        json={
            "name": "Broken",
            "entry_schema": [
                {"id": "field-total", "name": "Total", "type": FieldType.COMPUTED.value},
            ],
        },
    )
    assert response.status_code == 422


async def test_schema_accepts_a_computed_field_reading_another_computed_field(
    authenticated_client,
):
    project = await _create_project(
        authenticated_client,
        "Chained",
        [
            {"id": "field-hours", "name": "Hours", "type": FieldType.NUMBER.value},
            {
                "id": "field-minutes",
                "name": "Minutes",
                "type": FieldType.COMPUTED.value,
                "expression": "{field-hours} * 60",
            },
            {
                "id": "field-seconds",
                "name": "Seconds",
                "type": FieldType.COMPUTED.value,
                "expression": "{field-minutes} * 60",
            },
        ],
    )

    response = await authenticated_client.post(
        f"/projects/{project['id']}/entries",
        json={"data": {"field-hours": 1}},
    )
    assert response.status_code == 201
    assert response.json()["data"]["field-minutes"] == 60
    assert response.json()["data"]["field-seconds"] == 3600
