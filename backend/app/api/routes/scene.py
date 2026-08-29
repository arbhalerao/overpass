from __future__ import annotations

from fastapi import APIRouter, status

from app.api.deps import SceneServiceDep
from app.api.presenters import to_scene_response
from app.models.requests import SceneRequest
from app.models.responses import ErrorResponse
from app.models.scene import SceneResponse

router = APIRouter(tags=["scene"])


@router.post(
    "/scene",
    response_model=SceneResponse,
    summary="Everything above this point",
    description=(
        "The primary endpoint: aircraft inside the area, plus the satellites visible from its centre, computed concurrently for one instant."
        "Sources are independent. If one fails the rest are still returned, `partial` is set, and `sources` explains what went wrong -- so a dead aircraft feed never blanks the sky."
        "Aircraft carry map coordinates (latitude/longitude plus area-relative `normalized_x`/`normalized_y`)."
        "celestial objects and satellites carry horizontal coordinates (`azimuth_deg`/`altitude_deg`)."
        "The two are deliberately not merged."
    ),
    responses={
        422: {
            "model": ErrorResponse,
            "description": "The request or the requested geographic area is invalid.",
        },
        status.HTTP_503_SERVICE_UNAVAILABLE: {
            "model": ErrorResponse,
            "description": "Every requested source is unavailable.",
        },
    },
)
async def get_scene(request: SceneRequest, scenes: SceneServiceDep) -> SceneResponse:
    result = await scenes.build(request)
    return to_scene_response(result)


__all__ = ["router"]
