import Link from "next/link";
import { db } from "@/lib/db";
import { NewVideoForm, LogOutlierForm } from "./new-video-form";

export const dynamic = "force-dynamic";

function Meter({ filled, total }: { filled: number; total: number }) {
  if (total === 0) return <span className="text-[11px] text-ink-faint">no slots</span>;
  return (
    <span className="flex items-center gap-1.5" title={`${filled} of ${total} slots filled`}>
      <span className="flex gap-[2px]">
        {Array.from({ length: total }).map((_, i) => (
          <span
            key={i}
            className={`h-3 w-[3px] rounded-full ${i < filled ? "bg-accent" : "bg-border"}`}
          />
        ))}
      </span>
      <span className="font-mono text-[10px] text-ink-faint">
        {filled}/{total}
      </span>
    </span>
  );
}

export default async function VideosPage() {
  const [{ data: videos, error }, { data: completeness }] = await Promise.all([
    db
      .from("video_stats")
      .select("id, title, is_mine, status, loop_type, channel_name, latest_views, outlier_score")
      .order("created_at", { ascending: false }),
    db.from("video_completeness").select("video_id, filled_slots, total_slots"),
  ]);

  if (error) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6">
        <h1 className="text-lg text-ink">Can&apos;t reach the database</h1>
        <p className="mt-2 text-sm text-ink-dim">{error.message}</p>
      </div>
    );
  }

  const comp = new Map(
    (completeness ?? []).map((c) => [c.video_id, c] as const),
  );

  const mine = (videos ?? []).filter((v) => v.is_mine);
  const outliers = (videos ?? []).filter((v) => !v.is_mine);

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-12">
      <header className="mb-6">
        <h1 className="text-xl font-medium tracking-tight text-ink">Videos</h1>
        <p className="mt-1.5 text-sm text-ink-dim">
          Yours and theirs, same seven Legos on both.
        </p>
      </header>

      <NewVideoForm />

      <section className="mt-8">
        <div className="mb-2 flex items-baseline justify-between border-b border-border-soft pb-2">
          <h2 className="text-sm font-medium text-ink">Mine</h2>
          <span className="text-[11px] text-ink-faint">{mine.length}</span>
        </div>

        {mine.length === 0 ? (
          <p className="py-6 text-sm text-ink-faint">Nothing yet.</p>
        ) : (
          <ul className="divide-y divide-border-soft">
            {mine.map((v) => {
              const c = comp.get(v.id);
              return (
                <li key={v.id}>
                  <Link
                    href={`/videos/${v.id}`}
                    className="flex items-center gap-3 py-3 transition-colors hover:text-ink"
                  >
                    <span className="min-w-0 flex-1 truncate text-sm text-ink-dim">{v.title}</span>
                    {v.loop_type && (
                      <span className="shrink-0 rounded border border-border px-1.5 py-0.5 font-mono text-[10px] text-ink-faint">
                        {v.loop_type}
                      </span>
                    )}
                    {v.latest_views != null && (
                      <span className="shrink-0 font-mono text-[11px] text-ink-faint">
                        {Number(v.latest_views).toLocaleString()}
                      </span>
                    )}
                    <span className="shrink-0 text-[11px] text-ink-faint">{v.status}</span>
                    <Meter filled={c?.filled_slots ?? 0} total={c?.total_slots ?? 0} />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="mt-10">
        <div className="mb-2 flex items-baseline justify-between border-b border-border-soft pb-2">
          <h2 className="text-sm font-medium text-ink">Outliers</h2>
          <span className="text-[11px] text-ink-faint">{outliers.length}</span>
        </div>

        <ul className="divide-y divide-border-soft">
          {outliers.map((v) => (
            <li key={v.id}>
              <Link
                href={`/videos/${v.id}`}
                className="flex items-center gap-3 py-3 transition-colors hover:text-ink"
              >
                <span className="min-w-0 flex-1 truncate text-sm text-ink-dim">{v.title}</span>
                {v.channel_name && (
                  <span className="shrink-0 text-[11px] text-ink-faint">{v.channel_name}</span>
                )}
                {v.latest_views != null && (
                  <span className="shrink-0 font-mono text-[11px] text-ink-faint">
                    {Number(v.latest_views).toLocaleString()}
                  </span>
                )}
                {v.outlier_score != null && (
                  <span className="shrink-0 rounded border border-accent-dim px-1.5 py-0.5 font-mono text-[10px] text-accent">
                    {Number(v.outlier_score).toFixed(0)}x
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>

        <LogOutlierForm />
      </section>
    </div>
  );
}
