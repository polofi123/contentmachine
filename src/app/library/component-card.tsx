"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { updateComponent, setArchived, namePlaceholder } from "./actions";

export type ComponentRow = {
  id: string;
  source_id: string | null;
  name: string;
  body: string | null;
  is_seeded: boolean;
  is_placeholder: boolean;
  archived_at: string | null;
  children?: ComponentRow[];
};

// True while the page address points at this card (/library#c-<id>), so a link from
// elsewhere lands on it already open.
const subscribeHash = (cb: () => void) => {
  window.addEventListener("hashchange", cb);
  return () => window.removeEventListener("hashchange", cb);
};

function Chip({ children, tone = "dim" }: { children: React.ReactNode; tone?: "dim" | "accent" | "warn" }) {
  const tones = {
    dim: "border-border text-ink-faint",
    accent: "border-accent-dim text-accent",
    warn: "border-accent-dim/60 text-accent/80",
  };
  return (
    <span
      className={`shrink-0 rounded border px-1.5 py-0.5 font-mono text-[10px] leading-none tracking-wide ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

export function ComponentCard({ c, depth = 0 }: { c: ComponentRow; depth?: number }) {
  const [userOpen, setOpen] = useState<boolean | null>(null);
  const [editing, setEditing] = useState(false);
  const anchor = `c-${c.id}`;
  const linked = useSyncExternalStore(subscribeHash, () => window.location.hash === `#${anchor}`, () => false);
  // Until the user clicks, the address decides; after that, their click does.
  const open = userOpen ?? linked;
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (linked) box.current?.scrollIntoView({ block: "center" });
  }, [linked]);

  const archived = Boolean(c.archived_at);

  return (
    <div id={anchor} ref={box} className={`scroll-mt-20 ${depth > 0 ? "ml-4 border-l border-border-soft pl-4 sm:ml-6 sm:pl-5" : ""}`}>
      <div
        className={`rounded-lg border transition-colors ${
          c.is_placeholder
            ? "border-dashed border-border bg-transparent"
            : "border-border-soft bg-surface hover:border-border"
        } ${archived ? "opacity-40" : ""}`}
      >
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="flex w-full items-start gap-2.5 px-3 py-2.5 text-left"
        >
          <span className="mt-0.5 w-3 shrink-0 font-mono text-[10px] text-ink-faint">
            {open ? "−" : "+"}
          </span>

          {c.source_id ? (
            <Chip tone={c.is_placeholder ? "warn" : "dim"}>{c.source_id}</Chip>
          ) : (
            <Chip tone="accent">mine</Chip>
          )}

          <span
            className={`min-w-0 flex-1 text-sm ${
              c.is_placeholder ? "italic text-ink-faint" : "text-ink"
            }`}
          >
            {c.name}
          </span>

          {archived && <Chip>archived</Chip>}
        </button>

        {open && (
          <div className="border-t border-border-soft px-3 py-3">
            {c.is_placeholder ? (
              <>
                <p className="prose-body mb-3 text-[13px] text-ink-dim">{c.body}</p>
                <form action={namePlaceholder} className="space-y-2">
                  <input type="hidden" name="id" value={c.id} />
                  <input
                    name="name"
                    required
                    placeholder="Name it, if you've recovered it"
                    className="w-full rounded-md border border-border bg-surface-2 px-2.5 py-1.5 text-sm outline-none placeholder:text-ink-faint focus:border-accent-dim"
                  />
                  <textarea
                    name="body"
                    rows={3}
                    placeholder="Definition"
                    className="w-full resize-none rounded-md border border-border bg-surface-2 px-2.5 py-1.5 text-[13px] outline-none placeholder:text-ink-faint focus:border-accent-dim"
                  />
                  <button
                    type="submit"
                    className="rounded-md border border-accent-dim px-2.5 py-1 text-xs text-accent hover:bg-accent-dim/15"
                  >
                    Name this slot
                  </button>
                </form>
              </>
            ) : editing ? (
              <form action={updateComponent} className="space-y-2">
                <input type="hidden" name="id" value={c.id} />
                <input
                  name="name"
                  defaultValue={c.name}
                  required
                  className="w-full rounded-md border border-border bg-surface-2 px-2.5 py-1.5 text-sm outline-none focus:border-accent-dim"
                />
                <textarea
                  name="body"
                  defaultValue={c.body ?? ""}
                  rows={8}
                  className="w-full rounded-md border border-border bg-surface-2 px-2.5 py-1.5 font-mono text-[12px] leading-relaxed outline-none focus:border-accent-dim"
                />
                <div className="flex gap-2">
                  <button
                    type="submit"
                    className="rounded-md border border-accent-dim px-2.5 py-1 text-xs text-accent hover:bg-accent-dim/15"
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditing(false)}
                    className="rounded-md px-2.5 py-1 text-xs text-ink-faint hover:text-ink"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            ) : (
              <>
                {c.body ? (
                  <p className="prose-body text-[13px] text-ink-dim">{c.body}</p>
                ) : (
                  <p className="text-[13px] italic text-ink-faint">No definition recorded.</p>
                )}
                <div className="mt-3 flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setEditing(true)}
                    className="text-xs text-ink-faint hover:text-accent"
                  >
                    Edit
                  </button>
                  <form action={setArchived}>
                    <input type="hidden" name="id" value={c.id} />
                    <input type="hidden" name="archived" value={archived ? "false" : "true"} />
                    <button type="submit" className="text-xs text-ink-faint hover:text-accent">
                      {archived ? "Restore" : "Archive"}
                    </button>
                  </form>
                  {c.is_seeded && (
                    <span className="ml-auto text-[10px] text-ink-faint">
                      seeded — edits survive re-seeding
                    </span>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {c.children && c.children.length > 0 && (
        <div className="mt-1.5 space-y-1.5">
          {c.children.map((child) => (
            <ComponentCard key={child.id} c={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}
