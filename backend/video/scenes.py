"""Scene planning: 9:16 frames, scene timings and TikTok-style word-by-word captions."""
from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageEnhance, ImageFilter, ImageFont, ImageOps

from backend import config
from backend.video.models import ScriptLine, WordTiming

FONT_PATH = Path(__file__).parent / "assets" / "fonts" / "Anton-Regular.ttf"
CAPTION_Y = 0.74          # vertical center of captions (fraction of height); clear of TikTok UI
MAX_WORDS_PER_CHUNK = 3
MAX_CHARS_PER_CHUNK = 18
HIGHLIGHT = (255, 225, 77, 255)
WHITE = (255, 255, 255, 255)
STROKE = (0, 0, 0, 255)


# ---- Frames ------------------------------------------------------------------
def blur_fill_vertical(src: Path, dest: Path) -> Path:
    """Classic TikTok look: blurred zoomed copy as background, sharp product on top."""
    w, h = config.VIDEO_WIDTH, config.VIDEO_HEIGHT
    img = Image.open(src).convert("RGB")
    bg = ImageOps.fit(img, (w, h), Image.LANCZOS).filter(ImageFilter.GaussianBlur(45))
    bg = ImageEnhance.Brightness(bg).enhance(0.7)
    fg = img.copy()
    fg.thumbnail((int(w * 0.94), int(h * 0.56)), Image.LANCZOS)
    if fg.width < w * 0.7:  # upscale small images so the product fills the frame
        scale = min((w * 0.8) / fg.width, (h * 0.56) / fg.height)
        fg = fg.resize((int(fg.width * scale), int(fg.height * scale)), Image.LANCZOS)
    x, y = (w - fg.width) // 2, int(h * 0.38 - fg.height / 2)
    shadow = Image.new("RGBA", (fg.width + 60, fg.height + 60), (0, 0, 0, 0))
    ImageDraw.Draw(shadow).rectangle([30, 30, fg.width + 30, fg.height + 30], fill=(0, 0, 0, 140))
    shadow = shadow.filter(ImageFilter.GaussianBlur(20))
    bg.paste(shadow, (x - 30, y - 18), shadow)
    bg.paste(fg, (x, y))
    bg.save(dest, "JPEG", quality=92)
    return dest


def cover_vertical(src: Path, dest: Path) -> Path:
    """Crops/scales an already-vertical image (e.g. Firefly output) to exact size."""
    img = ImageOps.fit(Image.open(src).convert("RGB"), (config.VIDEO_WIDTH, config.VIDEO_HEIGHT), Image.LANCZOS)
    img.save(dest, "JPEG", quality=92)
    return dest


# ---- Timings -----------------------------------------------------------------
def scene_durations(lines: list[ScriptLine], words: list[WordTiming], audio_duration: float, tail: float = 0.7) -> list[float]:
    """One scene per script line: starts when the line's first word is spoken."""
    counts = [len(line.text.split()) for line in lines]
    expected = sum(counts)
    starts: list[float] = []
    idx = 0
    for count in counts:
        # If the TTS tokenization differs, map proportionally onto the real word list.
        mapped = round(idx * len(words) / expected) if expected else 0
        mapped = min(mapped, len(words) - 1)
        starts.append(words[mapped].start if words else 0.0)
        idx += count
    starts[0] = 0.0
    end = audio_duration + tail
    bounds = starts + [end]
    durations = [max(0.6, bounds[i + 1] - bounds[i]) for i in range(len(lines))]
    # Keep total equal to the audio length + tail after enforcing minimums.
    scale = end / sum(durations)
    return [d * scale for d in durations]


# ---- Captions ----------------------------------------------------------------
def chunk_words(words: list[WordTiming]) -> list[list[int]]:
    chunks: list[list[int]] = []
    current: list[int] = []
    chars = 0
    for i, w in enumerate(words):
        if current and (len(current) >= MAX_WORDS_PER_CHUNK or chars + len(w.word) > MAX_CHARS_PER_CHUNK):
            chunks.append(current)
            current, chars = [], 0
        current.append(i)
        chars += len(w.word) + 1
        if w.word[-1:] in ".!?,:;":
            chunks.append(current)
            current, chars = [], 0
    if current:
        chunks.append(current)
    return chunks


def _font(size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(str(FONT_PATH), size)


def _render_caption(tokens: list[str], active: int, dest: Path) -> Path:
    w, h = config.VIDEO_WIDTH, config.VIDEO_HEIGHT
    size = int(w * 0.105)
    font = _font(size)
    canvas = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    draw = ImageDraw.Draw(canvas)
    space = draw.textlength(" ", font=font)
    max_width = w * 0.86

    # Greedy wrap into lines of token indexes.
    lines: list[list[int]] = [[]]
    width = 0.0
    for i, tok in enumerate(tokens):
        tw = draw.textlength(tok, font=font)
        if lines[-1] and width + space + tw > max_width:
            lines.append([])
            width = 0.0
        width += (space if lines[-1] else 0) + tw
        lines[-1].append(i)

    line_h = int(size * 1.15)
    y = int(h * CAPTION_Y - line_h * len(lines) / 2)
    stroke = max(4, size // 11)
    for line in lines:
        line_w = sum(draw.textlength(tokens[i], font=font) for i in line) + space * (len(line) - 1)
        x = (w - line_w) / 2
        for i in line:
            fill = HIGHLIGHT if i == active else WHITE
            draw.text((x + 6, y + 8), tokens[i], font=font, fill=(0, 0, 0, 110))  # drop shadow
            draw.text((x, y), tokens[i], font=font, fill=fill, stroke_width=stroke, stroke_fill=STROKE)
            x += draw.textlength(tokens[i], font=font) + space
        y += line_h
    canvas.save(dest, "PNG", optimize=True)
    return dest


def build_captions(words: list[WordTiming], total_duration: float, out_dir: Path) -> Path:
    """Renders one PNG per spoken word (its chunk, active word highlighted) and writes an
    ffmpeg concat-demuxer file that shows each PNG for the right amount of time."""
    out_dir.mkdir(parents=True, exist_ok=True)
    w, h = config.VIDEO_WIDTH, config.VIDEO_HEIGHT
    blank = out_dir / "blank.png"
    Image.new("RGBA", (w, h), (0, 0, 0, 0)).save(blank, "PNG")

    timeline: list[tuple[Path, float, float]] = []  # (png, start, end)
    for c, chunk in enumerate(chunk_words(words)):
        tokens = [words[i].word.upper() for i in chunk]
        for pos, i in enumerate(chunk):
            start = words[i].start
            if pos + 1 < len(chunk):
                end = words[chunk[pos + 1]].start
            else:
                nxt = words[i + 1].start if i + 1 < len(words) else total_duration
                end = min(nxt, words[i].end + 0.35)
            png = _render_caption(tokens, pos, out_dir / f"cap_{c:03d}_{pos}.png")
            timeline.append((png, start, max(end, start + 0.05)))

    entries: list[tuple[Path, float]] = []
    t = 0.0
    for png, start, end in timeline:
        if start > t + 0.01:
            entries.append((blank, start - t))
        entries.append((png, end - max(start, t)))
        t = end
    if total_duration > t:
        entries.append((blank, total_duration - t))

    concat = out_dir / "captions.txt"
    lines = ["ffconcat version 1.0"]
    for png, dur in entries:
        if dur <= 0:
            continue
        lines += [f"file '{png.resolve().as_posix()}'", f"duration {dur:.3f}"]
    lines.append(f"file '{entries[-1][0].resolve().as_posix()}'")  # concat demuxer quirk
    concat.write_text("\n".join(lines) + "\n")
    return concat
