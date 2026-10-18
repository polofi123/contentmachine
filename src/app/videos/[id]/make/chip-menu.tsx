"use client";

import { useEffect, useRef } from "react";

export type ChipOption = { value: string; label: string; hint?: string };

/**
 * A short list of options, at the thing they apply to.
 *
 * Story roles are fourteen and dance relations are nine — too many to cycle
 * through by tapping, few enough that a search box would be theatre. So: a
 * small menu that opens where you clicked, closes on Escape or on the next
 * click anywhere else, and always carries an explicit "none" because unassigned
 * is a real answer rather than a state you have not reached yet.
 *
 * Deliberately not the slash palette. That is for the framework — 260-odd
 * components that need filtering. This is for a fixed vocabulary you can read
 * in one glance.
 */
export function ChipMenu({
  options,
  value,
  clearLabel,
  onPick,
  onClose,
  align = "right",
}: {
  options: ChipOption[];
  value: string | null;
  clearLabel: string;
  onPick: (value: string | null) => void;
  onClose: () => void;
  align?: "left" | "right";
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    // Pointer-down rather than click: a click that lands on the textarea
    // underneath should close this AND move the caret, not be swallowed.
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };

    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      className={`absolute top-full z-40 mt-1 w-52 overflow-hidden rounded-xl border border-border bg-surface shadow-xl ${
        align === "right" ? "right-0" : "left-0"
      }`}
    >
      <div className="max-h-64 overflow-y-auto py-1">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => onPick(option.value)}
            className={`block w-full px-2.5 py-1 text-left transition-colors ${
              option.value === value
                ? "bg-accent-dim/15 text-accent"
                : "text-ink-dim hover:bg-surface-2"
            }`}
          >
            <span className="text-[11px]">{option.label}</span>
            {option.hint && (
              <span className="block text-[9px] leading-tight text-ink-faint">{option.hint}</span>
            )}
          </button>
        ))}
      </div>

      <button
        type="button"
        onClick={() => onPick(null)}
        className="block w-full border-t border-border-soft px-2.5 py-1 text-left text-[10px] tracking-wide text-ink-faint transition-colors hover:text-accent"
      >
        {clearLabel}
      </button>
    </div>
  );
}
