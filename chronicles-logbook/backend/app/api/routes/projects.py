"""
Base project routes.

This is the routing skeleton only — enough for the DB connection to be
proven end-to-end and for other stories to have real endpoints to build
against from day one. Story owners extend this file:

  - Nkosilathi (US14): the create-project form + GET /projects list fetch
    already have somewhere to point. US15 adds PATCH /projects/:id/archive.
  - Athalia (US10/US11): adds POST /projects/:id/schema and the logic that
    scopes schema_definition correctly, and validates it on read.

Nothing here does permission checks yet (e.g. "is this project's owner_id
the logged-in user?") because that depends on Ethan's auth/session work
landing first — flagged with a TODO rather than silently skipped.
"""
import uuid

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.errors import NotFoundError
from app.models.project import Project
from app.schemas.common import DataResponse
from app.schemas.project import ProjectCreate, ProjectRead

router = APIRouter(prefix="/projects", tags=["projects"])


@router.post("", response_model=DataResponse[ProjectRead], status_code=201)
async def create_project(payload: ProjectCreate, db: AsyncSession = Depends(get_db)) -> DataResponse[ProjectRead]:
    # TODO(Ethan, US4): once auth lands, owner_id should come from the
    # authenticated session, not a placeholder.
    placeholder_owner_id = uuid.UUID(int=0)

    project = Project(
        name=payload.name,
        description=payload.description,
        owner_id=placeholder_owner_id,
    )
    db.add(project)
    await db.commit()
    await db.refresh(project)
    return DataResponse(data=ProjectRead.model_validate(project))


@router.get("", response_model=DataResponse[list[ProjectRead]])
async def list_projects(db: AsyncSession = Depends(get_db)) -> DataResponse[list[ProjectRead]]:
    result = await db.execute(
        select(Project).where(Project.is_archived.is_(False)).order_by(Project.created_at.desc())
    )
    projects = result.scalars().all()
    return DataResponse(data=[ProjectRead.model_validate(p) for p in projects])


@router.get("/{project_id}", response_model=DataResponse[ProjectRead])
async def get_project(project_id: uuid.UUID, db: AsyncSession = Depends(get_db)) -> DataResponse[ProjectRead]:
    result = await db.execute(select(Project).where(Project.id == project_id))
    project = result.scalar_one_or_none()
    if project is None:
        raise NotFoundError("Project not found")
    return DataResponse(data=ProjectRead.model_validate(project))
