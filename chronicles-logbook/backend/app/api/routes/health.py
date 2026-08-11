"""
Acceptance test #1: "Given the backend is deployed, When a health-check
endpoint is called, Then it returns a 200 response."

Also genuinely useful: Azure App Service can be pointed at this as its
health-check path so it knows to restart the instance if the app is up but
unresponsive.
"""
from fastapi import APIRouter

from app.core.config import get_settings
from app.schemas.common import HealthCheckResponse

router = APIRouter(tags=["health"])
settings = get_settings()


@router.get("/health", response_model=HealthCheckResponse)
def health_check() -> HealthCheckResponse:
    return HealthCheckResponse(status="ok", environment=settings.ENVIRONMENT)
