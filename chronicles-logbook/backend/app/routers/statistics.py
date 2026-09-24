"""Aggregate statistics over a user's projects and entries."""

from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import distinct, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import Entry, Project, User
from app.routers.auth import get_current_user
from app.schemas import (
    FieldStatistics,
    FieldStatisticsGroup,
    FieldStatisticsResponse,
    FieldTimelinePoint,
    FieldTimelineResponse,
    ProjectStatistics,
    StatisticsResponse,
    StatisticsTotals,
)

router = APIRouter(prefix="/statistics", tags=["Statistics"])


def _as_date(value: Any) -> date:
    """``func.date()`` comes back as a ``date`` on PostgreSQL and as an
    ISO string on SQLite; the streak arithmetic needs a real date either way."""
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    return date.fromisoformat(str(value)[:10])


def _streaks(days: set[date], today: date) -> tuple[int, int]:
    """(current, longest) runs of consecutive days in *days*.

    The current run is the one that reaches *today* or *yesterday*: a person
    who wrote yesterday and has not yet written today has not broken their
    streak. A run whose last day is earlier than that has ended and counts 0.

    Linear in the number of distinct days, which is bounded by the calendar
    rather than by how much was written, so this stays cheap however large
    the logbook grows.
    """
    if not days:
        return 0, 0

    longest = 0
    run = 0
    previous: date | None = None
    for day in sorted(days):
        run = run + 1 if previous is not None and day - previous == timedelta(days=1) else 1
        longest = max(longest, run)
        previous = day

    # ``run`` now holds the length of the final (most recent) run.
    alive = previous is not None and (today - previous) <= timedelta(days=1)
    return (run if alive else 0), longest


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

    # One more query for the streaks: the distinct (project, day) pairs. The
    # per-project aggregate above already collapses days, so the run lengths
    # cannot be recovered from it — a count of days says nothing about whether
    # they were consecutive.
    day_rows = await db.execute(
        select(Entry.project_id, func.date(Entry.created_at).label("day"))
        .join(Project, Entry.project_id == Project.id)
        .where(Project.user_id == user.id)
        .distinct()
    )
    days_by_project: dict[UUID, set[date]] = defaultdict(set)
    all_days: set[date] = set()
    for row in day_rows.all():
        day = _as_date(row.day)
        days_by_project[row.project_id].add(day)
        all_days.add(day)

    today = datetime.now(timezone.utc).date()

    projects = []
    for row in per_project.all():
        current, longest = _streaks(days_by_project.get(row.id, set()), today)
        projects.append(
            ProjectStatistics(
                project_id=row.id,
                name=row.name,
                archived=row.archived,
                entries=row.entries,
                time_spent=int(row.time_spent or 0),
                active_days=row.active_days,
                current_streak=current,
                longest_streak=longest,
                first_entry_at=row.first_entry_at,
                last_entry_at=row.last_entry_at,
            )
        )

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

    overall_current, overall_longest = _streaks(all_days, today)

    return StatisticsResponse(
        totals=StatisticsTotals(
            projects=len(projects),
            active_projects=sum(1 for project in projects if not project.archived),
            archived_projects=sum(1 for project in projects if project.archived),
            entries=overall.entries,
            time_spent=int(overall.time_spent or 0),
            active_days=overall.active_days,
            current_streak=overall_current,
            longest_streak=overall_longest,
            first_entry_at=overall.first_entry_at,
            last_entry_at=overall.last_entry_at,
        ),
        projects=projects,
    )

@router.get("/projects/{project_id}/fields", response_model=FieldStatisticsResponse)
async def read_field_statistics(
    project_id: UUID,
    user: User = Depends(get_current_user),  # noqa: B008
    db: AsyncSession = Depends(get_db),  # noqa: B008
):
    """Return dynamic statistics for every field in a project.

    Field definitions are read from each entry's schema_snapshot so that
    historical entries remain interpretable after the project schema changes.
    """
    project = await db.scalar(
        select(Project).where(
            Project.id == project_id,
            Project.user_id == user.id,
        )
    )

    if project is None:
        raise HTTPException(
            status_code=404,
            detail="Project not found",
        )

    result = await db.execute(
        select(Entry)
        .where(Entry.project_id == project_id)
        .order_by(Entry.created_at.asc(), Entry.id.asc())
    )
    entries = result.scalars().all()

    # Start with the current schema so the current field names/types are
    # preferred when a field has existed across multiple schema versions.
    field_definitions: dict[str, dict[str, Any]] = {
        field["id"]: field for field in project.entry_schema
    }

    # Add fields that only existed in historical schema versions.
    for entry in entries:
        for field in entry.schema_snapshot:
            field_definitions.setdefault(field["id"], field)

    field_values: dict[str, list[tuple[Any, str]]] = {
        field_id: [] for field_id in field_definitions
    }

    for entry in entries:
        schema_by_id = {
            field["id"]: field for field in entry.schema_snapshot
        }

        for field_id, value in entry.data.items():
            field = schema_by_id.get(field_id)
            if field is None or value is None:
                continue

            field_values.setdefault(field_id, []).append(
                (value, field.get("type", "text"))
            )

    fields: list[FieldStatistics] = []

    for field_id, field in field_definitions.items():
        values = field_values.get(field_id, [])
        field_type = field.get("type", "text")

        if field_type == "number":
            numeric_values = [
                value
                for value, value_type in values
                if value_type == "number"
                and isinstance(value, (int, float))
                and not isinstance(value, bool)
            ]

            total = sum(numeric_values) if numeric_values else None
            average = (
                total / len(numeric_values)
                if numeric_values
                else None
            )

            fields.append(
                FieldStatistics(
                    field_id=field_id,
                    name=field.get("name", field_id),
                    type=field_type,
                    count=len(numeric_values),
                    total=total,
                    average=average,
                )
            )
            continue

        groups: dict[str, FieldStatisticsGroup] = {}
        group_order: list[str] = []

        for value, value_type in values:
            if value_type != field_type:
                continue

            key = repr(value)

            if key not in groups:
                groups[key] = FieldStatisticsGroup(
                    value=value,
                    count=0,
                )
                group_order.append(key)

            groups[key].count += 1

        fields.append(
            FieldStatistics(
                field_id=field_id,
                name=field.get("name", field_id),
                type=field_type,
                count=sum(group.count for group in groups.values()),
                groups=[groups[key] for key in group_order],
            )
        )

    return FieldStatisticsResponse(
        project_id=project.id,
        schema_version=project.schema_version,
        fields=fields,
    )
    
@router.get(
    "/projects/{project_id}/fields/{field_id}/timeline",
    response_model=FieldTimelineResponse,
)
async def read_field_timeline(
    project_id: UUID,
    field_id: str,
    start: datetime | None = None,
    end: datetime | None = None,
    user: User = Depends(get_current_user),  # noqa: B008
    db: AsyncSession = Depends(get_db),  # noqa: B008
):
    """Return a field's values over time.

    Each entry is interpreted using its own schema_snapshot so that
    historical entries remain valid after the project schema changes.
    """
    project = await db.scalar(
        select(Project).where(
            Project.id == project_id,
            Project.user_id == user.id,
        )
    )

    if project is None:
        raise HTTPException(
            status_code=404,
            detail="Project not found",
        )

    result = await db.execute(
        select(Entry)
        .where(
            Entry.project_id == project_id,
            Entry.created_at >= start if start is not None else True,
            Entry.created_at <= end if end is not None else True,
        )
        .order_by(Entry.created_at.asc(), Entry.id.asc())
    )
    entries = result.scalars().all()

    field_definition = None

    # Prefer the current schema definition when the field still exists.
    for field in project.entry_schema:
        if field["id"] == field_id:
            field_definition = field
            break

    # Otherwise find the field in historical schemas.
    if field_definition is None:
        for entry in entries:
            for field in entry.schema_snapshot:
                if field["id"] == field_id:
                    field_definition = field
                    break
            if field_definition is not None:
                break

    if field_definition is None:
        raise HTTPException(
            status_code=404,
            detail="Field not found",
        )

    points: list[FieldTimelinePoint] = []

    for entry in entries:
        schema_by_id = {
            field["id"]: field for field in entry.schema_snapshot
        }

        historical_field = schema_by_id.get(field_id)

        if historical_field is None:
            continue

        if field_id not in entry.data:
            continue

        value = entry.data[field_id]

        if value is None:
            continue

        # Only include the value when its historical field type matches
        # the selected field's current/historical definition.
        if historical_field.get("type") != field_definition.get("type"):
            continue

        points.append(
            FieldTimelinePoint(
                entry_id=entry.id,
                created_at=entry.created_at,
                value=value,
                schema_version=entry.schema_version,
            )
        )

    return FieldTimelineResponse(
        project_id=project.id,
        field_id=field_id,
        field_name=field_definition.get("name", field_id),
        field_type=field_definition.get("type", "text"),
        start=start,
        end=end,
        points=points,
    )

