export type LonLat = [number, number]
export type Pt = [number, number]

export const ROMANIA_OUTLINE: LonLat[] = [
  [22.71, 47.88], [23.14, 48.1], [23.76, 47.99], [24.4, 47.98], [24.87, 47.74],
  [25.21, 47.89], [25.95, 47.99], [26.2, 48.22], [26.62, 48.22], [26.92, 48.12],
  [27.23, 47.83], [27.55, 47.41], [28.13, 46.81], [28.16, 46.37], [28.05, 45.94],
  [28.23, 45.49], [28.68, 45.3], [29.15, 45.46], [29.6, 45.29], [29.63, 45.04],
  [29.14, 44.82], [28.84, 44.91], [28.56, 43.71], [27.97, 43.81], [27.24, 44.18],
  [26.07, 43.94], [25.57, 43.69], [24.1, 43.74], [23.33, 43.9], [22.94, 43.82],
  [22.66, 44.23], [22.47, 44.41], [22.71, 44.58], [22.46, 44.7], [22.15, 44.48],
  [21.56, 44.77], [21.48, 45.18], [20.87, 45.42], [20.76, 45.73], [20.22, 46.13],
  [21.02, 46.32], [21.63, 46.99], [22.1, 47.67], [22.71, 47.88],
]

/** Web Mercator, unscaled: x in radians of longitude, y grows northward. */
export function mercator([lon, lat]: LonLat): Pt {
  const rad = Math.PI / 180
  return [lon * rad, Math.log(Math.tan(Math.PI / 4 + (lat * rad) / 2))]
}

/** Chaikin corner cutting on a closed ring. */
export function chaikin(ring: Pt[], passes: number): Pt[] {
  let pts = ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1] ? ring.slice(0, -1) : ring
  for (let p = 0; p < passes; p++) {
    const next: Pt[] = []
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i]
      const b = pts[(i + 1) % pts.length]
      next.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25])
      next.push([a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75])
    }
    pts = next
  }
  return pts
}

export type FittedProjection = {
  project: (ll: LonLat) => Pt
  width: number
  height: number
}

/** Fit the Romania outline into a box, preserving aspect ratio, y flipped for screens. */
export function fitProjection(width: number, height: number, padding: number): FittedProjection {
  const projected = ROMANIA_OUTLINE.map(mercator)
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
  for (const [x, y] of projected) {
    minX = Math.min(minX, x); maxX = Math.max(maxX, x)
    minY = Math.min(minY, y); maxY = Math.max(maxY, y)
  }
  const scale = Math.min((width - padding * 2) / (maxX - minX), (height - padding * 2) / (maxY - minY))
  const offX = (width - (maxX - minX) * scale) / 2
  const offY = (height - (maxY - minY) * scale) / 2
  return {
    width,
    height,
    project: (ll) => {
      const [x, y] = mercator(ll)
      return [offX + (x - minX) * scale, offY + (maxY - y) * scale]
    },
  }
}

/** For each horizontal scanline y, the sorted x crossings of the polygon. */
export function scanlineCrossings(poly: Pt[], y: number): number[] {
  const xs: number[] = []
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]
    const [xj, yj] = poly[j]
    if ((yi > y) !== (yj > y)) {
      xs.push(xi + ((y - yi) / (yj - yi)) * (xj - xi))
    }
  }
  return xs.sort((a, b) => a - b)
}

export function pointInPolygon(poly: Pt[], x: number, y: number): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]
    const [xj, yj] = poly[j]
    if ((yi > y) !== (yj > y) && x < xi + ((y - yi) / (yj - yi)) * (xj - xi)) inside = !inside
  }
  return inside
}
