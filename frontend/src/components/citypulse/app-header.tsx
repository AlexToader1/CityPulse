import type { ReactNode } from 'react'
import { Logo } from './primitives'

export function AppHeader({ label, onHome, children }: { label: string; onHome: () => void; children?: ReactNode }) {
  return (
    <header className="border-b-2 border-ink bg-cream">
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
        <div className="flex items-center gap-4">
          <button type="button" onClick={onHome} aria-label="Back to the CityPulse home page" className="rounded-full">
            <Logo />
          </button>
          <span className="mono-label">{label}</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">{children}</div>
      </div>
    </header>
  )
}
