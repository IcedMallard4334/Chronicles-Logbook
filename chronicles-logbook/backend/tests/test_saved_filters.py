"""Tests for the saved filter endpoints (US-2.12)."""

from uuid import uuid4


async def test_list_saved_filters_starts_empty(authenticated_client):
    response = await authenticated_client.get("/saved-filters")

    assert response.status_code == 200
    assert response.json() == []


async def test_save_filter_returns_the_stored_criteria(authenticated_client):
    response = await authenticated_client.post(
        "/saved-filters",
        json={"name": "Open bugs", "criteria": {"q": "bug", "todo": True}},
    )

    assert response.status_code == 201
    body = response.json()
    assert body["name"] == "Open bugs"
    assert body["criteria"]["q"] == "bug"
    assert body["criteria"]["todo"] is True
    # Unset criteria come back as their defaults, so re-applying a filter
    # always produces a fully specified search.
    assert body["criteria"]["project_id"] is None
    assert body["criteria"]["sort"] == "newest"


async def test_saved_filter_can_be_re_applied_to_the_search(authenticated_client):
    """The saved criteria are exactly the query the entries view sends back."""
    project = await authenticated_client.post(
        "/projects",
        json={"name": "Filtered Project", "entry_schema": []},
    )
    project_id = project.json()["id"]

    await authenticated_client.post(
        f"/projects/{project_id}/entries",
        json={"data": {}, "todo": True},
    )
    await authenticated_client.post(
        f"/projects/{project_id}/entries",
        json={"data": {}},
    )

    saved = await authenticated_client.post(
        "/saved-filters",
        json={
            "name": "Outstanding here",
            "criteria": {"project_id": project_id, "todo": True, "sort": "due_date"},
        },
    )
    criteria = saved.json()["criteria"]

    response = await authenticated_client.get(
        "/entries",
        params={
            "project_id": criteria["project_id"],
            "todo": criteria["todo"],
            "sort": criteria["sort"],
        },
    )

    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert data[0]["todo"] is True


async def test_a_saved_tag_filter_restores_the_tagged_entries(authenticated_client):
    """US-2.1: a tag filter is saved and re-applied like any other criterion."""
    project = await authenticated_client.post(
        "/projects",
        json={
            "name": "Tagged Project",
            "entry_schema": [
                {"id": "f-note", "name": "Note", "type": "text"},
                {"id": "f-tags", "name": "Tags", "type": "tags"},
            ],
        },
    )
    project_id = project.json()["id"]

    await authenticated_client.post(
        f"/projects/{project_id}/entries",
        json={"data": {"f-note": "Tagged", "f-tags": ["urgent"]}},
    )
    await authenticated_client.post(
        f"/projects/{project_id}/entries",
        json={"data": {"f-note": "Untagged", "f-tags": ["later"]}},
    )

    saved = await authenticated_client.post(
        "/saved-filters",
        json={"name": "Urgent work", "criteria": {"tag": "urgent"}},
    )
    assert saved.status_code == 201
    criteria = saved.json()["criteria"]
    assert criteria["tag"] == "urgent"

    response = await authenticated_client.get("/entries", params={"tag": criteria["tag"]})

    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert data[0]["data"]["f-note"] == "Tagged"


async def test_saving_over_an_existing_name_updates_it(authenticated_client):
    first = await authenticated_client.post(
        "/saved-filters",
        json={"name": "My view", "criteria": {"q": "alpha"}},
    )
    assert first.status_code == 201

    second = await authenticated_client.post(
        "/saved-filters",
        json={"name": "My view", "criteria": {"q": "beta"}},
    )

    assert second.status_code == 200
    assert second.json()["id"] == first.json()["id"]
    assert second.json()["criteria"]["q"] == "beta"

    listing = await authenticated_client.get("/saved-filters")
    assert len(listing.json()) == 1


async def test_save_filter_trims_the_name(authenticated_client):
    response = await authenticated_client.post(
        "/saved-filters",
        json={"name": "  Padded  ", "criteria": {}},
    )

    assert response.status_code == 201
    assert response.json()["name"] == "Padded"


async def test_save_filter_rejects_a_blank_name(authenticated_client):
    response = await authenticated_client.post(
        "/saved-filters",
        json={"name": "   ", "criteria": {}},
    )

    assert response.status_code == 422


async def test_save_filter_rejects_unknown_criteria(authenticated_client):
    response = await authenticated_client.post(
        "/saved-filters",
        json={"name": "Sneaky", "criteria": {"page_size": 1000}},
    )

    assert response.status_code == 422


async def test_save_filter_rejects_an_unknown_sort(authenticated_client):
    response = await authenticated_client.post(
        "/saved-filters",
        json={"name": "Bad sort", "criteria": {"sort": "whenever"}},
    )

    assert response.status_code == 422


async def test_save_filter_rejects_another_users_project(
    authenticated_client, second_authenticated_client
):
    project = await second_authenticated_client.post(
        "/projects",
        json={"name": "Private", "entry_schema": []},
    )
    project_id = project.json()["id"]

    response = await authenticated_client.post(
        "/saved-filters",
        json={"name": "Peek", "criteria": {"project_id": project_id}},
    )

    assert response.status_code == 404
    assert response.json()["detail"] == "Project not found"


async def test_saved_filters_are_scoped_to_their_owner(
    authenticated_client, second_authenticated_client
):
    await authenticated_client.post(
        "/saved-filters",
        json={"name": "Mine", "criteria": {"q": "mine"}},
    )

    response = await second_authenticated_client.get("/saved-filters")

    assert response.status_code == 200
    assert response.json() == []


async def test_delete_saved_filter(authenticated_client):
    saved = await authenticated_client.post(
        "/saved-filters",
        json={"name": "Temporary", "criteria": {}},
    )
    filter_id = saved.json()["id"]

    response = await authenticated_client.delete(f"/saved-filters/{filter_id}")

    assert response.status_code == 204
    assert (await authenticated_client.get("/saved-filters")).json() == []


async def test_delete_saved_filter_rejects_another_users_filter(
    authenticated_client, second_authenticated_client
):
    saved = await authenticated_client.post(
        "/saved-filters",
        json={"name": "Mine", "criteria": {}},
    )
    filter_id = saved.json()["id"]

    response = await second_authenticated_client.delete(f"/saved-filters/{filter_id}")

    assert response.status_code == 404
    # And the owner still has it.
    assert len((await authenticated_client.get("/saved-filters")).json()) == 1


async def test_delete_unknown_saved_filter_returns_404(authenticated_client):
    response = await authenticated_client.delete(f"/saved-filters/{uuid4()}")

    assert response.status_code == 404


async def test_saved_filters_require_authentication(async_client):
    assert (await async_client.get("/saved-filters")).status_code == 401
    assert (
        await async_client.post("/saved-filters", json={"name": "x", "criteria": {}})
    ).status_code == 401
