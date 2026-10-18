"use client";

import { useRef } from "react";
import { captureHook } from "./actions";

// Same shape as the idea capture form, and for the same reason: the field
// clears on submit so you can type the next one without waiting for the round
// trip. Hooks arrive in bursts — you write ten to find one — and a form that
// makes you wait between them is a form that gets three.
export function HookCaptureForm() {
  const formRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <form
      ref={formRef}
      action={async (fd) => {
        formRef.current?.reset();
        inputRef.current?.focus();
        await captureHook(fd);
      }}
      className="flex gap-2"
    >
      <input
        ref={inputRef}
        name="text"
        required
        autoFocus
        autoComplete="off"
        placeholder="if I had to…"
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
