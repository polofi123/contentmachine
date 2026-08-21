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
import { Pile, type PileItem } from "./pile";
import { Palette, type PaletteComponent } from "./palette";
import { Tray, type TrayComponent } from "./tray";
import { Diagnostics } from "./diagnostics";
import {
  beatFromText,
  createBeat,
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
} from "./actions";

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
}: {
  videoId: string;
  scriptId: string | null;
  initialBeats: WorkspaceBeat[];
  initialPremise: string;
  initialPile: PileItem[];
  paletteComponents: PaletteComponent[];
  trayComponents: TrayComponent[];
  targetSec: number | null;
}) {
  const [beats, setBeats] = useState<WorkspaceBeat[]>(
    initialBeats.length > 0 ? initialBeats : [emptyBeat()],
  );
  const [pile, setPile] = useState<PileItem[]>(initialPile);
  const [premise, setPremise] = useState(initialPremise);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [focusTarget, setFocusTarget] = useState<{ id: string; caret: "start" | "end" } | null>(
    null,
  );
  /** Which line the slash palette is open on, if any. */
  const [paletteFor, setPaletteFor] = useState<string | null>(null);

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

  const persist = useCallback(
    async (beat: WorkspaceBeat, orderedIds: string[]) => {
      if (persisted.current.has(beat.id)) return;
      persisted.current.add(beat.id);
      const scriptId = await getScriptId();
      await createBeat(
        videoId,
        scriptId,
        { id: beat.id, text: beat.text, story_section: beat.story_section },
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
    const pos = focusTarget.caret === "start" ? 0 : el.value.length;
    el.setSelectionRange(pos, pos);
    setFocusTarget(null);
  }, [focusTarget, beats]);

  useEffect(() => {
    const timers = saveTimers.current;
    return () => timers.forEach((t) => clearTimeout(t));
  }, []);

  const scheduleSave = (beat: WorkspaceBeat, text: string, orderedIds: string[]) => {
    const existing = saveTimers.current.get(beat.id);
    if (existing) clearTimeout(existing);

    saveTimers.current.set(
      beat.id,
      setTimeout(() => {
        saveTimers.current.delete(beat.id);
        enqueue(async () => {
          await persist({ ...beat, text }, orderedIds);
          await saveBeatText(beat.id, text);
        });
      }, SAVE_DEBOUNCE_MS),
    );
  };

  const handleChange = (index: number, text: string) => {
    const next = beats.map((b, i) => (i === index ? { ...b, text } : b));
    setBeats(next);
    scheduleSave(
      next[index],
      text,
      next.map((b) => b.id),
    );
  };

  const insertAfter = (index: number) => {
    const beat = emptyBeat();
    // A new line continues the section it was written inside — the writer is
    // still in the middle, so asking again would be noise.
    beat.story_section = beats[index]?.story_section ?? null;

    const next = [...beats.slice(0, index + 1), beat, ...beats.slice(index + 1)];
    setBeats(next);
    setFocusTarget({ id: beat.id, caret: "end" });

    const orderedIds = next.map((b) => b.id);
    enqueue(async () => {
      await persist(beats[index], orderedIds);
      await persist(beat, orderedIds);
    });
  };

  const deleteAt = (index: number) => {
    if (beats.length === 1) return;
    const doomed = beats[index];
    const next = beats.filter((_, i) => i !== index);
    setBeats(next);

    const prev = next[Math.max(0, index - 1)];
    if (prev) setFocusTarget({ id: prev.id, caret: "end" });

    const timer = saveTimers.current.get(doomed.id);
    if (timer) clearTimeout(timer);
    saveTimers.current.delete(doomed.id);

    if (!persisted.current.has(doomed.id)) return;
    persisted.current.delete(doomed.id);

    const orderedIds = next.map((b) => b.id);
    enqueue(async () => {
      const scriptId = await getScriptId();
      await removeBeat(videoId, scriptId, doomed.id, orderedIds);
    });
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

  const cycleSection = (index: number) => {
    const beat = beats[index];
    const current = (beat.story_section ?? null) as StorySection | null;
    const next = SECTION_CYCLE[(SECTION_CYCLE.indexOf(current) + 1) % SECTION_CYCLE.length];

    const updated = beats.map((b, i) => (i === index ? { ...b, story_section: next } : b));
    setBeats(updated);

    const orderedIds = updated.map((b) => b.id);
    enqueue(async () => {
      await persist({ ...beat, story_section: next }, orderedIds);
      await setBeatSection(videoId, beat.id, next);
    });
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
      await persist(beat, orderedIds);
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
      insertAfter(index);
      return;
    }

    if (e.key === "Backspace" && el.selectionStart === 0 && el.selectionEnd === 0) {
      if (el.value === "") {
        e.preventDefault();
        deleteAt(index);
      }
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
                    onCycleSection={() => cycleSection(index)}
                    onPark={() => park(index)}
                    onUnplant={() => unplant(beat.id)}
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

        <Pile items={pile} />
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
  onCycleSection,
  onPark,
  onUnplant,
  palette,
}: {
  beat: WorkspaceBeat;
  index: number;
  showSectionHeader: boolean;
  registerInput: (el: HTMLTextAreaElement | null) => void;
  onChange: (text: string) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  onCycleSection: () => void;
  onPark: () => void;
  onUnplant: () => void;
  palette: React.ReactNode;
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
          rows={1}
          placeholder={index === 0 ? "Write one thought…" : ""}
          className="min-w-0 flex-1 resize-none overflow-hidden bg-transparent py-1.5 text-sm leading-relaxed text-ink outline-none placeholder:text-ink-faint"
        />

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
