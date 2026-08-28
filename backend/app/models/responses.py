from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field

from app.models.aircraft import AircraftResponse
from app.models.observer import ObservationContext
from app.models.satellite import SatelliteResponse
from app.models.scene import SkyConditionsResponse


class HealthResponse(BaseModel):
    status: str = Field(..., description="'ok' when every critical subsystem is ready.")
    app_name: str
    environment: str
    version: str
    time: datetime = Field(..., description="Current server time, UTC.")
    uptime_seconds: float = Field(..., description="Seconds since application startup.")
    services: dict[str, str] = Field(
        default_factory=dict,
        description="Per-subsystem readiness: ready, degraded or unavailable.",
    )
    details: dict[str, object] = Field(
        default_factory=dict, description="Non-sensitive diagnostic detail."
    )


class AircraftListResponse(BaseModel):
    observation: ObservationContext
    aircraft: list[AircraftResponse] = Field(default_factory=list)
    count: int = Field(..., description="Number of aircraft returned.")
    source_time: datetime | None = Field(
        default=None,
        description="Provider timestamp the state vectors refer to; use this to interpolate.",
    )
    generated_at: datetime = Field(..., description="UTC time this response was assembled.")


class SatelliteListResponse(BaseModel):
    observation: ObservationContext
    satellites: list[SatelliteResponse] = Field(default_factory=list)
    count: int = Field(..., description="Number of satellites returned.")
    sky: SkyConditionsResponse | None = Field(default=None, description="Lighting at the observer.")
    min_elevation_deg: float = Field(
        default=0.0, description="Horizon cutoff applied to this result, degrees."
    )
    groups: list[str] = Field(
        default_factory=list, description="CelesTrak groups the elements came from."
    )
    elements_updated_at: datetime | None = Field(
        default=None,
        description="When the cached orbital elements were last refreshed.",
    )
    generated_at: datetime


class ErrorDetail(BaseModel):
    code: str = Field(..., description="Stable machine readable error code.")
    message: str = Field(..., description="Human readable explanation, safe to display.")
    details: dict[str, object] = Field(default_factory=dict)


class ErrorResponse(BaseModel):
    error: ErrorDetail


__all__ = [
    "AircraftListResponse",
    "ErrorDetail",
    "ErrorResponse",
    "HealthResponse",
    "SatelliteListResponse",
]
