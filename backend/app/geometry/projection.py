"""
projection of geographic positions into the selected area's own frame

the frontend draws two very different things:

* celestial objects, placed on a dome by ``(azimuth, altitude)``;
* aircraft, placed on a map by ``(latitude, longitude)``

this module only concerns the second one.  it turns a geographic position into
coordinates relative to the area so the frontend can place an icon without
re-deriving the projection
"""

from __future__ import annotations

import math
from dataclasses import dataclass

from app.geometry.bounding_box import AreaGeometry
from app.geometry.geodesy import (
    haversine_distance_m,
    initial_bearing_deg,
    longitude_difference_deg,
    parallel_radius_m,
)


@dataclass(frozen=True, slots=True)
class AreaPosition:
    # -1 at the west edge, 0 at the centre, +1 at the east edge
    normalized_x: float
    # -1 at the south edge, 0 at the centre, +1 at the north edge
    normalized_y: float
    # metres east of the centre (negative = west)
    east_offset_m: float
    # metres north of the centre (negative = south)
    north_offset_m: float
    # great-circle distance from the centre, metres
    distance_from_center_m: float
    # true bearing from the centre to the position, degrees clockwise from north
    bearing_from_center_deg: float


def project_into_area(
    latitude: float,
    longitude: float,
    area: AreaGeometry,
) -> AreaPosition:
    normalized_x, normalized_y = area.normalize(latitude, longitude)

    delta_lat_deg = latitude - area.center_latitude
    delta_lon_deg = longitude_difference_deg(longitude, area.center_longitude)

    # use the mean of the two latitudes for the parallel radius so that the east offset does not skew towards the centre's own circle of latitude
    mean_latitude = (latitude + area.center_latitude) / 2.0
    east_offset_m = math.radians(delta_lon_deg) * parallel_radius_m(mean_latitude)
    north_offset_m = math.copysign(
        haversine_distance_m(area.center_latitude, longitude, latitude, longitude),
        delta_lat_deg,
    )

    distance_m = haversine_distance_m(
        area.center_latitude, area.center_longitude, latitude, longitude
    )
    bearing_deg = initial_bearing_deg(
        area.center_latitude, area.center_longitude, latitude, longitude
    )

    return AreaPosition(
        normalized_x=normalized_x,
        normalized_y=normalized_y,
        east_offset_m=east_offset_m,
        north_offset_m=north_offset_m,
        distance_from_center_m=distance_m,
        bearing_from_center_deg=bearing_deg,
    )


__all__ = ["AreaPosition", "project_into_area"]
