from datetime import date, datetime, timezone
from datetime import time as time_of_day
from typing import Any
from uuid import UUID, uuid4

from sqlalchemy import (
    Boolean,
    Date,
    Time,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    event,
)
from sqlalchemy.orm import Mapped, Session, mapped_column, relationship, with_loader_criteria

from app.database import Base, JSONType


class MiraConsent(Base):
    __tablename__ = "mira_consents"
    user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    accepted: Mapped[bool] = mapped_column(Boolean, nullable=False)
    version: Mapped[str] = mapped_column(String(30), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


class MiraConversation(Base):
    """One saved chat with Mira, so earlier conversations can be reopened."""

    __tablename__ = "mira_conversations"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    user_id: Mapped[UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    title: Mapped[str] = mapped_column(String(120), nullable=False, default="New conversation")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )


class MiraMessage(Base):
    __tablename__ = "mira_messages"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    conversation_id: Mapped[UUID] = mapped_column(
        ForeignKey("mira_conversations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    role: Mapped[str] = mapped_column(String(12), nullable=False)
    content: Mapped[str] = mapped_column(String, nullable=False)
    # Mira's own summary of how it approached the answer, when the model gave one.
    thinking: Mapped[str | None] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )


class User(Base):
    __tablename__ = "users"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    google_sub: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    full_name: Mapped[str] = mapped_column(String(100), nullable=False)
    email: Mapped[str] = mapped_column(String(320), unique=True, index=True, nullable=False)
    avatar_url: Mapped[str | None] = mapped_column(String(2048), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )


class GoogleCalendarToken(Base):
    __tablename__ = "google_calendar_tokens"

    user_id: Mapped[UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        primary_key=True,
    )
    refresh_token: Mapped[str] = mapped_column(String(512), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )



class Project(Base):
    __tablename__ = "projects"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)

    user_id: Mapped[UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(String, nullable=True)

    archived: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=False,
        server_default="false",
    )

    # Stores a bare list of field-definition dicts, e.g.
    # [{"id": "...", "name": "Hours spent", "type": "number"}, ...]
    entry_schema: Mapped[list[dict[str, Any]]] = mapped_column(
        JSONType,
        nullable=False,
        server_default="[]",
        default=list,
    )

    schema_version: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=1,
        server_default="1",
    )

    # Definitions of fields that were removed from entry_schema (US-2.7).
    # Removing a field hides it from new entries; it does not delete what was
    # already recorded under it, and a value without its label is not a
    # record of anything, so the definition is kept here alongside the values
    # in Entry.retired_data.
    retired_schema: Mapped[list[dict[str, Any]]] = mapped_column(
        JSONType,
        nullable=False,
        server_default="[]",
        default=list,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
    )

    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )


# A membership row exists from the moment someone is invited, and ``status``
# says whether they have taken the invitation up. Sharing used to grant access
# the instant an owner typed an email, which put a stranger's project in your
# sidebar without asking — so an invitation is offered, and only an acceptance
# grants anything.
MEMBERSHIP_PENDING = "pending"
MEMBERSHIP_ACCEPTED = "accepted"
MEMBERSHIP_DECLINED = "declined"


class ProjectMember(Base):
    """Someone other than the owner who has been invited to a project.

    Accepted membership grants reading the project and adding entries to it.
    Everything that reshapes or removes the project — editing the schema,
    archiving, deleting, exporting, and changing who else has access — stays
    with the owner, so a project cannot be restructured out from under the
    person whose record it is.

    A declined row is kept rather than deleted so that declining is not the
    same as never having been asked: the owner can see the answer, and a
    re-invitation moves the same row back to pending instead of stacking up.
    """

    __tablename__ = "project_members"
    __table_args__ = (
        UniqueConstraint("project_id", "user_id", name="uq_project_members_project_user"),
    )

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)

    project_id: Mapped[UUID] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    user_id: Mapped[UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Defaults to accepted, not pending: rows written before invitations
    # existed already granted access, and a migration that turned every one of
    # them into an unanswered invitation would take collaborators' projects
    # away from them overnight.
    status: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default=MEMBERSHIP_PENDING,
        server_default=MEMBERSHIP_ACCEPTED,
    )

    # Who sent the invitation, so it can be shown with a name on it. Cleared
    # rather than cascaded: the membership outlives the inviter's account.
    invited_by: Mapped[UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )

    responded_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    # Both sides of an invitation need a name to show: the project's members
    # list wants the invitee, and the invitee's notifications want the owner.
    member = relationship("User", lazy="selectin", foreign_keys=[user_id])
    inviter = relationship("User", lazy="selectin", foreign_keys=[invited_by])
    project = relationship("Project", lazy="selectin")

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
    )


class Entry(Base):
    __tablename__ = "entries"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)

    project_id: Mapped[UUID] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # An optional free-text identifier, independent of the project's schema —
    # so an entry can be named and recognised (in a list, in a link picker)
    # without depending on whichever field happens to be first.
    title: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # Stores the field-id -> value mapping for this entry.
    data: Mapped[dict[str, Any]] = mapped_column(
        JSONType,
        nullable=False,
        default=dict,
    )

    schema_version: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=1,
        server_default="1",
    )

    schema_snapshot: Mapped[list[dict[str, Any]]] = mapped_column(
        JSONType,
        nullable=False,
        default=list,
        server_default="[]",
    )

    # Values that no longer have a field in the project's entry_schema, moved
    # here when a field was removed or retyped past what its old value could
    # be coerced into (US-2.6, US-2.7). Kept out of `data` so that validation,
    # the CSV export and every other reader see only live fields, while the
    # history itself survives.
    retired_data: Mapped[dict[str, Any]] = mapped_column(
        JSONType,
        nullable=False,
        default=dict,
        server_default="{}",
    )

    # Who wrote this entry. Null for entries written before a project could be
    # shared, so "unknown" has to render as gracefully as a name. Cleared
    # rather than cascaded when an account goes: the record outlives the
    # contributor, which is the whole point of a logbook.
    created_by: Mapped[UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    # selectin rather than the default lazy load: under asyncio, touching an
    # unloaded relationship raises instead of quietly emitting a query, and
    # every response reads the author's name.
    creator = relationship("User", lazy="selectin", foreign_keys=[created_by])

    @property
    def created_by_name(self) -> str | None:
        """Read by ``EntryResponse`` — so every endpoint returning an entry
        carries the author's name without each one having to join for it."""
        return self.creator.full_name if self.creator else None

    time_spent: Mapped[int | None] = mapped_column(
        Integer,
        nullable=True,
    )

    # Marks the entry as work that is still outstanding rather than a record of
    # something already done. Kept off the user-defined ``data`` schema so the
    # outstanding-work view can query it without knowing a project's fields.
    todo: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=False,
        server_default="false",
    )

    due_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    due_time: Mapped[time_of_day | None] = mapped_column(Time, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
    )

    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    # Deleting an entry only stamps this (US-3.10): the row and its history
    # stay, so the deletion is itself a version and can be reverted. Every ORM
    # SELECT hides stamped rows — see _hide_deleted_entries below.
    deleted_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True, index=True
    )


@event.listens_for(Session, "do_orm_execute")
def _hide_deleted_entries(state) -> None:
    """Keep soft-deleted entries out of every query unless asked for.

    Applied globally rather than at each of the many places entries are read,
    so a count, a join or a new endpoint can't forget it. Pass
    ``execution_options={"include_deleted": True}`` to see them.
    """
    if state.is_select and not state.execution_options.get("include_deleted", False):
        state.statement = state.statement.options(
            with_loader_criteria(Entry, lambda cls: cls.deleted_at.is_(None), include_aliases=True)
        )


class EntryRevision(Base):
    """An immutable snapshot of an entry after it is created or edited."""

    __tablename__ = "entry_revisions"
    __table_args__ = (UniqueConstraint("entry_id", "revision", name="uq_entry_revisions_entry_revision"),)

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    entry_id: Mapped[UUID] = mapped_column(
        ForeignKey("entries.id", ondelete="CASCADE"), nullable=False, index=True
    )
    revision: Mapped[int] = mapped_column(Integer, nullable=False)
    title: Mapped[str | None] = mapped_column(String(255), nullable=True)
    data: Mapped[dict[str, Any]] = mapped_column(JSONType, nullable=False, default=dict)
    retired_data: Mapped[dict[str, Any]] = mapped_column(JSONType, nullable=False, default=dict)
    schema_version: Mapped[int] = mapped_column(Integer, nullable=False)
    schema_snapshot: Mapped[list[dict[str, Any]]] = mapped_column(JSONType, nullable=False, default=list)
    time_spent: Mapped[int | None] = mapped_column(Integer, nullable=True)
    todo: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    due_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    due_time: Mapped[time_of_day | None] = mapped_column(Time, nullable=True)
    changed_by: Mapped[UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    changed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    # What this version did (created / edited / deleted / reverted) and why.
    # A "deleted" version is a tombstone: it keeps the entry's last values.
    action: Mapped[str] = mapped_column(String(20), nullable=False, default="edited")
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Which values differ from the version before, and what they used to be,
    # keyed as "title", "time_spent", "todo", "due_date" or "data.<field id>".
    changed_fields: Mapped[list[str]] = mapped_column(JSONType, nullable=False, default=list)
    previous_values: Mapped[dict[str, Any]] = mapped_column(JSONType, nullable=False, default=dict)
    reverted_to: Mapped[int | None] = mapped_column(Integer, nullable=True)

    editor = relationship("User", lazy="selectin", foreign_keys=[changed_by])

    @property
    def changed_by_name(self) -> str | None:
        return self.editor.full_name if self.editor else None


class Task(Base):
    __tablename__ = "tasks"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)

    project_id: Mapped[UUID] = mapped_column(
        ForeignKey("projects.id"),
        nullable=False,
    )

    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(String, nullable=True)
    due_date: Mapped[date | None] = mapped_column(Date, nullable=True)

    completed: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=False,
        server_default="false",
    )

    # Who added the task, and who ticked it off. Both null before sharing
    # existed; completed_by is cleared again when a task is reopened, so it
    # always answers "who completed *this* completion".
    created_by: Mapped[UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    completed_by: Mapped[UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    # Two foreign keys to the same table, so each relationship has to say which
    # column it follows.
    creator = relationship("User", lazy="selectin", foreign_keys=[created_by])
    completer = relationship("User", lazy="selectin", foreign_keys=[completed_by])

    @property
    def created_by_name(self) -> str | None:
        return self.creator.full_name if self.creator else None

    @property
    def completed_by_name(self) -> str | None:
        return self.completer.full_name if self.completer else None

    checklist: Mapped[list[dict[str, Any]]] = mapped_column(
        JSONType,
        nullable=False,
        server_default="[]",
        default=list,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
    )

    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )



class SavedFilter(Base):
    """A named search the user can re-apply later (US-2.12).

    The criteria are stored as a JSON blob rather than one column per filter
    so that adding a filter to the entries view does not need a migration.
    Names are unique per user, which lets saving over an existing name
    update it instead of quietly leaving two identical entries in the list.
    """

    __tablename__ = "saved_filters"
    __table_args__ = (UniqueConstraint("user_id", "name"),)

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)

    user_id: Mapped[UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    name: Mapped[str] = mapped_column(String(100), nullable=False)

    # e.g. {"q": "bug", "project_id": "...", "todo": true, "sort": "due_date"}
    criteria: Mapped[dict[str, Any]] = mapped_column(
        JSONType,
        nullable=False,
        server_default="{}",
        default=dict,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
    )

    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )


class StatisticsLayout(Base):
    """The panels one user has chosen to show on the Statistics page (US-3.7).

    One row per user: a layout is a single saved arrangement rather than a
    collection of things, so the user id is the primary key and saving again
    overwrites it. The panels are stored as a JSON list in the order they
    should render, so reordering is part of the saved value rather than a
    position column that has to be kept consistent with the list.
    """

    __tablename__ = "statistics_layouts"

    user_id: Mapped[UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        primary_key=True,
    )

    # e.g. [{"id": "cards", "visible": true}, {"id": "trend", "visible": false}]
    panels: Mapped[list[dict[str, Any]]] = mapped_column(
        JSONType,
        nullable=False,
        server_default="[]",
        default=list,
    )

    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )


class SavedStatistic(Base):
    """A figure the user has defined for themselves (US-3.8).

    "Average of Hours in Lab practicals" is a question worth asking again
    next week, so the formula is saved under a name and evaluated fresh each
    time the Statistics page loads. The expression is stored canonicalised —
    every field written by id, exactly as a computed field's expression is —
    so renaming a field never silently breaks a saved stat. It belongs to
    both a user and a project: the project supplies the entries and the
    fields the formula reads, and deleting either takes the stat with it.
    """

    __tablename__ = "saved_statistics"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)

    user_id: Mapped[UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    project_id: Mapped[UUID] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    name: Mapped[str] = mapped_column(String(100), nullable=False)

    # e.g. "avg({f-hours})" — ids, not names, for the same reason as computed
    # fields: a rename is a label change and must not break the formula.
    expression: Mapped[str] = mapped_column(String(500), nullable=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
    )

    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )


class Dashboard(Base):
    """A user's own arrangement of saved statistics and views (US-3.9).

    One dashboard per user, not a list of named dashboards to switch
    between — the story asks for "a dashboard of my own", singular. Panels
    are stored as an ordered JSON list rather than their own table so that
    adding, removing, and reordering are all the same operation from the
    client's side: send the new full list. See schemas.py's DashboardPanel
    for the shape of each entry and per-type config validation.
    """

    __tablename__ = "dashboards"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)

    user_id: Mapped[UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
        index=True,
    )

    # [{"id": "...", "type": "saved_filter" | "board" | "statistic",
    #   "title": "...", "config": {...}}, ...], in display order.
    panels: Mapped[list[dict[str, Any]]] = mapped_column(
        JSONType,
        nullable=False,
        server_default="[]",
        default=list,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
    )

    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )


class GoogleCalendarAccount(Base):
    __tablename__ = "google_calendar_accounts"
    __table_args__ = (UniqueConstraint("user_id", "calendar_id"),)
    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    calendar_id: Mapped[str] = mapped_column(String(512))
    label: Mapped[str] = mapped_column(String(512))
    refresh_token: Mapped[str] = mapped_column(String(512))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


class CalendarActivity(Base):
    __tablename__ = "calendar_activities"
    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    title: Mapped[str] = mapped_column(String(255))
    description: Mapped[str] = mapped_column(String(4000), default="")
    day: Mapped[date] = mapped_column(Date, index=True)
    all_day: Mapped[bool] = mapped_column(Boolean, default=False)
    start_time: Mapped[str | None] = mapped_column(String(5), nullable=True)
    end_time: Mapped[str | None] = mapped_column(String(5), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


class LoginSession(Base):
    __tablename__ = "login_sessions"
    token_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


# ── Entry automation (US-3.12) ───────────────────────────────────────────────


class EntryRule(Base):
    """A rule the logbook applies by itself when a new entry is captured.

    ``conditions`` use the same shape as a structured search (US-3.11), so a
    rule reads exactly like a saved search: "when an entry matches this, do
    that". ``actions`` is a small closed set — add tags, fill a field, mark as
    to-do — validated against the project's schema when the rule is saved and
    checked again when it runs, because the schema can change in between.

    Rules act only at capture. Re-running them on every edit would fight the
    person editing: a tag they removed on purpose would come straight back.
    """

    __tablename__ = "entry_rules"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    project_id: Mapped[UUID] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    enabled: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default="true"
    )
    match: Mapped[str] = mapped_column(String(3), nullable=False, default="all", server_default="all")
    conditions: Mapped[list[dict[str, Any]]] = mapped_column(
        JSONType, nullable=False, default=list, server_default="[]"
    )
    actions: Mapped[list[dict[str, Any]]] = mapped_column(
        JSONType, nullable=False, default=list, server_default="[]"
    )
    created_by: Mapped[UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )


class EntryRecurrence(Base):
    """Makes an entry repeat: daily, weekly or monthly, every ``interval`` periods.

    The source entry is the template — each occurrence copies its *current*
    title and values, so editing the source changes what future occurrences
    look like without touching the ones already created.

    Occurrence n falls on ``starts_on + n * period``, always counted from the
    anchor rather than from the previous occurrence, so a monthly entry that
    starts on the 31st lands on the last day of shorter months and returns to
    the 31st afterwards instead of drifting earlier every month.
    """

    __tablename__ = "entry_recurrences"
    __table_args__ = (UniqueConstraint("entry_id", name="uq_entry_recurrences_entry"),)

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    entry_id: Mapped[UUID] = mapped_column(
        ForeignKey("entries.id", ondelete="CASCADE"), nullable=False
    )
    project_id: Mapped[UUID] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True
    )
    frequency: Mapped[str] = mapped_column(String(10), nullable=False)
    interval: Mapped[int] = mapped_column(Integer, nullable=False, default=1, server_default="1")
    starts_on: Mapped[date] = mapped_column(Date, nullable=False)
    ends_on: Mapped[date | None] = mapped_column(Date, nullable=True)
    # Index of the next occurrence to create (the source entry is occurrence 0)
    # and the date it falls on. The date is derivable from the index, but it is
    # stored so "what is due?" is an indexed comparison rather than a
    # calculation over every recurrence.
    next_index: Mapped[int] = mapped_column(Integer, nullable=False, default=1, server_default="1")
    next_on: Mapped[date | None] = mapped_column(Date, nullable=True, index=True)
    active: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default="true"
    )
    created_by: Mapped[UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )


class RecurrenceOccurrence(Base):
    """One occurrence a recurrence has already produced.

    The unique (recurrence, date) pair is what makes creating occurrences safe
    to run from any request, any number of times, in any number of worker
    processes: a second attempt at the same date fails the constraint instead
    of producing a duplicate entry. ``entry_id`` is cleared rather than the row
    deleted when someone deletes the entry, so a deleted occurrence stays
    deleted instead of being recreated on the next check.
    """

    __tablename__ = "recurrence_occurrences"
    __table_args__ = (
        UniqueConstraint("recurrence_id", "occurrence_on", name="uq_recurrence_occurrences_date"),
    )

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    recurrence_id: Mapped[UUID] = mapped_column(
        ForeignKey("entry_recurrences.id", ondelete="CASCADE"), nullable=False, index=True
    )
    occurrence_on: Mapped[date] = mapped_column(Date, nullable=False)
    entry_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("entries.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
