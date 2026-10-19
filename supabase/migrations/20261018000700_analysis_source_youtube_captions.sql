-- Allow a version whose only new content is a transcript fetched from YouTube's
-- own captions. Existing rows are untouched; this only widens the permitted
-- `source` values.

alter table public.video_analyses drop constraint if exists video_analyses_source_check;
alter table public.video_analyses
  add constraint video_analyses_source_check
  check (source in ('sandcastles_export', 'json', 'plain_text', 'manual', 'ai_gemini', 'youtube_captions'));
