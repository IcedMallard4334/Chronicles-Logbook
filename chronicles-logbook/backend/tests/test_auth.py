"""Tests for Google OpenID Connect authentication."""

from unittest.mock import AsyncMock
from urllib.parse import parse_qs, unquote, urlparse

from sqlalchemy import func, select

from app.models import User
from app.routers.auth import _make_oauth_state, _verify_oauth_state


def _token_from_redirect(location: str) -> str:
    fragment = parse_qs(urlparse(location).fragment)
    return unquote(fragment["token"][0])


async def test_google_login_redirects_to_google(async_client):
    response = await async_client.get("/auth/google/login", follow_redirects=False)

    assert response.status_code == 307
    location = response.headers["location"]
    assert location.startswith("https://accounts.google.com/o/oauth2/v2/auth")
    params = parse_qs(urlparse(location).query)
    assert params["prompt"] == ["select_account"]
    assert params["response_type"] == ["code"]
    assert "state" in params


async def test_oauth_state_sign_and_verify():
    """State tokens are self-contained and verifiable without sessions."""
    state = _make_oauth_state()
    assert _verify_oauth_state(state) is True


async def test_oauth_state_rejects_tampering():
    """Tampered state tokens are rejected."""
    assert _verify_oauth_state("invalid.state") is False
    assert _verify_oauth_state("") is False
    assert _verify_oauth_state("abc.def.ghi") is False


def _mock_google_oauth(profile: dict):
    """Create a mock for httpx.AsyncClient that simulates Google OAuth."""

    class MockResponse:
        def __init__(self, status_code, json_data):
            self.status_code = status_code
            self._json = json_data

        def json(self):
            return self._json

    token_response = MockResponse(
        200,
        {"access_token": "mock-access-token", "token_type": "Bearer"},
    )
    userinfo_response = MockResponse(200, profile)

    mock_client = AsyncMock()
    mock_client.post = AsyncMock(return_value=token_response)
    mock_client.get = AsyncMock(return_value=userinfo_response)
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=None)
    return mock_client


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
    mock_client = _mock_google_oauth(google_profile)
    monkeypatch.setattr("app.routers.auth.httpx.AsyncClient", lambda **kwargs: mock_client)

    state = _make_oauth_state()
    response = await async_client.get(
        f"/auth/google/callback?code=mock-code&state={state}",
        follow_redirects=False,
    )

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
    mock_client = _mock_google_oauth(profile)
    monkeypatch.setattr("app.routers.auth.httpx.AsyncClient", lambda **kwargs: mock_client)

    state1 = _make_oauth_state()
    state2 = _make_oauth_state()
    await async_client.get(
        f"/auth/google/callback?code=mock-code&state={state1}",
        follow_redirects=False,
    )
    await async_client.get(
        f"/auth/google/callback?code=mock-code&state={state2}",
        follow_redirects=False,
    )

    count = await db_session.scalar(select(func.count()).select_from(User))
    assert count == 1


async def test_google_callback_rejects_unverified_email(
    async_client, monkeypatch
):
    profile = {
        "sub": "google-user-123",
        "email": "ethan@example.com",
        "name": "Ethan Student",
        "email_verified": False,
    }
    mock_client = _mock_google_oauth(profile)
    monkeypatch.setattr("app.routers.auth.httpx.AsyncClient", lambda **kwargs: mock_client)

    state = _make_oauth_state()
    response = await async_client.get(
        f"/auth/google/callback?code=mock-code&state={state}",
        follow_redirects=False,
    )

    assert response.status_code == 307
    assert "error=" in response.headers["location"]


async def test_google_callback_rejects_invalid_state(async_client):
    response = await async_client.get(
        "/auth/google/callback?code=mock-code&state=invalid.state",
        follow_redirects=False,
    )

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
    mock_client = _mock_google_oauth(profile)
    monkeypatch.setattr("app.routers.auth.httpx.AsyncClient", lambda **kwargs: mock_client)

    state = _make_oauth_state()
    callback = await async_client.get(
        f"/auth/google/callback?code=mock-code&state={state}",
        follow_redirects=False,
    )

    token = _token_from_redirect(callback.headers["location"])

    response = await async_client.delete(
        "/auth/account",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 204

    assert await db_session.scalar(
        select(func.count()).select_from(User)
    ) == 0

    me = await async_client.get(
        "/auth/me",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert me.status_code == 401
    assert me.json()["detail"] == "Account no longer exists."
