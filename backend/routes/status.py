"""Debug helpers: which integrations are live, and what events a city has."""

from __future__ import annotations

import os
from typing import Any

from fastapi import APIRouter, HTTPException, Query

from backend.services.compliance_rules import rules_info
from backend.services.signals import load_cities
from ml.signals.events import get_real_events

router = APIRouter()


@router.get("/status")
def status() -> dict[str, Any]:
    return {
        "events_ticketmaster": bool(os.getenv("TICKETMASTER_API_KEY")),
        "trends_live": os.getenv("CITYPULSE_LIVE_TRENDS", "1") != "0",
        "gemini": bool(os.getenv("GEMINI_API_KEY")),
        "weather": "Open-Meteo (no key needed)",
        "ad_rules": rules_info(),
    }


@router.get("/events/{city_id}")
def city_events(city_id: str, days: int = Query(default=7, ge=1, le=30)) -> dict[str, Any]:
    city = next((c for c in load_cities() if c["id"] == city_id), None)
    if city is None:
        raise HTTPException(status_code=404, detail=f"Unknown city: {city_id}")
    return get_real_events(city["name"], days)
