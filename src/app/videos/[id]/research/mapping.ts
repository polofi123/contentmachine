// Mapping a video's saved analysis onto the library: loading, running, saving,
// reading back and human review. Server-side, but deliberately not a "use server"
// file (those may export only async functions) so the pieces can be tested; the
// callable actions are in mapping-actions.ts.
//
// Reads the library from the same `components` table /library renders, the same
// way the script analysis does. Writes the mapping tables through one
// transactional function, and reviews as separate append-only rows: a review
// never edits what the AI produced.

import { db } from "@/lib/db";
import { askJson, STORY_MODEL } from "@/lib/ai";
import {
  buildSource, EXCLUDED_LAYERS, MAX_TRANSCRIPT_PROMPT_CHARS, minimumReviewBasis, transcriptForModel,
  type AiStatus, type ComponentMapping, type MappingEvidence, type ReviewBasis, type ReviewDecision,
} from "@/lib/component-mapping";
import { DEFAULT_SETTINGS, mapVideoToComponents, sourceBlocks, MAX_SOURCE_PROMPT_CHARS, type Ask, type MappingOutput, type RunSettings } from "@/lib/component-mapping-run";
import { buildIndex, excerptIsGrounded, toElement } from "@/lib/library";
import { sanitizeAnalysis, TRANSCRIPT_ORIGINS, type TranscriptOrigin } from "@/lib/video-analysis";
import { isSoundCue } from "@/lib/youtube-captions";

/** An error whose message is safe to show. */
export class MappingError extends Error {}

/**
 * The library as the mapper may see it: live components, without placeholders or
 * layers a video cannot show. Sorted, so the same library always builds the same
 * index however the database happens to return its rows.
 */
export async function loadLibraryIndex() {
  const [{ data: components, error }, { data: layers, error: layersError }] = await Promise.all([
    db.from("components").select("id, source_id, name, body, layer_id, parent_id").is("archived_at", null).eq("is_placeholder", false),
    db.from("layers").select("id, label"),
  ]);
  if (error || layersError) throw new MappingError("Could not read the library.");
  const labels = new Map((layers ?? []).map((l) => [l.id, l.label]));
  const skip = new Set<string>(EXCLUDED_LAYERS);
  const elements = (components ?? [])
    .filter((c) => !skip.has(c.layer_id))
    .sort((a, b) => a.layer_id.localeCompare(b.layer_id) || (a.source_id ?? "").localeCompare(b.source_id ?? "", "en", { numeric: true }) || (a.id < b.id ? -1 : 1))
    .map((c) => toElement(c, labels.get(c.layer_id) ?? "Other"));
  return buildIndex(elements);
}

export type MappingRunResult = {
  runId: string;
  counts: { aiSupported: number; uncertain: number };
  coverage: MappingOutput["coverage"];
};

/**
 * Reads the video's current analysis and the library and runs the stages, without
 * saving anything. Throws MappingError for anything the user can act on. `ask` is
 * the model call; the default is the app's own Claude helper.
 */
export async function computeMapping(videoId: string, ask: Ask = askJson, settings: RunSettings = DEFAULT_SETTINGS) {
  const [{ data: video }, { data: row }] = await Promise.all([
    db.from("videos").select("id, title").eq("id", videoId).maybeSingle(),
    db.from("video_analyses").select("id, analysis").eq("video_id", videoId).eq("is_current", true).maybeSingle(),
  ]);
  if (!video) throw new MappingError("Video not found.");
  if (!row) throw new MappingError("Analyze this video first: there is no saved analysis to map.");

  const analysis = sanitizeAnalysis(row.analysis);
  const src = buildSource(analysis, video.title, isSoundCue);
  if (src.script.segments.length === 0) {
    throw new MappingError("This analysis has no transcript, so there are no quotes to map against. Add or fetch a transcript first.");
  }

  if (transcriptForModel(src).length > MAX_TRANSCRIPT_PROMPT_CHARS) {
    throw new MappingError(`This transcript is too long to map (the limit is about ${MAX_TRANSCRIPT_PROMPT_CHARS.toLocaleString("en-US")} characters). Short-form videos only.`);
  }

  if (sourceBlocks(src).length > MAX_SOURCE_PROMPT_CHARS) {
    throw new MappingError("This video's analysis (transcript, notes and structure together) is too large to map. Short-form videos only.");
  }

  const index = await loadLibraryIndex();
  if (index.elements.length === 0) throw new MappingError("The library is empty.");

  let output: MappingOutput;
  try {
    output = await mapVideoToComponents({ src, index, ask, settings });
  } catch (err) {
    if (err instanceof MappingError) throw err;
    // The AI helper's own messages are written for the user ("Claude declined…",
    // "ANTHROPIC_API_KEY is not set…"). Anything else is an SDK or network error
    // whose text is not passed on.
    const own = err instanceof Error && /^(Claude |ANTHROPIC_API_KEY )/.test(err.message);
    throw new MappingError(own ? (err as Error).message : "The model call failed. Nothing was saved. Try again.");
  }
  return { output, analysisId: row.id, transcriptOrigin: analysis.transcript.origin };
}

/** Maps one video's current analysis and saves it as the current run. Earlier runs, and any reviews on them, are kept. */
export async function runMapping(videoId: string, ask: Ask = askJson, settings: RunSettings = DEFAULT_SETTINGS): Promise<MappingRunResult> {
  const { output, analysisId, transcriptOrigin } = await computeMapping(videoId, ask, settings);

  const rows = output.mappings.map((m, i) => ({
    component_id: m.componentId,
    ai_status: m.aiStatus,
    directness: m.directness,
    confidence: Math.round(m.confidence * 100) / 100,
    explanation: m.explanation,
    definition_excerpt: m.definitionExcerpt,
    uncertainty: m.uncertainty,
    evidence: m.evidence,
    search_text: [...m.evidence.map((e) => e.quote), m.explanation].join("\n"),
    start_sec: m.startSec,
    end_sec: m.endSec,
    origin: m.origin,
    sort_order: i,
  }));

  const { data: runId, error } = await db.rpc("save_component_mapping_run", {
    p_video_id: videoId,
    p_analysis_id: analysisId,
    p_model: STORY_MODEL,
    p_transcript_origin: transcriptOrigin ?? "unknown",
    p_library_total: output.coverage.libraryElements,
    p_library_candidates: output.coverage.candidatesShown,
    p_input_hash: output.snapshot.inputHash,
    p_library_hash: output.snapshot.libraryHash,
    p_prompt_version: output.snapshot.promptVersion,
    p_settings: JSON.parse(JSON.stringify(output.snapshot.settings)),
    p_trace: JSON.parse(JSON.stringify({ coverage: output.coverage, observations: output.trace })),
    p_mappings: JSON.parse(JSON.stringify(rows)),
  });
  if (error?.message.includes("not the current analysis")) {
    throw new MappingError("This video's analysis changed while mapping was running, so the result was not saved. Map again.");
  }
  if (error || typeof runId !== "string") throw new MappingError("The mappings could not be saved. Nothing was changed.");

  return {
    runId,
    counts: {
      aiSupported: output.mappings.filter((m) => m.aiStatus === "ai_supported").length,
      uncertain: output.mappings.filter((m) => m.aiStatus === "uncertain").length,
    },
    coverage: output.coverage,
  };
}

// ------------------------------------------------------------------ reading

export type ReviewEntry = { id: string; decision: ReviewDecision | "cleared"; basis: ReviewBasis | null; note: string | null; at: string; seq: number };

/**
 * What a person decided about the same component, on the same evidence, in an EARLIER run of this video.
 * It is shown, never applied: the current mapping starts unreviewed and counts for nothing until the person
 * confirms it again. `changes` lists what is different now, so the earlier decision is not trusted blindly.
 */
export type PriorReview = {
  decision: ReviewDecision; basis: ReviewBasis | null; note: string | null; at: string; runAt: string;
  changes: string[];
};

export type MappingRow = Omit<ComponentMapping, "componentId"> & {
  id: string;
  /** False when the component has been archived, or its definition no longer contains the passage the match relied on. */
  definitionCurrent: boolean;
  /** The latest human decision; null while unreviewed (or after it was withdrawn). */
  review: { decision: ReviewDecision; basis: ReviewBasis | null; note: string | null; at: string } | null;
  /** Every decision ever made on this mapping, newest first. Never edited. */
  history: ReviewEntry[];
  /** An earlier run's decision on this component and evidence, for information only. Null when there is none. */
  prior: PriorReview | null;
  /** What a person must have done to confirm it. */
  minimumBasis: { basis: ReviewBasis; why: string | null };
  component: { id: string; sourceId: string | null; name: string; layerId: string; layerLabel: string; body: string | null };
};

export type MappingsView = {
  run: { analysisId: string; model: string; transcriptOrigin: TranscriptOrigin | null; mappedAt: string };
  rows: MappingRow[];
  /** True when the video's current analysis is not the one these mappings were made against. */
  stale: boolean;
};

const originOf = (v: unknown): TranscriptOrigin | null => TRANSCRIPT_ORIGINS.find((o) => o === v) ?? null;

const evidenceOf = (v: unknown): MappingEvidence[] =>
  (Array.isArray(v) ? v : []).flatMap((e): MappingEvidence[] => {
    if (!e || typeof e !== "object" || typeof e.quote !== "string") return [];
    const num = (x: unknown) => (typeof x === "number" && Number.isFinite(x) ? x : null);
    const judged = {
      ...(e.relevance === "direct" || e.relevance === "context" ? { relevance: e.relevance as "direct" | "context" } : {}),
      ...(typeof e.relevanceReason === "string" ? { relevanceReason: e.relevanceReason } : {}),
    };
    if (e.type === "transcript") return [{ type: "transcript", quote: e.quote, startSec: num(e.startSec), endSec: num(e.endSec), ...judged }];
    if (e.type === "visual_note") {
      const field = e.field === "hook" || e.field === "editing" ? e.field : "composition";
      return [{ type: "visual_note", quote: e.quote, startSec: num(e.startSec), endSec: null, field, ...judged }];
    }
    return [];
  });

const evidenceKeys = (ev: MappingEvidence[]) => new Set(ev.map((e) => `${e.type}|${e.quote}`));

/**
 * For each current mapping, the most recent earlier decision a person made on the same component with at
 * least one piece of the same evidence (same kind, same quote). Nothing is carried over: this only finds
 * what to show, together with what has changed since.
 */
async function priorReviews(
  videoId: string, currentRunId: string, currentAnalysisId: string,
  rows: { id: unknown; component_id: unknown; evidence: unknown }[],
  components: Map<string, { body: string | null; archived_at: string | null; layer_id: string }>,
): Promise<Map<string, PriorReview>> {
  const out = new Map<string, PriorReview>();
  // The most recent earlier runs only: it bounds the lookups below, and an older run cannot outrank a newer one.
  const { data: runs } = await db.from("component_mapping_runs").select("id, created_at, analysis_id, input_hash, is_current").eq("video_id", videoId).eq("is_current", false).order("created_at", { ascending: false }).limit(20);
  const old = (runs ?? []).filter((r) => !r.is_current && r.id !== currentRunId);
  if (old.length === 0) return out;
  const runById = new Map(old.map((r) => [r.id, r]));
  const componentIds = [...new Set(rows.map((r) => r.component_id as string))];
  const { data: maps } = await db.from("component_mappings").select("id, run_id, component_id, evidence, definition_excerpt").in("run_id", old.map((r) => r.id)).in("component_id", componentIds);
  const oldMaps = (maps ?? []).filter((m) => runById.has(m.run_id));
  if (oldMaps.length === 0) return out;
  const { data: reviews } = await db.from("component_mapping_reviews").select("mapping_id, decision, basis, note, created_at, seq").in("mapping_id", oldMaps.map((m) => m.id)).order("seq", { ascending: false });
  const latest = new Map<string, NonNullable<typeof reviews>[number]>();
  // Latest by insertion order, whatever order the rows came back in.
  for (const rv of [...(reviews ?? [])].sort((a, b) => b.seq - a.seq)) if (!latest.has(rv.mapping_id)) latest.set(rv.mapping_id, rv);
  const { data: curRun } = await db.from("component_mapping_runs").select("input_hash").eq("id", currentRunId).maybeSingle();

  for (const r of rows) {
    const now = evidenceKeys(evidenceOf(r.evidence));
    const c = components.get(r.component_id as string);
    let best: { rv: NonNullable<typeof reviews>[number]; map: (typeof oldMaps)[number]; run: (typeof old)[number]; shared: number; total: number } | null = null;
    for (const m of oldMaps) {
      if (m.component_id !== r.component_id) continue;
      const rv = latest.get(m.id);
      if (!rv) continue;
      const before = evidenceKeys(evidenceOf(m.evidence));
      const shared = [...before].filter((k) => now.has(k)).length;
      if (shared === 0) continue;
      const run = runById.get(m.run_id)!;
      if (!best || run.created_at > best.run.created_at) best = { rv, map: m, run, shared, total: new Set([...before, ...now]).size };
    }
    // The newest earlier run with a decision on this evidence decides. If that decision was withdrawn there is nothing to show:
    // an older confirmation must not resurface after it was later withdrawn on the same evidence.
    if (!best || best.rv.decision === "cleared") continue;
    const changes: string[] = [];
    if (best.run.analysis_id !== currentAnalysisId) changes.push("The video's analysis has changed since then (a newer version was saved).");
    else if (best.run.input_hash && curRun?.input_hash && best.run.input_hash !== curRun.input_hash) changes.push("The transcript, notes, structure or title the AI read are not the same as then.");
    if (c?.archived_at) changes.push("The library component has been archived since then.");
    else if (best.map.definition_excerpt && c && !excerptIsGrounded(toElement({ id: "", source_id: null, name: "", body: c.body, layer_id: c.layer_id, parent_id: null }, ""), best.map.definition_excerpt)) {
      changes.push("The library definition no longer contains the passage this was matched on.");
    }
    if (best.shared < best.total) changes.push(`The evidence is not identical: ${best.shared} of ${best.total} pieces are the same as then.`);
    out.set(r.id as string, {
      decision: best.rv.decision as ReviewDecision, basis: (best.rv.basis as ReviewBasis | null) ?? null, note: best.rv.note,
      at: best.rv.created_at, runAt: best.run.created_at, changes,
    });
  }
  return out;
}

/** The current mappings for a video, with the library definitions they point at and the review history; null when it has never been mapped. */
export async function loadMappings(videoId: string): Promise<MappingsView | null> {
  const [{ data: rows }, { data: current }] = await Promise.all([
    db.from("component_mappings_current").select("*").eq("video_id", videoId).order("sort_order"),
    db.from("video_analyses").select("id").eq("video_id", videoId).eq("is_current", true).maybeSingle(),
  ]);
  if (!rows) return null;
  const first = rows[0];
  if (!first) {
    // A run with no mappings is still a run: say so rather than showing "never mapped".
    const { data: run } = await db.from("component_mapping_runs").select("analysis_id, model, transcript_origin, created_at").eq("video_id", videoId).eq("is_current", true).maybeSingle();
    if (!run) return null;
    return {
      run: { analysisId: run.analysis_id, model: run.model, transcriptOrigin: originOf(run.transcript_origin), mappedAt: run.created_at },
      rows: [], stale: current?.id !== run.analysis_id,
    };
  }

  const ids = [...new Set(rows.map((r) => r.component_id as string))];
  const mappingIds = rows.map((r) => r.id as string);
  const [{ data: components }, { data: layers }, { data: reviews }] = await Promise.all([
    db.from("components").select("id, source_id, name, body, layer_id, parent_id, archived_at").in("id", ids),
    db.from("layers").select("id, label"),
    db.from("component_mapping_reviews").select("id, mapping_id, decision, basis, note, created_at, seq").in("mapping_id", mappingIds).order("seq", { ascending: false }),
  ]);
  const layerLabel = new Map((layers ?? []).map((l) => [l.id, l.label]));
  const byId = new Map((components ?? []).map((c) => [c.id, c]));
  const historyOf = new Map<string, ReviewEntry[]>();
  for (const r of reviews ?? []) {
    const entry: ReviewEntry = {
      id: r.id, decision: r.decision as ReviewEntry["decision"], basis: (r.basis as ReviewBasis | null) ?? null, note: r.note, at: r.created_at, seq: r.seq,
    };
    historyOf.set(r.mapping_id, [...(historyOf.get(r.mapping_id) ?? []), entry]);
  }
  const transcriptOrigin = originOf(first.transcript_origin);
  const priorOf = await priorReviews(videoId, first.run_id as string, first.analysis_id as string, rows, byId);

  return {
    run: { analysisId: first.analysis_id as string, model: first.model as string, transcriptOrigin, mappedAt: first.mapped_at as string },
    stale: current?.id !== first.analysis_id,
    rows: rows.flatMap((r): MappingRow[] => {
      const c = byId.get(r.component_id as string);
      if (!c) return [];
      const excerpt = (r.definition_excerpt as string | null) ?? null;
      const evidence = evidenceOf(r.evidence);
      const history = [...(historyOf.get(r.id as string) ?? [])].sort((a, b) => b.seq - a.seq);
      const latest = history[0];
      const minimumBasis = minimumReviewBasis(evidence, transcriptOrigin, c.layer_id);
      // A "read the quote" confirmation made under earlier rules would not be accepted now.
      const earlier = priorOf.get(r.id as string);
      const prior = earlier && earlier.decision === "confirmed" && earlier.basis === "read_quote" && minimumBasis.basis === "watched_video"
        ? { ...earlier, changes: [...earlier.changes, "Confirming this now needs you to have watched the video (the rules for this kind of evidence are stricter than when you confirmed it)."] }
        : earlier ?? null;
      return [{
        id: r.id as string,
        definitionCurrent: !c.archived_at && (excerpt === null || excerptIsGrounded(toElement(c, ""), excerpt)),
        aiStatus: r.ai_status as AiStatus,
        directness: r.directness === "explicit" ? "explicit" : "implied",
        confidence: Number(r.confidence ?? 0),
        explanation: r.explanation as string,
        definitionExcerpt: excerpt,
        uncertainty: Array.isArray(r.uncertainty) ? (r.uncertainty as unknown[]).filter((u): u is string => typeof u === "string") : [],
        evidence,
        startSec: r.start_sec === null ? null : Number(r.start_sec),
        endSec: r.end_sec === null ? null : Number(r.end_sec),
        origin: r.origin === "anchor" ? "anchor" : "observed",
        review: latest && latest.decision !== "cleared" ? { decision: latest.decision, basis: latest.basis, note: latest.note, at: latest.at } : null,
        history,
        prior,
        minimumBasis,
        component: { id: c.id, sourceId: c.source_id, name: c.name, layerId: c.layer_id, layerLabel: layerLabel.get(c.layer_id) ?? c.layer_id, body: c.body },
      }];
    }),
  };
}

// ------------------------------------------------------------------ review

const MAX_NOTE = 1000;

/**
 * Records a person's decision on a mapping. Appends a row; nothing the AI produced
 * is touched, and an earlier decision is never edited (withdraw it with "cleared").
 *
 * Confirming a mapping whose evidence is only an AI's description of the picture,
 * or whose transcript an AI wrote, requires the reviewer to say they watched the
 * video: a click on the AI's own evidence must not become a human-confirmed claim.
 * This is enforced here, not only in the UI.
 */
export async function reviewMapping(input: {
  videoId: string; mappingId: string; decision: ReviewDecision | "cleared"; note?: string | null; watchedVideo?: boolean;
}): Promise<{ basis: ReviewBasis | null }> {
  const { mappingId, decision, videoId } = input;
  if (decision !== "confirmed" && decision !== "rejected" && decision !== "cleared") throw new MappingError("Unknown decision.");

  // Only a mapping on the video's current run can be reviewed: the page shows nothing else.
  const { data: mapping } = await db.from("component_mappings_current").select("id, evidence, transcript_origin, component_id, analysis_id").eq("id", mappingId).eq("video_id", videoId).maybeSingle();
  if (!mapping) throw new MappingError("That mapping is not on this video's current run (it may have been replaced by a newer one).");

  const note = typeof input.note === "string" ? input.note.trim().slice(0, MAX_NOTE) || null : null;
  let basis: ReviewBasis | null = null;
  if (decision === "confirmed") {
    // A confirmation of evidence from an analysis that has since changed would count for a video it no longer describes.
    const { data: cur } = await db.from("video_analyses").select("id").eq("video_id", videoId).eq("is_current", true).maybeSingle();
    if (cur?.id !== mapping.analysis_id) throw new MappingError("This video's analysis has changed since these mappings were made. Map again before confirming.");
    // The layer decides whether spoken words can show the component at all, and the view has no layer column.
    // If it cannot be read, the visual-layer rule cannot be applied, so the confirmation fails rather than skipping it.
    const { data: comp, error: compError } = await db.from("components").select("layer_id").eq("id", mapping.component_id as string).maybeSingle();
    if (compError || !comp) throw new MappingError("Could not read the library component for this mapping, so it cannot be confirmed right now.");
    const need = minimumReviewBasis(evidenceOf(mapping.evidence), originOf(mapping.transcript_origin), comp.layer_id);
    if (need.basis === "watched_video" && input.watchedVideo !== true) {
      throw new MappingError(`Confirming this needs you to have watched the video. ${need.why ?? ""}`.trim());
    }
    basis = input.watchedVideo === true ? "watched_video" : "read_quote";
  }

  const { error } = await db.from("component_mapping_reviews").insert({ mapping_id: mappingId, decision, basis, note });
  if (error) throw new MappingError("The review could not be saved.");
  return { basis };
}

/** For each component, how many OTHER videos have a human-confirmed mapping to it on their current run. */
export async function otherVideoCounts(componentIds: string[], excludeVideoId: string): Promise<Record<string, number>> {
  if (componentIds.length === 0) return {};
  const { data } = await db.from("component_mappings_current").select("component_id, video_id").in("component_id", componentIds).eq("review_decision", "confirmed").neq("video_id", excludeVideoId);
  const seen = new Map<string, Set<string>>();
  for (const r of data ?? []) {
    const key = r.component_id as string;
    seen.set(key, (seen.get(key) ?? new Set()).add(r.video_id as string));
  }
  return Object.fromEntries([...seen].map(([k, v]) => [k, v.size]));
}

export type SearchHit = {
  videoId: string; videoTitle: string; componentId: string; aiStatus: AiStatus; reviewDecision: ReviewDecision | null;
  startSec: number | null; quote: string | null; explanation: string;
};

/** Mappings across all videos, by component, AI status, human decision and/or words in the quotes and explanations. */
export async function searchMappings(q: { componentId?: string; aiStatus?: AiStatus; reviewDecision?: ReviewDecision; text?: string; limit?: number }): Promise<SearchHit[]> {
  let query = db.from("component_mappings_current").select("video_id, component_id, ai_status, review_decision, start_sec, evidence, explanation");
  if (q.componentId) query = query.eq("component_id", q.componentId);
  if (q.aiStatus) query = query.eq("ai_status", q.aiStatus);
  if (q.reviewDecision) query = query.eq("review_decision", q.reviewDecision);
  if (q.text?.trim()) query = query.ilike("search_text", `%${q.text.trim().replace(/[\\%_]/g, (c) => `\\${c}`)}%`);
  const { data } = await query.order("video_id").order("start_sec").limit(Math.min(q.limit ?? 50, 200));
  const rows = data ?? [];
  const videoIds = [...new Set(rows.map((r) => r.video_id as string))];
  const { data: videos } = videoIds.length ? await db.from("videos").select("id, title").in("id", videoIds) : { data: [] };
  const titles = new Map((videos ?? []).map((v) => [v.id, v.title]));
  return rows.map((r) => ({
    videoId: r.video_id as string,
    videoTitle: titles.get(r.video_id as string) ?? "",
    componentId: r.component_id as string,
    aiStatus: r.ai_status as AiStatus,
    reviewDecision: (r.review_decision as ReviewDecision | null) ?? null,
    startSec: r.start_sec === null ? null : Number(r.start_sec),
    quote: evidenceOf(r.evidence)[0]?.quote ?? null,
    explanation: r.explanation as string,
  }));
}
