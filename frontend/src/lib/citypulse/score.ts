import type { Signal, SignalType } from './types'

export function computeScore(signals: Signal[], weights: Record<SignalType, number>): number {
  const raw = signals.reduce((sum, s) => sum + s.strength * (weights[s.type] ?? 0), 0)
  return Math.max(0, Math.min(100, Math.round(raw)))
}
