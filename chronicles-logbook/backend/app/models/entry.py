import uuid

from sqlalchemy import JSON, ForeignKey, Integer
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.base import GUID, TimestampMixin


class Entry(Base, TimestampMixin):
    """
    A single logbook entry against a project.

    `data` holds the owner-defined fields (whatever Project.schema_definition
    says an entry should have) as a JSON blob — the API doesn't know the
    shape in advance, which is the whole point of a customisable logbook.
    Athalia's schema work validates what goes in here; this skeleton just
    provides the storage.

    `time_spent_minutes` is pulled out as a real column rather than left
    inside `data`, because Victor also owns US16/US17 (Time Tracking) later
    in the sprint, and having it queryable/summable directly (rather than
    reaching into JSON) is what makes `GET /projects/:id/time-total` a cheap
    aggregate query instead of a full-table scan.
    """
    __tablename__ = "entries"

    id: Mapped[uuid.UUID] = mapped_column(GUID(), primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(GUID(), ForeignKey("projects.id"), nullable=False, index=True)

    # Owner-defined fields, shaped by the project's schema_definition.
    data: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)

    # Time tracking (US16/US17) — stored in minutes to avoid float
    # arithmetic when summing; convert to hours/minutes display-side.
    time_spent_minutes: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    project: Mapped["Project"] = relationship(back_populates="entries")
