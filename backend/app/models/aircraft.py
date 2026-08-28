from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field

from app.domain.sky_object import AircraftState, ObjectType


class AirlineInfo(BaseModel):
    icao: str = Field(..., description="Three-letter ICAO operator designator, e.g. 'BAW'.")
    iata: str | None = Field(default=None, description="Two-character IATA code, e.g. 'BA'.")
    name: str = Field(..., description="Airline name, e.g. 'British Airways'.")
    country: str = Field(..., description="Country of registration.")
    radio_callsign: str | None = Field(
        default=None, description="Spoken radio callsign, e.g. 'Speedbird'."
    )


class AircraftResponse(BaseModel):
    id: str = Field(..., description="Stable identifier, 'aircraft:<icao24>'.")
    icao24: str = Field(..., description="24-bit ICAO transponder address, lowercase hex.")
    name: str = Field(..., description="Callsign when known, otherwise the ICAO24 address.")
    object_type: ObjectType = Field(default=ObjectType.AIRCRAFT)
    subtype: str | None = Field(default=None, description="Reserved for aircraft category.")
    callsign: str | None = Field(
        default=None,
        description="Raw ADS-B callsign as transmitted, e.g. 'BAW7NY'. May be absent.",
    )
    flight_number: str | None = Field(
        default=None,
        description=(
            "Commercial flight number in IATA form, e.g. 'BA7NY', derived from the callsign."
            "Absent for private traffic and unrecognised operators."
            "Usually but not always identical to the marketed flight number."
        ),
    )
    airline: AirlineInfo | None = Field(
        default=None, description="Operating airline, derived from the callsign prefix."
    )
    origin_country: str | None = Field(
        default=None, description="Country inferred from the ICAO24 address range."
    )

    latitude: float = Field(..., description="WGS-84 latitude in degrees.")
    longitude: float = Field(..., description="WGS-84 longitude in degrees.")
    normalized_x: float = Field(
        ...,
        description="Position across the area: -1 = west edge, 0 = centre, +1 = east edge.",
    )
    normalized_y: float = Field(
        ...,
        description=(
            "Position along the area: -1 = south edge, 0 = centre, +1 = north edge."
            "North is increasing y; invert in the frontend for screen space."
        ),
    )

    barometric_altitude_m: float | None = Field(
        default=None, description="Barometric altitude in metres."
    )
    geometric_altitude_m: float | None = Field(
        default=None, description="GNSS/geometric altitude in metres."
    )
    velocity_mps: float | None = Field(
        default=None, description="Ground speed in metres per second."
    )
    heading_deg: float | None = Field(
        default=None, description="True track in degrees clockwise from true north."
    )
    vertical_rate_mps: float | None = Field(
        default=None,
        description="Vertical rate in metres per second; positive is climbing.",
    )
    on_ground: bool = Field(..., description="True when the aircraft reports a surface position.")
    squawk: str | None = Field(default=None, description="Transponder squawk code.")
    position_source: str | None = Field(
        default=None,
        description="How the position was derived: adsb, asterix, mlat or flarm.",
    )

    azimuth_deg: float | None = Field(
        default=None,
        description=(
            "Where to turn to face it: degrees clockwise from true north (0 = N, 90 = E, 180 = S, 270 = W)."
            "Same convention as satellites."
        ),
    )
    elevation_deg: float | None = Field(
        default=None,
        description=(
            "How far up to look: degrees above the horizon (0 = horizon, 90 = straight overhead)."
            "Accounts for the Earth's curvature, so a distant aircraft is not reported several degrees too high."
        ),
    )
    distance_from_center_km: float | None = Field(
        default=None, description="Ground distance from the observer, km."
    )
    slant_range_km: float | None = Field(
        default=None, description="Straight-line distance through the air, km."
    )

    position_time: datetime | None = Field(
        default=None, description="UTC time of the provider's last position fix."
    )
    last_contact: datetime | None = Field(
        default=None, description="UTC time the provider last heard from the aircraft."
    )

    @classmethod
    def from_domain(cls, state: AircraftState) -> AircraftResponse:
        return cls(
            id=state.identity.id,
            icao24=state.identity.id.split(":", 1)[-1],
            name=state.identity.name,
            object_type=state.identity.object_type,
            subtype=state.identity.subtype,
            callsign=state.callsign,
            flight_number=state.flight_number,
            airline=(
                AirlineInfo(
                    icao=state.airline.icao,
                    iata=state.airline.iata,
                    name=state.airline.name,
                    country=state.airline.country,
                    radio_callsign=state.airline.radio_callsign,
                )
                if state.airline
                else None
            ),
            origin_country=state.origin_country,
            latitude=state.latitude,
            longitude=state.longitude,
            normalized_x=state.normalized_x,
            normalized_y=state.normalized_y,
            barometric_altitude_m=state.barometric_altitude_m,
            geometric_altitude_m=state.geometric_altitude_m,
            velocity_mps=state.velocity_mps,
            heading_deg=state.heading_deg,
            vertical_rate_mps=state.vertical_rate_mps,
            on_ground=state.on_ground,
            squawk=state.squawk,
            position_source=state.position_source,
            azimuth_deg=state.position.azimuth_deg if state.position else None,
            elevation_deg=state.position.elevation_deg if state.position else None,
            distance_from_center_km=state.distance_from_center_km,
            slant_range_km=state.slant_range_km,
            position_time=state.position_time,
            last_contact=state.last_contact,
        )


__all__ = ["AircraftResponse", "AirlineInfo"]
