'use client'

import { motion } from 'framer-motion'
import { useReducedMotionSafe as useReducedMotion } from '@/lib/use-reduced-motion'
import { useEffect, useState } from 'react'
import type { BrandDNA } from '@/lib/citypulse/types'
import { ArrowButton } from './primitives'

export function applyBrandPrimary(hex: string | null) {
  const root = document.documentElement
  if (hex) root.style.setProperty('--cp-primary', hex)
  else root.style.removeProperty('--cp-primary')
}

export function BrandReveal({ brand, onContinue }: { brand: BrandDNA; onContinue: () => void }) {
  const reduce = useReducedMotion()
  const [themed, setThemed] = useState(false)
  const items = brand.swatches.length + 3
  const stagger = reduce ? 0 : 0.18

  useEffect(() => {
    const t = setTimeout(
      () => {
        applyBrandPrimary(brand.swatches[0])
        setThemed(true)
      },
      reduce ? 0 : (items * stagger + 0.3) * 1000,
    )
    return () => clearTimeout(t)
  }, [brand, items, stagger, reduce])

  const pop = (i: number) => ({
    initial: reduce ? false : ({ opacity: 0, scale: 0.6, y: 12 } as const),
    animate: { opacity: 1, scale: 1, y: 0 },
    transition: { type: 'spring' as const, stiffness: 520, damping: 20, delay: i * stagger },
  })

  return (
    <section aria-labelledby="dna-title" className="nb-card p-6 md:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="dna-title" className="text-3xl font-bold">
          Your Brand DNA
        </h2>
        <span className="nb-pill bg-pink">
          <span className="mono-label">{brand.name}</span>
        </span>
      </div>

      <ul className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4" aria-label="Brand colors">
        {brand.swatches.map((hex, i) => (
          <motion.li key={hex + i} {...pop(i)} className="overflow-hidden rounded-xl border-2 border-ink shadow-nb-sm">
            <div className="h-20" style={{ background: hex }} />
            <div className="border-t-2 border-ink bg-white px-3 py-2 font-mono text-sm font-bold">{hex}</div>
          </motion.li>
        ))}
      </ul>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <motion.span {...pop(brand.swatches.length)} className="nb-pill bg-white">
          <span className="mono-label">Font</span> {brand.font}
        </motion.span>
        {brand.tone.map((t, i) => (
          <motion.span key={t} {...pop(brand.swatches.length + 1 + i)} className="nb-pill bg-lavender">
            <span className="mono-label">Tone</span> {t}
          </motion.span>
        ))}
      </div>

      <div className="mt-8 flex flex-wrap items-center justify-between gap-4 border-t-2 border-ink pt-6">
        <p className="text-base" aria-live="polite">
          {themed ? 'CityPulse now wears your first brand color.' : 'Reading your colors and voice...'}
        </p>
        <motion.div
          className="flex items-center gap-2"
          initial={reduce ? false : { opacity: 0, y: 10 }}
          animate={themed ? { opacity: 1, y: 0 } : { opacity: 0, y: 10 }}
          transition={{ type: 'spring', stiffness: 400, damping: 24 }}
        >
          <button type="button" onClick={onContinue} disabled={!themed} className="nb-btn-primary !bg-yellow text-lg">
            Continue to dashboard
          </button>
          <ArrowButton label="Continue to dashboard" onClick={onContinue} disabled={!themed} className="!bg-white" />
        </motion.div>
      </div>
    </section>
  )
}
