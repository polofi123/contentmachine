"use client";

import { useState } from "react";
import { setSlotState, removeSlot } from "./actions";

export type SlotState = "empty" | "filled" | "skipped";

const DOT: Record<SlotState, string> = {
  filled: "bg-accent",
  skipped: "bg-ink-faint",
  empty: "bg-border",
};

// The card is the whole interaction model: no next/back, no enforced order,
// nothing blocking. Open what you want, skip what you don't, ship regardless.
export function SlotCard({
  videoId,
  slotKey,
  label,
  description,
  state,
  summary,
  defaultOpen = false,
  children,
}: {
  videoId: string;
  slotKey: string;
  label: string;
  description?: string | null;
  state: SlotState;
  summary?: string | null;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const skipped = state === "skipped";

  return (
    <section
      id={slotKey}
      className={`scroll-mt-20 rounded-xl border transition-colors ${
        skipped ? "border-dashed border-border-soft" : "border-border-soft bg-surface"
      }`}
    >
      <div className="flex items-start gap-3 px-4 py-3">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex min-w-0 flex-1 items-start gap-3 text-left"
        >
          <span className={`mt-[7px] h-2 w-2 shrink-0 rounded-full ${DOT[state]}`} />
          <span className="min-w-0 flex-1">
            <span
              className={`block text-sm ${skipped ? "text-ink-faint line-through" : "text-ink"}`}
            >
              {label}
            </span>
            {summary && !open && (
              <span className="mt-0.5 block truncate text-xs text-ink-faint">{summary}</span>
            )}
            {!summary && !open && description && (
              <span className="mt-0.5 block truncate text-xs text-ink-faint">{description}</span>
            )}
          </span>
        </button>

        <div className="flex shrink-0 items-center gap-2">
          {/* Skipping is a recorded decision, not an empty field. It is also
              what keeps the meter honest — a skipped slot still counts in the
              denominator, so you can see what you chose to leave out. */}
          <form action={setSlotState}>
            <input type="hidden" name="video_id" value={videoId} />
            <input type="hidden" name="slot_key" value={slotKey} />
            <input type="hidden" name="state" value={skipped ? "empty" : "skipped"} />
            <button
              type="submit"
              className="text-[11px] text-ink-faint transition-colors hover:text-accent"
            >
              {skipped ? "unskip" : "skip"}
            </button>
          </form>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="w-3 font-mono text-[11px] text-ink-faint"
            aria-label={open ? "Collapse" : "Expand"}
          >
            {open ? "−" : "+"}
          </button>
        </div>
      </div>

      {open && (
        <div className="border-t border-border-soft px-4 py-4">
          {description && <p className="mb-3 text-xs text-ink-faint">{description}</p>}
          {skipped ? (
            <p className="text-xs italic text-ink-faint">
              Skipped. That&apos;s recorded as a decision, not a blank — it&apos;s still counted so
              you can see what you left out.
            </p>
          ) : (
            children
          )}
          <form action={removeSlot} className="mt-4 border-t border-border-soft pt-3">
            <input type="hidden" name="video_id" value={videoId} />
            <input type="hidden" name="slot_key" value={slotKey} />
            <button
              type="submit"
              className="text-[10px] text-ink-faint transition-colors hover:text-accent"
            >
              this build doesn&apos;t need {label.toLowerCase()} — drop the slot
            </button>
          </form>
        </div>
      )}
    </section>
  );
}
