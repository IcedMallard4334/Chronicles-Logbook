"""Tests for editing a schema that already has entries (US-2.6, US-2.7)."""

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


# ── Preview (US-2.6) ──────────────────────────────────────────────────────────


async def test_preview_reports_an_added_field_without_changing_anything(
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
    assert _change(payload, "added")["entries_affected"] == 2

    unchanged = await authenticated_client.get(f"/projects/{project_id}")
    assert len(unchanged.json()["entry_schema"]) == 3


async def test_preview_warns_that_a_removed_field_takes_data_with_it(
    authenticated_client, logged_project
):
    response = await authenticated_client.post(
        f"/projects/{logged_project['id']}/schema/preview",
        json={"entry_schema": [HOURS, STATUS]},
    )
    change = _change(response.json(), "removed")
    assert change["severity"] == "warning"
    assert change["values_retired"] == 2


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


async def test_preview_warns_when_a_type_change_would_lose_values(
    authenticated_client, logged_project
):
    """'Site visit' is not a number, so the change cannot keep it."""
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
    assert change["severity"] == "warning"
    assert change["values_retired"] == 2


async def test_preview_reports_a_type_change_that_only_reshapes_values(
    authenticated_client, logged_project
):
    """Numbers can always be written down, so becoming text costs nothing."""
    response = await authenticated_client.post(
        f"/projects/{logged_project['id']}/schema/preview",
        json={
            "entry_schema": [
                {**HOURS, "type": FieldType.TEXT.value},
                NOTES,
                STATUS,
            ]
        },
    )
    change = _change(response.json(), "retyped")
    assert change["values_retired"] == 0
    assert change["values_coerced"] == 2


async def test_preview_names_the_dropdown_choice_being_withdrawn(
    authenticated_client, logged_project
):
    response = await authenticated_client.post(
        f"/projects/{logged_project['id']}/schema/preview",
        json={"entry_schema": [HOURS, NOTES, {**STATUS, "options": ["Open"]}]},
    )
    change = _change(response.json(), "options_changed")
    assert "Closed" in change["description"]
    assert change["values_retired"] == 1


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


# ── Adding a field to a live schema (US-2.7) ──────────────────────────────────


async def test_a_new_text_field_is_backfilled_with_a_blank(
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

    entries = await authenticated_client.get(f"/projects/{project_id}/entries")
    assert all(entry["data"]["field-weather"] == "" for entry in entries.json())


async def test_a_new_number_field_is_backfilled_with_zero(
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
                {"id": "field-cost", "name": "Cost", "type": FieldType.NUMBER.value},
            ]
        },
    )

    entries = await authenticated_client.get(f"/projects/{project_id}/entries")
    assert all(entry["data"]["field-cost"] == 0 for entry in entries.json())


async def test_a_new_dropdown_field_is_backfilled_with_its_first_choice(
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
                    "id": "field-weather",
                    "name": "Weather",
                    "type": FieldType.DROPDOWN.value,
                    "options": ["Unknown", "Fine", "Wet"],
                },
            ]
        },
    )

    entries = await authenticated_client.get(f"/projects/{project_id}/entries")
    assert all(entry["data"]["field-weather"] == "Unknown" for entry in entries.json())


async def test_a_new_date_field_is_backfilled_with_the_entrys_own_date(
    authenticated_client, logged_project
):
    """Today's date would be wrong on every historical entry; the day the
    entry was captured is the only honest guess available."""
    project_id = logged_project["id"]
    captured = datetime(2026, 3, 4, 9, 30, tzinfo=timezone.utc)
    await _create_entry(
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

    entries = (await authenticated_client.get(f"/projects/{project_id}/entries")).json()
    old = next(entry for entry in entries if entry["data"]["field-notes"] == "Old")
    assert old["data"]["field-when"] == "2026-03-04"


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


# ── Removing a field from a live schema (US-2.7) ───────────────────────────────


async def test_a_removed_fields_values_are_kept_not_destroyed(
    authenticated_client, logged_project
):
    project_id = logged_project["id"]
    response = await authenticated_client.put(
        f"/projects/{project_id}/schema",
        json={"entry_schema": [HOURS, STATUS]},
    )
    assert response.status_code == 200

    entries = (await authenticated_client.get(f"/projects/{project_id}/entries")).json()
    assert all("field-notes" not in entry["data"] for entry in entries)
    assert {entry["retired_data"]["field-notes"] for entry in entries} == {
        "Site visit",
        "Write-up",
    }


async def test_a_removed_field_keeps_its_label(authenticated_client, logged_project):
    """A value with no label is not a record of anything, so the definition is
    kept alongside the values."""
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


async def test_a_field_added_back_brings_its_values_with_it(
    authenticated_client, logged_project
):
    """Removing a field by mistake is recoverable, which is the point of
    keeping the values rather than deleting them."""
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


# ── Editing a field on a live schema (US-2.6) ──────────────────────────────────


async def test_renaming_a_field_leaves_its_values_alone(
    authenticated_client, logged_project
):
    project_id = logged_project["id"]
    await authenticated_client.put(
        f"/projects/{project_id}/schema",
        json={"entry_schema": [HOURS, {**NOTES, "name": "Observations"}, STATUS]},
    )

    entries = (await authenticated_client.get(f"/projects/{project_id}/entries")).json()
    assert {entry["data"]["field-notes"] for entry in entries} == {
        "Site visit",
        "Write-up",
    }


async def test_a_number_becoming_text_keeps_the_figure_as_written(
    authenticated_client, logged_project
):
    project_id = logged_project["id"]
    await authenticated_client.put(
        f"/projects/{project_id}/schema",
        json={"entry_schema": [{**HOURS, "type": FieldType.TEXT.value}, NOTES, STATUS]},
    )

    entries = (await authenticated_client.get(f"/projects/{project_id}/entries")).json()
    assert {entry["data"]["field-hours"] for entry in entries} == {"2", "5"}


async def test_text_becoming_a_number_keeps_what_reads_as_one(authenticated_client):
    project = await _create_project(authenticated_client, "Counts", [NOTES])
    await _create_entry(authenticated_client, project["id"], {"field-notes": "12"})
    await _create_entry(authenticated_client, project["id"], {"field-notes": "twelve"})

    await authenticated_client.put(
        f"/projects/{project['id']}/schema",
        json={"entry_schema": [{**NOTES, "type": FieldType.NUMBER.value}]},
    )

    entries = (await authenticated_client.get(f"/projects/{project['id']}/entries")).json()
    kept = next(entry for entry in entries if entry["data"]["field-notes"] == 12)
    lost = next(entry for entry in entries if entry["retired_data"])
    assert kept["retired_data"] == {}
    assert lost["retired_data"]["field-notes"] == "twelve"
    assert lost["data"]["field-notes"] == 0


async def test_withdrawing_a_dropdown_choice_retires_the_entries_using_it(
    authenticated_client, logged_project
):
    project_id = logged_project["id"]
    await authenticated_client.put(
        f"/projects/{project_id}/schema",
        json={"entry_schema": [HOURS, NOTES, {**STATUS, "options": ["Open"]}]},
    )

    entries = (await authenticated_client.get(f"/projects/{project_id}/entries")).json()
    affected = next(entry for entry in entries if entry["retired_data"])
    assert affected["retired_data"]["field-status"] == "Closed"
    assert affected["data"]["field-status"] == "Open"


async def test_a_field_becoming_computed_recalculates_past_entries(
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
    assert {entry["data"]["field-minutes"] for entry in entries} == {120, 300}


async def test_changing_an_expression_recalculates_past_entries(authenticated_client):
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
    assert _change(response.json(), "expression_changed")["entries_affected"] == 1

    entries = (await authenticated_client.get(f"/projects/{project['id']}/entries")).json()
    assert entries[0]["data"]["field-total"] == 60


async def test_a_link_added_to_a_live_schema_points_every_entry_at_it(
    authenticated_client, logged_project
):
    """A link names its target in the schema, so an added link reaches
    backwards: the entries that predate it are pointed at the target rather
    than left to say nothing."""
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
    assert all(entry["data"]["field-for"] == target["id"] for entry in entries)


async def test_retargeting_a_link_relinks_every_entry(
    authenticated_client, logged_project
):
    """Editing a link in the schema is the one route by which a past entry's
    link changes, and the review says so in the target's own words."""
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

    retargeted = {**link, "linked_project_id": second["id"]}
    preview = await authenticated_client.post(
        f"/projects/{project_id}/schema/preview",
        json={"entry_schema": [HOURS, NOTES, STATUS, retargeted]},
    )
    change = _change(preview.json(), "link_changed")
    assert change["description"] == (
        "'Done for' will point at 'Thesis' and past entries will be relinked."
    )
    assert change["entries_affected"] == 2

    applied = await authenticated_client.put(
        f"/projects/{project_id}/schema",
        json={"entry_schema": [HOURS, NOTES, STATUS, retargeted]},
    )
    assert applied.status_code == 200

    entries = (await authenticated_client.get(f"/projects/{project_id}/entries")).json()
    assert all(entry["data"]["field-for"] == second["id"] for entry in entries)


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
    not a change of arithmetic, and past entries keep their values."""
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


async def test_the_ordinary_project_update_migrates_entries_too(
    authenticated_client, logged_project
):
    """There must be no route by which a schema changes and leaves its entries
    in the old shape."""
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
    assert all(entry["data"]["field-cost"] == 0 for entry in entries)


async def test_editing_a_schema_needs_the_project_to_be_yours(
    second_authenticated_client, logged_project
):
    response = await second_authenticated_client.put(
        f"/projects/{logged_project['id']}/schema", json={"entry_schema": []}
    )
    assert response.status_code == 404


async def test_removing_every_field_is_allowed(authenticated_client, logged_project):
    """A project may legitimately be reduced to a plain time log."""
    project_id = logged_project["id"]
    response = await authenticated_client.put(
        f"/projects/{project_id}/schema", json={"entry_schema": []}
    )
    assert response.status_code == 200

    entries = (await authenticated_client.get(f"/projects/{project_id}/entries")).json()
    assert all(entry["data"] == {} for entry in entries)
    assert all(len(entry["retired_data"]) == 3 for entry in entries)


async def test_retired_values_survive_an_export_and_import(
    authenticated_client, second_authenticated_client, logged_project
):
    """A round trip that dropped retired values would destroy the history that
    removing a field was careful to keep."""
    project_id = logged_project["id"]
    await authenticated_client.put(
        f"/projects/{project_id}/schema", json={"entry_schema": [HOURS, STATUS]}
    )

    document = (await authenticated_client.get("/export")).json()
    restored = await second_authenticated_client.post("/import", json=document)
    assert restored.status_code == 200

    projects = (await second_authenticated_client.get("/projects")).json()
    copied = next(project for project in projects if project["name"] == "Fieldwork")
    assert [field["name"] for field in copied["retired_schema"]] == ["Notes"]

    entries = (await second_authenticated_client.get(f"/projects/{copied['id']}/entries")).json()
    assert {entry["retired_data"]["field-notes"] for entry in entries} == {
        "Site visit",
        "Write-up",
    }
