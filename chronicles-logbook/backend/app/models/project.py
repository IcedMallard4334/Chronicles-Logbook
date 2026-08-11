import uuid

from sqlalchemy import JSON, Boolean, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.base import GUID, TimestampMixin


class Project(Base, TimestampMixin):
    """
    A project the user is tracking work against.

    `schema_definition` is the field that makes the whole "customise your
    own entry format" idea (basic feature #1 in the project brief) possible.
    It's a JSON blob describing what fields an entry in THIS project has —
    e.g.:
        [
          {"name": "summary", "type": "text", "required": true},
          {"name": "hours_spent", "type": "number", "required": true},
          {"name": "blockers", "type": "text", "required": false}
        ]

    This skeleton just declares the column and defaults it to an empty list.
    Athalia (US10 — Define Entry Fields) owns the actual schema-builder UI
    and the POST /projects/:id/schema endpoint that populates it, and
    Athalia (US11) owns scoping it correctly when switching projects. The
    column needs to exist now so Entry.data has something to validate
    against once that lands.

    Uses the generic SQLAlchemy JSON type rather than Postgres's JSONB
    specifically, so this still works if DATABASE_URL is pointed at SQLite
    for local dev. On Postgres it's still stored efficiently.
    """
    __tablename__ = "projects"

    id: Mapped[uuid.UUID] = mapped_column(GUID(), primary_key=True, default=uuid.uuid4)
    owner_id: Mapped[uuid.UUID] = mapped_column(GUID(), ForeignKey("users.id"), nullable=False, index=True)

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_archived: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    # Owner-defined entry field definitions. Empty list = "no custom schema
    # yet, entries just have the built-in fields."
    schema_definition: Mapped[list] = mapped_column(JSON, default=list, nullable=False)

    owner: Mapped["User"] = relationship(back_populates="projects")
    entries: Mapped[list["Entry"]] = relationship(back_populates="project", cascade="all, delete-orphan")
