"""Named, re-applyable entry filters (US-2.12)."""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import Project, SavedFilter, User
from app.routers.auth import get_current_user
from app.schemas import SavedFilterCreate, SavedFilterResponse

router = APIRouter(prefix="/saved-filters", tags=["Saved filters"])


@router.get("", response_model=list[SavedFilterResponse])
async def list_saved_filters(
    user: User = Depends(get_current_user),  # noqa: B008
    db: AsyncSession = Depends(get_db),  # noqa: B008
):
    """Return the caller's saved filters, most recently saved first."""
    result = await db.execute(
        select(SavedFilter)
        .where(SavedFilter.user_id == user.id)
        .order_by(SavedFilter.updated_at.desc(), SavedFilter.name.asc())
    )

    return result.scalars().all()


@router.post("", response_model=SavedFilterResponse, status_code=status.HTTP_201_CREATED)
async def save_filter(
    payload: SavedFilterCreate,
    response: Response,
    user: User = Depends(get_current_user),  # noqa: B008
    db: AsyncSession = Depends(get_db),  # noqa: B008
):
    """Save a filter under a name, replacing any filter already using it.

    Re-using a name overwrites rather than failing: from the user's side
    "save this as My Bugs" a second time is an update to that saved view,
    and rejecting it would leave them stuck deleting the old one first.
    """
    criteria = payload.criteria

    # Refuse a filter pinned to a project the caller does not own, so a
    # saved filter can never be used to probe for other users' project ids.
    if criteria.project_id is not None:
        project = await db.scalar(
            select(Project).where(
                Project.id == criteria.project_id,
                Project.user_id == user.id,
            )
        )
        if project is None:
            raise HTTPException(status_code=404, detail="Project not found")

    existing = await db.scalar(
        select(SavedFilter).where(
            SavedFilter.user_id == user.id,
            SavedFilter.name == payload.name,
        )
    )

    if existing is not None:
        existing.criteria = criteria.model_dump(mode="json")
        await db.commit()
        await db.refresh(existing)
        response.status_code = status.HTTP_200_OK
        return existing

    saved = SavedFilter(
        user_id=user.id,
        name=payload.name,
        criteria=criteria.model_dump(mode="json"),
    )
    db.add(saved)
    await db.commit()
    await db.refresh(saved)

    return saved


@router.delete("/{filter_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_saved_filter(
    filter_id: UUID,
    user: User = Depends(get_current_user),  # noqa: B008
    db: AsyncSession = Depends(get_db),  # noqa: B008
):
    # Scoped by user_id so someone else's filter is indistinguishable from
    # one that does not exist.
    saved = await db.scalar(
        select(SavedFilter).where(
            SavedFilter.id == filter_id,
            SavedFilter.user_id == user.id,
        )
    )

    if saved is None:
        raise HTTPException(status_code=404, detail="Saved filter not found")

    await db.delete(saved)
    await db.commit()
