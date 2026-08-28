"""
OpenSky Network client

implemented against the current OpenSky REST API:

* OAuth2 *client credentials* against the Keycloak realm at ``auth.opensky-network.org``
* ``GET /states/all`` with ``lamin/lomin/lamax/lomax``, returning the 18-field state vector array
* Access tokens are valid for 30 minutes; a ``401`` mid-flight means the token expired, so exactly one refresh-and-retry is attempted
* Quota is charged per request by bounding-box area. ``429`` responses carry ``X-Rate-Limit-Retry-After-Seconds``, which is surfaced to the caller.

anonymous access still works (with a much smaller daily quota) and is used when no credentials are configured, unless ``OPENSKY_ALLOW_ANONYMOUS`` is disabled

nothing outside this module knows what an OpenSky state vector looks like: the public surface is :class:`AircraftStateVector`, a provider-neutral record
"""

from __future__ import annotations

import asyncio
import time
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any, Final

import httpx

from app.core.clock import utc_now
from app.core.config import Settings
from app.core.exceptions import (
    AircraftProviderAuthError,
    AircraftProviderError,
    AircraftProviderRateLimitError,
    ConfigurationError,
)
from app.core.logging import get_logger
from app.geometry.bounding_box import QueryBox

logger = get_logger(__name__)

_TOKEN_EXPIRY_MARGIN_SECONDS: Final[float] = 60.0

# OpenSky's ``position_source`` enumeration
_POSITION_SOURCES: Final[dict[int, str]] = {
    0: "adsb",
    1: "asterix",
    2: "mlat",
    3: "flarm",
}

# index of each field in the state vector array, per the OpenSky docs
_IDX_ICAO24: Final[int] = 0
_IDX_CALLSIGN: Final[int] = 1
_IDX_ORIGIN_COUNTRY: Final[int] = 2
_IDX_TIME_POSITION: Final[int] = 3
_IDX_LAST_CONTACT: Final[int] = 4
_IDX_LONGITUDE: Final[int] = 5
_IDX_LATITUDE: Final[int] = 6
_IDX_BARO_ALTITUDE: Final[int] = 7
_IDX_ON_GROUND: Final[int] = 8
_IDX_VELOCITY: Final[int] = 9
_IDX_TRUE_TRACK: Final[int] = 10
_IDX_VERTICAL_RATE: Final[int] = 11
_IDX_GEO_ALTITUDE: Final[int] = 13
_IDX_SQUAWK: Final[int] = 14
_IDX_POSITION_SOURCE: Final[int] = 16
_MIN_STATE_FIELDS: Final[int] = 17


@dataclass(frozen=True, slots=True)
class AircraftStateVector:
    """provider-neutral aircraft state, as delivered by the upstream feed"""

    icao24: str
    callsign: str | None
    origin_country: str | None
    latitude: float
    longitude: float
    on_ground: bool
    barometric_altitude_m: float | None
    geometric_altitude_m: float | None
    velocity_mps: float | None
    true_track_deg: float | None
    vertical_rate_mps: float | None
    squawk: str | None
    position_source: str | None
    position_time: datetime | None
    last_contact: datetime | None


@dataclass(frozen=True, slots=True)
class AircraftStateBatch:
    """a set of state vectors and the provider timestamp they belong to"""

    states: tuple[AircraftStateVector, ...]
    # the ``time`` field of the provider response: what instant this snapshot describes
    # the frontend interpolates forward from here
    source_time: datetime
    authenticated: bool


def _as_float(value: Any) -> float | None:
    if value is None or isinstance(value, bool):
        return None
    if isinstance(value, int | float):
        return float(value)
    return None


def _as_datetime(value: Any) -> datetime | None:
    seconds = _as_float(value)
    if seconds is None:
        return None
    try:
        return datetime.fromtimestamp(seconds, tz=UTC)
    except (OverflowError, OSError, ValueError):
        return None


class _TokenManager:
    def __init__(self, settings: Settings, client: httpx.AsyncClient) -> None:
        self._settings = settings
        self._client = client
        self._token: str | None = None
        self._expires_at: float = 0.0
        self._lock = asyncio.Lock()

    @property
    def is_configured(self) -> bool:
        return self._settings.has_opensky_credentials

    def invalidate(self) -> None:
        self._token = None
        self._expires_at = 0.0

    async def get_token(self) -> str:
        if not self.is_configured:
            raise ConfigurationError(
                "OpenSky credentials are not configured.",
                details={"required": ["OPENSKY_CLIENT_ID", "OPENSKY_CLIENT_SECRET"]},
            )
        now = time.monotonic()
        if self._token is not None and now < self._expires_at:
            return self._token

        async with self._lock:
            now = time.monotonic()
            if self._token is not None and now < self._expires_at:
                return self._token
            token, expires_in = await self._request_token()
            self._token = token
            self._expires_at = time.monotonic() + max(
                30.0, expires_in - _TOKEN_EXPIRY_MARGIN_SECONDS
            )
            logger.info(
                "opensky access token acquired",
                extra={"provider": "opensky", "expires_in_seconds": expires_in},
            )
            return token

    async def _request_token(self) -> tuple[str, float]:
        payload = {
            "grant_type": "client_credentials",
            "client_id": self._settings.opensky_client_id,
            "client_secret": self._settings.opensky_client_secret,
        }
        try:
            response = await self._client.post(
                self._settings.opensky_token_url,
                data=payload,
                headers={"Content-Type": "application/x-www-form-urlencoded"},
            )
        except httpx.TimeoutException as exc:
            raise AircraftProviderAuthError(
                "Timed out while authenticating with the aircraft data provider."
            ) from exc
        except httpx.HTTPError as exc:
            raise AircraftProviderAuthError(
                "Could not reach the aircraft data provider's authentication service."
            ) from exc

        if response.status_code in (400, 401, 403):
            # IMPORTANT - Do not echo the provider body: it can contain the client id
            logger.error(
                "opensky token request rejected",
                extra={"provider": "opensky", "status_code": response.status_code},
            )
            raise AircraftProviderAuthError(
                "The configured OpenSky client credentials were rejected.",
                details={"status_code": response.status_code},
            )
        if response.status_code >= 400:
            logger.error(
                "opensky token request failed",
                extra={"provider": "opensky", "status_code": response.status_code},
            )
            raise AircraftProviderAuthError(
                "The aircraft data provider's authentication service returned an error.",
                details={"status_code": response.status_code},
            )

        try:
            body = response.json()
            token = body["access_token"]
            expires_in = float(body.get("expires_in", 1800))
        except (ValueError, KeyError, TypeError) as exc:
            raise AircraftProviderAuthError(
                "The aircraft data provider returned an unreadable token response."
            ) from exc
        if not isinstance(token, str) or not token:
            raise AircraftProviderAuthError(
                "The aircraft data provider returned an empty access token."
            )
        return token, expires_in


class OpenSkyClient:
    """fetches aircraft state vectors from the OpenSky Network"""

    # name reported in health checks and source status entries
    provider_name = "opensky"

    def __init__(self, settings: Settings, http_client: httpx.AsyncClient) -> None:
        self._settings = settings
        self._http = http_client
        self._tokens = _TokenManager(settings, http_client)

    # capability

    @property
    def is_authenticated(self) -> bool:
        return self._settings.has_opensky_credentials

    @property
    def is_configured(self) -> bool:
        return self.is_authenticated or self._settings.opensky_allow_anonymous

    def describe(self) -> dict[str, Any]:
        return {
            "provider": self.provider_name,
            "authenticated": self.is_authenticated,
            "anonymous_allowed": self._settings.opensky_allow_anonymous,
            "base_url": self._settings.opensky_base_url,
        }

    # public API

    async def fetch_states(self, boxes: Sequence[QueryBox]) -> AircraftStateBatch:
        """
        fetch state vectors covering every box, de-duplicated by ICAO24
        more than one box is only ever needed for a area that straddles the antimeridian, which OpenSky's ``lomin``/``lomax`` cannot express
        """
        if not boxes:
            return AircraftStateBatch(
                states=(),
                source_time=utc_now(),
                authenticated=self.is_authenticated,
            )
        if not self.is_configured:
            raise ConfigurationError(
                (
                    "Aircraft data is unavailable: no OpenSky credentials are configured "
                    "and anonymous access is disabled."
                ),
                details={"required": ["OPENSKY_CLIENT_ID", "OPENSKY_CLIENT_SECRET"]},
            )

        payloads = await asyncio.gather(*(self._get_states_all(box) for box in boxes))

        merged: dict[str, AircraftStateVector] = {}
        source_times: list[datetime] = []
        for payload in payloads:
            source_time = _as_datetime(payload.get("time"))
            if source_time is not None:
                source_times.append(source_time)
            for raw in payload.get("states") or []:
                state = self._parse_state(raw)
                if state is not None:
                    merged[state.icao24] = state

        return AircraftStateBatch(
            states=tuple(merged.values()),
            source_time=max(source_times) if source_times else utc_now(),
            authenticated=self.is_authenticated,
        )

    # HTTP

    async def _get_states_all(self, box: QueryBox) -> dict[str, Any]:
        params = {
            "lamin": f"{box.min_latitude:.6f}",
            "lamax": f"{box.max_latitude:.6f}",
            "lomin": f"{box.min_longitude:.6f}",
            "lomax": f"{box.max_longitude:.6f}",
        }
        url = f"{self._settings.opensky_base_url.rstrip('/')}/states/all"

        response = await self._request(url, params, retry_on_auth_failure=True)
        payload = self._decode(response)
        logger.info(
            "opensky states fetched",
            extra={
                "provider": "opensky",
                "status_code": response.status_code,
                "state_count": len(payload.get("states") or []),
                "authenticated": self.is_authenticated,
                "credits_remaining": response.headers.get("X-Rate-Limit-Remaining"),
            },
        )
        return payload

    async def _request(
        self,
        url: str,
        params: dict[str, str],
        *,
        retry_on_auth_failure: bool,
    ) -> httpx.Response:
        headers: dict[str, str] = {}
        if self.is_authenticated:
            headers["Authorization"] = f"Bearer {await self._tokens.get_token()}"

        started = time.perf_counter()
        try:
            response = await self._http.get(url, params=params, headers=headers)
        except httpx.TimeoutException as exc:
            logger.warning(
                "opensky request timed out",
                extra={
                    "provider": "opensky",
                    "timeout_seconds": self._settings.opensky_timeout_seconds,
                },
            )
            raise AircraftProviderError(
                "The aircraft data provider did not respond in time."
            ) from exc
        except httpx.HTTPError as exc:
            logger.warning(
                "opensky request failed",
                extra={"provider": "opensky", "reason": type(exc).__name__},
            )
            raise AircraftProviderError("The aircraft data provider could not be reached.") from exc

        elapsed_ms = round((time.perf_counter() - started) * 1000.0, 1)
        logger.debug(
            "opensky request complete",
            extra={
                "provider": "opensky",
                "status_code": response.status_code,
                "duration_ms": elapsed_ms,
            },
        )

        if response.status_code == 401 and self.is_authenticated and retry_on_auth_failure:
            # the 30 minute token lapsed between refresh and use. retry once.
            logger.info("opensky token expired; refreshing", extra={"provider": "opensky"})
            self._tokens.invalidate()
            return await self._request(url, params, retry_on_auth_failure=False)

        self._raise_for_status(response)
        return response

    def _raise_for_status(self, response: httpx.Response) -> None:
        status = response.status_code
        if status < 400:
            return

        if status in (401, 403):
            hint = (
                "The configured OpenSky credentials were rejected."
                if self.is_authenticated
                else (
                    "Anonymous OpenSky access was refused. Configure OPENSKY_CLIENT_ID "
                    "and OPENSKY_CLIENT_SECRET."
                )
            )
            logger.error(
                "opensky authorization failed",
                extra={"provider": "opensky", "status_code": status},
            )
            raise AircraftProviderAuthError(hint, details={"status_code": status})

        if status == 429:
            retry_after = _as_float(response.headers.get("X-Rate-Limit-Retry-After-Seconds"))
            logger.warning(
                "opensky rate limit reached",
                extra={
                    "provider": "opensky",
                    "status_code": status,
                    "retry_after_seconds": retry_after,
                    "authenticated": self.is_authenticated,
                },
            )
            message = (
                "The OpenSky daily credit allowance has been used up. Authenticated clients receive a substantially larger quota."
                if not self.is_authenticated
                else "The OpenSky request quota has been used up for now."
            )
            raise AircraftProviderRateLimitError(message, retry_after_seconds=retry_after)

        if status == 404:
            # OpenSky answers 404 when it holds no data for the requested period
            logger.info(
                "opensky reported no data",
                extra={"provider": "opensky", "status_code": status},
            )
            raise AircraftProviderError(
                "The aircraft data provider has no data for this request.",
                details={"status_code": status},
            )

        logger.error(
            "opensky returned an error",
            extra={"provider": "opensky", "status_code": status},
        )
        raise AircraftProviderError(
            "The aircraft data provider returned an unexpected error.",
            details={"status_code": status},
        )

    @staticmethod
    def _decode(response: httpx.Response) -> dict[str, Any]:
        try:
            payload = response.json()
        except ValueError as exc:
            logger.error("opensky returned invalid json", extra={"provider": "opensky"})
            raise AircraftProviderError(
                "The aircraft data provider returned a malformed response."
            ) from exc
        if not isinstance(payload, dict):
            raise AircraftProviderError(
                "The aircraft data provider returned an unexpected response shape."
            )
        return payload

    # normalisation

    @staticmethod
    def _parse_state(raw: Any) -> AircraftStateVector | None:
        """
        turn one OpenSky state vector array into a normalised record

        a malformed or position-less entry is skipped rather than failing the whole batch: one bad transponder should not blank the map
        """
        if not isinstance(raw, list | tuple) or len(raw) < _MIN_STATE_FIELDS:
            return None

        icao24 = raw[_IDX_ICAO24]
        latitude = _as_float(raw[_IDX_LATITUDE])
        longitude = _as_float(raw[_IDX_LONGITUDE])
        if not isinstance(icao24, str) or latitude is None or longitude is None:
            return None
        if not (-90.0 <= latitude <= 90.0) or not (-180.0 <= longitude <= 180.0):
            return None

        callsign_raw = raw[_IDX_CALLSIGN]
        callsign = callsign_raw.strip() if isinstance(callsign_raw, str) else None

        squawk_raw = raw[_IDX_SQUAWK] if len(raw) > _IDX_SQUAWK else None
        source_raw = raw[_IDX_POSITION_SOURCE] if len(raw) > _IDX_POSITION_SOURCE else None
        geo_altitude = raw[_IDX_GEO_ALTITUDE] if len(raw) > _IDX_GEO_ALTITUDE else None

        return AircraftStateVector(
            icao24=icao24.strip().lower(),
            callsign=callsign or None,
            origin_country=(
                raw[_IDX_ORIGIN_COUNTRY] if isinstance(raw[_IDX_ORIGIN_COUNTRY], str) else None
            ),
            latitude=latitude,
            longitude=longitude,
            on_ground=bool(raw[_IDX_ON_GROUND]),
            barometric_altitude_m=_as_float(raw[_IDX_BARO_ALTITUDE]),
            geometric_altitude_m=_as_float(geo_altitude),
            velocity_mps=_as_float(raw[_IDX_VELOCITY]),
            true_track_deg=_as_float(raw[_IDX_TRUE_TRACK]),
            vertical_rate_mps=_as_float(raw[_IDX_VERTICAL_RATE]),
            squawk=(squawk_raw if isinstance(squawk_raw, str) and squawk_raw.strip() else None),
            position_source=(
                _POSITION_SOURCES.get(source_raw) if isinstance(source_raw, int) else None
            ),
            position_time=_as_datetime(raw[_IDX_TIME_POSITION]),
            last_contact=_as_datetime(raw[_IDX_LAST_CONTACT]),
        )


__all__ = ["AircraftStateBatch", "AircraftStateVector", "OpenSkyClient"]
