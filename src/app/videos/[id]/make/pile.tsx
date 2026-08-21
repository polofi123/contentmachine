"use client";

import { useState } from "react";
import { useDraggable, useDroppable } from "@dnd-kit/core";

export type PileKind = "words" | "hooks" | "inbox";

export type PileItem = {
  /** Beat id for parked lines; hook or idea id otherwise. */
  id: string;
  kind: PileKind;
  text: string;
};

// The inbox starts closed. It is the whole global capture list, so it is the one
// group that has nothing to do with this video in particular — twenty unrelated
// ideas parked beside a half-written script is noise, and noise next to writing
// is the exact thing this workspace exists to remove. It stays one click away.
const GROUPS: { kind: PileKind; label: string; hint: string; openByDefault: boolean }[] = [
  { kind: "words", label: "WORDS", hint: "lines you pulled out of the script", openByDefault: true },
  { kind: "hooks", label: "HOOKS", hint: "candidates you didn't pick", openByDefault: true },
  { kind: "inbox", label: "INBOX", hint: "captured ideas", openByDefault: false },
];

/**
 * Loose bricks.
 *
 * The groups stay visually separate because they are not the same kind of
 * thing — a line you cut, a hook you passed over, and a raw captured idea have
 * different weight, and a single undifferentiated heap makes all three feel
 * like clutter.
 *
 * The pile is storage. What a fragment *becomes* is decided by where it lands:
 * dropped into the script it is a beat, and only the parked ones remember they
 * were ever anything else.
 */
export function Pile({ items }: { items: PileItem[] }) {
  const { setNodeRef, isOver } = useDroppable({ id: "pile-drop", data: { type: "pile" } });

  return (
    <aside
      ref={setNodeRef}
      className={`w-56 shrink-0 rounded-xl border p-3 transition-colors ${
        isOver ? "border-accent-dim bg-accent-dim/5" : "border-border-soft"
      }`}
    >
      <p className="mb-3 text-[10px] tracking-wide text-ink-dim">IDEA PILE</p>

      {GROUPS.map((group) => (
        <PileGroup
          key={group.kind}
          label={group.label}
          hint={group.hint}
          openByDefault={group.openByDefault}
          items={items.filter((i) => i.kind === group.kind)}
        />
      ))}

      {items.length === 0 && (
        <p className="text-[11px] leading-relaxed text-ink-faint">
          Empty. Drag a line here to set it aside without losing it.
        </p>
      )}
    </aside>
  );
}

function PileGroup({
  label,
  hint,
  openByDefault,
  items,
}: {
  label: string;
  hint: string;
  openByDefault: boolean;
  items: PileItem[];
}) {
  const [open, setOpen] = useState(openByDefault);
  if (items.length === 0) return null;

  return (
    <div className="mb-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title={hint}
        className="mb-1 flex w-full items-baseline gap-1.5 text-[10px] tracking-wide text-ink-faint transition-colors hover:text-ink-dim"
      >
        <span>{label}</span>
        <span className="font-mono opacity-60">{items.length}</span>
        <span className="ml-auto font-mono opacity-60">{open ? "−" : "+"}</span>
      </button>

      {open && (
        <div className="space-y-1">
          {items.map((item) => (
            <PileChip key={`${item.kind}:${item.id}`} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}

function PileChip({ item }: { item: PileItem }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `pile:${item.kind}:${item.id}`,
    data: { type: "pile", item },
  });

  return (
    <button
      ref={setNodeRef}
      type="button"
      {...attributes}
      {...listeners}
      style={transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined}
      className={`block w-full cursor-grab rounded-md border px-2 py-1.5 text-left text-[11px] leading-snug transition-colors active:cursor-grabbing ${
        isDragging
          ? "z-20 border-accent-dim bg-surface-2 text-ink"
          : "border-border-soft text-ink-faint hover:border-border hover:text-ink-dim"
      }`}
    >
      {item.text}
    </button>
  );
}
