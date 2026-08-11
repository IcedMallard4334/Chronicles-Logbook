from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import Entry, Project
from app.schemas import (
    EntryCreate,
    EntryResponse,
    ProjectCreate,
    ProjectResponse,
    ProjectUpdate,
)

router = APIRouter(prefix="/projects", tags=["Projects"])


def _validate_entry_data(data: dict[str, Any], entry_schema: list[dict[str, Any]]) -> None:
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


@router.post("", response_model=ProjectResponse, status_code=status.HTTP_201_CREATED)
async def create_project(
    data: ProjectCreate,
    db: AsyncSession = Depends(get_db),  # noqa: B008
):
    project = Project(
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
    db: AsyncSession = Depends(get_db),  # noqa: B008
):
    project = await db.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


@router.put("/{project_id}", response_model=ProjectResponse)
async def update_project(
    project_id: UUID,
    data: ProjectUpdate,
    db: AsyncSession = Depends(get_db),  # noqa: B008
):
    project = await db.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    if data.name is not None:
        project.name = data.name
    if data.description is not None:
        project.description = data.description
    if data.entry_schema is not None:
        project.entry_schema = [field.model_dump(mode="json") for field in data.entry_schema]

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
    db: AsyncSession = Depends(get_db),  # noqa: B008
):
    project = await db.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    _validate_entry_data(data.data, project.entry_schema)

    entry = Entry(project_id=project_id, data=data.data)
    db.add(entry)
    await db.commit()
    await db.refresh(entry)
    return entry


@router.get("/{project_id}/entries", response_model=list[EntryResponse])
async def list_entries(
    project_id: UUID,
    db: AsyncSession = Depends(get_db),  # noqa: B008
):
    project = await db.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    result = await db.execute(select(Entry).where(Entry.project_id == project_id))
    entries = result.scalars().all()
    return entries
