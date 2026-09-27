"""Tests for saved statistics: the formula engine and its endpoints (US-3.8)."""

from types import SimpleNamespace

import pytest
import pytest_asyncio

from app.custom_statistics import (
    StatisticError,
    describe_expression,
    display_expression,
    evaluate_statistic,
    validate_statistic,
)
from app.schemas import FieldType

HOURS = {"id": "hours", "name": "Hours", "type": FieldType.NUMBER.value}
COST = {"id": "cost", "name": "Cost", "type": FieldType.NUMBER.value}
NOTES = {"id": "notes", "name": "Notes", "type": FieldType.TEXT.value}
STATUS = {
    "id": "status",
    "name": "Status",
    "type": FieldType.DROPDOWN.value,
    "options": ["Open", "Closed"],
}
LAB_SCHEMA = [HOURS, COST, NOTES, STATUS]

PROJECT_NAME = "Lab practicals"


def _entry(data, schema):
    """An entry-shaped object: the values it recorded, and the schema shape
    it recorded them in, which is all the evaluator reads."""
    return SimpleNamespace(data=data, schema_snapshot=schema)


def _lab_entries():
    return [
        _entry({"hours": 2, "cost": 10}, LAB_SCHEMA),
        _entry({"hours": 5, "cost": 20}, LAB_SCHEMA),
        _entry({"hours": 8, "cost": 30}, LAB_SCHEMA),
    ]


# ── The formula engine ──────────────────────────────────────────────────────


def test_the_aggregates_fold_a_projects_values():
    entries = _lab_entries()
    assert evaluate_statistic("sum({Hours})", LAB_SCHEMA, entries, PROJECT_NAME).value == 15
    assert evaluate_statistic("avg({Hours})", LAB_SCHEMA, entries, PROJECT_NAME).value == 5
    assert evaluate_statistic("min({Hours})", LAB_SCHEMA, entries, PROJECT_NAME).value == 2
    assert evaluate_statistic("max({Hours})", LAB_SCHEMA, entries, PROJECT_NAME).value == 8
    assert evaluate_statistic("count()", LAB_SCHEMA, entries, PROJECT_NAME).value == 3


def test_arithmetic_over_aggregates():
    entries = _lab_entries()
    result = evaluate_statistic("sum({Hours}) / count()", LAB_SCHEMA, entries, PROJECT_NAME)
    assert result.value == 5
    result = evaluate_statistic("-sum({Cost})", LAB_SCHEMA, entries, PROJECT_NAME)
    assert result.value == -60
    result = evaluate_statistic("(sum({Hours}) + 1) * 2", LAB_SCHEMA, entries, PROJECT_NAME)
    assert result.value == 32


def test_a_field_resolves_by_name_case_insensitively():
    result = evaluate_statistic("avg({hOURS})", LAB_SCHEMA, _lab_entries(), PROJECT_NAME)
    assert result.value == 5


def test_values_are_read_against_each_entrys_own_schema():
    """A historical entry is excluded, not misread, when it predates the field
    or recorded it as another type."""
    entries = [
        _entry({"hours": 3}, LAB_SCHEMA),
        _entry({"hours": "lots"}, [{**HOURS, "type": FieldType.TEXT.value}]),
        _entry({"cost": 10}, [COST, NOTES]),  # recorded before Hours existed
    ]
    result = evaluate_statistic("sum({Hours})", LAB_SCHEMA, entries, PROJECT_NAME)
    assert result.value == 3
    assert result.entries_used == 1


def test_a_boolean_value_is_not_a_number():
    result = evaluate_statistic(
        "sum({Hours})", LAB_SCHEMA, [_entry({"hours": True}, LAB_SCHEMA)], PROJECT_NAME
    )
    assert result.value is None
    assert result.note == "No entries match yet."


def test_a_computed_field_can_be_aggregated():
    schema = [
        HOURS,
        {
            "id": "minutes",
            "name": "Minutes",
            "type": FieldType.COMPUTED.value,
            "expression": "{hours} * 60",
        },
    ]
    entries = [
        _entry({"hours": 2, "minutes": 120}, schema),
        _entry({"hours": 1, "minutes": 60}, schema),
    ]
    result = evaluate_statistic("sum({Minutes})", schema, entries, PROJECT_NAME)
    assert result.value == 180
    assert result.entries_used == 2


def test_entries_used_counts_entries_not_values():
    entries = [
        _entry({"hours": 2, "cost": 10}, LAB_SCHEMA),
        _entry({"cost": 20}, LAB_SCHEMA),  # no Hours recorded
        _entry({"hours": 5, "cost": 30}, LAB_SCHEMA),
    ]
    result = evaluate_statistic("sum({Hours})", LAB_SCHEMA, entries, PROJECT_NAME)
    assert result.value == 7
    assert result.entries_used == 2


def test_count_uses_every_entry():
    entries = [_entry({"hours": 2}, LAB_SCHEMA), _entry({}, LAB_SCHEMA)]
    result = evaluate_statistic("count()", LAB_SCHEMA, entries, PROJECT_NAME)
    assert result.value == 2
    assert result.entries_used == 2


def test_an_average_over_no_entries_is_unknown_not_an_error():
    result = evaluate_statistic("avg({Hours})", LAB_SCHEMA, [], PROJECT_NAME)
    assert result.value is None
    assert result.entries_used == 0
    assert result.note == "No entries match yet."


def test_division_by_zero_over_no_matching_entries():
    result = evaluate_statistic("count() / count()", LAB_SCHEMA, [], PROJECT_NAME)
    assert result.value is None
    assert result.note == "Division by zero: no entries match yet."


def test_division_by_zero_after_matching_entries():
    result = evaluate_statistic("sum({Hours}) / 0", LAB_SCHEMA, _lab_entries(), PROJECT_NAME)
    assert result.value is None
    assert result.note == "Division by zero."


def test_an_aggregates_own_note_wins_over_the_divisions():
    # sum() has nothing to fold, so "No entries match yet." is the honest
    # sentence even though a division by zero happened too.
    result = evaluate_statistic("sum({Hours}) / count()", LAB_SCHEMA, [], PROJECT_NAME)
    assert result.value is None
    assert result.note == "No entries match yet."


def test_floating_point_noise_is_trimmed():
    entries = [_entry({"hours": 0.1}, LAB_SCHEMA), _entry({"hours": 0.2}, LAB_SCHEMA)]
    result = evaluate_statistic("avg({Hours})", LAB_SCHEMA, entries, PROJECT_NAME)
    assert result.value == 0.15


def test_a_whole_result_stays_a_whole_number():
    entries = [_entry({"hours": 2}, LAB_SCHEMA), _entry({"hours": 4}, LAB_SCHEMA)]
    result = evaluate_statistic("sum({Hours}) / count()", LAB_SCHEMA, entries, PROJECT_NAME)
    assert result.value == 3
    assert isinstance(result.value, int)


def test_a_result_too_large_to_show_comes_back_with_a_note():
    result = evaluate_statistic("1e308 * 10", LAB_SCHEMA, [], PROJECT_NAME)
    assert result.value is None
    assert result.note == "The formula works out to a number too large to show."


def test_validate_canonicalises_references_to_field_ids():
    assert (
        validate_statistic("avg({Hours}) + sum({Cost})", LAB_SCHEMA, PROJECT_NAME)
        == "avg({hours}) + sum({cost})"
    )


def test_validate_accepts_a_reference_already_written_by_id():
    assert validate_statistic("sum({hours})", LAB_SCHEMA, PROJECT_NAME) == "sum({hours})"


@pytest.mark.parametrize(
    "expression, message",
    [
        ("sum({Hurs})", "Did you mean 'Hours'"),
        ("sum({Zzz})", "no field called 'Zzz'"),
        ("sum({Notes})", "needs a number field, and 'Notes' is a text field"),
        ("avg({Status})", "needs a number field, and 'Status' is a dropdown field"),
        ("{Hours} + 1", "A field can only be read inside sum"),
        ("hours + 1", "Refer to a field by its name in braces"),
        ("sum(2)", "takes a single field"),
        ("count({Hours})", "takes nothing between its brackets"),
        ("sum({Hours}, {Cost})", "takes one field"),
        ("avg()", "takes one field"),
        ("2 ** 3", "can be used in a formula"),
        ("abs(1)", "The only functions a formula can use"),
        ("__import__('os')", "The only functions a formula can use"),
        ("'text' + 'more'", "can only contain numbers and field references"),
        ("True + 1", "can only contain numbers and field references"),
        ("sum({Hours}) > 1", "can only contain numbers, field references"),
        ("sum({Hours})[0]", "can only contain numbers, field references"),
        ("sum({Hours}", "incomplete or mistyped"),
    ],
)
def test_anything_else_is_rejected_with_a_sentence(expression, message):
    # Rejection happens at parse time against an allowlist — nothing a
    # formula says is ever executed, which is what the __import__ row asserts.
    with pytest.raises(StatisticError, match=message):
        validate_statistic(expression, LAB_SCHEMA, PROJECT_NAME)


def test_an_empty_formula_is_rejected():
    with pytest.raises(StatisticError, match="needs a formula"):
        validate_statistic("   ", LAB_SCHEMA, PROJECT_NAME)


def test_an_over_long_formula_is_rejected():
    with pytest.raises(StatisticError, match="cannot be longer than"):
        validate_statistic("1 + " * 200 + "1", LAB_SCHEMA, PROJECT_NAME)


def test_describe_expression_names_the_shapes_the_builder_makes():
    assert describe_expression("sum({hours})", LAB_SCHEMA) == "Total of Hours"
    assert describe_expression("avg({hours})", LAB_SCHEMA) == "Average of Hours"
    assert describe_expression("min({hours})", LAB_SCHEMA) == "Lowest of Hours"
    assert describe_expression("max({hours})", LAB_SCHEMA) == "Highest of Hours"
    assert describe_expression("count()", LAB_SCHEMA) == "Count of entries"
    assert describe_expression("avg( {hours} )", LAB_SCHEMA) == "Average of Hours"


def test_describe_expression_falls_back_to_the_formula_itself():
    assert describe_expression("sum({hours}) / count()", LAB_SCHEMA) == "sum({Hours}) / count()"


def test_display_expression_shows_fields_by_name():
    assert display_expression("avg({hours}) / count()", LAB_SCHEMA) == "avg({Hours}) / count()"


def test_display_expression_leaves_an_unresolvable_reference_alone():
    assert display_expression("avg({gone})", LAB_SCHEMA) == "avg({gone})"


# ── Endpoints ───────────────────────────────────────────────────────────────


async def _create_project(client, name, schema):
    response = await client.post("/projects", json={"name": name, "entry_schema": schema})
    assert response.status_code == 201, response.text
    return response.json()


@pytest_asyncio.fixture(loop_scope="function")
async def lab_project(authenticated_client):
    """The project every formula is worked out over: three entries of Hours
    and Cost."""
    project = await _create_project(authenticated_client, PROJECT_NAME, LAB_SCHEMA)
    runs = (
        {"hours": 2, "cost": 10, "notes": "Run one", "status": "Open"},
        {"hours": 5, "cost": 20, "notes": "Run two", "status": "Open"},
        {"hours": 8, "cost": 30, "notes": "Run three", "status": "Closed"},
    )
    for data in runs:
        response = await authenticated_client.post(
            f"/projects/{project['id']}/entries", json={"data": data}
        )
        assert response.status_code in (200, 201), response.text
    return project


async def _save_statistic(client, project_id, name, expression):
    response = await client.post(
        "/statistics/custom",
        json={"project_id": project_id, "name": name, "expression": expression},
    )
    assert response.status_code == 201, response.text
    return response.json()


async def test_custom_statistics_require_authentication(async_client):
    assert (await async_client.get("/statistics/custom")).status_code == 401
    response = await async_client.post(
        "/statistics/custom/preview",
        json={"project_id": "00000000-0000-0000-0000-000000000000", "expression": "count()"},
    )
    assert response.status_code == 401


async def test_listing_starts_empty(authenticated_client):
    response = await authenticated_client.get("/statistics/custom")
    assert response.status_code == 200
    assert response.json() == []


async def test_preview_works_a_formula_out_against_the_entries(
    authenticated_client, lab_project
):
    response = await authenticated_client.post(
        "/statistics/custom/preview",
        json={"project_id": lab_project["id"], "expression": "avg({Hours})"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["value"] == 5
    assert body["entries_used"] == 3
    assert body["note"] is None


async def test_preview_of_count_over_an_empty_project(authenticated_client):
    project = await _create_project(authenticated_client, "Empty lab", LAB_SCHEMA)
    response = await authenticated_client.post(
        "/statistics/custom/preview",
        json={"project_id": project["id"], "expression": "count()"},
    )
    assert response.status_code == 200
    assert response.json()["value"] == 0
    assert response.json()["note"] is None


async def test_preview_of_an_empty_project_is_a_note_not_an_error(authenticated_client):
    project = await _create_project(authenticated_client, "Empty lab", LAB_SCHEMA)
    response = await authenticated_client.post(
        "/statistics/custom/preview",
        json={"project_id": project["id"], "expression": "avg({Hours})"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["value"] is None
    assert body["entries_used"] == 0
    assert body["note"] == "No entries match yet."


async def test_preview_rejects_a_typo_with_the_field_it_looks_like(
    authenticated_client, lab_project
):
    response = await authenticated_client.post(
        "/statistics/custom/preview",
        json={"project_id": lab_project["id"], "expression": "avg({Hurs})"},
    )
    assert response.status_code == 400
    assert response.json()["detail"] == (
        "There's no field called 'Hurs' in Lab practicals. Did you mean 'Hours'?"
    )


async def test_preview_is_scoped_to_the_callers_own_projects(
    second_authenticated_client, lab_project
):
    response = await second_authenticated_client.post(
        "/statistics/custom/preview",
        json={"project_id": lab_project["id"], "expression": "count()"},
    )
    assert response.status_code == 404


async def test_create_saves_a_named_figure_with_its_current_value(
    authenticated_client, lab_project
):
    body = await _save_statistic(
        authenticated_client, lab_project["id"], "Average hours", "avg({Hours})"
    )
    assert body["name"] == "Average hours"
    assert body["project_name"] == PROJECT_NAME
    assert body["value"] == 5
    assert body["entries_used"] == 3
    assert body["description"] == "Average of Hours"
    # Stored by id, returned by name — the same rule computed fields follow.
    assert body["expression"] == "avg({Hours})"
    assert body["note"] is None


async def test_created_statistics_are_listed_and_stay_private(
    authenticated_client, second_authenticated_client, lab_project
):
    await _save_statistic(
        authenticated_client, lab_project["id"], "Average hours", "avg({Hours})"
    )

    listed = (await authenticated_client.get("/statistics/custom")).json()
    assert len(listed) == 1
    assert listed[0]["name"] == "Average hours"
    assert listed[0]["value"] == 5

    # Another account never sees them, even in the count.
    assert (await second_authenticated_client.get("/statistics/custom")).json() == []


async def test_a_saved_statistic_is_evaluated_fresh_each_time(
    authenticated_client, lab_project
):
    await _save_statistic(
        authenticated_client, lab_project["id"], "Average hours", "avg({Hours})"
    )
    listed = (await authenticated_client.get("/statistics/custom")).json()
    assert listed[0]["value"] == 5

    response = await authenticated_client.post(
        f"/projects/{lab_project['id']}/entries",
        json={"data": {"hours": 11, "cost": 0, "notes": "Run four", "status": "Open"}},
    )
    assert response.status_code in (200, 201), response.text

    listed = (await authenticated_client.get("/statistics/custom")).json()
    assert listed[0]["value"] == 6.5


async def test_create_rejects_a_formula_the_schema_cannot_answer(
    authenticated_client, lab_project
):
    response = await authenticated_client.post(
        "/statistics/custom",
        json={"project_id": lab_project["id"], "name": "Wrong", "expression": "sum({Notes})"},
    )
    assert response.status_code == 400
    assert response.json()["detail"] == (
        "sum() needs a number field, and 'Notes' is a text field."
    )


async def test_create_rejects_a_blank_name(authenticated_client, lab_project):
    response = await authenticated_client.post(
        "/statistics/custom",
        json={"project_id": lab_project["id"], "name": "   ", "expression": "count()"},
    )
    assert response.status_code == 422
    assert "Statistic name cannot be blank." in response.text


async def test_create_on_another_users_project_is_a_404(
    second_authenticated_client, lab_project
):
    response = await second_authenticated_client.post(
        "/statistics/custom",
        json={"project_id": lab_project["id"], "name": "Theirs", "expression": "count()"},
    )
    assert response.status_code == 404


async def test_update_reworks_the_formula(authenticated_client, lab_project):
    statistic = await _save_statistic(
        authenticated_client, lab_project["id"], "Average hours", "avg({Hours})"
    )
    response = await authenticated_client.put(
        f"/statistics/custom/{statistic['id']}",
        json={"expression": "max({Cost})"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["value"] == 30
    assert body["description"] == "Highest of Cost"


async def test_update_rejects_a_formula_that_cannot_work(authenticated_client, lab_project):
    statistic = await _save_statistic(
        authenticated_client, lab_project["id"], "Average hours", "avg({Hours})"
    )
    response = await authenticated_client.put(
        f"/statistics/custom/{statistic['id']}",
        json={"expression": "sum({Zzz})"},
    )
    assert response.status_code == 400
    assert response.json()["detail"] == "There's no field called 'Zzz' in Lab practicals."


async def test_a_schema_change_shows_as_a_note_not_an_error(
    authenticated_client, lab_project
):
    """A stat whose field was dropped afterwards still belongs on the page,
    with the reason it cannot produce a number, rather than failing the page."""
    statistic = await _save_statistic(
        authenticated_client, lab_project["id"], "Average hours", "avg({Hours})"
    )
    response = await authenticated_client.put(
        f"/projects/{lab_project['id']}/schema",
        json={"entry_schema": [COST, NOTES, STATUS]},
    )
    assert response.status_code == 200, response.text

    response = await authenticated_client.get("/statistics/custom")
    assert response.status_code == 200
    listed = response.json()
    assert len(listed) == 1
    assert listed[0]["id"] == statistic["id"]
    assert listed[0]["value"] is None
    assert listed[0]["note"] == "There's no field called 'hours' in Lab practicals."


async def test_renaming_a_stat_survives_a_schema_that_moved_on(
    authenticated_client, lab_project
):
    """The formula is only re-checked when it changes, so renaming a stat
    keeps working for someone whose schema drifted since it was saved."""
    statistic = await _save_statistic(
        authenticated_client, lab_project["id"], "Average hours", "avg({Hours})"
    )
    response = await authenticated_client.put(
        f"/projects/{lab_project['id']}/schema",
        json={"entry_schema": [COST, NOTES, STATUS]},
    )
    assert response.status_code == 200, response.text

    response = await authenticated_client.put(
        f"/statistics/custom/{statistic['id']}", json={"name": "Average hours, honestly"}
    )
    assert response.status_code == 200
    body = response.json()
    assert body["name"] == "Average hours, honestly"
    assert body["value"] is None
    assert body["note"] == "There's no field called 'hours' in Lab practicals."


async def test_a_renamed_field_does_not_break_a_saved_statistic(
    authenticated_client, lab_project
):
    """References are stored by id, so renaming a field is a label change:
    the value survives and the formula reads with the field's new name."""
    await _save_statistic(
        authenticated_client, lab_project["id"], "Average hours", "avg({Hours})"
    )
    response = await authenticated_client.put(
        f"/projects/{lab_project['id']}/schema",
        json={"entry_schema": [{**HOURS, "name": "Hours spent"}, COST, NOTES, STATUS]},
    )
    assert response.status_code == 200, response.text

    listed = (await authenticated_client.get("/statistics/custom")).json()
    assert listed[0]["value"] == 5
    assert listed[0]["expression"] == "avg({Hours spent})"
    assert listed[0]["description"] == "Average of Hours spent"
    assert listed[0]["note"] is None


async def test_update_on_another_users_statistic_is_a_404(
    authenticated_client, second_authenticated_client, lab_project
):
    statistic = await _save_statistic(
        authenticated_client, lab_project["id"], "Average hours", "avg({Hours})"
    )
    response = await second_authenticated_client.put(
        f"/statistics/custom/{statistic['id']}", json={"name": "Theirs"}
    )
    assert response.status_code == 404


async def test_delete_removes_a_statistic(authenticated_client, lab_project):
    statistic = await _save_statistic(
        authenticated_client, lab_project["id"], "Average hours", "avg({Hours})"
    )
    response = await authenticated_client.delete(f"/statistics/custom/{statistic['id']}")
    assert response.status_code == 204
    assert (await authenticated_client.get("/statistics/custom")).json() == []
    response = await authenticated_client.delete(f"/statistics/custom/{statistic['id']}")
    assert response.status_code == 404


async def test_delete_on_another_users_statistic_is_a_404(
    authenticated_client, second_authenticated_client, lab_project
):
    statistic = await _save_statistic(
        authenticated_client, lab_project["id"], "Average hours", "avg({Hours})"
    )
    response = await second_authenticated_client.delete(
        f"/statistics/custom/{statistic['id']}"
    )
    assert response.status_code == 404
    # Still there for its owner.
    assert len((await authenticated_client.get("/statistics/custom")).json()) == 1


async def test_deleting_a_project_removes_its_statistics(
    authenticated_client, lab_project
):
    await _save_statistic(
        authenticated_client, lab_project["id"], "Average hours", "avg({Hours})"
    )
    response = await authenticated_client.delete(f"/projects/{lab_project['id']}")
    assert response.status_code == 204
    assert (await authenticated_client.get("/statistics/custom")).json() == []
