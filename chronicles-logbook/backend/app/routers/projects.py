from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import func, select
from sqlalchemy.orm.attributes import flag_modified
from sqlalchemy.ext.asyncio import AsyncSession

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


async def _validate_entry_data(
    data: dict[str, Any],
    entry_schema: list[dict[str, Any]],
    db: AsyncSession | None = None,
    user: User | None = None,
) -> None:
    """Validate entry field values against the project's entry_schema."""
    schema_by_id = {field["id"]: field for field in entry_schema}

    for field in entry_schema:
        field_id = field["id"]
        if field_id not in data:
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
                        raise HTTPException(
                            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                            detail=f"Field '{field_name}': invalid entry id",
                        )
                    target = await db.get(Entry, target_id)
                    if target is None:
                        raise HTTPException(
                            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                            detail=f"Field '{field_name}': linked entry does not exist",
                        )

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

    await _validate_entry_data(data.data, project.entry_schema, db=db, user=user)

    entry = Entry(
        project_id=project_id,
        data=data.data,
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
        await _validate_entry_data(payload.data, project.entry_schema, db=db, user=user)
        entry.data = payload.data

    # Checked against the fields actually sent rather than against None, so
    # that an explicit "time_spent": null clears a recorded duration while
    # omitting the field leaves it untouched.
    if "time_spent" in payload.model_fields_set:
        entry.time_spent = payload.time_spent

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
    project = await _get_user_project(project_id, user, db)
    entry = await _get_project_entry(entry_id, project_id, db)

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
    await _get_user_project(project_id, user, db)
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
