"""
live scene updates over a WebSocket

one connection, one subscription, its own configuration
there is no shared session store and no cross-connection state: closing the socket disposes of everything the connection owned

layers refresh at their own cadence, which is the point of using a socket at all:

* **aircraft** -- ``WS_AIRCRAFT_INTERVAL_SECONDS`` (default 10 s)
this is the only layer that costs an upstream request, so it sets the provider quota bill
* **satellites** -- ``WS_SATELLITE_INTERVAL_SECONDS`` (default 5 s)
fast, since it is pure propagation from already-cached elements; nothing is downloaded
a satellite in low orbit crosses the sky in minutes, so this is the layer that genuinely needs a short interval

each update frame carries only the layers that were actually recomputed, listed in ``layers``

protocol
--------
client to server::

    {"action": "subscribe", "center": {...}, "radius_km": 50, "include": {...}, "time_mode": "live"}
    {"action": "unsubscribe"}
    {"action": "ping"}

server to client::

    {"type": "ready"}          on connect
    {"type": "subscribed"}     subscription accepted
    {"type": "scene_update"}   a refresh of one or more layers
    {"type": "unsubscribed"}   updates stopped
    {"type": "pong"}
    {"type": "error"}          malformed frame or failed update
"""

from __future__ import annotations

import asyncio
import contextlib
import json
import time
from dataclasses import dataclass
from typing import Any, Final
from uuid import uuid4

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from pydantic import ValidationError

from app.api.deps import ServiceContainer, get_container_ws
from app.api.presenters import to_observation_context, to_scene_response
from app.core.clock import utc_now
from app.core.config import Settings
from app.core.exceptions import OverpassError
from app.core.logging import get_logger
from app.geometry.bounding_box import AreaGeometry
from app.models.requests import ControlMessage, SubscribeMessage
from app.services.scene_service import SceneResult, SceneService

logger = get_logger(__name__)

router = APIRouter()

_AIRCRAFT: Final = "aircraft"
_SATELLITES: Final = "satellites"

# never sleep longer than this,
# so an interval change or a close is noticed promptly even on a long cadence
_MAX_SLEEP_SECONDS: Final[float] = 5.0

# consecutive failed updates before the publisher gives up on the connection
_MAX_CONSECUTIVE_FAILURES: Final[int] = 5


@dataclass(slots=True)
class _LayerSchedule:
    """monotonic deadlines for each enabled layer"""

    intervals: dict[str, float]
    due_at: dict[str, float]

    @classmethod
    def create(cls, subscription: SubscribeMessage, settings: Settings) -> _LayerSchedule:
        now = time.monotonic()
        intervals: dict[str, float] = {}
        if subscription.include.aircraft:
            intervals[_AIRCRAFT] = settings.ws_aircraft_interval_seconds
        if subscription.include.satellites:
            intervals[_SATELLITES] = settings.ws_satellite_interval_seconds
        # everything is due immediately so the first frame is a complete scene
        return cls(intervals=intervals, due_at=dict.fromkeys(intervals, now))

    def due_layers(self, now: float) -> set[str]:
        return {layer for layer, deadline in self.due_at.items() if deadline <= now}

    def mark_sent(self, layers: set[str], now: float) -> None:
        for layer in layers:
            self.due_at[layer] = now + self.intervals[layer]

    def seconds_until_next(self, now: float) -> float:
        if not self.due_at:
            return _MAX_SLEEP_SECONDS
        wait = min(self.due_at.values()) - now
        return max(0.0, min(wait, _MAX_SLEEP_SECONDS))


class LiveConnection:
    """owns one client socket: its subscription and its publisher task"""

    def __init__(self, websocket: WebSocket, container: ServiceContainer) -> None:
        self._websocket = websocket
        self._settings = container.settings
        self._scenes: SceneService = container.scene_service
        self._publisher: asyncio.Task[None] | None = None
        self._subscription: SubscribeMessage | None = None
        self.connection_id = uuid4().hex[:12]

    # lifecycle

    async def run(self) -> None:
        """accept the socket and pump client frames until it closes"""
        await self._websocket.accept()
        logger.info(
            "websocket connected",
            extra={
                "connection_id": self.connection_id,
                "client": getattr(self._websocket.client, "host", None),
            },
        )
        await self._send(
            {
                "type": "ready",
                "message": "Send a subscribe frame to start receiving scene updates.",
                "server_time": utc_now().isoformat(),
            }
        )
        try:
            while True:
                raw = await self._websocket.receive_text()
                await self._handle_frame(raw)
        except WebSocketDisconnect as exc:
            logger.info(
                "websocket disconnected",
                extra={"connection_id": self.connection_id, "code": exc.code},
            )
        except RuntimeError:
            # Starlette raises this if the socket dies mid-receive
            logger.info(
                "websocket closed unexpectedly",
                extra={"connection_id": self.connection_id},
            )
        finally:
            await self._stop_publisher()
            logger.info("websocket cleaned up", extra={"connection_id": self.connection_id})

    # inbound frames

    async def _handle_frame(self, raw: str) -> None:
        if len(raw.encode("utf-8")) > self._settings.ws_max_message_bytes:
            await self._send_error(
                "message_too_large",
                f"Messages must not exceed {self._settings.ws_max_message_bytes} bytes.",
            )
            return

        action = self._peek_action(raw)
        if action is None:
            await self._send_error(
                "invalid_message", "Expected a JSON object with an 'action' field."
            )
            return

        if action == "subscribe":
            await self._handle_subscribe(raw)
            return

        try:
            control = ControlMessage.model_validate_json(raw)
        except ValidationError:
            await self._send_error(
                "unknown_action",
                f"Unsupported action '{action}'. Use subscribe, unsubscribe or ping.",
            )
            return

        if control.action == "ping":
            await self._send({"type": "pong", "server_time": utc_now().isoformat()})
        else:
            await self._stop_publisher()
            self._subscription = None
            await self._send({"type": "unsubscribed"})
            logger.info("websocket unsubscribed", extra={"connection_id": self.connection_id})

    @staticmethod
    def _peek_action(raw: str) -> str | None:
        """read just the action so an unknown one gets a helpful error"""
        try:
            payload = json.loads(raw)
        except ValueError:
            return None
        if not isinstance(payload, dict):
            return None
        action = payload.get("action")
        return action if isinstance(action, str) else None

    async def _handle_subscribe(self, raw: str) -> None:
        try:
            subscription = SubscribeMessage.model_validate_json(raw)
        except ValidationError as exc:
            await self._send_error(
                "validation_error",
                "The subscribe message failed validation.",
                details={
                    "fields": [
                        {
                            "field": ".".join(str(part) for part in error.get("loc", ())),
                            "message": error.get("msg", "invalid value"),
                        }
                        for error in exc.errors()
                    ]
                },
            )
            return

        try:
            area = self._scenes.build_area(subscription.tick_request())
        except OverpassError as exc:
            await self._send_error(exc.code, exc.message, details=exc.details)
            return

        # a re-subscribe replaces the previous configuration outright
        await self._stop_publisher()
        self._subscription = subscription

        context = to_observation_context(_observation_only_result(area, subscription))
        await self._send(
            {
                "type": "subscribed",
                "connection_id": self.connection_id,
                "observation": context.model_dump(mode="json"),
                "time_mode": subscription.time_mode,
                "intervals_seconds": _LayerSchedule.create(subscription, self._settings).intervals,
            }
        )
        logger.info(
            "websocket subscribed",
            extra={
                "connection_id": self.connection_id,
                "radius_km": subscription.radius_km,
                "time_mode": subscription.time_mode,
            },
        )
        self._publisher = asyncio.create_task(
            self._publish_loop(subscription), name=f"ws-publish-{self.connection_id}"
        )

    # outbound updates

    async def _publish_loop(self, subscription: SubscribeMessage) -> None:
        """recompute and send due layers until cancelled"""
        schedule = _LayerSchedule.create(subscription, self._settings)
        if not schedule.intervals:
            # not an error: switching every layer off is a deliberate act, and the dials already show themselves powered down
            # idle until the client subscribes again, which it does as soon as a layer comes back on
            logger.debug(
                "no layers enabled; publisher idle",
                extra={"connection_id": self.connection_id},
            )
            return

        failures = 0
        try:
            while True:
                now = time.monotonic()
                due = schedule.due_layers(now)
                if due:
                    try:
                        await self._send_update(subscription, due)
                        failures = 0
                    except (WebSocketDisconnect, RuntimeError):
                        return
                    except OverpassError as exc:
                        failures += 1
                        await self._send_error(exc.code, exc.message, details=exc.details)
                    except Exception:
                        failures += 1
                        logger.exception(
                            "scene update failed",
                            extra={"connection_id": self.connection_id},
                        )
                        await self._send_error(
                            "internal_error", "A scene update could not be produced."
                        )
                    schedule.mark_sent(due, time.monotonic())

                    if failures >= _MAX_CONSECUTIVE_FAILURES:
                        await self._send_error(
                            "too_many_failures",
                            "Too many consecutive update failures; stopping updates.",
                        )
                        return

                await asyncio.sleep(schedule.seconds_until_next(time.monotonic()))
        except asyncio.CancelledError:
            raise

    async def _send_update(self, subscription: SubscribeMessage, layers: set[str]) -> None:
        result = await self._scenes.build(subscription.tick_request(), layers=layers)
        scene = to_scene_response(result)
        payload = scene.model_dump(mode="json")

        message: dict[str, Any] = {
            "type": "scene_update",
            "connection_id": self.connection_id,
            "layers": sorted(layers),
            "observation": payload["observation"],
            "sources": payload["sources"],
            "warnings": payload["warnings"],
            "partial": payload["partial"],
            "generated_at": payload["generated_at"],
        }
        # only the refreshed layers travel; the client keeps the rest
        for layer in (_AIRCRAFT, _SATELLITES):
            if layer in layers:
                message[layer] = payload[layer]
        if _SATELLITES in layers:
            message["sky"] = payload["sky"]
        await self._send(message)

    # plumbing

    async def _stop_publisher(self) -> None:
        """cancel the publisher and wait for it, so no task outlives the socket"""
        task = self._publisher
        self._publisher = None
        if task is None or task.done():
            return
        task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await task

    async def _send(self, message: dict[str, Any]) -> None:
        try:
            await self._websocket.send_json(message)
        except (WebSocketDisconnect, RuntimeError):
            raise
        except Exception as exc:
            logger.warning(
                "websocket send failed",
                extra={
                    "connection_id": self.connection_id,
                    "reason": type(exc).__name__,
                },
            )
            raise

    async def _send_error(
        self, code: str, message: str, details: dict[str, Any] | None = None
    ) -> None:
        payload: dict[str, Any] = {"code": code, "message": message}
        if details:
            payload["details"] = details
        await self._send({"type": "error", "error": payload})


def _observation_only_result(area: AreaGeometry, subscription: SubscribeMessage) -> SceneResult:
    """an empty :class:`SceneResult` used only to render the observation block"""
    return SceneResult(
        area=area,
        observation_time=subscription.tick_request().resolved_time(),
        generated_at=utc_now(),
    )


@router.websocket("/ws/live")
async def live_scene(websocket: WebSocket) -> None:
    """stream scene updates for a subscribed location"""
    container = get_container_ws(websocket)
    await LiveConnection(websocket, container).run()


__all__ = ["LiveConnection", "router"]
