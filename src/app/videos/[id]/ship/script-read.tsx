"use client";

import { useState } from "react";

/**
 * The whole script, as one readable block.
 *
 * No per-line controls on purpose. This is the read view — the words in the
 * order you will say them, at a size you can follow from arm's length behind a
 * camera. Editing a word here would mean rebuilding the outliner, and the
 * outliner is one tab away.
 *
 * Copy takes exactly what is rendered, because both come from the same string.
 * A copy button that quietly exported something other than what is on screen
 * would be worse than no copy button.
 */
export function ScriptRead({
  plain,
  marked,
  words,
  runtime,
}: {
  plain: string;
  marked: string;
  words: number;
  runtime: string;
}) {
  const [marks, setMarks] = useState(false);
  const [copied, setCopied] = useState<"idle" | "done" | "failed">("idle");

  const text = marks ? marked : plain;

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied("done");
    } catch {
      // Clipboard access needs a secure context and permission. Saying so beats
      // a button that silently does nothing.
      setCopied("failed");
    }
    setTimeout(() => setCopied("idle"), 2000);
  }

  const toggle = (active: boolean) =>
    `rounded px-2 py-1 text-[11px] tracking-wide transition-colors ${
      active ? "bg-accent-dim/20 text-accent" : "text-ink-faint hover:text-ink-dim"
    }`;

  return (
    <section className="rounded-xl border border-border-soft bg-surface px-4 py-3">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h2 className="mr-auto text-sm text-ink">The script</h2>

        <div className="flex gap-0.5 rounded-lg border border-border-soft p-0.5">
          <button type="button" onClick={() => setMarks(false)} className={toggle(!marks)}>
            WORDS ONLY
          </button>
          <button type="button" onClick={() => setMarks(true)} className={toggle(marks)}>
            WITH MARKS
          </button>
        </div>

        <button
          type="button"
          onClick={copy}
          className="rounded-md border border-accent-dim px-2.5 py-1 text-xs text-accent transition-colors hover:bg-accent-dim/15"
        >
          {copied === "done" ? "Copied" : copied === "failed" ? "Copy blocked" : "Copy"}
        </button>
      </div>

      {/* Selectable, so the manual route works even where the clipboard API
          doesn't. Wider leading than the app's default: this is read aloud. */}
      <div className="max-h-[60vh] overflow-y-auto whitespace-pre-wrap rounded-lg border border-border-soft bg-surface-2 px-4 py-3.5 text-[15px] leading-[1.75] text-ink-dim selection:bg-accent-dim">
        {text}
      </div>

      <p className="mt-2 text-[11px] text-ink-faint">
        {words} words · {runtime} spoken, estimated from the words
        {copied === "failed" && " · select the text above and copy by hand"}
      </p>
    </section>
  );
}
