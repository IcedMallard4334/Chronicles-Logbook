from datetime import date, datetime, timezone
from typing import Any
from uuid import UUID, uuid4

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    String,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base, JSONType


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


class ProjectMember(Base):
    """Someone other than the owner who has been given access to a project.

    Membership grants reading the project and adding entries to it. Everything
    that reshapes or removes the project — editing the schema, archiving,
    deleting, exporting, and changing who else has access — stays with the
    owner, so a project cannot be restructured out from under the person whose
    record it is.
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

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
    )

    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )


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
