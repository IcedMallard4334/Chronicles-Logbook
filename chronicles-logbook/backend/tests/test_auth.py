"""Tests for Google OpenID Connect authentication."""

from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock
from urllib.parse import parse_qs, unquote, urlparse

import pytest_asyncio
from fastapi.responses import RedirectResponse
from sqlalchemy import func, select

from app.models import PasswordCredential, PasswordResetToken, User
from app.routers.auth import oauth
from app.security import (
    create_password_reset_token,
    hash_password,
    hash_password_reset_token,
    verify_password,
)


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


async def test_password_registration_and_login(async_client, monkeypatch):
    sent_email = {}

    def fake_send_email(recipient, full_name):
        sent_email["recipient"] = recipient
        sent_email["full_name"] = full_name

    monkeypatch.setattr(
        "app.routers.auth.send_account_created_email",
        fake_send_email,
    )

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
    assert sent_email["recipient"] == "ethan@example.com"
    assert sent_email["full_name"] == "Ethan Student"

    login = await async_client.post(
        "/auth/login",
        json={
            "email": "ethan@example.com",
            "password": "correct-horse-battery-staple",
        },
    )

    assert login.status_code == 200
    assert login.json()["user"]["full_name"] == "Ethan Student"


async def test_password_login_rejects_wrong_password(async_client, monkeypatch):
    monkeypatch.setattr(
        "app.routers.auth.send_account_created_email",
        lambda *args, **kwargs: None,
    )

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


async def test_registration_rejects_existing_email(async_client, monkeypatch):
    monkeypatch.setattr(
        "app.routers.auth.send_account_created_email",
        lambda *args, **kwargs: None,
    )

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
    sent_email = {}

    def fake_send_email(recipient, full_name):
        sent_email["recipient"] = recipient
        sent_email["full_name"] = full_name

    monkeypatch.setattr(
        "app.routers.auth.send_account_created_email",
        fake_send_email,
    )

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
    assert sent_email["recipient"] == "ethan@example.com"
    assert sent_email["full_name"] == "Ethan Student"

    token = _token_from_redirect(response.headers["location"])
    me = await async_client.get(
        "/auth/me", headers={"Authorization": f"Bearer {token}"}
    )
    assert me.status_code == 200
    assert me.json()["email"] == "ethan@example.com"


async def test_google_callback_reuses_existing_user(
    async_client, db_session, monkeypatch
):
    sent_emails = []

    def fake_send_email(recipient, full_name):
        sent_emails.append((recipient, full_name))

    monkeypatch.setattr(
        "app.routers.auth.send_account_created_email",
        fake_send_email,
    )

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
    assert sent_emails == [("ethan@example.com", "Ethan Student")]


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
    sent_email = {}

    def fake_send_email(recipient):
        sent_email["recipient"] = recipient

    monkeypatch.setattr(
        "app.routers.auth.send_account_deleted_email",
        fake_send_email,
    )

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

    callback = await async_client.get(
        "/auth/google/callback",
        follow_redirects=False,
    )

    token = _token_from_redirect(callback.headers["location"])

    response = await async_client.delete(
        "/auth/account",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 204
    assert sent_email["recipient"] == "ethan@example.com"

    assert await db_session.scalar(
        select(func.count()).select_from(User)
    ) == 0

    assert await db_session.scalar(
        select(func.count()).select_from(PasswordCredential)
    ) == 0

    me = await async_client.get(
        "/auth/me",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert me.status_code == 401
    assert me.json()["detail"] == "Account no longer exists."

@pytest_asyncio.fixture
async def password_test_user(db_session):
    user = User(
        google_sub="password:test-password-user",
        full_name="Password User",
        email="password@example.com",
        avatar_url=None,
    )

    db_session.add(user)
    await db_session.flush()

    credential = PasswordCredential(
        user_id=user.id,
        password_hash=hash_password("OldPassword123"),
    )

    db_session.add(credential)

    await db_session.commit()
    await db_session.refresh(user)

    return user

async def test_forgot_password_creates_reset_token(
    async_client,
    db_session,
    password_test_user,
    monkeypatch,
):
    sent_email = {}

    def fake_send_email(
        recipient,
        reset_url,
    ):
        sent_email["recipient_email"] = recipient
        sent_email["reset_url"] = reset_url

    monkeypatch.setattr(
        "app.routers.auth.send_password_reset_email",
        fake_send_email,
    )

    response = await async_client.post(
        "/auth/forgot-password",
        json={"email": "password@example.com"},
    )

    assert response.status_code == 200
    assert (
        response.json()["message"]
        == "If an account exists for this email address, "
        "a password reset link has been sent."
    )

    assert sent_email["recipient_email"] == "password@example.com"
    assert "reset-password?token=" in sent_email["reset_url"]

async def test_forgot_password_does_not_reveal_unknown_email(
    async_client,
):
    response = await async_client.post(
        "/auth/forgot-password",
        json={"email": "doesnotexist@example.com"},
    )

    assert response.status_code == 200
    assert (
        response.json()["message"]
        == "If an account exists for this email address, "
        "a password reset link has been sent."
    )

async def test_forgot_password_does_not_reset_google_only_account(
    async_client,
    test_user,
    monkeypatch,
):
    called = False

    def fake_send_email(*args, **kwargs):
        nonlocal called
        called = True

    monkeypatch.setattr(
        "app.routers.auth.send_password_reset_email",
        fake_send_email,
    )

    response = await async_client.post(
        "/auth/forgot-password",
        json={"email": "test@example.com"},
    )

    assert response.status_code == 200
    assert called is False

async def test_reset_password_changes_password(
    async_client,
    db_session,
    password_test_user,
    monkeypatch,
):

    sent_email = {}

    def fake_send_email(recipient):
        sent_email["recipient_email"] = recipient

    monkeypatch.setattr(
        "app.routers.auth.send_password_changed_email",
        fake_send_email,
    )
    raw_token = create_password_reset_token()

    reset_token = PasswordResetToken(
        user_id=password_test_user.id,
        token_hash=hash_password_reset_token(raw_token),
        expires_at=(
            datetime.now(timezone.utc) + timedelta(minutes=30)
        ),
    )

    db_session.add(reset_token)
    await db_session.commit()

    response = await async_client.post(
        "/auth/reset-password",
        json={
            "token": raw_token,
            "password": "NewPassword123",
        },
    )

    assert response.status_code == 200
    assert response.json()["message"] == "Password reset successfully."

    credential = await db_session.get(
        PasswordCredential,
        password_test_user.id,
    )

    assert credential is not None
    assert verify_password("NewPassword123", credential.password_hash)
    assert not verify_password("OldPassword123", credential.password_hash)

    assert reset_token.used_at is not None
    assert sent_email["recipient_email"] == password_test_user.email

async def test_reset_password_rejects_used_token(
    async_client,
    db_session,
    password_test_user,
):
    raw_token = create_password_reset_token()

    reset_token = PasswordResetToken(
        user_id=password_test_user.id,
        token_hash=hash_password_reset_token(raw_token),
        expires_at=(
            datetime.now(timezone.utc) + timedelta(minutes=30)
        ),
        used_at=datetime.now(timezone.utc),
    )

    db_session.add(reset_token)
    await db_session.commit()

    response = await async_client.post(
        "/auth/reset-password",
        json={
            "token": raw_token,
            "password": "NewPassword123",
        },
    )

    assert response.status_code == 400
    assert response.json()["detail"] == (
        "This password reset token has already been used."
    )

async def test_reset_password_rejects_invalid_token(async_client):
    response = await async_client.post(
        "/auth/reset-password",
        json={
            "token": "definitely-not-a-real-token",
            "password": "NewPassword123",
        },
    )

    assert response.status_code == 400
    assert response.json()["detail"] == (
        "Invalid or expired password reset token."
    )

async def test_reset_password_rejects_expired_token(
    async_client,
    db_session,
    password_test_user,
):
    raw_token = create_password_reset_token()

    reset_token = PasswordResetToken(
        user_id=password_test_user.id,
        token_hash=hash_password_reset_token(raw_token),
        expires_at=datetime.now(timezone.utc) - timedelta(minutes=1),
    )

    db_session.add(reset_token)
    await db_session.commit()

    response = await async_client.post(
        "/auth/reset-password",
        json={
            "token": raw_token,
            "password": "NewPassword123",
        },
    )

    assert response.status_code == 400
    assert response.json()["detail"] == (
        "Invalid or expired password reset token."
    )