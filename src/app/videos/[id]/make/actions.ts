"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { markFilled } from "../slot-fill";

// These take plain arguments rather than FormData, because they are called from
// the outliner's keyboard handlers, not from a <form>. The rest of the app keeps
// its forms; typing is the one interaction a round-trip per keystroke ruins.
//
// Note which ones revalidate and which do not. Text saves deliberately do NOT —
// the outliner already holds the authoritative text on screen, and re-rendering
// the server tree under a cursor mid-sentence is how you lose a word.

const touch = (videoId: string) => revalidatePath(`/videos/${videoId}`, "layout");

export type NewBeat = {
  id: string;
  text: string;
  story_section: string | null;
  /** What the line is for. The skeleton arrives carrying these. */
  story_role?: string | null;
  /** Which attention cycle it belongs to. The skeleton carries these too. */
  story_loop?: number | null;
};

/**
 * The video's working script, created on demand.
 *
 * A fresh video has no `scripts` row, so the outliner would have nothing to
 * write into. Creating it on the first keystroke rather than at video creation
 * keeps videos you never wrote in from accumulating empty drafts.
 */
export async function ensureScript(videoId: string): Promise<string> {
  const { data: existing } = await db
    .from("scripts")
    .select("id")
    .eq("video_id", videoId)
    .order("created_at")
    .limit(1)
    .maybeSingle();

  if (existing) return existing.id;

  const { data, error } = await db
    .from("scripts")
    .insert({ video_id: videoId, name: "Draft", format: "short" })
    .select("id")
    .single();

  if (error) throw new Error(`Could not start a script: ${error.message}`);

  await markFilled(videoId, "script", true);
  touch(videoId);
  return data.id;
}

/**
 * Rewrite the running order in one call.
 *
 * sort_order is a plain int and a short script is a couple of dozen lines, so
 * renumbering the whole list is cheaper to reason about than fractional indices
 * — and it cannot drift.
 *
 * Ids the script does not have are dropped rather than trusted. This is an
 * UPDATE path riding on an upsert, and an unknown id would otherwise be
 * *inserted* — silently creating an empty beat that then collides the moment
 * the writer types into the line they thought was still blank. The client
 * legitimately holds lines that have never been saved (an empty one it is
 * waiting on), so it will send them; filtering belongs here, once.
 */
export async function reorderBeats(scriptId: string, orderedIds: string[]) {
  if (orderedIds.length === 0) return;

  const { data: existing } = await db
    .from("script_beats")
    .select("id")
    .eq("script_id", scriptId);

  const known = new Set((existing ?? []).map((r) => r.id));
  const rows = orderedIds
    .filter((id) => known.has(id))
    .map((id, i) => ({ id, script_id: scriptId, sort_order: i + 1 }));

  if (rows.length === 0) return;

  const { error } = await db.from("script_beats").upsert(rows, { onConflict: "id" });
  if (error) throw new Error(`Could not reorder beats: ${error.message}`);
}

/**
 * `orderedIds` is the full running order the client wants *after* the insert,
 * including the new beat. The client already knows it, so sending it avoids the
 * server guessing where "after this one" landed.
 */
export async function createBeat(
  videoId: string,
  scriptId: string,
  beat: NewBeat,
  orderedIds: string[],
) {
  await createBeats(videoId, scriptId, [beat], orderedIds);
}

/**
 * Several lines at once, inserted then ordered in two round trips rather than
 * two per line.
 *
 * This is how the opening skeleton lands. A new script shows the structure
 * immediately, but nothing is written until the first character is typed — at
 * which point the whole scaffold materialises together, so the labels and the
 * running order arrive as one thing rather than nine racing inserts.
 */
export async function createBeats(
  videoId: string,
  scriptId: string,
  beats: NewBeat[],
  orderedIds: string[],
) {
  if (beats.length === 0) return;

  const { error } = await db.from("script_beats").insert(
    beats.map((b) => ({
      id: b.id,
      script_id: scriptId,
      sort_order: orderedIds.indexOf(b.id) + 1,
      text: b.text || null,
      story_section: b.story_section,
      story_role: b.story_role ?? null,
      story_loop: b.story_loop ?? null,
    })),
  );

  if (error) throw new Error(`Could not add beats: ${error.message}`);

  await reorderBeats(scriptId, orderedIds);
  await markFilled(videoId, "script", true);
  touch(videoId);
}

/** Debounced from the outliner. No revalidation — see the note at the top. */
export async function saveBeatText(beatId: string, text: string) {
  const { error } = await db
    .from("script_beats")
    .update({ text: text.trim() || null })
    .eq("id", beatId);

  if (error) throw new Error(`Could not save: ${error.message}`);
}

export async function removeBeat(videoId: string, scriptId: string, beatId: string, orderedIds: string[]) {
  const { error } = await db.from("script_beats").delete().eq("id", beatId);
  if (error) throw new Error(`Could not delete beat: ${error.message}`);

  await reorderBeats(scriptId, orderedIds);
  touch(videoId);
}

/**
 * Move a line to the idea pile.
 *
 * Not a delete. A line you pulled out because it was not working yet and a line
 * that never existed are different things, and the second one is not recoverable
 * at 1am when you decide it was right after all.
 */
export async function parkBeat(videoId: string, beatId: string) {
  const { error } = await db.from("script_beats").update({ parked: true }).eq("id", beatId);
  if (error) throw new Error(`Could not park that line: ${error.message}`);
  touch(videoId);
}

export async function unparkBeat(
  videoId: string,
  scriptId: string,
  beatId: string,
  orderedIds: string[],
) {
  const { error } = await db.from("script_beats").update({ parked: false }).eq("id", beatId);
  if (error) throw new Error(`Could not restore that line: ${error.message}`);

  await reorderBeats(scriptId, orderedIds);
  await markFilled(videoId, "script", true);
  touch(videoId);
}

/**
 * A hook candidate or a captured idea, dropped into the script as a new line.
 *
 * The source row is deliberately left alone. The pile is storage; what an idea
 * *becomes* is decided by where it lands, and the same fragment may well be
 * worth using in two different videos.
 */
export async function beatFromText(
  videoId: string,
  scriptId: string,
  beatId: string,
  text: string,
  orderedIds: string[],
) {
  const { error } = await db.from("script_beats").insert({
    id: beatId,
    script_id: scriptId,
    sort_order: orderedIds.indexOf(beatId) + 1,
    text: text.trim() || null,
  });

  if (error) throw new Error(`Could not add that line: ${error.message}`);

  await reorderBeats(scriptId, orderedIds);
  await markFilled(videoId, "script", true);
  touch(videoId);
}

export async function setBeatSection(
  videoId: string,
  beatId: string,
  section: "start" | "middle" | "end" | null,
) {
  const { error } = await db
    .from("script_beats")
    .update({ story_section: section })
    .eq("id", beatId);

  if (error) throw new Error(`Could not set section: ${error.message}`);
  touch(videoId);
}

// Planting a technique on a line lives in story-actions.ts now, as
// attachTechnique / detachTechnique.
//
// It moved because it changed shape. The version that lived here wrote
// function_label and function_component_id, which meant one technique per line
// and — through video_components' unique (video_id, component_id) — one line
// per technique. Re-hooking at 0:04, 0:11 and 0:19 was inexpressible, and
// tagging a line silently erased what that line was for.
//
// The replacement writes script_beat_components and leaves story_role alone.

/**
 * The tray's three-state control: not on this video → used → skipped → off.
 *
 * Same semantics as cycleComponent in the workbench actions, in plain arguments
 * rather than FormData. 'skipped' stays a ROW — "I considered an open loop and
 * chose not to" and "I never thought about it" are different facts, and only
 * the first makes "videos without an open loop averaged 2k views" honest.
 */
export async function cycleTrayComponent(
  videoId: string,
  componentId: string,
  current: "none" | "used" | "skipped",
) {
  const next = current === "none" ? "used" : current === "used" ? "skipped" : "none";

  if (next === "none") {
    await db
      .from("video_components")
      .delete()
      .eq("video_id", videoId)
      .eq("component_id", componentId);
  } else {
    await db.from("video_components").upsert(
      { video_id: videoId, component_id: componentId, state: next },
      { onConflict: "video_id,component_id" },
    );
  }

  touch(videoId);
}

/**
 * Mark which words in a line are doing which job.
 *
 * Stored rather than drawn, because "did the hooks carrying all four core word
 * types outperform the ones missing Contrast" is the kind of question this app
 * exists to answer, and a colour that lives only in the browser can never be
 * asked anything.
 */
export async function addBeatTag(
  videoId: string,
  beatId: string,
  componentId: string,
  spanStart: number,
  spanEnd: number,
  spanText: string,
) {
  const { error } = await db.from("script_beat_tags").insert({
    beat_id: beatId,
    component_id: componentId,
    span_start: spanStart,
    span_end: spanEnd,
    span_text: spanText,
  });

  if (error) throw new Error(`Could not tag those words: ${error.message}`);
  touch(videoId);
}

export async function removeBeatTag(videoId: string, tagId: string) {
  const { error } = await db.from("script_beat_tags").delete().eq("id", tagId);
  if (error) throw new Error(`Could not remove that tag: ${error.message}`);
  touch(videoId);
}

/**
 * Offsets drift when the line is edited, so they are repaired from span_text.
 * Called after a save, keeping the stored positions honest without asking the
 * writer to think about it.
 */
export async function healBeatTags(beatId: string, text: string) {
  const { data: tags } = await db
    .from("script_beat_tags")
    .select("id, span_start, span_end, span_text")
    .eq("beat_id", beatId);

  for (const tag of tags ?? []) {
    if (text.slice(tag.span_start, tag.span_end) === tag.span_text) continue;

    const found = text.indexOf(tag.span_text);
    if (found === -1) {
      // The words themselves are gone. The tag is about text that no longer
      // exists, so keeping it would mislabel whatever moved into its place.
      await db.from("script_beat_tags").delete().eq("id", tag.id);
      continue;
    }

    await db
      .from("script_beat_tags")
      .update({ span_start: found, span_end: found + tag.span_text.length })
      .eq("id", tag.id);
  }
}

/**
 * The premise, stored in lego_angle — which is already defined as "What was
 * their take / premise / angle?". A second column would be the same fact twice.
 *
 * Deliberately not routed through updateLegos: that action writes all seven
 * Lego fields from one form, so calling it with only a premise would blank the
 * other six.
 */
export async function savePremise(videoId: string, premise: string) {
  const { error } = await db
    .from("videos")
    .update({ lego_angle: premise.trim() || null })
    .eq("id", videoId);

  if (error) throw new Error(`Could not save premise: ${error.message}`);

  if (premise.trim()) await markFilled(videoId, "legos", true);
}
