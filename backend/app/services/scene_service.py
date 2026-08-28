from __future__ import annotations

import asyncio
from collections.abc import Coroutine
from dataclasses import dataclass, field
from datetime import datetime
from typing import Final, cast

from app.core.clock import utc_now
from app.core.config import Settings
from app.core.exceptions import OverpassError
from app.core.logging import get_logger
from app.domain.sky_object import (
    AircraftState,
    SatelliteObject,
    SourceReport,
    SourceStatus,
)
from app.geometry.bounding_box import AreaGeometry, compute_area_geometry
from app.geometry.timezones import LocalTimezone, TimezoneResolver
from app.models.requests import SceneRequest
from app.services.aircraft_service import AircraftComputation, AircraftService
from app.services.ephemeris_service import SkyConditions
from app.services.satellite_service import SatelliteComputation, SatelliteService

logger = get_logger(__name__)

_AIRCRAFT: Final = "aircraft"
_SATELLITES: Final = "satellites"

LAYER_ORDER: Final[tuple[str, ...]] = (_SATELLITES, _AIRCRAFT)
ALL_LAYERS: Final[frozenset[str]] = frozenset(LAYER_ORDER)


@dataclass(frozen=True, slots=True)
class SceneResult:
    area: AreaGeometry
    observation_time: datetime
    generated_at: datetime
    aircraft: list[AircraftState] = field(default_factory=list)
    satellites: list[SatelliteObject] = field(default_factory=list)
    sources: list[SourceReport] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    # provider timestamp for the aircraft state vectors, if any were fetched
    aircraft_source_time: datetime | None = None
    # when the satellite orbital elements were last refreshed
    satellite_elements_updated_at: datetime | None = None
    satellite_groups: tuple[str, ...] = ()
    # lighting at the observer, which decides whether satellites are visible
    sky: SkyConditions | None = None
    # civil timezone at the centre, for showing the local clock there
    timezone: LocalTimezone | None = None

    @property
    def partial(self) -> bool:
        return any(report.status is SourceStatus.ERROR for report in self.sources)


def _disabled(source: str) -> SourceReport:
    return SourceReport(source=source, status=SourceStatus.DISABLED, message="Switched off.")


def _report_for_error(source: str, error: BaseException) -> SourceReport:
    if isinstance(error, OverpassError):
        return SourceReport(
            source=source,
            status=SourceStatus.ERROR,
            message=error.message,
            error_code=error.code,
            details=dict(error.details),
        )
    logger.exception("unexpected failure in scene source", extra={"source": source})
    return SourceReport(
        source=source,
        status=SourceStatus.ERROR,
        message=f"Couldn't compute {source} for this scene.",
        error_code="internal_error",
    )


class SceneService:
    def __init__(
        self,
        aircraft: AircraftService,
        satellites: SatelliteService,
        settings: Settings,
        timezones: TimezoneResolver | None = None,
    ) -> None:
        self._aircraft = aircraft
        self._satellites = satellites
        self._settings = settings
        self._timezones = timezones

    # public API

    def build_area(self, request: SceneRequest) -> AreaGeometry:
        return compute_area_geometry(
            request.center.latitude,
            request.center.longitude,
            request.radius_km,
            settings=self._settings,
        )

    async def build(
        self,
        request: SceneRequest,
        *,
        area: AreaGeometry | None = None,
        layers: set[str] | None = None,
    ) -> SceneResult:
        """compute the requested layers concurrently"""
        geometry = area or self.build_area(request)
        when = request.resolved_time()
        include = request.include

        refreshing = layers if layers is not None else set(ALL_LAYERS)
        want = {
            _AIRCRAFT: include.aircraft and _AIRCRAFT in refreshing,
            _SATELLITES: include.satellites and _SATELLITES in refreshing,
        }

        names: list[str] = []
        pending: list[Coroutine[object, object, object]] = []
        if want[_AIRCRAFT]:
            names.append(_AIRCRAFT)
            pending.append(self._aircraft.compute(geometry))
        if want[_SATELLITES]:
            names.append(_SATELLITES)
            pending.append(
                self._satellites.compute(request.center, when, request.min_satellite_elevation_deg)
            )

        # gather(return_exceptions=True), not a TaskGroup: one failing source must not cancel the others, because a partial scene is still useful
        results = await asyncio.gather(*pending, return_exceptions=True)
        outcomes = dict(zip(names, results, strict=True))

        reports: list[SourceReport] = []
        warnings: list[str] = []

        # aircraft
        aircraft: list[AircraftState] = []
        aircraft_source_time: datetime | None = None
        if want[_AIRCRAFT]:
            outcome = outcomes[_AIRCRAFT]
            if isinstance(outcome, BaseException):
                reports.append(_report_for_error(_AIRCRAFT, outcome))
            else:
                flights = cast(AircraftComputation, outcome)
                aircraft = list(flights.aircraft)
                aircraft_source_time = flights.source_time
                reports.append(
                    SourceReport(
                        source=_AIRCRAFT,
                        status=SourceStatus.OK,
                        object_count=len(aircraft),
                        details={
                            "provider_state_count": flights.provider_count,
                            "authenticated": flights.authenticated,
                            "from_cache": flights.from_cache,
                        },
                    )
                )
        elif layers is None and not include.aircraft:
            reports.append(_disabled(_AIRCRAFT))

        # satellites
        satellites: list[SatelliteObject] = []
        satellite_groups: tuple[str, ...] = ()
        elements_updated_at: datetime | None = None
        sky: SkyConditions | None = None
        if want[_SATELLITES]:
            outcome = outcomes[_SATELLITES]
            if isinstance(outcome, BaseException):
                reports.append(_report_for_error(_SATELLITES, outcome))
            else:
                orbits = cast(SatelliteComputation, outcome)
                satellites = list(orbits.satellites)
                satellite_groups = orbits.groups
                elements_updated_at = orbits.elements_updated_at
                sky = orbits.sky
                warnings.extend(orbits.warnings)
                reports.append(
                    SourceReport(
                        source=_SATELLITES,
                        status=(
                            SourceStatus.DEGRADED
                            if orbits.is_stale or orbits.warnings
                            else SourceStatus.OK
                        ),
                        object_count=len(satellites),
                        message=(
                            "Serving cached orbital elements older than the configured TTL."
                            if orbits.is_stale
                            else None
                        ),
                        details={
                            "tracked_satellites": orbits.tracked_count,
                            "groups": list(satellite_groups),
                        },
                    )
                )
        elif layers is None and not include.satellites:
            reports.append(_disabled(_SATELLITES))

        # sources are computed concurrently, so the order they finish in is not meaningful. sort them into the order they are presented in instead.
        reports.sort(key=lambda report: LAYER_ORDER.index(report.source))

        warnings.extend(
            report.message
            for report in reports
            if report.status is SourceStatus.ERROR and report.message
        )

        local_timezone = (
            self._timezones.resolve(request.center.latitude, request.center.longitude, when)
            if self._timezones is not None
            else None
        )

        result = SceneResult(
            area=geometry,
            observation_time=when,
            generated_at=utc_now(),
            aircraft=aircraft,
            satellites=satellites,
            sources=reports,
            warnings=warnings,
            aircraft_source_time=aircraft_source_time,
            satellite_elements_updated_at=elements_updated_at,
            satellite_groups=satellite_groups,
            sky=sky,
            timezone=local_timezone,
        )
        logger.info(
            "scene built",
            extra={
                "aircraft": len(aircraft),
                "satellites": len(satellites),
                "partial": result.partial,
                "radius_km": geometry.radius_km,
            },
        )
        return result


__all__ = ["ALL_LAYERS", "SceneResult", "SceneService"]
