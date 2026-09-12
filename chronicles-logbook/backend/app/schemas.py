import uuid
from datetime import date, datetime, timezone
from enum import Enum
from typing import Annotated, Any, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.computed import (
    MAX_EXPRESSION_LENGTH,
    ExpressionError,
    compile_expression,
    validate_computed_fields,
)


class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    full_name: str
    email: str
    avatar_url: str | None
    created_at: datetime


class AuthResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse


class FieldType(str, Enum):
    TEXT = "text"
    NUMBER = "number"
    DATE = "date"
    DROPDOWN = "dropdown"
    # US-2.4: a pointer to another of the owner's projects, for work that
    # spans more than one of them.
    PROJECT_REFERENCE = "project_reference"
    # US-2.5: a value derived from other fields on the same entry rather than
    # typed in.
    COMPUTED = "computed"


class BaseFieldDefinition(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str = Field(..., min_length=1, max_length=100, description="Display label for the field")


class TextFieldDefinition(BaseFieldDefinition):
    type: Literal[FieldType.TEXT] = FieldType.TEXT


class NumberFieldDefinition(BaseFieldDefinition):
    type: Literal[FieldType.NUMBER] = FieldType.NUMBER


class DateFieldDefinition(BaseFieldDefinition):
    type: Literal[FieldType.DATE] = FieldType.DATE


class DropdownFieldDefinition(BaseFieldDefinition):
    type: Literal[FieldType.DROPDOWN] = FieldType.DROPDOWN
    options: list[str] = Field(..., min_length=1)

    @model_validator(mode="after")
    def validate_unique_options(self):
        cleaned_options = [opt.strip() for opt in self.options if opt.strip()]
        if len(cleaned_options) != len(self.options):
            raise ValueError("Dropdown options cannot be empty or whitespace.")
        if len(cleaned_options) != len(set(cleaned_options)):
            raise ValueError("Dropdown options must be unique.")
        return self


class ProjectReferenceFieldDefinition(BaseFieldDefinition):
    type: Literal[FieldType.PROJECT_REFERENCE] = FieldType.PROJECT_REFERENCE


class ComputedFieldDefinition(BaseFieldDefinition):
    type: Literal[FieldType.COMPUTED] = FieldType.COMPUTED

    # Arithmetic over other fields on the same entry, which are written as
    # {field-id}. See app.computed for the grammar and why it is this narrow.
    expression: str = Field(..., min_length=1, max_length=MAX_EXPRESSION_LENGTH)

    @model_validator(mode="after")
    def validate_expression_is_parseable(self):
        # Only checks that the expression itself is well formed. Whether the
        # fields it refers to exist, and that they do not form a cycle, can
        # only be answered against the whole schema — see
        # validate_schema_integrity below.
        try:
            compile_expression(self.expression)
        except ExpressionError as error:
            raise ValueError(str(error)) from error
        return self


FieldDefinition = Annotated[
    TextFieldDefinition
    | NumberFieldDefinition
    | DateFieldDefinition
    | DropdownFieldDefinition
    | ProjectReferenceFieldDefinition
    | ComputedFieldDefinition,
    Field(discriminator="type"),
]


def _validate_schema_integrity(entry_schema: list[FieldDefinition]) -> None:
    """Check the rules that only make sense across a whole schema.

    Shared by every model that accepts an ``entry_schema``, so a schema saved
    through project creation, a project update or a schema change is held to
    the same standard.
    """
    field_ids = [field.id for field in entry_schema]
    if len(field_ids) != len(set(field_ids)):
        raise ValueError("Field IDs within entry_schema must be unique.")

    field_names = [field.name.strip().lower() for field in entry_schema]
    if len(field_names) != len(set(field_names)):
        raise ValueError("Field names within entry_schema must be unique.")

    try:
        validate_computed_fields([field.model_dump(mode="json") for field in entry_schema])
    except ExpressionError as error:
        raise ValueError(str(error)) from error


class ProjectCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    description: str | None = None
    entry_schema: list[FieldDefinition] = Field(default_factory=list)

    @model_validator(mode="after")
    def validate_schema_integrity(self):
        _validate_schema_integrity(self.entry_schema)
        return self


class ProjectUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = None
    entry_schema: list[FieldDefinition] | None = None

    @model_validator(mode="after")
    def validate_schema_integrity(self):
        if self.entry_schema is not None:
            _validate_schema_integrity(self.entry_schema)
        return self


class ProjectResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    description: str | None
    archived: bool
    entry_schema: list[FieldDefinition]
    # Definitions for fields that have been removed from the schema, so the
    # values kept under them can still be labelled (US-2.7).
    retired_schema: list[FieldDefinition] = Field(default_factory=list)
    total_time_spent: int = 0
    created_at: datetime
    updated_at: datetime


# ── Editing a live schema (US-2.6, US-2.7) ───────────────────────────────────


class SchemaChangeRequest(BaseModel):
    """A proposed replacement for a project's entry_schema."""

    entry_schema: list[FieldDefinition]

    @model_validator(mode="after")
    def validate_schema_integrity(self):
        _validate_schema_integrity(self.entry_schema)
        return self


class SchemaChange(BaseModel):
    """One difference an edit would make, and what it costs.

    ``severity`` is decided by the server so that the review screen and the
    API cannot disagree about what is worth stopping for.
    """

    kind: Literal[
        "added", "removed", "renamed", "retyped", "options_changed", "expression_changed"
    ]
    field_id: str
    field_name: str
    description: str
    severity: Literal["info", "warning"]
    entries_affected: int = 0
    values_coerced: int = 0
    values_retired: int = 0


class SchemaChangePreview(BaseModel):
    """What an edit would do, before it is done."""

    entry_count: int
    entries_affected: int
    changes: list[SchemaChange]


class SchemaChangeResult(SchemaChangePreview):
    """What an edit did, with the project as it now stands."""

    project: ProjectResponse


class EntryCreate(BaseModel):
    data: dict[str, Any]
    time_spent: int | None = Field(default=None, ge=0)

    # Both fields are optional and omitted by ordinary online capture, where
    # the server assigns them. They exist for two callers that already know
    # the entry's identity and real capture time:
    #   - offline sync (US-2.16), so a replayed request is idempotent rather
    #     than creating a duplicate;
    #   - import (US-2.17), so a restored logbook keeps its original history
    #     instead of collapsing onto the import date.
    id: UUID | None = None
    created_at: datetime | None = None

    @model_validator(mode="after")
    def normalise_created_at(self):
        if self.created_at is None:
            return self

        # A device that was offline may hand us a naive timestamp. Treat it
        # as UTC rather than letting the database guess.
        if self.created_at.tzinfo is None:
            self.created_at = self.created_at.replace(tzinfo=timezone.utc)

        # Guard against a skewed device clock. A future-dated entry would sit
        # at the top of the timeline permanently, and the user has no way to
        # correct it once it is stored.
        now = datetime.now(timezone.utc)
        if self.created_at > now:
            raise ValueError("created_at cannot be in the future.")

        return self


class EntryUpdate(BaseModel):
    """Partial update for an existing entry.

    ``created_at`` is deliberately absent: an entry's capture time is set
    once, at creation, and is not rewritable afterwards.
    """

    data: dict[str, Any] | None = None
    time_spent: int | None = Field(default=None, ge=0)


class EntryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    project_id: UUID
    data: dict[str, Any]
    # Values recorded under fields that have since left the schema. Returned so
    # that "removed but not destroyed" is something the owner can see rather
    # than only something the database knows (US-2.7).
    retired_data: dict[str, Any] = Field(default_factory=dict)
    time_spent: int | None
    created_at: datetime
    updated_at: datetime


# ── Tasks ────────────────────────────────────────────────────────────


class ChecklistItem(BaseModel):
    id: str
    text: str
    completed: bool = False


class TaskCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=255)
    description: str | None = None
    due_date: date | None = None
    checklist: list[ChecklistItem] = Field(default_factory=list)


class TaskUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = None
    due_date: date | None = None
    completed: bool | None = None
    checklist: list[ChecklistItem] | None = None


class TaskResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    project_id: UUID
    title: str
    description: str | None
    due_date: date | None
    completed: bool
    checklist: list[ChecklistItem]
    created_at: datetime
    updated_at: datetime


# ── Export and import ────────────────────────────────────────────────

# Marks a file as ours, so importing an unrelated JSON document fails with a
# clear message rather than a confusing validation error.
EXPORT_FORMAT = "chronicles-export"
EXPORT_VERSION = 1


class ExportedEntry(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    data: dict[str, Any]
    # Both retired collections default to empty so that files written before
    # schema editing existed still import cleanly. Carrying them keeps the
    # export a full record: a round trip that dropped them would destroy the
    # history that removing a field was careful to keep (US-2.7).
    retired_data: dict[str, Any] = Field(default_factory=dict)
    time_spent: int | None = None
    created_at: datetime


class ExportedProject(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    description: str | None = None
    archived: bool = False
    entry_schema: list[FieldDefinition] = Field(default_factory=list)
    retired_schema: list[FieldDefinition] = Field(default_factory=list)
    created_at: datetime
    entries: list[ExportedEntry] = Field(default_factory=list)


class ExportDocument(BaseModel):
    format: Literal["chronicles-export"] = EXPORT_FORMAT
    version: int = EXPORT_VERSION
    exported_at: datetime
    projects: list[ExportedProject] = Field(default_factory=list)


class ImportSummary(BaseModel):
    projects_created: int = 0
    projects_reused: int = 0
    entries_created: int = 0
    entries_skipped: int = 0
    # Entries that could not be restored, each with the reason. Reported
    # rather than silently dropped, for the same reason offline sync surfaces
    # rejections: the user needs to know what did not come back.
    issues: list[str] = Field(default_factory=list)


# ── Statistics ───────────────────────────────────────────────────────


class ProjectStatistics(BaseModel):
    project_id: UUID
    name: str
    archived: bool
    entries: int
    time_spent: int
    active_days: int
    first_entry_at: datetime | None
    last_entry_at: datetime | None


class StatisticsTotals(BaseModel):
    projects: int
    active_projects: int
    archived_projects: int
    entries: int
    time_spent: int
    # Distinct days with at least one entry across the whole logbook. This is
    # not the sum of the per-project figures: a day worked on two projects
    # counts once here and once in each project.
    active_days: int
    first_entry_at: datetime | None
    last_entry_at: datetime | None


class StatisticsResponse(BaseModel):
    totals: StatisticsTotals
    projects: list[ProjectStatistics]


class TimelineEntryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    project_id: UUID
    project_name: str
    data: dict[str, Any]
    time_spent: int | None
    created_at: datetime
    updated_at: datetime


# ── Google Calendar ─────────────────────────────────────────────────


class GoogleCalendarAccountResponse(BaseModel):
    id: str
    label: str


class GoogleCalendarStatus(BaseModel):
    connected: bool
    accounts: list[GoogleCalendarAccountResponse] = Field(default_factory=list)


class GoogleCalendarEvent(BaseModel):
    id: str
    summary: str
    start: str
    end: str
    all_day: bool
    color: str | None = None
    html_link: str | None = None
    location: str | None = None


class AIChatRequest(BaseModel):
    """Message sent by a Chronicles user to the AI assistant."""

    message: str = Field(min_length=1, max_length=2000)


class AIChatResponse(BaseModel):
    """A text reply or a user-confirmed proposal from the AI assistant."""

    model_config = ConfigDict(extra="forbid")

    reply: str | None = None
    action: "AIProjectActionProposal | None" = None

    @model_validator(mode="after")
    def validate_single_response_kind(self):
        if (self.reply is None) == (self.action is None):
            raise ValueError("An AI response must contain one reply or one action.")
        return self


class AIProjectActionPayload(BaseModel):
    """Safe, allowlisted arguments for a proposed project."""

    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=255)
    description: str | None = Field(default=None, max_length=4000)

    @model_validator(mode="after")
    def clean_values(self):
        self.name = self.name.strip()
        if not self.name:
            raise ValueError("Project name cannot be blank.")
        if self.description is not None:
            self.description = self.description.strip() or None
        return self


class AIProjectActionProposal(BaseModel):
    """The only action Mira may propose during Phase 2."""

    model_config = ConfigDict(extra="forbid")

    type: Literal["create_project"]
    payload: AIProjectActionPayload
    requires_confirmation: Literal[True] = True
