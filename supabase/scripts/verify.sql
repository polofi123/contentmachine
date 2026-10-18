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

\echo ''
\echo '=== 12. Story engine — vocabulary seeded ==='
select case
         when (select count(*) from components where layer_id = 'tension') = 11
          and (select count(*) from components where layer_id = 'lens')    = 6
          and (select count(*) from components where layer_id = 'story')   = 21
         then 'PASS'
         else 'FAIL — tension ' || (select count(*) from components where layer_id = 'tension')
              || ', lens '       || (select count(*) from components where layer_id = 'lens')
              || ', story '      || (select count(*) from components where layer_id = 'story')
       end;

\echo ''
\echo '=== 13. Story overlay — roles carried over from the old labels ==='
\echo 'Deliberately partial: technique-ish labels (Pattern interrupt, Value stack)'
\echo 'stay NULL, because they name a technique rather than a job in the arc.'
select coalesce(story_role, '(none)') as story_role, count(*)
from script_beats
where function_label is not null
group by 1 order by 2 desc;

\echo ''
\echo '=== 14. Placement — a technique can sit on several lines of one video ==='
\echo 'The thing video_components.anchor_beat_id could never express.'
select c.name, count(distinct sbc.script_beat_id) as lines_used
from script_beat_components sbc
join components c on c.id = sbc.component_id
group by c.name
having count(distinct sbc.script_beat_id) > 1
order by 2 desc;

\echo ''
\echo '=== 15. Placement agrees with the analytical state ==='
\echo 'Every placed technique must have a video_components row. A placement the'
\echo 'analysis cannot see is the one failure mode this join could introduce.'
select case when count(*) = 0 then 'PASS'
            else 'FAIL — ' || count(*) || ' placement(s) with no video_components row' end
from script_beat_components sbc
join script_beats b on b.id = sbc.script_beat_id
join scripts s      on s.id = b.script_id
left join video_components vc
       on vc.video_id = s.video_id and vc.component_id = sbc.component_id
where vc.id is null;

\echo ''
\echo '=== 16. At most one chosen lens per video ==='
select case when count(*) = 0 then 'PASS'
            else 'FAIL — ' || count(*) || ' video(s) with more than one' end
from (
  select video_id from story_lenses where is_selected
  group by video_id having count(*) > 1
) x;
