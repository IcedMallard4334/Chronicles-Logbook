"""Private, local-day activities; never writes to Google Calendar."""
from datetime import date
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import CalendarActivity, User
from app.routers.auth import get_current_user

router = APIRouter(prefix="/calendar/activities", tags=["Activities"])


class ActivityCreate(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    description: str = Field(default="", max_length=4000)
    day: date
    all_day: bool = False
    start_time: str | None = Field(default=None, pattern=r"^(?:[01]\d|2[0-3]):[0-5]\d$")
    end_time: str | None = Field(default=None, pattern=r"^(?:[01]\d|2[0-3]):[0-5]\d$")

    @field_validator("title")
    @classmethod
    def nonblank(cls, value):
        if not value.strip():
            raise ValueError("Enter an activity title.")
        return value.strip()

    @model_validator(mode="after")
    def valid_times(self):
        if self.all_day:
            self.start_time = self.end_time = None
        elif not self.start_time or not self.end_time or self.end_time <= self.start_time:
            raise ValueError("End time must be after start time on the same day.")
        return self


class ActivityResponse(ActivityCreate):
    model_config = ConfigDict(from_attributes=True)
    id: UUID


@router.get("", response_model=list[ActivityResponse])
async def list_activities(start: date, end: date, user: Annotated[User, Depends(get_current_user)], db: Annotated[AsyncSession, Depends(get_db)]):
    if end < start or (end-start).days > 366:
        raise HTTPException(422, "Choose a date range of up to one year.")
    return (await db.scalars(select(CalendarActivity).where(
        CalendarActivity.user_id == user.id, CalendarActivity.day >= start, CalendarActivity.day <= end
    ).order_by(CalendarActivity.day, CalendarActivity.start_time, CalendarActivity.created_at))).all()


@router.post("", response_model=ActivityResponse, status_code=201)
async def create_activity(payload: ActivityCreate, user: Annotated[User, Depends(get_current_user)], db: Annotated[AsyncSession, Depends(get_db)]):
    activity = CalendarActivity(user_id=user.id, **payload.model_dump())
    db.add(activity)
    await db.commit()
    await db.refresh(activity)
    return activity


@router.delete("/{activity_id}", status_code=204)
async def delete_activity(activity_id: UUID, user: Annotated[User, Depends(get_current_user)], db: Annotated[AsyncSession, Depends(get_db)]):
    activity = await db.scalar(select(CalendarActivity).where(CalendarActivity.id == activity_id, CalendarActivity.user_id == user.id))
    if activity is None:
        raise HTTPException(404, "Activity not found.")
    await db.delete(activity)
    await db.commit()
