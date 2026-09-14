"""Tests for the Chronicles AI assistant endpoint."""

from types import SimpleNamespace

import pytest

from app.routers import ai as ai_router
from app.services import gemini_service
from app.services.gemini_service import (
    CREATE_PROJECT_TOOL,
    GeminiNotConfiguredError,
    GeminiResponse,
    GeminiServiceError,
)


def test_gemini_service_returns_an_unexecuted_project_proposal(monkeypatch):
    calls = []

    class FakeClient:
        def __init__(self, **_kwargs):
            self.interactions = SimpleNamespace(create=self.create)

        def create(self, **kwargs):
            calls.append(kwargs)
            return SimpleNamespace(
                steps=[SimpleNamespace(
                    type="function_call",
                    name="create_project",
                    arguments={"name": "Research notes", "description": "Weekly findings"},
                )]
            )

    monkeypatch.setattr(gemini_service.config, "GEMINI_API_KEY", "test-key")
    monkeypatch.setattr(gemini_service.genai, "Client", FakeClient)

    result = gemini_service.generate_response("Create a research project")

    assert result.reply is None
    assert result.action == {
        "type": "create_project",
        "payload": {"name": "Research notes", "description": "Weekly findings"},
        "requires_confirmation": True,
    }
    assert calls[0]["tools"] == [CREATE_PROJECT_TOOL]


def test_gemini_service_rejects_unknown_function_calls(monkeypatch):
    class FakeClient:
        def __init__(self, **_kwargs):
            self.interactions = SimpleNamespace(create=lambda **_kwargs: SimpleNamespace(
                steps=[SimpleNamespace(type="function_call", name="delete_project", arguments={})]
            ))

    monkeypatch.setattr(gemini_service.config, "GEMINI_API_KEY", "test-key")
    monkeypatch.setattr(gemini_service.genai, "Client", FakeClient)

    with pytest.raises(GeminiServiceError, match="unsupported"):
        gemini_service.generate_response("Delete a project")


def _client_returning(steps):
    """A stand-in Gemini client whose one call returns *steps*."""

    class FakeClient:
        def __init__(self, **_kwargs):
            self.interactions = SimpleNamespace(
                create=lambda **_kwargs: SimpleNamespace(steps=steps, output_text="Noted.")
            )

    return FakeClient


def _configured(monkeypatch, steps):
    monkeypatch.setattr(gemini_service.config, "GEMINI_API_KEY", "test-key")
    monkeypatch.setattr(gemini_service.genai, "Client", _client_returning(steps))


def test_a_blank_message_is_refused_before_the_provider_is_called(monkeypatch):
    # Nothing is sent upstream, so an empty prompt cannot spend a request.
    def explode(**_kwargs):
        raise AssertionError("the provider should not have been called")

    monkeypatch.setattr(gemini_service.config, "GEMINI_API_KEY", "test-key")
    monkeypatch.setattr(gemini_service.genai, "Client", explode)

    with pytest.raises(ValueError, match="empty"):
        gemini_service.generate_response("   ")


def test_a_non_text_message_is_refused(monkeypatch):
    monkeypatch.setattr(gemini_service.config, "GEMINI_API_KEY", "test-key")

    with pytest.raises(ValueError, match="text"):
        gemini_service.generate_response(1234)


def test_a_reply_with_no_proposed_action_comes_back_as_text(monkeypatch):
    _configured(monkeypatch, steps=[])

    result = gemini_service.generate_response("How many entries did I write?")

    assert result.action is None
    assert result.reply == "Noted."


def test_a_step_that_is_not_a_function_call_is_ignored(monkeypatch):
    # Providers interleave reasoning steps with calls; only the call matters.
    _configured(monkeypatch, steps=[SimpleNamespace(type="thinking", name=None, arguments=None)])

    result = gemini_service.generate_response("Think about it")

    assert result.action is None
    assert result.reply == "Noted."


def test_a_function_call_shaped_as_a_dict_is_read_the_same_way(monkeypatch):
    # The SDK yields plain dicts in some versions, so both shapes must work.
    _configured(
        monkeypatch,
        steps=[{
            "type": "function_call",
            "name": "create_project",
            "arguments": {"name": "From a dict"},
        }],
    )

    result = gemini_service.generate_response("Start a project")

    assert result.action["type"] == "create_project"
    assert result.action["payload"] == {"name": "From a dict"}
    assert result.action["requires_confirmation"] is True


def test_a_malformed_function_call_is_rejected_rather_than_guessed_at(monkeypatch):
    # Arguments that are not an object cannot be turned into a project, and
    # inventing one from a malformed proposal is worse than refusing it.
    _configured(
        monkeypatch,
        steps=[SimpleNamespace(type="function_call", name="create_project", arguments="oops")],
    )

    with pytest.raises(GeminiServiceError, match="invalid proposed action"):
        gemini_service.generate_response("Start a project")


def test_a_missing_api_key_is_reported_as_unconfigured(monkeypatch):
    monkeypatch.setattr(gemini_service.config, "GEMINI_API_KEY", "   ")

    with pytest.raises(GeminiNotConfiguredError):
        gemini_service.generate_response("Anything")


def test_a_provider_failure_is_wrapped_rather_than_leaked(monkeypatch):
    class ExplodingClient:
        def __init__(self, **_kwargs):
            self.interactions = SimpleNamespace(create=self.create)

        def create(self, **_kwargs):
            raise RuntimeError("upstream is down")

    monkeypatch.setattr(gemini_service.config, "GEMINI_API_KEY", "test-key")
    monkeypatch.setattr(gemini_service.genai, "Client", ExplodingClient)

    # The caller sees a Chronicles error, not whatever the SDK happened to raise.
    with pytest.raises(GeminiServiceError, match="could not generate"):
        gemini_service.generate_response("Anything")


async def test_ai_chat_requires_authentication(async_client):
    response = await async_client.post(
        "/ai/chat",
        json={"message": "Hello"},
    )

    assert response.status_code == 401
    assert response.json()["detail"] == "Authentication required."


async def test_ai_chat_returns_reply(authenticated_client, monkeypatch):
    def fake_generate_response(message: str) -> GeminiResponse:
        assert message == "What is a digital logbook?"
        return GeminiResponse(reply="A digital logbook stores records electronically.")

    monkeypatch.setattr(ai_router, "generate_response", fake_generate_response)

    response = await authenticated_client.post(
        "/ai/chat",
        json={"message": "What is a digital logbook?"},
    )

    assert response.status_code == 200
    assert response.json() == {
        "reply": "A digital logbook stores records electronically."
    }


async def test_ai_chat_proposes_project_without_creating_one(authenticated_client, monkeypatch):
    def fake_generate_response(_message: str) -> GeminiResponse:
        return GeminiResponse(action={
            "type": "create_project",
            "payload": {"name": "Research notes", "description": "Weekly findings"},
            "requires_confirmation": True,
        })

    monkeypatch.setattr(ai_router, "generate_response", fake_generate_response)

    response = await authenticated_client.post(
        "/ai/chat", json={"message": "Create a project for research notes"}
    )

    assert response.status_code == 200
    assert response.json() == {
        "action": {
            "type": "create_project",
            "payload": {"name": "Research notes", "description": "Weekly findings"},
            "requires_confirmation": True,
        }
    }

    projects = await authenticated_client.get("/projects")
    assert projects.status_code == 200
    assert projects.json() == []


async def test_ai_chat_rejects_unknown_or_invalid_actions(authenticated_client, monkeypatch):
    def fake_generate_response(_message: str) -> GeminiResponse:
        return GeminiResponse(action={
            "type": "delete_project",
            "payload": {"name": "Nope", "user_id": "must-not-pass"},
            "requires_confirmation": True,
        })

    monkeypatch.setattr(ai_router, "generate_response", fake_generate_response)
    response = await authenticated_client.post("/ai/chat", json={"message": "Do something"})

    assert response.status_code == 502
    assert response.json()["detail"] == "The AI assistant returned an invalid proposed action."


async def test_ai_chat_rejects_blank_message(authenticated_client):
    response = await authenticated_client.post(
        "/ai/chat",
        json={"message": "   "},
    )

    assert response.status_code == 422
    assert response.json()["detail"] == "Message cannot be blank."


async def test_ai_chat_rejects_long_message(authenticated_client):
    response = await authenticated_client.post(
        "/ai/chat",
        json={"message": "a" * 2001},
    )

    assert response.status_code == 422


async def test_ai_chat_handles_missing_configuration(
    authenticated_client,
    monkeypatch,
):
    def fake_generate_response(_message: str) -> GeminiResponse:
        raise GeminiNotConfiguredError("Test error")

    monkeypatch.setattr(ai_router, "generate_response", fake_generate_response)

    response = await authenticated_client.post(
        "/ai/chat",
        json={"message": "Hello"},
    )

    assert response.status_code == 503
    assert response.json()["detail"] == "The AI assistant is not configured."


async def test_ai_chat_handles_provider_failure(
    authenticated_client,
    monkeypatch,
):
    def fake_generate_response(_message: str) -> GeminiResponse:
        raise GeminiServiceError("Private provider information")

    monkeypatch.setattr(ai_router, "generate_response", fake_generate_response)

    response = await authenticated_client.post(
        "/ai/chat",
        json={"message": "Hello"},
    )

    assert response.status_code == 502
    assert response.json()["detail"] == (
        "The AI assistant is temporarily unavailable."
    )
    assert "Private provider information" not in response.text
