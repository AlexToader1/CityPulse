"""CityPulse FastAPI application."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.routes.city import router as city_router
from backend.routes.generate import router as generate_router
from backend.routes.heatmap import router as heatmap_router

app = FastAPI(title="CityPulse API", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(heatmap_router, prefix="/api")
app.include_router(city_router, prefix="/api")
app.include_router(generate_router, prefix="/api")


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}