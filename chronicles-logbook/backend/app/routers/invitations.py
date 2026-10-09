"""Invitations to somebody else's project, from the invitee's side.

Sharing used to be a grant: an owner typed an email and the project appeared
in that person's workspace, unasked, with no way to give it back. This is the
other half of it — the invitation arrives as something to answer, and until it
is answered it grants nothing at all.

Declining is kept rather than deleted, so that "no" is an answer the owner can
see rather than silence. Leaving a project afterwards lives on the projects
router, because by then it is an access question rather than an invitation.
"""

from datetime import datetime, timedelta, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import func, select, update
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
from app.schemas import InvitationAnswerResponse, ProjectInvitationResponse

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


# How long an answer is worth telling the owner about. Older ones are history, and without
# a limit every answer given before dismissal existed would arrive at once.
ANSWER_NOTICE_DAYS = 14


@router.get("/answers", response_model=list[InvitationAnswerResponse])
async def list_answers(
    user: User = Depends(get_current_user),  # noqa: B008
    db: AsyncSession = Depends(get_db),  # noqa: B008
):
    """Invitations you sent that have been answered, until you dismiss them.

    The other half of the bell: it tells the owner "Sam joined Fieldwork" or "Lee
    declined", so they find out without opening the members list.
    """
    since = datetime.now(timezone.utc) - timedelta(days=ANSWER_NOTICE_DAYS)
    result = await db.execute(
        select(ProjectMember, Project)
        .join(Project, ProjectMember.project_id == Project.id)
        .where(
            Project.user_id == user.id,
            ProjectMember.status.in_([MEMBERSHIP_ACCEPTED, MEMBERSHIP_DECLINED]),
            ProjectMember.responded_at.is_not(None),
            ProjectMember.responded_at >= since,
            ProjectMember.owner_seen_at.is_(None),
        )
        .order_by(ProjectMember.responded_at.desc())
    )
    return [
        InvitationAnswerResponse(
            project_id=project.id,
            project_name=project.name,
            person_name=membership.member.full_name,
            answer=membership.status,
            answered_at=membership.responded_at,
        )
        for membership, project in result.all()
    ]


@router.post("/answers/seen", status_code=status.HTTP_204_NO_CONTENT)
async def dismiss_answers(
    user: User = Depends(get_current_user),  # noqa: B008
    db: AsyncSession = Depends(get_db),  # noqa: B008
):
    """Dismiss every notice of an answered invitation for the caller's projects."""
    mine = select(Project.id).where(Project.user_id == user.id)
    await db.execute(
        update(ProjectMember)
        .where(
            ProjectMember.project_id.in_(mine),
            ProjectMember.responded_at.is_not(None),
            ProjectMember.owner_seen_at.is_(None),
        )
        .values(owner_seen_at=datetime.now(timezone.utc))
    )
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


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
