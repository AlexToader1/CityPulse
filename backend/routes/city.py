"""City detail endpoint."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException, Query

from backend.routes.heatmap import _city_score, _load_json

router = APIRouter()


@router.get("/city/{city_id}")
def city_detail(
    city_id: str,
    days: int = Query(default=7, ge=1, le=16),
) -> dict[str, Any]:
    cities = _load_json("data/ro_cities.json")
    city = next((item for item in cities if item["id"] == city_id), None)
    if city is None:
        raise HTTPException(status_code=404, detail=f"Unknown city: {city_id}")
    return _city_score(city, days)