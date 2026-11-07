"""Adobe Firefly Services: Generative Expand (product photo -> 9:16 vertical).

Needs FIREFLY_CLIENT_ID / FIREFLY_CLIENT_SECRET (OAuth server-to-server credential
from the Adobe Developer Console with the Firefly API added). If they are missing or
any call fails, callers fall back to a blurred-background fill (see video/scenes.py).

NOTE: written against the documented v3 async pattern (upload -> expand-async ->
poll statusUrl); verify against your credential's API reference on the day.
"""
from __future__ import annotations

import os
import time
from pathlib import Path

import httpx

from backend import config

IMS_URL = "https://ims-na1.adobelogin.com/ims/token/v3"
API = "https://firefly-api.adobe.io"
SCOPES = "openid,AdobeID,session,additional_info,read_organizations,firefly_api,ff_apis"
EXPAND_SIZE = os.getenv("FIREFLY_EXPAND_SIZE", "1080x1920")

_token: dict = {"value": None, "expires": 0.0}


def is_configured() -> bool:
    return bool(config.FIREFLY_CLIENT_ID and config.FIREFLY_CLIENT_SECRET)


def _access_token() -> str:
    if _token["value"] and time.time() < _token["expires"] - 60:
        return _token["value"]
    resp = httpx.post(
        IMS_URL,
        data={
            "grant_type": "client_credentials",
            "client_id": config.FIREFLY_CLIENT_ID,
            "client_secret": config.FIREFLY_CLIENT_SECRET,
            "scope": SCOPES,
        },
        timeout=30,
    )
    resp.raise_for_status()
    data = resp.json()
    _token.update(value=data["access_token"], expires=time.time() + int(data.get("expires_in", 3600)))
    return _token["value"]


def _headers() -> dict:
    return {"x-api-key": config.FIREFLY_CLIENT_ID, "Authorization": f"Bearer {_access_token()}"}


def upload_image(path: Path) -> str:
    resp = httpx.post(
        f"{API}/v2/storage/image",
        headers={**_headers(), "Content-Type": "image/jpeg"},
        content=path.read_bytes(),
        timeout=60,
    )
    resp.raise_for_status()
    return resp.json()["images"][0]["id"]


def expand_to_vertical(src: Path, dest: Path, prompt: str | None = None, timeout_s: int = 90) -> Path:
    """Generative-expands `src` to a 9:16 canvas and saves it to `dest`."""
    width, height = (int(v) for v in EXPAND_SIZE.split("x"))
    body: dict = {
        "image": {"source": {"uploadId": upload_image(src)}},
        "size": {"width": width, "height": height},
        "numVariations": 1,
    }
    if prompt:
        body["prompt"] = prompt
    resp = httpx.post(
        f"{API}/v3/images/expand-async",
        headers={**_headers(), "Content-Type": "application/json", "Accept": "application/json"},
        json=body,
        timeout=60,
    )
    resp.raise_for_status()
    status_url = resp.json()["statusUrl"]

    deadline = time.time() + timeout_s
    while time.time() < deadline:
        status = httpx.get(status_url, headers=_headers(), timeout=30).json()
        state = str(status.get("status", "")).lower()
        if state == "succeeded":
            url = status["result"]["outputs"][0]["image"]["url"]
            dest.write_bytes(httpx.get(url, timeout=60).content)
            return dest
        if state in ("failed", "cancelled", "canceled"):
            raise RuntimeError(f"Firefly expand failed: {status}")
        time.sleep(2)
    raise TimeoutError("Firefly expand timed out")
