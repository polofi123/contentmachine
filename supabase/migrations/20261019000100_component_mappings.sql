-- Phase 3 proof of concept: which library components an analysed reference video
-- actually uses, with the evidence for each.
--
-- Additive only: two new tables, one view and one function. Nothing existing is
-- altered. A mapping points at an existing `components` row; it cannot name a
-- component the library does not have.
--
-- A run belongs to one exact saved analysis (`analysis_id`), so a mapping can
-- always be traced to the transcript it was checked against, and the page can say
-- when the analysis has moved on since. Re-mapping makes a new run and demotes
-- the old one (history is kept), the same shape as video_analyses.

create table if not exists public.component_mapping_runs (
  id uuid primary key default gen_random_uuid(),
  video_id uuid not null references public.videos(id) on delete cascade,
  analysis_id uuid not null references public.video_analyses(id) on delete cascade,
  is_current boolean not null default true,
  model text not null,
  -- Where the mapped transcript came from (pasted, youtube_auto, ai …), so the
  -- trustworthiness of the quotes is never a guess.
  transcript_origin text,
  library_total integer,
  library_candidates integer,
  -- What was left unmatched and why, for judging the matcher rather than the video.
  trace jsonb,
  created_at timestamptz not null default now()
);

create unique index if not exists component_mapping_runs_one_current_idx
  on public.component_mapping_runs(video_id) where is_current;
create index if not exists component_mapping_runs_analysis_idx
  on public.component_mapping_runs(analysis_id);

create table if not exists public.component_mappings (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.component_mapping_runs(id) on delete cascade,
  -- Denormalised from the run so "every video that does X" is one indexed read.
  video_id uuid not null references public.videos(id) on delete cascade,
  component_id uuid not null references public.components(id) on delete cascade,
  -- Decided in code from what was verified, never taken from the model alone.
  status text not null check (status in ('confirmed', 'uncertain')),
  directness text not null check (directness in ('explicit', 'implied')),
  confidence numeric(3, 2) check (confidence >= 0 and confidence <= 1),
  explanation text not null,
  -- Verbatim from the component's definition at match time; null when the
  -- library gives the component only a name.
  definition_excerpt text,
  -- Why a mapping is not confirmed, and anything the model said it could not verify.
  uncertainty jsonb not null default '[]'::jsonb,
  -- [{type: 'transcript'|'visual_note', quote, startSec, endSec, field?}]
  evidence jsonb not null,
  -- Quotes and explanation as plain text, for searching across videos.
  search_text text not null default '',
  start_sec numeric(8, 2) check (start_sec >= 0),
  end_sec numeric(8, 2) check (end_sec >= 0),
  origin text not null default 'observed' check (origin in ('observed', 'anchor')),
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists component_mappings_component_idx
  on public.component_mappings(component_id, status);
create index if not exists component_mappings_video_idx on public.component_mappings(video_id);
create index if not exists component_mappings_run_idx on public.component_mappings(run_id, sort_order);

-- What the research page and any cross-video search read: only the current run of each video.
create or replace view public.component_mappings_current as
select
  m.id, m.run_id, m.video_id, m.component_id, m.status, m.directness, m.confidence,
  m.explanation, m.definition_excerpt, m.uncertainty, m.evidence, m.search_text,
  m.start_sec, m.end_sec, m.origin, m.sort_order,
  r.analysis_id, r.model, r.transcript_origin, r.created_at as mapped_at
from public.component_mappings m
join public.component_mapping_runs r on r.id = m.run_id and r.is_current;

comment on view public.component_mappings_current is
  'Mappings from the current run of each video. Search across videos by component_id, status or search_text.';

-- Saving a run is one transaction: demote the previous run, insert the new one
-- and its mappings. A failure or a double click can never leave a video with no
-- current run or two.
create or replace function public.save_component_mapping_run(
  p_video_id uuid,
  p_analysis_id uuid,
  p_model text,
  p_transcript_origin text,
  p_library_total integer,
  p_library_candidates integer,
  p_trace jsonb,
  p_mappings jsonb
) returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_run uuid;
begin
  perform 1 from public.videos where id = p_video_id for update;
  if not found then
    raise exception 'video % not found', p_video_id;
  end if;
  perform 1 from public.video_analyses where id = p_analysis_id and video_id = p_video_id;
  if not found then
    raise exception 'analysis % does not belong to video %', p_analysis_id, p_video_id;
  end if;

  update public.component_mapping_runs set is_current = false
    where video_id = p_video_id and is_current;

  insert into public.component_mapping_runs
    (video_id, analysis_id, model, transcript_origin, library_total, library_candidates, trace)
  values
    (p_video_id, p_analysis_id, p_model, p_transcript_origin, p_library_total, p_library_candidates, p_trace)
  returning id into v_run;

  insert into public.component_mappings
    (run_id, video_id, component_id, status, directness, confidence, explanation,
     definition_excerpt, uncertainty, evidence, search_text, start_sec, end_sec, origin, sort_order)
  select
    v_run, p_video_id, x.component_id, x.status, x.directness, x.confidence, x.explanation,
    x.definition_excerpt, coalesce(x.uncertainty, '[]'::jsonb), x.evidence,
    coalesce(x.search_text, ''), x.start_sec, x.end_sec, coalesce(x.origin, 'observed'), coalesce(x.sort_order, 0)
  from jsonb_to_recordset(p_mappings) as x(
    component_id uuid, status text, directness text, confidence numeric, explanation text,
    definition_excerpt text, uncertainty jsonb, evidence jsonb, search_text text,
    start_sec numeric, end_sec numeric, origin text, sort_order integer
  );

  return v_run;
end;
$$;

revoke all on public.component_mapping_runs, public.component_mappings, public.component_mappings_current
  from anon, authenticated;
grant all privileges on public.component_mapping_runs, public.component_mappings,
  public.component_mappings_current to service_role;
revoke all on function public.save_component_mapping_run(uuid, uuid, text, text, integer, integer, jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function public.save_component_mapping_run(uuid, uuid, text, text, integer, integer, jsonb, jsonb)
  to service_role;
