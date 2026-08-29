from __future__ import annotations

import time
from dataclasses import dataclass
from typing import Annotated

import httpx
from fastapi import Depends, Request, WebSocket

from app.clients.celestrak_client import CelestrakClient
from app.core.config import Settings, get_settings
from app.geometry.timezones import TimezoneResolver
from app.services.aircraft_service import AircraftService
from app.services.ephemeris_service import EphemerisProvider
from app.services.satellite_service import SatelliteService
from app.services.scene_service import SceneService


@dataclass(slots=True)
class ServiceContainer:
    """everything built at startup and shared for the process's lifetime"""

    settings: Settings
    http_client: httpx.AsyncClient
    ephemeris: EphemerisProvider
    timezones: TimezoneResolver
    celestrak: CelestrakClient
    aircraft_service: AircraftService
    satellite_service: SatelliteService
    scene_service: SceneService
    started_at: float

    @property
    def uptime_seconds(self) -> float:
        return max(0.0, time.monotonic() - self.started_at)


def get_container(request: Request) -> ServiceContainer:
    """fetch the container placed on ``app.state`` by the lifespan handler"""
    return _require_container(getattr(request.app.state, "container", None))


def get_container_ws(websocket: WebSocket) -> ServiceContainer:
    """``get_container`` for WebSocket routes, which have no ``Request``"""
    return _require_container(getattr(websocket.app.state, "container", None))


def _require_container(container: object) -> ServiceContainer:
    if not isinstance(container, ServiceContainer):  # pragma: no cover - startup failed
        raise RuntimeError("Application services are not initialised.")
    return container


def get_scene_service(
    container: Annotated[ServiceContainer, Depends(get_container)],
) -> SceneService:
    return container.scene_service


def get_aircraft_service(
    container: Annotated[ServiceContainer, Depends(get_container)],
) -> AircraftService:
    return container.aircraft_service


def get_satellite_service(
    container: Annotated[ServiceContainer, Depends(get_container)],
) -> SatelliteService:
    return container.satellite_service


def get_app_settings() -> Settings:
    return get_settings()


ContainerDep = Annotated[ServiceContainer, Depends(get_container)]
SettingsDep = Annotated[Settings, Depends(get_app_settings)]
SceneServiceDep = Annotated[SceneService, Depends(get_scene_service)]
AircraftServiceDep = Annotated[AircraftService, Depends(get_aircraft_service)]
SatelliteServiceDep = Annotated[SatelliteService, Depends(get_satellite_service)]


__all__ = [
    "AircraftServiceDep",
    "ContainerDep",
    "SatelliteServiceDep",
    "SceneServiceDep",
    "ServiceContainer",
    "SettingsDep",
    "get_container",
    "get_container_ws",
]
