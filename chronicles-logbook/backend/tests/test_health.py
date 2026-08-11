"""
Covers acceptance test #1 for US7:
"Given the backend is deployed, When a health-check endpoint is called,
Then it returns a 200 response."

Run with: pytest
"""
import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture
def client():
    # Using the context-manager form triggers FastAPI's lifespan startup
    # (which runs Base.metadata.create_all) before requests are made.
    with TestClient(app) as test_client:
        yield test_client


def test_health_check_returns_200(client):
    response = client.get("/api/v1/health")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"


def test_project_create_and_list_round_trip(client):
    # Exercises the DB connection end-to-end, not just that the route exists.
    create_response = client.post("/api/v1/projects", json={"name": "Thesis", "description": "Final year project"})
    assert create_response.status_code == 201
    created = create_response.json()["data"]
    assert created["name"] == "Thesis"
    assert created["schema_definition"] == []

    list_response = client.get("/api/v1/projects")
    assert list_response.status_code == 200
    names = [p["name"] for p in list_response.json()["data"]]
    assert "Thesis" in names


def test_unknown_route_error_shape_is_consistent(client):
    response = client.get("/api/v1/projects/00000000-0000-0000-0000-000000000000")
    assert response.status_code == 404
    body = response.json()
    assert body["error"]["code"] == "NOT_FOUND"
