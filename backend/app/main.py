from __future__ import annotations

import time
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, RedirectResponse

from app.api.deps import ServiceContainer
from app.api.router import api_router
from app.api.routes.health import APP_VERSION
from app.clients.celestrak_client import CelestrakClient
from app.clients.opensky_client import OpenSkyClient
from app.core.config import Settings, get_settings
from app.core.exceptions import register_exception_handlers
from app.core.logging import configure_logging, get_logger
from app.geometry.timezones import TimezoneResolver
from app.services.aircraft_service import AircraftService
from app.services.ephemeris_service import EphemerisProvider
from app.services.satellite_service import SatelliteService
from app.services.scene_service import SceneService

logger = get_logger(__name__)

API_PREFIX = "/api/v1"

DESCRIPTION = """
**Overpass** answers one question for a point on the Earth: *what is above here, right now?*

Pick a latitude and longitude and a radius, and the API returns

* **satellites** above the horizon, propagated from CelesTrak orbital elements, each flagged with whether it is actually visible to the naked eye right now;
* **aircraft** inside that circle, from the OpenSky Network, resolved to airline and flight number.
"""


def build_container(settings: Settings) -> ServiceContainer:
    http_client = httpx.AsyncClient(
        timeout=httpx.Timeout(
            max(settings.opensky_timeout_seconds, settings.celestrak_timeout_seconds),
            connect=10.0,
        ),
        follow_redirects=True,
        limits=httpx.Limits(max_connections=20, max_keepalive_connections=10),
        headers={"Accept": "application/json"},
    )

    ephemeris = EphemerisProvider(settings)
    # building the boundary index takes ~0.5 s, so do it once here rather than on the first request
    timezones = TimezoneResolver()
    opensky = OpenSkyClient(settings, http_client)
    celestrak = CelestrakClient(settings, http_client)

    aircraft_service = AircraftService(opensky, settings)
    satellite_service = SatelliteService(celestrak, ephemeris, settings)
    scene_service = SceneService(aircraft_service, satellite_service, settings, timezones)

    return ServiceContainer(
        settings=settings,
        http_client=http_client,
        ephemeris=ephemeris,
        timezones=timezones,
        celestrak=celestrak,
        aircraft_service=aircraft_service,
        satellite_service=satellite_service,
        scene_service=scene_service,
        started_at=time.monotonic(),
    )


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    settings = get_settings()
    settings.ensure_data_dirs()

    logger.info(
        "application starting",
        extra={
            "app_name": settings.app_name,
            "environment": settings.app_env,
            "version": APP_VERSION,
            "opensky_authenticated": settings.has_opensky_credentials,
            "celestrak_groups": settings.celestrak_groups,
            "data_dir": str(settings.astronomy_data_dir),
        },
    )
    if not settings.has_opensky_credentials:
        logger.warning(
            (
                "no OpenSky credentials configured; using the small anonymous quota"
                if settings.opensky_allow_anonymous
                else "no OpenSky credentials configured and anonymous access is disabled; "
                "aircraft endpoints will return a configuration error"
            ),
            extra={"anonymous_allowed": settings.opensky_allow_anonymous},
        )

    container = build_container(settings)
    app.state.container = container

    # load the ephemeris and prime the orbital elements before serving
    # both degrade rather than raise, so a missing download never blocks startup
    await container.ephemeris.load()
    await container.satellite_service.prime()

    logger.info(
        "application ready",
        extra={
            "ephemeris_ready": container.ephemeris.is_ready,
            "sun_available": container.ephemeris.has_sun,
            "tracked_satellites": container.satellite_service.describe()["tracked_satellites"],
        },
    )

    try:
        yield
    finally:
        logger.info("application shutting down")
        await container.http_client.aclose()
        container.ephemeris.close()
        app.state.container = None
        logger.info("application stopped")


def create_app() -> FastAPI:
    settings = get_settings()
    configure_logging(settings.log_level, settings.log_format)

    app = FastAPI(
        title=settings.app_name,
        version=APP_VERSION,
        description=DESCRIPTION,
        summary="What is above this point on the Earth, right now?",
        lifespan=lifespan,
        docs_url="/docs",
        redoc_url="/redoc",
        openapi_url="/openapi.json",
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "OPTIONS"],
        allow_headers=["*"],
    )

    register_exception_handlers(app)

    app.include_router(api_router, prefix=API_PREFIX)

    @app.get("/", include_in_schema=False)
    async def root() -> RedirectResponse:
        return RedirectResponse(url="/docs")

    @app.get("/healthz", include_in_schema=False)
    async def healthz() -> JSONResponse:
        return JSONResponse({"status": "ok"})

    return app


app = create_app()


def run() -> None:
    import uvicorn

    settings = get_settings()
    uvicorn.run(
        "app.main:app",
        host=settings.host,
        port=settings.port,
        reload=settings.app_env == "development",
        log_config=None,
    )


if __name__ == "__main__":
    run()
