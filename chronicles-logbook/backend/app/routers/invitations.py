"""Invitations to somebody else's project, from the invitee's side.

Sharing used to be a grant: an owner typed an email and the project appeared
in that person's workspace, unasked, with no way to give it back. This is the
other half of it — the invitation arrives as something to answer, and until it
is answered it grants nothing at all.

Declining is kept rather than deleted, so that "no" is an answer the owner can
see rather than silence. Leaving a project afterwards lives on the projects
router, because by then it is an access question rather than an invitation.
"""

from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import (
    MEMBERSHIP_ACCEPTED,
    MEMBERSHIP_DECLINED,
    MEMBERSHIP_PENDING,
    Entry,
    Project,
    ProjectMember,
    User,
)
from app.routers.auth import get_current_user
from app.schemas import ProjectInvitationResponse

router = APIRouter(prefix="/invitations", tags=["Invitations"])


async def _pending_invitation(
    project_id: UUID,
    user: User,
    db: AsyncSession,
) -> ProjectMember:
    """The caller's unanswered invitation to a project, or 404.

    Answering twice is the ordinary consequence of a double click or a stale
    tab, so an already-answered invitation reads as "not found" rather than as
    a server error.
    """
    invitation = await db.scalar(
        select(ProjectMember).where(
            ProjectMember.project_id == project_id,
            ProjectMember.user_id == user.id,
            ProjectMember.status == MEMBERSHIP_PENDING,
        )
    )

    if invitation is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="This invitation is no longer waiting for an answer.",
        )

    return invitation


@router.get("", response_model=list[ProjectInvitationResponse])
async def list_invitations(
    user: User = Depends(get_current_user),  # noqa: B008
    db: AsyncSession = Depends(get_db),  # noqa: B008
):
    """Projects you have been asked to join and have not answered yet.

    Carries the project and inviter by name, and how much is already in the
    logbook, because "Thandi invited you to Fieldwork (48 entries)" is
    something you can decide about and a pair of ids is not.
    """
    result = await db.execute(
        select(ProjectMember, Project, func.count(Entry.id))
        .join(Project, ProjectMember.project_id == Project.id)
        .outerjoin(Entry, Entry.project_id == Project.id)
        .where(
            ProjectMember.user_id == user.id,
            ProjectMember.status == MEMBERSHIP_PENDING,
        )
        .group_by(ProjectMember.id, Project.id)
        .order_by(ProjectMember.created_at.desc())
    )

    return [
        ProjectInvitationResponse(
            project_id=project.id,
            project_name=project.name,
            project_description=project.description,
            invited_by_name=(
                invitation.inviter.full_name if invitation.inviter else None
            ),
            entry_count=entry_count,
            invited_at=invitation.created_at,
        )
        for invitation, project, entry_count in result.all()
    ]


@router.post("/{project_id}/accept", status_code=status.HTTP_204_NO_CONTENT)
async def accept_invitation(
    project_id: UUID,
    user: User = Depends(get_current_user),  # noqa: B008
    db: AsyncSession = Depends(get_db),  # noqa: B008
):
    """Join the project. From here it appears in your workspace and you can
    write entries in it; everything else stays with its owner."""
    invitation = await _pending_invitation(project_id, user, db)

    invitation.status = MEMBERSHIP_ACCEPTED
    invitation.responded_at = datetime.now(timezone.utc)

    await db.commit()

    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/{project_id}/decline", status_code=status.HTTP_204_NO_CONTENT)
async def decline_invitation(
    project_id: UUID,
    user: User = Depends(get_current_user),  # noqa: B008
    db: AsyncSession = Depends(get_db),  # noqa: B008
):
    """Turn the invitation down. The owner sees the answer, and the project
    never touches your workspace."""
    invitation = await _pending_invitation(project_id, user, db)

    invitation.status = MEMBERSHIP_DECLINED
    invitation.responded_at = datetime.now(timezone.utc)

    await db.commit()

    return Response(status_code=status.HTTP_204_NO_CONTENT)
