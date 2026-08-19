-- 0003 — Hooks and scripts.
--
-- Hooks are top-level: the HOOK-06 bank exists independently of any video, and
-- a hook is reusable across videos. Scripts are a facet of a video: SCRIPT-04
-- (12 min) and SCRIPT-05 (30s cut) are the same purpose video at two lengths,
-- so videos → scripts is one-to-many and a script never exists alone.

-- --------------------------------------------------------------------------
-- hooks
-- --------------------------------------------------------------------------
create table hooks (
  id          uuid primary key default gen_random_uuid(),
  text        text not null,

  -- NULL = a free-floating bank entry, not yet attached to anything.
  video_id    uuid references videos(id) on delete set null,

  -- The one that actually got used, among a video's candidates.
  is_selected boolean not null default false,

  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- At most one selected hook per video.
create unique index hooks_one_selected_per_video
  on hooks (video_id) where is_selected and video_id is not null;

create index hooks_video_idx on hooks (video_id);
create index hooks_bank_idx  on hooks (created_at desc) where video_id is null;

-- --------------------------------------------------------------------------
-- hook_word_tags — which of the six word types (HOOKW-01..06) a hook uses.
--
-- Deliberately unconstrained on layer: naming a new hook word type is just
-- creating a component, which is the extensibility the brief asks for. The UI
-- filters the picker to the hook_word layer; the schema does not forbid more.
-- --------------------------------------------------------------------------
create table hook_word_tags (
  id           uuid primary key default gen_random_uuid(),
  hook_id      uuid not null references hooks(id) on delete cascade,
  component_id uuid not null references components(id) on delete cascade,

  -- Which words in the hook are the Action Word, etc. Optional but it is what
  -- turns a tag into a worked example you can learn from later.
  span_text    text,

  created_at   timestamptz not null default now(),
  unique (hook_id, component_id)
);

create index hook_word_tags_component_idx on hook_word_tags (component_id);

-- --------------------------------------------------------------------------
-- scripts
-- --------------------------------------------------------------------------
create table scripts (
  id                 uuid primary key default gen_random_uuid(),
  video_id           uuid not null references videos(id) on delete cascade,
  name               text not null default 'Draft',   -- '30s cut', 'long form 12min'
  duration_target_sec int check (duration_target_sec > 0),
  format             text check (format in ('short','long')),

  -- The EDIT-SPEC-* prose: lighting, overlays, b-roll, SFX.
  edit_spec          text,

  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index scripts_video_idx on scripts (video_id);

-- --------------------------------------------------------------------------
-- script_beats — a script is beat-structured, never a blob.
-- --------------------------------------------------------------------------
create table script_beats (
  id                    uuid primary key default gen_random_uuid(),
  script_id             uuid not null references scripts(id) on delete cascade,
  sort_order            int not null default 0,

  t_start_sec           int check (t_start_sec >= 0),
  t_end_sec             int check (t_end_sec >= 0),

  -- Free text so you can write fast ("Payoff setup"), plus an optional link to
  -- a real component (SCR-05 beat labels, HACK-02 Re-hooking) for when you care
  -- enough to make it queryable. Write now, tag later.
  function_label        text,
  function_component_id uuid references components(id) on delete set null,

  text                  text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  constraint script_beats_time_order check (
    t_start_sec is null or t_end_sec is null or t_end_sec >= t_start_sec
  )
);

create index script_beats_script_idx    on script_beats (script_id, sort_order);
create index script_beats_component_idx on script_beats (function_component_id)
  where function_component_id is not null;

create trigger hooks_updated_at
  before update on hooks
  for each row execute function set_updated_at();

create trigger scripts_updated_at
  before update on scripts
  for each row execute function set_updated_at();

create trigger script_beats_updated_at
  before update on script_beats
  for each row execute function set_updated_at();
