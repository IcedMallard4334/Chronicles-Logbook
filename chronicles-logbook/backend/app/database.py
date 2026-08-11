from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from app.config import DATABASE_URL, SQL_DEBUG


class Base(DeclarativeBase):
    pass


async_engine = create_async_engine(
    DATABASE_URL,
    echo=SQL_DEBUG,
    connect_args={"ssl": "require"},
)


AsyncSessionFactory = async_sessionmaker(async_engine, expire_on_commit=False)


async def get_db():
    async with AsyncSessionFactory() as session:
        yield session
