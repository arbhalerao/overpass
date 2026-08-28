from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from enum import StrEnum


class ObjectType(StrEnum):
    AIRCRAFT = "aircraft"
    SATELLITE = "satellite"


class SourceStatus(StrEnum):
    """outcome of one data source within a scene build"""

    # data was produced normally
    OK = "ok"
    # the caller did not ask for this layer
    DISABLED = "disabled"
    # data was produced, but something is not quite right (e.g. stale cache)
    DEGRADED = "degraded"
    # the layer failed; the rest of the scene is still valid
    ERROR = "error"


@dataclass(frozen=True, slots=True)
class HorizontalPosition:
    """
    a direction on the observer's local sky

    ``azimuth_deg`` is measured clockwise from true north (0 = N, 90 = E, 180 = S, 270 = W)
    ``elevation_deg`` is measured up from the horizon (0 = horizon, 90 = zenith)
    """

    azimuth_deg: float
    elevation_deg: float
    distance_km: float | None = None

    @property
    def is_above_horizon(self) -> bool:
        return self.elevation_deg > 0.0


@dataclass(frozen=True, slots=True)
class SkyObject:
    """identity shared by every object that can appear in a scene"""

    id: str
    name: str
    object_type: ObjectType
    subtype: str | None = None


@dataclass(frozen=True, slots=True)
class SatelliteObject:
    """a satellite propagated from cached orbital elements"""

    identity: SkyObject
    position: HorizontalPosition
    # NORAD catalog number as a string; CelesTrak numbers are not all 5 digits
    norad_id: str
    international_designator: str | None = None
    # latitude/longitude of the point directly beneath the satellite
    subpoint_latitude: float | None = None
    subpoint_longitude: float | None = None
    # height of the satellite above the WGS-84 ellipsoid, kilometres
    height_km: float | None = None
    # geocentric speed, metres per second
    velocity_mps: float | None = None
    # rate of change of observer-to-satellite range, metres per second
    range_rate_mps: float | None = None
    # whether the satellite itself is in sunlight
    is_sunlit: bool | None = None
    # whether it is actually visible to the naked eye: sunlit, above the horizon,
    # and the observer in darkness. ``None`` when the Sun's position is unknown.
    is_visible: bool | None = None
    # age of the orbital elements at the observation time, days
    element_age_days: float | None = None
    # the CelesTrak group the elements came from
    group: str | None = None


@dataclass(frozen=True, slots=True)
class OperatorIdentity:
    """the airline behind a flight, resolved from its callsign"""

    icao: str
    iata: str | None
    name: str
    country: str
    radio_callsign: str | None


@dataclass(frozen=True, slots=True)
class AircraftState:
    """a normalised aircraft state vector, provider-agnostic"""

    identity: SkyObject
    latitude: float
    longitude: float
    # -1 west edge .. 0 centre .. +1 east edge of the selected area
    normalized_x: float
    # -1 south edge .. 0 centre .. +1 north edge of the selected area
    normalized_y: float
    on_ground: bool
    callsign: str | None = None
    # commercial flight number, IATA style ("BA7NY"), when the operator is known
    flight_number: str | None = None
    # the operating airline, when the callsign identifies one
    airline: OperatorIdentity | None = None
    origin_country: str | None = None
    barometric_altitude_m: float | None = None
    geometric_altitude_m: float | None = None
    velocity_mps: float | None = None
    # true track, degrees clockwise from true north
    heading_deg: float | None = None
    vertical_rate_mps: float | None = None
    squawk: str | None = None
    position_source: str | None = None
    # ground distance from the observer, kilometres
    distance_from_center_km: float | None = None
    # straight-line distance through the air, kilometres
    slant_range_km: float | None = None
    # where to look: direction and angle above the horizon, as for satellites
    position: HorizontalPosition | None = None
    # when the provider last had a position fix for this aircraft
    position_time: datetime | None = None
    # when the provider last heard anything at all from this aircraft
    last_contact: datetime | None = None


@dataclass(frozen=True, slots=True)
class SourceReport:
    source: str
    status: SourceStatus
    message: str | None = None
    error_code: str | None = None
    object_count: int = 0
    details: dict[str, object] = field(default_factory=dict)

    @property
    def is_ok(self) -> bool:
        return self.status is SourceStatus.OK


__all__ = [
    "AircraftState",
    "HorizontalPosition",
    "ObjectType",
    "OperatorIdentity",
    "SatelliteObject",
    "SkyObject",
    "SourceReport",
    "SourceStatus",
]
