# Link → TikToks feature

Paste a product link (or upload photos) → Claude writes 3 script variants → each one is
voiced (ElevenLabs), turned into a 1080×1920 video with zooming product shots and
word-by-word captions (ffmpeg) → preview → approve → post to TikTok.

## Run it

```bash
uv venv --python 3.12 .venv            # or: python3.12 -m venv .venv
uv pip install -r requirements.txt     # (backend/requirements.txt lists the TikTok-specific ones)
cp .env.example .env                   # then fill in the keys
.venv/bin/uvicorn backend.main:app --reload   # run from the repo root
```

- Simple page (photos -> video -> post): http://localhost:8000/studio
- API docs to try every endpoint: http://localhost:8000/docs
- Frontend component: `frontend/src/components/VideoPreview.tsx` (calls `frontend/src/api/client.ts`)
- No system ffmpeg needed (a bundled binary is used); `brew install ffmpeg` also works.

Only `ANTHROPIC_API_KEY` is required. Without the other keys:
| Missing | Fallback |
|---|---|
| ElevenLabs | macOS `say` voice, estimated caption timing (dev only) |
| Firefly | blurred-background 9:16 fill |
| TikTok | download the MP4 and post manually |

Optional background music: drop a few royalty-free `.mp3` files into
`backend/video/assets/music/` (e.g. from Pixabay Music); one is picked per job at low volume.

## Accounts and keys

### 1. Claude (required)
console.anthropic.com → add credits (a few dollars is enough) → API Keys → `ANTHROPIC_API_KEY`.

### 2. ElevenLabs (voice)
elevenlabs.io → sign up (the free plan works for the hackathon: ~10 min of audio/month; it is
non-commercial and requires attribution) → Developers → API Keys → `ELEVENLABS_API_KEY`.
Change the voice by copying a voice ID from the Voice Library into `ELEVENLABS_VOICE_ID`.
`eleven_multilingual_v2` speaks Romanian.

### 3. TikTok (posting)
A normal TikTok account alone is **not enough**. The API only works through a registered app:

1. Create a normal TikTok account to post to (a team test account, not a personal one).
   Set it to **Private**: apps that TikTok hasn't reviewed can only post private videos.
2. Go to developers.tiktok.com, log in, then **Manage apps → Connect an app**. Fill in name, icon,
   description, category, and Terms / Privacy Policy URLs (a simple public page is fine).
   Platform: Web.
3. Add products: **Login Kit** and **Content Posting API** (turn on **Direct Post**).
   Scopes: `user.info.basic`, `video.upload`, `video.publish`.
4. Redirect URI: TikTok needs an **https** URL, so expose the backend with a tunnel:
   `cloudflared tunnel --url http://localhost:8000` (or ngrok). Register
   `https://<tunnel-host>/api/tiktok/callback` in Login Kit and set the same value
   in `TIKTOK_REDIRECT_URI`.
5. Switch the app to **Sandbox**, create a sandbox, and add your test account as a
   **target user**. Copy the sandbox Client key / Client secret into `.env`.
6. In the app, click "Connect TikTok account" (or open `/api/tiktok/login`), approve, then
   use "Approve & post" (direct, private) or "Send to drafts" (finish in the TikTok app).

Public posting requires TikTok's app review (takes days to weeks). For the demo, post
privately and show the video on the phone.

### 4. Adobe Firefly (optional, the Adobe integration)
Adobe Developer Console → new project → add **Firefly API** → OAuth Server-to-Server
credential → `FIREFLY_CLIENT_ID` / `FIREFLY_CLIENT_SECRET`. Ask the Adobe mentors whether
the hackathon provides access. Expand size: `FIREFLY_EXPAND_SIZE` (default `1080x1920`).

## API

| Method | Path | What |
|---|---|---|
| POST | `/api/video/jobs` | multipart: `url` and/or `images[]`, `language` (en/ro), `n_variants`, `brand_tone` → job (202) |
| GET | `/api/video/jobs/{id}` | job status, progress, variants with `video_url`, cost |
| POST | `/api/video/jobs/{id}/publish` | `{variant_id, mode: "direct" \| "draft"}` |
| GET | `/api/video/publish/{publish_id}` | TikTok processing status |
| GET | `/api/tiktok/status` · `/login` · `/callback` | connect the account |

Job schema: `contracts/video_job.json` (generated from `backend/video/models.py`).

## Code map

```
backend/video/pipeline.py   steps: ingest → Claude scripts → visuals → voice → render
backend/video/script.py     Claude (vision + structured output) writes the variants
backend/video/scenes.py     9:16 frames, scene timing, caption PNGs
backend/video/render.py     ffmpeg: Ken Burns + caption overlay + audio
backend/video/jobs.py       job store + queue (threads, or RQ when REDIS_URL is set)
backend/services/           product scraper, ElevenLabs, Firefly, TikTok
backend/routes/video.py     REST endpoints;  backend/routes/tiktok.py: OAuth
```

## Scaling

The API only stores the uploads and enqueues work. With `REDIS_URL` set and
`pip install redis rq`, jobs go to an RQ queue. Run as many workers as needed
(`rq worker video`, from the repo root), sharing `STORAGE_DIR` (or move media to S3/R2).

## Known limits
- Some shops block automated page reads (403/429). Upload the product photos instead.
- TikTok posting and Firefly calls follow the official docs but haven't been tested with
  live credentials yet; test them as soon as the keys exist.
