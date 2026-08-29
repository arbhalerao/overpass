from __future__ import annotations

from fastapi import APIRouter

from app.api.routes import aircraft, health, scene

api_router = APIRouter()

api_router.include_router(health.router)
api_router.include_router(scene.router)
api_router.include_router(aircraft.router)

__all__ = ["api_router"]
