'use client'

import { motion } from 'framer-motion'
import { useReducedMotionSafe as useReducedMotion } from '@/lib/use-reduced-motion'
import { useMemo } from 'react'
import useSWR from 'swr'
import { fetchCities, fetchCityList } from '@/lib/citypulse/api'
import { chaikin, fitProjection, ROMANIA_OUTLINE } from '@/lib/citypulse/geo'
import { heatVar } from '@/lib/citypulse/heat'
import { ALL_CITIES } from '@/lib/citypulse/mock-data'
import type { CityResult } from '@/lib/citypulse/types'
import { DemoBadge, LiveBadge } from './primitives'

const W = 600
const H = 430

/** Landing-page snapshot: every supported city, scored for a default category. */
async function fetchLandingCities(): Promise<CityResult[]> {
  const list = await fetchCityList()
  const names = list.ok ? list.data.map((c) => c.name) : [...ALL_CITIES]
  const res = await fetchCities({ cities: names, category: 'Cafe' })
  return res.ok ? res.data : []
}

export function LandingMap() {
  const reduce = useReducedMotion()
  const { data: landingCities } = useSWR('landing-cities', fetchLandingCities, { revalidateOnFocus: false })
  const live = Boolean(landingCities?.length)  // real data from the API (no mock fallback)
  const { outline, pins, ribbon } = useMemo(() => {
    const proj = fitProjection(W, H, 34)
    const ring = chaikin(ROMANIA_OUTLINE.map(proj.project), 3)
    const outline = 'M' + ring.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join('L') + 'Z'
    const cities = landingCities ?? []
    const pins = cities.map((c) => {
      const [x, y] = proj.project([c.lon, c.lat])
      return { ...c, x, y }
    })
    const adapted = pins.filter((p) => p.action !== 'SKIP').sort((a, b) => b.score - a.score)
    const ribbon = adapted.length ? 'M' + adapted.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join('L') : ''
    return { outline, pins, ribbon }
  }, [landingCities])

  return (
    <motion.figure
      initial={reduce ? false : { opacity: 0, y: 30, rotate: 1.5 }}
      animate={{ opacity: 1, y: 0, rotate: 0 }}
      transition={{ type: 'spring', stiffness: 220, damping: 22, delay: 0.5 }}
      className="nb-card overflow-hidden shadow-nb-lg"
      aria-label={`Romania, city by city: a ${live ? 'live' : 'demo'} map of adapted cities and cities that kept the master ad`}
    >
      <div className="flex items-center justify-between gap-3 border-b-2 border-ink px-4 py-3">
        <figcaption className="font-bold">Romania, city by city</figcaption>
        {live ? <LiveBadge /> : <DemoBadge />}
      </div>

      <div
        className="relative aspect-[600/430] w-full"
        style={{
          backgroundColor: 'var(--cp-white)',
          backgroundImage:
            'linear-gradient(var(--cp-mint) 2px, transparent 2px), linear-gradient(90deg, var(--cp-mint) 2px, transparent 2px)',
          backgroundSize: '44px 44px',
        }}
      >
        <svg viewBox={`0 0 ${W} ${H}`} className="absolute inset-0 size-full" aria-hidden="true">
          <path d={outline} transform="translate(6 6)" fill="var(--cp-ink)" />
          <path d={outline} fill="var(--cp-white)" stroke="var(--cp-ink)" strokeWidth="4" strokeLinejoin="round" />
          <motion.path
            d={ribbon}
            fill="none"
            stroke="var(--cp-ink)"
            strokeWidth="11"
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={reduce ? false : { pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 1.1, ease: 'easeOut', delay: 1.4 }}
          />
          <motion.path
            d={ribbon}
            fill="none"
            stroke="var(--cp-sky)"
            strokeWidth="6"
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={reduce ? false : { pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 1.1, ease: 'easeOut', delay: 1.4 }}
          />
        </svg>

        {pins.map((p, i) => {
          const skipped = p.action === 'SKIP'
          return (
            <motion.div
              key={p.city}
              className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center"
		style={{
			left: `${((p.x / W) * 100).toFixed(3)}%`,
			top: `${((p.y / H) * 100).toFixed(3)}%`,
		}}
              initial={reduce ? false : { opacity: 0, y: -40 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ type: 'spring', stiffness: 500, damping: 18, delay: 0.8 + i * 0.08 }}
            >
              <span
                className={`relative flex size-9 items-center justify-center rounded-full border-2 border-ink text-sm font-bold shadow-nb-sm ${skipped ? '' : 'cp-pulse'}`}
                style={{ background: heatVar(p.score, skipped) }}
              >
                {skipped ? '—' : p.score}
              </span>
              <span className="mt-1 whitespace-nowrap rounded-md border-2 border-ink bg-white px-1.5 py-0.5 text-[11px] font-bold leading-tight">
                {p.city}
                {skipped && <span className="mono-label block text-[9px] leading-tight">Master ad kept</span>}
              </span>
            </motion.div>
          )
        })}
      </div>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t-2 border-ink px-4 py-3 text-sm font-bold">
        <span className="flex items-center gap-2">
          <span className="size-3.5 rounded-full border-2 border-ink bg-pink" aria-hidden="true" /> Adapted ad
        </span>
        <span className="flex items-center gap-2">
          <span className="size-3.5 rounded-full border-2 border-ink bg-grey" aria-hidden="true" /> Master ad kept
        </span>
      </div>
    </motion.figure>
  )
}
