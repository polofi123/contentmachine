-- One video row per (platform, platform_video_id).
--
-- Collection imports check for an existing row and insert afterwards; with two
-- imports running at once both could pass the check and both insert. The unique
-- index makes the database the arbiter. NULLs are distinct in a unique index,
-- so videos logged by hand with no platform id are unaffected.
--
-- Refuses to run, with the offending pairs listed, rather than touching rows if
-- duplicates already exist. Nothing is deleted or merged here.

do $$
declare
  dupes text;
begin
  select string_agg(platform || ':' || platform_video_id || ' x' || n, ', ')
    into dupes
    from (
      select platform, platform_video_id, count(*) n
        from public.videos
       where platform is not null and platform_video_id is not null
       group by 1, 2 having count(*) > 1
    ) d;
  if dupes is not null then
    raise exception 'Duplicate (platform, platform_video_id) rows exist; resolve before applying: %', dupes;
  end if;
end $$;

create unique index if not exists videos_platform_video_id_key
  on public.videos (platform, platform_video_id);
