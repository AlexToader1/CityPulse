'use client'

import { AnimatePresence, motion } from 'framer-motion'
import { useReducedMotionSafe as useReducedMotion } from '@/lib/use-reduced-motion'
import { Check, Upload as UploadIcon, X } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import useSWR from 'swr'
import { analyzeBrand, fetchCityList } from '@/lib/citypulse/api'
import { ALL_CITIES, BUSINESS_CATEGORIES } from '@/lib/citypulse/mock-data'
import type { BrandDNA, BusinessCategory } from '@/lib/citypulse/types'
import { cn } from '@/lib/utils'
import { AppHeader } from './app-header'
import { BrandReveal } from './brand-reveal'
import { ArrowButton } from './primitives'

const MAX_BYTES = 10 * 1024 * 1024
const LOADER_STEPS = ['Reading your brand', 'Listening to each city', 'Scoring']

type Phase = 'form' | 'loading' | 'reveal'

export function Upload({
  onHome,
  onDone,
}: {
  onHome: () => void
  onDone: (result: { brand: BrandDNA; category: BusinessCategory; cities: string[] }) => void
}) {
  const reduce = useReducedMotion()
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [category, setCategory] = useState<BusinessCategory>('Cafe')
  // City list comes from the backend (GET /api/cities); the built-in list is only a fallback.
  const { data: cityList } = useSWR('city-list', fetchCityList, { revalidateOnFocus: false })
  const available: string[] = cityList?.ok ? cityList.data.map((c) => c.name) : [...ALL_CITIES]
  // null = "every city" until the person toggles one
  const [picked, setPicked] = useState<string[] | null>(null)
  const cities = picked ?? available
  const setCities = (update: (cs: string[]) => string[]) => setPicked(update(cities))
  const [phase, setPhase] = useState<Phase>('form')
  const [tick, setTick] = useState(0)
  const [brand, setBrand] = useState<BrandDNA | null>(null)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const selectId = useId()

  useEffect(() => () => void (preview && URL.revokeObjectURL(preview)), [preview])

  function chooseFile(f: File | undefined) {
    if (!f) return
    if (!['image/png', 'image/jpeg'].includes(f.type)) return setFileError('Please choose a PNG or JPG file.')
    if (f.size > MAX_BYTES) return setFileError('That file is over 10 MB.')
    setFileError(null)
    setFile(f)
    setPreview(URL.createObjectURL(f))
  }

  function removeFile() {
    setFile(null)
    setPreview(null)
    if (inputRef.current) inputRef.current.value = ''
  }

  const previewSrc = preview?.startsWith('blob:') ? preview : null

  async function run(useSample: boolean) {
    setError(null)
    setPhase('loading')
    setTick(0)
    const stepMs = reduce ? 250 : 750
    const ticker = (async () => {
      for (let i = 1; i <= LOADER_STEPS.length; i++) {
        await new Promise((r) => setTimeout(r, stepMs))
        setTick(i)
      }
    })()
    const [res] = await Promise.all([analyzeBrand({ file: useSample ? null : file, category }), ticker])
    if (!res.ok) {
      setError("That didn't render. Try again.")
      setPhase('form')
      return
    }
    setBrand(res.data)
    setPhase('reveal')
  }

  return (
    <div className="min-h-dvh">
      <AppHeader label="Step 1 of 2: Upload" onHome={onHome} />
      <main className="mx-auto max-w-3xl px-5 py-12">
        <h1 className="text-balance text-5xl font-bold tracking-tight">Show us your brand</h1>
        <p className="mt-3 text-lg">Drop your master ad, tell us what you sell and where you run.</p>

        {phase === 'form' && (
          <div className="mt-8 flex flex-col gap-6">
            <section className="nb-card p-5" aria-labelledby="master-ad">
              <h2 id="master-ad" className="font-bold">
                Master ad
              </h2>
              {!file ? (
                <motion.label
                  animate={{ scale: dragOver ? 1.02 : 1 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 22 }}
                  onDragOver={(e) => {
                    e.preventDefault()
                    setDragOver(true)
                  }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={(e) => {
                    e.preventDefault()
                    setDragOver(false)
                    chooseFile(e.dataTransfer.files[0])
                  }}
                  className={cn(
                    'mt-4 flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-ink px-6 py-14 text-center focus-within:outline-3 focus-within:outline-ink',
                    dragOver ? 'bg-mint' : 'bg-cream',
                  )}
                >
                  <span className="flex size-12 items-center justify-center rounded-lg border-2 border-ink bg-primary shadow-nb-sm">
                    <UploadIcon className="size-5" aria-hidden="true" />
                  </span>
                  <span className="text-lg font-bold">Drag and drop your ad here</span>
                  <span className="text-base">
                    or <span className="font-bold underline underline-offset-4">browse files</span>, PNG or JPG up to 10 MB
                  </span>
                  <input
                    ref={inputRef}
                    type="file"
                    accept="image/png,image/jpeg"
                    className="sr-only"
                    onChange={(e) => chooseFile(e.target.files?.[0])}
                  />
                </motion.label>
              ) : (
                <motion.div
                  initial={reduce ? false : { scale: 0.92, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: 'spring', stiffness: 380, damping: 20 }}
                  className="mt-4 flex items-center gap-4 rounded-xl border-2 border-ink bg-cream p-4"
                >
                  {previewSrc && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={previewSrc} alt="Preview of your master ad" className="size-24 rounded-lg border-2 border-ink object-cover" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-bold">{file.name}</p>
                    <p className="font-mono text-sm">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                  </div>
                  <button type="button" onClick={removeFile} className="nb-btn-secondary px-3 py-2 text-base" aria-label={`Remove ${file.name}`}>
                    <X className="size-4" aria-hidden="true" /> Remove
                  </button>
                </motion.div>
              )}
              {fileError && (
                <p role="alert" className="mt-3 font-bold">
                  {fileError}
                </p>
              )}
            </section>

            <section className="nb-card p-5">
              <label htmlFor={selectId} className="font-bold">
                Business category
              </label>
              <select
                id={selectId}
                value={category}
                onChange={(e) => setCategory(e.target.value as BusinessCategory)}
                className="mt-3 w-full rounded-lg border-2 border-ink bg-white px-4 py-3 text-lg font-bold shadow-nb-sm"
              >
                {BUSINESS_CATEGORIES.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </section>

            <fieldset className="nb-card p-5">
              <legend className="sr-only">Cities</legend>
              <div className="flex items-center justify-between gap-3">
                <span className="font-bold" aria-hidden="true">
                  Cities
                </span>
                <span className="mono-label">{`${cities.length} of ${available.length} selected`}</span>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {available.map((c) => {
                  const on = cities.includes(c)
                  return (
                    <button
                      key={c}
                      type="button"
                      aria-pressed={on}
                      onClick={() => setCities((cs) => (on ? cs.filter((x) => x !== c) : [...cs, c]))}
                      className={cn(
                        'nb-pill px-4 py-2 text-base transition-transform active:scale-95',
                        on ? 'bg-primary shadow-nb-sm' : 'bg-white',
                      )}
                    >
                      {on && <Check className="size-4" aria-hidden="true" />}
                      {c}
                    </button>
                  )
                })}
              </div>
            </fieldset>

            {error && (
              <p role="alert" className="rounded-xl border-2 border-ink bg-pink p-4 font-bold">
                {error}
              </p>
            )}

            <div className="flex flex-wrap items-center gap-3">
              <button type="button" onClick={() => run(false)} disabled={!file || cities.length === 0} className="nb-btn-primary text-lg">
                Analyze my brand
              </button>
              <ArrowButton label="Analyze my brand" onClick={() => run(false)} disabled={!file || cities.length === 0} />
              <button type="button" onClick={() => run(true)} disabled={cities.length === 0} className="nb-btn-secondary text-lg">
                Use a sample brand, no upload needed
              </button>
            </div>
          </div>
        )}

        <AnimatePresence>
          {phase === 'loading' && (
            <motion.section
              key="loader"
              initial={reduce ? false : { opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="nb-card mt-8 p-6"
              aria-live="polite"
              aria-busy="true"
            >
              <h2 className="sr-only">Analyzing</h2>
              <ol className="flex flex-col gap-4">
                {LOADER_STEPS.map((s, i) => {
                  const done = tick > i
                  const active = tick === i
                  return (
                    <li key={s} className="flex items-center gap-4 text-lg font-bold">
                      <motion.span
                        animate={{ scale: done ? [1, 1.25, 1] : 1 }}
                        transition={{ duration: 0.35 }}
                        className={cn(
                          'flex size-9 items-center justify-center rounded-full border-2 border-ink',
                          done ? 'bg-lime' : active ? 'bg-primary' : 'bg-white',
                        )}
                      >
                        {done ? <Check className="size-5" aria-hidden="true" /> : <span className="font-mono text-sm">{i + 1}</span>}
                      </motion.span>
                      <span className={done || active ? '' : 'opacity-60'}>{s}</span>
                      {done && <span className="sr-only">done</span>}
                    </li>
                  )
                })}
              </ol>
            </motion.section>
          )}
        </AnimatePresence>

        {phase === 'reveal' && brand && (
          <div className="mt-8">
            <BrandReveal brand={brand} onContinue={() => onDone({ brand, category, cities })} />
          </div>
        )}
      </main>
    </div>
  )
}
