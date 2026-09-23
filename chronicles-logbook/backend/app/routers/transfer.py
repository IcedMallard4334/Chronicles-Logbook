"""Export a logbook and bring it back in (US-2.17).

Two jobs hide in "bring it back in", and they pull in opposite directions:

  - restoring into the same account, where ids already match what is stored
    and duplicating everything would be wrong;
  - moving to a different account or install, where those ids may belong to
    somebody else entirely.

Import therefore reconciles by id rather than assuming either case. See
``_resolve_project`` for the three outcomes.
"""

import csv
import io
from datetime import datetime, timezone
from typing import Any
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import Entry, Project, User
from app.routers.auth import get_current_user
from app.routers.projects import _get_user_project, _validate_entry_data
from app.schemas import (
    EXPORT_VERSION,
    ExportDocument,
    ExportedEntry,
    ExportedProject,
    ImportSummary,
)

router = APIRouter(tags=["Export and import"])


@router.get("/export", response_model=ExportDocument)
async def export_logbook(
    user: User = Depends(get_current_user),  # noqa: B008
    db: AsyncSession = Depends(get_db),  # noqa: B008
):
    """Return the caller's whole logbook as a single JSON document.

    Archived projects are included: an export that quietly omitted them
    would not be a record of your work.
    """
    projects = (
        await db.execute(
            select(Project)
            .where(Project.user_id == user.id)
            .order_by(Project.created_at.asc())
        )
    ).scalars().all()

    entries = (
        await db.execute(
            select(Entry)
            .join(Project, Entry.project_id == Project.id)
            .where(Project.user_id == user.id)
            .order_by(Entry.created_at.asc())
        )
    ).scalars().all()

    by_project: dict[UUID, list[Entry]] = {}
    for entry in entries:
        by_project.setdefault(entry.project_id, []).append(entry)

    return ExportDocument(
        exported_at=datetime.now(timezone.utc),
        projects=[
            ExportedProject(
                id=project.id,
                name=project.name,
                description=project.description,
                archived=project.archived,
                entry_schema=project.entry_schema,
                retired_schema=project.retired_schema,
                created_at=project.created_at,
                entries=[
                    ExportedEntry.model_validate(entry)
                    for entry in by_project.get(project.id, [])
                ],
            )
            for project in projects
        ],
    )


def _cell(value: Any) -> str:
    """One recorded value as a spreadsheet reads it.

    A list of tags rendered by ``str`` becomes ``['a', 'b']``, and a checklist
    becomes a row of ``[object Object]``-grade noise. Neither is what somebody
    opening the file in Excel came for, so each rich type gets the rendering
    its own screen uses.
    """
    if value is None:
        return ""

    if isinstance(value, list):
        if value and all(isinstance(item, dict) for item in value):
            done = sum(1 for item in value if item.get("completed"))
            items = "; ".join(
                f"{'x' if item.get('completed') else ' '} {item.get('text', '')}".strip()
                for item in value
            )
            return f"{done}/{len(value)} — {items}"
        return ", ".join(str(item) for item in value)

    if isinstance(value, bool):
        return "yes" if value else "no"

    return str(value)


@router.get("/projects/{project_id}/export.csv")
async def export_project_csv(
    project_id: UUID,
    user: User = Depends(get_current_user),  # noqa: B008
    db: AsyncSession = Depends(get_db),  # noqa: B008
):
    """A flat CSV of one project's entries, for spreadsheets.

    Columns cover every field the project has ever had, not only the ones it
    asks for today: past entries keep the format they were written under, so a
    file limited to the current schema would silently drop whole columns of
    real work. Fields no longer collected are marked in the header rather than
    left to look like a gap in the record.

    Deliberately lossy and not re-importable: a CSV has no way to carry the
    project's schema, and each project defines its own fields, so there is no
    single set of columns across a logbook. The JSON export is the format that
    round-trips.
    """
    project = await _get_user_project(project_id, user, db)

    entries = (
        await db.execute(
            select(Entry)
            .where(Entry.project_id == project_id)
            .order_by(Entry.created_at.asc())
        )
    ).scalars().all()

    live = project.entry_schema or []
    columns: list[tuple[str, str]] = [(field["id"], field["name"]) for field in live]
    seen = {field["id"] for field in live}

    # Anything an entry recorded under a field the project has since dropped
    # or renamed away from. Labelled from the retired schema where possible,
    # and from the entry's own snapshot otherwise.
    labels: dict[str, str] = {
        field["id"]: field["name"] for field in (project.retired_schema or [])
    }
    for entry in entries:
        for field in entry.schema_snapshot or []:
            labels.setdefault(field["id"], field.get("name", field["id"]))
        for field_id in entry.data:
            if field_id not in seen:
                seen.add(field_id)
                columns.append(
                    (field_id, f"{labels.get(field_id, field_id)} (no longer collected)")
                )

    buffer = io.StringIO()
    writer = csv.writer(buffer)

    writer.writerow(
        [
            "Captured at",
            "Logged by",
            *[name for _, name in columns],
            "Time spent (minutes)",
            "Still to do",
            "Due",
        ]
    )

    for entry in entries:
        writer.writerow(
            [
                entry.created_at.isoformat(),
                entry.created_by_name or "",
                *[_cell(entry.data.get(field_id)) for field_id, _ in columns],
                entry.time_spent if entry.time_spent is not None else "",
                "yes" if entry.todo else "no",
                entry.due_date.isoformat() if entry.due_date else "",
            ]
        )

    buffer.seek(0)

    # Quotes would terminate the filename early in the Content-Disposition
    # header, so strip them rather than trusting a user-chosen project name.
    safe_name = project.name.replace('"', "").replace("\\", "") or "project"
    filename = f"{safe_name}.csv"

    return StreamingResponse(
        buffer,
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


async def _resolve_project(
    exported: ExportedProject,
    user: User,
    db: AsyncSession,
) -> tuple[Project, bool]:
    """Find or create the project an exported one should be restored into.

    Three cases:

      - the caller already owns a project with this id — reuse it, and leave
        its current name, description and schema alone. Overwriting live data
        with an older backup is worse than not restoring those fields; the
        entries are what the user came for.
      - the id is free — create the project with it, preserving everything.
        This is the real restore case, and the schema comes back with it.
      - the id belongs to somebody else — create the project under a fresh id.
        Entries are remapped onto it by the caller.
    """
    existing = await db.get(Project, exported.id)

    if existing is not None and existing.user_id == user.id:
        return existing, False

    project = Project(
        user_id=user.id,
        name=exported.name,
        description=exported.description,
        archived=exported.archived,
        entry_schema=[field.model_dump(mode="json") for field in exported.entry_schema],
        retired_schema=[field.model_dump(mode="json") for field in exported.retired_schema],
    )

    # The original creation date is part of the record and is kept either way.
    # The id can only be preserved when nobody else holds it.
    project.created_at = exported.created_at
    if existing is None:
        project.id = exported.id

    db.add(project)
    await db.flush()
    return project, True


@router.post("/import", response_model=ImportSummary)
async def import_logbook(
    document: ExportDocument,
    user: User = Depends(get_current_user),  # noqa: B008
    db: AsyncSession = Depends(get_db),  # noqa: B008
):
    """Restore projects, schemas and entries from an exported document.

    Additive: nothing already stored is deleted or overwritten.

    Re-importing your own export is a no-op, because every project and entry
    is found by the id it carries.

    Re-importing someone *else's* export is not. Their ids belong to them, so
    each run creates copies under fresh ids, and nothing records which
    exported id a copy came from. Making repeat cross-account imports
    reconcile would need that provenance stored on the rows.
    """
    if document.version > EXPORT_VERSION:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                f"This file was exported by a newer version of Chronicles "
                f"(format {document.version}, this server understands "
                f"{EXPORT_VERSION})."
            ),
        )

    summary = ImportSummary()

    for exported in document.projects:
        project, created = await _resolve_project(exported, user, db)
        if created:
            summary.projects_created += 1
        else:
            summary.projects_reused += 1

        for exported_entry in exported.entries:
            # Checked against the format the entry was written under, not the
            # project's current one. A project's format moves on and its past
            # entries keep theirs, so validating everything against today's
            # schema would reject exactly the history this export exists to
            # preserve. Entries from files written before snapshots were
            # exported fall back to the project's schema, as they always did.
            entry_schema = [
                dict(field) for field in exported_entry.schema_snapshot
            ] or project.entry_schema

            try:
                await _validate_entry_data(exported_entry.data, entry_schema)
            except HTTPException as error:
                # The project was reused and its schema has moved on since the
                # export. Record which entry and why rather than dropping it
                # without a word.
                summary.entries_skipped += 1
                summary.issues.append(
                    f"Entry from {exported_entry.created_at.date()} "
                    f"in '{project.name}': {error.detail}"
                )
                continue

            existing = await db.get(Entry, exported_entry.id)

            if existing is not None:
                if existing.project_id == project.id:
                    # Already restored by an earlier import of this file.
                    summary.entries_skipped += 1
                    continue
                # The id belongs to a different project, so this entry needs
                # one of its own.
                entry_id = uuid4()
            else:
                entry_id = exported_entry.id

            db.add(
                Entry(
                    id=entry_id,
                    project_id=project.id,
                    data=exported_entry.data,
                    retired_data=exported_entry.retired_data,
                    schema_version=exported_entry.schema_version,
                    schema_snapshot=entry_schema,
                    todo=exported_entry.todo,
                    due_date=exported_entry.due_date,
                    time_spent=exported_entry.time_spent,
                    created_at=exported_entry.created_at,
                    created_by=user.id,
                )
            )
            summary.entries_created += 1

    await db.commit()
    return summary
