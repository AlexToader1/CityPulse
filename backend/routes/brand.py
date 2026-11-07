"""POST /api/brand: upload a logo/ad, get back Brand DNA (palette, tone, master copy)."""

from __future__ import annotations

import colorsys
import io
import re
from typing import Annotated, Any

from fastapi import APIRouter, File, Form, HTTPException, UploadFile

from backend.services.signals import MASTER

router = APIRouter()

MAX_BYTES = 10 * 1024 * 1024
CTA = {
    "Cafe": "Comanda acum",
    "Pharmacy": "Vezi oferta",
    "Florist": "Comanda buchet",
    "Gym": "Rezerva o sedinta",
    "Supplements": "Descopera",
}
FALLBACK_SWATCHES = ["#8FDCC8", "#1F3A5F", "#F6E7CF", "#FF8B6B"]


def _hex(rgb: tuple[int, int, int]) -> str:
    return "#{:02X}{:02X}{:02X}".format(*rgb)


def extract_palette(data: bytes, count: int = 4) -> list[str]:
    from PIL import Image

    img = Image.open(io.BytesIO(data))
    img = img.convert("RGBA")
    # drop transparent pixels (logos) by compositing onto mid-grey, then ignore that grey
    img.thumbnail((128, 128))
    pixels = [p[:3] for p in img.getdata() if p[3] > 200]
    if not pixels:
        return FALLBACK_SWATCHES
    flat = Image.new("RGB", (len(pixels), 1))
    flat.putdata(pixels)
    q = flat.quantize(colors=8, method=Image.Quantize.MEDIANCUT)
    palette = q.getpalette() or []
    counts = sorted(q.getcolors() or [], reverse=True)  # (count, index)
    colors: list[tuple[int, int, int]] = []
    for _, idx in counts:
        rgb = tuple(palette[idx * 3 : idx * 3 + 3])
        if len(rgb) == 3 and all(
            sum(abs(a - b) for a, b in zip(rgb, other)) > 60 for other in colors
        ):
            colors.append(rgb)  # type: ignore[arg-type]
    # put the most saturated colour first: it becomes the brand primary in the UI
    def sat(rgb: tuple[int, int, int]) -> float:
        h, s, v = colorsys.rgb_to_hsv(*(c / 255 for c in rgb))
        return s * (0.4 + 0.6 * v)

    colors.sort(key=sat, reverse=True)
    out = [_hex(c) for c in colors[:count]]
    for fb in FALLBACK_SWATCHES:  # pad if the image is nearly monochrome
        if len(out) >= 3:
            break
        out.append(fb)
    return out


def guess_tone(swatches: list[str]) -> tuple[str, str]:
    r, g, b = (int(swatches[0][i : i + 2], 16) / 255 for i in (1, 3, 5))
    h, s, v = colorsys.rgb_to_hsv(r, g, b)
    energy = "Bold" if s > 0.6 and v > 0.6 else "Calm" if s < 0.35 else "Warm"
    mood = "Playful" if 0.0 <= h < 0.17 or h > 0.8 else "Fresh" if 0.17 <= h < 0.5 else "Trusted"
    return energy, mood


@router.post("/brand")
async def analyze_brand(
    file: Annotated[UploadFile, File()],
    category: Annotated[str, Form()] = "Cafe",
) -> dict[str, Any]:
    if not (file.content_type or "").startswith("image/"):
        raise HTTPException(status_code=415, detail="Upload a PNG, JPG or WebP image")
    data = await file.read()
    if len(data) > MAX_BYTES:
        raise HTTPException(status_code=413, detail="Image is larger than 10 MB")
    try:
        swatches = extract_palette(data)
    except Exception as error:
        raise HTTPException(status_code=422, detail=f"Could not read image: {error}") from error

    category = category if category in MASTER else "Cafe"
    headline, body = MASTER[category]
    name = re.sub(r"\.[^.]+$", "", file.filename or "Your brand").replace("_", " ").replace("-", " ").strip()
    return {
        "name": name or "Your brand",
        "swatches": swatches,
        "font": "Space Grotesk Bold",
        "tone": list(guess_tone(swatches)),
        "masterHeadline": headline,
        "masterBody": body,
        "cta": CTA[category],
        "imageUrl": None,  # the browser keeps the local object URL
    }
