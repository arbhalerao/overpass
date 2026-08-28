"""
a small async TTL cache with single-flight semantics

two properties matter here and neither is provided by a plain dict:

*Single flight* -- when five WebSocket connections all want the same bounding box at the same moment, exactly one upstream request is made and the rest await its result
this is what keeps a live map from multiplying provider quota use by the number of open browser tabs

*Stale fallback* -- an expired entry is kept until it is replaced, so a service can choose to serve stale orbital elements rather than nothing when CelesTrak is unreachable
"""

from __future__ import annotations

import asyncio
import time
from collections.abc import Awaitable, Callable, Hashable
from dataclasses import dataclass, replace

from app.core.logging import get_logger

logger = get_logger(__name__)


@dataclass(frozen=True, slots=True)
class CacheEntry[ValueT]:
    """a cached value with the bookkeeping needed to reason about its age"""

    value: ValueT
    stored_at: float
    ttl_seconds: float
    from_cache: bool = True
    is_stale: bool = False

    @property
    def age_seconds(self) -> float:
        return max(0.0, time.monotonic() - self.stored_at)

    @property
    def is_expired(self) -> bool:
        return self.age_seconds > self.ttl_seconds


class TTLCache[KeyT: Hashable, ValueT]:
    """
    keyed cache with per-key locking

    ``max_entries`` bounds memory; the oldest entries are evicted first,
    which is the right policy for keys derived from bounding boxes that clients stop asking about
    """

    def __init__(self, ttl_seconds: float, *, name: str, max_entries: int = 256) -> None:
        self._ttl = max(0.0, ttl_seconds)
        self._name = name
        self._max_entries = max(1, max_entries)
        self._entries: dict[KeyT, CacheEntry[ValueT]] = {}
        self._locks: dict[KeyT, asyncio.Lock] = {}
        self._guard = asyncio.Lock()

    @property
    def ttl_seconds(self) -> float:
        return self._ttl

    def peek(self, key: KeyT) -> CacheEntry[ValueT] | None:
        return self._entries.get(key)

    def set(self, key: KeyT, value: ValueT) -> CacheEntry[ValueT]:
        entry = CacheEntry(
            value=value,
            stored_at=time.monotonic(),
            ttl_seconds=self._ttl,
            from_cache=False,
        )
        self._entries[key] = entry
        self._evict_if_needed()
        return entry

    def invalidate(self, key: KeyT) -> None:
        self._entries.pop(key, None)

    def clear(self) -> None:
        self._entries.clear()

    async def _lock_for(self, key: KeyT) -> asyncio.Lock:
        async with self._guard:
            lock = self._locks.get(key)
            if lock is None:
                lock = asyncio.Lock()
                self._locks[key] = lock
            return lock

    async def _release_lock(self, key: KeyT) -> None:
        async with self._guard:
            lock = self._locks.get(key)
            if lock is not None and not lock.locked():
                self._locks.pop(key, None)

    def _evict_if_needed(self) -> None:
        while len(self._entries) > self._max_entries:
            oldest = min(self._entries, key=lambda k: self._entries[k].stored_at)
            self._entries.pop(oldest, None)

    async def get_or_set(
        self,
        key: KeyT,
        factory: Callable[[], Awaitable[ValueT]],
        *,
        allow_stale_on_error: bool = False,
    ) -> CacheEntry[ValueT]:
        """
        return a fresh entry for ``key``, computing it at most once

        if ``factory`` raises and ``allow_stale_on_error`` is set,
        a previously cached value is returned with ``is_stale=True`` instead of propagating the exception
        otherwise the exception is re-raised
        """
        cached = self._entries.get(key)
        if cached is not None and not cached.is_expired:
            return replace(cached, from_cache=True)

        lock = await self._lock_for(key)
        try:
            async with lock:
                # a concurrent caller may have refreshed while we waited
                cached = self._entries.get(key)
                if cached is not None and not cached.is_expired:
                    return replace(cached, from_cache=True)
                try:
                    value = await factory()
                except Exception:
                    stale = self._entries.get(key)
                    if allow_stale_on_error and stale is not None:
                        logger.warning(
                            "cache refresh failed; serving stale value",
                            extra={
                                "cache": self._name,
                                "cache_key": str(key),
                                "age_seconds": round(stale.age_seconds, 1),
                            },
                        )
                        return CacheEntry(
                            value=stale.value,
                            stored_at=stale.stored_at,
                            ttl_seconds=stale.ttl_seconds,
                            from_cache=True,
                            is_stale=True,
                        )
                    raise
                logger.debug(
                    "cache refreshed",
                    extra={"cache": self._name, "cache_key": str(key)},
                )
                return self.set(key, value)
        finally:
            # only safe once the lock is released:
            # dropping a held lock lets the next caller create a second one
            # and defeat single flight
            await self._release_lock(key)


__all__ = ["CacheEntry", "TTLCache"]
