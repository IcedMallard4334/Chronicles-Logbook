from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import Project, Task
from app.schemas import TaskCreate, TaskResponse, TaskUpdate

router = APIRouter(prefix="/projects/{project_id}/tasks", tags=["Tasks"])


async def _get_project_or_404(
    project_id: UUID,
    db: AsyncSession,
) -> Project:
    project = await db.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


@router.get("", response_model=list[TaskResponse])
async def list_tasks(
    project_id: UUID,
    completed: bool | None = None,
    db: AsyncSession = Depends(get_db),  # noqa: B008
):
    await _get_project_or_404(project_id, db)

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
    db: AsyncSession = Depends(get_db),  # noqa: B008
):
    await _get_project_or_404(project_id, db)

    task = Task(
        project_id=project_id,
        title=data.title,
        description=data.description,
        due_date=data.due_date,
    )
    db.add(task)
    await db.commit()
    await db.refresh(task)
    return task


@router.get("/{task_id}", response_model=TaskResponse)
async def get_task(
    project_id: UUID,
    task_id: UUID,
    db: AsyncSession = Depends(get_db),  # noqa: B008
):
    await _get_project_or_404(project_id, db)

    task = await db.get(Task, task_id)
    if not task or task.project_id != project_id:
        raise HTTPException(status_code=404, detail="Task not found")
    return task


@router.put("/{task_id}", response_model=TaskResponse)
async def update_task(
    project_id: UUID,
    task_id: UUID,
    data: TaskUpdate,
    db: AsyncSession = Depends(get_db),  # noqa: B008
):
    await _get_project_or_404(project_id, db)

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

    await db.commit()
    await db.refresh(task)
    return task


@router.patch("/{task_id}/toggle", response_model=TaskResponse)
async def toggle_task(
    project_id: UUID,
    task_id: UUID,
    db: AsyncSession = Depends(get_db),  # noqa: B008
):
    await _get_project_or_404(project_id, db)

    task = await db.get(Task, task_id)
    if not task or task.project_id != project_id:
        raise HTTPException(status_code=404, detail="Task not found")

    task.completed = not task.completed
    await db.commit()
    await db.refresh(task)
    return task


@router.delete("/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_task(
    project_id: UUID,
    task_id: UUID,
    db: AsyncSession = Depends(get_db),  # noqa: B008
):
    await _get_project_or_404(project_id, db)

    task = await db.get(Task, task_id)
    if not task or task.project_id != project_id:
        raise HTTPException(status_code=404, detail="Task not found")

    await db.delete(task)
    await db.commit()
