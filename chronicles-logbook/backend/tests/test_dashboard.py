"""Tests for the user's own dashboard of panels (US-3.9)."""

from uuid import uuid4


async def test_dashboard_requires_authentication(async_client):
    assert (await async_client.get("/dashboard")).status_code == 401
    assert (await async_client.put("/dashboard", json={"panels": []})).status_code == 401


async def test_first_visit_creates_an_empty_dashboard(authenticated_client):
    response = await authenticated_client.get("/dashboard")
    assert response.status_code == 200
    assert response.json()["panels"] == []


async def test_put_replaces_panels_and_preserves_order(authenticated_client):
    project_id = str(uuid4())
    filter_id = str(uuid4())
    panels = [
        {
            "id": "panel-1",
            "type": "board",
            "title": "My board",
            "config": {"project_id": project_id, "grouping": "__status__"},
        },
        {
            "id": "panel-2",
            "type": "saved_filter",
            "config": {"filter_id": filter_id},
        },
        {
            "id": "panel-3",
            "type": "statistic",
            "config": {"view": "overview"},
        },
    ]

    put_response = await authenticated_client.put("/dashboard", json={"panels": panels})
    assert put_response.status_code == 200
    assert [panel["id"] for panel in put_response.json()["panels"]] == [
        "panel-1",
        "panel-2",
        "panel-3",
    ]

    # Persisted, not just echoed back: a fresh GET sees the same layout.
    get_response = await authenticated_client.get("/dashboard")
    assert get_response.status_code == 200
    assert [panel["id"] for panel in get_response.json()["panels"]] == [
        "panel-1",
        "panel-2",
        "panel-3",
    ]

    # Reordering is just sending a new full list.
    reordered = [panels[2], panels[0], panels[1]]
    reorder_response = await authenticated_client.put("/dashboard", json={"panels": reordered})
    assert [panel["id"] for panel in reorder_response.json()["panels"]] == [
        "panel-3",
        "panel-1",
        "panel-2",
    ]


async def test_rejects_an_unknown_panel_type(authenticated_client):
    response = await authenticated_client.put(
        "/dashboard",
        json={"panels": [{"id": "panel-1", "type": "custom_statistic", "config": {}}]},
    )
    assert response.status_code == 422


async def test_rejects_a_board_panel_missing_its_project(authenticated_client):
    response = await authenticated_client.put(
        "/dashboard",
        json={"panels": [{"id": "panel-1", "type": "board", "config": {}}]},
    )
    assert response.status_code == 422


async def test_rejects_a_statistic_panel_with_an_unknown_view(authenticated_client):
    response = await authenticated_client.put(
        "/dashboard",
        json={"panels": [{"id": "panel-1", "type": "statistic", "config": {"view": "made_up"}}]},
    )
    assert response.status_code == 422


async def test_each_user_has_their_own_dashboard(authenticated_client, second_authenticated_client):
    await authenticated_client.put(
        "/dashboard",
        json={"panels": [{"id": "panel-1", "type": "statistic", "config": {"view": "overview"}}]},
    )

    second_response = await second_authenticated_client.get("/dashboard")
    assert second_response.status_code == 200
    assert second_response.json()["panels"] == []
