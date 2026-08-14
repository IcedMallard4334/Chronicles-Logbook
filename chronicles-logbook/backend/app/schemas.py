import uuid
from datetime import datetime
from enum import Enum
from typing import Annotated, Any, Literal
from uuid import UUID

from pydantic import (
    BaseModel,
    ConfigDict,
    EmailStr,
    Field,
    field_validator,
    model_validator,
)


class SignUpRequest(BaseModel):
    full_name: str = Field(..., min_length=1, max_length=100)
    email: EmailStr
    password: str = Field(..., min_length=8, max_length=128)

    @field_validator("full_name")
    @classmethod
    def clean_full_name(cls, value: str) -> str:
        cleaned = " ".join(value.split())
        if not cleaned:
            raise ValueError("Full name cannot be empty.")
        return cleaned

    @field_validator("email")
    @classmethod
    def normalise_email(cls, value: EmailStr) -> str:
        return str(value).strip().lower()


class SignInRequest(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=1, max_length=128)

    @field_validator("email")
    @classmethod
    def normalise_email(cls, value: EmailStr) -> str:
        return str(value).strip().lower()


class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    full_name: str
    email: EmailStr
    created_at: datetime


class AuthResponse(BaseModel):
    access_token: str
    token_type: Literal["bearer"] = "bearer"
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
    entry_schema: list[FieldDefinition]
    created_at: datetime
    updated_at: datetime


class EntryCreate(BaseModel):
    data: dict[str, Any]


class EntryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    project_id: UUID
    data: dict[str, Any]
    created_at: datetime
    updated_at: datetime
