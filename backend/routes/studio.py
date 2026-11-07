"""Simple one-page UI for the TikTok feature: GET /studio (served by the API, same origin)."""
from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter
from fastapi.responses import HTMLResponse

router = APIRouter(tags=["studio"])
STUDIO_HTML = Path(__file__).resolve().parent.parent / "static" / "studio.html"


def render_studio(api_base: str = "") -> HTMLResponse:
    """The page, with the backend base URL filled in ("" = same origin)."""
    html = STUDIO_HTML.read_text(encoding="utf-8").replace("__STUDIO_API__", api_base.rstrip("/"))
    return HTMLResponse(html, headers={"Cache-Control": "no-cache"})


@router.get("/studio", include_in_schema=False)
def studio() -> HTMLResponse:
    return render_studio("")
