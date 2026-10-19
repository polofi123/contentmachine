import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  video: { id: "v", title: "A test video" } as { id: string; title: string } | null,
  analysisRow: null as { id: string; analysis: unknown } | null,
  components: [] as { id: string; source_id: string | null; name: string; body: string | null; layer_id: string; parent_id: string | null }[],
  rpc: vi.fn(),
  rpcError: null as { message: string } | null,
  /** The row the current-run view returns for the mapping under review. */
  current: null as { id: string; evidence: unknown; transcript_origin: string | null; analysis_id: string; component_id: string } | null,
  /** The layer of the component the mapping under review points at. */
  componentLayer: null as string | null,
  /** Per-table row lists that override the defaults (the stand-in ignores filters). */
  rows: {} as Record<string, unknown[]>,
  insert: vi.fn(),
  insertError: null as { message: string } | null,
}));

vi.mock("@/lib/db", () => ({
  db: {
    from: (table: string) => {
      const chain: Record<string, unknown> = {};
      const done = (data: unknown) => Promise.resolve({ data, error: null });
      // Every filter returns the chain; reading it (await) or maybeSingle() resolves per table.
      for (const f of ["eq", "is", "in", "neq", "order", "select", "limit"]) chain[f] = () => chain;
      chain.maybeSingle = () => done(table === "videos" ? m.video : table === "video_analyses" ? m.analysisRow : table === "component_mappings_current" ? m.current : table === "components" && m.componentLayer ? { layer_id: m.componentLayer } : null);
      chain.insert = (row: unknown) => Promise.resolve({ data: null, error: (m.insert(table, row), m.insertError) });
      chain.then = (res: (v: unknown) => unknown) =>
        done(m.rows[table] ?? (table === "components" ? m.components : table === "layers" ? [{ id: "spoken_hook", label: "Spoken Hooks" }, { id: "hack", label: "Retention Hacks" }, { id: "lego", label: "Idea Legos" }] : [])).then(res);
      return chain;
    },
    rpc: (...args: unknown[]) => m.rpc(...args),
  },
}));

import type { Ask } from "@/lib/component-mapping-run";
import { emptyAnalysis } from "@/lib/video-analysis";
import { loadLibraryIndex, loadMappings, MappingError, reviewMapping, runMapping } from "./mapping";

const analysis = () => {
  const a = emptyAnalysis();
  a.transcript = { text: "What happens if you jump off your ride", segments: [{ start: 1, end: 3, text: "What happens if you jump off your ride" }], origin: "youtube_auto", language: "en" };
  return a;
};

const asker = (matchId: string): Ask => {
  let n = 0;
  return (async (args: Parameters<Ask>[0]) => {
    n += 1;
    if (n === 1) return { observations: [] };
    if (args.system?.includes("RELEVANCE CHECK")) {
      const ids = [...args.prompt.matchAll(/<item id="([^"]+)">/g)].map((x) => x[1]);
      return { results: ids.map((itemId) => ({ itemId, verdict: "direct", reason: "the words themselves do it" })) };
    }
    const total = args.prompt.match(/OBSERVATION (\d+)/g)?.length ?? 0;
    return {
      results: Array.from({ length: total }, (_, i) => ({
        observationIndex: i, noMatchReason: null,
        matches: i === 0 ? [{ componentId: matchId, directness: "explicit", confidence: 0.9, explanation: "x", definitionExcerpt: "Explore an imagined situation.", quotes: ["What happens if you jump off your ride"], visualNoteIds: [], uncertainty: null }] : [],
      })),
    };
  }) as Ask;
};

beforeEach(() => {
  m.rows = {};
  m.video = { id: "v", title: "A test video" };
  m.analysisRow = { id: "analysis-1", analysis: analysis() };
  m.components = [
    { id: "id-shook-08", source_id: "SHOOK-08", name: "Scenario / Hypothetical", body: "Explore an imagined situation.", layer_id: "spoken_hook", parent_id: null },
    // a layer a video can never show: must not be offered
    { id: "id-lego", source_id: "LEGO-01", name: "Topic", body: "Explore an imagined situation for the topic of the idea.", layer_id: "lego", parent_id: null },
  ];
  m.rpcError = null;
  m.rpc.mockReset().mockImplementation(async () => ({ data: m.rpcError ? null : "run-1", error: m.rpcError }));
});

describe("runMapping", () => {
  it("saves the run against the exact analysis it read, with verified evidence only", async () => {
    const res = await runMapping("v", asker("id-shook-08"));
    expect(res).toMatchObject({ runId: "run-1", counts: { aiSupported: 1, uncertain: 0 } });
    const [fn, args] = m.rpc.mock.calls[0];
    expect(fn).toBe("save_component_mapping_run");
    expect(args).toMatchObject({ p_video_id: "v", p_analysis_id: "analysis-1", p_transcript_origin: "youtube_auto", p_prompt_version: expect.any(String), p_settings: { thinking: "adaptive" } });
    // what the run was made from, so a repeat can be compared like with like
    expect(args.p_input_hash).toMatch(/^[0-9a-f]{16}$/);
    expect(args.p_library_hash).toMatch(/^[0-9a-f]{16}$/);
    expect(args.p_mappings).toHaveLength(1);
    expect(args.p_mappings[0]).toMatchObject({
      component_id: "id-shook-08", ai_status: "ai_supported", definition_excerpt: "Explore an imagined situation.", start_sec: 1, end_sec: 3, sort_order: 0,
      evidence: [{ type: "transcript", quote: "What happens if you jump off your ride", startSec: 1, endSec: 3, relevance: "direct" }],
    });
    expect(args.p_mappings[0].search_text).toContain("What happens if you jump off your ride");
  });

  it("keeps layers a video cannot show out of the library index altogether", async () => {
    const index = await loadLibraryIndex();
    expect(index.elements.map((e) => e.id)).toEqual(["id-shook-08"]);
  });

  it("does not offer components from layers a video cannot show", async () => {
    const res = await runMapping("v", asker("id-lego"));
    // The model cited a Lego, which was never a candidate, so nothing is saved for it.
    expect(res.counts).toEqual({ aiSupported: 0, uncertain: 0 });
    expect(m.rpc.mock.calls[0][1].p_mappings).toEqual([]);
  });

  it("refuses, before any model call, when there is no analysis or no transcript", async () => {
    const ask = vi.fn();
    m.analysisRow = null;
    await expect(runMapping("v", ask as unknown as Ask)).rejects.toThrow(/Analyze this video first/);
    m.analysisRow = { id: "a", analysis: emptyAnalysis() };
    await expect(runMapping("v", ask as unknown as Ask)).rejects.toThrow(/no transcript/);
    m.video = null;
    await expect(runMapping("v", ask as unknown as Ask)).rejects.toThrow(/Video not found/);
    expect(ask).not.toHaveBeenCalled();
    expect(m.rpc).not.toHaveBeenCalled();
  });

  it("shows the user the AI helper's own message but never a raw SDK error", async () => {
    await expect(runMapping("v", (async () => { throw new Error("Claude declined to analyse this script."); }) as Ask)).rejects.toThrow("Claude declined to analyse this script.");
    const raw = (async () => { throw new Error('401 {"error":"invalid x-api-key sk-ant-SECRET"}'); }) as Ask;
    const err = await runMapping("v", raw).catch((e) => e);
    expect(err).toBeInstanceOf(MappingError);
    expect(err.message).not.toMatch(/sk-ant|401/);
  });

  it("reports a failed save as a failure, not a success", async () => {
    m.rpcError = { message: "boom: internal detail" };
    const err = await runMapping("v", asker("id-shook-08")).catch((e) => e);
    expect(err).toBeInstanceOf(MappingError);
    expect(err.message).not.toMatch(/boom/);
  });

  it("refuses a transcript too long to map, before any model call", async () => {
    const ask = vi.fn();
    const a = emptyAnalysis();
    a.transcript = { text: "w", segments: Array.from({ length: 40 }, (_, i) => ({ start: i, end: i + 1, text: "word ".repeat(380) })), origin: "pasted", language: null };
    m.analysisRow = { id: "a", analysis: a };
    await expect(runMapping("v", ask as unknown as Ask)).rejects.toThrow(/too long to map/);
    expect(ask).not.toHaveBeenCalled();
  });

  it("says so when the analysis changed while the model was working, and saves nothing", async () => {
    m.rpcError = { message: "analysis x is not the current analysis of video v" };
    const err = await runMapping("v", asker("id-shook-08")).catch((e) => e);
    expect(err).toBeInstanceOf(MappingError);
    expect(err.message).toMatch(/changed while mapping/);
  });
});

describe("reviewMapping", () => {
  const spoken = [{ type: "transcript", quote: "What happens if you jump off your ride", startSec: 1, endSec: 3, relevance: "direct" }];
  const picture = [{ type: "visual_note", quote: "00:00 Big bold text over gameplay", startSec: 0, endSec: null, field: "hook" }];

  const row = (evidence: unknown, transcript_origin: string | null) => ({ id: "m1", evidence, transcript_origin, analysis_id: "analysis-1", component_id: "c1" });

  beforeEach(() => {
    m.insert.mockReset();
    m.insertError = null;
    m.componentLayer = "spoken_hook";
    m.analysisRow = { id: "analysis-1", analysis: analysis() };
    m.current = row(spoken, "youtube_captions");
  });

  it("appends a confirmation after reading a real transcript quote, recording what the reviewer checked", async () => {
    await expect(reviewMapping({ videoId: "v", mappingId: "m1", decision: "confirmed", note: "  clearly a what-if  " })).resolves.toEqual({ basis: "read_quote" });
    expect(m.insert).toHaveBeenCalledTimes(1);
    expect(m.insert).toHaveBeenCalledWith("component_mapping_reviews", { mapping_id: "m1", decision: "confirmed", basis: "read_quote", note: "clearly a what-if" });
  });

  it("will not confirm a mapping that rests only on AI-described pictures unless the reviewer says they watched the video", async () => {
    m.current = row(picture, "youtube_captions");
    await expect(reviewMapping({ videoId: "v", mappingId: "m1", decision: "confirmed" })).rejects.toThrow(/watched the video/);
    expect(m.insert).not.toHaveBeenCalled();
    await expect(reviewMapping({ videoId: "v", mappingId: "m1", decision: "confirmed", watchedVideo: true })).resolves.toEqual({ basis: "watched_video" });
    expect(m.insert.mock.calls[0][1]).toMatchObject({ decision: "confirmed", basis: "watched_video" });
  });

  it("will not confirm on a transcript an AI wrote without the reviewer having watched the video", async () => {
    m.current = row(spoken, "ai");
    await expect(reviewMapping({ videoId: "v", mappingId: "m1", decision: "confirmed" })).rejects.toThrow(/watched the video/);
    m.current = row(spoken, "sections");
    await expect(reviewMapping({ videoId: "v", mappingId: "m1", decision: "confirmed" })).rejects.toThrow(/watched the video/);
  });

  it("lets anyone reject or withdraw without the extra step, and never writes a basis for those", async () => {
    m.current = row(picture, "ai");
    await reviewMapping({ videoId: "v", mappingId: "m1", decision: "rejected" });
    await reviewMapping({ videoId: "v", mappingId: "m1", decision: "cleared", note: "changed my mind" });
    expect(m.insert.mock.calls.map((c) => c[1])).toEqual([
      { mapping_id: "m1", decision: "rejected", basis: null, note: null },
      { mapping_id: "m1", decision: "cleared", basis: null, note: "changed my mind" },
    ]);
  });

  it("only ever inserts: the AI's mapping row and earlier reviews are never updated", async () => {
    await reviewMapping({ videoId: "v", mappingId: "m1", decision: "confirmed" });
    await reviewMapping({ videoId: "v", mappingId: "m1", decision: "cleared" });
    await reviewMapping({ videoId: "v", mappingId: "m1", decision: "rejected" });
    expect(m.insert).toHaveBeenCalledTimes(3);
    expect(m.rpc).not.toHaveBeenCalled();
  });

  it("refuses a mapping that is not on the current run, an unknown decision, and truncates a long note", async () => {
    m.current = null;
    await expect(reviewMapping({ videoId: "v", mappingId: "gone", decision: "confirmed" })).rejects.toThrow(/not on this video's current run/);
    m.current = row(spoken, "youtube_captions");
    await expect(reviewMapping({ videoId: "v", mappingId: "m1", decision: "approved" as never })).rejects.toThrow(/Unknown decision/);
    await reviewMapping({ videoId: "v", mappingId: "m1", decision: "rejected", note: "x".repeat(5000) });
    expect(m.insert.mock.calls[0][1].note).toHaveLength(1000);
  });

  it("will not let spoken words be confirmed by reading for a component that is about what is seen", async () => {
    m.componentLayer = "visual_hook";
    await expect(reviewMapping({ videoId: "v", mappingId: "m1", decision: "confirmed" })).rejects.toThrow(/spoken words cannot show that/);
    expect(m.insert).not.toHaveBeenCalled();
    await expect(reviewMapping({ videoId: "v", mappingId: "m1", decision: "confirmed", watchedVideo: true })).resolves.toEqual({ basis: "watched_video" });
  });

  it("will not let a quote judged context-only, or never judged, count as something you read", async () => {
    for (const relevance of ["context", undefined]) {
      m.current = row([{ type: "transcript", quote: "What happens if you jump off your ride", startSec: 1, endSec: 3, ...(relevance ? { relevance } : {}) }], "youtube_captions");
      await expect(reviewMapping({ videoId: "v", mappingId: "m1", decision: "confirmed" })).rejects.toThrow(/watched the video/);
    }
    expect(m.insert).not.toHaveBeenCalled();
  });

  it("treats an unknown transcript origin as untrusted", async () => {
    m.current = row(spoken, "unknown");
    await expect(reviewMapping({ videoId: "v", mappingId: "m1", decision: "confirmed" })).rejects.toThrow(/watched the video/);
  });

  it("refuses to confirm evidence from an analysis that has since changed, but still allows rejecting it", async () => {
    m.analysisRow = { id: "analysis-2", analysis: analysis() };
    await expect(reviewMapping({ videoId: "v", mappingId: "m1", decision: "confirmed" })).rejects.toThrow(/analysis has changed/);
    expect(m.insert).not.toHaveBeenCalled();
    await expect(reviewMapping({ videoId: "v", mappingId: "m1", decision: "rejected" })).resolves.toBeDefined();
  });

  it("refuses a mapping that is not on this video's current run", async () => {
    m.current = null; // the lookup is by mapping id AND video id, so a mapping on another video finds nothing
    await expect(reviewMapping({ videoId: "someone-else", mappingId: "m1", decision: "rejected" })).rejects.toThrow(/not on this video's current run/);
  });

  it("hides a database failure behind a plain message", async () => {
    m.insertError = { message: "duplicate key value violates unique constraint secret_detail" };
    const err = await reviewMapping({ videoId: "v", mappingId: "m1", decision: "rejected" }).catch((e) => e);
    expect(err).toBeInstanceOf(MappingError);
    expect(err.message).not.toMatch(/secret_detail|constraint/);
  });
});

describe("earlier reviews are shown, never carried over", () => {
  const QUOTE = "What happens if you jump off your ride";
  const ev = (quote = QUOTE) => [{ type: "transcript", quote, startSec: 1, endSec: 3, relevance: "direct" }];
  const review = (decision: string, seq: number, over: Record<string, unknown> = {}) => ({ id: "rv" + seq, mapping_id: "old1", decision, basis: "read_quote", note: "yes, a what-if", created_at: "2026-10-18T10:00:00Z", seq, ...over });

  beforeEach(() => {
    m.analysisRow = { id: "analysis-1", analysis: emptyAnalysis() };
    m.components = [{ id: "c1", source_id: "SHOOK-08", name: "Scenario / Hypothetical", body: "Explore an imagined situation.", layer_id: "spoken_hook", parent_id: null, archived_at: null } as never];
    m.rows = {
      component_mappings_current: [{
        id: "cur1", run_id: "run-cur", component_id: "c1", analysis_id: "analysis-1", ai_status: "uncertain", directness: "explicit", confidence: 0.8,
        explanation: "x", definition_excerpt: "Explore an imagined situation.", uncertainty: [], evidence: ev(), start_sec: 1, end_sec: 3, origin: "anchor",
        transcript_origin: "youtube_captions", model: "claude", mapped_at: "2026-10-19T10:00:00Z", sort_order: 0,
      }],
      component_mapping_runs: [{ id: "run-old", created_at: "2026-10-18T09:00:00Z", analysis_id: "analysis-1", input_hash: "h", is_current: false }],
      component_mappings: [{ id: "old1", run_id: "run-old", component_id: "c1", evidence: ev(), definition_excerpt: "Explore an imagined situation." }],
      component_mapping_reviews: [review("confirmed", 5)],
    };
  });

  it("shows the earlier decision for the same component and evidence, and does not apply it", async () => {
    const view = await loadMappings("v");
    const row = view!.rows[0];
    expect(row.review).toBeNull();
    expect(row.aiStatus).toBe("uncertain");
    expect(row.prior).toMatchObject({ decision: "confirmed", basis: "read_quote", note: "yes, a what-if", runAt: "2026-10-18T09:00:00Z", changes: [] });
  });

  it("lists what changed: the analysis, a library definition that no longer holds the passage, an archived component, partly different evidence", async () => {
    m.rows.component_mapping_runs = [{ id: "run-old", created_at: "2026-10-18T09:00:00Z", analysis_id: "analysis-0", input_hash: "h", is_current: false }];
    m.components = [{ id: "c1", source_id: "SHOOK-08", name: "Scenario / Hypothetical", body: "Imagine a different situation entirely.", layer_id: "spoken_hook", parent_id: null, archived_at: "2026-10-19T00:00:00Z" } as never];
    m.rows.component_mappings = [{ id: "old1", run_id: "run-old", component_id: "c1", evidence: [...ev(), ...ev("Tommy keeps jumping off his motorcycle")], definition_excerpt: "Explore an imagined situation." }];
    const changes = (await loadMappings("v"))!.rows[0].prior!.changes.join(" | ");
    expect(changes).toMatch(/analysis has changed/);
    expect(changes).toMatch(/archived/);
    expect(changes).not.toMatch(/no longer contains/); // archived is reported instead
    expect(changes).toMatch(/not identical: 1 of 2/);

    m.components = [{ id: "c1", source_id: "SHOOK-08", name: "Scenario / Hypothetical", body: "Imagine a different situation entirely.", layer_id: "spoken_hook", parent_id: null, archived_at: null } as never];
    expect((await loadMappings("v"))!.rows[0].prior!.changes.join(" | ")).toMatch(/no longer contains the passage/);
  });

  it("shows nothing when the evidence is different, when the earlier decision was withdrawn, or when there was none", async () => {
    m.rows.component_mappings = [{ id: "old1", run_id: "run-old", component_id: "c1", evidence: ev("Tommy keeps jumping off his motorcycle"), definition_excerpt: null }];
    expect((await loadMappings("v"))!.rows[0].prior).toBeNull();

    m.rows.component_mappings = [{ id: "old1", run_id: "run-old", component_id: "c1", evidence: ev(), definition_excerpt: null }];
    m.rows.component_mapping_reviews = [review("cleared", 6), review("confirmed", 5)]; // newest first, as the database returns them
    expect((await loadMappings("v"))!.rows[0].prior).toBeNull();

    m.rows.component_mapping_reviews = [];
    expect((await loadMappings("v"))!.rows[0].prior).toBeNull();
  });

  it("shows a rejection too, and uses the latest decision on the earlier mapping", async () => {
    m.rows.component_mapping_reviews = [review("rejected", 7, { note: null }), review("confirmed", 5)];
    expect((await loadMappings("v"))!.rows[0].prior).toMatchObject({ decision: "rejected", note: null });
  });

  it("does not look at the current run's own mappings as 'earlier'", async () => {
    m.rows.component_mapping_runs = [{ id: "run-cur", created_at: "2026-10-19T09:00:00Z", analysis_id: "analysis-1", input_hash: "h", is_current: true }];
    expect((await loadMappings("v"))!.rows[0].prior).toBeNull();
  });
});

describe("reviewMapping fails closed", () => {
  it("will not confirm when the component's layer cannot be read, but still allows rejecting", async () => {
    m.insert.mockReset();
    m.insertError = null;
    m.analysisRow = { id: "analysis-1", analysis: emptyAnalysis() };
    m.componentLayer = null; // the lookup finds nothing
    m.current = { id: "m1", evidence: [{ type: "transcript", quote: "What happens if you jump off your ride", startSec: 1, endSec: 3, relevance: "direct" }], transcript_origin: "youtube_captions", analysis_id: "analysis-1", component_id: "c1" };
    await expect(reviewMapping({ videoId: "v", mappingId: "m1", decision: "confirmed" })).rejects.toThrow(/Could not read the library component/);
    await expect(reviewMapping({ videoId: "v", mappingId: "m1", decision: "confirmed", watchedVideo: true })).rejects.toThrow(/Could not read the library component/);
    expect(m.insert).not.toHaveBeenCalled();
    await expect(reviewMapping({ videoId: "v", mappingId: "m1", decision: "rejected" })).resolves.toBeDefined();
  });
});

describe("earlier reviews: which decision counts as the earlier one", () => {
  const QUOTE = "What happens if you jump off your ride";
  const ev = [{ type: "transcript", quote: QUOTE, startSec: 1, endSec: 3, relevance: "direct" }];
  const run = (id: string, at: string, over: Record<string, unknown> = {}) => ({ id, created_at: at, analysis_id: "analysis-1", input_hash: "h", is_current: false, ...over });
  const map = (id: string, runId: string, componentId = "c1") => ({ id, run_id: runId, component_id: componentId, evidence: ev, definition_excerpt: null });
  const rv = (mappingId: string, decision: string, seq: number, over: Record<string, unknown> = {}) => ({ id: "r" + seq, mapping_id: mappingId, decision, basis: "read_quote", note: null, created_at: "2026-10-18T10:00:00Z", seq, ...over });

  beforeEach(() => {
    m.analysisRow = { id: "analysis-1", analysis: emptyAnalysis() };
    m.components = [{ id: "c1", source_id: "SHOOK-08", name: "Scenario / Hypothetical", body: "Explore an imagined situation.", layer_id: "spoken_hook", parent_id: null, archived_at: null } as never];
    m.rows = {
      component_mappings_current: [{
        id: "cur1", run_id: "run-cur", component_id: "c1", analysis_id: "analysis-1", ai_status: "uncertain", directness: "explicit", confidence: 0.8, explanation: "x",
        definition_excerpt: null, uncertainty: [], evidence: ev, start_sec: 1, end_sec: 3, origin: "anchor", transcript_origin: "youtube_captions", model: "claude",
        mapped_at: "2026-10-19T10:00:00Z", sort_order: 0,
      }],
      component_mapping_runs: [run("run-a", "2026-10-16T09:00:00Z"), run("run-b", "2026-10-17T09:00:00Z")],
      component_mappings: [map("a1", "run-a"), map("b1", "run-b")],
      component_mapping_reviews: [],
    };
  });

  it("does not let an older confirmation resurface after the newer run's decision on the same evidence was withdrawn", async () => {
    m.rows.component_mapping_reviews = [rv("a1", "confirmed", 1), rv("b1", "confirmed", 2), rv("b1", "cleared", 3)];
    expect((await loadMappings("v"))!.rows[0].prior).toBeNull();
  });

  it("uses the newest earlier run that has a decision, whatever order the rows arrive in", async () => {
    m.rows.component_mapping_reviews = [rv("a1", "confirmed", 1), rv("b1", "rejected", 2)]; // oldest first
    expect((await loadMappings("v"))!.rows[0].prior).toMatchObject({ decision: "rejected", runAt: "2026-10-17T09:00:00Z" });
    m.rows.component_mapping_reviews = [rv("b1", "confirmed", 4), rv("b1", "rejected", 9), rv("b1", "confirmed", 2)]; // shuffled: seq 9 is latest
    expect((await loadMappings("v"))!.rows[0].prior).toMatchObject({ decision: "rejected" });
  });

  it("falls back to an older run when the newer one was never reviewed", async () => {
    m.rows.component_mapping_reviews = [rv("a1", "confirmed", 1)];
    expect((await loadMappings("v"))!.rows[0].prior).toMatchObject({ decision: "confirmed", runAt: "2026-10-16T09:00:00Z" });
  });

  it("ignores decisions on other components", async () => {
    m.rows.component_mappings = [map("a1", "run-a", "c-other"), map("b1", "run-b", "c-other")];
    m.rows.component_mapping_reviews = [rv("a1", "confirmed", 1), rv("b1", "confirmed", 2)];
    expect((await loadMappings("v"))!.rows[0].prior).toBeNull();
  });

  it("never treats the displayed run itself as earlier, even if the run list briefly contains it", async () => {
    m.rows.component_mapping_runs = [run("run-cur", "2026-10-19T09:00:00Z")]; // is_current false: a race between two reads
    m.rows.component_mappings = [map("cur1", "run-cur")];
    m.rows.component_mapping_reviews = [rv("cur1", "confirmed", 1)];
    expect((await loadMappings("v"))!.rows[0].prior).toBeNull();
  });

  it("says so when a read-the-quote confirmation would not be accepted under today's stricter rules", async () => {
    m.rows.component_mapping_reviews = [rv("a1", "confirmed", 1)];
    expect((await loadMappings("v"))!.rows[0].prior!.changes.join(" ")).not.toMatch(/stricter/);
    (m.rows.component_mappings_current![0] as { transcript_origin: string }).transcript_origin = "youtube_auto";
    const view = await loadMappings("v");
    expect(view!.rows[0].minimumBasis.basis).toBe("watched_video");
    expect(view!.rows[0].prior!.changes.join(" ")).toMatch(/now needs you to have watched the video/);
  });
});
