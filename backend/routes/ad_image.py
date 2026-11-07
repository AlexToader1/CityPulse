"""POST /api/generate-ad-image: edit the uploaded master ad into a city-tailored visual.

Runs only when the city action is GENERATE (score above the threshold). The master image
is sent to Gemini's image model together with the brand DNA and the city's live signals
(weather, events, holidays, trends). Result is cached on disk, so Regenerate is the only
thing that spends tokens twice. With no GEMINI_API_KEY, or on any failure, it returns
imageUrl=null and the frontend keeps its built-in motif art.
"""

from __future__ import annotations

import hashlib
import io
import json
import logging
import os
from typing import Annotated, Any

from fastapi import APIRouter, File, Form, HTTPException, UploadFile

from backend import config

router = APIRouter()
log = logging.getLogger(__name__)

AD_DIR = config.STORAGE_DIR / "ads"
AD_DIR.mkdir(parents=True, exist_ok=True)
MAX_BYTES = 10 * 1024 * 1024
IMAGE_MODEL = os.getenv("GEMINI_IMAGE_MODEL", "gemini-2.5-flash-image")

MOTIF_STYLE = {
    "storm": "rainy and moody outside, cozy and warm inside; raindrops, umbrellas, wet reflections, steam, warm lamps",
    "heat": "bright sun, golden light, refreshing cool accents: ice, condensation, citrus, shade, sunglasses, fans",
    "festival": "festive local celebration: string lights, seasonal treats, ornaments, scarves and mugs, warm evening glow",
    "greeting": "celebratory greeting-card feel: soft ribbons, petals or sparkles, warm and personal",
    "plain": "fresh seasonal touch",
}


def build_prompt(city: dict[str, Any], brand: dict[str, Any]) -> str:
    signals = "; ".join(s.get("label", "") for s in city.get("signals", []) if s.get("label"))
    style = MOTIF_STYLE.get(city.get("motif", "plain"), MOTIF_STYLE["plain"])
    swatches = ", ".join(brand.get("swatches", [])[:4])
    tone = ", ".join(brand.get("tone", []))
    return (
        "Design a new, eye-catching social-media advertisement image for a local business. The attached "
        "master ad is only a reference for the main product, the brand colours and the overall style: "
        "re-imagine the whole scene instead of lightly editing it. Keep the main product clearly "
        "recognisable and central (keep any real logo on it unchanged).\n"
        f"Place: {city.get('city')}, Romania. What is happening right now: {signals or city.get('reason', '')}.\n"
        f"Mood: {style}.\n"
        "Add 4 to 6 different elements that clearly relate to that situation, the kind a creative director "
        "would pick: seasonal props, weather details, festive or local cues, complementary items, light "
        "and atmosphere. Layer them around the product with depth, so it looks like a polished, "
        "designer-made modern ad (rich lighting, vibrant but harmonious colours), not a filtered photo.\n"
        f"Brand DNA: palette {swatches}; tone {tone}. Keep the colours close to this palette.\n"
        "Keep the bottom third fairly calm and uncluttered, because headline text is added there later.\n"
        "STRICT: no text of any kind in the image: no letters, words, numbers, captions, labels, tags "
        "(such as 'image 1'), boxes, frames, borders, placeholders, watermarks or interface elements. "
        "No people's faces. Square 1:1 composition."
    )


def _edit_with_gemini(image_bytes: bytes, prompt: str) -> tuple[bytes | None, str]:
    """-> (png bytes or None, reason when None)."""
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        return None, "GEMINI_API_KEY is not set in the backend .env (restart the backend after adding it)"
    try:
        from google import genai
        from google.genai import types
        from PIL import Image

        img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        img.thumbnail((1024, 1024))  # smaller input = fewer tokens
        buf = io.BytesIO()
        img.save(buf, "PNG")
        ref = types.Part.from_bytes(data=buf.getvalue(), mime_type="image/png")
        client = genai.Client(api_key=api_key)
        response = client.models.generate_content(
            model=IMAGE_MODEL,
            contents=[prompt, ref],
            config=types.GenerateContentConfig(response_modalities=["TEXT", "IMAGE"]),
        )
        texts, finish = [], ""
        for candidate in response.candidates or []:
            finish = str(getattr(candidate, "finish_reason", "") or finish)
            for part in (candidate.content.parts if candidate.content else None) or []:
                if getattr(part, "inline_data", None) and part.inline_data.data:
                    return part.inline_data.data, ""
                if getattr(part, "text", None):
                    texts.append(part.text)
        feedback = str(getattr(response, "prompt_feedback", "") or "")
        said = (" ".join(texts) or feedback or "no details")[:200]
        log.warning("Gemini returned no image. finish=%s said=%s", finish, said)
        return None, f"{IMAGE_MODEL} returned no image (finish: {finish or 'n/a'}; model said: {said})"
    except Exception as error:
        log.exception("Gemini image edit failed")
        return None, f"{type(error).__name__}: {str(error)[:200]}"


def _reply(path, source: str, detail: str | None = None) -> dict[str, Any]:
    """Return the image inline as a data URL (no separate /media request needed) plus its file URL."""
    import base64

    from PIL import Image

    buf = io.BytesIO()
    Image.open(path).convert("RGB").save(buf, "JPEG", quality=88)
    out: dict[str, Any] = {
        "imageUrl": f"/media/ads/{path.name}",
        "imageData": "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode(),
        "source": source,
    }
    if detail:
        out["detail"] = detail
    log.info("ad image ready: %s (%s, %d KB)", path.name, source, len(buf.getvalue()) // 1024)
    return out


def _local_edit(image_bytes: bytes, motif: str, seed: str) -> bytes:
    """No-LLM fallback: colour-grade the master and draw a motif overlay with Pillow."""
    import random

    from PIL import Image, ImageDraw, ImageEnhance

    rng = random.Random(seed)
    img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    img.thumbnail((1024, 1024))
    w, h = img.size
    tint = {"storm": (70, 100, 150), "heat": (255, 170, 60), "festival": (255, 120, 90), "greeting": (255, 150, 190)}.get(motif)
    if tint:
        img = Image.blend(img, Image.new("RGB", img.size, tint), 0.22)
    if motif == "storm":
        img = ImageEnhance.Brightness(img).enhance(0.85)
    layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    for _ in range(90 if motif != "plain" else 0):
        x, y = rng.randint(0, w), rng.randint(0, h)
        if motif == "storm":
            d.line([(x, y), (x - 10, y + 28)], fill=(220, 235, 255, 150), width=2)
        elif motif in ("festival", "greeting"):
            r = rng.randint(3, 8)
            c = rng.choice([(255, 215, 80), (255, 255, 255), (255, 110, 150), (120, 220, 255)])
            d.ellipse([x - r, y - r, x + r, y + r], fill=c + (200,))
        elif motif == "heat":
            r = rng.randint(2, 6)
            d.ellipse([x - r, y - r, x + r, y + r], fill=(255, 240, 180, 110))
    out = Image.alpha_composite(img.convert("RGBA"), layer).convert("RGB")
    buf = io.BytesIO()
    out.save(buf, "PNG")
    return buf.getvalue()


@router.post("/generate-ad-image")
async def generate_ad_image(
    file: Annotated[UploadFile, File()],
    city: Annotated[str, Form()],
    brand: Annotated[str, Form()] = "{}",
    force: Annotated[bool, Form()] = False,
) -> dict[str, Any]:
    try:
        city_d, brand_d = json.loads(city), json.loads(brand)
    except json.JSONDecodeError as error:
        raise HTTPException(status_code=422, detail="city and brand must be JSON") from error
    if city_d.get("action") != "GENERATE":  # the criteria: only high-score cities get a new visual
        return {"imageUrl": None, "source": "skipped"}

    data = await file.read()
    if not data or len(data) > MAX_BYTES:
        raise HTTPException(status_code=413, detail="Master image missing or larger than 10 MB")

    prompt = build_prompt(city_d, brand_d)
    key = hashlib.sha1(data + prompt.encode()).hexdigest()[:20]
    out = AD_DIR / f"{key}.png"
    if out.exists() and not force:
        return _reply(out, "cache")

    result, reason = _edit_with_gemini(data, prompt)
    if not result:
        try:  # Gemini unavailable (quota, key, model): still return a visibly different local edit
            local = out.with_name(f"{key}-local.png")
            local.write_bytes(_local_edit(data, city_d.get("motif", "plain"), key))
            return _reply(local, "local", reason)
        except Exception:
            log.exception("local edit failed")
            return {"imageUrl": None, "source": "fallback", "detail": reason}
    try:
        from PIL import Image

        Image.open(io.BytesIO(result)).convert("RGB").save(out, "PNG")
    except Exception:
        out.write_bytes(result)
    return _reply(out, "gemini")
