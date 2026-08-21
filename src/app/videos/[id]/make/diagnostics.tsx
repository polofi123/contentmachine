"use client";

import { beatTimeline, clock, type TimedBeat } from "@/lib/timing";

type DiagBeat = TimedBeat & {
  story_section: string | null;
  function_label: string | null;
};

/** Nothing is worth diagnosing until there is something to diagnose. */
const MIN_BEATS = 3;

/**
 * What the shape of the script is, said flatly.
 *
 * Every line here is an observation, never an instruction — no red, no warning
 * icon, no "fix this". The framework exists to support writing, and a checklist
 * that appears before the writing does is the failure mode this whole workspace
 * was built to get away from. So: it stays silent until three lines exist, and
 * then it only describes.
 *
 * Everything is derived from the words on screen, live, so it moves as you
 * write rather than reporting on a version you have already changed.
 */
export function Diagnostics({
  beats,
  targetSec,
}: {
  beats: DiagBeat[];
  targetSec: number | null;
}) {
  const written = beats.filter((b) => (b.text ?? "").trim());
  if (written.length < MIN_BEATS) return null;

  const timeline = beatTimeline(written);
  const times = written.map((b) => timeline.get(b.id)!);
  const runtime = times.length ? times[times.length - 1].endSec : 0;

  const notes: string[] = [];

  // --- runtime against the target ---------------------------------------
  if (targetSec) {
    const delta = Math.round(runtime - targetSec);
    notes.push(
      Math.abs(delta) <= 2
        ? `~${Math.round(runtime)}s, on the ${targetSec}s target.`
        : delta > 0
          ? `~${Math.round(runtime)}s — ${delta}s over the ${targetSec}s target.`
          : `~${Math.round(runtime)}s — ${Math.abs(delta)}s under the ${targetSec}s target.`,
    );
  } else {
    notes.push(`~${Math.round(runtime)}s of script.`);
  }

  // --- how long the opening line runs ------------------------------------
  const opener = times[0];
  if (opener) {
    const len = opener.endSec - opener.startSec;
    notes.push(`Opening line runs ~${len.toFixed(1)}s.`);
  }

  // --- longest stretch with nothing planted ------------------------------
  // Measured between labelled beats, including the run-up to the first and the
  // tail after the last, because dead air at either end still costs a viewer.
  const marks = written
    .map((b, i) => ({ b, t: times[i] }))
    .filter(({ b }) => b.function_label);

  if (marks.length === 0) {
    notes.push(`Nothing planted yet — type / on a line to place a technique.`);
  } else {
    let widest = marks[0].t.startSec;
    let widestAt = 0;

    for (let i = 1; i < marks.length; i++) {
      const gap = marks[i].t.startSec - marks[i - 1].t.endSec;
      if (gap > widest) {
        widest = gap;
        widestAt = marks[i - 1].t.endSec;
      }
    }

    const tail = runtime - marks[marks.length - 1].t.endSec;
    if (tail > widest) {
      widest = tail;
      widestAt = marks[marks.length - 1].t.endSec;
    }

    if (widest >= 1) {
      notes.push(
        `Longest stretch with nothing planted: ~${Math.round(widest)}s, from ${clock(widestAt)}.`,
      );
    }
  }

  // --- how the time splits across the arc --------------------------------
  const sectioned = written.filter((b) => b.story_section);
  if (sectioned.length > 0) {
    const spans: Record<string, number> = { start: 0, middle: 0, end: 0 };
    written.forEach((b, i) => {
      if (!b.story_section) return;
      spans[b.story_section] += times[i].endSec - times[i].startSec;
    });

    const named = (["start", "middle", "end"] as const).filter((k) => spans[k] > 0);
    if (named.length > 0) {
      notes.push(
        `Split: ${named.map((k) => `${k} ~${Math.round(spans[k])}s`).join(" · ")}.`,
      );
    }

    const loose = written.length - sectioned.length;
    if (loose > 0) {
      notes.push(`${loose} ${loose === 1 ? "line has" : "lines have"} no section yet.`);
    }
  }

  return (
    <section className="mt-6 rounded-xl border border-border-soft px-3 py-2.5">
      <p className="mb-1.5 text-[10px] tracking-wide text-ink-dim">THE SHAPE</p>
      <ul className="space-y-0.5">
        {notes.map((note) => (
          <li key={note} className="text-[11px] leading-relaxed text-ink-faint">
            {note}
          </li>
        ))}
      </ul>
    </section>
  );
}
