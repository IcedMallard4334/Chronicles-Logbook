"""Tests for structured search over custom fields (US-3.11)."""

import json

import pytest_asyncio

from app.schemas import FieldType

# ── Fixtures ──────────────────────────────────────────────────────────


@pytest_asyncio.fixture(loop_scope="function")
async def search_project(authenticated_client):
    """A project whose schema covers every field type search has to handle."""
    schema = [
        {"id": "f-title", "name": "Title", "type": FieldType.TEXT.value},
        {"id": "f-hours", "name": "Hours", "type": FieldType.NUMBER.value},
        {"id": "f-date", "name": "Date", "type": FieldType.DATE.value},
        {
            "id": "f-status",
            "name": "Status",
            "type": FieldType.DROPDOWN.value,
            "options": ["Open", "Closed"],
        },
        {"id": "f-tags", "name": "Tags", "type": FieldType.TAGS.value},
        {"id": "f-checklist", "name": "Checklist", "type": FieldType.CHECKLIST.value},
        {
            "id": "f-cost",
            "name": "Cost",
            "type": FieldType.COMPUTED.value,
            "expression": "{f-hours} * 2",
        },
    ]
    response = await authenticated_client.post(
        "/projects", json={"name": "Search Project", "entry_schema": schema}
    )
    assert response.status_code == 201
    return response.json()


async def _make_entry(client, project_id, **overrides):
    # A tags field must carry at least one tag (the US-2.1 repair), so the
    # default entry carries one; tests that care about tags override it.
    data = {
        "f-title": "Untitled",
        "f-hours": 1,
        "f-date": "2026-01-01",
        "f-status": "Open",
        "f-tags": ["untagged"],
        "f-checklist": [],
    }
    data.update(overrides)
    response = await client.post(f"/projects/{project_id}/entries", json={"data": data})
    assert response.status_code == 201
    return response.json()


@pytest_asyncio.fixture(loop_scope="function")
async def search_entries_set(authenticated_client, search_project):
    """Three entries spanning the search project's field types.

    entry1: open, 5h, early date, urgent backend work, one checklist item
            left undone.
    entry2: closed, 2h, mid date, docs, checklist fully done.
    entry3: open, 8h, late date, backend release work, empty checklist.
    """
    pid = search_project["id"]
    entry1 = await _make_entry(
        authenticated_client,
        pid,
        **{
            "f-title": "Fix login bug",
            "f-hours": 5,
            "f-date": "2026-01-10",
            "f-status": "Open",
            "f-tags": ["backend", "urgent"],
            "f-checklist": [
                {"id": "c1", "text": "Write tests", "completed": False},
                {"id": "c2", "text": "Review PR", "completed": True},
            ],
        },
    )
    entry2 = await _make_entry(
        authenticated_client,
        pid,
        **{
            "f-title": "Write docs",
            "f-hours": 2,
            "f-date": "2026-02-05",
            "f-status": "Closed",
            "f-tags": ["docs"],
            "f-checklist": [{"id": "c3", "text": "Publish", "completed": True}],
        },
    )
    entry3 = await _make_entry(
        authenticated_client,
        pid,
        **{
            "f-title": "Deploy release",
            "f-hours": 8,
            "f-date": "2026-03-01",
            "f-status": "Open",
            "f-tags": ["backend", "release"],
            "f-checklist": [],
        },
    )
    return {"project_id": pid, "entry1": entry1, "entry2": entry2, "entry3": entry3}


def _condition(field_id, operator, value=None, value2=None):
    payload = {"field_id": field_id, "operator": operator, "value": value}
    if value2 is not None:
        payload["value2"] = value2
    return payload


async def _search(client, project_id, conditions, match="all", **extra):
    params = {"project_id": project_id, "conditions": json.dumps(conditions), "match": match}
    params.update(extra)
    return await client.get("/entries", params=params)


# ── Per-operator matching ───────────────────────────────────────────


async def test_conditions_text_contains(authenticated_client, search_entries_set):
    s = search_entries_set
    response = await _search(
        authenticated_client, s["project_id"], [_condition("f-title", "contains", "login")]
    )
    assert response.status_code == 200
    ids = {entry["id"] for entry in response.json()}
    assert ids == {s["entry1"]["id"]}


async def test_conditions_number_gte(authenticated_client, search_entries_set):
    s = search_entries_set
    response = await _search(
        authenticated_client, s["project_id"], [_condition("f-hours", "gte", 5)]
    )
    ids = {entry["id"] for entry in response.json()}
    assert ids == {s["entry1"]["id"], s["entry3"]["id"]}


async def test_conditions_number_between(authenticated_client, search_entries_set):
    s = search_entries_set
    response = await _search(
        authenticated_client, s["project_id"], [_condition("f-hours", "between", 3, 8)]
    )
    ids = {entry["id"] for entry in response.json()}
    assert ids == {s["entry1"]["id"], s["entry3"]["id"]}


async def test_conditions_computed_field(authenticated_client, search_entries_set):
    """Cost (hours * 2) is queryable like any other numeric field."""
    s = search_entries_set
    response = await _search(
        authenticated_client, s["project_id"], [_condition("f-cost", "gt", 10)]
    )
    ids = {entry["id"] for entry in response.json()}
    assert ids == {s["entry3"]["id"]}  # 8 * 2 = 16 > 10; entry1's 5*2=10 is not > 10


async def test_conditions_date_before(authenticated_client, search_entries_set):
    s = search_entries_set
    response = await _search(
        authenticated_client, s["project_id"], [_condition("f-date", "before", "2026-02-01")]
    )
    ids = {entry["id"] for entry in response.json()}
    assert ids == {s["entry1"]["id"]}


async def test_conditions_dropdown_equals(authenticated_client, search_entries_set):
    s = search_entries_set
    response = await _search(
        authenticated_client, s["project_id"], [_condition("f-status", "equals", "Closed")]
    )
    ids = {entry["id"] for entry in response.json()}
    assert ids == {s["entry2"]["id"]}


async def test_conditions_dropdown_in(authenticated_client, search_entries_set):
    s = search_entries_set
    response = await _search(
        authenticated_client, s["project_id"], [_condition("f-status", "in", ["Open"])]
    )
    ids = {entry["id"] for entry in response.json()}
    assert ids == {s["entry1"]["id"], s["entry3"]["id"]}


async def test_conditions_tags_has(authenticated_client, search_entries_set):
    s = search_entries_set
    response = await _search(
        authenticated_client, s["project_id"], [_condition("f-tags", "has", "urgent")]
    )
    ids = {entry["id"] for entry in response.json()}
    assert ids == {s["entry1"]["id"]}


async def test_conditions_tags_has_any(authenticated_client, search_entries_set):
    s = search_entries_set
    response = await _search(
        authenticated_client,
        s["project_id"],
        [_condition("f-tags", "has_any", ["docs", "release"])],
    )
    ids = {entry["id"] for entry in response.json()}
    assert ids == {s["entry2"]["id"], s["entry3"]["id"]}


async def test_conditions_tags_has_all(authenticated_client, search_entries_set):
    s = search_entries_set
    response = await _search(
        authenticated_client,
        s["project_id"],
        [_condition("f-tags", "has_all", ["backend", "urgent"])],
    )
    ids = {entry["id"] for entry in response.json()}
    assert ids == {s["entry1"]["id"]}


async def test_conditions_checklist_complete_true(authenticated_client, search_entries_set):
    s = search_entries_set
    response = await _search(
        authenticated_client, s["project_id"], [_condition("f-checklist", "complete", True)]
    )
    ids = {entry["id"] for entry in response.json()}
    assert ids == {s["entry2"]["id"]}


async def test_conditions_checklist_complete_false(authenticated_client, search_entries_set):
    """False means 'has something outstanding' — an empty checklist has nothing to be outstanding, so it does not qualify."""
    s = search_entries_set
    response = await _search(
        authenticated_client, s["project_id"], [_condition("f-checklist", "complete", False)]
    )
    ids = {entry["id"] for entry in response.json()}
    assert ids == {s["entry1"]["id"]}


# ── Combining conditions ─────────────────────────────────────────────


async def test_conditions_combine_and(authenticated_client, search_entries_set):
    """match=all must actually behave differently from match=any: add an
    entry that satisfies exactly one of the two conditions, so a test that
    only checked entries satisfying both-or-neither couldn't tell AND from OR."""
    s = search_entries_set
    partial_match = await _make_entry(
        authenticated_client,
        s["project_id"],
        **{"f-title": "Closed but plenty of hours", "f-status": "Closed", "f-hours": 9},
    )

    response = await _search(
        authenticated_client,
        s["project_id"],
        [_condition("f-status", "equals", "Open"), _condition("f-hours", "gte", 5)],
        match="all",
    )
    ids = {entry["id"] for entry in response.json()}
    assert ids == {s["entry1"]["id"], s["entry3"]["id"]}
    assert partial_match["id"] not in ids  # satisfies "hours >= 5" but not "status is Open"


async def test_conditions_combine_or(authenticated_client, search_entries_set):
    s = search_entries_set
    response = await _search(
        authenticated_client,
        s["project_id"],
        [_condition("f-status", "equals", "Closed"), _condition("f-tags", "has", "release")],
        match="any",
    )
    ids = {entry["id"] for entry in response.json()}
    assert ids == {s["entry2"]["id"], s["entry3"]["id"]}


async def test_conditions_empty_list_is_a_no_op(authenticated_client, search_entries_set):
    """Regression: any(()) is False in Python — an empty condition list must
    not silently exclude every entry under match=any."""
    s = search_entries_set
    response = await _search(authenticated_client, s["project_id"], [], match="any")
    assert response.status_code == 200
    ids = {entry["id"] for entry in response.json()}
    assert ids == {s["entry1"]["id"], s["entry2"]["id"], s["entry3"]["id"]}


# ── Errors ────────────────────────────────────────────────────────────


async def test_conditions_malformed_json_rejected(authenticated_client, search_entries_set):
    s = search_entries_set
    response = await authenticated_client.get(
        "/entries", params={"project_id": s["project_id"], "conditions": "{not json"}
    )
    assert response.status_code == 422
    assert "JSON" in response.json()["detail"]


async def test_conditions_unknown_field_rejected(authenticated_client, search_entries_set):
    s = search_entries_set
    response = await _search(
        authenticated_client, s["project_id"], [_condition("f-nope", "equals", "x")]
    )
    assert response.status_code == 422
    assert "f-nope" in response.json()["detail"]


async def test_conditions_operator_invalid_for_type_rejected(
    authenticated_client, search_entries_set
):
    s = search_entries_set
    response = await _search(
        authenticated_client, s["project_id"], [_condition("f-title", "gt", 5)]
    )
    assert response.status_code == 422
    assert "Title" in response.json()["detail"] or "f-title" in response.json()["detail"]


async def test_conditions_between_requires_both_values(authenticated_client, search_entries_set):
    s = search_entries_set
    response = await _search(
        authenticated_client, s["project_id"], [_condition("f-hours", "between", 3)]
    )
    assert response.status_code == 422


async def test_conditions_require_a_project(authenticated_client, search_entries_set):
    """Field ids are project-specific, so a global search can't carry them."""
    response = await authenticated_client.get(
        "/entries",
        params={"conditions": json.dumps([_condition("f-status", "equals", "Open")])},
    )
    assert response.status_code == 422


# ── Schema versioning interaction ───────────────────────────────────


async def test_conditions_exclude_an_entry_that_predates_the_field(
    authenticated_client, search_project
):
    """An entry written before a field existed keeps its own schema_snapshot
    frozen at whatever it actually had — a schema change touches no entry
    (see schema_migration.py) — so a condition on the new field correctly
    leaves it out rather than matching it against a value it was never
    actually given."""
    pid = search_project["id"]
    old_entry = await _make_entry(authenticated_client, pid, **{"f-title": "Before priority"})

    updated = await authenticated_client.put(
        f"/projects/{pid}",
        json={
            "entry_schema": search_project["entry_schema"]
            + [
                {
                    "id": "f-priority",
                    "name": "Priority",
                    "type": FieldType.DROPDOWN.value,
                    "options": ["Low", "High"],
                }
            ],
        },
    )
    assert updated.status_code == 200

    new_entry = await _make_entry(
        authenticated_client, pid, **{"f-title": "After priority", "f-priority": "High"}
    )

    response = await _search(
        authenticated_client, pid, [_condition("f-priority", "equals", "Low")]
    )
    assert response.status_code == 200
    ids = {entry["id"] for entry in response.json()}
    assert old_entry["id"] not in ids
    assert new_entry["id"] not in ids  # its own priority is "High", not "Low"


def test_condition_matches_excludes_a_field_absent_from_the_entrys_own_snapshot():
    """Unit-level check of app.search's own behaviour: given a
    schema_snapshot that doesn't list a field — the ordinary case for any
    entry that predates it, since a schema change touches no entry (see
    schema_migration.py) — a condition on that field is excluded rather
    than guessed at or errored on."""
    from app.schemas import FieldCondition
    from app.search import condition_matches

    snapshot_without_priority = [{"id": "f-title", "name": "Title", "type": "text"}]
    condition = FieldCondition(field_id="f-priority", operator="equals", value="Low")

    assert condition_matches({"f-priority": "Low"}, snapshot_without_priority, condition) is False


# ── Relevance ranking ────────────────────────────────────────────────


async def test_relevance_ranks_more_matched_conditions_first(
    authenticated_client, search_entries_set
):
    """entry1 satisfies both OR'd conditions (urgent tag + Open status);
    entry3 satisfies only one (Open status, no "urgent" tag). entry1 was
    created *before* entry3, so a plain recency tiebreak would put entry3
    first — the assertion only passes if the match count actually drives
    the ranking, not just the created_at tiebreak."""
    s = search_entries_set
    response = await _search(
        authenticated_client,
        s["project_id"],
        [
            _condition("f-tags", "has", "urgent"),
            _condition("f-status", "equals", "Open"),
        ],
        match="any",
        sort="relevance",
    )
    assert response.status_code == 200
    ids = [entry["id"] for entry in response.json()]
    assert ids == [s["entry1"]["id"], s["entry3"]["id"]]


async def test_relevance_ranks_more_keyword_occurrences_first(authenticated_client, search_project):
    """"high" is created *before* "low", so a plain recency tiebreak would
    put "low" first — the assertion only passes if keyword occurrence count
    actually drives the ranking, not just recency."""
    pid = search_project["id"]
    high = await _make_entry(
        authenticated_client, pid, **{"f-title": "nairobi nairobi nairobi"}
    )
    low = await _make_entry(authenticated_client, pid, **{"f-title": "one mention of nairobi"})

    response = await authenticated_client.get(
        "/entries", params={"project_id": pid, "q": "nairobi", "sort": "relevance"}
    )
    assert response.status_code == 200
    ids = [entry["id"] for entry in response.json()]
    assert ids == [high["id"], low["id"]]


async def test_sort_relevance_is_a_valid_value(authenticated_client, search_entries_set):
    """sort=relevance must pass the endpoint's own pattern validation, not
    just FilterCriteria's — the two are checked independently."""
    s = search_entries_set
    response = await authenticated_client.get(
        "/entries", params={"project_id": s["project_id"], "sort": "relevance"}
    )
    assert response.status_code == 200