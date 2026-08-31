from datetime import datetime, timedelta, timezone
from uuid import UUID

import jwt
from fastapi import HTTPException, status

from app.config import ACCESS_TOKEN_EXPIRE_MINUTES, JWT_ALGORITHM, JWT_SECRET_KEY


def create_access_token(user_id: UUID) -> str:
    now = datetime.now(timezone.utc)

    payload = {
        "sub": str(user_id),
        "iat": now,
        "exp": now + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES),
    }

    return jwt.encode(
        payload,
        JWT_SECRET_KEY,
        algorithm=JWT_ALGORITHM,
    )


def decode_access_token(token: str) -> UUID:
    try:
        payload = jwt.decode(
            token,
            JWT_SECRET_KEY,
            algorithms=[JWT_ALGORITHM],
            options={"require": ["sub", "iat", "exp"]},
        )

        return UUID(payload["sub"])

    except (jwt.PyJWTError, ValueError, KeyError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired session.",
            headers={"WWW-Authenticate": "Bearer"},
        ) from None


def create_calendar_state(user_id: UUID) -> str:
    """Short-lived Calendar state; never accepted as an API access token."""
    now = datetime.now(timezone.utc)
    from secrets import token_urlsafe

    return jwt.encode(
        {"sub": str(user_id), "aud": "google-calendar", "jti": token_urlsafe(32),
         "iat": now, "exp": now + timedelta(minutes=10)},
        JWT_SECRET_KEY, algorithm=JWT_ALGORITHM,
    )


def decode_calendar_state(state: str) -> UUID | None:
    try:
        payload = jwt.decode(
            state, JWT_SECRET_KEY, algorithms=[JWT_ALGORITHM],
            audience="google-calendar",
            options={"require": ["sub", "aud", "jti", "iat", "exp"]},
        )
        return UUID(payload["sub"])
    except (jwt.PyJWTError, ValueError, KeyError, TypeError):
        return None
