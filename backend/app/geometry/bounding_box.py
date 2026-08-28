from __future__ import annotations

import math
from dataclasses import dataclass

from app.core.config import Settings
from app.core.exceptions import InvalidGeographicAreaError
from app.geometry.geodesy import (
    clamp_latitude,
    haversine_distance_m,
    latitude_offset_deg,
    longitude_difference_deg,
    longitude_offset_deg,
    wrap_longitude,
)

_FULL_LONGITUDE_HALF_SPAN_DEG = 180.0


@dataclass(frozen=True, slots=True)
class QueryBox:
    min_latitude: float
    max_latitude: float
    min_longitude: float
    max_longitude: float


@dataclass(frozen=True, slots=True)
class AreaGeometry:
    center_latitude: float
    center_longitude: float
    radius_km: float
    half_latitude_span_deg: float
    half_longitude_span_deg: float
    min_latitude: float
    max_latitude: float
    min_longitude: float
    max_longitude: float
    crosses_antimeridian: bool
    spans_all_longitudes: bool

    # containment

    def contains(self, latitude: float, longitude: float) -> bool:
        """is this point inside the circle?"""
        distance_km = (
            haversine_distance_m(self.center_latitude, self.center_longitude, latitude, longitude)
            / 1000.0
        )
        return distance_km <= self.radius_km

    # normalised area coordinates

    def normalize(self, latitude: float, longitude: float) -> tuple[float, float]:
        """
        map a position to ``(normalized_x, normalized_y)`` on the unit circle

        ``normalized_x`` runs -1 (west edge) -> 0 (centre) -> +1 (east edge)
        ``normalized_y`` runs -1 (south edge) -> 0 (centre) -> +1 (north edge),

        both axes are scaled by the radius, so anything inside the area satisfies ``x² + y² <= 1``
        """
        if self.half_latitude_span_deg <= 0.0 or self.half_longitude_span_deg <= 0.0:
            return 0.0, 0.0
        delta_lon = longitude_difference_deg(longitude, self.center_longitude)
        normalized_x = delta_lon / self.half_longitude_span_deg
        normalized_y = (latitude - self.center_latitude) / self.half_latitude_span_deg
        return normalized_x, normalized_y

    # provider queries

    def query_boxes(self) -> tuple[QueryBox, ...]:
        if self.spans_all_longitudes:
            return (QueryBox(self.min_latitude, self.max_latitude, -180.0, 180.0),)
        if not self.crosses_antimeridian:
            return (
                QueryBox(
                    self.min_latitude,
                    self.max_latitude,
                    self.min_longitude,
                    self.max_longitude,
                ),
            )
        return (
            QueryBox(self.min_latitude, self.max_latitude, self.min_longitude, 180.0),
            QueryBox(self.min_latitude, self.max_latitude, -180.0, self.max_longitude),
        )

    @property
    def area_km2(self) -> float:
        return math.pi * self.radius_km * self.radius_km


def compute_area_geometry(
    center_latitude: float,
    center_longitude: float,
    radius_km: float,
    *,
    settings: Settings | None = None,
) -> AreaGeometry:
    if not -90.0 <= center_latitude <= 90.0:
        raise InvalidGeographicAreaError(
            "Center latitude must be between -90 and 90 degrees.",
            details={"latitude": center_latitude},
        )
    if not -180.0 <= center_longitude <= 180.0:
        raise InvalidGeographicAreaError(
            "Center longitude must be between -180 and 180 degrees.",
            details={"longitude": center_longitude},
        )
    if radius_km <= 0.0:
        raise InvalidGeographicAreaError(
            "Radius must be greater than zero.", details={"radius_km": radius_km}
        )
    if settings is not None and not (settings.radius_min_km <= radius_km <= settings.radius_max_km):
        raise InvalidGeographicAreaError(
            f"Radius must be between {settings.radius_min_km} and {settings.radius_max_km} km.",
            details={
                "radius_km": radius_km,
                "minimum_km": settings.radius_min_km,
                "maximum_km": settings.radius_max_km,
            },
        )

    radius_m = radius_km * 1000.0
    half_lat_span = latitude_offset_deg(center_latitude, radius_m)
    half_lon_span = longitude_offset_deg(center_latitude, radius_m)

    max_latitude = clamp_latitude(center_latitude + half_lat_span)
    min_latitude = clamp_latitude(center_latitude - half_lat_span)

    spans_all_longitudes = half_lon_span >= _FULL_LONGITUDE_HALF_SPAN_DEG
    if spans_all_longitudes:
        half_lon_span = _FULL_LONGITUDE_HALF_SPAN_DEG
        min_longitude, max_longitude = -180.0, 180.0
        crosses_antimeridian = False
    else:
        max_longitude = wrap_longitude(center_longitude + half_lon_span)
        min_longitude = wrap_longitude(center_longitude - half_lon_span)
        crosses_antimeridian = min_longitude > max_longitude

    return AreaGeometry(
        center_latitude=center_latitude,
        center_longitude=center_longitude,
        radius_km=radius_km,
        half_latitude_span_deg=half_lat_span,
        half_longitude_span_deg=half_lon_span,
        min_latitude=min_latitude,
        max_latitude=max_latitude,
        min_longitude=min_longitude,
        max_longitude=max_longitude,
        crosses_antimeridian=crosses_antimeridian,
        spans_all_longitudes=spans_all_longitudes,
    )


def is_inside_area(latitude: float, longitude: float, area: AreaGeometry) -> bool:
    return area.contains(latitude, longitude)


__all__ = [
    "AreaGeometry",
    "QueryBox",
    "compute_area_geometry",
    "is_inside_area",
]
