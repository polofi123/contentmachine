-- One reusable, versioned analysis per video. Collections only reference
-- public.videos, so every collection a video belongs to sees the same current
-- analysis. Re-analysis inserts a new version; the old one stays for history.
--
-- `analysis` is the normalized structure (see src/lib/video-analysis.ts);
-- `raw_input` is exactly what was pasted, kept so nothing is lost to parsing.

create table if not exists public.video_analyses (
  id uuid primary key default gen_random_uuid(),
  video_id uuid not null references public.videos(id) on delete cascade,
  version integer not null default 1 check (version >= 1),
  is_current boolean not null default true,
  source text not null check (source in ('sandcastles_export', 'json', 'plain_text', 'manual')),
  source_label text not null default '',
  analysis jsonb not null default '{}'::jsonb,
  raw_input text not null default '',
  parse_warnings jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (video_id, version)
);

create unique index if not exists video_analyses_one_current_idx
  on public.video_analyses(video_id) where is_current;

grant all privileges on public.video_analyses to service_role;
