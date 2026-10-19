-- Follow-up to 20261019000100_component_mappings.sql, from its database review.
-- Additive: stricter checks and a better view/index. No data is rewritten.

-- A run against an analysis that is no longer current must not replace a run
-- against the current one (a slow run finishing after the user re-analysed and
-- re-mapped would otherwise demote the fresher result). Also: a missing or
-- non-array mapping list is an error, not a silently empty run.
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

-- Take the video id from the run, so a mapping can only ever be shown under the
-- video its run belongs to. Same columns in the same order, so this replaces the
-- view in place; and (video_id) now matches the one-current-run index.
create or replace view public.component_mappings_current as
select
  m.id, m.run_id, r.video_id, m.component_id, m.status, m.directness, m.confidence,
  m.explanation, m.definition_excerpt, m.uncertainty, m.evidence, m.search_text,
  m.start_sec, m.end_sec, m.origin, m.sort_order,
  r.analysis_id, r.model, r.transcript_origin, r.created_at as mapped_at
from public.component_mappings m
join public.component_mapping_runs r on r.id = m.run_id and r.is_current;

-- A join view cannot be written to; say so in its grants.
revoke all on public.component_mappings_current from service_role;
grant select on public.component_mappings_current to service_role;

-- History lookups and the cascade from videos.
create index if not exists component_mapping_runs_video_idx
  on public.component_mapping_runs(video_id, created_at desc);

-- Shapes the app always writes, now enforced.
alter table public.component_mappings
  drop constraint if exists component_mappings_span_check,
  drop constraint if exists component_mappings_evidence_array,
  drop constraint if exists component_mappings_uncertainty_array;
alter table public.component_mappings
  add constraint component_mappings_span_check check (end_sec is null or start_sec is null or end_sec >= start_sec),
  add constraint component_mappings_evidence_array check (jsonb_typeof(evidence) = 'array'),
  add constraint component_mappings_uncertainty_array check (jsonb_typeof(uncertainty) = 'array');
