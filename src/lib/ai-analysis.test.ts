import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ANALYSIS_SCHEMA, costUsd, estimateCostUsd, mapAiResponse, parseClock, SAMPLING_NOTE } from "./ai-analysis";
import { sanitizeAnalysis } from "./video-analysis";

// Synthetic response in the shape the prompt asks Gemini for. No real video.
const fixture = () => JSON.parse(readFileSync(new URL("./__fixtures__/gemini-response.json", import.meta.url), "utf8"));
const meta = {
  model: "gemini-3.8-flash",
  input: "youtube" as const,
  usage: { inputTokens: 7000, outputTokens: 3000 },
  now: new Date("2026-10-18T12:00:00Z"),
};

describe("parseClock", () => {
  it("parses MM:SS, H:MM:SS and plain seconds", () => {
    expect(parseClock("01:15")).toBe(75);
    expect(parseClock("1:02:03")).toBe(3723);
    expect(parseClock("12.5s")).toBe(12.5);
    expect(parseClock(7)).toBe(7);
  });

  it("rejects nonsense", () => {
    for (const bad of ["", "abc", "1:75", "-3", "1:2:3:4", null, undefined, {}]) expect(parseClock(bad)).toBeNull();
  });
});

describe("mapAiResponse on a well-formed answer", () => {
  const { analysis: a, warnings } = mapAiResponse(fixture(), meta);

  it("maps every area with no warnings", () => {
    expect(warnings).toEqual([]);
    expect(a.topic).toBe("Two-year practice journey");
    expect(a.seed).toBe("Documenting a long skill journey");
    expect(a.hook).toMatchObject({ spoken: "Two years ago I decided to change my routine", category: "personal_experience" });
    expect(a.visual.hook).toMatch(/text overlay/);
    expect(a.format).toMatchObject({ category: "storytelling", type: "heros_journey" });
    expect(a.visual).toMatchObject({ category: "in_world_vlog", type: "vlog_hybrid" });
    expect(a.visual.elements).toHaveLength(2);
    expect(a.visual.editing).toHaveLength(2);
  });

  it("keeps timestamps as seconds, in order", () => {
    expect(a.transcript.segments.map((s) => s.start)).toEqual([0, 3, 6, 10]);
    expect(a.transcript.segments[0].end).toBe(3);
    expect(a.format.sections.map((s) => [s.start, s.end])).toEqual([[0, 3], [10, 13]]);
    expect(a.transcript.text).toContain("TO BE CONTINUED");
  });

  it("records provenance, self-reported confidence and uncertainties", () => {
    expect(a.ai).toMatchObject({
      provider: "gemini",
      model: "gemini-3.8-flash",
      input: "youtube",
      generatedAt: "2026-10-18T12:00:00.000Z",
      confidence: { transcript: "high", visual: "low" },
      uncertainties: ["Background music lyrics could not be made out.", SAMPLING_NOTE],
      usage: { inputTokens: 7000, outputTokens: 3000 },
    });
  });

  it("survives the save path (sanitizeAnalysis) unchanged", () => {
    expect(sanitizeAnalysis(JSON.parse(JSON.stringify(a)))).toEqual(a);
  });
});

describe("mapAiResponse guards against fabrication and bad data", () => {
  it("flags section sentences that are not in the transcript", () => {
    const r = fixture();
    r.storytelling.sections[0].transcript_sentences = ["Something nobody said"];
    expect(mapAiResponse(r, meta).warnings.some((w) => /do not appear in the transcript/.test(w))).toBe(true);
  });

  it("flags a spoken hook that is not in the transcript", () => {
    const r = fixture();
    r.hook.spoken = "A line that was never spoken";
    expect(mapAiResponse(r, meta).warnings.some((w) => /spoken hook/.test(w))).toBe(true);
  });

  it("discards speech-derived fields when the model reports no speech", () => {
    const r = fixture();
    r.has_speech = false;
    const { analysis: a, warnings } = mapAiResponse(r, meta);
    expect(a.transcript.text).toBeNull();
    expect(a.transcript.segments).toEqual([]);
    expect(a.hook.spoken).toBeNull();
    expect(warnings.length).toBeGreaterThanOrEqual(2);
    expect(a.ai?.uncertainties[0]).toMatch(/No speech/);
    // Visual observations do not depend on speech and are kept.
    expect(a.visual.elements.length).toBeGreaterThan(0);
  });

  it("drops invalid, reversed and out-of-order timestamps instead of keeping them", () => {
    const r = fixture();
    r.transcript = [
      { start: "00:05", end: "00:02", text: "reversed end" },
      { start: "99:99", end: null, text: "invalid start" },
      { start: "00:08", text: "fine" },
      { start: "00:04", text: "goes backwards" },
    ];
    const { analysis: a, warnings } = mapAiResponse(r, meta);
    expect(a.transcript.segments).toEqual([
      { start: 5, end: null, text: "reversed end" },
      { start: null, end: null, text: "invalid start" },
      { start: 8, end: null, text: "fine" },
      { start: null, end: null, text: "goes backwards" },
    ]);
    expect(warnings.some((w) => /timestamp/.test(w))).toBe(true);
  });

  it("never invents values for missing fields", () => {
    const empty = { has_speech: true, transcript: [], hook: {}, storytelling: {}, visual: {}, confidence: {}, uncertainties: [] };
    const { analysis: a, warnings } = mapAiResponse(empty, meta);
    expect(a.topic).toBeNull();
    expect(a.hook.spoken).toBeNull();
    expect(a.format.sections).toEqual([]);
    expect(a.visual.elements).toEqual([]);
    expect(a.ai?.confidence).toEqual({});
    expect(warnings).toEqual(["The model returned almost nothing usable for this video."]);
  });

  it("ignores wrong-typed fields and unknown confidence values", () => {
    const r = fixture();
    r.topic = 42;
    r.supporting_evidence = "not a list";
    r.confidence = { transcript: "certain", hook: "high" };
    const { analysis: a } = mapAiResponse(r, meta);
    expect(a.topic).toBeNull();
    expect(a.supportingEvidence).toEqual([]);
    expect(a.ai?.confidence).toEqual({ hook: "high" });
  });

  it("rejects a response that is not an object", () => {
    for (const bad of [null, "text", 5, [1, 2]]) expect(() => mapAiResponse(bad, meta)).toThrow();
  });
});

describe("review hardening", () => {
  it("does not wave through spoken text when there is no transcript to check it against", () => {
    const r = fixture();
    r.transcript = [];
    const { warnings } = mapAiResponse(r, meta);
    expect(warnings.some((w) => /spoken hook was returned without a transcript/.test(w))).toBe(true);
    expect(warnings.some((w) => /section sentence.*without a transcript/.test(w))).toBe(true);
  });

  it("does not treat punctuation-only text as matching everything", () => {
    const r = fixture();
    r.hook.spoken = "...";
    expect(mapAiResponse(r, meta).warnings.some((w) => /does not appear verbatim/.test(w))).toBe(false);
  });

  it("warns when the model does not say whether there is speech", () => {
    const r = fixture();
    delete r.has_speech;
    expect(mapAiResponse(r, meta).warnings.some((w) => /whether the video has speech/.test(w))).toBe(true);
  });

  it("removes timestamps past the video's reported length", () => {
    const r = fixture();
    r.video_duration = "00:40";
    r.transcript = [
      { start: "00:05", text: "inside" },
      { start: "05:00", text: "way past the end" },
    ];
    r.storytelling.sections[1].start = "09:00";
    const { analysis: a, warnings } = mapAiResponse(r, meta);
    expect(a.transcript.segments).toEqual([
      { start: 5, end: null, text: "inside" },
      { start: null, end: null, text: "way past the end" },
    ]);
    expect(a.format.sections[1].start).toBeNull();
    expect(warnings.some((w) => /later than the video/.test(w))).toBe(true);
  });

  it("removes section start times that go backwards", () => {
    const r = fixture();
    r.storytelling.sections[0].start = "00:20";
    r.storytelling.sections[1].start = "00:10";
    const { analysis: a, warnings } = mapAiResponse(r, meta);
    expect(a.format.sections.map((s) => s.start)).toEqual([20, null]);
    expect(warnings.some((w) => /went backwards/.test(w))).toBe(true);
  });

  it("says when it had to cut the model's lists short", () => {
    const r = fixture();
    r.visual.editing = Array.from({ length: 150 }, (_, i) => `cut ${i}`);
    const { analysis: a, warnings } = mapAiResponse(r, meta);
    expect(a.visual.editing).toHaveLength(100);
    expect(warnings.some((w) => /cut to fit.*editing notes/.test(w))).toBe(true);
  });

  it("treats placeholder labels like \"none\" as missing, so they are never saved or used to fill Legos", () => {
    const r = fixture();
    r.hook.category = "none";
    r.hook.template = "N/A";
    r.storytelling.category = "Unknown.";
    r.storytelling.type = "none";
    r.visual.layout_category = "not applicable";
    const { analysis: a } = mapAiResponse(r, meta);
    expect([a.hook.category, a.hook.template, a.format.category, a.format.type, a.visual.category]).toEqual([null, null, null, null, null]);
    expect(a.visual.type).toBe("vlog_hybrid"); // real labels are untouched
  });

  it("always records the one-frame-per-second sampling limit as an uncertainty", () => {
    expect(mapAiResponse(fixture(), meta).analysis.ai?.uncertainties.at(-1)).toBe(SAMPLING_NOTE);
  });

  it("marks the transcript as AI-produced, not pasted", () => {
    expect(mapAiResponse(fixture(), meta).analysis.transcript.origin).toBe("ai");
  });
});

describe("schema and cost", () => {
  it("requires the evidence-bearing fields", () => {
    expect(ANALYSIS_SCHEMA.required).toEqual(expect.arrayContaining(["has_speech", "transcript", "confidence", "uncertainties"]));
  });

  it("computes cost from the tabled rates and refuses to guess unknown models", () => {
    expect(costUsd("gemini-3.8-flash", 1_000_000, 1_000_000)).toBeCloseTo(0.75 + 3.75);
    expect(costUsd("some-future-model", 1000, 1000)).toBeNull();
    expect(costUsd("gemini-3.8-flash", null, 10)).toBeNull();
  });

  it("estimates a 60-second video at a few cents", () => {
    const c = estimateCostUsd("gemini-3.8-flash", 60)!;
    expect(c).toBeGreaterThan(0.005);
    expect(c).toBeLessThan(0.05);
  });
});
