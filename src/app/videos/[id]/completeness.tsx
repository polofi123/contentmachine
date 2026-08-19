"use client";

import { useState } from "react";
import { addSlot } from "./actions";

export type SlotSummary = {
  key: string;
  label: string;
  state: "empty" | "filled" | "skipped";
};

// A completeness meter, not a gate. It never blocks, never warns, never turns
// red. It reports what you left on the table and lets you decide.
export function Completeness({
  videoId,
  slots,
  available,
}: {
  videoId: string;
  slots: SlotSummary[];
  available: { key: string; label: string; description: string | null }[];
}) {
  const [open, setOpen] = useState(false);

  const filled = slots.filter((s) => s.state === "filled").length;
  const skipped = slots.filter((s) => s.state === "skipped");
  const empty = slots.filter((s) => s.state === "empty");
  const total = slots.length;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-lg border border-border-soft px-2.5 py-1.5 transition-colors hover:border-border"
      >
        <span className="flex gap-[2px]">
          {slots.map((s) => (
            <span
              key={s.key}
              className={`h-3.5 w-[3px] rounded-full ${
                s.state === "filled"
                  ? "bg-accent"
                  : s.state === "skipped"
                    ? "bg-ink-faint"
                    : "bg-border"
              }`}
            />
          ))}
        </span>
        <span className="font-mono text-[11px] text-ink-dim">
          {filled}/{total}
        </span>
      </button>

      {open && (
        <div className="absolute right-0 z-30 mt-2 w-72 rounded-xl border border-border bg-surface p-3 shadow-xl">
          <p className="mb-2 text-[11px] text-ink-faint">
            Against the slots <em>this build</em> opted into — not the whole framework.
          </p>

          {empty.length > 0 && (
            <div className="mb-2.5">
              <p className="mb-1 text-[11px] text-ink-dim">Left on the table</p>
              <ul className="space-y-0.5">
                {empty.map((s) => (
                  <li key={s.key}>
                    <a href={`#${s.key}`} className="text-xs text-ink-faint hover:text-accent">
                      {s.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {skipped.length > 0 && (
            <div className="mb-2.5">
              <p className="mb-1 text-[11px] text-ink-dim">Deliberately skipped</p>
              <ul className="space-y-0.5">
                {skipped.map((s) => (
                  <li key={s.key} className="text-xs text-ink-faint line-through">
                    {s.label}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {empty.length === 0 && skipped.length === 0 && (
            <p className="mb-2.5 text-xs text-accent">Everything this build asked for is filled.</p>
          )}

          {available.length > 0 && (
            <div className="border-t border-border-soft pt-2">
              <p className="mb-1 text-[11px] text-ink-dim">Add a slot</p>
              <div className="flex flex-wrap gap-1">
                {available.map((s) => (
                  <form key={s.key} action={addSlot}>
                    <input type="hidden" name="video_id" value={videoId} />
                    <input type="hidden" name="slot_key" value={s.key} />
                    <button
                      type="submit"
                      title={s.description ?? undefined}
                      className="rounded border border-border px-1.5 py-0.5 text-[10px] text-ink-faint transition-colors hover:border-accent-dim hover:text-accent"
                    >
                      + {s.label}
                    </button>
                  </form>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
