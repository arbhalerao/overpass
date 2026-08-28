from __future__ import annotations

from typing import Any

from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.core.logging import get_logger

logger = get_logger(__name__)


class OverpassError(Exception):
    status_code: int = status.HTTP_500_INTERNAL_SERVER_ERROR
    code: str = "internal_error"
    default_message: str = "An unexpected error occurred."

    def __init__(
        self,
        message: str | None = None,
        *,
        details: dict[str, Any] | None = None,
    ) -> None:
        self.message = message or self.default_message
        self.details = details or {}
        super().__init__(self.message)

    def to_payload(self) -> dict[str, Any]:
        payload: dict[str, Any] = {"code": self.code, "message": self.message}
        if self.details:
            payload["details"] = self.details
        return {"error": payload}


# configuration


class ConfigurationError(OverpassError):
    status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    code = "configuration_error"
    default_message = "The server is not configured for this operation."


# geometry


class InvalidGeographicAreaError(OverpassError):
    status_code = 422
    code = "invalid_geographic_area"
    default_message = "The requested geographic area is invalid."


# providers


def _json_error(
    status_code: int,
    code: str,
    message: str,
    details: dict[str, Any] | None = None,
    headers: dict[str, str] | None = None,
) -> JSONResponse:
    payload: dict[str, Any] = {"code": code, "message": message}
    if details:
        payload["details"] = details
    return JSONResponse(status_code=status_code, content={"error": payload}, headers=headers)


async def overpass_error_handler(request: Request, exc: Exception) -> JSONResponse:
    assert isinstance(exc, OverpassError)
    log = logger.warning if exc.status_code < 500 else logger.error
    log(
        "request failed: %s",
        exc.code,
        extra={
            "path": request.url.path,
            "error_code": exc.code,
            "status_code": exc.status_code,
            "details": exc.details,
        },
        exc_info=exc.status_code >= 500,
    )
    headers: dict[str, str] | None = None
    if isinstance(exc, AircraftProviderRateLimitError) and exc.retry_after_seconds:
        headers = {"Retry-After": str(int(exc.retry_after_seconds))}
    return _json_error(exc.status_code, exc.code, exc.message, exc.details, headers)


async def validation_error_handler(request: Request, exc: Exception) -> JSONResponse:
    assert isinstance(exc, RequestValidationError)
    logger.info(
        "request validation failed",
        extra={"path": request.url.path, "error_count": len(exc.errors())},
    )
    fields = [
        {
            "field": ".".join(str(part) for part in error.get("loc", ())),
            "message": error.get("msg", "invalid value"),
            "type": error.get("type", "value_error"),
        }
        for error in exc.errors()
    ]
    return _json_error(
        422,
        "validation_error",
        "The request payload failed validation.",
        {"fields": fields},
    )


async def http_error_handler(request: Request, exc: Exception) -> JSONResponse:
    assert isinstance(exc, StarletteHTTPException)
    return _json_error(
        exc.status_code,
        "http_error",
        str(exc.detail) if exc.detail else "Request failed.",
    )


async def unhandled_error_handler(request: Request, exc: Exception) -> JSONResponse:
    logger.exception(
        "unhandled exception",
        extra={"path": request.url.path, "exception_type": type(exc).__name__},
    )
    return _json_error(
        status.HTTP_500_INTERNAL_SERVER_ERROR,
        "internal_error",
        "An unexpected internal error occurred.",
    )


def register_exception_handlers(app: FastAPI) -> None:
    app.add_exception_handler(OverpassError, overpass_error_handler)
    app.add_exception_handler(RequestValidationError, validation_error_handler)
    app.add_exception_handler(StarletteHTTPException, http_error_handler)
    app.add_exception_handler(Exception, unhandled_error_handler)


__all__ = [
    "ConfigurationError",
    "InvalidGeographicAreaError",
    "OverpassError",
    "register_exception_handlers",
]
