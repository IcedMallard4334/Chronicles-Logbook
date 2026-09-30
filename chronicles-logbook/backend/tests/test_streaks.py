"""Login and interaction streaks."""

from datetime import date, datetime, timedelta, timezone

from app.routers.streaks import summarise


def today_utc() -> date:
    return datetime.now(timezone.utc).date()


def d(offset: int, base: date | None = None) -> date:
    return (base or today_utc()) + timedelta(days=offset)


# ── the counting rules ─────────────────────────────────────────────


def test_no_days_means_no_streak():
    result = summarise(set(), today_utc())
    assert (result.current, result.longest, result.active_today, result.last_day) == (0, 0, False, None)


def test_consecutive_days_ending_today_count():
    today = today_utc()
    result = summarise({d(0), d(-1), d(-2)}, today)
    assert (result.current, result.longest, result.active_today) == (3, 3, True)


def test_a_streak_stays_alive_until_the_end_of_the_next_day():
    today = today_utc()
    result = summarise({d(-1), d(-2)}, today)
    assert (result.current, result.active_today) == (2, False)


def test_missing_a_whole_day_resets_the_current_run_but_keeps_the_longest():
    today = today_utc()
    result = summarise({d(-2), d(-3), d(-4), d(-5)}, today)
    assert (result.current, result.longest) == (0, 4)


def test_a_gap_splits_runs_and_only_the_latest_is_current():
    today = today_utc()
    result = summarise({d(0), d(-1), d(-4), d(-5), d(-6)}, today)
    assert (result.current, result.longest) == (2, 3)


# ── the endpoints ──────────────────────────────────────────────────


async def test_streaks_require_authentication(async_client):
    assert (await async_client.get("/streaks", params={"today": "2026-09-30"})).status_code == 401
    response = await async_client.post("/streaks/activity", json={"kind": "login", "day": "2026-09-30"})
    assert response.status_code == 401


async def test_the_two_streaks_are_counted_separately(authenticated_client):
    today = today_utc()
    for offset in (-1, 0):
        await authenticated_client.post(
            "/streaks/activity", json={"kind": "login", "day": (today + timedelta(days=offset)).isoformat()}
        )
    response = await authenticated_client.post(
        "/streaks/activity", json={"kind": "interaction", "day": today.isoformat()}
    )

    body = response.json()
    assert body["login"]["current"] == 2 and body["login"]["active_today"] is True
    assert body["interaction"]["current"] == 1

    read = (await authenticated_client.get("/streaks", params={"today": today.isoformat()})).json()
    assert read == body


async def test_recording_the_same_day_twice_does_not_double_count(authenticated_client):
    payload = {"kind": "login", "day": today_utc().isoformat()}
    await authenticated_client.post("/streaks/activity", json=payload)
    second = await authenticated_client.post("/streaks/activity", json=payload)

    assert second.json()["login"]["current"] == 1


async def test_a_day_far_from_today_cannot_be_recorded(authenticated_client):
    for offset in (-5, 5):
        response = await authenticated_client.post(
            "/streaks/activity",
            json={"kind": "login", "day": (today_utc() + timedelta(days=offset)).isoformat()},
        )
        assert response.status_code == 422


async def test_unknown_kinds_and_extra_fields_are_rejected(authenticated_client):
    day = today_utc().isoformat()
    assert (await authenticated_client.post("/streaks/activity", json={"kind": "points", "day": day})).status_code == 422
    assert (
        await authenticated_client.post("/streaks/activity", json={"kind": "login", "day": day, "bonus": 1})
    ).status_code == 422


async def test_one_users_streak_is_not_visible_to_another(authenticated_client, second_authenticated_client):
    today = today_utc().isoformat()
    await authenticated_client.post("/streaks/activity", json={"kind": "login", "day": today})

    other = (await second_authenticated_client.get("/streaks", params={"today": today})).json()
    assert other["login"]["current"] == 0
