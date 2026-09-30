"""The snapshot of a person's workspace that Mira is shown with each message.

It is what lets "add a task to my Bug Log project" mean something. It is also
exactly what leaves Chronicles for Google Gemini when someone has allowed Mira
access, so it is deliberately small: names, ids and a few recent titles, never
full entries.
"""

from datetime import date, timedelta

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import CalendarActivity, Entry, Project, ProjectMember, Task, User
from app.statuses import statuses_of

MAX_PROJECTS = 30
MAX_TASKS = 30
MAX_ENTRIES = 20
MAX_ACTIVITIES = 20
ACTIVITY_WINDOW_DAYS = 14
PREVIEW_LENGTH = 50


def _preview(entry: Entry) -> str:
    if entry.title:
        text = entry.title
    else:
        text = next((str(v) for v in (entry.data or {}).values() if isinstance(v, str) and v.strip()), "")
    text = " ".join(text.split())
    return text[:PREVIEW_LENGTH] + ("…" if len(text) > PREVIEW_LENGTH else "")


def _describe_field(field: dict) -> str:
    kind = field.get("type", "text")
    if kind == "dropdown":
        return f"{field['name']} (dropdown: {', '.join(field.get('options', []))})"
    if kind == "computed":
        return f"{field['name']} (computed)"
    return f"{field['name']} ({kind})"


async def build_context(user: User, db: AsyncSession, today: date) -> str:
    shared_with_me = select(ProjectMember.project_id).where(
        ProjectMember.user_id == user.id, ProjectMember.status == "accepted"
    )
    projects = (
        await db.scalars(
            select(Project)
            .where(or_(Project.user_id == user.id, Project.id.in_(shared_with_me)))
            .order_by(Project.created_at.desc())
            .limit(MAX_PROJECTS)
        )
    ).all()
    names = {project.id: project.name for project in projects}
    ids = list(names)

    lines = [f"Today is {today.isoformat()}.", "", "PROJECTS (id | name):"]
    if not projects:
        lines.append("(none yet)")
    for project in projects:
        fields = "; ".join(_describe_field(f) for f in project.entry_schema or []) or "no fields yet"
        statuses = ", ".join(
            f"{s['name']}{' [finished]' if s['done'] else ''}" for s in statuses_of(project.statuses)
        )
        flags = " (archived)" if project.archived else ""
        lines.append(f"- {project.id} | {project.name}{flags} | fields: {fields} | statuses: {statuses}")

    tasks = (
        (
            await db.scalars(
                select(Task)
                .where(Task.project_id.in_(ids), Task.completed.is_(False))
                .order_by(func.coalesce(Task.due_date, date.max), Task.created_at.desc())
                .limit(MAX_TASKS)
            )
        ).all()
        if ids
        else []
    )
    lines += ["", "OPEN TASKS (id | project | title | due):"]
    lines += [
        f"- {t.id} | {names[t.project_id]} | {t.title} | {t.due_date.isoformat() if t.due_date else 'no due date'}"
        for t in tasks
    ] or ["(none)"]

    entries = (
        (
            await db.scalars(
                select(Entry)
                .where(Entry.project_id.in_(ids))
                .order_by(Entry.created_at.desc())
                .limit(MAX_ENTRIES)
            )
        ).all()
        if ids
        else []
    )
    lines += ["", "RECENT ENTRIES (id | project | status | text):"]
    lines += [
        f'- {e.id} | {names[e.project_id]} | {e.status or ("still to do" if e.todo else "done")} | "{_preview(e)}"'
        for e in entries
    ] or ["(none)"]

    activities = (
        await db.scalars(
            select(CalendarActivity)
            .where(
                CalendarActivity.user_id == user.id,
                CalendarActivity.day >= today,
                CalendarActivity.day <= today + timedelta(days=ACTIVITY_WINDOW_DAYS),
            )
            .order_by(CalendarActivity.day, CalendarActivity.start_time)
            .limit(MAX_ACTIVITIES)
        )
    ).all()
    lines += ["", f"SCHEDULED ACTIVITIES, NEXT {ACTIVITY_WINDOW_DAYS} DAYS (id | day | time | title):"]
    lines += [
        f"- {a.id} | {a.day.isoformat()} | {'all day' if a.all_day else f'{a.start_time}-{a.end_time}'} | {a.title}"
        for a in activities
    ] or ["(none)"]

    return "\n".join(lines)
