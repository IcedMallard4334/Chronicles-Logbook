"""Endpoints for entry rules, recurrence and reminders (US-3.12).

See app.automation for how each piece works. Permissions follow the rest of
the API: rules reshape what gets recorded in a project, so only its owner
manages them, while members can read them to see why an entry of theirs was
tagged. A recurrence belongs to an entry, so whoever may edit that entry may
make it repeat.
"""

from datetime import date
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.automation import (
    collect_reminders,
    count_occurrences,
    materialize_due_occurrences,
    readable_projects,
    resolve_today,
    schedule_next,
    validate_rule,
)
from app.database import get_db
from app.models import Entry, EntryRecurrence, EntryRule, Project, User
from app.routers.auth import get_current_user
from app.routers.projects import (
    _get_project_entry,
    _get_readable_project,
    _get_user_project,
    _get_writable_entry,
)
from app.schemas import (
    MAX_REMINDER_WINDOW_DAYS,
    MAX_RULES_PER_PROJECT,
    EntryRuleCreate,
    EntryRuleResponse,
    RecurrenceCreate,
    RecurrenceResponse,
    RemindersResponse,
)

rules_router = APIRouter(prefix="/projects/{project_id}/rules", tags=["Entry rules"])
recurrence_router = APIRouter(prefix="/projects/{project_id}", tags=["Recurrence"])
reminders_router = APIRouter(prefix="/reminders", tags=["Reminders"])


# ── Rules ────────────────────────────────────────────────────────────────────


async def _get_rule(rule_id: UUID, project_id: UUID, db: AsyncSession) -> EntryRule:
    rule = await db.get(EntryRule, rule_id)
    if rule is None or rule.project_id != project_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Rule not found")
    return rule


def _refuse_if_archived(project: Project) -> None:
    if project.archived:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Cannot change the automation of an archived project.",
        )


@rules_router.get("", response_model=list[EntryRuleResponse])
async def list_rules(
    project_id: UUID,
    user: User = Depends(get_current_user),  # noqa: B008
    db: AsyncSession = Depends(get_db),  # noqa: B008
):
    """The project's rules, oldest first — the order they run in."""
    await _get_readable_project(project_id, user, db)
    result = await db.scalars(
        select(EntryRule)
        .where(EntryRule.project_id == project_id)
        .order_by(EntryRule.created_at, EntryRule.id)
    )
    return result.all()


@rules_router.post("", response_model=EntryRuleResponse, status_code=status.HTTP_201_CREATED)
async def create_rule(
    project_id: UUID,
    payload: EntryRuleCreate,
    user: User = Depends(get_current_user),  # noqa: B008
    db: AsyncSession = Depends(get_db),  # noqa: B008
):
    """Add a rule that runs on every new entry matching its conditions. Owner only."""
    project = await _get_user_project(project_id, user, db)
    _refuse_if_archived(project)

    existing = await db.scalar(
        select(func.count()).select_from(EntryRule).where(EntryRule.project_id == project_id)
    )
    if existing >= MAX_RULES_PER_PROJECT:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"A project can have at most {MAX_RULES_PER_PROJECT} rules.",
        )

    actions = validate_rule(payload.conditions, payload.actions, project.entry_schema or [])
    rule = EntryRule(
        project_id=project_id,
        name=payload.name.strip(),
        enabled=payload.enabled,
        match=payload.match,
        conditions=[c.model_dump() for c in payload.conditions],
        actions=actions,
        created_by=user.id,
    )
    db.add(rule)
    await db.commit()
    await db.refresh(rule)
    return rule


@rules_router.get("/{rule_id}", response_model=EntryRuleResponse)
async def get_rule(
    project_id: UUID,
    rule_id: UUID,
    user: User = Depends(get_current_user),  # noqa: B008
    db: AsyncSession = Depends(get_db),  # noqa: B008
):
    await _get_readable_project(project_id, user, db)
    return await _get_rule(rule_id, project_id, db)


@rules_router.put("/{rule_id}", response_model=EntryRuleResponse)
async def replace_rule(
    project_id: UUID,
    rule_id: UUID,
    payload: EntryRuleCreate,
    user: User = Depends(get_current_user),  # noqa: B008
    db: AsyncSession = Depends(get_db),  # noqa: B008
):
    """Replace a rule's whole definition (including turning it on or off). Owner only."""
    project = await _get_user_project(project_id, user, db)
    _refuse_if_archived(project)
    rule = await _get_rule(rule_id, project_id, db)

    rule.actions = validate_rule(payload.conditions, payload.actions, project.entry_schema or [])
    rule.name = payload.name.strip()
    rule.enabled = payload.enabled
    rule.match = payload.match
    rule.conditions = [c.model_dump() for c in payload.conditions]
    await db.commit()
    await db.refresh(rule)
    return rule


@rules_router.delete("/{rule_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_rule(
    project_id: UUID,
    rule_id: UUID,
    user: User = Depends(get_current_user),  # noqa: B008
    db: AsyncSession = Depends(get_db),  # noqa: B008
):
    """Delete a rule. Entries it already changed keep those changes. Owner only."""
    await _get_user_project(project_id, user, db)
    rule = await _get_rule(rule_id, project_id, db)
    await db.delete(rule)
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ── Recurrence ───────────────────────────────────────────────────────────────


async def _recurrence_response(recurrence: EntryRecurrence, db: AsyncSession) -> RecurrenceResponse:
    response = RecurrenceResponse.model_validate(recurrence)
    response.occurrences_created = await count_occurrences(db, recurrence.id)
    return response


@recurrence_router.get("/recurrences", response_model=list[RecurrenceResponse])
async def list_recurrences(
    project_id: UUID,
    today: date | None = None,
    user: User = Depends(get_current_user),  # noqa: B008
    db: AsyncSession = Depends(get_db),  # noqa: B008
):
    """Every repeating entry in the project. Creates any occurrences now due first."""
    project = await _get_readable_project(project_id, user, db)
    if not project.archived:
        await materialize_due_occurrences(db, [project_id], resolve_today(today))
    result = await db.scalars(
        select(EntryRecurrence)
        # Joined so a deleted entry's recurrence is hidden along with it.
        .join(Entry, Entry.id == EntryRecurrence.entry_id)
        .where(EntryRecurrence.project_id == project_id)
        .order_by(EntryRecurrence.created_at)
    )
    return [await _recurrence_response(r, db) for r in result.all()]


@recurrence_router.get(
    "/entries/{entry_id}/recurrence", response_model=RecurrenceResponse
)
async def get_recurrence(
    project_id: UUID,
    entry_id: UUID,
    user: User = Depends(get_current_user),  # noqa: B008
    db: AsyncSession = Depends(get_db),  # noqa: B008
):
    await _get_readable_project(project_id, user, db)
    await _get_project_entry(entry_id, project_id, db)
    recurrence = await db.scalar(
        select(EntryRecurrence).where(EntryRecurrence.entry_id == entry_id)
    )
    if recurrence is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="This entry does not repeat."
        )
    return await _recurrence_response(recurrence, db)


@recurrence_router.put(
    "/entries/{entry_id}/recurrence", response_model=RecurrenceResponse
)
async def set_recurrence(
    project_id: UUID,
    entry_id: UUID,
    payload: RecurrenceCreate,
    response: Response,
    today: date | None = None,
    user: User = Depends(get_current_user),  # noqa: B008
    db: AsyncSession = Depends(get_db),  # noqa: B008
):
    """Make an entry repeat, or replace how it repeats.

    PUT because an entry has at most one recurrence and this sets it: calling
    it twice leaves the same state as calling it once. Replacing a recurrence
    restarts its schedule from the new ``starts_on``; occurrences it already
    created stay exactly as they are.
    """
    project = await _get_readable_project(project_id, user, db)
    entry = await _get_writable_entry(entry_id, project, user, db)
    _refuse_if_archived(project)

    anchor = payload.starts_on or entry.due_date or resolve_today(today)
    if payload.ends_on is not None and payload.ends_on < anchor:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="ends_on cannot be before the date the entry starts repeating from.",
        )

    recurrence = await db.scalar(
        select(EntryRecurrence).where(EntryRecurrence.entry_id == entry_id)
    )
    if recurrence is None:
        recurrence = EntryRecurrence(
            entry_id=entry_id, project_id=project_id, created_by=user.id
        )
        db.add(recurrence)
        response.status_code = status.HTTP_201_CREATED

    recurrence.frequency = payload.frequency
    recurrence.interval = payload.interval
    recurrence.starts_on = anchor
    recurrence.ends_on = payload.ends_on
    recurrence.next_index = 1
    recurrence.active = True
    schedule_next(recurrence)

    await db.commit()
    await db.refresh(recurrence)
    return await _recurrence_response(recurrence, db)


@recurrence_router.delete(
    "/entries/{entry_id}/recurrence", status_code=status.HTTP_204_NO_CONTENT
)
async def stop_recurrence(
    project_id: UUID,
    entry_id: UUID,
    user: User = Depends(get_current_user),  # noqa: B008
    db: AsyncSession = Depends(get_db),  # noqa: B008
):
    """Stop an entry repeating. Occurrences already created are kept."""
    project = await _get_readable_project(project_id, user, db)
    await _get_writable_entry(entry_id, project, user, db)
    recurrence = await db.scalar(
        select(EntryRecurrence).where(EntryRecurrence.entry_id == entry_id)
    )
    if recurrence is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="This entry does not repeat."
        )
    await db.delete(recurrence)
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ── Reminders ────────────────────────────────────────────────────────────────


@reminders_router.get("", response_model=RemindersResponse)
async def get_reminders(
    within_days: int = Query(default=7, ge=0, le=MAX_REMINDER_WINDOW_DAYS),
    today: date | None = None,
    user: User = Depends(get_current_user),  # noqa: B008
    db: AsyncSession = Depends(get_db),  # noqa: B008
):
    """What's overdue, due today, or due within ``within_days``, across all projects.

    Covers to-do entries with a due date and open tasks with a due date, in
    every unarchived project the caller owns or is a member of. Calling this
    also creates any recurring entries that have come due, so the frontend
    only needs to poll this one endpoint to keep both up to date.

    ``today`` is optional: send the device's local date so that "due today"
    means the user's today, not the server's (UTC) one.
    """
    resolved = resolve_today(today)
    projects = await readable_projects(db, user)
    created = await materialize_due_occurrences(db, [p.id for p in projects], resolved)
    items = await collect_reminders(db, projects, resolved, within_days)

    return RemindersResponse(
        today=resolved,
        within_days=within_days,
        overdue_count=sum(1 for i in items if i["status"] == "overdue"),
        due_today_count=sum(1 for i in items if i["status"] == "due_today"),
        upcoming_count=sum(1 for i in items if i["status"] == "upcoming"),
        occurrences_created=created,
        items=items,
    )
