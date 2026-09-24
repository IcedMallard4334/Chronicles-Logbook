from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import delete, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm.attributes import flag_modified

from app.computed import apply_computed_fields
from app.database import get_db
from app.models import (
    MEMBERSHIP_ACCEPTED,
    MEMBERSHIP_DECLINED,
    MEMBERSHIP_PENDING,
    Entry,
    Project,
    ProjectMember,
    Task,
    User,
)
from app.routers.auth import get_current_user
from app.schema_migration import Simulation, simulate
from app.schemas import (
    EntryCreate,
    EntryResponse,
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

router = APIRouter(prefix="/projects", tags=["Projects"])

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
) -> None:
    """Validate entry field values against the project's entry_schema.

    ``known_project_ids`` is the set of project ids a reference field is
    allowed to name — the caller's own projects. It is optional because the
    import path validates a document before any of its projects exist; those
    references are checked once the ids are known.

    ``db`` and ``user`` enable checks that need the database — a link field
    (US-2.3) must name an entry that actually exists — and are omitted on
    paths that validate before a session is available.
    """
    schema_by_id = {field["id"]: field for field in entry_schema}

    for field in entry_schema:
        field_id = field["id"]
        if field_id not in data and field.get("type") not in _OPTIONAL_TYPES:
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

        if field_type == "text":
            if not isinstance(value, str):
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail=f"Field '{field_name}' must be text",
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
        elif field_type == "checklist":
            if not isinstance(value, list):
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail=f"Field '{field_name}' must be a list of checklist items",
                )
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
        elif field_type == "link":
            if value is not None and value != "":
                if not isinstance(value, str):
                    raise HTTPException(
                        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                        detail=f"Field '{field_name}' must be an entry id string",
                    )
                # Validate that the linked entry exists (if db and user provided)
                if db is not None and user is not None:
                    try:
                        target_id = UUID(value)
                    except ValueError:
                        # `from None` because the ValueError only says the string
                        # is not a UUID, which the detail already states.
                        raise HTTPException(
                            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                            detail=f"Field '{field_name}': invalid entry id",
                        ) from None
                    target = await db.get(Entry, target_id)
                    if target is None:
                        raise HTTPException(
                            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                            detail=f"Field '{field_name}': linked entry does not exist",
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
    await db.execute(delete(Entry).where(Entry.project_id == project_id))
    await db.execute(delete(ProjectMember).where(ProjectMember.project_id == project_id))
    await db.execute(delete(Project).where(Project.id == project_id))
    await db.commit()

    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.put("/{project_id}", response_model=ProjectResponse)
async def update_project(
    project_id: UUID,
    data: ProjectUpdate,
    user: User = Depends(get_current_user),  # noqa: B008
    db: AsyncSession = Depends(get_db),  # noqa: B008
):
    """Rename a project, change its description, or replace its schema.

    A schema replacement goes through the same migration as the dedicated
    schema endpoint, so there is no route by which a schema can change and
    leave the entries behind it in the old shape. What this endpoint cannot do
    is report what the migration did — for that, use ``PUT /schema``.
    """
    project = await _get_user_project(project_id, user, db)

    if data.name is not None:
        project.name = data.name
    if data.description is not None:
        project.description = data.description
    if data.entry_schema is not None:
        proposed = [field.model_dump(mode="json") for field in data.entry_schema]
        await _validate_reference_targets(proposed, user, db, self_id=project.id)
        await _replace_schema(
            project,
            proposed,
            user,
            db,
        )

    await db.commit()
    await db.refresh(project)
    return project


# ── Editing a live schema (US-2.6, US-2.7) ───────────────────────────────────


async def _project_entries(project_id: UUID, db: AsyncSession) -> list[Entry]:
    result = await db.execute(
        select(Entry).where(Entry.project_id == project_id).order_by(Entry.created_at.asc())
    )
    return list(result.scalars().all())


async def _plan_schema_change(
    project: Project,
    proposed_schema: list[dict[str, Any]],
    user: User,
    db: AsyncSession,
) -> tuple[Simulation, list[Entry]]:
    """Work out what replacing a project's schema would do to its entries."""
    entries = await _project_entries(project.id, db)
    known_project_ids = await _reference_scope(proposed_schema, user, db)
    return simulate(project, entries, proposed_schema, known_project_ids), entries


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
) -> Simulation:
    """Apply a new schema and bring every existing entry with it."""
    _guard_archived_schema_change(project, proposed_schema)

    simulation, _ = await _plan_schema_change(project, proposed_schema, user, db)

    new_version = project.schema_version + 1

    for migrated in simulation.entries:
        migrated.entry.data = migrated.data
        migrated.entry.retired_data = migrated.retired_data
        # An entry's schema_snapshot is what a later edit is validated
        # against (see update_entry) and what statistics reads a field's
        # type from — both have to agree with what data was just migrated
        # onto, or the entry disagrees with itself the moment anything
        # touches it again.
        migrated.entry.schema_version = new_version
        migrated.entry.schema_snapshot = proposed_schema

    project.schema_version = new_version

    project.entry_schema = proposed_schema
    project.retired_schema = simulation.retired_schema

    return simulation


@router.post("/{project_id}/schema/preview", response_model=SchemaChangePreview)
async def preview_schema_change(
    project_id: UUID,
    payload: SchemaChangeRequest,
    user: User = Depends(get_current_user),  # noqa: B008
    db: AsyncSession = Depends(get_db),  # noqa: B008
):
    """Report what changing a project's schema would do, changing nothing.

    Editing a schema that already has entries is the one action in the logbook
    that can alter data the user did not just type, so it is worth showing them
    first. The report is produced by running the real migration and discarding
    the result, which is why it cannot drift from what saving actually does.
    """
    project = await _get_user_project(project_id, user, db)

    proposed_schema = [field.model_dump(mode="json") for field in payload.entry_schema]
    await _validate_reference_targets(proposed_schema, user, db, self_id=project.id)
    simulation, entries = await _plan_schema_change(project, proposed_schema, user, db)

    return _as_preview(simulation, len(entries))


@router.put("/{project_id}/schema", response_model=SchemaChangeResult)
async def update_schema(
    project_id: UUID,
    payload: SchemaChangeRequest,
    user: User = Depends(get_current_user),  # noqa: B008
    db: AsyncSession = Depends(get_db),  # noqa: B008
):
    """Replace a project's schema and migrate its entries onto it.

    Returns the same report as the preview, so the caller can tell the user
    what happened rather than only that something did.
    """
    project = await _get_user_project(project_id, user, db)

    proposed_schema = [field.model_dump(mode="json") for field in payload.entry_schema]
    await _validate_reference_targets(proposed_schema, user, db, self_id=project.id)
    simulation = await _replace_schema(project, proposed_schema, user, db)
    entry_count = len(simulation.entries)

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
        existing = await db.get(Entry, data.id)
        if existing is not None:
            # The id is only ever compared against the project the caller was
            # just authorised for, so a collision with another user's entry
            # falls through to the 409 below and never discloses their data.
            if existing.project_id != project_id:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="An entry with this id already exists.",
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
    await _validate_entry_data(
        payload_data,
        project.entry_schema,
        await _reference_scope(project.entry_schema, user, db),
        db=db,
        user=user,
    )

    entry = Entry(
        project_id=project_id,
        data=apply_computed_fields(payload_data, project.entry_schema),
        schema_version=project.schema_version,
        schema_snapshot=[dict(field) for field in project.entry_schema],
        time_spent=data.time_spent,
        todo=data.todo,
        due_date=data.due_date,
        created_by=user.id,
    )

    # Preserve the caller's identity and capture time when supplied; the model
    # defaults cover the ordinary online path.
    if data.id is not None:
        entry.id = data.id
    if data.created_at is not None:
        entry.created_at = data.created_at

    db.add(entry)

    await db.commit()
    await db.refresh(entry)

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


async def _get_project_entry(
    entry_id: UUID,
    project_id: UUID,
    db: AsyncSession,
) -> Entry:
    """Resolve an entry within a project the caller has already been authorised for."""
    entry = await db.get(Entry, entry_id)

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


async def _get_writable_entry(
    entry_id: UUID,
    project: Project,
    user: User,
    db: AsyncSession,
) -> Entry:
    """An entry the caller may correct or remove.

    The owner may edit anything in their own project. A collaborator may edit
    what they themselves wrote — a contributor who cannot fix their own typo
    has to ask the owner to do it, and a contributor who can rewrite everyone
    else's entries is no longer a contributor to somebody's record.
    """
    entry = await _get_project_entry(entry_id, project.id, db)

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
    """Update an entry's values or the time spent on it.

    Entry data is validated against the project's *current* schema. A schema
    change already migrates every entry onto that shape the moment it is
    applied (see _replace_schema), so an edit that used anything else would
    immediately put this one entry out of step with the rest of the project.
    See "Editing an entry after the schema has changed" in the API docs.

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

    if payload.data is not None:
        entry_schema = project.entry_schema
        payload_data = _apply_project_references(payload.data, entry_schema)
        await _validate_entry_data(
            payload_data,
            entry_schema,
            await _reference_scope(entry_schema, user, db),
            db=db,
            user=user,
        )
        entry.data = apply_computed_fields(payload_data, entry_schema)

    # Checked against the fields actually sent rather than against None, so
    # that an explicit "time_spent": null clears a recorded duration while
    # omitting the field leaves it untouched.
    if "time_spent" in payload.model_fields_set:
        entry.time_spent = payload.time_spent

    # Same treatment for the outstanding-work fields: clearing a due date is
    # an explicit null, and ticking an outstanding entry off is todo=false.
    if "todo" in payload.model_fields_set and payload.todo is not None:
        entry.todo = payload.todo
    if "due_date" in payload.model_fields_set:
        entry.due_date = payload.due_date

    await db.commit()
    await db.refresh(entry)

    return entry


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
        changed = False
        for field_id, value in list(candidate.data.items()):
            if isinstance(value, str) and value == str(deleted_entry_id):
                candidate.data[field_id] = None
                changed = True
        if changed:
            # SQLAlchemy doesn't detect in-place JSON mutations, so we
            # explicitly flag the column as dirty.
            flag_modified(candidate, "data")


@router.delete(
    "/{project_id}/entries/{entry_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_entry(
    project_id: UUID,
    entry_id: UUID,
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

    await db.delete(entry)
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

    target_str = str(entry_id)

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
            if isinstance(value, str) and value == target_str:
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
