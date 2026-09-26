"""FastAPI application factory for the versioned production API."""

from __future__ import annotations

import asyncio
import logging
import os
import re
import uuid
from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, Request
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException
from starlette.middleware.trustedhost import TrustedHostMiddleware

from api.routes import auth, contexts, materials, questions, sessions, stt
from cache import get_cache
from db.connection import Database, close_pool, get_db

load_dotenv()

logger = logging.getLogger(__name__)
API_VERSION = "1"
_REQUEST_ID_RE = re.compile(r"^[A-Za-z0-9._-]{1,128}$")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Start the scoring worker, then release shared clients on shutdown."""
    from services import session_service

    stop_event = asyncio.Event()
    worker = asyncio.create_task(session_service.score_worker_loop(stop_event=stop_event))
    try:
        yield
    finally:
        stop_event.set()
        worker.cancel()
        try:
            await worker
        except asyncio.CancelledError:
            pass
        await close_pool()
        from cache.dragonfly import close_cache

        close_cache()


def _cors_origins() -> list[str]:
    return [origin.strip() for origin in os.getenv("CORS_ORIGINS", "").split(",") if origin.strip()]


def _request_id(request: Request) -> str:
    supplied = request.headers.get("X-Request-ID", "")
    return supplied if _REQUEST_ID_RE.fullmatch(supplied) else uuid.uuid4().hex


def _error_response(request: Request, status_code: int, detail: object) -> JSONResponse:
    return JSONResponse(
        status_code=status_code,
        content={"detail": detail, "request_id": getattr(request.state, "request_id", None)},
    )


def create_app() -> FastAPI:
    """Build the API application.

    ``/v1`` is the canonical public API. The previous unversioned routes remain
    available as hidden compatibility aliases so existing clients can migrate
    without an abrupt outage.
    """
    app = FastAPI(
        title="Adaptive Oral Learning Platform",
        version="1.0.0",
        lifespan=lifespan,
        openapi_tags=[
            {"name": "Upload", "description": "Step 1 — Add study material"},
            {"name": "Goal", "description": "Step 2 — Define goal → context"},
            {"name": "Preparing", "description": "Step 3 — Generate practice set"},
            {"name": "Practice", "description": "Step 4 — Answer one at a time"},
            {"name": "Results", "description": "Step 5 — Readiness + weak areas"},
            {"name": "Retest", "description": "Step 6 — One-tap weak-area retest"},
            {"name": "Health", "description": "Liveness and dependency readiness"},
        ],
    )

    origins = _cors_origins()
    if origins:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=origins,
            allow_credentials=True,
            allow_methods=["GET", "POST", "OPTIONS"],
            allow_headers=["Content-Type", "Authorization", "X-Request-ID"],
            expose_headers=["X-Request-ID", "X-API-Version"],
        )

    trusted_hosts = [
        host.strip() for host in os.getenv("TRUSTED_HOSTS", "").split(",") if host.strip()
    ]
    if trusted_hosts:
        app.add_middleware(TrustedHostMiddleware, allowed_hosts=trusted_hosts)

    @app.middleware("http")
    async def request_context(request: Request, call_next):
        request.state.request_id = _request_id(request)
        response = await call_next(request)
        response.headers["X-Request-ID"] = request.state.request_id
        response.headers["X-API-Version"] = API_VERSION
        if request.url.path.startswith(("/materials", "/contexts", "/sessions")):
            response.headers["Deprecation"] = "true"
            response.headers["Link"] = '</v1>; rel="successor-version"'
        return response

    @app.exception_handler(StarletteHTTPException)
    async def http_exception_handler(request: Request, exc: StarletteHTTPException):
        return _error_response(request, exc.status_code, exc.detail)

    @app.exception_handler(RequestValidationError)
    async def validation_exception_handler(request: Request, exc: RequestValidationError):
        return _error_response(request, 422, jsonable_encoder(exc.errors()))

    @app.exception_handler(Exception)
    async def unhandled_exception_handler(request: Request, exc: Exception):
        logger.exception("Unhandled API error", extra={"request_id": request.state.request_id})
        return _error_response(request, 500, "Internal server error")

    routers = (
        materials.router,
        contexts.router,
        questions.router,
        sessions.router,
        stt.router,
        auth.router,
    )
    for router in routers:
        app.include_router(router, prefix="/v1")
    # Keep old clients working during migration, but only document /v1.
    for router in routers:
        app.include_router(router, include_in_schema=False)

    @app.get("/", include_in_schema=False)
    async def root():
        return {
            "service": "adaptive-oral-learning-platform",
            "api_version": API_VERSION,
            "docs": "/docs",
        }

    @app.get("/v1", include_in_schema=False)
    async def version_root():
        return {"api_version": API_VERSION, "status": "ok"}

    @app.get("/health", tags=["Health"], summary="Liveness check")
    @app.get("/v1/health", tags=["Health"], summary="Liveness check")
    async def health():
        return {"status": "ok", "api_version": API_VERSION}

    @app.get("/health/live", tags=["Health"], summary="Liveness probe")
    async def liveness():
        return {"status": "ok", "api_version": API_VERSION}

    @app.get("/health/ready", tags=["Health"], summary="Dependency readiness probe")
    async def readiness(
        db: Database = Depends(get_db),
        cache=Depends(get_cache),
    ):
        checks: dict[str, str] = {}
        try:
            await db.ping()
            checks["database"] = "ok"
        except Exception:
            checks["database"] = "unavailable"
        try:
            cache.ping()
            checks["cache"] = "ok"
        except Exception:
            checks["cache"] = "unavailable"
        ready = all(value == "ok" for value in checks.values())
        return JSONResponse(
            status_code=200 if ready else 503,
            content={"status": "ready" if ready else "not_ready", "checks": checks},
        )

    return app


app = create_app()
