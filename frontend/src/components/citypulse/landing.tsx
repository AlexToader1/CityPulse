'use client'

import { motion } from 'framer-motion'
import { useReducedMotionSafe as useReducedMotion } from '@/lib/use-reduced-motion'
import { LandingMap } from './landing-map'
import { ArrowButton, Logo, SignalShape } from './primitives'

const HEADLINE = ['One', 'brand.', 'Every', 'city.', 'Its', 'own', 'pulse.']

const STEPS = [
  { title: 'Drop your brand', text: 'Upload your master ad and pick the cities you run in.', bg: 'bg-yellow', n: '01' },
  { title: 'Feel the city', text: 'We read weather, events, holidays and trends for each city.', bg: 'bg-sky', n: '02' },
  { title: 'Adapt and check', text: 'Cities worth it get a tailored ad, checked against your rules.', bg: 'bg-pink', n: '03' },
  { title: 'Ship it', text: 'Export each ad, ready for your Instagram feed or story.', bg: 'bg-lime', n: '04' },
]

export function Landing({ onStart }: { onStart: () => void }) {
  const reduce = useReducedMotion()

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 border-b-2 border-ink bg-cream">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-3">
          <div className="flex items-center gap-4">
            <Logo />
            <span className="mono-label hidden sm:inline">Geo campaign HQ</span>
          </div>
          <button type="button" onClick={onStart} className="nb-btn-primary px-4 py-2 text-base">
            Try the demo
          </button>
        </div>
      </header>

      <main>
        <section className="mx-auto grid max-w-7xl items-center gap-12 px-5 py-14 lg:grid-cols-[1fr_1.05fr] lg:py-20">
          <div className="relative isolate">
            <div
              aria-hidden="true"
              className="absolute -left-10 -top-10 -z-10 h-[78%] w-[92%] rotate-[-4deg] rounded-[48px] bg-sky"
            />
            <span className="nb-pill bg-lime shadow-nb-sm">
              <span className="mono-label">Geo-localized ads, on autopilot</span>
            </span>
            <h1 className="mt-6 text-balance text-5xl font-bold leading-[0.98] tracking-tight md:text-7xl">
              {HEADLINE.map((word, i) => (
                <motion.span
                  key={i}
                  className="mr-[0.22em] inline-block"
                  initial={reduce ? false : { opacity: 0, y: 24 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 24, delay: 0.1 + i * 0.07 }}
                >
                  {word}
                </motion.span>
              ))}
            </h1>
            <p className="mt-8 max-w-xl text-pretty text-lg leading-relaxed">
              {"Upload your master ad and CityPulse adapts it to each city's moment, using weather, events and holidays. Where adapting won't move the needle, it keeps your original."}
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <button type="button" onClick={onStart} className="nb-btn-primary text-lg">
                Try the demo
              </button>
              <ArrowButton label="Try the demo" onClick={onStart} />
              <a href="#how-it-works" className="nb-btn-secondary text-lg">
                See how it works
              </a>
            </div>
          </div>
          <LandingMap />
        </section>

        <section id="how-it-works" className="scroll-mt-20 border-y-2 border-ink bg-white">
          <div className="mx-auto max-w-7xl px-5 py-16">
            <h2 className="text-balance text-4xl font-bold tracking-tight md:text-5xl">From one ad to eight cities in minutes</h2>
            <ol className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {STEPS.map((s) => (
                <li key={s.title} className={`rounded-xl border-2 border-ink p-6 shadow-nb ${s.bg}`}>
                  <span className="mono-label">{`Step ${s.n}`}</span>
                  <h3 className="mt-6 text-2xl font-bold">{s.title}</h3>
                  <p className="mt-2 leading-relaxed">{s.text}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-5 py-16">
          <h2 className="text-balance text-4xl font-bold tracking-tight md:text-5xl">Made to fit. Checked before it goes out.</h2>
          <div className="mt-10 grid gap-6 md:grid-cols-3">
            <FeatureBlock title="A heatmap of your cities" text="See at a glance where a tailored ad is worth making today, and where your original already works.">
              <div className="flex items-end gap-2" aria-hidden="true">
                {['bg-sky', 'bg-lavender', 'bg-orange', 'bg-yellow', 'bg-pink'].map((c, i) => (
                  <span key={c} className={`rounded-full border-2 border-ink ${c}`} style={{ width: 14 + i * 6, height: 14 + i * 6 }} />
                ))}
              </div>
            </FeatureBlock>
            <FeatureBlock title="Ads that match the moment, with a reason" text="Each tailored ad comes with one clear sentence on why it changed for that city.">
              <div className="flex items-center gap-3" aria-hidden="true">
                <SignalShape type="weather" className="size-8" />
                <SignalShape type="event" className="size-8" />
                <SignalShape type="holiday" className="size-8" />
                <SignalShape type="trend" className="size-8" />
              </div>
            </FeatureBlock>
            <FeatureBlock title="A safety check before anything goes out" text="Copy is checked against brand and advertising rules. Risky claims are fixed or held back.">
              <div className="flex flex-wrap gap-2" aria-hidden="true">
                <span className="nb-pill bg-lime text-xs">Safe to run</span>
                <span className="nb-pill bg-yellow text-xs">Fixed</span>
                <span className="nb-pill bg-pink text-xs">Held back</span>
              </div>
            </FeatureBlock>
          </div>
        </section>

        <section className="border-y-2 border-ink bg-orange">
          <p className="mx-auto max-w-7xl px-5 py-6 text-lg font-bold leading-relaxed">
            Live data: weather from Open-Meteo and each city&apos;s Google searches. Events come from a list we curate
            from public sources. The CityPulse score is a prioritization guide, not a prediction.
          </p>
        </section>
      </main>

      <footer className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-5 py-8">
        <Logo />
        <p className="text-base">Built by Daiana, Radu and Alex for the Adobe hackathon, Marketing Reimagined.</p>
      </footer>
    </div>
  )
}

function FeatureBlock({ title, text, children }: { title: string; text: string; children: React.ReactNode }) {
  return (
    <article className="nb-card flex flex-col gap-4 p-6">
      <div className="flex h-16 items-center">{children}</div>
      <h3 className="text-2xl font-bold leading-tight">{title}</h3>
      <p className="leading-relaxed">{text}</p>
    </article>
  )
}
