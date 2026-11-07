'use client'

import { animate } from 'framer-motion'
import { useReducedMotionSafe as useReducedMotion } from '@/lib/use-reduced-motion'
import { ArrowUpRight } from 'lucide-react'
import { useEffect, useRef, useState, type ButtonHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'
import { API_BASE_URL } from '@/lib/citypulse/config'
import type { SignalSource, SignalType } from '@/lib/citypulse/types'

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn('nb-pill !bg-yellow px-3 py-1 text-base shadow-nb-sm', className)}>
      <svg viewBox="0 0 24 24" className="size-4" aria-hidden="true">
        <path d="M12 1.5l2.6 7.1 7.4.3-5.8 4.6 2 7.2L12 16.6l-6.2 4.1 2-7.2L2 8.9l7.4-.3z" fill="var(--cp-ink)" />
      </svg>
      CityPulse
    </span>
  )
}

export function ArrowButton({ className, label, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      className={cn(
        'group inline-flex size-11 shrink-0 items-center justify-center rounded-full border-2 border-ink bg-white shadow-nb-sm',
        className,
      )}
      {...rest}
    >
      <ArrowUpRight className="size-5 transition-transform duration-200 ease-out group-hover:rotate-45" aria-hidden="true" />
    </button>
  )
}

const SHAPE_FILL: Record<SignalType, string> = {
  weather: 'var(--cp-sky)',
  event: 'var(--cp-yellow)',
  holiday: 'var(--cp-pink)',
  trend: 'var(--cp-lime)',
}

export function SignalShape({ type, className }: { type: SignalType; className?: string }) {
  const fill = SHAPE_FILL[type]
  return (
    <svg viewBox="0 0 20 20" className={cn('size-4 shrink-0', className)} role="img" aria-label={type}>
      {type === 'weather' && <circle cx="10" cy="10" r="7.5" fill={fill} stroke="var(--cp-ink)" strokeWidth="2" />}
      {type === 'event' && (
        <path d="M10 1.8l2.3 5.2 5.6.5-4.3 3.7 1.3 5.5L10 13.8 5.1 16.7l1.3-5.5L2.1 7.5l5.6-.5z" fill={fill} stroke="var(--cp-ink)" strokeWidth="1.8" strokeLinejoin="round" />
      )}
      {type === 'holiday' && <path d="M10 2l8 8-8 8-8-8z" fill={fill} stroke="var(--cp-ink)" strokeWidth="2" strokeLinejoin="round" />}
      {type === 'trend' && <path d="M10 2.5l8 14.5H2z" fill={fill} stroke="var(--cp-ink)" strokeWidth="2" strokeLinejoin="round" />}
    </svg>
  )
}

const SOURCE_BG: Record<SignalSource, string> = {
  live: 'bg-lime',
  curated: 'bg-lavender',
  simulated: 'bg-orange',
}

export function SourceTag({ source }: { source: SignalSource }) {
  return (
    <span className={cn('mono-label rounded-md border-2 border-ink px-1.5 py-0.5 text-[10px] leading-none', SOURCE_BG[source])}>
      {source}
    </span>
  )
}

export function DemoBadge() {
  return (
    <span className="nb-pill bg-white">
      <span className="size-2 rounded-full bg-orange ring-2 ring-ink" aria-hidden="true" />
      <span className="mono-label">{API_BASE_URL ? 'Live signals + demo events' : 'Demo data'}</span>
    </span>
  )
}

export function LiveBadge() {
  return (
    <span className="nb-pill bg-white">
      <span className="size-2 rounded-full bg-lime ring-2 ring-ink" aria-hidden="true" />
      <span className="mono-label">Live data</span>
    </span>
  )
}

/** Tween a number toward its target; starts from `from` on mount. */
export function useTweenedNumber(target: number, { from = 0, duration = 0.6 } = {}) {
  const reduce = useReducedMotion()
  const [value, setValue] = useState(reduce ? target : from)
  const current = useRef(reduce ? target : from)
  useEffect(() => {
    if (reduce) {
      current.current = target
      setValue(target)
      return
    }
    const controls = animate(current.current, target, {
      duration,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (v) => {
        current.current = v
        setValue(v)
      },
    })
    return () => controls.stop()
  }, [target, duration, reduce])
  return value
}
