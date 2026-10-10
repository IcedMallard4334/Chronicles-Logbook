"""Notes on a project: private to their author, or shared with everyone on it.

A note is for what does not fit an entry: a reminder to oneself, a decision the team
reached, a link to keep. It has no schema and no version history, and it is not counted
in any statistic.

Who sees what is decided in the query, not after it. A reader gets shared notes plus
their own private ones, so someone else's private note is never loaded, and asking for
it by id looks exactly like asking for one that does not exist (404, not 403), which
also stops the id being used to learn that it exists.

Who may change what: only the author edits a note. The author or the project's owner may
delete a *shared* note, so an owner can take down something that should not stay on the
team's page; the owner has no power over another person's private note.
"""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import NOTE_PRIVATE, NOTE_SHARED, Project, ProjectNote, User
from app.routers.auth import get_current_user
from app.routers.projects import _get_readable_project
from app.schemas import NoteAuthor, NoteCreate, NoteResponse, NoteUpdate

router = APIRouter(prefix="/projects/{project_id}/notes", tags=["Notes"])

# A page of notes is plenty for one project; asking for more is not a use this serves.
MAX_NOTES_LISTED = 200
MAX_SEARCH_LENGTH = 200


def _visible_to(user: User):
    return or_(
        ProjectNote.visibility == NOTE_SHARED,
        and_(ProjectNote.visibility == NOTE_PRIVATE, ProjectNote.author_id == user.id),
    )


def _present(note: ProjectNote, project: Project, user: User) -> NoteResponse:
    mine = note.author_id == user.id
    author = note.author
    return NoteResponse(
        id=note.id,
        project_id=note.project_id,
        author=NoteAuthor(
            user_id=note.author_id,
            full_name=author.full_name if author else "Former member",
            avatar_url=author.avatar_url if author else None,
        ),
        body=note.body,
        visibility=note.visibility,
        pinned=note.pinned,
        created_at=note.created_at,
        updated_at=note.updated_at,
        mine=mine,
        can_edit=mine,
        can_delete=mine or (note.visibility == NOTE_SHARED and project.user_id == user.id),
    )


async def _visible_note(project_id: UUID, note_id: UUID, user: User, db: AsyncSession) -> ProjectNote:
    note = await db.scalar(
        select(ProjectNote).where(
            ProjectNote.id == note_id,
            ProjectNote.project_id == project_id,
            _visible_to(user),
        )
    )
    if note is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Note not found")
    return note


@router.get("", response_model=list[NoteResponse])
async def list_notes(
    project_id: UUID,
    visibility: str | None = Query(default=None, pattern="^(private|shared)$"),
    q: str | None = Query(default=None, max_length=MAX_SEARCH_LENGTH),
    user: User = Depends(get_current_user),  # noqa: B008
    db: AsyncSession = Depends(get_db),  # noqa: B008
):
    """The shared notes on a project plus the caller's own private ones.

    Pinned first, then the most recently changed. ``visibility`` narrows the list;
    asking for ``private`` still only ever returns the caller's own. ``q`` keeps the
    notes whose text, or whose author's name, contains it (any case). It is applied
    on top of the visibility rule, never instead of it, so a search cannot surface
    someone else's private note.
    """
    project = await _get_readable_project(project_id, user, db)
    query = select(ProjectNote).where(ProjectNote.project_id == project.id, _visible_to(user))
    if visibility:
        query = query.where(ProjectNote.visibility == visibility)
    term = (q or "").strip()
    if term:
        # autoescape makes % and _ ordinary characters, so "50%" finds "50%" and not everything.
        query = query.where(
            or_(
                ProjectNote.body.icontains(term, autoescape=True),
                ProjectNote.author.has(User.full_name.icontains(term, autoescape=True)),
            )
        )
    notes = (
        await db.scalars(
            query.order_by(ProjectNote.pinned.desc(), ProjectNote.updated_at.desc()).limit(MAX_NOTES_LISTED)
        )
    ).all()
    return [_present(note, project, user) for note in notes]


@router.post("", response_model=NoteResponse, status_code=status.HTTP_201_CREATED)
async def create_note(
    project_id: UUID,
    payload: NoteCreate,
    user: User = Depends(get_current_user),  # noqa: B008
    db: AsyncSession = Depends(get_db),  # noqa: B008
):
    """Anyone who can read the project may write a note on it. Private unless said otherwise."""
    project = await _get_readable_project(project_id, user, db)
    note = ProjectNote(
        project_id=project.id,
        author_id=user.id,
        body=payload.body,
        visibility=payload.visibility,
        pinned=payload.pinned,
    )
    db.add(note)
    await db.commit()
    await db.refresh(note)
    return _present(note, project, user)


@router.put("/{note_id}", response_model=NoteResponse)
async def update_note(
    project_id: UUID,
    note_id: UUID,
    payload: NoteUpdate,
    user: User = Depends(get_current_user),  # noqa: B008
    db: AsyncSession = Depends(get_db),  # noqa: B008
):
    """Change the text, the visibility or the pin. Only the author may; others get 403 on a shared note."""
    project = await _get_readable_project(project_id, user, db)
    note = await _visible_note(project.id, note_id, user, db)
    if note.author_id != user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only the author can change a note")
    if payload.body is not None:
        note.body = payload.body
    if payload.visibility is not None:
        note.visibility = payload.visibility
    if payload.pinned is not None:
        note.pinned = payload.pinned
    await db.commit()
    await db.refresh(note)
    return _present(note, project, user)


@router.delete("/{note_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_note(
    project_id: UUID,
    note_id: UUID,
    user: User = Depends(get_current_user),  # noqa: B008
    db: AsyncSession = Depends(get_db),  # noqa: B008
):
    """The author may delete their note; the project's owner may also delete a shared one."""
    project = await _get_readable_project(project_id, user, db)
    note = await _visible_note(project.id, note_id, user, db)
    if not _present(note, project, user).can_delete:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You cannot delete this note")
    await db.delete(note)
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
