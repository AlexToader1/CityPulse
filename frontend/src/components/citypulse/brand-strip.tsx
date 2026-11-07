import type { BrandDNA } from '@/lib/citypulse/types'

export function BrandStrip({ brand }: { brand: BrandDNA }) {
  return (
    <section className="nb-card flex flex-col gap-4 p-4" aria-labelledby="brand-strip-title">
      <div className="flex items-center justify-between gap-2">
        <h2 id="brand-strip-title" className="font-bold">
          Brand DNA
        </h2>
        <span className="mono-label truncate">{brand.name}</span>
      </div>
      <ul className="flex gap-2" aria-label="Brand colors">
        {brand.swatches.map((s) => (
          <li key={s} className="flex flex-1 flex-col overflow-hidden rounded-lg border-2 border-ink">
            <span className="h-10" style={{ background: s }} />
            <span className="border-t-2 border-ink bg-white px-1 py-0.5 text-center font-mono text-[11px] font-bold">{s}</span>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        <span className="nb-pill bg-white text-sm">{brand.font}</span>
        {brand.tone.map((t) => (
          <span key={t} className="nb-pill bg-lavender text-sm">
            {t}
          </span>
        ))}
      </div>
      <p className="text-sm">
        <span className="font-bold">Master:</span> {brand.masterHeadline}
      </p>
    </section>
  )
}
