"""Entry rules, recurrence and reminders (US-3.12).

Three pieces of routine bookkeeping the logbook does by itself:

* **Rules** run when a new entry is captured. Each rule has conditions — the
  same shape as a structured search (US-3.11), evaluated by the same code —
  and actions: add tags, fill a field, or mark the entry as to-do.
* **Recurrence** makes an entry repeat. App Service has no scheduler to wake
  up at midnight, so occurrences are created on the next request that asks
  "what is due?" (``GET /reminders``). A unique (recurrence, date) constraint
  means any number of requests, in any number of worker processes, can run
  that check at once without producing a duplicate.
* **Reminders** list to-do entries and open tasks that are overdue, due today
  or due soon, across every project the caller can read.
"""

import calendar
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta, timezone
from typing import Any
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.computed import apply_computed_fields
from app.models import (
    MEMBERSHIP_ACCEPTED,
    Entry,
    EntryRecurrence,
    EntryRule,
    Project,
    ProjectMember,
    RecurrenceOccurrence,
    Task,
    User,
)
from app.schemas import (
    MAX_CATCH_UP_OCCURRENCES,
    MAX_LONG_TEXT_LENGTH,
    MAX_SHORT_TEXT_LENGTH,
    MAX_TAG_LENGTH,
    MAX_TAGS,
    AddTagsAction,
    CreateTaskAction,
    FieldCondition,
    MarkTodoAction,
    RepeatAction,
    RuleAction,
    SetFieldAction,
    SetStatusAction,
)
from app.search import SearchQueryError, conditions_match, validate_conditions_against_schema

# Field types a rule may fill in. Computed fields are derived by the server,
# and links, references, tags and checklists have their own rules about what a
# valid value is that a fixed value in a rule could not keep up with.
SETTABLE_TYPES = frozenset({"text", "long_text", "number", "date", "dropdown"})


def _unprocessable(detail: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=detail)


# ── Dates ────────────────────────────────────────────────────────────────────


def server_today() -> date:
    return datetime.now(timezone.utc).date()


def resolve_today(client_today: date | None) -> date:
    """The caller's "today", within a day of the server's.

    The server runs on UTC while users are two hours ahead, so between
    midnight and 02:00 in South Africa the server still thinks it is
    yesterday. The client may say what its date is, but only within a day
    of ours — enough for any real time zone, not enough to fast-forward a
    recurrence by claiming it is next month.
    """
    today = server_today()
    if client_today is None:
        return today
    if abs((client_today - today).days) > 1:
        raise _unprocessable("'today' must be within one day of the current date.")
    return client_today


def _add_months(anchor: date, months: int) -> date:
    month_index = anchor.month - 1 + months
    year = anchor.year + month_index // 12
    month = month_index % 12 + 1
    day = min(anchor.day, calendar.monthrange(year, month)[1])
    return date(year, month, day)


def occurrence_date(starts_on: date, frequency: str, interval: int, index: int) -> date:
    """The date of occurrence ``index`` (the source entry is index 0).

    Always counted from the anchor, never from the previous occurrence, so a
    monthly recurrence on the 31st returns to the 31st after a short month.
    """
    if frequency == "daily":
        return starts_on + timedelta(days=interval * index)
    if frequency == "weekly":
        return starts_on + timedelta(weeks=interval * index)
    if frequency == "monthly":
        return _add_months(starts_on, interval * index)
    raise ValueError(f"Unknown frequency: {frequency}")


def schedule_next(recurrence: EntryRecurrence) -> None:
    """Point ``next_on`` at ``next_index``, or finish the recurrence at its end date."""
    upcoming = occurrence_date(
        recurrence.starts_on, recurrence.frequency, recurrence.interval, recurrence.next_index
    )
    if recurrence.ends_on is not None and upcoming > recurrence.ends_on:
        recurrence.next_on = None
        recurrence.active = False
    else:
        recurrence.next_on = upcoming


# ── Rule validation (when a rule is saved) ──────────────────────────────────


def _clean_tags(tags: list[str]) -> list[str]:
    cleaned: list[str] = []
    seen: set[str] = set()
    for tag in tags:
        text = tag.strip()
        if not text:
            raise _unprocessable("A rule cannot add an empty tag.")
        if len(text) > MAX_TAG_LENGTH:
            raise _unprocessable(f"Each tag must be {MAX_TAG_LENGTH} characters or fewer.")
        if text.lower() not in seen:
            seen.add(text.lower())
            cleaned.append(text)
    return cleaned


def _value_problem(field_def: dict[str, Any], value: Any) -> str | None:
    """Why ``value`` can't go in this field, or None if it can."""
    field_type = field_def.get("type")
    name = field_def.get("name", field_def.get("id"))
    if field_type in ("text", "long_text"):
        if not isinstance(value, str) or not value.strip():
            return f"'{name}' needs non-empty text."
        limit = MAX_LONG_TEXT_LENGTH if field_type == "long_text" else MAX_SHORT_TEXT_LENGTH
        if len(value) > limit:
            return f"The value for '{name}' must be {limit:,} characters or fewer."
    elif field_type == "number":
        if not isinstance(value, (int, float)) or isinstance(value, bool):
            return f"'{name}' needs a number."
    elif field_type == "date":
        try:
            date.fromisoformat(value)
        except (TypeError, ValueError):
            return f"'{name}' needs a date in YYYY-MM-DD form."
    elif field_type == "dropdown":
        options = field_def.get("options", [])
        if value not in options:
            return f"'{name}' must be one of: {', '.join(map(str, options))}."
    else:
        return f"A rule can't fill '{name}' ({field_type} fields are filled by hand)."
    return None


FOLLOW_UP_ACTIONS = (CreateTaskAction, RepeatAction)


def validate_rule(
    conditions: list[FieldCondition],
    actions: list[RuleAction],
    entry_schema: list[dict[str, Any]],
    *,
    trigger: str = "created",
    trigger_status: str | None = None,
    status_names: list[str] | None = None,
) -> list[dict[str, Any]]:
    """Check a rule against the project's schema; return its actions, normalised.

    Refused with a 422 naming the problem, never saved half-working: a rule
    that points at a field the project doesn't have would simply never do
    anything, and nobody would know why.
    """
    try:
        validate_conditions_against_schema(conditions, entry_schema)
    except SearchQueryError as error:
        raise _unprocessable(str(error)) from None

    if status_names is not None:
        if trigger == "status" and trigger_status not in status_names:
            raise _unprocessable(
                f"'{trigger_status}' is not a status of this project. Choose one of: {', '.join(status_names)}."
            )
    if trigger == "status" and not all(isinstance(action, FOLLOW_UP_ACTIONS) for action in actions):
        raise _unprocessable("A rule that waits for a status can add a task or repeat the entry, nothing else.")

    fields_by_id = {f["id"]: f for f in entry_schema}
    normalised: list[dict[str, Any]] = []

    for action in actions:
        if isinstance(action, (MarkTodoAction, CreateTaskAction, RepeatAction)):
            normalised.append(action.model_dump())
            continue
        if isinstance(action, SetStatusAction):
            if status_names is not None and action.status not in status_names:
                raise _unprocessable(
                    f"'{action.status}' is not a status of this project. Choose one of: {', '.join(status_names)}."
                )
            normalised.append(action.model_dump())
            continue

        field_def = fields_by_id.get(action.field_id)
        if field_def is None:
            raise _unprocessable(f"'{action.field_id}' is not a field on this project.")

        if isinstance(action, AddTagsAction):
            if field_def.get("type") != "tags":
                raise _unprocessable(f"'{field_def.get('name')}' is not a tags field.")
            normalised.append({**action.model_dump(), "tags": _clean_tags(action.tags)})
        elif isinstance(action, SetFieldAction):
            problem = _value_problem(field_def, action.value)
            if problem:
                raise _unprocessable(problem)
            normalised.append(action.model_dump())

    return normalised


# ── Running rules (when an entry is captured) ────────────────────────────────


@dataclass
class RuleOutcome:
    data: dict[str, Any]
    mark_todo: bool = False
    due_date: date | None = None
    status: str | None = None
    new_tasks: list[dict[str, Any]] = field(default_factory=list)
    repeat: dict[str, Any] | None = None
    applied: list[dict[str, Any]] = field(default_factory=list)


def _is_blank(value: Any) -> bool:
    return value is None or value == "" or value == []


def _apply_action(
    action: dict[str, Any],
    outcome: RuleOutcome,
    fields_by_id: dict[str, dict[str, Any]],
    today: date,
) -> bool:
    """Apply one action to the working entry. Returns whether it changed anything.

    Re-checks the action against the *current* schema: the rule was valid
    when it was saved, but a field may since have been removed, retyped, or
    lost the dropdown option the rule sets. Such an action is skipped rather
    than failing the capture — the person saving an entry should never be
    blocked by a rule they may not even know exists.
    """
    kind = action.get("type")

    if kind == "mark_todo":
        outcome.mark_todo = True
        due_in = action.get("due_in_days")
        if due_in is not None and outcome.due_date is None:
            outcome.due_date = today + timedelta(days=due_in)
        return True

    if kind == "set_status":
        if outcome.status is None:
            outcome.status = action.get("status")
        return True

    if kind == "create_task":
        outcome.new_tasks.append({"title": action.get("title", ""), "due_in_days": action.get("due_in_days")})
        return True

    if kind == "repeat":
        if outcome.repeat is None:
            outcome.repeat = {"frequency": action.get("frequency"), "interval": action.get("interval", 1)}
        return True

    field_def = fields_by_id.get(action.get("field_id"))
    if field_def is None:
        return False

    field_id = field_def["id"]
    current = outcome.data.get(field_id)

    if kind == "add_tags":
        if field_def.get("type") != "tags":
            return False
        existing = list(current) if isinstance(current, list) else []
        known = {str(tag).strip().lower() for tag in existing}
        added = False
        for tag in action.get("tags", []):
            if len(existing) >= MAX_TAGS:
                break
            if tag.lower() not in known:
                existing.append(tag)
                known.add(tag.lower())
                added = True
        if added:
            outcome.data[field_id] = existing
        return added

    if kind == "set_field":
        if not action.get("overwrite") and not _is_blank(current):
            return False
        if _value_problem(field_def, action.get("value")) is not None:
            return False
        outcome.data[field_id] = action["value"]
        return True

    return False


async def apply_entry_rules(
    db: AsyncSession,
    project: Project,
    data: dict[str, Any],
    today: date | None = None,
) -> RuleOutcome:
    """Run the project's enabled rules over a new entry's values.

    Every rule's conditions are checked against what the author actually
    entered (plus computed fields, which a condition may name), not against
    what earlier rules produced. Rules therefore never trigger each other,
    and the result doesn't depend on which rule happens to run first — except
    that when two rules fill the same blank field, the older rule wins.
    """
    outcome = RuleOutcome(data=dict(data))
    rules = (
        await db.scalars(
            select(EntryRule)
            .where(
                EntryRule.project_id == project.id,
                EntryRule.enabled.is_(True),
                EntryRule.trigger == "created",
            )
            .order_by(EntryRule.created_at, EntryRule.id)
        )
    ).all()
    if not rules:
        return outcome

    schema = project.entry_schema or []
    fields_by_id = {f["id"]: f for f in schema}
    as_entered = apply_computed_fields(dict(data), schema)
    today = today or server_today()

    for rule in rules:
        conditions = [FieldCondition.model_validate(c) for c in rule.conditions or []]
        matched, _ = conditions_match(as_entered, schema, conditions, rule.match)
        if not matched:
            continue
        changed = [_apply_action(a, outcome, fields_by_id, today) for a in rule.actions or []]
        if any(changed):
            outcome.applied.append({"id": rule.id, "name": rule.name})

    return outcome


async def apply_status_rules(
    db: AsyncSession, project: Project, entry: Entry, today: date | None = None
) -> RuleOutcome:
    """Run the rules waiting for the status ``entry`` has just moved into.

    Only follow-ups come out of these (a task, a repeat): the entry's own
    values are left exactly as the person just saved them.
    """
    outcome = RuleOutcome(data=dict(entry.data or {}))
    rules = (
        await db.scalars(
            select(EntryRule)
            .where(
                EntryRule.project_id == project.id,
                EntryRule.enabled.is_(True),
                EntryRule.trigger == "status",
                EntryRule.trigger_status == entry.status,
            )
            .order_by(EntryRule.created_at, EntryRule.id)
        )
    ).all()
    if not rules:
        return outcome

    schema = project.entry_schema or []
    fields_by_id = {f["id"]: f for f in schema}
    as_saved = apply_computed_fields(dict(entry.data or {}), schema)
    today = today or server_today()

    for rule in rules:
        conditions = [FieldCondition.model_validate(c) for c in rule.conditions or []]
        matched, _ = conditions_match(as_saved, schema, conditions, rule.match)
        if not matched:
            continue
        changed = [_apply_action(a, outcome, fields_by_id, today) for a in rule.actions or []]
        if any(changed):
            outcome.applied.append({"id": rule.id, "name": rule.name})
    return outcome


def _task_title(template: str, entry: Entry, schema: list[dict[str, Any]]) -> str:
    name = display_title(entry.title, entry.data or {}, schema) or "this entry"
    return template.replace("{title}", name).strip()[:255]


async def run_follow_ups(
    db: AsyncSession,
    project: Project,
    entry: Entry,
    outcome: RuleOutcome,
    user_id: UUID | None,
    today: date | None = None,
) -> None:
    """Create the tasks and the repeat a rule asked for. The caller commits."""
    today = today or server_today()
    for follow_up in outcome.new_tasks:
        title = _task_title(follow_up["title"], entry, project.entry_schema or [])
        if not title:
            continue
        due = follow_up.get("due_in_days")
        db.add(
            Task(
                project_id=project.id,
                title=title,
                due_date=today + timedelta(days=due) if due is not None else None,
                checklist=[],
                created_by=user_id,
            )
        )

    if outcome.repeat:
        already = await db.scalar(select(EntryRecurrence).where(EntryRecurrence.entry_id == entry.id))
        if already is None:
            recurrence = EntryRecurrence(
                entry_id=entry.id,
                project_id=project.id,
                created_by=user_id,
                frequency=outcome.repeat["frequency"],
                interval=outcome.repeat["interval"],
                starts_on=entry.due_date or today,
                next_index=1,
                active=True,
            )
            schedule_next(recurrence)
            db.add(recurrence)


# ── Access ───────────────────────────────────────────────────────────────────


async def readable_projects(db: AsyncSession, user: User) -> list[Project]:
    """Unarchived projects the caller owns or has accepted an invitation to."""
    result = await db.scalars(
        select(Project)
        .outerjoin(
            ProjectMember,
            (ProjectMember.project_id == Project.id)
            & (ProjectMember.status == MEMBERSHIP_ACCEPTED)
            & (ProjectMember.user_id == user.id),
        )
        .where(
            Project.archived.is_(False),
            or_(Project.user_id == user.id, ProjectMember.user_id == user.id),
        )
    )
    return list(result.unique().all())


# ── Recurrence ───────────────────────────────────────────────────────────────


def _fresh_checklists(data: dict[str, Any], schema: list[dict[str, Any]]) -> dict[str, Any]:
    """Untick every checklist: a new occurrence's sub-tasks haven't been done yet."""
    result = dict(data)
    for field_def in schema:
        if field_def.get("type") == "checklist" and isinstance(result.get(field_def["id"]), list):
            result[field_def["id"]] = [
                {**item, "completed": False} if isinstance(item, dict) else item
                for item in result[field_def["id"]]
            ]
    return result


def _occurrence_from(source: Entry, occurs_on: date, created_by: UUID | None) -> Entry:
    """A new entry copying the source's current title and values.

    Kept in the source's own recorded shape (schema_snapshot), which its data
    is known to be valid for. If the project's schema has changed since,
    bringing the source up to date (migrate_to_current_schema on an edit)
    brings every later occurrence with it.
    """
    snapshot = [dict(f) for f in (source.schema_snapshot or [])]
    data = apply_computed_fields(_fresh_checklists(source.data or {}, snapshot), snapshot)
    has_deadline = source.todo or source.due_date is not None
    return Entry(
        project_id=source.project_id,
        title=source.title,
        data=data,
        schema_version=source.schema_version,
        schema_snapshot=snapshot,
        todo=source.todo,
        status=source.status,
        due_date=occurs_on if has_deadline else None,
        created_by=created_by,
    )


async def materialize_due_occurrences(
    db: AsyncSession, project_ids: list[UUID], today: date
) -> int:
    """Create every occurrence that has come due, up to ``today``. Returns how many.

    Missed occurrences are created too (up to MAX_CATCH_UP_OCCURRENCES per
    recurrence per call) rather than skipped, so a gap in a daily log shows
    up as outstanding entries instead of silently disappearing.
    """
    from app.routers.projects import _record_entry_revision  # avoids an import cycle

    if not project_ids:
        return 0

    recurrences = (
        await db.scalars(
            select(EntryRecurrence).where(
                EntryRecurrence.project_id.in_(project_ids),
                EntryRecurrence.active.is_(True),
                EntryRecurrence.next_on.is_not(None),
                EntryRecurrence.next_on <= today,
            )
        )
    ).all()

    created = 0
    for recurrence in recurrences:
        source = await db.get(Entry, recurrence.entry_id)
        if source is None:
            continue

        made = 0
        while (
            recurrence.active
            and recurrence.next_on is not None
            and recurrence.next_on <= today
            and made < MAX_CATCH_UP_OCCURRENCES
        ):
            occurs_on = recurrence.next_on
            # Write the recurrence's progress so far *outside* the savepoint:
            # rolling the savepoint back must only undo this one occurrence,
            # never the bookkeeping for the ones already made.
            await db.flush()
            try:
                async with db.begin_nested():
                    entry = _occurrence_from(source, occurs_on, recurrence.created_by)
                    db.add(entry)
                    await db.flush()
                    db.add(_record_entry_revision(entry, recurrence.created_by, revision=1))
                    db.add(
                        RecurrenceOccurrence(
                            recurrence_id=recurrence.id,
                            occurrence_on=occurs_on,
                            entry_id=entry.id,
                        )
                    )
                    await db.flush()
                created += 1
            except IntegrityError:
                # Another request created this occurrence first. Nothing to do
                # but move past it, exactly as that request did.
                pass
            made += 1
            recurrence.next_index += 1
            schedule_next(recurrence)

    if recurrences:
        await db.commit()
    return created


async def count_occurrences(db: AsyncSession, recurrence_id: UUID) -> int:
    rows = await db.scalars(
        select(RecurrenceOccurrence.id).where(RecurrenceOccurrence.recurrence_id == recurrence_id)
    )
    return len(rows.all())


# ── Reminders ────────────────────────────────────────────────────────────────


def display_title(title: str | None, data: dict[str, Any], schema: list[dict[str, Any]]) -> str | None:
    """The entry's title, or its first text value, for a reminder to show."""
    if title:
        return title
    for field_def in schema or []:
        value = (data or {}).get(field_def.get("id"))
        if field_def.get("type") == "text" and isinstance(value, str) and value.strip():
            return value.strip()[:80]
    return None


def _status(due: date, today: date) -> str:
    if due < today:
        return "overdue"
    if due == today:
        return "due_today"
    return "upcoming"


async def collect_reminders(
    db: AsyncSession, projects: list[Project], today: date, within_days: int
) -> list[dict[str, Any]]:
    """To-do entries and open tasks due on or before ``today + within_days``.

    Overdue items come first (most overdue at the top), then by due date.
    Tasks and to-do entries are listed together because to the person being
    reminded they are the same thing: something they said they would do.
    """
    if not projects:
        return []

    names = {p.id: p.name for p in projects}
    ids = list(names)
    horizon = today + timedelta(days=within_days)
    items: list[dict[str, Any]] = []

    entries = await db.scalars(
        select(Entry).where(
            Entry.project_id.in_(ids),
            Entry.todo.is_(True),
            Entry.due_date.is_not(None),
            Entry.due_date <= horizon,
        )
    )
    for entry in entries.all():
        items.append(
            {
                "kind": "entry",
                "id": entry.id,
                "project_id": entry.project_id,
                "project_name": names[entry.project_id],
                "title": display_title(entry.title, entry.data, entry.schema_snapshot),
                "due_date": entry.due_date,
                "status": _status(entry.due_date, today),
                "days_until": (entry.due_date - today).days,
            }
        )

    tasks = await db.scalars(
        select(Task).where(
            Task.project_id.in_(ids),
            Task.completed.is_(False),
            Task.due_date.is_not(None),
            Task.due_date <= horizon,
        )
    )
    for task in tasks.all():
        items.append(
            {
                "kind": "task",
                "id": task.id,
                "project_id": task.project_id,
                "project_name": names[task.project_id],
                "title": task.title,
                "due_date": task.due_date,
                "status": _status(task.due_date, today),
                "days_until": (task.due_date - today).days,
            }
        )

    items.sort(key=lambda item: (item["due_date"], item["kind"], str(item["id"])))
    return items


__all__ = [
    "RuleOutcome",
    "apply_entry_rules",
    "collect_reminders",
    "count_occurrences",
    "materialize_due_occurrences",
    "occurrence_date",
    "readable_projects",
    "resolve_today",
    "schedule_next",
    "validate_rule",
]
