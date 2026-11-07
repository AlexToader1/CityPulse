'use client'

import { motion, useReducedMotion } from 'framer-motion'
import { contrastWithInk, hexToRgb } from '@/lib/citypulse/brand-colors'
import type { BrandDNA, Motif } from '@/lib/citypulse/types'

type Props = {
  brand: BrandDNA
  headline: string
  body: string
  motif: Motif
  /** Master shows the uploaded ad as-is when one exists. */
  variant: 'master' | 'tailored'
  wipeKey: string
}

function palette(brand: BrandDNA) {
  const ranked = [...brand.swatches].sort((a, b) => contrastWithInk(hexToRgb(b)) - contrastWithInk(hexToRgb(a)))
  const bg = ranked[0] ?? '#F6E7CF'
  const accents = brand.swatches.filter((s) => s !== bg)
  return { bg, a1: accents[0] ?? '#FF8B6B', a2: accents[1] ?? '#8FDCC8', a3: accents[2] ?? '#1F3A5F' }
}

function MotifArt({ motif, a1, a2, a3 }: { motif: Motif; a1: string; a2: string; a3: string }) {
  const ink = 'var(--cp-ink)'
  return (
    <svg viewBox="0 0 400 260" className="size-full" aria-hidden="true">
      {motif === 'storm' && (
        <g stroke={ink} strokeWidth="4">
          {Array.from({ length: 9 }).map((_, i) => (
            <line key={i} x1={40 + i * 42} y1={130 + (i % 3) * 14} x2={22 + i * 42} y2={190 + (i % 3) * 14} strokeLinecap="round" />
          ))}
          <g fill={a1}>
            <circle cx="150" cy="95" r="52" />
            <circle cx="225" cy="80" r="62" />
            <circle cx="290" cy="105" r="42" />
            <rect x="110" y="95" width="220" height="50" rx="25" />
          </g>
          <path d="M214 130 L192 182 L218 178 L200 232" fill="none" stroke={ink} strokeWidth="6" strokeLinejoin="round" />
        </g>
      )}
      {motif === 'festival' && (
        <g stroke={ink} strokeWidth="4" strokeLinejoin="round">
          <path d="M200 30l22 50 54 5-41 36 13 53-48-29-48 29 13-53-41-36 54-5z" fill={a1} />
          <path d="M80 140l10 22 24 3-18 16 6 24-22-13-22 13 6-24-18-16 24-3z" fill={a2} />
          <path d="M320 130l10 22 24 3-18 16 6 24-22-13-22 13 6-24-18-16 24-3z" fill={a3} />
          {[60, 130, 270, 340].map((x, i) => (
            <rect key={x} x={x} y={40 + (i % 2) * 40} width="16" height="16" fill={i % 2 ? a2 : a3} transform={`rotate(${20 + i * 30} ${x + 8} ${48 + (i % 2) * 40})`} />
          ))}
        </g>
      )}
      {motif === 'heat' && (
        <g stroke={ink} strokeWidth="4">
          {Array.from({ length: 12 }).map((_, i) => {
            const a = (i / 12) * Math.PI * 2
            return <line key={i} x1={200 + Math.cos(a) * 92} y1={130 + Math.sin(a) * 92} x2={200 + Math.cos(a) * 122} y2={130 + Math.sin(a) * 122} strokeLinecap="round" />
          })}
          <circle cx="200" cy="130" r="74" fill={a1} />
          <path d="M0 236 Q100 206 200 236 T400 236 V260 H0z" fill={a2} />
        </g>
      )}
      {motif === 'greeting' && (
        <g stroke={ink} strokeWidth="4" strokeLinejoin="round">
          <path d="M200 20l100 105-100 105-100-105z" fill={a1} />
          <circle cx="92" cy="70" r="26" fill={a2} />
          <circle cx="318" cy="190" r="22" fill={a3} />
        </g>
      )}
      {motif === 'plain' && (
        <g stroke={ink} strokeWidth="4">
          <circle cx="140" cy="125" r="78" fill={a1} />
          <rect x="200" y="62" width="150" height="128" rx="20" fill={a2} />
        </g>
      )}
    </svg>
  )
}

export function AdPreview({ brand, headline, body, motif, variant, wipeKey }: Props) {
  const reduce = useReducedMotion()
  const { bg, a1, a2, a3 } = palette(brand)
  const showUpload = brand.imageUrl && (variant === 'master' || motif === 'plain')

  return (
    <div className="relative aspect-square w-full overflow-hidden rounded-xl border-2 border-ink" style={{ background: bg }}>
      {showUpload && variant === 'master' ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={brand.imageUrl!} alt={`Master ad from ${brand.name}`} className="size-full object-cover" />
      ) : (
        <div className="flex size-full flex-col text-ink">
          <div className="min-h-0 flex-1">
            {showUpload ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={brand.imageUrl!} alt="" className="size-full object-cover" />
            ) : (
              <MotifArt motif={variant === 'master' ? 'plain' : motif} a1={a1} a2={a2} a3={a3} />
            )}
          </div>
          <div className="border-t-2 border-ink bg-white p-4">
            <p className="text-pretty text-xl font-bold leading-tight" style={{ fontFamily: 'var(--font-sans)' }}>
              {headline}
            </p>
            <p className="mt-1 text-pretty text-sm leading-snug">{body}</p>
            <span className="mt-3 inline-flex rounded-full border-2 border-ink px-3 py-1 text-sm font-bold" style={{ background: a1 }}>
              {brand.cta}
            </span>
          </div>
        </div>
      )}
      {!reduce && (
        <motion.div
          key={wipeKey}
          aria-hidden="true"
          className="absolute inset-0 origin-right bg-cream"
          initial={{ scaleX: 1 }}
          animate={{ scaleX: 0 }}
          transition={{ duration: 0.5, ease: [0.65, 0, 0.35, 1] }}
        />
      )}
    </div>
  )
}
