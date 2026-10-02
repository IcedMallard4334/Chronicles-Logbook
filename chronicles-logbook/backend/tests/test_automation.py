"""Tests for entry rules, recurrence and reminders (US-3.12).

Acceptance criteria covered:
  1. A rule runs automatically when a matching entry is captured (auto-tag,
     auto-fill a field) — the "Rules" section.
  2. An entry can be marked recurring and the next occurrence is created
     automatically — the "Recurrence" section.
  3. Reminders are raised for entries or todos approaching or past their due
     date — the "Reminders" section.
"""

from datetime import date, timedelta
from uuid import UUID

import pytest
import pytest_asyncio
from sqlalchemy import select

from app.automation import (
    RuleOutcome,
    _apply_action,
    _value_problem,
    display_title,
    occurrence_date,
    server_today,
)
from app.models import EntryRecurrence, RecurrenceOccurrence
from app.schemas import MAX_CATCH_UP_OCCURRENCES, MAX_RULES_PER_PROJECT, MAX_TAGS, FieldType

MEMBER_EMAIL = "second@example.com"

SCHEMA = [
    {"id": "f-summary", "name": "Summary", "type": FieldType.TEXT.value},
    {"id": "f-hours", "name": "Hours", "type": FieldType.NUMBER.value},
    {
        "id": "f-kind",
        "name": "Kind",
        "type": FieldType.DROPDOWN.value,
        "options": ["Bug", "Feature", "Chore"],
    },
    {
        "id": "f-severity",
        "name": "Severity",
        "type": FieldType.DROPDOWN.value,
        "options": ["Low", "High"],
    },
    {"id": "f-tags", "name": "Tags", "type": FieldType.TAGS.value},
    {"id": "f-steps", "name": "Steps", "type": FieldType.CHECKLIST.value},
    {
        "id": "f-cost",
        "name": "Cost",
        "type": FieldType.COMPUTED.value,
        "expression": "{f-hours} * 100",
    },
]


def _data(**overrides):
    data = {
        "f-summary": "Something happened",
        "f-hours": 1,
        "f-kind": "Chore",
        "f-severity": "Low",
        "f-tags": ["logged"],
        "f-steps": [],
    }
    data.update(overrides)
    return data


@pytest_asyncio.fixture(loop_scope="function")
async def project(authenticated_client):
    response = await authenticated_client.post(
        "/projects", json={"name": "Automation Project", "entry_schema": SCHEMA}
    )
    assert response.status_code == 201, response.text
    return response.json()


async def _entry(client, project_id, **payload):
    payload.setdefault("data", _data())
    response = await client.post(f"/projects/{project_id}/entries", json=payload)
    assert response.status_code == 201, response.text
    return response.json()


async def _rule(client, project_id, **rule):
    rule.setdefault("name", "A rule")
    response = await client.post(f"/projects/{project_id}/rules", json=rule)
    assert response.status_code == 201, response.text
    return response.json()


BUG_CONDITION = {"field_id": "f-kind", "operator": "equals", "value": "Bug"}


async def _share(owner_client, member_client, project_id):
    invited = await owner_client.post(
        f"/projects/{project_id}/members", json={"email": MEMBER_EMAIL}
    )
    assert invited.status_code == 201, invited.text
    accepted = await member_client.post(f"/invitations/{project_id}/accept")
    assert accepted.status_code == 204, accepted.text


# ═══ Rules ══════════════════════════════════════════════════════════════════


async def test_rule_auto_tags_a_matching_entry(authenticated_client, project):
    pid = project["id"]
    rule = await _rule(
        authenticated_client,
        pid,
        name="Tag bugs",
        conditions=[BUG_CONDITION],
        actions=[{"type": "add_tags", "field_id": "f-tags", "tags": ["bug", "triage"]}],
    )

    entry = await _entry(authenticated_client, pid, data=_data(**{"f-kind": "Bug"}))

    # The author's tag is kept and the rule's are added after it.
    assert entry["data"]["f-tags"] == ["logged", "bug", "triage"]
    assert entry["applied_rules"] == [{"id": rule["id"], "name": "Tag bugs"}]


async def test_rule_leaves_a_non_matching_entry_alone(authenticated_client, project):
    pid = project["id"]
    await _rule(
        authenticated_client,
        pid,
        conditions=[BUG_CONDITION],
        actions=[{"type": "add_tags", "field_id": "f-tags", "tags": ["bug"]}],
    )

    entry = await _entry(authenticated_client, pid, data=_data(**{"f-kind": "Feature"}))

    assert entry["data"]["f-tags"] == ["logged"]
    assert entry["applied_rules"] == []


async def test_add_tags_does_not_duplicate_a_tag_already_there(authenticated_client, project):
    pid = project["id"]
    await _rule(
        authenticated_client,
        pid,
        actions=[{"type": "add_tags", "field_id": "f-tags", "tags": ["Logged", "new"]}],
    )

    entry = await _entry(authenticated_client, pid)

    assert entry["data"]["f-tags"] == ["logged", "new"]


async def test_rule_auto_fills_a_field_the_author_left_blank(authenticated_client, project):
    """Severity is required; the rule supplies it, so the entry is valid."""
    pid = project["id"]
    await _rule(
        authenticated_client,
        pid,
        conditions=[BUG_CONDITION],
        actions=[{"type": "set_field", "field_id": "f-severity", "value": "High"}],
    )
    data = _data(**{"f-kind": "Bug"})
    del data["f-severity"]

    entry = await _entry(authenticated_client, pid, data=data)

    assert entry["data"]["f-severity"] == "High"


async def test_auto_fill_does_not_overwrite_what_the_author_entered(authenticated_client, project):
    pid = project["id"]
    await _rule(
        authenticated_client,
        pid,
        actions=[{"type": "set_field", "field_id": "f-severity", "value": "High"}],
    )

    entry = await _entry(authenticated_client, pid, data=_data(**{"f-severity": "Low"}))

    assert entry["data"]["f-severity"] == "Low"
    # Nothing changed, so the rule is not reported as having applied.
    assert entry["applied_rules"] == []


async def test_auto_fill_with_overwrite_replaces_the_value(authenticated_client, project):
    pid = project["id"]
    await _rule(
        authenticated_client,
        pid,
        actions=[
            {"type": "set_field", "field_id": "f-severity", "value": "High", "overwrite": True}
        ],
    )

    entry = await _entry(authenticated_client, pid, data=_data(**{"f-severity": "Low"}))

    assert entry["data"]["f-severity"] == "High"


async def test_mark_todo_sets_a_due_date_relative_to_capture(authenticated_client, project):
    pid = project["id"]
    await _rule(
        authenticated_client,
        pid,
        conditions=[BUG_CONDITION],
        actions=[{"type": "mark_todo", "due_in_days": 3}],
    )

    entry = await _entry(authenticated_client, pid, data=_data(**{"f-kind": "Bug"}))

    assert entry["todo"] is True
    assert entry["due_date"] == (server_today() + timedelta(days=3)).isoformat()


async def test_a_due_date_the_author_chose_beats_the_rules(authenticated_client, project):
    pid = project["id"]
    await _rule(
        authenticated_client, pid, actions=[{"type": "mark_todo", "due_in_days": 3}]
    )

    entry = await _entry(authenticated_client, pid, data=_data(), due_date="2030-01-01")

    assert entry["todo"] is True
    assert entry["due_date"] == "2030-01-01"


async def test_rule_without_conditions_applies_to_every_entry(authenticated_client, project):
    pid = project["id"]
    await _rule(
        authenticated_client,
        pid,
        actions=[{"type": "add_tags", "field_id": "f-tags", "tags": ["everything"]}],
    )

    first = await _entry(authenticated_client, pid, data=_data(**{"f-kind": "Bug"}))
    second = await _entry(authenticated_client, pid, data=_data(**{"f-kind": "Feature"}))

    assert "everything" in first["data"]["f-tags"]
    assert "everything" in second["data"]["f-tags"]


async def test_match_any_fires_when_one_condition_holds(authenticated_client, project):
    pid = project["id"]
    await _rule(
        authenticated_client,
        pid,
        match="any",
        conditions=[BUG_CONDITION, {"field_id": "f-hours", "operator": "gt", "value": 8}],
        actions=[{"type": "add_tags", "field_id": "f-tags", "tags": ["attention"]}],
    )

    long_feature = await _entry(
        authenticated_client, pid, data=_data(**{"f-kind": "Feature", "f-hours": 10})
    )
    short_feature = await _entry(
        authenticated_client, pid, data=_data(**{"f-kind": "Feature", "f-hours": 1})
    )

    assert "attention" in long_feature["data"]["f-tags"]
    assert "attention" not in short_feature["data"]["f-tags"]


async def test_condition_can_use_a_computed_field(authenticated_client, project):
    pid = project["id"]
    await _rule(
        authenticated_client,
        pid,
        conditions=[{"field_id": "f-cost", "operator": "gte", "value": 500}],
        actions=[{"type": "add_tags", "field_id": "f-tags", "tags": ["expensive"]}],
    )

    entry = await _entry(authenticated_client, pid, data=_data(**{"f-hours": 6}))

    assert "expensive" in entry["data"]["f-tags"]


async def test_disabled_rule_does_not_run(authenticated_client, project):
    pid = project["id"]
    await _rule(
        authenticated_client,
        pid,
        enabled=False,
        actions=[{"type": "add_tags", "field_id": "f-tags", "tags": ["never"]}],
    )

    entry = await _entry(authenticated_client, pid)

    assert "never" not in entry["data"]["f-tags"]


async def test_rules_do_not_rerun_when_an_entry_is_edited(authenticated_client, project):
    """A tag the author removed on purpose must not come back on the next save."""
    pid = project["id"]
    await _rule(
        authenticated_client,
        pid,
        actions=[{"type": "add_tags", "field_id": "f-tags", "tags": ["auto"]}],
    )
    entry = await _entry(authenticated_client, pid)

    response = await authenticated_client.put(
        f"/projects/{pid}/entries/{entry['id']}",
        json={"data": _data(**{"f-tags": ["logged"]})},
    )

    assert response.status_code == 200
    assert response.json()["data"]["f-tags"] == ["logged"]


async def test_replaying_an_entry_does_not_apply_rules_twice(authenticated_client, project):
    pid = project["id"]
    await _rule(
        authenticated_client,
        pid,
        actions=[{"type": "add_tags", "field_id": "f-tags", "tags": ["auto"]}],
    )
    payload = {"id": "11111111-2222-3333-4444-555555555555", "data": _data()}

    first = await authenticated_client.post(f"/projects/{pid}/entries", json=payload)
    replay = await authenticated_client.post(f"/projects/{pid}/entries", json=payload)

    assert first.status_code == 201
    assert replay.status_code == 200
    assert replay.json()["data"]["f-tags"] == ["logged", "auto"]


async def test_rule_action_on_a_removed_dropdown_option_is_skipped(authenticated_client, project):
    """The schema changed after the rule was saved: skip the action, keep the entry."""
    pid = project["id"]
    await _rule(
        authenticated_client,
        pid,
        actions=[
            {"type": "set_field", "field_id": "f-severity", "value": "High", "overwrite": True},
            {"type": "add_tags", "field_id": "f-tags", "tags": ["still-works"]},
        ],
    )
    new_schema = [dict(f) for f in SCHEMA]
    for field in new_schema:
        if field["id"] == "f-severity":
            field["options"] = ["Low", "Medium"]
    changed = await authenticated_client.put(
        f"/projects/{pid}/schema", json={"entry_schema": new_schema}
    )
    assert changed.status_code == 200, changed.text

    entry = await _entry(authenticated_client, pid, data=_data(**{"f-severity": "Medium"}))

    assert entry["data"]["f-severity"] == "Medium"
    assert "still-works" in entry["data"]["f-tags"]


@pytest.mark.parametrize(
    "rule, detail_fragment",
    [
        (
            {"conditions": [{"field_id": "nope", "operator": "equals", "value": 1}],
             "actions": [{"type": "mark_todo"}]},
            "not a field",
        ),
        (
            {"conditions": [{"field_id": "f-hours", "operator": "contains", "value": 1}],
             "actions": [{"type": "mark_todo"}]},
            "can't be used",
        ),
        (
            {"actions": [{"type": "add_tags", "field_id": "f-summary", "tags": ["x"]}]},
            "not a tags field",
        ),
        (
            {"actions": [{"type": "add_tags", "field_id": "missing", "tags": ["x"]}]},
            "not a field",
        ),
        (
            {"actions": [{"type": "add_tags", "field_id": "f-tags", "tags": ["  "]}]},
            "empty tag",
        ),
        (
            {"actions": [{"type": "add_tags", "field_id": "f-tags", "tags": ["x" * 31]}]},
            "characters or fewer",
        ),
        (
            {"actions": [{"type": "set_field", "field_id": "f-cost", "value": 5}]},
            "filled by hand",
        ),
        (
            {"actions": [{"type": "set_field", "field_id": "f-severity", "value": "Urgent"}]},
            "must be one of",
        ),
        (
            {"actions": [{"type": "set_field", "field_id": "f-hours", "value": "ten"}]},
            "needs a number",
        ),
        (
            {"actions": [{"type": "set_field", "field_id": "f-summary", "value": ""}]},
            "non-empty text",
        ),
    ],
)
async def test_invalid_rules_are_refused_with_a_reason(
    authenticated_client, project, rule, detail_fragment
):
    response = await authenticated_client.post(
        f"/projects/{project['id']}/rules", json={"name": "Bad", **rule}
    )

    assert response.status_code == 422
    assert detail_fragment in response.json()["detail"]


@pytest.mark.parametrize(
    "rule",
    [
        {"name": "No actions", "actions": []},
        {"name": "Unknown key", "actions": [{"type": "mark_todo"}], "surprise": True},
        {"name": "Unknown action", "actions": [{"type": "send_email"}]},
        {"name": "", "actions": [{"type": "mark_todo"}]},
        {"name": "Bad match", "match": "some", "actions": [{"type": "mark_todo"}]},
        {"name": "Too late", "actions": [{"type": "mark_todo", "due_in_days": 999}]},
    ],
)
async def test_malformed_rule_bodies_are_rejected(authenticated_client, project, rule):
    response = await authenticated_client.post(f"/projects/{project['id']}/rules", json=rule)

    assert response.status_code == 422


async def test_rules_can_be_listed_read_replaced_and_deleted(authenticated_client, project):
    pid = project["id"]
    rule = await _rule(authenticated_client, pid, actions=[{"type": "mark_todo"}])

    listed = await authenticated_client.get(f"/projects/{pid}/rules")
    assert [r["id"] for r in listed.json()] == [rule["id"]]

    fetched = await authenticated_client.get(f"/projects/{pid}/rules/{rule['id']}")
    assert fetched.status_code == 200

    replaced = await authenticated_client.put(
        f"/projects/{pid}/rules/{rule['id']}",
        json={
            "name": "Renamed",
            "enabled": False,
            "actions": [{"type": "add_tags", "field_id": "f-tags", "tags": ["x"]}],
        },
    )
    assert replaced.status_code == 200
    assert replaced.json()["name"] == "Renamed"
    assert replaced.json()["enabled"] is False
    assert replaced.json()["actions"][0]["type"] == "add_tags"

    deleted = await authenticated_client.delete(f"/projects/{pid}/rules/{rule['id']}")
    assert deleted.status_code == 204
    missing = await authenticated_client.get(f"/projects/{pid}/rules/{rule['id']}")
    assert missing.status_code == 404


async def test_a_project_has_a_rule_limit(authenticated_client, project):
    pid = project["id"]
    for index in range(MAX_RULES_PER_PROJECT):
        await _rule(authenticated_client, pid, name=f"Rule {index}", actions=[{"type": "mark_todo"}])

    response = await authenticated_client.post(
        f"/projects/{pid}/rules", json={"name": "One too many", "actions": [{"type": "mark_todo"}]}
    )

    assert response.status_code == 409


async def test_rules_cannot_be_added_to_an_archived_project(authenticated_client, project):
    pid = project["id"]
    await authenticated_client.post(f"/projects/{pid}/archive")

    response = await authenticated_client.post(
        f"/projects/{pid}/rules", json={"name": "Late", "actions": [{"type": "mark_todo"}]}
    )

    assert response.status_code == 409


async def test_member_can_read_rules_but_not_manage_them(
    authenticated_client, second_authenticated_client, project
):
    pid = project["id"]
    rule = await _rule(authenticated_client, pid, actions=[{"type": "mark_todo"}])
    await _share(authenticated_client, second_authenticated_client, pid)

    listed = await second_authenticated_client.get(f"/projects/{pid}/rules")
    created = await second_authenticated_client.post(
        f"/projects/{pid}/rules", json={"name": "Mine", "actions": [{"type": "mark_todo"}]}
    )
    deleted = await second_authenticated_client.delete(f"/projects/{pid}/rules/{rule['id']}")

    assert listed.status_code == 200
    assert created.status_code == 404
    assert deleted.status_code == 404


async def test_rules_apply_to_entries_a_member_captures(
    authenticated_client, second_authenticated_client, project
):
    pid = project["id"]
    await _rule(
        authenticated_client,
        pid,
        actions=[{"type": "add_tags", "field_id": "f-tags", "tags": ["team"]}],
    )
    await _share(authenticated_client, second_authenticated_client, pid)

    entry = await _entry(second_authenticated_client, pid)

    assert "team" in entry["data"]["f-tags"]


async def test_strangers_cannot_see_rules(
    authenticated_client, second_authenticated_client, project
):
    response = await second_authenticated_client.get(f"/projects/{project['id']}/rules")

    assert response.status_code == 404


async def test_rule_from_another_project_is_not_found(authenticated_client, project):
    other = await authenticated_client.post("/projects", json={"name": "Other", "entry_schema": []})
    rule = await _rule(authenticated_client, project["id"], actions=[{"type": "mark_todo"}])

    response = await authenticated_client.get(f"/projects/{other.json()['id']}/rules/{rule['id']}")

    assert response.status_code == 404


async def test_deleting_a_project_removes_its_rules_and_recurrences(authenticated_client, project):
    pid = project["id"]
    await _rule(authenticated_client, pid, actions=[{"type": "mark_todo"}])
    entry = await _entry(authenticated_client, pid)
    await authenticated_client.put(
        f"/projects/{pid}/entries/{entry['id']}/recurrence", json={"frequency": "daily"}
    )

    response = await authenticated_client.delete(f"/projects/{pid}")

    assert response.status_code == 204


# ═══ Recurrence ═════════════════════════════════════════════════════════════


@pytest.mark.parametrize(
    "starts_on, frequency, interval, index, expected",
    [
        (date(2026, 1, 1), "daily", 1, 3, date(2026, 1, 4)),
        (date(2026, 1, 1), "daily", 2, 3, date(2026, 1, 7)),
        (date(2026, 1, 1), "weekly", 1, 2, date(2026, 1, 15)),
        (date(2026, 1, 31), "monthly", 1, 1, date(2026, 2, 28)),
        # Counted from the anchor, so it returns to the 31st after February.
        (date(2026, 1, 31), "monthly", 1, 2, date(2026, 3, 31)),
        (date(2024, 1, 31), "monthly", 1, 1, date(2024, 2, 29)),
        (date(2026, 11, 15), "monthly", 3, 1, date(2027, 2, 15)),
    ],
)
def test_occurrence_dates(starts_on, frequency, interval, index, expected):
    assert occurrence_date(starts_on, frequency, interval, index) == expected


def test_unknown_frequency_is_an_error():
    with pytest.raises(ValueError):
        occurrence_date(date(2026, 1, 1), "hourly", 1, 1)


async def _repeat(client, project_id, entry_id, **body):
    return await client.put(f"/projects/{project_id}/entries/{entry_id}/recurrence", json=body)


async def _entries(client, project_id):
    response = await client.get(f"/projects/{project_id}/entries")
    return response.json()


async def test_marking_an_entry_recurring(authenticated_client, project):
    pid = project["id"]
    entry = await _entry(authenticated_client, pid)

    created = await _repeat(
        authenticated_client, pid, entry["id"], frequency="weekly", starts_on="2026-10-01"
    )

    assert created.status_code == 201
    body = created.json()
    assert body["frequency"] == "weekly"
    assert body["starts_on"] == "2026-10-01"
    assert body["next_on"] == "2026-10-08"
    assert body["active"] is True
    assert body["occurrences_created"] == 0

    fetched = await authenticated_client.get(f"/projects/{pid}/entries/{entry['id']}/recurrence")
    assert fetched.json()["id"] == body["id"]


async def test_recurrence_defaults_to_the_entrys_due_date(authenticated_client, project):
    pid = project["id"]
    entry = await _entry(authenticated_client, pid, todo=True, due_date="2026-12-01")

    response = await _repeat(authenticated_client, pid, entry["id"], frequency="monthly")

    assert response.json()["starts_on"] == "2026-12-01"
    assert response.json()["next_on"] == "2027-01-01"


async def test_next_occurrence_is_created_automatically(authenticated_client, project):
    """The source is due three days ago, daily: three occurrences are now due."""
    pid = project["id"]
    today = server_today()
    source = await _entry(
        authenticated_client,
        pid,
        title="Daily check",
        todo=True,
        due_date=(today - timedelta(days=3)).isoformat(),
        data=_data(**{"f-steps": [{"id": "s1", "text": "Look", "completed": True}]}),
    )
    await _repeat(authenticated_client, pid, source["id"], frequency="daily")

    reminders = await authenticated_client.get("/reminders")

    assert reminders.status_code == 200
    assert reminders.json()["occurrences_created"] == 3
    entries = await _entries(authenticated_client, pid)
    copies = [e for e in entries if e["id"] != source["id"]]
    assert sorted(e["due_date"] for e in copies) == [
        (today - timedelta(days=offset)).isoformat() for offset in (2, 1, 0)
    ]
    for copy in copies:
        assert copy["title"] == "Daily check"
        assert copy["todo"] is True
        # A new occurrence's checklist starts unticked.
        assert copy["data"]["f-steps"][0]["completed"] is False

    recurrence = await authenticated_client.get(f"/projects/{pid}/entries/{source['id']}/recurrence")
    assert recurrence.json()["occurrences_created"] == 3
    assert recurrence.json()["next_on"] == (today + timedelta(days=1)).isoformat()


async def test_creating_occurrences_twice_makes_no_duplicates(authenticated_client, project):
    pid = project["id"]
    today = server_today()
    source = await _entry(authenticated_client, pid, due_date=(today - timedelta(days=1)).isoformat())
    await _repeat(authenticated_client, pid, source["id"], frequency="daily")

    first = await authenticated_client.get("/reminders")
    second = await authenticated_client.get("/reminders")
    listed = await authenticated_client.get(f"/projects/{pid}/recurrences")

    assert first.json()["occurrences_created"] == 1
    assert second.json()["occurrences_created"] == 0
    assert listed.status_code == 200
    assert len(await _entries(authenticated_client, pid)) == 2


async def test_restarting_a_schedule_does_not_recreate_past_occurrences(
    authenticated_client, project
):
    """Replacing a recurrence restarts it, but dates already made stay made."""
    pid = project["id"]
    start = (server_today() - timedelta(days=2)).isoformat()
    source = await _entry(authenticated_client, pid)
    await _repeat(authenticated_client, pid, source["id"], frequency="daily", starts_on=start)
    await authenticated_client.get("/reminders")

    restarted = await _repeat(
        authenticated_client, pid, source["id"], frequency="daily", starts_on=start
    )
    again = await authenticated_client.get("/reminders")

    assert restarted.status_code == 200
    assert again.json()["occurrences_created"] == 0
    assert len(await _entries(authenticated_client, pid)) == 3


async def test_an_occurrence_created_elsewhere_is_skipped(
    authenticated_client, project, db_session
):
    """Simulates another worker winning the race for one date."""
    pid = project["id"]
    today = server_today()
    source = await _entry(authenticated_client, pid)
    made = await _repeat(
        authenticated_client,
        pid,
        source["id"],
        frequency="daily",
        starts_on=(today - timedelta(days=2)).isoformat(),
    )
    db_session.add(
        RecurrenceOccurrence(
            recurrence_id=UUID(made.json()["id"]), occurrence_on=today - timedelta(days=1)
        )
    )
    await db_session.commit()

    response = await authenticated_client.get("/reminders")

    assert response.json()["occurrences_created"] == 1
    recurrence = await db_session.scalar(select(EntryRecurrence))
    assert recurrence.next_on == today + timedelta(days=1)


async def test_recurrence_stops_at_its_end_date(authenticated_client, project):
    pid = project["id"]
    today = server_today()
    source = await _entry(authenticated_client, pid)
    await _repeat(
        authenticated_client,
        pid,
        source["id"],
        frequency="daily",
        starts_on=(today - timedelta(days=5)).isoformat(),
        ends_on=(today - timedelta(days=4)).isoformat(),
    )

    response = await authenticated_client.get("/reminders")

    assert response.json()["occurrences_created"] == 1
    recurrence = await authenticated_client.get(f"/projects/{pid}/entries/{source['id']}/recurrence")
    assert recurrence.json()["active"] is False
    assert recurrence.json()["next_on"] is None


async def test_catch_up_is_capped_per_call(authenticated_client, project):
    pid = project["id"]
    source = await _entry(authenticated_client, pid)
    await _repeat(
        authenticated_client,
        pid,
        source["id"],
        frequency="daily",
        starts_on=(server_today() - timedelta(days=40)).isoformat(),
    )

    first = await authenticated_client.get("/reminders")
    second = await authenticated_client.get("/reminders")

    assert first.json()["occurrences_created"] == MAX_CATCH_UP_OCCURRENCES
    assert second.json()["occurrences_created"] == 40 - MAX_CATCH_UP_OCCURRENCES


async def test_archived_projects_do_not_produce_occurrences(authenticated_client, project):
    pid = project["id"]
    source = await _entry(authenticated_client, pid)
    await _repeat(
        authenticated_client,
        pid,
        source["id"],
        frequency="daily",
        starts_on=(server_today() - timedelta(days=2)).isoformat(),
    )
    await authenticated_client.post(f"/projects/{pid}/archive")

    reminders = await authenticated_client.get("/reminders")
    listed = await authenticated_client.get(f"/projects/{pid}/recurrences")

    assert reminders.json()["occurrences_created"] == 0
    assert listed.json()[0]["occurrences_created"] == 0


async def test_stopping_a_recurrence_keeps_existing_occurrences(authenticated_client, project):
    pid = project["id"]
    source = await _entry(authenticated_client, pid)
    await _repeat(
        authenticated_client,
        pid,
        source["id"],
        frequency="daily",
        starts_on=(server_today() - timedelta(days=1)).isoformat(),
    )
    await authenticated_client.get("/reminders")

    stopped = await authenticated_client.delete(f"/projects/{pid}/entries/{source['id']}/recurrence")
    gone = await authenticated_client.get(f"/projects/{pid}/entries/{source['id']}/recurrence")
    stop_again = await authenticated_client.delete(
        f"/projects/{pid}/entries/{source['id']}/recurrence"
    )

    assert stopped.status_code == 204
    assert gone.status_code == 404
    assert stop_again.status_code == 404
    assert len(await _entries(authenticated_client, pid)) == 2


@pytest.mark.parametrize(
    "body",
    [
        {"frequency": "hourly"},
        {"frequency": "daily", "interval": 0},
        {"frequency": "daily", "starts_on": "2026-10-10", "ends_on": "2026-10-01"},
        {"frequency": "daily", "every": 2},
    ],
)
async def test_invalid_recurrence_is_rejected(authenticated_client, project, body):
    entry = await _entry(authenticated_client, project["id"])

    response = await _repeat(authenticated_client, project["id"], entry["id"], **body)

    assert response.status_code == 422


async def test_end_date_before_the_default_start_is_rejected(authenticated_client, project):
    entry = await _entry(authenticated_client, project["id"], due_date="2026-12-01")

    response = await _repeat(
        authenticated_client, project["id"], entry["id"], frequency="daily", ends_on="2026-11-01"
    )

    assert response.status_code == 422


async def test_member_cannot_make_the_owners_entry_repeat(
    authenticated_client, second_authenticated_client, project
):
    pid = project["id"]
    entry = await _entry(authenticated_client, pid)
    await _share(authenticated_client, second_authenticated_client, pid)

    response = await _repeat(second_authenticated_client, pid, entry["id"], frequency="daily")

    assert response.status_code == 403


async def test_member_can_make_their_own_entry_repeat(
    authenticated_client, second_authenticated_client, project
):
    pid = project["id"]
    await _share(authenticated_client, second_authenticated_client, pid)
    entry = await _entry(second_authenticated_client, pid)

    response = await _repeat(second_authenticated_client, pid, entry["id"], frequency="daily")

    assert response.status_code == 201


async def test_entry_without_recurrence_returns_404(authenticated_client, project):
    entry = await _entry(authenticated_client, project["id"])

    response = await authenticated_client.get(
        f"/projects/{project['id']}/entries/{entry['id']}/recurrence"
    )

    assert response.status_code == 404


async def test_recurrence_cannot_be_added_in_an_archived_project(authenticated_client, project):
    pid = project["id"]
    entry = await _entry(authenticated_client, pid)
    await authenticated_client.post(f"/projects/{pid}/archive")

    response = await _repeat(authenticated_client, pid, entry["id"], frequency="daily")

    assert response.status_code == 409


# ═══ Reminders ══════════════════════════════════════════════════════════════


async def test_reminders_list_overdue_due_today_and_upcoming(authenticated_client, project):
    pid = project["id"]
    today = server_today()

    def day(offset):
        return (today + timedelta(days=offset)).isoformat()

    overdue = await _entry(authenticated_client, pid, title="Late", todo=True, due_date=day(-2))
    await _entry(authenticated_client, pid, title="Now", todo=True, due_date=day(0))
    await _entry(authenticated_client, pid, title="Soon", todo=True, due_date=day(3))
    await _entry(authenticated_client, pid, title="Far", todo=True, due_date=day(30))
    await _entry(authenticated_client, pid, title="Done", todo=False, due_date=day(-1))
    task = await authenticated_client.post(
        f"/projects/{pid}/tasks", json={"title": "Task soon", "due_date": day(1)}
    )
    finished = await authenticated_client.post(
        f"/projects/{pid}/tasks", json={"title": "Finished", "due_date": day(-1)}
    )
    await authenticated_client.patch(f"/projects/{pid}/tasks/{finished.json()['id']}/toggle")

    response = await authenticated_client.get("/reminders", params={"within_days": 7})

    assert response.status_code == 200
    body = response.json()
    assert [item["title"] for item in body["items"]] == ["Late", "Now", "Task soon", "Soon"]
    assert (body["overdue_count"], body["due_today_count"], body["upcoming_count"]) == (1, 1, 2)
    first = body["items"][0]
    assert first["id"] == overdue["id"]
    assert first["kind"] == "entry"
    assert first["status"] == "overdue"
    assert first["days_until"] == -2
    assert first["project_name"] == "Automation Project"
    assert body["items"][2]["kind"] == "task"
    assert body["items"][2]["id"] == task.json()["id"]


async def test_reminder_window_can_be_widened(authenticated_client, project):
    pid = project["id"]
    far = (server_today() + timedelta(days=30)).isoformat()
    await _entry(authenticated_client, pid, todo=True, due_date=far)

    narrow = await authenticated_client.get("/reminders", params={"within_days": 7})
    wide = await authenticated_client.get("/reminders", params={"within_days": 30})

    assert narrow.json()["items"] == []
    assert len(wide.json()["items"]) == 1


async def test_reminder_falls_back_to_the_first_text_value(authenticated_client, project):
    await _entry(
        authenticated_client,
        project["id"],
        todo=True,
        due_date=server_today().isoformat(),
        data=_data(**{"f-summary": "Fix the leaking tap"}),
    )

    response = await authenticated_client.get("/reminders")

    assert response.json()["items"][0]["title"] == "Fix the leaking tap"


async def test_reminders_include_shared_projects_but_not_strangers(
    authenticated_client, second_authenticated_client, project
):
    pid = project["id"]
    await _entry(authenticated_client, pid, todo=True, due_date=server_today().isoformat())

    before = await second_authenticated_client.get("/reminders")
    await _share(authenticated_client, second_authenticated_client, pid)
    after = await second_authenticated_client.get("/reminders")

    assert before.json()["items"] == []
    assert len(after.json()["items"]) == 1


async def test_archived_projects_raise_no_reminders(authenticated_client, project):
    pid = project["id"]
    await _entry(authenticated_client, pid, todo=True, due_date=server_today().isoformat())
    await authenticated_client.post(f"/projects/{pid}/archive")

    response = await authenticated_client.get("/reminders")

    assert response.json()["items"] == []


async def test_reminders_use_the_clients_date(authenticated_client, project):
    """Between 00:00 and 02:00 in South Africa the UTC server is still on yesterday."""
    tomorrow = server_today() + timedelta(days=1)
    await _entry(authenticated_client, project["id"], todo=True, due_date=tomorrow.isoformat())

    response = await authenticated_client.get("/reminders", params={"today": tomorrow.isoformat()})

    assert response.json()["today"] == tomorrow.isoformat()
    assert response.json()["items"][0]["status"] == "due_today"


@pytest.mark.parametrize(
    "params",
    [{"today": "2000-01-01"}, {"within_days": -1}, {"within_days": 61}, {"today": "soon"}],
)
async def test_bad_reminder_parameters_are_rejected(authenticated_client, params):
    response = await authenticated_client.get("/reminders", params=params)

    assert response.status_code == 422


async def test_reminders_require_login(async_client):
    response = await async_client.get("/reminders")

    assert response.status_code == 401


def test_display_title_prefers_the_title_then_text():
    schema = [{"id": "n", "type": "number"}, {"id": "t", "type": "text"}]
    assert display_title("Named", {"t": "x"}, schema) == "Named"
    assert display_title(None, {"n": 1, "t": "  From text  "}, schema) == "From text"
    assert display_title(None, {"n": 1}, schema) is None


# ═══ Rule engine edge cases (unit level) ════════════════════════════════════


def test_value_checks_for_each_settable_type():
    date_field = {"id": "d", "name": "When", "type": "date"}
    text_field = {"id": "t", "name": "Note", "type": "text"}
    assert _value_problem(date_field, "2026-10-01") is None
    assert "YYYY-MM-DD" in _value_problem(date_field, "next week")
    assert "YYYY-MM-DD" in _value_problem(date_field, 20261001)
    assert "1000 characters" in _value_problem(text_field, "x" * 1001)


def _outcome(data):
    return RuleOutcome(data=dict(data))


def test_action_on_a_field_that_no_longer_exists_is_skipped():
    outcome = _outcome({})
    changed = _apply_action(
        {"type": "set_field", "field_id": "gone", "value": 1}, outcome, {}, server_today()
    )
    assert changed is False
    assert outcome.data == {}


def test_add_tags_on_a_field_retyped_away_from_tags_is_skipped():
    fields = {"f": {"id": "f", "name": "F", "type": "text"}}
    outcome = _outcome({"f": "words"})
    changed = _apply_action(
        {"type": "add_tags", "field_id": "f", "tags": ["x"]}, outcome, fields, server_today()
    )
    assert changed is False
    assert outcome.data == {"f": "words"}


def test_add_tags_stops_at_the_tag_limit():
    fields = {"f": {"id": "f", "name": "F", "type": "tags"}}
    full = [f"t{i}" for i in range(MAX_TAGS - 1)]
    outcome = _outcome({"f": list(full)})
    _apply_action(
        {"type": "add_tags", "field_id": "f", "tags": ["one", "two"]}, outcome, fields, server_today()
    )
    assert outcome.data["f"] == [*full, "one"]


def test_unknown_action_type_does_nothing():
    fields = {"f": {"id": "f", "name": "F", "type": "text"}}
    assert _apply_action({"type": "explode", "field_id": "f"}, _outcome({}), fields, server_today()) is False


# ═══ Rules that follow the flow: statuses, follow-up tasks, repeats ═════════


async def test_a_rule_can_set_the_status_and_add_a_follow_up_task_and_a_repeat(authenticated_client, project):
    pid = project["id"]
    await _rule(
        authenticated_client,
        pid,
        name="Bugs need a look",
        conditions=[BUG_CONDITION],
        actions=[
            {"type": "set_status", "status": "Still to do"},
            {"type": "create_task", "title": "Triage: {title}", "due_in_days": 2},
            {"type": "repeat", "frequency": "weekly", "interval": 1},
        ],
    )

    entry = await _entry(authenticated_client, pid, title="Login fails", data=_data(**{"f-kind": "Bug"}))

    assert entry["status"] == "Still to do" and entry["todo"] is True
    tasks = (await authenticated_client.get(f"/projects/{pid}/tasks")).json()
    assert [t["title"] for t in tasks] == ["Triage: Login fails"]
    assert tasks[0]["due_date"] == (server_today() + timedelta(days=2)).isoformat()
    repeat = await authenticated_client.get(f"/projects/{pid}/entries/{entry['id']}/recurrence")
    assert repeat.status_code == 200 and repeat.json()["frequency"] == "weekly"


async def test_a_rule_waiting_for_a_status_adds_its_task_when_an_entry_gets_there(authenticated_client, project):
    pid = project["id"]
    await _rule(
        authenticated_client,
        pid,
        name="Follow up when done",
        trigger="status",
        trigger_status="Done",
        actions=[{"type": "create_task", "title": "Write up {title}"}],
    )
    entry = await _entry(authenticated_client, pid, title="Parser", status="Still to do")
    assert (await authenticated_client.get(f"/projects/{pid}/tasks")).json() == []

    await authenticated_client.put(f"/projects/{pid}/entries/{entry['id']}", json={"status": "Done"})

    tasks = (await authenticated_client.get(f"/projects/{pid}/tasks")).json()
    assert [t["title"] for t in tasks] == ["Write up Parser"]

    # Saving again without moving it somewhere new does not add another.
    await authenticated_client.put(f"/projects/{pid}/entries/{entry['id']}", json={"title": "Parser v2"})
    assert len((await authenticated_client.get(f"/projects/{pid}/tasks")).json()) == 1


@pytest.mark.parametrize(
    ("rule", "message"),
    [
        ({"trigger": "status", "actions": [{"type": "create_task", "title": "x"}]}, "status"),
        (
            {"trigger": "status", "trigger_status": "Nope", "actions": [{"type": "create_task", "title": "x"}]},
            "not a status",
        ),
        (
            {"trigger": "status", "trigger_status": "Done", "actions": [{"type": "mark_todo"}]},
            "task or repeat",
        ),
        ({"actions": [{"type": "set_status", "status": "Nope"}]}, "not a status"),
    ],
)
async def test_rules_that_cannot_work_are_refused(authenticated_client, project, rule, message):
    response = await authenticated_client.post(
        f"/projects/{project['id']}/rules", json={"name": "Bad", **rule}
    )

    assert response.status_code == 422
    assert message in response.text
