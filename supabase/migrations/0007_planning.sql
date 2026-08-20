-- 0007 — Planning a month of posting.
--
-- The goal this serves is "post daily through the month" without the month
-- quietly becoming all one kind of video. So the plan tracks two things at
-- once: how many posts, and what mix.
--
-- Deliberately NOT a new taxonomy. `pillar` is a plain text label you type
-- ("guitar", "yapping", "ideas") rather than another table to curate. It can
-- graduate into components later if it earns it; until then, typing is faster
-- than administering.

alter table videos
  add column planned_publish_at date,
  -- Your bucket for this video. Free text on purpose: it is your label, not
  -- framework content, and the framework-is-data rule does not apply to it.
  add column pillar text;

create index videos_planned_idx on videos (planned_publish_at)
  where planned_publish_at is not null;
create index videos_pillar_idx on videos (pillar) where pillar is not null;

comment on column videos.pillar is
  'Free-text bucket (guitar / yapping / ideas). Not a taxonomy table — typing beats administering.';

-- --------------------------------------------------------------------------
-- plan_goals — how much you intend to post in a given month.
-- --------------------------------------------------------------------------
create table plan_goals (
  month        date primary key,          -- always the 1st of the month
  target_posts int  not null default 30 check (target_posts >= 0),
  note         text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  constraint plan_goals_is_first_of_month check (extract(day from month) = 1)
);

-- --------------------------------------------------------------------------
-- plan_pillar_targets — the mix.
--
-- Without this, "post daily" is satisfied by thirty of the easiest thing to
-- make. The target count per pillar is what stops the month collapsing into
-- whichever bucket has the lowest effort.
-- --------------------------------------------------------------------------
create table plan_pillar_targets (
  month        date not null,
  pillar       text not null,
  target_count int  not null default 0 check (target_count >= 0),
  created_at   timestamptz not null default now(),

  primary key (month, pillar),
  foreign key (month) references plan_goals(month) on delete cascade
);

-- --------------------------------------------------------------------------
-- plan_month — planned vs. published vs. target, per month.
-- --------------------------------------------------------------------------
create view plan_month as
with scheduled as (
  select
    date_trunc('month', planned_publish_at)::date as month,
    count(*)                                       as planned,
    count(*) filter (where status = 'published')   as published,
    count(*) filter (where status <> 'published')  as pending
  from videos
  where is_mine and planned_publish_at is not null
  group by 1
)
select
  coalesce(g.month, s.month)                       as month,
  g.target_posts,
  coalesce(s.planned, 0)                           as planned,
  coalesce(s.published, 0)                         as published,
  coalesce(s.pending, 0)                           as pending,
  greatest(coalesce(g.target_posts, 0) - coalesce(s.planned, 0), 0) as unfilled
from plan_goals g
full outer join scheduled s on s.month = g.month;

-- --------------------------------------------------------------------------
-- plan_pillar_mix — target vs. actual per bucket, so drift is visible early.
-- --------------------------------------------------------------------------
create view plan_pillar_mix as
with scheduled as (
  select
    date_trunc('month', planned_publish_at)::date as month,
    coalesce(pillar, 'unassigned')                as pillar,
    count(*)                                      as scheduled,
    count(*) filter (where status = 'published')  as published
  from videos
  where is_mine and planned_publish_at is not null
  group by 1, 2
)
select
  coalesce(t.month, s.month)   as month,
  coalesce(t.pillar, s.pillar) as pillar,
  coalesce(t.target_count, 0)  as target_count,
  coalesce(s.scheduled, 0)     as scheduled,
  coalesce(s.published, 0)     as published
from plan_pillar_targets t
full outer join scheduled s on s.month = t.month and s.pillar = t.pillar;

create trigger plan_goals_updated_at
  before update on plan_goals
  for each row execute function set_updated_at();

grant all privileges on plan_goals, plan_pillar_targets to service_role;
grant select on plan_month, plan_pillar_mix to service_role;
