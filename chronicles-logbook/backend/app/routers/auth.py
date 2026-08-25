import secrets
import uuid
from urllib.parse import quote

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.responses import RedirectResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import (
    FRONTEND_URL,
    GOOGLE_CALENDAR_REDIRECT_URI,
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    OAUTH_REDIRECT_URI,
)
from app.database import get_db
from app.email import send_account_deleted_email
from app.models import GoogleCalendarToken, User
from app.schemas import AuthResponse, UserResponse
from app.security import create_access_token, decode_access_token

router = APIRouter(prefix="/auth", tags=["Authentication"])
bearer = HTTPBearer(auto_error=False)


def _require_google_configuration() -> None:
    if not GOOGLE_CLIENT_ID or not GOOGLE_CLIENT_SECRET:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Google authentication is not configured.",
        )


async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer),  # noqa: B008
    db: AsyncSession = Depends(get_db),  # noqa: B008
) -> User:
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user_id = decode_access_token(credentials.credentials)
    user = await db.get(User, user_id)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Account no longer exists.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return user


def _make_oauth_state() -> str:
    """Generate a self-contained, signed OAuth state token.

    Avoids Authlib's session-based state which relies on cookies being
    preserved across the full redirect chain — fragile when teammates
    access the app from different domains or via Azure deployment URLs.
    """
    nonce = str(uuid.uuid4())
    sig = create_access_token(nonce)
    return f"{nonce}.{sig}"


def _verify_oauth_state(state: str) -> bool:
    """Verify the signed state token we generated earlier."""
    try:
        # Format: {uuid_nonce}.{jwt_with_dots}
        # UUID is 36 chars (8-4-4-4-12), so split at position 36.
        nonce, sig = state[:36], state[37:]
        if state[36] != ".":
            return False
        decoded_nonce = decode_access_token(sig)
        return str(decoded_nonce) == nonce
    except Exception:  # noqa: BLE001
        return False


@router.get("/google/login")
async def google_login(request: Request):  # noqa: ARG001
    _require_google_configuration()
    state = _make_oauth_state()
    params = {
        "client_id": GOOGLE_CLIENT_ID,
        "redirect_uri": OAUTH_REDIRECT_URI,
        "response_type": "code",
        "scope": "openid email profile",
        "state": state,
        "prompt": "select_account",
        "access_type": "offline",
    }
    qs = "&".join(f"{k}={quote(str(v), safe='')}" for k, v in params.items())
    return RedirectResponse(
        f"https://accounts.google.com/o/oauth2/v2/auth?{qs}"
    )


def _auth_response(user: User) -> AuthResponse:
    return AuthResponse(
        access_token=create_access_token(user.id),
        user=UserResponse.model_validate(user),
    )


@router.get("/google/callback")
async def google_callback(
    request: Request,  # noqa: ARG001
    code: str = Query(...),
    state: str = Query(...),
    db: AsyncSession = Depends(get_db),  # noqa: B008
):
    _require_google_configuration()

    # Validate the signed state — no session cookie required.
    if not _verify_oauth_state(state):
        error = quote("CSRF validation failed. Please try again.")
        return RedirectResponse(f"{FRONTEND_URL}/auth/callback#error={error}")

    # Exchange the authorisation code directly with Google.
    async with httpx.AsyncClient(timeout=15) as client:
        token_resp = await client.post(
            "https://oauth2.googleapis.com/token",
            data={
                "code": code,
                "client_id": GOOGLE_CLIENT_ID,
                "client_secret": GOOGLE_CLIENT_SECRET,
                "redirect_uri": OAUTH_REDIRECT_URI,
                "grant_type": "authorization_code",
            },
        )
        if token_resp.status_code != 200:
            error = quote("Failed to exchange authorization code.")
            return RedirectResponse(f"{FRONTEND_URL}/auth/callback#error={error}")

        token_data = token_resp.json()
        access_token = token_data.get("access_token")
        if not access_token:
            error = quote("Google did not return an access token.")
            return RedirectResponse(f"{FRONTEND_URL}/auth/callback#error={error}")

        userinfo_resp = await client.get(
            "https://openidconnect.googleapis.com/v1/userinfo",
            headers={"Authorization": f"Bearer {access_token}"},
        )
        if userinfo_resp.status_code != 200:
            error = quote("Failed to fetch user profile from Google.")
            return RedirectResponse(f"{FRONTEND_URL}/auth/callback#error={error}")

    profile = userinfo_resp.json()
    google_sub = str(profile.get("sub", ""))
    email = str(profile.get("email", "")).strip().lower()
    full_name = " ".join(str(profile.get("name", "")).split())
    email_verified = profile.get("email_verified") is True

    if not google_sub or not email or not full_name or not email_verified:
        error = quote("Google did not return a verified name and email address.")
        return RedirectResponse(f"{FRONTEND_URL}/auth/callback#error={error}")

    user = await db.scalar(select(User).where(User.google_sub == google_sub))
    if user is None:
        email_owner = await db.scalar(select(User).where(User.email == email))
        if email_owner is not None:
            error = quote(
                "An account with this email already exists. Use its existing sign-in method."
            )
            return RedirectResponse(f"{FRONTEND_URL}/auth/callback#error={error}")
        user = User(
            google_sub=google_sub,
            full_name=full_name,
            email=email,
            avatar_url=profile.get("picture"),
        )
        db.add(user)
    else:
        user.google_sub = google_sub
        user.full_name = full_name
        user.email = email
        user.avatar_url = profile.get("picture")

    await db.commit()
    await db.refresh(user)
    app_token = quote(create_access_token(user.id))
    return RedirectResponse(f"{FRONTEND_URL}/auth/callback#token={app_token}")


@router.get("/me", response_model=UserResponse)
async def read_current_user(user: User = Depends(get_current_user)):  # noqa: B008
    return user


# ── Google Calendar OAuth callback ─────────────────────────────────
# Google redirects here after the user grants calendar access.
# The redirect URI is /auth/google/calendar/callback (not /calendar/…)
# because Google Cloud Console was configured with this path.

_CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.readonly"


def _verify_calendar_state(state: str) -> str | None:
    """Validate the signed calendar state and return the user_id.

    Calendar state format: {nonce}:{user_id}.{jwt_signature}
    """
    try:
        payload_part, sig = state.rsplit(".", 1)
        decoded_payload = decode_access_token(sig)
        if decoded_payload != payload_part:
            return None
        # Extract user_id from "nonce:user_id"
        _, user_id = payload_part.split(":", 1)
        return user_id
    except Exception:  # noqa: BLE001
        return None


@router.get("/google/calendar/callback")
async def google_calendar_callback(
    request: Request,  # noqa: ARG001
    code: str = Query(...),
    state: str = Query(...),
    db: AsyncSession = Depends(get_db),  # noqa: B008
):
    user_id = _verify_calendar_state(state)
    if not user_id:
        return RedirectResponse(
            f"{FRONTEND_URL}/app?calendar_error=State+verification+failed."
        )

    # Exchange the authorisation code directly with Google.
    async with httpx.AsyncClient(timeout=15) as client:
        token_resp = await client.post(
            "https://oauth2.googleapis.com/token",
            data={
                "code": code,
                "client_id": GOOGLE_CLIENT_ID,
                "client_secret": GOOGLE_CLIENT_SECRET,
                "redirect_uri": GOOGLE_CALENDAR_REDIRECT_URI,
                "grant_type": "authorization_code",
            },
        )
        if token_resp.status_code != 200:
            error = quote("Calendar authorisation failed.")
            return RedirectResponse(f"{FRONTEND_URL}/app?calendar_error={error}")

        token_data = token_resp.json()

    refresh_token = token_data.get("refresh_token")
    if not refresh_token:
        error = quote(
            "Google did not return a refresh token. Please revoke access and try again."
        )
        return RedirectResponse(f"{FRONTEND_URL}/app?calendar_error={error}")

    user = await db.get(User, user_id)
    if user is None:
        return RedirectResponse(
            f"{FRONTEND_URL}/app?calendar_error=User+not+found."
        )

    existing = await db.get(GoogleCalendarToken, user.id)
    if existing is not None:
        existing.refresh_token = refresh_token
    else:
        db.add(
            GoogleCalendarToken(
                user_id=user.id,
                refresh_token=refresh_token,
            )
        )
    await db.commit()
    return RedirectResponse(f"{FRONTEND_URL}/app?calendar_connected=true")


@router.delete("/account", status_code=status.HTTP_204_NO_CONTENT)
async def delete_account(
    user: User = Depends(get_current_user),  # noqa: B008
    db: AsyncSession = Depends(get_db),  # noqa: B008
):
    await db.delete(user)
    await db.commit()

    try:
        send_account_deleted_email(user.email)
    except Exception as e:  # noqa: BLE001
        print(f"Account deletion email failed: {e}")
