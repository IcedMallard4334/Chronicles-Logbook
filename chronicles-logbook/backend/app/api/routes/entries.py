"""
Base entry routes, nested under a project.

Skeleton only. Story owners extend this file:
  - Ethan (US12/US13): quick-capture logic and pre-filling `data` from
    the project's schema_definition happens in create_entry below.
  - Victor (US16/US17, later in this same sprint): the time-tracking field
    already exists on the model (time_spent_minutes) — the aggregation
    endpoint (GET /projects/:id/time-total) gets added here.
"""
import uuid

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.errors import NotFoundError
from app.models.entry import Entry
from app.models.project import Project
from app.schemas.common import DataResponse
from app.schemas.entry import EntryCreate, EntryRead

router = APIRouter(prefix="/projects/{project_id}/entries", tags=["entries"])


async def _get_project_or_404(project_id: uuid.UUID, db: AsyncSession) -> Project:
    result = await db.execute(select(Project).where(Project.id == project_id))
    project = result.scalar_one_or_none()
    if project is None:
        raise NotFoundError("Project not found")
    return project


@router.post("", response_model=DataResponse[EntryRead], status_code=201)
async def create_entry(
    project_id: uuid.UUID, payload: EntryCreate, db: AsyncSession = Depends(get_db)
) -> DataResponse[EntryRead]:
    await _get_project_or_404(project_id, db)

    # NOTE: `payload.data` is not yet validated against the project's
    # schema_definition — that's Athalia's schema-validation logic to add
    # once US10 lands. For now this just proves the DB round-trip works.
    entry = Entry(
        project_id=project_id,
        data=payload.data,
        time_spent_minutes=payload.time_spent_minutes,
    )
    db.add(entry)
    await db.commit()
    await db.refresh(entry)
    return DataResponse(data=EntryRead.model_validate(entry))


@router.get("", response_model=DataResponse[list[EntryRead]])
async def list_entries(project_id: uuid.UUID, db: AsyncSession = Depends(get_db)) -> DataResponse[list[EntryRead]]:
    await _get_project_or_404(project_id, db)
    result = await db.execute(
        select(Entry).where(Entry.project_id == project_id).order_by(Entry.created_at.desc())
    )
    entries = result.scalars().all()
    return DataResponse(data=[EntryRead.model_validate(e) for e in entries])
