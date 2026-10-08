from datetime import date, datetime, timezone
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import delete, func, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.automation import apply_entry_rules, apply_status_rules, run_follow_ups
from app.computed import apply_computed_fields
from app.database import get_db
from app.models import (
    MEMBERSHIP_ACCEPTED,
    MEMBERSHIP_DECLINED,
    MEMBERSHIP_PENDING,
    Entry,
    EntryRecurrence,
    EntryRevision,
    EntryRule,
    Project,
    ProjectMember,
    SavedStatistic,
    Task,
    User,
)
from app.routers.auth import get_current_user
from app.schema_migration import Simulation, migrate_entry_data, simulate, simulate_entry_migration
from app.schemas import (
    MAX_CHECKLIST_ITEM_LENGTH,
    MAX_CHECKLIST_ITEMS,
    MAX_LONG_TEXT_LENGTH,
    MAX_SHORT_TEXT_LENGTH,
    MAX_TAG_LENGTH,
    MAX_TAGS,
    MAX_TIME_SPENT_MINUTES,
    EntryCreate,
    EntryMigrationPreview,
    EntryResponse,
    EntryRevertRequest,
    EntryRevisionResponse,
    EntryUpdate,
    ProjectCreate,
    ProjectMemberResponse,
    ProjectResponse,
    ProjectShareRequest,
    ProjectUpdate,
    SchemaChange,
    SchemaChangePreview,
    SchemaChangeRequest,
    SchemaChangeResult,
)
from app.statuses import default_name, is_done, names_of, reconcile, statuses_of

router = APIRouter(prefix="/projects", tags=["Projects"])


def _entry_state(entry: Entry) -> dict[str, Any]:
    """The values a version compares, flattened so each can be diffed on its own."""
    state: dict[str, Any] = {
        "title": entry.title,
        "time_spent": entry.time_spent,
        "todo": bool(entry.todo),
        "due_date": entry.due_date.isoformat() if isinstance(entry.due_date, date) else entry.due_date,
        "due_time": entry.due_time.isoformat() if entry.due_time else None,
        "status": entry.status,
        "schema_version": entry.schema_version,
    }
    for field_id, value in (entry.data or {}).items():
        state[f"data.{field_id}"] = value
    return state


def _record_entry_revision(
    entry: Entry,
    user_id: UUID | None,
    revision: int,
    *,
    action: str | None = None,
    note: str | None = None,
    previous: dict[str, Any] | None = None,
    reverted_to: int | None = None,
    changed_at: datetime | None = None,
) -> EntryRevision:
    """Copy the saved state into the entry's append-only audit trail.

    ``previous`` is the entry's state before this change (see _entry_state);
    when given, the version records which values changed and what they were.
    """
    current = _entry_state(entry)
    changed = (
        [key for key in dict.fromkeys([*previous, *current]) if previous.get(key) != current.get(key)]
        if previous is not None
        else []
    )
    return EntryRevision(
        entry_id=entry.id,
        revision=revision,
        action=action or ("created" if revision == 1 else "edited"),
        note=(note or "").strip() or None,
        changed_fields=changed,
        previous_values={key: previous.get(key) for key in changed} if previous is not None else {},
        reverted_to=reverted_to,
        changed_at=changed_at or datetime.now(timezone.utc),
        title=entry.title,
        data=dict(entry.data or {}),
        retired_data=dict(entry.retired_data or {}),
        schema_version=entry.schema_version,
        schema_snapshot=[dict(field) for field in (entry.schema_snapshot or [])],
        time_spent=entry.time_spent,
        todo=entry.todo,
        due_date=entry.due_date,
        due_time=entry.due_time,
        status=entry.status,
        changed_by=user_id,
    )


async def _ensure_history(entry: Entry, db: AsyncSession) -> int:
    """Return the entry's latest version number, first recording a baseline if it has none.

    Entries saved before history existed, or through a path that didn't record
    it, would otherwise lose what they said on their first correction. Call
    this *before* changing the entry, so the baseline is the original.
    """
    latest = await db.scalar(
        select(func.max(EntryRevision.revision)).where(EntryRevision.entry_id == entry.id)
    )
    if latest is not None:
        return latest
    db.add(
        _record_entry_revision(
            entry,
            entry.created_by,
            revision=1,
            action="created",
            changed_at=entry.updated_at or entry.created_at,
        )
    )
    await db.flush()
    return 1

# Field types the caller need not fill in: a computed field is derived by the
# server (US-2.5), and a reference may legitimately be left blank (US-2.4) so
# that adding one to a live schema does not invalidate every existing entry.
_OPTIONAL_TYPES = frozenset({"computed", "project_reference"})


async def _validate_entry_data(
    data: dict[str, Any],
    entry_schema: list[dict[str, Any]],
    known_project_ids: dict[str, str] | set[str] | None = None,
    db: AsyncSession | None = None,
    user: User | None = None,
    project_id: UUID | None = None,
    self_id: UUID | None = None,
    require_values: bool = True,
    previous: dict[str, Any] | None = None,
) -> None:
    """Validate entry field values against the project's entry_schema.

    ``require_values`` is False for an entry that is still to do: planned work
    has not happened yet, so it may leave fields empty. Whatever *is* given is
    still checked. Once the entry is done it must give every field marked
    required a value (a field with ``required: false`` may stay empty).

    ``previous`` is what the entry held before this write. A text value that
    is unchanged is not held to the length limit, so an entry written when
    there was no limit can still be saved.

    ``known_project_ids`` is the set of project ids a reference field is
    allowed to name — the caller's own projects. It is optional because the
    import path validates a document before any of its projects exist; those
    references are checked once the ids are known.

    ``db`` and ``user`` enable checks that need the database — a link field
    (US-2.3) must name an entry that actually exists, in the same project as
    the entry carrying it, and never the entry itself — and are omitted on
    paths that validate before a session is available. ``project_id`` says
    which project the entry belongs to (a link may not cross projects), and
    ``self_id`` identifies the entry being written so a self-link can be
    refused even when the entry is not in the database yet.
    """
    schema_by_id = {field["id"]: field for field in entry_schema}

    for field in entry_schema:
        field_id = field["id"]
        if (
            require_values
            and field_id not in data
            and field.get("type") not in _OPTIONAL_TYPES
            and field.get("required", True)
        ):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Missing required field: {field['name']}",
            )

    for field_id in data:
        if field_id not in schema_by_id:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Unknown field: {field_id}",
            )

    for field_id, value in data.items():
        field = schema_by_id[field_id]
        field_type = field.get("type")
        field_name = field.get("name", field_id)

        if field_type in ("text", "long_text"):
            if not isinstance(value, str):
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail=f"Field '{field_name}' must be text",
                )
            limit = MAX_LONG_TEXT_LENGTH if field_type == "long_text" else MAX_SHORT_TEXT_LENGTH
            if len(value) > limit and not (previous and previous.get(field_id) == value):
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail=f"Field '{field_name}' can hold at most {limit:,} characters",
                )
        elif field_type == "number":
            if not isinstance(value, (int, float)) or isinstance(value, bool):
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail=f"Field '{field_name}' must be a number",
                )
        elif field_type == "date":
            if not isinstance(value, str):
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail=f"Field '{field_name}' must be a date string",
                )
        elif field_type == "dropdown":
            options = field.get("options", [])
            if value not in options:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail=f"Field '{field_name}' must be one of: {', '.join(options)}",
                )
        elif field_type == "project_reference":
            # Blank is allowed; anything present has to name a project that
            # exists and belongs to the caller, or the reference is a dead end.
            if value is None:
                continue
            if not isinstance(value, str):
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail=f"Field '{field_name}' must reference a project",
                )
            try:
                canonical = str(UUID(value))
            except ValueError:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail=f"Field '{field_name}' must reference a project",
                ) from None
            if known_project_ids is not None and canonical not in known_project_ids:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail=f"Field '{field_name}' refers to a project that does not exist",
                )
        elif field_type == "tags":
            if not isinstance(value, list) or not all(
                isinstance(tag, str) for tag in value
            ):
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail=f"Field '{field_name}' must be a list of strings",
                )
            # At least one tag: the field exists so entries can be
            # categorised and filtered, and an empty list does neither.
            if len(value) < 1:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail=f"Field '{field_name}' needs at least one tag",
                )
            if len(value) > MAX_TAGS:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail=(
                        f"Field '{field_name}' cannot have more than "
                        f"{MAX_TAGS} tags"
                    ),
                )
            for tag in value:
                if not tag.strip():
                    raise HTTPException(
                        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                        detail=f"Field '{field_name}' cannot contain an empty tag",
                    )
                if len(tag.strip()) > MAX_TAG_LENGTH:
                    raise HTTPException(
                        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                        detail=(
                            f"Field '{field_name}': each tag must be "
                            f"{MAX_TAG_LENGTH} characters or fewer"
                        ),
                    )
        elif field_type == "checklist":
            if not isinstance(value, list):
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail=f"Field '{field_name}' must be a list of checklist items",
                )
            if len(value) > MAX_CHECKLIST_ITEMS:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail=(
                        f"Field '{field_name}' cannot have more than "
                        f"{MAX_CHECKLIST_ITEMS} items"
                    ),
                )
            seen_texts: set[str] = set()
            for item in value:
                if not isinstance(item, dict):
                    raise HTTPException(
                        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                        detail=f"Field '{field_name}': each checklist item must be an object",
                    )
                if "id" not in item or "text" not in item:
                    raise HTTPException(
                        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                        detail=f"Field '{field_name}': checklist items require 'id' and 'text'",
                    )
                if not isinstance(item["text"], str):
                    raise HTTPException(
                        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                        detail=f"Field '{field_name}': checklist item text must be a string",
                    )
                if "completed" in item and not isinstance(item["completed"], bool):
                    raise HTTPException(
                        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                        detail=(
                            f"Field '{field_name}': checklist item 'completed' "
                            "must be true or false"
                        ),
                    )
                text = item["text"].strip()
                if not text:
                    raise HTTPException(
                        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                        detail=f"Field '{field_name}' cannot contain an empty item",
                    )
                if len(text) > MAX_CHECKLIST_ITEM_LENGTH:
                    raise HTTPException(
                        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                        detail=(
                            f"Field '{field_name}': each item must be "
                            f"{MAX_CHECKLIST_ITEM_LENGTH} characters or fewer"
                        ),
                    )
                # Two identically-named steps are one step written twice;
                # refusing the duplicate is clearer than silently keeping both.
                if text.lower() in seen_texts:
                    raise HTTPException(
                        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                        detail=(
                            f"Field '{field_name}': checklist items must be "
                            "unique"
                        ),
                    )
                seen_texts.add(text.lower())
        elif field_type == "link":
            if value is not None and value != "":
                if not isinstance(value, str):
                    raise HTTPException(
                        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                        detail=f"Field '{field_name}' must be an entry id string",
                    )
                try:
                    target_id = UUID(value)
                except ValueError:
                    # `from None` because the ValueError only says the string
                    # is not a UUID, which the detail already states.
                    raise HTTPException(
                        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                        detail=f"Field '{field_name}': invalid entry id",
                    ) from None
                # An entry that links to itself is a cross-reference to
                # nowhere: it can never be followed and never cleaned up.
                if self_id is not None and target_id == self_id:
                    raise HTTPException(
                        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                        detail=f"Field '{field_name}' cannot link an entry to itself",
                    )
                # A link is a reference into the same project's logbook — the
                # picker only offers that project's entries, and a reference
                # that leaves it would be invisible from both sides.
                if project_id is not None and db is not None and user is not None:
                    target = await db.get(Entry, target_id)
                    if target is None:
                        raise HTTPException(
                            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                            detail=f"Field '{field_name}': linked entry does not exist",
                        )
                    if target.project_id != project_id:
                        raise HTTPException(
                            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                            detail=(
                                f"Field '{field_name}': linked entry belongs to a "
                                "different project"
                            ),
                        )


async def _user_projects(user: User, db: AsyncSession) -> dict[str, str]:
    """The caller's projects, as canonical id → name.

    A map rather than a set because a retargeted link is best described by the
    project it will point at, and the check only ever needs membership.
    """
    result = await db.execute(
        select(Project.id, Project.name).where(Project.user_id == user.id)
    )
    return {str(project_id): name for project_id, name in result.all()}


async def _reference_scope(
    entry_schema: list[dict[str, Any]],
    user: User,
    db: AsyncSession,
) -> dict[str, str] | None:
    """The projects a schema's references may name, or ``None`` if it has none.

    Returning ``None`` for the ordinary schema keeps the extra query off every
    entry write that has nothing to reference.
    """
    if not any(field.get("type") == "project_reference" for field in entry_schema):
        return None
    return await _user_projects(user, db)


async def _validate_reference_targets(
    entry_schema: list[dict[str, Any]],
    user: User,
    db: AsyncSession,
    self_id: UUID | None = None,
) -> None:
    """A project link names its target once, in the schema (US-2.4).

    Choosing a target per entry asked the owner to re-answer a question the
    schema had already answered, so the target is a schema-level fact. Checked
    here rather than in the model so a schema saved before links moved into
    the schema — and an export file from that era — still loads.
    """
    references = [field for field in entry_schema if field.get("type") == "project_reference"]
    if not references:
        return

    owned = await _user_projects(user, db)
    for field in references:
        name = field.get("name", field["id"])
        target = field.get("linked_project_id")
        if not target:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Field '{name}' needs to say which project it links to.",
            )
        target = str(target)
        if target not in owned:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Field '{name}' links to a project that does not exist.",
            )
        if self_id is not None and target == str(self_id):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Field '{name}' cannot link to its own project.",
            )


def _apply_project_references(
    data: dict[str, Any],
    entry_schema: list[dict[str, Any]],
) -> dict[str, Any]:
    """Fill each schema-linked reference from the schema's own target.

    The same contract as ``apply_computed_fields``: whatever the client sent
    for the field is replaced, because the link is defined by the schema
    rather than chosen per entry, and offline sync replays payloads captured
    under whatever the schema said at the time. Runs before validation so the
    target is checked like any other value.
    """
    result = dict(data)
    for field in entry_schema:
        if field.get("type") == "project_reference" and field.get("linked_project_id"):
            result[field["id"]] = str(field["linked_project_id"])
    return result

async def _get_user_project(
    project_id: UUID,
    user: User,
    db: AsyncSession,
) -> Project:
    project = await db.scalar(
        select(Project).where(
            Project.id == project_id,
            Project.user_id == user.id,
        )
    )

    if project is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found",
        )

    return project


# Membership is deliberately not accepted everywhere ``_get_user_project`` is.
# Reading a project and adding to it are shared; reshaping or removing it —
# the schema, archiving, deletion, export, and who else may see it — stays with
# the owner, so being invited to contribute cannot become control of the record.
async def _get_readable_project(
    project_id: UUID,
    user: User,
    db: AsyncSession,
) -> Project:
    project = await db.scalar(
        select(Project)
        .outerjoin(
            ProjectMember,
            (ProjectMember.project_id == Project.id)
            & (ProjectMember.status == MEMBERSHIP_ACCEPTED),
        )
        .where(
            Project.id == project_id,
            or_(Project.user_id == user.id, ProjectMember.user_id == user.id),
        )
    )

    if project is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found",
        )

    return project

@router.get("", response_model=list[ProjectResponse])
async def list_projects(
    user: User = Depends(get_current_user),  # noqa: B008
    db: AsyncSession = Depends(get_db),  # noqa: B008
):
    # Only projects whose invitation has been accepted. One that is merely
    # offered belongs in the invitations list, not in somebody's sidebar.
    shared_with_me = select(ProjectMember.project_id).where(
        ProjectMember.user_id == user.id,
        ProjectMember.status == MEMBERSHIP_ACCEPTED,
    )
    result = await db.execute(
        select(Project, func.coalesce(func.sum(Entry.time_spent), 0).label("total_time"))
        .outerjoin(Entry, Project.id == Entry.project_id)
        .where(or_(Project.user_id == user.id, Project.id.in_(shared_with_me)))
        .group_by(Project.id)
        .order_by(Project.created_at.desc())
    )

    return [
        {
            **ProjectResponse.model_validate(project).model_dump(),
            "total_time_spent": int(total_time or 0),
            "shared": project.user_id != user.id,
        }
        for project, total_time in result.all()
    ]


@router.post("", response_model=ProjectResponse, status_code=status.HTTP_201_CREATED)
async def create_project(
    data: ProjectCreate,
    user: User = Depends(get_current_user),  # noqa: B008
    db: AsyncSession = Depends(get_db),  # noqa: B008
):
    project = Project(
        user_id=user.id,
        name=data.name,
        description=data.description,
        entry_schema=[field.model_dump(mode="json") for field in data.entry_schema],
        statuses=[item.model_dump(mode="json") for item in data.statuses] if data.statuses else [],
        schema_version=1,
    )
    await _validate_reference_targets(project.entry_schema, user, db)

    db.add(project)
    await db.commit()
    await db.refresh(project)
    return project


@router.get("/{project_id}", response_model=ProjectResponse)
async def get_project(
    project_id: UUID,
    user: User = Depends(get_current_user),  # noqa: B008
    db: AsyncSession = Depends(get_db),  # noqa: B008
):
    project = await _get_readable_project(project_id, user, db)
    total_time = await db.scalar(
        select(func.coalesce(func.sum(Entry.time_spent), 0)).where(
            Entry.project_id == project_id
        )
    )
    return {
        **ProjectResponse.model_validate(project).model_dump(),
        "total_time_spent": int(total_time or 0),
        "shared": project.user_id != user.id,
    }


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_project(
    project_id: UUID,
    user: User = Depends(get_current_user),  # noqa: B008
    db: AsyncSession = Depends(get_db),  # noqa: B008
):
    """Delete a project and everything recorded in it. Owner only.

    Archiving is the ordinary way to finish with a project, because it keeps
    the record. This removes it outright, so the UI asks for the project's
    name back before calling it.

    The children are deleted explicitly rather than left to ON DELETE CASCADE.
    ``tasks.project_id`` carries no cascade at all, so PostgreSQL would refuse
    to delete a project that still had tasks; and SQLite does not enforce
    foreign keys unless asked to, so the test suite would not have caught it.

    A link in another project that pointed here is deliberately left alone. It
    then reads as "a project you no longer have", which is true — clearing it
    would make it read as never having been pointed anywhere.
    """
    await _get_user_project(project_id, user, db)

    await db.execute(delete(Task).where(Task.project_id == project_id))
    # Recurrences before entries: they reference the entries they repeat.
    # (Their occurrence records go with them via ON DELETE CASCADE.)
    await db.execute(delete(EntryRecurrence).where(EntryRecurrence.project_id == project_id))
    await db.execute(delete(EntryRule).where(EntryRule.project_id == project_id))
    await db.execute(delete(SavedStatistic).where(SavedStatistic.project_id == project_id))
    await db.execute(delete(Entry).where(Entry.project_id == project_id))
    await db.execute(delete(ProjectMember).where(ProjectMember.project_id == project_id))
    await db.execute(delete(Project).where(Project.id == project_id))
    await db.commit()

    return Response(status_code=status.HTTP_204_NO_CONTENT)


async def _move_entries_off_removed_statuses(project: Project, db: AsyncSession) -> None:
    """Entries sitting in a status that no longer exists move to the nearest kind.

    "Nearest" means the first remaining status that agrees on done-ness, so
    outstanding work stays outstanding and finished work stays finished.
    """
    statuses = statuses_of(project.statuses)
    names = names_of(statuses)
    for todo in (True, False):
        await db.execute(
            update(Entry)
            .where(Entry.project_id == project.id, Entry.todo == todo, Entry.status.not_in(names))
            .values(status=default_name(statuses, todo))
        )
    # Entries whose status is still valid but whose done-ness was redefined
    # (a status switched between "done" and "not done") follow the new meaning.
    for item in statuses:
        await db.execute(
            update(Entry)
            .where(Entry.project_id == project.id, Entry.status == item["name"], Entry.todo == item["done"])
            .values(todo=not item["done"])
        )


@router.put("/{project_id}", response_model=ProjectResponse)
async def update_project(
    project_id: UUID,
    data: ProjectUpdate,
    user: User = Depends(get_current_user),  # noqa: B008
    db: AsyncSession = Depends(get_db),  # noqa: B008
):
    """Rename a project, change its description, or replace its schema.

    A schema replacement goes through the same path as the dedicated schema
    endpoint, so the two can never disagree about what a save does — which is
    nothing to any existing entry (see schema_migration.py). What this
    endpoint cannot do is report the diff — for that, use ``PUT /schema``.
    """
    project = await _get_user_project(project_id, user, db)

    if data.name is not None:
        project.name = data.name
    if data.description is not None:
        project.description = data.description
    if data.entry_schema is not None:
        proposed = [field.model_dump(mode="json") for field in data.entry_schema]
        await _validate_reference_targets(proposed, user, db, self_id=project.id)
        await _replace_schema(project, proposed, user, db)
    if data.statuses is not None:
        project.statuses = [item.model_dump(mode="json") for item in data.statuses]
        await _move_entries_off_removed_statuses(project, db)

    await db.commit()
    await db.refresh(project)
    return project


# ── Editing a live schema (US-2.6, US-2.7) ───────────────────────────────────


async def _plan_schema_change(
    project: Project,
    proposed_schema: list[dict[str, Any]],
    user: User,
    db: AsyncSession,
) -> tuple[Simulation, int]:
    """Describe what saving this schema would change, and how many entries exist.

    Passes no entries into ``simulate`` — a schema save doesn't touch any of
    them (see schema_migration.py) — so this only diffs the schema itself.
    ``entry_count`` is returned separately, purely so the review screen can
    say "none of your N entries are affected" rather than nothing at all.
    """
    known_project_ids = await _reference_scope(proposed_schema, user, db)
    entry_count = await db.scalar(
        select(func.count()).select_from(Entry).where(Entry.project_id == project.id)
    )
    return simulate(project, [], proposed_schema, known_project_ids), int(entry_count or 0)


def _as_preview(simulation: Simulation, entry_count: int) -> dict[str, Any]:
    return {
        "entry_count": entry_count,
        "entries_affected": simulation.entries_affected,
        "changes": [
            SchemaChange(
                kind=change.kind,
                field_id=change.field_id,
                field_name=change.field_name,
                description=change.description,
                severity=change.severity,
                entries_affected=change.entries_affected,
                values_coerced=change.values_coerced,
                values_retired=change.values_retired,
            )
            for change in simulation.changes
        ],
    }


def _guard_archived_schema_change(project: Project, proposed_schema: list[dict[str, Any]]) -> None:
    """Refuse to reshape the entries of an archived project.

    Only when the schema actually differs: re-sending the schema it already has
    is how the ordinary project form saves a rename, and that should keep
    working on an archived project.
    """
    if project.archived and (project.entry_schema or []) != proposed_schema:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Cannot change the schema of an archived project.",
        )


async def _replace_schema(
    project: Project,
    proposed_schema: list[dict[str, Any]],
    user: User,
    db: AsyncSession,
) -> tuple[Simulation, int]:
    """Apply a new schema to the project. Existing entries are untouched.

    See schema_migration.py: an entry keeps the exact shape it was recorded
    in until someone individually chooses to migrate it during an edit.
    """
    _guard_archived_schema_change(project, proposed_schema)

    simulation, entry_count = await _plan_schema_change(project, proposed_schema, user, db)

    project.schema_version += 1
    project.entry_schema = proposed_schema
    project.retired_schema = simulation.retired_schema

    return simulation, entry_count


@router.post("/{project_id}/schema/preview", response_model=SchemaChangePreview)
async def preview_schema_change(
    project_id: UUID,
    payload: SchemaChangeRequest,
    user: User = Depends(get_current_user),  # noqa: B008
    db: AsyncSession = Depends(get_db),  # noqa: B008
):
    """Report what changing a project's schema would do, changing nothing.

    A schema save never touches an existing entry (see schema_migration.py),
    so this describes what changes for *new* entries only. The report is
    produced by running the real diff and discarding the result, which is
    why it cannot drift from what saving actually does.
    """
    project = await _get_user_project(project_id, user, db)

    proposed_schema = [field.model_dump(mode="json") for field in payload.entry_schema]
    await _validate_reference_targets(proposed_schema, user, db, self_id=project.id)
    simulation, entry_count = await _plan_schema_change(project, proposed_schema, user, db)

    return _as_preview(simulation, entry_count)


@router.put("/{project_id}/schema", response_model=SchemaChangeResult)
async def update_schema(
    project_id: UUID,
    payload: SchemaChangeRequest,
    user: User = Depends(get_current_user),  # noqa: B008
    db: AsyncSession = Depends(get_db),  # noqa: B008
):
    """Replace a project's schema. Existing entries keep their own shape.

    Returns the same report as the preview, so the caller can tell the user
    what happened rather than only that something did.
    """
    project = await _get_user_project(project_id, user, db)

    proposed_schema = [field.model_dump(mode="json") for field in payload.entry_schema]
    await _validate_reference_targets(proposed_schema, user, db, self_id=project.id)
    simulation, entry_count = await _replace_schema(project, proposed_schema, user, db)

    await db.commit()
    await db.refresh(project)

    total_time = await db.scalar(
        select(func.coalesce(func.sum(Entry.time_spent), 0)).where(Entry.project_id == project_id)
    )

    return {
        **_as_preview(simulation, entry_count),
        "project": {
            **ProjectResponse.model_validate(project).model_dump(),
            "total_time_spent": int(total_time or 0),
        },
    }


@router.post("/{project_id}/archive", response_model=ProjectResponse)
async def archive_project(
    project_id: UUID,
    user: User = Depends(get_current_user),  # noqa: B008
    db: AsyncSession = Depends(get_db),  # noqa: B008
):
    project = await _get_user_project(project_id, user, db)

    project.archived = True

    await db.commit()
    await db.refresh(project)

    return project


@router.post("/{project_id}/unarchive", response_model=ProjectResponse)
async def unarchive_project(
    project_id: UUID,
    user: User = Depends(get_current_user),  # noqa: B008
    db: AsyncSession = Depends(get_db),  # noqa: B008
):
    project = await _get_user_project(project_id, user, db)

    project.archived = False

    await db.commit()
    await db.refresh(project)

    return project


@router.post(
    "/{project_id}/entries",
    response_model=EntryResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_entry(
    project_id: UUID,
    data: EntryCreate,
    response: Response,
    user: User = Depends(get_current_user),  # noqa: B008
    db: AsyncSession = Depends(get_db),  # noqa: B008
):
    """Create an entry, or return the existing one when the id is already known.

    Offline sync and import both replay requests that may have already landed
    (a response can be lost even when the write succeeded). When the caller
    supplies an id, creation is idempotent: an id we have already stored
    returns that entry with 200 instead of creating a duplicate with 201.
    """
    project = await _get_readable_project(project_id, user, db)

    if data.id is not None:
        existing = await db.get(Entry, data.id, execution_options={"include_deleted": True})
        if existing is not None:
            # The id is only ever compared against the project the caller was
            # just authorised for, so a collision with another user's entry
            # falls through to the 409 below and never discloses their data.
            if existing.project_id != project_id:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="An entry with this id already exists.",
                )
            if existing.deleted_at is not None:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="This entry was deleted. Restore it from the project's deleted entries.",
                )
            response.status_code = status.HTTP_200_OK
            return existing

    # Checked after the idempotency lookup on purpose: an entry that synced
    # before the project was archived should still be returned, not rejected.
    if project.archived:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Cannot add entries to an archived project.",
        )

    payload_data = _apply_project_references(data.data, project.entry_schema)

    # Rules run before validation (US-3.12): a rule may fill in a field the
    # author left blank, and the finished entry is what has to be valid.
    rules = await apply_entry_rules(db, project, payload_data)
    payload_data = rules.data

    statuses = statuses_of(project.statuses)
    todo = data.todo or rules.mark_todo
    # A status a rule chose stands in for one the author left out.
    chosen_status = data.status
    if chosen_status is None and rules.status in names_of(statuses):
        chosen_status = rules.status
    if chosen_status is not None:
        if chosen_status not in names_of(statuses):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Unknown status '{chosen_status}'. Choose one of: {', '.join(names_of(statuses))}.",
            )
        # The status the author chose decides whether the entry is outstanding.
        todo = not is_done(statuses, chosen_status)

    await _validate_entry_data(
        payload_data,
        project.entry_schema,
        await _reference_scope(project.entry_schema, user, db),
        db=db,
        user=user,
        project_id=project_id,
        # The caller may have chosen the id already (offline sync, import),
        # which is the only way a brand-new entry could link to itself.
        self_id=data.id,
        # Planned work may leave fields empty; finished work may not.
        require_values=not todo,
    )

    entry = Entry(
        project_id=project_id,
        status=reconcile(statuses, chosen_status, todo),
        title=(data.title or "").strip() or None,
        data=apply_computed_fields(payload_data, project.entry_schema),
        schema_version=project.schema_version,
        schema_snapshot=[dict(field) for field in project.entry_schema],
        time_spent=data.time_spent,
        todo=todo,
        # A due date the author chose always beats one a rule suggests.
        due_date=data.due_date or rules.due_date,
        due_time=data.due_time if (data.due_date or rules.due_date) else None,
        created_by=user.id,
    )

    # Preserve the caller's identity and capture time when supplied; the model
    # defaults cover the ordinary online path.
    if data.id is not None:
        entry.id = data.id
    if data.created_at is not None:
        entry.created_at = data.created_at

    db.add(entry)
    await db.flush()
    db.add(_record_entry_revision(entry, user.id, revision=1, changed_at=entry.created_at))
    # Tasks and repeats a rule asked for, now that the entry has an id.
    await run_follow_ups(db, project, entry, rules, user.id)
    await db.commit()
    await db.refresh(entry)

    # Not a column — read by EntryResponse so the author can see which rules
    # changed what they saved, on the one response where that is news.
    entry.applied_rules = rules.applied
    return entry


@router.get("/{project_id}/entries", response_model=list[EntryResponse])
async def list_entries(
    project_id: UUID,
    user: User = Depends(get_current_user),  # noqa: B008
    db: AsyncSession = Depends(get_db),  # noqa: B008
):
    await _get_readable_project(project_id, user, db)

    result = await db.execute(
        select(Entry)
        .where(Entry.project_id == project_id)
        .order_by(Entry.created_at.desc(), Entry.id.desc())
    )

    return result.scalars().all()


@router.get("/{project_id}/entries/deleted", response_model=list[EntryResponse])
async def list_deleted_entries(
    project_id: UUID,
    user: User = Depends(get_current_user),  # noqa: B008
    db: AsyncSession = Depends(get_db),  # noqa: B008
):
    """Entries deleted from this project, most recent first, so they can be restored."""
    await _get_readable_project(project_id, user, db)
    result = await db.execute(
        select(Entry)
        .where(Entry.project_id == project_id, Entry.deleted_at.is_not(None))
        .order_by(Entry.deleted_at.desc(), Entry.id.desc())
        .execution_options(include_deleted=True)
    )
    return result.scalars().all()


async def _get_project_entry(
    entry_id: UUID,
    project_id: UUID,
    db: AsyncSession,
    *,
    include_deleted: bool = False,
) -> Entry:
    """Resolve an entry within a project the caller has already been authorised for."""
    entry = await db.get(
        Entry, entry_id, execution_options={"include_deleted": include_deleted}
    )

    if entry is None or entry.project_id != project_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Entry not found",
        )

    return entry


@router.get("/{project_id}/entries/{entry_id}", response_model=EntryResponse)
async def get_entry(
    project_id: UUID,
    entry_id: UUID,
    user: User = Depends(get_current_user),  # noqa: B008
    db: AsyncSession = Depends(get_db),  # noqa: B008
):
    await _get_readable_project(project_id, user, db)

    return await _get_project_entry(entry_id, project_id, db)


@router.get(
    "/{project_id}/entries/{entry_id}/history",
    response_model=list[EntryRevisionResponse],
)
async def get_entry_history(
    project_id: UUID,
    entry_id: UUID,
    user: User = Depends(get_current_user),  # noqa: B008
    db: AsyncSession = Depends(get_db),  # noqa: B008
):
    """Return immutable entry revisions, newest first, to project readers.

    Includes deleted entries, whose last version is the deletion itself.
    """
    await _get_readable_project(project_id, user, db)
    entry = await _get_project_entry(entry_id, project_id, db, include_deleted=True)
    if await db.scalar(select(EntryRevision.id).where(EntryRevision.entry_id == entry_id).limit(1)) is None:
        await _ensure_history(entry, db)
        await db.commit()
    result = await db.execute(
        select(EntryRevision)
        .where(EntryRevision.entry_id == entry_id)
        .order_by(EntryRevision.revision.desc())
    )
    return result.scalars().all()


@router.get(
    "/{project_id}/entries/{entry_id}/migration-preview",
    response_model=EntryMigrationPreview,
)
async def preview_entry_migration(
    project_id: UUID,
    entry_id: UUID,
    user: User = Depends(get_current_user),  # noqa: B008
    db: AsyncSession = Depends(get_db),  # noqa: B008
):
    """Show what bringing this one entry up to the current schema would do.

    Read-only, the entry-level equivalent of POST /schema/preview — runs the
    real migration and discards the result, so what an edit that sets
    migrate_to_current_schema=true actually saves cannot disagree with what
    this showed first. Readable by anyone who can read the entry itself;
    looking at a preview isn't changing anything, so it isn't gated by
    _get_writable_entry.
    """
    project = await _get_readable_project(project_id, user, db)
    entry = await _get_project_entry(entry_id, project_id, db)

    known_project_ids = await _reference_scope(project.entry_schema, user, db)
    simulation = simulate_entry_migration(entry, project.entry_schema, known_project_ids)
    migrated = simulation.entries[0]

    return {
        "data": migrated.data,
        "retired_data": migrated.retired_data,
        "changes": [
            SchemaChange(
                kind=change.kind,
                field_id=change.field_id,
                field_name=change.field_name,
                description=change.description,
                severity=change.severity,
                entries_affected=change.entries_affected,
                values_coerced=change.values_coerced,
                values_retired=change.values_retired,
            )
            for change in simulation.changes
        ],
    }


async def _get_writable_entry(
    entry_id: UUID,
    project: Project,
    user: User,
    db: AsyncSession,
    *,
    include_deleted: bool = False,
) -> Entry:
    """An entry the caller may correct or remove.

    The owner may edit anything in their own project. A collaborator may edit
    what they themselves wrote — a contributor who cannot fix their own typo
    has to ask the owner to do it, and a contributor who can rewrite everyone
    else's entries is no longer a contributor to somebody's record.
    """
    entry = await _get_project_entry(entry_id, project.id, db, include_deleted=include_deleted)

    if project.user_id != user.id and entry.created_by != user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the person who wrote an entry, or the project's owner, can change it.",
        )

    return entry


@router.put("/{project_id}/entries/{entry_id}", response_model=EntryResponse)
async def update_entry(
    project_id: UUID,
    entry_id: UUID,
    payload: EntryUpdate,
    user: User = Depends(get_current_user),  # noqa: B008
    db: AsyncSession = Depends(get_db),  # noqa: B008
):
    """Update an entry's title, values, or the time spent on it.

    By default, ``data`` is validated against the shape this entry actually
    recorded (``entry.schema_snapshot``) — an entry keeps its own shape
    forever, until someone explicitly brings it up to date. Set
    ``migrate_to_current_schema: true`` to do that as part of this same
    save: the entry's existing values are migrated onto the project's
    *current* schema first (see GET .../migration-preview for what that
    will produce before committing to it), then whatever ``data`` sends here
    is layered on top, so filling in a field that's new to this entry and
    migrating it happen in one request. See "Editing an entry after the
    schema has changed" in the API docs.

    Readable by the owner and by an accepted member, but only the owner or
    the entry's own author may actually change it — see _get_writable_entry.
    """
    project = await _get_readable_project(project_id, user, db)
    entry = await _get_writable_entry(entry_id, project, user, db)

    if project.archived:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Cannot edit entries in an archived project.",
        )

    latest_revision = await _ensure_history(entry, db)
    previous = _entry_state(entry)

    # Whether the entry will be outstanding once this save is applied, which decides
    # whether its fields must all be filled in (planned work may leave them empty).
    project_statuses = statuses_of(project.statuses)
    if "status" in payload.model_fields_set and payload.status in names_of(project_statuses):
        will_be_todo = not is_done(project_statuses, payload.status)
    elif "todo" in payload.model_fields_set and payload.todo is not None:
        will_be_todo = payload.todo
    else:
        will_be_todo = entry.todo

    # Finishing planned work, from the Board or Outstanding say, sends no field values, but
    # the entry still has to be complete once it is done: say what is missing.
    if entry.todo and not will_be_todo and payload.data is None and not payload.migrate_to_current_schema:
        held = entry.data or {}
        lacking = [
            field["name"]
            for field in (entry.schema_snapshot or [])
            if field["id"] not in held
            and field.get("type") not in _OPTIONAL_TYPES
            and field.get("required", True)
        ]
        if lacking:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Fill in {', '.join(lacking)} before finishing this entry.",
            )

    # A ceiling for new figures only: an entry already above it keeps its time, and an
    # edit that leaves the time alone is fine.
    if (
        "time_spent" in payload.model_fields_set
        and payload.time_spent is not None
        and payload.time_spent > MAX_TIME_SPENT_MINUTES
        and payload.time_spent != entry.time_spent
    ):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="An entry can record at most 10,000 hours.",
        )

    if "title" in payload.model_fields_set:
        entry.title = (payload.title or "").strip() or None

    if payload.migrate_to_current_schema:
        target_schema = project.entry_schema
        known_project_ids = await _reference_scope(target_schema, user, db)
        baseline_data, baseline_retired = migrate_entry_data(
            entry.data or {},
            entry.retired_data or {},
            entry.created_at,
            entry.schema_snapshot or [],
            target_schema,
            known_project_ids,
        )
        merged_data = {**baseline_data, **(payload.data or {})}
        payload_data = _apply_project_references(merged_data, target_schema)
        await _validate_entry_data(
            payload_data,
            target_schema,
            known_project_ids,
            db=db,
            user=user,
            require_values=not will_be_todo,
            previous=entry.data or {},
        )
        entry.data = apply_computed_fields(payload_data, target_schema)
        entry.retired_data = baseline_retired
        entry.schema_version = project.schema_version
        entry.schema_snapshot = target_schema
    elif payload.data is not None:
        entry_schema = entry.schema_snapshot or []
        payload_data = _apply_project_references(payload.data, entry_schema)
        await _validate_entry_data(
            payload_data,
            entry_schema,
            await _reference_scope(entry_schema, user, db),
            db=db,
            user=user,
            project_id=project_id,
            self_id=entry_id,
            require_values=not will_be_todo,
            previous=entry.data or {},
        )
        entry.data = apply_computed_fields(payload_data, entry_schema)

    # Checked against the fields actually sent rather than against None, so
    # that an explicit "time_spent": null clears a recorded duration while
    # omitting the field leaves it untouched.
    if "time_spent" in payload.model_fields_set:
        entry.time_spent = payload.time_spent

    # Same treatment for the outstanding-work fields: clearing a due date is
    # an explicit null, and ticking an outstanding entry off is todo=false.
    statuses = statuses_of(project.statuses)
    status_before = entry.status
    if "status" in payload.model_fields_set and payload.status is not None:
        if payload.status not in names_of(statuses):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Unknown status '{payload.status}'. Choose one of: {', '.join(names_of(statuses))}.",
            )
        entry.status = payload.status
        entry.todo = not is_done(statuses, payload.status)
    elif "todo" in payload.model_fields_set and payload.todo is not None:
        entry.todo = payload.todo
        entry.status = reconcile(statuses, entry.status, entry.todo)
    if "due_date" in payload.model_fields_set:
        entry.due_date = payload.due_date
    if "due_time" in payload.model_fields_set:
        entry.due_time = payload.due_time
    if entry.due_date is None:
        entry.due_time = None

    # A save that changes nothing adds no version, unless it explains itself.
    if _entry_state(entry) != previous or (payload.note or "").strip():
        db.add(
            _record_entry_revision(
                entry, user.id, revision=latest_revision + 1, note=payload.note, previous=previous
            )
        )
    # Rules waiting for the status the entry has just moved into.
    if entry.status != status_before:
        await db.flush()
        follow_ups = await apply_status_rules(db, project, entry)
        await run_follow_ups(db, project, entry, follow_ups, user.id)
    await db.commit()
    await db.refresh(entry)

    return entry


@router.post("/{project_id}/entries/{entry_id}/revert", response_model=EntryResponse)
async def revert_entry(
    project_id: UUID,
    entry_id: UUID,
    payload: EntryRevertRequest,
    user: User = Depends(get_current_user),  # noqa: B008
    db: AsyncSession = Depends(get_db),  # noqa: B008
):
    """Make an earlier version current again (US-3.10).

    Nothing is removed: the revert is a new version whose values match the
    chosen one. Reverting a deleted entry restores it.
    """
    project = await _get_readable_project(project_id, user, db)
    entry = await _get_writable_entry(entry_id, project, user, db, include_deleted=True)

    if project.archived:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Cannot edit entries in an archived project.",
        )

    latest_revision = await _ensure_history(entry, db)
    target = await db.scalar(
        select(EntryRevision).where(
            EntryRevision.entry_id == entry.id, EntryRevision.revision == payload.revision
        )
    )
    if target is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Version not found.")
    if target.action == "deleted":
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="That version is the deletion itself. Choose a version from before it.",
        )

    was_deleted = entry.deleted_at is not None
    if target.revision == latest_revision and not was_deleted:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="That is already the current version.",
        )

    previous = _entry_state(entry)
    entry.title = target.title
    entry.data = dict(target.data or {})
    entry.retired_data = dict(target.retired_data or {})
    entry.schema_version = target.schema_version
    entry.schema_snapshot = [dict(field) for field in (target.schema_snapshot or [])]
    entry.time_spent = target.time_spent
    entry.todo = target.todo
    entry.due_date = target.due_date
    entry.due_time = target.due_time
    entry.status = reconcile(statuses_of(project.statuses), target.status, entry.todo)
    entry.deleted_at = None

    summary = (
        f"Restored and reverted to v{target.revision}."
        if was_deleted
        else f"Reverted to v{target.revision}."
    )
    reason = (payload.note or "").strip()
    db.add(
        _record_entry_revision(
            entry,
            user.id,
            revision=latest_revision + 1,
            action="reverted",
            note=f"{summary} {reason}" if reason else summary,
            previous=previous,
            reverted_to=target.revision,
        )
    )
    await db.commit()
    await db.refresh(entry)
    return entry


def _is_link_to(value: Any, target: UUID) -> bool:
    """Whether a stored link value points at *target*.

    Compared as parsed UUIDs rather than raw strings: an id can be written
    with different spellings (upper case, without dashes), and a link that was
    accepted by validation must clean up and resolve by exactly the same rule.
    """
    if not isinstance(value, str) or not value:
        return False
    try:
        return UUID(value) == target
    except ValueError:
        return False


async def _clear_broken_links(
    deleted_entry_id: UUID,
    user: User,
    db: AsyncSession,
) -> None:
    """Find all of the user's entries whose link fields point to
    *deleted_entry_id* and clear (null-out) those fields so they don't
    become broken references.
    """
    result = await db.execute(
        select(Entry)
        .join(Project, Entry.project_id == Project.id)
        .where(Project.user_id == user.id)
    )
    for candidate in result.scalars().all():
        if candidate.id == deleted_entry_id:
            continue
        cleared = {
            field_id: None
            for field_id, value in (candidate.data or {}).items()
            if _is_link_to(value, deleted_entry_id)
        }
        if cleared:
            latest = await _ensure_history(candidate, db)
            previous = _entry_state(candidate)
            # A new dict, not an in-place change, so SQLAlchemy sees it.
            candidate.data = {**candidate.data, **cleared}
            db.add(
                _record_entry_revision(
                    candidate,
                    user.id,
                    revision=latest + 1,
                    note="Link to a deleted entry was cleared.",
                    previous=previous,
                )
            )


@router.delete(
    "/{project_id}/entries/{entry_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_entry(
    project_id: UUID,
    entry_id: UUID,
    note: str | None = Query(None, max_length=500),
    user: User = Depends(get_current_user),  # noqa: B008
    db: AsyncSession = Depends(get_db),  # noqa: B008
):
    """Delete an entry. Only the owner or the entry's own author may."""
    project = await _get_readable_project(project_id, user, db)
    entry = await _get_writable_entry(entry_id, project, user, db)

    if project.archived:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Cannot delete entries in an archived project.",
        )

    # Clean up any link fields in other entries that point to this one
    # before deleting, so we don't leave broken references behind.
    await _clear_broken_links(entry_id, user, db)

    # A tombstone, not a hard delete (US-3.10): the last version keeps what the
    # entry said, and reverting to an earlier one restores it.
    latest_revision = await _ensure_history(entry, db)
    entry.deleted_at = datetime.now(timezone.utc)
    db.add(
        _record_entry_revision(
            entry,
            user.id,
            revision=latest_revision + 1,
            action="deleted",
            note=note,
            previous=_entry_state(entry),
        )
    )
    await db.commit()



@router.get(
    "/{project_id}/entries/{entry_id}/links",
    response_model=list[EntryResponse],
)
async def get_entry_links(
    project_id: UUID,
    entry_id: UUID,
    user: User = Depends(get_current_user),  # noqa: B008
    db: AsyncSession = Depends(get_db),  # noqa: B008
):
    """Return all entries (across the user's logbook) that link to this entry.

    This enables the bidirectional-link requirement: when viewing entry A,
    the UI can show not only the entries A links to (forward links stored in
    A's data) but also the entries that link back to A (reverse links
    discovered by this endpoint).
    """
    await _get_readable_project(project_id, user, db)
    await _get_project_entry(entry_id, project_id, db)

    result = await db.execute(
        select(Entry)
        .join(Project, Entry.project_id == Project.id)
        .where(Project.user_id == user.id)
    )

    backlinks: list[Entry] = []
    for candidate in result.scalars().all():
        if candidate.id == entry_id:
            continue
        for value in candidate.data.values():
            if _is_link_to(value, entry_id):
                backlinks.append(candidate)
                break

    return backlinks


@router.get("/{project_id}/members", response_model=list[ProjectMemberResponse])
async def list_project_members(
    project_id: UUID,
    user: User = Depends(get_current_user),  # noqa: B008
    db: AsyncSession = Depends(get_db),  # noqa: B008
):
    """Who this project is shared with, and who has been asked.

    Readable by the owner and by anyone who has accepted. Pending and declined
    invitations are listed too: an owner who cannot see that an invitation is
    unanswered will send it again.
    """
    await _get_readable_project(project_id, user, db)

    result = await db.execute(
        select(ProjectMember)
        .join(User, ProjectMember.user_id == User.id)
        .where(ProjectMember.project_id == project_id)
        .order_by(User.full_name)
    )

    return [
        ProjectMemberResponse(
            user_id=membership.member.id,
            full_name=membership.member.full_name,
            email=membership.member.email,
            avatar_url=membership.member.avatar_url,
            status=membership.status,
            invited_at=membership.created_at,
        )
        for membership in result.scalars().all()
    ]


@router.post(
    "/{project_id}/members",
    response_model=ProjectMemberResponse,
    status_code=status.HTTP_201_CREATED,
)
async def share_project(
    project_id: UUID,
    data: ProjectShareRequest,
    user: User = Depends(get_current_user),  # noqa: B008
    db: AsyncSession = Depends(get_db),  # noqa: B008
):
    """Invite another Chronicles account to this project.

    An invitation, not a grant: nothing appears in the invitee's workspace and
    they can read nothing until they accept. Somebody else's project arriving
    in your sidebar unasked is a notification at best and an imposition at
    worst, and there was no way to give it back.

    Inviting is idempotent: re-inviting someone returns their existing
    invitation rather than failing, so a double submit cannot produce an error
    the person has no way to act on. Re-inviting somebody who declined asks
    again, which is the only reasonable reading of doing it deliberately.
    """
    project = await _get_user_project(project_id, user, db)

    email = data.email.strip().lower()
    if not email:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="An email address is required",
        )

    invitee = await db.scalar(select(User).where(func.lower(User.email) == email))
    if invitee is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No Chronicles account uses that email address",
        )

    if invitee.id == project.user_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You already own this project",
        )

    membership = await db.scalar(
        select(ProjectMember).where(
            ProjectMember.project_id == project_id,
            ProjectMember.user_id == invitee.id,
        )
    )

    if membership is None:
        membership = ProjectMember(
            project_id=project_id,
            user_id=invitee.id,
            status=MEMBERSHIP_PENDING,
            invited_by=user.id,
        )
        db.add(membership)
        await db.commit()
        await db.refresh(membership)
    elif membership.status == MEMBERSHIP_DECLINED:
        membership.status = MEMBERSHIP_PENDING
        membership.invited_by = user.id
        membership.responded_at = None
        await db.commit()
        await db.refresh(membership)

    return ProjectMemberResponse(
        user_id=invitee.id,
        full_name=invitee.full_name,
        email=invitee.email,
        avatar_url=invitee.avatar_url,
        status=membership.status,
        invited_at=membership.created_at,
    )


@router.delete(
    "/{project_id}/members/{member_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def unshare_project(
    project_id: UUID,
    member_id: UUID,
    user: User = Depends(get_current_user),  # noqa: B008
    db: AsyncSession = Depends(get_db),  # noqa: B008
):
    """Withdraw someone's access, or cancel an invitation they have not
    answered. Only the owner may do this."""
    await _get_user_project(project_id, user, db)

    await db.execute(
        delete(ProjectMember).where(
            ProjectMember.project_id == project_id,
            ProjectMember.user_id == member_id,
        )
    )
    await db.commit()

    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.delete("/{project_id}/membership", status_code=status.HTTP_204_NO_CONTENT)
async def leave_project(
    project_id: UUID,
    user: User = Depends(get_current_user),  # noqa: B008
    db: AsyncSession = Depends(get_db),  # noqa: B008
):
    """Step away from a project somebody shared with you.

    The entries you wrote stay where they are — they are part of that
    project's record, not of your access to it. Leaving only ends the access.
    """
    membership = await db.scalar(
        select(ProjectMember).where(
            ProjectMember.project_id == project_id,
            ProjectMember.user_id == user.id,
        )
    )

    if membership is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="You are not a member of this project",
        )

    await db.delete(membership)
    await db.commit()

    return Response(status_code=status.HTTP_204_NO_CONTENT)
