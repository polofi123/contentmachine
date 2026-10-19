"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { costUsd, estimateCostUsd } from "@/lib/ai-analysis";
import type { ParseResult, VideoAnalysis } from "@/lib/video-analysis";

export type AiConfig = { ready: boolean; canYoutube: boolean; model: string };
export type Usage = { inputTokens: number | null; outputTokens: number | null };
/** An AI result waiting for review. Nothing is saved until the user approves it. */
export type Preset = {
  result: ParseResult; raw: string; usage: Usage; model: string;
  /** "captions": only the transcript was fetched (no model ran, so no usage or cost). */
  kind?: "ai" | "captions";
  /** Why captions were not used (or which other languages exist), shown beside the preview. */
  note?: string | null;
};

const money = (n: number | null) => (n === null ? null : n < 0.01 ? "< $0.01" : `$${n.toFixed(2)}`);

export function UsageLine({ model, usage }: { model: string; usage: Usage }) {
  const cost = money(costUsd(model, usage.inputTokens, usage.outputTokens));
  return (
    <span className="ml-1 text-ink-faint">
      {usage.inputTokens != null && `${usage.inputTokens.toLocaleString()} in / ${(usage.outputTokens ?? 0).toLocaleString()} out tokens (out includes thinking)`}
      {cost && ` · about ${cost} at paid rates (free on the free tier)`}
    </span>
  );
}

/** What the model said about itself, kept visibly apart from the content it produced. */
export function AiBox({ ai }: { ai: NonNullable<VideoAnalysis["ai"]> }) {
  const areas: [keyof typeof ai.confidence, string][] = [
    ["transcript", "Transcript"], ["idea", "Idea"], ["hook", "Hook"], ["storytelling", "Storytelling"], ["visual", "Visual"],
  ];
  return (
    <section className="rounded-xl border border-border-soft bg-surface px-4 py-3">
      <h3 className="text-[11px] uppercase tracking-wide text-ink-faint">AI analysis</h3>
      <p className="mt-1.5 text-sm text-ink-dim">
        {ai.model} · {ai.input === "youtube" ? "YouTube link" : "uploaded MP4"}
        {ai.generatedAt && ` · ${new Date(ai.generatedAt).toLocaleString()}`}
      </p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {areas.map(([k, label]) => (
          <span key={k} className="rounded border border-border px-2 py-0.5 text-[11px] text-ink-dim">
            <span className="text-ink-faint">{label}:</span> {ai.confidence[k] ?? "not stated"}
          </span>
        ))}
      </div>
      <p className="mt-1 text-[11px] text-ink-faint">Confidence is the model&apos;s own estimate, not a measurement.</p>
      {ai.uncertainties.length > 0 && (
        <div className="mt-3">
          <h4 className="text-[11px] uppercase tracking-wide text-ink-faint">Unverified or uncertain</h4>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-ink-dim">
            {ai.uncertainties.map((u, i) => <li key={i}>{u}</li>)}
          </ul>
        </div>
      )}
    </section>
  );
}

/**
 * Runs one analysis through the server route and returns the draft for review.
 * For a YouTube link the server picks the transcript itself: one already saved,
 * else the video's YouTube captions, else Gemini's own (marked unverified).
 */
export async function requestAnalysis(
  videoId: string, mode: "youtube" | "upload", signal: AbortSignal, fallbackModel: string,
  upload?: { file: File | null; authorized: boolean },
): Promise<{ ok: true; preset: Preset } | { ok: false; error: string }> {
  try {
    const body = new FormData();
    body.set("mode", mode);
    if (mode === "upload" && upload?.file) {
      body.set("file", upload.file);
      body.set("authorized", upload.authorized ? "yes" : "no");
    }
    const res = await fetch(`/api/videos/${videoId}/analyze`, {
      method: "POST", body, headers: { "x-requested-with": "contentmachine" }, signal,
    });
    const data = await res.json().catch(() => null);
    if (!data?.ok) return { ok: false, error: data?.error ?? "The analysis failed. Nothing was saved." };
    return {
      ok: true,
      preset: {
        result: { source: "ai_gemini", analysis: data.analysis, warnings: data.warnings ?? [] },
        raw: String(data.raw ?? ""),
        usage: data.usage ?? { inputTokens: null, outputTokens: null },
        model: String(data.model ?? fallbackModel),
        kind: "ai",
        note: typeof data.transcriptNote === "string" ? data.transcriptNote : null,
      },
    };
  } catch {
    return { ok: false, error: "Could not reach the server. Nothing was saved." };
  }
}

export function AiPanel({ videoId, ai, onResult }: { videoId: string; ai: AiConfig; onResult: (p: Preset) => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [authorized, setAuthorized] = useState(false);
  const [busy, setBusy] = useState<"youtube" | "upload" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const abort = useRef<AbortController | null>(null);

  // Closing the panel mid-run abandons the request; a late result must never
  // pop a preview open after the user has moved on.
  useEffect(() => () => abort.current?.abort(), []);

  const run = async (mode: "youtube" | "upload") => {
    setError(null);
    setBusy(mode);
    const controller = new AbortController();
    abort.current = controller;
    try {
      const res = await requestAnalysis(videoId, mode, controller.signal, ai.model, mode === "upload" ? { file, authorized } : undefined);
      if (controller.signal.aborted) return;
      if (!res.ok) return setError(res.error);
      onResult(res.preset);
    } finally {
      if (!controller.signal.aborted) setBusy(null);
      // The file is not kept around to be sent again by accident.
      if (mode === "upload") {
        setFile(null);
        setAuthorized(false);
        if (fileInput.current) fileInput.current.value = "";
      }
    }
  };

  if (!ai.ready) {
    return (
      <div className="mt-4 rounded-xl border border-border bg-surface p-4 text-sm text-ink-dim">
        <p className="text-ink">Automatic analysis is not set up.</p>
        <p className="mt-1">
          Add <code className="font-mono text-xs">GEMINI_API_KEY</code> to <code className="font-mono text-xs">.env.local</code> and
          restart the dev server. Keys are created in Google AI Studio.
        </p>
      </div>
    );
  }

  const perShort = money(estimateCostUsd(ai.model, 60));
  const perThree = money(estimateCostUsd(ai.model, 180));

  return (
    <div className="mt-4 space-y-4 rounded-xl border border-border bg-surface p-4">
      <p className="text-xs text-ink-dim">
        Gemini ({ai.model}) watches and listens to the video and drafts the analysis. You review and edit it before anything is saved.
        {ai.canYoutube && " For YouTube links the video's existing captions are fetched first (free) and used as the transcript; if none are available, Gemini transcribes the audio and the transcript is marked unverified."}
        {perShort && perThree && ` Estimated cost on a paid key: about ${perShort} for a 60-second video, ${perThree} for 3 minutes.`}{" "}
        It is free on the free tier, where Google may use the content to improve its products. Actual usage is shown afterwards.
      </p>

      <div>
        <p className="text-xs text-ink-dim">
          {ai.canYoutube ? "Or, if the link cannot be analyzed, upload" : "Upload"} an MP4 of a video you are authorized to process
          {ai.canYoutube ? "." : " (TikTok and Instagram links cannot be fetched automatically)."}
        </p>
        <input
          type="file"
          accept="video/mp4"
          ref={fileInput}
          aria-label="MP4 file"
          onChange={(e: ChangeEvent<HTMLInputElement>) => setFile(e.target.files?.[0] ?? null)}
          className="mt-2 block text-xs text-ink-dim file:mr-3 file:rounded-md file:border file:border-border file:bg-surface-2 file:px-2.5 file:py-1 file:text-xs file:text-ink-dim"
        />
        <label className="mt-2 flex items-start gap-2 text-xs text-ink-dim">
          <input type="checkbox" checked={authorized} onChange={(e) => setAuthorized(e.target.checked)} className="mt-0.5" />
          I am authorized to process this video. It is uploaded to Gemini for this analysis and deleted afterwards.
        </label>
        <button
          type="button"
          disabled={busy !== null || !file || !authorized}
          onClick={() => run("upload")}
          className="mt-2 rounded-md border border-accent-dim px-3 py-1.5 text-xs text-accent hover:bg-accent-dim/15 disabled:opacity-40"
        >
          {busy === "upload" ? "Uploading and analyzing… this can take a few minutes" : "Analyze uploaded MP4"}
        </button>
        <p className="mt-1 text-[11px] text-ink-faint">Up to 100 MB.</p>
      </div>

      {error && <p role="alert" className="text-sm text-accent">{error}</p>}
    </div>
  );
}
