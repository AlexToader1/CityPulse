"""Turn raw signals (weather, events, holidays, search trends) into the
`CityResult` objects the frontend renders on the heatmap.

Shape contract: frontend/src/lib/citypulse/types.ts -> CityResult
"""

from __future__ import annotations

import hashlib
import json
import os
import threading
import time
import unicodedata
from concurrent.futures import ThreadPoolExecutor
from datetime import date, timedelta
from pathlib import Path
from typing import Any

from backend.services.compliance_rules import check_copy
from ml.agent.decide import get_local_context
from ml.signals.events import get_real_events
from ml.signals.open_meteo import WEATHER_DESCRIPTIONS, _get_json

ROOT = Path(__file__).resolve().parents[2]

THRESHOLDS = {"generate": 60, "light_touch": 30}  # keep in sync with frontend config.ts
ACTION_COST = {
    "GENERATE": (0.14, 45),
    "LIGHT_TOUCH": (0.03, 20),
    "SKIP": (0.0, 0),
}
WINDOW_DAYS = 3          # weather
HOLIDAY_WINDOW_DAYS = 5  # holidays: a little lead time for greetings
EVENT_WINDOW_DAYS = 10   # events: ads need lead time, and next weekend is always in range

CATEGORY_KEYWORDS = {
    "Cafe": ["cafea", "cafenea", "brunch"],
    "Pharmacy": ["farmacie", "vitamine", "raceala"],
    "Florist": ["flori", "buchet", "florarie"],
    "Gym": ["sala fitness", "antrenament", "fitness"],
    "Supplements": ["suplimente", "proteine", "vitamine"],
}

# ---------------------------------------------------------------- caches
_cache: dict[str, tuple[float, Any]] = {}
_cache_lock = threading.Lock()
_key_locks: dict[str, threading.Lock] = {}


def _cached(key: str, ttl: float, producer, fail_ttl: float = 300):
    """Return producer() cached for ttl seconds. Errors are swallowed, returned as None
    and cached for fail_ttl so a down API is not hammered. One producer per key at a time."""

    def fresh():
        hit = _cache.get(key)
        if not hit:
            return None
        ts, value = hit
        return hit if time.time() - ts < (ttl if value is not None else fail_ttl) else None

    with _cache_lock:
        lock = _key_locks.setdefault(key, threading.Lock())
    with lock:
        with _cache_lock:
            hit = fresh()
        if hit:
            return hit[1]
        try:
            value = producer()
        except Exception:
            value = None
        with _cache_lock:
            _cache[key] = (time.time(), value)
        return value


def load_cities() -> list[dict[str, Any]]:
    with (ROOT / "data" / "ro_cities.json").open(encoding="utf-8") as f:
        return json.load(f)


# ---------------------------------------------------------------- weather
def _fetch_weather(city: dict[str, Any]) -> list[dict[str, Any]]:
    data = _get_json(
        "https://api.open-meteo.com/v1/forecast",
        {
            "latitude": city["latitude"],
            "longitude": city["longitude"],
            "daily": "weather_code,temperature_2m_max,temperature_2m_min,"
            "precipitation_probability_max,precipitation_sum,wind_speed_10m_max",
            "forecast_days": WINDOW_DAYS,
            "timezone": "auto",
        },
    )
    daily = data["daily"]
    out = []
    for i, day in enumerate(daily["time"]):
        code = int(daily["weather_code"][i] or 0)
        out.append(
            {
                "day": day,
                "tmax": float(daily["temperature_2m_max"][i]),
                "tmin": float(daily["temperature_2m_min"][i]),
                "rain_prob": int(daily["precipitation_probability_max"][i] or 0),
                "rain_mm": float(daily["precipitation_sum"][i] or 0),
                "wind": float(daily["wind_speed_10m_max"][i] or 0),
                "code": code,
                "desc": WEATHER_DESCRIPTIONS.get(code, "Unknown conditions"),
            }
        )
    return out


def get_weather(city: dict[str, Any]) -> list[dict[str, Any]] | None:
    return _cached(f"wx:{city['id']}", 900, lambda: _fetch_weather(city))


def weather_signal(days: list[dict[str, Any]] | None) -> tuple[dict[str, Any], str]:
    """-> (signal, motif hint). motif hint is 'storm' | 'heat' | 'plain'."""
    if not days:
        return (
            {"type": "weather", "label": "Weather unavailable", "source": "simulated", "strength": 0},
            "plain",
        )
    worst_rain = max(days, key=lambda d: (d["rain_prob"], d["rain_mm"]))
    hottest = max(days, key=lambda d: d["tmax"])
    coldest = min(days, key=lambda d: d["tmin"])
    stormy = worst_rain["code"] >= 95 or worst_rain["rain_mm"] >= 10 or worst_rain["wind"] >= 60
    if stormy or worst_rain["rain_prob"] >= 70:
        strength = 45 if stormy else 32
        label = f"{worst_rain['desc']}, {worst_rain['rain_prob']}% rain"
        return {"type": "weather", "label": label, "source": "live", "strength": strength}, "storm"
    if hottest["tmax"] >= 30:
        strength = min(45, 25 + (hottest["tmax"] - 30) * 4)
        return (
            {"type": "weather", "label": f"Heat, {round(hottest['tmax'])}°C", "source": "live", "strength": round(strength)},
            "heat",
        )
    if coldest["tmin"] <= 0:
        return (
            {"type": "weather", "label": f"Freezing, {round(coldest['tmin'])}°C", "source": "live", "strength": 22},
            "plain",
        )
    today = days[0]
    return (
        {"type": "weather", "label": f"{today['desc']}, {round(today['tmax'])}°C", "source": "live", "strength": 15},
        "plain",
    )


# ---------------------------------------------------------------- trends
def _norm(text: str) -> str:
    folded = "".join(c for c in unicodedata.normalize("NFKD", text) if not unicodedata.combining(c))
    return "".join(c for c in folded.casefold() if c.isalnum())


def _simulated_trend(city: str, category: str) -> dict[str, Any]:
    """Deterministic stand-in so the demo is stable and offline-friendly."""
    week = date.today().isocalendar()
    digest = hashlib.sha256(f"{city}|{category}|{week.year}-{week.week}".encode()).digest()
    value = digest[0] % 100  # 0..99
    strength = round(6 + value * 0.22)  # 6..28
    label = f"{CATEGORY_KEYWORDS[category][0].capitalize()} searches " + (
        "up" if value >= 60 else "steady" if value >= 30 else "cooling"
    )
    return {"type": "trend", "label": label, "source": "simulated", "strength": strength}


def _fetch_regional_trends(category: str) -> dict[str, Any]:
    """ONE Google Trends round-trip per category: interest per Romanian county + national momentum."""
    from pytrends.request import TrendReq

    keywords = CATEGORY_KEYWORDS[category][:2]
    trends = TrendReq(hl="ro-RO", tz=120, retries=2, backoff_factor=0.3, timeout=(5, 10))
    trends.build_payload(kw_list=keywords, timeframe="today 3-m", geo="RO")
    over_time = trends.interest_over_time()
    by_region = trends.interest_by_region(resolution="REGION", inc_low_vol=True)
    if over_time.empty or by_region.empty:
        raise RuntimeError("Google Trends returned no data")
    series = over_time[keywords].mean(axis=1).tolist()
    recent, older = series[-7:], series[-28:-7] or series[-7:]
    momentum = (sum(recent) / len(recent) - sum(older) / len(older)) / max(sum(older) / len(older), 1)
    regions = {_norm(str(name)): float(row[keywords].mean()) for name, row in by_region.iterrows()}
    return {"regions": regions, "momentum": momentum, "keyword": keywords[0]}


def _with_timeout(fn, seconds: float):
    pool = ThreadPoolExecutor(max_workers=1)
    try:
        return pool.submit(fn).result(timeout=seconds)
    finally:
        pool.shutdown(wait=False)


def _live_trend(city: dict[str, Any], category: str) -> dict[str, Any] | None:
    if os.getenv("CITYPULSE_LIVE_TRENDS", "1") == "0":
        return None
    data = _cached(
        f"trend:{category}",
        6 * 3600,
        lambda: _with_timeout(lambda: _fetch_regional_trends(category), 20),
        fail_ttl=1800,  # Google rate-limits aggressively; back off for 30 min
    )
    if not data:
        return None
    county, name = _norm(city["county"]), _norm(city["name"])
    aliases = {"bucharest": "bucuresti"}
    wanted = {county, name, aliases.get(county, county), aliases.get(name, name)}
    interest = next((v for k, v in data["regions"].items() if any(w in k for w in wanted)), None)
    if interest is None:
        return None
    momentum = data["momentum"]
    strength = 5 + interest * 0.2 + max(-8.0, min(8.0, momentum * 20))
    direction = "up" if momentum > 0.1 else "cooling" if momentum < -0.1 else "steady"
    label = f"{data['keyword'].capitalize()} searches {direction}"
    if interest >= 90:
        label += " (top region)"
    return {"type": "trend", "label": label, "source": "live", "strength": round(max(3, min(30, strength)))}


def trend_signal(city: dict[str, Any], category: str) -> dict[str, Any]:
    return _live_trend(city, category) or _simulated_trend(city["name"], category)


# ---------------------------------------------------------------- copy
COPY = {
    "storm": ("Afara ploua. Noi venim la tine.", "Comanda acum si livram oriunde in oras, uscat si la timp."),
    "heat": ("Cald afara? Ceva racoros, acum.", "Intra la noi si fa o pauza la racoare."),
    "festival": ("Weekend plin in oras? Incepe cu noi.", "Treci pe la noi inainte sa te pierzi in forfota orasului."),
    "greeting": ("O zi speciala. Ne bucuram sa te vedem.", "Vino sa sarbatorim impreuna, cum stim noi mai bine."),
    "plain": (None, None),  # master copy is kept
}

MASTER = {
    "Cafe": ("Cafeaua ta, in fiecare oras.", "Boabe proaspat prajite, servite cu zambet."),
    "Pharmacy": ("Grija pentru tine, aproape de casa.", "Sfaturi de la farmacisti, in fiecare cartier."),
    "Florist": ("Flori proaspete pentru fiecare zi.", "Buchete facute de mana, livrate azi."),
    "Gym": ("Mai puternic in fiecare zi.", "Antrenamente pentru orice program."),
    "Supplements": ("Energie pentru ritmul tau.", "Formule simple, ingrediente clare."),
}


def _when(iso: str) -> str:
    d = date.fromisoformat(iso)
    if d <= date.today():
        return "now"
    return f"{d.day} {d.strftime('%b')}"


def decide(score: float) -> str:
    if score >= THRESHOLDS["generate"]:
        return "GENERATE"
    if score >= THRESHOLDS["light_touch"]:
        return "LIGHT_TOUCH"
    return "SKIP"


def build_city_result(city: dict[str, Any], category: str) -> dict[str, Any]:
    category = category if category in MASTER else "Cafe"
    weather = get_weather(city)
    wx_signal, wx_motif = weather_signal(weather)

    try:
        ctx = get_local_context(city["name"], HOLIDAY_WINDOW_DAYS)
    except Exception:
        ctx = {"events": [], "holidays": [], "namedays": []}

    try:
        events = get_real_events(city["name"], EVENT_WINDOW_DAYS)["events"]
    except Exception:
        events = []

    signals: list[dict[str, Any]] = [wx_signal]
    top_event = None
    soon = (date.today() + timedelta(days=WINDOW_DAYS)).isoformat()
    for ev in events[:2]:  # already sorted by relevance
        top_event = top_event or ev
        proximity = 1.0 if ev["start_date"] <= soon else 0.7
        signals.append(
            {
                "type": "event",
                "label": f"{ev.get('name', 'Local event')} · {_when(ev['start_date'])}",
                "source": ev.get("source", "curated"),
                "strength": round(min(50.0, (15 + float(ev.get("relevance", 0.5)) * 35) * proximity)),
            }
        )
    top_holiday = None
    for hol in ctx.get("holidays", [])[:1]:
        top_holiday = hol
        signals.append(
            {"type": "holiday", "label": str(hol.get("name", "Public holiday")), "source": "curated", "strength": 30}
        )
    signals.append(trend_signal(city, category))

    score = max(0, min(100, round(sum(s["strength"] for s in signals))))
    action = decide(score)

    if wx_motif == "storm":
        motif, reason = "storm", f"{wx_signal['label']} - people stay in, so the ad switches to delivery."
    elif top_event:
        motif, reason = "festival", f"{top_event.get('name', 'A local event')} fills the city, so a festive visual and copy are worth making."
    elif top_holiday:
        motif, reason = "greeting", f"{top_holiday.get('name', 'A holiday')} is coming up, so a greeting tone fits."
    elif wx_motif == "heat":
        motif, reason = "heat", f"{wx_signal['label']} - the visual and copy turn cool."
    else:
        motif, reason = "plain", "Nothing unusual is happening, so the master ad already fits."
    if action == "SKIP":
        reason = "Nothing strong enough is happening, so the master ad already fits."
        motif = "plain"

    master_headline, master_body = MASTER[category]
    local_headline, local_body = COPY[motif]
    headline = local_headline or master_headline
    body = local_body or master_body
    cost, minutes = ACTION_COST[action]

    compliance = check_copy(headline, body, category=category)
    if compliance["status"] == "fixed":  # use the auto-softened copy; the UI only needs status + note
        headline = compliance.pop("headline")
        body = compliance.pop("body")

    return {
        "city": city["name"],
        "lat": city["latitude"],
        "lon": city["longitude"],
        "score": score,
        "action": action,
        "signals": signals,
        "reason": reason,
        "headline": headline,
        "body": body,
        "motif": motif,
        "compliance": compliance,
        "category": category,
        "costUsd": cost,
        "minutesSaved": minutes,
    }


def city_list() -> list[dict[str, Any]]:
    """Every supported city, in the shape the upload page and landing map need."""
    return [
        {"id": c["id"], "name": c["name"], "county": c["county"], "lat": c["latitude"], "lon": c["longitude"]}
        for c in load_cities()
    ]


def build_city_results(names: list[str], category: str) -> list[dict[str, Any]]:
    wanted = {n.casefold() for n in names}
    selected = [c for c in load_cities() if c["name"].casefold() in wanted]
    with ThreadPoolExecutor(max_workers=8) as pool:
        return list(pool.map(lambda c: build_city_result(c, category), selected))
