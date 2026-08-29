from __future__ import annotations

from fastapi import APIRouter

from app.api.routes import aircraft, health, satellites, scene

api_router = APIRouter()

api_router.include_router(health.router)
api_router.include_router(scene.router)
api_router.include_router(aircraft.router)
api_router.include_router(satellites.router)

__all__ = ["api_router"]
