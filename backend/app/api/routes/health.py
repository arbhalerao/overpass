from __future__ import annotations

from fastapi import APIRouter

from app.api.deps import ContainerDep
from app.core.clock import utc_now
from app.models.responses import HealthResponse

router = APIRouter(tags=["health"])

APP_VERSION = "0.1.0"


@router.get(
    "/health",
    response_model=HealthResponse,
    summary="Service health",
    description=(
        "Reports application liveness plus the readiness of each data source."
        "The overall status is 'ok' when at least one layer can be served."
        "Individual sources report their own state."
    ),
)
async def health(container: ContainerDep) -> HealthResponse:
    ephemeris = container.ephemeris
    aircraft = container.aircraft_service
    satellites = container.satellite_service
    tracked = satellites.describe()["tracked_satellites"]

    services = {
        "aircraft": "ready" if aircraft.is_configured else "unavailable",
        "satellites": "ready" if tracked else "degraded",
        # the Sun's position; without it satellites still fly, but the API cannot say whether any of them are visible
        "visibility": "ready" if ephemeris.has_sun else "unavailable",
    }

    return HealthResponse(
        status="ok" if (aircraft.is_configured or tracked) else "degraded",
        app_name=container.settings.app_name,
        environment=container.settings.app_env,
        version=APP_VERSION,
        time=utc_now(),
        uptime_seconds=round(container.uptime_seconds, 3),
        services=services,
        details={
            "aircraft": aircraft.describe(),
            "satellites": satellites.describe(),
            "ephemeris": ephemeris.describe(),
        },
    )


__all__ = ["APP_VERSION", "router"]
