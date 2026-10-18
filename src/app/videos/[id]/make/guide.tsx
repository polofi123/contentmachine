"use client";

import { useState } from "react";
import { WORD_TYPE_COLORS } from "../lego-options";
import { Pile, type PileItem } from "./pile";
import { StoryPanel } from "./story-panel";

export type WordType = {
  id: string;
  source_id: string | null;
  name: string;
  body: string | null;
};

export type Teaching = {
  source_id: string | null;
  name: string;
  body: string | null;
  /** Named children — HOOK-02's six words, LOOP-00's four steps. */
  children: { id: string; source_id: string | null; name: string; body: string | null }[];
};

export type ActiveTag = {
  id: string;
  componentId: string;
  text: string;
};

export const colorFor = (sourceId: string | null | undefined) =>
  (sourceId && WORD_TYPE_COLORS[sourceId]) || "#8a8a99";

/**
 * The panel that teaches the line you are standing on.
 *
 * The framework is 260-odd components and reading it is a separate activity
 * from writing. Putting the relevant fragment beside the caret means the
 * knowledge arrives when it is actionable — you are looking at your hook, so
 * you are shown what a hook is made of — instead of being something you have to
 * go and revise first.
 *
 * The idea pile moves behind a tab. It was taking a third of the screen to show
 * things that are useful occasionally; this is useful continuously.
 *
 * STORY is the third tab and shares the rail for the same reason: direction,
 * lens and open questions are things you decide WHILE writing, and a panel you
 * have to navigate to is a panel you stop opening. Three tabs is the ceiling —
 * the rail is a place to glance at, not a second workspace.
 */
export function Guide({
  label,
  teaching,
  wordTypes,
  tags,
  selection,
  onTag,
  onRemoveTag,
  siblings,
  pile,
  story,
}: {
  label: string | null;
  teaching: Teaching | null;
  wordTypes: WordType[];
  tags: ActiveTag[];
  selection: string | null;
  onTag: (componentId: string) => void;
  onRemoveTag: (tagId: string) => void;
  siblings: { id: string; source_id: string | null; name: string; body: string | null }[];
  pile: PileItem[];
  story: React.ComponentProps<typeof StoryPanel>;
}) {
  const [tab, setTab] = useState<"guide" | "story" | "pile">("guide");
  const [expanded, setExpanded] = useState<string | null>(null);

  const tabClass = (on: boolean) =>
    `rounded-md px-2 py-1 text-[10px] tracking-wide transition-colors ${
      on ? "bg-accent-dim/20 text-accent" : "text-ink-faint hover:text-ink-dim"
    }`;

  return (
    // Sticky, so the rail follows you up the script instead of scrolling away.
    //
    // This panel is about the line you are standing on — the teaching for it,
    // the review of it. All of that is useless if reaching the line means
    // leaving the panel behind, which is what a normal column does on a script
    // longer than a screen. It scrolls internally when its own content is
    // taller than the viewport.
    <aside className="sticky top-16 max-h-[calc(100vh-5rem)] w-[38%] shrink-0 self-start overflow-y-auto">
      <div className="mb-2 flex gap-0.5 rounded-lg border border-border-soft p-0.5">
        <button type="button" onClick={() => setTab("guide")} className={tabClass(tab === "guide")}>
          GUIDE
        </button>
        <button type="button" onClick={() => setTab("story")} className={tabClass(tab === "story")}>
          STORY
        </button>
        <button type="button" onClick={() => setTab("pile")} className={tabClass(tab === "pile")}>
          PILE
        </button>
      </div>

      {tab === "story" ? (
        <StoryPanel {...story} />
      ) : tab === "pile" ? (
        <Pile items={pile} bare />
      ) : (
        <div className="rounded-xl border border-border-soft px-3 py-3">
          {!teaching && !wordTypes.length && (
            <p className="text-[11px] leading-relaxed text-ink-faint">
              {label
                ? `Nothing in the library explains “${label}” yet. Name it in /library and it shows up here.`
                : "Put the caret on a line. Whatever that line is for, its part of the framework appears here."}
            </p>
          )}

          {teaching && (
            <>
              <p className="mb-1 flex items-baseline gap-2">
                <span className="text-[10px] tracking-wide text-ink-dim">
                  {(label ?? teaching.name).toUpperCase()}
                </span>
                {teaching.source_id && (
                  <span className="font-mono text-[10px] text-ink-faint">{teaching.source_id}</span>
                )}
              </p>
              {teaching.body && (
                <p className="prose-body mb-3 whitespace-pre-wrap text-[11px] leading-relaxed text-ink-faint">
                  {teaching.body}
                </p>
              )}
            </>
          )}

          {wordTypes.length > 0 && (
            <div className="mt-1">
              <p className="mb-1.5 text-[10px] tracking-wide text-ink-dim">
                {selection ? "TAG THE SELECTION" : "THE WORDS"}
              </p>

              {selection ? (
                <p className="mb-2 truncate rounded-md border border-border-soft bg-surface-2 px-2 py-1 text-[11px] text-ink">
                  “{selection}”
                </p>
              ) : (
                <p className="mb-2 text-[10px] leading-relaxed text-ink-faint">
                  Select words in the line, then click the job they are doing.
                </p>
              )}

              <div className="space-y-1">
                {wordTypes.map((w) => {
                  const color = colorFor(w.source_id);
                  const mine = tags.filter((t) => t.componentId === w.id);
                  const open = expanded === w.id;

                  return (
                    <div key={w.id}>
                      <div className="flex items-stretch gap-1">
                        <button
                          type="button"
                          disabled={!selection}
                          onClick={() => onTag(w.id)}
                          className={`flex min-w-0 flex-1 items-center gap-2 rounded-md border px-2 py-1 text-left text-[11px] transition-colors ${
                            selection
                              ? "border-border text-ink hover:border-accent-dim"
                              : "border-border-soft text-ink-dim"
                          }`}
                        >
                          <span
                            aria-hidden
                            className="h-2.5 w-2.5 shrink-0 rounded-full"
                            style={{ backgroundColor: color }}
                          />
                          <span className="min-w-0 flex-1 truncate">{w.name}</span>
                          {mine.length > 0 && (
                            <span className="shrink-0 font-mono text-[10px] text-ink-faint">
                              {mine.length}
                            </span>
                          )}
                        </button>

                        {w.body && (
                          <button
                            type="button"
                            onClick={() => setExpanded(open ? null : w.id)}
                            aria-label={`What is ${w.name}?`}
                            className={`shrink-0 rounded-md border border-border-soft px-1.5 font-mono text-[10px] transition-colors ${
                              open ? "text-accent" : "text-ink-faint hover:text-accent"
                            }`}
                          >
                            ?
                          </button>
                        )}
                      </div>

                      {mine.length > 0 && (
                        <div className="ml-1 mt-1 flex flex-wrap gap-1">
                          {mine.map((t) => (
                            <button
                              key={t.id}
                              type="button"
                              onClick={() => onRemoveTag(t.id)}
                              title="Remove this tag"
                              className="rounded border px-1.5 py-0.5 text-[10px] text-ink-dim transition-colors hover:line-through"
                              style={{ borderColor: color }}
                            >
                              {t.text}
                            </button>
                          ))}
                        </div>
                      )}

                      {open && w.body && (
                        <p className="prose-body mt-1 whitespace-pre-wrap rounded-md border border-border-soft bg-surface-2 px-2 py-1.5 text-[10px] leading-relaxed text-ink-dim">
                          {w.body}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {siblings.length > 0 && (
            <details className="mt-3 border-t border-border-soft pt-2">
              <summary className="cursor-pointer text-[10px] tracking-wide text-ink-dim">
                MORE ON THIS{" "}
                <span className="font-mono text-ink-faint">{siblings.length}</span>
              </summary>
              <div className="mt-1.5 space-y-1">
                {siblings.map((c) => (
                  <details key={c.id} className="rounded-md border border-border-soft">
                    <summary className="flex cursor-pointer items-baseline gap-2 px-2 py-1 text-[11px] text-ink-dim">
                      {c.source_id && (
                        <span className="font-mono text-[10px] text-ink-faint">{c.source_id}</span>
                      )}
                      <span className="min-w-0 flex-1">{c.name}</span>
                    </summary>
                    {c.body && (
                      <p className="prose-body whitespace-pre-wrap border-t border-border-soft px-2 py-1.5 text-[10px] leading-relaxed text-ink-faint">
                        {c.body}
                      </p>
                    )}
                  </details>
                ))}
              </div>
            </details>
          )}

          {teaching && teaching.children.length > 0 && wordTypes.length === 0 && (
            <div className="mt-2 space-y-1">
              {teaching.children.map((c) => (
                <details key={c.id} className="rounded-md border border-border-soft">
                  <summary className="cursor-pointer px-2 py-1 text-[11px] text-ink-dim">
                    {c.name}
                  </summary>
                  {c.body && (
                    <p className="prose-body whitespace-pre-wrap border-t border-border-soft px-2 py-1.5 text-[10px] leading-relaxed text-ink-faint">
                      {c.body}
                    </p>
                  )}
                </details>
              ))}
            </div>
          )}
        </div>
      )}
    </aside>
  );
}
