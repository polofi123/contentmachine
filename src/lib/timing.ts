// Timing is DERIVED, never typed.
//
// Nobody writing a short should be asked "start: 4.2 sec" mid-sentence. The
// word count already knows roughly how long a line takes to say, so the ruler
// builds itself and the writer never leaves the keyboard.
//
// This is the single source of truth for that estimate. The MAKE footer, the
// EDIT timeline, and the placement shown for an anchored technique all read it,
// so a beat cannot be "0:04" in one view and "0:06" in another.

/**
 * Short-form speaking rate. Roughly 150 wpm, which is the usual talking-head
 * pace — fast enough for a 30s script to land around 75 words.
 *
 * This is an ESTIMATE and should always be shown as one ("~23 sec", never
 * "23.0"). Real runtime moves with pauses, cuts, and b-roll. It is directionally
 * right, which is all that is needed to answer "am I over length" and "how long
 * has it been since the last beat".
 */
export const WORDS_PER_SEC = 2.5;

export type TimedBeat = {
  id: string;
  text: string | null;
  t_start_sec: number | null;
};

export type BeatTime = {
  startSec: number;
  endSec: number;
  /** False when the start came from an explicit, pinned t_start_sec. */
  derived: boolean;
};

export function wordCount(text: string | null | undefined): number {
  if (!text) return 0;
  const trimmed = text.trim();
  return trimmed === "" ? 0 : trimmed.split(/\s+/).length;
}

/** How long this line takes to say, on its own. */
export function estimateSec(text: string | null | undefined): number {
  return wordCount(text) / WORDS_PER_SEC;
}

/**
 * Lay beats out on a timeline.
 *
 * The rule matches t_start_sec's meaning everywhere else in the app:
 *
 *   NULL     = derived, flows from the length of everything before it
 *   a number = pinned, and everything after it re-bases off that pin
 *
 * Pinning beat 3 at 12s therefore drags beats 4+ with it, which is what makes a
 * pin useful: you fix the one moment you know, and the rest arranges itself.
 *
 * Pass beats in running order, already excluding parked ones — a line sitting
 * in the idea pile takes up no runtime.
 */
export function beatTimeline(beats: readonly TimedBeat[]): Map<string, BeatTime> {
  const out = new Map<string, BeatTime>();
  let cursor = 0;

  for (const beat of beats) {
    const pinned = beat.t_start_sec != null;
    // A pin is authoritative even if it sits earlier than the natural flow —
    // the writer said so on purpose, and silently ignoring it would be worse
    // than a timeline that briefly runs backwards.
    const startSec = pinned ? (beat.t_start_sec as number) : cursor;
    const endSec = startSec + estimateSec(beat.text);

    out.set(beat.id, { startSec, endSec, derived: !pinned });
    cursor = endSec;
  }

  return out;
}

/** Total estimated runtime of a script, in seconds. */
export function totalSec(beats: readonly TimedBeat[]): number {
  let end = 0;
  for (const t of beatTimeline(beats).values()) {
    if (t.endSec > end) end = t.endSec;
  }
  return end;
}

export function totalWords(beats: readonly TimedBeat[]): number {
  return beats.reduce((n, b) => n + wordCount(b.text), 0);
}

/** "0:04" — for the EDIT timeline, where chronology is the organising idea. */
export function clock(sec: number): string {
  const whole = Math.max(0, Math.round(sec));
  const m = Math.floor(whole / 60);
  const s = whole % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** "~23 sec" — for MAKE, where the estimate should never look precise. */
export function approxSec(sec: number): string {
  return `~${Math.round(sec)} sec`;
}
