"""Customisable entry statuses."""

import pytest

from app.statuses import DEFAULT_STATUSES, default_name, is_done, reconcile, statuses_of

CUSTOM = [
    {"name": "Backlog", "done": False},
    {"name": "In progress", "done": False},
    {"name": "Blocked", "done": False},
    {"name": "Done", "done": True},
]
FIELDS = [{"id": "note", "name": "Note", "type": "text"}]


async def project(client, **over):
    response = await client.post("/projects", json={"name": "Board", "entry_schema": FIELDS, **over})
    assert response.status_code == 201, response.text
    return response.json()


async def entry(client, project_id, **over):
    response = await client.post(f"/projects/{project_id}/entries", json={"data": {"note": "x"}, **over})
    assert response.status_code == 201, response.text
    return response.json()


# ── the rules ──────────────────────────────────────────────────────


def test_a_project_with_no_statuses_gets_the_default_pair():
    assert statuses_of([]) == DEFAULT_STATUSES
    assert statuses_of(None) == DEFAULT_STATUSES
    assert statuses_of(CUSTOM) == CUSTOM


def test_new_entries_start_in_the_first_status_that_matches():
    assert default_name(CUSTOM, todo=True) == "Backlog"
    assert default_name(CUSTOM, todo=False) == "Done"


def test_reconcile_keeps_a_status_that_agrees_with_todo_and_replaces_one_that_does_not():
    assert reconcile(CUSTOM, "Blocked", True) == "Blocked"
    assert reconcile(CUSTOM, "Blocked", False) == "Done"
    assert reconcile(CUSTOM, "Done", True) == "Backlog"
    assert reconcile(CUSTOM, "Nonsense", True) == "Backlog"
    assert is_done(CUSTOM, "Done") and not is_done(CUSTOM, "Blocked")


# ── projects ───────────────────────────────────────────────────────


async def test_projects_report_the_default_statuses_until_customised(authenticated_client):
    created = await project(authenticated_client)
    assert created["statuses"] == DEFAULT_STATUSES


async def test_statuses_can_be_set_on_creation_and_changed_later(authenticated_client):
    created = await project(authenticated_client, statuses=CUSTOM)
    assert [s["name"] for s in created["statuses"]] == ["Backlog", "In progress", "Blocked", "Done"]

    updated = await authenticated_client.put(
        f"/projects/{created['id']}",
        json={"statuses": [{"name": "Open", "done": False}, {"name": "Closed", "done": True}]},
    )
    assert [s["name"] for s in updated.json()["statuses"]] == ["Open", "Closed"]


@pytest.mark.parametrize(
    "statuses",
    [
        [{"name": "Only", "done": True}],
        [{"name": f"S{i}", "done": i == 0} for i in range(9)],
        [{"name": "A", "done": False}, {"name": "a", "done": True}],
        [{"name": "A", "done": False}, {"name": "B", "done": False}],
        [{"name": "A", "done": True}, {"name": "B", "done": True}],
        [{"name": "  ", "done": False}, {"name": "B", "done": True}],
        [{"name": "A", "done": False, "colour": "red"}, {"name": "B", "done": True}],
    ],
)
async def test_invalid_status_lists_are_rejected(authenticated_client, statuses):
    response = await authenticated_client.post("/projects", json={"name": "Bad", "statuses": statuses})
    assert response.status_code == 422


# ── entries ────────────────────────────────────────────────────────


async def test_an_entry_starts_in_the_first_matching_status(authenticated_client):
    proj = await project(authenticated_client, statuses=CUSTOM)

    plain = await entry(authenticated_client, proj["id"])
    todo = await entry(authenticated_client, proj["id"], todo=True)

    assert (plain["status"], plain["todo"]) == ("Done", False)
    assert (todo["status"], todo["todo"]) == ("Backlog", True)


async def test_choosing_a_status_decides_whether_the_entry_is_outstanding(authenticated_client):
    proj = await project(authenticated_client, statuses=CUSTOM)

    created = await entry(authenticated_client, proj["id"], status="Blocked")
    assert (created["status"], created["todo"]) == ("Blocked", True)

    moved = await authenticated_client.put(
        f"/projects/{proj['id']}/entries/{created['id']}", json={"status": "Done"}
    )
    assert (moved.json()["status"], moved.json()["todo"]) == ("Done", False)

    back = await authenticated_client.put(
        f"/projects/{proj['id']}/entries/{created['id']}", json={"status": "In progress"}
    )
    assert (back.json()["status"], back.json()["todo"]) == ("In progress", True)


async def test_an_unknown_status_is_refused_with_the_choices(authenticated_client):
    proj = await project(authenticated_client, statuses=CUSTOM)

    created = await authenticated_client.post(
        f"/projects/{proj['id']}/entries", json={"data": {"note": "x"}, "status": "Shipped"}
    )
    assert created.status_code == 422 and "Backlog" in created.json()["detail"]

    ok = await entry(authenticated_client, proj["id"])
    updated = await authenticated_client.put(
        f"/projects/{proj['id']}/entries/{ok['id']}", json={"status": "Shipped"}
    )
    assert updated.status_code == 422


async def test_ticking_todo_keeps_a_custom_status_that_already_fits(authenticated_client):
    proj = await project(authenticated_client, statuses=CUSTOM)
    created = await entry(authenticated_client, proj["id"], status="Blocked")

    same = await authenticated_client.put(f"/projects/{proj['id']}/entries/{created['id']}", json={"todo": True})
    assert same.json()["status"] == "Blocked"

    done = await authenticated_client.put(f"/projects/{proj['id']}/entries/{created['id']}", json={"todo": False})
    assert (done.json()["status"], done.json()["todo"]) == ("Done", False)


async def test_removing_a_status_moves_its_entries_to_the_nearest_one(authenticated_client):
    proj = await project(authenticated_client, statuses=CUSTOM)
    blocked = await entry(authenticated_client, proj["id"], status="Blocked")
    finished = await entry(authenticated_client, proj["id"], status="Done")

    await authenticated_client.put(
        f"/projects/{proj['id']}",
        json={"statuses": [{"name": "Open", "done": False}, {"name": "Closed", "done": True}]},
    )

    rows = {e["id"]: e for e in (await authenticated_client.get(f"/projects/{proj['id']}/entries")).json()}
    assert (rows[blocked["id"]]["status"], rows[blocked["id"]]["todo"]) == ("Open", True)
    assert (rows[finished["id"]]["status"], rows[finished["id"]]["todo"]) == ("Closed", False)


async def test_changing_what_a_status_means_moves_entries_with_it(authenticated_client):
    proj = await project(authenticated_client, statuses=CUSTOM)
    parked = await entry(authenticated_client, proj["id"], status="Blocked")

    await authenticated_client.put(
        f"/projects/{proj['id']}",
        json={"statuses": [{"name": "Backlog", "done": False}, {"name": "Blocked", "done": True}]},
    )

    row = (await authenticated_client.get(f"/projects/{proj['id']}/entries")).json()[0]
    assert row["id"] == parked["id"] and (row["status"], row["todo"]) == ("Blocked", False)


async def test_entries_can_be_searched_by_status_across_projects(authenticated_client):
    first = await project(authenticated_client, statuses=CUSTOM)
    second = await project(authenticated_client, name="Other", statuses=CUSTOM)
    await entry(authenticated_client, first["id"], status="Blocked")
    await entry(authenticated_client, second["id"], status="Blocked")
    await entry(authenticated_client, first["id"], status="Backlog")

    blocked = (await authenticated_client.get("/entries", params={"status": "Blocked"})).json()

    assert len(blocked) == 2 and {e["status"] for e in blocked} == {"Blocked"}
    everything = (await authenticated_client.get("/entries")).json()
    assert len(everything) == 3 and all("status" in e for e in everything)


async def test_history_records_status_changes_and_revert_restores_them(authenticated_client):
    proj = await project(authenticated_client, statuses=CUSTOM)
    created = await entry(authenticated_client, proj["id"], status="Backlog")
    base = f"/projects/{proj['id']}/entries/{created['id']}"
    await authenticated_client.put(base, json={"status": "In progress"})

    history = (await authenticated_client.get(f"{base}/history")).json()
    assert "status" in history[0]["changed_fields"]

    reverted = await authenticated_client.post(f"{base}/revert", json={"revision": 1})
    assert (reverted.json()["status"], reverted.json()["todo"]) == ("Backlog", True)
