from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.computed import apply_computed_fields
from app.database import get_db
from app.models import Entry, Project, User
from app.routers.auth import get_current_user
from app.schemas import (
    EntryCreate,
    EntryResponse,
    EntryUpdate,
    ProjectCreate,
    ProjectResponse,
    ProjectUpdate,
)

router = APIRouter(prefix="/projects", tags=["Projects"])

# Field types the caller need not fill in: a computed field is derived by the
# server (US-2.5), and a reference may legitimately be left blank (US-2.4) so
# that adding one to a live schema does not invalidate every existing entry.
_OPTIONAL_TYPES = frozenset({"computed", "project_reference"})


def _validate_entry_data(
    data: dict[str, Any],
    entry_schema: list[dict[str, Any]],
    known_project_ids: set[str] | None = None,
) -> None:
    """Validate entry field values against the project's entry_schema.

    ``known_project_ids`` is the set of project ids a reference field is
    allowed to name — the caller's own projects. It is optional because the
    import path validates a document before any of its projects exist; those
    references are checked once the ids are known.
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


async def _user_project_ids(user: User, db: AsyncSession) -> set[str]:
    """Ids of every project the caller owns, as canonical strings."""
    result = await db.scalars(select(Project.id).where(Project.user_id == user.id))
    return {str(project_id) for project_id in result}


async def _reference_scope(
    entry_schema: list[dict[str, Any]],
    user: User,
    db: AsyncSession,
) -> set[str] | None:
    """The project ids a schema's references may name, or ``None`` if it has none.

    Returning ``None`` for the ordinary schema keeps the extra query off every
    entry write that has nothing to reference.
    """
    if not any(field.get("type") == "project_reference" for field in entry_schema):
        return None
    return await _user_project_ids(user, db)


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

@router.get("", response_model=list[ProjectResponse])
async def list_projects(
    user: User = Depends(get_current_user),  # noqa: B008
    db: AsyncSession = Depends(get_db),  # noqa: B008
):
    result = await db.execute(
        select(Project, func.coalesce(func.sum(Entry.time_spent), 0).label("total_time"))
        .outerjoin(Entry, Project.id == Entry.project_id)
        .where(Project.user_id == user.id)
        .group_by(Project.id)
        .order_by(Project.created_at.desc())
    )

    return [
        {
            **ProjectResponse.model_validate(project).model_dump(),
            "total_time_spent": int(total_time or 0),
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
    )
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
    project = await _get_user_project(project_id, user, db)
    total_time = await db.scalar(
        select(func.coalesce(func.sum(Entry.time_spent), 0)).where(
            Entry.project_id == project_id
        )
    )
    return {
        **ProjectResponse.model_validate(project).model_dump(),
        "total_time_spent": int(total_time or 0),
    }


@router.put("/{project_id}", response_model=ProjectResponse)
async def update_project(
    project_id: UUID,
    data: ProjectUpdate,
    user: User = Depends(get_current_user),  # noqa: B008
    db: AsyncSession = Depends(get_db),  # noqa: B008
):
    project = await _get_user_project(project_id, user, db)

    if data.name is not None:
        project.name = data.name
    if data.description is not None:
        project.description = data.description
    if data.entry_schema is not None:
        project.entry_schema = [
            field.model_dump(mode="json") for field in data.entry_schema
        ]

    await db.commit()
    await db.refresh(project)
    return project


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
    project = await _get_user_project(project_id, user, db)

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

    _validate_entry_data(
        data.data,
        project.entry_schema,
        await _reference_scope(project.entry_schema, user, db),
    )

    entry = Entry(
        project_id=project_id,
        # Derived last, and from the values that passed validation, so a stale
        # or hand-crafted payload cannot put a figure in a computed field.
        data=apply_computed_fields(data.data, project.entry_schema),
        time_spent=data.time_spent,
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
    await _get_user_project(project_id, user, db)

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
    await _get_user_project(project_id, user, db)

    return await _get_project_entry(entry_id, project_id, db)


@router.put("/{project_id}/entries/{entry_id}", response_model=EntryResponse)
async def update_entry(
    project_id: UUID,
    entry_id: UUID,
    payload: EntryUpdate,
    user: User = Depends(get_current_user),  # noqa: B008
    db: AsyncSession = Depends(get_db),  # noqa: B008
):
    """Update an entry's values or the time spent on it.

    ``data`` is revalidated against the project's *current* schema, exactly
    as it is on create. If the schema has changed since the entry was
    written, the update must satisfy the new shape.
    """
    project = await _get_user_project(project_id, user, db)
    entry = await _get_project_entry(entry_id, project_id, db)

    if project.archived:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Cannot edit entries in an archived project.",
        )

    if payload.data is not None:
        _validate_entry_data(
            payload.data,
            project.entry_schema,
            await _reference_scope(project.entry_schema, user, db),
        )
        entry.data = apply_computed_fields(payload.data, project.entry_schema)

    # Checked against the fields actually sent rather than against None, so
    # that an explicit "time_spent": null clears a recorded duration while
    # omitting the field leaves it untouched.
    if "time_spent" in payload.model_fields_set:
        entry.time_spent = payload.time_spent

    await db.commit()
    await db.refresh(entry)

    return entry


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
    project = await _get_user_project(project_id, user, db)
    entry = await _get_project_entry(entry_id, project_id, db)

    if project.archived:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Cannot delete entries in an archived project.",
        )

    await db.delete(entry)
    await db.commit()
