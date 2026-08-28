"""
CelesTrak GP/OMM orbital element client

CelesTrak publishes General Perturbations element sets in the CCSDS OMM format
this client requests ``FORMAT=json``, which yields OMM keyword records that Skyfield consumes directly through ``EarthSatellite.from_omm``

CelesTrak's stated policy is that GP data refreshes at most every two hours and that clients should download no more than once per refresh window;
exceeding that earns an HTTP 403 and eventually a firewall block

this client therefore:
* caches every group in memory behind a TTL (``SATELLITE_CACHE_TTL_SECONDS``);
* mirrors each group to disk, so a restart re-reads the file instead of re-downloading;
* collapses concurrent requests for the same group into a single download;
* falls back to stale data when CelesTrak is unreachable, rather than dropping the satellite layer entirely

the client's only job is *acquiring elements*.  propagation lives in ``app.services.satellite_service``.
"""

from __future__ import annotations

import json
import time
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, Final

import anyio
import httpx

from app.core.cache import TTLCache
from app.core.clock import utc_now
from app.core.config import Settings
from app.core.exceptions import SatelliteDataError
from app.core.logging import get_logger

logger = get_logger(__name__)

# CelesTrak asks that automated consumers identify themselves
_USER_AGENT: Final[str] = "overpass/0.1 (+https://github.com/arbhalerao/overpass)"

# records with fewer keys than this are not usable OMM element sets
_REQUIRED_OMM_KEYS: Final[frozenset[str]] = frozenset(
    {"OBJECT_NAME", "NORAD_CAT_ID", "EPOCH", "MEAN_MOTION", "INCLINATION"}
)


@dataclass(frozen=True, slots=True)
class CelestrakQuery:
    kind: str
    value: str

    @property
    def label(self) -> str:
        """short human label, used as the cache key and reported on each satellite"""
        return self.value if self.kind == "GROUP" else f"name:{self.value}"

    def params(self) -> dict[str, str]:
        return {self.kind: self.value, "FORMAT": "json"}


@dataclass(frozen=True, slots=True)
class OrbitalElementSet:
    """the OMM records for one CelesTrak query, plus their provenance"""

    group: str
    # raw OMM keyword dictionaries, ready for ``EarthSatellite.from_omm``
    records: tuple[dict[str, Any], ...]
    fetched_at: datetime
    from_cache: bool = False
    is_stale: bool = False

    @property
    def count(self) -> int:
        return len(self.records)

    def age_seconds(self, now: datetime | None = None) -> float:
        reference = now or utc_now()
        return max(0.0, (reference - self.fetched_at).total_seconds())


class CelestrakClient:
    """downloads and caches CelesTrak GP element sets"""

    provider_name = "celestrak"

    def __init__(self, settings: Settings, http_client: httpx.AsyncClient) -> None:
        self._settings = settings
        self._http = http_client
        self._cache_dir = settings.satellite_cache_dir
        self._cache: TTLCache[str, OrbitalElementSet] = TTLCache(
            settings.satellite_cache_ttl_seconds, name="celestrak", max_entries=32
        )

    # public API

    @property
    def groups(self) -> tuple[str, ...]:
        """labels of everything configured, for reporting"""
        return tuple(query.label for query in self.queries)

    def describe(self) -> dict[str, Any]:
        return {
            "provider": self.provider_name,
            "base_url": self._settings.celestrak_base_url,
            "groups": list(self._settings.celestrak_groups),
            "names": list(self._settings.celestrak_names),
            "cache_ttl_seconds": self._settings.satellite_cache_ttl_seconds,
            "cache_dir": str(self._cache_dir),
        }

    async def get_group(self, group: str) -> OrbitalElementSet:
        """return the element set for a CelesTrak group, downloading only if needed"""
        return await self.get(CelestrakQuery("GROUP", group))

    async def get_name(self, name: str) -> OrbitalElementSet:
        """return every catalogued object whose name contains ``name``"""
        return await self.get(CelestrakQuery("NAME", name))

    async def get(self, query: CelestrakQuery) -> OrbitalElementSet:
        """return the element set for ``query``, downloading only if needed"""
        entry = await self._cache.get_or_set(
            query.label,
            lambda: self._load_group(query),
            allow_stale_on_error=True,
        )
        elements = entry.value
        if entry.from_cache and not elements.from_cache:
            elements = OrbitalElementSet(
                group=elements.group,
                records=elements.records,
                fetched_at=elements.fetched_at,
                from_cache=True,
                is_stale=entry.is_stale,
            )
        elif entry.is_stale and not elements.is_stale:
            elements = OrbitalElementSet(
                group=elements.group,
                records=elements.records,
                fetched_at=elements.fetched_at,
                from_cache=True,
                is_stale=True,
            )
        return elements

    @property
    def queries(self) -> tuple[CelestrakQuery, ...]:
        """everything configured: the curated groups, plus any name searches"""
        return tuple(
            [CelestrakQuery("GROUP", g) for g in self._settings.celestrak_groups]
            + [CelestrakQuery("NAME", n) for n in self._settings.celestrak_names]
        )

    async def get_groups(
        self, queries: tuple[CelestrakQuery, ...] | None = None
    ) -> tuple[tuple[OrbitalElementSet, ...], tuple[tuple[str, Exception], ...]]:
        """
        fetch every configured query, returning successes and failures separately

        one unavailable query should not remove the satellites of every other from
        the scene, so failures are reported rather than raised
        """
        wanted = queries if queries is not None else self.queries
        succeeded: list[OrbitalElementSet] = []
        failed: list[tuple[str, Exception]] = []
        for query in wanted:
            try:
                succeeded.append(await self.get(query))
            except Exception as exc:  # reported to the caller
                logger.warning(
                    "celestrak query unavailable",
                    extra={
                        "provider": "celestrak",
                        "query": query.label,
                        "reason": str(exc),
                    },
                )
                failed.append((query.label, exc))
        return tuple(succeeded), tuple(failed)

    async def prime(self) -> None:
        """warm the cache at startup so the first request is not a download"""
        for query in self.queries:
            group = query.label
            try:
                elements = await self.get(query)
                logger.info(
                    "satellite elements ready",
                    extra={
                        "provider": "celestrak",
                        "group": group,
                        "satellite_count": elements.count,
                        "from_cache": elements.from_cache,
                    },
                )
            except SatelliteDataError as exc:
                logger.warning(
                    "could not prime satellite elements",
                    extra={
                        "provider": "celestrak",
                        "group": group,
                        "reason": exc.message,
                    },
                )

    # loading

    async def _load_group(self, query: CelestrakQuery) -> OrbitalElementSet:
        """disk first, then network; raise only when both fail"""
        group = query.label
        cached = await self._read_disk_cache(group)
        if cached is not None and cached.age_seconds() < self._settings.satellite_cache_ttl_seconds:
            logger.debug(
                "satellite elements loaded from disk",
                extra={
                    "provider": "celestrak",
                    "group": group,
                    "satellite_count": cached.count,
                },
            )
            return cached

        try:
            downloaded = await self._download_group(query)
        except SatelliteDataError:
            if cached is not None:
                logger.warning(
                    "celestrak unreachable; using stale disk cache",
                    extra={
                        "provider": "celestrak",
                        "group": group,
                        "age_seconds": round(cached.age_seconds(), 1),
                    },
                )
                return OrbitalElementSet(
                    group=cached.group,
                    records=cached.records,
                    fetched_at=cached.fetched_at,
                    from_cache=True,
                    is_stale=True,
                )
            raise

        await self._write_disk_cache(downloaded)
        return downloaded

    async def _download_group(self, query: CelestrakQuery) -> OrbitalElementSet:
        group = query.label
        params = query.params()
        started = time.perf_counter()
        try:
            response = await self._http.get(
                self._settings.celestrak_base_url,
                params=params,
                headers={"User-Agent": _USER_AGENT, "Accept": "application/json"},
            )
        except httpx.TimeoutException as exc:
            raise SatelliteDataError(
                "Timed out while downloading satellite orbital data.",
                details={"group": group},
            ) from exc
        except httpx.HTTPError as exc:
            raise SatelliteDataError(
                "Could not reach the satellite orbital data provider.",
                details={"group": group},
            ) from exc

        duration_ms = round((time.perf_counter() - started) * 1000.0, 1)

        if response.status_code == 403:
            logger.error(
                "celestrak refused the request; check download frequency",
                extra={"provider": "celestrak", "group": group, "status_code": 403},
            )
            raise SatelliteDataError(
                "The satellite data provider refused the request, most likely due to download frequency limits.",
                details={"group": group, "status_code": 403},
            )
        if response.status_code >= 400:
            logger.error(
                "celestrak returned an error",
                extra={
                    "provider": "celestrak",
                    "group": group,
                    "status_code": response.status_code,
                },
            )
            raise SatelliteDataError(
                "The satellite data provider returned an error.",
                details={"group": group, "status_code": response.status_code},
            )

        records = self._decode(group, response)
        logger.info(
            "satellite elements downloaded",
            extra={
                "provider": "celestrak",
                "group": group,
                "satellite_count": len(records),
                "duration_ms": duration_ms,
            },
        )
        return OrbitalElementSet(
            group=group, records=records, fetched_at=utc_now(), from_cache=False
        )

    @staticmethod
    def _decode(group: str, response: httpx.Response) -> tuple[dict[str, Any], ...]:
        """parse the JSON body, tolerating CelesTrak's plain-text error pages"""
        text = response.text.strip()
        if not text or not text.startswith("["):
            # CelesTrak answers unknown groups with a 200 and a short message such as "Invalid query" or "No GP data found"
            raise SatelliteDataError(
                "The satellite data provider returned no orbital data for this group.",
                details={"group": group, "response": text[:120]},
            )
        try:
            payload = json.loads(text)
        except ValueError as exc:
            raise SatelliteDataError(
                "The satellite data provider returned malformed orbital data.",
                details={"group": group},
            ) from exc
        if not isinstance(payload, list):
            raise SatelliteDataError(
                "The satellite data provider returned an unexpected data shape.",
                details={"group": group},
            )

        records = tuple(
            record
            for record in payload
            if isinstance(record, dict) and _REQUIRED_OMM_KEYS.issubset(record.keys())
        )
        if not records:
            raise SatelliteDataError(
                "The satellite data provider returned no usable element sets.",
                details={"group": group, "received": len(payload)},
            )
        return records

    # disk mirror

    def _cache_path(self, group: str) -> Path:
        safe = "".join(char if char.isalnum() or char in "-_" else "_" for char in group)
        return self._cache_dir / f"{safe}.json"

    async def _read_disk_cache(self, group: str) -> OrbitalElementSet | None:
        path = self._cache_path(group)
        try:
            raw = await anyio.to_thread.run_sync(path.read_text)
        except FileNotFoundError:
            return None
        except OSError as exc:
            logger.warning(
                "could not read satellite cache file",
                extra={"provider": "celestrak", "group": group, "reason": str(exc)},
            )
            return None

        try:
            document = json.loads(raw)
            fetched_at = datetime.fromisoformat(document["fetched_at"])
            records = tuple(document["records"])
        except (ValueError, KeyError, TypeError):
            logger.warning(
                "discarding corrupt satellite cache file",
                extra={"provider": "celestrak", "group": group, "path": str(path)},
            )
            return None

        if fetched_at.tzinfo is None:
            fetched_at = fetched_at.replace(tzinfo=UTC)
        if not records:
            return None
        return OrbitalElementSet(
            group=group, records=records, fetched_at=fetched_at, from_cache=True
        )

    async def _write_disk_cache(self, elements: OrbitalElementSet) -> None:
        path = self._cache_path(elements.group)
        document = {
            "group": elements.group,
            "fetched_at": elements.fetched_at.isoformat(),
            "records": list(elements.records),
        }

        def _write() -> None:
            path.parent.mkdir(parents=True, exist_ok=True)
            # write-then-rename so a crash mid-write cannot leave a partial file
            temporary = path.with_suffix(".json.tmp")
            temporary.write_text(json.dumps(document))
            temporary.replace(path)

        try:
            await anyio.to_thread.run_sync(_write)
        except OSError as exc:
            logger.warning(
                "could not write satellite cache file",
                extra={
                    "provider": "celestrak",
                    "group": elements.group,
                    "reason": str(exc),
                },
            )


__all__ = ["CelestrakClient", "CelestrakQuery", "OrbitalElementSet"]
