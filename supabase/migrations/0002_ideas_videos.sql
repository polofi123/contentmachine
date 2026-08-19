-- 0002 — Ideas and videos.
--
-- One `videos` table holds both the videos you make and the outliers you study,
-- separated by `is_mine`. They carry the same seven Idea Legos, so "which of
-- their Legos do my winners share" is a WHERE clause, not a UNION — and the
-- seven fields are defined once and cannot drift apart.

-- --------------------------------------------------------------------------
-- videos — the central object
-- --------------------------------------------------------------------------
create table videos (
  id                   uuid primary key default gen_random_uuid(),
  title                text not null,
  is_mine              boolean not null default true,

  -- Production status. Meaningful for is_mine; left null for outliers.
  status               text check (status in (
                         'idea','scripting','shooting','editing','published','abandoned'
                       )),

  ---------------------------------------------------------------------------
  -- The seven Idea Legos (§01). Free prose, deliberately.
  --
  -- These describe WHAT A VIDEO DID, in your words, and they work equally well
  -- for someone else's video. They are NOT the same thing as `video_components`
  -- (which names a technique from the framework) or `hooks` (your candidate
  -- hook lines). Keeping the three straight is what stops this data rotting:
  --   legos            = prose description, works for other people's videos
  --   video_components = which named technique, structured and queryable
  --   hooks            = your actual candidate hook text
  ---------------------------------------------------------------------------
  lego_topic           text,   -- LEGO-01  What was the topic?
  lego_angle           text,   -- LEGO-02  What was their take / premise / angle?
  lego_hook            text,   -- LEGO-03  What was the hook and how was it executed?
  lego_story_structure text,   -- LEGO-04  How did they structure the story?
  lego_visual_format   text,   -- LEGO-05  What was the visual layout or format?
  lego_key_visuals     text,   -- LEGO-06  What were the key visuals they used?
  lego_audio           text,   -- LEGO-07  Did they use audio that worked especially well?

  ---------------------------------------------------------------------------
  -- Packaging fork (PKG-02).
  --
  -- Modelled as a column rather than a component link because it is a property
  -- OF the video, exactly one per video, and the workbench branches on it.
  -- video_components is many-to-many; this is one-to-one. Different shape,
  -- different mechanism.
  ---------------------------------------------------------------------------
  loop_type            text check (loop_type in ('desire','interest')),

  ---------------------------------------------------------------------------
  -- Platform / outlier fields. Shared between mine and theirs on purpose.
  ---------------------------------------------------------------------------
  platform             text check (platform in ('youtube','tiktok','instagram','other')),
  -- Costs nothing today; it is the hook for a read-only view fetch later,
  -- which is the difference between the performance loop living and dying.
  platform_video_id    text,
  url                  text,
  channel_name         text,
  channel_avg_views    bigint check (channel_avg_views >= 0),

  notes                text,
  published_at         timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index videos_mine_idx      on videos (is_mine, published_at desc nulls last);
create index videos_status_idx    on videos (status) where is_mine;
create index videos_loop_type_idx on videos (loop_type) where loop_type is not null;

comment on table videos is
  'Both my videos (is_mine) and outliers I study (not is_mine). Same seven Legos on each, so comparison is a WHERE not a UNION.';
comment on column videos.loop_type is
  'PKG-02 desire vs interest loop. A property of the video, one per video — hence a column, not a component link.';

-- --------------------------------------------------------------------------
-- ideas — the bank. Optimised for capture above all else.
-- --------------------------------------------------------------------------
create table ideas (
  id                uuid primary key default gen_random_uuid(),

  -- The ONLY required field. Logging an idea must never take more than one
  -- text input, or the tool does not get used.
  title             text not null,

  note              text,
  niche             text,
  format            text,
  status            text not null default 'captured'
                      check (status in ('captured','developing','promoted','dropped')),

  -- Single direction only. A mirrored videos.source_idea_id would be the same
  -- fact stored twice, and the two would drift.
  promoted_video_id uuid unique references videos(id) on delete set null,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  -- Promotion state and the promotion link have to agree with each other.
  constraint ideas_promoted_has_video check (
    (status = 'promoted') = (promoted_video_id is not null)
  )
);

create index ideas_status_idx  on ideas (status, created_at desc);
create index ideas_created_idx on ideas (created_at desc);

comment on column ideas.title is
  'The only NOT NULL field on this table. Fast capture is non-negotiable.';

create trigger videos_updated_at
  before update on videos
  for each row execute function set_updated_at();

create trigger ideas_updated_at
  before update on ideas
  for each row execute function set_updated_at();
