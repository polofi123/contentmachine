# Content System

The content framework as data — editable records joined to videos joined to outcomes,
so it can eventually answer the only question that matters: *which of these things
correlate with my videos performing?*

Seeded from `content-system-theory.md`. Every element keeps its stable ID
(`HOOKW-03`, `HACK-01`, `CHK-02`).

## Running it

```bash
pnpm install
pnpm db:start          # local Supabase (needs Docker Desktop running)
# copy the printed API URL + anon key into .env.local
pnpm db:reset          # migrations + seed
pnpm db:types          # regenerate src/lib/database.types.ts
pnpm dev
```

`pnpm db:check` runs `supabase/scripts/verify.sql` — row counts, nesting, the
outlier-score reproduction, and the analytics query that justifies the schema.

## The model

Nine tables. The three that carry the weight:

**`components`** — every framework element. Self-referencing, so `CHK-01a..d` nest
under `CHK-01` and `HOOKW-01..06` under `HOOK-02`. `source_id` is the seed's conflict
target: **rename anything you like, re-seeding will not overwrite it.** `is_placeholder`
marks the 14 slots the source framework asserts exist but never named (`CHK-04/05/06`
and 11 of the 18 hacks) — they are real rows so the library can say "not yet named"
instead of pretending the model is complete.

**`video_components`** — the join, and the point of the whole system. `state` is
`planned | used | skipped`, and **`skipped` is a row, not an absence**: "I considered an
open loop and chose not to" and "I never thought about it" are different facts, and only
the first makes *"videos without an open loop averaged 2k views"* an honest sentence.
`placement_sec` records *where* a technique landed, because "an open loop in the first
15 seconds" is unanswerable without it.

**`video_metrics`** — outcomes as snapshots, not a `views` column. A column cannot
answer "week one versus month three" and silently overwrites its own history.

### Three things that look like the same fact and are not

This is the distinction most likely to rot the data, so it is worth stating plainly:

| | What it is | Works for |
|---|---|---|
| `videos.lego_*` | Prose: what the video *did* | Mine **and** other people's |
| `video_components` | Structured: which *named technique* | Mine, mostly |
| `hooks` | The actual candidate hook lines | Mine |

Fill all three inconsistently and you will trust none of them.

### One `videos` table

Outliers and my own videos are the same row type, split by `is_mine`. Comparison is a
`WHERE`, not a `UNION`, and the seven Idea Legos are defined once so they cannot drift
apart. Outlier score is derived (`MINE-02`), never stored.

### Completeness is per-video

`video_slots` rows *are* the denominator — a slot row means "this build cares about this
slot". A deliberate three-piece build reads **3/3**, not 3/47. A denominator of
"everything in the framework" would read 12/47 forever and become wallpaper.

Never a gate. It shows what you left on the table, then lets you ship.

## Built

- `/capture` — one field, one button. Fast capture or the tool goes unused. `build` promotes
  an idea into a video in one tap.
- `/library` — every component, layer-grouped and nested, full CRUD, archive not delete.
- `/videos` — mine and outliers in one list, each with its completeness meter.
- `/videos/[id]` — the workbench.

### The workbench is a document, not a wizard

A scrolling stack of collapsible slot cards. No next/back, no enforced order, nothing
blocking. A wizard implies sequence and completion, which fights "some builds use three
pieces"; a freeform canvas has no opinion at all, which is the other failure.

Most cards are **data-driven**: a slot names a layer, and every component in that layer
becomes an option. Adding a component in `/library` makes it appear on the workbench with
no code change. Four cards are bespoke because their shape genuinely differs — Legos
(seven prose fields), Hook (bank + word-type tagging), Loop (a binary fork), Script
(beats).

Each component control is one control with three states: tap to mark **used**, again for
**skipped**, again to clear. Retention hacks and checkpoints also take a placement in
seconds.

## Not built yet

`/insights` — the analysis screen. The schema and the `component_performance` view are
ready for it; see the sample-size warning below before building it.

## Known limitation

View counts are entered by hand — no platform APIs, by design. This is the likeliest
thing to rot: in three weeks the numbers won't be there and the performance loop will
have nothing to chew on. `videos.platform_video_id` is stored so a read-only YouTube
Data API fetch is a small drop-in later.

When `/insights` is built it must show raw comparisons with explicit sample sizes, never
a correlation coefficient — at n=5 a correlation is a coin flip you would nonetheless
believe.
