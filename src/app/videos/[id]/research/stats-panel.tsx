"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { compactNumber } from "@/lib/format";
import { refreshYouTubeStats } from "./stats-actions";

type Props = {
  videoId: string;
  views: number | null;
  likes: number | null;
  comments: number | null;
  outlier: number | null;
  /** "ready": can refresh now. "no-key": a YouTube video but no API key yet. "none": not a YouTube video. */
  youtube: "ready" | "no-key" | "none";
};

export function StatsPanel({ videoId, views, likes, comments, outlier, youtube }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const refresh = () =>
    start(async () => {
      setMessage(null);
      const res = await refreshYouTubeStats(videoId);
      if (!res.ok) return setMessage({ ok: false, text: res.error });
      setMessage({ ok: true, text: res.note ?? "Updated from YouTube." });
      router.refresh();
    });

  const chips: [string, string][] = [];
  if (views != null) chips.push(["Views", compactNumber(views)]);
  if (likes != null) chips.push(["Likes", compactNumber(likes)]);
  if (comments != null) chips.push(["Comments", compactNumber(comments)]);
  if (outlier != null) chips.push(["Outlier", `${outlier}x`]);

  return (
    <div className="mt-3 rounded-lg border border-border-soft bg-surface px-3 py-2">
      {chips.length > 0 ? (
        <dl className="flex flex-wrap gap-x-4 gap-y-1">
          {chips.map(([k, v]) => (
            <div key={k}>
              <dt className="text-[10px] uppercase tracking-wide text-ink-faint">{k}</dt>
              <dd className="font-mono text-sm text-ink">{v}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="text-[11px] text-ink-faint">No statistics yet.</p>
      )}

      {youtube === "ready" && (
        <button
          type="button"
          onClick={refresh}
          disabled={pending}
          className="mt-2 rounded-md border border-border px-2 py-1 text-[11px] text-ink-dim hover:text-ink disabled:opacity-40"
        >
          {pending ? "Fetching…" : "Refresh from YouTube"}
        </button>
      )}
      {youtube === "no-key" && (
        <p className="mt-2 text-[11px] text-ink-faint">
          Add <code className="font-mono">YOUTUBE_API_KEY</code> to <code className="font-mono">.env.local</code> to fetch views, likes and the outlier score.
        </p>
      )}
      {message && (
        <p role={message.ok ? "status" : "alert"} className={`mt-1.5 text-[11px] ${message.ok ? "text-ink-dim" : "text-accent"}`}>
          {message.text}
        </p>
      )}
      <p className="mt-1.5 text-[10px] text-ink-faint">Outlier = views ÷ the channel&apos;s recent average.</p>
    </div>
  );
}
