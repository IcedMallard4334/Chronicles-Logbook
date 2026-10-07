"""Badges for milestones in the app.

Each badge is earned when one measured figure reaches a target, so the catalogue
below is data: a name, a tier, a short explanation, the figure it watches and the
number it needs. Figures are counted from what is already stored, never kept as
separate counters, so a badge can't drift out of step with the work behind it.

An earned badge is remembered (with when it was earned), because the things
that earned it can later go away: deleting a project should not take back the
"First Chapter" someone earned for making one.
"""

from dataclasses import dataclass
from datetime import date, datetime, timezone

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    CalendarActivity,
    Dashboard,
    Entry,
    EntryRevision,
    EntryRule,
    GoogleCalendarAccount,
    GoogleCalendarToken,
    MiraConversation,
    Project,
    ProjectMember,
    SavedStatistic,
    Task,
    User,
    UserAchievement,
    UserActivityDay,
)
from app.routers.streaks import summarise

TIERS = ("bronze", "silver", "gold", "legendary", "platinum")

# Stored once per person, so the first check can tell "this is a new account" from
# "this is an existing account meeting the badges for the first time".
INITIALISED = "__initialised__"


@dataclass(frozen=True)
class Badge:
    key: str
    name: str
    category: str
    tier: str
    metric: str
    target: int
    blurb: str
    how: str


CATEGORIES = {
    "projects": "Projects",
    "entries": "Entries",
    "time": "Time",
    "login": "Showing up",
    "activity": "Keeping busy",
    "tasks": "Tasks",
    "explorer": "Exploring",
    "mastery": "Mastery",
}

_EVERYDAY: tuple[Badge, ...] = (
    # Projects
    Badge("first_project", "First Chapter", "projects", "bronze", "projects", 1,
          "Every logbook starts with a single page. You opened yours.", "Create your first project."),
    Badge("five_projects", "Bookshelf", "projects", "silver", "projects", 5,
          "Five projects deep. Your work now has more than one home.", "Create 5 projects."),
    Badge("ten_projects", "Grand Library", "projects", "gold", "projects", 10,
          "A whole library of work, each part with its own shape.", "Create 10 projects."),
    # Entries
    Badge("first_entry", "Ink Spilled", "entries", "bronze", "entries", 1,
          "The first entry is the hardest. Now there is a record.", "Log your first entry."),
    Badge("ten_entries", "Page Turner", "entries", "bronze", "entries", 10,
          "Ten entries in. The habit is taking hold.", "Log 10 entries."),
    Badge("fifty_entries", "Chronicler", "entries", "silver", "entries", 50,
          "Fifty moments captured that would otherwise have faded.", "Log 50 entries."),
    Badge("hundred_entries", "Centurion Scribe", "entries", "gold", "entries", 100,
          "A hundred entries. That is a history, not just notes.", "Log 100 entries."),
    Badge("five_hundred_entries", "Saga Weaver", "entries", "legendary", "entries", 500,
          "Five hundred entries: a story told one day at a time.", "Log 500 entries."),
    # Time
    Badge("ten_hours", "Hour Hand", "time", "bronze", "hours", 10,
          "Ten hours of work, written down and counted.", "Record 10 hours of time spent across your entries."),
    Badge("fifty_hours", "Deep Diver", "time", "silver", "hours", 50,
          "Fifty hours of focused effort, all accounted for.", "Record 50 hours of time spent."),
    Badge("hundred_hours", "Century Clock", "time", "gold", "hours", 100,
          "One hundred hours logged. That is more than two working weeks.", "Record 100 hours of time spent."),
    Badge("five_hundred_hours", "Marathon Mind", "time", "legendary", "hours", 500,
          "Five hundred hours. Serious, sustained work.", "Record 500 hours of time spent."),
    # Showing up (days you opened the app, in a row)
    Badge("login_3", "Regular", "login", "bronze", "login_streak", 3,
          "Three days running. You know the way here now.", "Open Chronicles 3 days in a row."),
    Badge("login_10", "Creature of Habit", "login", "silver", "login_streak", 10,
          "Ten days in a row. Chronicles is part of your routine.", "Open Chronicles 10 days in a row."),
    Badge("login_30", "Lighthouse Keeper", "login", "gold", "login_streak", 30,
          "Thirty days, and the light never went out.", "Open Chronicles 30 days in a row."),
    Badge("login_100", "Eternal Flame", "login", "legendary", "login_streak", 100,
          "A hundred days in a row. Nothing stops you turning up.", "Open Chronicles 100 days in a row."),
    # Keeping busy (days you actually did something, in a row)
    Badge("activity_3", "Warming Up", "activity", "bronze", "activity_streak", 3,
          "Three days of real work in a row.", "Save something (an entry, task, project or activity) 3 days in a row."),
    Badge("activity_10", "In the Flow", "activity", "silver", "activity_streak", 10,
          "Ten days of doing, not just looking.", "Save something 10 days in a row."),
    Badge("activity_30", "Unstoppable", "activity", "gold", "activity_streak", 30,
          "Thirty days of steady progress.", "Save something 30 days in a row."),
    Badge("activity_100", "Relentless", "activity", "legendary", "activity_streak", 100,
          "A hundred days of progress, back to back.", "Save something 100 days in a row."),
    # Tasks
    Badge("first_task_done", "Box Ticked", "tasks", "bronze", "tasks_done", 1,
          "The first finished task. Plenty more where that came from.", "Complete your first task."),
    Badge("twenty_five_tasks", "Closer", "tasks", "silver", "tasks_done", 25,
          "Twenty-five tasks done. You finish what you start.", "Complete 25 tasks."),
    Badge("hundred_tasks", "Finisher", "tasks", "gold", "tasks_done", 100,
          "A hundred tasks off the list.", "Complete 100 tasks."),
    # Exploring
    Badge("first_activity", "Time Blocker", "explorer", "bronze", "activities", 1,
          "You gave a part of your day a place in the calendar.", "Schedule an activity."),
    Badge("calendar_connected", "Calendar Sync", "explorer", "bronze", "calendar", 1,
          "Your Google Calendar and your logbook, side by side.", "Connect a Google Calendar."),
    Badge("custom_statuses", "Workflow Designer", "explorer", "silver", "custom_status_projects", 1,
          "You shaped the stages your work moves through.", "Give a project your own statuses."),
    Badge("first_rule", "Autopilot", "explorer", "silver", "rules", 1,
          "A rule that does the boring part for you.", "Create an automation rule."),
    Badge("first_stat", "Number Cruncher", "explorer", "silver", "statistics", 1,
          "You asked your data a question and saved the answer.", "Save a custom statistic."),
    Badge("dashboard_three", "Dashboard Architect", "explorer", "silver", "panels", 3,
          "Three panels, arranged just how you like them.", "Put 3 panels on your dashboard."),
    Badge("first_share", "Team Player", "explorer", "silver", "shared", 1,
          "Work is better together. You invited someone in.", "Share a project with someone."),
    Badge("first_mira", "Hello, Mira", "explorer", "bronze", "mira_chats", 1,
          "You met your assistant.", "Start a conversation with Mira."),
    Badge("ten_mira", "Thinking Partner", "explorer", "silver", "mira_chats", 10,
          "Ten conversations. Mira is earning her keep.", "Have 10 conversations with Mira."),
    Badge("first_revert", "Time Traveller", "explorer", "silver", "reverts", 1,
          "You went back to how an entry used to be.", "Revert an entry to an earlier version."),
    Badge("first_archive", "Tidy Mind", "explorer", "bronze", "archived_projects", 1,
          "Finished work, put away properly and kept on record.", "Archive a project."),
)

# The platinum trophy: every other badge, earned. It watches a count of those rather than
# a figure from the logbook, so it is the one badge worked out after all the rest.
PLATINUM = Badge(
    "platinum_trophy", "Chronicle Master", "mastery", "platinum", "badges", len(_EVERYDAY),
    "Every badge in the logbook, earned. Few get here.", f"Earn all {len(_EVERYDAY)} other badges.",
)
CATALOGUE: tuple[Badge, ...] = (*_EVERYDAY, PLATINUM)

BY_KEY = {badge.key: badge for badge in CATALOGUE}


async def _count(db: AsyncSession, statement) -> int:
    return int((await db.scalar(statement)) or 0)


async def measure(user: User, db: AsyncSession) -> dict[str, int]:
    """The figures the badges watch, counted from what is stored now."""
    owned_projects = select(Project.id).where(Project.user_id == user.id)

    days: dict[str, set[date]] = {"login": set(), "interaction": set()}
    rows = await db.execute(
        select(UserActivityDay.kind, UserActivityDay.day).where(UserActivityDay.user_id == user.id)
    )
    for kind, day in rows.all():
        days.setdefault(kind, set()).add(day)
    today = datetime.now(timezone.utc).date()

    projects = await db.scalars(select(Project).where(Project.user_id == user.id))
    project_list = projects.all()
    dashboard = await db.scalar(select(Dashboard).where(Dashboard.user_id == user.id))
    minutes = await _count(db, select(func.coalesce(func.sum(Entry.time_spent), 0)).where(Entry.created_by == user.id))
    calendar_links = await _count(db, select(func.count()).select_from(GoogleCalendarAccount).where(GoogleCalendarAccount.user_id == user.id))
    calendar_links += await _count(db, select(func.count()).select_from(GoogleCalendarToken).where(GoogleCalendarToken.user_id == user.id))

    return {
        "projects": len(project_list),
        "archived_projects": sum(1 for project in project_list if project.archived),
        "custom_status_projects": sum(1 for project in project_list if project.statuses),
        "entries": await _count(db, select(func.count()).select_from(Entry).where(Entry.created_by == user.id)),
        "hours": minutes // 60,
        "tasks_done": await _count(
            db, select(func.count()).select_from(Task).where(Task.completed_by == user.id, Task.completed.is_(True))
        ),
        "activities": await _count(db, select(func.count()).select_from(CalendarActivity).where(CalendarActivity.user_id == user.id)),
        "login_streak": summarise(days["login"], today).longest,
        "activity_streak": summarise(days["interaction"], today).longest,
        "rules": await _count(db, select(func.count()).select_from(EntryRule).where(EntryRule.project_id.in_(owned_projects))),
        "statistics": await _count(db, select(func.count()).select_from(SavedStatistic).where(SavedStatistic.user_id == user.id)),
        "panels": len(dashboard.panels) if dashboard else 0,
        "shared": await _count(db, select(func.count()).select_from(ProjectMember).where(ProjectMember.project_id.in_(owned_projects))),
        "mira_chats": await _count(db, select(func.count()).select_from(MiraConversation).where(MiraConversation.user_id == user.id)),
        "reverts": await _count(
            db,
            select(func.count()).select_from(EntryRevision).where(
                EntryRevision.changed_by == user.id, EntryRevision.action == "reverted"
            ),
        ),
        "calendar": 1 if calendar_links else 0,
    }


def badge_view(badge: Badge, figures: dict[str, int], earned_at: datetime | None, seen: bool) -> dict:
    # An earned badge stays complete even if the work behind it has since gone.
    progress = badge.target if earned_at is not None else min(figures.get(badge.metric, 0), badge.target)
    return {
        "key": badge.key,
        "name": badge.name,
        "category": badge.category,
        "category_name": CATEGORIES[badge.category],
        "tier": badge.tier,
        "blurb": badge.blurb,
        "how": badge.how,
        "target": badge.target,
        "progress": progress,
        "earned": earned_at is not None,
        "earned_at": earned_at,
        "is_new": earned_at is not None and not seen,
    }


async def evaluate(user: User, db: AsyncSession) -> list[dict]:
    """Award any badge now reached, and return the whole catalogue for this person."""
    figures = await measure(user, db)
    figures["badges"] = 0
    rows = (await db.scalars(select(UserAchievement).where(UserAchievement.user_id == user.id))).all()
    held = {row.key: row for row in rows}
    first_check = INITIALISED not in held
    now = datetime.now(timezone.utc)

    changed = False
    if first_check:
        db.add(UserAchievement(user_id=user.id, key=INITIALISED, earned_at=now, seen=True))
        changed = True
    for badge in CATALOGUE:
        if badge.metric == "badges":
            # Counted only once every other badge has been settled, including any awarded just now.
            figures["badges"] = sum(1 for other in _EVERYDAY if other.key in held)
        if badge.key not in held and figures.get(badge.metric, 0) >= badge.target:
            # Badges an existing account already qualifies for are awarded quietly:
            # celebrating twenty of them at once would be noise, not a celebration.
            row = UserAchievement(user_id=user.id, key=badge.key, earned_at=now, seen=first_check)
            db.add(row)
            held[badge.key] = row
            changed = True
    if changed:
        await db.commit()

    figures["badges"] = sum(1 for other in _EVERYDAY if other.key in held)
    return [
        badge_view(badge, figures, held[badge.key].earned_at if badge.key in held else None, held[badge.key].seen if badge.key in held else True)
        for badge in CATALOGUE
    ]

