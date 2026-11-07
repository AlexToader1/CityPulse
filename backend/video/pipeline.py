"""The agent pipeline: link/images -> understand -> script -> visuals -> voice -> render."""
from __future__ import annotations

import logging
import traceback
from pathlib import Path

from backend.cost import CostReport
from backend.services import elevenlabs, firefly, product as product_service
from backend.video import jobs, render, scenes
from backend.video.models import Variant, VideoJob
from backend.video.script import generate_scripts

log = logging.getLogger(__name__)


def _update(job: VideoJob, step: str, progress: float) -> None:
    job.step, job.progress = step, round(progress, 3)
    jobs.save(job)
    log.info("job %s: %s (%.0f%%)", job.id, step, progress * 100)


def run_job(job_id: str) -> None:
    job = jobs.load(job_id)
    if job is None:
        return
    job.status = "running"
    try:
        _run(job)
        job.status, job.step, job.progress = "done", "done", 1.0
    except Exception as exc:  # report any failure to the UI instead of crashing the worker
        log.exception("job %s failed", job_id)
        job.status, job.error = "failed", str(exc)
        (jobs.job_dir(job_id) / "error.log").write_text(traceback.format_exc())
    jobs.save(job)


def _run(job: VideoJob) -> None:
    d = jobs.job_dir(job.id)
    cost = CostReport()

    # 1. Ingest -----------------------------------------------------------------
    _update(job, "Reading the product page", 0.05)
    page_text = ""
    if job.product.url:
        try:
            scraped, page_text = product_service.scrape_product(job.product.url)
            # Manual fields typed by the user win over scraped ones.
            for field in ("title", "description", "price", "currency", "brand"):
                if not getattr(job.product, field):
                    setattr(job.product, field, getattr(scraped, field))
            job.product.image_urls = scraped.image_urls
        except Exception as exc:
            job.warnings.append(f"Could not read the product page ({exc}). Using uploaded images only.")

    _update(job, "Collecting product images", 0.12)
    images: list[Path] = []
    for upload in sorted((d / "uploads").glob("*")) if (d / "uploads").exists() else []:
        try:
            path = product_service.normalize_image(upload.read_bytes(), d / "images" / f"up_{len(images)}.jpg")
        except Exception:
            path = None
        if path:
            images.append(path)
    if job.product.image_urls and len(images) < product_service.MAX_IMAGES:
        images += product_service.download_images(
            job.product.image_urls, d / "images",
            max_count=product_service.MAX_IMAGES - len(images), start_index=len(images),
        )
    if not images:
        raise RuntimeError("No usable product images. Upload at least one image (min 300px).")

    # 2. Understand + script (Claude) ----------------------------------------------
    _update(job, "Claude is writing the scripts", 0.22)
    script_set, usage = generate_scripts(
        job.product, images, n_variants=job.n_variants, language=job.language,
        brand_tone=job.brand_tone, page_text=page_text,
    )
    cost.add("Claude script (input tokens)", usage["input_tokens"], "claude_input_token")
    cost.add("Claude script (output tokens)", usage["output_tokens"], "claude_output_token")
    job.product_summary = script_set.product_summary
    job.variants = [Variant(id=f"v{i + 1}", script=s) for i, s in enumerate(script_set.variants)]

    # 3. Visuals: 9:16 frames for every image a script uses -------------------------
    _update(job, "Preparing vertical visuals", 0.38)
    (d / "frames").mkdir(exist_ok=True)
    used = sorted({line.image_index for v in job.variants for line in v.script.lines})
    frames: dict[int, Path] = {}
    use_firefly = firefly.is_configured()
    for idx in used:
        dest = d / "frames" / f"frame_{idx}.jpg"
        if use_firefly:
            try:
                expanded = firefly.expand_to_vertical(images[idx], d / "frames" / f"ff_{idx}.jpg")
                frames[idx] = scenes.cover_vertical(expanded, dest)
                cost.add(f"Firefly expand (image {idx})", 1, "firefly_image")
                continue
            except Exception as exc:
                use_firefly = False  # don't retry a broken credential for every image
                job.warnings.append(f"Firefly expand unavailable ({exc}); using blur-fill.")
        frames[idx] = scenes.blur_fill_vertical(images[idx], dest)

    # 4. Per variant: voice -> captions -> render ------------------------------------
    music = render.pick_music()
    span = 0.55 / max(1, len(job.variants))
    for n, variant in enumerate(job.variants):
        base = 0.42 + n * span
        vdir = d / variant.id
        vdir.mkdir(exist_ok=True)
        variant.status = "rendering"
        try:
            _update(job, f"Recording voiceover ({variant.id})", base)
            text = " ".join(line.text.strip() for line in variant.script.lines)
            audio, words, provider = elevenlabs.synthesize(text, vdir / "voice", job.language)
            if provider == "elevenlabs":
                cost.add(f"ElevenLabs voice ({variant.id}, chars)", len(text), "elevenlabs_char")
            elif "Using offline voice" not in " ".join(job.warnings):
                job.warnings.append("Using offline voice (set ELEVENLABS_API_KEY for the real voice).")
            audio_len = render.probe_duration(audio)

            _update(job, f"Rendering video ({variant.id})", base + span * 0.4)
            durations = scenes.scene_durations(variant.script.lines, words, audio_len)
            captions = scenes.build_captions(words, sum(durations), vdir / "captions")
            out = render.render_video(
                [frames[line.image_index] for line in variant.script.lines],
                durations, audio, captions, vdir / "video.mp4", music=music,
            )
            cost.add(f"Render ({variant.id})", 1, "render_video")
            variant.duration = round(sum(durations), 2)
            variant.video_url = jobs.media_url(out)
            variant.status = "done"
        except Exception as exc:
            log.exception("variant %s failed", variant.id)
            variant.status, variant.error = "failed", str(exc)
        jobs.save(job)

    job.cost = cost.summary()
    if not any(v.status == "done" for v in job.variants):
        raise RuntimeError("All variants failed to render: " + "; ".join(v.error or "" for v in job.variants))
