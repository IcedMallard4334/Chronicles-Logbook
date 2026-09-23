"""Aggregate statistics over a user's projects and entries."""

import csv
import io
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
from typing import Any, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy import distinct, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import Entry, Project, User
from app.routers.auth import get_current_user
from app.schemas import (
    ActivityPoint,
    ActivityResponse,
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


def _csv_response(rows: list[list[Any]], filename: str) -> StreamingResponse:
    """Rows as a downloadable CSV.

    Quotes and backslashes would terminate the filename early in the
    Content-Disposition header, so they are stripped rather than trusted:
    project names are user-chosen and end up in this header.
    """
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    for row in rows:
        writer.writerow(row)
    buffer.seek(0)

    safe = filename.replace('"', "").replace("\\", "") or "statistics"

    return StreamingResponse(
        buffer,
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{safe}.csv"'},
    )


def _minutes(value: int | None) -> str:
    """A duration as "3h 20m", which is how the app shows it everywhere else.

    An export that reported 200 where the screen says 3h 20m would make the
    two impossible to reconcile, so the raw minutes ride alongside in their
    own column rather than replacing this.
    """
    minutes = int(value or 0)
    hours, remainder = divmod(minutes, 60)
    if not minutes:
        return "0m"
    if not hours:
        return f"{remainder}m"
    if not remainder:
        return f"{hours}h"
    return f"{hours}h {remainder}m"


def _period_key(moment: datetime, bucket: str) -> str:
    """The label one entry's timestamp falls under.

    Weeks are ISO weeks and are labelled by the Monday that starts them, so
    that a week reads as a date range somebody can find in a calendar rather
    than as "2026-W14".
    """
    day = moment.date() if isinstance(moment, datetime) else moment

    if bucket == "day":
        return day.isoformat()
    if bucket == "month":
        return day.strftime("%Y-%m")
    return (day - timedelta(days=day.weekday())).isoformat()


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

    # Retired definitions too: work recorded under a field that has since left
    # the schema still happened, and a total that quietly dropped it would be
    # wrong about the project rather than merely incomplete.
    for field in project.retired_schema or []:
        field_definitions.setdefault(field["id"], field)

    live_ids = {field["id"] for field in project.entry_schema}

    field_values: dict[str, list[tuple[Any, str]]] = {
        field_id: [] for field_id in field_definitions
    }

    for entry in entries:
        schema_by_id = {
            field["id"]: field for field in entry.schema_snapshot
        }

        for field_id, value in entry.data.items():
            field = schema_by_id.get(field_id)
            if value is None or value == "":
                continue

            field_values.setdefault(field_id, []).append(
                (value, (field or {}).get("type", "text"))
            )

    fields: list[FieldStatistics] = []

    for field_id, field in field_definitions.items():
        values = field_values.get(field_id, [])
        field_type = field.get("type", "text")
        # Values written under a version of this field whose type differs from
        # the one it has now. They are still counted — see below — but the
        # count is reported so the difference is explained rather than felt.
        older = sum(1 for _, value_type in values if value_type != field_type)

        fields.append(
            _summarise_field(
                field_id=field_id,
                field=field,
                field_type=field_type,
                values=[value for value, _ in values],
                from_earlier_formats=older,
                retired=field_id not in live_ids,
            )
        )

    return FieldStatisticsResponse(
        project_id=project.id,
        schema_version=project.schema_version,
        fields=fields,
    )


def _as_group_keys(value: Any, field_type: str) -> list[Any]:
    """The values one recorded answer contributes to a grouping.

    Tags and checklists hold a list, and grouping them by the whole list would
    produce one group per unique combination — useless. Each tag and each
    checklist item is a group of its own, which is what someone asking "what
    have I been tagging?" actually wants to know.
    """
    if field_type == "tags" and isinstance(value, list):
        return [str(tag) for tag in value if isinstance(tag, str)]

    if field_type == "checklist" and isinstance(value, list):
        return [
            "Done" if item.get("completed") else "Not done"
            for item in value
            if isinstance(item, dict)
        ]

    if isinstance(value, (dict, list)):
        return []

    return [value]


def _summarise_field(
    *,
    field_id: str,
    field: dict[str, Any],
    field_type: str,
    values: list[Any],
    from_earlier_formats: int,
    retired: bool,
) -> FieldStatistics:
    """One field, totalled or grouped according to what it holds.

    Values are read for what they are rather than for what the field's current
    type says they should be. A figure recorded back when the field was text
    is still a figure, and dropping it from the total would report less work
    than was done — which matters more now that a format change leaves past
    entries exactly as they were written.
    """
    numeric = [
        float(value)
        for value in values
        if isinstance(value, (int, float)) and not isinstance(value, bool)
    ]
    numeric += [
        float(value.strip())
        for value in values
        if isinstance(value, str) and _reads_as_number(value)
    ]

    statistics = FieldStatistics(
        field_id=field_id,
        name=field.get("name", field_id),
        type=field_type,
        count=len(values),
        from_earlier_formats=from_earlier_formats,
        retired=retired,
    )

    # Totals are only meaningful where the figures mean the same thing. A
    # number field, or a field that has become one, is such a case; a text
    # field that happens to hold "12" on one entry is not.
    if field_type in ("number", "computed") and numeric:
        statistics.total = sum(numeric)
        statistics.average = statistics.total / len(numeric)
        statistics.minimum = min(numeric)
        statistics.maximum = max(numeric)
        statistics.count = len(numeric)
        return statistics

    groups: dict[str, FieldStatisticsGroup] = {}
    order: list[str] = []

    for value in values:
        for key_value in _as_group_keys(value, field_type):
            key = repr(key_value)
            if key not in groups:
                groups[key] = FieldStatisticsGroup(value=key_value, count=0)
                order.append(key)
            groups[key].count += 1

    statistics.groups = [groups[key] for key in order]
    return statistics


def _reads_as_number(value: str) -> bool:
    try:
        float(value.strip())
    except (TypeError, ValueError):
        return False
    return True


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


# ── Activity over time, and taking the numbers away with you ─────────────────


async def _readable_project(project_id: UUID, user: User, db: AsyncSession) -> Project:
    project = await db.scalar(
        select(Project).where(Project.id == project_id, Project.user_id == user.id)
    )
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


@router.get("/activity", response_model=ActivityResponse)
async def read_activity(
    project_id: UUID | None = None,
    bucket: Literal["day", "week", "month"] = "week",
    start: date | None = None,
    end: date | None = None,
    user: User = Depends(get_current_user),  # noqa: B008
    db: AsyncSession = Depends(get_db),  # noqa: B008
):
    """Entries and time logged per day, week or month.

    The brief asks for "entries written over a week or a term", which is a
    series rather than a total — a term's work is a shape, and one number
    cannot show whether it was steady or all in the last fortnight. Empty
    periods are filled in for the same reason: a gap that is simply absent
    from the data reads as no gap at all.
    """
    if project_id is not None:
        await _readable_project(project_id, user, db)

    query = (
        select(Entry.created_at, Entry.time_spent)
        .join(Project, Entry.project_id == Project.id)
        .where(Project.user_id == user.id)
    )
    if project_id is not None:
        query = query.where(Entry.project_id == project_id)
    if start is not None:
        query = query.where(func.date(Entry.created_at) >= start)
    if end is not None:
        query = query.where(func.date(Entry.created_at) <= end)

    rows = (await db.execute(query)).all()

    entries_by_period: dict[str, int] = defaultdict(int)
    minutes_by_period: dict[str, int] = defaultdict(int)
    days: list[date] = []

    for created_at, time_spent in rows:
        day = created_at.date() if isinstance(created_at, datetime) else _as_date(created_at)
        key = _period_key(day, bucket)
        entries_by_period[key] += 1
        minutes_by_period[key] += int(time_spent or 0)
        days.append(day)

    if not days:
        return ActivityResponse(bucket=bucket, start=start, end=end, points=[])

    # Walk the calendar rather than the data, so a fortnight of silence shows
    # as a fortnight of zeroes instead of closing up.
    first = start or min(days)
    last = end or max(days)
    step = {"day": timedelta(days=1), "week": timedelta(days=7)}.get(bucket)

    labels: list[str] = []
    seen: set[str] = set()
    cursor = first
    while cursor <= last:
        label = _period_key(cursor, bucket)
        if label not in seen:
            seen.add(label)
            labels.append(label)
        cursor = (
            cursor + step
            if step is not None
            # No month-length arithmetic: step into the next month by landing
            # on the 28th (which every month has) and adding four days.
            else (cursor.replace(day=28) + timedelta(days=4)).replace(day=1)
        )

    return ActivityResponse(
        bucket=bucket,
        start=first,
        end=last,
        points=[
            ActivityPoint(
                period=label,
                entries=entries_by_period.get(label, 0),
                time_spent=minutes_by_period.get(label, 0),
            )
            for label in labels
        ],
    )


@router.get("/export.csv")
async def export_statistics(
    user: User = Depends(get_current_user),  # noqa: B008
    db: AsyncSession = Depends(get_db),  # noqa: B008
):
    """The whole logbook's statistics as a spreadsheet.

    One file with two tables in it, separated by a blank row: the totals, then
    a row per project. Two files would be tidier and would mean remembering to
    download both.
    """
    statistics = await read_statistics(user=user, db=db)
    totals = statistics.totals

    rows: list[list[Any]] = [
        ["Chronicles statistics"],
        ["Generated at", datetime.now(timezone.utc).isoformat(timespec="seconds")],
        [],
        ["Measure", "Value"],
        ["Projects", totals.projects],
        ["Active projects", totals.active_projects],
        ["Archived projects", totals.archived_projects],
        ["Entries", totals.entries],
        ["Time logged", _minutes(totals.time_spent)],
        ["Time logged (minutes)", totals.time_spent],
        ["Active days", totals.active_days],
        ["Current streak (days)", totals.current_streak],
        ["Longest streak (days)", totals.longest_streak],
        ["First entry", totals.first_entry_at.isoformat() if totals.first_entry_at else ""],
        ["Last entry", totals.last_entry_at.isoformat() if totals.last_entry_at else ""],
        [],
        [
            "Project",
            "Archived",
            "Entries",
            "Time logged",
            "Time logged (minutes)",
            "Active days",
            "Current streak",
            "Longest streak",
            "First entry",
            "Last entry",
        ],
    ]

    for project in statistics.projects:
        rows.append(
            [
                project.name,
                "yes" if project.archived else "no",
                project.entries,
                _minutes(project.time_spent),
                project.time_spent,
                project.active_days,
                project.current_streak,
                project.longest_streak,
                project.first_entry_at.isoformat() if project.first_entry_at else "",
                project.last_entry_at.isoformat() if project.last_entry_at else "",
            ]
        )

    return _csv_response(rows, "chronicles-statistics")


@router.get("/projects/{project_id}/export.csv")
async def export_project_statistics(
    project_id: UUID,
    bucket: Literal["day", "week", "month"] = "week",
    user: User = Depends(get_current_user),  # noqa: B008
    db: AsyncSession = Depends(get_db),  # noqa: B008
):
    """One project's statistics: its totals, every field, and its activity.

    The same three things the statistics page shows, in the order it shows
    them, so the file and the screen can be read against each other.
    """
    project = await _readable_project(project_id, user, db)

    overall = await read_statistics(user=user, db=db)
    summary = next(
        (row for row in overall.projects if row.project_id == project.id),
        None,
    )
    field_statistics = await read_field_statistics(project_id, user=user, db=db)
    activity = await read_activity(
        project_id=project_id, bucket=bucket, user=user, db=db
    )

    rows: list[list[Any]] = [
        [f"Statistics for {project.name}"],
        ["Generated at", datetime.now(timezone.utc).isoformat(timespec="seconds")],
        ["Format version", project.schema_version],
        [],
        ["Measure", "Value"],
    ]

    if summary is not None:
        rows += [
            ["Entries", summary.entries],
            ["Time logged", _minutes(summary.time_spent)],
            ["Time logged (minutes)", summary.time_spent],
            ["Active days", summary.active_days],
            ["Current streak (days)", summary.current_streak],
            ["Longest streak (days)", summary.longest_streak],
            [
                "First entry",
                summary.first_entry_at.isoformat() if summary.first_entry_at else "",
            ],
            [
                "Last entry",
                summary.last_entry_at.isoformat() if summary.last_entry_at else "",
            ],
        ]

    rows += [
        [],
        [
            "Field",
            "Type",
            "Still collected",
            "Values recorded",
            "From earlier formats",
            "Total",
            "Average",
            "Lowest",
            "Highest",
        ],
    ]

    for field in field_statistics.fields:
        rows.append(
            [
                field.name,
                getattr(field.type, "value", field.type),
                "no" if field.retired else "yes",
                field.count,
                field.from_earlier_formats,
                "" if field.total is None else field.total,
                "" if field.average is None else round(field.average, 4),
                "" if field.minimum is None else field.minimum,
                "" if field.maximum is None else field.maximum,
            ]
        )

    grouped = [field for field in field_statistics.fields if field.groups]
    if grouped:
        rows += [[], ["Field", "Value", "Entries"]]
        for field in grouped:
            for group in field.groups:
                rows.append([field.name, group.value, group.count])

    rows += [[], [f"Activity by {bucket}", "Entries", "Time logged (minutes)"]]
    for point in activity.points:
        rows.append([point.period, point.entries, point.time_spent])

    return _csv_response(rows, f"{project.name} statistics")

