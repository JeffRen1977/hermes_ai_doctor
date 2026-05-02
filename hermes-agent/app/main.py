from __future__ import annotations

import logging

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from app.api.v1_analyze import router as v1_analyze_router
from app.api.v1_chat import router as v1_router
from app.config import get_settings

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Hermes Agent", version="0.1.0")
app.include_router(v1_router)
app.include_router(v1_analyze_router)


@app.middleware("http")
async def internal_token_guard(request: Request, call_next):
    path = request.url.path
    if not path.startswith("/v1/"):
        return await call_next(request)
    if path == "/v1/health":
        return await call_next(request)

    settings = get_settings()
    token = request.headers.get("x-internal-token") or request.headers.get("X-Internal-Token")
    if not token or token != settings.internal_token:
        return JSONResponse(status_code=401, content={"detail": "unauthorized"})
    return await call_next(request)


@app.get("/")
async def root():
    return {"service": "hermes-agent", "docs": "/docs"}
