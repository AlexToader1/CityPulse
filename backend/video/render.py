"""ffmpeg rendering: Ken Burns image scenes + caption overlay + voiceover (+ music)."""
from __future__ import annotations

import json
import random
import shutil
import subprocess
from functools import lru_cache
from pathlib import Path

from backend import config

MUSIC_DIR = Path(__file__).parent / "assets" / "music"


@lru_cache(maxsize=1)
def ffmpeg_exe() -> str:
    """System ffmpeg if installed, else the static binary shipped with imageio-ffmpeg."""
    system = shutil.which("ffmpeg")
    if system:
        return system
    import imageio_ffmpeg

    return imageio_ffmpeg.get_ffmpeg_exe()


def probe_duration(path: Path) -> float:
    """Media duration in seconds (parsed from ffmpeg's stderr; no ffprobe needed)."""
    result = subprocess.run([ffmpeg_exe(), "-hide_banner", "-i", str(path)], capture_output=True, text=True)
    for line in result.stderr.splitlines():
        line = line.strip()
        if line.startswith("Duration:"):
            h, m, s = line.split(",")[0].split("Duration:")[1].strip().split(":")
            return int(h) * 3600 + int(m) * 60 + float(s)
    raise RuntimeError(f"Could not read duration of {path}")


def pick_music() -> Path | None:
    tracks = [p for p in MUSIC_DIR.glob("*") if p.suffix.lower() in (".mp3", ".m4a", ".wav")]
    return random.choice(tracks) if tracks else None


def _kenburns_filter(index: int, frames: int, w: int, h: int, fps: int) -> str:
    """Alternating zoom-in / zoom-out with a slight drift so scenes feel different."""
    zoom = 0.12
    if index % 2 == 0:
        z = f"1+{zoom}*on/{frames}"
    else:
        z = f"{1 + zoom}-{zoom}*on/{frames}"
    drift = ["iw/2-(iw/zoom/2)", "(iw-iw/zoom)*on/{f}", "(iw-iw/zoom)*(1-on/{f})"][index % 3].format(f=frames)
    # Upscale first: zoompan rounds coordinates to whole pixels, which jitters at 1x.
    return (
        f"[{index}:v]scale={w * 2}:{h * 2},"
        f"zoompan=z='{z}':x='{drift}':y='ih/2-(ih/zoom/2)':d={frames}:s={w}x{h}:fps={fps},"
        f"setsar=1,format=yuv420p[s{index}]"
    )


def render_video(
    scene_images: list[Path],
    scene_durations: list[float],
    voice: Path,
    captions_concat: Path,
    out_path: Path,
    music: Path | None = None,
) -> Path:
    w, h, fps = config.VIDEO_WIDTH, config.VIDEO_HEIGHT, config.VIDEO_FPS
    frame_counts = [max(1, round(d * fps)) for d in scene_durations]
    total = sum(frame_counts) / fps

    cmd = [ffmpeg_exe(), "-y", "-hide_banner", "-loglevel", "error"]
    for img in scene_images:
        cmd += ["-i", str(img)]
    n = len(scene_images)
    cmd += ["-i", str(voice)]                                   # n
    cmd += ["-f", "concat", "-safe", "0", "-i", str(captions_concat)]  # n+1
    if music:
        cmd += ["-stream_loop", "-1", "-i", str(music)]         # n+2

    parts = [_kenburns_filter(i, frame_counts[i], w, h, fps) for i in range(n)]
    parts.append("".join(f"[s{i}]" for i in range(n)) + f"concat=n={n}:v=1:a=0[base]")
    parts.append(f"[{n + 1}:v]fps={fps},format=rgba[cap]")
    parts.append("[base][cap]overlay=0:0:format=auto:shortest=0,scale=in_range=auto:out_range=tv,format=yuv420p[v]")
    if music:
        parts.append(f"[{n + 2}:a]volume=0.12[m]")
        parts.append(f"[{n}:a][m]amix=inputs=2:duration=first:dropout_transition=0:normalize=0[a]")
        audio_map = "[a]"
    else:
        audio_map = f"{n}:a"

    cmd += [
        "-filter_complex", ";".join(parts),
        "-map", "[v]", "-map", audio_map,
        "-t", f"{total:.3f}",
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "21", "-pix_fmt", "yuv420p", "-r", str(fps),
        "-c:a", "aac", "-b:a", "160k", "-ar", "44100", "-ac", "2", "-color_range", "tv",
        "-movflags", "+faststart",
        str(out_path),
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(f"ffmpeg failed: {result.stderr[-1500:]}")
    (out_path.parent / "render_cmd.json").write_text(json.dumps(cmd))
    return out_path
