-- 0008 — The MAKE / EDIT split.
--
-- The workbench was one scrolling stack of slot cards in a fixed order, which
-- put "Retention hacks" (sort_order 50) *below* "Script" (40). A technique you
-- meet after the script is written can only critique it; it cannot help build
-- it. This migration is the data side of splitting that stack into two
-- workspaces — MAKE (what am I saying) and EDIT (how is it assembled).
--
-- Everything here is additive. No table is created, nothing is dropped, and the
-- analytical model (video_components → video_metrics) is untouched: the split
-- happens at the workflow/UI level, never by forking the data.

-- --------------------------------------------------------------------------
-- slots.workflow_stage — which workspace a slot appears in.
--
-- This is presentation metadata. It says where a card is shown; it does NOT
-- change the analytical meaning of the components underneath, which is why it
-- lives here and not on `components`. The workbench stays data-driven: adding
-- a slot with workflow_stage='edit' surfaces it in EDIT with no code change.
-- --------------------------------------------------------------------------
alter table slots add column workflow_stage text not null default 'make'
  check (workflow_stage in ('make','edit','shared'));

comment on column slots.workflow_stage is
  'Which workspace renders this slot. Presentation only — the analytical meaning of the underlying components is unchanged.';

-- On a fresh `db:reset` these UPDATEs match nothing, because migrations run
-- before seed.sql — seed.sql carries the values itself. They exist so an
-- already-populated local database moves without being reset.
-- A spoken hook is words and a visual hook is a shot, so they split even though
-- both are "the hook" — the slot follows what it decides, not what it is named.
update slots set workflow_stage = 'edit'
  where key in ('edit','visual_hook','visual_layout');
update slots set workflow_stage = 'shared'
  where key in ('packaging','engagement','distribution');
-- Everything else keeps the 'make' default.

-- EDIT is a workspace of its own now, so a new video needs edit slots or it
-- opens onto nothing. visual_hook and visual_layout already hold the visual
-- vocabulary (Camera Whip, Zoom In, Pattern Interrupt, Match Cut, Framebreaker
-- …) — seeding a second, parallel set of the same techniques would fracture
-- component_performance across duplicate names.
update slots set in_default_template = true
  where key in ('edit','visual_hook','visual_layout');

-- The rest of the MAKE slots join the template too, so a new video arrives with
-- the whole idea in front of it rather than a hunt through "add a slot".
--
-- This widens the starting denominator to 17. That is a real trade against the
-- rule that a three-piece build should read 3/3, and the counterweight is
-- per-video: each card carries "this build doesn't need X — drop the slot",
-- which removes it from the denominator in one click.
update slots set in_default_template = true
  where key in ('format','spoken_hook','hook_modifier','story_format','story_loop','story');

-- --------------------------------------------------------------------------
-- script_beats.story_section — Level 3 structure.
--
-- Three levels that must not be mixed:
--   Level 1  the words                 script_beats.text
--   Level 2  what the beat is doing    function_label / function_component_id
--   Level 3  where it sits in the arc  this column
--
-- NULL is valid and is the expected starting state. A creator writes first and
-- structures later; requiring a section before a sentence is the exact failure
-- this whole migration exists to undo. Deliberately a constrained text column
-- rather than its own table — if custom section names are ever needed, that is
-- the moment to promote it, not now.
-- --------------------------------------------------------------------------
alter table script_beats add column story_section text
  check (story_section is null or story_section in ('start','middle','end'));

comment on column script_beats.story_section is
  'Start/middle/end. Authored in MAKE, inherited by EDIT. NULL means unstructured, which is a normal state, not an incomplete one.';

-- --------------------------------------------------------------------------
-- script_beats.parked — "move to pile".
--
-- A line pulled out of the script but not thrown away. Same distinction the
-- rest of the schema keeps everywhere else: discarded-on-purpose and
-- never-existed are different facts. Parked beats render in the idea pile and
-- can be dragged back in.
-- --------------------------------------------------------------------------
alter table script_beats add column parked boolean not null default false;

create index script_beats_parked_idx on script_beats (script_id) where parked;

comment on column script_beats.parked is
  'Removed from the running script but kept as a loose brick in the idea pile. Not the same as deleted.';

-- --------------------------------------------------------------------------
-- video_components.anchor_beat_id — plant a technique ON a beat.
--
-- placement_sec answers "where did this land", and until now it was typed by
-- hand into a box in a different card from the script it referred to. Anchoring
-- to a beat means placement is DERIVED at read time, so it stays correct when
-- the words above it are edited. An explicit placement_sec remains valid and
-- wins — same NULL-means-derived rule the timeline uses for t_start_sec.
--
-- NOTE the pre-existing `unique (video_id, component_id)` on this table: a
-- technique can be anchored to exactly one beat per video. Using Re-hooking at
-- 0:04 and again at 0:18 is not yet expressible. That is the current model and
-- this migration deliberately does not change it. The threshold for splitting
-- placements into a child table is the UI proving that repeat placement is
-- routine — not the suspicion that it might be.
-- --------------------------------------------------------------------------
alter table video_components add column anchor_beat_id uuid
  references script_beats(id) on delete set null;

create index video_components_anchor_idx on video_components (anchor_beat_id)
  where anchor_beat_id is not null;

comment on column video_components.anchor_beat_id is
  'The script beat this technique is planted on. When set, placement is derived from the beat timeline rather than stored, so it survives edits to earlier text.';
