'use client'

import { useReducedMotion } from 'framer-motion'
import { useEffect, useState } from 'react'

/**
 * framer-motion's useReducedMotion() is null on the server but true in the browser for people with
 * "Reduce motion" on, so `initial={reduce ? false : {...}}` renders differently on each side and
 * React reports a hydration mismatch. This returns false on the server and on the first client
 * render, then the real preference, so both renders match. (`<MotionConfig reducedMotion="user">`
 * in city-pulse-app.tsx still turns off transform animations for these users.)
 */
export function useReducedMotionSafe(): boolean {
  const reduce = useReducedMotion()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  return mounted ? Boolean(reduce) : false
}
