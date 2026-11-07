"""Connect a TikTok account (OAuth) for publishing."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException
from fastapi.responses import RedirectResponse

from backend import config
from backend.services import tiktok

router = APIRouter(prefix="/api/tiktok", tags=["tiktok"])


@router.get("/status")
def status():
    if not tiktok.is_configured():
        return {"configured": False, "connected": False}
    try:
        user = tiktok.account_info()
    except Exception:
        user = None
    return {"configured": True, "connected": user is not None, "user": user}


@router.get("/login")
def login():
    if not tiktok.is_configured():
        raise HTTPException(400, "Set TIKTOK_CLIENT_KEY and TIKTOK_CLIENT_SECRET in .env first.")
    return RedirectResponse(tiktok.authorize_url())


@router.get("/callback")
def callback(code: str | None = None, state: str = "", error: str | None = None, error_description: str = ""):
    if error or not code:
        return RedirectResponse(f"{config.FRONTEND_URL}?tiktok=error&reason={error or 'no_code'}")
    try:
        tiktok.exchange_code(code, state)
    except tiktok.TikTokError as exc:
        raise HTTPException(400, str(exc))
    return RedirectResponse(f"{config.FRONTEND_URL}?tiktok=connected")


@router.post("/disconnect")
def disconnect():
    tiktok.disconnect()
    return {"connected": False}
