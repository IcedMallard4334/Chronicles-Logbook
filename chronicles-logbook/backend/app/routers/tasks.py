from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import Project, Task, User
from app.routers.auth import get_current_user
from app.routers.projects import _get_readable_project
from app.schemas import TaskCreate, TaskResponse, TaskUpdate

router = APIRouter(prefix="/projects/{project_id}/tasks", tags=["Tasks"])


async def _get_user_project(
    project_id: UUID,
    user: User,
    db: AsyncSession,
) -> Project:
    """Resolve a project the caller owns, or 404.

    Scoped by user_id rather than id alone: a project belonging to someone
    else must be indistinguishable from one that does not exist, otherwise
    the response confirms which project ids are real.
    """
    project = await db.scalar(
        select(Project).where(
            Project.id == project_id,
            Project.user_id == user.id,
        )
    )

    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    return project


@router.get("", response_model=list[TaskResponse])
async def list_tasks(
    project_id: UUID,
    completed: bool | None = None,
    user: User = Depends(get_current_user),  # noqa: B008
    db: AsyncSession = Depends(get_db),  # noqa: B008
):
    await _get_readable_project(project_id, user, db)

    query = select(Task).where(Task.project_id == project_id)
    if completed is not None:
        query = query.where(Task.completed == completed)
    query = query.order_by(Task.due_date.asc().nulls_last(), Task.created_at.desc())

    result = await db.execute(query)
    return result.scalars().all()


@router.post("", response_model=TaskResponse, status_code=status.HTTP_201_CREATED)
async def create_task(
    project_id: UUID,
    data: TaskCreate,
    user: User = Depends(get_current_user),  # noqa: B008
    db: AsyncSession = Depends(get_db),  # noqa: B008
):
    await _get_readable_project(project_id, user, db)

    task = Task(
        project_id=project_id,
        title=data.title,
        description=data.description,
        due_date=data.due_date,
        checklist=[item.model_dump() for item in data.checklist],
        created_by=user.id,
    )
    db.add(task)
    await db.commit()
    await db.refresh(task)
    return task


@router.get("/{task_id}", response_model=TaskResponse)
async def get_task(
    project_id: UUID,
    task_id: UUID,
    user: User = Depends(get_current_user),  # noqa: B008
    db: AsyncSession = Depends(get_db),  # noqa: B008
):
    await _get_readable_project(project_id, user, db)

    task = await db.get(Task, task_id)
    if not task or task.project_id != project_id:
        raise HTTPException(status_code=404, detail="Task not found")
    return task


@router.put("/{task_id}", response_model=TaskResponse)
async def update_task(
    project_id: UUID,
    task_id: UUID,
    data: TaskUpdate,
    user: User = Depends(get_current_user),  # noqa: B008
    db: AsyncSession = Depends(get_db),  # noqa: B008
):
    await _get_user_project(project_id, user, db)

    task = await db.get(Task, task_id)
    if not task or task.project_id != project_id:
        raise HTTPException(status_code=404, detail="Task not found")

    if data.title is not None:
        task.title = data.title
    if data.description is not None:
        task.description = data.description
    if data.due_date is not None:
        task.due_date = data.due_date
    if data.completed is not None:
        task.completed = data.completed
    if data.checklist is not None:
        task.checklist = [item.model_dump() for item in data.checklist]

    await db.commit()
    await db.refresh(task)
    return task


@router.patch("/{task_id}/toggle", response_model=TaskResponse)
async def toggle_task(
    project_id: UUID,
    task_id: UUID,
    user: User = Depends(get_current_user),  # noqa: B008
    db: AsyncSession = Depends(get_db),  # noqa: B008
):
    # Ticking work off is the point of sharing a task list, so a collaborator
    # may do it. Editing a task's wording and deleting it stay with the owner.
    await _get_readable_project(project_id, user, db)

    task = await db.get(Task, task_id)
    if not task or task.project_id != project_id:
        raise HTTPException(status_code=404, detail="Task not found")

    task.completed = not task.completed
    # Cleared on reopening, so the field always describes the completion that
    # currently stands rather than whoever happened to tick it once before.
    task.completed_by = user.id if task.completed else None
    await db.commit()
    await db.refresh(task)
    return task


@router.delete("/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_task(
    project_id: UUID,
    task_id: UUID,
    user: User = Depends(get_current_user),  # noqa: B008
    db: AsyncSession = Depends(get_db),  # noqa: B008
):
    await _get_user_project(project_id, user, db)

    task = await db.get(Task, task_id)
    if not task or task.project_id != project_id:
        raise HTTPException(status_code=404, detail="Task not found")

    await db.delete(task)
    await db.commit()
