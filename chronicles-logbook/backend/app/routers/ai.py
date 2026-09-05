from fastapi import APIRouter, Depends, HTTPException, status

from app.models import User
from app.routers.auth import get_current_user
from app.schemas import AIChatRequest, AIChatResponse, AIProjectActionProposal
from app.services.gemini_service import (
    GeminiNotConfiguredError,
    GeminiServiceError,
    generate_response,
)

router = APIRouter(prefix="/ai", tags=["AI Assistant"])


@router.post("/chat", response_model=AIChatResponse, response_model_exclude_none=True)
def chat_with_ai(
    payload: AIChatRequest,
    _user: User = Depends(get_current_user),  # noqa: B008
) -> AIChatResponse:
    """Send an authenticated user's message to the AI assistant."""

    message = payload.message.strip()

    if not message:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Message cannot be blank.",
        )

    try:
        result = generate_response(message)
    except GeminiNotConfiguredError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="The AI assistant is not configured.",
        ) from exc
    except GeminiServiceError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="The AI assistant is temporarily unavailable.",
        ) from exc

    if result.action is not None:
        try:
            action = AIProjectActionProposal.model_validate(result.action)
        except ValueError as exc:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="The AI assistant returned an invalid proposed action.",
            ) from exc
        return AIChatResponse(action=action)

    return AIChatResponse(reply=result.reply)
