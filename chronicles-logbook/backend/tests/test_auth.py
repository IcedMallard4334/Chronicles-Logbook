"""Tests for Google OpenID Connect authentication."""

from unittest.mock import AsyncMock
from urllib.parse import parse_qs, unquote, urlparse

from fastapi.responses import RedirectResponse
from sqlalchemy import func, select

from app.models import User
from app.routers.auth import oauth


def _token_from_redirect(location: str) -> str:
    fragment = parse_qs(urlparse(location).fragment)
    return unquote(fragment["token"][0])


async def test_google_login_always_requests_account_chooser(async_client, monkeypatch):
    authorise = AsyncMock(return_value=RedirectResponse("https://accounts.google.com"))
    monkeypatch.setattr(oauth.google, "authorize_redirect", authorise)

    response = await async_client.get("/auth/google/login", follow_redirects=False)

    assert response.status_code == 307
    authorise.assert_awaited_once()
    assert authorise.await_args.kwargs["prompt"] == "select_account"


async def test_password_registration_and_login(async_client):
    registration = await async_client.post(
        "/auth/register",
        json={
            "full_name": "Ethan Student",
            "email": "ETHAN@example.com",
            "password": "correct-horse-battery-staple",
        },
    )

    assert registration.status_code == 201
    assert registration.json()["user"]["email"] == "ethan@example.com"
    assert registration.json()["access_token"]

    login = await async_client.post(
        "/auth/login",
        json={
            "email": "ethan@example.com",
            "password": "correct-horse-battery-staple",
        },
    )

    assert login.status_code == 200
    assert login.json()["user"]["full_name"] == "Ethan Student"


async def test_password_login_rejects_wrong_password(async_client):
    await async_client.post(
        "/auth/register",
        json={
            "full_name": "Ethan Student",
            "email": "ethan@example.com",
            "password": "correct-horse-battery-staple",
        },
    )

    response = await async_client.post(
        "/auth/login",
        json={"email": "ethan@example.com", "password": "wrong-password"},
    )

    assert response.status_code == 401
    assert response.json()["detail"] == "Invalid email address or password."


async def test_registration_rejects_existing_email(async_client):
    registration = {
        "full_name": "Ethan Student",
        "email": "ethan@example.com",
        "password": "correct-horse-battery-staple",
    }

    first = await async_client.post("/auth/register", json=registration)
    second = await async_client.post("/auth/register", json=registration)

    assert first.status_code == 201
    assert second.status_code == 409


async def test_google_callback_creates_user_and_returns_session(
    async_client, db_session, monkeypatch
):
    google_profile = {
        "sub": "google-user-123",
        "email": "ETHAN@example.com",
        "name": "Ethan Student",
        "picture": "https://example.com/avatar.png",
        "email_verified": True,
    }
    monkeypatch.setattr(
        oauth.google,
        "authorize_access_token",
        AsyncMock(return_value={"userinfo": google_profile}),
    )

    response = await async_client.get("/auth/google/callback", follow_redirects=False)

    assert response.status_code == 307
    assert response.headers["location"].startswith(
        "http://frontend.test/auth/callback#token="
    )
    user = await db_session.scalar(
        select(User).where(User.google_sub == "google-user-123")
    )
    assert user is not None
    assert user.email == "ethan@example.com"
    assert user.full_name == "Ethan Student"

    token = _token_from_redirect(response.headers["location"])
    me = await async_client.get(
        "/auth/me", headers={"Authorization": f"Bearer {token}"}
    )
    assert me.status_code == 200
    assert me.json()["email"] == "ethan@example.com"


async def test_google_callback_reuses_existing_user(
    async_client, db_session, monkeypatch
):
    profile = {
        "sub": "google-user-123",
        "email": "ethan@example.com",
        "name": "Ethan Student",
        "email_verified": True,
    }
    authorise = AsyncMock(return_value={"userinfo": profile})
    monkeypatch.setattr(oauth.google, "authorize_access_token", authorise)

    await async_client.get("/auth/google/callback", follow_redirects=False)
    await async_client.get("/auth/google/callback", follow_redirects=False)

    count = await db_session.scalar(select(func.count()).select_from(User))
    assert count == 1


async def test_google_callback_rejects_unverified_email(
    async_client, monkeypatch
):
    monkeypatch.setattr(
        oauth.google,
        "authorize_access_token",
        AsyncMock(
            return_value={
                "userinfo": {
                    "sub": "google-user-123",
                    "email": "ethan@example.com",
                    "name": "Ethan Student",
                    "email_verified": False,
                }
            }
        ),
    )

    response = await async_client.get("/auth/google/callback", follow_redirects=False)

    assert response.status_code == 307
    assert "error=" in response.headers["location"]


async def test_me_requires_authentication(async_client):
    response = await async_client.get("/auth/me")

    assert response.status_code == 401
    assert response.json()["detail"] == "Authentication required."


async def test_authenticated_user_can_delete_account(
    async_client, db_session, monkeypatch
):
    profile = {
        "sub": "google-user-123",
        "email": "ethan@example.com",
        "name": "Ethan Student",
        "email_verified": True,
    }
    monkeypatch.setattr(
        oauth.google,
        "authorize_access_token",
        AsyncMock(return_value={"userinfo": profile}),
    )
    callback = await async_client.get("/auth/google/callback", follow_redirects=False)
    token = _token_from_redirect(callback.headers["location"])

    response = await async_client.delete(
        "/auth/account", headers={"Authorization": f"Bearer {token}"}
    )

    assert response.status_code == 204
    assert await db_session.scalar(select(func.count()).select_from(User)) == 0
