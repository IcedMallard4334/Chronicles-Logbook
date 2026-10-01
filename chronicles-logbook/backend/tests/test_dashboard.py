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


# ── the grid: how wide it is and how much room each panel takes ──────


def _panel(identifier, **over):
    return {"id": identifier, "type": "statistic", "config": {"view": "overview"}, **over}


async def test_a_new_dashboard_is_three_blocks_wide_and_panels_default_to_one_by_two(authenticated_client):
    assert (await authenticated_client.get("/dashboard")).json()["columns"] == 3

    response = await authenticated_client.put("/dashboard", json={"panels": [_panel("p1")]})

    assert (response.json()["panels"][0]["w"], response.json()["panels"][0]["h"]) == (1, 2)


async def test_panel_sizes_and_the_grid_width_are_saved_and_read_back(authenticated_client):
    panels = [_panel("wide", w=3, h=1), _panel("tall", w=1, h=4)]

    await authenticated_client.put("/dashboard", json={"panels": panels, "columns": 4})
    read = (await authenticated_client.get("/dashboard")).json()

    assert read["columns"] == 4
    assert [(p["id"], p["w"], p["h"]) for p in read["panels"]] == [("wide", 3, 1), ("tall", 1, 4)]


async def test_leaving_columns_out_keeps_the_width_already_chosen(authenticated_client):
    await authenticated_client.put("/dashboard", json={"panels": [], "columns": 5})
    await authenticated_client.put("/dashboard", json={"panels": [_panel("p1")]})

    assert (await authenticated_client.get("/dashboard")).json()["columns"] == 5


async def test_a_panel_cannot_be_wider_than_the_grid(authenticated_client):
    response = await authenticated_client.put(
        "/dashboard", json={"panels": [_panel("p1", w=5)], "columns": 2}
    )

    assert response.json()["panels"][0]["w"] == 2


async def test_sizes_and_widths_outside_the_allowed_range_are_rejected(authenticated_client):
    for bad in ({"w": 0}, {"w": 7}, {"h": 0}, {"h": 5}):
        response = await authenticated_client.put("/dashboard", json={"panels": [_panel("p1", **bad)]})
        assert response.status_code == 422, bad
    for columns in (1, 7):
        response = await authenticated_client.put("/dashboard", json={"panels": [], "columns": columns})
        assert response.status_code == 422, columns


async def test_projects_and_badges_panels_are_accepted(authenticated_client):
    panels = [
        {"id": "p-all", "type": "projects", "config": {}},
        {"id": "p-one", "type": "projects", "config": {"project_id": str(uuid4())}},
        {"id": "b", "type": "badges", "config": {}},
    ]

    response = await authenticated_client.put("/dashboard", json={"panels": panels})

    assert response.status_code == 200
    assert [panel["type"] for panel in response.json()["panels"]] == ["projects", "projects", "badges"]


async def test_a_projects_panel_rejects_a_bad_project_id(authenticated_client):
    response = await authenticated_client.put(
        "/dashboard", json={"panels": [{"id": "x", "type": "projects", "config": {"project_id": "nope"}}]}
    )

    assert response.status_code == 422
