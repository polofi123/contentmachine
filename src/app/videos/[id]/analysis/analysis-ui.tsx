"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { clock } from "@/lib/timing";
import type { SegmentedScript } from "@/lib/segment";
import {
  MECHANICAL_OPERATIONS,
  OPERATION_LABEL,
  PRIORITY_LABEL,
  PRIORITY_ORDER,
  type AnalysisFinding,
  type Priority,
  type RetrievalTrace,
  type StoryBeatNode,
} from "@/lib/analysis";
import { applyFinding, runAnalysis, setFindingState } from "./actions";

export type LibraryElementView = {
  id: string;
  sourceId: string | null;
  name: string;
  body: string;
  category: string;
  categoryLabel: string;
};

type Run = {
  id: string;
  createdAt: string;
  model: string;
  storyMap: StoryBeatNode[];
  summary: { strongestElements: string[]; highestLeverageFindingIds: string[] };
  trace: RetrievalTrace[];
  coverage: { libraryTotal: number; libraryCitable: number };
  versionContent: string | null;
};

const PRIORITY_STYLE: Record<Priority, string> = {
  structural: "border-accent text-accent",
  high: "border-accent-dim text-accent/80",
  medium: "border-border text-ink-faint",
  polish: "border-border-soft text-ink-faint/70",
};

/**
 * Script with annotations, not a report about a script.
 *
 * The layout is the argument: the writing stays on the left at full width and
 * the findings sit beside it, so a claim about line 9 can put line 9 under your
 * eye. Selecting a finding highlights every range it cites — several at once
 * for a structural one, which is the whole reason evidence is a list.
 */
export function AnalysisUI({
  videoId,
  aiEnabled,
  script,
  run,
  findings,
  elements,
  stale,
}: {
  videoId: string;
  aiEnabled: boolean;
  script: SegmentedScript;
  run: Run | null;
  findings: AnalysisFinding[];
  elements: LibraryElementView[];
  stale: boolean;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [category, setCategory] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, start] = useTransition();

  const byElement = new Map(elements.map((e) => [e.id, e]));

  // §27 — filters come from the library's own taxonomy. No second list.
  const categories = useMemo(() => {
    const seen = new Map<string, string>();
    for (const f of findings) {
      const primary = f.libraryReferences.find((r) => r.isPrimary);
      if (primary) seen.set(primary.category, primary.categoryLabel);
    }
    return [...seen.entries()];
  }, [findings]);

  const visible = useMemo(() => {
    const list = category
      ? findings.filter((f) =>
          f.libraryReferences.some((r) => r.isPrimary && r.category === category),
        )
      : findings;

    // §13 — leverage first. A mis-ordered reveal must not sit under ten notes
    // about sentence length.
    return [...list].sort(
      (a, b) =>
        PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] || b.confidence - a.confidence,
    );
  }, [findings, category]);

  const highlighted = useMemo(() => {
    const finding = findings.find((f) => f.id === selected);
    if (!finding) return new Set<string>();
    return new Set(finding.evidence.flatMap((e) => e.segmentIds));
  }, [findings, selected]);

  const run_ = () => {
    setBusy(true);
    setError(null);
    runAnalysis(videoId)
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : "The analysis failed."),
      )
      .finally(() => setBusy(false));
  };

  return (
    <div className="flex gap-6">
      {/* ---------------------------------------------------------- script */}
      <div className="min-w-0 flex-1">
        <div className="mb-2 flex items-center gap-2">
          <span className="text-[10px] tracking-wide text-ink-dim">SCRIPT</span>
          {run && (
            <span className="font-mono text-[10px] text-ink-faint">
              {findings.length} finding{findings.length === 1 ? "" : "s"}
            </span>
          )}
          <button
            type="button"
            onClick={run_}
            disabled={busy || !aiEnabled}
            title={aiEnabled ? undefined : "Set ANTHROPIC_API_KEY to run the analysis"}
            className="ml-auto rounded-md border border-border px-2 py-1 text-[11px] text-ink-dim transition-colors hover:border-accent-dim hover:text-accent disabled:opacity-50"
          >
            {busy ? "Analysing…" : run ? "Re-run" : "Run analysis"}
          </button>
        </div>

        {stale && (
          <p className="mb-2 rounded-md border border-accent-dim/50 px-2 py-1.5 text-[11px] leading-relaxed text-accent/80">
            The script has changed since this run. These findings describe the earlier version —
            their line references may no longer land. Re-run to analyse what is here now.
          </p>
        )}

        {error && <p className="mb-2 text-[11px] leading-relaxed text-accent">{error}</p>}

        <div className="space-y-0.5">
          {script.segments.map((segment) => {
            const on = highlighted.has(segment.id);
            return (
              <div
                key={segment.id}
                className={`flex items-start gap-3 rounded-md px-2 py-1 transition-colors ${
                  on ? "bg-accent-dim/15" : ""
                }`}
              >
                <span className="mt-[3px] w-14 shrink-0 font-mono text-[10px] text-ink-faint">
                  {clock(segment.startSec)}
                </span>
                <span className="min-w-0 flex-1">
                  {segment.role && (
                    <span className="mr-1.5 text-[9px] uppercase tracking-wide text-ink-faint/70">
                      {segment.role}
                    </span>
                  )}
                  <span
                    className={`text-sm leading-relaxed ${on ? "text-ink" : "text-ink-dim"}`}
                  >
                    {segment.text}
                  </span>
                </span>
                <span className="mt-[3px] shrink-0 font-mono text-[10px] text-ink-faint/50">
                  {segment.order}
                </span>
              </div>
            );
          })}
        </div>

        {run && <StoryMap map={run.storyMap} script={script} />}
        {run && <Trace run={run} />}
      </div>

      {/* -------------------------------------------------------- findings */}
      <aside className="w-[46%] shrink-0">
        {!run ? (
          <p className="rounded-xl border border-border-soft px-3 py-3 text-[11px] leading-relaxed text-ink-faint">
            Nothing analysed yet. The engine reads the script, retrieves mechanisms from your
            library, and only then makes a call — so every finding it shows can be traced back to a
            real entry you can open.
          </p>
        ) : (
          <>
            {run.summary.strongestElements.length > 0 && (
              <section className="mb-2 rounded-xl border border-border-soft px-3 py-2.5">
                <p className="mb-1 text-[10px] tracking-wide text-ink-dim">WHAT IS WORKING</p>
                <ul className="space-y-0.5">
                  {run.summary.strongestElements.map((s, i) => (
                    <li key={i} className="text-[11px] leading-relaxed text-ink-faint">
                      {s}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {categories.length > 1 && (
              <div className="mb-2 flex flex-wrap gap-1">
                <button
                  type="button"
                  onClick={() => setCategory(null)}
                  className={`rounded border px-1.5 py-0.5 text-[10px] transition-colors ${
                    category === null
                      ? "border-accent-dim text-accent"
                      : "border-border-soft text-ink-faint hover:text-ink-dim"
                  }`}
                >
                  All
                </button>
                {categories.map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setCategory(category === key ? null : key)}
                    className={`rounded border px-1.5 py-0.5 text-[10px] transition-colors ${
                      category === key
                        ? "border-accent-dim text-accent"
                        : "border-border-soft text-ink-faint hover:text-ink-dim"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}

            <div className="space-y-2">
              {visible.length === 0 && (
                <p className="rounded-xl border border-border-soft px-3 py-3 text-[11px] leading-relaxed text-ink-faint">
                  No findings survived grounding. Either the script is doing its job, or nothing in
                  the library speaks to what was detected — the trace under the script says which.
                </p>
              )}

              {visible.map((finding) => (
                <FindingCard
                  key={finding.id}
                  videoId={videoId}
                  finding={finding}
                  element={
                    byElement.get(
                      finding.libraryReferences.find((r) => r.isPrimary)?.libraryElementId ?? "",
                    ) ?? null
                  }
                  alternative={
                    byElement.get(
                      finding.libraryReferences.find((r) => !r.isPrimary)?.libraryElementId ?? "",
                    ) ?? null
                  }
                  script={script}
                  selected={selected === finding.id}
                  onSelect={() => setSelected(selected === finding.id ? null : finding.id)}
                  onAct={(fn) => start(fn)}
                  stale={stale}
                />
              ))}
            </div>
          </>
        )}
      </aside>
    </div>
  );
}

/* ------------------------------------------------------------------ card */

function FindingCard({
  videoId,
  finding,
  element,
  alternative,
  script,
  selected,
  onSelect,
  onAct,
  stale,
}: {
  videoId: string;
  finding: AnalysisFinding;
  element: LibraryElementView | null;
  alternative: LibraryElementView | null;
  script: SegmentedScript;
  selected: boolean;
  onSelect: () => void;
  onAct: (fn: () => void) => void;
  stale: boolean;
}) {
  const [openLibrary, setOpenLibrary] = useState(false);
  const [draft, setDraft] = useState<string | null>(null);

  const primary = finding.libraryReferences.find((r) => r.isPrimary);
  const op = finding.operation;
  const mechanical = MECHANICAL_OPERATIONS.includes(op.type);
  const settled = finding.state === "applied" || finding.state === "rejected";

  // Does the evidence still exist in the script in front of us? A finding whose
  // quote has been edited away should not offer to act on it.
  const evidenceLives = finding.evidence.every((e) => script.content.includes(e.quote));

  const proposed =
    draft ??
    op.replacementText ??
    (op.insertedText ?? []).join("\n") ??
    "";

  return (
    <section
      onClick={onSelect}
      className={`cursor-pointer rounded-xl border px-3 py-2.5 transition-colors ${
        selected ? "border-accent-dim bg-surface-2/40" : "border-border-soft hover:border-border"
      } ${settled ? "opacity-60" : ""}`}
    >
      {/* priority + operation + state */}
      <div className="mb-1.5 flex flex-wrap items-baseline gap-1.5">
        <span
          className={`rounded border px-1 py-px text-[9px] tracking-wide ${
            PRIORITY_STYLE[finding.priority]
          }`}
        >
          {PRIORITY_LABEL[finding.priority]}
        </span>
        <span className="rounded border border-border-soft px-1 py-px text-[9px] tracking-wide text-ink-dim">
          {OPERATION_LABEL[op.type].toUpperCase()}
        </span>
        {finding.scope === "structural" && (
          <span className="text-[9px] uppercase tracking-wide text-ink-faint/70">
            {finding.evidence.length} places
          </span>
        )}
        <span className="ml-auto font-mono text-[9px] text-ink-faint/60">
          {Math.round(finding.confidence * 100)}%
        </span>
        {finding.state !== "pending" && (
          <span className="text-[9px] uppercase tracking-wide text-accent/70">
            {finding.state}
          </span>
        )}
      </div>

      {/* SCRIPT — exact quotes, never paraphrased */}
      <div className="mb-1.5 space-y-1">
        {finding.evidence.map((e, i) => (
          <p
            key={i}
            className="border-l-2 border-border pl-2 text-[11px] leading-relaxed text-ink-dim"
          >
            {e.quote}
          </p>
        ))}
      </div>

      {/* ISSUE */}
      <p className="text-[11px] leading-relaxed text-ink">
        <span className="text-[9px] uppercase tracking-wide text-ink-faint/70">
          {finding.diagnosis.type}
        </span>{" "}
        — {finding.diagnosis.explanation}
      </p>

      {/* LIBRARY TOOL — a real element, openable */}
      {primary && element && (
        <div className="mt-1.5 rounded-md border border-border-soft bg-surface px-2 py-1.5">
          <div className="flex items-baseline gap-1.5">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setOpenLibrary((v) => !v);
              }}
              className="text-[11px] text-accent/80 transition-colors hover:text-accent"
            >
              {element.name}
            </button>
            {element.sourceId && (
              <span className="font-mono text-[9px] text-ink-faint">{element.sourceId}</span>
            )}
            <span className="text-[9px] uppercase tracking-wide text-ink-faint/60">
              {element.categoryLabel}
            </span>
            <span
              className="ml-auto font-mono text-[9px] text-ink-faint/50"
              title="How strongly retrieval ranked this, before the model saw it"
            >
              r{primary.relevance.toFixed(2)}
            </span>
          </div>

          {/* §15 — the excerpt that justifies the citation, verified against
              the element's own text before this row was ever written. */}
          <p className="mt-1 border-l-2 border-accent-dim/40 pl-2 text-[10px] leading-relaxed text-ink-faint">
            “{primary.supportingText}”
          </p>

          {openLibrary && (
            <div className="mt-1.5 border-t border-border-soft pt-1.5">
              <p className="prose-body max-h-52 overflow-y-auto whitespace-pre-wrap text-[10px] leading-relaxed text-ink-faint">
                {element.body}
              </p>
              <Link
                href="/library"
                onClick={(e) => e.stopPropagation()}
                className="mt-1 inline-block text-[9px] tracking-wide text-accent/70 hover:text-accent"
              >
                OPEN IN LIBRARY →
              </Link>
            </div>
          )}
        </div>
      )}

      {/* WHY IT APPLIES */}
      <p className="mt-1.5 text-[11px] leading-relaxed text-ink-faint">
        <span className="text-ink-dim">Why here:</span> {finding.reasoning.whyApplicable}
      </p>

      {/* CHANGE */}
      {(op.replacementText || (op.insertedText ?? []).length > 0) && (
        <div className="mt-1.5" onClick={(e) => e.stopPropagation()}>
          <textarea
            value={proposed}
            onChange={(e) => setDraft(e.target.value)}
            rows={2}
            className="w-full resize-none rounded-md border border-border-soft bg-surface-2 px-2 py-1 text-[11px] leading-relaxed text-ink outline-none focus:border-accent-dim"
          />
        </div>
      )}

      {op.instructions && (
        <p className="mt-1.5 rounded-md border border-dashed border-border-soft px-2 py-1 text-[10px] leading-relaxed text-ink-faint">
          {op.instructions}
        </p>
      )}

      {/* EFFECT */}
      <p className="mt-1.5 text-[10px] leading-relaxed text-ink-faint/80">
        <span className="uppercase tracking-wide text-ink-faint/60">Effect</span> —{" "}
        {finding.reasoning.intendedEffect}
      </p>

      {/* ACCEPT / REJECT / APPLY */}
      <div className="mt-2 flex flex-wrap gap-1" onClick={(e) => e.stopPropagation()}>
        {mechanical && (
          <button
            type="button"
            disabled={stale || !evidenceLives || finding.state === "applied"}
            onClick={() => onAct(() => void applyFinding(videoId, finding.id, draft ?? undefined))}
            title={
              !evidenceLives
                ? "The lines this points at have changed"
                : stale
                  ? "Re-run before applying — the script has moved on"
                  : undefined
            }
            className="rounded border border-border px-1.5 py-0.5 text-[10px] text-ink-dim transition-colors hover:border-accent-dim hover:text-accent disabled:opacity-40"
          >
            Apply
          </button>
        )}
        <button
          type="button"
          disabled={finding.state === "accepted"}
          onClick={() => onAct(() => void setFindingState(videoId, finding.id, "accepted"))}
          className="rounded border border-border-soft px-1.5 py-0.5 text-[10px] text-ink-faint transition-colors hover:text-accent disabled:opacity-40"
        >
          Accept
        </button>
        <button
          type="button"
          disabled={finding.state === "rejected"}
          onClick={() => onAct(() => void setFindingState(videoId, finding.id, "rejected"))}
          className="rounded border border-border-soft px-1.5 py-0.5 text-[10px] text-ink-faint transition-colors hover:text-accent disabled:opacity-40"
        >
          Reject
        </button>
        {!mechanical && (
          <span className="self-center text-[9px] leading-tight text-ink-faint/60">
            decision, not an edit — nothing to apply automatically
          </span>
        )}
      </div>

      {alternative && (
        <p className="mt-1.5 border-t border-border-soft pt-1.5 text-[10px] leading-relaxed text-ink-faint/70">
          A different direction: <span className="text-ink-faint">{alternative.name}</span>
        </p>
      )}
    </section>
  );
}

/* -------------------------------------------------------------- story map */

function StoryMap({ map, script }: { map: StoryBeatNode[]; script: SegmentedScript }) {
  if (map.length === 0) return null;
  const order = new Map(script.segments.map((s) => [s.id, s.order]));

  return (
    <section className="mt-6 rounded-xl border border-border-soft px-3 py-2.5">
      <p className="mb-1.5 text-[10px] tracking-wide text-ink-dim">
        WHAT THIS SCRIPT IS ACTUALLY DOING
      </p>
      <div className="space-y-1">
        {map.map((beat) => {
          const lines = beat.segmentIds.map((id) => order.get(id)).filter(Boolean);
          return (
            <p key={beat.id} className="flex items-baseline gap-2 text-[11px] leading-relaxed">
              <span className="shrink-0 text-[9px] uppercase tracking-wide text-accent/70">
                {beat.function}
              </span>
              <span className="min-w-0 flex-1 text-ink-faint">{beat.summary}</span>
              <span className="shrink-0 font-mono text-[9px] text-ink-faint/50">
                {lines.length > 0 ? `${lines[0]}–${lines[lines.length - 1]}` : "—"}
              </span>
            </p>
          );
        })}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ trace */

/**
 * The receipt.
 *
 * Here so the claim "retrieval happened before the recommendation" can be
 * checked rather than believed: the query, every candidate with its score, what
 * was chosen, what was passed over, and every validation failure that stopped a
 * finding being shown.
 */
function Trace({ run }: { run: Run }) {
  return (
    <details className="mt-3 rounded-xl border border-border-soft px-3 py-2">
      <summary className="cursor-pointer text-[10px] tracking-wide text-ink-dim">
        RETRIEVAL TRACE{" "}
        <span className="font-mono text-ink-faint">
          {run.trace.filter((t) => t.validation.ok).length}/{run.trace.length} grounded ·{" "}
          {run.coverage.libraryCitable}/{run.coverage.libraryTotal} of the library citable
        </span>
      </summary>

      <p className="mt-1.5 text-[10px] leading-relaxed text-ink-faint/70">
        Detection ran with no library in scope. These queries were built from what it found, the
        candidates were ranked in code, and the model could only cite from its own list.
      </p>

      <div className="mt-2 space-y-2">
        {run.trace.map((t, i) => (
          <div key={i} className="rounded-md border border-border-soft px-2 py-1.5">
            <p className="text-[10px] text-ink-dim">
              {t.detectedFunction}
              <span className="text-ink-faint"> — {t.detectedConcern}</span>
            </p>
            <p className="mt-0.5 font-mono text-[9px] text-ink-faint/70">
              query: {t.retrievalQuery}
              {t.area ? ` · area: ${t.area}` : ""}
            </p>

            <div className="mt-1 space-y-0.5">
              {t.candidates.length === 0 && (
                <p className="font-mono text-[9px] text-accent/70">no citable candidates</p>
              )}
              {t.candidates.map((c) => (
                <p
                  key={c.libraryElementId}
                  className={`font-mono text-[9px] ${
                    c.libraryElementId === t.selectedId ? "text-accent" : "text-ink-faint/60"
                  }`}
                >
                  {c.libraryElementId === t.selectedId ? "✓ " : "  "}
                  {c.relevance.toFixed(3)} {c.sourceId ?? "—"} {c.name}
                  <span className="opacity-60"> [{c.matchedTerms.join(" ")}]</span>
                </p>
              ))}
            </div>

            {!t.validation.ok && t.validation.failures.length > 0 && (
              <p className="mt-1 font-mono text-[9px] leading-relaxed text-accent/70">
                dropped: {t.validation.failures.join(" · ")}
              </p>
            )}
          </div>
        ))}
      </div>
    </details>
  );
}
