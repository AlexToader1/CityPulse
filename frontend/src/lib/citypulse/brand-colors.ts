const INK: [number, number, number] = [17, 17, 17]

function luminance([r, g, b]: [number, number, number]) {
  const ch = [r, g, b].map((v) => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2]
}

export function contrastWithInk(rgb: [number, number, number]) {
  const a = luminance(rgb)
  const b = luminance(INK)
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
}

export function toHex([r, g, b]: [number, number, number]) {
  return '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('').toUpperCase()
}

export function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace('#', ''), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/** Lighten toward white until ink text reaches 7:1 contrast. */
export function legibleOnInk(hex: string) {
  let rgb = hexToRgb(hex)
  let guard = 0
  while (contrastWithInk(rgb) < 7 && guard++ < 20) {
    rgb = rgb.map((v) => v + (255 - v) * 0.15) as [number, number, number]
  }
  return toHex(rgb)
}

/** Quantize an image into its dominant, reasonably saturated colors. */
export async function extractSwatches(url: string, count = 4): Promise<string[]> {
  const img = new Image()
  img.crossOrigin = 'anonymous'
  img.src = url
  await img.decode()
  const size = 48
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return []
  ctx.drawImage(img, 0, 0, size, size)
  const { data } = ctx.getImageData(0, 0, size, size)
  const buckets = new Map<number, { n: number; r: number; g: number; b: number; sat: number }>()
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 128) continue
    const r = data[i], g = data[i + 1], b = data[i + 2]
    const key = ((r >> 5) << 6) | ((g >> 5) << 3) | (b >> 5)
    const max = Math.max(r, g, b), min = Math.min(r, g, b)
    const bucket = buckets.get(key) ?? { n: 0, r: 0, g: 0, b: 0, sat: 0 }
    bucket.n++; bucket.r += r; bucket.g += g; bucket.b += b; bucket.sat += max === 0 ? 0 : (max - min) / max
    buckets.set(key, bucket)
  }
  const ranked = [...buckets.values()]
    .map((b) => ({ rgb: [b.r / b.n, b.g / b.n, b.b / b.n] as [number, number, number], score: b.n * (0.35 + b.sat / b.n) }))
    .sort((a, b) => b.score - a.score)
  const picked: [number, number, number][] = []
  for (const { rgb } of ranked) {
    if (picked.every((p) => Math.hypot(p[0] - rgb[0], p[1] - rgb[1], p[2] - rgb[2]) > 60)) picked.push(rgb)
    if (picked.length >= count) break
  }
  return picked.map(toHex)
}
