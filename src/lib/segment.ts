// Turning a script into things a finding can point at.
//
// Findings carry exact quotes and exact ranges. That only works if there is one
// canonical string the ranges index into and one set of stable ids naming its
// parts — which is what this file produces, and why the result is frozen into a
// script_version rather than recomputed whenever something reads it.
//
// Segments are beats, because beats are already the app's addressable unit and
// already carry stable uuids. But the offsets are computed against the joined
// text rather than per-beat, so a quote spanning a paragraph break still
// resolves, and a script that arrives as pasted prose rather than as beats
// would segment the same way.

export type ScriptSegment = {
  /** The beat id. Stable across edits to other lines. */
  id: string;
  order: number;
  text: string;
  /** Character offsets into the version's `content`. */
  startIndex: number;
  endIndex: number;
  /** Structure the writer has already declared, carried along for the engine. */
  role: string | null;
  loop: number | null;
  section: string | null;
  /** Estimated start second, so findings can talk about time as well as lines. */
  startSec: number;
  endSec: number;
};

export type SegmentedScript = {
  content: string;
  segments: ScriptSegment[];
};

export type SegmentableBeat = {
  id: string;
  text: string | null;
  story_role: string | null;
  story_loop: number | null;
  story_section: string | null;
};

const JOIN = "\n";

/**
 * Join the running beats into one string and record where each one landed.
 *
 * Empty beats are dropped: they have no text to quote and their presence would
 * shift every offset after them for no gain. Their ids simply never appear in a
 * segment map, so nothing can point at them.
 */
export function segmentScript(
  beats: SegmentableBeat[],
  timing: (beats: { id: string; text: string | null; t_start_sec: number | null }[]) => Map<
    string,
    { startSec: number; endSec: number }
  >,
): SegmentedScript {
  const written = beats.filter((b) => (b.text ?? "").trim());

  const times = timing(
    written.map((b) => ({ id: b.id, text: b.text, t_start_sec: null })),
  );

  const segments: ScriptSegment[] = [];
  let cursor = 0;

  written.forEach((beat, i) => {
    const text = (beat.text ?? "").trim();
    const startIndex = cursor;
    const endIndex = startIndex + text.length;

    segments.push({
      id: beat.id,
      order: i + 1,
      text,
      startIndex,
      endIndex,
      role: beat.story_role,
      loop: beat.story_loop,
      section: beat.story_section,
      startSec: times.get(beat.id)?.startSec ?? 0,
      endSec: times.get(beat.id)?.endSec ?? 0,
    });

    cursor = endIndex + JOIN.length;
  });

  return {
    content: segments.map((s) => s.text).join(JOIN),
    segments,
  };
}

/**
 * Find a quote in the analysed content and say which segments it covers.
 *
 * Returns null when the quote is not present. That is the point: an unlocatable
 * quote means the model paraphrased the script and presented the paraphrase as
 * evidence, and the only correct response is to throw the finding away.
 *
 * Whitespace is normalised before matching — a model re-wrapping a line it
 * copied faithfully is not fabricating it — but nothing else is forgiven.
 */
export function locateQuote(
  script: SegmentedScript,
  quote: string,
): { startIndex: number; endIndex: number; segmentIds: string[] } | null {
  const trimmed = quote.trim();
  if (trimmed.length < 3) return null;

  let startIndex = script.content.indexOf(trimmed);
  let length = trimmed.length;

  if (startIndex === -1) {
    // Retry against a whitespace-flattened view, mapping the hit back to real
    // offsets through an index built alongside the flattened string.
    const map: number[] = [];
    let flat = "";
    let lastWasSpace = false;

    for (let i = 0; i < script.content.length; i++) {
      const ch = script.content[i];
      const isSpace = /\s/.test(ch);
      if (isSpace) {
        if (lastWasSpace) continue;
        flat += " ";
        map.push(i);
        lastWasSpace = true;
      } else {
        flat += ch.toLowerCase();
        map.push(i);
        lastWasSpace = false;
      }
    }

    const needle = trimmed.replace(/\s+/g, " ").toLowerCase();
    const at = flat.indexOf(needle);
    if (at === -1) return null;

    startIndex = map[at];
    const endFlat = Math.min(at + needle.length - 1, map.length - 1);
    length = map[endFlat] - startIndex + 1;
  }

  const endIndex = startIndex + length;
  const segmentIds = script.segments
    .filter((s) => s.startIndex < endIndex && s.endIndex > startIndex)
    .map((s) => s.id);

  return segmentIds.length > 0 ? { startIndex, endIndex, segmentIds } : null;
}

/**
 * The script as the model reads it: numbered, with declared structure inline.
 *
 * Segment ids are printed IN FULL. An earlier version abbreviated them to eight
 * characters to keep the prompt short, which silently broke the whole engine —
 * every id the model returned failed to match a real segment, so every
 * observation was filtered out and the analysis produced nothing, with no error
 * anywhere to say why. The ids are the join between the model's answer and the
 * script; they are not the place to save tokens.
 */
export function scriptForModel(script: SegmentedScript): string {
  return script.segments
    .map((s) => {
      const marks = [
        s.loop != null ? `loop ${s.loop}` : null,
        s.section,
        s.role,
      ].filter(Boolean);
      const tag = marks.length ? ` (${marks.join(" · ")})` : "";
      return `[${s.id}] ${s.order}.${tag} ${s.text}`;
    })
    .join("\n");
}
