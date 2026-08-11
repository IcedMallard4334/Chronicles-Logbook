from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.database import Base, async_engine
from app.routers import projects


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Dev-convenience: creates tables directly from the models if they don't
    # exist yet. Fine for Sprint 1. Once the schema starts changing between
    # sprints, replace this with a real migration tool (Alembic) so existing
    # data isn't at risk of being silently out of sync with the models.
    async with async_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield


app = FastAPI(title="Chronicles API", lifespan=lifespan)

app.include_router(projects.router)


@app.get("/health")
async def health_check():
    return {"status": "ok"}
