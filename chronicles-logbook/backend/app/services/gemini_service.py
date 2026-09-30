"""A small, isolated service wrapper for the Gemini Interactions API."""

import json
from collections.abc import Iterator, Sequence
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
arguments.

Write in Markdown: use **bold** for key terms and short lists where they help,
and keep replies brief."""


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


MAX_HISTORY_MESSAGES = 20
MAX_HISTORY_CHARS = 12000


def _prompt_with_history(message: str, history: Sequence[tuple[str, str]]) -> str:
    """Fold earlier turns into the prompt so a reply can refer back to them."""
    prompt = _validated_prompt(message)
    turns = list(history)[-MAX_HISTORY_MESSAGES:]
    lines: list[str] = []
    used = 0
    for role, content in reversed(turns):
        line = f"{'User' if role == 'user' else 'Mira'}: {content.strip()}"
        used += len(line)
        if used > MAX_HISTORY_CHARS:
            break
        lines.append(line)
    if not lines:
        return prompt
    transcript = "\n".join(reversed(lines))
    return f"Conversation so far:\n{transcript}\n\nThe user's new message:\n{prompt}"


def _field(obj: Any, name: str) -> Any:
    return obj.get(name) if isinstance(obj, dict) else getattr(obj, name, None)


def _text_of(content: Any) -> str:
    if content is None:
        return ""
    if isinstance(content, list):
        return "".join(_text_of(part) for part in content)
    text = _field(content, "text")
    return text if isinstance(text, str) else ""


def stream_response(message: str, history: Sequence[tuple[str, str]] = ()) -> Iterator[dict[str, Any]]:
    """Yield Mira's answer as it is produced.

    Events: {"type": "thought", "text"} (a summary of its reasoning, when the
    model provides one), {"type": "delta", "text"} (a piece of the reply) and
    {"type": "action", "action"} (an unexecuted, allowlisted proposal).
    """
    api_key = config.GEMINI_API_KEY.strip()
    if not api_key:
        raise GeminiNotConfiguredError("Gemini is not configured.")
    prompt = _prompt_with_history(message, history)

    try:
        client = genai.Client(api_key=api_key)
        options = dict(
            model=config.GEMINI_MODEL,
            input=prompt,
            system_instruction=SYSTEM_INSTRUCTION,
            tools=[CREATE_PROJECT_TOOL],
            stream=True,
        )
        try:
            stream = client.interactions.create(**options, generation_config={"thinking_summaries": "auto"})
        except Exception:
            # Not every model accepts thought summaries; the answer still streams without them.
            stream = client.interactions.create(**options)

        call_name: str | None = None
        call_args: dict[str, Any] | None = None
        call_fragments: list[str] = []
        for event in stream:
            kind = _field(event, "event_type")
            if kind == "error":
                raise GeminiServiceError("Gemini stopped responding.")
            if kind == "step.start":
                step = _field(event, "step")
                if _field(step, "type") == "function_call":
                    call_name = _field(step, "name")
                    arguments = _field(step, "arguments")
                    call_args = arguments if isinstance(arguments, dict) else None
                    call_fragments = []
            elif kind == "step.delta":
                delta = _field(event, "delta")
                delta_type = _field(delta, "type")
                if delta_type == "text":
                    text = _field(delta, "text")
                    if isinstance(text, str) and text:
                        yield {"type": "delta", "text": text}
                elif delta_type == "thought_summary":
                    text = _text_of(_field(delta, "content"))
                    if text:
                        yield {"type": "thought", "text": text}
                elif delta_type == "arguments_delta":
                    fragment = _field(delta, "arguments")
                    if isinstance(fragment, str):
                        call_fragments.append(fragment)
        if call_name is not None:
            if call_name != "create_project":
                raise GeminiServiceError("Gemini returned an unsupported proposed action.")
            if call_args is None and call_fragments:
                try:
                    call_args = json.loads("".join(call_fragments))
                except ValueError as exc:
                    raise GeminiServiceError("Gemini returned an invalid proposed action.") from exc
            if not isinstance(call_args, dict):
                raise GeminiServiceError("Gemini returned an invalid proposed action.")
            yield {
                "type": "action",
                "action": {"type": call_name, "payload": call_args, "requires_confirmation": True},
            }
    except GeminiServiceError:
        raise
    except Exception as exc:
        raise GeminiServiceError("Gemini could not generate a reply. Please try again.") from exc
