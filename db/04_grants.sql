-- 04_grants.sql — schema + function grants (single-role / Heroku model).
-- Idempotent (GRANT is naturally repeatable).
--
-- On Heroku there is no `authenticated`/`anon` role (the login role lacks
-- CREATEROLE). PostgREST connects as the app login role, which also OWNS the
-- five tables — so it already has full CRUD and USAGE on the schemas it owns.
-- We therefore do NOT grant table privileges here; row visibility is governed
-- entirely by RLS (05) via FORCE + TO PUBLIC policies.
--
-- We still grant EXECUTE on the SQL helper functions to PUBLIC so that policy
-- expressions resolve regardless of which member of PUBLIC evaluates them.
-- (app.* are SECURITY DEFINER and call auth.* transitively as owner; granting
-- the app.* set is sufficient, but we grant the auth.* readers too for safety
-- since policies may reference them directly.)

GRANT EXECUTE ON FUNCTION
  app.user_id(), app.current_email(), app.is_salesforce(), app.is_feedback_admin(),
  auth.jwt(), auth.user_id()
  TO PUBLIC;
