'use client'

import { motion } from 'framer-motion'
import { useReducedMotionSafe as useReducedMotion } from '@/lib/use-reduced-motion'
import { Minus, Plus, RotateCcw } from 'lucide-react'
import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react'
import { topSignal } from '@/lib/citypulse/cities'
import { chaikin, fitProjection, pointInPolygon, ROMANIA_OUTLINE, scanlineCrossings, type Pt } from '@/lib/citypulse/geo'
import { buildRamp, heatVar, readCssColor } from '@/lib/citypulse/heat'
import type { CityResult } from '@/lib/citypulse/types'
import { cn } from '@/lib/utils'
import { useTweenedNumber } from './primitives'

export type HeatmapHandle = { flyTo: (city: string) => void; reset: () => void }

type Props = {
  cities: CityResult[]
  selected: string | null
  onSelect: (city: string) => void
}

const MIN_ZOOM = 1
const MAX_ZOOM = 16
const MAX_DOTS = 40000
const RAMP_STEPS = 20
const IGNITION_MS = 1200
const FLY_ZOOM = 4.5

type View = { z: number; cx: number; cy: number }
type Geometry = {
  w: number
  h: number
  poly: Pt[]
  outline: Path2D
  bbox: { x0: number; y0: number; x1: number; y1: number }
  cityPos: Map<string, Pt>
  radius: number
  spacing: number
  originDist: number
}

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))
const smoothstep = (a: number, b: number, v: number) => {
  const t = clamp((v - a) / (b - a), 0, 1)
  return t * t * (3 - 2 * t)
}
const easeOutCubic = (t: number) => 1 - (1 - t) ** 3

function hash(x: number, y: number) {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263)) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295
}
function vnoise(x: number, y: number) {
  const xi = Math.floor(x)
  const yi = Math.floor(y)
  const xf = x - xi
  const yf = y - yi
  const u = xf * xf * (3 - 2 * xf)
  const v = yf * yf * (3 - 2 * yf)
  const a = hash(xi, yi)
  const b = hash(xi + 1, yi)
  const c = hash(xi, yi + 1)
  const d = hash(xi + 1, yi + 1)
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v
}

function buildGeometry(w: number, h: number): Geometry {
  const proj = fitProjection(w, h, Math.max(24, Math.min(w, h) * 0.06))
  const poly = chaikin(ROMANIA_OUTLINE.map(proj.project), 3)
  const outline = new Path2D()
  poly.forEach(([x, y], i) => (i ? outline.lineTo(x, y) : outline.moveTo(x, y)))
  outline.closePath()
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (const [x, y] of poly) {
    x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y)
  }
  const cityPos = new Map<string, Pt>()
  return {
    w,
    h,
    poly,
    outline,
    bbox: { x0, y0, x1, y1 },
    cityPos,
    radius: (x1 - x0) * 0.11,
    // Keep the worst-case dot count under the cap at this viewport size.
    spacing: Math.max(6, Math.sqrt((w * h) / MAX_DOTS) / 0.68),
    originDist: Math.hypot(x1 - x0, y1 - y0),
  }
}

export const Heatmap = forwardRef<HeatmapHandle, Props>(function Heatmap({ cities, selected, onSelect }, ref) {
  const reduce = useReducedMotion()
  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const miniRef = useRef<HTMLCanvasElement>(null)
  const zoomLabelRef = useRef<HTMLSpanElement>(null)
  const readoutRef = useRef<HTMLDivElement>(null)
  const pinRefs = useRef(new Map<string, HTMLDivElement>())

  const citiesRef = useRef(cities)
  citiesRef.current = cities
  const reduceRef = useRef(reduce)
  reduceRef.current = reduce

  const geoRef = useRef<Geometry | null>(null)
  const viewRef = useRef<View>({ z: 1, cx: 0, cy: 0 })
  const animRef = useRef<{ from: View; to: View; t0: number; dur: number } | null>(null)
  const velRef = useRef({ x: 0, y: 0, active: false })
  const heatState = useRef(new Map<string, { s: number; a: number }>())
  const ribbonRef = useRef({ key: '', progress: 0 })
  const igniteRef = useRef(0)
  const [geoProj, setGeoProj] = useState<((ll: [number, number]) => Pt) | null>(null)

  // --- view helpers -------------------------------------------------------
  function clampView(v: View): View {
    const g = geoRef.current
    if (!g) return v
    const z = clamp(v.z, MIN_ZOOM, MAX_ZOOM)
    return { z, cx: clamp(v.cx, g.bbox.x0, g.bbox.x1), cy: clamp(v.cy, g.bbox.y0, g.bbox.y1) }
  }
  function homeView(): View {
    const g = geoRef.current
    return g ? { z: 1, cx: g.w / 2, cy: g.h / 2 } : { z: 1, cx: 0, cy: 0 }
  }
  function animateTo(to: View, dur = 700) {
    velRef.current.active = false
    const target = clampView(to)
    if (reduceRef.current) {
      viewRef.current = target
      animRef.current = null
      return
    }
    animRef.current = { from: { ...viewRef.current }, to: target, t0: performance.now(), dur }
  }
  function zoomAround(sx: number, sy: number, factor: number, animated: boolean) {
    const g = geoRef.current
    if (!g) return
    const v = animRef.current?.to ?? viewRef.current
    const mx = v.cx + (sx - g.w / 2) / v.z
    const my = v.cy + (sy - g.h / 2) / v.z
    const z = clamp(v.z * factor, MIN_ZOOM, MAX_ZOOM)
    const next = { z, cx: mx - (sx - g.w / 2) / z, cy: my - (sy - g.h / 2) / z }
    if (animated) animateTo(next, 450)
    else {
      animRef.current = null
      viewRef.current = clampView(next)
    }
  }

  useImperativeHandle(ref, () => ({
    flyTo(city) {
      const p = geoRef.current?.cityPos.get(city)
      if (p) animateTo({ z: Math.max(FLY_ZOOM, viewRef.current.z), cx: p[0], cy: p[1] }, 900)
    },
    reset() {
      animateTo(homeView(), 900)
    },
  }))

  useEffect(() => {
    if (!selected) return
    const p = geoRef.current?.cityPos.get(selected)
    if (p) animateTo({ z: Math.max(FLY_ZOOM, viewRef.current.z), cx: p[0], cy: p[1] }, 900)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected])

  // --- sizing -------------------------------------------------------------
  useLayoutEffect(() => {
    const wrap = wrapRef.current
    if (!wrap) return
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      if (width < 10 || height < 10) return
      const prev = geoRef.current
      const g = buildGeometry(width, height)
      const proj = fitProjection(width, height, Math.max(24, Math.min(width, height) * 0.06))
      for (const c of citiesRef.current) g.cityPos.set(c.city, proj.project([c.lon, c.lat]))
      geoRef.current = g
      setGeoProj(() => proj.project)
      if (prev) {
        const v = viewRef.current
        viewRef.current = { z: v.z, cx: (v.cx / prev.w) * width, cy: (v.cy / prev.h) * height }
      } else {
        viewRef.current = { z: 1, cx: width / 2, cy: height / 2 }
        igniteRef.current = performance.now()
      }
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const canvas = canvasRef.current!
      canvas.width = Math.round(width * dpr)
      canvas.height = Math.round(height * dpr)
    })
    ro.observe(wrap)
    return () => ro.disconnect()
  }, [])

  // Keep city positions in sync with the selected city list.
  useEffect(() => {
    const g = geoRef.current
    if (!g || !geoProj) return
    for (const c of cities) if (!g.cityPos.has(c.city)) g.cityPos.set(c.city, geoProj([c.lon, c.lat]))
  }, [cities, geoProj])

  // --- render loop --------------------------------------------------------
  useEffect(() => {
    const canvas = canvasRef.current!
    const ctx = canvas.getContext('2d')!
    const mini = miniRef.current!
    const mctx = mini.getContext('2d')!
    const ramp = buildRamp(RAMP_STEPS)
    const ink = `rgb(${readCssColor('--cp-ink', '#111111').join(',')})`
    const sky = `rgb(${readCssColor('--cp-sky', '#3da5ff').join(',')})`
    const mint = `rgb(${readCssColor('--cp-mint', '#dcebdd').join(',')})`
    const white = '#ffffff'

    const tile = document.createElement('canvas')
    tile.width = tile.height = 88
    const tctx = tile.getContext('2d')!
    tctx.fillStyle = white
    tctx.fillRect(0, 0, 88, 88)
    tctx.fillStyle = mint
    tctx.fillRect(0, 0, 88, 4)
    tctx.fillRect(0, 0, 4, 88)
    const gridPattern = ctx.createPattern(tile, 'repeat')!

    // Buckets: [base pass | fine pass] x [pale + ramp], flat arrays of x, y, r.
    const BUCKETS = (RAMP_STEPS + 1) * 2
    const buckets: number[][] = Array.from({ length: BUCKETS }, () => [])
    let last = performance.now()
    let miniKey = ''
    let raf = 0

    const heatAt = (mx: number, my: number, g: Geometry, zoom: number, active: { x: number; y: number; s: number }[]) => {
      const R2 = g.radius * g.radius
      let sum = 0
      let wsum = 0.9
      let halo = 0
      const block = g.radius * 0.05
      for (let k = 0; k < active.length; k++) {
        const c = active[k]
        const dx = mx - c.x
        const dy = my - c.y
        const d2 = (dx * dx + dy * dy) / R2
        const wk = 1 / (d2 + 0.08)
        sum += wk * c.s
        wsum += wk
        const dq = Math.floor(Math.sqrt(dx * dx + dy * dy) / block) * block
        const hk = c.s * Math.exp(-dq / (g.radius * 0.22))
        if (hk > halo) halo = hk
      }
      const base = sum / wsum
      const inv = 1 / g.radius
      const n1 = vnoise(mx * inv * 0.8 + 11.3, my * inv * 0.8 + 4.1)
      const n2 = vnoise(mx * inv * 6 + 2.7, my * inv * 6 + 9.9)
      const detail = smoothstep(2, 8, zoom)
      const n3 = detail > 0 ? vnoise(mx * inv * 28, my * inv * 28) : 0.5
      let i = base * (0.68 + 0.5 * n1) + (n2 - 0.5) * 0.14 * (0.3 + base) + (n3 - 0.5) * 0.1 * detail
      i += halo * 0.35 * smoothstep(1.5, 5, zoom)
      return clamp(i, 0, 1)
    }

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame)
      const g = geoRef.current
      if (!g) return
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      const reduced = !!reduceRef.current

      // View animation and inertia.
      const anim = animRef.current
      if (anim) {
        const t = clamp((now - anim.t0) / anim.dur, 0, 1)
        const e = easeOutCubic(t)
        const lz = Math.log(anim.from.z) + (Math.log(anim.to.z) - Math.log(anim.from.z)) * e
        viewRef.current = {
          z: Math.exp(lz),
          cx: anim.from.cx + (anim.to.cx - anim.from.cx) * e,
          cy: anim.from.cy + (anim.to.cy - anim.from.cy) * e,
        }
        if (t >= 1) animRef.current = null
      } else if (velRef.current.active) {
        const vel = velRef.current
        const v = viewRef.current
        viewRef.current = clampView({ z: v.z, cx: v.cx - (vel.x * dt) / v.z, cy: v.cy - (vel.y * dt) / v.z })
        const decay = Math.pow(0.9, dt * 60)
        vel.x *= decay
        vel.y *= decay
        if (Math.hypot(vel.x, vel.y) < 8) vel.active = false
      }
      const { z, cx, cy } = viewRef.current
      const ox = g.w / 2 - cx * z
      const oy = g.h / 2 - cy * z

      // Tween scores and active weights toward their targets.
      const k = reduced ? 1 : 1 - Math.exp(-dt * 6)
      const active: { x: number; y: number; s: number }[] = []
      const ribbonPts: { x: number; y: number; s: number }[] = []
      for (const c of citiesRef.current) {
        const st = heatState.current.get(c.city) ?? { s: 0, a: 0 }
        const ts = c.score / 100
        const ta = c.action === 'SKIP' ? 0 : 1
        st.s += (ts - st.s) * k
        st.a += (ta - st.a) * k
        heatState.current.set(c.city, st)
        const p = g.cityPos.get(c.city)
        if (!p) continue
        if (st.a > 0.01) active.push({ x: p[0], y: p[1], s: st.s * st.a })
        if (c.action !== 'SKIP') ribbonPts.push({ x: p[0], y: p[1], s: c.score })
      }
      ribbonPts.sort((a, b) => b.s - a.s)
      const rKey = ribbonPts.map((p) => `${p.x},${p.y}`).join('|')
      const ribbon = ribbonRef.current
      if (rKey !== ribbon.key) {
        ribbon.key = rKey
        ribbon.progress = reduced ? 1 : 0
      }
      ribbon.progress = Math.min(1, ribbon.progress + dt / 0.9)

      const dpr = canvas.width / g.w
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

      // Grid paper that moves with the map; cells subdivide as you zoom.
      const cell = 44 * (z / 2 ** Math.floor(Math.log2(z)))
      gridPattern.setTransform(new DOMMatrix().translateSelf(ox, oy).scaleSelf(cell / 88))
      ctx.fillStyle = gridPattern
      ctx.fillRect(0, 0, g.w, g.h)

      // Country: offset ink shadow, then white fill (Path2D cached in map space).
      ctx.save()
      ctx.translate(ox + 6, oy + 6)
      ctx.scale(z, z)
      ctx.fillStyle = ink
      ctx.fill(g.outline)
      ctx.restore()
      ctx.save()
      ctx.translate(ox, oy)
      ctx.scale(z, z)
      ctx.fillStyle = white
      ctx.fill(g.outline)
      ctx.restore()

      // Halftone dots with level-of-detail crossfade.
      const l = Math.log2(z)
      const L0 = Math.floor(l)
      const fade = smoothstep(0.45, 1, l - L0)
      const baseSp = g.spacing / 2 ** L0
      const fineSp = baseSp / 2
      const step = fade > 0.01 ? fineSp : baseSp
      const screenSp = (baseSp + (fineSp - baseSp) * fade) * z
      const vx0 = Math.max(g.bbox.x0, cx - g.w / 2 / z)
      const vx1 = Math.min(g.bbox.x1, cx + g.w / 2 / z)
      const vy0 = Math.max(g.bbox.y0, cy - g.h / 2 / z)
      const vy1 = Math.min(g.bbox.y1, cy + g.h / 2 / z)
      for (const b of buckets) b.length = 0

      const t = now / 1000
      const igniteT = reduced ? 1 : (now - igniteRef.current) / IGNITION_MS
      const origin = g.cityPos.get('Bucharest') ?? [g.w / 2, g.h / 2]
      const waveR = igniteT * g.originDist
      const waveBand = g.originDist * 0.12
      const shimmerAmp = reduced ? 0 : 0.12
      let count = 0

      if (vx1 > vx0 && vy1 > vy0) {
        const j0 = Math.ceil(vy0 / step)
        const j1 = Math.floor(vy1 / step)
        for (let j = j0; j <= j1 && count < MAX_DOTS; j++) {
          const my = j * step
          const xs = scanlineCrossings(g.poly, my)
          for (let s = 0; s + 1 < xs.length; s += 2) {
            const a = Math.max(xs[s], vx0)
            const b = Math.min(xs[s + 1], vx1)
            if (b <= a) continue
            for (let i = Math.ceil(a / step); i * step <= b; i++) {
              const mx = i * step
              const isFine = step === fineSp && ((i & 1) !== 0 || (j & 1) !== 0)
              let ig = 1
              if (igniteT < 1.15) {
                const d = Math.hypot(mx - origin[0], my - origin[1])
                ig = clamp((waveR - d) / waveBand, 0, 1)
                if (ig <= 0) continue
              }
              const heat = heatAt(mx, my, g, z, active)
              const shimmer = 1 + shimmerAmp * Math.sin(t * 1.7 + mx * 0.09 + my * 0.13)
              const pale = heat < 0.06
              const r = screenSp * (pale ? 0.13 : 0.15 + 0.37 * Math.pow(heat, 0.85)) * shimmer * (0.4 + 0.6 * ig)
              const bucket = (pale ? 0 : 1 + Math.min(RAMP_STEPS - 1, Math.floor(heat * RAMP_STEPS))) + (isFine ? RAMP_STEPS + 1 : 0)
              buckets[bucket].push(ox + mx * z, oy + my * z, r)
              count++
            }
          }
        }
      }

      for (let bIdx = 0; bIdx < BUCKETS; bIdx++) {
        const arr = buckets[bIdx]
        if (!arr.length) continue
        const fine = bIdx > RAMP_STEPS
        const colorIdx = fine ? bIdx - RAMP_STEPS - 1 : bIdx
        ctx.globalAlpha = (fine ? fade : 1) * (colorIdx === 0 ? 0.35 : 1)
        ctx.fillStyle = colorIdx === 0 ? sky : ramp[colorIdx - 1]
        ctx.beginPath()
        for (let n = 0; n < arr.length; n += 3) {
          ctx.moveTo(arr[n] + arr[n + 2], arr[n + 1])
          ctx.arc(arr[n], arr[n + 1], arr[n + 2], 0, Math.PI * 2)
        }
        ctx.fill()
      }
      ctx.globalAlpha = 1

      // Bold outline on top.
      ctx.save()
      ctx.translate(ox, oy)
      ctx.scale(z, z)
      ctx.lineWidth = 3.5 / z
      ctx.lineJoin = 'round'
      ctx.strokeStyle = ink
      ctx.stroke(g.outline)
      ctx.restore()

      // Ribbon through adapted cities, drawing itself.
      if (ribbonPts.length > 1) {
        ctx.beginPath()
        let len = 0
        ribbonPts.forEach((p, idx) => {
          const sx = ox + p.x * z
          const sy = oy + p.y * z
          if (idx) {
            const prev = ribbonPts[idx - 1]
            len += Math.hypot(sx - (ox + prev.x * z), sy - (oy + prev.y * z))
            ctx.lineTo(sx, sy)
          } else ctx.moveTo(sx, sy)
        })
        const shown = easeOutCubic(ribbon.progress)
        ctx.setLineDash([len * shown, len + 10])
        ctx.lineCap = 'round'
        ctx.lineJoin = 'round'
        ctx.strokeStyle = ink
        ctx.lineWidth = 11
        ctx.stroke()
        ctx.strokeStyle = sky
        ctx.lineWidth = 6
        ctx.stroke()
        ctx.setLineDash([])
      }

      // HTML pins follow the map at constant size.
      for (const [name, el] of pinRefs.current) {
        const p = g.cityPos.get(name)
        if (!p) continue
        const sx = ox + p[0] * z
        const sy = oy + p[1] * z
        const visible = sx > -60 && sx < g.w + 60 && sy > -60 && sy < g.h + 60
        el.style.transform = `translate3d(${sx}px, ${sy}px, 0)`
        el.style.visibility = visible ? 'visible' : 'hidden'
      }

      if (zoomLabelRef.current) zoomLabelRef.current.textContent = `${z < 9.95 ? z.toFixed(1) : Math.round(z)}x`

      // Overview map, redrawn only when the view changes.
      const key = `${z.toFixed(3)}|${cx.toFixed(1)}|${cy.toFixed(1)}|${active.length}`
      if (key !== miniKey) {
        miniKey = key
        const mw = mini.width
        const mh = mini.height
        const ms = mw / g.w
        mctx.setTransform(1, 0, 0, 1, 0, 0)
        mctx.clearRect(0, 0, mw, mh)
        mctx.fillStyle = white
        mctx.fillRect(0, 0, mw, mh)
        mctx.save()
        mctx.scale(ms, ms)
        mctx.fillStyle = 'rgba(17,17,17,0.08)'
        mctx.fill(g.outline)
        mctx.lineWidth = 2 / ms
        mctx.strokeStyle = ink
        mctx.stroke(g.outline)
        for (const c of active) {
          mctx.beginPath()
          mctx.arc(c.x, c.y, 4 / ms, 0, Math.PI * 2)
          mctx.fillStyle = ramp[Math.min(RAMP_STEPS - 1, Math.floor(c.s * RAMP_STEPS))]
          mctx.fill()
        }
        const rw = g.w / z
        const rh = g.h / z
        mctx.lineWidth = 2.5 / ms
        mctx.strokeStyle = ink
        mctx.strokeRect(cx - rw / 2, cy - rh / 2, rw, rh)
        mctx.restore()
      }
    }
    raf = requestAnimationFrame(frame)

    // Hover readout uses the same field, without shimmer.
    const readHeat = (sx: number, sy: number) => {
      const g = geoRef.current
      if (!g) return null
      const { z, cx, cy } = viewRef.current
      const mx = cx + (sx - g.w / 2) / z
      const my = cy + (sy - g.h / 2) / z
      if (!pointInPolygon(g.poly, mx, my)) return null
      const active: { x: number; y: number; s: number }[] = []
      for (const c of citiesRef.current) {
        const st = heatState.current.get(c.city)
        const p = g.cityPos.get(c.city)
        if (st && p && st.a > 0.01) active.push({ x: p[0], y: p[1], s: st.s * st.a })
      }
      return Math.round(heatAt(mx, my, g, z, active) * 100)
    }
    readHeatRef.current = readHeat

    return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const readHeatRef = useRef<((x: number, y: number) => number | null) | null>(null)

  // --- input --------------------------------------------------------------
  useEffect(() => {
    const canvas = canvasRef.current!
    const pointers = new Map<number, { x: number; y: number }>()
    let lastMove = { x: 0, y: 0, t: 0 }
    let pinch: { d: number; mx: number; my: number } | null = null

    const local = (e: { clientX: number; clientY: number }) => {
      const r = canvas.getBoundingClientRect()
      return { x: e.clientX - r.left, y: e.clientY - r.top }
    }
    const pan = (dx: number, dy: number) => {
      const v = viewRef.current
      viewRef.current = clampView({ z: v.z, cx: v.cx - dx / v.z, cy: v.cy - dy / v.z })
    }

    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const p = local(e)
      const delta = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY
      zoomAround(p.x, p.y, Math.exp(-delta * 0.0018), false)
    }
    const onDown = (e: PointerEvent) => {
      canvas.setPointerCapture(e.pointerId)
      pointers.set(e.pointerId, local(e))
      animRef.current = null
      velRef.current = { x: 0, y: 0, active: false }
      lastMove = { ...local(e), t: performance.now() }
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()]
        pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 }
      }
      canvas.style.cursor = 'grabbing'
    }
    const onMove = (e: PointerEvent) => {
      const p = local(e)
      if (!pointers.has(e.pointerId)) {
        const value = readHeatRef.current?.(p.x, p.y)
        const el = readoutRef.current
        if (el) {
          if (value == null) el.style.opacity = '0'
          else {
            el.style.opacity = '1'
            el.style.transform = `translate3d(${p.x + 14}px, ${p.y + 14}px, 0)`
            const valueEl = el.querySelector('[data-value]')
            if (valueEl) valueEl.textContent = String(value)
          }
        }
        return
      }
      pointers.set(e.pointerId, p)
      if (pointers.size === 2 && pinch) {
        const [a, b] = [...pointers.values()]
        const d = Math.hypot(a.x - b.x, a.y - b.y)
        const mx = (a.x + b.x) / 2
        const my = (a.y + b.y) / 2
        pan(mx - pinch.mx, my - pinch.my)
        zoomAround(mx, my, d / pinch.d, false)
        pinch = { d, mx, my }
        return
      }
      if (pointers.size === 1) {
        const now = performance.now()
        const dx = p.x - lastMove.x
        const dy = p.y - lastMove.y
        const dtm = Math.max(1, now - lastMove.t) / 1000
        pan(dx, dy)
        velRef.current.x = velRef.current.x * 0.6 + (dx / dtm) * 0.4
        velRef.current.y = velRef.current.y * 0.6 + (dy / dtm) * 0.4
        lastMove = { x: p.x, y: p.y, t: now }
        if (readoutRef.current) readoutRef.current.style.opacity = '0'
      }
    }
    const onUp = (e: PointerEvent) => {
      pointers.delete(e.pointerId)
      if (pointers.size < 2) pinch = null
      if (pointers.size === 0) {
        canvas.style.cursor = 'grab'
        const recent = performance.now() - lastMove.t < 80
        velRef.current.active = recent && !reduceRef.current && Math.hypot(velRef.current.x, velRef.current.y) > 60
      } else {
        const [rest] = [...pointers.values()]
        lastMove = { ...rest, t: performance.now() }
      }
    }
    const onLeave = () => {
      if (readoutRef.current) readoutRef.current.style.opacity = '0'
    }
    const onDbl = (e: MouseEvent) => {
      const p = local(e)
      zoomAround(p.x, p.y, 2, true)
    }

    canvas.addEventListener('wheel', onWheel, { passive: false })
    canvas.addEventListener('pointerdown', onDown)
    canvas.addEventListener('pointermove', onMove)
    canvas.addEventListener('pointerup', onUp)
    canvas.addEventListener('pointercancel', onUp)
    canvas.addEventListener('pointerleave', onLeave)
    canvas.addEventListener('dblclick', onDbl)
    return () => {
      canvas.removeEventListener('wheel', onWheel)
      canvas.removeEventListener('pointerdown', onDown)
      canvas.removeEventListener('pointermove', onMove)
      canvas.removeEventListener('pointerup', onUp)
      canvas.removeEventListener('pointercancel', onUp)
      canvas.removeEventListener('pointerleave', onLeave)
      canvas.removeEventListener('dblclick', onDbl)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const onKeyDown = (e: React.KeyboardEvent) => {
    const g = geoRef.current
    if (!g) return
    const stepPx = 80
    const map: Record<string, () => void> = {
      ArrowLeft: () => animateTo({ ...viewRef.current, cx: viewRef.current.cx - stepPx / viewRef.current.z }, 250),
      ArrowRight: () => animateTo({ ...viewRef.current, cx: viewRef.current.cx + stepPx / viewRef.current.z }, 250),
      ArrowUp: () => animateTo({ ...viewRef.current, cy: viewRef.current.cy - stepPx / viewRef.current.z }, 250),
      ArrowDown: () => animateTo({ ...viewRef.current, cy: viewRef.current.cy + stepPx / viewRef.current.z }, 250),
      '+': () => zoomAround(g.w / 2, g.h / 2, 2, true),
      '=': () => zoomAround(g.w / 2, g.h / 2, 2, true),
      '-': () => zoomAround(g.w / 2, g.h / 2, 0.5, true),
      '0': () => animateTo(homeView()),
    }
    const fn = map[e.key]
    if (fn) {
      e.preventDefault()
      fn()
    }
  }

  const center = () => {
    const g = geoRef.current
    return g ? [g.w / 2, g.h / 2] : [0, 0]
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div
        ref={wrapRef}
        tabIndex={0}
        role="application"
        aria-roledescription="interactive heat map"
        aria-label="City heat map of Romania. Use arrow keys to pan, plus and minus to zoom, 0 to reset. Tab to reach the city pins."
        onKeyDown={onKeyDown}
        className="relative min-h-[360px] flex-1 overflow-hidden rounded-b-none bg-white"
      >
        <canvas ref={canvasRef} className="absolute inset-0 size-full cursor-grab touch-none" aria-hidden="true" />

        <div className="pointer-events-none absolute inset-0">
          {cities.map((c) => (
            <div
              key={c.city}
              ref={(el) => {
                if (el) pinRefs.current.set(c.city, el)
                else pinRefs.current.delete(c.city)
              }}
              className="absolute left-0 top-0 will-change-transform"
              style={{ visibility: 'hidden' }}
            >
              <CityPin city={c} selected={selected === c.city} onSelect={onSelect} />
            </div>
          ))}
        </div>

        <div
          ref={readoutRef}
          className="pointer-events-none absolute left-0 top-0 rounded-md border-2 border-ink bg-white px-2 py-1 opacity-0 shadow-nb-sm transition-opacity duration-150"
          aria-hidden="true"
        >
          <span className="mono-label block text-[10px] leading-none">Interpolated</span>
          <span className="font-mono text-sm font-bold">
            heat <span data-value>0</span>
          </span>
        </div>

        <div className="absolute right-3 top-3 flex flex-col overflow-hidden rounded-lg border-2 border-ink bg-white shadow-nb-sm">
          <ToolbarButton label="Zoom in" onClick={() => zoomAround(center()[0], center()[1], 2, true)}>
            <Plus className="size-4" aria-hidden="true" />
          </ToolbarButton>
          <ToolbarButton label="Zoom out" onClick={() => zoomAround(center()[0], center()[1], 0.5, true)}>
            <Minus className="size-4" aria-hidden="true" />
          </ToolbarButton>
          <ToolbarButton label="Reset view" onClick={() => animateTo(homeView())} last>
            <RotateCcw className="size-4" aria-hidden="true" />
          </ToolbarButton>
        </div>
        <span
          ref={zoomLabelRef}
          className="absolute right-3 top-[8.6rem] rounded-md border-2 border-ink bg-primary px-2 py-0.5 font-mono text-xs font-bold"
          aria-live="off"
        >
          1.0x
        </span>

        <div className="absolute bottom-3 right-3 overflow-hidden rounded-lg border-2 border-ink bg-white shadow-nb-sm" aria-hidden="true">
          <canvas ref={miniRef} width={150} height={104} className="block h-[104px] w-[150px]" />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-t-2 border-ink bg-white px-4 py-3">
        <div className="flex items-center gap-2 font-bold" aria-label="Legend: cold to hot">
          <span className="text-sm">Cold</span>
          <span
            className="h-3.5 w-40 rounded-full border-2 border-ink"
            style={{ background: 'linear-gradient(90deg, var(--cp-sky), var(--cp-lavender), var(--cp-orange), var(--cp-yellow), var(--cp-pink))' }}
            aria-hidden="true"
          />
          <span className="text-sm">Hot</span>
        </div>
        <p className="text-sm">Heat between cities is interpolated for visualization. Only the city scores are real inputs.</p>
      </div>
    </div>
  )
})

function ToolbarButton({ label, onClick, children, last }: { label: string; onClick: () => void; children: React.ReactNode; last?: boolean }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className={cn('flex size-10 items-center justify-center bg-white hover:bg-cream active:bg-mint', !last && 'border-b-2 border-ink')}
    >
      {children}
    </button>
  )
}

function CityPin({ city, selected, onSelect }: { city: CityResult; selected: boolean; onSelect: (c: string) => void }) {
  const reduce = useReducedMotion()
  const score = useTweenedNumber(city.score, { from: city.score })
  const skipped = city.action === 'SKIP'
  const top = topSignal(city)
  return (
    <div className="group pointer-events-auto relative -translate-x-1/2 -translate-y-[22px]">
      <button
        type="button"
        onClick={() => onSelect(city.city)}
        aria-pressed={selected}
        aria-label={`${city.city}, score ${city.score}, ${skipped ? 'master ad kept' : city.action === 'GENERATE' ? 'new visual and copy' : 'copy only'}${top ? `, top signal ${top.label}` : ''}`}
        className="flex flex-col items-center rounded-lg"
      >
        <span className="relative flex size-11 items-center justify-center">
          {selected && (
            <motion.span
              key={`ring-${city.city}`}
              className="absolute inset-0 rounded-full border-[3px] border-ink"
              initial={reduce ? false : { scale: 1, opacity: 0.9 }}
              animate={{ scale: reduce ? 1.25 : [1, 1.9, 1.25], opacity: [0.9, 0, 1] }}
              transition={{ duration: 0.6, ease: 'easeOut' }}
            />
          )}
          <span
            className={cn(
              'relative flex size-11 items-center justify-center rounded-full border-2 border-ink font-bold shadow-nb-sm transition-transform duration-200 group-hover:scale-110',
              selected && 'ring-4 ring-pink ring-offset-2 ring-offset-ink',
            )}
            style={{ background: heatVar(score, skipped) }}
          >
            {Math.round(score)}
          </span>
        </span>
        <span className={cn('mt-1 whitespace-nowrap rounded-md border-2 border-ink px-1.5 py-0.5 text-xs font-bold leading-tight', selected ? 'bg-ink text-white' : 'bg-white')}>
          {city.city}
          {skipped && <span className={cn('mono-label block text-[9px] leading-tight', selected ? 'text-white' : '')}>Master ad kept</span>}
        </span>
      </button>
      <div
        role="tooltip"
        className="pointer-events-none absolute bottom-full left-1/2 mb-2 hidden w-max max-w-56 -translate-x-1/2 rounded-lg border-2 border-ink bg-white px-3 py-2 text-sm shadow-nb-sm group-focus-within:block group-hover:block"
      >
        <span className="font-bold">{`Score ${city.score}`}</span>
        {top && <span className="block">{`Top signal: ${top.label}`}</span>}
      </div>
    </div>
  )
}
