"""Central settings, read from environment variables / the repo-root .env file."""
from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

REPO_ROOT = Path(__file__).resolve().parent.parent
load_dotenv(REPO_ROOT / ".env")


def _get(name: str, default: str = "") -> str:
    return os.getenv(name, default).strip()


# --- Claude -------------------------------------------------------------------
ANTHROPIC_API_KEY = _get("ANTHROPIC_API_KEY")
CLAUDE_MODEL = _get("CLAUDE_MODEL", "claude-opus-5-5")
# Deliberately NOT the shell's ANTHROPIC_BASE_URL (often points at a local proxy for other tools).
# Set CLAUDE_BASE_URL in .env only if this app should use a gateway.
CLAUDE_BASE_URL = _get("CLAUDE_BASE_URL", "https://api.anthropic.com")

# --- ElevenLabs (voiceover) ---------------------------------------------------
ELEVENLABS_API_KEY = _get("ELEVENLABS_API_KEY")
ELEVENLABS_VOICE_ID = _get("ELEVENLABS_VOICE_ID", "JBFqnCBsd6RMkjVDRZzb")
ELEVENLABS_MODEL = _get("ELEVENLABS_MODEL", "eleven_multilingual_v2")

# --- Adobe Firefly (9:16 generative expand) -------------------------------------
FIREFLY_CLIENT_ID = _get("FIREFLY_CLIENT_ID")
FIREFLY_CLIENT_SECRET = _get("FIREFLY_CLIENT_SECRET")

# --- TikTok Content Posting API ------------------------------------------------
TIKTOK_CLIENT_KEY = _get("TIKTOK_CLIENT_KEY")
TIKTOK_CLIENT_SECRET = _get("TIKTOK_CLIENT_SECRET")
TIKTOK_REDIRECT_URI = _get("TIKTOK_REDIRECT_URI", "http://localhost:8000/api/tiktok/callback")
FRONTEND_URL = _get("FRONTEND_URL", "http://localhost:5173")
# Where the browser lands after approving TikTok login
TIKTOK_AFTER_LOGIN_URL = _get("TIKTOK_AFTER_LOGIN_URL", "http://localhost:8000/studio")

# --- Infra ----------------------------------------------------------------------
PUBLIC_BASE_URL = _get("PUBLIC_BASE_URL", "http://localhost:8000")
STORAGE_DIR = Path(_get("STORAGE_DIR", str(REPO_ROOT / "backend" / "storage"))).resolve()
REDIS_URL = _get("REDIS_URL")  # if set (and `rq` installed), jobs go to an RQ queue
MAX_PARALLEL_JOBS = int(_get("MAX_PARALLEL_JOBS", "2"))

# --- Video ------------------------------------------------------------------------
VIDEO_WIDTH = int(_get("VIDEO_WIDTH", "1080"))
VIDEO_HEIGHT = int(_get("VIDEO_HEIGHT", "1920"))
VIDEO_FPS = int(_get("VIDEO_FPS", "30"))

STORAGE_DIR.mkdir(parents=True, exist_ok=True)
