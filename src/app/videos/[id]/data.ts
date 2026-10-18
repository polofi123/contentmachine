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
  /** Superseded by story_role. Kept because past videos still carry one. */
  function_label: string | null;
  /** Superseded by script_beat_components. Kept for the same reason. */
  function_component_id: string | null;
  story_section: string | null;
  /** What this line is for. See story-vocab.ts. */
  story_role: string | null;
  /** How it follows the line above it. */
  dance_relation: string | null;
  /** Which cycle of attention it belongs to. */
  story_loop: number | null;
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
      "id, edit_spec, duration_target_sec, script_beats(id, sort_order, t_start_sec, t_end_sec, function_label, function_component_id, story_section, story_role, dance_relation, story_loop, parked, text)",
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

/**
 * The story around the script: direction, lenses, open questions, placements.
 *
 * One loader rather than four call sites, for the same reason loadScript exists
 * — the panel, the diagnostics and the AI pass must all be describing the same
 * story, and four independent queries is how they start disagreeing.
 */
export async function loadStory(videoId: string) {
  const [{ data: direction }, { data: lenses }, { data: questions }] = await Promise.all([
    db
      .from("story_direction")
      .select("starting_belief, destination, final_thought, meaning, tense")
      .eq("video_id", videoId)
      .maybeSingle(),
    db
      .from("story_lenses")
      .select("id, text, tier, is_selected, component_id")
      .eq("video_id", videoId)
      .order("created_at"),
    db
      .from("story_questions")
      .select("id, text, opened_beat_id, answered_beat_id, source_component_id")
      .eq("video_id", videoId)
      .order("created_at"),
  ]);

  return {
    direction: direction ?? null,
    lenses: lenses ?? [],
    questions: questions ?? [],
  };
}

/**
 * Which techniques sit on which lines.
 *
 * Keyed by beat, because that is how both workspaces render it. Takes the beat
 * ids rather than the video so it can be skipped entirely on a script that has
 * not been written into yet.
 */
export async function loadPlacements(beatIds: string[]) {
  if (beatIds.length === 0) return new Map<string, string[]>();

  const { data } = await db
    .from("script_beat_components")
    .select("script_beat_id, component_id")
    .in("script_beat_id", beatIds);

  const byBeat = new Map<string, string[]>();
  for (const row of data ?? []) {
    byBeat.set(row.script_beat_id, [...(byBeat.get(row.script_beat_id) ?? []), row.component_id]);
  }
  return byBeat;
}

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
