'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import useSWR from 'swr'
import { fetchCities } from '@/lib/citypulse/api'
import { applyPreset, feedFromCities } from '@/lib/citypulse/cities'
import { API_BASE_URL } from '@/lib/citypulse/config'
import { EVENT_PRESETS } from '@/lib/citypulse/mock-data'
import type { BrandDNA, BusinessCategory, CityResult } from '@/lib/citypulse/types'
import { AdStudio, type AdView } from './ad-studio'
import { AppHeader } from './app-header'
import { BrandStrip } from './brand-strip'
import { DemoAutopilot, type DemoActions } from './demo-autopilot'
import { Heatmap, type HeatmapHandle } from './heatmap'
import { DemoBadge, LiveBadge } from './primitives'
import { SignalFeed, type FeedBurst } from './signal-feed'
import { StatStrip } from './stat-strip'
import { useToast } from './toast'

export function Dashboard({
  brand,
  category,
  selectedCities,
  onHome,
}: {
  brand: BrandDNA
  category: BusinessCategory
  selectedCities: string[]
  onHome: () => void
}) {
  const toast = useToast()
  const { data, mutate } = useSWR(['cities', category, selectedCities.join(',')], () => fetchCities({ cities: selectedCities, category }))
  const base = useMemo(() => (data?.ok ? data.data : []), [data])
  const [presetId, setPresetId] = useState<string | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [view, setView] = useState<AdView>('tailored')
  const [burst, setBurst] = useState<FeedBurst | null>(null)
  const mapRef = useRef<HeatmapHandle>(null)

  const cities = useMemo(() => applyPreset(base, presetId), [base, presetId])
  const feedPool = useMemo(() => feedFromCities(base), [base])
  const selectedCity = cities.find((c) => c.city === selected) ?? null

  const prevActions = useRef<Map<string, CityResult['action']> | null>(null)
  useEffect(() => {
    if (!cities.length) return
    const prev = prevActions.current
    if (prev) {
      for (const c of cities) {
        const before = prev.get(c.city)
        if (!before || before === c.action) continue
        if (before === 'SKIP') toast(`${c.city} is now adapted`, 'lime')
        else if (c.action === 'SKIP') toast(`${c.city} is back to the master ad`, 'white')
      }
    }
    prevActions.current = new Map(cities.map((c) => [c.city, c.action]))
  }, [cities, toast])

  function simulate(id: string | null) {
    setPresetId(id)
    const preset = EVENT_PRESETS.find((p) => p.id === id)
    if (!preset) return
    setBurst({
      id: Date.now(),
      items: preset.changes
        .filter((ch) => ch.signal && selectedCities.includes(ch.city))
        .map((ch) => ({ city: ch.city, type: ch.signal!.type, text: ch.signal!.label, source: ch.signal!.source })),
    })
  }

  const demoActions: DemoActions = {
    select: setSelected,
    simulate,
    setView,
    resetMap: () => mapRef.current?.reset(),
    skipCity: () => cities.find((c) => c.action === 'SKIP')?.city ?? null,
    toast: (t) => toast(t, 'lime'),
  }

  return (
    <div className="min-h-dvh">
      <AppHeader label="Step 2 of 2: Geo campaign HQ" onHome={onHome}>
        {data?.ok && API_BASE_URL ? <LiveBadge /> : <DemoBadge />}
        <DemoAutopilot actions={demoActions} />
      </AppHeader>

      <main className="flex flex-col gap-5 p-5">
        <StatStrip cities={cities} />

        {data && !data.ok ? (
          <div role="alert" className="nb-card flex flex-wrap items-center justify-between gap-3 bg-pink p-5">
            <p className="font-bold">{"We couldn't load your cities. Try again."}</p>
            <button type="button" className="nb-btn-secondary px-4 py-2 text-base" onClick={() => mutate()}>
              Try again
            </button>
          </div>
        ) : null}

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_420px]">
          <div className="flex min-w-0 flex-col gap-5">
            <section className="nb-card overflow-hidden" aria-labelledby="map-title">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b-2 border-ink px-4 py-3">
                <div>
                  <h1 id="map-title" className="text-2xl font-bold">
                    City heat map
                  </h1>
                  <p className="text-sm">Scroll or pinch to zoom, drag to pan, double click to zoom in.</p>
                </div>
                {presetId && (
                  <span className="nb-pill bg-orange">
                    <span className="mono-label">Simulated:</span> {EVENT_PRESETS.find((p) => p.id === presetId)?.label}
                  </span>
                )}
              </div>
              <div className="h-[min(68dvh,640px)]">
                {base.length > 0 ? (
                  <Heatmap ref={mapRef} cities={cities} selected={selected} onSelect={setSelected} />
                ) : (
                  <div className="size-full animate-pulse bg-cream" aria-busy="true" aria-label="Loading cities" />
                )}
              </div>
            </section>

            <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
              <BrandStrip brand={brand} />
              <SignalFeed cities={selectedCities} pool={feedPool} activePreset={presetId} onSimulate={simulate} burst={burst} />
            </div>
          </div>

          <div className="lg:sticky lg:top-5 lg:self-start">
            <AdStudio city={selectedCity} brand={brand} view={view} onViewChange={setView} />
          </div>
        </div>
      </main>
    </div>
  )
}
