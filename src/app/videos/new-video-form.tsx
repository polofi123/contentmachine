"use client";

import { useState } from "react";
import { createVideo, logOutlier } from "./actions";

const input =
  "w-full rounded-md border border-border bg-surface-2 px-2.5 py-1.5 text-sm outline-none placeholder:text-ink-faint focus:border-accent-dim";

// Starting a video takes one thought, same as capturing an idea. Everything
// else on the workbench is optional and can be filled in whenever.
export function NewVideoForm() {
  return (
    <form action={createVideo} className="flex gap-2">
      <input
        name="title"
        required
        autoComplete="off"
        placeholder="video about…"
        className="min-w-0 flex-1 rounded-lg border border-border bg-surface px-3.5 py-2.5 text-sm outline-none placeholder:text-ink-faint focus:border-accent-dim"
      />
      <button
        type="submit"
        className="shrink-0 rounded-lg border border-accent-dim px-4 py-2.5 text-sm text-accent transition-colors hover:bg-accent-dim/15"
      >
        Start
      </button>
    </form>
  );
}

export function LogOutlierForm() {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-3 w-full rounded-lg border border-dashed border-border-soft px-3 py-2 text-left text-xs text-ink-faint transition-colors hover:border-border hover:text-ink-dim"
      >
        + Log an outlier
      </button>
    );
  }

  return (
    <form action={logOutlier} className="mt-3 space-y-2 rounded-lg border border-border bg-surface p-3">
      <input name="title" required autoFocus placeholder="Title" className={input} />
      <input name="url" placeholder="URL" className={input} />
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <input name="channel_name" placeholder="Channel" className={input} />
        <input name="views" type="number" min="0" placeholder="Views" className={input} />
        <input
          name="channel_avg_views"
          type="number"
          min="0"
          placeholder="Channel avg views"
          className={input}
        />
      </div>
      <p className="text-[11px] text-ink-faint">
        Outlier score is derived from these two (MINE-02), never stored — so it moves as views do.
      </p>
      <div className="flex gap-2">
        <button
          type="submit"
          className="rounded-md border border-accent-dim px-2.5 py-1 text-xs text-accent hover:bg-accent-dim/15"
        >
          Log
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
