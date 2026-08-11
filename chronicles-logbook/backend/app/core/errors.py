"""
Consistent error handling.

Task requirement: "Implement basic error handling and response format."

Rather than letting FastAPI's default validation errors and unhandled
exceptions leak inconsistent shapes to the frontend, everything gets funneled
through the same { "error": { "code", "message" } } envelope (see
schemas/common.py).
"""
import logging

from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

logger = logging.getLogger("chronicles")


class APIError(Exception):
    """
    Base class for app-level errors. Route handlers should raise this (or a
    subclass) instead of returning ad-hoc error dicts, e.g.:

        raise NotFoundError("Project not found")
    """

    status_code = status.HTTP_400_BAD_REQUEST
    code = "BAD_REQUEST"

    def __init__(self, message: str):
        self.message = message
        super().__init__(message)


class NotFoundError(APIError):
    status_code = status.HTTP_404_NOT_FOUND
    code = "NOT_FOUND"


class UnauthorizedError(APIError):
    status_code = status.HTTP_401_UNAUTHORIZED
    code = "UNAUTHORIZED"


class ForbiddenError(APIError):
    status_code = status.HTTP_403_FORBIDDEN
    code = "FORBIDDEN"


def register_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(APIError)
    async def handle_api_error(request: Request, exc: APIError) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code,
            content={"error": {"code": exc.code, "message": exc.message}},
        )

    @app.exception_handler(RequestValidationError)
    async def handle_validation_error(request: Request, exc: RequestValidationError) -> JSONResponse:
        # Pydantic/FastAPI's own validation errors (missing fields, wrong
        # types) get flattened into the same envelope instead of FastAPI's
        # default { "detail": [...] } shape.
        first_error = exc.errors()[0] if exc.errors() else {}
        field = ".".join(str(p) for p in first_error.get("loc", [])[1:])  # skip "body"
        message = f"{field}: {first_error.get('msg', 'invalid input')}" if field else "Invalid request"
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            content={"error": {"code": "VALIDATION_ERROR", "message": message}},
        )

    @app.exception_handler(Exception)
    async def handle_unexpected_error(request: Request, exc: Exception) -> JSONResponse:
        # Catch-all so an unhandled bug never leaks a stack trace to the
        # frontend or the browser console in production.
        logger.exception("Unhandled exception on %s %s", request.method, request.url)
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={"error": {"code": "INTERNAL_ERROR", "message": "Something went wrong. Please try again."}},
        )
