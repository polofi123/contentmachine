"use server";

import { db } from "@/lib/db";
import { askJson } from "@/lib/ai";
import {
  AREA_LABEL,
  readStory,
  scriptForAnalysis,
  type StoryArea,
  type StoryBeat,
} from "@/lib/story";
import { loadScript, running } from "../data";
import type { SuggestionKind } from "../story-vocab";

// The AI pass.
//
// It runs against the script that already exists — it never starts one, never
// fills a box, and never returns a rewritten line unless a suggestion was asked
// for by name. The order is diagnose, then suggest, then the creator decides;
// collapsing those into "here is your improved script" would make this a
// generator with a framework painted on it.
//
// Note what gets sent: the same beats the panel reads, numbered, with the same
// structure inline, plus the deterministic observations from lib/story.ts. The
// model is told what the tool already knows so it spends its attention on what
// the tool cannot compute — whether the thing actually means anything — rather
// than recounting sentence lengths.

const AREAS: StoryArea[] = [
  "direction",
  "lens",
  "tension",
  "dance",
  "loops",
  "rhythm",
  "specificity",
  "value",
  "meaning",
];

/**
 * A call, not an observation.
 *
 * `verdict` is the part that was missing: a read-back that will not say whether
 * something is working is a summary, and a summary of a script you just wrote
 * tells you nothing you did not know. `fix` is the other half — an opinion with
 * no replacement line puts the work back on you, which is the opposite of help.
 */
export type Verdict = "works" | "weak" | "broken";

export type AiObservation = {
  area: StoryArea;
  verdict: Verdict;
  text: string;
  /** The actual replacement line, in their voice. Null when it already works. */
  fix: string | null;
  /** 1-based line numbers, as the model sees them. */
  lines: number[];
};

export type AnalysisResult = {
  observations: AiObservation[];
  /** Beat ids, resolved from line numbers so the panel can point at rows. */
  beatIdsByIndex: string[];
};

const VERDICTS: Verdict[] = ["works", "weak", "broken"];

const OBSERVATION_SCHEMA = {
  type: "object",
  properties: {
    observations: {
      type: "array",
      items: {
        type: "object",
        properties: {
          area: { type: "string", enum: AREAS },
          verdict: { type: "string", enum: VERDICTS },
          text: { type: "string" },
          // Required in the schema so the model must decide, but nullable so
          // "this works" does not get a pointless rewrite attached to it.
          fix: { type: ["string", "null"] },
          lines: { type: "array", items: { type: "integer" } },
        },
        required: ["area", "verdict", "text", "fix", "lines"],
        additionalProperties: false,
      },
    },
  },
  required: ["observations"],
  additionalProperties: false,
} as const;

/**
 * Read the story back, with judgement.
 *
 * The deterministic pass in lib/story.ts can count lines, measure gaps and spot
 * a run of same-length sentences. It cannot tell whether the destination is
 * actually reached, whether a twist is earned or arbitrary, or whether the
 * ending means anything. That gap is this function's entire remit, and the
 * prompt says so explicitly so the two passes do not produce the same list
 * twice in different words.
 */
export async function analyzeStory(videoId: string): Promise<AnalysisResult> {
  const [{ data: video }, script, { data: questions }, { data: direction }, { data: lenses }] =
    await Promise.all([
      db.from("videos").select("title, lego_topic, lego_angle").eq("id", videoId).maybeSingle(),
      loadScript(videoId),
      db
        .from("story_questions")
        .select("id, text, opened_beat_id, answered_beat_id")
        .eq("video_id", videoId),
      db
        .from("story_direction")
        .select("starting_belief, destination, final_thought, meaning, tense")
        .eq("video_id", videoId)
        .maybeSingle(),
      db.from("story_lenses").select("text, tier, is_selected").eq("video_id", videoId),
    ]);

  const beats: StoryBeat[] = running(script.beats).map((b) => ({
    id: b.id,
    text: b.text,
    t_start_sec: b.t_start_sec,
    story_role: b.story_role,
    dance_relation: b.dance_relation,
    story_loop: b.story_loop,
    story_section: b.story_section,
  }));

  const withText = beats.filter((b) => (b.text ?? "").trim());
  if (withText.length < 3) {
    throw new Error("Not enough script to read yet — write a few lines first.");
  }

  const selected = (lenses ?? []).find((l) => l.is_selected);

  const known = readStory({
    beats,
    questions: questions ?? [],
    direction: direction ?? null,
    lensSelected: selected?.text ?? null,
    lensCount: (lenses ?? []).length,
    targetSec: script.durationTargetSec,
  });

  const prompt = [
    `TOPIC: ${video?.lego_topic || video?.title || "(not set)"}`,
    video?.lego_angle ? `PREMISE: ${video.lego_angle}` : null,
    "",
    section("DIRECTION", [
      direction?.starting_belief && `Starting belief: ${direction.starting_belief}`,
      direction?.destination && `Destination: ${direction.destination}`,
      direction?.final_thought && `Final thought: ${direction.final_thought}`,
      direction?.meaning && `Meaning: ${direction.meaning}`,
      direction?.tense && `Tense: ${direction.tense}`,
    ]),
    section(
      "LENS",
      selected ? [`Chosen: ${selected.text}`] : (lenses ?? []).map((l) => `Candidate: ${l.text}`),
    ),
    section(
      "OPEN QUESTIONS",
      (questions ?? []).map(
        (q) => `${q.text}${q.answered_beat_id ? "" : "  (never answered on screen)"}`,
      ),
    ),
    "",
    "SCRIPT",
    scriptForAnalysis(beats),
    "",
    section(
      "ALREADY MEASURED — do not repeat these",
      known.map((o) => `${AREA_LABEL[o.area]}: ${o.text}`),
    ),
    "",
    `Edit this script. For each call, give a verdict and — unless it already
works — write the replacement line.

Areas:
direction   — is where this is going clear, and does the script get there
lens        — is the angle the obvious one, or a specific one
tension     — does the viewer always know what is happening and why it matters,
              while still having something unresolved
dance       — do beats connect by consequence or conflict, or just accumulate
loops       — do the attention cycles build, release, and rebuild
rhythm      — sentence variation
specificity — abstractions that could be shown instead of described
value       — what the viewer is receiving, and when
meaning     — does the ending say why any of it mattered

verdict:
  broken — this actively costs viewers. Say what breaks and fix it.
  weak   — this works but is leaving a lot on the table. Fix it.
  works  — this is doing its job. One sentence on why, fix = null.

fix: EXACTLY ONE spoken line, written the way THEY talk, ready to drop straight
into the script in place of the first line you cite. The line itself, nothing
else — no line numbers, no "1.", no "(cut)", no alternatives, no commentary, no
second line. If your point is that a line should be deleted or moved, say that
in \`text\` and set fix to null. If a beat needs splitting into three, put the
best single replacement in fix and explain the split in \`text\`. Only use null
when the verdict is "works" or when there is no single line to write.

The measured list above was computed mechanically — do not repeat it. Your job
is what a count cannot see: whether the hook earns the watch, whether the twist
is set up, whether the payoff answers the question that was asked, and whether
the ending means anything.

Lead with the biggest problem. Cite line numbers in \`lines\`; use an empty
array only for calls about the whole script. At most 6 calls.`,
  ]
    .filter((part) => part !== null)
    .join("\n");

  const result = await askJson<{ observations: AiObservation[] }>({
    prompt,
    schema: OBSERVATION_SCHEMA,
    maxTokens: 6000,
  });

  return {
    observations: (result.observations ?? [])
      .filter((o) => AREAS.includes(o.area) && VERDICTS.includes(o.verdict))
      .map((o) => ({
        ...o,
        // A "works" call carrying a rewrite is a contradiction; drop the
        // rewrite rather than offer a button that replaces a line the model
        // just praised.
        fix: o.verdict === "works" ? null : cleanFix(o.fix),
      })),
    beatIdsByIndex: withText.map((b) => b.id),
  };
}

/* ===================================================================== */
/* DRAFTING — write the lines that aren't there yet                      */
/* ===================================================================== */

export type LineDraft = {
  /** The beat this fills. */
  beatId: string;
  text: string;
};

const DRAFT_SCHEMA = {
  type: "object",
  properties: {
    drafts: {
      type: "array",
      items: {
        type: "object",
        properties: {
          line: { type: "integer" },
          text: { type: "string" },
        },
        required: ["line", "text"],
        additionalProperties: false,
      },
    },
  },
  required: ["drafts"],
  additionalProperties: false,
} as const;

/**
 * Fill in the empty lines.
 *
 * The skeleton already says what each blank line is FOR — a stakes line, a
 * re-hook, a payoff — and the written lines around it say how this person
 * talks. That is enough to draft the gaps, which is the difference between a
 * tool that grades you and one that helps you finish.
 *
 * Nothing here writes to the database. Drafts come back attached to their beat
 * and land in the outliner as ghost text you accept one line at a time, so the
 * script only ever changes because you said so.
 */
export async function draftLines(videoId: string): Promise<LineDraft[]> {
  const [{ data: video }, script, { data: direction }, { data: lenses }] = await Promise.all([
    db.from("videos").select("title, lego_topic, lego_angle").eq("id", videoId).maybeSingle(),
    loadScript(videoId),
    db
      .from("story_direction")
      .select("starting_belief, destination, final_thought, meaning, tense")
      .eq("video_id", videoId)
      .maybeSingle(),
    db.from("story_lenses").select("text, is_selected").eq("video_id", videoId),
  ]);

  const beats = running(script.beats);
  const empty = beats.filter((b) => !(b.text ?? "").trim());

  if (empty.length === 0) {
    throw new Error("No empty lines to fill — every line already says something.");
  }
  if (beats.filter((b) => (b.text ?? "").trim()).length === 0) {
    throw new Error("Write at least one line first, so it has your voice to copy.");
  }

  // Numbered across ALL beats, blanks included, so the model can address a gap
  // by position and its answer maps straight back to a row.
  const numbered = beats
    .map((b, i) => {
      const role = b.story_role ? `[${b.story_role}]` : "[no role]";
      const text = (b.text ?? "").trim();
      return `${i + 1}. ${role} ${text || "<<< EMPTY — write this one >>>"}`;
    })
    .join("\n");

  const selected = (lenses ?? []).find((l) => l.is_selected);

  const prompt = [
    `TOPIC: ${video?.lego_topic || video?.title || "(not set)"}`,
    video?.lego_angle ? `PREMISE: ${video.lego_angle}` : null,
    direction?.destination ? `DESTINATION: ${direction.destination}` : null,
    direction?.meaning ? `MEANING: ${direction.meaning}` : null,
    direction?.final_thought ? `FINAL THOUGHT: ${direction.final_thought}` : null,
    selected ? `LENS: ${selected.text}` : null,
    direction?.tense ? `TENSE: ${direction.tense}` : null,
    "",
    "SCRIPT — the empty lines are the job:",
    numbered,
    "",
    `Write the empty lines. ${empty.length} of them.

Each one has a role in brackets saying what that line is for. Write a line that
does that job, in this story, at that exact point in the sequence — it has to
follow the line above it and set up the line below it.

Copy their voice from the lines that are already written. Their slang, their
punctuation, their profanity, their sentence length, their typos-as-style. If
they write "crashout" and "uwu shy", you write like that. Do not clean it up and
do not sound like an ad.

One line each. Return only the empty ones, by their number.`,
  ]
    .filter((part) => part !== null)
    .join("\n");

  const result = await askJson<{ drafts: { line: number; text: string }[] }>({
    prompt,
    schema: DRAFT_SCHEMA,
    maxTokens: 4000,
  });

  // Map line numbers back to beats, and refuse anything pointing at a line that
  // already has words — a "draft" that silently overwrites finished writing is
  // the one behaviour this must never have.
  return (result.drafts ?? [])
    .map((d) => ({ beat: beats[d.line - 1], text: d.text?.trim() ?? "" }))
    .filter(({ beat, text }) => beat && text && !(beat.text ?? "").trim())
    .map(({ beat, text }) => ({ beatId: beat.id, text }));
}

/* ===================================================================== */
/* LOCALISED SUGGESTIONS                                                 */
/* ===================================================================== */

/**
 * What each request actually asks for.
 *
 * The names live in story-vocab.ts (a "use server" module can only export
 * async functions); the wording lives here, next to the model.
 */
const ASK: Record<SuggestionKind, string> = {
  lenses:
    "Give 3 stronger lenses on this topic — angles further from the obvious reading. One line each, no explanation.",
  rehook:
    "Give 3 ways to re-hook here: close what is open while opening something new. Each one a single spoken line.",
  specific:
    "This is abstract. Give 3 ways to show it instead — something the viewer could see, hear, or watch happen.",
  question:
    "Give 3 unanswered questions this moment could plant in the viewer's head. Phrase each as the question they would be asking.",
  dance:
    "These lines just accumulate. Give 3 ways to connect them by consequence or conflict — therefore, but, because. Show the connection, not a lecture about it.",
  cliffhangers: "Give 3 mini-cliffhangers that would work at this exact point.",
  meaning:
    "Give 3 candidate meanings for this story — endings to the sentence 'the reason I'm telling you this is because…'.",
  value:
    "Give 3 faster routes to value here — ways the viewer gets something sooner without losing the setup.",
  ministory:
    "This reports a fact. Give 3 ways to turn it into a mini-story with tension, a turn, and a small payoff.",
};

const SUGGESTION_SCHEMA = {
  type: "object",
  properties: {
    suggestions: { type: "array", items: { type: "string" } },
  },
  required: ["suggestions"],
  additionalProperties: false,
} as const;

/**
 * Three options for one spot, and nothing else.
 *
 * The script goes along as context so a suggestion fits what is already there,
 * but the answer is always a short list of alternatives the writer can take,
 * adapt, or ignore — never an edit. Nothing here writes to the database; a
 * suggestion becomes real only when it is typed into a line.
 */
export async function suggest(
  videoId: string,
  kind: SuggestionKind,
  beatId: string | null,
): Promise<string[]> {
  const [{ data: video }, script] = await Promise.all([
    db.from("videos").select("title, lego_topic, lego_angle").eq("id", videoId).maybeSingle(),
    loadScript(videoId),
  ]);

  const beats: StoryBeat[] = running(script.beats).map((b) => ({
    id: b.id,
    text: b.text,
    t_start_sec: b.t_start_sec,
    story_role: b.story_role,
    dance_relation: b.dance_relation,
    story_loop: b.story_loop,
    story_section: b.story_section,
  }));

  const withText = beats.filter((b) => (b.text ?? "").trim());
  const at = beatId ? withText.findIndex((b) => b.id === beatId) : -1;

  const prompt = [
    `TOPIC: ${video?.lego_topic || video?.title || "(not set)"}`,
    video?.lego_angle ? `PREMISE: ${video.lego_angle}` : null,
    "",
    withText.length > 0 ? "SCRIPT" : "The script is empty.",
    withText.length > 0 ? scriptForAnalysis(beats) : null,
    "",
    at >= 0 ? `The request is about line ${at + 1}.` : "The request is about the script as a whole.",
    "",
    ASK[kind],
    "",
    "Match the creator's voice and register — these are options they might say out loud, not copy written at them. Exactly 3.",
  ]
    .filter((part) => part !== null)
    .join("\n");

  const result = await askJson<{ suggestions: string[] }>({
    prompt,
    schema: SUGGESTION_SCHEMA,
    maxTokens: 2000,
  });

  return (result.suggestions ?? []).filter((s) => s.trim()).slice(0, 3);
}

/**
 * Make a fix safe to paste into a single line.
 *
 * The prompt asks for one bare spoken line, and mostly gets one — but a model
 * mid-edit will sometimes answer in the format of the script it is reading and
 * hand back "13. so i order a latte" or three numbered alternatives. Pasting
 * that verbatim would put "13." into the creator's script, so the leading
 * numbering is stripped and anything past the first line is dropped.
 *
 * A fix that survives as nothing but an editorial aside — "(cut)" — is not a
 * line, and returns null so no button is offered for it.
 */
function cleanFix(fix: string | null): string | null {
  if (!fix) return null;

  const first = fix
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)[0];

  if (!first) return null;

  // "13. ", "13b. ", "1) " — the script's own numbering leaking into the answer.
  const bare = first.replace(/^\d+[a-z]?\s*[.)]\s*/i, "").trim();

  // Pure stage direction, with no line in it.
  if (!bare || /^\(.*\)$/.test(bare)) return null;

  return bare;
}

/** A titled block, dropped entirely when it has no content worth showing. */
function section(title: string, lines: (string | null | undefined | false)[]): string | null {
  const rows = lines.filter((l): l is string => Boolean(l));
  return rows.length > 0 ? `${title}\n${rows.map((r) => `  ${r}`).join("\n")}` : null;
}
