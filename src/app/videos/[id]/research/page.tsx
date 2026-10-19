import Link from "next/link";
import { notFound } from "next/navigation";
import { VideoPlayer } from "@/components/video-player";
import { db } from "@/lib/db";
import { compactNumber } from "@/lib/format";
import { emptyAnalysis, sanitizeAnalysis } from "@/lib/video-analysis";
import { ResearchView } from "./research-view";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// A saved reference as a research object. The analysis is keyed by video, not
// by collection, so every collection that holds this video shows the same one.
export default async function ResearchPage({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string }>;
}) {
  const [{ id }, { from }] = await Promise.all([params, searchParams]);
  if (!UUID.test(id)) notFound();

  const [{ data: video }, { data: analysisRow }, { data: memberships }, { data: latest }] = await Promise.all([
    db.from("videos").select("id, title, url, platform, channel_name, published_at, lego_topic, lego_angle, lego_hook, lego_story_structure, lego_visual_format").eq("id", id).maybeSingle(),
    db.from("video_analyses").select("version, source, source_label, analysis, raw_input, parse_warnings, created_at").eq("video_id", id).eq("is_current", true).maybeSingle(),
    db.from("collection_videos").select("collection_id, collections(id, name)").eq("video_id", id),
    db.from("video_latest_metrics").select("views").eq("video_id", id).maybeSingle(),
  ]);
  if (!video) notFound();

  const collections = (memberships ?? []).flatMap((m) => (m.collections ? [m.collections] : []));
  const backTo = collections.find((c) => c.id === from) ?? collections[0] ?? null;
  const analysis = analysisRow ? sanitizeAnalysis(analysisRow.analysis) : emptyAnalysis();

  return (
    <div className="lg:grid lg:grid-cols-[300px_1fr] lg:gap-8">
      <aside className="mb-6 lg:sticky lg:top-20 lg:mb-0 lg:self-start">
        {backTo ? (
          <Link href={`/collections/${backTo.id}`} className="mb-3 block text-[11px] text-ink-faint hover:text-ink-dim">
            ← {backTo.name}
          </Link>
        ) : (
          <Link href="/collections" className="mb-3 block text-[11px] text-ink-faint hover:text-ink-dim">← Collections</Link>
        )}
        <VideoPlayer url={video.url} title={video.title} startOpen className={video.platform === "instagram" ? "h-[560px]" : "aspect-[9/16]"} />
        <p className="mt-3 text-xs text-ink-faint">
          {video.channel_name && <span>@{video.channel_name}</span>}
          {latest?.views != null && <span> · {compactNumber(latest.views)} views</span>}
        </p>
        {collections.length > 0 && (
          <p className="mt-2 text-[11px] text-ink-faint">
            In {collections.map((c, i) => (
              <span key={c.id}>
                {i > 0 && ", "}
                <Link href={`/collections/${c.id}`} className="text-ink-dim hover:text-ink">{c.name}</Link>
              </span>
            ))}
          </p>
        )}
        <div className="mt-3 flex gap-2 text-xs">
          <Link href={`/videos/${id}`} className="rounded-md border border-border px-2.5 py-1 text-ink-dim hover:text-ink">
            Open workbench
          </Link>
          {video.url && /^https?:\/\//i.test(video.url) && (
            <a href={video.url} target="_blank" rel="noopener noreferrer" className="rounded-md border border-border px-2.5 py-1 text-ink-dim hover:text-ink">
              Original ↗
            </a>
          )}
        </div>
      </aside>

      <ResearchView
        videoId={id}
        title={video.title}
        analysis={analysis}
        meta={analysisRow ? {
          version: analysisRow.version,
          sourceLabel: analysisRow.source_label,
          importedAt: analysisRow.created_at,
          warnings: Array.isArray(analysisRow.parse_warnings) ? (analysisRow.parse_warnings as string[]) : [],
          raw: analysisRow.raw_input,
        } : null}
        legos={{
          topic: video.lego_topic, angle: video.lego_angle, hook: video.lego_hook,
          structure: video.lego_story_structure, visual: video.lego_visual_format,
        }}
      />
    </div>
  );
}
