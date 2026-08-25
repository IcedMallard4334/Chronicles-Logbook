"""Google Calendar OAuth and event fetching."""

import secrets
from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException, Query, status
from google.auth.transport.requests import Request as GoogleRequest
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import (
    GOOGLE_CALENDAR_REDIRECT_URI,
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
)
from app.database import get_db
from app.models import GoogleCalendarToken, User
from app.routers.auth import get_current_user
from app.schemas import GoogleCalendarEvent, GoogleCalendarStatus
from app.security import create_access_token

router = APIRouter(prefix="/calendar", tags=["Calendar"])

_SCOPES = "https://www.googleapis.com/auth/calendar.readonly"


def _credentials_from_token(token: GoogleCalendarToken) -> Credentials:
    return Credentials(
        token=None,
        refresh_token=token.refresh_token,
        token_uri="https://oauth2.googleapis.com/token",
        client_id=GOOGLE_CLIENT_ID,
        client_secret=GOOGLE_CLIENT_SECRET,
        scopes=[_SCOPES],
    )


@router.get("/google/status", response_model=GoogleCalendarStatus)
async def google_calendar_status(
    user: User = Depends(get_current_user),  # noqa: B008
    db: AsyncSession = Depends(get_db),  # noqa: B008
):
    token = await db.get(GoogleCalendarToken, user.id)
    return GoogleCalendarStatus(connected=token is not None)


@router.get("/google/auth")
async def google_calendar_auth(
    user: User = Depends(get_current_user),  # noqa: B008
):
    if not GOOGLE_CLIENT_ID:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Google OAuth is not configured.",
        )
    # Embed user_id in a signed state token so the callback can identify
    # the user without relying on session cookies.
    nonce = secrets.token_urlsafe(32)
    payload = f"{nonce}:{user.id}"
    sig = create_access_token(payload)
    state = f"{payload}.{sig}"

    params = {
        "client_id": GOOGLE_CLIENT_ID,
        "redirect_uri": GOOGLE_CALENDAR_REDIRECT_URI,
        "response_type": "code",
        "scope": _SCOPES,
        "state": state,
        "access_type": "offline",
        "include_granted_scopes": "true",
        "prompt": "consent",
    }
    qs = "&".join(f"{k}={quote(str(v), safe='')}" for k, v in params.items())
    authorization_url = f"https://accounts.google.com/o/oauth2/v2/auth?{qs}"
    return {"authorization_url": authorization_url}


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
