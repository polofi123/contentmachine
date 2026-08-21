"use client";

import { useState } from "react";
import type { LegoField, LegoOption } from "./lego-options";
import {
  updateLegos,
  setLoopType,
  cycleComponent,
  setPlacement,
  addHook,
  useBankHook,
  selectHook,
  deleteHook,
  toggleHookWord,
  createScript,
  addBeat,
  updateBeat,
  deleteBeat,
  updateEditSpec,
  logMetrics,
} from "./actions";

const input =
  "w-full rounded-md border border-border bg-surface-2 px-2.5 py-1.5 text-sm outline-none placeholder:text-ink-faint focus:border-accent-dim";
const btn =
  "rounded-md border border-accent-dim px-2.5 py-1 text-xs text-accent transition-colors hover:bg-accent-dim/15";
const ghost = "rounded-md px-2.5 py-1 text-xs text-ink-faint transition-colors hover:text-ink";

/* ------------------------------------------------------------------ legos */

const LEGOS = [
  ["lego_topic", "Topic", "What was the topic?"],
  ["lego_angle", "Angle", "What was the take / premise / angle?"],
  ["lego_hook", "Hook", "What was the hook and how was it executed?"],
  ["lego_story_structure", "Story structure", "How was the story structured?"],
  ["lego_visual_format", "Visual format", "What was the visual layout or format?"],
  ["lego_key_visuals", "Key visuals", "What were the key visuals?"],
  ["lego_audio", "Audio", "Any audio that worked especially well?"],
] as const;

export type LegoValues = {
  [K in (typeof LEGOS)[number][0]]: string | null;
};

// LegoField / LegoOption / LEGO_OPTION_LAYERS live in lego-options.ts, outside
// this "use client" boundary, so Server Components can actually read them.


export function LegosBody({
  videoId,
  video,
  notes,
  // MAKE puts the angle at the top of the page as the premise, so this form
  // omits it entirely rather than showing a second input for one column.
  // updateLegos treats a missing field as "leave it alone" — carrying a hidden
  // copy instead would go stale the moment the premise above was edited, and
  // saving this form would quietly revert it.
  hideAngle = false,
  options = {},
}: {
  videoId: string;
  video: LegoValues;
  notes: string | null;
  hideAngle?: boolean;
  options?: Partial<Record<LegoField, LegoOption[]>>;
}) {
  const filled = LEGOS.filter(([f]) => video[f]).length;
  const fields = LEGOS.filter(([f]) => !(hideAngle && f === "lego_angle"));

  // Controlled, so tapping an option can drop its name into the sentence.
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(LEGOS.map(([f]) => [f, video[f] ?? ""])),
  );

  const append = (field: string, name: string) =>
    setValues((v) => ({
      ...v,
      [field]: v[field]?.trim() ? `${v[field].replace(/,\s*$/, "")}, ${name}` : name,
    }));

  return (
    <form action={updateLegos} className="space-y-2.5">
      <input type="hidden" name="video_id" value={videoId} />
      <p className="text-xs text-ink-faint">
        Prose, in your words — this describes what a video <em>did</em>, and it works the same for
        someone else&apos;s video as for yours. Naming a technique from the framework is a different
        thing, and lives in the other cards.
      </p>

      {/* The pile comes first on purpose. Seven empty fields is a form; a box
          you can dump into is a place to think. Fill the fields whenever. */}
      <label className="block">
        <span className="mb-1 flex items-baseline gap-2">
          <span className="text-[11px] text-ink-dim">The pile</span>
          <span className="text-[10px] text-ink-faint">
            dump anything here — sort it into the seven below whenever you feel like it
          </span>
        </span>
        <textarea
          name="notes"
          defaultValue={notes ?? ""}
          rows={5}
          placeholder="Half-thoughts, references, links, a line you overheard…"
          className={`${input} text-[13px]`}
        />
      </label>

      <details open={filled > 0} className="rounded-lg border border-border-soft">
        <summary className="cursor-pointer px-2.5 py-2 text-[11px] text-ink-dim">
          The seven Legos{" "}
          <span className="text-ink-faint">
            — {filled} of 7 filled, all optional
          </span>
        </summary>
        <div className="space-y-2.5 border-t border-border-soft px-2.5 py-2.5">
          {fields.map(([field, label, hint]) => (
            <div key={field}>
              <label className="block">
                <span className="mb-1 block text-[11px] text-ink-dim">{label}</span>
                <textarea
                  name={field}
                  value={values[field]}
                  onChange={(e) => setValues((v) => ({ ...v, [field]: e.target.value }))}
                  rows={1}
                  placeholder={hint}
                  className={`${input} resize-none`}
                />
              </label>
              <LegoOptions
                groups={options[field] ?? []}
                onPick={(name) => append(field, name)}
              />
            </div>
          ))}
        </div>
      </details>

      <button type="submit" className={btn}>
        Save
      </button>
    </form>
  );
}

/**
 * The named options that go with a Lego, one group at a time.
 *
 * Closed by default and opened one group at a time, because Hook alone reaches
 * ~90 options across four layers — dumping all of them under a text box would
 * bury the box. Tapping a name appends it to the sentence rather than replacing
 * it, so the prose can stay a sentence.
 */
function LegoOptions({
  groups,
  onPick,
}: {
  groups: LegoOption[];
  onPick: (name: string) => void;
}) {
  const [open, setOpen] = useState<string | null>(null);
  if (groups.length === 0) return null;

  const names = Array.from(new Set(groups.map((g) => g.group)));

  return (
    <div className="mt-1">
      <div className="flex flex-wrap gap-1">
        {names.map((name) => {
          const count = groups.filter((g) => g.group === name).length;
          const isOpen = open === name;
          return (
            <button
              key={name}
              type="button"
              onClick={() => setOpen(isOpen ? null : name)}
              className={`rounded border px-1.5 py-0.5 text-[10px] transition-colors ${
                isOpen
                  ? "border-accent-dim text-accent"
                  : "border-border-soft text-ink-faint hover:text-ink-dim"
              }`}
            >
              {name} <span className="font-mono opacity-60">{count}</span>
            </button>
          );
        })}
      </div>

      {open && (
        <div className="mt-1 flex max-h-40 flex-wrap gap-1 overflow-y-auto rounded-lg border border-border-soft bg-surface-2 p-1.5">
          {groups
            .filter((g) => g.group === open)
            .map((g) => (
              <button
                key={g.id}
                type="button"
                onClick={() => onPick(g.name)}
                className="rounded border border-border-soft px-1.5 py-0.5 text-[10px] text-ink-dim transition-colors hover:border-accent-dim hover:text-accent"
              >
                {g.name}
              </button>
            ))}
        </div>
      )}
    </div>
  );
}

/* --------------------------------------------------------------- loop type */

export function LoopBody({
  videoId,
  current,
  detail,
}: {
  videoId: string;
  current: string | null;
  detail: string | null;
}) {
  const opts = [
    ["desire", "Desire loop", "Educational — trigger a pain point blocking something they want."],
    ["interest", "Interest loop", "Entertainment — trigger curiosity around an open question."],
  ] as const;

  return (
    <div className="space-y-2">
      <p className="text-xs text-ink-faint">
        A real fork: decide this before writing the hook, because the two are built differently.
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        {opts.map(([value, label, desc]) => (
          <form key={value} action={setLoopType}>
            <input type="hidden" name="video_id" value={videoId} />
            <input type="hidden" name="loop_type" value={current === value ? "" : value} />
            <button
              type="submit"
              className={`w-full rounded-lg border px-3 py-2.5 text-left transition-colors ${
                current === value
                  ? "border-accent-dim bg-accent-dim/10"
                  : "border-border hover:border-ink-faint"
              }`}
            >
              <span
                className={`block text-sm ${current === value ? "text-accent" : "text-ink-dim"}`}
              >
                {label}
              </span>
              <span className="mt-0.5 block text-[11px] text-ink-faint">{desc}</span>
            </button>
          </form>
        ))}
      </div>
      {detail && <p className="prose-body pt-1 text-[11px] text-ink-faint">{detail}</p>}
    </div>
  );
}

/* -------------------------------------------------------------- components */

export type PickerComponent = {
  id: string;
  source_id: string | null;
  name: string;
  body: string | null;
  is_placeholder: boolean;
  state: "none" | "used" | "skipped";
  placement_sec: number | null;
  placement_note: string | null;
};

const STATE_STYLE = {
  used: "border-accent-dim bg-accent-dim/10 text-accent",
  skipped: "border-border bg-transparent text-ink-faint line-through",
  none: "border-border-soft text-ink-dim hover:border-border",
} as const;

// One control, three states, no modal. Tap once to plant it, twice to record
// that you deliberately left it out, a third time to clear it entirely.
export function ComponentsBody({
  videoId,
  slotKey,
  components,
  showPlacement = false,
}: {
  videoId: string;
  slotKey: string;
  components: PickerComponent[];
  showPlacement?: boolean;
}) {
  const [placementFor, setPlacementFor] = useState<string | null>(null);
  const [infoFor, setInfoFor] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-xs text-ink-faint">
          Tap to mark <span className="text-accent">used</span> · again for{" "}
          <span className="line-through">skipped</span> · again to clear.
        </p>
        {/* Reading every definition at once is the fastest way to remember what
            you actually have available, rather than picking the three you can
            recall from memory. */}
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          className="shrink-0 text-[11px] text-ink-faint transition-colors hover:text-accent"
        >
          {showAll ? "hide explanations" : "explain all"}
        </button>
      </div>

      <div className="space-y-1.5">
        {components.map((c) => {
          const open = showAll || infoFor === c.id;
          return (
            <div key={c.id}>
              <div className="flex items-stretch gap-1.5">
                <form action={cycleComponent} className="min-w-0 flex-1">
                  <input type="hidden" name="video_id" value={videoId} />
                  <input type="hidden" name="component_id" value={c.id} />
                  <input type="hidden" name="slot_key" value={slotKey} />
                  <input type="hidden" name="current" value={c.state} />
                  <button
                    type="submit"
                    className={`flex w-full items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-sm transition-colors ${STATE_STYLE[c.state]}`}
                  >
                    {c.source_id && (
                      <span className="shrink-0 font-mono text-[10px] opacity-60">
                        {c.source_id}
                      </span>
                    )}
                    <span className={`min-w-0 flex-1 truncate ${c.is_placeholder ? "italic" : ""}`}>
                      {c.name}
                    </span>
                    {c.state === "used" && c.placement_sec != null && (
                      <span className="shrink-0 font-mono text-[10px]">@{c.placement_sec}s</span>
                    )}
                  </button>
                </form>

                {showPlacement && c.state === "used" && (
                  <button
                    type="button"
                    onClick={() => setPlacementFor(placementFor === c.id ? null : c.id)}
                    className="shrink-0 rounded-lg border border-border-soft px-2 text-[10px] text-ink-faint hover:text-accent"
                  >
                    where?
                  </button>
                )}

                {c.body && (
                  <button
                    type="button"
                    onClick={() => setInfoFor(infoFor === c.id ? null : c.id)}
                    aria-label={`What is ${c.name}?`}
                    className={`shrink-0 rounded-lg border border-border-soft px-2 font-mono text-[11px] transition-colors ${
                      open ? "text-accent" : "text-ink-faint hover:text-accent"
                    }`}
                  >
                    ?
                  </button>
                )}
              </div>

              {open && c.body && (
                <p className="prose-body mt-1 rounded-lg border border-border-soft bg-surface-2 px-2.5 py-2 text-[12px] text-ink-dim">
                  {c.body}
                </p>
              )}

              {showPlacement && placementFor === c.id && (
                <form
                  action={setPlacement}
                  className="mt-1.5 flex gap-1.5 rounded-lg border border-border bg-surface-2 p-2"
                >
                  <input type="hidden" name="video_id" value={videoId} />
                  <input type="hidden" name="component_id" value={c.id} />
                  <input
                    name="placement_sec"
                    type="number"
                    min="0"
                    defaultValue={c.placement_sec ?? ""}
                    placeholder="sec"
                    className="w-20 rounded-md border border-border bg-surface px-2 py-1 text-xs outline-none focus:border-accent-dim"
                  />
                  <input
                    name="placement_note"
                    defaultValue={c.placement_note ?? ""}
                    placeholder="how it lands there"
                    className="min-w-0 flex-1 rounded-md border border-border bg-surface px-2 py-1 text-xs outline-none focus:border-accent-dim"
                  />
                  <button type="submit" className={btn}>
                    Set
                  </button>
                </form>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------- hooks */

export type HookRow = {
  id: string;
  text: string;
  is_selected: boolean;
  tags: string[];
};

export function HookBody({
  videoId,
  hooks,
  wordTypes,
  bank,
}: {
  videoId: string;
  hooks: HookRow[];
  wordTypes: { id: string; source_id: string | null; name: string }[];
  bank: { id: string; text: string }[];
}) {
  const [showBank, setShowBank] = useState(false);

  return (
    <div className="space-y-3">
      {hooks.map((h) => (
        <div
          key={h.id}
          className={`rounded-lg border p-2.5 ${
            h.is_selected ? "border-accent-dim bg-accent-dim/5" : "border-border-soft"
          }`}
        >
          <p className="text-sm text-ink">{h.text}</p>

          <div className="mt-2 flex flex-wrap gap-1">
            {wordTypes.map((w) => {
              const tagged = h.tags.includes(w.id);
              return (
                <form key={w.id} action={toggleHookWord}>
                  <input type="hidden" name="video_id" value={videoId} />
                  <input type="hidden" name="hook_id" value={h.id} />
                  <input type="hidden" name="component_id" value={w.id} />
                  <input type="hidden" name="tagged" value={String(tagged)} />
                  <button
                    type="submit"
                    className={`rounded border px-1.5 py-0.5 text-[10px] transition-colors ${
                      tagged
                        ? "border-accent-dim bg-accent-dim/15 text-accent"
                        : "border-border text-ink-faint hover:text-ink-dim"
                    }`}
                  >
                    {w.name}
                  </button>
                </form>
              );
            })}
          </div>

          <div className="mt-2 flex items-center gap-3">
            {!h.is_selected && (
              <form action={selectHook}>
                <input type="hidden" name="video_id" value={videoId} />
                <input type="hidden" name="hook_id" value={h.id} />
                <button type="submit" className="text-[11px] text-ink-faint hover:text-accent">
                  use this one
                </button>
              </form>
            )}
            {h.is_selected && <span className="text-[11px] text-accent">selected</span>}
            <form action={deleteHook} className="ml-auto">
              <input type="hidden" name="video_id" value={videoId} />
              <input type="hidden" name="hook_id" value={h.id} />
              <button type="submit" className="text-[11px] text-ink-faint hover:text-accent">
                remove
              </button>
            </form>
          </div>
        </div>
      ))}

      <form action={addHook} className="flex gap-2">
        <input type="hidden" name="video_id" value={videoId} />
        <input name="text" required placeholder="Write a hook…" className={input} />
        <button type="submit" className={btn}>
          Add
        </button>
      </form>

      <div>
        <button type="button" onClick={() => setShowBank((v) => !v)} className={ghost}>
          {showBank ? "hide" : "pull from"} the bank ({bank.length})
        </button>
        {showBank && (
          <div className="mt-2 space-y-1">
            {bank.map((b) => (
              <form key={b.id} action={useBankHook}>
                <input type="hidden" name="video_id" value={videoId} />
                <input type="hidden" name="text" value={b.text} />
                <button
                  type="submit"
                  className="w-full rounded-md border border-border-soft px-2.5 py-1.5 text-left text-xs text-ink-dim transition-colors hover:border-border hover:text-ink"
                >
                  {b.text}
                </button>
              </form>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------- scripts */

export type BeatRow = {
  id: string;
  sort_order: number;
  t_start_sec: number | null;
  t_end_sec: number | null;
  function_label: string | null;
  text: string | null;
};

export type ScriptRow = {
  id: string;
  name: string;
  format: string | null;
  duration_target_sec: number | null;
  edit_spec: string | null;
  beats: BeatRow[];
};

export function ScriptBody({ videoId, scripts }: { videoId: string; scripts: ScriptRow[] }) {
  const [editingBeat, setEditingBeat] = useState<string | null>(null);
  const [newScript, setNewScript] = useState(false);

  return (
    <div className="space-y-4">
      {scripts.map((s) => (
        <div key={s.id} className="rounded-lg border border-border-soft p-3">
          <div className="mb-2 flex items-baseline gap-2">
            <h4 className="text-sm text-ink">{s.name}</h4>
            {s.format && <span className="font-mono text-[10px] text-ink-faint">{s.format}</span>}
            {s.duration_target_sec && (
              <span className="font-mono text-[10px] text-ink-faint">
                {s.duration_target_sec}s
              </span>
            )}
            <span className="ml-auto text-[10px] text-ink-faint">{s.beats.length} beats</span>
          </div>

          <div className="space-y-1.5">
            {s.beats.map((b) =>
              editingBeat === b.id ? (
                <form
                  key={b.id}
                  action={updateBeat}
                  onSubmit={() => setEditingBeat(null)}
                  className="space-y-1.5 rounded-md border border-border bg-surface-2 p-2"
                >
                  <input type="hidden" name="video_id" value={videoId} />
                  <input type="hidden" name="beat_id" value={b.id} />
                  <div className="flex gap-1.5">
                    <input
                      name="t_start_sec"
                      type="number"
                      min="0"
                      defaultValue={b.t_start_sec ?? ""}
                      placeholder="from"
                      className="w-16 rounded border border-border bg-surface px-1.5 py-1 text-xs outline-none"
                    />
                    <input
                      name="t_end_sec"
                      type="number"
                      min="0"
                      defaultValue={b.t_end_sec ?? ""}
                      placeholder="to"
                      className="w-16 rounded border border-border bg-surface px-1.5 py-1 text-xs outline-none"
                    />
                    <input
                      name="function_label"
                      defaultValue={b.function_label ?? ""}
                      placeholder="Re-hook"
                      className="min-w-0 flex-1 rounded border border-border bg-surface px-1.5 py-1 text-xs outline-none"
                    />
                  </div>
                  <textarea
                    name="text"
                    defaultValue={b.text ?? ""}
                    rows={3}
                    className="w-full rounded border border-border bg-surface px-1.5 py-1 text-xs outline-none"
                  />
                  <div className="flex gap-2">
                    <button type="submit" className={btn}>
                      Save
                    </button>
                    <button type="button" onClick={() => setEditingBeat(null)} className={ghost}>
                      Cancel
                    </button>
                  </div>
                </form>
              ) : (
                <div
                  key={b.id}
                  className="group flex items-start gap-2 rounded-md px-1 py-1 hover:bg-surface-2"
                >
                  <span className="mt-[3px] w-14 shrink-0 font-mono text-[10px] text-ink-faint">
                    {b.t_start_sec != null ? `${b.t_start_sec}–${b.t_end_sec ?? ""}s` : "—"}
                  </span>
                  <span className="min-w-0 flex-1">
                    {b.function_label && (
                      <span className="block text-[11px] text-accent/70">{b.function_label}</span>
                    )}
                    <span className="block text-xs text-ink-dim">{b.text}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setEditingBeat(b.id)}
                    className="shrink-0 text-[10px] text-transparent group-hover:text-ink-faint hover:!text-accent"
                  >
                    edit
                  </button>
                  <form action={deleteBeat} className="shrink-0">
                    <input type="hidden" name="video_id" value={videoId} />
                    <input type="hidden" name="beat_id" value={b.id} />
                    <button
                      type="submit"
                      className="text-[10px] text-transparent group-hover:text-ink-faint hover:!text-accent"
                    >
                      ×
                    </button>
                  </form>
                </div>
              ),
            )}
          </div>

          <form action={addBeat} className="mt-2 flex gap-1.5">
            <input type="hidden" name="video_id" value={videoId} />
            <input type="hidden" name="script_id" value={s.id} />
            <input
              name="t_start_sec"
              type="number"
              min="0"
              placeholder="from"
              className="w-16 rounded border border-border bg-surface-2 px-1.5 py-1 text-xs outline-none"
            />
            <input
              name="function_label"
              placeholder="Beat function"
              className="w-32 rounded border border-border bg-surface-2 px-1.5 py-1 text-xs outline-none"
            />
            <input
              name="text"
              placeholder="Line"
              className="min-w-0 flex-1 rounded border border-border bg-surface-2 px-1.5 py-1 text-xs outline-none"
            />
            <button type="submit" className={btn}>
              +
            </button>
          </form>

          <details className="mt-2">
            <summary className="cursor-pointer text-[11px] text-ink-faint hover:text-ink-dim">
              edit spec
            </summary>
            <form action={updateEditSpec} className="mt-1.5 space-y-1.5">
              <input type="hidden" name="video_id" value={videoId} />
              <input type="hidden" name="script_id" value={s.id} />
              <textarea
                name="edit_spec"
                defaultValue={s.edit_spec ?? ""}
                rows={4}
                placeholder="Lighting, overlays, b-roll, SFX…"
                className={`${input} text-xs`}
              />
              <button type="submit" className={btn}>
                Save spec
              </button>
            </form>
          </details>
        </div>
      ))}

      {newScript ? (
        <form
          action={createScript}
          onSubmit={() => setNewScript(false)}
          className="flex flex-wrap gap-1.5 rounded-lg border border-border bg-surface-2 p-2"
        >
          <input type="hidden" name="video_id" value={videoId} />
          <input name="name" required autoFocus placeholder="30s cut" className="w-32 rounded border border-border bg-surface px-2 py-1 text-xs outline-none" />
          <select name="format" className="rounded border border-border bg-surface px-2 py-1 text-xs outline-none">
            <option value="">format…</option>
            <option value="short">short</option>
            <option value="long">long</option>
          </select>
          <input
            name="duration_target_sec"
            type="number"
            min="1"
            placeholder="seconds"
            className="w-24 rounded border border-border bg-surface px-2 py-1 text-xs outline-none"
          />
          <button type="submit" className={btn}>
            Create
          </button>
        </form>
      ) : (
        <button type="button" onClick={() => setNewScript(true)} className={ghost}>
          + another cut
        </button>
      )}
    </div>
  );
}

/* ----------------------------------------------------------------- metrics */

export function MetricsBody({
  videoId,
  history,
}: {
  videoId: string;
  history: { measured_at: string; views: number | null; retention_pct: number | null }[];
}) {
  return (
    <div className="space-y-3">
      <p className="text-xs text-ink-faint">
        Each save is a new snapshot, not an overwrite — so week one stays readable next to month
        three.
      </p>

      {history.length > 0 && (
        <ul className="space-y-1">
          {history.map((m) => (
            <li key={m.measured_at} className="flex gap-3 text-xs">
              <span className="w-24 font-mono text-ink-faint">
                {new Date(m.measured_at).toLocaleDateString()}
              </span>
              <span className="text-ink-dim">
                {m.views != null ? Number(m.views).toLocaleString() : "—"} views
              </span>
              {m.retention_pct != null && (
                <span className="text-ink-faint">{m.retention_pct}% retention</span>
              )}
            </li>
          ))}
        </ul>
      )}

      <form action={logMetrics} className="flex flex-wrap gap-1.5">
        <input type="hidden" name="video_id" value={videoId} />
        <input name="views" type="number" min="0" placeholder="views" className="w-24 rounded border border-border bg-surface-2 px-2 py-1 text-xs outline-none" />
        <input name="likes" type="number" min="0" placeholder="likes" className="w-20 rounded border border-border bg-surface-2 px-2 py-1 text-xs outline-none" />
        <input name="comments" type="number" min="0" placeholder="comments" className="w-24 rounded border border-border bg-surface-2 px-2 py-1 text-xs outline-none" />
        <input
          name="retention_pct"
          type="number"
          min="0"
          max="100"
          step="0.1"
          placeholder="ret %"
          className="w-20 rounded border border-border bg-surface-2 px-2 py-1 text-xs outline-none"
        />
        <button type="submit" className={btn}>
          Snapshot
        </button>
      </form>
    </div>
  );
}
