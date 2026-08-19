"use client";

import { useRef } from "react";
import { captureIdea } from "./actions";

// Optimistic-feeling capture: the field clears immediately on submit so you can
// type the next one without waiting for the round trip. Fast capture is the
// whole reason this screen exists separately from the library.
export function CaptureForm() {
  const formRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <form
      ref={formRef}
      action={async (fd) => {
        formRef.current?.reset();
        inputRef.current?.focus();
        await captureIdea(fd);
      }}
      className="flex gap-2"
    >
      <input
        ref={inputRef}
        name="title"
        required
        autoFocus
        autoComplete="off"
        placeholder="video about…"
        className="min-w-0 flex-1 rounded-lg border border-border bg-surface px-3.5 py-3 text-base outline-none placeholder:text-ink-faint focus:border-accent-dim"
      />
      <button
        type="submit"
        className="shrink-0 rounded-lg border border-accent-dim px-4 py-3 text-sm text-accent transition-colors hover:bg-accent-dim/15"
      >
        Log
      </button>
    </form>
  );
}
