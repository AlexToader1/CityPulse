'use client'

import { runStats } from '@/lib/citypulse/cities'
import type { CityResult } from '@/lib/citypulse/types'
import { useTweenedNumber } from './primitives'

function Stat({ label, value, format, bg }: { label: string; value: number; format: (n: number) => string; bg: string }) {
  const shown = useTweenedNumber(value)
  return (
    <div className={`rounded-xl border-2 border-ink px-4 py-3 shadow-nb-sm ${bg}`}>
      <dt className="mono-label">{label}</dt>
      <dd className="mt-1 font-mono text-2xl font-bold tabular-nums">{format(shown)}</dd>
    </div>
  )
}

export function StatStrip({ cities }: { cities: CityResult[] }) {
  const s = runStats(cities)
  return (
    <dl className="grid grid-cols-2 gap-3 md:grid-cols-4" aria-label="This run">
      <Stat label="Cities adapted" value={s.adapted} format={(n) => String(Math.round(n))} bg="bg-pink" />
      <Stat label="Kept master ad" value={s.skipped} format={(n) => String(Math.round(n))} bg="bg-grey" />
      <Stat label="Est. cost this run" value={s.costUsd} format={(n) => `$${n.toFixed(2)}`} bg="bg-sky" />
      <Stat label="Est. time saved" value={s.minutesSaved} format={(n) => `${(n / 60).toFixed(1)} h`} bg="bg-lime" />
    </dl>
  )
}
