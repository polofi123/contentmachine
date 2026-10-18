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
- `/hooks` — the same bargain for hook lines. See below.
- `/library` — every component, layer-grouped and nested, full CRUD, archive not delete.
- `/videos` — mine and outliers in one list, each with its completeness meter.
- `/videos/[id]` — the workbench.
- `/videos/[id]/ship` — the read view. The whole script as one block of prose, at a
  size you can read from behind a camera, with a copy button; then the URL, the date
  and the view counts, whenever you get round to them.

### The hook bank was already in the schema

`/hooks` did not need a table. A bank hook is a `hooks` row with no `video_id` —
`hooks_bank_idx` has always indexed exactly those rows, the workbench's "pull from the
bank" has always read them, and `HOOK-06` is a seeded component literally named *Hook
bank* whose ten lines are seeded into it. The screen is a front door to a room that was
already built, which is why tagging a line here means it arrives at a video already
marked up: same `hook_word_tags` rows either way.

Three things it does beyond capture:

- **The Six Hook Words as chips.** `HOOKW-01..06`, tapped on or off. A line missing any
  of the *four core* words says so; Time and Proof say "Optional" in their own bodies, so
  a hook without them is not incomplete. Calling it incomplete would train you to bolt
  "in 30 days" onto hooks that never needed it.
- **Prompts.** `HOOK-16`'s eighteen questions, collapsed, wired to nothing. They are there
  to spark the next line, not to be ticked — the moment a checklist can be completed it
  becomes eighteen chores per hook, and you write three hooks a month instead of thirty.
- **Riff.** Asks Claude for three variations against the six word types, using the word
  definitions read live out of `/library` rather than a private copy in the prompt.
  **Riffs are not rows.** They sit on screen until you tap `keep`. Same rule as the
  storytelling panel: the model proposes, you decide, and the bank only ever holds lines
  a person chose. Hidden entirely when there is no `ANTHROPIC_API_KEY`.

`build` copies the line onto a new video and selects it, carrying its word tags, and
**leaves the bank intact** — that is `useBankHook`'s existing rule, not a new one. A hook
shape that worked once is worth reaching for again, and a bank that empties itself every
time you build is empty when you need it. `drop` is scoped to `video_id is null`, so this
screen can never delete a line out of a script.

`/plan` carries a three-line peek at the bank with a count, because the bank is not
month-scoped and the work belongs on `/hooks` — it is there to remind you the lines exist
while you are deciding what to make.

### SHIP is the only view that is not a workspace

MAKE, STUDY and EDIT all exist to change the video. SHIP exists to take it out of the
app — read it aloud, paste it into a prompter — and to bring the result back in weeks
later. Those are one screen on purpose: the numbers belong beside the words that
earned them, and a script you never reopen is a video whose views never get typed in.

Two flavours of the same text, from one function (`lib/script-text.ts`), so what is on
screen and what lands on the clipboard cannot drift apart: **words only** for reading
out loud, **with marks** for section headers, derived timestamps and story roles.

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
have nothing to chew on. SHIP is where they get typed, next to the script rather than
on a screen of their own, which is the cheapest defence available.

`videos.platform_video_id` is stored so a read-only YouTube Data API fetch is a small
drop-in later — and SHIP reads it, and the platform, straight out of the pasted URL
(`lib/platform.ts`, parsing only, no network), because a column nobody fills by hand
is a column that will be empty when the fetch is finally written.

When `/insights` is built it must show raw comparisons with explicit sample sizes, never
a correlation coefficient — at n=5 a correlation is a coin flip you would nonetheless
believe.
