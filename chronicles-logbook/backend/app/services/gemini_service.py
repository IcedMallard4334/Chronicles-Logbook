"""A small, isolated service wrapper for the Gemini Interactions API."""

from dataclasses import dataclass
from typing import Any

from google import genai

from app import config


class GeminiNotConfiguredError(RuntimeError):
    """Raised when Gemini credentials have not been configured."""


class GeminiServiceError(RuntimeError):
    """Raised when Gemini cannot provide a usable response."""


SYSTEM_INSTRUCTION = """You are Mira, the Chronicles digital-logbook assistant.
Give concise, helpful answers that help users understand and use a digital
logbook. During this phase, you cannot access the user's entries, projects,
tasks, or Calendar. State that limitation whenever it matters, and never claim
to have accessed information that the user did not provide.

You may propose a project only when the user clearly asks to create one. Use
the create_project function for that proposal. Calling it never creates a
project: the signed-in user must review and confirm it in Chronicles first.
Never include a user ID or any argument other than the declared function
arguments."""


CREATE_PROJECT_TOOL = {
    "type": "function",
    "name": "create_project",
    "description": "Propose a new Chronicles project for the user to review and confirm.",
    "parameters": {
        "type": "object",
        "properties": {
            "name": {"type": "string", "description": "Project name."},
            "description": {"type": "string", "description": "Optional concise project description."},
        },
        "required": ["name"],
        "additionalProperties": False,
    },
}


@dataclass(frozen=True)
class GeminiResponse:
    """A text reply or a safe, unexecuted function proposal."""

    reply: str | None = None
    action: dict[str, Any] | None = None


def generate_reply(message: str) -> str:
    """Generate a concise assistant reply without accessing Chronicles data."""
    api_key = config.GEMINI_API_KEY.strip()
    if not api_key:
        raise GeminiNotConfiguredError("Gemini is not configured.")

    if not isinstance(message, str):
        raise ValueError("Message must be text.")

    prompt = message.strip()
    if not prompt:
        raise ValueError("Message cannot be empty.")

    try:
        client = genai.Client(api_key=api_key)
        result = client.interactions.create(
            model=config.GEMINI_MODEL,
            input=prompt,
            system_instruction=SYSTEM_INSTRUCTION,
        )
    except Exception as exc:
        raise GeminiServiceError("Gemini could not generate a reply. Please try again.") from exc

    output_text = getattr(result, "output_text", "")
    if not isinstance(output_text, str) or not output_text.strip():
        raise GeminiServiceError("Gemini returned no usable reply.")

    return output_text.strip()


def _validated_prompt(message: str) -> str:
    if not isinstance(message, str):
        raise ValueError("Message must be text.")
    prompt = message.strip()
    if not prompt:
        raise ValueError("Message cannot be empty.")
    return prompt


def _function_call_from(result: Any) -> tuple[str, dict[str, Any]] | None:
    """Read at most one proposed function call without invoking it."""
    for step in getattr(result, "steps", None) or []:
        step_type = getattr(step, "type", None)
        if step_type is None and isinstance(step, dict):
            step_type = step.get("type")
        if step_type != "function_call":
            continue
        name = getattr(step, "name", None)
        arguments = getattr(step, "arguments", None)
        if isinstance(step, dict):
            name = step.get("name", name)
            arguments = step.get("arguments", arguments)
        if not isinstance(name, str) or not isinstance(arguments, dict):
            raise GeminiServiceError("Gemini returned an invalid proposed action.")
        return name, arguments
    return None


def generate_response(message: str) -> GeminiResponse:
    """Generate text or an unexecuted, allowlisted project proposal."""
    api_key = config.GEMINI_API_KEY.strip()
    if not api_key:
        raise GeminiNotConfiguredError("Gemini is not configured.")

    prompt = _validated_prompt(message)
    try:
        client = genai.Client(api_key=api_key)
        result = client.interactions.create(
            model=config.GEMINI_MODEL,
            input=prompt,
            system_instruction=SYSTEM_INSTRUCTION,
            tools=[CREATE_PROJECT_TOOL],
        )
    except Exception as exc:
        raise GeminiServiceError("Gemini could not generate a reply. Please try again.") from exc

    function_call = _function_call_from(result)
    if function_call is not None:
        name, arguments = function_call
        if name != "create_project":
            raise GeminiServiceError("Gemini returned an unsupported proposed action.")
        return GeminiResponse(action={"type": name, "payload": arguments, "requires_confirmation": True})

    output_text = getattr(result, "output_text", "")
    if not isinstance(output_text, str) or not output_text.strip():
        raise GeminiServiceError("Gemini returned no usable reply.")
    return GeminiResponse(reply=output_text.strip())
