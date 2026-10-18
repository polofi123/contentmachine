"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { approxSec, totalSec, totalWords } from "@/lib/timing";
import { loopSpans, type StoryBeat } from "@/lib/story";
import type { PileItem } from "./pile";
import { Guide, colorFor, type Teaching, type WordType } from "./guide";
import { WORD_TAGGABLE } from "../lego-options";
import {
  DANCE_LABEL,
  DANCE_RELATIONS,
  ROLE_HINT,
  ROLE_TEACHES,
  STORY_ROLES,
  isDanceRelation,
  isStoryRole,
  type DanceRelation,
  type StoryRole,
} from "../story-vocab";
import { ChipMenu } from "./chip-menu";
import { Palette, type PaletteComponent } from "./palette";
import { Tray, type TrayComponent } from "./tray";
import { Diagnostics } from "./diagnostics";
import type {
  DirectionRow,
  LensRow,
  QuestionRow,
  StoryReview,
  TensionSource,
} from "./story-panel";
import {
  beatFromText,
  createBeats,
  ensureScript,
  parkBeat,
  removeBeat,
  reorderBeats,
  saveBeatText,
  savePremise,
  setBeatSection,
  unparkBeat,
  addBeatTag,
  removeBeatTag,
  healBeatTags,
} from "./actions";
import {
  attachTechnique,
  autoLoop,
  detachTechnique,
  setBeatDance,
  setBeatLoop,
  setBeatRole,
} from "./story-actions";

export type GuideComponent = {
  id: string;
  source_id: string | null;
  name: string;
  body: string | null;
  layer_id: string | null;
  parent_id: string | null;
};

export type BeatTag = {
  id: string;
  beat_id: string;
  component_id: string;
  source_id: string | null;
  span_start: number;
  span_end: number;
  span_text: string;
};

export type StorySection = "start" | "middle" | "end";

export type WorkspaceBeat = {
  id: string;
  text: string;
  story_section: string | null;
  t_start_sec: number | null;

  /** What the line is FOR. A different taxonomy from the techniques on it. */
  story_role: string | null;
  /** How it follows the line above. Stored here, pointing back. */
  dance_relation: string | null;
  /** Which cycle of attention it belongs to. */
  story_loop: number | null;
  /** Component ids planted on this line. Many per line, many lines per one. */
  techniques: string[];
};

const SAVE_DEBOUNCE_MS = 600;

// Cycles the way every other control in this app cycles: tap forward, tap past
// the end to clear. Unassigned is a real, permanent option, not a gap.
const SECTION_CYCLE: (StorySection | null)[] = ["start", "middle", "end", null];

const newId = () => crypto.randomUUID();

/* ------------------------------------------------------ the review store */

// The review is client-only state that has to survive a reload, which makes it
// an external store rather than component state — so it is read through
// useSyncExternalStore, the primitive React provides for exactly this.
//
// localStorage, not sessionStorage. Session storage dies with the tab, so
// closing the window or opening the video in a second tab lost the review — a
// distinction nobody should have to know about when the thing they asked for
// has silently gone.
//
// The alternative (useState seeded from an effect) is what the lint rule
// rejects, and rightly: the server renders `null`, the effect then sets the
// stored value, and everything derived from it — the margin dots — flickers
// through a hydration mismatch on the way. useSyncExternalStore has a separate
// server snapshot precisely so that does not happen.

const reviewListeners = new Set<() => void>();

const subscribeReview = (onChange: () => void) => {
  reviewListeners.add(onChange);
  return () => void reviewListeners.delete(onChange);
};

// getSnapshot must return a referentially stable value or React re-renders
// forever, so the parsed object is cached against the raw string it came from.
let cachedKey: string | null = null;
let cachedRaw: string | null = null;
let cachedReview: StoryReview | null = null;

function readReview(key: string): StoryReview | null {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(key);
  } catch {
    return null;
  }

  if (key !== cachedKey || raw !== cachedRaw) {
    cachedKey = key;
    cachedRaw = raw;
    try {
      cachedReview = raw ? (JSON.parse(raw) as StoryReview) : null;
    } catch {
      // A corrupt entry is not worth surfacing — the review is one button away,
      // and failing to restore it must never break the editor.
      cachedReview = null;
    }
  }

  return cachedReview;
}

function writeReview(key: string, review: StoryReview | null) {
  try {
    if (review) localStorage.setItem(key, JSON.stringify(review));
    else localStorage.removeItem(key);
  } catch {
    // Storage blocked or full. The review still works for this session.
  }
  reviewListeners.forEach((listener) => listener());
}

const emptyBeat = (): WorkspaceBeat => ({
  id: newId(),
  text: "",
  story_section: null,
  t_start_sec: null,
  story_role: null,
  dance_relation: null,
  story_loop: null,
  techniques: [],
});

/**
 * What a new script already knows.
 *
 * A blank page is not neutral — it quietly asks you to remember the whole
 * framework before you can write a word. Parts of the theory apply to every
 * short, so they are here from the start: SCR-03's opening, the Core Loop
 * through the middle, a payoff and a CTA at the end.
 *
 * Two things it now carries that it did not before. Every line has a ROLE
 * rather than a free-text label, so tagging a technique can no longer erase
 * what the line is for. And the lines are grouped into three loops, because
 * retention is not one hook followed by hoping — it is build, release, build
 * again, and the scaffold should show that shape before you have written into
 * it. A `meaning` line sits before the CTA for the same reason: it is the
 * easiest beat in short form to leave out and the one that decides whether any
 * of it landed.
 *
 * It is a scaffold, not a contract. Lines are deletable, reorderable and
 * re-rolable, loops are editable, and nothing is written to the database until
 * the first character is typed — open a video and change your mind and no draft
 * is left behind.
 */
const SKELETON: { role: StoryRole; section: StorySection; loop: number }[] = [
  { role: "hook", section: "start", loop: 1 },
  { role: "foreshadow", section: "start", loop: 1 },
  { role: "transition", section: "start", loop: 1 },
  { role: "stakes", section: "middle", loop: 2 },
  { role: "question", section: "middle", loop: 2 },
  { role: "twist", section: "middle", loop: 2 },
  { role: "rehook", section: "middle", loop: 3 },
  { role: "payoff", section: "end", loop: 3 },
  { role: "meaning", section: "end", loop: 3 },
  { role: "cta", section: "end", loop: 3 },
];

export const skeletonBeats = (): WorkspaceBeat[] =>
  SKELETON.map((s) => ({
    ...emptyBeat(),
    story_section: s.section,
    story_role: s.role,
    story_loop: s.loop,
  }));

/**
 * Short form is one thought per line, so a pasted paragraph should arrive as
 * lines rather than a wall.
 *
 * Deliberately conservative: it only breaks when a sentence ends AND the next
 * one visibly begins, which leaves "3.5", "e.g." and "Mr. Beast" alone. Missing
 * a split is recoverable in a keystroke; wrongly cutting someone's sentence in
 * half is just annoying.
 */
const ABBREVIATION =
  /(?:\b(?:mr|mrs|ms|dr|prof|sr|jr|st|vs|etc|approx|dept|fig|no|e\.g|i\.e)|\b[A-Z])\.$/i;

export function splitSentences(text: string): string[] {
  const rough = text
    .split(/(?<=[.!?…])\s+(?=["'“‘(]?[A-Z0-9])/u)
    .map((s) => s.trim())
    .filter(Boolean);

  // Stitch back the places where the full stop was not the end of anything:
  // "Mr. Beast", "e.g. this", "J. K. Rowling". Decimals never reach here — a
  // split needs whitespace after the stop, and "3.5" has none.
  const out: string[] = [];
  for (const piece of rough) {
    const last = out[out.length - 1];
    if (last && ABBREVIATION.test(last)) out[out.length - 1] = `${last} ${piece}`;
    else out.push(piece);
  }

  return out;
}

/**
 * MAKE: the script and the loose bricks beside it, under one drag context.
 *
 * Everything else in this app is a <form> posting to a server action, which is
 * right for toggling a technique and wrong for writing a sentence — a round
 * trip per keystroke is not a writing experience. So this component holds the
 * text on screen and persists through server actions in the background. That is
 * still no client-side fetching: these are server functions, not calls to an
 * API the browser knows about.
 *
 * The rule the whole thing is built around: never make someone answer a
 * question before they can express the thought. No timestamp, no label, no
 * section, no framework. Type, press Enter, type again.
 *
 * Story sections are LABELS on one ordered list, not containers holding beats.
 * Containers would mean the running order is "unsectioned, then start, then
 * middle, then end", so labelling one line START would rip it out of position
 * and reshuffle the script around it. Sections are something you notice about
 * writing that already exists; they must not move it. sort_order stays the only
 * ordering, and a header is drawn wherever the label changes.
 */
export function Workspace({
  videoId,
  scriptId: initialScriptId,
  initialBeats,
  initialPremise,
  initialPile,
  paletteComponents,
  trayComponents,
  targetSec,
  guideComponents,
  initialTags,
  direction,
  lenses,
  questions,
  tensionSources,
  aiEnabled,
}: {
  videoId: string;
  scriptId: string | null;
  initialBeats: WorkspaceBeat[];
  initialPremise: string;
  initialPile: PileItem[];
  paletteComponents: PaletteComponent[];
  trayComponents: TrayComponent[];
  targetSec: number | null;
  guideComponents: GuideComponent[];
  initialTags: BeatTag[];
  direction: DirectionRow | null;
  lenses: LensRow[];
  questions: QuestionRow[];
  tensionSources: TensionSource[];
  aiEnabled: boolean;
}) {
  // A script that has never been written into opens on the skeleton rather than
  // a blank line. Nothing is saved until the first character is typed.
  const [beats, setBeats] = useState<WorkspaceBeat[]>(
    initialBeats.length > 0 ? initialBeats : skeletonBeats(),
  );
  const [pile, setPile] = useState<PileItem[]>(initialPile);
  const [premise, setPremise] = useState(initialPremise);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [focusTarget, setFocusTarget] = useState<{
    id: string;
    caret: "start" | "end" | "at";
    offset?: number;
  } | null>(null);
  /** Which line the slash palette is open on, if any. */
  const [paletteFor, setPaletteFor] = useState<string | null>(null);
  /** Which line has its role or relation menu open, if any. */
  const [menuFor, setMenuFor] = useState<{ id: string; kind: "role" | "dance" } | null>(null);
  /**
   * Whether the structure is shown or stays out of the way.
   *
   * Off by default, and off is a real mode rather than a lesser one — clean
   * writing is what this workspace is for, and roles, relations and loop
   * headers are things you notice ABOUT writing that already exists. They are
   * still one hover away when it is off, so nothing is hidden, only quiet.
   */
  const [overlay, setOverlay] = useState(false);
  /**
   * Whether anything is waiting to be written, and when the last write landed.
   *
   * The outliner has always saved on its own, but silently — which is fine
   * right up until the moment you have lost work once, and then a screen that
   * never says "saved" is a screen you cannot trust. These two drive the
   * indicator in the footer.
   */
  const [dirty, setDirty] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  /**
   * The last review, owned here rather than by the panel that renders it.
   *
   * It used to live inside the STORY tab, which meant clicking GUIDE to read
   * what a line teaches destroyed it — and it was also wiped on every
   * keystroke. Both were the same mistake: treating a review you asked for, and
   * are working from, as throwaway UI state. It now outlives the tab, outlives
   * an edit, and outlives a reload.
   */
  const reviewKey = `story-review:${videoId}`;
  const review = useSyncExternalStore(
    subscribeReview,
    () => readReview(reviewKey),
    () => null,
  );
  const setReview = useCallback(
    (next: StoryReview | null) => writeReview(reviewKey, next),
    [reviewKey],
  );
  /**
   * Lines the editor drafted but you have not accepted.
   *
   * Held apart from `beats` on purpose. A draft is not in the script — it shows
   * as ghost text in the empty line it was written for, and becomes real on
   * Tab. Writing them straight into the beats would mean the AI had edited your
   * script and you had to undo it, which is the wrong way round.
   */
  const [drafts, setDrafts] = useState<Map<string, string>>(new Map());
  const [tags, setTags] = useState<BeatTag[]>(initialTags);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [selection, setSelection] = useState<{
    beatId: string;
    start: number;
    end: number;
    text: string;
  } | null>(null);

  const inputs = useRef(new Map<string, HTMLTextAreaElement>());
  const saveTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const persisted = useRef(new Set(initialBeats.map((b) => b.id)));
  const scriptIdRef = useRef<string | null>(initialScriptId);
  const scriptPromise = useRef<Promise<string> | null>(null);
  const premiseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Every write goes through one queue. Creating a beat, reordering and saving
  // text are order-dependent — a reorder that lands before the insert it refers
  // to would renumber a row that does not exist yet.
  const chain = useRef<Promise<unknown>>(Promise.resolve());
  // How many writes are still in flight, so "saved" means the queue is empty
  // rather than "the most recent one happened to finish".
  const inFlight = useRef(0);

  const enqueue = useCallback((fn: () => Promise<unknown>) => {
    inFlight.current += 1;
    setDirty(true);

    const run = async () => {
      let ok = true;
      try {
        await fn();
        setSaveError(null);
      } catch (err) {
        ok = false;
        setSaveError(err instanceof Error ? err.message : "Could not save");
      } finally {
        inFlight.current -= 1;
        if (inFlight.current === 0) {
          setDirty(false);
          // Only stamp a time when the write actually landed. A clock that
          // updates after a failure is worse than no clock.
          if (ok) setSavedAt(Date.now());
        }
      }
    };

    chain.current = chain.current.then(run, run);
    return chain.current;
  }, []);

  const getScriptId = useCallback(async () => {
    if (scriptIdRef.current) return scriptIdRef.current;
    if (!scriptPromise.current) {
      scriptPromise.current = ensureScript(videoId).then((id) => {
        scriptIdRef.current = id;
        return id;
      });
    }
    return scriptPromise.current;
  }, [videoId]);

  /**
   * Write down every line that isn't in the database yet.
   *
   * Takes the whole list rather than one beat because of the skeleton: the
   * first character typed into line 4 has to bring lines 1-3 with it, or the
   * running order and the labels arrive in pieces.
   */
  const persistPending = useCallback(
    async (all: WorkspaceBeat[], orderedIds: string[]) => {
      const pending = all.filter((b) => !persisted.current.has(b.id));
      if (pending.length === 0) return;

      pending.forEach((b) => persisted.current.add(b.id));
      const scriptId = await getScriptId();

      await createBeats(
        videoId,
        scriptId,
        pending.map((b) => ({
          id: b.id,
          text: b.text,
          story_section: b.story_section,
          story_role: b.story_role,
          story_loop: b.story_loop,
        })),
        orderedIds,
      );
    },
    [getScriptId, videoId],
  );

  useEffect(() => {
    if (!focusTarget) return;
    const el = inputs.current.get(focusTarget.id);
    if (!el) return;
    el.focus();
    const pos =
      focusTarget.caret === "start"
        ? 0
        : focusTarget.caret === "at"
          ? Math.min(focusTarget.offset ?? 0, el.value.length)
          : el.value.length;
    el.setSelectionRange(pos, pos);
    setFocusTarget(null);
  }, [focusTarget, beats]);

  useEffect(() => {
    const timers = saveTimers.current;
    return () => timers.forEach((t) => clearTimeout(t));
  }, []);


  const scheduleSave = (beatId: string, text: string, all: WorkspaceBeat[]) => {
    const existing = saveTimers.current.get(beatId);
    if (existing) clearTimeout(existing);

    // Typed but not yet written. The footer says so from this moment, not from
    // when the debounce eventually fires.
    setDirty(true);

    const orderedIds = all.map((b) => b.id);

    saveTimers.current.set(
      beatId,
      setTimeout(() => {
        saveTimers.current.delete(beatId);
        enqueue(async () => {
          await persistPending(all, orderedIds);
          await saveBeatText(beatId, text);
          // Offsets drift as the line is edited; repair them from the tagged
          // text so a highlight never ends up underlining the wrong words.
          await healBeatTags(beatId, text);
        });
      }, SAVE_DEBOUNCE_MS),
    );
  };

  const handleChange = (index: number, text: string) => {
    const next = beats.map((b, i) => (i === index ? { ...b, text } : b));
    setBeats(next);

    // Deliberately does NOT clear the review. Editing a line a note is about is
    // usually you acting ON that note, and deleting it at that exact moment
    // takes away the thing being worked from. Drift is shown on the note
    // instead — see StoryReview.snapshot.

    // Same repair the server does, applied immediately so the underline follows
    // the words on screen rather than lagging a save behind them.
    const beatId = next[index].id;
    setTags((all) =>
      all.flatMap((t) => {
        if (t.beat_id !== beatId) return [t];
        if (text.slice(t.span_start, t.span_end) === t.span_text) return [t];
        const at = text.indexOf(t.span_text);
        return at === -1
          ? []
          : [{ ...t, span_start: at, span_end: at + t.span_text.length }];
      }),
    );

    scheduleSave(beatId, text, next);
  };

  /**
   * Enter splits the line at the caret and takes the rest of the sentence with
   * it. Pressing it at the end of a line is just the special case where there
   * is nothing after the caret to carry down.
   */
  const splitAt = (index: number, caret: number) => {
    const current = beats[index];
    const before = current.text.slice(0, caret);
    const after = current.text.slice(caret);

    const beat = emptyBeat();
    beat.text = after;
    // A new line continues the section and the loop it was written inside — the
    // writer is still in the middle of both, so asking again would be noise.
    // The ROLE is deliberately not inherited: two consecutive lines are rarely
    // doing the same job, and a wrong role is worse than none.
    beat.story_section = current.story_section;
    beat.story_loop = current.story_loop;

    const next = [
      ...beats.slice(0, index),
      { ...current, text: before },
      beat,
      ...beats.slice(index + 1),
    ];

    setBeats(next);
    setFocusTarget({ id: beat.id, caret: "start" });

    const orderedIds = next.map((b) => b.id);
    enqueue(async () => {
      await persistPending(next, orderedIds);
      await saveBeatText(current.id, before);
      if (after) await saveBeatText(beat.id, after);
    });
  };

  /** Backspace at the start of a line puts it back on the end of the one above. */
  const mergeUp = (index: number) => {
    if (index === 0) return;
    const prev = beats[index - 1];
    const current = beats[index];
    const joined = prev.text + current.text;

    const next = beats
      .map((b, i) => (i === index - 1 ? { ...b, text: joined } : b))
      .filter((_, i) => i !== index);

    setBeats(next);
    setFocusTarget({ id: prev.id, caret: "at", offset: prev.text.length });

    const timer = saveTimers.current.get(current.id);
    if (timer) clearTimeout(timer);
    saveTimers.current.delete(current.id);

    const orderedIds = next.map((b) => b.id);
    const wasPersisted = persisted.current.has(current.id);
    persisted.current.delete(current.id);

    enqueue(async () => {
      await persistPending(next, orderedIds);
      await saveBeatText(prev.id, joined);
      if (wasPersisted) {
        const scriptId = await getScriptId();
        await removeBeat(videoId, scriptId, current.id, orderedIds);
      }
    });
  };

  /** A pasted paragraph arrives as lines, because short form is one per line. */
  const pasteInto = (index: number, caret: number, pasted: string) => {
    const pieces = splitSentences(pasted);
    if (pieces.length < 2) return false;

    const current = beats[index];
    const before = current.text.slice(0, caret);
    const after = current.text.slice(caret);

    const made = pieces.map((text, i) => {
      const beat = emptyBeat();
      beat.story_section = current.story_section;
      beat.story_loop = current.story_loop;
      beat.text = i === 0 ? before + text : text;
      return beat;
    });

    // The tail of the line the paste landed in rides on the last new line.
    made[made.length - 1].text += after;
    // The first piece keeps the original row so its label and history survive.
    made[0] = { ...current, text: made[0].text };

    const next = [...beats.slice(0, index), ...made, ...beats.slice(index + 1)];
    setBeats(next);

    const last = made[made.length - 1];
    setFocusTarget({ id: last.id, caret: "end" });

    const orderedIds = next.map((b) => b.id);
    enqueue(async () => {
      await persistPending(next, orderedIds);
      for (const b of made) await saveBeatText(b.id, b.text);
    });

    return true;
  };

  const commitOrder = (next: WorkspaceBeat[]) => {
    setBeats(next);
    const orderedIds = next.map((b) => b.id);
    enqueue(async () => {
      const scriptId = await getScriptId();
      // Unsaved lines in the list are fine to send — reorderBeats drops them.
      await reorderBeats(scriptId, orderedIds);
    });
  };

  const move = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= beats.length) return;

    const next = [...beats];
    [next[index], next[target]] = [next[target], next[index]];
    setFocusTarget({ id: beats[index].id, caret: "end" });
    commitOrder(next);
  };

  const setSection = (index: number, next: StorySection | null) => {
    const beat = beats[index];
    const updated = beats.map((b, i) => (i === index ? { ...b, story_section: next } : b));
    setBeats(updated);

    const orderedIds = updated.map((b) => b.id);
    enqueue(async () => {
      await persistPending(updated, orderedIds);
      await setBeatSection(videoId, beat.id, next);
    });
  };

  const cycleSection = (index: number) => {
    const current = (beats[index].story_section ?? null) as StorySection | null;
    setSection(index, SECTION_CYCLE[(SECTION_CYCLE.indexOf(current) + 1) % SECTION_CYCLE.length]);
  };

  /** Set a line aside without losing it. */
  const park = (index: number) => {
    const beat = beats[index];
    const remaining = beats.filter((_, i) => i !== index);
    // The script never renders as nothing — there is always a line to type in.
    const next = remaining.length > 0 ? remaining : [emptyBeat()];
    setBeats(next);

    if (!persisted.current.has(beat.id)) return;

    setPile((p) => [{ id: beat.id, kind: "words", text: beat.text || "(empty line)" }, ...p]);

    const orderedIds = next.map((b) => b.id);
    enqueue(async () => {
      const scriptId = await getScriptId();
      await parkBeat(videoId, beat.id);
      await reorderBeats(scriptId, orderedIds);
    });
  };

  /** A brick from the pile becomes a line at `atIndex`. */
  const dropFromPile = (item: PileItem, atIndex: number) => {
    const isParkedLine = item.kind === "words";
    const beat: WorkspaceBeat = isParkedLine
      ? { ...emptyBeat(), id: item.id, text: item.text === "(empty line)" ? "" : item.text }
      : { ...emptyBeat(), text: item.text };

    // Only ever replace the single untouched placeholder a blank script opens
    // with. Sweeping up every empty line would throw away blank lines the
    // writer made on purpose — and they would survive in the database anyway,
    // so the screen and the script would quietly stop agreeing.
    const lonePlaceholder =
      beats.length === 1 && beats[0].text.trim() === "" && !persisted.current.has(beats[0].id);

    const final = lonePlaceholder ? [beat] : [...beats];
    if (!lonePlaceholder) final.splice(Math.min(atIndex, final.length), 0, beat);

    setBeats(final);
    persisted.current.add(beat.id);

    // Only a parked line leaves the pile — it is the same row moving back. A
    // hook or a captured idea still exists as itself and stays where it is.
    if (isParkedLine) {
      setPile((p) => p.filter((i) => !(i.kind === "words" && i.id === item.id)));
    }

    const orderedIds = final.map((b) => b.id);
    enqueue(async () => {
      const scriptId = await getScriptId();
      if (isParkedLine) {
        await unparkBeat(videoId, scriptId, beat.id, orderedIds);
      } else {
        await beatFromText(videoId, scriptId, beat.id, beat.text, orderedIds);
      }
    });
  };

  /**
   * Plant a technique on this line.
   *
   * Adds rather than replaces — a line can be a counterintuitive claim AND an
   * open loop — and, crucially, does not touch the line's role. The old version
   * wrote the component's name over the label, so tagging your hook with "Open
   * Loop" stopped it being the hook. That is the bug this whole split exists to
   * fix, and it would be quietly reintroduced by one careless line here.
   */
  const plant = (beatId: string, component: PaletteComponent) => {
    const beat = beats.find((b) => b.id === beatId);
    if (!beat || beat.techniques.includes(component.id)) {
      setPaletteFor(null);
      setFocusTarget({ id: beatId, caret: "end" });
      return;
    }

    setBeats((all) =>
      all.map((b) =>
        b.id === beatId ? { ...b, techniques: [...b.techniques, component.id] } : b,
      ),
    );
    setPaletteFor(null);
    setFocusTarget({ id: beatId, caret: "end" });

    const orderedIds = beats.map((b) => b.id);
    enqueue(async () => {
      // A line that was never saved cannot carry a technique yet.
      await persistPending(beats, orderedIds);
      await attachTechnique(videoId, beatId, component.id);
    });
  };

  const unplant = (beatId: string, componentId: string) => {
    setBeats((all) =>
      all.map((b) =>
        b.id === beatId
          ? { ...b, techniques: b.techniques.filter((id) => id !== componentId) }
          : b,
      ),
    );

    enqueue(() => detachTechnique(videoId, beatId, componentId));
  };

  /**
   * Write everything down, now.
   *
   * The outliner already saves on a 600ms debounce, so this is not what makes
   * the work safe — it is what makes the work *visibly* safe, which after
   * losing a script is not the same thing. It cancels every pending timer and
   * runs those writes immediately against the current text, so pressing it
   * always means "there is nothing left in flight".
   *
   * Safe to press with nothing outstanding: it still flushes any unsaved lines
   * and stamps the clock, so the answer to "did that save?" is always on screen.
   */
  const saveNow = useCallback(() => {
    const waiting = [...saveTimers.current.keys()];
    saveTimers.current.forEach((timer) => clearTimeout(timer));
    saveTimers.current.clear();

    if (premiseTimer.current) {
      clearTimeout(premiseTimer.current);
      premiseTimer.current = null;
    }

    const all = beats;
    const orderedIds = all.map((b) => b.id);

    return enqueue(async () => {
      await persistPending(all, orderedIds);
      await savePremise(videoId, premise);

      for (const beatId of waiting) {
        const beat = all.find((b) => b.id === beatId);
        if (!beat) continue;
        await saveBeatText(beatId, beat.text);
        await healBeatTags(beatId, beat.text);
      }
    });
  }, [beats, premise, enqueue, persistPending, videoId]);

  // Ctrl/Cmd+S, because that is what everyone's hands already do.
  //
  // The handler is held in a ref so the listener is attached once rather than
  // torn down and rebuilt on every keystroke — `saveNow` closes over the beats,
  // so it changes as you type. The ref is updated in an effect, not during
  // render, which is the rule React enforces here.
  const saveRef = useRef(saveNow);

  useEffect(() => {
    saveRef.current = saveNow;
  }, [saveNow]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void saveRef.current();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  /** What this line is for. Independent of anything planted on it. */
  const setRole = (beatId: string, role: StoryRole | null) => {
    const updated = beats.map((b) => (b.id === beatId ? { ...b, story_role: role } : b));
    setBeats(updated);
    setMenuFor(null);
    setFocusTarget({ id: beatId, caret: "end" });

    const orderedIds = updated.map((b) => b.id);
    enqueue(async () => {
      await persistPending(updated, orderedIds);
      await setBeatRole(videoId, beatId, role);
    });
  };

  /** How this line follows the one above it. */
  const setDance = (beatId: string, relation: DanceRelation | null) => {
    const updated = beats.map((b) => (b.id === beatId ? { ...b, dance_relation: relation } : b));
    setBeats(updated);
    setMenuFor(null);
    setFocusTarget({ id: beatId, caret: "end" });

    const orderedIds = updated.map((b) => b.id);
    enqueue(async () => {
      await persistPending(updated, orderedIds);
      await setBeatDance(videoId, beatId, relation);
    });
  };

  /**
   * Move a line into the next loop, wrapping back to unassigned.
   *
   * Cycling rather than picking, because loop numbers are almost always
   * assigned to a line by looking at its neighbours — "this one starts the next
   * one" — and the ceiling is one past whatever is already in use, so a new
   * loop is always exactly one tap past the last.
   */
  const cycleLoop = (beatId: string) => {
    const highest = beats.reduce((n, b) => Math.max(n, b.story_loop ?? 0), 0);
    const current = beats.find((b) => b.id === beatId)?.story_loop ?? null;
    const next = current === null ? 1 : current >= highest ? null : current + 1;

    const updated = beats.map((b) => (b.id === beatId ? { ...b, story_loop: next } : b));
    setBeats(updated);

    const orderedIds = updated.map((b) => b.id);
    enqueue(async () => {
      await persistPending(updated, orderedIds);
      await setBeatLoop(videoId, beatId, next);
    });
  };

  /**
   * Put text into a line — from an accepted draft, or a fix from the review.
   *
   * Routed through the same path as typing, so it debounces, saves and clears
   * stale notes exactly as a keystroke would. The one addition is dropping the
   * draft for that line: once the words are in the script they are yours, and a
   * ghost still offering them would be offering to overwrite you.
   */
  const applyLine = (beatId: string, text: string) => {
    const index = beats.findIndex((b) => b.id === beatId);
    if (index < 0) return;

    handleChange(index, text);
    setDrafts((all) => {
      if (!all.has(beatId)) return all;
      const next = new Map(all);
      next.delete(beatId);
      return next;
    });
    setFocusTarget({ id: beatId, caret: "end" });
  };

  /** Number every line from the hooks and re-hooks already on the script. */
  const relayLoops = () => {
    const orderedIds = beats.map((b) => b.id);
    enqueue(async () => {
      await persistPending(beats, orderedIds);
      const scriptId = await getScriptId();
      await autoLoop(videoId, scriptId);
    });

    // Mirror the server's rule locally so the numbers move now rather than
    // after a round trip: a new loop starts at each hook or re-hook, and
    // anything before the first one belongs to no loop at all.
    let loop = 0;
    setBeats((all) =>
      all.map((b) => {
        if (b.story_role === "hook" || b.story_role === "rehook") loop += 1;
        return { ...b, story_loop: loop || null };
      }),
    );
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>, index: number) => {
    const el = e.currentTarget;
    const beat = beats[index];

    // Tab accepts the drafted line sitting in this empty row. Only ever on an
    // empty row with a draft — everywhere else Tab still moves focus, because
    // stealing it would break the keyboard for someone who has no drafts.
    if (e.key === "Tab" && !e.shiftKey && !beat.text.trim() && drafts.has(beat.id)) {
      e.preventDefault();
      applyLine(beat.id, drafts.get(beat.id) as string);
      return;
    }

    // Escape throws the ghost away without touching the line.
    if (e.key === "Escape" && drafts.has(beat.id)) {
      e.preventDefault();
      setDrafts((all) => {
        const next = new Map(all);
        next.delete(beat.id);
        return next;
      });
      return;
    }

    // `/` opens the framework, but only where it cannot be part of a word —
    // otherwise "and/or" would fire the palette mid-sentence.
    if (e.key === "/") {
      const before = el.value.slice(0, el.selectionStart);
      if (before === "" || /\s$/.test(before)) {
        e.preventDefault();
        setPaletteFor(beats[index].id);
        return;
      }
    }

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      splitAt(index, el.selectionStart);
      return;
    }

    if (e.key === "Backspace" && el.selectionStart === 0 && el.selectionEnd === 0) {
      if (index > 0) {
        e.preventDefault();
        mergeUp(index);
      }
      return;
    }

    // Sections on the keyboard, same modifier as reordering. Writing and
    // structuring should not require reaching for the mouse in between.
    if (e.altKey && ["1", "2", "3", "0"].includes(e.key)) {
      e.preventDefault();
      const target = ({ "1": "start", "2": "middle", "3": "end", "0": null } as const)[
        e.key as "1" | "2" | "3" | "0"
      ];
      setSection(index, target);
      return;
    }

    // The rest of the overlay on the keyboard, same modifier as sections and
    // reordering. Structuring a script should not mean reaching for the mouse
    // between every line.
    if (e.altKey && (e.key === "r" || e.key === "R")) {
      e.preventDefault();
      setMenuFor({ id: beats[index].id, kind: "role" });
      return;
    }

    if (e.altKey && (e.key === "d" || e.key === "D") && index > 0) {
      e.preventDefault();
      setMenuFor({ id: beats[index].id, kind: "dance" });
      return;
    }

    if (e.altKey && (e.key === "l" || e.key === "L")) {
      e.preventDefault();
      cycleLoop(beats[index].id);
      return;
    }

    if (e.altKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
      e.preventDefault();
      move(index, e.key === "ArrowUp" ? -1 : 1);
      return;
    }

    if (e.key === "ArrowUp" && el.selectionStart === 0 && index > 0) {
      e.preventDefault();
      setFocusTarget({ id: beats[index - 1].id, caret: "end" });
      return;
    }

    if (e.key === "ArrowDown" && el.selectionStart === el.value.length && index < beats.length - 1) {
      e.preventDefault();
      setFocusTarget({ id: beats[index + 1].id, caret: "start" });
    }
  };

  const handlePremise = (text: string) => {
    setPremise(text);
    if (premiseTimer.current) clearTimeout(premiseTimer.current);
    premiseTimer.current = setTimeout(() => {
      enqueue(() => savePremise(videoId, text));
    }, SAVE_DEBOUNCE_MS);
  };

  const sensors = useSensors(
    // A small threshold so a click into the text still reads as a click.
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) return;

    const activeType = active.data.current?.type;
    const overId = String(over.id);

    if (activeType === "pile") {
      const item = active.data.current?.item as PileItem | undefined;
      if (!item) return;
      const at = overId === "script-end" ? beats.length : beats.findIndex((b) => b.id === overId);
      dropFromPile(item, at < 0 ? beats.length : at);
      return;
    }

    // A beat dragged onto the pile is set aside rather than deleted.
    if (overId === "pile-drop") {
      const index = beats.findIndex((b) => b.id === active.id);
      if (index >= 0) park(index);
      return;
    }

    if (active.id === over.id) return;
    const from = beats.findIndex((b) => b.id === active.id);
    const to = beats.findIndex((b) => b.id === over.id);
    if (from < 0 || to < 0) return;

    const next = [...beats];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    commitOrder(next);
  };

  /* ---------------------------------------------------------------- guide */

  const focused = beats.find((b) => b.id === focusedId) ?? null;
  const focusRole = isStoryRole(focused?.story_role) ? focused.story_role : null;
  const focusLabel = focusRole;

  const byId = new Map(guideComponents.map((c) => [c.id, c]));
  const bySource = new Map(
    guideComponents.filter((c) => c.source_id).map((c) => [c.source_id as string, c]),
  );

  // A technique you planted yourself wins over the role's default teaching —
  // you said what this line is doing, so that is what should be explained.
  // Falling back to the role means a line still teaches something the moment it
  // has a job, without waiting for you to tag anything.
  const teachingComponent =
    (focused?.techniques.length ? byId.get(focused.techniques[0]) : null) ??
    (focusRole ? bySource.get(ROLE_TEACHES[focusRole]) : null) ??
    null;

  const teaching: Teaching | null = teachingComponent
    ? {
        source_id: teachingComponent.source_id,
        name: teachingComponent.name,
        body: teachingComponent.body,
        children: guideComponents
          .filter((c) => c.parent_id === teachingComponent.id)
          .map((c) => ({ id: c.id, source_id: c.source_id, name: c.name, body: c.body })),
      }
    : null;

  const taggableLayer = focusRole ? WORD_TAGGABLE[focusRole] : undefined;
  const wordTypes: WordType[] = taggableLayer
    ? guideComponents
        .filter((c) => c.layer_id === taggableLayer)
        .map((c) => ({ id: c.id, source_id: c.source_id, name: c.name, body: c.body }))
    : [];

  // The rest of the layer this line teaches from. HOOK-02 explains the six
  // words; the master system, the checklist and the worked examples are its
  // neighbours, and standing on the Hook line should reach them too.
  const siblings = teachingComponent
    ? guideComponents
        .filter(
          (c) =>
            c.layer_id === teachingComponent.layer_id &&
            c.id !== teachingComponent.id &&
            !c.parent_id,
        )
        .map((c) => ({ id: c.id, source_id: c.source_id, name: c.name, body: c.body }))
    : [];

  const activeTags = focused ? tags.filter((t) => t.beat_id === focused.id) : [];

  const tagSelection = (componentId: string) => {
    if (!selection) return;
    const { beatId, start, end, text } = selection;
    const source = guideComponents.find((c) => c.id === componentId)?.source_id ?? null;

    const tag: BeatTag = {
      id: newId(),
      beat_id: beatId,
      component_id: componentId,
      source_id: source,
      span_start: start,
      span_end: end,
      span_text: text,
    };

    setTags((all) => [...all, tag]);
    setSelection(null);

    const orderedIds = beats.map((b) => b.id);
    enqueue(async () => {
      // The line has to exist before its words can be labelled.
      await persistPending(beats, orderedIds);
      await addBeatTag(videoId, beatId, componentId, start, end, text);
    });
  };

  const dropTag = (tagId: string) => {
    setTags((all) => all.filter((t) => t.id !== tagId));
    enqueue(() => removeBeatTag(videoId, tagId));
  };

  const words = totalWords(beats);
  const seconds = totalSec(beats);
  const written = beats.filter((b) => b.text.trim()).length;

  const componentNames = new Map(paletteComponents.map((c) => [c.id, c.name]));

  // The shape lib/story.ts reads. Built once here so the loop headers, the
  // diagnostics panel and the story panel are all describing the same script
  // rather than three slightly different derivations of it.
  const storyBeats: StoryBeat[] = beats.map((b) => ({
    id: b.id,
    text: b.text,
    t_start_sec: b.t_start_sec,
    story_role: b.story_role,
    dance_relation: b.dance_relation,
    story_loop: b.story_loop,
    story_section: b.story_section,
  }));

  const loops = loopSpans(storyBeats);
  const selectedLens = lenses.find((l) => l.is_selected)?.text ?? null;

  // Lines the last review had something to say about, marked in the margin so
  // a note names a place you can actually see. Derived from the review rather
  // than held separately — two copies of the same fact is how they drifted
  // apart and one of them got cleared without the other.
  const flaggedBeats = new Set((review?.notes ?? []).flatMap((n) => n.beatIds));

  return (
    <DndContext
      // A fixed id matters: without one dnd-kit numbers its own accessibility
      // description nodes from a counter that restarts on the client, so server
      // and client disagree and React reports a hydration mismatch every load.
      id="make-workspace"
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={onDragEnd}
    >
      {/* items-start matters: a flex child stretches to full height by default,
          and a full-height element has no room to stick. */}
      <div className="flex items-start gap-6">
        <div className="min-w-0 flex-1">
          <label className="block">
            <span className="mb-1 block text-[10px] tracking-wide text-ink-dim">PREMISE</span>
            <textarea
              value={premise}
              onChange={(e) => handlePremise(e.target.value)}
              rows={2}
              placeholder="What is this video actually claiming?"
              className="w-full resize-none rounded-lg border border-border-soft bg-surface px-3 py-2 text-sm text-ink-dim outline-none placeholder:text-ink-faint focus:border-accent-dim"
            />
          </label>

          <div className="mt-5">
            <div className="mb-2 flex items-center gap-2">
              <span className="text-[10px] tracking-wide text-ink-dim">SCRIPT</span>

              {/* The overlay, as a switch rather than a mode you live in.
                  Structure is something you notice about writing that already
                  exists; being able to turn it off is what keeps this a place
                  to write rather than a place to fill in. */}
              <button
                type="button"
                onClick={() => setOverlay((v) => !v)}
                title="Show roles, relationships and loops"
                className={`rounded border px-1.5 py-0.5 text-[10px] tracking-wide transition-colors ${
                  overlay
                    ? "border-accent-dim text-accent"
                    : "border-border-soft text-ink-faint hover:text-ink-dim"
                }`}
              >
                STORY
              </button>

              {overlay && (
                <button
                  type="button"
                  onClick={relayLoops}
                  title="Start a new loop at each hook and re-hook"
                  className="text-[10px] tracking-wide text-ink-faint transition-colors hover:text-accent"
                >
                  RENUMBER LOOPS
                </button>
              )}
            </div>

            <SortableContext
              items={beats.map((b) => b.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-0.5">
                {beats.map((beat, index) => (
                  <BeatRow
                    key={beat.id}
                    beat={beat}
                    index={index}
                    showSectionHeader={
                      beat.story_section != null &&
                      beat.story_section !== (beats[index - 1]?.story_section ?? null)
                    }
                    registerInput={(el) => {
                      if (el) inputs.current.set(beat.id, el);
                      else inputs.current.delete(beat.id);
                    }}
                    onChange={(text) => handleChange(index, text)}
                    onKeyDown={(e) => onKeyDown(e, index)}
                    onPasteText={(e) => {
                      const pasted = e.clipboardData.getData("text/plain");
                      if (pasteInto(index, e.currentTarget.selectionStart, pasted)) {
                        e.preventDefault();
                      }
                    }}
                    onCycleSection={() => cycleSection(index)}
                    onPark={() => park(index)}
                    onUnplant={(componentId) => unplant(beat.id, componentId)}
                    techniqueNames={beat.techniques.map(
                      (id) => componentNames.get(id) ?? "technique",
                    )}
                    overlay={overlay}
                    flagged={flaggedBeats.has(beat.id)}
                    draft={drafts.get(beat.id) ?? null}
                    showLoopHeader={
                      overlay &&
                      beat.story_loop != null &&
                      beat.story_loop !== (beats[index - 1]?.story_loop ?? null)
                    }
                    loopSec={
                      beat.story_loop != null
                        ? loops.find((l) => l.loop === beat.story_loop)?.sec ?? null
                        : null
                    }
                    onCycleLoop={() => cycleLoop(beat.id)}
                    onOpenMenu={(kind) => setMenuFor({ id: beat.id, kind })}
                    // Two menus rather than one, so each opens where it was
                    // clicked: the role badge sits at the end of the line, the
                    // relation sits in the gap above it.
                    roleMenu={
                      menuFor?.id === beat.id && menuFor.kind === "role" ? (
                        <ChipMenu
                          options={STORY_ROLES.map((role) => ({
                            value: role,
                            label: role.toUpperCase(),
                            hint: ROLE_HINT[role],
                          }))}
                          value={beat.story_role}
                          clearLabel="NO ROLE"
                          onPick={(v) => setRole(beat.id, isStoryRole(v) ? v : null)}
                          onClose={() => setMenuFor(null)}
                        />
                      ) : null
                    }
                    danceMenu={
                      menuFor?.id === beat.id && menuFor.kind === "dance" ? (
                        <ChipMenu
                          options={DANCE_RELATIONS.map((r) => ({
                            value: r,
                            label: DANCE_LABEL[r],
                          }))}
                          value={beat.dance_relation}
                          clearLabel="NOT SAID"
                          onPick={(v) => setDance(beat.id, isDanceRelation(v) ? v : null)}
                          onClose={() => setMenuFor(null)}
                          align="left"
                        />
                      ) : null
                    }
                    tags={tags.filter((t) => t.beat_id === beat.id)}
                    onFocusLine={() => setFocusedId(beat.id)}
                    onSelectRange={(start, end) =>
                      setSelection(
                        end > start
                          ? { beatId: beat.id, start, end, text: beat.text.slice(start, end) }
                          : null,
                      )
                    }
                    palette={
                      paletteFor === beat.id ? (
                        <Palette
                          components={paletteComponents}
                          onPick={(c) => plant(beat.id, c)}
                          onClose={() => {
                            setPaletteFor(null);
                            setFocusTarget({ id: beat.id, caret: "end" });
                          }}
                        />
                      ) : null
                    }
                  />
                ))}
              </div>
            </SortableContext>

            <ScriptEnd />
          </div>

          <Tray videoId={videoId} components={trayComponents} />

          {/* Last, and silent until three lines exist. Diagnosis comes after
              creation — never before it. */}
          {/* Measured facts only. The editor's calls live in the STORY panel
              beside the buttons that produced them, where their fixes can be
              one click from the line they replace. */}
          <Diagnostics
            beats={storyBeats}
            questions={questions}
            direction={direction}
            lensSelected={selectedLens}
            lensCount={lenses.length}
            targetSec={targetSec}
          />

          <div className="mt-6 flex items-center gap-3 border-t border-border-soft pt-2.5">
            <button
              type="button"
              onClick={() => void saveNow()}
              title="Write everything down now (ctrl+s). It also saves on its own as you type."
              className={`rounded-md border px-2 py-1 text-[11px] transition-colors ${
                saveError
                  ? "border-accent text-accent"
                  : dirty
                    ? "border-accent-dim text-accent"
                    : "border-border-soft text-ink-faint hover:border-border hover:text-ink-dim"
              }`}
            >
              {saveError ? "Retry save" : dirty ? "Save" : "Saved"}
            </button>

            {/* The reassurance, in words. Autosave that never says so is
                indistinguishable from no autosave once you have lost work. */}
            <p className="font-mono text-[10px] text-ink-faint">
              {saveError
                ? saveError
                : dirty
                  ? "unsaved changes"
                  : savedAt
                    ? `saved ${new Date(savedAt).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                        second: "2-digit",
                      })}`
                    : "saves as you type"}
            </p>

            <p className="ml-auto font-mono text-[11px] text-ink-faint">
              {approxSec(seconds)} · {words} words · {written}{" "}
              {written === 1 ? "beat" : "beats"}
            </p>
          </div>

          <p className="mt-1 text-right text-[10px] text-ink-faint/70">
            enter — new line · alt+↑↓ — move · alt+r — role · ctrl+s — save
          </p>
        </div>

        <Guide
          label={focusLabel}
          teaching={teaching}
          wordTypes={wordTypes}
          tags={activeTags.map((t) => ({
            id: t.id,
            componentId: t.component_id,
            text: t.span_text,
          }))}
          selection={selection?.text ?? null}
          onTag={tagSelection}
          onRemoveTag={dropTag}
          siblings={siblings}
          pile={pile}
          story={{
            videoId,
            direction,
            lenses,
            questions,
            beats: storyBeats.filter((b) => b.text?.trim()).map((b) => ({
              id: b.id,
              text: b.text ?? "",
            })),
            tensionSources,
            loops,
            aiEnabled,
            focusedBeatId: focusedId,
            review,
            onReview: setReview,
            onDrafts: (list) => setDrafts(new Map(list.map((d) => [d.beatId, d.text]))),
            onApplyLine: applyLine,
          }}
        />
      </div>
    </DndContext>
  );
}

/** Landing strip so a brick can be dropped at the end, not only onto a line. */
function ScriptEnd() {
  const { setNodeRef, isOver } = useDroppable({ id: "script-end" });

  return (
    <div
      ref={setNodeRef}
      className={`mt-1 h-8 rounded-md border border-dashed transition-colors ${
        isOver ? "border-accent-dim bg-accent-dim/5" : "border-transparent"
      }`}
    />
  );
}

/**
 * Cut the line into runs, each either plain or carrying a word type's colour.
 *
 * Overlaps are resolved by first-come: a span that starts inside one already
 * being drawn is skipped rather than nested, because two underlines on the same
 * word cannot both be read anyway.
 */
export function underlineSegments(
  text: string,
  tags: BeatTag[],
): { text: string; color?: string }[] {
  const ordered = [...tags]
    .filter((t) => t.span_start < text.length && t.span_end <= text.length)
    .sort((a, b) => a.span_start - b.span_start);

  const out: { text: string; color?: string }[] = [];
  let cursor = 0;

  for (const tag of ordered) {
    if (tag.span_start < cursor) continue;
    if (tag.span_start > cursor) out.push({ text: text.slice(cursor, tag.span_start) });
    out.push({ text: text.slice(tag.span_start, tag.span_end), color: colorFor(tag.source_id) });
    cursor = tag.span_end;
  }

  if (cursor < text.length) out.push({ text: text.slice(cursor) });
  return out;
}

const autoGrow = (el: HTMLTextAreaElement | null) => {
  if (!el) return;
  el.style.height = "0px";
  el.style.height = `${el.scrollHeight}px`;
};

function BeatRow({
  beat,
  index,
  showSectionHeader,
  registerInput,
  onChange,
  onKeyDown,
  onPasteText,
  onCycleSection,
  onPark,
  onUnplant,
  techniqueNames,
  overlay,
  flagged,
  draft,
  showLoopHeader,
  loopSec,
  onCycleLoop,
  onOpenMenu,
  roleMenu,
  danceMenu,
  palette,
  tags,
  onFocusLine,
  onSelectRange,
}: {
  beat: WorkspaceBeat;
  index: number;
  showSectionHeader: boolean;
  registerInput: (el: HTMLTextAreaElement | null) => void;
  onChange: (text: string) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  onPasteText: (e: React.ClipboardEvent<HTMLTextAreaElement>) => void;
  onCycleSection: () => void;
  onPark: () => void;
  onUnplant: (componentId: string) => void;
  techniqueNames: string[];
  overlay: boolean;
  flagged: boolean;
  /** A line the editor drafted for this empty row. Tab accepts it. */
  draft: string | null;
  showLoopHeader: boolean;
  loopSec: number | null;
  onCycleLoop: () => void;
  onOpenMenu: (kind: "role" | "dance") => void;
  roleMenu: React.ReactNode;
  danceMenu: React.ReactNode;
  palette: React.ReactNode;
  tags: BeatTag[];
  onFocusLine: () => void;
  onSelectRange: (start: number, end: number) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: beat.id,
    data: { type: "beat" },
  });

  // With the overlay off, structure controls sit at zero opacity until the row
  // is hovered — the same trick the section badge already used. Nothing is
  // hidden, it is just not shouting at someone mid-sentence.
  const quiet = (on: boolean) =>
    on || overlay
      ? "border-border text-ink-faint"
      : "border-transparent text-transparent group-hover:border-border-soft group-hover:text-ink-faint";

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={isDragging ? "relative z-10 opacity-80" : undefined}
    >
      {showSectionHeader && (
        <p className="mb-1 mt-3 border-t border-border-soft pt-2 text-[10px] tracking-wide text-ink-faint">
          {beat.story_section?.toUpperCase()}
        </p>
      )}

      {showLoopHeader && (
        <p className="mb-1 mt-2 flex items-baseline gap-2 text-[10px] tracking-wide text-accent/60">
          LOOP {beat.story_loop}
          {loopSec != null && (
            <span className="font-mono text-ink-faint">~{Math.round(loopSec)}s</span>
          )}
        </p>
      )}

      {/* The relation to the line above, drawn in the gap between the two —
          which is where it actually lives. Only ever on a line that HAS a line
          above it. */}
      {index > 0 && (
        <div className="relative flex h-4 items-center pl-6">
          <button
            type="button"
            onClick={() => onOpenMenu("dance")}
            title="How does this follow the line above?"
            className={`rounded px-1 text-[9px] lowercase tracking-wide transition-colors ${
              beat.dance_relation
                ? "text-accent/70 hover:text-accent"
                : overlay
                  ? "text-ink-faint/40 hover:text-ink-faint"
                  : "text-transparent group-hover:text-ink-faint/40"
            }`}
          >
            {beat.dance_relation ? DANCE_LABEL[beat.dance_relation as DanceRelation] : "↓"}
          </button>
          {danceMenu}
        </div>
      )}

      <div className="group relative flex items-start gap-2 rounded-md px-1 hover:bg-surface-2/60">
        {/* Anything the last read-back mentioned gets a mark in the margin. A
            note that names a line you cannot find is not localised enough to
            act on. */}
        {flagged && (
          <span
            aria-hidden
            title="Mentioned in the last read-back"
            className="absolute -left-2 top-[11px] h-1.5 w-1.5 rounded-full bg-accent/60"
          />
        )}

        {/* Drag lives on the handle, never on the text — otherwise selecting a
            word with the mouse would pick the whole line up instead. */}
        <button
          type="button"
          {...attributes}
          {...listeners}
          aria-label="Reorder line"
          className="mt-[7px] shrink-0 cursor-grab select-none px-0.5 font-mono text-[11px] text-border transition-colors hover:text-ink-dim group-hover:text-ink-faint active:cursor-grabbing"
        >
          ≡
        </button>

        <button
          type="button"
          onClick={onCycleLoop}
          title="Which loop is this line in?"
          className={`mt-[7px] shrink-0 font-mono text-[10px] transition-colors ${
            beat.story_loop != null
              ? "text-accent/50 hover:text-accent"
              : overlay
                ? "text-ink-faint/40 hover:text-ink-faint"
                : "text-transparent group-hover:text-ink-faint/40"
          }`}
        >
          {beat.story_loop ?? "·"}
        </button>

        {/* The underlines are painted by a mirror sitting exactly behind the
            textarea, since a textarea cannot style a range of its own text.
            Only when there is something to paint — an untagged line keeps the
            plain control, so the common case cannot drift out of alignment. */}
        {/* Typography lives on the wrapper, not on the two children.
            globals.css sets `input, textarea, select { font: inherit }`
            unlayered, and unlayered CSS beats Tailwind's @layer utilities — so
            text-sm never reached the textarea and the mirror drew at a
            different size. Inheriting from one parent keeps them identical by
            construction rather than by matching class lists. */}
        <div className="relative min-w-0 flex-1 text-sm leading-relaxed">
          {tags.length > 0 && (
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 whitespace-pre-wrap break-words py-1.5 text-ink"
            >
              {underlineSegments(beat.text, tags).map((seg, i) => (
                <span
                  key={i}
                  style={
                    seg.color
                      ? {
                          textDecoration: "underline",
                          textDecorationColor: seg.color,
                          textDecorationThickness: "2px",
                          textUnderlineOffset: "3px",
                        }
                      : undefined
                  }
                >
                  {seg.text}
                </span>
              ))}
            </div>
          )}

          <textarea
            ref={(el) => {
              registerInput(el);
              autoGrow(el);
            }}
            value={beat.text}
            onChange={(e) => {
              autoGrow(e.currentTarget);
              onChange(e.target.value);
            }}
            onKeyDown={onKeyDown}
            onPaste={onPasteText}
            onFocus={onFocusLine}
            onSelect={(e) =>
              onSelectRange(e.currentTarget.selectionStart, e.currentTarget.selectionEnd)
            }
            rows={1}
            // A drafted line shows as the placeholder — real ghost text in the
            // row it belongs to, rather than a suggestion in a panel you have
            // to retype. Tab takes it, Escape drops it.
            //
            // Otherwise the role is the prompt: a blank row marked STAKES
            // asking "stakes…" is a scaffold telling you what it wants, where a
            // blank row asking nothing is just a blank page.
            placeholder={
              draft
                ? draft
                : beat.story_role
                  ? `${beat.story_role}…`
                  : index === 0
                    ? "Write one thought…"
                    : ""
            }
            // Inline, because `color: inherit` in globals.css is unlayered and
            // would beat any utility class trying to hide this text.
            style={
              tags.length > 0
                ? { color: "transparent", caretColor: "var(--color-ink)" }
                : undefined
            }
            className={`relative w-full resize-none overflow-hidden bg-transparent py-1.5 outline-none ${
              draft ? "placeholder:text-accent/40" : "placeholder:text-ink-faint"
            }`}
          />

          {draft && (
            <span className="pointer-events-none absolute -bottom-3 left-0 font-mono text-[9px] text-accent/50">
              tab to keep · esc to drop
            </span>
          )}
        </div>

        {/* Techniques planted here. Several are normal now, and none of them
            touch what the line IS — that is the badge next door. */}
        {beat.techniques.length > 0 && (
          <span className="mt-[6px] flex shrink-0 flex-wrap justify-end gap-1">
            {beat.techniques.map((id, i) => (
              <button
                key={id}
                type="button"
                onClick={() => onUnplant(id)}
                title="Remove this technique from the line"
                className="rounded border border-border-soft px-1 py-px text-[9px] tracking-wide text-accent/70 transition-colors hover:border-accent-dim hover:text-accent hover:line-through"
              >
                {(techniqueNames[i] ?? "").toUpperCase()}
              </button>
            ))}
          </span>
        )}

        <button
          type="button"
          onClick={onPark}
          title="Set aside in the idea pile"
          aria-label="Set aside in the idea pile"
          className="mt-[6px] shrink-0 px-1 text-[11px] text-transparent transition-colors group-hover:text-ink-faint hover:!text-accent"
        >
          ⌫
        </button>

        {/* What the line is FOR. Survives everything planted on it. */}
        <button
          type="button"
          onClick={() => onOpenMenu("role")}
          title={
            beat.story_role
              ? ROLE_HINT[beat.story_role as StoryRole]
              : "What is this line for? (alt+r)"
          }
          className={`mt-[6px] shrink-0 rounded border px-1.5 py-0.5 text-[10px] tracking-wide transition-colors ${
            beat.story_role
              ? "border-accent-dim/50 text-accent/80 hover:text-accent"
              : quiet(false)
          }`}
        >
          {beat.story_role ? beat.story_role.toUpperCase() : "ROLE"}
        </button>

        <button
          type="button"
          onClick={onCycleSection}
          title="Start / middle / end"
          className={`mt-[6px] shrink-0 rounded border px-1.5 py-0.5 text-[10px] tracking-wide transition-colors ${
            beat.story_section ? "border-border text-ink-faint" : quiet(false)
          }`}
        >
          {beat.story_section ? beat.story_section.toUpperCase() : "SECTION"}
        </button>

        {roleMenu}
        {palette}
      </div>
    </div>
  );
}
