'use client'

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { Check, ChevronDown, Download, Pencil, RefreshCw } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { checkCompliance, exportAd, generateAd } from '@/lib/citypulse/api'
import { THRESHOLDS } from '@/lib/citypulse/config'
import type { BrandDNA, CityResult, Compliance, ExportFormat, GeneratedAd } from '@/lib/citypulse/types'
import { cn } from '@/lib/utils'
import { AdPreview } from './ad-preview'
import { SignalShape, SourceTag } from './primitives'
import { useToast } from './toast'

const STEPS = ['Reading signals', 'Writing copy', 'Generating visual', 'Checking compliance']
const STATUS_STYLE: Record<Compliance['status'], { bg: string; label: string }> = {
  passed: { bg: 'bg-lime', label: 'Safe to run' },
  fixed: { bg: 'bg-yellow', label: 'Fixed' },
  blocked: { bg: 'bg-pink', label: 'Held back' },
}

type Done = { ad: GeneratedAd; compliance: Compliance }
type State = { kind: 'idle' } | { kind: 'generating'; step: number } | { kind: 'done'; result: Done } | { kind: 'error' }

export type AdView = 'master' | 'tailored'

export function AdStudio({
  city,
  brand,
  view,
  onViewChange,
}: {
  city: CityResult | null
  brand: BrandDNA
  view: AdView
  onViewChange: (v: AdView) => void
}) {
  const reduce = useReducedMotion()
  const toast = useToast()
  const [state, setState] = useState<State>({ kind: 'idle' })
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState({ headline: '', body: '' })
  const [exportOpen, setExportOpen] = useState(false)
  const cache = useRef(new Map<string, Done>())
  const runId = useRef(0)
  const exportRef = useRef<HTMLDivElement>(null)

  const cacheKey = city ? `${city.city}|${city.action}|${city.headline}|${city.compliance.status}` : ''

  async function run(force = false) {
    if (!city || city.action === 'SKIP') return
    const id = ++runId.current
    const cached = cache.current.get(cacheKey)
    if (cached && !force) {
      setState({ kind: 'done', result: cached })
      return
    }
    setEditing(false)
    setState({ kind: 'generating', step: 0 })
    const stepMs = reduce ? 120 : 520
    const ticker = (async () => {
      for (let i = 1; i <= STEPS.length; i++) {
        await new Promise((r) => setTimeout(r, stepMs))
        if (runId.current !== id) return
        setState({ kind: 'generating', step: i })
      }
    })()
    const adRes = await generateAd({ city, brand })
    const compRes = adRes.ok
      ? await checkCompliance({ city: city.city, headline: adRes.data.headline, body: adRes.data.body, draft: city.compliance })
      : null
    await ticker
    if (runId.current !== id) return
    if (!adRes.ok || !compRes?.ok) {
      setState({ kind: 'error' })
      return
    }
    const result = { ad: adRes.data, compliance: compRes.data }
    cache.current.set(cacheKey, result)
    setState({ kind: 'done', result })
  }

  useEffect(() => {
    setEditing(false)
    setExportOpen(false)
    if (!city || city.action === 'SKIP') {
      runId.current++
      setState({ kind: 'idle' })
      return
    }
    run()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cacheKey])

  useEffect(() => {
    if (!exportOpen) return
    const close = (e: PointerEvent) => {
      if (!exportRef.current?.contains(e.target as Node)) setExportOpen(false)
    }
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setExportOpen(false)
    window.addEventListener('pointerdown', close)
    window.addEventListener('keydown', esc)
    return () => {
      window.removeEventListener('pointerdown', close)
      window.removeEventListener('keydown', esc)
    }
  }, [exportOpen])

  async function saveEdit() {
    if (state.kind !== 'done' || !city) return
    const res = await checkCompliance({ city: city.city, ...draft, draft: state.result.compliance, edited: true })
    if (!res.ok) return toast('That check did not finish. Try again.', 'pink')
    const result = { ad: { ...state.result.ad, ...draft }, compliance: res.data }
    cache.current.set(cacheKey, result)
    setState({ kind: 'done', result })
    setEditing(false)
    toast(res.data.status === 'blocked' ? 'Still held back. Check the note.' : 'Copy saved and checked.', res.data.status === 'blocked' ? 'pink' : 'lime')
  }

  async function doExport(format: ExportFormat) {
    if (!city) return
    setExportOpen(false)
    const res = await exportAd({ city: city.city, format })
    toast(res.ok ? `Exported ${res.data.fileName}` : "That didn't export. Try again.", res.ok ? 'lime' : 'pink')
  }

  if (!city) {
    return (
      <section className="nb-card flex min-h-[420px] flex-col items-center justify-center gap-3 p-8 text-center" aria-label="Ad Studio">
        <SignalShape type="event" className="size-10" />
        <h2 className="text-2xl font-bold">Pick a city</h2>
        <p className="max-w-xs">Click a pin on the map to see its ad, the reasons behind it and the safety check.</p>
      </section>
    )
  }

  const skipped = city.action === 'SKIP'
  const result = state.kind === 'done' ? state.result : null
  const actionLabel = city.action === 'GENERATE' ? 'New visual and copy' : city.action === 'LIGHT_TOUCH' ? 'Copy only' : 'Master ad kept'

  return (
    <section className="nb-card flex flex-col" aria-labelledby="studio-title">
      <header className="flex flex-col gap-3 border-b-2 border-ink p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <span className="mono-label">Ad Studio</span>
            <h2 id="studio-title" className="text-3xl font-bold leading-tight">
              {city.city}
            </h2>
          </div>
          <span className="flex size-12 items-center justify-center rounded-full border-2 border-ink bg-primary text-lg font-bold shadow-nb-sm">
            {city.score}
          </span>
        </div>
        <ul className="flex flex-wrap gap-2" aria-label="Signals">
          {city.signals.map((s) => (
            <li key={s.label} className="nb-pill bg-white text-sm">
              <SignalShape type={s.type} />
              {s.label}
              <SourceTag source={s.source} />
            </li>
          ))}
        </ul>
      </header>

      <div className="flex flex-col gap-4 p-5">
        {skipped ? (
          <>
            <AdPreview brand={brand} headline={brand.masterHeadline} body={brand.masterBody} motif="plain" variant="master" wipeKey={`skip-${city.city}`} />
            <div className="rounded-xl border-2 border-ink bg-grey p-4">
              <p className="font-bold">Master ad kept</p>
              <p className="mt-1">{city.reason}</p>
            </div>
          </>
        ) : (
          <>
            <div role="tablist" aria-label="Ad version" className="grid grid-cols-2 rounded-full border-2 border-ink bg-white p-1">
              {(['master', 'tailored'] as const).map((v) => (
                <button
                  key={v}
                  role="tab"
                  type="button"
                  aria-selected={view === v}
                  onClick={() => onViewChange(v)}
                  className="relative rounded-full px-3 py-1.5 font-bold"
                >
                  {view === v && (
                    <motion.span layoutId="view-pill" className="absolute inset-0 rounded-full border-2 border-ink bg-primary" transition={{ type: 'spring', stiffness: 500, damping: 34 }} />
                  )}
                  <span className="relative">{v === 'master' ? 'Master' : 'Tailored'}</span>
                </button>
              ))}
            </div>

            {state.kind === 'generating' && (
              <div className="flex flex-col gap-3" aria-live="polite" aria-busy="true">
                <div className="aspect-square w-full animate-pulse rounded-xl border-2 border-ink bg-cream" />
                <div className="h-3 overflow-hidden rounded-full border-2 border-ink bg-white">
                  <motion.div
                    className="h-full origin-left bg-primary"
                    animate={{ scaleX: state.step / STEPS.length }}
                    transition={{ type: 'spring', stiffness: 200, damping: 30 }}
                  />
                </div>
                <ol className="grid grid-cols-2 gap-2 text-sm font-bold">
                  {STEPS.map((s, i) => (
                    <li key={s} className={cn('flex items-center gap-2', state.step <= i && 'opacity-60')}>
                      <span className={cn('flex size-5 items-center justify-center rounded-full border-2 border-ink', state.step > i ? 'bg-lime' : 'bg-white')}>
                        {state.step > i && <Check className="size-3" aria-hidden="true" />}
                      </span>
                      {s}
                    </li>
                  ))}
                </ol>
              </div>
            )}

            {state.kind === 'error' && (
              <div className="flex flex-col items-start gap-3 rounded-xl border-2 border-ink bg-pink p-4" role="alert">
                <p className="font-bold">{"That didn't render. Try again."}</p>
                <button type="button" className="nb-btn-secondary px-4 py-2 text-base" onClick={() => run(true)}>
                  <RefreshCw className="size-4" aria-hidden="true" /> Try again
                </button>
              </div>
            )}

            {result && (
              <>
                <AdPreview
                  brand={brand}
                  headline={view === 'master' ? brand.masterHeadline : result.ad.headline}
                  body={view === 'master' ? brand.masterBody : result.ad.body}
                  motif={view === 'master' ? 'plain' : result.ad.motif}
                  variant={view}
                  wipeKey={`${cacheKey}-${view}-${result.ad.headline}`}
                />

                <div className="rounded-xl border-2 border-ink bg-white p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="mono-label">Why this ad</span>
                    <span className="nb-pill bg-lavender text-xs">{actionLabel}</span>
                  </div>
                  <p className="mt-2 leading-relaxed">{result.ad.reason}</p>
                </div>

                <AnimatePresence mode="wait">
                  <motion.div
                    key={result.compliance.status + result.compliance.note}
                    initial={reduce ? false : { scale: 0.85, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ type: 'spring', stiffness: 520, damping: 18 }}
                    className={cn('rounded-xl border-2 border-ink p-4', STATUS_STYLE[result.compliance.status].bg)}
                  >
                    <p className="font-bold">{STATUS_STYLE[result.compliance.status].label}</p>
                    <p className="mt-1">{result.compliance.note}</p>
                  </motion.div>
                </AnimatePresence>

                {editing ? (
                  <form
                    className="flex flex-col gap-3 rounded-xl border-2 border-ink bg-cream p-4"
                    onSubmit={(e) => {
                      e.preventDefault()
                      saveEdit()
                    }}
                  >
                    <label className="flex flex-col gap-1 font-bold">
                      Headline
                      <input
                        value={draft.headline}
                        onChange={(e) => setDraft((d) => ({ ...d, headline: e.target.value }))}
                        className="rounded-lg border-2 border-ink bg-white px-3 py-2 font-normal"
                      />
                    </label>
                    <label className="flex flex-col gap-1 font-bold">
                      Body
                      <textarea
                        value={draft.body}
                        rows={3}
                        onChange={(e) => setDraft((d) => ({ ...d, body: e.target.value }))}
                        className="rounded-lg border-2 border-ink bg-white px-3 py-2 font-normal"
                      />
                    </label>
                    <div className="flex gap-2">
                      <button type="submit" className="nb-btn-primary px-4 py-2 text-base">
                        Save and check
                      </button>
                      <button type="button" className="nb-btn-secondary px-4 py-2 text-base" onClick={() => setEditing(false)}>
                        Cancel
                      </button>
                    </div>
                  </form>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    <div ref={exportRef} className="relative">
                      <button
                        type="button"
                        className="nb-btn-primary px-4 py-2 text-base"
                        aria-haspopup="menu"
                        aria-expanded={exportOpen}
                        disabled={result.compliance.status === 'blocked'}
                        onClick={() => setExportOpen((o) => !o)}
                      >
                        <Download className="size-4" aria-hidden="true" /> Export
                        <ChevronDown className="size-4" aria-hidden="true" />
                      </button>
                      {exportOpen && (
                        <div role="menu" className="absolute bottom-full left-0 z-20 mb-2 w-56 overflow-hidden rounded-xl border-2 border-ink bg-white shadow-nb">
                          <button role="menuitem" type="button" className="block w-full border-b-2 border-ink px-4 py-3 text-left font-bold hover:bg-cream" onClick={() => doExport('instagram_feed')}>
                            Instagram feed, 1080 x 1080
                          </button>
                          <button role="menuitem" type="button" className="block w-full px-4 py-3 text-left font-bold hover:bg-cream" onClick={() => doExport('instagram_story')}>
                            Instagram story, 1080 x 1920
                          </button>
                        </div>
                      )}
                    </div>
                    <button type="button" className="nb-btn-secondary px-4 py-2 text-base" onClick={() => run(true)}>
                      <RefreshCw className="size-4" aria-hidden="true" /> Regenerate
                    </button>
                    <button
                      type="button"
                      className="nb-btn-secondary px-4 py-2 text-base"
                      onClick={() => {
                        setDraft({ headline: result.ad.headline, body: result.ad.body })
                        setEditing(true)
                        onViewChange('tailored')
                      }}
                    >
                      <Pencil className="size-4" aria-hidden="true" /> Edit copy
                    </button>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>

      <footer className="mt-auto flex flex-col gap-1 border-t-2 border-ink bg-cream px-5 py-3 text-sm">
        <p className="font-bold">
          {skipped ? 'This city: $0.00, nothing generated' : `This ad: $${city.costUsd.toFixed(2)} · ${city.minutesSaved} min saved vs. doing it by hand`}
        </p>
        <p>{`High (${THRESHOLDS.generate}+): new visual and copy · Medium (${THRESHOLDS.lightTouch}-${THRESHOLDS.generate - 1}): copy only · Low (under ${THRESHOLDS.lightTouch}): skipped`}</p>
      </footer>
    </section>
  )
}
