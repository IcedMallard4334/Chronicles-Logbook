"""Tests for app.routers.projects."""

import uuid
from unittest.mock import AsyncMock

from app.models import Project


def test_create_project(client, mock_session):
    response = client.post(
        "/projects",
        json={"name": "New Project", "description": "A test project", "entry_schema": []},
    )
    assert response.status_code == 201
    assert mock_session.add.called
    assert mock_session.commit.called
    assert mock_session.refresh.called


def test_get_project_found(client, mock_session):
    project_id = uuid.uuid4()
    mock_project = Project(name="Existing", description="Found it", entry_schema=[])
    mock_project.id = project_id
    mock_session.get = AsyncMock(return_value=mock_project)

    response = client.get(f"/projects/{project_id}")
    assert response.status_code == 200
    data = response.json()
    assert data["name"] == "Existing"
    assert data["description"] == "Found it"


def test_get_project_not_found(client, mock_session):
    project_id = uuid.uuid4()
    mock_session.get = AsyncMock(return_value=None)

    response = client.get(f"/projects/{project_id}")
    assert response.status_code == 404
    assert response.json()["detail"] == "Project not found"
