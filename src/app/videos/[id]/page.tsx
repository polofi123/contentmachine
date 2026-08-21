import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { addSlot } from "./actions";
import { loadSlots } from "./data";
import { SlotStack } from "./slot-stack";
import { MetricsBody } from "./slot-bodies";

export const dynamic = "force-dynamic";

// My videos go to the MAKE workspace. Outliers stay here, on the observational
// card stack, because studying someone else's finished video is a different job
// from writing one — you are describing what happened, not deciding what to say,
// and an outliner built for composing would be the wrong shape for it.
export default async function VideoPage({ params }: PageProps<"/videos/[id]"> ) {
  const { id } = await params;

  const { data: video } = await db.from("videos").select("id, is_mine").eq("id", id).maybeSingle();

  if (!video) notFound();
  if (video.is_mine) redirect(`/videos/${id}/make`);

  const [slots, { data: metrics }] = await Promise.all([
    loadSlots(id),
    db
      .from("video_metrics")
      .select("measured_at, views, retention_pct")
      .eq("video_id", id)
      .order("measured_at", { ascending: false }),
  ]);

  return (
    <div className="mx-auto max-w-3xl">
      {slots.active.length === 0 && (
        <div className="rounded-xl border border-dashed border-border px-4 py-6 text-center">
          <p className="text-sm text-ink-dim">This build has no slots yet.</p>
          <p className="mx-auto mt-1 max-w-sm text-xs text-ink-faint">
            Slots are the completeness denominator — pick only what this video actually needs, so a
            three-piece build reads 3/3.
          </p>
          <div className="mt-3 flex flex-wrap justify-center gap-1.5">
            {slots.available.map((s) => (
              <form key={s.key} action={addSlot}>
                <input type="hidden" name="video_id" value={id} />
                <input type="hidden" name="slot_key" value={s.key} />
                <button
                  type="submit"
                  title={s.description ?? undefined}
                  className="rounded border border-border px-2 py-1 text-[11px] text-ink-faint transition-colors hover:border-accent-dim hover:text-accent"
                >
                  + {s.label}
                </button>
              </form>
            ))}
          </div>
        </div>
      )}

      <SlotStack videoId={id} slots={slots.active} slotState={slots.state} />

      <section className="mt-8 rounded-xl border border-border-soft bg-surface px-4 py-3">
        <h2 className="mb-2 text-sm text-ink">Numbers</h2>
        <MetricsBody videoId={id} history={metrics ?? []} />
      </section>
    </div>
  );
}
