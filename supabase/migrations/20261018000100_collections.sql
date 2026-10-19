-- Personal, manually curated video reference collections.
-- Saved references remain in public.videos (is_mine = false).
-- Removing a collection/membership never deletes a video or its analysis.

create table if not exists public.collections (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 100),
  description text not null default '',
  category text not null default 'other'
    check (category in ('format', 'visual_hook', 'editing_style', 'signature_series', 'other')),
  created_at timestamptz not null default now()
);

create table if not exists public.collection_videos (
  collection_id uuid not null references public.collections(id) on delete cascade,
  video_id uuid not null references public.videos(id) on delete cascade,
  note text not null default '',
  added_at timestamptz not null default now(),
  primary key (collection_id, video_id)
);

create index if not exists collection_videos_video_id_idx
  on public.collection_videos(video_id);
create index if not exists collection_videos_added_at_idx
  on public.collection_videos(collection_id, added_at desc);
