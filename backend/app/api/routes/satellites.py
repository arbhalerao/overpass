from __future__ import annotations

from fastapi import APIRouter, status

from app.api.deps import SatelliteServiceDep, SceneServiceDep
from app.api.presenters import to_observation_context, to_sky_conditions
from app.core.clock import utc_now
from app.models.requests import SceneRequest
from app.models.responses import ErrorResponse, SatelliteListResponse
from app.models.satellite import SatelliteResponse
from app.services.scene_service import SceneResult

router = APIRouter(tags=["satellites"])


@router.post(
    "/satellites",
    response_model=SatelliteListResponse,
    summary="Satellites above the horizon",
    description=(
        "Propagates the cached CelesTrak GP/OMM element sets to the observation time and returns the satellites above the observer's horizon."
        "`azimuth_deg` is measured clockwise from true north and `altitude_deg` upward from the horizon."
        "`is_visible` says whether a satellite can actually be seen right now: sunlit, above the horizon, and dark enough on the ground."
    ),
    responses={
        status.HTTP_502_BAD_GATEWAY: {
            "model": ErrorResponse,
            "description": "Orbital element data could not be obtained.",
        }
    },
)
async def list_satellites(
    request: SceneRequest,
    scenes: SceneServiceDep,
    satellite_service: SatelliteServiceDep,
) -> SatelliteListResponse:
    area = scenes.build_area(request)
    observation_time = request.resolved_time()
    computation = await satellite_service.compute(
        request.center, observation_time, request.min_satellite_elevation_deg
    )

    context = to_observation_context(
        SceneResult(
            area=area,
            observation_time=observation_time,
            generated_at=utc_now(),
        )
    )

    return SatelliteListResponse(
        observation=context,
        satellites=[
            SatelliteResponse.from_domain(satellite, observation_time)
            for satellite in computation.satellites
        ],
        count=len(computation.satellites),
        sky=to_sky_conditions(computation.sky),
        min_elevation_deg=computation.min_elevation_deg,
        groups=list(computation.groups),
        elements_updated_at=computation.elements_updated_at,
        generated_at=utc_now(),
    )


__all__ = ["router"]
