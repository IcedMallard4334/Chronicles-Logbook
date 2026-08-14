"""Tests for the sign-up and sign-in user story."""

from sqlalchemy import select

from app.models import User


async def test_sign_up_creates_user_and_returns_token(async_client, db_session):
    response = await async_client.post(
        "/auth/signup",
        json={
            "full_name": "  Ethan   Student  ",
            "email": "ETHAN@example.com",
            "password": "strong-password",
        },
    )

    assert response.status_code == 201
    body = response.json()
    assert body["access_token"]
    assert body["token_type"] == "bearer"
    assert body["user"]["full_name"] == "Ethan Student"
    assert body["user"]["email"] == "ethan@example.com"
    assert "password" not in body["user"]
    assert "password_hash" not in body["user"]

    user = await db_session.scalar(select(User).where(User.email == "ethan@example.com"))
    assert user is not None
    assert user.password_hash != "strong-password"


async def test_sign_up_rejects_duplicate_email(async_client):
    payload = {
        "full_name": "Ethan Student",
        "email": "ethan@example.com",
        "password": "strong-password",
    }
    assert (await async_client.post("/auth/signup", json=payload)).status_code == 201

    response = await async_client.post("/auth/signup", json=payload)

    assert response.status_code == 409
    assert response.json()["detail"] == "An account with this email already exists."


async def test_sign_up_validates_email_and_password(async_client):
    response = await async_client.post(
        "/auth/signup",
        json={"full_name": "Ethan", "email": "not-an-email", "password": "short"},
    )

    assert response.status_code == 422


async def test_sign_in_returns_token_for_valid_credentials(async_client):
    await async_client.post(
        "/auth/signup",
        json={
            "full_name": "Ethan Student",
            "email": "ethan@example.com",
            "password": "strong-password",
        },
    )

    response = await async_client.post(
        "/auth/signin",
        json={"email": "ETHAN@example.com", "password": "strong-password"},
    )

    assert response.status_code == 200
    assert response.json()["access_token"]
    assert response.json()["user"]["email"] == "ethan@example.com"


async def test_sign_in_uses_generic_error_for_bad_credentials(async_client):
    response = await async_client.post(
        "/auth/signin",
        json={"email": "missing@example.com", "password": "wrong-password"},
    )

    assert response.status_code == 401
    assert response.json()["detail"] == "Incorrect email or password."
    assert response.headers["www-authenticate"] == "Bearer"
