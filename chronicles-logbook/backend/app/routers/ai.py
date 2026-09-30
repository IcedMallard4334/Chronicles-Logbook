import json
from datetime import date, datetime, timedelta, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, ConfigDict, Field, StrictBool
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.concurrency import iterate_in_threadpool, run_in_threadpool

from app.database import get_db
from app.mira_context import build_context
from app.models import MiraConsent, MiraConversation, MiraMessage, User
from app.routers.auth import get_current_user
from app.schemas import AIChatRequest, AIChatResponse, AIProjectActionProposal
from app.services.gemini_service import (
    GeminiNotConfiguredError,
    GeminiServiceError,
    generate_response,
    stream_response,
)

router = APIRouter(prefix="/ai", tags=["AI Assistant"])
# Bumped when what Mira can see or do grows, so that everyone is asked again.
CONSENT_VERSION = "2026-09-30"

LIMITED_MODE_REPLY = (
    "Mira is in limited mode. You can create projects from Home, record work in All Entries, "
    "and organise deadlines in All Tasks. For a useful update, note what you did, what you learned, "
    "and your next step. Your message was not sent to an AI provider. Open Mira permissions to "
    "enable AI replies and project proposals."
)


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
        return AIChatResponse(reply=LIMITED_MODE_REPLY)

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


# ── Saved conversations and streamed replies ────────────────────────


class ConversationSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    title: str
    updated_at: datetime


class MessageOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    role: str
    content: str
    thinking: str | None = None
    created_at: datetime


class ConversationDetail(ConversationSummary):
    messages: list[MessageOut]


class StreamRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    message: str = Field(min_length=1, max_length=2000)
    # The person's own date, since the server runs on UTC and "tomorrow" should
    # mean their tomorrow.
    today: date | None = None


async def _owned_conversation(conversation_id: UUID, user: User, db: AsyncSession) -> MiraConversation:
    conversation = await db.get(MiraConversation, conversation_id)
    if conversation is None or conversation.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Conversation not found.")
    return conversation


@router.get("/conversations", response_model=list[ConversationSummary])
async def list_conversations(
    user: User = Depends(get_current_user),  # noqa: B008
    db: AsyncSession = Depends(get_db),  # noqa: B008
):
    result = await db.execute(
        select(MiraConversation)
        .where(MiraConversation.user_id == user.id)
        .order_by(MiraConversation.updated_at.desc())
        .limit(100)
    )
    return result.scalars().all()


@router.post("/conversations", response_model=ConversationSummary, status_code=status.HTTP_201_CREATED)
async def create_conversation(
    user: User = Depends(get_current_user),  # noqa: B008
    db: AsyncSession = Depends(get_db),  # noqa: B008
):
    conversation = MiraConversation(user_id=user.id)
    db.add(conversation)
    await db.commit()
    return conversation


@router.get("/conversations/{conversation_id}", response_model=ConversationDetail)
async def get_conversation(
    conversation_id: UUID,
    user: User = Depends(get_current_user),  # noqa: B008
    db: AsyncSession = Depends(get_db),  # noqa: B008
):
    conversation = await _owned_conversation(conversation_id, user, db)
    messages = (
        await db.scalars(
            select(MiraMessage)
            .where(MiraMessage.conversation_id == conversation.id)
            .order_by(MiraMessage.created_at, MiraMessage.id)
        )
    ).all()
    return ConversationDetail(
        id=conversation.id, title=conversation.title, updated_at=conversation.updated_at, messages=messages
    )


@router.delete("/conversations/{conversation_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_conversation(
    conversation_id: UUID,
    user: User = Depends(get_current_user),  # noqa: B008
    db: AsyncSession = Depends(get_db),  # noqa: B008
):
    conversation = await _owned_conversation(conversation_id, user, db)
    await db.execute(delete(MiraMessage).where(MiraMessage.conversation_id == conversation.id))
    await db.delete(conversation)
    await db.commit()


def _sse(event: dict) -> str:
    return f"data: {json.dumps(event)}\n\n"


@router.post("/conversations/{conversation_id}/stream")
async def stream_reply(
    conversation_id: UUID,
    payload: StreamRequest,
    user: User = Depends(get_current_user),  # noqa: B008
    db: AsyncSession = Depends(get_db),  # noqa: B008
):
    """Send a message and stream Mira's reply as server-sent events.

    Events are JSON objects: thought, delta, action, error and finally done.
    Both sides of the exchange are saved to the conversation.
    """
    conversation = await _owned_conversation(conversation_id, user, db)
    message = payload.message.strip()
    if not message:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Message cannot be blank.")

    earlier = (
        await db.scalars(
            select(MiraMessage)
            .where(MiraMessage.conversation_id == conversation.id)
            .order_by(MiraMessage.created_at, MiraMessage.id)
        )
    ).all()
    history = [(m.role, m.content) for m in earlier]
    if not earlier:
        conversation.title = message[:60] + ("…" if len(message) > 60 else "")
    user_message = MiraMessage(conversation_id=conversation.id, role="user", content=message)
    db.add(user_message)
    conversation.updated_at = datetime.now(timezone.utc)
    await db.commit()

    choice = await db.get(MiraConsent, user.id)
    consented = bool(choice and choice.accepted and choice.version == CONSENT_VERSION)
    # Built before streaming starts, from this request's own session, and only
    # when the person has allowed Mira to see their workspace.
    context = await build_context(user, db, payload.today or datetime.now(timezone.utc).date()) if consented else ""

    async def events():
        reply_parts: list[str] = []
        thought_parts: list[str] = []
        proposed: list[str] = []
        failed = False
        yield _sse({"type": "start", "conversation_id": str(conversation.id), "title": conversation.title})
        try:
            if not consented:
                reply_parts.append(LIMITED_MODE_REPLY)
                yield _sse({"type": "delta", "text": LIMITED_MODE_REPLY})
            else:
                async for event in iterate_in_threadpool(iter(stream_response(message, history, context))):
                    if event["type"] == "delta":
                        reply_parts.append(event["text"])
                    elif event["type"] == "thought":
                        thought_parts.append(event["text"])
                    elif event["type"] == "action":
                        proposed.append(event["action"]["summary"])
                    yield _sse(event)
                if proposed:
                    # Kept in the saved conversation so a reopened chat still says what was proposed.
                    reply_parts.append(
                        "\n\n**Proposed for your approval:**\n" + "\n".join(f"- {line}" for line in proposed)
                    )
        except GeminiNotConfiguredError:
            failed = True
            yield _sse({"type": "error", "detail": "The AI assistant is not configured."})
        except GeminiServiceError:
            failed = True
            yield _sse({"type": "error", "detail": "Mira could not reply just now. Please try again."})
        finally:
            text = "".join(reply_parts).strip()
            if text and not failed:
                # Strictly after the question: a coarse clock could otherwise give both the
                # same timestamp and let the reply sort in front of what it answers.
                asked = user_message.created_at
                if asked.tzinfo is None:
                    asked = asked.replace(tzinfo=timezone.utc)
                saved = MiraMessage(
                    conversation_id=conversation.id,
                    role="assistant",
                    created_at=max(datetime.now(timezone.utc), asked + timedelta(microseconds=1)),
                    content=text,
                    thinking="".join(thought_parts).strip() or None,
                )
                db.add(saved)
                conversation.updated_at = datetime.now(timezone.utc)
                await db.commit()
        yield _sse({"type": "done"})

    return StreamingResponse(
        events(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
