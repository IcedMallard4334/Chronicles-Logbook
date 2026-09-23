"""Google Calendar OAuth and event fetching."""

from urllib.parse import quote
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from google.auth.exceptions import RefreshError, TransportError
from google.auth.transport.requests import Request as GoogleRequest
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.concurrency import run_in_threadpool

from app.config import (
    GOOGLE_CALENDAR_REDIRECT_URI,
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
)
from app.database import get_db
from app.models import GoogleCalendarAccount, GoogleCalendarToken, User
from app.routers.auth import get_current_user
from app.schemas import GoogleCalendarEvent, GoogleCalendarStatus
from app.security import create_calendar_state

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
    saved = (await db.scalars(select(GoogleCalendarAccount).where(GoogleCalendarAccount.user_id == user.id).order_by(GoogleCalendarAccount.created_at))).all()
    accounts = [{"id": str(account.id), "label": account.label} for account in saved]
    if token is not None:
        accounts.insert(0, {"id": "legacy", "label": "Previously connected Google account"})
    return GoogleCalendarStatus(connected=bool(accounts), accounts=accounts)


@router.get("/google/auth")
async def google_calendar_auth(
    user: User = Depends(get_current_user),  # noqa: B008
):
    if not GOOGLE_CLIENT_ID or not GOOGLE_CLIENT_SECRET:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Google OAuth is not configured.",
        )
    state = create_calendar_state(user.id)

    params = {
        "client_id": GOOGLE_CLIENT_ID,
        "redirect_uri": GOOGLE_CALENDAR_REDIRECT_URI,
        "response_type": "code",
        "scope": _SCOPES,
        "state": state,
        "access_type": "offline",
        "include_granted_scopes": "true",
        "prompt": "select_account consent",
    }
    qs = "&".join(f"{k}={quote(str(v), safe='')}" for k, v in params.items())
    authorization_url = f"https://accounts.google.com/o/oauth2/v2/auth?{qs}"
    return {"authorization_url": authorization_url}


@router.delete("/google/disconnect", status_code=status.HTTP_204_NO_CONTENT)
async def google_calendar_disconnect(
    account_id: str | None = None,
    user: User = Depends(get_current_user),  # noqa: B008
    db: AsyncSession = Depends(get_db),  # noqa: B008
):
    if account_id is None or account_id == "legacy":
        await db.execute(delete(GoogleCalendarToken).where(GoogleCalendarToken.user_id == user.id))
    if account_id != "legacy":
        statement = delete(GoogleCalendarAccount).where(GoogleCalendarAccount.user_id == user.id)
        if account_id is not None:
            try:
                statement = statement.where(GoogleCalendarAccount.id == UUID(account_id))
            except ValueError:
                raise HTTPException(422, "Invalid account ID.") from None
        await db.execute(statement)
    await db.commit()



@router.get("/google/events", response_model=list[GoogleCalendarEvent])
async def google_calendar_events(
    start: str = Query(..., description="RFC 3339 start time"),
    account_id: str | None = None,
    end: str = Query(..., description="RFC 3339 end time"),
    user: User = Depends(get_current_user),  # noqa: B008
    db: AsyncSession = Depends(get_db),  # noqa: B008
):
    if account_id is None or account_id == "legacy":
        token = await db.get(GoogleCalendarToken, user.id)
    else:
        try:
            account_uuid = UUID(account_id)
        except ValueError:
            raise HTTPException(422, "Invalid account ID.") from None
        token = await db.scalar(select(GoogleCalendarAccount).where(
            GoogleCalendarAccount.id == account_uuid, GoogleCalendarAccount.user_id == user.id))
    if token is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Google Calendar is not connected.",
        )

    def fetch_events():
        creds = _credentials_from_token(token)
        # A refresh-token-only credential has no expiry but is still invalid.
        if not creds.valid:
            creds.refresh(GoogleRequest())
        service = build("calendar", "v3", credentials=creds, cache_discovery=False)
        items = []
        page_token = None
        try:
            while True:
                page = service.events().list(
                    calendarId="primary", timeMin=start, timeMax=end,
                    singleEvents=True, orderBy="startTime", maxResults=250,
                    pageToken=page_token,
                ).execute()
                items.extend(page.get("items", []))
                page_token = page.get("nextPageToken")
                if not page_token:
                    return {"items": items}
        finally:
            service.close()

    try:
        # Google's synchronous SDK must not block other API requests.
        result = await run_in_threadpool(fetch_events)
    except RefreshError:
        raise HTTPException(401, "Google Calendar access expired or was revoked. Please reconnect.") from None
    except HttpError as exc:
        message = (
            "Google Calendar access was denied. Check that the Calendar API is enabled in Google Cloud, then reconnect."
            if exc.resp.status == 403 else "Google Calendar is unavailable. Please try again."
        )
        raise HTTPException(502, message) from None
    except (TransportError, OSError):
        raise HTTPException(503, "Cannot reach Google Calendar. Check the backend network connection and try again.") from None

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
