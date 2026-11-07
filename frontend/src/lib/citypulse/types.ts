// Contract between the CityPulse UI and a future backend.

export type SignalType = 'weather' | 'event' | 'holiday' | 'trend'
export type SignalSource = 'live' | 'curated' | 'simulated'
export type CityAction = 'GENERATE' | 'LIGHT_TOUCH' | 'SKIP'
export type Motif = 'storm' | 'festival' | 'heat' | 'greeting' | 'plain'
export type ComplianceStatus = 'passed' | 'fixed' | 'blocked'
export type BusinessCategory = 'Cafe' | 'Pharmacy' | 'Florist' | 'Gym' | 'Supplements'
export type ExportFormat = 'instagram_feed' | 'instagram_story'

export type Signal = {
  type: SignalType
  label: string
  source: SignalSource
  /** Score points this signal contributes before weighting (0-100). */
  strength: number
}

export type Compliance = {
  status: ComplianceStatus
  note: string
}

export type CityResult = {
  city: string
  lat: number
  lon: number
  score: number
  action: CityAction
  signals: Signal[]
  reason: string
  headline: string
  body: string
  motif: Motif
  compliance: Compliance
  costUsd: number
  minutesSaved: number
}

export type ApiError = { ok: false; error: string }
export type ApiOk<T> = { ok: true; data: T }
export type ApiResult<T> = ApiOk<T> | ApiError

/** One supported city, from GET /api/cities. */
export type CityInfo = { id: string; name: string; county: string; lat: number; lon: number }

export type FetchCitiesRequest = { cities: string[]; category: BusinessCategory }
export type FetchCitiesResponse = CityResult[]

export type AnalyzeBrandRequest = { file: File | null; category: BusinessCategory }
export type BrandDNA = {
  name: string
  swatches: string[]
  font: string
  tone: [string, string]
  masterHeadline: string
  masterBody: string
  cta: string
  /** Object URL or data URL of the uploaded ad, null for the sample brand. */
  imageUrl: string | null
}

export type GenerateAdRequest = { city: CityResult; brand: BrandDNA }
export type GeneratedAd = {
  city: string
  action: CityAction
  headline: string
  body: string
  motif: Motif
  reason: string
  costUsd: number
  minutesSaved: number
}

export type CheckComplianceRequest = {
  city: string
  headline: string
  body: string
  draft: Compliance
  /** True when the user edited the copy, so the rules must be re-run. */
  edited?: boolean
}
export type CheckComplianceResponse = Compliance

export type ExportAdRequest = { city: string; format: ExportFormat }
export type ExportAdResponse = { fileName: string; format: ExportFormat }

export type SimulatedEventPreset = {
  id: string
  label: string
  changes: {
    city: string
    delta: number
    signal?: Signal
    override?: Partial<Pick<CityResult, 'headline' | 'body' | 'motif' | 'reason' | 'compliance'>>
  }[]
}

export type FeedItem = {
  id: string
  city: string
  type: SignalType
  text: string
  source: SignalSource
}
