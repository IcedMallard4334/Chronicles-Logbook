import uuid
from datetime import date, datetime, timezone
from enum import Enum
from typing import Annotated, Any, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.computed import (
    MAX_EXPRESSION_LENGTH,
    ExpressionError,
    canonicalize_expression,
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
    TAGS = "tags"
    CHECKLIST = "checklist"
    LINK = "link"
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


class TagsFieldDefinition(BaseFieldDefinition):
    """A free-form tag field. Entry values are stored as a list of strings."""

    type: Literal[FieldType.TAGS] = FieldType.TAGS


class ChecklistFieldDefinition(BaseFieldDefinition):
    """A checklist field. Entry values are a list of {id, text, completed} items."""

    type: Literal[FieldType.CHECKLIST] = FieldType.CHECKLIST


class LinkFieldDefinition(BaseFieldDefinition):
    """A link to another entry. The entry value is a UUID string referencing
    another entry id. Links are bidirectional — the backend resolves and
    cleans up broken links when entries are deleted."""

    type: Literal[FieldType.LINK] = FieldType.LINK


class ProjectReferenceFieldDefinition(BaseFieldDefinition):
    type: Literal[FieldType.PROJECT_REFERENCE] = FieldType.PROJECT_REFERENCE

    # The project every entry in this schema points at. The link is a fact
    # about the project rather than a per-entry answer, so it is chosen here,
    # in the schema, and derived onto entries when they are written. Kept
    # optional at the model level so schemas saved before this existed — and
    # export files from them — still load; the endpoints that save a schema
    # require it.
    linked_project_id: UUID | None = None


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
    | TagsFieldDefinition
    | ChecklistFieldDefinition
    | LinkFieldDefinition
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

    # Calculations refer to fields by name, so a brace in a name would be read
    # as half a reference.
    for field in entry_schema:
        if "{" in field.name or "}" in field.name:
            raise ValueError(
                f"Field '{field.name}' cannot contain braces, because a calculation "
                "refers to a field by its name."
            )

    try:
        validate_computed_fields([field.model_dump(mode="json") for field in entry_schema])
    except ExpressionError as error:
        raise ValueError(str(error)) from error

    # An expression is written by name but stored by field id: a rename would
    # otherwise leave every calculation that mentions the field referring to
    # a name that no longer exists. Canonicalised here, after validation, so
    # every route that saves a schema stores the same form — and a rename
    # never reports itself as "worked out differently".
    dumped = [field.model_dump(mode="json") for field in entry_schema]
    for field in entry_schema:
        if not isinstance(field, ComputedFieldDefinition):
            continue
        canonical = canonicalize_expression(field.expression, dumped)
        if len(canonical) > MAX_EXPRESSION_LENGTH:
            # Names are usually shorter than ids, so an expression at the
            # limit could grow past it when written out in full. Refused here
            # rather than stored, where it would fail every entry written
            # against it with an error far from its cause.
            raise ValueError(
                f"Field '{field.name}' is worked out from too many other fields to store."
            )
        field.expression = canonical


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
    schema_version: int
    # Definitions for fields that have been removed from the schema, so the
    # values kept under them can still be labelled (US-2.7).
    retired_schema: list[FieldDefinition] = Field(default_factory=list)
    total_time_spent: int = 0
    created_at: datetime
    updated_at: datetime
    # True when the caller reaches this project through a share rather than
    # owning it, so the UI can hide the actions only an owner may take.
    shared: bool = False


# ── Sharing a project (US-2.20) ──────────────────────────────────────────────


class ProjectShareRequest(BaseModel):
    email: str


class ProjectMemberResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    user_id: UUID
    full_name: str
    email: str
    avatar_url: str | None = None
    # "pending" until the person accepts, so the owner can see an invitation
    # is out rather than assuming access they have not agreed to.
    status: Literal["pending", "accepted", "declined"] = "accepted"
    invited_at: datetime | None = None


class ProjectInvitationResponse(BaseModel):
    """An invitation as the person being invited sees it.

    Carries the project and the inviter by name: "Thandi invited you to
    Fieldwork" is something you can answer, and a pair of ids is not.
    """

    project_id: UUID
    project_name: str
    project_description: str | None = None
    invited_by_name: str | None = None
    entry_count: int = 0
    invited_at: datetime


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
        "added",
        "removed",
        "renamed",
        "retyped",
        "options_changed",
        "expression_changed",
        "link_changed",
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

    # US-2.15: an entry can be logged as work still to do, with an optional
    # deadline, so it can be surfaced in the outstanding-work view.
    todo: bool = False
    due_date: date | None = None

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
    todo: bool | None = None
    due_date: date | None = None


class EntryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    project_id: UUID
    data: dict[str, Any]
    schema_version: int
    schema_snapshot: list[dict[str, Any]] = Field(default_factory=list)
    # Values recorded under fields that have since left the schema. Returned so
    # that "removed but not destroyed" is something the owner can see rather
    # than only something the database knows (US-2.7).
    retired_data: dict[str, Any] = Field(default_factory=dict)
    time_spent: int | None
    todo: bool = False
    due_date: date | None = None
    # Who logged it. Null on entries written before a project could be shared,
    # so the UI has to render "unknown" as readably as a name.
    created_by: UUID | None = None
    created_by_name: str | None = None
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
    # Who added it, and who ticked it off. completed_by is cleared when a task
    # is reopened, so it always describes the completion currently standing.
    created_by: UUID | None = None
    created_by_name: str | None = None
    completed_by: UUID | None = None
    completed_by_name: str | None = None
    created_at: datetime
    updated_at: datetime


# ── Saved filters ────────────────────────────────────────────────


class FilterCriteria(BaseModel):
    """The parts of the entries view a saved filter can restore.

    Extra keys are forbidden so a saved filter cannot smuggle unexpected
    query parameters back into the search endpoint when it is re-applied.
    """

    model_config = ConfigDict(extra="forbid")

    q: str | None = Field(default=None, max_length=255)
    project_id: UUID | None = None
    todo: bool | None = None
    sort: Literal["newest", "oldest", "due_date"] = "newest"

    @model_validator(mode="after")
    def clean_keyword(self):
        if self.q is not None:
            self.q = self.q.strip() or None
        return self


class SavedFilterCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    criteria: FilterCriteria

    @model_validator(mode="after")
    def clean_name(self):
        self.name = self.name.strip()
        if not self.name:
            raise ValueError("Filter name cannot be blank.")
        return self


class SavedFilterResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    criteria: FilterCriteria
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
    # The format this entry was written under. A project's format changes over
    # time and past entries keep their own, so an export that carried only the
    # project's current one would restore a logbook whose older half no longer
    # has labels for what it recorded.
    schema_version: int = 1
    schema_snapshot: list[dict[str, Any]] = Field(default_factory=list)
    todo: bool = False
    due_date: date | None = None
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
    current_streak: int = 0
    longest_streak: int = 0
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
    # A run of consecutive days with at least one entry (basic tier: "where a
    # run of days has been kept up"). current_streak is the run that reaches
    # today or yesterday — it is still alive if nothing was written yet today.
    # A run that ended two or more days ago has been broken and reads as 0.
    current_streak: int = 0
    longest_streak: int = 0
    first_entry_at: datetime | None
    last_entry_at: datetime | None


class StatisticsResponse(BaseModel):
    totals: StatisticsTotals
    projects: list[ProjectStatistics]


class FieldStatisticsGroup(BaseModel):
    value: Any
    count: int


class FieldStatistics(BaseModel):
    field_id: str
    name: str
    type: FieldType
    count: int
    total: float | None = None
    average: float | None = None
    minimum: float | None = None
    maximum: float | None = None
    groups: list[FieldStatisticsGroup] = Field(default_factory=list)
    # How many of the counted values were written under an earlier version of
    # this field. Shown so a total that looks low is explained rather than
    # mysterious: past entries keep the format they were written in, and a
    # figure recorded as text is still a figure.
    from_earlier_formats: int = 0
    # True once the field has left the live schema. Its statistics are still
    # worth reporting — the work it recorded happened — but it is no longer
    # being collected, and a reader should know that.
    retired: bool = False


class FieldStatisticsResponse(BaseModel):
    project_id: UUID
    schema_version: int
    fields: list[FieldStatistics]


class ActivityPoint(BaseModel):
    """Entries and time logged in one period, for the "over a week or a term"
    view the brief asks for."""

    period: str
    entries: int
    time_spent: int


class ActivityResponse(BaseModel):
    bucket: Literal["day", "week", "month"]
    start: date | None = None
    end: date | None = None
    points: list[ActivityPoint] = Field(default_factory=list)
class FieldTimelinePoint(BaseModel):
    entry_id: UUID
    created_at: datetime
    value: Any
    schema_version: int


class FieldTimelineResponse(BaseModel):
    project_id: UUID
    field_id: str
    field_name: str
    field_type: FieldType
    start: datetime | None = None
    end: datetime | None = None
    points: list[FieldTimelinePoint] = Field(default_factory=list)

class TimelineEntryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    project_id: UUID
    project_name: str
    data: dict[str, Any]
    time_spent: int | None
    todo: bool = False
    due_date: date | None = None
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

