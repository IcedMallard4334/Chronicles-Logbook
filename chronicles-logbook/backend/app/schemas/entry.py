import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict


class EntryCreate(BaseModel):
    # data's actual required keys depend on the owning project's
    # schema_definition — Athalia's US10/US12 work validates that. This
    # skeleton just accepts an arbitrary JSON object.
    data: dict[str, Any] = {}
    time_spent_minutes: int = 0


class EntryRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    project_id: uuid.UUID
    data: dict[str, Any]
    time_spent_minutes: int
    created_at: datetime
    updated_at: datetime
