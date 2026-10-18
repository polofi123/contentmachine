"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { markFilled } from "../slot-fill";
import type { DanceRelation, LensTier, StoryRole, StoryTense } from "../story-vocab";

// The storytelling mechanism, as writes.
//
// Same shape as make/actions.ts and for the same reason: these are called from
// a panel sitting beside the caret, not from a <form>, so they take plain
// arguments. Text fields are debounced client-side and the browser holds the
// authoritative value while you type — see the note at the top of actions.ts
// about why re-rendering the server tree under a cursor loses words.

const touch = (videoId: string) => revalidatePath(`/videos/${videoId}`, "layout");

/* ===================================================================== */
/* DIRECTION                                                             */
/* ===================================================================== */

/**
 * Which prose field of the direction is being written.
 *
 * A closed union rather than a string, because this value reaches a column
 * name. Anything wider would let a caller write to a column of its choosing.
 */
export type DirectionField =
  | "starting_belief"
  | "destination"
  | "final_thought"
  | "meaning";

const DIRECTION_FIELDS: DirectionField[] = [
  "starting_belief",
  "destination",
  "final_thought",
  "meaning",
];

/**
 * Write one field of the direction, creating the row on first use.
 *
 * The row is created lazily, exactly like `scripts` — a video you opened and
 * thought about for four seconds should not leave a direction behind. Its
 * existence is meant to mean "someone decided something here".
 *
 * Deliberately one field at a time rather than a whole-form save. The panel is
 * four boxes you fill in over the life of a script, in any order, and a
 * form-shaped action would blank the three you were not looking at.
 */
export async function saveDirection(videoId: string, field: DirectionField, value: string) {
  if (!DIRECTION_FIELDS.includes(field)) throw new Error(`Unknown direction field: ${field}`);

  const trimmed = value.trim() || null;

  // Built as a typed partial rather than an inline computed key: `{ [field]: v }`
  // widens to a string index signature, which throws away the column types the
  // generated schema gives us and would let a rename here fail silently.
  const patch: Partial<Record<DirectionField, string | null>> = { [field]: trimmed };

  const { error } = await db
    .from("story_direction")
    .upsert({ video_id: videoId, ...patch }, { onConflict: "video_id" });

  if (error) throw new Error(`Could not save the direction: ${error.message}`);

  // A destination or a meaning is the video having a point, which is what the
  // `story` slot has always meant. No new slot for this — the completeness
  // denominator is already 17 and turning storytelling into three more boxes
  // to tick is the failure the whole panel is built to avoid.
  if (trimmed && (field === "destination" || field === "meaning")) {
    await markFilled(videoId, "story", true);
  }
}

/**
 * Declare the tense, or clear it.
 *
 * Clearing is a real choice and not a gap: with no tense declared, mixed tense
 * is just prose and the drift observation stays quiet. Declaring one is how you
 * ask to be told about it.
 */
export async function setStoryTense(videoId: string, tense: StoryTense | null) {
  const { error } = await db
    .from("story_direction")
    .upsert({ video_id: videoId, tense }, { onConflict: "video_id" });

  if (error) throw new Error(`Could not set the tense: ${error.message}`);
  touch(videoId);
}

/* ===================================================================== */
/* LENS                                                                  */
/* ===================================================================== */

/**
 * Add a candidate lens.
 *
 * Never selects it. Writing down the obvious reading is the point of the
 * obvious row — it exists so you can look at it and decide against it — and an
 * add that auto-selected would make the first thing you typed the answer.
 */
export async function addLens(
  videoId: string,
  text: string,
  tier: LensTier | null,
  componentId: string | null,
) {
  if (!text.trim()) return;

  const { error } = await db.from("story_lenses").insert({
    video_id: videoId,
    text: text.trim(),
    tier,
    component_id: componentId,
  });

  if (error) throw new Error(`Could not add that lens: ${error.message}`);
  touch(videoId);
}

/**
 * Choose the lens, or unchoose it.
 *
 * Two statements rather than one, because the partial unique index allows
 * exactly one selected row per video and an upsert that set the new one first
 * would collide with the old. Clearing first is the only order that works.
 */
export async function selectLens(videoId: string, lensId: string | null) {
  const { error: clearErr } = await db
    .from("story_lenses")
    .update({ is_selected: false })
    .eq("video_id", videoId)
    .eq("is_selected", true);

  if (clearErr) throw new Error(`Could not change the lens: ${clearErr.message}`);

  if (lensId) {
    const { error } = await db
      .from("story_lenses")
      .update({ is_selected: true })
      .eq("id", lensId)
      .eq("video_id", videoId);

    if (error) throw new Error(`Could not choose that lens: ${error.message}`);
    await markFilled(videoId, "story", true);
  }

  touch(videoId);
}

/**
 * Delete a lens outright.
 *
 * The one place in this file that really deletes. A rejected lens is not like a
 * skipped technique — there is no analytical question that "I considered and
 * rejected 'her outfit'" helps answer, and keeping every discarded angle
 * forever would turn the panel into a graveyard you scroll past.
 */
export async function removeLens(videoId: string, lensId: string) {
  const { error } = await db.from("story_lenses").delete().eq("id", lensId).eq("video_id", videoId);
  if (error) throw new Error(`Could not remove that lens: ${error.message}`);
  touch(videoId);
}

/* ===================================================================== */
/* TENSION                                                               */
/* ===================================================================== */

/**
 * Write down something the viewer is now wondering.
 *
 * Unplaced by default. A question you have noticed but not yet built a line for
 * is the normal way one arrives, and demanding a beat up front would mean only
 * recording questions the script already answers.
 */
export async function addQuestion(
  videoId: string,
  text: string,
  sourceComponentId: string | null,
  openedBeatId: string | null,
) {
  if (!text.trim()) return;

  const { error } = await db.from("story_questions").insert({
    video_id: videoId,
    text: text.trim(),
    source_component_id: sourceComponentId,
    opened_beat_id: openedBeatId,
  });

  if (error) throw new Error(`Could not add that question: ${error.message}`);

  // Recording a technique the video uses is the separate, structured act it is
  // everywhere else — this is what makes "did the videos that used Contradiction
  // outperform" answerable later.
  if (sourceComponentId) await recordUse(videoId, sourceComponentId);

  await markFilled(videoId, "story", true);
  touch(videoId);
}

/** Pin where a question opens or closes. NULL unpins, which is not the same as deleting. */
export async function setQuestionBeat(
  videoId: string,
  questionId: string,
  end: "opened" | "answered",
  beatId: string | null,
) {
  const patch =
    end === "opened" ? { opened_beat_id: beatId } : { answered_beat_id: beatId };

  const { error } = await db
    .from("story_questions")
    .update(patch)
    .eq("id", questionId)
    .eq("video_id", videoId);

  if (error) throw new Error(`Could not place that question: ${error.message}`);
  touch(videoId);
}

export async function removeQuestion(videoId: string, questionId: string) {
  const { error } = await db
    .from("story_questions")
    .delete()
    .eq("id", questionId)
    .eq("video_id", videoId);

  if (error) throw new Error(`Could not remove that question: ${error.message}`);
  touch(videoId);
}

/* ===================================================================== */
/* THE BEAT OVERLAY — role, relation, loop                               */
/* ===================================================================== */

/**
 * What this line is for.
 *
 * Note what this does NOT do: it does not touch the techniques attached to the
 * beat. Marking a line the HOOK and tagging it with Open Loop are two separate
 * facts about it, and the old function_label — which did both and lost one —
 * is why this column exists.
 */
export async function setBeatRole(videoId: string, beatId: string, role: StoryRole | null) {
  const { error } = await db.from("script_beats").update({ story_role: role }).eq("id", beatId);
  if (error) throw new Error(`Could not set that role: ${error.message}`);
  touch(videoId);
}

/** How this line follows the one above it. */
export async function setBeatDance(
  videoId: string,
  beatId: string,
  relation: DanceRelation | null,
) {
  const { error } = await db
    .from("script_beats")
    .update({ dance_relation: relation })
    .eq("id", beatId);

  if (error) throw new Error(`Could not set that relationship: ${error.message}`);
  touch(videoId);
}

export async function setBeatLoop(videoId: string, beatId: string, loop: number | null) {
  const { error } = await db.from("script_beats").update({ story_loop: loop }).eq("id", beatId);
  if (error) throw new Error(`Could not set the loop: ${error.message}`);
  touch(videoId);
}

/**
 * Number every line in one pass, starting a new loop at each re-hook.
 *
 * Loops are meant to be noticed, not administered, and numbering fifteen lines
 * by hand is administration. This reads the roles already on the script — a
 * hook or a re-hook is by definition where a new cycle of attention starts —
 * and lays the numbering over the top.
 *
 * Only ever a starting point. Every number stays editable afterwards, and a
 * script with no hook or re-hook roles is left alone rather than being given
 * one arbitrary loop.
 */
export async function autoLoop(videoId: string, scriptId: string) {
  const { data: beats } = await db
    .from("script_beats")
    .select("id, sort_order, story_role, text")
    .eq("script_id", scriptId)
    .eq("parked", false)
    .order("sort_order");

  const rows = (beats ?? []).filter((b) => (b.text ?? "").trim());
  if (rows.length === 0) return;

  const starts = rows.filter((b) => b.story_role === "hook" || b.story_role === "rehook");
  if (starts.length === 0) return;

  let loop = 0;
  for (const beat of rows) {
    if (beat.story_role === "hook" || beat.story_role === "rehook") loop += 1;
    // Anything before the first hook belongs to no loop rather than to loop 1 —
    // a cold open that precedes the hook is not part of its cycle.
    await db.from("script_beats").update({ story_loop: loop || null }).eq("id", beat.id);
  }

  touch(videoId);
}

/* ===================================================================== */
/* PLACEMENT — techniques on a line                                      */
/* ===================================================================== */

/**
 * Make sure the video records that it uses this technique.
 *
 * Upsert with state='used' — and note it does not downgrade anything. A row
 * already marked 'used' stays used; the only transition here is toward use,
 * because placing a technique on a line is evidence of exactly that.
 */
async function recordUse(videoId: string, componentId: string) {
  const { error } = await db
    .from("video_components")
    .upsert(
      { video_id: videoId, component_id: componentId, state: "used" },
      { onConflict: "video_id,component_id" },
    );

  if (error) throw new Error(`Could not record that technique: ${error.message}`);
}

/**
 * Attach a technique to a line. One gesture, two facts:
 *
 *   1. this line uses it                script_beat_components
 *   2. this video uses it               video_components (state='used')
 *
 * They are separate rows because they answer separate questions — "which lines
 * are re-hooks" and "did this video use Re-hooking, and was that planned, used
 * or skipped" — but to the writer it is one move, so it costs one move.
 *
 * Unlike the old plantComponent this does NOT relabel the line. A beat's role
 * and the techniques on it are different taxonomies, and the same technique can
 * now sit on several lines, which is the whole point: re-hooking at 0:04, 0:11
 * and 0:19 is three placements and one video_components row.
 */
export async function attachTechnique(videoId: string, beatId: string, componentId: string) {
  const { error } = await db
    .from("script_beat_components")
    .upsert(
      { script_beat_id: beatId, component_id: componentId },
      { onConflict: "script_beat_id,component_id" },
    );

  if (error) throw new Error(`Could not place that technique: ${error.message}`);

  await recordUse(videoId, componentId);
  touch(videoId);
}

/**
 * Take a technique off a line.
 *
 * The video_components row is dropped only when the LAST placement goes, and
 * only when it says 'used'. Both conditions matter:
 *
 *   - still placed elsewhere  → the video demonstrably still uses it
 *   - state is 'skipped'      → someone decided against it deliberately, and
 *                               that decision is the row's whole value.
 *                               Blowing it away here would quietly turn "I
 *                               considered this and said no" into "I never
 *                               thought about it", which is the one collapse
 *                               the schema exists to prevent.
 */
export async function detachTechnique(videoId: string, beatId: string, componentId: string) {
  const { error } = await db
    .from("script_beat_components")
    .delete()
    .eq("script_beat_id", beatId)
    .eq("component_id", componentId);

  if (error) throw new Error(`Could not remove that technique: ${error.message}`);

  // Any placement left anywhere in this video's script?
  const { count } = await db
    .from("script_beat_components")
    .select("script_beat_id, script_beats!inner(script_id, scripts!inner(video_id))", {
      count: "exact",
      head: true,
    })
    .eq("component_id", componentId)
    .eq("script_beats.scripts.video_id", videoId);

  if ((count ?? 0) === 0) {
    await db
      .from("video_components")
      .delete()
      .eq("video_id", videoId)
      .eq("component_id", componentId)
      .eq("state", "used");
  }

  touch(videoId);
}
