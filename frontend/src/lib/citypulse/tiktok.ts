import { BACKEND_ORIGIN, TIKTOK_STUDIO_URL } from './config'

/** Sends the ad image to the backend so the TikTok page (/studio) can open with it already added. */
async function stageImage(imageUrl: string): Promise<string> {
  const blob = await (await fetch(imageUrl)).blob()
  const form = new FormData()
  form.append('image', blob, 'ad.jpg')
  const res = await fetch(`${BACKEND_ORIGIN}/api/video/staged-images`, { method: 'POST', body: form })
  if (!res.ok) throw new Error(`Staging failed (${res.status})`)
  return (await res.json()).id as string
}

/**
 * Opens the TikTok posting page in a new tab, with `imageUrl` (if any) pre-added.
 * Returns false when the page opened but the image could not be attached.
 */
export async function openTikTokStudio(imageUrl: string | null): Promise<boolean> {
  // Open the tab synchronously (inside the click) so popup blockers allow it, then point it at the page.
  const tab = window.open('', '_blank')
  const target = new URL(TIKTOK_STUDIO_URL)
  let attached = true
  if (imageUrl) {
    try {
      target.searchParams.set('staged', await stageImage(imageUrl))
    } catch {
      attached = false
    }
  }
  if (tab) {
    tab.opener = null
    tab.location.href = target.toString()
  } else {
    window.open(target.toString(), '_blank')
  }
  return attached
}
