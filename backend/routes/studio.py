"""Simple one-page UI for the TikTok feature: GET /studio."""
from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter
from fastapi.responses import FileResponse

router = APIRouter(tags=["studio"])
STUDIO_HTML = Path(__file__).resolve().parent.parent / "static" / "studio.html"


@router.get("/studio", include_in_schema=False)
def studio() -> FileResponse:
    return FileResponse(STUDIO_HTML, media_type="text/html", headers={"Cache-Control": "no-cache"})
