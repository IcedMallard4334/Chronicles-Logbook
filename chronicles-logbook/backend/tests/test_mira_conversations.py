"""Saved Mira conversations and streamed replies."""

import asyncio
import json
from types import SimpleNamespace

import pytest

from app.routers import ai as ai_router
from app.services import gemini_service
from app.services.gemini_service import GeminiServiceError


def parse_events(body: str) -> list[dict]:
    return [json.loads(line[6:]) for line in body.splitlines() if line.startswith("data: ")]


@pytest.fixture
async def consenting(authenticated_client):
    await authenticated_client.put("/ai/consent", json={"accepted": True})


@pytest.fixture
def fake_stream(monkeypatch):
    seen = {}

    def fake(message, history=(), context=""):
        seen["message"] = message
        seen["history"] = list(history)
        yield {"type": "thought", "text": "Considering the question."}
        yield {"type": "delta", "text": "A **logbook** "}
        yield {"type": "delta", "text": "records work."}

    monkeypatch.setattr(ai_router, "stream_response", fake)
    return seen


async def new_conversation(client) -> str:
    response = await client.post("/ai/conversations")
    assert response.status_code == 201
    return response.json()["id"]


async def test_a_reply_streams_in_pieces_and_is_saved(authenticated_client, consenting, fake_stream):
    conversation_id = await new_conversation(authenticated_client)

    response = await authenticated_client.post(
        f"/ai/conversations/{conversation_id}/stream", json={"message": "What is a logbook?"}
    )

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/event-stream")
    events = parse_events(response.text)
    assert [e["type"] for e in events] == ["start", "thought", "delta", "delta", "done"]

    saved = (await authenticated_client.get(f"/ai/conversations/{conversation_id}")).json()
    assert saved["title"] == "What is a logbook?"
    assert [m["role"] for m in saved["messages"]] == ["user", "assistant"]
    assert saved["messages"][1]["content"] == "A **logbook** records work."
    assert saved["messages"][1]["thinking"] == "Considering the question."


async def test_earlier_messages_are_passed_as_context(authenticated_client, consenting, fake_stream):
    conversation_id = await new_conversation(authenticated_client)
    await authenticated_client.post(f"/ai/conversations/{conversation_id}/stream", json={"message": "First"})
    await authenticated_client.post(f"/ai/conversations/{conversation_id}/stream", json={"message": "Second"})

    assert fake_stream["message"] == "Second"
    assert fake_stream["history"] == [("user", "First"), ("assistant", "A **logbook** records work.")]


async def test_a_proposed_project_is_streamed_as_an_action(authenticated_client, consenting, monkeypatch):
    def fake(message, history=(), context=""):
        yield {
            "type": "action",
            "action": {
                "type": "create_project", "payload": {"name": "Research"}, "requires_confirmation": True,
                "destructive": False, "summary": "Create project Research",
            },
        }

    monkeypatch.setattr(ai_router, "stream_response", fake)
    conversation_id = await new_conversation(authenticated_client)

    response = await authenticated_client.post(
        f"/ai/conversations/{conversation_id}/stream", json={"message": "Create a research project"}
    )

    events = parse_events(response.text)
    assert any(e["type"] == "action" and e["action"]["payload"]["name"] == "Research" for e in events)
    saved = (await authenticated_client.get(f"/ai/conversations/{conversation_id}")).json()
    assert "Research" in saved["messages"][-1]["content"]


async def test_without_consent_nothing_reaches_the_provider(authenticated_client, monkeypatch):
    def boom(*_args, **_kwargs):
        raise AssertionError("the provider must not be called without consent")

    monkeypatch.setattr(ai_router, "stream_response", boom)
    conversation_id = await new_conversation(authenticated_client)

    response = await authenticated_client.post(
        f"/ai/conversations/{conversation_id}/stream", json={"message": "Hello"}
    )

    events = parse_events(response.text)
    assert "limited mode" in "".join(e.get("text", "") for e in events)


async def test_a_provider_failure_is_reported_and_the_reply_is_not_saved(
    authenticated_client, consenting, monkeypatch
):
    def failing(message, history=(), context=""):
        yield {"type": "delta", "text": "Partial"}
        raise GeminiServiceError("down")

    monkeypatch.setattr(ai_router, "stream_response", failing)
    conversation_id = await new_conversation(authenticated_client)

    response = await authenticated_client.post(
        f"/ai/conversations/{conversation_id}/stream", json={"message": "Hello"}
    )

    events = parse_events(response.text)
    assert events[-2]["type"] == "error" and events[-1]["type"] == "done"
    saved = (await authenticated_client.get(f"/ai/conversations/{conversation_id}")).json()
    assert [m["role"] for m in saved["messages"]] == ["user"]


async def test_conversations_are_listed_newest_first_and_can_be_deleted(authenticated_client):
    first = await new_conversation(authenticated_client)
    await asyncio.sleep(0.05)  # distinct timestamps: the list is ordered by last activity
    second = await new_conversation(authenticated_client)

    listed = (await authenticated_client.get("/ai/conversations")).json()
    assert [c["id"] for c in listed] == [second, first]

    assert (await authenticated_client.delete(f"/ai/conversations/{first}")).status_code == 204
    assert [c["id"] for c in (await authenticated_client.get("/ai/conversations")).json()] == [second]
    assert (await authenticated_client.get(f"/ai/conversations/{first}")).status_code == 404


async def test_one_user_cannot_read_stream_into_or_delete_anothers_conversation(
    authenticated_client, second_authenticated_client
):
    conversation_id = await new_conversation(authenticated_client)

    assert (await second_authenticated_client.get(f"/ai/conversations/{conversation_id}")).status_code == 404
    assert (await second_authenticated_client.delete(f"/ai/conversations/{conversation_id}")).status_code == 404
    response = await second_authenticated_client.post(
        f"/ai/conversations/{conversation_id}/stream", json={"message": "Hi"}
    )
    assert response.status_code == 404
    assert (await second_authenticated_client.get("/ai/conversations")).json() == []


async def test_blank_and_oversized_messages_are_rejected(authenticated_client):
    conversation_id = await new_conversation(authenticated_client)
    url = f"/ai/conversations/{conversation_id}/stream"

    assert (await authenticated_client.post(url, json={"message": "   "})).status_code == 422
    assert (await authenticated_client.post(url, json={"message": "x" * 2001})).status_code == 422
    assert (await authenticated_client.post(url, json={"message": "hi", "extra": 1})).status_code == 422


async def test_streaming_requires_authentication(async_client):
    response = await async_client.post(
        "/ai/conversations/00000000-0000-0000-0000-000000000000/stream", json={"message": "Hi"}
    )
    assert response.status_code == 401


# ── the Gemini streaming wrapper ────────────────────────────────────


def _event(event_type, **fields):
    return SimpleNamespace(event_type=event_type, **fields)


def _fake_client(monkeypatch, events, fail_with_config=False):
    calls = []

    class FakeClient:
        def __init__(self, **_kwargs):
            self.interactions = SimpleNamespace(create=self.create)

        def create(self, **kwargs):
            calls.append(kwargs)
            if fail_with_config and "generation_config" in kwargs:
                raise RuntimeError("thinking summaries unsupported")
            return iter(events)

    monkeypatch.setattr(gemini_service.config, "GEMINI_API_KEY", "test-key")
    monkeypatch.setattr(gemini_service.genai, "Client", FakeClient)
    return calls


def test_the_stream_yields_thoughts_then_text(monkeypatch):
    calls = _fake_client(
        monkeypatch,
        [
            _event("step.delta", delta=SimpleNamespace(type="thought_summary", content=SimpleNamespace(text="Thinking"))),
            _event("step.delta", delta=SimpleNamespace(type="text", text="Hel")),
            _event("step.delta", delta=SimpleNamespace(type="text", text="lo")),
        ],
    )

    result = list(gemini_service.stream_response("Hi", [("user", "Earlier"), ("assistant", "Reply")]))

    assert result == [
        {"type": "thought", "text": "Thinking"},
        {"type": "delta", "text": "Hel"},
        {"type": "delta", "text": "lo"},
    ]
    assert calls[0]["stream"] is True
    assert "User: Earlier" in calls[0]["input"] and "Mira: Reply" in calls[0]["input"]


def test_the_stream_retries_without_thought_summaries_when_unsupported(monkeypatch):
    calls = _fake_client(
        monkeypatch, [_event("step.delta", delta=SimpleNamespace(type="text", text="Ok"))], fail_with_config=True
    )

    assert list(gemini_service.stream_response("Hi")) == [{"type": "delta", "text": "Ok"}]
    assert len(calls) == 2 and "generation_config" not in calls[1]


def test_a_streamed_function_call_becomes_a_proposal_from_fragments(monkeypatch):
    _fake_client(
        monkeypatch,
        [
            _event("step.start", step=SimpleNamespace(type="function_call", name="create_project", arguments=None)),
            _event("step.delta", delta=SimpleNamespace(type="arguments_delta", arguments='{"name": "Sp')),
            _event("step.delta", delta=SimpleNamespace(type="arguments_delta", arguments='rint"}')),
        ],
    )

    [event] = list(gemini_service.stream_response("Create a project"))

    assert event["action"]["type"] == "create_project"
    assert event["action"]["payload"]["name"] == "Sprint"
    assert event["action"]["requires_confirmation"] is True and event["action"]["destructive"] is False
    assert "Sprint" in event["action"]["summary"]


def test_an_unsupported_or_malformed_streamed_call_becomes_a_note_not_a_failure(monkeypatch):
    _fake_client(monkeypatch, [_event("step.start", step=SimpleNamespace(type="function_call", name="drop_db", arguments={}))])
    events = list(gemini_service.stream_response("x"))
    assert [e["type"] for e in events] == ["delta"]
    assert "couldn't prepare one action" in events[0]["text"] and "drop_db" in events[0]["text"]

    _fake_client(
        monkeypatch,
        [
            _event("step.start", step=SimpleNamespace(type="function_call", name="create_project", arguments=None)),
            _event("step.delta", delta=SimpleNamespace(type="arguments_delta", arguments="{oops")),
        ],
    )
    events = list(gemini_service.stream_response("x"))
    assert [e["type"] for e in events] == ["delta"]


def test_a_stream_error_event_and_provider_failures_are_wrapped(monkeypatch):
    _fake_client(monkeypatch, [_event("error")])
    with pytest.raises(GeminiServiceError):
        list(gemini_service.stream_response("x"))

    class Exploding:
        def __init__(self, **_kwargs):
            self.interactions = SimpleNamespace(create=self.create)

        def create(self, **_kwargs):
            raise RuntimeError("upstream is down")

    monkeypatch.setattr(gemini_service.genai, "Client", Exploding)
    with pytest.raises(GeminiServiceError, match="could not generate"):
        list(gemini_service.stream_response("x"))


def test_history_is_trimmed_to_the_most_recent_turns():
    history = [("user", f"message {i}") for i in range(50)]
    prompt = gemini_service._prompt_with_history("now", history)

    assert "message 49" in prompt and "message 0\n" not in prompt
    assert prompt.endswith("now")
