"""Job storage + dispatch.

State lives in STORAGE_DIR/jobs/<id>/job.json, so API processes and workers can share it
through a common volume. Dispatch: if REDIS_URL is set and `rq` is installed, jobs go to
an RQ queue (scale by running more `rq worker video` processes); otherwise they run in a
local thread pool, which is enough for the demo.
"""
from __future__ import annotations

import threading
import uuid
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from backend import config
from backend.video.models import VideoJob

JOBS_DIR = config.STORAGE_DIR / "jobs"
JOBS_DIR.mkdir(parents=True, exist_ok=True)
_lock = threading.Lock()
_executor = ThreadPoolExecutor(max_workers=config.MAX_PARALLEL_JOBS, thread_name_prefix="video-job")


def new_job_id() -> str:
    return uuid.uuid4().hex[:12]


def job_dir(job_id: str) -> Path:
    if not job_id.isalnum():
        raise ValueError("invalid job id")
    return JOBS_DIR / job_id


def save(job: VideoJob) -> None:
    d = job_dir(job.id)
    d.mkdir(parents=True, exist_ok=True)
    tmp = d / "job.json.tmp"
    with _lock:
        tmp.write_text(job.model_dump_json(indent=2))
        tmp.replace(d / "job.json")


def load(job_id: str) -> VideoJob | None:
    try:
        path = job_dir(job_id) / "job.json"
    except ValueError:
        return None
    if not path.exists():
        return None
    with _lock:
        return VideoJob.model_validate_json(path.read_text())


def list_jobs(limit: int = 20) -> list[VideoJob]:
    paths = sorted(JOBS_DIR.glob("*/job.json"), key=lambda p: p.stat().st_mtime, reverse=True)
    return [VideoJob.model_validate_json(p.read_text()) for p in paths[:limit]]


def media_url(path: Path) -> str:
    """Public URL (relative to the API host) for a file inside STORAGE_DIR."""
    return "/media/" + path.resolve().relative_to(config.STORAGE_DIR).as_posix()


def submit(job_id: str) -> str:
    """Queues the pipeline for a job. Returns the backend used."""
    from backend.video import pipeline

    if config.REDIS_URL:
        try:
            from redis import Redis
            from rq import Queue

            Queue("video", connection=Redis.from_url(config.REDIS_URL)).enqueue(
                "backend.video.pipeline.run_job", job_id, job_timeout=900
            )
            return "rq"
        except ImportError:
            pass
    _executor.submit(pipeline.run_job, job_id)
    return "thread"
