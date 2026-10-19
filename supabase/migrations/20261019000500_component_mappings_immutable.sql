-- What the AI recorded on a mapping is never edited by the app: a review is a separate row.
-- Enforce that with privileges instead of convention. The save function only INSERTs
-- mappings, and cascades from videos/runs run as the table owner, so neither is affected.
revoke update, delete, truncate on public.component_mappings from service_role;
