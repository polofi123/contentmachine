-- 0006 — Role grants for PostgREST.
--
-- Tables created by CLI migrations are not covered by Supabase's default
-- privileges, so the API roles start with no access at all.
--
-- Grants go to `service_role` ONLY, deliberately. The app talks to the database
-- server-side with the service key; `anon` gets nothing. That means if this is
-- ever deployed, a leaked or public anon key reads nothing — the database is
-- closed by default rather than open by default.
--
-- If a browser-side client is ever needed, that is the moment to turn RLS on
-- and write real policies, not the moment to widen this grant.

grant usage on schema public to service_role;

grant all privileges on all tables    in schema public to service_role;
grant all privileges on all sequences in schema public to service_role;
grant all privileges on all functions in schema public to service_role;

-- Anything added by a later migration inherits the same grants.
alter default privileges in schema public
  grant all privileges on tables to service_role;
alter default privileges in schema public
  grant all privileges on sequences to service_role;
alter default privileges in schema public
  grant all privileges on functions to service_role;

-- Explicitly revoke from the public-facing roles so the intent is recorded in
-- the schema rather than merely implied by their absence.
revoke all on all tables in schema public from anon, authenticated;
