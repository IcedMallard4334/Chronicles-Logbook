import asyncio
import hashlib
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from urllib.parse import quote

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.responses import RedirectResponse, Response
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import (
    COOKIE_SECURE,
    FRONTEND_URL,
    GOOGLE_CALENDAR_REDIRECT_URI,
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    OAUTH_REDIRECT_URI,
)
from app.database import get_db
from app.email import send_account_deleted_email
from app.models import GoogleCalendarAccount, LoginSession, User
from app.schemas import AuthResponse, UserResponse
from app.security import create_access_token, decode_access_token, decode_calendar_state

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
async def google_login(request: Request):
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
    request: Request,
    code: str = Query(...),
    state: str = Query(...),
    db: AsyncSession = Depends(get_db),  # noqa: B008
):
    _require_google_configuration()

    # Validate the signed state — no session cookie required.
    if not _verify_oauth_state(state):
        error = quote("CSRF validation failed. Please try again.")
        return RedirectResponse(f"{FRONTEND_URL}/auth/callback#error={error}")

    # Exchange the authorisation code directly with Google. Keep the normal
    # environment networking configuration, as local development may require
    # the machine's approved network route.
    token_payload = {
        "code": code,
        "client_id": GOOGLE_CLIENT_ID,
        "client_secret": GOOGLE_CLIENT_SECRET,
        "redirect_uri": OAUTH_REDIRECT_URI,
        "grant_type": "authorization_code",
    }
    async with httpx.AsyncClient(timeout=15) as client:
        token_resp = None
        for attempt in range(2):
            try:
                token_resp = await client.post(
                    "https://oauth2.googleapis.com/token", data=token_payload
                )
                break
            except httpx.RequestError:
                if attempt == 0:
                    await asyncio.sleep(0.25)
                    continue
                error = quote("Cannot reach Google to complete sign-in. Please try again.")
                return RedirectResponse(f"{FRONTEND_URL}/auth/callback#error={error}")
        if token_resp.status_code != 200:
            error = quote("Failed to exchange authorization code.")
            return RedirectResponse(f"{FRONTEND_URL}/auth/callback#error={error}")

        token_data = token_resp.json()
        access_token = token_data.get("access_token")
        if not access_token:
            error = quote("Google did not return an access token.")
            return RedirectResponse(f"{FRONTEND_URL}/auth/callback#error={error}")

        try:
            userinfo_resp = await client.get(
                "https://openidconnect.googleapis.com/v1/userinfo",
                headers={"Authorization": f"Bearer {access_token}"},
            )
        except httpx.RequestError:
            error = quote("Cannot reach Google to retrieve your profile. Please try again.")
            return RedirectResponse(f"{FRONTEND_URL}/auth/callback#error={error}")
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
    response = RedirectResponse(f"{FRONTEND_URL}/auth/callback#token={app_token}")
    await _create_login_session(user, db, response)
    return response


_SESSION_COOKIE = "chronicles_refresh"
_SESSION_DAYS = 30


async def _create_login_session(user, db, response):
    token = secrets.token_urlsafe(48)
    db.add(LoginSession(token_hash=hashlib.sha256(token.encode()).hexdigest(),
                        user_id=user.id,
                        expires_at=datetime.now(timezone.utc) + timedelta(days=_SESSION_DAYS)))
    await db.commit()
    response.set_cookie(_SESSION_COOKIE, token, max_age=_SESSION_DAYS * 86400,
                        httponly=True, secure=COOKIE_SECURE, samesite="lax", path="/auth")
    response.headers["Cache-Control"] = "no-store"


def _check_session_origin(request):
    # Cookie-authenticated mutations must come from our frontend.
    if request.headers.get("origin") != FRONTEND_URL:
        raise HTTPException(403, "Untrusted session request origin.")


@router.post("/refresh")
async def refresh_session(request: Request, response: Response,
                          db: AsyncSession = Depends(get_db)):  # noqa: B008
    _check_session_origin(request)
    token = request.cookies.get(_SESSION_COOKIE, "")
    session = await db.get(LoginSession, hashlib.sha256(token.encode()).hexdigest()) if token else None
    if session is None or session.expires_at.replace(tzinfo=timezone.utc) <= datetime.now(timezone.utc):
        raise HTTPException(401, "Please sign in again.")
    user = await db.get(User, session.user_id)
    if user is None:
        raise HTTPException(401, "Please sign in again.")
    response.headers["Cache-Control"] = "no-store"
    return _auth_response(user)


@router.post("/logout", status_code=204)
async def logout_session(request: Request, response: Response,
                         db: AsyncSession = Depends(get_db)):  # noqa: B008
    _check_session_origin(request)
    token = request.cookies.get(_SESSION_COOKIE, "")
    session = await db.get(LoginSession, hashlib.sha256(token.encode()).hexdigest()) if token else None
    if session:
        await db.delete(session)
        await db.commit()
    response.delete_cookie(_SESSION_COOKIE, path="/auth", secure=COOKIE_SECURE, httponly=True, samesite="lax")


@router.get("/me", response_model=UserResponse)
async def read_current_user(user: User = Depends(get_current_user)):  # noqa: B008
    return user


# ── Google Calendar OAuth callback ─────────────────────────────────
# Google redirects here after the user grants calendar access.
# The redirect URI is /auth/google/calendar/callback (not /calendar/…)
# because Google Cloud Console was configured with this path.

_CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.readonly"


def _verify_calendar_state(state: str) -> uuid.UUID | None:
    return decode_calendar_state(state)


@router.get("/google/calendar/callback")
async def google_calendar_callback(
    request: Request,
    code: str | None = Query(None),
    state: str = Query(""),
    error: str | None = Query(None),
    db: AsyncSession = Depends(get_db),  # noqa: B008
):
    user_id = _verify_calendar_state(state)
    if not user_id:
        return RedirectResponse(
            f"{FRONTEND_URL}/app?calendar_error=State+verification+failed."
        )

    if error or not code:
        message = quote("Google Calendar connection was cancelled. You can connect again when ready.")
        return RedirectResponse(f"{FRONTEND_URL}/app?calendar_error={message}")

    # Exchange the authorisation code directly with Google.
    try:
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
            access_token = token_data.get("access_token")
            if not access_token:
                return RedirectResponse(f"{FRONTEND_URL}/app?calendar_error=Google+did+not+return+an+access+token.")
            identity_response = await client.get(
                "https://www.googleapis.com/calendar/v3/calendars/primary",
                headers={"Authorization": f"Bearer {access_token}"},
            )
            if identity_response.status_code != 200:
                return RedirectResponse(f"{FRONTEND_URL}/app?calendar_error=Cannot+identify+Google+calendar.+Check+that+Calendar+API+is+enabled.")
            identity = identity_response.json()
            calendar_id = identity.get("id")
            if not calendar_id:
                return RedirectResponse(f"{FRONTEND_URL}/app?calendar_error=Google+calendar+identity+missing.")
    except httpx.RequestError:
        message = quote("Cannot reach Google. Please check the backend connection and try again.")
        return RedirectResponse(f"{FRONTEND_URL}/app?calendar_error={message}")

    if _CALENDAR_SCOPE not in token_data.get("scope", "").split():
        message = quote("Calendar read access was not granted. Please reconnect and allow Calendar access.")
        return RedirectResponse(f"{FRONTEND_URL}/app?calendar_error={message}")

    user = await db.get(User, user_id)
    if user is None:
        return RedirectResponse(f"{FRONTEND_URL}/app?calendar_error=User+not+found.")
    existing = await db.scalar(select(GoogleCalendarAccount).where(
        GoogleCalendarAccount.user_id == user.id, GoogleCalendarAccount.calendar_id == calendar_id))
    refresh_token = token_data.get("refresh_token") or (existing.refresh_token if existing else None)
    if not refresh_token:
        return RedirectResponse(f"{FRONTEND_URL}/app?calendar_error=Please+reconnect+and+grant+offline+calendar+access.")
    if existing:
        existing.refresh_token = refresh_token
        existing.label = calendar_id
    else:
        db.add(GoogleCalendarAccount(user_id=user.id, calendar_id=calendar_id,
                                    label=calendar_id, refresh_token=refresh_token))
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
