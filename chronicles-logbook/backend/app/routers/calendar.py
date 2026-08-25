"""Google Calendar OAuth and event fetching."""

from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.responses import RedirectResponse
from google.auth.transport.requests import Request as GoogleRequest
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import Flow
from googleapiclient.discovery import build
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import (
    FRONTEND_URL,
    GOOGLE_CALENDAR_REDIRECT_URI,
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
)
from app.database import get_db
from app.models import GoogleCalendarToken, User
from app.routers.auth import get_current_user
from app.schemas import GoogleCalendarEvent, GoogleCalendarStatus

router = APIRouter(prefix="/calendar", tags=["Calendar"])

_SCOPES = ["https://www.googleapis.com/auth/calendar.readonly"]


def _build_flow(*, redirect_uri: str | None = None) -> Flow:
    if not GOOGLE_CLIENT_ID or not GOOGLE_CLIENT_SECRET:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Google OAuth is not configured.",
        )
    return Flow.from_client_config(
        {
            "web": {
                "client_id": GOOGLE_CLIENT_ID,
                "client_secret": GOOGLE_CLIENT_SECRET,
                "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                "token_uri": "https://oauth2.googleapis.com/token",
            }
        },
        scopes=_SCOPES,
        redirect_uri=redirect_uri or GOOGLE_CALENDAR_REDIRECT_URI,
    )


def _credentials_from_token(token: GoogleCalendarToken) -> Credentials:
    return Credentials(
        token=None,
        refresh_token=token.refresh_token,
        token_uri="https://oauth2.googleapis.com/token",
        client_id=GOOGLE_CLIENT_ID,
        client_secret=GOOGLE_CLIENT_SECRET,
        scopes=_SCOPES,
    )


@router.get("/google/status", response_model=GoogleCalendarStatus)
async def google_calendar_status(
    user: User = Depends(get_current_user),  # noqa: B008
    db: AsyncSession = Depends(get_db),  # noqa: B008
):
    token = await db.get(GoogleCalendarToken, user.id)
    return GoogleCalendarStatus(connected=token is not None)


@router.get("/google/auth")
async def google_calendar_auth(request: Request):
    flow = _build_flow()
    authorization_url, state = flow.authorization_url(
        access_type="offline",
        include_granted_scopes="true",
        prompt="consent",
    )
    request.session["google_calendar_state"] = state
    return {"authorization_url": authorization_url}


@router.get("/google/callback")
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

    flow = _build_flow()
    try:
        flow.fetch_token(code=code)
    except Exception as exc:  # noqa: BLE001
        error = quote(f"Calendar authorisation failed: {exc}")
        return RedirectResponse(f"{FRONTEND_URL}/app?calendar_error={error}")

    credentials = flow.credentials
    if not credentials.refresh_token:
        error = quote("Google did not return a refresh token. Please revoke access and try again.")
        return RedirectResponse(f"{FRONTEND_URL}/app?calendar_error={error}")

    # We need the current user from the bearer token passed in the state or
    # from a session. Since the calendar OAuth is initiated from within the
    # app (user is already authenticated), we look up the user via the
    # chronicles_token stored in the session by the frontend before redirect.
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


@router.delete("/google/disconnect", status_code=status.HTTP_204_NO_CONTENT)
async def google_calendar_disconnect(
    user: User = Depends(get_current_user),  # noqa: B008
    db: AsyncSession = Depends(get_db),  # noqa: B008
):
    await db.execute(
        delete(GoogleCalendarToken).where(GoogleCalendarToken.user_id == user.id)
    )
    await db.commit()


@router.get("/google/events", response_model=list[GoogleCalendarEvent])
async def google_calendar_events(
    start: str = Query(..., description="RFC 3339 start time"),
    end: str = Query(..., description="RFC 3339 end time"),
    user: User = Depends(get_current_user),  # noqa: B008
    db: AsyncSession = Depends(get_db),  # noqa: B008
):
    token = await db.get(GoogleCalendarToken, user.id)
    if token is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Google Calendar is not connected.",
        )

    creds = _credentials_from_token(token)
    try:
        if creds.expired and creds.refresh_token:
            creds.refresh(GoogleRequest())
    except Exception:  # noqa: BLE001
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Google Calendar token expired. Please reconnect.",
        )

    service = build("calendar", "v3", credentials=creds)
    try:
        result = (
            service.events()
            .list(
                calendarId="primary",
                timeMin=start,
                timeMax=end,
                singleEvents=True,
                orderBy="startTime",
                maxResults=100,
            )
            .execute()
        )
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Failed to fetch calendar events: {exc}",
        )

    events: list[GoogleCalendarEvent] = []
    for item in result.get("items", []):
        start_data = item.get("start", {})
        end_data = item.get("end", {})
        all_day = "date" in start_data
        events.append(
            GoogleCalendarEvent(
                id=item["id"],
                summary=item.get("summary", "(No title)"),
                start=start_data.get("dateTime") or start_data.get("date", ""),
                end=end_data.get("dateTime") or end_data.get("date", ""),
                all_day=all_day,
                color=item.get("colorId"),
                html_link=item.get("htmlLink"),
                location=item.get("location"),
            )
        )
    return events
