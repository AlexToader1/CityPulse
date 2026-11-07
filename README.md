# CityPulse

<img width="733" height="379" alt="image" src="https://github.com/user-attachments/assets/9134f71e-a021-45f9-b0b8-88dd27d3e953" />
<img width="733" height="379" alt="image" src="https://github.com/user-attachments/assets/253d38b5-af3d-4200-a92a-aef904b2dc8f" />
<img width="733" height="379" alt="image" src="https://github.com/user-attachments/assets/465642fa-af60-4451-8112-93d3f033ec2b" />

___


**CityPulse** takes one **master ad** and automatically tailors it for every city where it runs.

1. You upload your master ad and pick a business category.
2. CityPulse computes the **Brand DNA** (palette, tone, master copy, call to action).
3. For each Romanian city it scores how unusual the local situation is **compared with that city's own normal**: weather, events, holidays and search trends.
4. Cities with a high score get a **new AI-generated visual and new copy**. Medium cities get new copy only. Quiet cities keep the master ad.
5. The tailored ad is checked against advertising rules, composed into a finished ad (photo + headline + body + button), and exported as a PNG.

There is also a TikTok feature that turns a product link or photos into short vertical videos.

---

## Table of contents

- [How it decides what to generate](#how-it-decides-what-to-generate)
- [Architecture](#architecture)
- [Project structure](#project-structure)
- [Requirements](#requirements)
- [Setup and running](#setup-and-running)
- [Environment variables](#environment-variables)
- [API reference](#api-reference)
- [Using the app](#using-the-app)
- [Troubleshooting](#troubleshooting)
- [Data sources and limits](#data-sources-and-limits)

---

## How it decides what to generate

Each city gets a score from 0 to 100 made of signals. Every signal adds "strength" points, and the total decides the action:

| Score | Action | What happens |
|-------|--------|--------------|
| 60 and above | `GENERATE` | New AI image **and** new copy |
| 30 to 59 | `LIGHT_TOUCH` | New copy only, master image kept |
| below 30 | `SKIP` | Master ad kept, nothing generated, $0 |

The thresholds live in `backend/services/signals.py` (`THRESHOLDS`) and are mirrored in `frontend/src/lib/citypulse/config.ts`. Keep both in sync.

**Signals are judged against the city's own normal, not against other cities:**

| Signal | Source | How it is made relative |
|--------|--------|-------------------------|
| Weather | Open-Meteo forecast | Compared with the same time of year over the last 3 years in the same city (Open-Meteo archive). Normal weather scores 0. Heat, unusual cold and unusually rainy days score by how far they are from that city's normal. Severe storms always count. |
| Search trends | Google Trends (per county) | Only the change versus the city's own recent history counts, not total search volume. |
| Events | `data/ro_events.json` | Each event's relevance is compared with that city's usual events, pulled toward the pool of all events (the file is small). |
| Holidays | `data/ro_holidays_namedays.json` | Fixed strength for upcoming public holidays. |

If the climate baseline cannot be downloaded, the weather signal falls back to fixed absolute rules.

---

## Architecture

```
┌──────────────────────────── Browser (Next.js, port 3000) ────────────────────────────┐
│  Landing → Upload master ad → Dashboard (heatmap + signal feed + Ad Studio)          │
│                                                                                      │
│  lib/citypulse/api.ts        talks to the backend (or built-in mock data)            │
│  lib/citypulse/render-ad.ts  draws the finished ad on a canvas: preview + PNG export │
└──────────────────────────────────────────┬───────────────────────────────────────────┘
                                           │ JSON / multipart over HTTP
┌──────────────────────────────────────────▼───────────────────────────────────────────┐
│                          FastAPI backend (port 8000)                                 │
│                                                                                      │
│  POST /api/brand            upload → Brand DNA (palette, tone, master copy, CTA)     │
│  POST /api/cities           per-city score, signals, action, motif, default copy     │
│  POST /api/generate-ad      city-specific copy (Gemini, rule-based fallback)         │
│  POST /api/generate-ad-image  edit/re-imagine the master image (Gemini image model)  │
│  POST /api/compliance       advertising-rules check + auto-fix                       │
│  /api/video/*, /api/tiktok/*  TikTok video feature                                   │
└───────┬──────────────────┬───────────────────────────┬───────────────────────┬───────┘
        │                  │                           │                       │
   ┌────▼─────┐      ┌─────▼───────┐            ┌──────▼───────┐        ┌──────▼──────┐
   │Open-Meteo│      │Google Trends│            │ data/*.json  │        │  Gemini API │
   │ forecast │      │ (pytrends)  │            │ cities,      │        │ copy + image│
   │ + archive│      │ per county  │            │ events,      │        └─────────────┘
   └──────────┘      └─────────────┘            │ holidays,    │
                                                │ ad rules     │
                                                └──────────────┘
```

### Request flow for one ad

1. **Upload** → `POST /api/brand` reads the image with Pillow, extracts a palette, guesses the tone from the main colour, and returns the master headline, body and CTA for the chosen category. The browser keeps the uploaded image as a local object URL.
2. **Dashboard** → `POST /api/cities` builds one result per city: weather (forecast + climate baseline), events, holidays and search trends are turned into signals, summed into a score, and mapped to an action and a motif (`storm`, `heat`, `festival`, `greeting`, `plain`).
3. **Ad Studio** (click a city):
   - `POST /api/generate-ad` writes tailored copy with Gemini. Rule-based copy is the fallback.
   - `POST /api/generate-ad-image` (only when the action is `GENERATE`) sends the master image plus brand DNA and local signals to Gemini's image model and gets back a re-imagined visual with related elements. The image comes back inline as a base64 data URL and is also cached in `backend/storage/ads/`.
   - If Gemini fails (missing package, quota, refusal), a local Pillow effect (colour tint plus a motif overlay) is used and the UI shows a yellow note with the reason.
   - `POST /api/compliance` checks the copy against `data/ro_ad_rules.json` and auto-fixes or blocks claims such as "cel mai bun" or "garantat".
4. **Compose and export** → the browser draws the photo, a dark gradient, the headline, body text and a brand-coloured button on a canvas. The same function renders the on-screen preview and the downloaded PNG (Instagram feed 1080×1080, Instagram story 1080×1920).

### Design decisions

- **Text is drawn by the app, never by the image model.** Image models misspell text, especially Romanian diacritics, so the prompt forbids text and `render-ad.ts` adds it.
- **Graceful fallbacks everywhere.** No Gemini key, no Google Trends, or no climate data: the app still runs and tells you what is missing.
- **Export is client-side.** It works from the preview image, needs no extra request, and also works in mock mode.
- **Caching.** Weather is cached 15 minutes, climate normals 24 hours, Google Trends 6 hours (also saved to `backend/storage/trends_cache.json`), generated images by a hash of image + prompt.

---

## Project structure

```
.
├── backend/
│   ├── main.py                 FastAPI app, CORS, router registration
│   ├── run.py                  Start script (uvicorn with reload)
│   ├── config.py               Settings read from the root .env
│   ├── routes/
│   │   ├── brand.py            POST /api/brand
│   │   ├── cities.py           POST/GET /api/cities
│   │   ├── ad.py               POST /api/generate-ad
│   │   ├── ad_image.py         POST /api/generate-ad-image
│   │   ├── compliance.py       POST /api/compliance
│   │   ├── export.py           POST /api/export (legacy, returns a file name)
│   │   ├── status.py           GET /api/status, /api/events/{city}
│   │   ├── video.py, tiktok.py, studio.py   TikTok feature
│   ├── services/
│   │   ├── signals.py          Scoring: weather, climate baseline, trends, events, copy
│   │   ├── compliance_rules.py Ad-rule checker
│   │   ├── firefly.py, elevenlabs.py, product.py, tiktok.py
│   ├── video/                  Video pipeline (script, scenes, render, jobs)
│   └── storage/                Generated files (served at /media), trends cache
├── ml/
│   ├── signals/                Open-Meteo, events, Google Trends helpers
│   ├── agent/decide.py         Local-context lookup and Gemini insight agent
│   ├── brand_dna/              Palette, tone, typography helpers
│   └── compliance/             Compliance checking helpers
├── data/                       ro_cities, ro_events, ro_holidays_namedays, ro_ad_rules
├── contracts/                  JSON shape contracts between frontend and backend
├── frontend/src/               Next.js app
│   ├── app/                    Next.js app router (layout, page)
│   ├── components/citypulse/   Landing, upload, dashboard, heatmap, ad-studio, ad-preview
│   └── lib/citypulse/          api.ts, types.ts, config.ts, render-ad.ts, mock-data.ts
├── requirements.txt            Python dependencies
├── .env.example                Template for the root .env
└── RUN.md                      Short run notes
```

---

## Requirements

- **Python 3.10 or newer**
- **Node.js 18 or newer** and npm (or pnpm)
- A **Gemini API key** for tailored copy and AI images. The app runs without it, using the fallbacks above.
- **Billing enabled on the Google project** if you want real AI image generation. Image models are usually not part of the free tier, and you will see `429 RESOURCE_EXHAUSTED` without it.
- About 1 GB of free disk space for the Python environment.

---

## Setup and running

You need **two terminals**: one for the backend, one for the frontend.

### 1. Clone and enter the project

```bash
cd path/to/project
```

If the folder name contains spaces or parentheses, put the path in quotes.

### 2. Configure environment variables

```bash
cp .env.example .env
```

Open `.env` in the **repo root** (next to `requirements.txt`) and set at least:

```
GEMINI_API_KEY=your_key_here
```

No quotes and no spaces around `=`. See [Environment variables](#environment-variables) for the rest.

### 3. Backend (terminal 1)

```bash
python3 -m venv .venv
source .venv/bin/activate            # Windows: .venv\Scripts\activate
python3 -m pip install -r requirements.txt
python backend/run.py
```

The API runs at **http://localhost:8000**, with interactive docs at **http://localhost:8000/docs**.

On macOS with Homebrew Python you must use a virtual environment, otherwise pip reports `externally-managed-environment`.

**Lighter install** (if disk space is tight). The server does not import scikit-learn or scipy, so this is enough for the image feature:

```bash
python3 -m pip install --no-cache-dir fastapi uvicorn python-multipart Pillow python-dotenv httpx google-genai anthropic beautifulsoup4 imageio-ffmpeg
python3 -m pip install --no-cache-dir pytrends     # optional: live Google Trends signal
```

Every time you open a new terminal, run `source .venv/bin/activate` before `python backend/run.py`.

### 4. Frontend (terminal 2)

```bash
cd frontend/src
npm install                          # or pnpm install
npm run dev
```

The app runs at **http://localhost:3000**.

The frontend reads the API address from `frontend/src/.env.local`:

```
NEXT_PUBLIC_CITYPULSE_API_URL=http://127.0.0.1:8000/api
```

Set it to an empty string to run on **built-in mock data** with no backend. In mock mode there is no AI image and no live signals, but the preview and export still work.

### 5. Check that everything is connected

- `http://127.0.0.1:8000/api/health` should return `{"status":"ok"}`.
- `http://127.0.0.1:8000/api/status` should show `"gemini": true`. If it shows `false`, the key was not loaded: check the file location and restart the backend.
- The backend terminal prints a line like `ad image ready: ... (gemini, 240 KB)` after every generated image.

---

## Environment variables

All backend variables go in the root `.env`. The file is read when the backend starts, so restart after changing it.

| Variable | Required | Purpose |
|----------|----------|---------|
| `GEMINI_API_KEY` | Recommended | Tailored copy and AI image generation |
| `GEMINI_MODEL` | No | Text model for copy (default set in code) |
| `GEMINI_IMAGE_MODEL` | No | Image model (default `gemini-2.5-flash-image`) |
| `ANTHROPIC_API_KEY`, `CLAUDE_MODEL` | Video feature | Claude writes the TikTok video scripts |
| `TICKETMASTER_API_KEY` | No | Has no effect for Romanian cities |
| `CITYPULSE_LIVE_TRENDS` | No | `1` (default) uses Google Trends, `0` skips it |
| `CITYPULSE_DEMO_EVENTS` | No | `1` also shows demo events re-dated to the next weekend |
| `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID` | Video feature | Voiceover |
| `FIREFLY_CLIENT_ID`, `FIREFLY_CLIENT_SECRET` | Video feature | Adobe Firefly 9:16 expand |
| `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET`, `TIKTOK_REDIRECT_URI` | Video feature | TikTok posting |
| `FRONTEND_URL`, `CORS_ORIGINS` | No | Extra allowed frontend origins |
| `PUBLIC_BASE_URL`, `STORAGE_DIR`, `REDIS_URL`, `MAX_PARALLEL_JOBS` | No | Infrastructure options |

Never commit the real `.env` file.

---

## API reference

All routes are under `/api` and the backend allows `localhost:3000` and `localhost:5173` by default.

| Method and path | Body | Returns |
|-----------------|------|---------|
| `GET /api/health` | none | `{"status":"ok"}` |
| `GET /api/status` | none | Which integrations are live |
| `GET /api/cities` | none | Every supported city (id, name, county, lat, lon) |
| `POST /api/cities` | `{cities: string[], category}` | One result per city: score, action, signals, reason, motif, headline, body, compliance, cost |
| `GET /api/events/{city_id}` | none | The city's upcoming events |
| `POST /api/brand` | multipart: `file`, `category` | Brand DNA: name, swatches, tone, master copy, CTA |
| `POST /api/generate-ad` | `{city, brand}` | Tailored headline, body, motif, reason |
| `POST /api/generate-ad-image` | multipart: `file`, `city` (JSON), `brand` (JSON), `force` | `{imageUrl, imageData, source, detail?}`. `source` is `gemini`, `cache`, `local`, `fallback` or `skipped`. |
| `POST /api/compliance` | `{city, headline, body, draft, edited?}` | `{status: passed | fixed | blocked, note}` |
| `POST /api/video/jobs` | multipart: link or images | TikTok video job |
| `GET /api/video/jobs/{id}` | none | Job status and variants |

Generated images and videos are served from `/media`.

---

## Using the app

1. Open **http://localhost:3000** and start from the landing page.
2. **Upload** your master ad (PNG, JPG or WebP, up to 10 MB) and choose a business category and the cities to cover.
3. The **dashboard** shows a heatmap of Romania with a score for each city, plus a live signal feed. "Simulate event" lets you inject a fake event to see the scores react.
4. **Click a city.** The Ad Studio shows:
   - **Master** tab: your uploaded ad.
   - **Tailored** tab: the composed ad with the new visual and copy.
   - "Why this ad" explains which signals caused it. A yellow note appears if the AI image fell back to the local effect.
   - The compliance status. Copy that is **Held back** cannot be exported.
5. Use **Regenerate** for a new image and copy (this is the only action that spends image-generation tokens again), **Edit copy** to change the text (the rules are re-checked), and **Export** to save a PNG:
   - Instagram feed, 1080 × 1080
   - Instagram story, 1080 × 1920
6. **Post** opens the TikTok studio page with your image attached.

---

## Troubleshooting

| Problem | Cause and fix |
|---------|---------------|
| `No module named 'google'` | The backend is not running in the environment where `google-genai` is installed. Activate `.venv` and run `python3 -m pip install google-genai`, then restart. |
| `error: externally-managed-environment` | Homebrew Python. Use a virtual environment (see [Setup](#3-backend-terminal-1)). |
| `No space left on device` during install | Free disk space (delete old project copies, empty the Trash, `python3 -m pip cache purge`) and use the lighter install. |
| `429 RESOURCE_EXHAUSTED` | The Google project has no quota for image generation. Enable billing for the project. Until then the local effect is used. |
| `/api/status` shows `"gemini": false` | The key is not in the root `.env`, or the backend was not restarted. |
| Image looks like only a tint plus dots | That is the local fallback. Read the yellow note under "Why this ad" for the reason. |
| Tailored image never changes | Only cities with a score of 60 or more (`GENERATE`) get a new image. Pick a high-score city and press Regenerate. |
| Export button disabled | The copy is **Held back** by the compliance check. Edit the copy and save. |
| First dashboard load is slow | The backend is downloading each city's seasonal normals and Google Trends data. Both are cached afterwards. |
| No search signal for a city | Google blocked Trends requests. The last real data (up to 7 days old) is reused, otherwise the city simply has no search signal. |
| Frontend cannot reach the API | Check that the backend is running on port 8000 and that `NEXT_PUBLIC_CITYPULSE_API_URL` is correct. Restart `npm run dev` after editing `.env.local`. |

---

## Data sources and limits

- **Weather:** Open-Meteo forecast and archive APIs. No key needed.
- **Events:** a hand-curated list in `data/ro_events.json` with source links. Ticketmaster has no events in Romania, so the key has no effect there.
- **Search interest:** Google Trends through `pytrends`, queried per county. Cached for 6 hours.
- **Holidays and name days:** `data/ro_holidays_namedays.json`.
- **Advertising rules:** `data/ro_ad_rules.json`, checked by `backend/services/compliance_rules.py`. This is a helper, not legal advice.
- **Cost model:** each action has an estimated cost and time saved (`GENERATE` $0.14 and 45 minutes, `LIGHT_TOUCH` $0.03 and 20 minutes, `SKIP` $0). These numbers are estimates used for the dashboard stats, not billing data.
