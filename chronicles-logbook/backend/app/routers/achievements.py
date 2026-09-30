"""Badges for milestones, and whether their celebration has been shown."""

from datetime import datetime

from fastapi import APIRouter, Depends
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession

from app.achievements import BY_KEY, CATALOGUE, CATEGORIES, TIERS, evaluate
from app.database import get_db
from app.models import User, UserAchievement
from app.routers.auth import get_current_user

router = APIRouter(prefix="/achievements", tags=["Achievements"])


class BadgeResponse(BaseModel):
    key: str
    name: str
    category: str
    category_name: str
    tier: str
    blurb: str
    how: str
    target: int
    progress: int
    earned: bool
    earned_at: datetime | None
    is_new: bool


class AchievementsResponse(BaseModel):
    badges: list[BadgeResponse]
    earned: int
    total: int
    by_tier: dict[str, dict[str, int]]
    by_category: dict[str, dict[str, int | str]]


class SeenRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    keys: list[str] = Field(min_length=1, max_length=len(CATALOGUE))


def _summary(badges: list[dict]) -> AchievementsResponse:
    by_tier = {tier: {"earned": 0, "total": 0} for tier in TIERS}
    by_category = {key: {"name": name, "earned": 0, "total": 0} for key, name in CATEGORIES.items()}
    for badge in badges:
        by_tier[badge["tier"]]["total"] += 1
        by_category[badge["category"]]["total"] += 1
        if badge["earned"]:
            by_tier[badge["tier"]]["earned"] += 1
            by_category[badge["category"]]["earned"] += 1
    return AchievementsResponse(
        badges=badges,
        earned=sum(1 for badge in badges if badge["earned"]),
        total=len(badges),
        by_tier=by_tier,
        by_category=by_category,
    )


@router.get("", response_model=AchievementsResponse)
async def list_achievements(
    user: User = Depends(get_current_user),  # noqa: B008
    db: AsyncSession = Depends(get_db),  # noqa: B008
):
    """Every badge with this person's progress. Also awards any that are newly reached."""
    return _summary(await evaluate(user, db))


@router.post("/seen", status_code=204)
async def mark_seen(
    payload: SeenRequest,
    user: User = Depends(get_current_user),  # noqa: B008
    db: AsyncSession = Depends(get_db),  # noqa: B008
):
    """Record that the celebration for these badges has been shown."""
    keys = [key for key in payload.keys if key in BY_KEY]
    if keys:
        await db.execute(
            update(UserAchievement)
            .where(UserAchievement.user_id == user.id, UserAchievement.key.in_(keys))
            .values(seen=True)
        )
        await db.commit()
