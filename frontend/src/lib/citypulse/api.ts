import { extractSwatches, legibleOnInk } from './brand-colors'
import { baseCityResults } from './cities'
import { API_BASE_URL, BACKEND_ORIGIN, MOCK_DELAY_MS, MOCK_FAILURE_RATE } from './config'
import { ALL_CITIES, BASE_CITIES, SAMPLE_BRAND_SWATCHES, sampleBrand } from './mock-data'
import type {
  AnalyzeBrandRequest,
  ApiResult,
  BrandDNA,
  CheckComplianceRequest,
  CheckComplianceResponse,
  CityInfo,
  ExportAdRequest,
  ExportAdResponse,
  FetchCitiesRequest,
  FetchCitiesResponse,
  GenerateAdRequest,
  GeneratedAd,
  GeneratedAdImage,
} from './types'

const SUPERLATIVES = ['cel mai bun', 'cea mai buna', 'perfect', 'garantat', 'numarul 1']

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))
const mockDelay = () => wait(MOCK_DELAY_MS.min + Math.random() * (MOCK_DELAY_MS.max - MOCK_DELAY_MS.min))

function failureRate() {
  if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('fail') === '1') return 0.5
  return MOCK_FAILURE_RATE
}

async function mock<T>(produce: () => T | Promise<T>, canFail = true): Promise<ApiResult<T>> {
  await mockDelay()
  if (canFail && Math.random() < failureRate()) return { ok: false, error: 'Mock failure' }
  try {
    return { ok: true, data: await produce() }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Unknown error' }
  }
}

async function errorMessage(res: Response): Promise<string> {
  try {
    const body = await res.json()
    if (typeof body?.detail === 'string') return body.detail
  } catch {}
  return `HTTP ${res.status}`
}

async function remote<T>(path: string, body: unknown): Promise<ApiResult<T>> {
  try {
    const res = await fetch(`${API_BASE_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) return { ok: false, error: await errorMessage(res) }
    return { ok: true, data: (await res.json()) as T }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Network error' }
  }
}

/** Every supported city. Live: GET /api/cities. Mock: the built-in list. */
export async function fetchCityList(): Promise<ApiResult<CityInfo[]>> {
  if (API_BASE_URL) {
    try {
      const res = await fetch(`${API_BASE_URL}/cities`)
      if (!res.ok) return { ok: false, error: await errorMessage(res) }
      return { ok: true, data: (await res.json()) as CityInfo[] }
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : 'Network error' }
    }
  }
  return mock(
    () =>
      ALL_CITIES.map((name) => {
        const base = BASE_CITIES.find((c) => c.city === name)
        return { id: name.toLowerCase(), name, county: '', lat: base?.lat ?? 0, lon: base?.lon ?? 0 }
      }),
    false,
  )
}

export async function fetchCities(req: FetchCitiesRequest): Promise<ApiResult<FetchCitiesResponse>> {
  if (API_BASE_URL) return remote('/cities', req)
  return mock(() => baseCityResults(req.cities), false)
}

export async function analyzeBrand(req: AnalyzeBrandRequest): Promise<ApiResult<BrandDNA>> {
  const base = sampleBrand(req.category)
  if (API_BASE_URL && req.file) {
    const form = new FormData()
    form.append('file', req.file)
    form.append('category', req.category)
    try {
      const res = await fetch(`${API_BASE_URL}/brand`, { method: 'POST', body: form })
      if (!res.ok) return { ok: false, error: await errorMessage(res) }
      const brand = (await res.json()) as BrandDNA
      const swatches = [...brand.swatches]
      swatches[0] = legibleOnInk(swatches[0])
      return { ok: true, data: { ...brand, swatches, imageUrl: URL.createObjectURL(req.file) } }
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : 'Network error' }
    }
  }
  return mock(async () => {
    if (!req.file) return base
    const imageUrl = URL.createObjectURL(req.file)
    let swatches = await extractSwatches(imageUrl).catch(() => [] as string[])
    if (swatches.length < 3) swatches = SAMPLE_BRAND_SWATCHES
    swatches[0] = legibleOnInk(swatches[0])
    return { ...base, name: req.file.name.replace(/\.[^.]+$/, ''), swatches, imageUrl }
  }, false)
}

export async function generateAd(req: GenerateAdRequest): Promise<ApiResult<GeneratedAd>> {
  if (API_BASE_URL) return remote('/generate-ad', { city: req.city, brand: req.brand })
  const c = req.city
  return mock(() => ({
    city: c.city,
    action: c.action,
    headline: c.headline,
    body: c.body,
    motif: c.action === 'GENERATE' ? c.motif : 'plain',
    reason: c.reason,
    costUsd: c.costUsd,
    minutesSaved: c.minutesSaved,
  }))
}

export async function checkCompliance(req: CheckComplianceRequest): Promise<ApiResult<CheckComplianceResponse>> {
  if (API_BASE_URL) return remote('/compliance', req)
  return mock(() => {
    if (!req.edited) return req.draft
    const text = `${req.headline} ${req.body}`.toLowerCase()
    const hit = SUPERLATIVES.find((w) => text.includes(w))
    if (hit) return { status: 'blocked' as const, note: `Held back: "${hit}" is a claim we cannot prove. Edit the copy to release it.` }
    return { status: 'passed' as const, note: 'Your edited copy passed the brand and advertising rules.' }
  }, false)
}

export async function exportAd(req: ExportAdRequest): Promise<ApiResult<ExportAdResponse>> {
  if (API_BASE_URL) return remote('/export', req)
  return mock(
    () => ({
      fileName: `citypulse-${req.city.toLowerCase()}-${req.format === 'instagram_feed' ? 'feed-1080x1080' : 'story-1080x1920'}.png`,
      format: req.format,
    }),
    false,
  )
}

/** Edits the uploaded master ad for one city (only GENERATE cities). imageUrl null = keep the motif art. */
export async function generateAdImage(req: GenerateAdRequest, force = false): Promise<ApiResult<GeneratedAdImage>> {
  if (!API_BASE_URL) return { ok: true, data: { imageUrl: null, source: 'skipped', detail: 'Mock mode: no backend configured' } }
  if (!req.brand.imageUrl) return { ok: true, data: { imageUrl: null, source: 'skipped', detail: 'No master ad uploaded (sample brand), so there is nothing to edit' } }
  if (req.city.action !== 'GENERATE') return { ok: true, data: { imageUrl: null, source: 'skipped' } }
  try {
    const blob = await (await fetch(req.brand.imageUrl)).blob()
    const form = new FormData()
    form.append('file', blob, 'master.png')
    form.append('city', JSON.stringify(req.city))
    form.append('brand', JSON.stringify({ ...req.brand, imageUrl: null }))
    form.append('force', String(force))
    const res = await fetch(`${API_BASE_URL}/generate-ad-image`, { method: 'POST', body: form })
    if (!res.ok) return { ok: false, error: await errorMessage(res) }
    const data = (await res.json()) as GeneratedAdImage
    return { ok: true, data: { ...data, imageUrl: data.imageData ?? (data.imageUrl ? `${BACKEND_ORIGIN}${data.imageUrl}` : null) } }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Network error' }
  }
}
