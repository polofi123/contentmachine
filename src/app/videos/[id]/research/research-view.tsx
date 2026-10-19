"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  formatTime, hasVisualEvidence, humanize, legoPatch, parseAnalysis,
  type ParseResult, type VideoAnalysis,
} from "@/lib/video-analysis";
import { saveAnalysis } from "./actions";

// Mirrors the server cap on the stored original (server-action bodies are limited).
const MAX_RAW = 200_000;

type Meta = { version: number; sourceLabel: string; importedAt: string; warnings: string[]; raw: string };
type Legos = { topic: string | null; angle: string | null; hook: string | null; structure: string | null; visual: string | null };

const TABS = [
  ["summary", "Summary"], ["transcript", "Transcript"], ["idea", "Idea Analysis"],
  ["hook", "Hook"], ["story", "Storytelling"], ["visual", "Visual Layout"],
] as const;
type Tab = (typeof TABS)[number][0];

const field =
  "w-full rounded-md border border-border bg-surface-2 px-2.5 py-1.5 text-sm outline-none placeholder:text-ink-faint focus:border-accent-dim";

export function ResearchView({
  videoId, title, analysis, meta, legos,
}: { videoId: string; title: string; analysis: VideoAnalysis; meta: Meta | null; legos: Legos }) {
  const [tab, setTab] = useState<Tab>("summary");
  const [importing, setImporting] = useState(false);

  return (
    <div className="min-w-0">
      <div className="flex items-start justify-between gap-3">
        <h1 className="text-lg font-medium leading-snug tracking-tight text-ink">{title}</h1>
        <button
          type="button"
          onClick={() => setImporting((v) => !v)}
          className="shrink-0 rounded-md border border-accent-dim px-2.5 py-1.5 text-xs text-accent hover:bg-accent-dim/15"
        >
          {importing ? "Cancel import" : meta ? "Re-import analysis" : "Import analysis"}
        </button>
      </div>
      <p className="mt-1 text-[11px] text-ink-faint">
        {meta
          ? `Analysis v${meta.version} · ${meta.sourceLabel} · imported ${new Date(meta.importedAt).toLocaleDateString()}`
          : "No analysis yet. Everything below is empty until you import one."}
      </p>

      {importing && (
        <ImportPanel videoId={videoId} legos={legos} onDone={() => setImporting(false)} />
      )}

      <div role="tablist" className="mt-5 flex flex-wrap gap-1 border-b border-border-soft">
        {TABS.map(([key, label]) => (
          <button
            key={key}
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={`-mb-px border-b-2 px-3 py-2 text-xs transition-colors ${
              tab === key ? "border-accent text-accent" : "border-transparent text-ink-faint hover:text-ink-dim"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="mt-5 space-y-5">
        {tab === "summary" && <SummaryTab a={analysis} meta={meta} />}
        {tab === "transcript" && <TranscriptTab a={analysis} />}
        {tab === "idea" && <IdeaTab a={analysis} />}
        {tab === "hook" && <HookTab a={analysis} />}
        {tab === "story" && <StoryTab a={analysis} />}
        {tab === "visual" && <VisualTab a={analysis} />}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ pieces

function Copy({ text, label = "Copy" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 1200);
        } catch { /* clipboard blocked: nothing to do */ }
      }}
      className="text-[11px] text-ink-faint hover:text-ink"
    >
      {done ? "Copied" : label}
    </button>
  );
}

function Field({ label, value, mono }: { label: string; value: string | null; mono?: boolean }) {
  return (
    <section className="rounded-xl border border-border-soft bg-surface px-4 py-3">
      <div className="flex items-center justify-between">
        <h3 className="text-[11px] uppercase tracking-wide text-ink-faint">{label}</h3>
        {value && <Copy text={value} />}
      </div>
      {value
        ? <p className={`mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-ink ${mono ? "font-mono" : ""}`}>{value}</p>
        : <Missing />}
    </section>
  );
}

const Missing = () => <p className="mt-1.5 text-sm text-ink-faint">Not available — nothing was provided for this.</p>;

function List({ label, items }: { label: string; items: string[] }) {
  return (
    <section className="rounded-xl border border-border-soft bg-surface px-4 py-3">
      <div className="flex items-center justify-between">
        <h3 className="text-[11px] uppercase tracking-wide text-ink-faint">{label}</h3>
        {items.length > 0 && <Copy text={items.map((i) => `- ${i}`).join("\n")} />}
      </div>
      {items.length ? (
        <ul className="mt-1.5 list-disc space-y-1 pl-5 text-sm leading-relaxed text-ink">
          {items.map((i, n) => <li key={n}>{i}</li>)}
        </ul>
      ) : <Missing />}
    </section>
  );
}

function Tags({ items }: { items: [string, string | null][] }) {
  const shown = items.filter(([, v]) => v);
  if (!shown.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {shown.map(([k, v]) => (
        <span key={k} className="rounded border border-border px-2 py-0.5 text-[11px] text-ink-dim">
          <span className="text-ink-faint">{k}:</span> {humanize(v)}
        </span>
      ))}
    </div>
  );
}

// ------------------------------------------------------------------ tabs

function SummaryTab({ a, meta }: { a: VideoAnalysis; meta: Meta | null }) {
  const s = a.stats;
  const stats = [
    s.views != null && `${s.views.toLocaleString()} views`,
    s.likes != null && `${s.likes.toLocaleString()} likes`,
    s.comments != null && `${s.comments.toLocaleString()} comments`,
    s.engagementRate != null && `${s.engagementRate} engagement`,
    s.outlierScore != null && `${s.outlierScore}x outlier`,
  ].filter(Boolean);
  return (
    <>
      <Field label="Summary" value={a.summary} />
      <Field label="Caption" value={a.caption} />
      {stats.length > 0 && (
        <section className="rounded-xl border border-border-soft bg-surface px-4 py-3">
          <h3 className="text-[11px] uppercase tracking-wide text-ink-faint">Imported stats</h3>
          <p className="mt-1.5 text-sm text-ink">{stats.join(" · ")}</p>
          <p className="mt-1 text-[11px] text-ink-faint">As supplied by the import; not measured here.</p>
        </section>
      )}
      <Evidence a={a} />
      {meta && meta.warnings.length > 0 && (
        <section className="rounded-xl border border-accent-dim px-4 py-3 text-sm text-accent">
          <h3 className="text-[11px] uppercase tracking-wide">Import notes</h3>
          <ul className="mt-1.5 list-disc pl-5">{meta.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
        </section>
      )}
      {a.unparsed && (
        <section className="rounded-xl border border-border-soft bg-surface px-4 py-3">
          <div className="flex justify-between">
            <h3 className="text-[11px] uppercase tracking-wide text-ink-faint">Unplaced text from the import</h3>
            <Copy text={a.unparsed} />
          </div>
          <p className="mt-1.5 whitespace-pre-wrap text-sm text-ink-dim">{a.unparsed}</p>
        </section>
      )}
      {meta && (
        <details className="text-xs text-ink-faint">
          <summary className="cursor-pointer hover:text-ink-dim">Original pasted input</summary>
          <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap rounded-lg border border-border-soft bg-surface p-3 font-mono text-[11px] text-ink-dim">{meta.raw}</pre>
        </details>
      )}
    </>
  );
}

// What the analysis is actually based on, so a transcript-only import never
// reads as if someone watched the video.
function Evidence({ a }: { a: VideoAnalysis }) {
  const rows: [string, boolean, string][] = [
    ["Spoken words", Boolean(a.transcript.text),
      a.transcript.origin === "sections" ? "assembled from narrative sections" : "supplied transcript"],
    ["Timestamps", a.format.sections.some((s) => s.start != null) || a.transcript.segments.some((s) => s.start != null), "supplied"],
    ["Visual observations", hasVisualEvidence(a), "supplied by the imported analysis"],
  ];
  return (
    <section className="rounded-xl border border-border-soft bg-surface px-4 py-3">
      <h3 className="text-[11px] uppercase tracking-wide text-ink-faint">Evidence behind this analysis</h3>
      <ul className="mt-2 space-y-1 text-sm">
        {rows.map(([label, has, note]) => (
          <li key={label} className="flex gap-2">
            <span className={has ? "text-emerald-400" : "text-ink-faint"}>{has ? "●" : "○"}</span>
            <span className="text-ink">{label}</span>
            <span className="text-ink-faint">— {has ? note : "unverified / not provided"}</span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[11px] text-ink-faint">
        Everything shown is imported content. Nothing here was generated or checked by ContentMachine.
      </p>
    </section>
  );
}

function TranscriptTab({ a }: { a: VideoAnalysis }) {
  const t = a.transcript;
  if (!t.text) {
    return <section className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-ink-faint">No transcript available. Import an analysis or paste one.</section>;
  }
  const timed = t.segments.some((s) => s.start != null);
  return (
    <section className="rounded-xl border border-border-soft bg-surface px-4 py-3">
      <div className="flex items-center justify-between">
        <h3 className="text-[11px] uppercase tracking-wide text-ink-faint">
          Transcript · {t.text.split(/\s+/).length} words
          {t.origin === "sections" && " · assembled from narrative sections"}
        </h3>
        <span className="flex gap-3">
          <Copy text={t.text} label="Copy plain" />
          {timed && <Copy label="Copy with times" text={t.segments.map((s) => `${s.start != null ? `[${formatTime(s.start)}] ` : ""}${s.text}`).join("\n")} />}
        </span>
      </div>
      {t.segments.length > 0 ? (
        <ol className="mt-2 space-y-1.5 text-sm leading-relaxed">
          {t.segments.map((s, i) => (
            <li key={i} className="flex gap-3">
              <span className="w-12 shrink-0 pt-0.5 font-mono text-[11px] text-ink-faint">
                {s.start != null ? formatTime(s.start) : ""}
              </span>
              <span className="text-ink">{s.text}</span>
            </li>
          ))}
        </ol>
      ) : <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-ink">{t.text}</p>}
    </section>
  );
}

function IdeaTab({ a }: { a: VideoAnalysis }) {
  return (
    <>
      <Field label="Topic" value={a.topic} />
      <Field label="Idea seed" value={a.seed} />
      <Field label="Unique angle" value={a.angle} />
      <Field label="Common belief being challenged" value={a.commonBelief} />
      <Field label="Contrarian reality" value={a.contrarianReality} />
      <List label="Supporting evidence" items={a.supportingEvidence} />
    </>
  );
}

function HookTab({ a }: { a: VideoAnalysis }) {
  return (
    <>
      <Field label="Spoken hook" value={a.hook.spoken} />
      <Tags items={[["Category", a.hook.category]]} />
      <Field label="Hook formula" value={a.hook.template} mono />
      <Field label="Why it works / relation to the idea" value={a.hook.why} />
    </>
  );
}

function StoryTab({ a }: { a: VideoAnalysis }) {
  const f = a.format;
  return (
    <>
      <Tags items={[["Category", f.category], ["Format", f.type]]} />
      <Field label="Variation" value={f.flavor} />
      <Field label="Why this structure works" value={f.reasoning} />
      <Field label="Structure summary" value={f.structureSummary} />
      <section>
        <h3 className="mb-2 text-[11px] uppercase tracking-wide text-ink-faint">Narrative sections</h3>
        {f.sections.length === 0 ? (
          <p className="text-sm text-ink-faint">Not available — no narrative sections were provided.</p>
        ) : (
          <ol className="space-y-2">
            {f.sections.map((s, i) => (
              <li key={i} className="rounded-xl border border-border-soft bg-surface px-4 py-3">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-sm font-medium text-ink">{i + 1}. {s.name}</span>
                  {s.start != null && (
                    <span className="font-mono text-[11px] text-ink-faint">
                      {formatTime(s.start)}{s.end != null && `–${formatTime(s.end)}`}
                    </span>
                  )}
                </div>
                {s.description && <p className="mt-1 text-sm text-ink-dim">{s.description}</p>}
                {s.sentences.map((t, n) => (
                  <p key={n} className="mt-1.5 border-l-2 border-accent-dim pl-3 text-sm italic text-ink">“{t}”</p>
                ))}
              </li>
            ))}
          </ol>
        )}
      </section>
    </>
  );
}

function VisualTab({ a }: { a: VideoAnalysis }) {
  const v = a.visual;
  if (!hasVisualEvidence(a)) {
    return (
      <section className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-ink-faint">
        No visual information. {a.transcript.text
          ? "Only spoken words were imported, so nothing is known about what the video shows."
          : "Import an analysis that describes the visuals."}
      </section>
    );
  }
  return (
    <>
      <Tags items={[["Category", v.category], ["Layout", v.type]]} />
      <Field label="Visual hook" value={v.hook} />
      <List label="Visual elements & composition" items={v.elements} />
      <List label="Editing techniques" items={v.editing} />
    </>
  );
}

// ------------------------------------------------------------------ import

function ImportPanel({ videoId, legos, onDone }: { videoId: string; legos: Legos; onDone: () => void }) {
  const router = useRouter();
  const [raw, setRaw] = useState("");
  const [parsed, setParsed] = useState<ParseResult | null>(null);
  const [applyLegos, setApplyLegos] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const a = parsed?.analysis;
  const set = (fn: (draft: VideoAnalysis) => void) =>
    setParsed((p) => {
      if (!p) return p;
      const analysis = structuredClone(p.analysis);
      fn(analysis);
      return { ...p, analysis };
    });

  const patch = a ? legoPatch(a) : {};
  const wouldFill = Object.entries(patch).filter(([k]) => !legos[k.replace("lego_", "").replace("story_structure", "structure").replace("visual_format", "visual") as keyof Legos]);

  const save = () =>
    start(async () => {
      if (!parsed) return;
      setError(null);
      const res = await saveAnalysis({
        videoId, source: parsed.source, raw: raw.slice(0, MAX_RAW), warnings: parsed.warnings, analysis: parsed.analysis, applyLegos,
      });
      if (!res.ok) return setError(res.error);
      if (res.warning) window.alert(res.warning);
      onDone();
      router.refresh();
    });

  return (
    <div className="mt-4 rounded-xl border border-border bg-surface p-4">
      {!parsed ? (
        <>
          <label className="text-xs text-ink-dim" htmlFor="raw-analysis">
            Paste an “Export for LLM” result, a JSON analysis, or a plain-text breakdown.
          </label>
          <textarea
            id="raw-analysis"
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            rows={12}
            placeholder={'{ "topic": "…", "spoken_hook": "…", "narrative_structure": { "structure_sections": [ … ] } }\n\n— or —\n\nTopic: …\nHook: …\nTranscript:\n0:00 …'}
            className={`${field} mt-2 font-mono text-xs`}
          />
          <button
            type="button"
            disabled={!raw.trim()}
            onClick={() => setParsed(parseAnalysis(raw))}
            className="mt-3 rounded-md border border-accent-dim px-3 py-1.5 text-xs text-accent hover:bg-accent-dim/15 disabled:opacity-40"
          >
            Preview
          </button>
        </>
      ) : a && (
        <div className="space-y-3">
          <p className="text-xs text-ink-dim">
            Detected: <span className="text-ink">{parsed.source.replace("_", " ")}</span> · {a.format.sections.length} sections ·{" "}
            {a.transcript.text ? `${a.transcript.text.split(/\s+/).length}-word transcript${a.transcript.origin === "sections" ? " (from sections)" : ""}` : "no transcript"} ·{" "}
            {hasVisualEvidence(a) ? "visual info present" : "no visual info"}
          </p>
          {parsed.warnings.map((w, i) => <p key={i} className="text-xs text-accent">⚠ {w}</p>)}
          <p className="text-[11px] text-ink-faint">Check and correct anything below before saving. Empty boxes stay empty.</p>

          <div className="grid gap-3 sm:grid-cols-2">
            <Edit label="Topic" value={a.topic} onChange={(v) => set((d) => { d.topic = v; })} />
            <Edit label="Idea seed" value={a.seed} onChange={(v) => set((d) => { d.seed = v; })} />
            <Edit label="Unique angle" value={a.angle} onChange={(v) => set((d) => { d.angle = v; })} area />
            <Edit label="Summary" value={a.summary} onChange={(v) => set((d) => { d.summary = v; })} area />
            <Edit label="Common belief" value={a.commonBelief} onChange={(v) => set((d) => { d.commonBelief = v; })} area />
            <Edit label="Contrarian reality" value={a.contrarianReality} onChange={(v) => set((d) => { d.contrarianReality = v; })} area />
            <Edit label="Spoken hook" value={a.hook.spoken} onChange={(v) => set((d) => { d.hook.spoken = v; })} />
            <Edit label="Hook category" value={a.hook.category} onChange={(v) => set((d) => { d.hook.category = v; })} />
            <Edit label="Hook formula" value={a.hook.template} onChange={(v) => set((d) => { d.hook.template = v; })} />
            <Edit label="Why the hook works" value={a.hook.why} onChange={(v) => set((d) => { d.hook.why = v; })} area />
            <Edit label="Storytelling category" value={a.format.category} onChange={(v) => set((d) => { d.format.category = v; })} />
            <Edit label="Format type" value={a.format.type} onChange={(v) => set((d) => { d.format.type = v; })} />
            <Edit label="Format variation" value={a.format.flavor} onChange={(v) => set((d) => { d.format.flavor = v; })} area />
            <Edit label="Format reasoning" value={a.format.reasoning} onChange={(v) => set((d) => { d.format.reasoning = v; })} area />
            <Edit label="Visual category" value={a.visual.category} onChange={(v) => set((d) => { d.visual.category = v; })} />
            <Edit label="Visual layout type" value={a.visual.type} onChange={(v) => set((d) => { d.visual.type = v; })} />
            <Edit label="Visual hook" value={a.visual.hook} onChange={(v) => set((d) => { d.visual.hook = v; })} area />
          </div>

          {a.transcript.segments.some((seg) => seg.start != null || seg.end != null) ? (
            // Timestamped transcript: edit the words line by line so every
            // timestamp stays attached to its own line.
            <div>
              <p className="text-[11px] text-ink-faint">Transcript — edit the words; timestamps are kept</p>
              <ol className="mt-1 space-y-1.5">
                {a.transcript.segments.map((seg, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="w-12 shrink-0 pt-2 font-mono text-[11px] text-ink-faint">{formatTime(seg.start)}</span>
                    <input
                      type="text"
                      aria-label={`Transcript line ${i + 1}`}
                      value={seg.text}
                      onChange={(e) => set((d) => {
                        d.transcript.segments[i].text = e.target.value;
                        d.transcript.text = d.transcript.segments.map((x) => x.text).filter(Boolean).join(" ") || null;
                      })}
                      className={field}
                    />
                  </li>
                ))}
              </ol>
            </div>
          ) : (
            <Edit
              label="Transcript (no timestamps supplied)"
              value={a.transcript.text}
              area rows={5}
              onChange={(v) => set((d) => {
                d.transcript = v ? { text: v, segments: [{ start: null, end: null, text: v }], origin: "pasted" } : { text: null, segments: [], origin: null };
              })}
            />
          )}
          {a.unparsed && (
            <Edit label="Text that could not be placed (kept unless you clear it)" value={a.unparsed} area rows={4}
              onChange={(v) => set((d) => { d.unparsed = v ?? ""; })} />
          )}

          <label className="flex items-start gap-2 text-xs text-ink-dim">
            <input type="checkbox" checked={applyLegos} onChange={(e) => setApplyLegos(e.target.checked)} className="mt-0.5" />
            <span>
              Fill empty Idea Legos from this analysis
              {wouldFill.length > 0
                ? <span className="text-ink-faint"> — would fill: {wouldFill.map(([k]) => k.replace("lego_", "").replace("_", " ")).join(", ")}. Existing text is never overwritten.</span>
                : <span className="text-ink-faint"> — nothing to fill (already written, or not in the import).</span>}
            </span>
          </label>

          {error && <p role="alert" className="text-sm text-accent">{error}</p>}
          <div className="flex gap-2">
            <button type="button" onClick={save} disabled={pending}
              className="rounded-md border border-accent-dim px-3 py-1.5 text-xs text-accent hover:bg-accent-dim/15 disabled:opacity-40">
              {pending ? "Saving…" : "Save analysis"}
            </button>
            <button type="button" onClick={() => setParsed(null)} className="rounded-md px-3 py-1.5 text-xs text-ink-faint hover:text-ink">
              Back to paste
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Edit({
  label, value, onChange, area, rows = 2,
}: { label: string; value: string | null; onChange: (v: string | null) => void; area?: boolean; rows?: number }) {
  const common = {
    value: value ?? "",
    onChange: (e: { target: { value: string } }) => onChange(e.target.value.trim() ? e.target.value : null),
    className: field,
  };
  return (
    <label className="block text-[11px] text-ink-faint">
      {label}
      <div className="mt-1">{area ? <textarea rows={rows} {...common} /> : <input type="text" {...common} />}</div>
    </label>
  );
}
