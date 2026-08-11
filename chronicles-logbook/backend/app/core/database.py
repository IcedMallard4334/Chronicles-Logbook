"""
Database connection layer — async, to match the asyncpg driver in
DATABASE_URL (postgresql+asyncpg://... in prod).

Locally, use SQLite's async driver (aiosqlite) rather than the plain
sqlite:// URL, so the same async session code works in both environments:
    DATABASE_URL=sqlite+aiosqlite:///./chronicles.db
"""
from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from app.core.config import get_settings

settings = get_settings()

# SQLite (via aiosqlite) needs this connect_arg when used from a threaded
# server; Postgres/asyncpg doesn't, so only add it conditionally.
connect_args = {"check_same_thread": False} if "sqlite" in settings.DATABASE_URL else {}

engine = create_async_engine(settings.DATABASE_URL, connect_args=connect_args, pool_pre_ping=True)

SessionLocal = async_sessionmaker(bind=engine, class_=AsyncSession, expire_on_commit=False)


class Base(DeclarativeBase):
    """Every model inherits from this."""
    pass


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """
    FastAPI dependency. Yields a DB session per-request and always closes it,
    even if the request handler raises.

    Usage in a route:
        @router.get("/projects")
        async def list_projects(db: AsyncSession = Depends(get_db)):
            ...
    """
    async with SessionLocal() as session:
        yield session
