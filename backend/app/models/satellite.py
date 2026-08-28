from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field

from app.domain.sky_object import ObjectType, SatelliteObject


class SatelliteResponse(BaseModel):
    id: str = Field(..., description="Stable identifier, e.g. 'satellite:25544'.")
    norad_id: str = Field(
        ...,
        description="NORAD catalog number as a string; not necessarily five digits.",
    )
    name: str = Field(..., description="Satellite name from CelesTrak, e.g. 'ISS (ZARYA)'.")
    object_type: ObjectType = Field(default=ObjectType.SATELLITE)
    subtype: str | None = Field(default=None, description="Slugged name, e.g. 'iss_zarya'.")
    international_designator: str | None = Field(
        default=None, description="COSPAR ID, e.g. '1998-067A'."
    )
    azimuth_deg: float = Field(..., description="Azimuth in degrees clockwise from true north.")
    elevation_deg: float = Field(..., description="Altitude in degrees above the horizon.")
    distance_km: float = Field(..., description="Slant range from observer to satellite, km.")
    subpoint_latitude: float | None = Field(
        default=None, description="Latitude directly beneath the satellite."
    )
    subpoint_longitude: float | None = Field(
        default=None, description="Longitude directly beneath the satellite."
    )
    height_km: float | None = Field(
        default=None, description="Height above the WGS-84 ellipsoid, km."
    )
    velocity_mps: float | None = Field(
        default=None, description="Geocentric speed in metres per second."
    )
    range_rate_mps: float | None = Field(
        default=None,
        description="Rate of change of slant range; negative means approaching.",
    )
    is_sunlit: bool | None = Field(
        default=None,
        description="Whether the satellite itself is currently in sunlight.",
    )
    is_visible: bool | None = Field(
        default=None,
        description=(
            "Whether it is visible to the naked eye right now: above the horizon, sunlit, and the observer in darkness."
            "Null when the Sun's position is "
            "unavailable."
        ),
    )
    element_age_days: float | None = Field(
        default=None,
        description="Age of the orbital elements at the observation time, in days.",
    )
    group: str | None = Field(default=None, description="CelesTrak group the elements came from.")
    above_horizon: bool = Field(default=True, description="Always true for returned satellites.")
    timestamp: datetime = Field(..., description="Observation time the position was computed for.")

    @classmethod
    def from_domain(cls, obj: SatelliteObject, timestamp: datetime) -> SatelliteResponse:
        return cls(
            id=obj.identity.id,
            norad_id=obj.norad_id,
            name=obj.identity.name,
            object_type=obj.identity.object_type,
            subtype=obj.identity.subtype,
            international_designator=obj.international_designator,
            azimuth_deg=obj.position.azimuth_deg,
            elevation_deg=obj.position.elevation_deg,
            distance_km=(obj.position.distance_km if obj.position.distance_km is not None else 0.0),
            subpoint_latitude=obj.subpoint_latitude,
            subpoint_longitude=obj.subpoint_longitude,
            height_km=obj.height_km,
            velocity_mps=obj.velocity_mps,
            range_rate_mps=obj.range_rate_mps,
            is_sunlit=obj.is_sunlit,
            is_visible=obj.is_visible,
            element_age_days=obj.element_age_days,
            group=obj.group,
            above_horizon=obj.position.elevation_deg > 0.0,
            timestamp=timestamp,
        )


__all__ = ["SatelliteResponse"]
