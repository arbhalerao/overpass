from __future__ import annotations

from fastapi import APIRouter, status

from app.api.deps import AircraftServiceDep, SceneServiceDep
from app.api.presenters import to_observation_context
from app.core.clock import utc_now
from app.models.aircraft import AircraftResponse
from app.models.requests import SceneRequest
from app.models.responses import AircraftListResponse, ErrorResponse
from app.services.scene_service import SceneResult

router = APIRouter(tags=["aircraft"])


@router.post(
    "/aircraft",
    response_model=AircraftListResponse,
    summary="Aircraft inside the area",
    description=(
        "Returns every aircraft whose reported position falls inside the geodesic area centred on the request's coordinates."
        "Positions are not extrapolated. Use `source_time` together with each aircraft's `heading_deg` and `velocity_mps` to interpolate movement between updates."
    ),
    responses={
        status.HTTP_429_TOO_MANY_REQUESTS: {
            "model": ErrorResponse,
            "description": "The upstream provider's request quota is exhausted.",
        },
        status.HTTP_502_BAD_GATEWAY: {
            "model": ErrorResponse,
            "description": "The upstream aircraft provider failed.",
        },
        status.HTTP_503_SERVICE_UNAVAILABLE: {
            "model": ErrorResponse,
            "description": "No aircraft provider credentials are configured.",
        },
    },
)
async def list_aircraft(
    request: SceneRequest,
    scenes: SceneServiceDep,
    aircraft_service: AircraftServiceDep,
) -> AircraftListResponse:
    area = scenes.build_area(request)
    computation = await aircraft_service.compute(area)

    # reuse the scene presenter for the observation block so every endpoint describes the selected area identically
    context = to_observation_context(
        SceneResult(
            area=area,
            observation_time=request.resolved_time(),
            generated_at=utc_now(),
        )
    )

    return AircraftListResponse(
        observation=context,
        aircraft=[AircraftResponse.from_domain(state) for state in computation.aircraft],
        count=len(computation.aircraft),
        source_time=computation.source_time,
        generated_at=utc_now(),
    )


__all__ = ["router"]
