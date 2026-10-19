-- Follow-up to 20261019000300_component_mapping_reviews.sql, from its database review.

-- 1. Append-only for real. The trigger only stopped UPDATE; the app's role could still
--    DELETE or TRUNCATE the history, or set created_at to pin an old decision as "latest".
--    Privileges close that. (A delete trigger would also fire on the intended cascade from
--    video -> run -> mapping -> review, so it is not used: cascades run as the table owner and are
--    unaffected by what service_role may do.)
revoke all on public.component_mapping_reviews from service_role;
grant select on public.component_mapping_reviews to service_role;
grant insert (mapping_id, decision, basis, note) on public.component_mapping_reviews to service_role;

-- 2. "Latest review wins" by insertion order, not by timestamp (equal timestamps would
--    be broken by a random uuid) and not by a client-supplied time.
alter table public.component_mapping_reviews add column if not exists seq bigint generated always as identity;
drop index if exists public.component_mapping_reviews_mapping_idx;
create index if not exists component_mapping_reviews_mapping_seq_idx
  on public.component_mapping_reviews(mapping_id, seq desc);

create or replace view public.component_mappings_current as
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
  order by seq desc
  limit 1
) rv on true;

-- 3. A basis only means something on a confirmation.
alter table public.component_mapping_reviews drop constraint if exists component_mapping_reviews_basis_only_confirmed;
alter table public.component_mapping_reviews
  add constraint component_mapping_reviews_basis_only_confirmed check (decision = 'confirmed' or basis is null);
