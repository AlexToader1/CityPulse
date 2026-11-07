'use client'

import { AnimatePresence, motion } from 'framer-motion'
import { useReducedMotionSafe as useReducedMotion } from '@/lib/use-reduced-motion'
import { ChevronDown, Zap } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { EVENT_PRESETS } from '@/lib/citypulse/mock-data'
import type { FeedItem } from '@/lib/citypulse/types'
import { SignalShape, SourceTag } from './primitives'

const MAX_ITEMS = 6

export type FeedBurst = { id: number; items: Omit<FeedItem, 'id'>[] }

export function SignalFeed({
  cities,
  pool: poolItems,
  activePreset,
  onSimulate,
  burst,
}: {
  cities: string[]
  /** Real signals from the API (see feedFromCities). */
  pool: Omit<FeedItem, 'id'>[]
  activePreset: string | null
  onSimulate: (id: string | null) => void
  burst: FeedBurst | null
}) {
  const reduce = useReducedMotion()
  const pool = useMemo(() => poolItems.filter((f) => cities.includes(f.city)), [poolItems, cities])
  const poolKey = pool.map((f) => `${f.city}|${f.text}`).join('~')
  const [items, setItems] = useState<FeedItem[]>(() => pool.slice(0, 4).map((f, i) => ({ ...f, id: `seed-${i}` })))
  const [open, setOpen] = useState(false)
  const cursor = useRef(4)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    cursor.current = 4
    setItems(pool.slice(0, 4).map((f, i) => ({ ...f, id: `seed-${i}-${poolKey.length}` })))
    if (pool.length <= 4) return
    const t = setInterval(() => {
      const next = pool[cursor.current % pool.length]
      cursor.current++
      setItems((list) => [{ ...next, id: `f-${cursor.current}-${Date.now()}` }, ...list].slice(0, MAX_ITEMS))
    }, 3400)
    return () => clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [poolKey])

  useEffect(() => {
    if (!burst) return
    setItems((list) => [...burst.items.map((f, i) => ({ ...f, id: `b-${burst.id}-${i}` })), ...list].slice(0, MAX_ITEMS))
  }, [burst])

  useEffect(() => {
    if (!open) return
    const close = (e: PointerEvent) => !menuRef.current?.contains(e.target as Node) && setOpen(false)
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('pointerdown', close)
    window.addEventListener('keydown', esc)
    return () => {
      window.removeEventListener('pointerdown', close)
      window.removeEventListener('keydown', esc)
    }
  }, [open])

  const activeLabel = EVENT_PRESETS.find((p) => p.id === activePreset)?.label

  return (
    <section className="nb-card flex flex-col" aria-labelledby="feed-title">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b-2 border-ink px-4 py-3">
        <h2 id="feed-title" className="flex items-center gap-2 font-bold">
          <span className="size-2.5 rounded-full bg-pink ring-2 ring-ink cp-pulse" aria-hidden="true" />
          Signal feed
        </h2>
        <div ref={menuRef} className="relative">
          <button
            type="button"
            className="nb-btn-primary px-3 py-1.5 text-sm"
            aria-haspopup="menu"
            aria-expanded={open}
            onClick={() => setOpen((o) => !o)}
          >
            <Zap className="size-4" aria-hidden="true" />
            {activeLabel ? activeLabel : 'Simulate event'}
            <ChevronDown className="size-4" aria-hidden="true" />
          </button>
          {open && (
            <div role="menu" className="absolute right-0 top-full z-20 mt-2 w-60 overflow-hidden rounded-xl border-2 border-ink bg-white shadow-nb">
              {EVENT_PRESETS.map((p) => (
                <button
                  key={p.id}
                  role="menuitemradio"
                  aria-checked={activePreset === p.id}
                  type="button"
                  className="block w-full border-b-2 border-ink px-4 py-3 text-left font-bold last:border-b-0 hover:bg-cream aria-checked:bg-primary"
                  onClick={() => {
                    setOpen(false)
                    onSimulate(p.id)
                  }}
                >
                  {p.label}
                </button>
              ))}
              {activePreset && (
                <button
                  role="menuitem"
                  type="button"
                  className="block w-full border-t-2 border-ink bg-mint px-4 py-3 text-left font-bold"
                  onClick={() => {
                    setOpen(false)
                    onSimulate(null)
                  }}
                >
                  Back to baseline
                </button>
              )}
            </div>
          )}
        </div>
      </div>
      <ul className="flex flex-col gap-2 p-4" aria-live="polite">
        {items.length === 0 && <li className="text-sm">Waiting for signals…</li>}
        <AnimatePresence initial={false}>
          {items.map((f) => (
            <motion.li
              key={f.id}
              layout={!reduce}
              initial={reduce ? false : { opacity: 0, x: -24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0 }}
              transition={{ type: 'spring', stiffness: 420, damping: 30 }}
              className="flex items-center gap-3 rounded-lg border-2 border-ink bg-white px-3 py-2"
            >
              <SignalShape type={f.type} />
              <span className="min-w-0 flex-1 text-sm">
                <span className="font-bold">{f.city}</span> {f.text}
              </span>
              <SourceTag source={f.source} />
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
    </section>
  )
}
