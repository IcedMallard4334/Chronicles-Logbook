"""
Common response envelope.

Task requirement: "Implement basic error handling and response format."
Every successful response and every error response goes through one of
these two shapes, so the frontend can always predict what it's getting back
regardless of which route it called.

Success:
    { "data": <payload>, "meta": {...} }

Error:
    { "error": { "code": "NOT_FOUND", "message": "Project not found" } }
"""
from typing import Any, Generic, TypeVar

from pydantic import BaseModel

T = TypeVar("T")


class ErrorDetail(BaseModel):
    code: str
    message: str


class ErrorResponse(BaseModel):
    error: ErrorDetail


class DataResponse(BaseModel, Generic[T]):
    data: T
    meta: dict[str, Any] | None = None


class HealthCheckResponse(BaseModel):
    status: str
    environment: str
