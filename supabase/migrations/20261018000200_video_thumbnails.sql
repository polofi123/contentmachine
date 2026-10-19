-- A still for each video, so a collection reads as a wall of references rather
-- than a list of captions. A local path (/thumbnails/…) or a platform URL;
-- null when there is none, and the UI shows the caption instead.
alter table public.videos add column if not exists thumbnail_url text;
