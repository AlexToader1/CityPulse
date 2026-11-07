import { ACTION_COST, SIGNAL_WEIGHTS, decide } from './config'
import { BASE_CITIES, EVENT_PRESETS } from './mock-data'
import { computeScore } from './score'
import type { CityResult, FeedItem, Signal } from './types'

export function finalizeCity(base: Omit<CityResult, 'score' | 'action' | 'costUsd' | 'minutesSaved'>): CityResult {
  const score = computeScore(base.signals, SIGNAL_WEIGHTS)
  const action = decide(score)
  return { ...base, score, action, ...ACTION_COST[action] }
}

export function baseCityResults(selected: string[]): CityResult[] {
  return BASE_CITIES.filter((c) => selected.includes(c.city)).map(finalizeCity)
}

/** Apply a simulate-event preset on top of the baseline cities. */
export function applyPreset(cities: CityResult[], presetId: string | null): CityResult[] {
  const preset = EVENT_PRESETS.find((p) => p.id === presetId)
  if (!preset) return cities
  return cities.map((city) => {
    const change = preset.changes.find((c) => c.city === city.city)
    if (!change) return city
    const signals: Signal[] = change.signal ? [...city.signals, change.signal] : city.signals
    return finalizeCity({ ...city, ...change.override, signals })
  })
}

export function topSignal(city: CityResult): Signal | undefined {
  return [...city.signals].sort((a, b) => b.strength - a.strength)[0]
}

export function runStats(cities: CityResult[]) {
  const adapted = cities.filter((c) => c.action !== 'SKIP').length
  return {
    adapted,
    skipped: cities.length - adapted,
    costUsd: cities.reduce((s, c) => s + c.costUsd, 0),
    minutesSaved: cities.reduce((s, c) => s + c.minutesSaved, 0),
  }
}

/** Turn each city's real signals into feed rows, strongest first. */
export function feedFromCities(cities: CityResult[]): Omit<FeedItem, 'id'>[] {
  return cities
    .flatMap((c) =>
      c.signals
        .filter((s) => s.strength > 0)
        .map((s) => ({ city: c.city, type: s.type, text: s.label, source: s.source, strength: s.strength })),
    )
    .sort((a, b) => b.strength - a.strength)
    .map(({ strength: _strength, ...item }) => item)
}
