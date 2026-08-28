"""
a satellite is only visible to the naked eye when two things are true at once: the satellite is in sunlight, and the observer is in darkness
both need the Sun's position, so the JPL ephemeris earns its place by answering the one question that matters for the satellite layer
*can you actually see it right now?*

Skyfield is synchronous NumPy code, so every calculation is dispatched to a worker thread and the memory-mapped kernel is guarded by a lock
"""

from __future__ import annotations

import asyncio
from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, datetime
from enum import StrEnum
from typing import Any, TypeVar

from skyfield.api import Loader, wgs84
from skyfield.jpllib import SpiceKernel
from skyfield.timelib import Time, Timescale

from app.core.config import Settings
from app.core.exceptions import AstronomyCalculationError
from app.core.logging import get_logger
from app.models.observer import Observer

logger = get_logger(__name__)

ResultT = TypeVar("ResultT")


class SkyCondition(StrEnum):
    """how dark it is where the observer is standing"""

    # Sun above the horizon
    DAY = "day"
    # Sun 0 to -6 degrees. too bright for satellites.
    CIVIL_TWILIGHT = "civil_twilight"
    # Sun -6 to -12 degrees. the best satellite-watching window.
    NAUTICAL_TWILIGHT = "nautical_twilight"
    # Sun -12 to -18 degrees
    ASTRONOMICAL_TWILIGHT = "astronomical_twilight"
    # Sun below -18 degrees. fully dark.
    NIGHT = "night"


def classify(sun_altitude_deg: float) -> SkyCondition:
    if sun_altitude_deg > 0.0:
        return SkyCondition.DAY
    if sun_altitude_deg > -6.0:
        return SkyCondition.CIVIL_TWILIGHT
    if sun_altitude_deg > -12.0:
        return SkyCondition.NAUTICAL_TWILIGHT
    if sun_altitude_deg > -18.0:
        return SkyCondition.ASTRONOMICAL_TWILIGHT
    return SkyCondition.NIGHT


@dataclass(frozen=True, slots=True)
class SkyConditions:
    """lighting at the observer's location, at one instant"""

    sun_altitude_deg: float
    condition: SkyCondition

    @property
    def is_dark(self) -> bool:
        """
        dark enough for a sunlit satellite to stand out

        civil twilight is the practical cutoff: above it the sky is still bright enough to wash out everything but the Moon
        """
        return self.sun_altitude_deg <= -6.0


class EphemerisProvider:
    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._loader = Loader(str(settings.astronomy_data_dir), verbose=False)
        self._timescale: Timescale | None = None
        self._ephemeris: SpiceKernel | None = None
        self._load_error: str | None = None
        # serialises access to the memory mapped kernel across worker threads
        self._lock = asyncio.Lock()

    # lifecycle

    async def load(self) -> None:
        try:
            timescale, ephemeris = await asyncio.to_thread(self._load_blocking)
        except Exception as exc:
            self._load_error = str(exc)
            logger.error(
                "ephemeris unavailable; satellite visibility cannot be determined",
                extra={
                    "ephemeris": self._settings.skyfield_ephemeris,
                    "data_dir": str(self._settings.astronomy_data_dir),
                    "downloads_allowed": self._settings.skyfield_allow_downloads,
                    "reason": str(exc),
                },
            )
            try:
                self._timescale = await asyncio.to_thread(self._loader.timescale)
            except Exception:
                logger.exception("timescale unavailable; satellites cannot be propagated")
            return

        self._timescale = timescale
        self._ephemeris = ephemeris
        self._load_error = None
        logger.info(
            "ephemeris ready",
            extra={
                "ephemeris": self._settings.skyfield_ephemeris,
                "data_dir": str(self._settings.astronomy_data_dir),
            },
        )

    def _load_blocking(self) -> tuple[Timescale, SpiceKernel]:
        filename = self._settings.skyfield_ephemeris
        path = self._settings.astronomy_data_dir / filename
        if not path.exists() and not self._settings.skyfield_allow_downloads:
            raise FileNotFoundError(
                f"{filename} is not present in {self._settings.astronomy_data_dir} and SKYFIELD_ALLOW_DOWNLOADS is disabled."
            )
        if not path.exists():
            logger.info(
                "downloading planetary ephemeris; this happens once",
                extra={
                    "ephemeris": filename,
                    "data_dir": str(self._settings.astronomy_data_dir),
                },
            )
        timescale = self._loader.timescale()
        ephemeris = self._loader(filename)
        return timescale, ephemeris

    def close(self) -> None:
        """release the memory mapped kernel"""
        if self._ephemeris is not None:
            try:
                self._ephemeris.close()
            except Exception:
                logger.debug("ephemeris close failed", exc_info=True)
        self._ephemeris = None
        self._timescale = None

    # access

    @property
    def is_ready(self) -> bool:
        """true when satellites can be propagated (a timescale is all that needs)"""
        return self._timescale is not None

    @property
    def has_sun(self) -> bool:
        """true when visibility can be determined"""
        return self._ephemeris is not None

    @property
    def load_error(self) -> str | None:
        return self._load_error

    @property
    def timescale(self) -> Timescale:
        if self._timescale is None:
            raise AstronomyCalculationError(
                "The astronomical timescale is not loaded.",
                details={"reason": self._load_error or "not initialised"},
            )
        return self._timescale

    @property
    def ephemeris(self) -> SpiceKernel:
        if self._ephemeris is None:
            raise AstronomyCalculationError(
                "The planetary ephemeris is not loaded.",
                details={
                    "ephemeris": self._settings.skyfield_ephemeris,
                    "reason": self._load_error or "not initialised",
                },
            )
        return self._ephemeris

    def describe(self) -> dict[str, Any]:
        return {
            "ephemeris": self._settings.skyfield_ephemeris,
            "data_dir": str(self._settings.astronomy_data_dir),
            "ready": self.is_ready,
            "sun_available": self.has_sun,
            "error": self._load_error,
        }

    def to_time(self, moment: datetime) -> Time:
        if moment.tzinfo is None:
            moment = moment.replace(tzinfo=UTC)
        return self.timescale.from_datetime(moment.astimezone(UTC))

    # the one calculation

    def sky_conditions(self, observer: Observer, when: datetime) -> SkyConditions | None:
        if self._ephemeris is None:
            return None
        site = self._ephemeris["earth"] + wgs84.latlon(observer.latitude, observer.longitude)
        altitude, _, _ = (
            site.at(self.to_time(when)).observe(self._ephemeris["sun"]).apparent().altaz()
        )
        degrees = float(altitude.degrees)
        return SkyConditions(sun_altitude_deg=degrees, condition=classify(degrees))

    async def run(self, work: Callable[[], ResultT]) -> ResultT:
        async with self._lock:
            return await asyncio.to_thread(work)


__all__ = ["EphemerisProvider", "SkyCondition", "SkyConditions", "classify"]
