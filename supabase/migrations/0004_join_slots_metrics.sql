-- 0004 — The join, the completeness model, and outcomes.
--
-- This migration is the reason the system exists. Everything before it is
-- bookkeeping; these three tables are what let you ask "which components show
-- up in the videos that performed".

-- --------------------------------------------------------------------------
-- video_components — the join
-- --------------------------------------------------------------------------
create table video_components (
  id             uuid primary key default gen_random_uuid(),
  video_id       uuid not null references videos(id) on delete cascade,
  component_id   uuid not null references components(id) on delete cascade,

  ---------------------------------------------------------------------------
  -- 'skipped' is a ROW, not an absence.
  --
  -- "I considered an open loop and chose not to use one" and "I never thought
  -- about open loops" are different facts. Only the first makes the sentence
  -- "videos without an open loop averaged 2k views" an honest one. Modelling
  -- skip as NULL would collapse the two and quietly poison the analysis.
  ---------------------------------------------------------------------------
  state          text not null default 'planned'
                   check (state in ('planned','used','skipped')),

  -- Your own example query — "my last 5 videos over 10k all used an open loop
  -- in the first 15 seconds" — is unanswerable without knowing WHERE the
  -- technique landed. Hence a placement, not just a boolean.
  placement_sec  int check (placement_sec >= 0),
  placement_note text,

  notes          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  unique (video_id, component_id)
);

create index video_components_component_idx on video_components (component_id, state);
create index video_components_video_idx     on video_components (video_id, state);

comment on table video_components is
  'The point of the system. state=skipped is recorded deliberately so absence is distinguishable from indifference.';

-- --------------------------------------------------------------------------
-- slots — the catalogue of things a video build can care about
-- --------------------------------------------------------------------------
create table slots (
  key                text primary key,        -- 'hook', 'packaging', 'retention'
  label              text not null,
  layer_id           text references layers(id) on update cascade,
  description        text,

  -- New videos preload this set. "Every question skippable, every answer set
  -- extensible" leaves the tool with no opinion, and a system with no opinion
  -- is a blank page you stop opening. This is the counterweight.
  in_default_template boolean not null default false,

  sort_order         int not null default 0,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- --------------------------------------------------------------------------
-- video_slots — the per-video completeness DENOMINATOR
--
-- The existence of a row means "this build cares about this slot". Completeness
-- is filled ÷ rows, so a deliberate three-piece build reads 3/3, not 3/47.
-- A denominator of "everything in the framework" would read 12/47 forever and
-- become wallpaper you stop seeing.
-- --------------------------------------------------------------------------
create table video_slots (
  id         uuid primary key default gen_random_uuid(),
  video_id   uuid not null references videos(id) on delete cascade,
  slot_key   text not null references slots(key) on update cascade on delete cascade,

  state      text not null default 'empty'
               check (state in ('empty','filled','skipped')),

  note       text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (video_id, slot_key)
);

create index video_slots_video_idx on video_slots (video_id);

-- --------------------------------------------------------------------------
-- video_metrics — outcomes as SNAPSHOTS, not a column
--
-- A single `views` column cannot answer "week one versus month three", and it
-- silently overwrites its own history on every update. The brief says outcome
-- data must not be an afterthought; a snapshot table is what that means.
-- --------------------------------------------------------------------------
create table video_metrics (
  id                    uuid primary key default gen_random_uuid(),
  video_id              uuid not null references videos(id) on delete cascade,
  measured_at           timestamptz not null default now(),

  views                 bigint check (views >= 0),
  likes                 bigint check (likes >= 0),
  comments              bigint check (comments >= 0),
  avg_view_duration_sec int    check (avg_view_duration_sec >= 0),
  retention_pct         numeric(5,2) check (retention_pct between 0 and 100),

  note                  text,
  created_at            timestamptz not null default now(),

  unique (video_id, measured_at)
);

create index video_metrics_latest_idx on video_metrics (video_id, measured_at desc);

create trigger video_components_updated_at
  before update on video_components
  for each row execute function set_updated_at();

create trigger slots_updated_at
  before update on slots
  for each row execute function set_updated_at();

create trigger video_slots_updated_at
  before update on video_slots
  for each row execute function set_updated_at();
