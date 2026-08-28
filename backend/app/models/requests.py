from __future__ import annotations

from datetime import UTC, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.core.clock import utc_now
from app.models.observer import Observer


class LayerSelection(BaseModel):
    aircraft: bool = True
    satellites: bool = True

    @property
    def any_enabled(self) -> bool:
        return self.aircraft or self.satellites


class SceneRequest(BaseModel):
    model_config = ConfigDict(
        json_schema_extra={
            "examples": [
                {
                    "center": {"latitude": 18.5204, "longitude": 73.8567},
                    "radius_km": 50,
                    "include": {"aircraft": True, "satellites": True},
                }
            ]
        }
    )

    center: Observer = Field(..., description="Centre of the area and the observing location.")
    radius_km: float = Field(
        default=50.0,
        gt=0.0,
        le=10_000.0,
        description="Radius of the observation circle in kilometres, measured on the ground.",
    )
    include: LayerSelection = Field(
        default_factory=LayerSelection, description="Which layers to compute."
    )
    min_satellite_elevation_deg: float | None = Field(
        default=None,
        ge=0.0,
        le=90.0,
        description=("Only return satellites at least this many degrees above the horizon. "),
        examples=[10.0],
    )
    observation_time: datetime | None = Field(
        default=None,
        description="UTC ISO 8601 observation time. Defaults to the current time.",
        examples=["2026-08-26T12:00:00Z"],
    )

    @field_validator("observation_time")
    @classmethod
    def _require_utc(cls, value: datetime | None) -> datetime | None:
        if value is None:
            return None
        if value.tzinfo is None:
            return value.replace(tzinfo=UTC)
        return value.astimezone(UTC)

    def resolved_time(self) -> datetime:
        return self.observation_time or utc_now()


class SubscribeMessage(SceneRequest):
    action: Literal["subscribe"] = Field(default="subscribe", description="Always 'subscribe'.")
    time_mode: Literal["live", "fixed"] = Field(
        default="live",
        description=(
            "'live' recomputes each update for the current time. 'fixed' holds the sky at `observation_time`, which is then required."
        ),
    )

    @model_validator(mode="after")
    def _check_time_mode(self) -> SubscribeMessage:
        if self.time_mode == "fixed" and self.observation_time is None:
            raise ValueError("time_mode 'fixed' requires an observation_time.")
        return self

    def tick_request(self) -> SceneRequest:
        data = self.model_dump(exclude={"action", "time_mode"})
        if self.time_mode == "live":
            data["observation_time"] = None
        return SceneRequest.model_validate(data)


class ControlMessage(BaseModel):
    action: Literal["unsubscribe", "ping"] = Field(
        ..., description="'unsubscribe' stops updates; 'ping' asks for a 'pong'."
    )


__all__ = ["ControlMessage", "LayerSelection", "SceneRequest", "SubscribeMessage"]
