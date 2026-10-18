// The story, read back to you.
//
// Everything here is DERIVED. Nothing in this file is stored, and nothing in it
// is a rule — the output is a list of observations about what is on screen, in
// the same register the existing Diagnostics panel already uses: flat
// statements, no red, no "fix this", no score.
//
// That restraint is the design. A storytelling framework that grades you is a
// checklist wearing a costume, and a checklist in front of someone who has not
// finished a sentence yet is the exact failure the MAKE workspace was built to
// undo. So this file describes; the writer decides whether any of it matters.
//
// It is also the single source of truth for that description. The panel renders
// it and the AI pass is handed it as context, so a note cannot say one thing on
// screen and something else in the analysis.

import { beatTimeline, clock, estimateSec, wordCount, type TimedBeat } from "./timing";
import type { StoryTense } from "@/app/videos/[id]/story-vocab";

export type StoryBeat = TimedBeat & {
  story_role: string | null;
  dance_relation: string | null;
  story_loop: number | null;
  story_section: string | null;
};

export type StoryQuestion = {
  id: string;
  text: string;
  opened_beat_id: string | null;
  answered_beat_id: string | null;
};

export type StoryDirection = {
  starting_belief: string | null;
  destination: string | null;
  final_thought: string | null;
  meaning: string | null;
  tense: string | null;
};

export type StoryInput = {
  beats: StoryBeat[];
  questions: StoryQuestion[];
  direction: StoryDirection | null;
  lensSelected: string | null;
  lensCount: number;
  targetSec: number | null;
};

/**
 * Which layer of the model an observation belongs to.
 *
 * Grouped rather than listed flat because the layers answer different
 * questions, and a wall of eleven undifferentiated notes reads as a to-do list
 * however gently each one is worded.
 */
export type StoryArea =
  | "direction"
  | "lens"
  | "tension"
  | "dance"
  | "loops"
  | "rhythm"
  | "specificity"
  | "value"
  | "meaning";

export type Observation = {
  area: StoryArea;
  text: string;
  /** Lines this is about, so the panel can point at them. */
  beatIds?: string[];
};

export const AREA_LABEL: Record<StoryArea, string> = {
  direction: "Direction",
  lens: "Lens",
  tension: "Tension",
  dance: "Dance",
  loops: "Loops",
  rhythm: "Rhythm",
  specificity: "Specificity",
  value: "Value",
  meaning: "Meaning",
};

/** Nothing is worth reading back until there is something to read. */
export const MIN_BEATS = 3;

const written = (beats: StoryBeat[]) => beats.filter((b) => (b.text ?? "").trim());

/* ------------------------------------------------------------------ loops */

export type LoopSpan = {
  loop: number;
  beatIds: string[];
  startSec: number;
  endSec: number;
  sec: number;
};

/**
 * Group beats by their loop number, in running order.
 *
 * Loops are expected to be consecutive runs, but nothing enforces that and a
 * reorder can interleave them. When that happens the span is reported from the
 * first to the last beat carrying the number — which will look wrong, and
 * should, because it is.
 */
export function loopSpans(beats: StoryBeat[]): LoopSpan[] {
  const rows = written(beats);
  const timeline = beatTimeline(rows);
  const byLoop = new Map<number, string[]>();

  for (const b of rows) {
    if (b.story_loop == null) continue;
    byLoop.set(b.story_loop, [...(byLoop.get(b.story_loop) ?? []), b.id]);
  }

  return [...byLoop.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([loop, beatIds]) => {
      const times = beatIds.map((id) => timeline.get(id)!).filter(Boolean);
      const startSec = Math.min(...times.map((t) => t.startSec));
      const endSec = Math.max(...times.map((t) => t.endSec));
      return { loop, beatIds, startSec, endSec, sec: endSec - startSec };
    });
}

/* -------------------------------------------------------------- questions */

export type OpenSpan = { fromSec: number; toSec: number; sec: number };

/**
 * The stretches where the viewer has nothing outstanding.
 *
 * A question is "live" from the beat that opens it to the beat that answers it;
 * one with no answering beat stays live to the end. The gaps between those
 * intervals are the places with no reason to keep watching, which is the single
 * most useful thing this whole file computes.
 */
export function unquestionedSpans(
  beats: StoryBeat[],
  questions: StoryQuestion[],
): OpenSpan[] {
  const rows = written(beats);
  if (rows.length === 0) return [];

  const timeline = beatTimeline(rows);
  const runtime = timeline.get(rows[rows.length - 1].id)?.endSec ?? 0;

  const live: { from: number; to: number }[] = [];
  for (const q of questions) {
    const opened = q.opened_beat_id ? timeline.get(q.opened_beat_id) : null;
    // A question with no placed opening is a note, not a beat on the timeline.
    if (!opened) continue;
    const answered = q.answered_beat_id ? timeline.get(q.answered_beat_id) : null;
    live.push({ from: opened.startSec, to: answered ? answered.endSec : runtime });
  }

  if (live.length === 0) return runtime > 0 ? [{ fromSec: 0, toSec: runtime, sec: runtime }] : [];

  live.sort((a, b) => a.from - b.from);

  // Merge overlapping live intervals, then take the complement.
  const merged: { from: number; to: number }[] = [];
  for (const span of live) {
    const last = merged[merged.length - 1];
    if (last && span.from <= last.to) last.to = Math.max(last.to, span.to);
    else merged.push({ ...span });
  }

  const gaps: OpenSpan[] = [];
  let cursor = 0;
  for (const span of merged) {
    if (span.from > cursor) gaps.push({ fromSec: cursor, toSec: span.from, sec: span.from - cursor });
    cursor = Math.max(cursor, span.to);
  }
  if (cursor < runtime) gaps.push({ fromSec: cursor, toSec: runtime, sec: runtime - cursor });

  return gaps;
}

/* ------------------------------------------------------------- speed to value */

/**
 * Words that mean the viewer is receiving something concrete.
 *
 * Not a quality judgement — a line can be excellent without any of these. This
 * only answers "is anything being handed over yet", which is what speed to
 * value actually asks. Value is not only information, so proper nouns and
 * numbers sit alongside sensory detail rather than above it.
 */
const CONCRETE = /\d|[£$€%]|\b(?:saw|heard|felt|smelled|tasted|watched|held|hands|face|voice|room|screen)\b/i;

/** A capitalised word that is not starting the sentence — usually a name. */
const PROPER_NOUN = /\S\s+[A-Z][a-z]{2,}/;

const isConcrete = (text: string) => CONCRETE.test(text) || PROPER_NOUN.test(text);

/** Seconds until the first line that hands the viewer something concrete. */
export function secondsToValue(beats: StoryBeat[]): number | null {
  const rows = written(beats);
  const timeline = beatTimeline(rows);
  for (const b of rows) {
    if (isConcrete(b.text ?? "")) return timeline.get(b.id)?.startSec ?? null;
  }
  return null;
}

/* -------------------------------------------------------------- rhythm */

/**
 * Runs of lines that are all about the same length.
 *
 * Rhythm is variation, and the failure mode is four medium sentences in a row.
 * A run needs at least MIN_RUN lines whose word counts sit inside a narrow
 * band; single long or short lines are never flagged, because one of anything
 * is not a pattern.
 */
const MIN_RUN = 4;
const BAND = 3;

export function monotoneRuns(beats: StoryBeat[]): { beatIds: string[]; words: number }[] {
  const rows = written(beats);
  const out: { beatIds: string[]; words: number }[] = [];

  let run: StoryBeat[] = [];
  const flush = () => {
    if (run.length >= MIN_RUN) {
      const avg = run.reduce((n, b) => n + wordCount(b.text), 0) / run.length;
      out.push({ beatIds: run.map((b) => b.id), words: Math.round(avg) });
    }
    run = [];
  };

  for (const b of rows) {
    if (run.length === 0) {
      run = [b];
      continue;
    }
    const counts = [...run, b].map((x) => wordCount(x.text));
    if (Math.max(...counts) - Math.min(...counts) <= BAND) run.push(b);
    else {
      flush();
      run = [b];
    }
  }
  flush();

  return out;
}

/* ---------------------------------------------------------- specificity */

/**
 * Abstractions that describe a feeling instead of showing one.
 *
 * A short, boring list on purpose. Every entry here is a word that names an
 * experience the viewer cannot see, and the prompt it produces is a question
 * ("could this be shown?"), never an instruction — plenty of good lines are
 * abstract, and the ones that should stay abstract outnumber the ones that
 * shouldn't.
 */
const VAGUE =
  /\b(?:really|very|super|pretty much|kind of|sort of|a lot|so much|amazing|incredible|awesome|crazy|insane|nervous|excited|scared|angry|happy|sad|good|bad|great|nice|stuff|things?|something|somehow)\b/i;

export function vagueBeats(beats: StoryBeat[]): StoryBeat[] {
  // A line that is vague AND concrete is usually fine — the concrete half is
  // doing the work. Only lines with nothing to see are worth asking about.
  return written(beats).filter((b) => VAGUE.test(b.text ?? "") && !isConcrete(b.text ?? ""));
}

/* ---------------------------------------------------------------- tense */

const PAST = /\b(?:was|were|had|did|went|said|walked|looked|felt|started|thought|got|came|took)\b/i;
const PRESENT = /\b(?:is|are|am|walk|walks|say|says|go|goes|look|looks|feel|feels|start|starts|take|takes)\b/i;

/**
 * Lines that read as the tense you did NOT pick.
 *
 * Only ever runs when a tense has been declared. Undeclared, mixed tense is
 * just prose and none of the system's business — the declaration is what turns
 * a drift into something worth pointing at.
 */
export function tenseDrift(beats: StoryBeat[], tense: StoryTense | null): StoryBeat[] {
  if (!tense) return [];
  const wrong = tense === "present" ? PAST : PRESENT;
  const right = tense === "present" ? PRESENT : PAST;
  return written(beats).filter((b) => wrong.test(b.text ?? "") && !right.test(b.text ?? ""));
}

/* --------------------------------------------------------------- dance */

/** Runs of consecutive lines with no stated relationship to the one before. */
export function danceGaps(beats: StoryBeat[]): { beatIds: string[] }[] {
  const rows = written(beats);
  const out: { beatIds: string[] }[] = [];
  let run: string[] = [];

  // The first line has nothing above it, so it can never carry a relation and
  // is never counted as a gap.
  for (let i = 1; i < rows.length; i++) {
    if (rows[i].dance_relation) {
      if (run.length >= 3) out.push({ beatIds: run });
      run = [];
    } else {
      run.push(rows[i].id);
    }
  }
  if (run.length >= 3) out.push({ beatIds: run });

  return out;
}

/* ---------------------------------------------------------- the read-back */

/**
 * Everything above, as sentences.
 *
 * Ordered by the layers of the model — direction before tension before
 * delivery — because that is the order in which a problem is worth fixing. No
 * point tightening a rhythm inside a section that has no reason to exist.
 */
export function readStory(input: StoryInput): Observation[] {
  const { beats, questions, direction, lensSelected, lensCount } = input;
  const rows = written(beats);
  if (rows.length < MIN_BEATS) return [];

  const notes: Observation[] = [];
  const timeline = beatTimeline(rows);
  const runtime = timeline.get(rows[rows.length - 1].id)?.endSec ?? 0;
  const say = (area: StoryArea, text: string, beatIds?: string[]) =>
    notes.push({ area, text, beatIds });

  /* --- direction ------------------------------------------------------- */
  if (!direction?.destination) {
    say("direction", "No destination yet — where the viewer ends up is still open.");
  }
  if (direction?.starting_belief && direction.destination) {
    say("direction", "Start and destination are both set; the script has a distance to cover.");
  }

  /* --- lens ------------------------------------------------------------ */
  if (!lensSelected && lensCount === 0) {
    say("lens", "No lens recorded. The angle is doing the work — worth naming the one you took.");
  } else if (!lensSelected) {
    say("lens", `${lensCount} ${lensCount === 1 ? "lens" : "lenses"} on the table, none chosen yet.`);
  } else if (lensCount === 1) {
    say("lens", "One lens, and it is the one you kept. The obvious reading had nothing to beat.");
  }

  /* --- tension --------------------------------------------------------- */
  const placed = questions.filter((q) => q.opened_beat_id);
  if (questions.length === 0) {
    say("tension", "No open questions recorded — nothing is pulling the viewer forward yet.");
  } else if (placed.length === 0) {
    say("tension", `${questions.length} question${questions.length === 1 ? "" : "s"} written down, none placed on a line yet.`);
  } else {
    const gaps = unquestionedSpans(beats, questions).filter((g) => g.sec >= 3);
    const widest = gaps.sort((a, b) => b.sec - a.sec)[0];
    if (widest) {
      say(
        "tension",
        `~${Math.round(widest.sec)}s from ${clock(widest.fromSec)} with nothing outstanding.`,
      );
    }
    const open = questions.filter((q) => q.opened_beat_id && !q.answered_beat_id);
    if (open.length > 0) {
      say(
        "tension",
        `${open.length} question${open.length === 1 ? "" : "s"} never answered${open.length === 1 ? "" : " on screen"} — deliberate, or the payoff moved?`,
      );
    }
  }

  /* --- dance ----------------------------------------------------------- */
  const gaps = danceGaps(beats);
  const widestDance = gaps.sort((a, b) => b.beatIds.length - a.beatIds.length)[0];
  if (widestDance) {
    say(
      "dance",
      `${widestDance.beatIds.length} lines in a row with no stated relationship — is there a therefore or a but in there?`,
      widestDance.beatIds,
    );
  }

  /* --- loops ----------------------------------------------------------- */
  const loops = loopSpans(beats);
  if (loops.length > 0) {
    say("loops", loops.map((l) => `Loop ${l.loop} ~${Math.round(l.sec)}s`).join(" · "));
    const long = loops.filter((l) => l.sec > 20);
    if (long.length > 0) {
      say(
        "loops",
        `Loop ${long.map((l) => l.loop).join(", ")} run${long.length === 1 ? "s" : ""} past 20s — long for one cycle of attention.`,
        long.flatMap((l) => l.beatIds),
      );
    }
  }

  /* --- value ----------------------------------------------------------- */
  const value = secondsToValue(beats);
  if (value == null) {
    say("value", "Nothing concrete yet — no number, name, or thing the viewer could picture.");
  } else if (value > 4) {
    // SCR-07's ~4s for short form. Shown as the source's number, not as a limit.
    say("value", `First concrete detail lands at ~${Math.round(value)}s. SCR-07 puts short-form value at ~4s.`);
  }

  /* --- rhythm ---------------------------------------------------------- */
  const runs = monotoneRuns(beats);
  const longest = runs.sort((a, b) => b.beatIds.length - a.beatIds.length)[0];
  if (longest) {
    say(
      "rhythm",
      `${longest.beatIds.length} lines running about ${longest.words} words each.`,
      longest.beatIds,
    );
  }

  /* --- specificity ----------------------------------------------------- */
  const vague = vagueBeats(beats);
  if (vague.length > 0) {
    say(
      "specificity",
      `${vague.length} line${vague.length === 1 ? "" : "s"} describing rather than showing — could any of it be seen or heard?`,
      vague.map((b) => b.id),
    );
  }

  const drift = tenseDrift(beats, (direction?.tense as StoryTense) ?? null);
  if (drift.length > 0) {
    say(
      "specificity",
      `${drift.length} line${drift.length === 1 ? "" : "s"} read as ${direction?.tense === "present" ? "past" : "present"} tense.`,
      drift.map((b) => b.id),
    );
  }

  /* --- meaning --------------------------------------------------------- */
  const hasMeaningBeat = rows.some((b) => b.story_role === "meaning");
  if (!direction?.meaning && !hasMeaningBeat) {
    say("meaning", "The story has an ending. It does not yet say why that ending matters.");
  } else if (direction?.meaning && !hasMeaningBeat) {
    say("meaning", "Meaning is written down but no line carries it — said off screen, or not yet said?");
  }

  // Runtime last: it is the least interesting thing on the list and putting it
  // first is how the panel becomes a word counter people stop reading.
  if (runtime > 0 && input.targetSec) {
    const delta = Math.round(runtime - input.targetSec);
    if (Math.abs(delta) > 2) {
      say(
        "loops",
        `~${Math.round(runtime)}s total — ${Math.abs(delta)}s ${delta > 0 ? "over" : "under"} the ${input.targetSec}s target.`,
      );
    }
  }

  return notes;
}

/**
 * The script as text an AI pass can read.
 *
 * Numbered, with the structure inline, because an analysis that cannot say
 * "beats 5–8" is not localised enough to act on. Deliberately built here rather
 * than in the AI module so the model sees exactly the same script the panel
 * describes.
 */
export function scriptForAnalysis(beats: StoryBeat[]): string {
  const rows = written(beats);
  const timeline = beatTimeline(rows);

  return rows
    .map((b, i) => {
      const t = timeline.get(b.id)!;
      const marks = [
        b.story_loop != null ? `loop ${b.story_loop}` : null,
        b.story_section,
        b.story_role,
        b.dance_relation ? `↳ ${b.dance_relation}` : null,
      ].filter(Boolean);
      const tag = marks.length ? `  [${marks.join(" · ")}]` : "";
      return `${i + 1}. (${clock(t.startSec)}–${clock(t.endSec)}, ~${estimateSec(b.text).toFixed(
        1,
      )}s)${tag}\n   ${b.text}`;
    })
    .join("\n");
}
