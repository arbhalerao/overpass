from __future__ import annotations

import json
import logging
import sys
from datetime import UTC, datetime
from typing import Any, Final

_RESERVED: Final[frozenset[str]] = frozenset(
    {
        "args",
        "asctime",
        "created",
        "exc_info",
        "exc_text",
        "filename",
        "funcName",
        "levelname",
        "levelno",
        "lineno",
        "module",
        "msecs",
        "message",
        "msg",
        "name",
        "pathname",
        "process",
        "processName",
        "relativeCreated",
        "stack_info",
        "taskName",
        "thread",
        "threadName",
    }
)

_REDACTED_KEYS: Final[frozenset[str]] = frozenset(
    {
        "password",
        "secret",
        "client_secret",
        "token",
        "access_token",
        "authorization",
        "api_key",
    }
)

_REDACTED_VALUE: Final[str] = "***redacted***"


def _extra_fields(record: logging.LogRecord) -> dict[str, Any]:
    fields: dict[str, Any] = {}
    for key, value in record.__dict__.items():
        if key in _RESERVED or key.startswith("_"):
            continue
        fields[key] = _REDACTED_VALUE if key.lower() in _REDACTED_KEYS else value
    return fields


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, Any] = {
            "timestamp": datetime.fromtimestamp(record.created, tz=UTC).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }
        payload.update(_extra_fields(record))
        if record.exc_info:
            payload["exception"] = self.formatException(record.exc_info)
        if record.stack_info:
            payload["stack"] = self.formatStack(record.stack_info)
        return json.dumps(payload, default=str, separators=(",", ":"))


class ConsoleFormatter(logging.Formatter):
    def __init__(self) -> None:
        super().__init__(fmt="%(asctime)s %(levelname)-8s %(name)s | %(message)s")

    def formatTime(self, record: logging.LogRecord, datefmt: str | None = None) -> str:
        return datetime.fromtimestamp(record.created, tz=UTC).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3]

    def format(self, record: logging.LogRecord) -> str:
        base = super().format(record)
        fields = _extra_fields(record)
        if fields:
            rendered = " ".join(f"{key}={value!r}" for key, value in sorted(fields.items()))
            base = f"{base} [{rendered}]"
        return base


def configure_logging(level: str = "INFO", fmt: str = "console") -> None:
    formatter: logging.Formatter = JsonFormatter() if fmt == "json" else ConsoleFormatter()

    handler = logging.StreamHandler(stream=sys.stdout)
    handler.setFormatter(formatter)

    root = logging.getLogger()
    for existing in list(root.handlers):
        root.removeHandler(existing)
    root.addHandler(handler)
    root.setLevel(level.upper())

    # Uvicorn installs its own colourful handlers; route them through ours so that every line in the process shares one format
    for name in ("uvicorn", "uvicorn.error", "uvicorn.access"):
        uvicorn_logger = logging.getLogger(name)
        uvicorn_logger.handlers.clear()
        uvicorn_logger.propagate = True

    # these are chatty at DEBUG and say nothing useful about our own behaviour
    logging.getLogger("httpx").setLevel("WARNING")
    logging.getLogger("httpcore").setLevel("WARNING")


def get_logger(name: str) -> logging.Logger:
    """return a module logger. thin wrapper kept for a single import path."""
    return logging.getLogger(name)


__all__ = ["ConsoleFormatter", "JsonFormatter", "configure_logging", "get_logger"]
