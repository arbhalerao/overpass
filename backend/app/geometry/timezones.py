from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from timezonefinder import TimezoneFinder

from app.core.logging import get_logger

logger = get_logger(__name__)


@dataclass(frozen=True, slots=True)
class LocalTimezone:
    zone: str
    utc_offset_minutes: int

    @property
    def offset_label(self) -> str:
        sign = "+" if self.utc_offset_minutes >= 0 else "-"
        total = abs(self.utc_offset_minutes)
        return f"UTC{sign}{total // 60:02d}:{total % 60:02d}"


class TimezoneResolver:
    def __init__(self) -> None:
        self._finder = TimezoneFinder()

    def resolve(self, latitude: float, longitude: float, at: datetime) -> LocalTimezone | None:
        try:
            zone_name = self._finder.timezone_at(lat=latitude, lng=longitude)
        except Exception:
            logger.debug(
                "timezone lookup failed",
                extra={"latitude": latitude, "longitude": longitude},
                exc_info=True,
            )
            return None
        if not zone_name:
            return None

        try:
            zone = ZoneInfo(zone_name)
        except (ZoneInfoNotFoundError, ValueError):
            logger.warning("unknown IANA zone from lookup", extra={"zone": zone_name})
            return None

        moment = at if at.tzinfo is not None else at.replace(tzinfo=UTC)
        offset = moment.astimezone(zone).utcoffset()
        minutes = int(offset.total_seconds() // 60) if offset is not None else 0
        return LocalTimezone(zone=zone_name, utc_offset_minutes=minutes)


__all__ = ["LocalTimezone", "TimezoneResolver"]
