-- 0005 — Derived views.
--
-- Outlier score and completeness are computed, never stored. Storing them means
-- keeping them in sync with the rows they summarise, which is a bug waiting to
-- happen the first time you log a new metrics snapshot.

-- --------------------------------------------------------------------------
-- Latest metrics snapshot per video.
-- --------------------------------------------------------------------------
create view video_latest_metrics as
select distinct on (m.video_id)
  m.video_id,
  m.measured_at,
  m.views,
  m.likes,
  m.comments,
  m.avg_view_duration_sec,
  m.retention_pct
from video_metrics m
order by m.video_id, m.measured_at desc;

-- --------------------------------------------------------------------------
-- video_stats — a video with its current numbers and outlier score.
--
-- MINE-02: outlier_score = views of one video ÷ average views of that channel.
-- It moves as views accumulate, which is exactly why it is derived from the
-- latest snapshot rather than frozen into a column.
-- --------------------------------------------------------------------------
create view video_stats as
select
  v.*,
  lm.views        as latest_views,
  lm.measured_at  as latest_measured_at,
  lm.retention_pct,
  round(lm.views::numeric / nullif(v.channel_avg_views, 0), 2) as outlier_score,
  (select count(*) from video_metrics m where m.video_id = v.id) as metric_snapshots
from videos v
left join video_latest_metrics lm on lm.video_id = v.id;

comment on view video_stats is
  'Videos with current views and derived outlier score (MINE-02). Score is recomputed from the latest snapshot, never stored.';

-- --------------------------------------------------------------------------
-- video_completeness — filled ÷ the slots THIS video opted into.
--
-- Never a gate. The UI reads this to show "4/8 and here is what you left on
-- the table", and then lets you ship anyway.
-- --------------------------------------------------------------------------
create view video_completeness as
select
  v.id as video_id,
  count(vs.*)                                             as total_slots,
  count(vs.*) filter (where vs.state = 'filled')          as filled_slots,
  count(vs.*) filter (where vs.state = 'skipped')         as skipped_slots,
  count(vs.*) filter (where vs.state = 'empty')           as empty_slots,
  case
    when count(vs.*) = 0 then null
    else round(
      100.0 * count(vs.*) filter (where vs.state = 'filled') / count(vs.*)
    )
  end                                                     as pct_filled
from videos v
left join video_slots vs on vs.video_id = v.id
group by v.id;

-- --------------------------------------------------------------------------
-- component_performance — the query that justifies the whole schema.
--
-- Deliberately returns raw counts and averages, NOT a correlation coefficient.
-- At n=5 a correlation is a coin flip you would nonetheless believe. The UI is
-- responsible for showing `videos_used` next to every row so the sample size is
-- impossible to miss.
-- --------------------------------------------------------------------------
create view component_performance as
select
  c.id                as component_id,
  c.source_id,
  c.name,
  c.layer_id,
  count(*) filter (where vc.state = 'used')                    as videos_used,
  count(*) filter (where vc.state = 'skipped')                 as videos_skipped,
  round(avg(lm.views) filter (where vc.state = 'used'))        as avg_views_when_used,
  round(avg(lm.views) filter (where vc.state = 'skipped'))     as avg_views_when_skipped,
  max(lm.views) filter (where vc.state = 'used')               as best_views_when_used
from components c
join video_components vc      on vc.component_id = c.id
join videos v                 on v.id = vc.video_id and v.is_mine
left join video_latest_metrics lm on lm.video_id = v.id
group by c.id, c.source_id, c.name, c.layer_id;

comment on view component_performance is
  'Raw comparison, not a correlation. videos_used is the sample size and must be shown alongside every average.';
