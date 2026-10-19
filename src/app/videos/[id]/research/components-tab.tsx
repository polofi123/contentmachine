"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { AI_STATUS_LABEL, EVIDENCE_LABEL, RELEVANCE_LABEL, REVIEW_LABEL } from "@/lib/component-mapping";
import { formatTime, TRANSCRIPT_ORIGIN_LABELS } from "@/lib/video-analysis";
import { mapComponents, reviewComponentMapping } from "./mapping-actions";
import type { MappingRow, MappingsView } from "./mapping";

export type ComponentsTabData = {
  mappings: MappingsView | null;
  /** Component id → how many other videos have a human-confirmed mapping to it. */
  others: Record<string, number>;
  /** Mapping needs ANTHROPIC_API_KEY. */
  ready: boolean;
  /** The current analysis has spoken words to quote. */
  hasTranscript: boolean;
  /** There is a saved analysis at all. */
  hasAnalysis: boolean;
};

/** What a mapping is, as one word: a person's decision when there is one, else the machine's conclusion. */
type Effective = "confirmed" | "rejected" | "ai_supported" | "uncertain";
const effective = (r: MappingRow): Effective => r.review?.decision ?? r.aiStatus;

const BADGE: Record<Effective, string> = {
  confirmed: "border-emerald-500/50 text-emerald-400",
  rejected: "border-border text-ink-faint line-through",
  ai_supported: "border-sky-500/50 text-sky-400",
  uncertain: "border-accent-dim text-accent",
};
const LABEL: Record<Effective, string> = {
  confirmed: REVIEW_LABEL.confirmed, rejected: REVIEW_LABEL.rejected, ai_supported: AI_STATUS_LABEL.ai_supported, uncertain: AI_STATUS_LABEL.uncertain,
};
const FILTERS: ("all" | Effective)[] = ["all", "confirmed", "ai_supported", "uncertain", "rejected"];

const span = (start: number | null, end: number | null) =>
  start === null ? null : end !== null && Math.round(end) !== Math.round(start) ? `${formatTime(start)}–${formatTime(end)}` : formatTime(start);

export function ComponentsTab({ videoId, data }: { videoId: string; data: ComponentsTabData }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | Effective>("all");
  const asked = useRef(false);

  const m = data.mappings;
  const reviewed = (m?.rows ?? []).filter((r) => r.review).length;

  const run = () => {
    if (reviewed > 0 && !window.confirm(`${reviewed} mapping${reviewed === 1 ? " has" : "s have"} your review. Mapping again makes a new run that starts unreviewed. Your earlier decisions are kept and shown on the matching cards, but they are not carried over: you will need to confirm again. Continue?`)) return;
    start(async () => {
      if (asked.current) return;
      asked.current = true;
      setError(null);
      try {
        const res = await mapComponents(videoId);
        if (!res.ok) setError(res.error);
        else router.refresh();
      } catch {
        setError("The server did not respond. Restart `pnpm dev`, refresh the page and try again.");
      } finally {
        asked.current = false;
      }
    });
  };

  const blocked = !data.ready ? "Add ANTHROPIC_API_KEY to .env.local and restart the server to map components." : !data.hasAnalysis ? "Analyze or import this video first." : !data.hasTranscript ? "This analysis has no transcript, so there is nothing to quote. Fetch or import a transcript first." : null;

  const all = m?.rows ?? [];
  const rows = all.filter((r) => filter === "all" || effective(r) === filter);
  const groups = new Map<string, MappingRow[]>();
  for (const r of rows) groups.set(r.component.layerLabel, [...(groups.get(r.component.layerLabel) ?? []), r]);
  const count = (e: Effective) => all.filter((r) => effective(r) === e).length;

  return (
    <>
      <section className="rounded-xl border border-border-soft bg-surface px-4 py-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h3 className="text-[11px] uppercase tracking-wide text-ink-faint">Library components in this video</h3>
            <p className="mt-1.5 text-sm text-ink-dim">
              Which components from your library this video appears to use, matched against its saved transcript and visual notes. Each match points at an
              existing library entry. The AI proposes; only you can confirm.
            </p>
          </div>
          <button
            type="button"
            onClick={run}
            disabled={pending || blocked !== null}
            title={blocked ?? undefined}
            className="shrink-0 rounded-md border border-accent-dim bg-accent-dim/15 px-2.5 py-1.5 text-xs text-accent hover:bg-accent-dim/25 disabled:opacity-40"
          >
            {pending ? "Mapping…" : m ? "Map again" : "Map to library"}
          </button>
        </div>
        {pending && <p className="mt-2 text-xs text-ink-dim">Reading the video, searching the library, matching, then checking that each quote really shows what it is cited for. This takes a few minutes (three model calls).</p>}
        {blocked && !pending && <p className="mt-2 text-xs text-ink-faint">{blocked}</p>}
        {error && <p role="alert" className="mt-2 text-sm text-accent">{error}</p>}
        <details className="mt-3 text-xs text-ink-faint">
          <summary className="cursor-pointer hover:text-ink-dim">What these labels mean</summary>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li><span className="text-emerald-400">Confirmed</span> and <span className="text-ink-dim">Rejected</span> are your decisions, nothing else. The AI never sets them, and your decision never changes what the AI recorded.</li>
            <li><span className="text-sky-400">AI-supported</span>: every automatic check passed. The model says the spoken words do it outright; a quote was found word for word in the saved transcript; a second check judged that quote to <em>directly</em> show the component rather than merely relate to it; the library definition passage was verified. It is still a proposal.</li>
            <li><span className="text-accent">Uncertain</span>: something is missing. Anything about what is <em>seen</em> (layouts, visual hooks, editing) is always uncertain until you have watched the video and reviewed it; spoken words cannot establish a visual technique. Otherwise: the video only implies it, the quotes are context rather than proof, the only evidence is an AI&apos;s description of the picture, the library gives no definition, or the model itself was unsure. The reasons are listed.</li>
            <li>Confirming needs you to say you watched the video when the evidence is only AI-described pictures, when the component is visual, or when the transcript is YouTube&apos;s automatic captions or was written by an AI.</li>
            <li>If you decided on the same component and evidence in an earlier run, that decision is shown on the card but never carried over: you confirm again.</li>
          </ul>
        </details>
      </section>

      {m?.stale && (
        <p role="status" className="rounded-xl border border-accent-dim px-4 py-2.5 text-sm text-accent">
          These mappings were made against an earlier version of this video&apos;s analysis. The transcript or notes may have changed since; map again to refresh.
        </p>
      )}

      {m && (
        <>
          <div className="flex flex-wrap items-center gap-2 text-xs text-ink-faint">
            <span>
              <span className="text-emerald-400">{count("confirmed")}</span> confirmed · <span className="text-sky-400">{count("ai_supported")}</span> AI-supported · <span className="text-accent">{count("uncertain")}</span> uncertain · {count("rejected")} rejected
            </span>
            <span>· {m.run.model}</span>
            <span>· transcript: {m.run.transcriptOrigin ? TRANSCRIPT_ORIGIN_LABELS[m.run.transcriptOrigin] : "unknown source"}</span>
            <span>· mapped {new Date(m.run.mappedAt).toLocaleString()}</span>
            <span className="ml-auto flex flex-wrap gap-1">
              {FILTERS.map((f) => (
                <button key={f} type="button" onClick={() => setFilter(f)} aria-pressed={filter === f}
                  className={`rounded border px-2 py-0.5 ${filter === f ? "border-accent text-accent" : "border-border text-ink-dim hover:text-ink"}`}>
                  {f === "all" ? "All" : LABEL[f]}
                </button>
              ))}
            </span>
          </div>
          {m.run.transcriptOrigin === "youtube_auto" && (
            <p className="text-[11px] text-ink-faint">Quotes come from YouTube&apos;s automatic captions (speech recognition); they match the saved transcript exactly, but names and jargon in it may be misheard, so confirming needs you to have watched the video.</p>
          )}
          {(m.run.transcriptOrigin === "ai" || m.run.transcriptOrigin === "sections") && (
            <p className="text-[11px] text-accent">The transcript here was not a real caption track, so nothing can be AI-supported and confirming needs you to have watched the video.</p>
          )}
          {rows.length === 0 && (
            <section className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-ink-faint">
              {all.length === 0 ? "The run finished but nothing in the library matched this video with enough support." : "No mappings in this state."}
            </section>
          )}
          {[...groups].map(([layer, items]) => (
            <section key={layer}>
              <h3 className="mb-2 text-[11px] uppercase tracking-wide text-ink-faint">{layer}</h3>
              <ul className="space-y-2">{items.map((r) => <MappingCard key={r.id} videoId={videoId} r={r} others={data.others[r.component.id] ?? 0} />)}</ul>
            </section>
          ))}
        </>
      )}

      {!m && !pending && (
        <section className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-ink-faint">
          Not mapped yet. {blocked ? "" : "Run “Map to library” to see which library components this video appears to use."}
        </section>
      )}
    </>
  );
}

function MappingCard({ videoId, r, others }: { videoId: string; r: MappingRow; others: number }) {
  const when = span(r.startSec, r.endSec);
  const state = effective(r);
  return (
    <li className={`rounded-xl border border-border-soft bg-surface px-4 py-3 ${state === "rejected" ? "opacity-60" : ""}`}>
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <Link href={`/library#c-${r.component.id}`} className="shrink-0 rounded border border-border px-1.5 py-0.5 font-mono text-[10px] text-ink-faint hover:border-accent-dim hover:text-accent" title="Open this component's definition in the library">
          {r.component.sourceId ?? "mine"}
        </Link>
        <Link href={`/library#c-${r.component.id}`} className="text-sm font-medium text-ink hover:text-accent">{r.component.name}</Link>
        <span className={`rounded border px-1.5 py-0.5 text-[11px] ${BADGE[state]}`}>{r.review ? `${LABEL[state]} by you` : LABEL[state]}</span>
        {r.review && <span className="text-[11px] text-ink-faint">AI said: {AI_STATUS_LABEL[r.aiStatus]}</span>}
        <span className="ml-auto font-mono text-[11px] text-ink-faint">{when ?? "no time"}</span>
      </div>
      <p className="mt-1.5 text-sm leading-relaxed text-ink-dim">{r.explanation}</p>
      <p className="mt-1 text-[11px] text-ink-faint">
        AI: {r.directness === "explicit" ? "stated or done outright" : "implied, not stated"} · its own confidence {r.confidence.toFixed(2)}
        {others > 0 && <> · you confirmed it in {others} other video{others === 1 ? "" : "s"}</>}
      </p>

      <ul className="mt-2 space-y-1.5">
        {r.evidence.map((e, i) => (
          <li key={i} className="border-l-2 border-accent-dim pl-3">
            <p className="text-[11px] text-ink-faint">
              {EVIDENCE_LABEL[e.type]}
              {span(e.startSec, e.endSec) && <span className="ml-2 font-mono">{span(e.startSec, e.endSec)}</span>}
              {e.relevance && (
                <span className={`ml-2 rounded border px-1 ${e.relevance === "direct" ? "border-sky-500/40 text-sky-400" : "border-border text-ink-faint"}`} title={e.relevanceReason}>
                  {RELEVANCE_LABEL[e.relevance]}
                </span>
              )}
              {!e.relevance && <span className="ml-2 text-ink-faint">relevance not checked</span>}
            </p>
            <p className={`text-sm text-ink ${e.type === "transcript" ? "italic" : ""}`}>{e.type === "transcript" ? `“${e.quote}”` : e.quote}</p>
            {e.relevanceReason && <p className="text-[11px] text-ink-faint">{e.relevanceReason}</p>}
          </li>
        ))}
      </ul>

      <p className="mt-2 text-[11px] text-ink-faint">
        {r.definitionExcerpt
          ? <>Library definition (as matched): <span className="text-ink-dim">“{r.definitionExcerpt}”</span></>
          : "The library gives this component only a name, so there is no definition to check the match against."}
      </p>

      {!r.definitionCurrent && (
        <p role="status" className="mt-2 text-[11px] text-accent">
          The library has changed since this was matched (the component was archived, or its definition no longer contains this passage). Check the current definition, or map again.
        </p>
      )}

      {r.uncertainty.length > 0 && (
        <div className="mt-2 rounded-md border border-border-soft px-3 py-2">
          <h4 className="text-[11px] uppercase tracking-wide text-accent">Why the AI is not sure</h4>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs text-ink-dim">{r.uncertainty.map((u, i) => <li key={i}>{u}</li>)}</ul>
        </div>
      )}

      {!r.review && r.prior && (
        <div className="mt-3 rounded-md border border-border px-3 py-2" data-testid="prior-review">
          <h4 className="text-[11px] uppercase tracking-wide text-ink-faint">Earlier review, not carried over</h4>
          <p className="mt-1 text-xs text-ink-dim">
            In the run of {new Date(r.prior.runAt).toLocaleString()} you {r.prior.decision === "confirmed" ? "confirmed" : "rejected"} this component on the same evidence
            {r.prior.basis && ` (${r.prior.basis === "watched_video" ? "after watching the video" : "after reading the quote"})`}
            {r.prior.note && <>: “{r.prior.note}”</>}. That decision does not count for this run: it needs your explicit {r.prior.decision === "confirmed" ? "reconfirmation" : "decision"} below.
          </p>
          {r.prior.changes.length > 0 && (
            <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs text-accent">
              {r.prior.changes.map((c, i) => <li key={i}>{c}</li>)}
              <li>Re-check the evidence against these changes before you confirm.</li>
            </ul>
          )}
        </div>
      )}

      <ReviewBar videoId={videoId} r={r} />
    </li>
  );
}

function ReviewBar({ videoId, r }: { videoId: string; r: MappingRow }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [watched, setWatched] = useState(false);
  const needsVideo = r.minimumBasis.basis === "watched_video";

  const submit = (decision: "confirmed" | "rejected" | "cleared") =>
    start(async () => {
      setError(null);
      try {
        const res = await reviewComponentMapping({ videoId, mappingId: r.id, decision, note: note.trim() || undefined, watchedVideo: watched });
        if (!res.ok) return setError(res.error);
        setNote("");
        setWatched(false);
        router.refresh();
      } catch {
        setError("The server did not respond. Restart `pnpm dev`, refresh the page and try again.");
      }
    });

  return (
    <div className="mt-3 border-t border-border-soft pt-2.5">
      {r.review ? (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-ink-dim">
            You {r.review.decision === "confirmed" ? "confirmed" : "rejected"} this on {new Date(r.review.at).toLocaleString()}
            {r.review.basis && ` (${r.review.basis === "watched_video" ? "after watching the video" : "after reading the quote"})`}
            {r.review.note && <>: “{r.review.note}”</>}
          </span>
          <button type="button" disabled={pending} onClick={() => submit("cleared")} className="rounded-md px-2 py-1 text-ink-faint hover:text-ink disabled:opacity-40">
            {pending ? "Saving…" : "Withdraw"}
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          <textarea
            value={note} onChange={(e) => setNote(e.target.value)} rows={1} maxLength={1000} aria-label="Optional note on your decision"
            placeholder="Optional note"
            className="w-full resize-none rounded-md border border-border bg-surface-2 px-2.5 py-1.5 text-xs outline-none placeholder:text-ink-faint focus:border-accent-dim"
          />
          {needsVideo ? (
            <label className="flex items-start gap-2 text-xs text-ink-dim">
              <input type="checkbox" checked={watched} onChange={(e) => setWatched(e.target.checked)} className="mt-0.5" />
              <span>I watched the video and saw or heard this. <span className="text-ink-faint">{r.minimumBasis.why}</span></span>
            </label>
          ) : (
            <p className="text-[11px] text-ink-faint">Confirming means you read the quote above and agree it shows this component.</p>
          )}
          <div className="flex gap-2">
            <button type="button" disabled={pending || (needsVideo && !watched)} onClick={() => submit("confirmed")}
              className="rounded-md border border-emerald-500/50 px-2.5 py-1 text-xs text-emerald-400 hover:bg-emerald-500/10 disabled:opacity-40">
              {pending ? "Saving…" : "Confirm"}
            </button>
            <button type="button" disabled={pending} onClick={() => submit("rejected")}
              className="rounded-md border border-border px-2.5 py-1 text-xs text-ink-dim hover:text-ink disabled:opacity-40">
              Reject
            </button>
          </div>
        </div>
      )}
      {error && <p role="alert" className="mt-1.5 text-xs text-accent">{error}</p>}
      {r.history.length > 0 && (
        <details className="mt-2 text-[11px] text-ink-faint">
          <summary className="cursor-pointer hover:text-ink-dim">Review history ({r.history.length})</summary>
          <ul className="mt-1 space-y-0.5">
            {r.history.map((h) => (
              <li key={h.id}>
                {new Date(h.at).toLocaleString()} · {h.decision === "cleared" ? "withdrawn" : h.decision}
                {h.basis && ` · ${h.basis === "watched_video" ? "watched the video" : "read the quote"}`}
                {h.note && ` · “${h.note}”`}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
