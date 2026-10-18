// The script as text, for reading and for leaving the app.
//
// The outliner is a good place to write and a bad place to read: every line is
// its own control, and controls are noise once the words are settled. Before a
// shoot you want the thing a teleprompter, a phone note or a DM wants — one
// block of prose you can take somewhere else.
//
// Both flavours come from here rather than from the JSX, so what is on screen
// and what lands on the clipboard cannot drift apart.

import { beatTimeline, clock, type TimedBeat } from "./timing";

export type ScriptLine = TimedBeat & {
  story_section: string | null;
  story_role: string | null;
};

/**
 * Flatten beats into one block of text.
 *
 * `marks` is the difference between the two audiences. Off, it is only the
 * words — what you say out loud, nothing you would have to read past. On, it
 * carries the section headers, the derived timestamps and the story role of
 * each line, which is what you want when you are handing the script to someone
 * else or checking the shape of it away from the workbench.
 *
 * Pass beats in running order, parked ones already removed.
 */
export function scriptText(beats: readonly ScriptLine[], marks: boolean): string {
  const times = beatTimeline(beats);
  const blocks: string[] = [];

  // undefined, not null: "no section yet" and "explicitly outside a section"
  // are different, and only the first should be silent.
  let section: string | null | undefined;

  for (const beat of beats) {
    const text = beat.text?.trim();
    // An empty beat is a slot the outliner is holding open, not a pause. It
    // reads as a blank paragraph and is worth nothing to anyone downstream.
    if (!text) continue;

    if (marks && beat.story_section !== section) {
      section = beat.story_section;
      if (section) blocks.push(`${section.toUpperCase()}\n${"─".repeat(section.length)}`);
    }

    if (!marks) {
      blocks.push(text);
      continue;
    }

    const at = clock(times.get(beat.id)?.startSec ?? 0);
    const role = beat.story_role ? `  ${beat.story_role.toUpperCase()}` : "";
    blocks.push(`[${at}]${role}\n${text}`);
  }

  return blocks.join("\n\n");
}
