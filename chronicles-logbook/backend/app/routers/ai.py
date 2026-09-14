from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict, StrictBool
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.concurrency import run_in_threadpool

from app.database import get_db
from app.models import MiraConsent, User
from app.routers.auth import get_current_user
from app.schemas import AIChatRequest, AIChatResponse, AIProjectActionProposal
from app.services.gemini_service import (
    GeminiNotConfiguredError,
    GeminiServiceError,
    generate_response,
)

router = APIRouter(prefix="/ai", tags=["AI Assistant"])
CONSENT_VERSION = "2026-09-14"


class ConsentChoice(BaseModel):
    model_config = ConfigDict(extra="forbid")
    accepted: StrictBool


@router.get("/consent")
async def get_consent(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):  # noqa: B008
    choice = await db.get(MiraConsent, user.id)
    current = choice is not None and choice.version == CONSENT_VERSION
    return {"decided": current, "accepted": bool(current and choice.accepted), "version": CONSENT_VERSION}


@router.put("/consent")
async def set_consent(payload: ConsentChoice, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):  # noqa: B008
    choice = await db.get(MiraConsent, user.id)
    if choice is None:
        choice = MiraConsent(user_id=user.id)
        db.add(choice)
    choice.accepted = payload.accepted
    choice.version = CONSENT_VERSION
    choice.updated_at = datetime.now(timezone.utc)
    await db.commit()
    return {"decided": True, "accepted": choice.accepted, "version": CONSENT_VERSION}


@router.post("/chat", response_model=AIChatResponse, response_model_exclude_none=True)
async def chat_with_ai(
    payload: AIChatRequest,
    _user: User = Depends(get_current_user),  # noqa: B008
    db: AsyncSession = Depends(get_db),  # noqa: B008
) -> AIChatResponse:
    """Send an authenticated user's message to the AI assistant."""

    message = payload.message.strip()

    if not message:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Message cannot be blank.",
        )

    choice = await db.get(MiraConsent, _user.id)
    if not choice or not choice.accepted or choice.version != CONSENT_VERSION:
        return AIChatResponse(reply="Mira is in limited mode. You can create projects from Home, record work in All Entries, and organise deadlines in All Tasks. For a useful update, note what you did, what you learned, and your next step. Your message was not sent to an AI provider. Open Mira permissions to enable AI replies and project proposals.")

    try:
        result = await run_in_threadpool(generate_response, message)
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
