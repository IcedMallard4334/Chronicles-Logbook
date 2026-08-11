import uuid

from sqlalchemy import Boolean, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.base import GUID, TimestampMixin


class User(Base, TimestampMixin):
    """
    Deliberately minimal — Ethan owns US4 (Sign Up & Sign In) and will extend
    this. This skeleton just needs the table to exist so:
      - Ethan can build POST /auth/signup and POST /auth/signin against it
      - Project has somewhere to point its owner_id foreign key

    Password hashing is NOT implemented here. Per the project brief's key
    requirements, auth must use an established library (e.g. passlib +
    python-jose, or Authlib) rather than a hand-rolled scheme — that's
    Ethan's call to make in US4, not something to hard-code in the skeleton.
    """
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(GUID(), primary_key=True, default=uuid.uuid4)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    projects: Mapped[list["Project"]] = relationship(back_populates="owner", cascade="all, delete-orphan")
