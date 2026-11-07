import type { CityAction, SignalType } from './types'

export const THRESHOLDS = {
  generate: 60,
  lightTouch: 30,
} as const

export const SIGNAL_WEIGHTS: Record<SignalType, number> = {
  weather: 1,
  event: 1,
  holiday: 1,
  trend: 1,
}

/** Mock cost model per action, used to compute the stat strip. */
export const ACTION_COST: Record<CityAction, { costUsd: number; minutesSaved: number }> = {
  GENERATE: { costUsd: 0.14, minutesSaved: 45 },
  LIGHT_TOUCH: { costUsd: 0.03, minutesSaved: 20 },
  SKIP: { costUsd: 0, minutesSaved: 0 },
}

export const MOCK_DELAY_MS = { min: 300, max: 900 } as const

/** Set to a value > 0 (or add ?fail=1 to the URL) to exercise error states. */
export const MOCK_FAILURE_RATE = 0

export const API_BASE_URL = process.env.NEXT_PUBLIC_CITYPULSE_API_URL ?? ''

export function decide(score: number): CityAction {
  if (score >= THRESHOLDS.generate) return 'GENERATE'
  if (score >= THRESHOLDS.lightTouch) return 'LIGHT_TOUCH'
  return 'SKIP'
}
