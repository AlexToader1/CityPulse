"""Event signals for Romanian cities.

Sources, merged and de-duplicated:
  * Ticketmaster Discovery API (live)  - needs TICKETMASTER_API_KEY
  * data/ro_events.json (curated demo records) - always available as a fallback

Every event dict carries  source: "live" | "curated".
"""

from __future__ import annotations

import json
import os
import threading
import time
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from ml.signals.open_meteo import _get_json

ROOT = Path(__file__).resolve().parents[2]
TM_URL = "https://app.ticketmaster.com/discovery/v2/events.json"
RADIUS_KM = 30

SEGMENT_RELEVANCE = {
    "music": 0.8,
    "sports": 0.7,
    "arts & theatre": 0.5,
    "film": 0.4,
    "miscellaneous": 0.4,
}

_cache: dict[tuple[str, int, str], tuple[float, dict[str, Any]]] = {}
_lock = threading.Lock()


# ------------------------------------------------------------ helpers
_B32 = "0123456789bcdefghjkmnpqrstuvwxyz"


def _geohash(lat: float, lon: float, precision: int = 9) -> str:
    lat_i, lon_i = [-90.0, 90.0], [-180.0, 180.0]
    bits, bit, ch, even, out = [16, 8, 4, 2, 1], 0, 0, True, []
    while len(out) < precision:
        rng, val = (lon_i, lon) if even else (lat_i, lat)
        mid = (rng[0] + rng[1]) / 2
        if val > mid:
            ch |= bits[bit]
            rng[0] = mid
        else:
            rng[1] = mid
        even = not even
        if bit < 4:
            bit += 1
        else:
            out.append(_B32[ch])
            bit, ch = 0, 0
    return "".join(out)


def _city_record(city: str) -> dict[str, Any] | None:
    with (ROOT / "data" / "ro_cities.json").open(encoding="utf-8") as f:
        cities = json.load(f)
    return next((c for c in cities if c["name"].casefold() == city.casefold()), None)


def _load_demo_events() -> list[dict[str, Any]]:
    path = ROOT / "data" / "ro_events.json"
    if not path.exists():
        return []
    with path.open(encoding="utf-8") as f:
        return json.load(f).get("events", [])


# ------------------------------------------------------------ Ticketmaster
def _relevance(name: str, segment: str) -> float:
    if "festival" in name.casefold():
        return 1.0
    return SEGMENT_RELEVANCE.get(segment.casefold(), 0.4)


def _parse_tm_event(raw: dict[str, Any], city_name: str) -> dict[str, Any] | None:
    start = (raw.get("dates", {}).get("start", {}) or {}).get("localDate")
    if not start:
        return None
    end = (raw.get("dates", {}).get("end", {}) or {}).get("localDate") or start
    classifications = raw.get("classifications") or [{}]
    segment = ((classifications[0].get("segment") or {}).get("name")) or "Miscellaneous"
    name = str(raw.get("name", "Event")).strip()
    venues = (raw.get("_embedded") or {}).get("venues") or [{}]
    return {
        "id": f"tm-{raw.get('id')}",
        "name": name,
        "city": city_name,
        "start_date": start,
        "end_date": end,
        "category": segment.lower(),
        "venue": venues[0].get("name"),
        "source_url": raw.get("url"),
        "relevance": _relevance(name, segment),
        "source": "live",
    }


def _ticketmaster_events(city: dict[str, Any], days: int, api_key: str) -> list[dict[str, Any]]:
    now = datetime.now(timezone.utc).replace(microsecond=0)
    end = now + timedelta(days=days)
    base = {
        "apikey": api_key,
        "countryCode": "RO",
        "startDateTime": now.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "endDateTime": end.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "size": 30,
        "sort": "date,asc",
    }
    attempts = [
        {**base, "geoPoint": _geohash(city["latitude"], city["longitude"]), "radius": RADIUS_KM, "unit": "km"},
        {**base, "city": city["name"]},  # fallback if the geo query returns nothing
    ]
    for params in attempts:
        payload = _get_json(TM_URL, params)
        raw_events = (payload.get("_embedded") or {}).get("events") or []
        parsed = [e for e in (_parse_tm_event(r, city["name"]) for r in raw_events) if e]
        if parsed:
            return parsed
    return []


# ------------------------------------------------------------ public API
def get_real_events(city: str, days: int = 7) -> dict[str, Any]:
    key = (city.casefold(), days, date.today().isoformat())
    with _lock:
        hit = _cache.get(key)
        if hit and time.time() < hit[0]:
            return hit[1]

    record = _city_record(city)
    today = date.today().isoformat()
    last = (date.today() + timedelta(days=days - 1)).isoformat()

    live: list[dict[str, Any]] = []
    status_parts: list[str] = []
    api_key = os.getenv("TICKETMASTER_API_KEY")
    ttl = 3600
    if not api_key:
        status_parts.append("Ticketmaster off (no TICKETMASTER_API_KEY)")
    elif record is None:
        status_parts.append(f"unknown city {city!r}")
    else:
        try:
            live = _ticketmaster_events(record, days, api_key)
            status_parts.append(f"Ticketmaster: {len(live)} events")
        except Exception as error:  # network, quota, bad key ... never break the heatmap
            status_parts.append(f"Ticketmaster failed: {error}")
            ttl = 300

    curated = [
        {**e, "source": "curated"}
        for e in _load_demo_events()
        if e.get("city", "").casefold() == city.casefold()
        and e.get("start_date", "") <= last
        and e.get("end_date", "") >= today
    ]
    status_parts.append(f"curated: {len(curated)} events")

    seen: set[tuple[str, str]] = set()
    merged: list[dict[str, Any]] = []
    for event in live + curated:  # live first, so it wins duplicates
        ident = (event["name"].casefold(), event["start_date"])
        if ident not in seen:
            seen.add(ident)
            merged.append(event)
    merged.sort(key=lambda e: (-float(e.get("relevance", 0)), e["start_date"]))

    result = {
        "city": city,
        "events": merged,
        "data_source": "ticketmaster+curated" if live else "curated",
        "data_status": "; ".join(status_parts),
        "recorded_at": datetime.now().isoformat(),
    }
    with _lock:
        _cache[key] = (time.time() + ttl, result)
    return result


def get_events_signals(city: str, days: int = 7) -> dict[str, Any]:
    result = get_real_events(city, days=days)
    return {
        "city": result["city"],
        "events": result["events"],
        "data_status": result["data_status"],
        "data_source": result["data_source"],
    }
