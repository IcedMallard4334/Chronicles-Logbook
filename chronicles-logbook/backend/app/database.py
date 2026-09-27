import os

from sqlalchemy import JSON
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy.types import TypeDecorator

from app.config import DATABASE_SSL, DATABASE_URL, SQL_DEBUG


class Base(DeclarativeBase):
    pass


class JSONType(TypeDecorator):
    """JSON column that uses JSONB on PostgreSQL and JSON elsewhere (e.g. SQLite)."""

    impl = JSON
    cache_ok = True

    def load_dialect_impl(self, dialect):
        if dialect.name == "postgresql":
            return dialect.type_descriptor(JSONB)
        return dialect.type_descriptor(JSON)


_connect_args = (
    {"ssl": "require"}
    if DATABASE_SSL and DATABASE_URL.startswith("postgresql")
    else {}
)

# Connection pool sizing (US-3.18). SQLAlchemy's defaults (5 pooled + 10 overflow)
# made requests queue for a connection once ~15 were in flight, and overflow
# connections are closed as soon as they're returned, so sustained load kept
# opening fresh TLS connections to Azure Postgres. Per worker process: keep the
# total (pool + overflow) x workers under the database's connection limit.
_pool_args = (
    {
        "pool_size": int(os.environ.get("DB_POOL_SIZE", "10")),
        "max_overflow": int(os.environ.get("DB_MAX_OVERFLOW", "5")),
        "pool_pre_ping": True,  # drop connections Azure closed while idle
        "pool_recycle": 1800,
    }
    if DATABASE_URL.startswith("postgresql")
    else {}
)

async_engine = create_async_engine(
    DATABASE_URL,
    echo=SQL_DEBUG,
    hide_parameters=True,
    connect_args=_connect_args,
    **_pool_args,
)


AsyncSessionFactory = async_sessionmaker(async_engine, expire_on_commit=False)


async def get_db():
    async with AsyncSessionFactory() as session:
        yield session
