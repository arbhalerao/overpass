from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Annotated, Literal

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    # application
    app_name: str = "Overpass"
    app_env: Literal["development", "staging", "production", "test"] = "development"
    log_level: str = "INFO"
    log_format: Literal["json", "console"] = "console"

    # HTTP server
    host: str = "0.0.0.0"
    port: int = Field(default=8000, ge=1, le=65535)

    # CORS
    cors_origins: Annotated[list[str], NoDecode] = Field(
        default_factory=lambda: ["http://localhost:3000", "http://localhost:5173"]
    )

    # OpenSky
    opensky_client_id: str = ""
    opensky_client_secret: str = ""
    opensky_base_url: str = "https://opensky-network.org/api"
    opensky_token_url: str = (
        "https://auth.opensky-network.org/auth/realms/opensky-network"
        "/protocol/openid-connect/token"
    )
    opensky_timeout_seconds: float = Field(default=15.0, gt=0)
    opensky_allow_anonymous: bool = True

    # CelesTrak
    celestrak_base_url: str = "https://celestrak.org/NORAD/elements/gp.php"
    celestrak_timeout_seconds: float = Field(default=30.0, gt=0)
    celestrak_groups: Annotated[list[str], NoDecode] = Field(
        default_factory=lambda: ["stations", "visual"]
    )
    # name searches, for satellites that belong to no curated group
    # each is a substring match against the catalogue, so "RISAT" picks up the whole family
    celestrak_names: Annotated[list[str], NoDecode] = Field(default_factory=list)

    # astronomy / Skyfield
    astronomy_data_dir: Path = Path("./data")
    skyfield_ephemeris: str = "de421.bsp"
    skyfield_allow_downloads: bool = True

    # caching
    aircraft_cache_ttl_seconds: float = Field(default=5.0, ge=0)
    satellite_cache_ttl_seconds: float = Field(default=7200.0, ge=0)

    # observation area limits
    radius_min_km: float = Field(default=1.0, gt=0)
    radius_max_km: float = Field(default=250.0, gt=0)

    # visibility thresholds
    min_satellite_elevation_deg: float = Field(default=10.0, ge=-90, le=90)

    # WebSocket
    ws_aircraft_interval_seconds: float = Field(default=10.0, ge=1.0)
    ws_satellite_interval_seconds: float = Field(default=5.0, ge=1.0)
    ws_max_message_bytes: int = Field(default=8192, ge=256)

    # validators
    @field_validator("cors_origins", "celestrak_groups", "celestrak_names", mode="before")
    @classmethod
    def _split_csv(cls, value: object) -> object:
        if isinstance(value, str):
            text = value.strip()
            if text.startswith("["):
                try:
                    parsed = json.loads(text)
                except ValueError:
                    parsed = None
                if isinstance(parsed, list):
                    return [str(item).strip() for item in parsed if str(item).strip()]
            return [item.strip() for item in text.split(",") if item.strip()]
        return value

    @field_validator("log_level", mode="before")
    @classmethod
    def _upper_log_level(cls, value: object) -> object:
        return value.upper() if isinstance(value, str) else value

    # derived helpers
    @property
    def has_opensky_credentials(self) -> bool:
        return bool(self.opensky_client_id and self.opensky_client_secret)

    @property
    def is_production(self) -> bool:
        return self.app_env == "production"

    @property
    def satellite_cache_dir(self) -> Path:
        return self.astronomy_data_dir / "celestrak"

    def ensure_data_dirs(self) -> None:
        self.astronomy_data_dir.mkdir(parents=True, exist_ok=True)
        self.satellite_cache_dir.mkdir(parents=True, exist_ok=True)


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()


__all__ = ["Settings", "get_settings"]
