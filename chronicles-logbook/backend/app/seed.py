"""
Seeds the database with a realistic demo project so there's something to
click through in a review, rather than an empty logbook.

Run with:
    python -m app.seed

Safe to re-run — it checks for the demo project by name first and does
nothing if it already exists, rather than creating duplicates every time.
"""
import asyncio

from sqlalchemy import select

from app.database import AsyncSessionFactory, Base, async_engine
from app.models import Entry, Project

DEMO_PROJECT_NAME = "SDP: Chronicles Backend"

DEMO_SCHEMA = [
    {"id": "field-summary", "name": "Summary", "type": "text"},
    {"id": "field-hours", "name": "Hours spent", "type": "number"},
    {
        "id": "field-status",
        "name": "Status",
        "type": "dropdown",
        "options": ["Blocked", "In progress", "Done"],
    },
]

DEMO_ENTRIES = [
    {
        "field-summary": "Set up FastAPI project skeleton and async DB connection.",
        "field-hours": 3,
        "field-status": "Done",
    },
    {
        "field-summary": "Built schema-driven entry validation for custom project fields.",
        "field-hours": 4.5,
        "field-status": "Done",
    },
    {
        "field-summary": "Added project archiving and full entry CRUD (get/update/delete).",
        "field-hours": 2,
        "field-status": "In progress",
    },
]


async def seed() -> None:
    async with async_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with AsyncSessionFactory() as session:
        existing = await session.execute(
            select(Project).where(Project.name == DEMO_PROJECT_NAME)
        )
        if existing.scalar_one_or_none() is not None:
            print(f"Demo project '{DEMO_PROJECT_NAME}' already exists — skipping.")
            return

        project = Project(
            name=DEMO_PROJECT_NAME,
            description="Demo data for the Sprint 1 review — created by app/seed.py",
            entry_schema=DEMO_SCHEMA,
        )
        session.add(project)
        await session.flush()  # assigns project.id without committing yet

        for entry_data in DEMO_ENTRIES:
            session.add(Entry(project_id=project.id, data=entry_data))

        await session.commit()
        print(f"Seeded '{DEMO_PROJECT_NAME}' with {len(DEMO_ENTRIES)} entries.")


if __name__ == "__main__":
    asyncio.run(seed())
