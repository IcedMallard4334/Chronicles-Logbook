from sqlalchemy import JSON
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy.types import TypeDecorator

from app.config import DATABASE_URL, SQL_DEBUG


class Base(DeclarativeBase):
    pass


class JSONType(TypeDecorator):
    """JSON column that uses JSONB on PostgreSQL and JSON elsewhere (e.g. SQLite)."""

    impl = JSON

    def load_dialect_impl(self, dialect):
        if dialect.name == "postgresql":
            return dialect.type_descriptor(JSONB)
        return dialect.type_descriptor(JSON)


async_engine = create_async_engine(
    DATABASE_URL,
    echo=SQL_DEBUG,
    connect_args={"ssl": "require"},
)


AsyncSessionFactory = async_sessionmaker(async_engine, expire_on_commit=False)


async def get_db():
    async with AsyncSessionFactory() as session:
        yield session
