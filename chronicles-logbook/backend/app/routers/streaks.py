"""Two daily streaks: days you logged in, and days you did something."""

from datetime import date, datetime, timedelta, timezone
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import User, UserActivityDay
from app.routers.auth import get_current_user

router = APIRouter(prefix="/streaks", tags=["Streaks"])

Kind = Literal["login", "interaction"]


class ActivityPing(BaseModel):
    model_config = ConfigDict(extra="forbid")
    kind: Kind
    day: date


class StreakSummary(BaseModel):
    current: int
    longest: int
    active_today: bool
    last_day: date | None


class StreaksResponse(BaseModel):
    login: StreakSummary
    interaction: StreakSummary


def summarise(days: set[date], today: date) -> StreakSummary:
    """Current run (alive if today or yesterday was active), longest run, last day."""
    if not days:
        return StreakSummary(current=0, longest=0, active_today=False, last_day=None)

    longest = run = 0
    previous: date | None = None
    for day in sorted(days):
        run = run + 1 if previous is not None and day - previous == timedelta(days=1) else 1
        longest = max(longest, run)
        previous = day

    cursor = today if today in days else today - timedelta(days=1)
    current = 0
    while cursor in days:
        current += 1
        cursor -= timedelta(days=1)

    return StreakSummary(
        current=current, longest=longest, active_today=today in days, last_day=max(days)
    )


async def _streaks(user: User, today: date, db: AsyncSession) -> StreaksResponse:
    rows = (
        await db.execute(
            select(UserActivityDay.kind, UserActivityDay.day).where(UserActivityDay.user_id == user.id)
        )
    ).all()
    by_kind: dict[str, set[date]] = {"login": set(), "interaction": set()}
    for kind, day in rows:
        by_kind.setdefault(kind, set()).add(day)
    return StreaksResponse(
        login=summarise(by_kind["login"], today),
        interaction=summarise(by_kind["interaction"], today),
    )


@router.get("", response_model=StreaksResponse)
async def read_streaks(
    today: date = Query(..., description="The caller's local date, YYYY-MM-DD"),  # noqa: B008
    user: User = Depends(get_current_user),  # noqa: B008
    db: AsyncSession = Depends(get_db),  # noqa: B008
):
    return await _streaks(user, today, db)


@router.post("/activity", response_model=StreaksResponse)
async def record_activity(
    payload: ActivityPing,
    user: User = Depends(get_current_user),  # noqa: B008
    db: AsyncSession = Depends(get_db),  # noqa: B008
):
    """Mark a day as active. The day is the caller's local date, so it may be a day
    either side of the server's UTC date, but no further: a streak can't be back-filled."""
    utc_today = datetime.now(timezone.utc).date()
    if abs((payload.day - utc_today).days) > 1:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY, "That day is too far from today to record."
        )
    existing = await db.get(UserActivityDay, (user.id, payload.day, payload.kind))
    if existing is None:
        db.add(UserActivityDay(user_id=user.id, day=payload.day, kind=payload.kind))
        await db.commit()
    return await _streaks(user, payload.day, db)
