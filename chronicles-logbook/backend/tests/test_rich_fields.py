"""Tests for project-reference and computed fields (US-2.4, US-2.5)."""

from uuid import uuid4

import pytest_asyncio

from app.schemas import FieldType


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
