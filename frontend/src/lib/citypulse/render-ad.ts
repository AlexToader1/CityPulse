import { contrastWithInk, hexToRgb } from './brand-colors'
import type { ExportFormat } from './types'

export const AD_SIZES: Record<ExportFormat, [number, number]> = {
  instagram_feed: [1080, 1080],
  instagram_story: [1080, 1920],
}

export type RenderAdOptions = {
  /** Background photo (data/blob/http URL). null = flat brand colour. */
  imageUrl: string | null
  headline: string
  body: string
  cta: string
  brandName: string
  bg: string
  accent: string
  format: ExportFormat
}

/** Same colour picking as the on-screen preview: lightest-contrast swatch = background, next = accent. */
export function adPalette(swatches: string[]) {
  const ranked = [...swatches].sort((a, b) => contrastWithInk(hexToRgb(b)) - contrastWithInk(hexToRgb(a)))
  const bg = ranked[0] ?? '#F6E7CF'
  const accents = swatches.filter((s) => s !== bg)
  return { bg, accent: accents[0] ?? '#FF8B6B' }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Could not load the ad image'))
    img.src = src
  })
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = []
  let line = ''
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const test = line ? `${line} ${word}` : word
    if (line && ctx.measureText(test).width > maxWidth) {
      lines.push(line)
      line = word
    } else line = test
  }
  if (line) lines.push(line)
  return lines
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

/** Draws the finished ad (photo + headline + body + CTA button) and returns the canvas. scale 1 = full size. */
export async function renderAdCanvas(o: RenderAdOptions, scale = 1): Promise<HTMLCanvasElement> {
  const [W, H] = AD_SIZES[o.format]
  const s = scale * (W / 1080)
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(W * scale)
  canvas.height = Math.round(H * scale)
  const ctx = canvas.getContext('2d')!
  const family = getComputedStyle(document.body).fontFamily || 'system-ui, sans-serif'
  await document.fonts?.ready

  // background: photo, cover-fitted
  ctx.fillStyle = o.bg
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  if (o.imageUrl) {
    const img = await loadImage(o.imageUrl)
    const k = Math.max(canvas.width / img.width, canvas.height / img.height)
    const w = img.width * k
    const h = img.height * k
    ctx.drawImage(img, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h)
  }

  const margin = 72 * s
  const maxW = canvas.width - margin * 2
  const bottom = canvas.height - (o.format === 'instagram_story' ? 300 : 72) * s

  // fit headline (shrink until <= 3 lines) and body (<= 3 lines)
  let hSize = 84 * s
  let hLines: string[] = []
  for (; hSize > 40 * s; hSize -= 4 * s) {
    ctx.font = `700 ${hSize}px ${family}`
    hLines = wrap(ctx, o.headline, maxW)
    if (hLines.length <= 3) break
  }
  const bSize = 40 * s
  ctx.font = `400 ${bSize}px ${family}`
  const bLines = wrap(ctx, o.body, maxW).slice(0, 3)

  const ctaSize = 40 * s
  ctx.font = `700 ${ctaSize}px ${family}`
  const ctaW = ctx.measureText(o.cta).width + 72 * s
  const ctaH = ctaSize + 40 * s
  const hLH = hSize * 1.1
  const bLH = bSize * 1.35
  const blockH = hLines.length * hLH + 24 * s + bLines.length * bLH + 36 * s + ctaH
  const top = bottom - blockH

  // dark scrim so white text is readable on any photo
  const g = ctx.createLinearGradient(0, top - 220 * s, 0, canvas.height)
  g.addColorStop(0, 'rgba(0,0,0,0)')
  g.addColorStop(0.45, 'rgba(0,0,0,0.6)')
  g.addColorStop(1, 'rgba(0,0,0,0.85)')
  ctx.fillStyle = g
  ctx.fillRect(0, top - 220 * s, canvas.width, canvas.height - (top - 220 * s))

  // brand tag, top-left
  ctx.font = `700 ${30 * s}px ${family}`
  const tagW = ctx.measureText(o.brandName).width + 48 * s
  const tagY = (o.format === 'instagram_story' ? 200 : 64) * s
  ctx.fillStyle = '#ffffff'
  ctx.strokeStyle = '#111111'
  ctx.lineWidth = 3 * s
  roundRect(ctx, margin, tagY, tagW, 30 * s + 30 * s, 30 * s)
  ctx.fill()
  ctx.stroke()
  ctx.fillStyle = '#111111'
  ctx.textBaseline = 'middle'
  ctx.fillText(o.brandName, margin + 24 * s, tagY + 30 * s)

  // text
  ctx.textBaseline = 'alphabetic'
  ctx.shadowColor = 'rgba(0,0,0,0.45)'
  ctx.shadowBlur = 14 * s
  ctx.fillStyle = '#ffffff'
  let y = top
  ctx.font = `700 ${hSize}px ${family}`
  for (const line of hLines) {
    y += hLH
    ctx.fillText(line, margin, y - hLH * 0.22)
  }
  y += 24 * s
  ctx.font = `400 ${bSize}px ${family}`
  for (const line of bLines) {
    y += bLH
    ctx.fillText(line, margin, y - bLH * 0.25)
  }
  ctx.shadowBlur = 0

  // CTA button
  y += 36 * s
  ctx.fillStyle = o.accent
  ctx.strokeStyle = '#111111'
  ctx.lineWidth = 4 * s
  roundRect(ctx, margin, y, ctaW, ctaH, ctaH / 2)
  ctx.fill()
  ctx.stroke()
  ctx.fillStyle = contrastWithInk(hexToRgb(o.accent)) >= 4.5 ? '#111111' : '#ffffff'
  ctx.font = `700 ${ctaSize}px ${family}`
  ctx.textBaseline = 'middle'
  ctx.fillText(o.cta, margin + 36 * s, y + ctaH / 2 + 2 * s)
  return canvas
}

export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

export function adFileName(city: string, format: ExportFormat) {
  const slug = city.normalize('NFKD').replace(/[^\w]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'city'
  return `citypulse-${slug}-${format === 'instagram_feed' ? 'feed-1080x1080' : 'story-1080x1920'}.png`
}
