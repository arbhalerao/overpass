"""
aircraft: fetch state vectors, filter to the area, project into it

the service owns the following responsibilities:

1. asking an :class:`AircraftProvider` for state vectors covering the area
2. discarding everything outside the area's true geodesic boundary
3. attaching area-relative coordinates so the frontend can place an icon
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Protocol, runtime_checkable

from app.clients.opensky_client import AircraftStateBatch
from app.core.cache import TTLCache
from app.core.config import Settings
from app.core.logging import get_logger
from app.data.airlines import identify_flight
from app.domain.sky_object import (
    AircraftState,
    HorizontalPosition,
    ObjectType,
    OperatorIdentity,
    SkyObject,
)
from app.geometry.bounding_box import AreaGeometry, QueryBox
from app.geometry.geodesy import (
    elevation_angle_deg,
    normalize_heading_deg,
    slant_range_m,
)
from app.geometry.projection import project_into_area

logger = get_logger(__name__)

_KEY_PRECISION = 3


@runtime_checkable
class AircraftProvider(Protocol):
    """what the service needs from an aircraft data source"""

    provider_name: str

    @property
    def is_configured(self) -> bool: ...

    def describe(self) -> dict[str, Any]: ...

    async def fetch_states(
        self, boxes: list[QueryBox] | tuple[QueryBox, ...]
    ) -> AircraftStateBatch: ...


@dataclass(frozen=True, slots=True)
class AircraftComputation:
    """aircraft inside the area, with the timing the frontend needs"""

    aircraft: list[AircraftState] = field(default_factory=list)
    # provider timestamp the state vectors describe
    source_time: datetime | None = None
    from_cache: bool = False
    provider_count: int = 0
    authenticated: bool = False


class AircraftService:
    """produces the aircraft layer of a scene"""

    def __init__(self, provider: AircraftProvider, settings: Settings) -> None:
        self._provider = provider
        self._settings = settings
        # very short TTL: aircraft data is meant to be live
        # the cache exists to collapse simultaneous requests for the same box (several browser tabs, or an HTTP call landing beside a WebSocket tick),
        # not to serve history
        self._cache: TTLCache[tuple[Any, ...], AircraftStateBatch] = TTLCache(
            settings.aircraft_cache_ttl_seconds, name="aircraft", max_entries=128
        )

    # public API

    @property
    def is_configured(self) -> bool:
        return self._provider.is_configured

    def describe(self) -> dict[str, Any]:
        described = dict(self._provider.describe())
        described["cache_ttl_seconds"] = self._settings.aircraft_cache_ttl_seconds
        return described

    async def compute(self, area: AreaGeometry) -> AircraftComputation:
        """return the aircraft currently inside ``area``"""
        boxes = area.query_boxes()
        key = self._cache_key(boxes)

        entry = await self._cache.get_or_set(key, lambda: self._provider.fetch_states(boxes))
        batch = entry.value

        aircraft = [
            state
            for state in (self._to_domain(raw, area) for raw in batch.states)
            if state is not None
        ]
        aircraft.sort(key=lambda state: state.identity.id)

        logger.debug(
            "aircraft layer computed",
            extra={
                "provider_count": len(batch.states),
                "inside_square": len(aircraft),
                "radius_km": area.radius_km,
                "from_cache": entry.from_cache,
            },
        )
        return AircraftComputation(
            aircraft=aircraft,
            source_time=batch.source_time,
            from_cache=entry.from_cache,
            provider_count=len(batch.states),
            authenticated=batch.authenticated,
        )

    # internals

    @staticmethod
    def _cache_key(boxes: tuple[QueryBox, ...]) -> tuple[Any, ...]:
        return tuple(
            (
                round(box.min_latitude, _KEY_PRECISION),
                round(box.max_latitude, _KEY_PRECISION),
                round(box.min_longitude, _KEY_PRECISION),
                round(box.max_longitude, _KEY_PRECISION),
            )
            for box in boxes
        )

    @staticmethod
    def _to_domain(raw: Any, area: AreaGeometry) -> AircraftState | None:
        """normalise one state vector, or drop it if it is outside the area"""
        if not area.contains(raw.latitude, raw.longitude):
            return None

        projected = project_into_area(raw.latitude, raw.longitude, area)
        heading = (
            normalize_heading_deg(raw.true_track_deg) if raw.true_track_deg is not None else None
        )

        # ADS-B carries no operator field; the callsign is the only identity on the wire, and it encodes both the airline and the flight number
        flight = identify_flight(raw.callsign)
        airline = (
            OperatorIdentity(
                icao=flight.airline.icao,
                iata=flight.airline.iata,
                name=flight.airline.name,
                country=flight.airline.country,
                radio_callsign=flight.airline.callsign,
            )
            if flight
            else None
        )

        # where to point your eyes
        # height above the ground is what turns a map position into a sky position, so prefer the geometric (GNSS) altitude and fall back to the barometric one
        height_m = raw.geometric_altitude_m or raw.barometric_altitude_m or 0.0
        ground_m = projected.distance_from_center_m
        elevation = elevation_angle_deg(ground_m, height_m)
        slant_km = slant_range_m(ground_m, height_m) / 1000.0

        return AircraftState(
            identity=SkyObject(
                id=f"aircraft:{raw.icao24}",
                # prefer the commercial flight number: it is what is on the departure board, where the raw callsign is an ATC string
                name=(flight.display_name if flight else raw.callsign) or raw.icao24.upper(),
                object_type=ObjectType.AIRCRAFT,
            ),
            latitude=raw.latitude,
            longitude=raw.longitude,
            normalized_x=projected.normalized_x,
            normalized_y=projected.normalized_y,
            on_ground=raw.on_ground,
            callsign=raw.callsign,
            flight_number=flight.flight_number if flight else None,
            airline=airline,
            origin_country=raw.origin_country,
            barometric_altitude_m=raw.barometric_altitude_m,
            geometric_altitude_m=raw.geometric_altitude_m,
            velocity_mps=raw.velocity_mps,
            heading_deg=heading,
            vertical_rate_mps=raw.vertical_rate_mps,
            squawk=raw.squawk,
            position_source=raw.position_source,
            distance_from_center_km=ground_m / 1000.0,
            slant_range_km=slant_km,
            position=HorizontalPosition(
                azimuth_deg=projected.bearing_from_center_deg,
                elevation_deg=elevation,
                distance_km=slant_km,
            ),
            position_time=raw.position_time,
            last_contact=raw.last_contact,
        )


__all__ = ["AircraftComputation", "AircraftProvider", "AircraftService"]
