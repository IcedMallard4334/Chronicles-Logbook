"""Global entry search and filtering endpoints."""

from datetime import datetime
from typing import Any, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import Entry, Project, User
from app.routers.auth import get_current_user
from app.schemas import TimelineEntryResponse
from app.search import (
    SearchQueryError,
    conditions_match,
    keyword_matches,
    parse_conditions,
    relevance_key,
    validate_conditions_against_schema,
)

router = APIRouter(prefix="/entries", tags=["Entries"])


@router.get("", response_model=list[TimelineEntryResponse])
async def search_entries(
    q: str | None = None,
    project_id: UUID | None = None,
    tag: str | None = None,
    todo: bool | None = None,
    start: datetime | None = None,
    end: datetime | None = None,
    conditions: str | None = Query(
        None,
        description=(
            "JSON-encoded list of {field_id, operator, value, value2} "
            "objects — structured filters over the target project's custom "
            "fields (US-3.11). Requires project_id, since field ids are "
            "specific to one project's schema."
        ),
    ),
    match: Literal["all", "any"] = Query(
        "all", description="How conditions combine: all (AND) or any (OR)."
    ),
    sort: str = Query("newest", pattern="^(newest|oldest|due_date|relevance)$"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    user: User = Depends(get_current_user),  # noqa: B008
    db: AsyncSession = Depends(get_db),  # noqa: B008
):
    """Search across all entries and optionally filter by project or tag.

    The keyword is matched against each entry's field values and its project
    name. When *tag* is supplied, only entries whose tag-type fields contain
    that tag are returned. *conditions* narrows further to entries whose
    custom fields satisfy structured, type-aware comparisons (a number
    greater than X, a date before Y, a dropdown equal to Z, and so on),
    combined with *match*. ``todo=true`` narrows them to work that is still
    outstanding (US-2.15).

    Note: the keyword, tag and condition filters must run before pagination
    is applied, since they can only be matched in Python (against decoded
    JSON field values), not in the SQL query itself. Paginating first and
    filtering after would silently drop matches that fall outside the
    current page's raw (unfiltered) rows.
    """
    try:
        field_conditions = parse_conditions(conditions)
    except SearchQueryError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error

    if field_conditions and project_id is None:
        raise HTTPException(
            status_code=422,
            detail=(
                "Structured field conditions need a project, since a "
                "field's meaning is specific to one project's schema — "
                "pick a project before adding filters on its custom fields."
            ),
        )

    if field_conditions:
        project_schema = await db.scalar(
            select(Project.entry_schema).where(
                Project.id == project_id, Project.user_id == user.id
            )
        )
        if project_schema is None:
            raise HTTPException(status_code=404, detail="Project not found")
        try:
            validate_conditions_against_schema(field_conditions, project_schema or [])
        except SearchQueryError as error:
            raise HTTPException(status_code=422, detail=str(error)) from error

    stmt = (
        select(Entry, Project.name.label("project_name"))
        .join(Project, Entry.project_id == Project.id)
        .where(Project.user_id == user.id)
    )
    if project_id is not None:
        stmt = stmt.where(Entry.project_id == project_id)
    if todo is not None:
        stmt = stmt.where(Entry.todo == todo)

    if start is not None:
        stmt = stmt.where(Entry.created_at >= start)

    if end is not None:
        stmt = stmt.where(Entry.created_at <= end)

    if sort == "due_date":
        # Undated outstanding work sorts last: a deadline that exists is more
        # urgent than one that was never set, whatever its date.
        stmt = stmt.order_by(Entry.due_date.asc().nulls_last(), Entry.created_at.desc())
    elif sort == "oldest":
        stmt = stmt.order_by(Entry.created_at.asc(), Entry.id.asc())
    else:
        # "relevance" is ranked in Python below, once the matches are known;
        # this ordering is only its tiebreak / the plain fallback for "newest".
        stmt = stmt.order_by(Entry.created_at.desc(), Entry.id.desc())

    result = await db.execute(stmt)
    rows = result.all()

    query = q.strip().lower() if q else ""
    tag_filter = tag.strip() if tag else ""
    matched: list[dict[str, Any]] = []
    for entry, project_name in rows:
        keyword_ok, keyword_hits = keyword_matches(project_name, entry.data, query)
        if not keyword_ok:
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

        conditions_ok, condition_hits = conditions_match(
            entry.data, entry.schema_snapshot, field_conditions, match
        )
        if not conditions_ok:
            continue

        matched.append(
            {
                "id": entry.id,
                "project_id": entry.project_id,
                "project_name": project_name,
                "title": entry.title,
                "data": entry.data,
                "schema_snapshot": entry.schema_snapshot,
                "time_spent": entry.time_spent,
                "todo": entry.todo,
                "due_date": entry.due_date,
                "created_by": entry.created_by,
                "created_by_name": entry.created_by_name,
                "created_at": entry.created_at,
                "updated_at": entry.updated_at,
                "_relevance": relevance_key(condition_hits, keyword_hits, entry.created_at),
            }
        )

    if sort == "relevance":
        matched.sort(key=lambda row: row["_relevance"], reverse=True)
    for row in matched:
        row.pop("_relevance", None)

    offset = (page - 1) * page_size
    return matched[offset : offset + page_size]
