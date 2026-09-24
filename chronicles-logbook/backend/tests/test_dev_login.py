"""Tests for POST /auth/dev-login — the local-only Google sign-in bypass."""

from sqlalchemy import func, select

from app.models import User


async def test_dev_login_is_a_404_by_default(async_client):
    """ENABLE_DEV_LOGIN is off unless a local .env explicitly turns it on."""
    response = await async_client.post("/auth/dev-login", json={})

    assert response.status_code == 404


async def test_dev_login_creates_an_account_when_enabled(
    async_client, db_session, monkeypatch
):
    monkeypatch.setattr("app.routers.auth.ENABLE_DEV_LOGIN", True)

    response = await async_client.post(
        "/auth/dev-login",
        json={"email": "reviewer@example.com", "full_name": "Local Reviewer"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["user"]["email"] == "reviewer@example.com"
    assert body["user"]["full_name"] == "Local Reviewer"
    assert body["access_token"]

    user = await db_session.scalar(
        select(User).where(User.email == "reviewer@example.com")
    )
    assert user is not None
    assert user.google_sub.startswith("dev-login-")


async def test_dev_login_token_authenticates(async_client, monkeypatch):
    monkeypatch.setattr("app.routers.auth.ENABLE_DEV_LOGIN", True)

    login = await async_client.post(
        "/auth/dev-login", json={"email": "reviewer@example.com"}
    )
    token = login.json()["access_token"]

    me = await async_client.get(
        "/auth/me", headers={"Authorization": f"Bearer {token}"}
    )

    assert me.status_code == 200
    assert me.json()["email"] == "reviewer@example.com"


async def test_dev_login_reuses_the_same_account_on_a_second_call(
    async_client, db_session, monkeypatch
):
    """Local data (projects, entries) should persist between dev-login runs."""
    monkeypatch.setattr("app.routers.auth.ENABLE_DEV_LOGIN", True)

    first = await async_client.post(
        "/auth/dev-login", json={"email": "reviewer@example.com"}
    )
    second = await async_client.post(
        "/auth/dev-login", json={"email": "reviewer@example.com"}
    )

    assert first.json()["user"]["id"] == second.json()["user"]["id"]
    count = await db_session.scalar(select(func.count()).select_from(User))
    assert count == 1


async def test_dev_login_without_an_email_gets_a_placeholder_account(
    async_client, monkeypatch
):
    monkeypatch.setattr("app.routers.auth.ENABLE_DEV_LOGIN", True)

    response = await async_client.post("/auth/dev-login", json={})

    assert response.status_code == 200
    assert response.json()["user"]["email"] == "dev@chronicles.local"


async def test_dev_login_normalises_email_case(async_client, db_session, monkeypatch):
    monkeypatch.setattr("app.routers.auth.ENABLE_DEV_LOGIN", True)

    await async_client.post("/auth/dev-login", json={"email": "Reviewer@Example.com"})
    await async_client.post("/auth/dev-login", json={"email": "reviewer@example.com"})

    count = await db_session.scalar(select(func.count()).select_from(User))
    assert count == 1
