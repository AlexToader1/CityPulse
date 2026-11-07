"""CityPulse FastAPI application.

Run from the repository root:  uvicorn backend.main:app --reload --port 8000
"""

from __future__ import annotations

import logging
import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from backend import config
from backend.routes.ad import router as ad_router
from backend.routes.brand import router as brand_router
from backend.routes.cities import router as cities_router
from backend.routes.city import router as city_router
from backend.routes.compliance import router as compliance_router
from backend.routes.export import router as export_router
from backend.routes.generate import router as generate_router
from backend.routes.heatmap import router as heatmap_router
from backend.routes.status import router as status_router
from backend.routes.studio import router as studio_router
from backend.routes.tiktok import router as tiktok_router
from backend.routes.video import router as video_router

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")

app = FastAPI(title="CityPulse API", version="0.2.0")

origins = ["http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:3000", "http://127.0.0.1:3000"]
origins += [o for o in os.getenv("CORS_ORIGINS", "").split(",") if o]
if config.FRONTEND_URL not in origins:
    origins.append(config.FRONTEND_URL)
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

for router in (
    cities_router,      # POST /api/cities       dashboard heatmap
    brand_router,       # POST /api/brand        upload -> brand DNA
    ad_router,          # POST /api/generate-ad  per-city ad copy
    compliance_router,  # POST /api/compliance
    export_router,      # POST /api/export
    heatmap_router,     # GET  /api/heatmap      (legacy shape)
    city_router,        # GET  /api/city/{id}    (legacy shape)
    generate_router,    # POST /api/generate     Gemini insight agent
    status_router,      # GET  /api/status, /api/events/{city_id}
):
    app.include_router(router, prefix="/api")

# TikTok feature: these routers already carry their own /api/... prefix.
app.include_router(video_router)   # /api/video/jobs ...  link/images -> TikTok videos
app.include_router(tiktok_router)  # /api/tiktok/login, /callback, /status
app.include_router(studio_router)  # /studio  simple page: photos -> video -> post

# Generated videos and frames, served from STORAGE_DIR
app.mount("/media", StaticFiles(directory=config.STORAGE_DIR), name="media")


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
