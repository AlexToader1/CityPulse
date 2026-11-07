"""Claude writes the TikTok scripts: looks at the product images + page text and
returns N structured script variants (hook -> benefits -> CTA)."""
from __future__ import annotations

import base64
import io
from pathlib import Path

import anthropic
from PIL import Image

from backend import config
from backend.video.models import Product, ScriptSet

SYSTEM_PROMPT = """You are a senior TikTok performance-marketing creative strategist.
You write short voiceover scripts for vertical product videos (TikTok, Reels, Shorts)
that are assembled from the product's own photos.

How the video works: each script line is spoken by an AI voice while one product
image is on screen with a slow zoom, and the words appear as bold animated captions.

Rules for every variant:
- 5 to 8 lines, 60 to 90 spoken words in total (about 20-35 seconds).
- Line 1 is the hook: it must stop the scroll in under 2 seconds (a bold claim,
  a relatable problem, a surprising question or a pattern interrupt). Never start
  with the brand name or "Introducing".
- Middle lines: concrete benefits a viewer cares about, not spec lists. Use the real
  facts from the product data; never invent specs, prices, discounts or reviews.
- Last line is a clear call to action (e.g. tap the link, check it out, comment).
- Conversational, punchy, native to TikTok. Short sentences. No emojis or hashtags in
  the spoken lines, and no stage directions: the lines are read aloud verbatim.
- Pick image_index for each line so the image matches what is being said (image 0 is
  usually the main product shot; other images show angles, details, ports, packaging,
  lifestyle). Use as many different images as there are (at least 4 when 4+ exist) and
  avoid showing the same image on two consecutive lines when another one fits.
- Each variant must use a clearly different creative angle (for example:
  problem-solution, "things I wish I knew", social-proof style, POV, comparison,
  unboxing hype, myth vs. fact).
- Respect advertising rules: no misleading health or financial claims.
- caption: a short post caption that complements the video. hashtags: 3-6 relevant
  hashtags without the # sign, mixing broad and niche tags.
"""

LANGUAGE_NAMES = {"en": "English", "ro": "Romanian (with correct diacritics: ă â î ș ț)"}

_client: anthropic.Anthropic | None = None


def _get_client() -> anthropic.Anthropic:
    global _client
    if _client is None:
        if not config.ANTHROPIC_API_KEY:
            raise RuntimeError("ANTHROPIC_API_KEY is not set (see .env.example)")
        _client = anthropic.Anthropic(api_key=config.ANTHROPIC_API_KEY, base_url=config.CLAUDE_BASE_URL)
    return _client


def _image_block(path: Path) -> dict:
    img = Image.open(path).convert("RGB")
    img.thumbnail((1024, 1024))
    buf = io.BytesIO()
    img.save(buf, "JPEG", quality=85)
    return {
        "type": "image",
        "source": {"type": "base64", "media_type": "image/jpeg", "data": base64.standard_b64encode(buf.getvalue()).decode()},
    }


def generate_scripts(
    product: Product,
    images: list[Path],
    n_variants: int = 3,
    language: str = "en",
    brand_tone: str | None = None,
    page_text: str = "",
) -> tuple[ScriptSet, dict]:
    """Returns (scripts, usage dict with input/output token counts)."""
    content: list[dict] = []
    for i, path in enumerate(images):
        content.append({"type": "text", "text": f"Image {i}:"})
        content.append(_image_block(path))

    facts = [
        f"Title: {product.title or 'unknown'}",
        f"Brand: {product.brand or 'unknown'}",
        f"Price: {product.price or 'unknown'} {product.currency or ''}".strip(),
        f"Description: {product.description or 'n/a'}",
        f"URL: {product.url or 'n/a'}",
    ]
    if page_text:
        facts.append(f"Product page text (may contain noise):\n{page_text}")

    task = (
        "Product data:\n" + "\n".join(facts) + "\n\n"
        f"There are {len(images)} images (indexes 0 to {len(images) - 1}).\n"
        f"Write {n_variants} script variants in {LANGUAGE_NAMES.get(language, language)}."
    )
    if brand_tone:
        task += f"\nBrand tone of voice: {brand_tone}"
    content.append({"type": "text", "text": task})

    response = _get_client().beta.messages.parse(
        model=config.CLAUDE_MODEL,
        max_tokens=16000,
        system=SYSTEM_PROMPT,
        messages=[{"role": "user", "content": content}],
        output_format=ScriptSet,
        output_config={"effort": "medium"},
        betas=["server-side-fallback-2026-07-01"],
        fallbacks="default",
    )
    if response.stop_reason == "refusal":
        raise RuntimeError("Claude declined to write a script for this product.")
    if response.stop_reason == "max_tokens" or response.parsed_output is None:
        raise RuntimeError(f"Script generation did not complete (stop_reason={response.stop_reason}).")

    scripts: ScriptSet = response.parsed_output
    max_index = len(images) - 1
    for variant in scripts.variants:
        for line in variant.lines:
            line.image_index = min(max(line.image_index, 0), max_index)
        _ensure_image_variety(variant, len(images))
        variant.hashtags = [h.lstrip("#").replace(" ", "") for h in variant.hashtags if h.strip()]
    usage = {"input_tokens": response.usage.input_tokens, "output_tokens": response.usage.output_tokens}
    return scripts, usage


def _ensure_image_variety(variant, n_images: int) -> None:
    """If Claude reused too few images, spread the lines evenly over the available ones."""
    n_lines = len(variant.lines)
    wanted = min(n_images, 4, n_lines)
    if len({line.image_index for line in variant.lines}) >= wanted:
        return
    for i, line in enumerate(variant.lines):
        line.image_index = min(n_images - 1, i * n_images // n_lines)
