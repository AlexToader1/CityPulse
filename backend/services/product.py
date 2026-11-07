"""Product page ingest: link -> Product (title, description, price, images).

Reads JSON-LD `Product` data and OpenGraph tags, which most shops (eMAG, Shopify,
WooCommerce, Amazon partially) expose. Pages that block bots can still be used by
uploading images manually.
"""
from __future__ import annotations

import io
import json
import re
from pathlib import Path, PurePosixPath
from urllib.parse import urljoin

import httpx
from bs4 import BeautifulSoup
from PIL import Image

from backend.video.models import Product

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/130.0 Safari/537.36"
    ),
    "Accept-Language": "ro-RO,ro;q=0.9,en;q=0.8",
}
MAX_IMAGES = 6
MIN_IMAGE_SIDE = 300  # skip icons / thumbnails
IMAGE_EXT = re.compile(r"\.(jpe?g|png|webp)(\?|$)", re.I)
GALLERY_HINT = re.compile(r"thumb|gallery|zoom|preview|lightbox|slide|carousel", re.I)


def _iter_jsonld(soup: BeautifulSoup):
    for tag in soup.find_all("script", type="application/ld+json"):
        try:
            data = json.loads(tag.string or "")
        except (json.JSONDecodeError, TypeError):
            continue
        stack = data if isinstance(data, list) else [data]
        while stack:
            item = stack.pop()
            if isinstance(item, dict):
                if "@graph" in item:
                    stack.extend(item["@graph"])
                yield item
            elif isinstance(item, list):
                stack.extend(item)


def _is_product(item: dict) -> bool:
    t = item.get("@type")
    return t == "Product" or (isinstance(t, list) and "Product" in t)


def _as_list(value) -> list:
    if value is None:
        return []
    return value if isinstance(value, list) else [value]


def scrape_product(url: str) -> tuple[Product, str]:
    """Returns (product, visible page text excerpt for Claude)."""
    resp = httpx.get(url, headers=HEADERS, follow_redirects=True, timeout=20)
    resp.raise_for_status()
    soup = BeautifulSoup(resp.text, "html.parser")
    product = Product(url=str(resp.url))
    images: list[str] = []

    for item in _iter_jsonld(soup):
        if not _is_product(item):
            continue
        product.title = product.title or str(item.get("name", "")).strip()
        product.description = product.description or str(item.get("description", "")).strip()
        brand = item.get("brand")
        if isinstance(brand, dict):
            brand = brand.get("name")
        product.brand = product.brand or (str(brand) if brand else None)
        for img in _as_list(item.get("image")):
            if isinstance(img, dict):
                img = img.get("url") or img.get("contentUrl")
            if isinstance(img, str):
                images.append(img)
        for offer in _as_list(item.get("offers")):
            if isinstance(offer, dict) and not product.price:
                price = offer.get("price") or offer.get("lowPrice")
                if price is not None:
                    product.price = str(price)
                    product.currency = offer.get("priceCurrency")

    def meta(*names: str) -> str | None:
        for name in names:
            tag = soup.find("meta", attrs={"property": name}) or soup.find("meta", attrs={"name": name})
            if tag and tag.get("content"):
                return tag["content"].strip()
        return None

    product.title = product.title or meta("og:title", "twitter:title") or (soup.title.string.strip() if soup.title and soup.title.string else "")
    product.description = product.description or meta("og:description", "description") or ""
    product.price = product.price or meta("product:price:amount", "og:price:amount")
    product.currency = product.currency or meta("product:price:currency", "og:price:currency")
    for name in ("og:image", "og:image:secure_url", "twitter:image"):
        for tag in soup.find_all("meta", attrs={"property": name}) + soup.find_all("meta", attrs={"name": name}):
            if tag.get("content"):
                images.append(tag["content"])

    # Gallery: <a href="big.jpg"> thumbnails (lightbox pattern) listed after the main images.
    for a in soup.find_all("a", href=IMAGE_EXT):
        classes = " ".join(a.get("class") or [])
        parent_classes = " ".join(" ".join(p.get("class") or []) for p in a.parents if p.name in ("div", "ul", "li"))
        if a.find("img") or GALLERY_HINT.search(classes) or GALLERY_HINT.search(parent_classes):
            images.append(a["href"])

    seen: set[str] = set()
    for img in images:
        absolute = urljoin(str(resp.url), img.strip())
        # Same photo often appears at several sizes/paths: dedupe on the file name.
        key = PurePosixPath(absolute.split("?")[0]).name.lower()
        if absolute.startswith("http") and key not in seen:
            seen.add(key)
            product.image_urls.append(absolute)

    for tag in soup(["script", "style", "noscript", "svg", "header", "footer", "nav"]):
        tag.decompose()
    page_text = " ".join(soup.get_text(" ").split())[:6000]
    return product, page_text


def download_images(urls: list[str], dest_dir: Path, max_count: int = MAX_IMAGES, start_index: int = 0) -> list[Path]:
    """Downloads, validates and normalizes images to RGB JPEGs. Skips tiny/broken ones."""
    dest_dir.mkdir(parents=True, exist_ok=True)
    saved: list[Path] = []
    with httpx.Client(headers=HEADERS, follow_redirects=True, timeout=20) as client:
        for url in urls:
            if len(saved) >= max_count:
                break
            try:
                resp = client.get(url)
                resp.raise_for_status()
                path = normalize_image(resp.content, dest_dir / f"src_{start_index + len(saved)}.jpg")
            except Exception:
                continue
            if path:
                saved.append(path)
    return saved


def normalize_image(data: bytes, dest: Path) -> Path | None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    img = Image.open(io.BytesIO(data))
    img.load()
    if min(img.size) < MIN_IMAGE_SIDE:
        return None
    if img.mode in ("RGBA", "LA", "P"):
        img = img.convert("RGBA")
        background = Image.new("RGB", img.size, (255, 255, 255))
        background.paste(img, mask=img.split()[-1])
        img = background
    img.convert("RGB").save(dest, "JPEG", quality=92)
    return dest
