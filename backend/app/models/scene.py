from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field

from app.domain.sky_object import SourceReport, SourceStatus
from app.models.aircraft import AircraftResponse
from app.models.observer import ObservationContext
from app.models.satellite import SatelliteResponse


class SourceStatusResponse(BaseModel):
    source: str = Field(..., description="Layer name: aircraft or satellites.")
    status: SourceStatus = Field(..., description="ok, disabled, degraded or error.")
    message: str | None = Field(default=None, description="Human readable explanation.")
    error_code: str | None = Field(
        default=None, description="Machine readable error code when status is 'error'."
    )
    object_count: int = Field(default=0, description="Number of objects this source contributed.")
    details: dict[str, object] = Field(
        default_factory=dict,
        description="Extra structured context, never containing secrets.",
    )

    @classmethod
    def from_domain(cls, report: SourceReport) -> SourceStatusResponse:
        return cls(
            source=report.source,
            status=report.status,
            message=report.message,
            error_code=report.error_code,
            object_count=report.object_count,
            details=report.details,
        )


class SkyConditionsResponse(BaseModel):
    """
    lighting at the observer, which decides whether satellites can be seen

    a satellite is only visible to the naked eye when it is catching sunlight while
    the ground below is dark, so this is the context every satellite result needs
    """

    sun_altitude_deg: float = Field(
        ..., description="Sun's altitude in degrees; negative means below the horizon."
    )
    condition: str = Field(
        ...,
        description=("day, civil_twilight, nautical_twilight, astronomical_twilight or night."),
    )
    is_dark: bool = Field(
        ...,
        description="True below -6 degrees, the point at which satellites start to show.",
    )


class SceneResponse(BaseModel):
    """everything above the selected point at one instant"""

    observation: ObservationContext = Field(..., description="Resolved request parameters.")
    aircraft: list[AircraftResponse] = Field(
        default_factory=list, description="Aircraft inside the area."
    )
    satellites: list[SatelliteResponse] = Field(
        default_factory=list, description="Satellites above the horizon."
    )
    sky: SkyConditionsResponse | None = Field(
        default=None,
        description="Lighting at the observer. Null when the Sun's position is unavailable.",
    )
    sources: list[SourceStatusResponse] = Field(
        default_factory=list, description="Per-source outcome for this scene."
    )
    warnings: list[str] = Field(
        default_factory=list, description="Human readable notes about a partial scene."
    )
    partial: bool = Field(
        default=False, description="True when at least one requested source failed."
    )
    generated_at: datetime = Field(..., description="UTC time this response was assembled.")


__all__ = ["SceneResponse", "SkyConditionsResponse", "SourceStatusResponse"]
