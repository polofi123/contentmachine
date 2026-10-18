"use client";

import { useState, useTransition } from "react";
import {
  buildFromHook,
  dropHook,
  keepRiff,
  riffHook,
  toggleBankHookWord,
  type Riff,
} from "./actions";

export type WordType = { id: string; source_id: string | null; name: string };

// The four words the framework treats as load-bearing. Time (HOOKW-05) and
// Proof (HOOKW-06) say "Optional" in their own bodies, so a line missing those
// is not incomplete — calling it incomplete would train you to bolt "in 30
// days" onto hooks that never needed it.
const CORE = new Set(["HOOKW-01", "HOOKW-02", "HOOKW-03", "HOOKW-04"]);

// The chips are one-word so six of them fit on a phone. The full name stays in
// the title attribute rather than being dropped.
const SHORT: Record<string, string> = {
  "HOOKW-01": "subject",
  "HOOKW-02": "action",
  "HOOKW-03": "objective",
  "HOOKW-04": "contrast",
  "HOOKW-05": "time",
  "HOOKW-06": "proof",
};

export function HookRow({
  hook,
  wordTypes,
  tagged,
  aiOn,
}: {
  hook: { id: string; text: string };
  wordTypes: WordType[];
  tagged: string[];
  aiOn: boolean;
}) {
  const [riffs, setRiffs] = useState<Riff[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const has = (w: WordType) => tagged.includes(w.id);
  const missingCore = wordTypes.filter((w) => w.source_id && CORE.has(w.source_id) && !has(w));

  return (
    <li className="group py-3">
      <p className="text-sm text-ink">{hook.text}</p>

      <div className="mt-2 flex flex-wrap items-center gap-1">
        {wordTypes.map((w) => {
          const on = has(w);
          return (
            <form key={w.id} action={toggleBankHookWord}>
              <input type="hidden" name="hook_id" value={hook.id} />
              <input type="hidden" name="component_id" value={w.id} />
              <input type="hidden" name="tagged" value={String(on)} />
              <button
                type="submit"
                title={w.name}
                className={`rounded border px-1.5 py-0.5 text-[10px] transition-colors ${
                  on
                    ? "border-accent-dim bg-accent-dim/15 text-accent"
                    : "border-border text-ink-faint hover:text-ink-dim"
                }`}
              >
                {(w.source_id && SHORT[w.source_id]) ?? w.name}
              </button>
            </form>
          );
        })}
      </div>

      {/* Only ever the four core words, and only ever as a note. The bank is a
          brainstorm, not a checklist to satisfy before you are allowed to keep
          a line. */}
      {missingCore.length > 0 && tagged.length > 0 && (
        <p className="mt-1.5 text-[11px] text-ink-faint">
          missing {missingCore.map((w) => (w.source_id && SHORT[w.source_id]) ?? w.name).join(" · ")}
        </p>
      )}

      <div className="mt-2 flex items-center gap-3">
        {aiOn && (
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              start(async () => {
                setError(null);
                try {
                  setRiffs(await riffHook(hook.id));
                } catch (e) {
                  setError(e instanceof Error ? e.message : "That did not come back.");
                }
              })
            }
            className="text-[11px] text-ink-faint transition-colors hover:text-accent disabled:text-ink-faint"
          >
            {pending ? "riffing…" : riffs ? "riff again" : "riff on this"}
          </button>
        )}

        <form action={buildFromHook} className="ml-auto">
          <input type="hidden" name="hook_id" value={hook.id} />
          <button
            type="submit"
            aria-label={`Build a video from "${hook.text}"`}
            className="text-xs text-transparent transition-colors group-hover:text-ink-faint hover:!text-accent"
          >
            build
          </button>
        </form>
        <form action={dropHook}>
          <input type="hidden" name="id" value={hook.id} />
          <button
            type="submit"
            aria-label={`Drop "${hook.text}"`}
            className="text-xs text-transparent transition-colors group-hover:text-ink-faint hover:!text-accent"
          >
            drop
          </button>
        </form>
      </div>

      {error && <p className="mt-2 text-[11px] text-ink-dim">{error}</p>}

      {/* Riffs live on the screen and nowhere else until you keep one. */}
      {riffs && (
        <div className="mt-2 space-y-1 border-l border-border-soft pl-3">
          {riffs.length === 0 && (
            <p className="text-[11px] text-ink-faint">Nothing worth adding to that one.</p>
          )}
          {riffs.map((r, i) => (
            <form key={i} action={keepRiff} className="flex items-start gap-2">
              <input type="hidden" name="text" value={r.text} />
              <span className="min-w-0 flex-1">
                <span className="text-xs text-ink-dim">{r.text}</span>
                {r.adds && (
                  <span className="ml-2 font-mono text-[10px] text-ink-faint">{r.adds}</span>
                )}
              </span>
              <button
                type="submit"
                className="shrink-0 text-[11px] text-ink-faint transition-colors hover:text-accent"
              >
                keep
              </button>
            </form>
          ))}
        </div>
      )}
    </li>
  );
}
