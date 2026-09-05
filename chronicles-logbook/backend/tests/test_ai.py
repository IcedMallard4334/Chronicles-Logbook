"""Tests for the Chronicles AI assistant endpoint."""

from types import SimpleNamespace

import pytest

from app.routers import ai as ai_router
from app.services.gemini_service import (
    CREATE_PROJECT_TOOL,
    GeminiResponse,
    GeminiNotConfiguredError,
    GeminiServiceError,
)
from app.services import gemini_service


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
