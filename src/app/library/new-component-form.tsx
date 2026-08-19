"use client";

import { useState, useRef } from "react";
import { createComponent } from "./actions";

// Adding a piece the framework doesn't have is a first-class action, not an
// admin screen: the bin of parts is meant to grow.
export function NewComponentForm({
  layerId,
  layerLabel,
}: {
  layerId: string;
  layerLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-2 w-full rounded-lg border border-dashed border-border-soft px-3 py-2 text-left text-xs text-ink-faint transition-colors hover:border-border hover:text-ink-dim"
      >
        + Add to {layerLabel}
      </button>
    );
  }

  return (
    <form
      ref={formRef}
      action={async (fd) => {
        await createComponent(fd);
        formRef.current?.reset();
        setOpen(false);
      }}
      className="mt-2 space-y-2 rounded-lg border border-border bg-surface p-3"
    >
      <input type="hidden" name="layer_id" value={layerId} />
      <input
        name="name"
        required
        autoFocus
        placeholder="Name"
        className="w-full rounded-md border border-border bg-surface-2 px-2.5 py-1.5 text-sm outline-none placeholder:text-ink-faint focus:border-accent-dim"
      />
      <textarea
        name="body"
        rows={4}
        placeholder="What it is, and when to reach for it"
        className="w-full rounded-md border border-border bg-surface-2 px-2.5 py-1.5 text-[13px] outline-none placeholder:text-ink-faint focus:border-accent-dim"
      />
      <div className="flex gap-2">
        <button
          type="submit"
          className="rounded-md border border-accent-dim px-2.5 py-1 text-xs text-accent hover:bg-accent-dim/15"
        >
          Add
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-md px-2.5 py-1 text-xs text-ink-faint hover:text-ink"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
