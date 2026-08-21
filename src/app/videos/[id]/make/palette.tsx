"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export type PaletteComponent = {
  id: string;
  source_id: string | null;
  name: string;
  layer_id: string | null;
  layer_label: string;
  layer_sort: number;
};

/**
 * The framework, on the keyboard.
 *
 * Dragging a technique in from a rail means leaving the keyboard mid-sentence,
 * which is the wrong cost for someone who is writing. `/` brings the same
 * library to the caret instead.
 *
 * Entirely data-driven: it lists whatever is in `components`, grouped by layer.
 * Naming a new technique in /library makes it appear here with no code change,
 * which is the promise the rest of the workbench already keeps.
 */
export function Palette({
  components,
  onPick,
  onClose,
}: {
  components: PaletteComponent[];
  onPick: (component: PaletteComponent) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    const hit = q
      ? components.filter(
          (c) =>
            c.name.toLowerCase().includes(q) ||
            (c.source_id ?? "").toLowerCase().includes(q) ||
            c.layer_label.toLowerCase().includes(q),
        )
      : components;
    return hit.slice(0, 60);
  }, [components, query]);

  // Which rows start a new layer, computed once rather than by mutating a
  // variable while rendering the list.
  const startsLayer = useMemo(() => {
    const set = new Set<number>();
    matches.forEach((c, i) => {
      if (i === 0 || c.layer_label !== matches[i - 1].layer_label) set.add(i);
    });
    return set;
  }, [matches]);

  // Keep the highlighted row in view when arrowing past the fold.
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-index="${cursor}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [cursor]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setCursor((c) => Math.min(c + 1, matches.length - 1));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setCursor((c) => Math.max(c - 1, 0));
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      const picked = matches[cursor];
      if (picked) onPick(picked);
    }
  };

  return (
    <div className="absolute left-6 top-full z-40 mt-1 w-80 rounded-xl border border-border bg-surface shadow-xl">
      <input
        ref={inputRef}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          // A new query means a new shortlist; the old highlight is meaningless.
          setCursor(0);
        }}
        onKeyDown={onKeyDown}
        onBlur={onClose}
        placeholder="What is this line doing?"
        className="w-full rounded-t-xl border-b border-border-soft bg-transparent px-3 py-2 text-sm text-ink outline-none placeholder:text-ink-faint"
      />

      <div ref={listRef} className="max-h-64 overflow-y-auto py-1">
        {matches.length === 0 && (
          <p className="px-3 py-2 text-xs text-ink-faint">
            Nothing matches. Anything you name in /library shows up here.
          </p>
        )}

        {matches.map((c, i) => {
          return (
            <div key={c.id}>
              {startsLayer.has(i) && (
                <p className="px-3 pb-0.5 pt-2 text-[10px] tracking-wide text-ink-faint">
                  {c.layer_label.toUpperCase()}
                </p>
              )}
              <button
                type="button"
                data-index={i}
                // onMouseDown, not onClick: the input's blur would close the
                // palette before a click ever landed.
                onMouseDown={(e) => {
                  e.preventDefault();
                  onPick(c);
                }}
                onMouseEnter={() => setCursor(i)}
                className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors ${
                  i === cursor ? "bg-accent-dim/15 text-accent" : "text-ink-dim"
                }`}
              >
                {c.source_id && (
                  <span className="shrink-0 font-mono text-[10px] opacity-60">{c.source_id}</span>
                )}
                <span className="min-w-0 flex-1 truncate">{c.name}</span>
              </button>
            </div>
          );
        })}
      </div>

      <p className="border-t border-border-soft px-3 py-1.5 text-[10px] text-ink-faint">
        ↑↓ move · enter — plant here · esc — back to writing
      </p>
    </div>
  );
}
