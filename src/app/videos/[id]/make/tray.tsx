"use client";

import { useState, useTransition } from "react";
import { cycleTrayComponent } from "./actions";

export type TrayComponent = {
  id: string;
  source_id: string | null;
  name: string;
  layer_label: string;
  state: "none" | "used" | "skipped";
  /** True when this technique is already planted on a line. */
  anchored: boolean;
};

const STATE_STYLE = {
  used: "border-accent-dim bg-accent-dim/10 text-accent",
  skipped: "border-border bg-transparent text-ink-faint line-through",
  none: "border-border-soft text-ink-dim hover:border-border",
} as const;

/**
 * What is left over.
 *
 * The retention and checkpoint slots used to be cards below the script, which
 * meant you met them only after the writing was done — at which point they can
 * only criticise. Here they are the bricks you have not used yet, sitting next
 * to the thing they belong in.
 *
 * Anything already planted on a line disappears from the tray: it is in the
 * script now, and repeating it here would just be a checklist growing a second
 * copy of itself.
 *
 * Tapping still cycles used → skipped → clear, because `skipped` has to stay a
 * recorded row. "I considered this and said no" is a different fact from "I
 * never thought about it", and only the first one makes the eventual
 * "videos without an open loop averaged 2k views" an honest sentence.
 */
export function Tray({ videoId, components }: { videoId: string; components: TrayComponent[] }) {
  const [local, setLocal] = useState(components);
  const [, startTransition] = useTransition();
  const [open, setOpen] = useState(false);

  const loose = local.filter((c) => !c.anchored);
  if (loose.length === 0) return null;

  const cycle = (c: TrayComponent) => {
    const next = c.state === "none" ? "used" : c.state === "used" ? "skipped" : "none";
    setLocal((all) => all.map((x) => (x.id === c.id ? { ...x, state: next } : x)));
    startTransition(() => {
      cycleTrayComponent(videoId, c.id, c.state);
    });
  };

  const considered = loose.filter((c) => c.state !== "none").length;

  return (
    <section className="mt-6 rounded-xl border border-border-soft px-3 py-2.5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-baseline gap-2 text-left"
      >
        <span className="text-[10px] tracking-wide text-ink-dim">NOT PLACED YET</span>
        <span className="font-mono text-[10px] text-ink-faint">
          {loose.length - considered} untouched
        </span>
        <span className="ml-auto font-mono text-[11px] text-ink-faint">{open ? "−" : "+"}</span>
      </button>

      {open && (
        <>
          <p className="mb-2 mt-2 text-[11px] text-ink-faint">
            Type <span className="font-mono text-ink-dim">/</span> on a line to plant one where it
            belongs. Or tap to mark <span className="text-accent">used</span> without a place, again
            for <span className="line-through">skipped</span>, again to clear.
          </p>

          <div className="flex flex-wrap gap-1">
            {loose.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => cycle(c)}
                title={`${c.layer_label} · ${c.source_id ?? ""}`}
                className={`rounded-lg border px-2 py-1 text-[11px] transition-colors ${STATE_STYLE[c.state]}`}
              >
                {c.name}
              </button>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
