"use client";

import { useActionState, useEffect, useRef } from "react";
import { importReferences, type ImportResult } from "../actions";

const input =
  "w-full rounded-md border border-border bg-surface-2 px-2.5 py-1.5 text-sm outline-none placeholder:text-ink-faint focus:border-accent-dim";

// Paste one link or a whole column of them. The summary stays on screen after
// the field clears, so a skipped link can be read back and fixed.
export function ImportForm({ collectionId }: { collectionId: string }) {
  const [result, action, pending] = useActionState<ImportResult | null, FormData>(importReferences, null);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (result && !result.error) formRef.current?.reset();
  }, [result]);

  return (
    <div className="space-y-3">
      <form ref={formRef} action={action} className="space-y-2 rounded-lg border border-border bg-surface p-3">
        <input type="hidden" name="collection_id" value={collectionId} />
        <textarea
          name="urls"
          required
          rows={4}
          placeholder={"Paste YouTube, TikTok or Instagram links — one per line or comma-separated"}
          className={`${input} font-mono text-[13px]`}
        />
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <input name="title" maxLength={250} placeholder="Title (used when pasting a single link)" className={input} />
          <input name="note" maxLength={2000} placeholder="Why these are here (optional)" className={input} />
        </div>
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={pending}
            className="rounded-md border border-accent-dim px-2.5 py-1 text-xs text-accent hover:bg-accent-dim/15 disabled:opacity-50"
          >
            {pending ? "Importing…" : "Import"}
          </button>
          <span className="text-[11px] text-ink-faint">Links only — nothing is downloaded or scraped.</span>
        </div>
      </form>

      {result && (
        <div aria-live="polite" className="rounded-lg border border-border-soft px-3 py-2.5 text-sm">
          {result.error ? (
            <p role="alert" className="text-accent">{result.error}</p>
          ) : (
            <>
              <p className="text-ink">
                Added {result.added} {result.added === 1 ? "video" : "videos"}
                {result.skipped.length > 0 && (
                  <span className="text-ink-dim"> · {result.skipped.length} skipped</span>
                )}
              </p>
              {result.reused > 0 && (
                <p className="mt-0.5 text-[11px] text-ink-faint">
                  {result.reused} already in your library — linked, not copied.
                </p>
              )}
              {result.skipped.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {result.skipped.map((s, i) => (
                    <li key={i} className="flex gap-2 text-[12px]">
                      <span className="min-w-0 flex-1 truncate font-mono text-ink-dim" title={s.link}>{s.link}</span>
                      <span className="shrink-0 text-ink-faint">{s.reason}</span>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
