-- 0010 — The storytelling mechanism.
--
-- Hooks got a mechanism in 0009: the six HOOKW components, spans on a line, a
-- colour per job, and a panel that teaches the line you are standing on. Doing
-- that made hooks *inspectable* — you can look at a line and see whether the
-- words are doing the work.
--
-- Storytelling never got one. STORY-01..14 are fourteen paragraphs of theory
-- sitting in a chip tray. You can read them; you cannot DO anything that leaves
-- a record. So the app can say "this video used Dance" and can never say what
-- the story was trying to do, where the tension is, or which beat pays off
-- which question.
--
-- This migration is the data side of fixing that. The organising idea, taken
-- from the brief:
--
--   WRITING is the source material.       script_beats.text
--   STRUCTURE is an overlay.              story_role, story_loop, story_section
--   TECHNIQUES are attachments.           script_beat_components
--   DIAGNOSTICS are observations.         derived, never stored
--   EDITING is a later execution layer.   untouched by all of this
--
-- Those five must not collapse into each other. Everything below is additive:
-- no table is dropped, no column is removed, and the analytical spine
-- (video_components → video_metrics → component_performance) is unchanged.
-- The three invariants hold — skipped is a row, completeness is per-video, and
-- outcomes are snapshots.

-- ==========================================================================
-- story_direction — where are we taking the viewer, and why.
--
-- One row per video, which by the precedent set for videos.loop_type in 0002
-- argues for columns on `videos` rather than a table. It is a table anyway, for
-- a reason that precedent does not cover: `videos` holds outliers too, and
-- Direction is authored, not observed. Four columns that are NULL for every row
-- where is_mine is false would be four columns pretending to describe something
-- they never describe. A row that only exists once you have thought about it is
-- the more honest shape, and "has this video got a direction yet" becomes an
-- existence check rather than a four-way NULL test.
--
-- Every field is nullable. A video with a destination and nothing else is a
-- normal, valid state — the panel exists to be filled in slowly.
-- ==========================================================================
create table story_direction (
  id              uuid primary key default gen_random_uuid(),
  video_id        uuid not null unique references videos(id) on delete cascade,

  -- What does the viewer believe walking in? The thing the video argues with.
  starting_belief text,

  -- What should they understand, believe, feel or want by the end?
  destination     text,

  -- The last important thing they hear. Not the CTA — the closing thought.
  final_thought   text,

  ---------------------------------------------------------------------------
  -- "The reason I'm telling you this is because…"
  --
  -- Deliberately its own column rather than part of `destination`. Destination
  -- is where the viewer lands; meaning is why landing there matters. A script
  -- can arrive somewhere precise and still mean nothing, and that failure is
  -- exactly the one worth being able to see.
  ---------------------------------------------------------------------------
  meaning         text,

  ---------------------------------------------------------------------------
  -- Present tense is a CHOICE, not a rule, so it is recorded rather than
  -- enforced. Its only job is to license a diagnostic: once you have said "this
  -- one is in present tense", a line that slips into past tense is worth
  -- pointing at. Without the declaration, mixed tense is just prose.
  ---------------------------------------------------------------------------
  tense           text check (tense is null or tense in ('present', 'past')),

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

comment on table story_direction is
  'Where the video is taking the viewer and why. Authored in MAKE for videos you make; deliberately not on `videos`, which also holds outliers.';
comment on column story_direction.meaning is
  'The reason I am telling you this. Separate from destination: a script can land precisely and still mean nothing.';
comment on column story_direction.tense is
  'Declared, not enforced. Its only job is to license the tense-drift observation.';

-- ==========================================================================
-- story_lenses — the perspective, and the ones you passed over.
--
-- The subject is rarely what makes a story worth watching; the angle on it is.
-- So the interesting record is not "the lens I used" but "the four I considered
-- and the one I chose" — the obvious reading is nearly always the first one you
-- think of, and seeing it sit next to two stranger ones is what makes it easy
-- to not use it.
--
-- Shaped exactly like `hooks`: many candidates per video, at most one selected.
-- That is not laziness, it is the same fact in the same shape — a bank of
-- alternatives where one wins — and it should therefore behave identically.
--
-- Unlike `hooks` there is no video_id IS NULL bank. A hook line can be lifted
-- into a different video whole; "her economic impact on the NFL" cannot. A lens
-- is about its topic and does not travel.
-- ==========================================================================
create table story_lenses (
  id           uuid primary key default gen_random_uuid(),
  video_id     uuid not null references videos(id) on delete cascade,
  text         text not null,

  ---------------------------------------------------------------------------
  -- How far from the obvious reading this one sits.
  --
  -- Nullable, and unranked on purpose — this is a note about where the idea
  -- came from, not a score. "Unexpected" does not mean "better", and the system
  -- must never quietly imply that it does.
  ---------------------------------------------------------------------------
  tier         text check (tier is null or tier in ('obvious', 'less_obvious', 'unexpected')),

  is_selected  boolean not null default false,

  -- Which framework technique produced it (LENS-*, or HOOK-05's inversion).
  -- Optional: most lenses arrive by thinking, not by applying a named move.
  component_id uuid references components(id) on delete set null,

  notes        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- Same partial-unique shape as hooks_one_selected_per_video.
create unique index story_lenses_one_selected_per_video
  on story_lenses (video_id) where is_selected;

create index story_lenses_video_idx     on story_lenses (video_id, created_at);
create index story_lenses_component_idx on story_lenses (component_id)
  where component_id is not null;

comment on column story_lenses.tier is
  'Distance from the obvious reading. A note on provenance, not a ranking — unexpected does not mean better.';

-- ==========================================================================
-- story_questions — the tension engine, as rows.
--
-- Intrigue is uncertainty, and uncertainty is a question the viewer is carrying.
-- Every other part of the storytelling model is downstream of that: a re-hook
-- opens one, a payoff closes one, a stretch with none open is where people
-- leave. None of it is expressible while questions live only in the writer's
-- head.
--
-- So a question is a row that knows where it opened and where it closed. That
-- one shape answers, without any further modelling:
--
--   what is still open at the end        answered_beat_id is null
--   where the viewer has no reason to    the gap between an answer and the
--     stay                                 next opening, on the beat timeline
--   whether the payoff pays off          does the end close what the start
--     the setup                            opened, or something else
--
-- Both beat links are nullable and ON DELETE SET NULL. A question you have
-- written down but not yet placed is real, and deleting the line that opened it
-- must not delete the question — that is a thought, and it survives its
-- sentence.
-- ==========================================================================
create table story_questions (
  id                  uuid primary key default gen_random_uuid(),

  ---------------------------------------------------------------------------
  -- Hangs off the video, not the script. Scripts are one-to-many (the 12-minute
  -- cut and the 30-second cut are the same idea), and "why would he defer his
  -- salary" is a question about the IDEA. Tying it to one script would mean
  -- re-asking it per cut.
  ---------------------------------------------------------------------------
  video_id            uuid not null references videos(id) on delete cascade,

  text                text not null,

  opened_beat_id      uuid references script_beats(id) on delete set null,

  ---------------------------------------------------------------------------
  -- NULL means "still open". That is a legitimate ending — a cliffhanger, a
  -- part 2, a question the video deliberately refuses to answer — so it is
  -- never treated as an error, only reported.
  ---------------------------------------------------------------------------
  answered_beat_id    uuid references script_beats(id) on delete set null,

  -- Which mechanism creates the uncertainty (TEN-*: mystery, contradiction,
  -- missing component…). A component link, not an enum, because these are
  -- framework techniques and naming a new one must stay a row in /library.
  source_component_id uuid references components(id) on delete set null,

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index story_questions_video_idx     on story_questions (video_id, created_at);
create index story_questions_opened_idx    on story_questions (opened_beat_id)
  where opened_beat_id is not null;
create index story_questions_answered_idx  on story_questions (answered_beat_id)
  where answered_beat_id is not null;
create index story_questions_component_idx on story_questions (source_component_id)
  where source_component_id is not null;

comment on table story_questions is
  'What the viewer is still wondering, and where it opens and closes. The tension engine as rows — a question with no answering beat is open, which is a valid ending.';

-- ==========================================================================
-- script_beats.story_role — what this line is FOR in this story.
--
-- Not the same taxonomy as a framework technique, and the difference is the
-- whole point. A line can be the HOOK of this story while using Open Loop,
-- Counterintuitive Claim and a Pattern Interrupt — one describes its job here,
-- the others are reusable moves whose performance you want to track across
-- videos. Collapsing them means every technique you tag overwrites what the
-- line is, which is exactly what function_label does today.
--
-- A constrained column rather than a table, for the same reason story_section
-- is one in 0008: the vocabulary is small, structural, and shared across every
-- story. If custom roles are ever wanted, that is the moment to promote it.
--
-- NULL is valid and is the starting state. Writing comes first.
-- ==========================================================================
alter table script_beats add column story_role text
  check (story_role is null or story_role in (
    'hook',        -- stop the scroll
    'foreshadow',  -- promise something later
    'transition',  -- carry them across, without going flat
    'context',     -- what they need to follow it
    'stakes',      -- who, what could be lost, why now
    'question',    -- the thing they now need answered
    'conflict',    -- the thing in the way
    'example',     -- analogy, comparison, mini-story
    'twist',       -- the expected result, replaced logically
    'rehook',      -- close one loop while opening another
    'reveal',      -- the answer, or part of it
    'payoff',      -- the thing they stayed for
    'meaning',     -- why any of it mattered
    'cta'          -- what to do now
  ));

comment on column script_beats.story_role is
  'The beat''s job in THIS story. Deliberately a different taxonomy from the framework techniques attached to it — one describes the line, the other is a reusable move being tracked for performance.';

-- ==========================================================================
-- script_beats.dance_relation — how this line follows the one before it.
--
-- The failure this exists to make visible is the flattest one in short form:
--
--   This happened. And then this happened. And then this happened.
--
-- versus
--
--   This happened, THEREFORE this. BUT that created a problem. THEREFORE…
--
-- The relation belongs on the SECOND of the two beats, pointing backwards,
-- because that is what survives reordering: drag a line somewhere else and its
-- "but" travels with it and is re-evaluated against its new neighbour, which is
-- honest. A relation stored on the first beat pointing forwards would silently
-- come to describe a pair that never existed.
--
-- NULL is the common case and means nothing more than "not said". It is
-- explicitly NOT the same as a plain and-then: a run of consecutive NULLs is
-- reported as a place worth looking, never as an error.
--
-- These are relationships, not required words. Nobody has to write "therefore".
-- ==========================================================================
alter table script_beats add column dance_relation text
  check (dance_relation is null or dance_relation in (
    'therefore', 'but', 'because', 'despite', 'however',
    'which_means', 'until', 'except', 'so'
  ));

comment on column script_beats.dance_relation is
  'How this line follows the previous one. Stored on the second beat pointing back, so it survives reordering. NULL means unsaid, not "and then".';

-- ==========================================================================
-- script_beats.story_loop — optional grouping into attention cycles.
--
-- Retention is not one great hook followed by thirty seconds of hoping. It is
-- build tension → release some → build again, three or four sentences at a
-- time. Numbering the beats is the smallest thing that makes those cycles
-- visible, and the brief is explicit that it should stay that small until usage
-- proves otherwise.
--
-- So: a plain int, no loops table, no names, no independent ordering. Loops are
-- expected to be consecutive runs (1,1,1, 2,2,2, 3,3) but nothing enforces it —
-- a gap or a repeat after a reorder is a mess to look at, not a corruption, and
-- refusing the write would be worse than showing it. Promote to its own table
-- the day loops need names or metadata; not before.
-- ==========================================================================
alter table script_beats add column story_loop int
  check (story_loop is null or story_loop >= 1);

create index script_beats_loop_idx on script_beats (script_id, story_loop)
  where story_loop is not null;

comment on column script_beats.story_loop is
  'Optional attention-cycle number. Deliberately a bare int — no loops table until loops are proven to need names or metadata of their own.';

-- ==========================================================================
-- script_beat_components — a technique, planted on an exact line.
--
-- video_components says "this video used Re-hooking". It cannot say "on beat 7",
-- and — because of its unique (video_id, component_id) — it cannot say
-- "on beats 3, 7 and 11" at all. Re-hooking three times is the entire retention
-- model from §13. It is not an edge case; it is the mechanism, and it has been
-- inexpressible.
--
-- This is the join the brief authorises "only if needed". It is needed.
--
-- It does NOT replace video_components, which stays the authoritative
-- video-level analytical state. The two answer different questions:
--
--   video_components        did this video use Re-hooking, and was that
--                           planned / used / skipped / never considered
--   script_beat_components  which lines are re-hooks
--
-- Application logic keeps them agreeing in one direction only: placing a
-- technique ensures a video_components row with state='used'. Removing a
-- placement must NOT blindly delete that row — 'skipped' and 'never considered'
-- are different facts and only the app knows which one a removal meant. The
-- rule used in actions.ts is: drop the video_components row only when the last
-- placement goes, which preserves the existing "I changed my mind" behaviour
-- while leaving a deliberate 'skipped' alone.
-- ==========================================================================
create table script_beat_components (
  id             uuid primary key default gen_random_uuid(),
  script_beat_id uuid not null references script_beats(id) on delete cascade,
  component_id   uuid not null references components(id) on delete cascade,

  created_at     timestamptz not null default now(),

  -- The same technique twice on one line is not a distinct fact.
  unique (script_beat_id, component_id)
);

create index script_beat_components_beat_idx      on script_beat_components (script_beat_id);
create index script_beat_components_component_idx on script_beat_components (component_id);

comment on table script_beat_components is
  'Which framework technique sits on this exact line. Many per beat, many beats per technique — this is what makes "re-hooked at 0:04, 0:11 and 0:19" expressible. video_components remains the video-level analytical truth.';

-- ==========================================================================
-- Backfill, and what happens to function_label / function_component_id.
--
-- Those two columns have been carrying both jobs at once, which is why planting
-- a technique erases what a line is. They are superseded rather than dropped:
-- dropping them would rewrite the history of every video already written, and
-- an old beat labelled "Payoff" is a true fact about that video even after the
-- app stops writing the column.
--
-- On a fresh `db:reset` both statements match nothing — there are no beats yet.
-- They exist so an already-written local database moves across intact.
-- ==========================================================================

-- Skeleton labels map onto roles almost exactly, because the skeleton was
-- always describing roles — it just had nowhere to put them.
update script_beats set story_role = case lower(trim(function_label))
    when 'hook'         then 'hook'
    when 'foreshadow'   then 'foreshadow'
    when 'transition'   then 'transition'
    when 'stakes'       then 'stakes'
    when 'big question' then 'question'
    when 'head fake'    then 'twist'
    when 'rehook'       then 'rehook'
    when 're-hook'      then 'rehook'
    when 'payoff'       then 'payoff'
    when 'cta'          then 'cta'
    when 'context'      then 'context'
    when 'conflict'     then 'conflict'
    when 'example'      then 'example'
    when 'reveal'       then 'reveal'
    when 'meaning'      then 'meaning'
    when 'twist'        then 'twist'
    when 'question'     then 'question'
  end
  where function_label is not null and story_role is null;

-- Anything planted through the slash palette becomes a real placement.
insert into script_beat_components (script_beat_id, component_id)
select b.id, b.function_component_id
from script_beats b
where b.function_component_id is not null
on conflict (script_beat_id, component_id) do nothing;

comment on column script_beats.function_label is
  'SUPERSEDED by story_role (0010). Kept because a label written on a past video is a true fact about it; no longer written by the app.';
comment on column script_beats.function_component_id is
  'SUPERSEDED by script_beat_components (0010), which allows several techniques per line and the same technique on several lines. Kept for history.';

-- ==========================================================================
-- Timestamps.
-- ==========================================================================
create trigger story_direction_updated_at
  before update on story_direction
  for each row execute function set_updated_at();

create trigger story_lenses_updated_at
  before update on story_lenses
  for each row execute function set_updated_at();

create trigger story_questions_updated_at
  before update on story_questions
  for each row execute function set_updated_at();
