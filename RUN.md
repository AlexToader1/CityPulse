# Running CityPulse (frontend + backend linked)

## Backend (from the repo root)
    pip install -r requirements.txt
    cp .env.example .env                 # then put your keys in .env (loaded automatically)
    python backend/run.py                # http://localhost:8000  (docs at /docs)

## Frontend (the Next.js app lives in frontend/src)
    cd frontend/src
    npm install        # or pnpm install
    npm run dev        # http://localhost:3000

`frontend/src/.env.local` points the UI at the API (NEXT_PUBLIC_CITYPULSE_API_URL).
Delete that line to run on mock data only.

## Endpoints used by the UI
| UI step                    | Request                  |
|----------------------------|--------------------------|
| Upload logo/ad             | POST /api/brand (multipart: file, category) |
| Heatmap nodes              | POST /api/cities  {cities, category}        |
| Ad Studio: tailored copy   | POST /api/generate-ad {city, brand}         |
| Ad Studio: edit + recheck  | POST /api/compliance                        |
| Ad Studio: export          | POST /api/export                            |

## Data sources (all keys go in the root `.env`)
| Signal  | Source | Key |
|---------|--------|-----|
| Weather | Open-Meteo | none |
| Events  | Ticketmaster Discovery API + curated `data/ro_events.json` | `TICKETMASTER_API_KEY` |
| Search  | Google Trends via pytrends (county-level interest + momentum, cached 6h) | none (set `CITYPULSE_LIVE_TRENDS=0` to force simulated) |
| Ad copy | Gemini | `GEMINI_API_KEY` |

Check what is live: http://127.0.0.1:8000/api/status
See a city's events: http://127.0.0.1:8000/api/events/bucharest
