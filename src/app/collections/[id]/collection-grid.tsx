"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { VideoPlayer } from "@/components/video-player";
import { compactNumber, timeAgo } from "@/lib/format";
import { removeReference } from "../actions";
import { ImportForm } from "./import-form";

export type CardVideo = {
  id: string;
  title: string;
  url: string | null;
  platform: string | null;
  channel: string | null;
  publishedAt: string | null;
  addedAt: string;
  note: string;
  thumbnail: string | null;
  views: number | null;
  outlier: number | null;
};

const SORTS = {
  added: { label: "Recently added", by: (v: CardVideo) => Date.parse(v.addedAt) },
  outlier: { label: "Outlier score", by: (v: CardVideo) => v.outlier ?? -1 },
  views: { label: "Views", by: (v: CardVideo) => v.views ?? -1 },
  posted: { label: "Newest posted", by: (v: CardVideo) => (v.publishedAt ? Date.parse(v.publishedAt) : 0) },
} as const;
type SortKey = keyof typeof SORTS;

// A collection as a wall of references, the way you scan them: thumbnail
// first, numbers underneath, one click to watch. Search and sort run here, on
// the rows already loaded — a collection is tens of videos, not thousands.
export function CollectionGrid({ collectionId, videos }: { collectionId: string; videos: CardVideo[] }) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("added");
  const [adding, setAdding] = useState(videos.length === 0);
  const [openId, setOpenId] = useState<string | null>(null);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? videos.filter((v) => [v.title, v.channel ?? "", v.note, v.url ?? ""].some((s) => s.toLowerCase().includes(q)))
      : videos;
    const by = SORTS[sort].by;
    return [...filtered].sort((a, b) => by(b) - by(a));
  }, [videos, query, sort]);

  const openIndex = shown.findIndex((v) => v.id === openId);

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-border bg-surface p-2">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search videos"
          className="min-w-0 flex-1 rounded-md border border-border bg-surface-2 px-2.5 py-1.5 text-sm outline-none placeholder:text-ink-faint focus:border-accent-dim sm:max-w-xs"
        />
        <span className="font-mono text-[11px] text-ink-faint">
          {shown.length === videos.length ? videos.length : `${shown.length} of ${videos.length}`}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            aria-label="Sort videos"
            className="rounded-md border border-border bg-surface-2 px-2 py-1.5 text-xs text-ink-dim outline-none focus:border-accent-dim"
          >
            {Object.entries(SORTS).map(([key, s]) => (
              <option key={key} value={key}>{s.label}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setAdding((a) => !a)}
            aria-expanded={adding}
            className="rounded-md border border-accent-dim px-2.5 py-1.5 text-xs text-accent hover:bg-accent-dim/15"
          >
            {adding ? "Done adding" : "+ Add videos"}
          </button>
        </div>
      </div>

      {adding && (
        <div className="mb-6">
          <ImportForm collectionId={collectionId} />
        </div>
      )}

      {shown.length === 0 ? (
        <p className="py-6 text-sm text-ink-faint">
          {query ? "No videos match that search." : "Nothing saved yet. Paste links above."}
        </p>
      ) : (
        <ul className="grid grid-cols-2 gap-x-3 gap-y-5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {shown.map((v) => (
            <li key={v.id}>
              <VideoCard video={v} onOpen={() => setOpenId(v.id)} />
            </li>
          ))}
        </ul>
      )}

      {openIndex >= 0 && (
        <VideoModal
          collectionId={collectionId}
          video={shown[openIndex]}
          onClose={() => setOpenId(null)}
          onPrev={openIndex > 0 ? () => setOpenId(shown[openIndex - 1].id) : undefined}
          onNext={openIndex < shown.length - 1 ? () => setOpenId(shown[openIndex + 1].id) : undefined}
        />
      )}
    </>
  );
}

function VideoCard({ video, onOpen }: { video: CardVideo; onOpen: () => void }) {
  return (
    <div className="group">
      <button
        type="button"
        onClick={onOpen}
        aria-label={`Play ${video.title}`}
        className="relative block aspect-[9/16] w-full overflow-hidden rounded-lg border border-border-soft bg-surface-2 text-left transition-colors group-hover:border-accent-dim"
      >
        {video.thumbnail ? (
          <Image
            src={video.thumbnail}
            alt=""
            fill
            unoptimized
            sizes="(min-width: 1280px) 20vw, (min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw"
            className="object-cover transition-transform duration-300 group-hover:scale-[1.03]"
          />
        ) : (
          // No still: let the caption stand in, so the tile still says something.
          <span className="absolute inset-0 flex items-center p-3 text-sm leading-snug text-ink-dim">
            <span className="line-clamp-6">{video.title}</span>
          </span>
        )}
        <PlatformBadge platform={video.platform} className="absolute right-2 top-2" />
        <span className="absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition group-hover:bg-black/25 group-hover:opacity-100">
          <span className="rounded-full bg-black/60 px-3 py-2 text-sm text-white">▶</span>
        </span>
      </button>

      <p className="mt-2 truncate text-[13px] font-medium text-ink" title={video.title}>{video.title}</p>
      <p className="mt-0.5 flex justify-between gap-2 text-[11px] text-ink-faint">
        <span className="truncate">{video.channel ? `@${video.channel}` : "—"}</span>
        {video.publishedAt && <span className="shrink-0">{timeAgo(video.publishedAt)}</span>}
      </p>
      <Chips video={video} className="mt-1.5" />
    </div>
  );
}

function Chips({ video, className = "" }: { video: CardVideo; className?: string }) {
  if (video.outlier == null && video.views == null) return null;
  return (
    <div className={`flex flex-wrap gap-1.5 ${className}`}>
      {video.outlier != null && (
        <span
          title="Outlier score: views ÷ the channel's average"
          className={`rounded px-1.5 py-0.5 font-mono text-[11px] ${
            video.outlier >= 1 ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"
          }`}
        >
          ↗ {video.outlier}x
        </span>
      )}
      {video.views != null && (
        <span title="Views" className="rounded bg-sky-500/10 px-1.5 py-0.5 font-mono text-[11px] text-sky-400">
          ◉ {compactNumber(video.views)}
        </span>
      )}
    </div>
  );
}

function VideoModal({
  collectionId, video, onClose, onPrev, onNext,
}: {
  collectionId: string;
  video: CardVideo;
  onClose: () => void;
  onPrev?: () => void;
  onNext?: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft") onPrev?.();
      else if (e.key === "ArrowRight") onNext?.();
    };
    window.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [onClose, onPrev, onNext]);

  const isInstagram = video.platform === "instagram";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={video.title}
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-full w-full max-w-3xl flex-col gap-5 overflow-y-auto rounded-xl border border-border bg-surface p-4 sm:flex-row"
      >
        <div className="mx-auto w-full max-w-[340px] shrink-0">
          <VideoPlayer
            key={video.id}
            url={video.url}
            title={video.title}
            startOpen
            autoplay
            className={isInstagram ? "h-[620px]" : "aspect-[9/16]"}
          />
          {!video.url && <p className="text-sm text-ink-faint">No link saved for this video.</p>}
        </div>

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-start justify-between gap-3">
            <PlatformBadge platform={video.platform} />
            <button type="button" onClick={onClose} aria-label="Close" className="text-ink-faint hover:text-ink">✕</button>
          </div>
          <h2 className="mt-3 text-base font-medium leading-snug text-ink">{video.title}</h2>
          <p className="mt-1 text-xs text-ink-faint">
            {video.channel && <span>@{video.channel}</span>}
            {video.channel && video.publishedAt && <span> · </span>}
            {video.publishedAt && <span>{timeAgo(video.publishedAt)}</span>}
          </p>
          <Chips video={video} className="mt-3" />
          {video.note && <p className="mt-3 text-sm text-ink-dim">{video.note}</p>}

          <div className="mt-5 flex flex-wrap gap-2 text-xs">
            <Link
              href={`/videos/${video.id}/research?from=${collectionId}`}
              className="rounded-md border border-accent-dim px-2.5 py-1 text-accent hover:bg-accent-dim/15"
            >
              Open research
            </Link>
            <Link
              href={`/videos/${video.id}`}
              className="rounded-md border border-border px-2.5 py-1 text-ink-dim hover:text-ink"
            >
              Open in workbench
            </Link>
            {video.url && (
              <a
                href={video.url}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-md border border-border px-2.5 py-1 text-ink-dim hover:text-ink"
              >
                Watch original ↗
              </a>
            )}
            <form action={removeReference}>
              <input type="hidden" name="collection_id" value={collectionId} />
              <input type="hidden" name="video_id" value={video.id} />
              <button type="submit" className="rounded-md px-2.5 py-1 text-ink-faint hover:text-ink">
                Remove from collection
              </button>
            </form>
          </div>

          <div className="mt-auto flex justify-between pt-6 text-xs text-ink-faint">
            <button type="button" onClick={onPrev} disabled={!onPrev} className="hover:text-ink disabled:opacity-30">← Previous</button>
            <button type="button" onClick={onNext} disabled={!onNext} className="hover:text-ink disabled:opacity-30">Next →</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function PlatformBadge({ platform, className = "" }: { platform: string | null; className?: string }) {
  const base = `flex h-6 w-6 items-center justify-center rounded-md shadow ${className}`;
  if (platform === "instagram") {
    return (
      <span title="Instagram" className={`${base} bg-gradient-to-tr from-amber-400 via-pink-500 to-purple-600`}>
        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="white" strokeWidth="2.2" aria-hidden>
          <rect x="3" y="3" width="18" height="18" rx="5" />
          <circle cx="12" cy="12" r="4" />
          <circle cx="17.5" cy="6.5" r="0.6" fill="white" />
        </svg>
      </span>
    );
  }
  if (platform === "tiktok") {
    return (
      <span title="TikTok" className={`${base} bg-black`}>
        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="white" aria-hidden>
          <path d="M14 3h3a4 4 0 0 0 4 4v3a7 7 0 0 1-4-1.3V15a6 6 0 1 1-6-6v3a3 3 0 1 0 3 3z" />
        </svg>
      </span>
    );
  }
  if (platform === "youtube") {
    return (
      <span title="YouTube" className={`${base} bg-red-600`}>
        <svg viewBox="0 0 24 24" className="h-3 w-3" fill="white" aria-hidden>
          <path d="M8 5v14l11-7z" />
        </svg>
      </span>
    );
  }
  return null;
}
