"""Data models for the TikTok video feature (also exported to contracts/video_job.json)."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Literal, Optional

from pydantic import BaseModel, Field


class Product(BaseModel):
    """Shared product shape. Other features can reuse it."""

    url: Optional[str] = None
    title: str = ""
    description: str = ""
    price: Optional[str] = None
    currency: Optional[str] = None
    brand: Optional[str] = None
    image_urls: list[str] = Field(default_factory=list)


# ---- What Claude returns (structured output) --------------------------------
class ScriptLine(BaseModel):
    image_index: int = Field(description="0-based index of the product image shown during this line")
    text: str = Field(description="One spoken sentence of voiceover")


class VideoScript(BaseModel):
    angle: str = Field(description="Short name of the creative angle, e.g. 'problem-solution'")
    lines: list[ScriptLine] = Field(description="Voiceover lines in order. First = hook, last = call to action")
    caption: str = Field(description="TikTok post caption (without hashtags)")
    hashtags: list[str] = Field(description="3-6 hashtags without the # sign")


class ScriptSet(BaseModel):
    product_summary: str = Field(description="One sentence: what the product is and who it is for")
    variants: list[VideoScript]


# ---- Job state ---------------------------------------------------------------
class WordTiming(BaseModel):
    word: str
    start: float
    end: float


class Variant(BaseModel):
    id: str
    script: VideoScript
    status: Literal["pending", "rendering", "done", "failed"] = "pending"
    video_url: Optional[str] = None
    duration: Optional[float] = None
    error: Optional[str] = None


class PublishResult(BaseModel):
    variant_id: str
    mode: Literal["direct", "draft"]
    publish_id: Optional[str] = None
    status: str = "submitted"
    privacy_level: Optional[str] = None
    error: Optional[str] = None


JobStatus = Literal["queued", "running", "done", "failed"]


class VideoJob(BaseModel):
    id: str
    status: JobStatus = "queued"
    step: str = "queued"
    progress: float = 0.0
    language: str = "en"
    n_variants: int = 3
    brand_tone: Optional[str] = None
    product: Product = Field(default_factory=Product)
    product_summary: Optional[str] = None
    variants: list[Variant] = Field(default_factory=list)
    publishes: list[PublishResult] = Field(default_factory=list)
    cost: Optional[dict] = None
    warnings: list[str] = Field(default_factory=list)
    error: Optional[str] = None
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
