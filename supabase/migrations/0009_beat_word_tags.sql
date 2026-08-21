-- 0009 — Word-level tagging inside a script line.
--
-- HOOK-02 breaks a hook into six jobs — Subject Clarity, Action, Objective,
-- Contrast, Time, Proof — and the point of the system is being able to look at
-- a line and see whether the words are actually doing those jobs. Until now the
-- app could say "this video used a hook" but never "these three words are the
-- hook, and it has no Contrast word".
--
-- hook_word_tags has carried a span_text column for exactly this since 0003 and
-- was never wired up. That table stays for hooks; this one is its equivalent for
-- the lines of a script, which is where the writing actually happens now.

create table script_beat_tags (
  id           uuid primary key default gen_random_uuid(),
  beat_id      uuid not null references script_beats(id) on delete cascade,

  -- Deliberately unconstrained on layer. The six hook words are what this is
  -- for today, but naming a new word type is just creating a component, and the
  -- schema should not be the thing that forbids it.
  component_id uuid not null references components(id) on delete cascade,

  ---------------------------------------------------------------------------
  -- Where the words are, and what they were.
  --
  -- Offsets alone rot: edit four characters earlier in the line and every span
  -- after it points at the wrong words, silently. Keeping the tagged text means
  -- a stale offset can be re-found by searching, and a tag whose words are gone
  -- can be recognised as gone instead of quietly mislabelling whatever moved
  -- into its place.
  ---------------------------------------------------------------------------
  span_start   int  not null check (span_start >= 0),
  span_end     int  not null,
  span_text    text not null,

  created_at   timestamptz not null default now(),

  constraint script_beat_tags_span_order check (span_end > span_start)
);

create index script_beat_tags_beat_idx      on script_beat_tags (beat_id);
create index script_beat_tags_component_idx on script_beat_tags (component_id);

comment on table script_beat_tags is
  'Which words in a line do which job. span_text is the recovery key when offsets drift after an edit.';
