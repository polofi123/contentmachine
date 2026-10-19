// Mapping an analysed reference video onto the creator's own library.
//
// This file is the contract and the checks; it does no I/O and calls no model,
// so the rules are testable without an API key. The model-facing stages live in
// component-mapping-run.ts.
//
// What the rules guarantee:
//   1. A mapping points at an existing library component (`components.id`).
//      Nothing in this module can create one.
//   2. Every piece of evidence is checked against the saved analysis by code.
//      A transcript quote must be an exact passage of the saved transcript; a
//      visual note is copied from the saved analysis by id, never retyped by
//      the model. Evidence that cannot be located is discarded.
//   3. Evidence must also be RELEVANT: a separate check judges whether each
//      piece directly shows the component or is merely related to it. Only
//      direct evidence can make a mapping "AI-supported".
//   4. Nothing here can make a mapping "Confirmed". That word belongs to a
//      person's review (a separate, append-only record). What the machine
//      decides is `ai_status`: "ai_supported" or "uncertain".

import { locateQuote, segmentScript, type SegmentedScript } from "./segment";
import type { Section, TranscriptOrigin, VideoAnalysis } from "./video-analysis";

/** What the machine's own checks concluded. Never "confirmed": only a person confirms. */
export type AiStatus = "ai_supported" | "uncertain";
export type Directness = "explicit" | "implied";
/** A person's decision on a mapping. No review yet = unreviewed. */
export type ReviewDecision = "confirmed" | "rejected";
export type ReviewBasis = "read_quote" | "watched_video";
/** Whether a piece of evidence itself shows the component, or only relates to it. */
export type Relevance = "direct" | "context";

export const AI_STATUS_LABEL: Record<AiStatus, string> = { ai_supported: "AI-supported", uncertain: "Uncertain" };
export const REVIEW_LABEL: Record<ReviewDecision, string> = { confirmed: "Confirmed", rejected: "Rejected" };
export const RELEVANCE_LABEL: Record<Relevance, string> = { direct: "Directly shows it", context: "Context only" };

export const EVIDENCE_LABEL: Record<MappingEvidence["type"], string> = {
  transcript: "Transcript quote",
  visual_note: "Visual note (AI-described)",
};

type Judged = {
  /** Set by the relevance check. Undefined on mappings made before it existed, or when it was unavailable. */
  relevance?: Relevance;
  /** One sentence from the relevance check. */
  relevanceReason?: string;
};

/** What a piece of evidence is, and how far it can be trusted. */
export type MappingEvidence = Judged &
  (
    /** An exact passage of the saved transcript, verified by code. `startSec`/`endSec` are the caption times it spans. */
    | { type: "transcript"; quote: string; startSec: number | null; endSec: number | null }
    /** An observation of the picture copied from the saved analysis. Written by a model looking at about one frame per second; not verified. */
    | { type: "visual_note"; quote: string; startSec: number | null; endSec: null; field: VisualNote["field"] }
  );

export type ComponentMapping = {
  componentId: string;
  /** The machine's conclusion. A person's review is stored apart and never changes this. */
  aiStatus: AiStatus;
  directness: Directness;
  /** The model's own estimate, 0–1. A self-report; it never decides `aiStatus` alone. */
  confidence: number;
  explanation: string;
  /** Verbatim passage of the component's library definition the match relies on; null when the library gives only a name. */
  definitionExcerpt: string | null;
  /** Why this is not AI-supported, and anything the model said it could not verify. Empty for an AI-supported mapping. */
  uncertainty: string[];
  evidence: MappingEvidence[];
  startSec: number | null;
  endSec: number | null;
  /** Which kind of observation produced it: found in the video, or a check against a whole closed library layer. */
  origin: "observed" | "anchor";
};

/** Layers a reference video cannot show: process notes, prompts, distribution and packaging that lives outside the video. */
export const EXCLUDED_LAYERS = ["lego", "mining", "distribution", "prompt", "model", "thumbnail", "packaging"] as const;

/** Layers about what is SEEN or how it is edited. Spoken words prove nothing about them unless the speaker describes the technique. */
export const VISUAL_LAYERS = ["visual_hook", "visual_layout", "edit"] as const;

/** What goes into a prompt is bounded, so the cost of a run is too (the hourly limit counts runs, not tokens). */
export const MAX_TRANSCRIPT_PROMPT_CHARS = 60_000;
export const MAX_VISUAL_NOTES = 40;
export const MAX_SECTIONS = 30;

/**
 * Text from a video or a caption file is attacker-controllable. Angle brackets are
 * swapped for look-alikes before it goes into a prompt, so it cannot close a data
 * block ("</transcript>") and pass itself off as instructions.
 */
export const untrusted = (s: string) => s.replace(/</g, "‹").replace(/>/g, "›");

/** Below this a quote is a word or two, which shows nothing. */
export const MIN_QUOTE_CHARS = 8;
/** A definition shorter than this is a label, not something a match can be checked against (the library's own rule for a verifiable excerpt). */
export const MIN_DEFINITION_CHARS = 20;
/** A match the model itself rated below this is not kept: it is noise, not a finding. It stays in the run's trace. */
export const MIN_STORE_CONFIDENCE = 0.5;
/** At least one direct transcript quote must be this long before it can support a mapping ("you know" shows nothing). */
export const MIN_CONFIRMING_QUOTE_CHARS = 20;
/** The model's own confidence must reach this before a mapping can be AI-supported. */
export const AI_SUPPORT_MIN_CONFIDENCE = 0.7;

// ------------------------------------------------------------------ source

export type VisualNote = {
  /** "V1", "V2" … stable for one run; the model refers to notes by id. */
  id: string;
  field: "hook" | "composition" | "editing";
  /** The note exactly as saved, including any "00:03" prefix. */
  text: string;
  startSec: number | null;
};

export type MappingSource = {
  title: string;
  /** Spoken lines only (sound cues removed), as the one string quotes are located in. */
  script: SegmentedScript;
  /** Caption times per segment id. Null where the transcript had none. */
  times: Map<string, { start: number | null; end: number | null }>;
  transcriptOrigin: TranscriptOrigin | null;
  hookSpoken: string | null;
  structureSummary: string | null;
  sections: Section[];
  visualNotes: VisualNote[];
};

const NOTE_TIME = /^\s*(\d{1,2}):(\d{2})\b/;

export function visualNotesOf(a: VideoAnalysis): VisualNote[] {
  const raw: [VisualNote["field"], string][] = [
    ...(a.visual.hook ? [["hook", a.visual.hook] as [VisualNote["field"], string]] : []),
    ...a.visual.elements.map((t): [VisualNote["field"], string] => ["composition", t]),
    ...a.visual.editing.map((t): [VisualNote["field"], string] => ["editing", t]),
  ];
  return raw.map(([field, text], i) => {
    const m = text.match(NOTE_TIME);
    return { id: `V${i + 1}`, field, text, startSec: m ? Number(m[1]) * 60 + Number(m[2]) : null };
  });
}

/**
 * Collects what the saved analysis knows about one video.
 *
 * `isCue` marks caption lines that are not speech ("[Music]"). They are
 * dropped here so a quote that runs across one still matches the words around it.
 */
export function buildSource(analysis: VideoAnalysis, title: string, isCue: (text: string) => boolean): MappingSource {
  const t = analysis.transcript;
  const lines = t.segments.filter((s) => s.text.trim() && !isCue(s.text));
  if (lines.length === 0 && t.text && !isCue(t.text)) lines.push({ start: null, end: null, text: t.text });

  const times = new Map<string, { start: number | null; end: number | null }>();
  const beats = lines.map((s, i) => {
    const id = `t${i}`;
    times.set(id, { start: s.start, end: s.end });
    return { id, text: s.text, story_role: null, story_loop: null, story_section: null };
  });
  const script = segmentScript(beats, () => new Map([...times].map(([id, v]) => [id, { startSec: v.start ?? 0, endSec: v.end ?? 0 }])));

  // The earlier analysis's category/type labels are deliberately NOT carried over:
  // an imported analysis uses this library's own names for them ("personal_experience",
  // "heros_journey"), which would hand the observation stage the answer.
  const f = analysis.format;
  return {
    title, script, times, transcriptOrigin: t.origin, hookSpoken: analysis.hook.spoken,
    structureSummary: f.structureSummary, sections: f.sections.slice(0, MAX_SECTIONS), visualNotes: visualNotesOf(analysis).slice(0, MAX_VISUAL_NOTES),
  };
}

const flat = (s: string) => s.replace(/\s+/g, " ").trim();

/** One line per caption, "[M:SS] words", for showing the model the transcript. */
export function transcriptForModel(src: MappingSource): string {
  return src.script.segments
    .map((s) => {
      const at = src.times.get(s.id)?.start;
      return `${at != null ? `[${Math.floor(at / 60)}:${String(Math.floor(at % 60)).padStart(2, "0")}] ` : ""}${s.text}`;
    })
    .map(untrusted)
    .join("\n");
}

/** Finds a quote in the saved transcript and says when it was spoken. Null when it is not there. */
export function locateTranscriptQuote(src: MappingSource, quote: string): Extract<MappingEvidence, { type: "transcript" }> | null {
  // The model sees "[0:02] words"; a quote copied across two lines may carry the stamp with it.
  const plain = quote.replace(/\[\d{1,2}:\d{2}\]\s*/g, " ");
  if (flat(plain).length < MIN_QUOTE_CHARS) return null;
  const at = locateQuote(src.script, plain);
  if (!at) return null;
  const segs = src.script.segments;
  const first = segs.findIndex((s) => at.segmentIds.includes(s.id));
  const last = segs.map((s) => at.segmentIds.includes(s.id)).lastIndexOf(true);
  // Times the database column cannot hold are treated as unknown rather than failing a whole save.
  const sane = (x: number | null | undefined) => (typeof x === "number" && Number.isFinite(x) && x >= 0 && x < 1e6 ? x : null);
  const start = sane(src.times.get(segs[first].id)?.start);
  const end = sane(src.times.get(segs[last].id)?.end) ?? (segs[last + 1] ? sane(src.times.get(segs[last + 1].id)?.start) : null);
  return {
    type: "transcript",
    quote: flat(src.script.content.slice(at.startIndex, at.endIndex)),
    startSec: start,
    endSec: end !== null && start !== null && end >= start ? end : null,
  };
}

/** A visual note, copied from the saved analysis by id. The model's own wording is never stored. */
export function visualEvidence(src: MappingSource, id: string): Extract<MappingEvidence, { type: "visual_note" }> | null {
  const n = src.visualNotes.find((v) => v.id === id);
  return n ? { type: "visual_note", quote: n.text, startSec: n.startSec, endSec: null, field: n.field } : null;
}

// ------------------------------------------------------------------ status

const PLACEHOLDER = new Set(["none", "n/a", "na", "null", "nothing", "no", "-", "not applicable"]);
/** A model's "nothing to report" in words means null, not a caveat. */
export function realNote(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t && !PLACEHOLDER.has(t.toLowerCase().replace(/[.\s]+$/g, "")) ? t.slice(0, 600) : null;
}

/**
 * What the machine concludes about a mapping. Never "confirmed".
 *
 * AI-supported means every automatic check passed: the model says the video
 * states or does it outright (explicit); a transcript quote found word for word
 * in the saved transcript was judged to DIRECTLY show it (not merely relate to
 * it); the library has a definition and the passage relied on was found in it;
 * neither the model's confidence nor its own caveat says otherwise; and the
 * transcript is not one an AI wrote. Picture-only evidence never gets here: it
 * is an AI's description of sampled frames that nobody has checked.
 */
export function decideStatus(m: {
  directness: Directness; confidence: number; evidence: MappingEvidence[]; definitionExcerpt: string | null; modelNote: string | null;
  /** Where the transcript came from. A transcript the model itself wrote cannot prove anything about the video. */
  transcriptOrigin?: TranscriptOrigin | null;
  /** The component's library layer. A component about what is SEEN cannot be AI-supported at all. */
  layerId?: string | null;
}): { aiStatus: AiStatus; uncertainty: string[] } {
  const why: string[] = [];
  if (m.layerId && (VISUAL_LAYERS as readonly string[]).includes(m.layerId)) {
    why.push("This component is about what is seen or how it is edited. Spoken words cannot establish it, and the picture evidence is an AI's unchecked description, so it stays uncertain until a person who has watched the video reviews it.");
  }
  if (m.directness !== "explicit") why.push("The video implies this rather than doing it outright, so the match is an interpretation.");
  const spoken = m.evidence.filter((e) => e.type === "transcript");
  const direct = spoken.filter((e) => e.relevance === "direct");
  if (spoken.length === 0) {
    why.push("Only picture evidence, described by an AI from frames sampled about once per second and not checked against the video.");
  } else if (spoken.some((e) => e.relevance === undefined)) {
    why.push("Whether the quoted words actually show this was not checked.");
  } else if (direct.length === 0) {
    why.push("The quoted words are related to this but do not themselves show it.");
  } else if (!direct.some((e) => e.quote.length >= MIN_CONFIRMING_QUOTE_CHARS)) {
    why.push("The quoted passages are too short to show this on their own.");
  }
  if (m.transcriptOrigin === null) why.push("It is not known where the transcript came from.");
  if (m.transcriptOrigin === "ai" || m.transcriptOrigin === "sections") {
    why.push(m.transcriptOrigin === "ai"
      ? "The transcript was written by an AI from the audio and has not been checked, so a matching quote proves little."
      : "The transcript was assembled from the earlier analysis's own quoted sentences, so a matching quote proves little.");
  }
  if (m.confidence < AI_SUPPORT_MIN_CONFIDENCE) {
    why.push(`The model's own confidence was ${m.confidence.toFixed(2)}, below the ${AI_SUPPORT_MIN_CONFIDENCE} needed.`);
  }
  if (!m.definitionExcerpt) why.push("The library gives this component only a name or a very short note, so there is no definition to check the match against.");
  if (m.modelNote) why.push(`The model flagged: ${m.modelNote}`);
  return { aiStatus: why.length === 0 ? "ai_supported" : "uncertain", uncertainty: why };
}

/**
 * What a person must have done before confirming.
 *
 * Reading the quote is enough when a transcript quote someone can read is the
 * evidence, and the transcript is a real one. Otherwise the claim rests on what
 * a model said it saw (picture notes) or heard (an AI-written transcript), and a
 * click on the AI's own evidence must not become a human-confirmed fact: the
 * reviewer has to have watched the video.
 */
export function minimumReviewBasis(
  evidence: MappingEvidence[], transcriptOrigin: TranscriptOrigin | null, layerId: string | null = null,
): { basis: ReviewBasis; why: string | null } {
  const watch = (why: string) => ({ basis: "watched_video" as const, why });
  // An origin that is not known is not trusted: it fails toward asking for more.
  if (transcriptOrigin === null) return watch("It is not known where the transcript came from.");
  if (!evidence.some((e) => e.type === "transcript")) {
    return watch("The only evidence is an AI's description of the picture.");
  }
  if (transcriptOrigin === "youtube_auto") {
    return watch("The transcript is YouTube's automatic captions (speech recognition), which may have misheard the words you would be reading.");
  }
  if (transcriptOrigin === "ai" || transcriptOrigin === "sections") {
    return watch(transcriptOrigin === "ai" ? "The transcript was written by an AI and was never checked." : "The transcript was assembled from an earlier AI analysis.");
  }
  // A quote you can read only settles the question when it itself shows the component. A line judged
  // context-only, one never judged, one too short to show anything, or spoken words offered for
  // something that is SEEN, leave the claim resting on the picture, which only watching can check.
  if (layerId !== null && (VISUAL_LAYERS as readonly string[]).includes(layerId)) {
    return watch("This component is about what is seen or how it is edited, and spoken words cannot show that.");
  }
  if (!evidence.some((e) => e.type === "transcript" && e.relevance === "direct" && e.quote.length >= MIN_CONFIRMING_QUOTE_CHARS)) {
    return watch("None of the quoted words was judged to directly show this (or the check did not run), so it rests on interpretation.");
  }
  return { basis: "read_quote", why: null };
}

/**
 * The time span a mapping's evidence covers. Spoken evidence sets it when there is
 * any with times (a picture note at 0:00 must not stretch a quote at 0:45 back to
 * the start); picture notes are the fallback.
 */
export function spanOf(evidence: MappingEvidence[]): { startSec: number | null; endSec: number | null } {
  const timed = evidence.filter((e) => e.type === "transcript" && e.startSec !== null);
  const use = timed.length ? timed : evidence;
  const starts = use.map((e) => e.startSec).filter((x): x is number => x !== null);
  const ends = use.map((e) => e.endSec ?? e.startSec).filter((x): x is number => x !== null);
  return { startSec: starts.length ? Math.min(...starts) : null, endSec: ends.length ? Math.max(...ends) : null };
}
