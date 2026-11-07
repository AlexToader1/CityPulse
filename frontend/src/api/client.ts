// API client. Each feature keeps its calls in its own section.
export const API_BASE: string =
  (import.meta as any).env?.VITE_API_URL ?? "http://localhost:8000";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, init);
  if (!res.ok) {
    let detail = res.statusText;
    try {
      detail = (await res.json()).detail ?? detail;
    } catch {
      /* not JSON */
    }
    throw new Error(typeof detail === "string" ? detail : JSON.stringify(detail));
  }
  return res.json() as Promise<T>;
}

/** Turns a backend media path ("/media/...") into a full URL. */
export const mediaUrl = (path?: string | null) => (path ? `${API_BASE}${path}` : "");

// ---------------------------------------------------------------------------
// TikTok video feature
// ---------------------------------------------------------------------------
export interface ScriptLine { image_index: number; text: string }
export interface VideoScript { angle: string; lines: ScriptLine[]; caption: string; hashtags: string[] }
export interface Variant {
  id: string;
  script: VideoScript;
  status: "pending" | "rendering" | "done" | "failed";
  video_url?: string | null;
  duration?: number | null;
  error?: string | null;
}
export interface PublishResult {
  variant_id: string;
  mode: "direct" | "draft";
  publish_id?: string | null;
  status: string;
  privacy_level?: string | null;
  error?: string | null;
}
export interface VideoJob {
  id: string;
  status: "queued" | "running" | "done" | "failed";
  step: string;
  progress: number;
  language: string;
  product: { url?: string | null; title: string; description: string; price?: string | null; currency?: string | null };
  product_summary?: string | null;
  variants: Variant[];
  publishes: PublishResult[];
  cost?: { lines: { item: string; quantity: number; usd: number }[]; total_usd: number; manual_baseline_usd: number } | null;
  warnings: string[];
  error?: string | null;
}
export interface CreateVideoJobInput {
  url?: string;
  images?: File[];
  title?: string;
  language?: "en" | "ro";
  nVariants?: number;
  brandTone?: string;
}

export function createVideoJob(input: CreateVideoJobInput): Promise<VideoJob> {
  const form = new FormData();
  if (input.url) form.append("url", input.url);
  if (input.title) form.append("title", input.title);
  if (input.brandTone) form.append("brand_tone", input.brandTone);
  form.append("language", input.language ?? "en");
  form.append("n_variants", String(input.nVariants ?? 3));
  (input.images ?? []).forEach((f) => form.append("images", f));
  return request<VideoJob>("/api/video/jobs", { method: "POST", body: form });
}

export const getVideoJob = (id: string) => request<VideoJob>(`/api/video/jobs/${id}`);

export const publishVariant = (jobId: string, variantId: string, mode: "direct" | "draft" = "direct") =>
  request<PublishResult>(`/api/video/jobs/${jobId}/publish`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ variant_id: variantId, mode }),
  });

export const getPublishStatus = (publishId: string) =>
  request<Record<string, unknown>>(`/api/video/publish/${publishId}`);

export interface TikTokStatus {
  configured: boolean;
  connected: boolean;
  user?: { display_name?: string; avatar_url?: string } | null;
}
export const getTikTokStatus = () => request<TikTokStatus>("/api/tiktok/status");
export const tiktokLoginUrl = () => `${API_BASE}/api/tiktok/login`;
