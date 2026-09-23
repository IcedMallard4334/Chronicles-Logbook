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
    tag: str | None = None,
    todo: bool | None = None,
    sort: str = Query("newest", pattern="^(newest|oldest|due_date)$"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    user: User = Depends(get_current_user),  # noqa: B008
    db: AsyncSession = Depends(get_db),  # noqa: B008
):
    """Search across all entries and optionally filter by project or tag.

    The keyword is matched against each entry's field values and its project
    name. When *tag* is supplied, only entries whose tag-type fields contain
    that tag are returned. Results are returned newest-first unless another
    ``sort`` is asked for; ``todo=true`` narrows them to work that is still
    outstanding (US-2.15).

    Note: the keyword and tag filters must run before pagination is applied,
    since they can only be matched in Python (against decoded JSON field
    values), not in the SQL query itself. Paginating first and filtering
    after would silently drop matches that fall outside the current page's
    raw (unfiltered) rows.
    """
    stmt = (
        select(Entry, Project.name.label("project_name"))
        .join(Project, Entry.project_id == Project.id)
        .where(Project.user_id == user.id)
    )
    if project_id is not None:
        stmt = stmt.where(Entry.project_id == project_id)
    if todo is not None:
        stmt = stmt.where(Entry.todo == todo)

    if sort == "due_date":
        # Undated outstanding work sorts last: a deadline that exists is more
        # urgent than one that was never set, whatever its date.
        stmt = stmt.order_by(Entry.due_date.asc().nulls_last(), Entry.created_at.desc())
    elif sort == "oldest":
        stmt = stmt.order_by(Entry.created_at.asc(), Entry.id.asc())
    else:
        stmt = stmt.order_by(Entry.created_at.desc(), Entry.id.desc())

    result = await db.execute(stmt)
    rows = result.all()

    query = q.strip().lower() if q else ""
    tag_filter = tag.strip() if tag else ""
    matched: list[dict[str, Any]] = []
    for entry, project_name in rows:
        if query:
            values = " ".join(str(value) for value in entry.data.values())
            searchable = f"{project_name} {values}".lower()
            if query not in searchable:
                continue
        # Tag filter: check if any tag-type field in this entry contains
        # the requested tag. This is a case-insensitive match.
        if tag_filter:
            entry_tags: list[str] = []
            for value in entry.data.values():
                if isinstance(value, list):
                    entry_tags.extend(
                        str(t).lower() for t in value if isinstance(t, str)
                    )
            if tag_filter.lower() not in entry_tags:
                continue
        matched.append(
            {
                "id": entry.id,
                "project_id": entry.project_id,
                "project_name": project_name,
                "data": entry.data,
                "schema_snapshot": entry.schema_snapshot or [],
                "time_spent": entry.time_spent,
                "todo": entry.todo,
                "due_date": entry.due_date,
                "created_at": entry.created_at,
                "updated_at": entry.updated_at,
            }
        )

    offset = (page - 1) * page_size
    return matched[offset : offset + page_size]