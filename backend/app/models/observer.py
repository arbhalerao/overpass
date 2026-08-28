from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field

from app.geometry.bounding_box import AreaGeometry


class Observer(BaseModel):
    model_config = ConfigDict(
        json_schema_extra={"examples": [{"latitude": 18.5204, "longitude": 73.8567}]}
    )

    latitude: float = Field(
        ...,
        ge=-90.0,
        le=90.0,
        description="Geodetic latitude in degrees. Positive north.",
    )
    longitude: float = Field(
        ...,
        ge=-180.0,
        le=180.0,
        description="Geodetic longitude in degrees. Positive east.",
    )


class BoundingBox(BaseModel):
    min_latitude: float = Field(..., description="Southern edge, degrees.")
    max_latitude: float = Field(..., description="Northern edge, degrees.")
    min_longitude: float = Field(..., description="Western edge, degrees.")
    max_longitude: float = Field(..., description="Eastern edge, degrees.")
    crosses_antimeridian: bool = Field(
        default=False,
        description="True when the box wraps across the +/-180 degree meridian.",
    )
    spans_all_longitudes: bool = Field(
        default=False,
        description="True for polar squares that cover every meridian.",
    )

    @classmethod
    def from_geometry(cls, geometry: AreaGeometry) -> BoundingBox:
        return cls(
            min_latitude=geometry.min_latitude,
            max_latitude=geometry.max_latitude,
            min_longitude=geometry.min_longitude,
            max_longitude=geometry.max_longitude,
            crosses_antimeridian=geometry.crosses_antimeridian,
            spans_all_longitudes=geometry.spans_all_longitudes,
        )


class CircleArea(BaseModel):
    center: Observer
    radius_km: float = Field(
        ...,
        gt=0.0,
        le=10_000.0,
        description="Radius of the observation circle in kilometres.",
    )


class ObservationContext(BaseModel):
    center: Observer
    radius_km: float = Field(..., description="Radius of the observation circle, kilometres.")
    bounding_box: BoundingBox
    time: str = Field(
        ...,
        description="Observation time, UTC ISO 8601.",
        examples=["2026-08-26T12:00:00+00:00"],
    )
    timezone: str | None = Field(
        default=None,
        description=(
            "IANA timezone in force at the centre, e.g. 'Asia/Kolkata'. Null out at sea, where no civil timezone applies. "
            "Format `time` with this to show the local clock where the observer is standing."
        ),
        examples=["Asia/Kolkata"],
    )
    utc_offset_minutes: int | None = Field(
        default=None,
        description=(
            "Offset of `timezone` from UTC at the observation time, in minutes (330 for +05:30)."
            "Evaluated at that instant, so daylight saving is already accounted for."
        ),
        examples=[330],
    )


__all__ = ["BoundingBox", "CircleArea", "ObservationContext", "Observer"]
