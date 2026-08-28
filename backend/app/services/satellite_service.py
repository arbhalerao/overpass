"""
satellites: propagate cached CelesTrak elements to the observation time

the service keeps a small in-memory registry of Skyfield ``EarthSatellite`` objects, rebuilt only when the underlying CelesTrak element set changes
a scene update therefore costs an SGP4 propagation per satellite and nothing else -- no network, no re-parsing

adding coverage means adding a CelesTrak group name to ``CELESTRAK_GROUPS``; no code changes are required
"""

from __future__ import annotations

import asyncio
import math
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any

from skyfield.api import EarthSatellite, wgs84

from app.clients.celestrak_client import CelestrakClient, OrbitalElementSet
from app.core.clock import utc_now
from app.core.config import Settings
from app.core.exceptions import SatelliteDataError
from app.core.logging import get_logger
from app.core.text import slugify
from app.domain.sky_object import (
    HorizontalPosition,
    ObjectType,
    SatelliteObject,
    SkyObject,
)
from app.models.observer import Observer
from app.services.ephemeris_service import EphemerisProvider, SkyConditions

logger = get_logger(__name__)


@dataclass(frozen=True, slots=True)
class TrackedSatellite:
    satellite: EarthSatellite
    norad_id: str
    name: str
    slug: str
    international_designator: str | None
    group: str


@dataclass(frozen=True, slots=True)
class SatelliteComputation:
    satellites: list[SatelliteObject] = field(default_factory=list)
    # lighting at the observer, or None when the ephemeris is unavailable
    sky: SkyConditions | None = None
    # the horizon cutoff actually applied, degrees
    min_elevation_deg: float = 0.0
    groups: tuple[str, ...] = ()
    elements_updated_at: datetime | None = None
    # non-fatal problems: an unavailable group, stale elements, and so on
    warnings: tuple[str, ...] = ()
    is_stale: bool = False
    tracked_count: int = 0


class SatelliteService:
    def __init__(
        self,
        client: CelestrakClient,
        ephemeris: EphemerisProvider,
        settings: Settings,
    ) -> None:
        self._client = client
        self._ephemeris = ephemeris
        self._settings = settings
        self._registry: dict[str, tuple[datetime, tuple[TrackedSatellite, ...]]] = {}
        self._build_lock = asyncio.Lock()

    # public API

    @property
    def groups(self) -> tuple[str, ...]:
        return self._client.groups

    def describe(self) -> dict[str, Any]:
        return {
            "groups": list(self.groups),
            "tracked_satellites": sum(len(entry[1]) for entry in self._registry.values()),
            "minimum_elevation_deg": self._settings.min_satellite_elevation_deg,
        }

    async def prime(self) -> None:
        await self._client.prime()
        try:
            tracked, _ = await self._refresh_registry()
            logger.info(
                "satellite registry ready",
                extra={"tracked_satellites": len(tracked), "groups": list(self.groups)},
            )
        except SatelliteDataError as exc:
            logger.warning("satellite registry unavailable", extra={"reason": exc.message})

    async def compute(
        self,
        observer: Observer,
        when: datetime,
        min_elevation_deg: float | None = None,
    ) -> SatelliteComputation:
        tracked, warnings = await self._refresh_registry()
        if not tracked:
            raise SatelliteDataError(
                "No satellite orbital elements are available.",
                details={"groups": list(self.groups)},
            )

        elements_updated_at = min(
            (stored_at for stored_at, _ in self._registry.values()), default=None
        )
        is_stale = bool(
            elements_updated_at
            and (utc_now() - elements_updated_at).total_seconds()
            > self._settings.satellite_cache_ttl_seconds
        )

        threshold = (
            self._settings.min_satellite_elevation_deg
            if min_elevation_deg is None
            else min_elevation_deg
        )

        def _work() -> tuple[list[SatelliteObject], SkyConditions | None]:
            # one thread hop for both: the Sun's position is needed to decide whether any of these satellites can actually be seen
            sky = self._ephemeris.sky_conditions(observer, when)
            return self._propagate(tracked, observer, when, sky, threshold), sky

        try:
            satellites, sky = await self._ephemeris.run(_work)
        except Exception as exc:
            logger.exception(
                "satellite propagation failed",
                extra={
                    "tracked_satellites": len(tracked),
                    "observation_time": when.isoformat(),
                },
            )
            raise SatelliteDataError(
                "Could not propagate satellite orbits for this observer and time."
            ) from exc

        return SatelliteComputation(
            satellites=satellites,
            sky=sky,
            groups=self.groups,
            elements_updated_at=elements_updated_at,
            min_elevation_deg=threshold,
            warnings=warnings,
            is_stale=is_stale,
            tracked_count=len(tracked),
        )

    # registry

    async def _refresh_registry(
        self,
    ) -> tuple[tuple[TrackedSatellite, ...], tuple[str, ...]]:
        """
        fetch elements (cached) and rebuild ``EarthSatellite`` objects if new

        rebuilding is keyed on the element set's ``fetched_at``, so a cache hit costs nothing beyond a dictionary lookup
        """
        element_sets, failures = await self._client.get_groups()

        warnings = tuple(
            f"Satellite group '{group}' is unavailable: {error}" for group, error in failures
        )
        if not element_sets:
            if failures:
                raise SatelliteDataError(
                    "No satellite orbital data could be loaded.",
                    details={"groups": [group for group, _ in failures]},
                )
            return (), warnings

        async with self._build_lock:
            for elements in element_sets:
                cached = self._registry.get(elements.group)
                if cached is not None and cached[0] == elements.fetched_at:
                    continue
                built = await asyncio.to_thread(self._build_group, elements)
                self._registry[elements.group] = (elements.fetched_at, built)

            active = {elements.group for elements in element_sets}
            for stale_group in set(self._registry) - active:
                self._registry.pop(stale_group, None)

            tracked = tuple(
                satellite for _, group in self._registry.values() for satellite in group
            )

        stale_sets = [elements.group for elements in element_sets if elements.is_stale]
        if stale_sets:
            warnings += (
                "Satellite orbital elements are older than the configured cache TTL for "
                f"group(s): {', '.join(stale_sets)}. Positions may have drifted.",
            )
        return tracked, warnings

    def _build_group(self, elements: OrbitalElementSet) -> tuple[TrackedSatellite, ...]:
        timescale = self._ephemeris.timescale
        built: list[TrackedSatellite] = []
        skipped = 0

        for record in elements.records:
            try:
                satellite = EarthSatellite.from_omm(timescale, record)
            except Exception:  # one bad record must not kill the group
                skipped += 1
                continue

            name = str(record.get("OBJECT_NAME") or "Unknown satellite").strip()
            norad_raw = record.get("NORAD_CAT_ID")
            norad_id = str(norad_raw).strip() if norad_raw is not None else ""
            if not norad_id:
                skipped += 1
                continue

            designator = record.get("OBJECT_ID")
            built.append(
                TrackedSatellite(
                    satellite=satellite,
                    norad_id=norad_id,
                    name=name,
                    slug=slugify(name),
                    international_designator=(
                        str(designator).strip() if isinstance(designator, str) else None
                    ),
                    group=elements.group,
                )
            )

        if skipped:
            logger.warning(
                "skipped unusable orbital element sets",
                extra={"group": elements.group, "skipped": skipped, "kept": len(built)},
            )
        logger.debug(
            "satellite group built",
            extra={"group": elements.group, "satellite_count": len(built)},
        )
        return tuple(built)

    # propagation

    def _propagate(
        self,
        tracked: tuple[TrackedSatellite, ...],
        observer: Observer,
        when: datetime,
        sky: SkyConditions | None,
        threshold: float,
    ) -> list[SatelliteObject]:
        timescale = self._ephemeris.timescale
        moment = when if when.tzinfo is not None else when.replace(tzinfo=UTC)
        time = timescale.from_datetime(moment.astimezone(UTC))

        site = wgs84.latlon(observer.latitude, observer.longitude)
        sun = self._ephemeris.ephemeris if self._ephemeris.has_sun else None

        visible: list[SatelliteObject] = []
        seen: set[str] = set()

        for entry in tracked:
            if entry.norad_id in seen:
                continue
            try:
                relative = (entry.satellite - site).at(time)
                altitude, azimuth, distance = relative.altaz()
                elevation_deg = float(altitude.degrees)
                if elevation_deg <= threshold:
                    continue

                geocentric = entry.satellite.at(time)
                subpoint = wgs84.geographic_position_of(geocentric)

                # range rate from the line-of-sight component of relative velocity; negative means the satellite is approaching
                position_m = relative.position.m
                velocity_mps = relative.velocity.m_per_s
                range_m = math.sqrt(sum(component * component for component in position_m))
                range_rate = (
                    float(sum(p * v for p, v in zip(position_m, velocity_mps, strict=True)))
                    / range_m
                    if range_m > 0.0
                    else None
                )

                speed_vector = geocentric.velocity.m_per_s
                speed = math.sqrt(sum(component * component for component in speed_vector))

                is_sunlit: bool | None = None
                if sun is not None:
                    try:
                        is_sunlit = bool(geocentric.is_sunlit(sun))
                    except Exception:  # optional enrichment only
                        is_sunlit = None

                # naked-eye visible means all three at once: above the horizon, catching sunlight, and dark enough on the ground to notice
                is_visible = (
                    None if (is_sunlit is None or sky is None) else (is_sunlit and sky.is_dark)
                )

                element_age = float(time.tt - entry.satellite.epoch.tt)
            except Exception:
                logger.debug(
                    "satellite propagation skipped",
                    extra={"norad_id": entry.norad_id, "group": entry.group},
                    exc_info=True,
                )
                continue

            seen.add(entry.norad_id)
            visible.append(
                SatelliteObject(
                    identity=SkyObject(
                        id=f"satellite:{entry.norad_id}",
                        name=entry.name,
                        object_type=ObjectType.SATELLITE,
                        subtype=entry.slug,
                    ),
                    position=HorizontalPosition(
                        azimuth_deg=float(azimuth.degrees) % 360.0,
                        elevation_deg=elevation_deg,
                        distance_km=float(distance.km),
                    ),
                    norad_id=entry.norad_id,
                    international_designator=entry.international_designator,
                    subpoint_latitude=float(subpoint.latitude.degrees),
                    subpoint_longitude=float(subpoint.longitude.degrees),
                    height_km=float(subpoint.elevation.km),
                    velocity_mps=speed,
                    range_rate_mps=range_rate,
                    is_sunlit=is_sunlit,
                    is_visible=is_visible,
                    element_age_days=element_age,
                    group=entry.group,
                )
            )

        visible.sort(key=lambda obj: (obj.is_visible is not True, -obj.position.elevation_deg))
        return visible


__all__ = ["SatelliteComputation", "SatelliteService", "TrackedSatellite"]
