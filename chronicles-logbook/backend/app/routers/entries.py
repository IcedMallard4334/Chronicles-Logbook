"""Global entry search and filtering endpoints."""

from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import Entry, Project, User
from app.routers.auth import get_current_user
from app.schemas import TimelineEntryResponse

router = APIRouter(prefix="/entries", tags=["Entries"])


@router.get("", response_model=list[TimelineEntryResponse])
async def search_entries(
    q: str | None = None,
    project_id: UUID | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    user: User = Depends(get_current_user),  # noqa: B008
    db: AsyncSession = Depends(get_db),  # noqa: B008
):
    """Search across all entries and optionally filter by project.

    The keyword is matched against each entry's field values and its project
    name. Results are returned newest-first.
    """
    offset = (page - 1) * page_size
    stmt = (
        select(Entry, Project.name.label("project_name"))
        .join(Project, Entry.project_id == Project.id)
        .where(Project.user_id == user.id)
        .order_by(Entry.created_at.desc(), Entry.id.desc())
        .offset(offset)
        .limit(page_size)
    )
    if project_id is not None:
        stmt = stmt.where(Entry.project_id == project_id)

    result = await db.execute(stmt)
    rows = result.all()

    filtered: list[dict[str, Any]] = []
    query = q.strip() if q else ""
    for entry, project_name in rows:
        if query:
            values = " ".join(str(value) for value in entry.data.values())
            searchable = f"{project_name} {values}".lower()
            if query.lower() not in searchable:
                continue
        filtered.append(
            {
                "id": entry.id,
                "project_id": entry.project_id,
                "project_name": project_name,
                "data": entry.data,
                "created_at": entry.created_at,
                "updated_at": entry.updated_at,
            }
        )

    return filtered
