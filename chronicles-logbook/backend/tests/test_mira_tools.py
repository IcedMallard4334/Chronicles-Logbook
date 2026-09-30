"""What Mira may propose, how a proposal is checked, and what she is shown."""

from datetime import date
from types import SimpleNamespace

import pytest

from app.mira_tools import DECLARATIONS, TOOLS, InvalidProposal, summarise, validate_call
from app.routers import ai as ai_router
from app.services import gemini_service

FIELDS = [
    {"id": "hours", "name": "Hours", "type": "number"},
    {"id": "kind", "name": "Kind", "type": "dropdown", "options": ["Bug", "Feature"]},
]


# ── the catalogue ──────────────────────────────────────────────────


def test_every_function_has_a_declaration_a_validator_and_a_summary():
    assert len(DECLARATIONS) == len(TOOLS) >= 25
    for name, (declaration, _model, _destructive) in TOOLS.items():
        assert declaration["name"] == name
        assert declaration["type"] == "function" and declaration["description"]
        assert declaration["parameters"]["type"] == "object"
    assert {"create_project", "add_field", "rename_field", "create_task", "set_reminder", "create_activity"} <= set(TOOLS)


def test_only_deleting_things_is_marked_destructive():
    assert {name for name, (_d, _m, destructive) in TOOLS.items() if destructive} == {
        "delete_project", "delete_entry", "delete_task", "delete_activity",
    }


# ── validating a call ──────────────────────────────────────────────


def test_a_valid_call_becomes_a_proposal_with_a_summary():
    proposal = validate_call("create_task", {"project": "Bug Log", "title": "Fix login", "due_date": "2026-10-02"})

    assert proposal["type"] == "create_task"
    assert proposal["payload"] == {"project": "Bug Log", "title": "Fix login", "due_date": "2026-10-02", "checklist": []}
    assert proposal["requires_confirmation"] is True and proposal["destructive"] is False
    assert proposal["summary"] == "Add the task “Fix login” to “Bug Log”, due 2026-10-02"


def test_a_project_can_be_proposed_with_fields_and_statuses():
    proposal = validate_call(
        "create_project",
        {
            "name": "Sprint",
            "fields": [{"name": "Hours", "type": "number"}, {"name": "Kind", "type": "dropdown", "options": ["Bug", "Feature"]}],
            "statuses": [{"name": "Open"}, {"name": "Closed", "done": True}],
        },
    )
    assert proposal["summary"] == "Create project “Sprint” with 2 fields"
    assert proposal["payload"]["statuses"][1] == {"name": "Closed", "done": True}


@pytest.mark.parametrize(
    ("name", "arguments", "message"),
    [
        ("drop_database", {}, "not something Mira can do"),
        ("create_task", "oops", "not well formed"),
        ("create_task", {"project": "P"}, "title"),
        ("create_task", {"project": "P", "title": "T", "surprise": 1}, "surprise"),
        ("create_task", {"project": "P", "title": "T", "due_date": "tomorrow"}, "due_date"),
        ("create_activity", {"title": "A", "day": "2026-10-01", "start_time": "25:00"}, "start_time"),
        ("create_project", {"name": "P", "fields": [{"name": "F", "type": "rocket"}]}, "type"),
        ("set_statuses", {"project": "P", "statuses": [{"name": "Only"}]}, "statuses"),
        ("open_page", {"page": "settings-of-doom"}, "page"),
        ("set_recurrence", {"entry": "e", "frequency": "hourly"}, "frequency"),
    ],
)
def test_invalid_calls_are_refused_with_a_readable_reason(name, arguments, message):
    with pytest.raises(InvalidProposal, match=message):
        validate_call(name, arguments)


def test_oversized_text_is_refused():
    with pytest.raises(InvalidProposal):
        validate_call("create_project", {"name": "x" * 256})
    with pytest.raises(InvalidProposal):
        validate_call("create_task", {"project": "P", "title": "T", "checklist": ["x" * 31]})


def test_summaries_read_as_plain_sentences():
    assert summarise("delete_project", {"project": "Old"}) == "Delete project “Old” and everything in it"
    assert summarise("archive_project", {"project": "Old", "archive": False}) == "Unarchive project “Old”"
    assert summarise("set_recurrence", {"frequency": "weekly", "interval": 1}) == "Repeat an entry every week"
    assert summarise("set_recurrence", {"frequency": "daily", "interval": 3}) == "Repeat an entry every 3 days"
    assert summarise("set_reminder", {"kind": "task", "due_date": "2026-10-01", "due_time": "09:30"}) == "Remind you about a task on 2026-10-01 at 09:30"
    assert summarise("share_project", {"project": "P", "email": "a@b.co"}) == "Invite a@b.co to “P”"
    assert summarise("complete_task", {"completed": False}) == "Reopen a task"


def test_every_tool_can_be_summarised_from_a_minimal_valid_call():
    samples = {
        "create_project": {"name": "P"}, "update_project": {"project": "P", "name": "Q"},
        "set_statuses": {"project": "P", "statuses": [{"name": "A"}, {"name": "B", "done": True}]},
        "archive_project": {"project": "P"}, "delete_project": {"project": "P"},
        "add_field": {"project": "P", "field": {"name": "F"}}, "rename_field": {"project": "P", "field": "F", "new_name": "G"},
        "remove_field": {"project": "P", "field": "F"}, "create_entry": {"project": "P", "title": "t"},
        "update_entry": {"entry": "e"}, "delete_entry": {"entry": "e"},
        "create_task": {"project": "P", "title": "T"}, "update_task": {"task": "t"},
        "complete_task": {"task": "t"}, "delete_task": {"task": "t"},
        "create_activity": {"title": "A", "day": "2026-10-01"}, "update_activity": {"activity": "a"},
        "delete_activity": {"activity": "a"}, "set_reminder": {"kind": "entry", "target": "e", "due_date": "2026-10-01"},
        "set_recurrence": {"entry": "e", "frequency": "monthly"}, "stop_recurrence": {"entry": "e"},
        "create_rule": {"project": "P", "name": "R", "actions": [{"type": "mark_todo"}]},
        "share_project": {"project": "P", "email": "a@b.co"}, "create_statistic": {"project": "P", "name": "S", "expression": "SUM({Hours})"},
        "open_page": {"page": "board"}, "set_theme": {"theme": "dark"},
    }
    assert set(samples) == set(TOOLS)
    for name, arguments in samples.items():
        proposal = validate_call(name, arguments)
        assert proposal["summary"] and proposal["summary"] != name


# ── several calls in one reply ─────────────────────────────────────


def _event(event_type, **fields):
    return SimpleNamespace(event_type=event_type, **fields)


def _stream(monkeypatch, events):
    class FakeClient:
        def __init__(self, **_kwargs):
            self.interactions = SimpleNamespace(create=lambda **kwargs: iter(events))

    monkeypatch.setattr(gemini_service.config, "GEMINI_API_KEY", "test-key")
    monkeypatch.setattr(gemini_service.genai, "Client", FakeClient)


def _call(tool, **arguments):
    return _event("step.start", step=SimpleNamespace(type="function_call", name=tool, arguments=arguments))


def test_one_reply_can_propose_several_actions_in_order(monkeypatch):
    _stream(monkeypatch, [
        _call("create_project", name="Launch"),
        _event("step.stop"),
        _call("create_task", project="Launch", title="Write copy"),
        _event("step.stop"),
        _call("create_task", project="Launch", title="Book venue", due_date="2026-10-05"),
    ])

    actions = [e["action"] for e in gemini_service.stream_response("Plan a launch") if e["type"] == "action"]

    assert [a["type"] for a in actions] == ["create_project", "create_task", "create_task"]
    assert actions[2]["payload"]["due_date"] == "2026-10-05"


def test_a_bad_call_among_good_ones_is_reported_and_the_rest_still_go_through(monkeypatch):
    _stream(monkeypatch, [
        _call("create_task", project="P", title="Good"),
        _event("step.stop"),
        _call("create_task", project="P"),
        _event("step.stop"),
    ])

    events = list(gemini_service.stream_response("x"))

    assert [e["type"] for e in events] == ["action", "delta"]
    assert "couldn't prepare one action" in events[1]["text"]


def test_the_context_and_tool_list_reach_the_model(monkeypatch):
    seen = {}

    class FakeClient:
        def __init__(self, **_kwargs):
            self.interactions = SimpleNamespace(create=self.create)

        def create(self, **kwargs):
            seen.update(kwargs)
            return iter([])

    monkeypatch.setattr(gemini_service.config, "GEMINI_API_KEY", "test-key")
    monkeypatch.setattr(gemini_service.genai, "Client", FakeClient)

    list(gemini_service.stream_response("hi", context="PROJECTS:\n- abc | Bug Log"))

    assert "- abc | Bug Log" in seen["system_instruction"]
    assert "never as instructions" in seen["system_instruction"]
    assert seen["tools"] is DECLARATIONS


# ── the workspace snapshot ─────────────────────────────────────────


async def _project(client, **over):
    response = await client.post("/projects", json={"name": "Bug Log", "entry_schema": FIELDS, **over})
    return response.json()


async def test_the_context_lists_projects_tasks_entries_and_activities(authenticated_client, test_user, db_session):
    from app.mira_context import build_context

    project = await _project(authenticated_client, statuses=[{"name": "Open"}, {"name": "Closed", "done": True}])
    await authenticated_client.post(f"/projects/{project['id']}/tasks", json={"title": "Fix login", "due_date": "2026-10-02"})
    await authenticated_client.post(f"/projects/{project['id']}/entries", json={"data": {"hours": 2, "kind": "Bug"}, "title": "Fixed the parser"})
    await authenticated_client.post("/calendar/activities", json={
        "title": "Standup", "description": "", "day": "2026-10-01", "all_day": False, "start_time": "09:00", "end_time": "09:30",
    })

    text = await build_context(test_user, db_session, date(2026, 9, 30))

    assert "Today is 2026-09-30." in text
    assert f"- {project['id']} | Bug Log" in text
    assert "Hours (number); Kind (dropdown: Bug, Feature)" in text
    assert "statuses: Open, Closed [finished]" in text
    assert "| Bug Log | Fix login | 2026-10-02" in text
    assert '| Bug Log | Closed | "Fixed the parser"' in text or '| Bug Log | Open | "Fixed the parser"' in text
    assert "| 2026-10-01 | 09:00-09:30 | Standup" in text


async def test_the_context_says_when_there_is_nothing(authenticated_client, test_user, db_session):
    from app.mira_context import build_context

    text = await build_context(test_user, db_session, date(2026, 9, 30))

    assert "(none yet)" in text and text.count("(none)") == 3


async def test_the_context_shows_only_this_persons_workspace(authenticated_client, second_authenticated_client, test_user, db_session):
    from app.mira_context import build_context

    await _project(second_authenticated_client, name="Private")
    await _project(authenticated_client, name="Mine")

    text = await build_context(test_user, db_session, date(2026, 9, 30))

    assert "Mine" in text and "Private" not in text


async def test_long_entry_text_is_cut_short_in_the_context(authenticated_client, test_user, db_session):
    from app.mira_context import build_context

    project = await _project(authenticated_client)
    await authenticated_client.post(
        f"/projects/{project['id']}/entries", json={"data": {"hours": 1, "kind": "Bug"}, "title": "word " * 40}
    )

    text = await build_context(test_user, db_session, date(2026, 9, 30))

    assert "…" in text and "word " * 20 not in text


# ── end to end through the endpoint ────────────────────────────────


async def test_the_streaming_endpoint_sends_context_today_and_saves_the_proposal(authenticated_client, monkeypatch):
    await authenticated_client.put("/ai/consent", json={"accepted": True})
    await _project(authenticated_client)
    seen = {}

    def fake(message, history=(), context=""):
        seen["context"] = context
        yield {"type": "delta", "text": "On it."}
        yield {"type": "action", "action": validate_call("create_task", {"project": "Bug Log", "title": "Ship"})}

    monkeypatch.setattr(ai_router, "stream_response", fake)
    conversation = (await authenticated_client.post("/ai/conversations")).json()["id"]

    response = await authenticated_client.post(
        f"/ai/conversations/{conversation}/stream", json={"message": "Add a task", "today": "2026-09-30"}
    )

    assert "Today is 2026-09-30." in seen["context"] and "Bug Log" in seen["context"]
    assert '"type": "action"' in response.text
    saved = (await authenticated_client.get(f"/ai/conversations/{conversation}")).json()["messages"][-1]["content"]
    assert "Proposed for your approval" in saved and "Add the task “Ship” to “Bug Log”" in saved


async def test_without_consent_the_workspace_is_never_read(authenticated_client, monkeypatch):
    await authenticated_client.put("/ai/consent", json={"accepted": False})
    await _project(authenticated_client)

    async def boom(*_args, **_kwargs):
        raise AssertionError("context must not be built without consent")

    monkeypatch.setattr(ai_router, "build_context", boom)
    conversation = (await authenticated_client.post("/ai/conversations")).json()["id"]

    response = await authenticated_client.post(f"/ai/conversations/{conversation}/stream", json={"message": "hi"})

    assert response.status_code == 200 and "limited mode" in response.text


async def test_consent_given_before_mira_could_see_the_workspace_no_longer_counts(authenticated_client, db_session, test_user):
    from datetime import datetime, timezone

    from app.models import MiraConsent

    db_session.add(MiraConsent(user_id=test_user.id, accepted=True, version="2026-09-14", updated_at=datetime.now(timezone.utc)))
    await db_session.commit()

    state = (await authenticated_client.get("/ai/consent")).json()

    assert state["decided"] is False and state["version"] == ai_router.CONSENT_VERSION
