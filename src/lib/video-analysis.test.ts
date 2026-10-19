import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  emptyAnalysis, formatTime, hasVisualEvidence, legoPatch, parseAnalysis, sanitizeAnalysis,
} from "./video-analysis";

// Synthetic fixture shaped like a Sandcastles library response. No real
// creator, caption or capture data.
const fixture = readFileSync(new URL("./__fixtures__/sandcastles-video.json", import.meta.url), "utf8");

describe("Sandcastles-shaped JSON", () => {
  const r = parseAnalysis(fixture);
  const a = r.analysis;

  it("is recognised and parsed without warnings", () => {
    expect(r.source).toBe("sandcastles_export");
    expect(r.warnings).toEqual([]);
  });

  it("keeps all seven timestamped narrative sections in order", () => {
    expect(a.format.sections).toHaveLength(7);
    expect(a.format.sections.map((s) => s.start)).toEqual([0, 3, 6, 10, 13, 17, 21]);
    expect(a.format.sections[0]).toMatchObject({ name: "The Catalyst", end: 3 });
    expect(a.format.sections[6].sentences).toEqual(["TO BE CONTINUED"]);
  });

  it("assembles a 55-word transcript from the sections, and says so", () => {
    expect(a.transcript.origin).toBe("sections");
    expect(a.transcript.text!.split(/\s+/)).toHaveLength(55);
    expect(a.transcript.segments).toHaveLength(7);
    expect(a.transcript.segments[1]).toMatchObject({ start: 3, end: 6 });
  });

  it("maps idea, hook, format and visual fields", () => {
    expect(a.topic).toBe("Multi-year practice journey");
    expect(a.commonBelief).toBe("Success is sudden or lucky.");
    expect(a.supportingEvidence).toHaveLength(2);
    expect(a.hook).toMatchObject({ category: "personal_experience", template: "[Time period] ago I decided to [change]." });
    expect(a.format).toMatchObject({ category: "storytelling", type: "heros_journey" });
    expect(a.visual).toMatchObject({ category: "in_world_vlog", type: "vlog_hybrid", hook: null });
    expect(a.stats).toMatchObject({ views: 1000000, outlierScore: 10.5 });
  });

  it("does not invent visual detail it was not given", () => {
    expect(a.visual.elements).toEqual([]);
    expect(a.visual.editing).toEqual([]);
  });

  it("fills only the Lego fields the import actually supports", () => {
    expect(Object.keys(legoPatch(a)).sort()).toEqual(
      ["lego_angle", "lego_hook", "lego_story_structure", "lego_topic", "lego_visual_format"],
    );
  });
});

describe("transcript handling", () => {
  it("prefers an explicit transcript over section sentences", () => {
    const r = parseAnalysis(JSON.stringify({ transcript: "hello world", narrative_structure: { structure_sections: [{ section_name: "A", transcript_sentences: ["other"] }] } }));
    expect(r.analysis.transcript).toMatchObject({ text: "hello world", origin: "pasted" });
  });

  it("is transcript-only when nothing visual is supplied", () => {
    const a = parseAnalysis(JSON.stringify({ transcript: "just words" })).analysis;
    expect(a.transcript.text).toBe("just words");
    expect(hasVisualEvidence(a)).toBe(false);
  });

  it("keeps timestamps from a timestamped plain-text transcript", () => {
    const a = parseAnalysis("Transcript:\n0:00 first line\n0:04 second line").analysis;
    expect(a.transcript.segments).toEqual([
      { start: 0, end: null, text: "first line" },
      { start: 4, end: null, text: "second line" },
    ]);
  });
});

describe("plain text", () => {
  const text = [
    "Export for LLM", "Topic: Jump rope", "**Hook:** \"Watch this\"", "Hook Category: curiosity",
    "Narrative Sections", "0:00-0:03 The Catalyst — Open with the decision", "\"Two years ago\"",
    "0:03-0:05 The Step: Show the first step", "\"I bought a rope\"",
  ].join("\n");
  const r = parseAnalysis(text);

  it("reads labelled fields and strips markdown and quotes", () => {
    expect(r.source).toBe("sandcastles_export");
    expect(r.analysis.topic).toBe("Jump rope");
    expect(r.analysis.hook).toMatchObject({ spoken: "Watch this", category: "curiosity" });
  });

  it("reads timestamped sections with their sentences", () => {
    expect(r.analysis.format.sections).toEqual([
      { name: "The Catalyst", description: "Open with the decision", sentences: ["Two years ago"], start: 0, end: 3 },
      { name: "The Step", description: "Show the first step", sentences: ["I bought a rope"], start: 3, end: 5 },
    ]);
  });

  it("keeps text it could not place instead of dropping it", () => {
    expect(r.analysis.unparsed).toBe("Export for LLM");
    expect(parseAnalysis("some prose with no labels").analysis.unparsed).toBe("some prose with no labels");
  });
});

describe("robustness", () => {
  it("handles empty input, fenced JSON and malformed JSON", () => {
    expect(parseAnalysis("  ").warnings).toEqual(["Nothing to import."]);
    expect(parseAnalysis("```json\n{\"topic\":\"x\"}\n```").analysis.topic).toBe("x");
    const bad = parseAnalysis("{ not json");
    expect(bad.source).toBe("plain_text");
    expect(bad.analysis.unparsed).toBe("{ not json");
  });

  it("does not choke on prototype-pollution keys", () => {
    parseAnalysis('{"__proto__":{"polluted":1},"topic":"t"}');
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it("finishes quickly on pathological input", () => {
    const t = Date.now();
    parseAnalysis("a".repeat(200_000));
    parseAnalysis(("0:00 -".repeat(20_000)) + "\nTranscript:\n" + "0:00 ".repeat(20_000));
    expect(Date.now() - t).toBeLessThan(2000);
  });
});

describe("sanitizeAnalysis", () => {
  it("round-trips a parsed analysis unchanged, timestamps included", () => {
    const a = parseAnalysis(fixture).analysis;
    expect(sanitizeAnalysis(JSON.parse(JSON.stringify(a)))).toEqual(a);
  });

  it("returns an empty analysis for junk and drops unknown fields", () => {
    expect(sanitizeAnalysis(null)).toEqual(emptyAnalysis());
    expect(sanitizeAnalysis({ evil: "x", topic: 5 })).toEqual({ ...emptyAnalysis(), topic: "5" });
  });

  it("caps oversized lists and strings", () => {
    const s = sanitizeAnalysis({ supportingEvidence: Array(500).fill("x"), summary: "y".repeat(50_000) });
    expect(s.supportingEvidence).toHaveLength(100);
    expect(s.summary).toHaveLength(8000);
  });

  it("derives transcript text from segments so edits keep their timestamps", () => {
    const s = sanitizeAnalysis({ transcript: { segments: [{ start: 2, end: null, text: "edited line" }] } });
    expect(s.transcript.text).toBe("edited line");
    expect(s.transcript.segments[0].start).toBe(2);
  });
});

describe("review regressions", () => {
  it("keeps leading numbers in transcript lines instead of treating them as timestamps", () => {
    const a = parseAnalysis("Transcript:\n10 things I wish I knew\n3 reasons why").analysis;
    expect(a.transcript.segments).toEqual([
      { start: null, end: null, text: "10 things I wish I knew" },
      { start: null, end: null, text: "3 reasons why" },
    ]);
  });

  it("does not leave the transcript on label-like speech", () => {
    const a = parseAnalysis("Transcript:\n0:00 intro\nHook: here is the thing\n0:05 more").analysis;
    expect(a.hook.spoken).toBeNull();
    expect(a.transcript.segments.map((s) => s.text)).toEqual(["intro", "Hook: here is the thing", "more"]);
  });

  it("warns when a JSON array holds several items", () => {
    expect(parseAnalysis('[{"topic":"a"},{"topic":"b"}]').warnings[0]).toMatch(/only the first/);
  });

  it("ignores summary/views/comments nested in unrelated objects", () => {
    const a = parseAnalysis('{"topic":"t","channel":{"summary":"about the channel","views":5,"comments":2}}').analysis;
    expect(a.summary).toBeNull();
    expect(a.stats).toEqual({});
  });

  it("treats blank numeric strings as missing, not zero", () => {
    const a = parseAnalysis('{"view_count":" ","narrative_structure":{"structure_sections":[{"section_name":"A","start_second":""}]}}').analysis;
    expect(a.stats.views).toBeUndefined();
    expect(a.format.sections[0].start).toBeNull();
  });

  it("formats times without rolling over to :60", () => {
    expect(formatTime(59.6)).toBe("1:00");
    expect(formatTime(null)).toBe("");
  });

  it("keeps apostrophes that are not a matching quote pair", () => {
    const a = parseAnalysis("Narrative Sections\n0:00-0:03 A — d\n\"the kids’ room\"").analysis;
    expect(a.format.sections[0].sentences).toEqual(["the kids’ room"]);
  });

  it("survives a very long whitespace-only line quickly", () => {
    const t = Date.now();
    parseAnalysis("Transcript:\n" + " ".repeat(300_000) + "\n0:00 x");
    expect(Date.now() - t).toBeLessThan(500);
  });
});
