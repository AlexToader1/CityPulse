"""Export ad endpoint."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter()
FORMATS = {"instagram_feed": "feed-1080x1080", "instagram_story": "story-1080x1920"}


class ExportRequest(BaseModel):
    city: str
    format: str  # 'instagram_feed' or 'instagram_story'


@router.post("/export")
def export_ad(request: ExportRequest) -> dict[str, Any]:
    if request.format not in FORMATS:
        raise HTTPException(status_code=400, detail=f"Unknown format: {request.format}")
    return {
        "fileName": f"citypulse-{request.city.lower()}-{FORMATS[request.format]}.png",
        "format": request.format,
    }
