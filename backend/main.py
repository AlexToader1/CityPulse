"""FastAPI entry point. Run from the repo root:

    .venv/bin/uvicorn backend.main:app --reload

Each feature registers its router below.
"""
from __future__ import annotations

import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from backend import config
from backend.routes import tiktok as tiktok_routes
from backend.routes import video as video_routes

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")

app = FastAPI(title="AppPisicile API", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[config.FRONTEND_URL, "http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Feature routers (teammates: add yours here) ---
app.include_router(video_routes.router)
app.include_router(tiktok_routes.router)

# Generated media (videos, frames) served from STORAGE_DIR
app.mount("/media", StaticFiles(directory=config.STORAGE_DIR), name="media")


@app.get("/api/health")
def health():
    return {"ok": True}
