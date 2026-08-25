from urllib.parse import quote

from authlib.integrations.starlette_client import OAuth, OAuthError
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.responses import RedirectResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from google_auth_oauthlib.flow import Flow
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
oauth = OAuth()
oauth.register(
    name="google",
    client_id=GOOGLE_CLIENT_ID or None,
    client_secret=GOOGLE_CLIENT_SECRET or None,
    server_metadata_url="https://accounts.google.com/.well-known/openid-configuration",
    client_kwargs={"scope": "openid email profile"},
)


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


@router.get("/google/login")
async def google_login(request: Request):
    _require_google_configuration()
    return await oauth.google.authorize_redirect(
        request,
        OAUTH_REDIRECT_URI,
        prompt="select_account",
    )


def _auth_response(user: User) -> AuthResponse:
    return AuthResponse(
        access_token=create_access_token(user.id),
        user=UserResponse.model_validate(user),
    )


@router.get("/google/callback")
async def google_callback(
    request: Request,
    db: AsyncSession = Depends(get_db),  # noqa: B008
):
    _require_google_configuration()
    try:
        token = await oauth.google.authorize_access_token(request)
    except OAuthError as exc:
        error = quote(exc.description or "Google authentication failed.")
        return RedirectResponse(f"{FRONTEND_URL}/auth/callback#error={error}")

    profile = token.get("userinfo") or {}
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

_CALENDAR_SCOPES = ["https://www.googleapis.com/auth/calendar.readonly"]


def _calendar_flow() -> Flow:
    return Flow.from_client_config(
        {
            "web": {
                "client_id": GOOGLE_CLIENT_ID,
                "client_secret": GOOGLE_CLIENT_SECRET,
                "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                "token_uri": "https://oauth2.googleapis.com/token",
            }
        },
        scopes=_CALENDAR_SCOPES,
        redirect_uri=GOOGLE_CALENDAR_REDIRECT_URI,
    )


@router.get("/google/calendar/callback")
async def google_calendar_callback(
    request: Request,
    code: str = Query(...),
    state: str = Query(...),
    db: AsyncSession = Depends(get_db),  # noqa: B008
):
    saved_state = request.session.pop("google_calendar_state", None)
    if saved_state != state:
        return RedirectResponse(
            f"{FRONTEND_URL}/app?calendar_error=State+verification+failed."
        )

    flow = _calendar_flow()
    try:
        flow.fetch_token(code=code)
    except Exception as exc:  # noqa: BLE001
        error = quote(f"Calendar authorisation failed: {exc}")
        return RedirectResponse(f"{FRONTEND_URL}/app?calendar_error={error}")

    credentials = flow.credentials
    if not credentials.refresh_token:
        error = quote(
            "Google did not return a refresh token. Please revoke access and try again."
        )
        return RedirectResponse(f"{FRONTEND_URL}/app?calendar_error={error}")

    user_id_str = request.session.pop("google_calendar_user_id", None)
    if not user_id_str:
        return RedirectResponse(
            f"{FRONTEND_URL}/app?calendar_error=User+session+expired."
        )

    user = await db.get(User, user_id_str)
    if user is None:
        return RedirectResponse(
            f"{FRONTEND_URL}/app?calendar_error=User+not+found."
        )

    existing = await db.get(GoogleCalendarToken, user.id)
    if existing is not None:
        existing.refresh_token = credentials.refresh_token
    else:
        db.add(
            GoogleCalendarToken(
                user_id=user.id,
                refresh_token=credentials.refresh_token,
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
