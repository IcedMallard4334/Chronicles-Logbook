"""Tests for app.models."""

from app.models import Project


def test_project_defaults():
    project = Project(name="Test Project")
    assert project.name == "Test Project"
    assert project.description is None
    assert project.entry_schema == []
    assert project.id is not None
    assert project.created_at is not None
    assert project.updated_at is not None
