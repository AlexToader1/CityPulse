"""Heatmap endpoint combining CityPulse local signals."""

from __future__ import annotations

from datetime import date
import json
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Query

from ml.agent.decide import get_local_context, get_weather

router = APIRouter()
ROOT = Path(__file__).resolve().parents[2]


def _load_json(relative_path: str) -> Any:
    with (ROOT / relative_path).open(encoding="utf-8") as file:
        return json.load(file)


def _city_score(city: dict[str, Any], days: int) -> dict[str, Any]:
    context = get_local_context(city["name"], days)
    weather_status = "live from Open-Meteo"
    try:
        weather = get_weather(city["name"], min(days, 16))
    except (RuntimeError, ValueError) as error:
        weather = {"forecast": []}
        weather_status = f"weather unavailable: {error}"
    active_events = context["events"]
    active_holidays = context["holidays"]
    rain_probability = max(
        (day["precipitation_probability_percent"] for day in weather["forecast"]),
        default=0,
    )
    event_score = min(
        35.0,
        sum(float(event["relevance"]) for event in active_events) * 25,
    )
    holiday_score = min(20.0, len(active_holidays) * 10.0)
    weather_score = 15.0 if rain_probability >= 50 else 7.0
    score = round(min(100.0, 35.0 + event_score + holiday_score + weather_score), 1)
    return {
        "id": city["id"],
        "name": city["name"],
        "county": city["county"],
        "latitude": city["latitude"],
        "longitude": city["longitude"],
        "score": score,
        "signals": {
            "events": active_events,
            "holidays": active_holidays,
            "namedays": context["namedays"],
            "rain_probability_percent": rain_probability,
        },
        "data_status": f"curated demo events; {weather_status}",
    }


@router.get("/heatmap")
def heatmap(days: int = Query(default=7, ge=1, le=16)) -> dict[str, Any]:
    cities = _load_json("data/ro_cities.json")
    return {
        "generated_at": date.today().isoformat(),
        "days": days,
        "cities": [_city_score(city, days) for city in cities],
    }