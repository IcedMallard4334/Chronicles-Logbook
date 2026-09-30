"""A user's own arrangement of saved statistics and views (US-3.9)."""

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import Dashboard, User
from app.routers.auth import get_current_user
from app.schemas import DashboardResponse, DashboardUpdate

router = APIRouter(prefix="/dashboard", tags=["Dashboard"])


async def _get_or_create(user: User, db: AsyncSession) -> Dashboard:
    dashboard = await db.scalar(select(Dashboard).where(Dashboard.user_id == user.id))
    if dashboard is None:
        dashboard = Dashboard(user_id=user.id, panels=[])
        db.add(dashboard)
        await db.commit()
        await db.refresh(dashboard)
    return dashboard


@router.get("", response_model=DashboardResponse)
async def read_dashboard(
    user: User = Depends(get_current_user),  # noqa: B008
    db: AsyncSession = Depends(get_db),  # noqa: B008
):
    """Return the caller's dashboard, creating an empty one on first visit."""
    return await _get_or_create(user, db)


@router.put("", response_model=DashboardResponse)
async def update_dashboard(
    payload: DashboardUpdate,
    user: User = Depends(get_current_user),  # noqa: B008
    db: AsyncSession = Depends(get_db),  # noqa: B008
):
    """Replace the caller's panel layout wholesale.

    Add, remove, and reorder are all the same request from the client's
    side: send the full desired panel list, in the new order. A panel's
    ``config`` (e.g. a filter_id or project_id) is not checked against the
    caller's own resources here — the endpoints that actually resolve a
    panel's data (saved filters, projects, statistics) already enforce
    ownership, so a panel pointing at an inaccessible or made-up id simply
    fails to resolve on read rather than exposing anything.
    """
    dashboard = await _get_or_create(user, db)
    if payload.columns is not None:
        dashboard.columns = payload.columns
    # A panel can't be wider than the grid it sits in, whatever the client sent.
    dashboard.panels = [
        {**panel.model_dump(mode="json"), "w": min(panel.w, dashboard.columns)} for panel in payload.panels
    ]
    await db.commit()
    await db.refresh(dashboard)
    return dashboard
