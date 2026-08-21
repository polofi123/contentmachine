"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
import type { PileItem } from "./pile";
import { Guide, colorFor, type Teaching, type WordType } from "./guide";
import { LABEL_TEACHES, WORD_TAGGABLE } from "../lego-options";
import { Palette, type PaletteComponent } from "./palette";
import { Tray, type TrayComponent } from "./tray";
import { Diagnostics } from "./diagnostics";
import {
  beatFromText,
  createBeats,
  ensureScript,
  parkBeat,
  plantComponent,
  removeBeat,
  reorderBeats,
  saveBeatText,
  savePremise,
  setBeatSection,
  unparkBeat,
  unplantComponent,
  addBeatTag,
  removeBeatTag,
  healBeatTags,
} from "./actions";

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
  function_label: string | null;
  function_component_id: string | null;
};

const SAVE_DEBOUNCE_MS = 600;

// Cycles the way every other control in this app cycles: tap forward, tap past
// the end to clear. Unassigned is a real, permanent option, not a gap.
const SECTION_CYCLE: (StorySection | null)[] = ["start", "middle", "end", null];

const newId = () => crypto.randomUUID();

const emptyBeat = (): WorkspaceBeat => ({
  id: newId(),
  text: "",
  story_section: null,
  t_start_sec: null,
  function_label: null,
  function_component_id: null,
});

/**
 * What a new script already knows.
 *
 * A blank page is not neutral — it quietly asks you to remember the whole
 * framework before you can write a word. Parts of the theory apply to every
 * short, so they are here from the start: SCR-03's opening, the Core Loop
 * through the middle, a payoff and a CTA at the end.
 *
 * It is a scaffold, not a contract. Lines are deletable, reorderable and
 * relabelable, and nothing is written to the database until the first character
 * is typed — open a video and change your mind and no draft is left behind.
 */
const SKELETON: { label: string; section: StorySection }[] = [
  { label: "Hook", section: "start" },
  { label: "Foreshadow", section: "start" },
  { label: "Transition", section: "start" },
  { label: "Stakes", section: "middle" },
  { label: "Big question", section: "middle" },
  { label: "Head fake", section: "middle" },
  { label: "Rehook", section: "middle" },
  { label: "Payoff", section: "end" },
  { label: "CTA", section: "end" },
];

export const skeletonBeats = (): WorkspaceBeat[] =>
  SKELETON.map((s) => ({
    ...emptyBeat(),
    story_section: s.section,
    function_label: s.label,
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
  const enqueue = useCallback((fn: () => Promise<unknown>) => {
    const run = async () => {
      try {
        await fn();
        setSaveError(null);
      } catch (err) {
        setSaveError(err instanceof Error ? err.message : "Could not save");
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
          function_label: b.function_label,
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
    // A new line continues the section it was written inside — the writer is
    // still in the middle, so asking again would be noise.
    beat.story_section = current.story_section;

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

  /** One gesture: this line now says what it does, and the video records it. */
  const plant = (beatId: string, component: PaletteComponent) => {
    const beat = beats.find((b) => b.id === beatId);
    if (!beat) return;

    setBeats((all) =>
      all.map((b) =>
        b.id === beatId
          ? { ...b, function_label: component.name, function_component_id: component.id }
          : b,
      ),
    );
    setPaletteFor(null);
    setFocusTarget({ id: beatId, caret: "end" });

    const orderedIds = beats.map((b) => b.id);
    enqueue(async () => {
      // A line that was never saved cannot carry a technique yet.
      await persistPending(beats, orderedIds);
      await plantComponent(videoId, beatId, component.id, component.name);
    });
  };

  const unplant = (beatId: string) => {
    const beat = beats.find((b) => b.id === beatId);
    if (!beat?.function_component_id) return;
    const componentId = beat.function_component_id;

    setBeats((all) =>
      all.map((b) =>
        b.id === beatId ? { ...b, function_label: null, function_component_id: null } : b,
      ),
    );

    enqueue(() => unplantComponent(videoId, beatId, componentId));
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>, index: number) => {
    const el = e.currentTarget;

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
  const focusLabel = focused?.function_label ?? null;
  const labelKey = focusLabel?.trim().toLowerCase() ?? "";

  const byId = new Map(guideComponents.map((c) => [c.id, c]));
  const bySource = new Map(
    guideComponents.filter((c) => c.source_id).map((c) => [c.source_id as string, c]),
  );

  // A component linked through the slash palette wins; the scaffold's own
  // free-text labels fall back to the table.
  const teachingComponent =
    (focused?.function_component_id ? byId.get(focused.function_component_id) : null) ??
    (labelKey ? bySource.get(LABEL_TEACHES[labelKey] ?? "") : null) ??
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

  const taggableLayer = labelKey ? WORD_TAGGABLE[labelKey] : undefined;
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
      <div className="flex gap-6">
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
            <span className="mb-2 block text-[10px] tracking-wide text-ink-dim">SCRIPT</span>

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
                    onUnplant={() => unplant(beat.id)}
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
          <Diagnostics beats={beats} targetSec={targetSec} />

          <div className="mt-6 flex items-center gap-3 border-t border-border-soft pt-2.5">
            <p className="font-mono text-[11px] text-ink-faint">
              {approxSec(seconds)} · {words} words · {written} {written === 1 ? "beat" : "beats"}
            </p>
            {saveError && <p className="text-[11px] text-accent">{saveError}</p>}
            <p className="ml-auto text-[10px] text-ink-faint">enter — new line · alt+↑↓ — move</p>
          </div>
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
  onUnplant: () => void;
  palette: React.ReactNode;
  tags: BeatTag[];
  onFocusLine: () => void;
  onSelectRange: (start: number, end: number) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: beat.id,
    data: { type: "beat" },
  });

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

      <div className="group relative flex items-start gap-2 rounded-md px-1 hover:bg-surface-2/60">
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
            placeholder={
              beat.function_label
                ? `${beat.function_label}…`
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
            className="relative w-full resize-none overflow-hidden bg-transparent py-1.5 outline-none placeholder:text-ink-faint"
          />
        </div>

        {beat.function_label && (
          <button
            type="button"
            onClick={onUnplant}
            title="Remove this technique from the line"
            className="mt-[7px] shrink-0 text-[10px] tracking-wide text-accent/70 transition-colors hover:text-accent hover:line-through"
          >
            {beat.function_label.toUpperCase()}
          </button>
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

        <button
          type="button"
          onClick={onCycleSection}
          title="Start / middle / end"
          className={`mt-[6px] shrink-0 rounded border px-1.5 py-0.5 text-[10px] tracking-wide transition-colors ${
            beat.story_section
              ? "border-border text-ink-faint"
              : "border-transparent text-transparent group-hover:border-border-soft group-hover:text-ink-faint"
          }`}
        >
          {beat.story_section ? beat.story_section.toUpperCase() : "SECTION"}
        </button>

        {palette}
      </div>
    </div>
  );
}
