// TikTok studio: paste a product link (or upload photos) -> AI makes TikTok variants
// -> preview -> approve -> post to TikTok. Plain React + inline styles so it drops
// into any shell; swap the elements for React Spectrum components when merging.
import { useEffect, useRef, useState } from "react";
import {
  createVideoJob,
  getTikTokStatus,
  getVideoJob,
  mediaUrl,
  publishVariant,
  tiktokLoginUrl,
  type PublishResult,
  type TikTokStatus,
  type Variant,
  type VideoJob,
} from "../api/client";

const box: React.CSSProperties = { border: "1px solid #ddd", borderRadius: 12, padding: 16, background: "#fff" };

export default function VideoPreview() {
  const [url, setUrl] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [language, setLanguage] = useState<"en" | "ro">("en");
  const [job, setJob] = useState<VideoJob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tiktok, setTiktok] = useState<TikTokStatus | null>(null);
  const [posting, setPosting] = useState<string | null>(null);
  const [posted, setPosted] = useState<Record<string, PublishResult>>({});
  const timer = useRef<number | null>(null);

  useEffect(() => {
    getTikTokStatus().then(setTiktok).catch(() => setTiktok(null));
    return () => {
      if (timer.current) window.clearInterval(timer.current);
    };
  }, []);

  const poll = (id: string) => {
    if (timer.current) window.clearInterval(timer.current);
    timer.current = window.setInterval(async () => {
      try {
        const j = await getVideoJob(id);
        setJob(j);
        if (j.status === "done" || j.status === "failed") window.clearInterval(timer.current!);
      } catch (e) {
        setError((e as Error).message);
      }
    }, 1500);
  };

  const start = async () => {
    setError(null);
    setPosted({});
    try {
      const j = await createVideoJob({ url: url.trim() || undefined, images: files, language, nVariants: 3 });
      setJob(j);
      poll(j.id);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const post = async (v: Variant, mode: "direct" | "draft") => {
    if (!job) return;
    setPosting(v.id);
    setError(null);
    try {
      const r = await publishVariant(job.id, v.id, mode);
      setPosted((p) => ({ ...p, [v.id]: r }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPosting(null);
    }
  };

  const busy = job && (job.status === "queued" || job.status === "running");

  return (
    <div style={{ display: "grid", gap: 16, fontFamily: "system-ui, sans-serif", maxWidth: 1100 }}>
      <div style={box}>
        <h2 style={{ marginTop: 0 }}>Link → TikToks</h2>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input
            style={{ flex: 1, minWidth: 280, padding: 10, borderRadius: 8, border: "1px solid #ccc" }}
            placeholder="Paste a product link…"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
          <select value={language} onChange={(e) => setLanguage(e.target.value as "en" | "ro")} style={{ padding: 10, borderRadius: 8 }}>
            <option value="en">English</option>
            <option value="ro">Română</option>
          </select>
          <button onClick={start} disabled={!!busy || (!url.trim() && files.length === 0)} style={{ padding: "10px 18px", borderRadius: 8, background: "#000", color: "#fff", border: 0, cursor: "pointer" }}>
            {busy ? "Making…" : "Make TikToks"}
          </button>
        </div>
        <label style={{ display: "block", marginTop: 10, fontSize: 14, color: "#555" }}>
          Or add product photos:{" "}
          <input type="file" accept="image/*" multiple onChange={(e) => setFiles(Array.from(e.target.files ?? []))} />
        </label>
        <div style={{ marginTop: 10, fontSize: 14 }}>
          TikTok:{" "}
          {!tiktok?.configured ? (
            <span style={{ color: "#999" }}>not configured (download videos instead)</span>
          ) : tiktok.connected ? (
            <span>connected as <b>{tiktok.user?.display_name ?? "account"}</b></span>
          ) : (
            <a href={tiktokLoginUrl()}>Connect TikTok account</a>
          )}
        </div>
      </div>

      {error && <div style={{ ...box, borderColor: "#e33", color: "#b00" }}>{error}</div>}

      {job && (
        <div style={box}>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <b>{job.status === "done" ? "Done" : job.status === "failed" ? "Failed" : job.step}</b>
            <span>{Math.round(job.progress * 100)}%</span>
          </div>
          <div style={{ height: 8, background: "#eee", borderRadius: 4, marginTop: 8 }}>
            <div style={{ width: `${job.progress * 100}%`, height: 8, background: job.status === "failed" ? "#e33" : "#fe2c55", borderRadius: 4, transition: "width .4s" }} />
          </div>
          {job.product_summary && <p style={{ color: "#555" }}>{job.product_summary}</p>}
          {job.error && <p style={{ color: "#b00" }}>{job.error}</p>}
          {job.warnings.map((w) => (
            <p key={w} style={{ color: "#a60", fontSize: 13, margin: "4px 0" }}>⚠ {w}</p>
          ))}
        </div>
      )}

      {job && job.variants.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 16 }}>
          {job.variants.map((v) => (
            <div key={v.id} style={box}>
              <div style={{ fontSize: 12, textTransform: "uppercase", color: "#888" }}>{v.script.angle}</div>
              {v.status === "done" && v.video_url ? (
                <video src={mediaUrl(v.video_url)} controls playsInline style={{ width: "100%", aspectRatio: "9 / 16", background: "#000", borderRadius: 8, marginTop: 8 }} />
              ) : (
                <div style={{ aspectRatio: "9 / 16", background: "#111", color: "#aaa", borderRadius: 8, marginTop: 8, display: "grid", placeItems: "center" }}>
                  {v.status === "failed" ? `Failed: ${v.error}` : "Rendering…"}
                </div>
              )}
              <p style={{ fontSize: 14 }}>
                {v.script.caption} <span style={{ color: "#0a66c2" }}>{v.script.hashtags.map((h) => `#${h}`).join(" ")}</span>
              </p>
              <details style={{ fontSize: 13, color: "#444" }}>
                <summary>Script</summary>
                <ol>{v.script.lines.map((l, i) => <li key={i}>{l.text}</li>)}</ol>
              </details>
              {v.status === "done" && (
                <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                  {posted[v.id] ? (
                    <span style={{ color: "#080" }}>
                      ✓ Sent to TikTok ({posted[v.id].mode === "direct" ? `posted, ${posted[v.id].privacy_level}` : "in drafts"})
                    </span>
                  ) : tiktok?.connected ? (
                    <>
                      <button disabled={posting === v.id} onClick={() => post(v, "direct")}>{posting === v.id ? "Posting…" : "Approve & post"}</button>
                      <button disabled={posting === v.id} onClick={() => post(v, "draft")}>Send to drafts</button>
                    </>
                  ) : null}
                  <a href={mediaUrl(v.video_url)} download={`tiktok-${v.id}.mp4`}>Download</a>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {job?.cost && (
        <div style={box}>
          <b>Cost of this batch: ${job.cost.total_usd.toFixed(2)}</b>{" "}
          <span style={{ color: "#555" }}>vs. ~${job.cost.manual_baseline_usd * job.variants.length} for {job.variants.length} freelance UGC videos</span>
        </div>
      )}
    </div>
  );
}
