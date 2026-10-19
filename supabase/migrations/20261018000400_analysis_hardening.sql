-- Follow-up to the collections / video_analyses migrations.
--
-- 1. Match 0006's intent: API roles other than service_role get nothing on the
--    new tables (they only held TRUNCATE/REFERENCES/TRIGGER by default).
-- 2. Saving an analysis is one transaction. The previous read-max / demote /
--    insert sequence in app code could interleave on a double submit.
--    Existing rows and history are untouched.

revoke all on public.collections, public.collection_videos, public.video_analyses
  from anon, authenticated;

create or replace function public.save_video_analysis(
  p_video_id uuid,
  p_source text,
  p_source_label text,
  p_analysis jsonb,
  p_raw text,
  p_warnings jsonb
) returns integer
language plpgsql
set search_path = public
as $$
declare
  v_version integer;
begin
  -- Serialises concurrent saves for the same video.
  perform 1 from public.videos where id = p_video_id for update;
  if not found then
    raise exception 'video % not found', p_video_id;
  end if;

  select coalesce(max(version), 0) + 1 into v_version
    from public.video_analyses where video_id = p_video_id;

  update public.video_analyses set is_current = false
    where video_id = p_video_id and is_current;

  insert into public.video_analyses
    (video_id, version, is_current, source, source_label, analysis, raw_input, parse_warnings)
  values
    (p_video_id, v_version, true, p_source, p_source_label, p_analysis, p_raw, p_warnings);

  return v_version;
end;
$$;

revoke all on function public.save_video_analysis(uuid, text, text, jsonb, text, jsonb) from public, anon, authenticated;
grant execute on function public.save_video_analysis(uuid, text, text, jsonb, text, jsonb) to service_role;
