"use client";

import { useState } from "react";

/**
 * The Final Hook Checklist (HOOK-16), read out of the library.
 *
 * Collapsed by default and deliberately not wired to anything. These are
 * questions to spark the next line, not boxes — the moment a checklist can be
 * ticked it becomes something to complete, and eighteen ticks per hook is how
 * you end up writing three hooks a month instead of thirty.
 *
 * It reads the component body rather than hard-coding the questions, so editing
 * HOOK-16 in /library changes what this screen prompts you with.
 */
export function Prompts({ items }: { items: string[] }) {
  const [open, setOpen] = useState(false);

  if (items.length === 0) return null;

  return (
    <div className="mt-4">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="text-[11px] text-ink-faint transition-colors hover:text-ink-dim"
      >
        {open ? "hide" : "stuck?"} prompts ({items.length})
      </button>

      {open && (
        <ul className="mt-2 grid gap-x-6 gap-y-1 border-l border-border-soft pl-3 sm:grid-cols-2">
          {items.map((q) => (
            <li key={q} className="text-[11px] text-ink-dim">
              {q}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
