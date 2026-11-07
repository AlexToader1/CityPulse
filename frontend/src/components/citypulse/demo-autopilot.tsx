'use client'

import { Play, Square } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { AdView } from './ad-studio'

export type DemoActions = {
  select: (city: string | null) => void
  simulate: (id: string | null) => void
  setView: (v: AdView) => void
  resetMap: () => void
  skipCity: () => string | null
  toast: (text: string) => void
}

class Stopped extends Error {}

export function DemoAutopilot({ actions }: { actions: DemoActions }) {
  const [running, setRunning] = useState(false)
  const token = useRef(0)
  const actionsRef = useRef(actions)
  actionsRef.current = actions

  function stop() {
    token.current++
    setRunning(false)
  }

  async function start() {
    const id = ++token.current
    setRunning(true)
    const wait = (ms: number) =>
      new Promise<void>((res, rej) => setTimeout(() => (token.current === id ? res() : rej(new Stopped())), ms))
    const a = () => actionsRef.current
    try {
      a().simulate(null)
      a().select(null)
      a().resetMap()
      await wait(1400)
      a().select('Bucharest')
      a().setView('tailored')
      await wait(3600)
      a().simulate('storm-bucharest')
      await wait(3600)
      a().setView('master')
      await wait(1800)
      a().setView('tailored')
      await wait(2200)
      a().select('Cluj-Napoca')
      await wait(3200)
      a().simulate('festival-cluj')
      await wait(3800)
      const skip = a().skipCity()
      if (skip) {
        a().select(skip)
        await wait(3400)
      }
      a().simulate(null)
      a().select(null)
      a().resetMap()
      await wait(1200)
      a().toast('Demo finished. Your turn.')
    } catch (e) {
      if (!(e instanceof Stopped)) throw e
    } finally {
      if (token.current === id) setRunning(false)
    }
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (running) return stop()
      const el = e.target as HTMLElement
      if (el.closest('input, textarea, select, [contenteditable="true"]')) return
      if ((e.key === 'd' || e.key === 'D') && !e.metaKey && !e.ctrlKey && !e.altKey) start()
    }
    const onPointer = (e: PointerEvent) => {
      if (running && !(e.target as HTMLElement).closest('[data-demo-toggle]')) stop()
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('pointerdown', onPointer, true)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('pointerdown', onPointer, true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running])

  return (
    <button
      type="button"
      data-demo-toggle
      onClick={() => (running ? stop() : start())}
      className={`nb-pill px-4 py-2 shadow-nb-sm ${running ? 'bg-pink' : 'bg-white'}`}
      aria-pressed={running}
    >
      {running ? <Square className="size-4" aria-hidden="true" /> : <Play className="size-4" aria-hidden="true" />}
      {running ? 'Stop demo' : 'Play demo'}
      <kbd className="rounded border-2 border-ink bg-cream px-1 font-mono text-[11px]">D</kbd>
    </button>
  )
}
