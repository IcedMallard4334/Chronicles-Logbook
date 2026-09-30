"""Badges for milestones."""

from datetime import datetime, timedelta, timezone

from app.achievements import BY_KEY, CATALOGUE, CATEGORIES, TIERS
from app.models import UserActivityDay

FIELDS = [{"id": "hours", "name": "Hours", "type": "number"}]


def badge(body, key):
    return next(item for item in body["badges"] if item["key"] == key)


async def fetch(client):
    response = await client.get("/achievements")
    assert response.status_code == 200
    return response.json()


async def project(client, name="Log", **over):
    response = await client.post("/projects", json={"name": name, "entry_schema": FIELDS, **over})
    assert response.status_code == 201
    return response.json()


# ── the catalogue ──────────────────────────────────────────────────


def test_the_catalogue_is_well_formed():
    keys = [item.key for item in CATALOGUE]
    assert len(keys) == len(set(keys)) >= 30
    for item in CATALOGUE:
        assert item.tier in TIERS and item.category in CATEGORIES
        assert item.target >= 1 and item.name and item.blurb and item.how
    assert BY_KEY["hundred_hours"].name == "Century Clock" and BY_KEY["hundred_hours"].target == 100
    assert BY_KEY["login_10"].metric == "login_streak" and BY_KEY["activity_10"].metric == "activity_streak"
    assert {"first_project", "first_entry", "hundred_hours", "login_10", "activity_10"} <= set(keys)


# ── earning and celebrating ────────────────────────────────────────


async def test_requires_authentication(async_client):
    assert (await async_client.get("/achievements")).status_code == 401
    assert (await async_client.post("/achievements/seen", json={"keys": ["x"]})).status_code == 401


async def test_a_new_account_has_earned_nothing_and_sees_the_whole_catalogue(authenticated_client):
    body = await fetch(authenticated_client)

    assert body["earned"] == 0 and body["total"] == len(CATALOGUE)
    assert {item["key"] for item in body["badges"]} == {item.key for item in CATALOGUE}
    assert not any(item["earned"] or item["is_new"] for item in body["badges"])
    assert badge(body, "hundred_entries")["target"] == 100 and badge(body, "hundred_entries")["progress"] == 0


async def test_a_badge_is_earned_the_moment_its_target_is_reached_and_is_new_once(authenticated_client):
    await fetch(authenticated_client)  # the first check, before any work exists
    await project(authenticated_client)

    body = await fetch(authenticated_client)
    first = badge(body, "first_project")
    assert first["earned"] and first["is_new"] and first["earned_at"] is not None
    assert body["earned"] == 1
    assert badge(body, "five_projects")["progress"] == 1

    await authenticated_client.post("/achievements/seen", json={"keys": ["first_project"]})
    again = badge(await fetch(authenticated_client), "first_project")
    assert again["earned"] and not again["is_new"] and again["earned_at"].rstrip("Z") == first["earned_at"].rstrip("Z")


async def test_entries_hours_and_their_badges_are_counted_from_the_work(authenticated_client):
    await fetch(authenticated_client)
    created = await project(authenticated_client)
    await authenticated_client.post(
        f"/projects/{created['id']}/entries", json={"data": {"hours": 1}, "time_spent": 10 * 60}
    )

    body = await fetch(authenticated_client)

    assert badge(body, "first_entry")["earned"]
    assert badge(body, "ten_hours")["earned"]
    assert badge(body, "fifty_hours")["progress"] == 10 and not badge(body, "fifty_hours")["earned"]


async def test_a_badge_stays_earned_when_the_work_is_deleted(authenticated_client):
    await fetch(authenticated_client)
    created = await project(authenticated_client)
    await fetch(authenticated_client)

    await authenticated_client.delete(f"/projects/{created['id']}")
    body = await fetch(authenticated_client)

    assert badge(body, "first_project")["earned"]
    assert badge(body, "first_project")["progress"] == 1


async def test_tasks_activities_statuses_rules_and_more_each_earn_their_badge(authenticated_client):
    await fetch(authenticated_client)
    created = await project(authenticated_client, statuses=[{"name": "Open"}, {"name": "Closed", "done": True}])
    pid = created["id"]
    task = (await authenticated_client.post(f"/projects/{pid}/tasks", json={"title": "Ship"})).json()
    await authenticated_client.patch(f"/projects/{pid}/tasks/{task['id']}/toggle")
    await authenticated_client.post("/calendar/activities", json={
        "title": "Plan", "description": "", "day": "2026-10-01", "all_day": True,
    })
    await authenticated_client.post(f"/projects/{pid}/rules", json={
        "name": "Flag", "actions": [{"type": "mark_todo"}],
    })
    await authenticated_client.post(f"/projects/{pid}/archive")
    await authenticated_client.post("/ai/conversations")
    await authenticated_client.put("/dashboard", json={"panels": [
        {"id": f"p{i}", "type": "statistic", "config": {"view": "overview"}} for i in range(3)
    ]})

    body = await fetch(authenticated_client)

    for key in ("first_task_done", "first_activity", "custom_statuses", "first_rule", "first_archive", "first_mira", "dashboard_three"):
        assert badge(body, key)["earned"], key
    assert not badge(body, "first_share")["earned"] and not badge(body, "first_revert")["earned"]


async def test_sharing_a_project_and_reverting_an_entry_earn_theirs(authenticated_client, second_test_user):
    await fetch(authenticated_client)
    created = await project(authenticated_client)
    await authenticated_client.post(f"/projects/{created['id']}/members", json={"email": second_test_user.email})
    entry = (await authenticated_client.post(f"/projects/{created['id']}/entries", json={"data": {"hours": 1}})).json()
    await authenticated_client.put(f"/projects/{created['id']}/entries/{entry['id']}", json={"data": {"hours": 2}})
    await authenticated_client.post(f"/projects/{created['id']}/entries/{entry['id']}/revert", json={"revision": 1})

    body = await fetch(authenticated_client)

    assert badge(body, "first_share")["earned"] and badge(body, "first_revert")["earned"]


async def test_streak_badges_follow_the_longest_run(authenticated_client, db_session, test_user):
    await fetch(authenticated_client)
    today = datetime.now(timezone.utc).date()
    for offset in range(10):
        db_session.add(UserActivityDay(user_id=test_user.id, day=today - timedelta(days=offset + 2), kind="login"))
    for offset in range(3):
        db_session.add(UserActivityDay(user_id=test_user.id, day=today - timedelta(days=offset), kind="interaction"))
    await db_session.commit()

    body = await fetch(authenticated_client)

    assert badge(body, "login_10")["earned"] and badge(body, "login_3")["earned"] and not badge(body, "login_30")["earned"]
    assert badge(body, "activity_3")["earned"] and not badge(body, "activity_10")["earned"]
    assert badge(body, "activity_10")["progress"] == 3


async def test_badges_an_existing_account_already_qualifies_for_are_awarded_quietly(authenticated_client):
    created = await project(authenticated_client)
    await authenticated_client.post(f"/projects/{created['id']}/entries", json={"data": {"hours": 1}})

    body = await fetch(authenticated_client)

    assert badge(body, "first_project")["earned"] and badge(body, "first_entry")["earned"]
    assert not any(item["is_new"] for item in body["badges"])


async def test_each_person_earns_their_own(authenticated_client, second_authenticated_client):
    await fetch(authenticated_client)
    await fetch(second_authenticated_client)
    await project(authenticated_client)

    assert badge(await fetch(authenticated_client), "first_project")["earned"]
    assert not badge(await fetch(second_authenticated_client), "first_project")["earned"]


# ── the summary behind the profile diagrams ────────────────────────


async def test_the_response_summarises_progress_by_tier_and_category(authenticated_client):
    await fetch(authenticated_client)
    await project(authenticated_client)

    body = await fetch(authenticated_client)

    assert body["by_tier"]["bronze"]["earned"] == 1
    assert sum(tier["total"] for tier in body["by_tier"].values()) == body["total"]
    assert body["by_category"]["projects"] == {"name": "Projects", "earned": 1, "total": 3}
    assert sum(category["total"] for category in body["by_category"].values()) == body["total"]


# ── marking celebrations as shown ──────────────────────────────────


async def test_marking_badges_seen_ignores_unknown_keys_and_other_peoples_badges(authenticated_client, second_authenticated_client):
    await fetch(authenticated_client)
    await fetch(second_authenticated_client)
    await project(authenticated_client)
    await project(second_authenticated_client)
    await fetch(authenticated_client)
    await fetch(second_authenticated_client)

    response = await authenticated_client.post("/achievements/seen", json={"keys": ["not-a-badge"]})
    assert response.status_code == 204
    assert badge(await fetch(authenticated_client), "first_project")["is_new"]

    await second_authenticated_client.post("/achievements/seen", json={"keys": ["first_project"]})
    assert badge(await fetch(authenticated_client), "first_project")["is_new"]
    assert not badge(await fetch(second_authenticated_client), "first_project")["is_new"]


async def test_marking_seen_needs_some_keys_and_nothing_else(authenticated_client):
    assert (await authenticated_client.post("/achievements/seen", json={"keys": []})).status_code == 422
    assert (await authenticated_client.post("/achievements/seen", json={"keys": ["x"], "extra": 1})).status_code == 422
