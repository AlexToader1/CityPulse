"""Voiceover with word-level timestamps.

Uses ElevenLabs when ELEVENLABS_API_KEY is set. Without a key (local dev) it falls
back to macOS `say`, or to silence, with estimated word timings so the rest of the
pipeline can still be tested.
"""
from __future__ import annotations

import base64
import shutil
import subprocess
from pathlib import Path

import httpx

from backend import config
from backend.video.models import WordTiming
from backend.video.render import ffmpeg_exe, probe_duration

API_URL = "https://api.elevenlabs.io/v1/text-to-speech/{voice_id}/with-timestamps"


def synthesize(text: str, out_path: Path, language: str = "en") -> tuple[Path, list[WordTiming], str]:
    """Returns (audio_path, word_timings, provider)."""
    if config.ELEVENLABS_API_KEY:
        return (*_elevenlabs(text, out_path), "elevenlabs")
    return (*_offline(text, out_path, language), "offline")


def _elevenlabs(text: str, out_path: Path) -> tuple[Path, list[WordTiming]]:
    resp = httpx.post(
        API_URL.format(voice_id=config.ELEVENLABS_VOICE_ID),
        params={"output_format": "mp3_44100_128"},
        headers={"xi-api-key": config.ELEVENLABS_API_KEY},
        json={
            "text": text,
            "model_id": config.ELEVENLABS_MODEL,
            "voice_settings": {"stability": 0.4, "similarity_boost": 0.8, "style": 0.35},
        },
        timeout=120,
    )
    if resp.status_code >= 400:
        raise RuntimeError(f"ElevenLabs error {resp.status_code}: {resp.text[:300]}")
    data = resp.json()
    out_path = out_path.with_suffix(".mp3")
    out_path.write_bytes(base64.b64decode(data["audio_base64"]))
    alignment = data.get("alignment") or data.get("normalized_alignment")
    words = words_from_alignment(
        alignment["characters"],
        alignment["character_start_times_seconds"],
        alignment["character_end_times_seconds"],
    )
    return out_path, words


def words_from_alignment(chars: list[str], starts: list[float], ends: list[float]) -> list[WordTiming]:
    words: list[WordTiming] = []
    current, w_start, w_end = "", 0.0, 0.0
    for ch, s, e in zip(chars, starts, ends):
        if ch.isspace():
            if current:
                words.append(WordTiming(word=current, start=w_start, end=w_end))
                current = ""
            continue
        if not current:
            w_start = s
        current += ch
        w_end = e
    if current:
        words.append(WordTiming(word=current, start=w_start, end=w_end))
    return words


def estimate_timings(text: str, duration: float) -> list[WordTiming]:
    """Spreads words over the audio proportionally to their length."""
    tokens = text.split()
    weights = [len(t) + 2 for t in tokens]
    total = sum(weights) or 1
    t, words = 0.15, []
    usable = max(duration - 0.3, 0.5)
    for token, weight in zip(tokens, weights):
        span = usable * weight / total
        words.append(WordTiming(word=token, start=round(t, 3), end=round(t + span * 0.9, 3)))
        t += span
    return words


def _offline(text: str, out_path: Path, language: str) -> tuple[Path, list[WordTiming]]:
    out_path = out_path.with_suffix(".m4a")
    aiff = out_path.with_suffix(".aiff")
    say = shutil.which("say")
    if say:
        voice = ["-v", "Ioana"] if language == "ro" else []
        result = subprocess.run([say, *voice, "-o", str(aiff), text], capture_output=True)
        if result.returncode != 0 and voice:  # voice not installed -> default voice
            result = subprocess.run([say, "-o", str(aiff), text], capture_output=True)
        if result.returncode == 0:
            subprocess.run([ffmpeg_exe(), "-y", "-loglevel", "error", "-i", str(aiff), "-c:a", "aac", str(out_path)], check=True)
            aiff.unlink(missing_ok=True)
            return out_path, estimate_timings(text, probe_duration(out_path))
    duration = max(3.0, len(text.split()) * 0.38)
    subprocess.run(
        [ffmpeg_exe(), "-y", "-loglevel", "error", "-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo",
         "-t", f"{duration:.2f}", "-c:a", "aac", str(out_path)],
        check=True,
    )
    return out_path, estimate_timings(text, duration)
