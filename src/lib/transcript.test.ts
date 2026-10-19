import { describe, expect, it, vi } from "vitest";
import {
  ANALYSIS_SCHEMA, analysisPrompt, analysisSchema, formatTranscriptForPrompt, mapAiResponse, promptTranscript,
} from "./ai-analysis";
import {
  decodeEntities, emptyAnalysis, isProtectedTranscript, isVerbatim, looksLikeSubtitles, parseAnalysis, parseSubtitles,
  replaceTranscript, sanitizeAnalysis,
  TRANSCRIPT_ORIGIN_LABELS, TRANSCRIPT_ORIGINS, type VideoAnalysis,
} from "./video-analysis";

// Mirrors what a real caption download produced for a Short (YouTube auto-captions, overlapping cues).
const SAMPLE_SEGMENTS = [
  { start: 0.8, end: 4.68, text: "If you flew out to the darkest, emptiest" },
  { start: 2.88, end: 7.12, text: "part of the universe and brought these" },
  { start: 4.68, end: 9.12, text: "two uncharged mirrors very closely" },
];
const supplied = (origin: "youtube_auto" | "youtube_captions" | "pasted" = "youtube_auto"): VideoAnalysis["transcript"] => ({
  text: SAMPLE_SEGMENTS.map((s) => s.text).join(" "), segments: SAMPLE_SEGMENTS, origin, language: "en",
});
const meta = { model: "gemini-3.5-flash-lite", input: "youtube" as const, usage: { inputTokens: 1, outputTokens: 2 }, now: new Date("2026-10-19T00:00:00Z") };
const answer = (over: Record<string, unknown> = {}) => ({
  has_speech: true,
  hook: { spoken: null, category: null, template: null, why: null, visual: null },
  storytelling: { category: null, type: null, sections: [] },
  visual: { layout_category: null, layout_type: null, composition: [], editing: [] },
  confidence: { transcript: "high", hook: "medium" }, uncertainties: [],
  ...over,
});

describe("decodeEntities", () => {
  it("decodes named, decimal and hex entities, including double-encoded ones", () => {
    expect(decodeEntities("it&#39;s &quot;fine&quot; &amp; &lt;ok&gt; &#x27;")).toBe(`it's "fine" & <ok> '`);
    expect(decodeEntities("Tom &amp;#39;s")).toBe("Tom 's");
  });
  it("leaves unknown or invalid entities alone", () => {
    expect(decodeEntities("&bogus; &#0; &#xD800; &#99999999;")).toBe("&bogus; &#0; &#xD800; &#99999999;");
  });
});

describe("SRT and VTT import", () => {
  const SRT = "1\r\n00:00:00,800 --> 00:00:04,680\r\nIf you flew out to the darkest,\r\nemptiest part\r\n\r\n2\r\n00:00:04,680 --> 00:00:09,120\r\n<i>of the</i> universe &amp; beyond\r\n";
  const VTT = "WEBVTT\n\nNOTE made by a tool\n\n00:00.800 --> 00:04.680 align:start\nIf you flew out\n\n1:02:03.500 --> 1:02:05.000\nlater line\n";

  it("recognises both formats, and not an analysis or JSON", () => {
    expect(looksLikeSubtitles(SRT)).toBe(true);
    expect(looksLikeSubtitles(VTT)).toBe(true);
    expect(looksLikeSubtitles("﻿WEBVTT\n")).toBe(true);
    expect(looksLikeSubtitles('{"topic":"x"}')).toBe(false);
    expect(looksLikeSubtitles("Topic: cats\nTranscript:\n0:00 hello")).toBe(false);
  });

  it("reads SRT with exact times, joining cue lines and stripping markup and entities", () => {
    const { segments, warnings } = parseSubtitles(SRT);
    expect(warnings).toEqual([]);
    expect(segments).toEqual([
      { start: 0.8, end: 4.68, text: "If you flew out to the darkest, emptiest part" },
      { start: 4.68, end: 9.12, text: "of the universe & beyond" },
    ]);
  });

  it("reads VTT, skipping NOTE blocks and cue settings, with and without an hours field", () => {
    expect(parseSubtitles(VTT).segments).toEqual([
      { start: 0.8, end: 4.68, text: "If you flew out" },
      { start: 3723.5, end: 3725, text: "later line" },
    ]);
  });

  it("does not repeat a line that rolling auto-captions carry over from the previous cue", () => {
    const rolling = "WEBVTT\n\n00:00.000 --> 00:02.000\nhello there\n\n00:02.000 --> 00:04.000\nhello there\nhow are you\n\n00:04.000 --> 00:06.000\nhow are you\ntoday\n";
    expect(parseSubtitles(rolling).segments.map((s) => s.text)).toEqual(["hello there", "how are you", "today"]);
  });

  it("goes through parseAnalysis as a transcript-only analysis with its origin recorded", () => {
    const r = parseAnalysis(SRT);
    expect(r.source).toBe("plain_text");
    expect(r.analysis.transcript).toMatchObject({ origin: "subtitles", language: null });
    expect(r.analysis.transcript.segments[0]).toMatchObject({ start: 0.8, end: 4.68 });
    expect(r.analysis.topic).toBeNull();
  });

  it("warns about unreadable blocks and about a file with no cues", () => {
    expect(parseSubtitles("1\n00:00:01,000 --> 00:00:02,000\nok\n\ngarbage block here").warnings[0]).toMatch(/1 block/);
    expect(parseSubtitles("WEBVTT\n\n").warnings).toEqual(["No subtitle cues were found."]);
  });
});

describe("isVerbatim", () => {
  it("matches whole words only, ignoring case and punctuation", () => {
    expect(isVerbatim("Start here!", "so we start here, today")).toBe(true);
    expect(isVerbatim("art", "let us start")).toBe(false);
    expect(isVerbatim("so", "absolutely nothing")).toBe(false);
    expect(isVerbatim("", "anything")).toBe(true);
  });
});

describe("replaceTranscript", () => {
  const ai = { provider: "gemini" as const, model: "m", input: "youtube" as const, generatedAt: "", confidence: { transcript: "high" as const }, uncertainties: [], usage: { inputTokens: null, outputTokens: null } };

  it("does only the swap when no model produced the analysis", () => {
    const current = { ...emptyAnalysis(), hook: { ...emptyAnalysis().hook, spoken: "my own hook" } };
    const { analysis, warnings } = replaceTranscript(current, supplied());
    expect(analysis.hook.spoken).toBe("my own hook");
    expect(warnings).toEqual([]);
  });

  it("keeps quotes that are verbatim in the new transcript and drops the rest, when a model produced the analysis", () => {
    const current = {
      ...emptyAnalysis(), ai,
      hook: { ...emptyAnalysis().hook, spoken: "darkest, emptiest part of the universe" },
      format: { ...emptyAnalysis().format, sections: [{ name: "A", description: null, start: 0, end: 5, sentences: ["two uncharged mirrors very closely", "made up"] }] },
    };
    const { analysis, warnings } = replaceTranscript(current, supplied());
    expect(analysis.hook.spoken).toBe("darkest, emptiest part of the universe");
    expect(analysis.format.sections[0].sentences).toEqual(["two uncharged mirrors very closely"]);
    expect(warnings).toHaveLength(1);
    expect(analysis.ai?.confidence.transcript).toBeUndefined();
  });
});

describe("rolling-caption dedupe keeps deliberate repeats", () => {
  it("drops a carried-over line only when the cues touch", () => {
    const touching = "WEBVTT\n\n00:00.000 --> 00:02.000\nNo.\n\n00:02.000 --> 00:04.000\nNo.\nreally\n";
    expect(parseSubtitles(touching).segments.map((s) => s.text)).toEqual(["No.", "really"]);
    const gap = "WEBVTT\n\n00:00.000 --> 00:01.000\nNo.\n\n00:03.000 --> 00:04.000\nNo.\n";
    expect(parseSubtitles(gap).segments.map((s) => s.text)).toEqual(["No.", "No."]);
  });
});

describe("YouTube auto-caption VTT quirks", () => {
  it("keeps the words of a first cue that has a space-only line after its timing line", () => {
    const vtt = [
      "WEBVTT", "Kind: captions", "Language: en", "",
      "00:00:00.480 --> 00:00:03.270 align:start position:0%", " ", "hi everyone today", "",
      "00:00:03.270 --> 00:00:03.280 align:start position:0%", "hi everyone today", " ", "",
      "00:00:03.280 --> 00:00:05.000", "we are going to talk", "",
    ].join("\n");
    const { segments, warnings } = parseSubtitles(vtt);
    expect(segments[0]).toMatchObject({ start: 0.48, text: "hi everyone today" });
    expect(warnings).toEqual([]);
  });
});

describe("prompt transcript size", () => {
  it("sends a single over-long untimed line cut to the cap instead of sending nothing", () => {
    const out = promptTranscript([{ start: null, end: null, text: "w".repeat(500) }], 100);
    expect(out.text).toBe("w".repeat(100));
    expect(out.truncated).toBe(true);
  });

  it("reports when the transcript was cut", () => {
    const segs = [{ start: 0, end: 1, text: "a".repeat(50) }, { start: 1, end: 2, text: "b".repeat(50) }];
    expect(promptTranscript(segs, 70)).toMatchObject({ truncated: true });
    expect(promptTranscript(segs)).toMatchObject({ truncated: false });
  });
});

describe("transcript origin is stored and protected", () => {
  it("round-trips every origin and the language through sanitizeAnalysis", () => {
    for (const origin of TRANSCRIPT_ORIGINS) {
      const a = { ...emptyAnalysis(), transcript: { text: "hi", segments: [{ start: 1, end: 2, text: "hi" }], origin, language: "en-GB" } };
      expect(sanitizeAnalysis(JSON.parse(JSON.stringify(a))).transcript).toMatchObject({ origin, language: "en-GB" });
      expect(TRANSCRIPT_ORIGIN_LABELS[origin]).toBeTruthy();
    }
  });

  it("falls back to 'manually imported' for an unknown origin and drops a malformed language", () => {
    const t = sanitizeAnalysis({ transcript: { text: "hi", origin: "made-up", language: "en; drop table" } }).transcript;
    expect(t).toMatchObject({ origin: "pasted", language: null });
  });

  it("older saved analyses without a language still load", () => {
    expect(sanitizeAnalysis({ transcript: { text: "hi", segments: [], origin: "ai" } }).transcript).toMatchObject({ origin: "ai", language: null });
  });

  it("protects anything a person, a file or YouTube supplied, but not the model's own transcript", () => {
    expect(isProtectedTranscript({ text: "x", origin: "pasted" })).toBe(true);
    expect(isProtectedTranscript({ text: "x", origin: "subtitles" })).toBe(true);
    expect(isProtectedTranscript({ text: "x", origin: "youtube_auto" })).toBe(true);
    expect(isProtectedTranscript({ text: "x", origin: "sections" })).toBe(true);
    expect(isProtectedTranscript({ text: "x", origin: "ai" })).toBe(false);
    expect(isProtectedTranscript({ text: null, origin: null })).toBe(false);
  });
});

describe("analysis with a supplied transcript", () => {
  it("tells the model not to transcribe and to quote only the supplied text; the default prompt is unchanged", () => {
    expect(analysisPrompt(true)).toMatch(/supplied after these instructions/);
    expect(analysisPrompt(true)).toMatch(/word for word/);
    expect(analysisPrompt(true)).not.toMatch(/write what is actually spoken/);
    expect(analysisPrompt(false)).toMatch(/write what is actually spoken/);
  });

  it("drops transcript from the response schema only when one is supplied", () => {
    expect(analysisSchema(true).properties).not.toHaveProperty("transcript");
    expect(analysisSchema(true).required).not.toContain("transcript");
    expect(analysisSchema(false)).toBe(ANALYSIS_SCHEMA);
    expect(ANALYSIS_SCHEMA.properties).toHaveProperty("transcript");
  });

  it("formats lines with their start times and respects the size cap", () => {
    expect(formatTranscriptForPrompt(SAMPLE_SEGMENTS)).toBe(
      "[0:00] If you flew out to the darkest, emptiest\n[0:02] part of the universe and brought these\n[0:04] two uncharged mirrors very closely",
    );
    expect(formatTranscriptForPrompt([{ start: null, end: null, text: "a".repeat(50) }, { start: null, end: null, text: "b".repeat(50) }], 60)).toBe("a".repeat(50));
  });

  it("keeps the supplied transcript exactly, whatever the model returns", () => {
    const { analysis } = mapAiResponse(answer({ transcript: [{ start: "00:00", text: "completely different words" }] }), { ...meta, transcript: supplied() });
    expect(analysis.transcript).toEqual({ ...supplied(), language: "en" });
    expect(analysis.transcript.origin).toBe("youtube_auto");
  });

  it("treats a supplied transcript as proof of speech even if the model says there was none", () => {
    const { analysis, warnings } = mapAiResponse(answer({ has_speech: false }), { ...meta, transcript: supplied() });
    expect(analysis.transcript.text).toContain("darkest");
    expect(analysis.ai?.uncertainties.join(" ")).not.toMatch(/No speech was detected/);
    expect(warnings.join(" ")).not.toMatch(/no speech/i);
  });

  it("accepts a hook quoted verbatim from the transcript, across caption lines and ignoring case and punctuation", () => {
    const { analysis, warnings } = mapAiResponse(
      answer({ hook: { spoken: "if you flew out to the darkest emptiest part of the universe", category: null, template: null, why: null, visual: null } }),
      { ...meta, transcript: supplied() },
    );
    expect(analysis.hook.spoken).toBe("if you flew out to the darkest emptiest part of the universe");
    expect(warnings).toEqual([]);
  });

  it("removes a paraphrased hook and paraphrased section sentences instead of presenting them as quotes", () => {
    const { analysis, warnings } = mapAiResponse(
      answer({
        hook: { spoken: "Imagine flying to the emptiest place in space", category: null, template: null, why: null, visual: null },
        storytelling: {
          category: null, type: null,
          sections: [{ name: "Setup", start: "00:00", end: "00:05", transcript_sentences: ["two uncharged mirrors very closely", "A totally invented line"] }],
        },
      }),
      { ...meta, transcript: supplied() },
    );
    expect(analysis.hook.spoken).toBeNull();
    expect(analysis.format.sections[0].sentences).toEqual(["two uncharged mirrors very closely"]);
    expect(warnings.join(" ")).toMatch(/not a verbatim quote/);
    expect(warnings.join(" ")).toMatch(/1 section sentence\(s\) were not verbatim/);
  });

  it("without a supplied transcript, quotes are only flagged, as before", () => {
    const { analysis, warnings } = mapAiResponse(
      answer({ transcript: [{ start: "00:00", text: "hello world" }], hook: { spoken: "something else", category: null, template: null, why: null, visual: null } }),
      meta,
    );
    expect(analysis.hook.spoken).toBe("something else");
    expect(analysis.transcript.origin).toBe("ai");
    expect(warnings.join(" ")).toMatch(/does not appear verbatim/);
  });

  it("does not show the model's self-rating of a transcript it did not write, and flags auto-caption limits", () => {
    const auto = mapAiResponse(answer(), { ...meta, transcript: supplied("youtube_auto") }).analysis.ai!;
    expect(auto.confidence.transcript).toBeUndefined();
    expect(auto.confidence.hook).toBe("medium");
    expect(auto.uncertainties[0]).toMatch(/automatic speech recognition/);
    const manual = mapAiResponse(answer(), { ...meta, transcript: supplied("youtube_captions") }).analysis.ai!;
    expect(manual.uncertainties.join(" ")).not.toMatch(/automatic speech recognition/);
  });

  it("is unaffected by an empty or missing supplied transcript", () => {
    const empty = { ...supplied(), text: null, segments: [] };
    const { analysis } = mapAiResponse(answer({ transcript: [{ start: "00:00", text: "from the model" }] }), { ...meta, transcript: empty });
    expect(analysis.transcript).toMatchObject({ origin: "ai", text: "from the model" });
  });
});

describe("chooseTranscript", () => {
  // The module imports the database client; this unit test never touches it.
  vi.mock("./db", () => ({ db: {} }));

  const okCaptions = (kind: "manual" | "auto") => ({
    ok: true as const,
    captions: { language: "en", kind, segments: SAMPLE_SEGMENTS, text: "words", otherLanguages: ["fr", "de"] },
  });
  const analysisWith = (origin: VideoAnalysis["transcript"]["origin"], text: string | null = "saved words"): VideoAnalysis => ({
    ...emptyAnalysis(), transcript: { text, segments: text ? [{ start: null, end: null, text }] : [], origin: text ? origin : null, language: null },
  });

  it("uses captions for a YouTube video with no saved transcript, labelling auto and manual differently", async () => {
    const { chooseTranscript } = await import("./transcript-source");
    const auto = await chooseTranscript({ saved: emptyAnalysis(), youtubeId: "abcdefghijk", fetchCaptions: async () => okCaptions("auto") });
    expect(auto).toMatchObject({ from: "youtube", transcript: { origin: "youtube_auto", language: "en" }, note: "Also available in: fr, de." });
    const manual = await chooseTranscript({ saved: emptyAnalysis(), youtubeId: "abcdefghijk", fetchCaptions: async () => okCaptions("manual") });
    expect(manual.transcript?.origin).toBe("youtube_captions");
  });

  it("never replaces a transcript a person supplied, and does not call YouTube", async () => {
    const { chooseTranscript } = await import("./transcript-source");
    const fetchCaptions = vi.fn();
    const r = await chooseTranscript({ saved: analysisWith("pasted"), youtubeId: "abcdefghijk", fetchCaptions });
    expect(r).toMatchObject({ from: "saved", transcript: { text: "saved words", origin: "pasted" } });
    expect(fetchCaptions).not.toHaveBeenCalled();
  });

  it("replaces a saved transcript only when told to, and always replaces the model's own", async () => {
    const { chooseTranscript } = await import("./transcript-source");
    const fetchCaptions = async () => okCaptions("auto");
    expect((await chooseTranscript({ saved: analysisWith("subtitles"), youtubeId: "abcdefghijk", replaceSaved: true, fetchCaptions })).from).toBe("youtube");
    expect((await chooseTranscript({ saved: analysisWith("ai"), youtubeId: "abcdefghijk", fetchCaptions })).from).toBe("youtube");
  });

  it("returns none, with the reason, when captions fail, and none for a non-YouTube video", async () => {
    const { chooseTranscript } = await import("./transcript-source");
    const failed = await chooseTranscript({
      saved: emptyAnalysis(), youtubeId: "abcdefghijk",
      fetchCaptions: async () => ({ ok: false, reason: "none", message: "This video has no captions available." }),
    });
    expect(failed).toEqual({ from: "none", transcript: null, note: expect.stringMatching(/no captions available.*unverified/) });
    const fetchCaptions = vi.fn();
    expect(await chooseTranscript({ saved: emptyAnalysis(), youtubeId: null, fetchCaptions })).toEqual({ from: "none", transcript: null, note: null });
    expect(fetchCaptions).not.toHaveBeenCalled();
  });
});
