-- 0001 — Framework as data.
--
-- The whole premise of this system is that the content framework is editable
-- records, not hardcoded strings. That includes the *names of the layers*, so
-- `layers` is a table rather than an enum. Renaming "Hook Word" is a UPDATE.

create extension if not exists "pgcrypto";

-- --------------------------------------------------------------------------
-- layers — mirrors the §00 prefix table of the theory doc
-- --------------------------------------------------------------------------
create table layers (
  id          text primary key,           -- 'hook_word'
  label       text not null,              -- 'Hook Word'
  prefix      text not null,              -- 'HOOKW'
  description text,
  sort_order  int  not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table layers is
  'Editable taxonomy for components. Mirrors the prefix table in §00 of the theory doc.';

-- --------------------------------------------------------------------------
-- components — every element of the framework
-- --------------------------------------------------------------------------
create table components (
  id             uuid primary key default gen_random_uuid(),

  -- Stable ID from the theory doc ('HOOKW-03'). NULL for components the user
  -- creates. This is the seed's conflict target, which is what makes re-seeding
  -- safe after the user has renamed things.
  source_id      text unique,

  layer_id       text not null references layers(id) on update cascade,
  name           text not null,
  body           text,                    -- markdown; the full definition
  url            text,                    -- absorbs §11 linked resources

  -- The framework is genuinely nested: CHK-01a..d sit under CHK-01,
  -- HOOKW-01..06 under HOOK-02. A flat table would lose that.
  parent_id      uuid references components(id) on delete set null,

  sort_order     int  not null default 0,

  -- A user-created component is indistinguishable from a seeded one except
  -- for this flag (per the brief).
  is_seeded      boolean not null default false,

  -- CHK-04/05/06 and the 11 unnamed hacks exist in the source framework but
  -- were never transcribed. They are real rows so the UI can say "3 more
  -- checkpoints exist, not yet named" instead of pretending the model is whole.
  is_placeholder boolean not null default false,

  -- Archive rather than delete: a component referenced by a past video must
  -- not vanish from history.
  archived_at    timestamptz,

  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  constraint components_no_self_parent check (id <> parent_id)
);

create index components_layer_idx    on components (layer_id, sort_order);
create index components_parent_idx   on components (parent_id) where parent_id is not null;
create index components_active_idx   on components (layer_id) where archived_at is null;

comment on column components.source_id is
  'Stable ID from the theory doc (HOOKW-03, HACK-01). NULL for user-created components. Seed conflict target.';
comment on column components.is_placeholder is
  'Known to exist in the source framework but never named/transcribed. Shown in the UI as an open slot.';

-- --------------------------------------------------------------------------
-- updated_at maintenance
-- --------------------------------------------------------------------------
create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger layers_updated_at
  before update on layers
  for each row execute function set_updated_at();

create trigger components_updated_at
  before update on components
  for each row execute function set_updated_at();
