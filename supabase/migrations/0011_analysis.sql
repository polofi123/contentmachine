-- 0011 — Library-grounded script analysis.
--
-- The previous AI pass wrote criticism and the app displayed it. That is a
-- generic critique feature wearing this app's clothes: nothing it said could be
-- traced to the framework, so nothing it said could be checked, reused, or
-- measured. The library sat there as reading material while the analysis
-- invented its own advice.
--
-- This migration is the storage for an engine that works the other way round:
--
--   script → segments → detected storytelling state → RETRIEVE from the
--   library → rank → compare section against mechanism → grounded finding →
--   edit operation → validate against script AND library → render
--
-- The load-bearing consequence is that a finding cannot exist without a real
-- components row behind it. That is enforced here by a foreign key, not by a
-- prompt asking nicely.
--
-- Nothing about the library changes. `components` remains the single source of
-- truth for both /library and this engine — there is deliberately no second,
-- analysis-only copy of the framework.

-- ==========================================================================
-- script_versions — what was analysed, exactly.
--
-- Findings point at character ranges. Character ranges are meaningless without
-- the text they indexed into, so the analysed text is frozen here rather than
-- re-derived from beats at read time — beats move, and a finding whose quote
-- has silently slid four words to the left is worse than no finding.
--
-- This is also what makes re-analysis honest: a run belongs to a version, and
-- once you edit, its findings are visibly about a version that is no longer
-- current rather than quietly displayed as if they still applied.
-- ==========================================================================
create table script_versions (
  id                uuid primary key default gen_random_uuid(),
  script_id         uuid not null references scripts(id) on delete cascade,

  -- The version this was edited from, when a version is created by applying
  -- findings. NULL for a version captured straight from the editor.
  parent_version_id uuid references script_versions(id) on delete set null,

  -- The exact text the offsets index into: running beats joined in order.
  content           text not null,

  ---------------------------------------------------------------------------
  -- The addressable units, frozen alongside the text.
  --
  --   [{ id, beatId, order, startIndex, endIndex, text, role, loop, section }]
  --
  -- jsonb rather than a table: these are an immutable snapshot that is only
  -- ever read as a whole, and a segments table would invite the idea that they
  -- can be edited independently of the content string they describe.
  ---------------------------------------------------------------------------
  segments          jsonb not null,

  label             text,
  created_at        timestamptz not null default now()
);

create index script_versions_script_idx on script_versions (script_id, created_at desc);

comment on table script_versions is
  'A frozen snapshot of a script plus its segment map. Findings index into `content` by character offset, so the text they were computed against must not move underneath them.';

-- ==========================================================================
-- analysis_runs — one pass of the engine over one version.
-- ==========================================================================
create table analysis_runs (
  id                 uuid primary key default gen_random_uuid(),
  video_id           uuid not null references videos(id) on delete cascade,
  script_version_id  uuid not null references script_versions(id) on delete cascade,

  model              text not null,

  -- What the script is actually doing, in its own shape rather than forced
  -- into a template: [{ id, segmentIds[], function, summary, libraryElementIds[] }]
  story_map          jsonb,

  -- { strongestElements[], highestLeverageFindingIds[] }
  summary            jsonb,

  ---------------------------------------------------------------------------
  -- The developer trace: retrieval query, every candidate and its score, what
  -- was selected, what was rejected and why, and every validation failure.
  --
  -- Stored rather than logged because its whole purpose is to answer a
  -- question you can only ask afterwards — "did the library actually influence
  -- this, or did the model decide first and get a citation stapled on?" A trace
  -- that vanished with the request could never settle that.
  ---------------------------------------------------------------------------
  trace              jsonb,

  -- How much of the library was eligible to be cited on this run. Surfaced so
  -- thin coverage reads as a gap in the framework rather than as the engine
  -- being unable to find anything.
  library_total      int,
  library_citable    int,

  created_at         timestamptz not null default now()
);

create index analysis_runs_video_idx   on analysis_runs (video_id, created_at desc);
create index analysis_runs_version_idx on analysis_runs (script_version_id);

-- ==========================================================================
-- analysis_findings.
--
-- Detection, grounding and prescription are separate columns rather than one
-- blob of prose, because they are separately checkable: a diagnosis can be
-- right while the mechanism is wrong, and a mechanism can be right while the
-- operation targets the wrong lines. Collapsing them into a paragraph is how
-- you end up unable to tell which part failed.
-- ==========================================================================
create table analysis_findings (
  id              uuid primary key default gen_random_uuid(),
  run_id          uuid not null references analysis_runs(id) on delete cascade,

  -- 'local' touches one contiguous range; 'structural' spans several, often
  -- non-adjacent — a reveal that should move, a setup with no payoff.
  scope           text not null default 'local'
                    check (scope in ('local', 'structural')),

  ---------------------------------------------------------------------------
  -- Leverage, not severity. A mis-ordered reveal outranks ten flat sentences,
  -- and sorting by how bad a line reads would bury it under them.
  ---------------------------------------------------------------------------
  priority        text not null default 'medium'
                    check (priority in ('structural', 'high', 'medium', 'polish')),

  confidence      numeric(3, 2) check (confidence between 0 and 1),

  -- DETECTION — what is happening, before any mechanism is consulted.
  diagnosis_type  text not null,
  diagnosis       text not null,

  ---------------------------------------------------------------------------
  -- EVIDENCE — [{ segmentIds[], quote, startIndex, endIndex }]
  --
  -- An array because a structural finding is about a relationship between
  -- places. Every quote in here is validated as an exact substring of the
  -- version's content before the row is written; a finding whose evidence
  -- cannot be found in the script is not displayed, it is discarded.
  ---------------------------------------------------------------------------
  evidence        jsonb not null,

  -- GROUNDING — why this mechanism, for this section.
  why_applicable  text not null,
  intended_effect text not null,

  ---------------------------------------------------------------------------
  -- PRESCRIPTION — { type, targetSegmentIds[], destinationSegmentId?,
  --                  replacementText?, insertedText?, instructions? }
  --
  -- Deliberately not reducible to replacement text. "Cut this", "move this
  -- earlier", "merge these two" are the operations that matter most and none of
  -- them is a rewrite. `keep` is a real operation too — a section that already
  -- does its job should be marked protected, not improved at.
  ---------------------------------------------------------------------------
  operation       jsonb not null,

  state           text not null default 'pending'
                    check (state in ('pending', 'accepted', 'rejected', 'applied', 'stale')),

  -- What actually got written, when the suggestion was edited before applying.
  -- Kept so "which recommendations do you rewrite before taking" is answerable.
  applied_text    text,
  edited          boolean not null default false,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index analysis_findings_run_idx   on analysis_findings (run_id, priority);
create index analysis_findings_state_idx on analysis_findings (state);

-- ==========================================================================
-- analysis_finding_library_refs — the citation, as a real reference.
--
-- A foreign key to `components`, not a name copied into text. That is the
-- difference between a citation you can open and a citation you have to trust:
-- renaming a component in /library keeps every past finding pointing at it, and
-- "which mechanisms does this engine actually recommend, and which do people
-- accept" is a GROUP BY rather than string matching on prose.
--
-- supporting_text is validated as a substring of that component's body before
-- the row is written. A quote that cannot be traced back to the element it
-- claims to come from is a fabricated citation, and the schema is the last
-- place that can refuse one.
-- ==========================================================================
create table analysis_finding_library_refs (
  id              uuid primary key default gen_random_uuid(),
  finding_id      uuid not null references analysis_findings(id) on delete cascade,
  component_id    uuid not null references components(id) on delete cascade,

  -- The chosen mechanism vs. a materially different creative alternative.
  -- Equivalent mechanisms are NOT listed — offering a choice between two ways
  -- of saying the same thing is fake choice.
  is_primary      boolean not null default true,

  -- How the retrieval ranked it, kept apart from the model's own confidence so
  -- "the search was weak" and "the model was unsure" stay distinguishable.
  relevance       numeric(4, 3),

  supporting_text text not null,

  created_at      timestamptz not null default now(),
  unique (finding_id, component_id)
);

create index analysis_refs_component_idx on analysis_finding_library_refs (component_id);
create index analysis_refs_finding_idx   on analysis_finding_library_refs (finding_id, is_primary);

comment on table analysis_finding_library_refs is
  'The citation as a foreign key. Makes recommendations openable, survivable across renames, and countable by mechanism id rather than by name.';

-- ==========================================================================
-- Which mechanisms earn their place (§28).
--
-- A view rather than an analytics pipeline: the question is small, the data is
-- already here, and keeping it as SQL means it cannot drift from the rows it
-- summarises. Keyed by component id throughout.
-- ==========================================================================
create view library_mechanism_usage as
select
  c.id                                                        as component_id,
  c.source_id,
  c.name,
  c.layer_id,
  count(*) filter (where r.is_primary)                        as times_recommended,
  count(*) filter (where r.is_primary and f.state = 'accepted') as times_accepted,
  count(*) filter (where r.is_primary and f.state = 'applied')  as times_applied,
  count(*) filter (where r.is_primary and f.state = 'rejected') as times_rejected,
  count(*) filter (where r.is_primary and f.edited)             as times_edited_first,
  round(avg(r.relevance) filter (where r.is_primary), 3)        as avg_retrieval_relevance,
  round(avg(f.confidence) filter (where r.is_primary), 2)       as avg_model_confidence
from components c
join analysis_finding_library_refs r on r.component_id = c.id
join analysis_findings f             on f.id = r.finding_id
group by c.id, c.source_id, c.name, c.layer_id;

comment on view library_mechanism_usage is
  'Which framework mechanisms the engine reaches for, and which ones survive contact with the creator. Low acceptance on a frequently-recommended mechanism is a signal about the mechanism, not just the run.';

create trigger analysis_findings_updated_at
  before update on analysis_findings
  for each row execute function set_updated_at();
