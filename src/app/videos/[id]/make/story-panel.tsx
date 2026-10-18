"use client";

import { useState, useTransition } from "react";
import { clock } from "@/lib/timing";
import type { LoopSpan } from "@/lib/story";
import {
  BEAT_SUGGESTIONS,
  LENS_TIERS,
  LENS_TIER_LABEL,
  SUGGESTION_KINDS,
  SUGGESTION_LABEL,
  type LensTier,
  type StoryTense,
  type SuggestionKind,
} from "../story-vocab";
import {
  addLens,
  addQuestion,
  removeLens,
  removeQuestion,
  saveDirection,
  selectLens,
  setQuestionBeat,
  setStoryTense,
  type DirectionField,
} from "./story-actions";
import {
  analyzeStory,
  draftLines,
  suggest,
  type AiObservation,
  type LineDraft,
  type Verdict,
} from "./analyze";

export type DirectionRow = {
  starting_belief: string | null;
  destination: string | null;
  final_thought: string | null;
  meaning: string | null;
  tense: string | null;
};

export type LensRow = {
  id: string;
  text: string;
  tier: string | null;
  is_selected: boolean;
};

export type QuestionRow = {
  id: string;
  text: string;
  opened_beat_id: string | null;
  answered_beat_id: string | null;
};

export type TensionSource = { id: string; source_id: string | null; name: string };

export type ReviewNote = { note: AiObservation; beatIds: string[] };

/**
 * A review, and the script it was a review OF.
 *
 * The snapshot is the important half. Without it the only way to keep a note
 * honest once the line beneath it changes is to throw the note away — which is
 * what this used to do, on every keystroke, so a review vanished the moment you
 * acted on it. Keeping the text as it was lets a note say "the line I was
 * talking about has moved on" and stay on screen while you decide.
 */
export type StoryReview = {
  notes: ReviewNote[];
  /** beatId → the text that line held when the review ran. */
  snapshot: Record<string, string>;
  at: string;
};

const SAVE_DEBOUNCE_MS = 600;

/**
 * The story, beside the writing.
 *
 * Its job is to let you SEE the story without forcing you to finish it. Every
 * box is optional, nothing is validated, no field blocks another, and the panel
 * is useful with one line filled in — because that is how a story actually gets
 * decided: a destination on Tuesday, a lens on Wednesday, the meaning only once
 * the thing is nearly written.
 *
 * Deliberately not a wizard, and deliberately not ordered by importance. It is
 * ordered by the layers of the model — direction, lens, tension, loops — so the
 * panel reads top to bottom as the same hierarchy the diagnostics use.
 */
export function StoryPanel({
  videoId,
  direction,
  lenses,
  questions,
  beats,
  tensionSources,
  loops,
  aiEnabled,
  focusedBeatId,
  review,
  onReview,
  onDrafts,
  onApplyLine,
}: {
  videoId: string;
  direction: DirectionRow | null;
  lenses: LensRow[];
  questions: QuestionRow[];
  beats: { id: string; text: string }[];
  tensionSources: TensionSource[];
  loops: LoopSpan[];
  aiEnabled: boolean;
  focusedBeatId: string | null;
  /** Owned by the workspace so it outlives this tab. */
  review: StoryReview | null;
  onReview: (review: StoryReview | null) => void;
  onDrafts: (drafts: LineDraft[]) => void;
  onApplyLine: (beatId: string, text: string) => void;
}) {
  return (
    <div className="space-y-4">
      {/* The editor goes FIRST, with its results directly underneath the button
          that produced them.

          It used to sit last, below Direction, Lens, Tension and Loops — so a
          review appeared several screens down, and scrolling up to the line it
          was about pushed it out of sight entirely. It read exactly like the
          review had been deleted. It hadn't; it was just nowhere near the thing
          it was talking about. */}
      {aiEnabled && (
        <Ask
          videoId={videoId}
          focusedBeatId={focusedBeatId}
          beats={beats}
          review={review}
          onReview={onReview}
          onDrafts={onDrafts}
          onApplyLine={onApplyLine}
        />
      )}
      <Direction videoId={videoId} direction={direction} />
      <Lens videoId={videoId} lenses={lenses} />
      <Tension
        videoId={videoId}
        questions={questions}
        beats={beats}
        sources={tensionSources}
        focusedBeatId={focusedBeatId}
      />
      <Loops loops={loops} />
    </div>
  );
}

/* ------------------------------------------------------------- direction */

const DIRECTION_BOXES: { field: DirectionField; label: string; placeholder: string }[] = [
  { field: "destination", label: "DESTINATION", placeholder: "What do they understand by the end?" },
  { field: "meaning", label: "MEANING", placeholder: "The reason I'm telling you this is because…" },
  {
    field: "starting_belief",
    label: "STARTING BELIEF",
    placeholder: "What do they think walking in?",
  },
  { field: "final_thought", label: "FINAL THOUGHT", placeholder: "The last thing they hear." },
];

function Direction({ videoId, direction }: { videoId: string; direction: DirectionRow | null }) {
  // Destination and Meaning are always visible; the other two are one click
  // away. All four matter, but two of them are the ones you can usually answer
  // on day one, and four empty boxes reads as a form to complete.
  const [open, setOpen] = useState(
    Boolean(direction?.starting_belief || direction?.final_thought),
  );
  const shown = open ? DIRECTION_BOXES : DIRECTION_BOXES.slice(0, 2);

  return (
    <Section title="DIRECTION">
      <div className="space-y-2">
        {shown.map((box) => (
          <DirectionBox
            key={box.field}
            videoId={videoId}
            field={box.field}
            label={box.label}
            placeholder={box.placeholder}
            initial={direction?.[box.field] ?? ""}
          />
        ))}
      </div>

      <div className="mt-2 flex items-center gap-2">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="text-[10px] tracking-wide text-ink-faint transition-colors hover:text-ink-dim"
        >
          {open ? "LESS" : "START & END"}
        </button>
        <Tense videoId={videoId} initial={(direction?.tense as StoryTense) ?? null} />
      </div>
    </Section>
  );
}

function DirectionBox({
  videoId,
  field,
  label,
  placeholder,
  initial,
}: {
  videoId: string;
  field: DirectionField;
  label: string;
  placeholder: string;
  initial: string;
}) {
  const [value, setValue] = useState(initial);
  const [timer, setTimer] = useState<ReturnType<typeof setTimeout> | null>(null);

  // Debounced like every other text field in MAKE. The browser holds the
  // authoritative value while you type; the server catches up.
  const change = (next: string) => {
    setValue(next);
    if (timer) clearTimeout(timer);
    setTimer(setTimeout(() => void saveDirection(videoId, field, next), SAVE_DEBOUNCE_MS));
  };

  return (
    <label className="block">
      <span className="mb-0.5 block text-[10px] tracking-wide text-ink-faint">{label}</span>
      <textarea
        value={value}
        onChange={(e) => change(e.target.value)}
        rows={2}
        placeholder={placeholder}
        className="w-full resize-none rounded-md border border-border-soft bg-surface px-2 py-1.5 text-[11px] leading-relaxed text-ink-dim outline-none placeholder:text-ink-faint focus:border-accent-dim"
      />
    </label>
  );
}

/** Declaring a tense is what asks to be told about drift. Off is the default. */
function Tense({ videoId, initial }: { videoId: string; initial: StoryTense | null }) {
  const [tense, setTense] = useState<StoryTense | null>(initial);
  const [, start] = useTransition();

  const cycle = () => {
    const next: StoryTense | null =
      tense === null ? "present" : tense === "present" ? "past" : null;
    setTense(next);
    start(() => void setStoryTense(videoId, next));
  };

  return (
    <button
      type="button"
      onClick={cycle}
      title="Declare a tense to be told when a line drifts out of it"
      className={`ml-auto rounded border px-1.5 py-0.5 text-[10px] tracking-wide transition-colors ${
        tense ? "border-border text-ink-faint" : "border-border-soft text-ink-faint/60"
      }`}
    >
      {tense ? tense.toUpperCase() : "TENSE"}
    </button>
  );
}

/* ------------------------------------------------------------------ lens */

function Lens({ videoId, lenses }: { videoId: string; lenses: LensRow[] }) {
  const [text, setText] = useState("");
  const [tier, setTier] = useState<LensTier | null>(null);
  const [, start] = useTransition();

  const add = () => {
    if (!text.trim()) return;
    start(() => void addLens(videoId, text, tier, null));
    setText("");
  };

  return (
    <Section title="LENS">
      {lenses.length === 0 && (
        <p className="mb-2 text-[10px] leading-relaxed text-ink-faint">
          The topic is not the story — the angle on it is. Write the obvious one down first, so it
          has something to lose to.
        </p>
      )}

      <div className="space-y-1">
        {lenses.map((l) => (
          <div key={l.id} className="group flex items-start gap-1">
            <button
              type="button"
              onClick={() => start(() => void selectLens(videoId, l.is_selected ? null : l.id))}
              title={l.is_selected ? "Unchoose" : "Choose this lens"}
              className={`min-w-0 flex-1 rounded-md border px-2 py-1 text-left text-[11px] leading-relaxed transition-colors ${
                l.is_selected
                  ? "border-accent-dim bg-accent-dim/10 text-accent"
                  : "border-border-soft text-ink-dim hover:border-border"
              }`}
            >
              {l.tier && (
                <span className="mr-1.5 font-mono text-[9px] uppercase tracking-wide opacity-60">
                  {LENS_TIER_LABEL[l.tier as LensTier]}
                </span>
              )}
              {l.text}
            </button>
            <button
              type="button"
              onClick={() => start(() => void removeLens(videoId, l.id))}
              aria-label="Remove lens"
              className="mt-1 shrink-0 px-0.5 text-[11px] text-transparent transition-colors group-hover:text-ink-faint hover:!text-accent"
            >
              ⌫
            </button>
          </div>
        ))}
      </div>

      <div className="mt-1.5 flex gap-1">
        {LENS_TIERS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTier(tier === t ? null : t)}
            className={`rounded border px-1.5 py-0.5 text-[9px] uppercase tracking-wide transition-colors ${
              tier === t ? "border-accent-dim text-accent" : "border-border-soft text-ink-faint"
            }`}
          >
            {LENS_TIER_LABEL[t]}
          </button>
        ))}
      </div>

      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            add();
          }
        }}
        onBlur={add}
        placeholder="Another way of seeing it…"
        className="mt-1 w-full rounded-md border border-border-soft bg-surface px-2 py-1 text-[11px] text-ink outline-none placeholder:text-ink-faint focus:border-accent-dim"
      />
    </Section>
  );
}

/* --------------------------------------------------------------- tension */

function Tension({
  videoId,
  questions,
  beats,
  sources,
  focusedBeatId,
}: {
  videoId: string;
  questions: QuestionRow[];
  beats: { id: string; text: string }[];
  sources: TensionSource[];
  focusedBeatId: string | null;
}) {
  const [text, setText] = useState("");
  const [source, setSource] = useState<string | null>(null);
  const [pickSource, setPickSource] = useState(false);
  const [, start] = useTransition();

  const index = new Map(beats.map((b, i) => [b.id, i + 1]));

  const add = () => {
    if (!text.trim()) return;
    // Opens on the line you are standing on, because that is nearly always the
    // line that made you think of it.
    start(() => void addQuestion(videoId, text, source, focusedBeatId));
    setText("");
    setSource(null);
    setPickSource(false);
  };

  return (
    <Section title="OPEN QUESTIONS">
      {questions.length === 0 && (
        <p className="mb-2 text-[10px] leading-relaxed text-ink-faint">
          What does the viewer need answered? A stretch with nothing outstanding is where they
          leave.
        </p>
      )}

      <div className="space-y-1.5">
        {questions.map((q) => (
          <div key={q.id} className="group rounded-md border border-border-soft px-2 py-1.5">
            <div className="flex items-start gap-1">
              <p className="min-w-0 flex-1 text-[11px] leading-relaxed text-ink-dim">{q.text}</p>
              <button
                type="button"
                onClick={() => start(() => void removeQuestion(videoId, q.id))}
                aria-label="Remove question"
                className="shrink-0 px-0.5 text-[11px] text-transparent transition-colors group-hover:text-ink-faint hover:!text-accent"
              >
                ⌫
              </button>
            </div>

            <div className="mt-1 flex items-center gap-1.5">
              <BeatPin
                label="opens"
                beatId={q.opened_beat_id}
                index={index}
                onSet={(id) => start(() => void setQuestionBeat(videoId, q.id, "opened", id))}
                focusedBeatId={focusedBeatId}
              />
              <BeatPin
                label="answered"
                beatId={q.answered_beat_id}
                index={index}
                onSet={(id) => start(() => void setQuestionBeat(videoId, q.id, "answered", id))}
                focusedBeatId={focusedBeatId}
              />
              {!q.answered_beat_id && (
                <span className="ml-auto text-[9px] uppercase tracking-wide text-accent/60">
                  open
                </span>
              )}
            </div>
          </div>
        ))}
      </div>

      {pickSource && (
        <div className="mt-1.5 flex flex-wrap gap-1 rounded-md border border-border-soft bg-surface-2 p-1.5">
          {sources.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => {
                setSource(source === s.id ? null : s.id);
                setPickSource(false);
              }}
              title={s.source_id ?? undefined}
              className={`rounded border px-1.5 py-0.5 text-[10px] transition-colors ${
                source === s.id
                  ? "border-accent-dim text-accent"
                  : "border-border-soft text-ink-faint hover:text-ink-dim"
              }`}
            >
              {s.name}
            </button>
          ))}
        </div>
      )}

      <div className="mt-1.5 flex gap-1">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          placeholder="What are they now wondering?"
          className="min-w-0 flex-1 rounded-md border border-border-soft bg-surface px-2 py-1 text-[11px] text-ink outline-none placeholder:text-ink-faint focus:border-accent-dim"
        />
        <button
          type="button"
          onClick={() => setPickSource((v) => !v)}
          title="What kind of uncertainty is this?"
          className={`shrink-0 rounded-md border px-1.5 text-[10px] transition-colors ${
            source ? "border-accent-dim text-accent" : "border-border-soft text-ink-faint"
          }`}
        >
          {source ? sources.find((s) => s.id === source)?.name?.slice(0, 10) : "kind"}
        </button>
      </div>
    </Section>
  );
}

/**
 * Where a question opens or closes.
 *
 * Clicking pins it to the line the caret is on, which keeps the whole gesture
 * on one screen — no dropdown of twenty truncated sentences to hunt through.
 * Clicking an existing pin clears it.
 */
function BeatPin({
  label,
  beatId,
  index,
  onSet,
  focusedBeatId,
}: {
  label: string;
  beatId: string | null;
  index: Map<string, number>;
  onSet: (id: string | null) => void;
  focusedBeatId: string | null;
}) {
  const at = beatId ? index.get(beatId) : null;

  return (
    <button
      type="button"
      disabled={!beatId && !focusedBeatId}
      onClick={() => onSet(beatId ? null : focusedBeatId)}
      title={
        beatId
          ? `Unpin — currently line ${at}`
          : focusedBeatId
            ? "Pin to the line the caret is on"
            : "Put the caret on a line first"
      }
      className={`rounded border px-1.5 py-0.5 font-mono text-[9px] transition-colors ${
        at
          ? "border-border text-ink-faint"
          : "border-dashed border-border-soft text-ink-faint/50 hover:text-ink-faint"
      }`}
    >
      {label} {at ? `· ${at}` : "—"}
    </button>
  );
}

/* ----------------------------------------------------------------- loops */

function Loops({ loops }: { loops: LoopSpan[] }) {
  if (loops.length === 0) return null;

  return (
    <Section title="LOOPS">
      <div className="space-y-0.5">
        {loops.map((l) => (
          <p key={l.loop} className="flex items-baseline gap-2 font-mono text-[10px] text-ink-faint">
            <span className="text-ink-dim">Loop {l.loop}</span>
            <span>~{Math.round(l.sec)}s</span>
            <span className="ml-auto opacity-60">
              {clock(l.startSec)}–{clock(l.endSec)}
            </span>
          </p>
        ))}
      </div>
    </Section>
  );
}

/* -------------------------------------------------------------------- ai */

const VERDICT_STYLE: Record<Verdict, { chip: string; label: string }> = {
  broken: { chip: "border-accent text-accent", label: "BROKEN" },
  weak: { chip: "border-accent-dim text-accent/70", label: "WEAK" },
  works: { chip: "border-border text-ink-faint", label: "WORKS" },
};

/**
 * The editor.
 *
 * The first version of this only described the script, which turned out to be
 * useless — you already know what you wrote. So every call now carries a
 * verdict and, unless it says the line works, the replacement line itself, with
 * a button that puts it in. And "Draft empty lines" writes the beats you have
 * not got to yet, in your voice, from the roles the skeleton already set.
 *
 * It still never writes on its own. A fix lands when you press `use`, a draft
 * lands when you press Tab on that line. The difference from before is that
 * accepting is one keystroke instead of retyping.
 */
function Ask({
  videoId,
  focusedBeatId,
  beats,
  review,
  onReview,
  onDrafts,
  onApplyLine,
}: {
  videoId: string;
  focusedBeatId: string | null;
  beats: { id: string; text: string }[];
  review: StoryReview | null;
  onReview: (review: StoryReview | null) => void;
  onDrafts: (drafts: LineDraft[]) => void;
  onApplyLine: (beatId: string, text: string) => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ideas, setIdeas] = useState<{ kind: SuggestionKind; items: string[] } | null>(null);
  const [open, setOpen] = useState(false);

  const now = new Map(beats.map((b) => [b.id, b.text]));

  /**
   * Has the line this note is about changed since the review ran?
   *
   * Drift is shown, not acted on. Editing the line a note is about is usually
   * you agreeing with it, and deleting the note at that moment removes the
   * thing you were working from mid-edit.
   */
  const drifted = (item: ReviewNote) =>
    Boolean(
      review &&
        item.beatIds.some(
          (id) => review.snapshot[id] !== undefined && review.snapshot[id] !== now.get(id),
        ),
    );

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : "That didn't work.");
    } finally {
      setBusy(null);
    }
  };

  const analyze = () =>
    run("analyze", async () => {
      const result = await analyzeStory(videoId);
      // The model answers in line numbers; everything downstream needs beat ids.
      const notes = result.observations.map((note) => ({
        note,
        beatIds: note.lines
          .map((n) => result.beatIdsByIndex[n - 1])
          .filter((id): id is string => Boolean(id)),
      }));

      // The snapshot is taken here, at the moment the review describes.
      onReview({
        notes,
        snapshot: Object.fromEntries(beats.map((b) => [b.id, b.text])),
        at: new Date().toISOString(),
      });
    });

  const draft = () =>
    run("draft", async () => {
      const drafts = await draftLines(videoId);
      if (drafts.length === 0) throw new Error("Nothing came back for the empty lines.");
      onDrafts(drafts);
    });

  const ask = (kind: SuggestionKind) =>
    run(kind, async () => {
      const items = await suggest(videoId, kind, BEAT_SUGGESTIONS.includes(kind) ? focusedBeatId : null);
      setIdeas({ kind, items });
    });

  return (
    <Section title="EDITOR">
      <div className="flex flex-wrap gap-1">
        <button
          type="button"
          onClick={analyze}
          disabled={busy !== null}
          className="rounded-md border border-border px-2 py-1 text-[11px] text-ink-dim transition-colors hover:border-accent-dim hover:text-accent disabled:opacity-50"
        >
          {busy === "analyze" ? "Reading…" : "Review it"}
        </button>
        <button
          type="button"
          onClick={draft}
          disabled={busy !== null}
          title="Write the lines you haven't got to yet, in your voice"
          className="rounded-md border border-border px-2 py-1 text-[11px] text-ink-dim transition-colors hover:border-accent-dim hover:text-accent disabled:opacity-50"
        >
          {busy === "draft" ? "Writing…" : "Draft empty lines"}
        </button>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="rounded-md border border-border-soft px-2 py-1 text-[11px] text-ink-faint transition-colors hover:text-ink-dim"
        >
          {open ? "Fewer" : "Ask for…"}
        </button>
      </div>

      {open && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {SUGGESTION_KINDS.map((kind) => {
            const needsBeat = BEAT_SUGGESTIONS.includes(kind);
            return (
              <button
                key={kind}
                type="button"
                onClick={() => ask(kind)}
                disabled={busy !== null || (needsBeat && !focusedBeatId)}
                title={needsBeat && !focusedBeatId ? "Put the caret on a line first" : undefined}
                className="rounded border border-border-soft px-1.5 py-0.5 text-[10px] text-ink-faint transition-colors hover:text-accent disabled:opacity-40"
              >
                {busy === kind ? "…" : SUGGESTION_LABEL[kind]}
              </button>
            );
          })}
        </div>
      )}

      {error && <p className="mt-1.5 text-[10px] leading-relaxed text-accent">{error}</p>}

      {review && (
        <div className="mt-2 space-y-1.5 border-t border-border-soft pt-2">
          <p className="flex items-baseline gap-2 text-[10px] tracking-wide text-ink-dim">
            THE REVIEW
            <span className="font-normal tracking-normal text-ink-faint">
              {new Date(review.at).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
            <button
              type="button"
              onClick={() => onReview(null)}
              className="ml-auto font-normal text-ink-faint transition-colors hover:text-accent"
            >
              clear
            </button>
          </p>

          {review.notes.map((item, i) => {
            const { note, beatIds } = item;
            const moved = drifted(item);
            return (
            <div
              key={i}
              className={`rounded-md border border-border-soft px-2 py-1.5 ${
                moved ? "opacity-60" : ""
              }`}
            >
              <p className="mb-1 flex items-baseline gap-1.5">
                <span
                  className={`rounded border px-1 py-px text-[9px] tracking-wide ${
                    VERDICT_STYLE[note.verdict].chip
                  }`}
                >
                  {VERDICT_STYLE[note.verdict].label}
                </span>
                <span className="text-[9px] uppercase tracking-wide text-ink-faint/70">
                  {note.area}
                </span>
                {note.lines.length > 0 && (
                  <span className="ml-auto font-mono text-[9px] text-ink-faint/60">
                    line {note.lines.join(", ")}
                  </span>
                )}
              </p>

              <p className="text-[11px] leading-relaxed text-ink-dim">{note.text}</p>

              {moved && (
                <p className="mt-1 text-[9px] leading-relaxed text-accent/60">
                  You have edited this line since — the note may no longer fit.
                </p>
              )}

              {note.fix && (
                <div className="mt-1.5 rounded border border-border-soft bg-surface-2 px-2 py-1">
                  <p className="text-[11px] leading-relaxed text-ink">{note.fix}</p>
                  {beatIds[0] && (
                    <button
                      type="button"
                      onClick={() => onApplyLine(beatIds[0], note.fix as string)}
                      title={
                        moved ? "This will overwrite the version you have just written" : undefined
                      }
                      className="mt-1 text-[9px] tracking-wide text-accent/70 transition-colors hover:text-accent"
                    >
                      USE THIS — replaces line {note.lines[0]}
                    </button>
                  )}
                </div>
              )}
            </div>
            );
          })}
        </div>
      )}

      {ideas && (
        <div className="mt-2 space-y-1 border-t border-border-soft pt-2">
          <p className="flex items-baseline gap-2 text-[10px] tracking-wide text-ink-faint">
            {SUGGESTION_LABEL[ideas.kind].toUpperCase()}
            <button
              type="button"
              onClick={() => setIdeas(null)}
              className="ml-auto transition-colors hover:text-accent"
            >
              clear
            </button>
          </p>
          {ideas.items.map((item, i) => (
            <div
              key={i}
              className="rounded-md border border-border-soft bg-surface-2 px-2 py-1"
            >
              <p className="text-[11px] leading-relaxed text-ink-dim">{item}</p>
              {focusedBeatId && (
                <button
                  type="button"
                  onClick={() => onApplyLine(focusedBeatId, item)}
                  className="mt-1 text-[9px] tracking-wide text-accent/70 transition-colors hover:text-accent"
                >
                  USE THIS
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}

/* ------------------------------------------------------------------ misc */

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-border-soft px-3 py-2.5">
      <p className="mb-1.5 text-[10px] tracking-wide text-ink-dim">{title}</p>
      {children}
    </section>
  );
}
