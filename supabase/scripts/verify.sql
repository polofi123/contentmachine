-- Verification for the schema + seed. Run with:
--   pnpm exec supabase db reset
--   docker exec -i supabase_db_content-system psql -U postgres -d postgres \
--     -f - < supabase/scripts/verify.sql
--
-- Every check prints PASS or FAIL. Nothing here mutates data.

\echo '=== 1. Seed counts by layer ==='
select l.sort_order, l.id as layer, l.prefix, count(c.*) as components
from layers l left join components c on c.layer_id = l.id
group by l.sort_order, l.id, l.prefix
order by l.sort_order;

\echo ''
\echo '=== 2. Placeholders (expect 14: CHK-04/05/06 + HACK-08..18) ==='
select case when count(*) = 14 then 'PASS' else 'FAIL — got ' || count(*) end as result
from components where is_placeholder;

select source_id, name from components where is_placeholder order by source_id;

\echo ''
\echo '=== 3. Every seeded component has a source_id, and none are duplicated ==='
select case when count(*) = 0 then 'PASS' else 'FAIL — ' || count(*) || ' seeded rows without source_id' end
from components where is_seeded and source_id is null;

select case when count(*) = 0 then 'PASS' else 'FAIL — duplicate source_ids' end
from (select source_id from components group by source_id having count(*) > 1) d;

\echo ''
\echo '=== 4. No orphaned parent_id ==='
select case when count(*) = 0 then 'PASS' else 'FAIL — ' || count(*) || ' orphans' end
from components c
where c.parent_id is not null
  and not exists (select 1 from components p where p.id = c.parent_id);

\echo ''
\echo '=== 5. Nesting resolved correctly ==='
select p.source_id as parent, count(c.*) as children
from components p join components c on c.parent_id = p.id
group by p.source_id order by p.source_id;
-- expect: CHK-01 -> 4, CHK-02 -> 1, CHK-03 -> 2, HOOK-02 -> 6

\echo ''
\echo '=== 6. Outlier score reproduces the 37x logged in THUMB-05 ==='
select title, latest_views, channel_avg_views, outlier_score,
       case when round(outlier_score) = 37 then 'PASS' else 'FAIL' end as result
from video_stats where not is_mine;

\echo ''
\echo '=== 7. Completeness view — purpose video should be 0/8 filled ==='
select v.title, c.filled_slots, c.total_slots, c.pct_filled
from video_completeness c join videos v on v.id = c.video_id
where c.total_slots > 0;

\echo ''
\echo '=== 8. Scripts and beats ==='
select v.title, s.name, s.format, s.duration_target_sec, count(b.*) as beats
from scripts s
join videos v on v.id = s.video_id
left join script_beats b on b.script_id = s.id
group by v.title, s.name, s.format, s.duration_target_sec
order by v.title, s.name;

\echo ''
\echo '=== 9. Idea bank ==='
select niche, count(*) from ideas group by niche order by count(*) desc;

\echo ''
\echo '=== 10. Hook bank (expect 10 free-floating) ==='
select case when count(*) = 10 then 'PASS' else 'FAIL — got ' || count(*) end
from hooks where video_id is null;

\echo ''
\echo '=== 11. THE QUERY THAT JUSTIFIES THE SCHEMA ==='
\echo 'Returns 0 rows on fresh seed (nothing published yet) — it must PARSE and RUN.'
select c.name, c.source_id,
       count(*) filter (where vc.state = 'used')    as videos_used,
       count(*) filter (where vc.state = 'skipped') as videos_skipped,
       round(avg(lm.views) filter (where vc.state = 'used')) as avg_views_when_used
from components c
join video_components vc on vc.component_id = c.id
join videos v on v.id = vc.video_id and v.is_mine
left join video_latest_metrics lm on lm.video_id = v.id
where lm.views > 10000
group by c.name, c.source_id
order by videos_used desc;
