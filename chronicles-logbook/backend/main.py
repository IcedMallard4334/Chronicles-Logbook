import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.database import Base, async_engine
from app.routers import auth, projects

_DEFAULT_ORIGINS = [
    "http://localhost:5173",
    "https://localhost:5173",
]


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

_cors_origins = [
    origin.strip()
    for origin in os.environ.get("CORS_ORIGINS", "").split(",")
    if origin.strip()
] or _DEFAULT_ORIGINS

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(projects.router)
app.include_router(auth.router)


@app.get("/health")
async def health_check():
    return {"status": "ok"}
