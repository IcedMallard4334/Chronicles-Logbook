"""Aggregate statistics over a user's projects and entries."""

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
    ProjectStatistics,
    StatisticsResponse,
    StatisticsTotals,
)

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

