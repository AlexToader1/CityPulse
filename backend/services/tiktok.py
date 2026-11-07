"""TikTok Login Kit (OAuth v2) + Content Posting API.

- Direct post: needs scope `video.publish`. Until TikTok audits your app, posts are
  restricted to SELF_ONLY (private) visibility, which is fine for a demo.
- Draft upload ("inbox"): needs scope `video.upload`. The video lands in the
  creator's TikTok inbox/drafts and they finish posting in the app.

For the hackathon a single connected account is stored in storage/tiktok_token.json.
"""
from __future__ import annotations

import json
import secrets
import time
from pathlib import Path
from urllib.parse import urlencode

import httpx

from backend import config

AUTH_URL = "https://www.tiktok.com/v2/auth/authorize/"
TOKEN_URL = "https://open.tiktokapis.com/v2/oauth/token/"
API = "https://open.tiktokapis.com/v2"
SCOPES = "user.info.basic,video.publish,video.upload"
TOKEN_FILE = config.STORAGE_DIR / "tiktok_token.json"
_pending_states: set[str] = set()


class TikTokError(RuntimeError):
    pass


def is_configured() -> bool:
    return bool(config.TIKTOK_CLIENT_KEY and config.TIKTOK_CLIENT_SECRET)


def authorize_url() -> str:
    state = secrets.token_urlsafe(16)
    _pending_states.add(state)
    return AUTH_URL + "?" + urlencode({
        "client_key": config.TIKTOK_CLIENT_KEY,
        "scope": SCOPES,
        "response_type": "code",
        "redirect_uri": config.TIKTOK_REDIRECT_URI,
        "state": state,
    })


def exchange_code(code: str, state: str) -> dict:
    if state not in _pending_states:
        raise TikTokError("Invalid OAuth state; start the login again.")
    _pending_states.discard(state)
    return _save_token(_token_request({
        "code": code,
        "grant_type": "authorization_code",
        "redirect_uri": config.TIKTOK_REDIRECT_URI,
    }))


def _token_request(fields: dict) -> dict:
    resp = httpx.post(
        TOKEN_URL,
        data={"client_key": config.TIKTOK_CLIENT_KEY, "client_secret": config.TIKTOK_CLIENT_SECRET, **fields},
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        timeout=30,
    )
    data = resp.json()
    if resp.status_code >= 400 or "access_token" not in data:
        raise TikTokError(f"Token request failed: {data}")
    return data


def _save_token(data: dict) -> dict:
    data["expires_at"] = time.time() + int(data.get("expires_in", 0))
    TOKEN_FILE.write_text(json.dumps(data))
    return data


def _load_token() -> dict | None:
    if not TOKEN_FILE.exists():
        return None
    data = json.loads(TOKEN_FILE.read_text())
    if time.time() > data.get("expires_at", 0) - 60 and data.get("refresh_token"):
        data = _save_token(_token_request({"grant_type": "refresh_token", "refresh_token": data["refresh_token"]}))
    return data


def access_token() -> str:
    token = _load_token()
    if not token:
        raise TikTokError("No TikTok account connected. Open /api/tiktok/login first.")
    return token["access_token"]


def disconnect() -> None:
    TOKEN_FILE.unlink(missing_ok=True)


def _post(path: str, body: dict) -> dict:
    resp = httpx.post(
        f"{API}{path}",
        headers={"Authorization": f"Bearer {access_token()}", "Content-Type": "application/json; charset=UTF-8"},
        json=body,
        timeout=30,
    )
    data = resp.json()
    err = data.get("error", {})
    if resp.status_code >= 400 or (err.get("code") not in (None, "ok")):
        raise TikTokError(f"TikTok {path} failed: {err.get('code')} - {err.get('message')}")
    return data.get("data", {})


def account_info() -> dict | None:
    if not _load_token():
        return None
    resp = httpx.get(
        f"{API}/user/info/",
        params={"fields": "open_id,display_name,avatar_url"},
        headers={"Authorization": f"Bearer {access_token()}"},
        timeout=30,
    )
    return resp.json().get("data", {}).get("user")


def creator_info() -> dict:
    return _post("/post/publish/creator_info/query/", {})


def _source_info(video: Path) -> dict:
    size = video.stat().st_size
    # Files under 64 MB can go up as a single chunk.
    return {"source": "FILE_UPLOAD", "video_size": size, "chunk_size": size, "total_chunk_count": 1}


def _upload(upload_url: str, video: Path) -> None:
    size = video.stat().st_size
    resp = httpx.put(
        upload_url,
        content=video.read_bytes(),
        headers={"Content-Type": "video/mp4", "Content-Length": str(size), "Content-Range": f"bytes 0-{size - 1}/{size}"},
        timeout=300,
    )
    if resp.status_code >= 400:
        raise TikTokError(f"Video upload failed: {resp.status_code} {resp.text[:200]}")


def publish_direct(video: Path, title: str, privacy_level: str | None = None) -> tuple[str, str]:
    """Direct post. Returns (publish_id, privacy_level used)."""
    info = creator_info()
    options = info.get("privacy_level_options") or ["SELF_ONLY"]
    privacy = privacy_level if privacy_level in options else ("SELF_ONLY" if "SELF_ONLY" in options else options[0])
    data = _post("/post/publish/video/init/", {
        "post_info": {
            "title": title[:2200],
            "privacy_level": privacy,
            # Respect the creator's own account settings (TikTok rejects the post otherwise)
            "disable_duet": bool(info.get("duet_disabled")),
            "disable_comment": bool(info.get("comment_disabled")),
            "disable_stitch": bool(info.get("stitch_disabled")),
            "is_aigc": True,  # label AI-generated content
        },
        "source_info": _source_info(video),
    })
    _upload(data["upload_url"], video)
    return data["publish_id"], privacy


def upload_draft(video: Path) -> str:
    """Sends the video to the creator's TikTok inbox to finish posting in the app."""
    data = _post("/post/publish/inbox/video/init/", {"source_info": _source_info(video)})
    _upload(data["upload_url"], video)
    return data["publish_id"]


def publish_status(publish_id: str) -> dict:
    return _post("/post/publish/status/fetch/", {"publish_id": publish_id})
