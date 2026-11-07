"""TikTok video feature: create jobs, poll them, publish a variant."""
from __future__ import annotations

from typing import Literal, Optional

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from pydantic import BaseModel

from backend import config
from backend.services import product as product_service
from backend.services import tiktok
from backend.video import jobs
from backend.video.models import Product, PublishResult, VideoJob

router = APIRouter(prefix="/api/video", tags=["video"])
MAX_UPLOAD_BYTES = 15 * 1024 * 1024


@router.post("/jobs", response_model=VideoJob, status_code=202)
async def create_job(
    url: Optional[str] = Form(None, description="Product page link"),
    images: list[UploadFile] = File(
        default=[],
        description="Optional product images",
        # Makes Swagger UI (/docs) show a file picker instead of a text box
        json_schema_extra={"items": {"type": "string", "format": "binary"}},
    ),
    title: Optional[str] = Form(None),
    description: Optional[str] = Form(None),
    language: Literal["en", "ro"] = Form("en"),
    n_variants: int = Form(3, ge=1, le=4),
    brand_tone: Optional[str] = Form(None),
):
    """Paste a link and/or upload images -> starts generating TikTok variants."""
    images = [f for f in images if f.filename]
    if not url and not images:
        raise HTTPException(400, "Provide a product URL or at least one image.")
    job = VideoJob(
        id=jobs.new_job_id(),
        language=language,
        n_variants=n_variants,
        brand_tone=brand_tone,
        product=Product(url=url or None, title=title or "", description=description or ""),
    )
    upload_dir = jobs.job_dir(job.id) / "uploads"
    upload_dir.mkdir(parents=True, exist_ok=True)
    for i, f in enumerate(images[:6]):
        data = await f.read()
        if len(data) > MAX_UPLOAD_BYTES:
            raise HTTPException(413, f"{f.filename} is larger than 15 MB")
        (upload_dir / f"{i:02d}").write_bytes(data)
    jobs.save(job)
    jobs.submit(job.id)
    return job


@router.post("/staged-images", status_code=201)
async def stage_image(image: UploadFile = File(..., description="Image to pre-load into the /studio page")):
    """Stores an image sent by another page (e.g. the ad from the main app) so /studio can open
    with it already added: /studio?staged=<id>."""
    data = await image.read()
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(413, "Image is larger than 15 MB")
    staged_id = jobs.new_job_id()
    dest = config.STORAGE_DIR / "staged" / f"{staged_id}.jpg"
    try:
        saved = product_service.normalize_image(data, dest)
    except Exception:
        raise HTTPException(400, "Not a valid image")
    if not saved:
        raise HTTPException(400, "Image is too small (minimum 300 px on the shorter side)")
    return {"id": staged_id, "url": f"/media/staged/{staged_id}.jpg"}


@router.get("/jobs", response_model=list[VideoJob])
def list_jobs(limit: int = 20):
    return jobs.list_jobs(limit)


@router.get("/jobs/{job_id}", response_model=VideoJob)
def get_job(job_id: str):
    job = jobs.load(job_id)
    if not job:
        raise HTTPException(404, "Job not found")
    return job


class PublishRequest(BaseModel):
    variant_id: str = "v1"
    mode: Literal["direct", "draft"] = "direct"
    privacy_level: Optional[str] = None  # e.g. SELF_ONLY, PUBLIC_TO_EVERYONE (needs audited app)

    # Pre-fills the request body in the /docs page
    model_config = {"json_schema_extra": {"example": {"variant_id": "v1", "mode": "direct"}}}


@router.post("/jobs/{job_id}/publish", response_model=PublishResult)
def publish(job_id: str, req: PublishRequest):
    """Posts an approved variant to the connected TikTok account."""
    job = jobs.load(job_id)
    if not job:
        raise HTTPException(404, "Job not found")
    variant = next((v for v in job.variants if v.id == req.variant_id), None)
    if not variant or variant.status != "done" or not variant.video_url:
        raise HTTPException(400, "Variant is not ready")
    if not tiktok.is_configured():
        raise HTTPException(400, "TikTok is not configured (TIKTOK_CLIENT_KEY / TIKTOK_CLIENT_SECRET).")

    video_path = config.STORAGE_DIR / variant.video_url.removeprefix("/media/")
    tags = " ".join(f"#{t}" for t in variant.script.hashtags)
    title = f"{variant.script.caption} {tags}".strip()
    result = PublishResult(variant_id=variant.id, mode=req.mode)
    try:
        if req.mode == "direct":
            result.publish_id, result.privacy_level = tiktok.publish_direct(video_path, title, req.privacy_level)
        else:
            result.publish_id = tiktok.upload_draft(video_path)
    except tiktok.TikTokError as exc:
        raise HTTPException(502, str(exc))
    job = jobs.load(job_id) or job  # re-read: the worker may have saved meanwhile
    job.publishes.append(result)
    jobs.save(job)
    return result


@router.get("/publish/{publish_id}")
def publish_status(publish_id: str):
    """TikTok processing status: PROCESSING_UPLOAD, PUBLISH_COMPLETE, FAILED, ..."""
    try:
        return tiktok.publish_status(publish_id)
    except tiktok.TikTokError as exc:
        raise HTTPException(502, str(exc))
