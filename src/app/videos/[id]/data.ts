import { db } from "@/lib/db";

// Shared server-side loaders. The layout, MAKE and EDIT all need the same
// script and the same slot list, and they must agree — a beat cannot be third
// in one view and fourth in another, and completeness cannot read 6/7 in the
// header and 5/7 in the body.

export type WorkflowStage = "make" | "edit" | "shared";

export type BeatRecord = {
  id: string;
  sort_order: number;
  t_start_sec: number | null;
  t_end_sec: number | null;
  function_label: string | null;
  function_component_id: string | null;
  story_section: string | null;
  parked: boolean;
  text: string | null;
};

/**
 * The video's working script.
 *
 * `scripts` is one-to-many because SCRIPT-04 (12 min) and SCRIPT-05 (30s cut)
 * are the same idea at two lengths. MAKE edits the FIRST one — the outliner is
 * a place to write, not a place to manage cuts, and a short-form build has one.
 * Returns a null script for videos never written into; the outliner creates it
 * lazily on the first keystroke rather than littering empty drafts.
 */
export async function loadScript(videoId: string): Promise<{
  scriptId: string | null;
  editSpec: string | null;
  durationTargetSec: number | null;
  beats: BeatRecord[];
}> {
  const { data } = await db
    .from("scripts")
    .select(
      "id, edit_spec, duration_target_sec, script_beats(id, sort_order, t_start_sec, t_end_sec, function_label, function_component_id, story_section, parked, text)",
    )
    .eq("video_id", videoId)
    .order("created_at")
    .limit(1)
    .maybeSingle();

  if (!data) {
    return { scriptId: null, editSpec: null, durationTargetSec: null, beats: [] };
  }

  return {
    scriptId: data.id,
    editSpec: data.edit_spec,
    durationTargetSec: data.duration_target_sec,
    beats: (data.script_beats ?? []).sort((a, b) => a.sort_order - b.sort_order),
  };
}

/** Beats that make up the running video — parked lines live in the pile. */
export const running = (beats: BeatRecord[]) => beats.filter((b) => !b.parked);

/** Slots this build opted into, plus the ones it hasn't, both stage-tagged. */
export async function loadSlots(videoId: string) {
  const [{ data: allSlots }, { data: videoSlots }] = await Promise.all([
    db
      .from("slots")
      .select("key, label, layer_id, description, sort_order, workflow_stage")
      .order("sort_order"),
    db.from("video_slots").select("slot_key, state").eq("video_id", videoId),
  ]);

  const state = new Map((videoSlots ?? []).map((s) => [s.slot_key, s.state]));

  return {
    active: (allSlots ?? []).filter((s) => state.has(s.key)),
    available: (allSlots ?? []).filter((s) => !state.has(s.key)),
    state,
  };
}
