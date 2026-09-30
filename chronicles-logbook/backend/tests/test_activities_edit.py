"""Editing saved activities."""

BASE = {"title": "Planning", "description": "", "day": "2026-09-30", "all_day": False, "start_time": "09:00", "end_time": "10:00"}
RANGE = {"start": "2026-09-01", "end": "2026-10-31"}


async def make(client, **over):
    response = await client.post("/calendar/activities", json={**BASE, **over})
    assert response.status_code == 201
    return response.json()["id"]


async def test_an_activity_can_be_edited_including_its_day_and_times(authenticated_client):
    identifier = await make(authenticated_client)

    response = await authenticated_client.put(
        f"/calendar/activities/{identifier}",
        json={**BASE, "title": "Planning (moved)", "day": "2026-10-02", "start_time": "13:00", "end_time": "14:30", "description": "New room"},
    )

    assert response.status_code == 200
    body = response.json()
    assert (body["title"], body["day"], body["start_time"], body["end_time"], body["description"]) == (
        "Planning (moved)", "2026-10-02", "13:00", "14:30", "New room",
    )
    listed = (await authenticated_client.get("/calendar/activities", params=RANGE)).json()
    assert [a["id"] for a in listed] == [identifier] and listed[0]["day"] == "2026-10-02"


async def test_an_edit_can_make_an_activity_all_day(authenticated_client):
    identifier = await make(authenticated_client)
    response = await authenticated_client.put(
        f"/calendar/activities/{identifier}", json={**BASE, "all_day": True, "start_time": None, "end_time": None}
    )
    assert response.json()["all_day"] is True and response.json()["start_time"] is None


async def test_an_edit_is_validated_like_a_new_activity(authenticated_client):
    identifier = await make(authenticated_client)
    url = f"/calendar/activities/{identifier}"

    assert (await authenticated_client.put(url, json={**BASE, "end_time": "08:00"})).status_code == 422
    assert (await authenticated_client.put(url, json={**BASE, "title": "   "})).status_code == 422
    assert (await authenticated_client.put(url, json={**BASE, "surprise": 1})).status_code == 422


async def test_only_the_owner_can_edit_an_activity(authenticated_client, second_authenticated_client):
    identifier = await make(authenticated_client)

    response = await second_authenticated_client.put(f"/calendar/activities/{identifier}", json={**BASE, "title": "Hijacked"})

    assert response.status_code == 404
    listed = (await authenticated_client.get("/calendar/activities", params=RANGE)).json()
    assert listed[0]["title"] == "Planning"


async def test_editing_a_missing_activity_is_a_404(authenticated_client):
    response = await authenticated_client.put("/calendar/activities/00000000-0000-0000-0000-000000000000", json=BASE)
    assert response.status_code == 404
