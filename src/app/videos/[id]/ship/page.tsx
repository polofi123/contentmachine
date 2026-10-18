import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { scriptText } from "@/lib/script-text";
import { approxSec, totalSec, totalWords } from "@/lib/timing";
import { loadScript, running } from "../data";
import { MetricsBody } from "../slot-bodies";
import { publishVideo } from "../actions";
import { VIDEO_STATUSES } from "../video-status";
import { ScriptRead } from "./script-read";

export const dynamic = "force-dynamic";

const input =
  "w-full rounded-md border border-border bg-surface-2 px-2.5 py-1.5 text-xs outline-none placeholder:text-ink-faint focus:border-accent-dim";
const label = "mb-1 block text-[10px] tracking-wide text-ink-faint";

/**
 * SHIP answers: what am I saying out loud, and what happened when I said it?
 *
 * It is the only view that is not a workspace. MAKE, STUDY and EDIT all exist
 * to change the video; this one exists to take it out of the app — read it to
 * camera, paste it into a prompter — and then, days or weeks later, to bring
 * the result back in. Those two jobs are the same screen on purpose: the URL
 * and the numbers belong beside the words that earned them, and a video whose
 * script you never come back to is a video whose views never get typed in.
 *
 * Nothing here is a gate. A script can be read before it is finished and the
 * release fields can stay empty forever.
 */
export default async function ShipPage({ params }: PageProps<"/videos/[id]/ship">) {
  const { id } = await params;

  const { data: video } = await db
    .from("videos")
    .select("id, is_mine, status, url, platform, platform_video_id, published_at")
    .eq("id", id)
    .maybeSingle();

  if (!video) notFound();
  // Outliers already have their numbers on the observational stack, and there
  // is no script of mine to read on someone else's video.
  if (!video.is_mine) redirect(`/videos/${id}`);

  const [script, { data: hook }, { data: metrics }] = await Promise.all([
    loadScript(id),
    db
      .from("hooks")
      .select("text")
      .eq("video_id", id)
      .eq("is_selected", true)
      .maybeSingle(),
    db
      .from("video_metrics")
      .select("measured_at, views, retention_pct")
      .eq("video_id", id)
      .order("measured_at", { ascending: false }),
  ]);

  const beats = running(script.beats);
  const plain = scriptText(beats, false);

  return (
    <div className="mx-auto max-w-3xl space-y-2.5">
      {plain === "" ? (
        <section className="rounded-xl border border-dashed border-border px-4 py-6 text-center">
          <p className="text-sm text-ink-dim">No words yet.</p>
          <p className="mx-auto mt-1 max-w-sm text-xs text-ink-faint">
            The read view assembles itself from the script —{" "}
            <Link href={`/videos/${id}/make`} className="text-accent hover:underline">
              write it in MAKE
            </Link>{" "}
            and it will be here.
          </p>
        </section>
      ) : (
        <>
          {/* The chosen hook sits above rather than inside, because it may or
              may not already be the first line and printing it twice into a
              prompter is worse than printing it once in the wrong place. */}
          {hook?.text && (
            <section className="rounded-xl border border-border-soft bg-surface px-4 py-3">
              <p className={label}>SELECTED HOOK</p>
              <p className="text-sm leading-relaxed text-ink">{hook.text}</p>
            </section>
          )}

          <ScriptRead
            plain={plain}
            marked={scriptText(beats, true)}
            words={totalWords(beats)}
            runtime={approxSec(totalSec(beats))}
          />
        </>
      )}

      <section className="rounded-xl border border-border-soft bg-surface px-4 py-3">
        <h2 className="mb-1 text-sm text-ink">Where it went</h2>
        <p className="mb-3 text-[11px] text-ink-faint">
          Fill this in whenever — the day it goes up, or a month later. The platform and its id are
          read out of the URL if you leave them blank.
        </p>

        <form action={publishVideo} className="space-y-2.5">
          <input type="hidden" name="video_id" value={id} />

          <div>
            <label className={label} htmlFor="url">
              URL
            </label>
            <input
              id="url"
              name="url"
              type="url"
              defaultValue={video.url ?? ""}
              placeholder="https://youtube.com/watch?v=…"
              className={input}
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <div className="min-w-32 flex-1">
              <label className={label} htmlFor="status">
                Status
              </label>
              <select
                id="status"
                name="status"
                defaultValue={video.status ?? "idea"}
                className={input}
              >
                {VIDEO_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>

            <div className="min-w-32 flex-1">
              <label className={label} htmlFor="published_at">
                Published
              </label>
              <input
                id="published_at"
                name="published_at"
                type="date"
                defaultValue={video.published_at?.slice(0, 10) ?? ""}
                className={input}
              />
            </div>

            <div className="min-w-32 flex-1">
              <label className={label} htmlFor="platform">
                Platform
              </label>
              <select
                id="platform"
                name="platform"
                defaultValue={video.platform ?? ""}
                className={input}
              >
                <option value="">from URL</option>
                {["youtube", "tiktok", "instagram", "other"].map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>

            <div className="min-w-32 flex-1">
              <label className={label} htmlFor="platform_video_id">
                Video id
              </label>
              <input
                id="platform_video_id"
                name="platform_video_id"
                defaultValue={video.platform_video_id ?? ""}
                placeholder="from URL"
                className={input}
              />
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="submit"
              className="rounded-md border border-accent-dim px-2.5 py-1 text-xs text-accent transition-colors hover:bg-accent-dim/15"
            >
              Save
            </button>
            {video.url && (
              <a
                href={video.url}
                target="_blank"
                rel="noreferrer"
                className="truncate text-[11px] text-ink-faint hover:text-ink"
              >
                open the video ↗
              </a>
            )}
          </div>
        </form>
      </section>

      <section className="rounded-xl border border-border-soft bg-surface px-4 py-3">
        <h2 className="mb-2 text-sm text-ink">Numbers</h2>
        <MetricsBody videoId={id} history={metrics ?? []} />
      </section>
    </div>
  );
}
