"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { STORY_MODEL } from "@/lib/ai";
import { beatTimeline } from "@/lib/timing";
import { segmentScript } from "@/lib/segment";
import { MECHANICAL_OPERATIONS, type AnalysisOperation, type FindingState } from "@/lib/analysis";
import { libraryIndexFrom, runPipeline } from "./pipeline";
import { loadScript, running } from "../data";

const touch = (videoId: string) => revalidatePath(`/videos/${videoId}`, "layout");

/* ===================================================================== */
/* RUNNING                                                               */
/* ===================================================================== */

/**
 * Analyse the current script.
 *
 * Freezes a version first. Findings carry character offsets, and offsets into a
 * string that is still being edited are a promise the app cannot keep — so the
 * analysed text is captured, the run is attached to that capture, and any later
 * edit makes the run visibly out of date instead of silently wrong.
 *
 * A version is reused when the text has not changed since the last one, so
 * re-running twice on the same script does not litter the history.
 */
export async function runAnalysis(videoId: string): Promise<string> {
  const script = await loadScript(videoId);
  if (!script.scriptId) throw new Error("Nothing written yet.");

  const beats = running(script.beats);
  const segmented = segmentScript(beats, (rows) => beatTimeline(rows));

  if (segmented.segments.length < 3) {
    throw new Error("Write at least three lines before running the analysis.");
  }

  const { data: previous } = await db
    .from("script_versions")
    .select("id, content")
    .eq("script_id", script.scriptId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let versionId = previous?.content === segmented.content ? previous.id : null;

  if (!versionId) {
    const { data, error } = await db
      .from("script_versions")
      .insert({
        script_id: script.scriptId,
        parent_version_id: previous?.id ?? null,
        content: segmented.content,
        segments: segmented.segments,
      })
      .select("id")
      .single();

    if (error) throw new Error(`Could not snapshot the script: ${error.message}`);
    versionId = data.id;
  }

  // The library, read from the same table /library renders. No second copy.
  const [{ data: components }, { data: layers }, { data: video }, { data: direction }, { data: lenses }] =
    await Promise.all([
      db
        .from("components")
        .select("id, source_id, name, body, layer_id, parent_id")
        .is("archived_at", null)
        .eq("is_placeholder", false),
      db.from("layers").select("id, label"),
      db.from("videos").select("title, lego_topic, lego_angle").eq("id", videoId).maybeSingle(),
      db
        .from("story_direction")
        .select("destination, meaning, final_thought, starting_belief, tense")
        .eq("video_id", videoId)
        .maybeSingle(),
      db.from("story_lenses").select("text, is_selected").eq("video_id", videoId),
    ]);

  const layerLabels = new Map((layers ?? []).map((l) => [l.id, l.label]));
  const { index } = libraryIndexFrom(components ?? [], layerLabels);

  const selectedLens = (lenses ?? []).find((l) => l.is_selected);
  const context = [
    `TOPIC: ${video?.lego_topic || video?.title || "(not set)"}`,
    video?.lego_angle ? `PREMISE: ${video.lego_angle}` : null,
    direction?.destination ? `DESTINATION: ${direction.destination}` : null,
    direction?.meaning ? `MEANING: ${direction.meaning}` : null,
    selectedLens ? `LENS: ${selectedLens.text}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const result = await runPipeline({ script: segmented, context, index });

  const { data: run, error: runErr } = await db
    .from("analysis_runs")
    .insert({
      video_id: videoId,
      script_version_id: versionId,
      model: STORY_MODEL,
      story_map: result.storyMap,
      summary: result.summary,
      trace: result.trace,
      library_total: result.coverage.libraryTotal,
      library_citable: result.coverage.libraryCitable,
    })
    .select("id")
    .single();

  if (runErr) throw new Error(`Could not save the run: ${runErr.message}`);

  for (const finding of result.findings) {
    const { data: row, error } = await db
      .from("analysis_findings")
      .insert({
        run_id: run.id,
        scope: finding.scope,
        priority: finding.priority,
        confidence: finding.confidence,
        diagnosis_type: finding.diagnosisType,
        diagnosis: finding.diagnosis,
        evidence: finding.evidence,
        why_applicable: finding.whyApplicable,
        intended_effect: finding.intendedEffect,
        operation: finding.operation,
      })
      .select("id")
      .single();

    if (error || !row) continue;

    await db.from("analysis_finding_library_refs").insert(
      finding.references.map((r) => ({
        finding_id: row.id,
        component_id: r.libraryElementId,
        is_primary: r.isPrimary,
        relevance: r.relevance,
        supporting_text: r.supportingText,
      })),
    );
  }

  touch(videoId);
  return run.id;
}

/* ===================================================================== */
/* ACCEPT / REJECT                                                       */
/* ===================================================================== */

/**
 * Record a judgement without touching the script.
 *
 * Accepting is deliberately not applying. "This is right" and "do it to my
 * script" are different decisions, and collapsing them would mean you could
 * never agree with a finding while writing the fix yourself.
 */
export async function setFindingState(
  videoId: string,
  findingId: string,
  state: Extract<FindingState, "accepted" | "rejected" | "pending">,
) {
  const { error } = await db
    .from("analysis_findings")
    .update({ state })
    .eq("id", findingId);

  if (error) throw new Error(`Could not record that: ${error.message}`);
  touch(videoId);
}

/* ===================================================================== */
/* APPLYING                                                              */
/* ===================================================================== */

type BeatRow = { id: string; sort_order: number; text: string | null; parked: boolean };

/** Renumber a script from an explicit running order. */
async function reorder(scriptId: string, orderedIds: string[]) {
  const rows = orderedIds.map((id, i) => ({ id, script_id: scriptId, sort_order: i + 1 }));
  if (rows.length > 0) await db.from("script_beats").upsert(rows, { onConflict: "id" });
}

/**
 * Carry out a finding's operation on the real script.
 *
 * Only the mechanical operations are performed here. `change_lens`,
 * `add_visual`, `callback` and `keep` describe decisions no editor can make on
 * your behalf — those are accepted and left as instructions, which is more
 * honest than pretending a button did the work.
 *
 * Nothing is destroyed. A cut line is parked into the idea pile, exactly as the
 * ⌫ control does, because a line pulled out of a script and a line that never
 * existed are different things.
 */
export async function applyFinding(videoId: string, findingId: string, editedText?: string) {
  const { data: finding } = await db
    .from("analysis_findings")
    .select("id, operation, run_id, state")
    .eq("id", findingId)
    .maybeSingle();

  if (!finding) throw new Error("That finding is gone.");

  const operation = finding.operation as AnalysisOperation;
  const script = await loadScript(videoId);
  if (!script.scriptId) throw new Error("No script to change.");

  const { data: allBeats } = await db
    .from("script_beats")
    .select("id, sort_order, text, parked")
    .eq("script_id", script.scriptId)
    .order("sort_order");

  const beats = (allBeats ?? []) as BeatRow[];
  const live = beats.filter((b) => !b.parked);
  const targets = operation.targetSegmentIds.filter((id) => live.some((b) => b.id === id));

  if (targets.length === 0 && MECHANICAL_OPERATIONS.includes(operation.type)) {
    throw new Error("The lines this pointed at are no longer in the script.");
  }

  const newBeat = (text: string) => ({
    id: crypto.randomUUID(),
    script_id: script.scriptId as string,
    text,
    sort_order: 0,
  });

  switch (operation.type) {
    case "cut": {
      await db.from("script_beats").update({ parked: true }).in("id", targets);
      break;
    }

    case "replace":
    case "rewrite": {
      const text = (editedText ?? operation.replacementText ?? "").trim();
      if (!text) throw new Error("Nothing to write.");
      await db.from("script_beats").update({ text }).eq("id", targets[0]);
      // A rewrite that swallowed several lines parks the ones it absorbed.
      if (targets.length > 1) {
        await db.from("script_beats").update({ parked: true }).in("id", targets.slice(1));
      }
      break;
    }

    case "merge": {
      const merged = targets
        .map((id) => live.find((b) => b.id === id)?.text ?? "")
        .filter(Boolean)
        .join(" ")
        .trim();

      await db
        .from("script_beats")
        .update({ text: (editedText ?? operation.replacementText ?? merged).trim() })
        .eq("id", targets[0]);
      await db.from("script_beats").update({ parked: true }).in("id", targets.slice(1));
      break;
    }

    case "split": {
      const pieces = (operation.insertedText ?? []).map((t) => t.trim()).filter(Boolean);
      if (pieces.length < 2) throw new Error("Nothing to split into.");

      await db.from("script_beats").update({ text: pieces[0] }).eq("id", targets[0]);
      const inserted = pieces.slice(1).map(newBeat);
      if (inserted.length > 0) await db.from("script_beats").insert(inserted);

      const order = live.map((b) => b.id);
      order.splice(order.indexOf(targets[0]) + 1, 0, ...inserted.map((b) => b.id));
      await reorder(script.scriptId, order);
      break;
    }

    case "add_beat":
    case "add_hook":
    case "add_rehook": {
      const pieces = (editedText ? [editedText] : operation.insertedText ?? [])
        .map((t) => t.trim())
        .filter(Boolean);
      if (pieces.length === 0) throw new Error("Nothing to add.");

      const inserted = pieces.map(newBeat);
      await db.from("script_beats").insert(inserted);

      const order = live.map((b) => b.id);
      const anchor = targets[0] ? order.indexOf(targets[0]) : -1;
      // add_hook belongs at the top; everything else lands after its anchor.
      const at = operation.type === "add_hook" ? 0 : anchor >= 0 ? anchor + 1 : order.length;
      order.splice(at, 0, ...inserted.map((b) => b.id));
      await reorder(script.scriptId, order);
      break;
    }

    case "move":
    case "reorder": {
      const order = live.map((b) => b.id).filter((id) => !targets.includes(id));
      const destination = operation.destinationSegmentId;
      const at = destination ? order.indexOf(destination) : -1;
      order.splice(at >= 0 ? at + 1 : order.length, 0, ...targets);
      await reorder(script.scriptId, order);
      break;
    }

    // Decisions, not edits. Accepted and left to you.
    case "keep":
    case "add_visual":
    case "change_lens":
    case "callback":
      break;
  }

  await db
    .from("analysis_findings")
    .update({
      state: "applied",
      applied_text: editedText ?? operation.replacementText ?? null,
      edited: Boolean(editedText && editedText !== operation.replacementText),
    })
    .eq("id", findingId);

  touch(videoId);
}
