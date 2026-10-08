"""Tests for editing a schema, and what does (and doesn't) happen to entries
that already exist.

Revised: a schema save changes the *project* only. Every entry keeps the
exact shape (schema_snapshot) it was recorded in, permanently, until someone
individually edits that entry and opts in to bringing it up to date (see
schema_migration.py and app/routers/projects.py's update_entry).
"""

from datetime import datetime, timezone

import pytest_asyncio

from app.schemas import FieldType

HOURS = {"id": "field-hours", "name": "Hours", "type": FieldType.NUMBER.value}
NOTES = {"id": "field-notes", "name": "Notes", "type": FieldType.TEXT.value}
STATUS = {
    "id": "field-status",
    "name": "Status",
    "type": FieldType.DROPDOWN.value,
    "options": ["Open", "Closed"],
}


async def _create_project(client, name, schema):
    response = await client.post("/projects", json={"name": name, "entry_schema": schema})
    assert response.status_code == 201, response.text
    return response.json()


async def _create_entry(client, project_id, data, **extra):
    response = await client.post(
        f"/projects/{project_id}/entries", json={"data": data, **extra}
    )
    assert response.status_code in (200, 201), response.text
    return response.json()


def _change(payload, kind, field_id=None):
    """The one reported change of a given kind, so tests read as assertions."""
    matches = [
        change
        for change in payload["changes"]
        if change["kind"] == kind and (field_id is None or change["field_id"] == field_id)
    ]
    assert len(matches) == 1, f"expected one {kind} change, got {payload['changes']}"
    return matches[0]


@pytest_asyncio.fixture(loop_scope="function")
async def logged_project(authenticated_client):
    """A project with two entries already recorded against its schema."""
    project = await _create_project(
        authenticated_client, "Fieldwork", [HOURS, NOTES, STATUS]
    )
    await _create_entry(
        authenticated_client,
        project["id"],
        {"field-hours": 2, "field-notes": "Site visit", "field-status": "Open"},
    )
    await _create_entry(
        authenticated_client,
        project["id"],
        {"field-hours": 5, "field-notes": "Write-up", "field-status": "Closed"},
    )
    return project


# ── Preview: describes what changes for *new* entries only ────────────────────


async def test_preview_reports_an_added_field_without_affecting_existing_entries(
    authenticated_client, logged_project
):
    project_id = logged_project["id"]
    response = await authenticated_client.post(
        f"/projects/{project_id}/schema/preview",
        json={
            "entry_schema": [
                HOURS,
                NOTES,
                STATUS,
                {"id": "field-weather", "name": "Weather", "type": FieldType.TEXT.value},
            ]
        },
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["entry_count"] == 2
    assert payload["entries_affected"] == 0
    change = _change(payload, "added")
    assert change["entries_affected"] == 0
    assert "won't show it" in change["description"]

    unchanged = await authenticated_client.get(f"/projects/{project_id}")
    assert len(unchanged.json()["entry_schema"]) == 3


async def test_preview_describes_a_removed_field_without_touching_data(
    authenticated_client, logged_project
):
    response = await authenticated_client.post(
        f"/projects/{logged_project['id']}/schema/preview",
        json={"entry_schema": [HOURS, STATUS]},
    )
    change = _change(response.json(), "removed")
    assert change["severity"] == "info"
    assert change["values_retired"] == 0
    assert "keep it exactly as recorded" in change["description"]


async def test_preview_treats_a_rename_as_harmless(authenticated_client, logged_project):
    response = await authenticated_client.post(
        f"/projects/{logged_project['id']}/schema/preview",
        json={
            "entry_schema": [
                HOURS,
                {**NOTES, "name": "Observations"},
                STATUS,
            ]
        },
    )
    payload = response.json()
    change = _change(payload, "renamed")
    assert change["severity"] == "info"
    assert change["entries_affected"] == 0
    assert payload["entries_affected"] == 0


async def test_preview_describes_a_type_change_for_new_entries_only(
    authenticated_client, logged_project
):
    response = await authenticated_client.post(
        f"/projects/{logged_project['id']}/schema/preview",
        json={
            "entry_schema": [
                HOURS,
                {**NOTES, "type": FieldType.NUMBER.value},
                STATUS,
            ]
        },
    )
    change = _change(response.json(), "retyped")
    assert change["values_retired"] == 0
    assert change["values_coerced"] == 0
    assert change["entries_affected"] == 0


async def test_preview_names_the_dropdown_choice_being_withdrawn(
    authenticated_client, logged_project
):
    response = await authenticated_client.post(
        f"/projects/{logged_project['id']}/schema/preview",
        json={"entry_schema": [HOURS, NOTES, {**STATUS, "options": ["Open"]}]},
    )
    change = _change(response.json(), "options_changed")
    assert "Closed" in change["description"]
    assert change["values_retired"] == 0


async def test_preview_of_an_unchanged_schema_reports_nothing(
    authenticated_client, logged_project
):
    response = await authenticated_client.post(
        f"/projects/{logged_project['id']}/schema/preview",
        json={"entry_schema": [HOURS, NOTES, STATUS]},
    )
    payload = response.json()
    assert payload["changes"] == []
    assert payload["entries_affected"] == 0


async def test_preview_rejects_a_schema_that_is_not_valid(
    authenticated_client, logged_project
):
    response = await authenticated_client.post(
        f"/projects/{logged_project['id']}/schema/preview",
        json={"entry_schema": [HOURS, {**NOTES, "name": "Hours"}]},
    )
    assert response.status_code == 422


async def test_preview_needs_the_project_to_be_yours(
    second_authenticated_client, logged_project
):
    response = await second_authenticated_client.post(
        f"/projects/{logged_project['id']}/schema/preview",
        json={"entry_schema": []},
    )
    assert response.status_code == 404


# ── Saving a schema never touches an existing entry ────────────────────────────


async def test_a_new_field_does_not_appear_on_existing_entries(
    authenticated_client, logged_project
):
    project_id = logged_project["id"]
    response = await authenticated_client.put(
        f"/projects/{project_id}/schema",
        json={
            "entry_schema": [
                HOURS,
                NOTES,
                STATUS,
                {"id": "field-weather", "name": "Weather", "type": FieldType.TEXT.value},
            ]
        },
    )
    assert response.status_code == 200
    assert response.json()["project"]["entry_schema"][-1]["name"] == "Weather"

    entries = (await authenticated_client.get(f"/projects/{project_id}/entries")).json()
    assert all("field-weather" not in entry["data"] for entry in entries)
    assert all(entry["schema_version"] == 1 for entry in entries)
    assert all(len(entry["schema_snapshot"]) == 3 for entry in entries)


async def test_an_entry_can_be_written_immediately_after_a_field_is_added(
    authenticated_client, logged_project
):
    project_id = logged_project["id"]
    await authenticated_client.put(
        f"/projects/{project_id}/schema",
        json={
            "entry_schema": [
                HOURS,
                NOTES,
                STATUS,
                {"id": "field-weather", "name": "Weather", "type": FieldType.TEXT.value},
            ]
        },
    )

    response = await authenticated_client.post(
        f"/projects/{project_id}/entries",
        json={
            "data": {
                "field-hours": 1,
                "field-notes": "After",
                "field-status": "Open",
                "field-weather": "Fine",
            }
        },
    )
    assert response.status_code == 201
    assert response.json()["schema_version"] == 2


# ── Removing a field from the schema doesn't touch existing entries ────────────


async def test_a_removed_fields_values_stay_on_the_entry(
    authenticated_client, logged_project
):
    project_id = logged_project["id"]
    response = await authenticated_client.put(
        f"/projects/{project_id}/schema",
        json={"entry_schema": [HOURS, STATUS]},
    )
    assert response.status_code == 200

    entries = (await authenticated_client.get(f"/projects/{project_id}/entries")).json()
    # Untouched: the value is still in `data`, under its own recorded shape,
    # not moved to retired_data — nothing reached back to migrate this entry.
    assert {entry["data"]["field-notes"] for entry in entries} == {
        "Site visit",
        "Write-up",
    }
    assert all(entry["retired_data"] == {} for entry in entries)


async def test_a_removed_field_still_gets_a_project_level_label(
    authenticated_client, logged_project
):
    """The project's retired_schema is a pure schema diff — it doesn't need
    any entry to have actually retired anything to know a field left the
    live schema."""
    project_id = logged_project["id"]
    await authenticated_client.put(
        f"/projects/{project_id}/schema",
        json={"entry_schema": [HOURS, STATUS]},
    )

    project = (await authenticated_client.get(f"/projects/{project_id}")).json()
    assert [field["name"] for field in project["retired_schema"]] == ["Notes"]


async def test_a_removed_field_is_no_longer_accepted_on_a_new_entry(
    authenticated_client, logged_project
):
    project_id = logged_project["id"]
    await authenticated_client.put(
        f"/projects/{project_id}/schema",
        json={"entry_schema": [HOURS, STATUS]},
    )

    response = await authenticated_client.post(
        f"/projects/{project_id}/entries",
        json={"data": {"field-hours": 1, "field-status": "Open", "field-notes": "No"}},
    )
    assert response.status_code == 422
    assert "Unknown field" in response.json()["detail"]


async def test_a_field_added_back_is_business_as_usual_for_untouched_entries(
    authenticated_client, logged_project
):
    """An entry that was never migrated never lost the field in the first
    place, so there's nothing to bring back for it."""
    project_id = logged_project["id"]
    await authenticated_client.put(
        f"/projects/{project_id}/schema", json={"entry_schema": [HOURS, STATUS]}
    )
    await authenticated_client.put(
        f"/projects/{project_id}/schema", json={"entry_schema": [HOURS, NOTES, STATUS]}
    )

    entries = (await authenticated_client.get(f"/projects/{project_id}/entries")).json()
    assert {entry["data"]["field-notes"] for entry in entries} == {
        "Site visit",
        "Write-up",
    }
    assert all(entry["retired_data"] == {} for entry in entries)


# ── Editing a field in the schema doesn't touch existing entries ───────────────


async def test_renaming_a_field_leaves_existing_entries_showing_the_old_name(
    authenticated_client, logged_project
):
    project_id = logged_project["id"]
    await authenticated_client.put(
        f"/projects/{project_id}/schema",
        json={"entry_schema": [HOURS, {**NOTES, "name": "Observations"}, STATUS]},
    )

    entries = (await authenticated_client.get(f"/projects/{project_id}/entries")).json()
    for entry in entries:
        snapshot_notes = next(f for f in entry["schema_snapshot"] if f["id"] == "field-notes")
        assert snapshot_notes["name"] == "Notes"
    assert {entry["data"]["field-notes"] for entry in entries} == {
        "Site visit",
        "Write-up",
    }


async def test_retyping_a_field_does_not_touch_existing_entries(
    authenticated_client, logged_project
):
    project_id = logged_project["id"]
    await authenticated_client.put(
        f"/projects/{project_id}/schema",
        json={"entry_schema": [{**HOURS, "type": FieldType.TEXT.value}, NOTES, STATUS]},
    )

    entries = (await authenticated_client.get(f"/projects/{project_id}/entries")).json()
    # Still the numbers they always were — nothing coerced them to text.
    assert {entry["data"]["field-hours"] for entry in entries} == {2, 5}


async def test_withdrawing_a_dropdown_choice_does_not_touch_existing_entries(
    authenticated_client, logged_project
):
    project_id = logged_project["id"]
    await authenticated_client.put(
        f"/projects/{project_id}/schema",
        json={"entry_schema": [HOURS, NOTES, {**STATUS, "options": ["Open"]}]},
    )

    entries = (await authenticated_client.get(f"/projects/{project_id}/entries")).json()
    closed = next(entry for entry in entries if entry["data"]["field-status"] == "Closed")
    assert closed["retired_data"] == {}


async def test_a_field_becoming_computed_does_not_recalculate_past_entries(
    authenticated_client, logged_project
):
    project_id = logged_project["id"]
    await authenticated_client.put(
        f"/projects/{project_id}/schema",
        json={
            "entry_schema": [
                HOURS,
                NOTES,
                STATUS,
                {
                    "id": "field-minutes",
                    "name": "Minutes",
                    "type": FieldType.COMPUTED.value,
                    "expression": "{field-hours} * 60",
                },
            ]
        },
    )

    entries = (await authenticated_client.get(f"/projects/{project_id}/entries")).json()
    assert all("field-minutes" not in entry["data"] for entry in entries)


async def test_changing_an_expression_does_not_recalculate_past_entries(authenticated_client):
    project = await _create_project(
        authenticated_client,
        "Rates",
        [
            HOURS,
            {
                "id": "field-total",
                "name": "Total",
                "type": FieldType.COMPUTED.value,
                "expression": "{field-hours} * 10",
            },
        ],
    )
    entry = await _create_entry(authenticated_client, project["id"], {"field-hours": 3})
    assert entry["data"]["field-total"] == 30

    response = await authenticated_client.put(
        f"/projects/{project['id']}/schema",
        json={
            "entry_schema": [
                HOURS,
                {
                    "id": "field-total",
                    "name": "Total",
                    "type": FieldType.COMPUTED.value,
                    "expression": "{field-hours} * 20",
                },
            ]
        },
    )
    assert _change(response.json(), "expression_changed")["entries_affected"] == 0

    entries = (await authenticated_client.get(f"/projects/{project['id']}/entries")).json()
    assert entries[0]["data"]["field-total"] == 30


async def test_a_link_added_to_a_live_schema_does_not_reach_backwards(
    authenticated_client, logged_project
):
    target = await _create_project(authenticated_client, "Dissertation", [])
    project_id = logged_project["id"]
    response = await authenticated_client.put(
        f"/projects/{project_id}/schema",
        json={
            "entry_schema": [
                HOURS,
                NOTES,
                STATUS,
                {
                    "id": "field-for",
                    "name": "Done for",
                    "type": FieldType.PROJECT_REFERENCE.value,
                    "linked_project_id": target["id"],
                },
            ]
        },
    )
    assert response.status_code == 200

    entries = (await authenticated_client.get(f"/projects/{project_id}/entries")).json()
    assert all("field-for" not in entry["data"] for entry in entries)


async def test_retargeting_a_link_does_not_relink_existing_entries(
    authenticated_client, logged_project
):
    first = await _create_project(authenticated_client, "Dissertation", [])
    second = await _create_project(authenticated_client, "Thesis", [])
    project_id = logged_project["id"]
    link = {
        "id": "field-for",
        "name": "Done for",
        "type": FieldType.PROJECT_REFERENCE.value,
        "linked_project_id": first["id"],
    }
    await authenticated_client.put(
        f"/projects/{project_id}/schema",
        json={"entry_schema": [HOURS, NOTES, STATUS, link]},
    )
    # Both entries predate the link field, so it was never on either of them.

    retargeted = {**link, "linked_project_id": second["id"]}
    preview = await authenticated_client.post(
        f"/projects/{project_id}/schema/preview",
        json={"entry_schema": [HOURS, NOTES, STATUS, retargeted]},
    )
    change = _change(preview.json(), "link_changed")
    assert change["description"] == (
        "'Done for' will point at 'Thesis' for new entries. Entries already "
        "recorded keep pointing at what they already have until individually "
        "updated."
    )
    assert change["entries_affected"] == 0

    applied = await authenticated_client.put(
        f"/projects/{project_id}/schema",
        json={"entry_schema": [HOURS, NOTES, STATUS, retargeted]},
    )
    assert applied.status_code == 200

    entries = (await authenticated_client.get(f"/projects/{project_id}/entries")).json()
    assert all("field-for" not in entry["data"] for entry in entries)

    new_entry = await _create_entry(
        authenticated_client,
        project_id,
        {"field-hours": 1, "field-notes": "New", "field-status": "Open"},
    )
    assert new_entry["data"]["field-for"] == second["id"]


async def test_an_expression_written_by_name_is_stored_by_field_id(
    authenticated_client,
):
    """A calculation is written by name but stored by field id, so that
    renaming a field afterwards cannot break it."""
    project = await _create_project(
        authenticated_client,
        "Named",
        [
            HOURS,
            {
                "id": "field-total",
                "name": "Total",
                "type": FieldType.COMPUTED.value,
                "expression": "{Hours} / 2",
            },
        ],
    )

    stored = (await authenticated_client.get(f"/projects/{project['id']}")).json()
    total = next(field for field in stored["entry_schema"] if field["id"] == "field-total")
    assert total["expression"] == "{field-hours} / 2"


async def test_renaming_a_field_leaves_a_calculation_that_names_it_alone(
    authenticated_client,
):
    """The point of storing expressions by id: a rename is a change of label,
    not a change of arithmetic — and since the entry is frozen either way,
    its already-computed value doesn't move regardless."""
    project = await _create_project(
        authenticated_client,
        "Fieldwork",
        [
            HOURS,
            {
                "id": "field-total",
                "name": "Total",
                "type": FieldType.COMPUTED.value,
                "expression": "{Hours} * 2",
            },
        ],
    )
    entry = await _create_entry(authenticated_client, project["id"], {"field-hours": 3})
    assert entry["data"]["field-total"] == 6

    response = await authenticated_client.put(
        f"/projects/{project['id']}/schema",
        json={
            "entry_schema": [
                {**HOURS, "name": "Duration"},
                {
                    "id": "field-total",
                    "name": "Total",
                    "type": FieldType.COMPUTED.value,
                    "expression": "{Duration} * 2",
                },
            ]
        },
    )
    assert response.status_code == 200
    assert [change["kind"] for change in response.json()["changes"]] == ["renamed"]

    entries = (await authenticated_client.get(f"/projects/{project['id']}/entries")).json()
    assert entries[0]["data"]["field-total"] == 6


# ── Guards ────────────────────────────────────────────────────────────────────


async def test_the_schema_of_an_archived_project_cannot_be_changed(
    authenticated_client, logged_project
):
    project_id = logged_project["id"]
    await authenticated_client.post(f"/projects/{project_id}/archive")

    response = await authenticated_client.put(
        f"/projects/{project_id}/schema", json={"entry_schema": [HOURS]}
    )
    assert response.status_code == 409


async def test_an_archived_project_can_still_be_renamed(
    authenticated_client, logged_project
):
    """The guard is about reshaping entries, not about the project form."""
    project_id = logged_project["id"]
    await authenticated_client.post(f"/projects/{project_id}/archive")

    response = await authenticated_client.put(
        f"/projects/{project_id}",
        json={"name": "Fieldwork (2025)", "entry_schema": [HOURS, NOTES, STATUS]},
    )
    assert response.status_code == 200
    assert response.json()["name"] == "Fieldwork (2025)"


async def test_the_ordinary_project_update_does_not_touch_entries_either(
    authenticated_client, logged_project
):
    """There must be no route by which a schema change reaches an entry
    without that entry's own edit choosing it."""
    project_id = logged_project["id"]
    response = await authenticated_client.put(
        f"/projects/{project_id}",
        json={
            "entry_schema": [
                HOURS,
                NOTES,
                STATUS,
                {"id": "field-cost", "name": "Cost", "type": FieldType.NUMBER.value},
            ]
        },
    )
    assert response.status_code == 200

    entries = (await authenticated_client.get(f"/projects/{project_id}/entries")).json()
    assert all("field-cost" not in entry["data"] for entry in entries)


async def test_editing_a_schema_needs_the_project_to_be_yours(
    second_authenticated_client, logged_project
):
    response = await second_authenticated_client.put(
        f"/projects/{logged_project['id']}/schema", json={"entry_schema": []}
    )
    assert response.status_code == 404


async def test_removing_every_field_leaves_existing_entries_exactly_as_recorded(
    authenticated_client, logged_project
):
    project_id = logged_project["id"]
    response = await authenticated_client.put(
        f"/projects/{project_id}/schema", json={"entry_schema": []}
    )
    assert response.status_code == 200

    entries = (await authenticated_client.get(f"/projects/{project_id}/entries")).json()
    assert all(len(entry["data"]) == 3 for entry in entries)
    assert all(entry["retired_data"] == {} for entry in entries)

    new_entry = await _create_entry(authenticated_client, project_id, {})
    assert new_entry["data"] == {}


async def test_retired_values_from_a_migrated_entry_survive_an_export_and_import(
    authenticated_client, second_authenticated_client, logged_project
):
    """A round trip that dropped a migrated entry's retired values would
    destroy the history that migrating was careful to keep."""
    project_id = logged_project["id"]
    entries = (await authenticated_client.get(f"/projects/{project_id}/entries")).json()
    entry_id = entries[0]["id"]

    await authenticated_client.put(
        f"/projects/{project_id}/schema", json={"entry_schema": [HOURS, STATUS]}
    )
    migrated = await authenticated_client.put(
        f"/projects/{project_id}/entries/{entry_id}",
        json={"migrate_to_current_schema": True},
    )
    assert migrated.status_code == 200
    assert migrated.json()["retired_data"]["field-notes"] in ("Site visit", "Write-up")

    document = (await authenticated_client.get("/export")).json()
    restored = await second_authenticated_client.post("/import", json=document)
    assert restored.status_code == 200

    projects = (await second_authenticated_client.get("/projects")).json()
    copied = next(project for project in projects if project["name"] == "Fieldwork")
    copied_entries = (
        await second_authenticated_client.get(f"/projects/{copied['id']}/entries")
    ).json()
    copied_migrated = next(entry for entry in copied_entries if entry["retired_data"])
    assert copied_migrated["retired_data"]["field-notes"] in ("Site visit", "Write-up")


# ── Migrating one entry to the current schema, during an edit ──────────────────


async def test_editing_without_migrating_validates_against_the_entrys_own_shape(
    authenticated_client, logged_project
):
    project_id = logged_project["id"]
    entries = (await authenticated_client.get(f"/projects/{project_id}/entries")).json()
    entry_id = entries[0]["id"]

    await authenticated_client.put(
        f"/projects/{project_id}/schema",
        json={
            "entry_schema": [
                HOURS,
                NOTES,
                STATUS,
                {"id": "field-weather", "name": "Weather", "type": FieldType.TEXT.value},
            ]
        },
    )

    response = await authenticated_client.put(
        f"/projects/{project_id}/entries/{entry_id}",
        json={"data": {"field-hours": 9, "field-notes": "Corrected", "field-status": "Open"}},
    )
    assert response.status_code == 200
    assert response.json()["data"]["field-hours"] == 9
    assert "field-weather" not in response.json()["data"]
    assert response.json()["schema_version"] == 1


async def test_editing_without_migrating_rejects_a_field_new_to_the_project(
    authenticated_client, logged_project
):
    project_id = logged_project["id"]
    entries = (await authenticated_client.get(f"/projects/{project_id}/entries")).json()
    entry_id = entries[0]["id"]

    await authenticated_client.put(
        f"/projects/{project_id}/schema",
        json={
            "entry_schema": [
                HOURS,
                NOTES,
                STATUS,
                {"id": "field-weather", "name": "Weather", "type": FieldType.TEXT.value},
            ]
        },
    )

    response = await authenticated_client.put(
        f"/projects/{project_id}/entries/{entry_id}",
        json={
            "data": {
                "field-hours": 9,
                "field-notes": "Corrected",
                "field-status": "Open",
                "field-weather": "Sunny",
            }
        },
    )
    assert response.status_code == 422
    assert "Unknown field" in response.json()["detail"]


async def test_migrating_backfills_a_new_field_with_its_default(
    authenticated_client, logged_project
):
    project_id = logged_project["id"]
    entries = (await authenticated_client.get(f"/projects/{project_id}/entries")).json()
    entry_id = entries[0]["id"]

    await authenticated_client.put(
        f"/projects/{project_id}/schema",
        json={
            "entry_schema": [
                HOURS,
                NOTES,
                STATUS,
                {"id": "field-weather", "name": "Weather", "type": FieldType.TEXT.value},
            ]
        },
    )

    response = await authenticated_client.put(
        f"/projects/{project_id}/entries/{entry_id}",
        json={"migrate_to_current_schema": True},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["data"]["field-weather"] == ""
    assert body["schema_version"] == 2
    assert len(body["schema_snapshot"]) == 4


async def test_migrating_backfills_a_new_date_field_with_the_entrys_own_date(
    authenticated_client, logged_project
):
    """Today's date would be wrong on an old entry; the day it was actually
    captured is the only honest guess available when migrating it."""
    project_id = logged_project["id"]
    captured = datetime(2026, 3, 4, 9, 30, tzinfo=timezone.utc)
    old = await _create_entry(
        authenticated_client,
        project_id,
        {"field-hours": 1, "field-notes": "Old", "field-status": "Open"},
        created_at=captured.isoformat(),
    )

    await authenticated_client.put(
        f"/projects/{project_id}/schema",
        json={
            "entry_schema": [
                HOURS,
                NOTES,
                STATUS,
                {"id": "field-when", "name": "Observed on", "type": FieldType.DATE.value},
            ]
        },
    )

    response = await authenticated_client.put(
        f"/projects/{project_id}/entries/{old['id']}",
        json={"migrate_to_current_schema": True},
    )
    assert response.status_code == 200
    assert response.json()["data"]["field-when"] == "2026-03-04"


async def test_migrating_lets_the_same_request_fill_in_the_new_field(
    authenticated_client, logged_project
):
    project_id = logged_project["id"]
    entries = (await authenticated_client.get(f"/projects/{project_id}/entries")).json()
    entry_id = entries[0]["id"]

    await authenticated_client.put(
        f"/projects/{project_id}/schema",
        json={
            "entry_schema": [
                HOURS,
                NOTES,
                STATUS,
                {"id": "field-weather", "name": "Weather", "type": FieldType.TEXT.value},
            ]
        },
    )

    response = await authenticated_client.put(
        f"/projects/{project_id}/entries/{entry_id}",
        json={
            "migrate_to_current_schema": True,
            "data": {"field-weather": "Sunny"},
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert body["data"]["field-weather"] == "Sunny"
    # The fields it didn't send stay exactly what they were, via the migration
    # baseline — sending one field to update doesn't blank out the rest.
    assert body["data"]["field-hours"] == entries[0]["data"]["field-hours"]


async def test_migrating_retires_a_value_whose_field_was_removed(
    authenticated_client, logged_project
):
    project_id = logged_project["id"]
    entries = (await authenticated_client.get(f"/projects/{project_id}/entries")).json()
    entry_id = entries[0]["id"]
    original_notes = entries[0]["data"]["field-notes"]

    await authenticated_client.put(
        f"/projects/{project_id}/schema", json={"entry_schema": [HOURS, STATUS]}
    )

    response = await authenticated_client.put(
        f"/projects/{project_id}/entries/{entry_id}",
        json={"migrate_to_current_schema": True},
    )
    assert response.status_code == 200
    body = response.json()
    assert "field-notes" not in body["data"]
    assert body["retired_data"]["field-notes"] == original_notes


async def test_migration_preview_shows_what_would_happen_without_saving_it(
    authenticated_client, logged_project
):
    project_id = logged_project["id"]
    entries = (await authenticated_client.get(f"/projects/{project_id}/entries")).json()
    entry_id = entries[0]["id"]

    await authenticated_client.put(
        f"/projects/{project_id}/schema",
        json={
            "entry_schema": [
                HOURS,
                NOTES,
                STATUS,
                {"id": "field-weather", "name": "Weather", "type": FieldType.TEXT.value},
            ]
        },
    )

    preview = await authenticated_client.get(
        f"/projects/{project_id}/entries/{entry_id}/migration-preview"
    )
    assert preview.status_code == 200
    body = preview.json()
    assert body["data"]["field-weather"] == ""
    change = _change({"changes": body["changes"]}, "added", "field-weather")
    assert "added to this entry" in change["description"]

    # Read-only: the real entry is untouched by looking at the preview.
    still = await authenticated_client.get(f"/projects/{project_id}/entries/{entry_id}")
    assert "field-weather" not in still.json()["data"]
    assert still.json()["schema_version"] == 1


async def test_migration_preview_needs_the_project_to_be_readable(
    second_authenticated_client, logged_project
):
    project_id = logged_project["id"]
    response = await second_authenticated_client.get(
        f"/projects/{project_id}/entries/00000000-0000-0000-0000-000000000000/migration-preview"
    )
    assert response.status_code == 404


async def test_retyping_between_short_and_long_text_keeps_what_was_written(authenticated_client):
    project = await _create_project(authenticated_client, "Retype", [{"id": "f-note", "name": "Note", "type": FieldType.TEXT.value}])
    entry = await _create_entry(authenticated_client, project["id"], {"f-note": "A short note"})

    preview = await authenticated_client.post(
        f"/projects/{project['id']}/schema/preview",
        json={"entry_schema": [{"id": "f-note", "name": "Note", "type": FieldType.LONG_TEXT.value}]},
    )
    assert preview.status_code == 200, preview.text
    change = preview.json()["changes"][0]
    assert change["kind"] == "retyped"
    assert "short text" in change["description"] and "long text" in change["description"]

    saved = await authenticated_client.put(
        f"/projects/{project['id']}", json={"entry_schema": [{"id": "f-note", "name": "Note", "type": FieldType.LONG_TEXT.value}]}
    )
    assert saved.status_code == 200
    migrated = await authenticated_client.put(
        f"/projects/{project['id']}/entries/{entry['id']}", json={"migrate_to_current_schema": True}
    )
    assert migrated.status_code == 200
    assert migrated.json()["data"] == {"f-note": "A short note"}


async def test_a_field_added_later_defaults_to_empty_text_whichever_kind(authenticated_client):
    project = await _create_project(authenticated_client, "Later", [HOURS])
    entry = await _create_entry(authenticated_client, project["id"], {"field-hours": 2})
    schema = [HOURS, {"id": "f-story", "name": "Story", "type": FieldType.LONG_TEXT.value}]
    assert (await authenticated_client.put(f"/projects/{project['id']}", json={"entry_schema": schema})).status_code == 200

    migrated = await authenticated_client.put(
        f"/projects/{project['id']}/entries/{entry['id']}", json={"migrate_to_current_schema": True}
    )

    assert migrated.status_code == 200
    assert migrated.json()["data"]["f-story"] == ""
