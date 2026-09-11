"""Aggregate statistics over a user's projects and entries."""

from fastapi import APIRouter, Depends
from sqlalchemy import distinct, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import Entry, Project, User
from app.routers.auth import get_current_user
from app.schemas import ProjectStatistics, StatisticsResponse, StatisticsTotals

router = APIRouter(prefix="/statistics", tags=["Statistics"])


@router.get("", response_model=StatisticsResponse)
async def read_statistics(
    user: User = Depends(get_current_user),  # noqa: B008
    db: AsyncSession = Depends(get_db),  # noqa: B008
):
    """Return activity totals for the logbook and a per-project breakdown.

    Everything is aggregated in SQL rather than by loading entries into
    Python, so the cost does not grow with the size of the logbook.

    Two queries are needed rather than one: overall ``active_days`` counts
    distinct calendar dates across every project, which cannot be derived
    from the per-project counts without double-counting a day that saw work
    on more than one project.

    ``active_days`` resolves dates using the database's timezone, not the
    user's. At this scale that is an acceptable approximation; a per-user
    timezone would need the offset stored on the user record.
    """
    per_project = await db.execute(
        select(
            Project.id,
            Project.name,
            Project.archived,
            func.count(Entry.id).label("entries"),
            func.coalesce(func.sum(Entry.time_spent), 0).label("time_spent"),
            func.count(distinct(func.date(Entry.created_at))).label("active_days"),
            func.min(Entry.created_at).label("first_entry_at"),
            func.max(Entry.created_at).label("last_entry_at"),
        )
        .outerjoin(Entry, Project.id == Entry.project_id)
        .where(Project.user_id == user.id)
        .group_by(Project.id, Project.name, Project.archived, Project.created_at)
        .order_by(Project.created_at.desc())
    )

    projects = [
        ProjectStatistics(
            project_id=row.id,
            name=row.name,
            archived=row.archived,
            entries=row.entries,
            time_spent=int(row.time_spent or 0),
            active_days=row.active_days,
            first_entry_at=row.first_entry_at,
            last_entry_at=row.last_entry_at,
        )
        for row in per_project.all()
    ]

    overall = (
        await db.execute(
            select(
                func.count(Entry.id).label("entries"),
                func.coalesce(func.sum(Entry.time_spent), 0).label("time_spent"),
                func.count(distinct(func.date(Entry.created_at))).label("active_days"),
                func.min(Entry.created_at).label("first_entry_at"),
                func.max(Entry.created_at).label("last_entry_at"),
            )
            .select_from(Entry)
            .join(Project, Entry.project_id == Project.id)
            .where(Project.user_id == user.id)
        )
    ).one()

    return StatisticsResponse(
        totals=StatisticsTotals(
            projects=len(projects),
            active_projects=sum(1 for project in projects if not project.archived),
            archived_projects=sum(1 for project in projects if project.archived),
            entries=overall.entries,
            time_spent=int(overall.time_spent or 0),
            active_days=overall.active_days,
            first_entry_at=overall.first_entry_at,
            last_entry_at=overall.last_entry_at,
        ),
        projects=projects,
    )
