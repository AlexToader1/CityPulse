"""POST /api/generate-ad: produce the local ad copy for one city.

Uses Gemini when GEMINI_API_KEY is set, otherwise (or on any failure) keeps the
rule-based copy already attached to the city result.
"""

from __future__ import annotations

import json
import os
from typing import Any

from fastapi import APIRouter
from pydantic import BaseModel

from backend.services.compliance_rules import check_copy
from backend.services.signals import ACTION_COST

router = APIRouter()


class GenerateAdRequest(BaseModel):
    city: dict[str, Any]  # a CityResult
    brand: dict[str, Any]  # a BrandDNA (or {"name": ...})


def _gemini_copy(city: dict[str, Any], brand: dict[str, Any]) -> dict[str, str] | None:
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        return None
    try:
        from google import genai
        from google.genai import types

        signals = "; ".join(s.get("label", "") for s in city.get("signals", []))
        prompt = (
            "Write a short Romanian ad for a local business. Return JSON with keys "
            "'headline' (max 45 chars) and 'body' (max 90 chars). Never use superlatives "
            "or unprovable claims (e.g. 'cel mai bun', 'perfect', 'garantat').\n"
            f"Brand: {brand.get('name')}; tone: {', '.join(brand.get('tone', []))}\n"
            f"Master headline: {brand.get('masterHeadline')}\n"
            f"City: {city.get('city')}; why now: {city.get('reason')}; signals: {signals}\n"
            f"Action: {city.get('action')} (LIGHT_TOUCH = keep the master message, tweak lightly)."
        )
        client = genai.Client(api_key=api_key)
        response = client.models.generate_content(
            model=os.getenv("GEMINI_MODEL", "gemini-3.8-flash"),
            contents=prompt,
            config=types.GenerateContentConfig(response_mime_type="application/json"),
        )
        data = json.loads(response.text or "{}")
        if data.get("headline") and data.get("body"):
            return {"headline": str(data["headline"])[:80], "body": str(data["body"])[:160]}
    except Exception:
        return None
    return None


@router.post("/generate-ad")
def generate_ad(request: GenerateAdRequest) -> dict[str, Any]:
    city, brand = request.city, request.brand
    action = city.get("action", "SKIP")
    headline, body = city.get("headline", ""), city.get("body", "")
    if action != "SKIP":
        copy = _gemini_copy(city, brand)
        if copy and check_copy(copy["headline"], copy["body"])["status"] != "blocked":
            headline, body = copy["headline"], copy["body"]
    cost, minutes = ACTION_COST.get(action, (0.0, 0))
    return {
        "city": city.get("city"),
        "action": action,
        "headline": headline,
        "body": body,
        "motif": city.get("motif", "plain") if action == "GENERATE" else "plain",
        "reason": city.get("reason", ""),
        "costUsd": cost,
        "minutesSaved": minutes,
    }
