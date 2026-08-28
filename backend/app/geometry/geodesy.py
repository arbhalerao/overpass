"""
WGS-84 geodesy helpers
"""

from __future__ import annotations

import math
from typing import Final

# WGS-84 semi-major axis, metres
WGS84_SEMI_MAJOR_AXIS_M: Final[float] = 6_378_137.0
# WGS-84 flattening
WGS84_FLATTENING: Final[float] = 1.0 / 298.257223563
# WGS-84 semi-minor axis, metres
WGS84_SEMI_MINOR_AXIS_M: Final[float] = WGS84_SEMI_MAJOR_AXIS_M * (1.0 - WGS84_FLATTENING)
# first eccentricity squared
WGS84_ECCENTRICITY_SQUARED: Final[float] = WGS84_FLATTENING * (2.0 - WGS84_FLATTENING)

# below this parallel radius the circle of latitude is too short for a meaningful east/west degree conversion and the area becomes a polar cap
_MINIMUM_PARALLEL_RADIUS_M: Final[float] = 1e-6


def clamp_latitude(latitude_deg: float) -> float:
    """clamp a latitude into ``[-90, 90]``"""
    return max(-90.0, min(90.0, latitude_deg))


def wrap_longitude(longitude_deg: float) -> float:
    """
    wrap a longitude into ``[-180, 180)``

    ``wrap_longitude(190) == -170``; ``wrap_longitude(-180) == -180``
    """
    wrapped = math.fmod(longitude_deg + 180.0, 360.0)
    if wrapped < 0.0:
        wrapped += 360.0
    return wrapped - 180.0


def normalize_heading_deg(heading_deg: float) -> float:
    """
    wrap a compass heading into ``[0, 360)``

    0 = true north, 90 = east, 180 = south, 270 = west
    """
    return heading_deg % 360.0


def longitude_difference_deg(longitude_deg: float, reference_deg: float) -> float:
    """
    signed east-positive difference ``longitude - reference`` in ``[-180, 180)``

    using the wrapped difference is what makes the antimeridian a non-event for containment tests and normalised coordinates alike
    """
    return wrap_longitude(longitude_deg - reference_deg)


def meridional_radius_m(latitude_deg: float) -> float:
    """radius of curvature in the meridian (north/south) at a latitude"""
    sin_lat = math.sin(math.radians(latitude_deg))
    denominator = 1.0 - WGS84_ECCENTRICITY_SQUARED * sin_lat * sin_lat
    return float(WGS84_SEMI_MAJOR_AXIS_M * (1.0 - WGS84_ECCENTRICITY_SQUARED) / denominator**1.5)


def normal_radius_m(latitude_deg: float) -> float:
    """radius of curvature in the prime vertical (east/west) at a latitude"""
    sin_lat = math.sin(math.radians(latitude_deg))
    denominator = 1.0 - WGS84_ECCENTRICITY_SQUARED * sin_lat * sin_lat
    return WGS84_SEMI_MAJOR_AXIS_M / math.sqrt(denominator)


def parallel_radius_m(latitude_deg: float) -> float:
    """radius of the circle of latitude (distance from the Earth's spin axis)"""
    return normal_radius_m(latitude_deg) * math.cos(math.radians(latitude_deg))


def latitude_offset_deg(latitude_deg: float, distance_m: float) -> float:
    """
    degrees of latitude spanned by ``distance_m`` along the meridian

    two fixed-point iterations evaluate the meridional radius at the midpoint of the arc instead of at its start,
    which removes almost all of the error the single-radius approximation would leave at continental scales
    """
    offset = math.degrees(distance_m / meridional_radius_m(latitude_deg))
    for _ in range(2):
        midpoint = clamp_latitude(latitude_deg + offset / 2.0)
        offset = math.degrees(distance_m / meridional_radius_m(midpoint))
    return offset


def longitude_offset_deg(latitude_deg: float, distance_m: float) -> float:
    """
    degrees of longitude spanned by ``distance_m`` along a parallel

    returns ``180.0`` at (or extremely close to) the poles,
    where every longitude is within the distance and the area degenerates into a cap
    """
    radius = parallel_radius_m(latitude_deg)
    if radius <= _MINIMUM_PARALLEL_RADIUS_M:
        return 180.0
    return min(180.0, math.degrees(distance_m / radius))


def haversine_distance_m(
    latitude_a_deg: float,
    longitude_a_deg: float,
    latitude_b_deg: float,
    longitude_b_deg: float,
) -> float:
    """
    great-circle distance on a sphere of the WGS-84 mean radius, in metres

    accurate to a few tenths of a percent, which is ample for the distance read-outs the frontend shows next to an aircraft
    """
    mean_radius = (2.0 * WGS84_SEMI_MAJOR_AXIS_M + WGS84_SEMI_MINOR_AXIS_M) / 3.0
    lat_a = math.radians(latitude_a_deg)
    lat_b = math.radians(latitude_b_deg)
    delta_lat = lat_b - lat_a
    delta_lon = math.radians(longitude_difference_deg(longitude_b_deg, longitude_a_deg))
    a = (
        math.sin(delta_lat / 2.0) ** 2
        + math.cos(lat_a) * math.cos(lat_b) * math.sin(delta_lon / 2.0) ** 2
    )
    return 2.0 * mean_radius * math.asin(min(1.0, math.sqrt(a)))


def elevation_angle_deg(ground_distance_m: float, height_m: float) -> float:
    """
    angle above the horizon of a target at ``height_m``, ``ground_distance_m`` away

    Spherical-Earth geometry, not ``atan(height / distance)``
    over short distances the two agree, but the Earth curves away beneath the target: at 250 km the surface has dropped about 4.9 km,
    which is a large fraction of an airliner's altitude
    ignoring it would put distant aircraft several degrees too high

    returns a negative angle for a target that has fallen below the horizon
    """
    radius = (2.0 * WGS84_SEMI_MAJOR_AXIS_M + WGS84_SEMI_MINOR_AXIS_M) / 3.0
    # angle subtended at the Earth's centre by the ground track
    theta = ground_distance_m / radius
    target = radius + max(0.0, height_m)
    # observer sits at (radius, 0); local "up" is +x and local horizontal is +y
    up = target * math.cos(theta) - radius
    horizontal = target * math.sin(theta)
    if horizontal <= 0.0:
        return 90.0 if up > 0.0 else -90.0
    return math.degrees(math.atan2(up, horizontal))


def slant_range_m(ground_distance_m: float, height_m: float) -> float:
    """straight-line distance to a target, through the air rather than along it"""
    radius = (2.0 * WGS84_SEMI_MAJOR_AXIS_M + WGS84_SEMI_MINOR_AXIS_M) / 3.0
    theta = ground_distance_m / radius
    target = radius + max(0.0, height_m)
    up = target * math.cos(theta) - radius
    horizontal = target * math.sin(theta)
    return math.hypot(up, horizontal)


def initial_bearing_deg(
    latitude_a_deg: float,
    longitude_a_deg: float,
    latitude_b_deg: float,
    longitude_b_deg: float,
) -> float:
    """initial true bearing from A to B, degrees clockwise from true north"""
    lat_a = math.radians(latitude_a_deg)
    lat_b = math.radians(latitude_b_deg)
    delta_lon = math.radians(longitude_difference_deg(longitude_b_deg, longitude_a_deg))
    y = math.sin(delta_lon) * math.cos(lat_b)
    x = math.cos(lat_a) * math.sin(lat_b) - math.sin(lat_a) * math.cos(lat_b) * math.cos(delta_lon)
    return (math.degrees(math.atan2(y, x)) + 360.0) % 360.0


__all__ = [
    "WGS84_ECCENTRICITY_SQUARED",
    "WGS84_FLATTENING",
    "WGS84_SEMI_MAJOR_AXIS_M",
    "WGS84_SEMI_MINOR_AXIS_M",
    "clamp_latitude",
    "elevation_angle_deg",
    "haversine_distance_m",
    "initial_bearing_deg",
    "latitude_offset_deg",
    "longitude_difference_deg",
    "longitude_offset_deg",
    "meridional_radius_m",
    "normal_radius_m",
    "normalize_heading_deg",
    "parallel_radius_m",
    "slant_range_m",
    "wrap_longitude",
]
