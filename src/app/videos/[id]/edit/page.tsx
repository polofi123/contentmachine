import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { beatTimeline, clock } from "@/lib/timing";
import { SlotCard, type SlotState } from "../slot-card";
import { ComponentsBody, type PickerComponent } from "../slot-bodies";
import { updateEditSpec } from "../actions";
import { loadPlacements, loadScript, loadSlots, running } from "../data";

export const dynamic = "force-dynamic";

/**
 * EDIT answers: how should this idea be assembled?
 *
 * It CONSUMES the structure MAKE authored rather than inventing its own. The
 * section headers and the running order are the same rows; the timestamps are
 * derived from the same words. Storing "the middle section" twice, once per
 * workspace, is how the two quietly stop agreeing.
 *
 * The script is deliberately read-only here. Changing what is said is writing,
 * and writing has a workspace of its own next door.
 *
 * This is an editing PLAN, not an editor. It answers "what should happen here,
 * and why" — Premiere and CapCut answer "can I trim frame 18394".
 */
export default async function EditPage({ params }: PageProps<"/videos/[id]/edit"> ) {
  const { id } = await params;

  const [{ data: video }, script, slots, { data: components }, { data: chosen }] =
    await Promise.all([
      db.from("videos").select("id, is_mine").eq("id", id).maybeSingle(),
      loadScript(id),
      loadSlots(id),
      db
        .from("components")
        .select("id, source_id, layer_id, parent_id, name, body, is_placeholder, sort_order")
        .is("archived_at", null)
        .order("sort_order"),
      db
        .from("video_components")
        .select("component_id, state, placement_sec, placement_note, anchor_beat_id")
        .eq("video_id", id),
    ]);

  if (!video) notFound();

  const beats = running(script.beats);
  const timeline = beatTimeline(beats);
  const chosenMap = new Map((chosen ?? []).map((c) => [c.component_id, c]));

  // A technique planted on a line reports the line's derived time, not a stored
  // number — so it stays right when the words above it are rewritten.
  //
  // Read from script_beat_components rather than video_components.anchor_beat_id
  // now. The anchor could only hold one beat per technique, so a video that
  // re-hooks three times showed the re-hook once and silently dropped the other
  // two — which is precisely the shape EDIT needs to see, because each one is a
  // cut.
  const names = new Map((components ?? []).map((c) => [c.id, c.name]));
  const placements = await loadPlacements(beats.map((b) => b.id));
  const plantedByBeat = new Map<string, string[]>(
    [...placements].map(([beatId, ids]) => [
      beatId,
      ids.map((id) => names.get(id)).filter((n): n is string => Boolean(n)),
    ]),
  );

  const editSlots = slots.active.filter(
    (s) => s.workflow_stage === "edit" || s.workflow_stage === "shared",
  );

  const forLayer = (layerId: string | null): PickerComponent[] =>
    (components ?? [])
      .filter((c) => c.layer_id === layerId && !c.parent_id)
      .map((c) => {
        const sel = chosenMap.get(c.id);
        return {
          id: c.id,
          source_id: c.source_id,
          name: c.name,
          body: c.body,
          is_placeholder: c.is_placeholder,
          state: (sel?.state as "used" | "skipped") ?? "none",
          placement_sec: sel?.placement_sec ?? null,
          placement_note: sel?.placement_note ?? null,
        };
      });

  return (
    <div className="mx-auto max-w-3xl">
      <section className="rounded-xl border border-border-soft bg-surface px-4 py-3">
        <h2 className="mb-1 text-sm text-ink">The cut</h2>
        <p className="mb-3 text-[11px] text-ink-faint">
          Sections and order come from MAKE. Times are estimated from the words, so they move when
          the writing does.
        </p>

        {beats.length === 0 ? (
          <p className="text-xs text-ink-faint">
            Nothing written yet —{" "}
            <Link href={`/videos/${id}/make`} className="text-accent hover:underline">
              start in MAKE
            </Link>
            .
          </p>
        ) : (
          <ol className="space-y-2.5">
            {beats.map((beat, i) => {
              const time = timeline.get(beat.id);
              const newSection =
                beat.story_section != null &&
                beat.story_section !== (beats[i - 1]?.story_section ?? null);

              return (
                <li key={beat.id}>
                  {newSection && (
                    <p className="mb-1.5 mt-3 border-t border-border-soft pt-2 text-[10px] tracking-wide text-ink-faint">
                      {beat.story_section?.toUpperCase()}
                    </p>
                  )}
                  <div className="flex items-start gap-3">
                    <span
                      className="mt-[2px] w-10 shrink-0 font-mono text-[11px] text-ink-faint"
                      title={time?.derived ? "estimated from the words" : "pinned"}
                    >
                      {clock(time?.startSec ?? 0)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm leading-relaxed text-ink-dim">
                        {beat.text || <span className="text-ink-faint">(empty line)</span>}
                      </p>

                      {/* The story reason for the beat, inherited read-only.
                          EDIT decides how a re-hook is delivered — the cut, the
                          punch-in, the caption — and needs to know that it IS
                          one. It does not get to change that here. */}
                      {beat.story_role && (
                        <span className="mr-1.5 mt-1 inline-block text-[10px] tracking-wide text-ink-faint">
                          {beat.story_role.toUpperCase()}
                        </span>
                      )}
                      {plantedByBeat.get(beat.id)?.map((name) => (
                        <span
                          key={name}
                          className="mr-1.5 mt-1 inline-block text-[10px] tracking-wide text-accent/70"
                        >
                          {name.toUpperCase()}
                        </span>
                      ))}
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </section>

      <div className="mt-2.5 space-y-2.5">
        {editSlots.map((slot) => {
          const state = (slots.state.get(slot.key) ?? "empty") as SlotState;
          const used = forLayer(slot.layer_id).filter((c) => c.state === "used").length;

          return (
            <SlotCard
              key={slot.key}
              videoId={id}
              slotKey={slot.key}
              label={slot.label}
              description={slot.description}
              state={state}
              summary={used > 0 ? `${used} planted` : null}
            >
              <ComponentsBody
                videoId={id}
                slotKey={slot.key}
                components={forLayer(slot.layer_id)}
              />
            </SlotCard>
          );
        })}

        {editSlots.length === 0 && (
          <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-xs text-ink-faint">
            This build opted into no edit slots. Add one from the completeness meter above.
          </p>
        )}
      </div>

      {script.scriptId && (
        <section className="mt-8 rounded-xl border border-border-soft bg-surface px-4 py-3">
          <h2 className="mb-2 text-sm text-ink">Edit spec</h2>
          <form action={updateEditSpec} className="space-y-1.5">
            <input type="hidden" name="video_id" value={id} />
            <input type="hidden" name="script_id" value={script.scriptId} />
            <textarea
              name="edit_spec"
              defaultValue={script.editSpec ?? ""}
              rows={5}
              placeholder="Lighting, overlays, b-roll, SFX…"
              className="w-full rounded-md border border-border bg-surface-2 px-2.5 py-1.5 text-xs outline-none placeholder:text-ink-faint focus:border-accent-dim"
            />
            <button
              type="submit"
              className="rounded-md border border-accent-dim px-2.5 py-1 text-xs text-accent transition-colors hover:bg-accent-dim/15"
            >
              Save spec
            </button>
          </form>
        </section>
      )}
    </div>
  );
}
