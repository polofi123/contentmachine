"use client";

import { useState } from "react";
import { approxSec, beatTimeline } from "@/lib/timing";
import {
  AREA_LABEL,
  MIN_BEATS,
  readStory,
  type Observation,
  type StoryArea,
  type StoryBeat,
  type StoryDirection,
  type StoryQuestion,
} from "@/lib/story";

/**
 * What the shape of the script is, said flatly.
 *
 * Every line here is an observation, never an instruction — no red, no warning
 * icon, no "fix this". The framework exists to support writing, and a checklist
 * that appears before the writing does is the failure mode this whole workspace
 * was built to get away from. So it stays silent until three lines exist, and
 * then it only describes.
 *
 * Two sources, kept visibly apart. THE SHAPE is computed from the words on
 * screen and moves as you type. THE READ-BACK is what Claude said last time it
 * was asked, and is stamped as such — an opinion someone formed at a moment,
 * not a property of the script. Blurring the two would make the machine's guess
 * look like a measurement.
 */
export function Diagnostics({
  beats,
  questions,
  direction,
  lensSelected,
  lensCount,
  targetSec,
}: {
  beats: StoryBeat[];
  questions: StoryQuestion[];
  direction: StoryDirection | null;
  lensSelected: string | null;
  lensCount: number;
  targetSec: number | null;
}) {
  const [open, setOpen] = useState(true);

  const written = beats.filter((b) => (b.text ?? "").trim());
  if (written.length < MIN_BEATS) return null;

  const notes = readStory({
    beats,
    questions,
    direction,
    lensSelected,
    lensCount,
    targetSec,
  });

  const timeline = beatTimeline(written);
  const runtime = timeline.get(written[written.length - 1].id)?.endSec ?? 0;
  const opener = timeline.get(written[0].id);

  // Where each line sits, so an observation can name a moment rather than an id.
  const at = new Map(written.map((b, i) => [b.id, i + 1]));

  return (
    <section className="mt-6 rounded-xl border border-border-soft px-3 py-2.5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="mb-1.5 flex w-full items-baseline gap-2 text-left"
      >
        <span className="text-[10px] tracking-wide text-ink-dim">THE SHAPE</span>
        <span className="font-mono text-[10px] text-ink-faint">
          {approxSec(runtime)}
          {opener && ` · opens on ~${(opener.endSec - opener.startSec).toFixed(1)}s`}
        </span>
        <span className="ml-auto text-[10px] text-ink-faint">{open ? "−" : "+"}</span>
      </button>

      {open && (
        <>
          {notes.length === 0 ? (
            <p className="text-[11px] leading-relaxed text-ink-faint">
              Nothing to say about the shape yet.
            </p>
          ) : (
            <Grouped notes={notes} at={at} />
          )}
        </>
      )}
    </section>
  );
}

/**
 * Observations under their layer.
 *
 * Grouped rather than listed flat because the layers answer different
 * questions, and eleven undifferentiated notes read as a to-do list however
 * gently each one is worded. Grouping also makes the silence legible: an area
 * with nothing under it simply is not there.
 */
function Grouped({ notes, at }: { notes: Observation[]; at: Map<string, number> }) {
  const areas = [...new Set(notes.map((n) => n.area))] as StoryArea[];

  return (
    <div className="space-y-1.5">
      {areas.map((area) => (
        <div key={area}>
          <p className="text-[9px] uppercase tracking-wide text-ink-faint/60">
            {AREA_LABEL[area]}
          </p>
          <ul className="space-y-0.5">
            {notes
              .filter((n) => n.area === area)
              .map((note, i) => {
                const lines = (note.beatIds ?? [])
                  .map((id) => at.get(id))
                  .filter((n): n is number => Boolean(n));

                return (
                  <li key={i} className="text-[11px] leading-relaxed text-ink-faint">
                    {note.text}
                    {lines.length > 0 && (
                      <span className="ml-1 font-mono text-[10px] text-ink-faint/60">
                        {lines.length === 1 ? `line ${lines[0]}` : `lines ${summarise(lines)}`}
                      </span>
                    )}
                  </li>
                );
              })}
          </ul>
        </div>
      ))}
    </div>
  );
}

/** "3–6" rather than "3, 4, 5, 6" — runs are how people read line numbers. */
function summarise(lines: number[]): string {
  const sorted = [...new Set(lines)].sort((a, b) => a - b);
  const parts: string[] = [];

  let start = sorted[0];
  let prev = sorted[0];

  for (const n of sorted.slice(1)) {
    if (n === prev + 1) {
      prev = n;
      continue;
    }
    parts.push(start === prev ? `${start}` : `${start}–${prev}`);
    start = n;
    prev = n;
  }
  parts.push(start === prev ? `${start}` : `${start}–${prev}`);

  return parts.join(", ");
}
