"""Aggregate statistics over a user's projects and entries."""

import calendar
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import distinct, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.custom_statistics import (
    StatisticError,
    describe_expression,
    display_expression,
    evaluate_statistic,
    validate_statistic,
)
from app.database import get_db
from app.models import Entry, Project, SavedStatistic, StatisticsLayout, Task, User
from app.routers.auth import get_current_user
from app.schemas import (
    CustomStatisticPreviewRequest,
    CustomStatisticPreviewResponse,
    FieldStatistics,
    FieldStatisticsGroup,
    FieldStatisticsResponse,
    FieldTimelinePoint,
    FieldTimelineResponse,
    ProjectStatistics,
    SavedStatisticCreate,
    SavedStatisticResponse,
    SavedStatisticUpdate,
    StatisticsActivityResponse,
    StatisticsActivityWeek,
    StatisticsLayoutPanel,
    StatisticsResponse,
    StatisticsTotals,
)

router = APIRouter(prefix="/statistics", tags=["Statistics"])

# The Statistics page panels in the order a fresh account sees them. "trend"
# is the field-over-time chart, which needs a project and a field picked
# before it can say anything, so it starts hidden (US-3.7).
DEFAULT_LAYOUT_PANELS: list[dict[str, Any]] = [
    {"id": "cards", "visible": True},
    {"id": "time", "visible": True},
    {"id": "activity", "visible": True},
    {"id": "custom", "visible": True},
    {"id": "fields", "visible": True},
    {"id": "trend", "visible": False},
]

LAYOUT_PANEL_IDS = frozenset(panel["id"] for panel in DEFAULT_LAYOUT_PANELS)


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

    open_tasks = (
        await db.execute(
            select(func.count(Task.id))
            .join(Project, Task.project_id == Project.id)
            .where(Project.user_id == user.id, Task.completed.is_(False))
        )
    ).scalar_one()

    return StatisticsResponse(
        totals=StatisticsTotals(
            projects=len(projects),
            active_projects=sum(1 for project in projects if not project.archived),
            archived_projects=sum(1 for project in projects if project.archived),
            entries=overall.entries,
            time_spent=int(overall.time_spent or 0),
            active_days=overall.active_days,
            open_tasks=open_tasks,
            current_streak=overall_current,
            longest_streak=overall_longest,
            first_entry_at=overall.first_entry_at,
            last_entry_at=overall.last_entry_at,
        ),
        projects=projects,
    )

@router.get("/activity", response_model=StatisticsActivityResponse)
async def read_statistics_activity(
    weeks: int = Query(12, ge=1, le=52),
    user: User = Depends(get_current_user),  # noqa: B008
    db: AsyncSession = Depends(get_db),  # noqa: B008
):
    """Return the user's entries grouped by week for the last *weeks* weeks.

    Days are counted in SQL exactly as ``read_statistics`` counts them and
    folded into weeks in Python: per-day totals are what SQL is good at,
    while week boundaries are calendar arithmetic that would otherwise need
    dialect-specific date functions. Weeks with nothing logged are filled in
    so a chart of the series has no gaps, and the window always ends with the
    week containing today — ``weeks=1`` is the current week, not a sliding
    seven days.

    ``busiest_weekday`` covers the same window and is the weekday with the
    most entries, so it agrees with the chart beside it.
    """
    today = datetime.now(timezone.utc).date()
    window_start = today - timedelta(days=today.weekday(), weeks=weeks - 1)
    window_start_at = datetime.combine(
        window_start, datetime.min.time(), tzinfo=timezone.utc
    )

    rows = await db.execute(
        select(
            func.date(Entry.created_at).label("day"),
            func.count(Entry.id).label("entries"),
            func.coalesce(func.sum(Entry.time_spent), 0).label("time_spent"),
        )
        .join(Project, Entry.project_id == Project.id)
        .where(Project.user_id == user.id, Entry.created_at >= window_start_at)
        .group_by(func.date(Entry.created_at))
    )

    by_week: dict[date, dict[str, int]] = {}
    weekday_entries = [0] * 7
    for row in rows.all():
        day = _as_date(row.day)
        if day < window_start or day > today:
            # The where-clause above compares timestamps, not days, so a row
            # dated after today still reaches this loop; it belongs to no
            # week being charted.
            continue
        week_start = day - timedelta(days=day.weekday())
        bucket = by_week.setdefault(week_start, {"entries": 0, "time_spent": 0})
        bucket["entries"] += row.entries
        bucket["time_spent"] += int(row.time_spent or 0)
        weekday_entries[day.weekday()] += row.entries

    weeks_out: list[StatisticsActivityWeek] = []
    for index in range(weeks):
        week_start = window_start + timedelta(weeks=index)
        bucket = by_week.get(week_start)
        weeks_out.append(
            StatisticsActivityWeek(
                week_start=week_start,
                entries=bucket["entries"] if bucket else 0,
                time_spent=bucket["time_spent"] if bucket else 0,
            )
        )

    busiest_weekday = None
    if any(weekday_entries):
        # Ties go to the earlier weekday: `index` finds the first count that
        # equals the maximum.
        busiest_weekday = calendar.day_name[weekday_entries.index(max(weekday_entries))]

    return StatisticsActivityResponse(weeks=weeks_out, busiest_weekday=busiest_weekday)

@router.get("/layout", response_model=list[StatisticsLayoutPanel])
async def read_statistics_layout(
    user: User = Depends(get_current_user),  # noqa: B008
    db: AsyncSession = Depends(get_db),  # noqa: B008
):
    """Return the caller's saved Statistics page layout.

    Someone who has never customised the page has no row, and gets the
    default arrangement rather than an empty page.
    """
    layout = await db.scalar(
        select(StatisticsLayout).where(StatisticsLayout.user_id == user.id)
    )

    panels = layout.panels if layout is not None else DEFAULT_LAYOUT_PANELS
    return [StatisticsLayoutPanel(**panel) for panel in panels]

@router.put("/layout", response_model=list[StatisticsLayoutPanel])
async def save_statistics_layout(
    panels: list[dict[str, Any]],
    user: User = Depends(get_current_user),  # noqa: B008
    db: AsyncSession = Depends(get_db),  # noqa: B008
):
    """Save the caller's Statistics page layout: which panels, in which order.

    The checks live here rather than in a request schema so a mistake earns a
    plain-language 400 naming the panel, rather than a validation error about
    types the caller never wrote.
    """
    seen: set[str] = set()
    for panel in panels:
        panel_id = panel.get("id")
        if panel_id not in LAYOUT_PANEL_IDS:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"'{panel_id}' is not a Statistics panel. The panels are: "
                    f"{', '.join(sorted(LAYOUT_PANEL_IDS))}."
                ),
            )
        if panel_id in seen:
            raise HTTPException(
                status_code=400,
                detail=f"'{panel_id}' appears more than once in the layout.",
            )
        if not isinstance(panel.get("visible"), bool):
            raise HTTPException(
                status_code=400,
                detail=f"'{panel_id}' needs 'visible' set to true or false.",
            )
        seen.add(panel_id)

    layout = await db.scalar(
        select(StatisticsLayout).where(StatisticsLayout.user_id == user.id)
    )

    if layout is None:
        db.add(StatisticsLayout(user_id=user.id, panels=panels))
    else:
        layout.panels = panels

    await db.commit()

    return [StatisticsLayoutPanel(**panel) for panel in panels]

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

    if start is not None and end is not None and start > end:
        raise HTTPException(status_code=422, detail="Start date must be on or before end date.")

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

    # A removed field is still a meaningful historical series. Looking in the
    # retired schema before the range-limited entry scan also means an empty
    # range returns an empty series instead of claiming the valid field never
    # existed.
    if field_definition is None:
        for field in project.retired_schema:
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


# ── Saved statistics (US-3.8) ───────────────────────────────────────────


async def _owned_project(project_id: UUID, user: User, db: AsyncSession) -> Project:
    """The caller's own project, or a 404 that doesn't reveal whose it is."""
    project = await db.scalar(
        select(Project).where(Project.id == project_id, Project.user_id == user.id)
    )
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


async def _project_entries(db: AsyncSession, project_id: UUID) -> list[Entry]:
    result = await db.execute(select(Entry).where(Entry.project_id == project_id))
    return result.scalars().all()


def _statistic_response(
    statistic: SavedStatistic, project: Project, entries: list[Entry]
) -> SavedStatisticResponse:
    """A saved statistic with its current value.

    A schema change since the stat was saved can leave its formula reading a
    field that no longer exists. The stat still belongs on the page — the
    person should see it, with the reason it cannot produce a number, and
    decide whether to edit or delete it — so the message becomes the note
    rather than a failed request.
    """
    try:
        result = evaluate_statistic(
            statistic.expression, project.entry_schema, entries, project.name
        )
        value, entries_used, note = result.value, result.entries_used, result.note
    except StatisticError as error:
        value, entries_used, note = None, 0, str(error)

    return SavedStatisticResponse(
        id=statistic.id,
        project_id=statistic.project_id,
        project_name=project.name,
        name=statistic.name,
        expression=display_expression(statistic.expression, project.entry_schema),
        description=describe_expression(statistic.expression, project.entry_schema),
        value=value,
        entries_used=entries_used,
        note=note,
        created_at=statistic.created_at,
        updated_at=statistic.updated_at,
    )


@router.get("/custom", response_model=list[SavedStatisticResponse])
async def list_custom_statistics(
    user: User = Depends(get_current_user),  # noqa: B008
    db: AsyncSession = Depends(get_db),  # noqa: B008
):
    """Return the caller's saved statistics, each with its current value."""
    statistics = (
        (
            await db.execute(
                select(SavedStatistic)
                .join(Project, SavedStatistic.project_id == Project.id)
                .where(SavedStatistic.user_id == user.id)
                .order_by(SavedStatistic.created_at.desc(), SavedStatistic.name.asc())
            )
        )
        .scalars()
        .all()
    )

    if not statistics:
        return []

    # Entries are needed per project, so each project's are loaded once and
    # shared by every stat that reads it, rather than once per stat. The
    # join above guarantees the project row exists.
    projects: dict[UUID, Project] = {}
    entries_by_project: dict[UUID, list[Entry]] = {}
    responses: list[SavedStatisticResponse] = []
    for statistic in statistics:
        if statistic.project_id not in projects:
            projects[statistic.project_id] = await db.scalar(
                select(Project).where(Project.id == statistic.project_id)
            )
            entries_by_project[statistic.project_id] = await _project_entries(
                db, statistic.project_id
            )
        responses.append(
            _statistic_response(
                statistic, projects[statistic.project_id], entries_by_project[statistic.project_id]
            )
        )

    return responses


@router.post("/custom/preview", response_model=CustomStatisticPreviewResponse)
async def preview_custom_statistic(
    payload: CustomStatisticPreviewRequest,
    user: User = Depends(get_current_user),  # noqa: B008
    db: AsyncSession = Depends(get_db),  # noqa: B008
):
    """Work a formula out against a project's entries, without saving it."""
    project = await _owned_project(payload.project_id, user, db)
    entries = await _project_entries(db, project.id)

    try:
        result = evaluate_statistic(
            payload.expression, project.entry_schema, entries, project.name
        )
    except StatisticError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error

    return CustomStatisticPreviewResponse(
        value=result.value,
        entries_used=result.entries_used,
        note=result.note,
    )


@router.post(
    "/custom", response_model=SavedStatisticResponse, status_code=status.HTTP_201_CREATED
)
async def create_custom_statistic(
    payload: SavedStatisticCreate,
    user: User = Depends(get_current_user),  # noqa: B008
    db: AsyncSession = Depends(get_db),  # noqa: B008
):
    """Save a named figure under the caller's account."""
    project = await _owned_project(payload.project_id, user, db)

    try:
        expression = validate_statistic(
            payload.expression, project.entry_schema, project.name
        )
    except StatisticError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error

    saved = SavedStatistic(
        user_id=user.id,
        project_id=project.id,
        name=payload.name,
        expression=expression,
    )
    db.add(saved)
    await db.commit()
    await db.refresh(saved)

    entries = await _project_entries(db, project.id)
    return _statistic_response(saved, project, entries)


@router.put("/custom/{statistic_id}", response_model=SavedStatisticResponse)
async def update_custom_statistic(
    statistic_id: UUID,
    payload: SavedStatisticUpdate,
    user: User = Depends(get_current_user),  # noqa: B008
    db: AsyncSession = Depends(get_db),  # noqa: B008
):
    """Edit a saved statistic: its name, its formula, or its project.

    The formula is only re-checked when it (or the project) changed —
    renaming a stat must not strand someone whose schema moved on since the
    formula was saved.
    """
    statistic = await db.scalar(
        select(SavedStatistic).where(
            SavedStatistic.id == statistic_id,
            SavedStatistic.user_id == user.id,
        )
    )
    if statistic is None:
        raise HTTPException(status_code=404, detail="Statistic not found")

    if payload.project_id is not None and payload.project_id != statistic.project_id:
        project = await _owned_project(payload.project_id, user, db)
        statistic.project_id = project.id
    else:
        project = await _owned_project(statistic.project_id, user, db)

    if payload.name is not None:
        statistic.name = payload.name

    if payload.expression is not None:
        try:
            statistic.expression = validate_statistic(
                payload.expression, project.entry_schema, project.name
            )
        except StatisticError as error:
            raise HTTPException(status_code=400, detail=str(error)) from error

    await db.commit()
    await db.refresh(statistic)

    entries = await _project_entries(db, project.id)
    return _statistic_response(statistic, project, entries)


@router.delete("/custom/{statistic_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_custom_statistic(
    statistic_id: UUID,
    user: User = Depends(get_current_user),  # noqa: B008
    db: AsyncSession = Depends(get_db),  # noqa: B008
):
    # Scoped by user_id so someone else's statistic is indistinguishable from
    # one that does not exist.
    statistic = await db.scalar(
        select(SavedStatistic).where(
            SavedStatistic.id == statistic_id,
            SavedStatistic.user_id == user.id,
        )
    )
    if statistic is None:
        raise HTTPException(status_code=404, detail="Statistic not found")

    await db.delete(statistic)
    await db.commit()

