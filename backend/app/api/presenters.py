from __future__ import annotations

from app.models.aircraft import AircraftResponse
from app.models.observer import BoundingBox, ObservationContext, Observer
from app.models.satellite import SatelliteResponse
from app.models.scene import SceneResponse, SkyConditionsResponse, SourceStatusResponse
from app.services.ephemeris_service import SkyConditions
from app.services.scene_service import SceneResult


def to_observation_context(result: SceneResult) -> ObservationContext:
    area = result.area
    return ObservationContext(
        center=Observer(latitude=area.center_latitude, longitude=area.center_longitude),
        radius_km=area.radius_km,
        bounding_box=BoundingBox.from_geometry(area),
        time=result.observation_time.isoformat(),
        timezone=result.timezone.zone if result.timezone else None,
        utc_offset_minutes=(result.timezone.utc_offset_minutes if result.timezone else None),
    )


def to_sky_conditions(sky: SkyConditions | None) -> SkyConditionsResponse | None:
    if sky is None:
        return None
    return SkyConditionsResponse(
        sun_altitude_deg=round(sky.sun_altitude_deg, 2),
        condition=sky.condition.value,
        is_dark=sky.is_dark,
    )


def to_scene_response(result: SceneResult) -> SceneResponse:
    return SceneResponse(
        observation=to_observation_context(result),
        aircraft=[AircraftResponse.from_domain(state) for state in result.aircraft],
        satellites=[
            SatelliteResponse.from_domain(satellite, result.observation_time)
            for satellite in result.satellites
        ],
        sky=to_sky_conditions(result.sky),
        sources=[SourceStatusResponse.from_domain(report) for report in result.sources],
        warnings=result.warnings,
        partial=result.partial,
        generated_at=result.generated_at,
    )


__all__ = ["to_observation_context", "to_scene_response", "to_sky_conditions"]
