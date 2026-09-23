"""Tests for app.schemas."""

import uuid

import pytest

from app.schemas import (
    ComputedFieldDefinition,
    DropdownFieldDefinition,
    FieldType,
    NumberFieldDefinition,
    ProjectCreate,
    ProjectReferenceFieldDefinition,
    ProjectResponse,
    TextFieldDefinition,
)


def test_field_type_values():
    assert FieldType.TEXT == "text"
    assert FieldType.NUMBER == "number"
    assert FieldType.DATE == "date"
    assert FieldType.DROPDOWN == "dropdown"
    assert FieldType.PROJECT_REFERENCE == "project_reference"
    assert FieldType.COMPUTED == "computed"


def test_text_field_definition_defaults():
    field = TextFieldDefinition(name="Title")
    assert field.type == FieldType.TEXT
    assert field.name == "Title"
    assert field.id  # auto-generated UUID string


def test_dropdown_rejects_duplicate_options():
    with pytest.raises(ValueError, match="Dropdown options must be unique"):
        DropdownFieldDefinition(name="Status", options=["Open", "Open"])


def test_dropdown_rejects_empty_or_whitespace_options():
    with pytest.raises(ValueError, match="Dropdown options cannot be empty or whitespace"):
        DropdownFieldDefinition(name="Status", options=["Open", " "])


def test_project_create_valid():
    project = ProjectCreate(name="My Project", description="A test project")
    assert project.name == "My Project"
    assert project.description == "A test project"
    assert project.entry_schema == []


def test_project_create_rejects_duplicate_field_ids():
    field_id = str(uuid.uuid4())
    with pytest.raises(ValueError, match="Field IDs within entry_schema must be unique"):
        ProjectCreate(
            name="My Project",
            entry_schema=[
                TextFieldDefinition(name="Title", id=field_id),
                TextFieldDefinition(name="Subtitle", id=field_id),
            ],
        )


def test_project_create_rejects_duplicate_field_names():
    with pytest.raises(ValueError, match="Field names within entry_schema must be unique"):
        ProjectCreate(
            name="My Project",
            entry_schema=[
                TextFieldDefinition(name="Title"),
                TextFieldDefinition(name="title"),
            ],
        )


def test_project_create_with_dropdown():
    project = ProjectCreate(
        name="My Project",
        entry_schema=[
            DropdownFieldDefinition(name="Status", options=["Open", "Closed"]),
        ],
    )
    assert len(project.entry_schema) == 1
    assert project.entry_schema[0].name == "Status"


def test_project_response_has_required_fields():
    project_id = uuid.uuid4()
    now = "2026-08-11T12:00:00+00:00"
    data = {
        "id": project_id,
        "name": "Response Project",
        "description": None,
        "archived": False,
        "entry_schema": [],
        "schema_version": 1,
        "created_at": now,
        "updated_at": now,
    }
    response = ProjectResponse(**data)
    assert response.id == project_id
    assert response.name == "Response Project"
    assert response.archived is False


def test_project_reference_field_definition_defaults():
    field = ProjectReferenceFieldDefinition(name="Read for")
    assert field.type == FieldType.PROJECT_REFERENCE
    assert field.id


def test_computed_field_rejects_an_unparseable_expression():
    with pytest.raises(ValueError, match="incomplete or mistyped"):
        ComputedFieldDefinition(name="Total", expression="{a} *")


def test_computed_field_rejects_an_expression_that_is_not_arithmetic():
    with pytest.raises(ValueError, match=r"Only \+, -, \* and / can be used"):
        ComputedFieldDefinition(name="Total", expression="2 ** 32")


def test_computed_field_requires_an_expression():
    with pytest.raises(ValueError):
        ComputedFieldDefinition(name="Total", expression="")


def test_project_create_validates_computed_references_across_the_schema():
    """A single field cannot tell whether its references exist; only the whole
    schema can, so the check belongs to the project rather than the field."""
    with pytest.raises(ValueError, match="not in this schema"):
        ProjectCreate(
            name="My Project",
            entry_schema=[
                ComputedFieldDefinition(name="Total", expression="{field-gone} * 2"),
            ],
        )


def test_project_create_rejects_arithmetic_over_a_text_field():
    notes = TextFieldDefinition(name="Notes")
    with pytest.raises(ValueError, match="only be computed from number"):
        ProjectCreate(
            name="My Project",
            entry_schema=[
                notes,
                ComputedFieldDefinition(name="Total", expression=f"{{{notes.id}}} * 2"),
            ],
        )


def test_project_create_accepts_a_computed_field_over_a_number_field():
    hours = NumberFieldDefinition(name="Hours")
    project = ProjectCreate(
        name="My Project",
        entry_schema=[
            hours,
            ComputedFieldDefinition(name="Minutes", expression=f"{{{hours.id}}} * 60"),
        ],
    )
    assert project.entry_schema[1].type == FieldType.COMPUTED
