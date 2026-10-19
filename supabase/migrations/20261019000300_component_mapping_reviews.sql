-- Human review of component mappings, and what a run needs recorded to be repeatable.
--
-- "Confirmed" now means a person confirmed it. What the machine decided is
-- `ai_status`: 'ai_supported' (its checks passed) or 'uncertain'. The AI's own
-- fields on a mapping (ai_status, confidence, explanation, evidence) are never
-- edited by a review: a review is a separate, append-only row, so the original
-- AI evidence and the whole decision history stay intact.

drop view if exists public.component_mappings_current;

alter table public.component_mappings drop constraint if exists component_mappings_status_check;
alter table public.component_mappings rename column status to ai_status;
-- Everything stored so far was decided by the machine alone; none of it was reviewed.
update public.component_mappings set ai_status = 'ai_supported' where ai_status = 'confirmed';
alter table public.component_mappings
  add constraint component_mappings_ai_status_check check (ai_status in ('ai_supported', 'uncertain'));

-- What a run was made from, so repeated runs can be compared like with like.
alter table public.component_mapping_runs
  add column if not exists input_hash text,       -- the transcript, notes and structure that were read
  add column if not exists library_hash text,     -- the library entries offered to the model
  add column if not exists prompt_version text,
  add column if not exists settings jsonb;

create table if not exists public.component_mapping_reviews (
  id uuid primary key default gen_random_uuid(),
  mapping_id uuid not null references public.component_mappings(id) on delete cascade,
  -- 'cleared' withdraws an earlier decision; the earlier rows stay.
  decision text not null check (decision in ('confirmed', 'rejected', 'cleared')),
  -- What the reviewer checked. A mapping resting only on AI-described pictures, or on a
  -- transcript an AI wrote, can be confirmed only after watching the video.
  basis text check (basis in ('read_quote', 'watched_video')),
  note text check (char_length(note) <= 1000),
  created_at timestamptz not null default now(),
  check (decision <> 'confirmed' or basis is not null)
);
create index if not exists component_mapping_reviews_mapping_idx
  on public.component_mapping_reviews(mapping_id, created_at desc);

-- Append-only: a review is history. (Rows still go when their mapping, run or video is deleted.)
create or replace function public.component_mapping_reviews_no_update() returns trigger
language plpgsql as $$
begin
  raise exception 'component_mapping_reviews rows are history and cannot be changed';
end;
$$;
drop trigger if exists component_mapping_reviews_no_update on public.component_mapping_reviews;
create trigger component_mapping_reviews_no_update
  before update on public.component_mapping_reviews
  for each row execute function public.component_mapping_reviews_no_update();

-- The current run of each video, with the latest human decision on each mapping.
create view public.component_mappings_current as
select
  m.id, m.run_id, r.video_id, m.component_id, m.ai_status, m.directness, m.confidence,
  m.explanation, m.definition_excerpt, m.uncertainty, m.evidence, m.search_text,
  m.start_sec, m.end_sec, m.origin, m.sort_order,
  r.analysis_id, r.model, r.transcript_origin, r.created_at as mapped_at,
  case when rv.decision = 'cleared' then null else rv.decision end as review_decision,
  case when rv.decision = 'cleared' then null else rv.basis end as review_basis,
  case when rv.decision = 'cleared' then null else rv.note end as review_note,
  case when rv.decision = 'cleared' then null else rv.created_at end as reviewed_at
from public.component_mappings m
join public.component_mapping_runs r on r.id = m.run_id and r.is_current
left join lateral (
  select decision, basis, note, created_at
  from public.component_mapping_reviews
  where mapping_id = m.id
  order by created_at desc, id desc
  limit 1
) rv on true;

comment on view public.component_mappings_current is
  'Mappings from the current run of each video, with the latest human decision (null = unreviewed).';

drop function if exists public.save_component_mapping_run(uuid, uuid, text, text, integer, integer, jsonb, jsonb);

create or replace function public.save_component_mapping_run(
  p_video_id uuid,
  p_analysis_id uuid,
  p_model text,
  p_transcript_origin text,
  p_library_total integer,
  p_library_candidates integer,
  p_input_hash text,
  p_library_hash text,
  p_prompt_version text,
  p_settings jsonb,
  p_trace jsonb,
  p_mappings jsonb
) returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_run uuid;
begin
  if jsonb_typeof(p_mappings) is distinct from 'array' then
    raise exception 'p_mappings must be a JSON array';
  end if;

  perform 1 from public.videos where id = p_video_id for update;
  if not found then
    raise exception 'video % not found', p_video_id;
  end if;
  perform 1 from public.video_analyses where id = p_analysis_id and video_id = p_video_id and is_current;
  if not found then
    raise exception 'analysis % is not the current analysis of video %', p_analysis_id, p_video_id;
  end if;

  update public.component_mapping_runs set is_current = false
    where video_id = p_video_id and is_current;

  insert into public.component_mapping_runs
    (video_id, analysis_id, model, transcript_origin, library_total, library_candidates,
     input_hash, library_hash, prompt_version, settings, trace)
  values
    (p_video_id, p_analysis_id, p_model, p_transcript_origin, p_library_total, p_library_candidates,
     p_input_hash, p_library_hash, p_prompt_version, p_settings, p_trace)
  returning id into v_run;

  insert into public.component_mappings
    (run_id, video_id, component_id, ai_status, directness, confidence, explanation,
     definition_excerpt, uncertainty, evidence, search_text, start_sec, end_sec, origin, sort_order)
  select
    v_run, p_video_id, x.component_id, x.ai_status, x.directness, x.confidence, x.explanation,
    x.definition_excerpt, coalesce(x.uncertainty, '[]'::jsonb), x.evidence,
    coalesce(x.search_text, ''), x.start_sec, x.end_sec, coalesce(x.origin, 'observed'), coalesce(x.sort_order, 0)
  from jsonb_to_recordset(p_mappings) as x(
    component_id uuid, ai_status text, directness text, confidence numeric, explanation text,
    definition_excerpt text, uncertainty jsonb, evidence jsonb, search_text text,
    start_sec numeric, end_sec numeric, origin text, sort_order integer
  );

  return v_run;
end;
$$;

revoke all on public.component_mapping_reviews, public.component_mappings_current from anon, authenticated;
grant all privileges on public.component_mapping_reviews to service_role;
revoke all on public.component_mappings_current from service_role;
grant select on public.component_mappings_current to service_role;
revoke all on function public.save_component_mapping_run(uuid, uuid, text, text, integer, integer, text, text, text, jsonb, jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function public.save_component_mapping_run(uuid, uuid, text, text, integer, integer, text, text, text, jsonb, jsonb, jsonb)
  to service_role;
revoke all on function public.component_mapping_reviews_no_update() from public, anon, authenticated;
