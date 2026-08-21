"use client";

import { useState, useTransition } from "react";
import { cycleTrayComponent } from "./actions";

export type TrayComponent = {
  id: string;
  source_id: string | null;
  name: string;
  layer_id: string;
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
 * The variables, next to the writing.
 *
 * This is the question the workspace exists to answer mid-sentence: what does
 * this video still need? A psychology gate, a format, a re-hook, a story loop —
 * all of it visible while the words can still change, rather than as cards
 * below the script that can only ever review what is already written.
 *
 * Two ways to say a technique is in play, and they mean different things:
 *
 *   typing / on a line   plants it THERE, and the placement is derived
 *   tapping a chip here  says the video uses it, without claiming a moment
 *
 * Anything already planted on a line drops out of here — it is in the script
 * now, and listing it again would just be the checklist growing a second copy
 * of itself.
 *
 * Tapping still cycles used → skipped → clear, because `skipped` has to stay a
 * recorded row. "I considered this and said no" is a different fact from "I
 * never thought about it", and only the first makes the eventual "videos
 * without an open loop averaged 2k views" an honest sentence.
 */
export function Tray({ videoId, components }: { videoId: string; components: TrayComponent[] }) {
  const [local, setLocal] = useState(components);
  const [, startTransition] = useTransition();
  const [openGroup, setOpenGroup] = useState<string | null>(null);

  const loose = local.filter((c) => !c.anchored);
  if (loose.length === 0) return null;

  const cycle = (c: TrayComponent) => {
    const next = c.state === "none" ? "used" : c.state === "used" ? "skipped" : "none";
    setLocal((all) => all.map((x) => (x.id === c.id ? { ...x, state: next } : x)));
    startTransition(() => {
      cycleTrayComponent(videoId, c.id, c.state);
    });
  };

  const groups = Array.from(new Set(loose.map((c) => c.layer_label)));
  const planted = local.filter((c) => c.anchored).length;
  const marked = loose.filter((c) => c.state === "used").length;
  const skipped = loose.filter((c) => c.state === "skipped").length;

  return (
    <section className="mt-6 rounded-xl border border-border-soft px-3 py-2.5">
      <div className="mb-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-[10px] tracking-wide text-ink-dim">VARIABLES</span>
        <span className="font-mono text-[10px] text-ink-faint">
          {planted} planted · {marked} used · {skipped} skipped
        </span>
        <span className="ml-auto text-[10px] text-ink-faint">
          <span className="font-mono text-ink-dim">/</span> on a line to place one
        </span>
      </div>

      <div className="flex flex-wrap gap-1">
        {groups.map((group) => {
          const items = loose.filter((c) => c.layer_label === group);
          const on = items.filter((c) => c.state === "used").length;
          const isOpen = openGroup === group;

          return (
            <button
              key={group}
              type="button"
              onClick={() => setOpenGroup(isOpen ? null : group)}
              className={`rounded-lg border px-2 py-1 text-[11px] transition-colors ${
                isOpen
                  ? "border-accent-dim text-accent"
                  : on > 0
                    ? "border-border text-ink-dim"
                    : "border-border-soft text-ink-faint hover:text-ink-dim"
              }`}
            >
              {group}{" "}
              <span className="font-mono opacity-60">
                {on}/{items.length}
              </span>
            </button>
          );
        })}
      </div>

      {openGroup && (
        <div className="mt-2 flex max-h-48 flex-wrap gap-1 overflow-y-auto rounded-lg border border-border-soft bg-surface-2 p-1.5">
          {loose
            .filter((c) => c.layer_label === openGroup)
            .map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => cycle(c)}
                title={c.source_id ?? undefined}
                className={`rounded-lg border px-2 py-1 text-[11px] transition-colors ${STATE_STYLE[c.state]}`}
              >
                {c.name}
              </button>
            ))}
        </div>
      )}
    </section>
  );
}
