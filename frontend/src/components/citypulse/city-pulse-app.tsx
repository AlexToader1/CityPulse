'use client'

import { AnimatePresence, MotionConfig, motion } from 'framer-motion'
import { useReducedMotionSafe as useReducedMotion } from '@/lib/use-reduced-motion'
import { useState } from 'react'
import type { BrandDNA, BusinessCategory } from '@/lib/citypulse/types'
import { applyBrandPrimary } from './brand-reveal'
import { Dashboard } from './dashboard'
import { Landing } from './landing'
import { ToastProvider } from './toast'
import { Upload } from './upload'

type Screen = { name: 'landing' } | { name: 'upload' } | { name: 'dashboard'; brand: BrandDNA; category: BusinessCategory; cities: string[] }

export function CityPulseApp() {
  const reduce = useReducedMotion()
  const [screen, setScreen] = useState<Screen>({ name: 'landing' })

  const go = (s: Screen) => {
    if (s.name !== 'dashboard') applyBrandPrimary(null)
    setScreen(s)
    window.scrollTo({ top: 0 })
  }

  return (
    <MotionConfig reducedMotion="user">
    <ToastProvider>
      <AnimatePresence mode="wait">
        <motion.div
          key={screen.name}
          initial={reduce ? false : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduce ? undefined : { opacity: 0, y: -8 }}
          transition={{ duration: 0.25, ease: 'easeOut' }}
        >
          {screen.name === 'landing' && <Landing onStart={() => go({ name: 'upload' })} />}
          {screen.name === 'upload' && (
            <Upload onHome={() => go({ name: 'landing' })} onDone={(r) => go({ name: 'dashboard', ...r })} />
          )}
          {screen.name === 'dashboard' && (
            <Dashboard
              brand={screen.brand}
              category={screen.category}
              selectedCities={screen.cities}
              onHome={() => go({ name: 'landing' })}
            />
          )}
        </motion.div>
      </AnimatePresence>
    </ToastProvider>
    </MotionConfig>
  )
}
