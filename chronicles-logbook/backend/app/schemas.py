import uuid
from datetime import date, datetime
from enum import Enum
from typing import Annotated, Any, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator


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


FieldDefinition = Annotated[
    TextFieldDefinition
    | NumberFieldDefinition
    | DateFieldDefinition
    | DropdownFieldDefinition,
    Field(discriminator="type"),
]


class ProjectCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    description: str | None = None
    entry_schema: list[FieldDefinition] = Field(default_factory=list)

    @model_validator(mode="after")
    def validate_schema_integrity(self):
        field_ids = [f.id for f in self.entry_schema]
        if len(field_ids) != len(set(field_ids)):
            raise ValueError("Field IDs within entry_schema must be unique.")

        field_names = [f.name.strip().lower() for f in self.entry_schema]
        if len(field_names) != len(set(field_names)):
            raise ValueError("Field names within entry_schema must be unique.")

        return self


class ProjectUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = None
    entry_schema: list[FieldDefinition] | None = None

    @model_validator(mode="after")
    def validate_schema_integrity(self):
        if self.entry_schema is not None:
            field_ids = [f.id for f in self.entry_schema]
            if len(field_ids) != len(set(field_ids)):
                raise ValueError("Field IDs within entry_schema must be unique.")

            field_names = [f.name.strip().lower() for f in self.entry_schema]
            if len(field_names) != len(set(field_names)):
                raise ValueError("Field names within entry_schema must be unique.")

        return self


class ProjectResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    description: str | None
    archived: bool
    entry_schema: list[FieldDefinition]
    total_time_spent: int = 0
    created_at: datetime
    updated_at: datetime


class EntryCreate(BaseModel):
    data: dict[str, Any]
    time_spent: int | None = Field(default=None, ge=0)


class EntryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    project_id: UUID
    data: dict[str, Any]
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
