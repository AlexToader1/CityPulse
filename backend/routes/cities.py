"""POST /api/cities -> list[CityResult] for the dashboard heatmap."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from backend.services.signals import build_city_results

router = APIRouter()


class FetchCitiesRequest(BaseModel):
    cities: list[str]
    category: str = "Cafe"


@router.post("/cities")
def fetch_cities(request: FetchCitiesRequest) -> list[dict[str, Any]]:
    results = build_city_results(request.cities, request.category)
    if not results:
        raise HTTPException(status_code=404, detail="No matching cities found")
    return results
