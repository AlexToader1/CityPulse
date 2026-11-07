export const HEAT_STOPS = ['--cp-sky', '--cp-lavender', '--cp-orange', '--cp-yellow', '--cp-pink'] as const

/** Discrete heat color for HTML (pins, chips), by score 0-100. */
export function heatVar(score: number, skipped = false) {
  if (skipped) return 'var(--cp-grey)'
  const idx = Math.min(HEAT_STOPS.length - 1, Math.floor((score / 100) * HEAT_STOPS.length))
  return `var(${HEAT_STOPS[idx]})`
}

export type RGB = [number, number, number]

export function readCssColor(name: string, fallback: string): RGB {
  const value = typeof window === 'undefined' ? fallback : getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback
  const hex = value.startsWith('#') ? value : fallback
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/** Build a quantized ramp for canvas: index 0 = coldest, last = hottest. */
export function buildRamp(steps: number): string[] {
  const fallbacks = ['#3da5ff', '#c9b6ff', '#ffb066', '#ffe14d', '#ff5fa8']
  const stops = HEAT_STOPS.map((name, i) => readCssColor(name, fallbacks[i]))
  const out: string[] = []
  for (let i = 0; i < steps; i++) {
    const t = (i / (steps - 1)) * (stops.length - 1)
    const a = Math.floor(t)
    const b = Math.min(stops.length - 1, a + 1)
    const f = t - a
    const c = stops[a].map((v, k) => Math.round(v + (stops[b][k] - v) * f))
    out.push(`rgb(${c[0]},${c[1]},${c[2]})`)
  }
  return out
}
