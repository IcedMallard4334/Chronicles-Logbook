"""Tests for app.models."""

from app.models import Project


def test_project_instantiation():
    project = Project(name="Test Project", entry_schema=[])
    assert project.name == "Test Project"
    assert project.description is None
    assert project.entry_schema == []
