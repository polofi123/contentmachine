"use client";

import { useState } from "react";
import Link from "next/link";
import {
  setGoal,
  setPillarTarget,
  schedule,
  setPillar,
  quickAdd,
  scheduleIdea,
  markPublished,
} from "./actions";

const btn =
  "rounded-md border border-accent-dim px-2.5 py-1 text-xs text-accent transition-colors hover:bg-accent-dim/15";
const field =
  "rounded-md border border-border bg-surface-2 px-2 py-1 text-xs outline-none placeholder:text-ink-faint focus:border-accent-dim";

const pad = (n: number) => String(n).padStart(2, "0");
const iso = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;

// Pillars get a stable colour derived from the label itself, so "guitar" is the
// same hue every month without anyone maintaining a colour table.
function hue(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
  return h;
}
const pillarStyle = (p: string | null) =>
  p
    ? { borderColor: `hsl(${hue(p)} 45% 45%)`, color: `hsl(${hue(p)} 60% 72%)` }
    : { borderColor: "var(--color-border)", color: "var(--color-ink-faint)" };

/* ---------------------------------------------------------------- goal bar */

export function GoalBar({
  month,
  target,
  planned,
  published,
  expectedByNow,
  daysInMonth,
  showPace,
}: {
  month: string;
  target: number;
  planned: number;
  published: number;
  expectedByNow: number;
  daysInMonth: number;
  showPace: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const pct = target > 0 ? Math.min(100, (planned / target) * 100) : 0;
  const pubPct = target > 0 ? Math.min(100, (published / target) * 100) : 0;

  return (
    <section className="mb-5 rounded-xl border border-border-soft bg-surface p-4">
      <div className="mb-2 flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <span className="text-sm text-ink">
          <span className="text-accent">{planned}</span> slotted
          <span className="text-ink-faint"> of {target}</span>
        </span>
        <span className="text-xs text-ink-faint">{published} published</span>
        {showPace && (
          <span className="text-xs text-ink-faint">
            pace: {published} vs {expectedByNow} expected by today
          </span>
        )}
        {editing ? (
          <form
            action={setGoal}
            onSubmit={() => setEditing(false)}
            className="ml-auto flex items-center gap-1.5"
          >
            <input type="hidden" name="month" value={month} />
            <input
              name="target_posts"
              type="number"
              min="0"
              max="62"
              defaultValue={target}
              autoFocus
              className={`${field} w-16`}
            />
            <button type="submit" className={btn}>
              Set
            </button>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="ml-auto text-[11px] text-ink-faint hover:text-accent"
          >
            {target === daysInMonth ? "daily" : `${target}/month`} — change
          </button>
        )}
      </div>

      <div className="relative h-2 overflow-hidden rounded-full bg-border">
        <div className="absolute inset-y-0 left-0 bg-accent-dim/50" style={{ width: `${pct}%` }} />
        <div className="absolute inset-y-0 left-0 bg-accent" style={{ width: `${pubPct}%` }} />
      </div>
      <p className="mt-1.5 text-[10px] text-ink-faint">
        solid = published · faded = slotted but not out yet
      </p>
    </section>
  );
}

/* -------------------------------------------------------------- pillar mix */

export function PillarMix({
  month,
  rows,
  knownPillars,
}: {
  month: string;
  rows: { pillar: string; target: number; scheduled: number; published: number }[];
  knownPillars: string[];
}) {
  const [adding, setAdding] = useState(false);
  const sorted = [...rows].sort((a, b) => b.scheduled - a.scheduled);

  return (
    <section className="mb-5 rounded-xl border border-border-soft bg-surface p-4">
      <div className="mb-2 flex items-baseline justify-between">
        <h2 className="text-sm text-ink">Mix</h2>
        <button
          type="button"
          onClick={() => setAdding((v) => !v)}
          className="text-[11px] text-ink-faint hover:text-accent"
        >
          {adding ? "cancel" : "+ set a target"}
        </button>
      </div>

      <p className="mb-3 text-[11px] text-ink-faint">
        Posting daily is easy to hit with thirty of whatever is quickest to make. This is the part
        that stops that.
      </p>

      {sorted.length === 0 && !adding && (
        <p className="text-xs text-ink-faint">Nothing slotted yet.</p>
      )}

      <div className="space-y-1.5">
        {sorted.map((r) => {
          const over = r.target > 0 && r.scheduled > r.target;
          const short = r.target > 0 && r.scheduled < r.target;
          return (
            <div key={r.pillar} className="flex items-center gap-2.5">
              <span
                className="w-28 shrink-0 truncate rounded border px-1.5 py-0.5 text-[11px]"
                style={pillarStyle(r.pillar === "unassigned" ? null : r.pillar)}
              >
                {r.pillar}
              </span>
              <span className="flex-1">
                <span className="flex h-1.5 gap-[2px] overflow-hidden rounded-full">
                  {Array.from({ length: Math.max(r.scheduled, r.target, 1) }).map((_, i) => (
                    <span
                      key={i}
                      className="h-full flex-1 rounded-full"
                      style={{
                        background:
                          i < r.published
                            ? `hsl(${hue(r.pillar)} 55% 55%)`
                            : i < r.scheduled
                              ? `hsl(${hue(r.pillar)} 40% 32%)`
                              : "var(--color-border)",
                      }}
                    />
                  ))}
                </span>
              </span>
              <span className="w-24 shrink-0 text-right font-mono text-[10px] text-ink-faint">
                {r.scheduled}
                {r.target > 0 && ` / ${r.target}`}
                {over && <span className="text-accent"> over</span>}
                {short && <span> short</span>}
              </span>
            </div>
          );
        })}
      </div>

      {adding && (
        <form action={setPillarTarget} className="mt-3 flex flex-wrap gap-1.5">
          <input type="hidden" name="month" value={month} />
          <input
            name="pillar"
            required
            list="known-pillars"
            placeholder="guitar"
            className={`${field} w-32`}
          />
          <input
            name="target_count"
            type="number"
            min="0"
            required
            placeholder="how many"
            className={`${field} w-24`}
          />
          <button type="submit" className={btn}>
            Set target
          </button>
          <datalist id="known-pillars">
            {knownPillars.map((p) => (
              <option key={p} value={p} />
            ))}
          </datalist>
        </form>
      )}
    </section>
  );
}

/* -------------------------------------------------------------- month grid */

// MAKE reads solid, EDIT reads faint — the writing has to exist before the
// edit plan means anything, so the two are not equal weight at a glance.
function ReadinessBar({
  filled,
  total,
  faint = false,
}: {
  filled: number;
  total: number;
  faint?: boolean;
}) {
  return (
    <span className={`mt-0.5 flex gap-[1px] ${faint ? "opacity-50" : ""}`}>
      {Array.from({ length: total }).map((_, k) => (
        <span
          key={k}
          className={`h-[2px] flex-1 rounded-full ${k < filled ? "bg-current" : "bg-border"}`}
        />
      ))}
    </span>
  );
}

type Entry = {
  id: string;
  title: string;
  status: string | null;
  pillar: string | null;
  day: string;
  filled: number;
  total: number;
  make: { filled: number; total: number };
  edit: { filled: number; total: number };
};

export function MonthGrid({
  year,
  month,
  daysInMonth,
  entries,
  knownPillars,
}: {
  year: number;
  month: number;
  daysInMonth: number;
  entries: Entry[];
  knownPillars: string[];
}) {
  const [addingOn, setAddingOn] = useState<string | null>(null);

  const byDay = new Map<string, Entry[]>();
  for (const e of entries) {
    const list = byDay.get(e.day) ?? [];
    list.push(e);
    byDay.set(e.day, list);
  }

  const leading = new Date(year, month - 1, 1).getDay(); // 0 = Sunday
  const todayIso = new Date().toISOString().slice(0, 10);

  return (
    <section className="mb-5">
      <div className="mb-1.5 grid grid-cols-7 gap-1.5">
        {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
          <span key={i} className="text-center text-[10px] text-ink-faint">
            {d}
          </span>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1.5">
        {Array.from({ length: leading }).map((_, i) => (
          <span key={`pad-${i}`} />
        ))}

        {Array.from({ length: daysInMonth }).map((_, i) => {
          const d = i + 1;
          const day = iso(year, month, d);
          const items = byDay.get(day) ?? [];
          const isToday = day === todayIso;
          const empty = items.length === 0;

          return (
            <div
              key={day}
              className={`min-h-20 rounded-lg border p-1 transition-colors ${
                isToday
                  ? "border-accent-dim"
                  : empty
                    ? "border-dashed border-border-soft"
                    : "border-border-soft bg-surface"
              }`}
            >
              <div className="mb-1 flex items-center justify-between">
                <span
                  className={`font-mono text-[10px] ${isToday ? "text-accent" : "text-ink-faint"}`}
                >
                  {d}
                </span>
                <button
                  type="button"
                  onClick={() => setAddingOn(addingOn === day ? null : day)}
                  className="text-[11px] leading-none text-ink-faint hover:text-accent"
                  aria-label={`Add on ${day}`}
                >
                  +
                </button>
              </div>

              {items.map((e) => (
                <div key={e.id} className="mb-1">
                  <Link
                    href={`/videos/${e.id}`}
                    className="block rounded border px-1 py-0.5 text-[10px] leading-tight hover:brightness-125"
                    style={pillarStyle(e.pillar)}
                    title={`${e.title}${
                      e.total
                        ? ` — MAKE ${e.make.filled}/${e.make.total} · EDIT ${e.edit.filled}/${e.edit.total}`
                        : ""
                    }`}
                  >
                    <span className="line-clamp-2">{e.title}</span>
                    {/* Readiness on the calendar is the point: a video going
                        out Friday at 1/8 is visible as a risk today, not on
                        Friday. Two bars rather than one because written-but-
                        unplanned and planned-but-unwritten are the same number
                        and completely different problems. */}
                    {e.make.total > 0 && <ReadinessBar {...e.make} />}
                    {e.edit.total > 0 && <ReadinessBar {...e.edit} faint />}
                  </Link>
                  {e.status !== "published" && (
                    <form action={markPublished}>
                      <input type="hidden" name="video_id" value={e.id} />
                      <button
                        type="submit"
                        className="mt-[1px] text-[9px] text-ink-faint hover:text-accent"
                      >
                        mark posted
                      </button>
                    </form>
                  )}
                </div>
              ))}

              {addingOn === day && (
                <form
                  action={quickAdd}
                  onSubmit={() => setAddingOn(null)}
                  className="mt-1 space-y-1"
                >
                  <input type="hidden" name="day" value={day} />
                  <input
                    name="title"
                    required
                    autoFocus
                    placeholder="what goes out"
                    className="w-full rounded border border-border bg-surface-2 px-1 py-0.5 text-[10px] outline-none"
                  />
                  <input
                    name="pillar"
                    list="known-pillars"
                    placeholder="bucket"
                    className="w-full rounded border border-border bg-surface-2 px-1 py-0.5 text-[10px] outline-none"
                  />
                  <button type="submit" className="w-full text-[10px] text-accent">
                    add
                  </button>
                </form>
              )}
            </div>
          );
        })}
      </div>
      <datalist id="known-pillars">
        {knownPillars.map((p) => (
          <option key={p} value={p} />
        ))}
      </datalist>
    </section>
  );
}

/* ---------------------------------------------------------------- backlog */

export function Backlog({
  videos,
  ideas,
  year,
  month,
  daysInMonth,
}: {
  videos: { id: string; title: string; status: string | null; pillar: string | null }[];
  ideas: { id: string; title: string; niche: string | null }[];
  year: number;
  month: number;
  daysInMonth: number;
}) {
  const [tab, setTab] = useState<"videos" | "ideas">("videos");

  const days = Array.from({ length: daysInMonth }, (_, i) => iso(year, month, i + 1));
  const dayPicker = (name: string) => (
    <select name={name} required defaultValue="" className={`${field} w-24`}>
      <option value="" disabled>
        day…
      </option>
      {days.map((d) => (
        <option key={d} value={d}>
          {Number(d.slice(8))}
        </option>
      ))}
    </select>
  );

  return (
    <section className="rounded-xl border border-border-soft bg-surface p-4">
      <div className="mb-3 flex gap-3">
        {(["videos", "ideas"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`text-sm transition-colors ${
              tab === t ? "text-ink" : "text-ink-faint hover:text-ink-dim"
            }`}
          >
            Unscheduled {t}
            <span className="ml-1.5 text-[11px] text-ink-faint">
              {t === "videos" ? videos.length : ideas.length}
            </span>
          </button>
        ))}
      </div>

      {tab === "videos" ? (
        <ul className="divide-y divide-border-soft">
          {videos.map((v) => (
            <li key={v.id} className="flex flex-wrap items-center gap-2 py-2">
              <Link
                href={`/videos/${v.id}`}
                className="min-w-0 flex-1 truncate text-sm text-ink-dim hover:text-ink"
              >
                {v.title}
              </Link>
              <form action={setPillar} className="flex gap-1">
                <input type="hidden" name="video_id" value={v.id} />
                <input
                  name="pillar"
                  defaultValue={v.pillar ?? ""}
                  placeholder="bucket"
                  className={`${field} w-20`}
                />
              </form>
              <form action={schedule} className="flex gap-1">
                <input type="hidden" name="video_id" value={v.id} />
                {dayPicker("day")}
                <button type="submit" className={btn}>
                  Slot
                </button>
              </form>
            </li>
          ))}
          {videos.length === 0 && <li className="py-3 text-sm text-ink-faint">Nothing waiting.</li>}
        </ul>
      ) : (
        <ul className="divide-y divide-border-soft">
          {ideas.map((i) => (
            <li key={i.id} className="flex flex-wrap items-center gap-2 py-2">
              <span className="min-w-0 flex-1 truncate text-sm text-ink-dim">{i.title}</span>
              {i.niche && (
                <span className="shrink-0 font-mono text-[10px] text-ink-faint">{i.niche}</span>
              )}
              <form action={scheduleIdea} className="flex gap-1">
                <input type="hidden" name="idea_id" value={i.id} />
                {dayPicker("day")}
                <button type="submit" className={btn}>
                  Slot
                </button>
              </form>
            </li>
          ))}
          {ideas.length === 0 && <li className="py-3 text-sm text-ink-faint">Bank is empty.</li>}
        </ul>
      )}
    </section>
  );
}
