// What we ask a video model for, and how its answer becomes a VideoAnalysis.
//
// Pure functions only (no SDK, no I/O) so the validation can be tested without
// an API key. The model's JSON is treated as untrusted input: every field is
// type-checked, timestamps are parsed and sanity-checked, and anything the
// model claims that its own transcript does not support is flagged rather than
// quietly accepted. Nothing is filled in on the model's behalf.

import {
  isVerbatim, CONFIDENCE_KEYS, emptyAnalysis, type AiProvenance, type Confidence, type Section, type TranscriptSegment,
  type VideoAnalysis,
} from "./video-analysis";

// ------------------------------------------------------------------ prompt

const TRANSCRIPT_RULE = `- TRANSCRIPT: write what is actually spoken, as heard, with MM:SS timestamps. Do not paraphrase, summarise, translate or "clean up". If the speech is unclear, write only the part you are confident of and say so in "uncertainties". If nobody speaks, set "has_speech" to false and return an empty transcript array.`;

// Used instead of the rule above when a transcript already exists. The model is
// not asked to transcribe, and every quotation must come from the supplied text.
const SUPPLIED_TRANSCRIPT_RULE = `- TRANSCRIPT: the transcript of this video's speech is supplied after these instructions. It is the only source of spoken words. Do NOT write your own transcript and do not return a "transcript" field. Every quotation you return ("hook.spoken" and each of "transcript_sentences") must be copied word for word from the supplied transcript, never paraphrased, corrected or reworded; you may join consecutive lines. If the opening has no spoken words, "hook.spoken" is null.`;

/** The instructions sent with the video; the variant for a video whose transcript is already known drops the transcription task. */
export const analysisPrompt = (supplied: boolean) => (supplied ? ANALYSIS_PROMPT.replace(TRANSCRIPT_RULE, SUPPLIED_TRANSCRIPT_RULE) : ANALYSIS_PROMPT);

/** Transcript lines as "[M:SS] text", capped so a very long transcript cannot blow up the request. */
export function promptTranscript(segments: TranscriptSegment[], maxChars = 40_000): { text: string; truncated: boolean } {
  const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
  const lines: string[] = [];
  let used = 0;
  let cutLine = false;
  for (const s of segments) {
    const line = `${s.start != null ? `[${clock(s.start)}] ` : ""}${s.text}`;
    if (used + line.length + 1 > maxChars) {
      // A single line longer than the cap (an untimed transcript) is sent cut, not dropped.
      if (lines.length === 0) { lines.push(line.slice(0, maxChars)); cutLine = true; }
      break;
    }
    lines.push(line);
    used += line.length + 1;
  }
  return { text: lines.join("\n"), truncated: cutLine || lines.length < segments.length };
}

export const formatTranscriptForPrompt = (segments: TranscriptSegment[], maxChars?: number) => promptTranscript(segments, maxChars).text;

export const ANALYSIS_PROMPT = `You are analysing ONE short-form video for a creator who studies why videos work.
Describe only what you can actually hear and see in this video.

Hard rules:
${TRANSCRIPT_RULE}
- NEVER invent dialogue, on-screen text, timestamps, people, objects or events. If you cannot tell something, use null (or an empty array) and add a short note to "uncertainties".
- "video_duration" is the video's total length as MM:SS. Timestamps are MM:SS from the start of the video and must lie within that length.
- "hook.spoken" must be the opening line(s) as actually spoken in the first seconds; null if the opening has no speech. "hook.visual" is what the viewer SEES in the first seconds.
- Interpretation fields (topic, idea_seed, angle, common_belief, contrarian_reality, hook.why, storytelling.reasoning) are your reading of the video; keep them grounded in the evidence above and leave them null if the video does not support them.
- Labels (hook.category, hook.template, storytelling.category, storytelling.type, storytelling.variation, visual.layout_category, visual.layout_type) are short lowercase snake_case descriptors you choose (for example "personal_experience", "heros_journey", "in_world_vlog"). They are descriptions, not a fixed list. hook.template is the hook rewritten with [bracketed] replaceable parts.
- Storytelling sections are the ordered narrative beats, each with the exact transcript sentences (copied from your transcript) that belong to it.
- visual.composition and visual.editing list only techniques you can observe (framing, text overlays, cuts, zooms, b-roll, captions, transitions) - one short observation each, with a timestamp prefix when you can ("00:03 text overlay ...").
- Storytelling sections must each have both a start and an end time, covering the video in order.
- "confidence" is your honest self-assessment per area: low, medium or high. Use "high" only when every claim in that area is directly audible or visible. You only see about one frame per second, so fast cuts, brief flashes and small text are easy to miss: say "medium" or "low" for visual when that applies. In "uncertainties" list what you could not verify (unclear words, unreadable text, speaker identity, anything between frames).
- Keep every string concise. Return JSON that matches the schema and nothing else.`;

// ------------------------------------------------------------------ schema

const nullableString = { type: ["string", "null"] } as const;
const stringArray = { type: "array", items: { type: "string" } } as const;
const confidenceEnum = { type: "string", enum: ["low", "medium", "high"] } as const;

/** JSON Schema sent as response_format. Kept deliberately flat and simple. */
export const ANALYSIS_SCHEMA = {
  type: "object",
  properties: {
    summary: nullableString,
    video_duration: { type: ["string", "null"], description: "Total length of the video as MM:SS" },
    has_speech: { type: "boolean" },
    spoken_language: nullableString,
    transcript: {
      type: "array",
      items: {
        type: "object",
        properties: {
          start: { type: "string", description: "MM:SS" },
          end: nullableString,
          text: { type: "string" },
        },
        required: ["start", "text"],
      },
    },
    topic: nullableString,
    idea_seed: nullableString,
    angle: nullableString,
    common_belief: nullableString,
    contrarian_reality: nullableString,
    supporting_evidence: stringArray,
    hook: {
      type: "object",
      properties: {
        spoken: nullableString,
        category: nullableString,
        template: nullableString,
        why: nullableString,
        visual: nullableString,
      },
      required: ["spoken", "category", "template", "why", "visual"],
    },
    storytelling: {
      type: "object",
      properties: {
        category: nullableString,
        type: nullableString,
        variation: nullableString,
        reasoning: nullableString,
        structure_summary: nullableString,
        sections: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              description: nullableString,
              start: { type: "string", description: "MM:SS" },
              end: nullableString,
              transcript_sentences: stringArray,
            },
            required: ["name", "start", "end", "transcript_sentences"],
          },
        },
      },
      required: ["category", "type", "sections"],
    },
    visual: {
      type: "object",
      properties: {
        layout_category: nullableString,
        layout_type: nullableString,
        composition: stringArray,
        editing: stringArray,
      },
      required: ["layout_category", "layout_type", "composition", "editing"],
    },
    confidence: {
      type: "object",
      properties: {
        transcript: confidenceEnum,
        idea: confidenceEnum,
        hook: confidenceEnum,
        storytelling: confidenceEnum,
        visual: confidenceEnum,
      },
      required: [...CONFIDENCE_KEYS],
    },
    uncertainties: stringArray,
  },
  required: ["has_speech", "transcript", "hook", "storytelling", "visual", "confidence", "uncertainties"],
} as const;

/** The schema for a video whose transcript is supplied: the model is not asked for one. */
export const ANALYSIS_SCHEMA_WITH_TRANSCRIPT = (() => {
  const { transcript: _omitted, ...properties } = ANALYSIS_SCHEMA.properties; // eslint-disable-line @typescript-eslint/no-unused-vars
  return { ...ANALYSIS_SCHEMA, properties, required: ANALYSIS_SCHEMA.required.filter((k) => k !== "transcript") };
})();

export const analysisSchema = (supplied: boolean) => (supplied ? ANALYSIS_SCHEMA_WITH_TRANSCRIPT : ANALYSIS_SCHEMA);

// ------------------------------------------------------------------ mapping

const MAX_ITEMS = 300;
export const SAMPLING_NOTE = "The video is sampled about once per second, so cuts, flashes and small on-screen text between frames may be missed.";
const MAX_TRANSCRIPT_LINES = 2000;

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => Boolean(v) && typeof v === "object" && !Array.isArray(v);
const text = (v: unknown, max = 4000): string | null =>
  typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null;
/** Placeholder answers a model gives when a label does not apply. They mean "missing", not a value. */
const PLACEHOLDERS = new Set(["none", "n/a", "na", "null", "unknown", "not applicable", "not available", "no hook", "no speech", "unspecified", "-"]);
const label = (v: unknown, max = 200): string | null => {
  const t = text(v, max);
  return t && !PLACEHOLDERS.has(t.toLowerCase().replace(/[.\s]+$/g, "")) ? t : null;
};
const list = (v: unknown, max = 100): string[] =>
  Array.isArray(v) ? v.map((x) => text(x, 1000)).filter((x): x is string => x !== null).slice(0, max) : [];

/** "MM:SS" or "H:MM:SS" (also tolerates "SS" / "12.5s") → seconds, or null. */
export function parseClock(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v) && v >= 0) return v;
  if (typeof v !== "string") return null;
  const t = v.trim().replace(/s$/i, "");
  const parts = t.split(":");
  if (parts.length < 1 || parts.length > 3 || parts.some((p) => !/^\d+(\.\d+)?$/.test(p))) return null;
  const n = parts.map(Number);
  if (n.length > 1 && n.slice(1).some((x) => x >= 60)) return null;
  return n.reduce((acc, x) => acc * 60 + x, 0);
}

export type MapResult = { analysis: VideoAnalysis; warnings: string[] };

/**
 * Validates the model's JSON and maps it into ContentMachine's analysis shape.
 * Throws only when the response is not an object at all; everything else
 * degrades to empty fields plus a warning.
 */
export function mapAiResponse(
  raw: unknown,
  meta: {
    model: string; input: "youtube" | "upload"; usage: { inputTokens: number | null; outputTokens: number | null }; now?: Date;
    /**
     * A transcript that existed before the model ran (YouTube captions, an
     * import). It is kept exactly as given, and the model's quotations are
     * checked against it and dropped when they are not verbatim.
     */
    transcript?: VideoAnalysis["transcript"] | null;
  },
): MapResult {
  if (!isObj(raw)) throw new Error("The model did not return a JSON object.");
  const warnings: string[] = [];
  const truncated: string[] = [];
  const a = emptyAnalysis();
  const supplied = meta.transcript?.text ? meta.transcript : null;
  /** list() that remembers when it had to drop items, so nothing disappears silently. */
  const capped = (label: string, v: unknown, max = 100) => {
    if (Array.isArray(v) && v.length > max) truncated.push(`${label} (kept the first ${max})`);
    return list(v, max);
  };

  if (!supplied && typeof raw.has_speech !== "boolean") {
    warnings.push("The model did not say whether the video has speech; the transcript is unverified.");
  }
  // A supplied transcript is evidence of speech whatever the model says.
  const hasSpeech = supplied ? true : raw.has_speech !== false;

  // The video's own length bounds every timestamp. It is taken from the model
  // (asked for in the schema) because the app never downloads the video; a
  // timestamp past it cannot be real. With no length reported nothing can be
  // range-checked, only ordered.
  const duration = parseClock(raw.video_duration);
  const limit = duration !== null && duration > 0 ? duration + 2 : Infinity;
  let outOfRange = 0;
  const inRange = (t: number | null) => {
    if (t !== null && t > limit) { outOfRange += 1; return null; }
    return t;
  };

  // Transcript: ordered, timestamped, non-empty lines only.
  const segments: TranscriptSegment[] = [];
  let lastStart = -1;
  let badTimes = 0;
  if (!supplied && hasSpeech && Array.isArray(raw.transcript)) {
    if (raw.transcript.length > MAX_TRANSCRIPT_LINES) truncated.push(`transcript (kept the first ${MAX_TRANSCRIPT_LINES} lines)`);
    for (const item of raw.transcript.slice(0, MAX_TRANSCRIPT_LINES)) {
      if (!isObj(item)) continue;
      const line = text(item.text, 2000);
      if (!line) continue;
      let start = inRange(parseClock(item.start));
      let end = inRange(parseClock(item.end));
      if (start === null || start < lastStart) { badTimes += 1; start = null; end = null; }
      if (start !== null && end !== null && end < start) { end = null; badTimes += 1; }
      if (start !== null) lastStart = start;
      segments.push({ start, end, text: line });
    }
  }
  if (!supplied && !hasSpeech && Array.isArray(raw.transcript) && raw.transcript.length) {
    warnings.push("The model reported no speech but returned transcript lines; they were discarded.");
  }
  if (badTimes) warnings.push(`${badTimes} transcript timestamp(s) were invalid, out of order or past the end of the video and were removed.`);
  if (supplied) {
    // Kept exactly as it was supplied; nothing the model says replaces it.
    a.transcript = { text: supplied.text, segments: supplied.segments, origin: supplied.origin, language: supplied.language ?? null };
  } else if (segments.length) {
    a.transcript = { text: segments.map((s) => s.text).join(" "), segments, origin: "ai", language: null };
  }

  a.summary = text(raw.summary);
  a.topic = text(raw.topic, 500);
  a.seed = text(raw.idea_seed);
  a.angle = text(raw.angle);
  a.commonBelief = text(raw.common_belief);
  a.contrarianReality = text(raw.contrarian_reality);
  a.supportingEvidence = capped("supporting evidence", raw.supporting_evidence);

  const hook = isObj(raw.hook) ? raw.hook : {};
  a.hook = { spoken: text(hook.spoken), category: label(hook.category), template: label(hook.template, 4000), why: text(hook.why) };
  a.visual.hook = text(hook.visual);
  if (!hasSpeech && a.hook.spoken) {
    warnings.push("The model reported no speech, so the spoken hook was discarded.");
    a.hook.spoken = null;
  }
  // A "spoken" hook that is not in the transcript is the classic fabrication.
  // With no transcript there is nothing to check it against, which is itself
  // worth saying: unverifiable is not the same as confirmed.
  if (a.hook.spoken) {
    if (!a.transcript.text) {
      warnings.push("A spoken hook was returned without a transcript, so it cannot be checked against the audio.");
    } else if (!isVerbatim(a.hook.spoken, a.transcript.text)) {
      if (supplied) {
        // Quotations come from the transcript or not at all.
        warnings.push("The spoken hook the model returned is not a verbatim quote from the transcript, so it was removed. Copy it from the transcript tab if you want it.");
        a.hook.spoken = null;
      } else {
        warnings.push("The spoken hook does not appear verbatim in the transcript — check it against the video.");
      }
    }
  }

  const story = isObj(raw.storytelling) ? raw.storytelling : {};
  a.format.category = label(story.category);
  a.format.type = label(story.type);
  a.format.flavor = text(story.variation);
  a.format.reasoning = text(story.reasoning);
  a.format.structureSummary = text(story.structure_summary);

  const sections: Section[] = [];
  let unsupported = 0;
  let unverifiable = 0;
  let outOfOrder = 0;
  let lastSectionStart = -1;
  if (Array.isArray(story.sections)) {
    if (story.sections.length > MAX_ITEMS) truncated.push(`storytelling sections (kept the first ${MAX_ITEMS})`);
    for (const [i, sec] of story.sections.slice(0, MAX_ITEMS).entries()) {
      if (!isObj(sec)) continue;
      let start = inRange(parseClock(sec.start));
      let end = inRange(parseClock(sec.end));
      if (start !== null && start < lastSectionStart) { outOfOrder += 1; start = null; }
      if (start !== null && end !== null && end < start) end = null;
      if (start === null) end = null;
      if (start !== null) lastSectionStart = start;
      let sentences = list(sec.transcript_sentences);
      // Section sentences are supposed to be copied from the transcript.
      const haystack = a.transcript.text;
      const kept: string[] = [];
      for (const s of sentences) {
        if (haystack === null) unverifiable += 1;
        else if (!isVerbatim(s, haystack)) {
          unsupported += 1;
          if (supplied) continue; // not in the transcript, so not a quotation
        }
        kept.push(s);
      }
      sentences = kept;
      sections.push({ name: text(sec.name, 200) ?? `Section ${i + 1}`, description: text(sec.description, 2000), sentences, start, end });
    }
  }
  if (unsupported) {
    warnings.push(
      supplied
        ? `${unsupported} section sentence(s) were not verbatim in the transcript and were removed.`
        : `${unsupported} section sentence(s) do not appear in the transcript — they may be paraphrased or invented.`,
    );
  }
  if (unverifiable) {
    warnings.push(`${unverifiable} section sentence(s) were returned without a transcript, so they cannot be checked against the audio.`);
  }
  if (outOfOrder) warnings.push(`${outOfOrder} section start time(s) went backwards and were removed.`);
  if (outOfRange) warnings.push(`${outOfRange} timestamp(s) were later than the video's length and were removed.`);
  a.format.sections = sections;

  const visual = isObj(raw.visual) ? raw.visual : {};
  a.visual.category = label(visual.layout_category);
  a.visual.type = label(visual.layout_type);
  a.visual.elements = capped("composition notes", visual.composition);
  a.visual.editing = capped("editing notes", visual.editing);

  const conf = isObj(raw.confidence) ? raw.confidence : {};
  const confidence: AiProvenance["confidence"] = {};
  for (const k of CONFIDENCE_KEYS) {
    const c = conf[k];
    if (c === "low" || c === "medium" || c === "high") confidence[k] = c as Confidence;
  }
  const uncertainties = capped("uncertainties", raw.uncertainties, 50);
  if (supplied) {
    // The words are not the model's claim, so its self-rating of them is not shown.
    delete confidence.transcript;
    if (supplied.origin === "youtube_auto") {
      uncertainties.unshift("The transcript is YouTube's automatic speech recognition: names, jargon and punctuation may be wrong.");
    }
  }
  // True of every run, whatever the model says about itself: the video is
  // sampled about once per second, so anything between frames can be missed.
  uncertainties.push(SAMPLING_NOTE);
  if (!hasSpeech) uncertainties.unshift("No speech was detected in this video.");

  a.ai = {
    provider: "gemini",
    model: meta.model,
    input: meta.input,
    generatedAt: (meta.now ?? new Date()).toISOString(),
    confidence,
    uncertainties,
    usage: meta.usage,
  };

  if (truncated.length) warnings.push(`Some of the model's output was cut to fit: ${truncated.join("; ")}.`);

  const filled = a.transcript.text || a.topic || a.hook.spoken || a.format.sections.length || a.visual.elements.length;
  if (!filled) warnings.push("The model returned almost nothing usable for this video.");

  return { analysis: a, warnings };
}

// ------------------------------------------------------------------ cost

/** USD per 1M tokens, from the pricing page (Standard tier, paid, through 2026-12-31). */
const PRICES: Record<string, { input: number; output: number }> = {
  "gemini-3.8-flash": { input: 0.75, output: 3.75 },
  "gemini-3.5-flash-lite": { input: 0.3, output: 2.5 },
  "gemini-3.1-flash-lite": { input: 0.25, output: 1.5 },
  "gemini-3.6-flash": { input: 0.75, output: 3.75 },
  "gemini-2.5-flash": { input: 0.3, output: 2.5 },
};

/** Cost of a finished call, or null for a model whose price is not tabled here. */
export function costUsd(model: string, inputTokens: number | null, outputTokens: number | null): number | null {
  const p = PRICES[model];
  if (!p || inputTokens === null || outputTokens === null) return null;
  return (inputTokens * p.input + outputTokens * p.output) / 1_000_000;
}

/** Rough pre-run estimate for a video of `seconds` at low media resolution. */
export function estimateCostUsd(model: string, seconds: number): number | null {
  const input = Math.round(seconds * 100 + 1500); // ~66 tok/frame @1fps + 32 tok/s audio, plus the prompt
  const output = Math.round(2000 + seconds * 25); // JSON answer plus thinking
  return costUsd(model, input, output);
}
