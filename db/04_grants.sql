-- 04_grants.sql — schema + table grants.
-- Idempotent (GRANT is naturally repeatable).
--
-- Copied from live Neon: `authenticated` gets USAGE on app + public and full
-- CRUD on the five tables; RLS (05) then constrains WHICH rows. `anon` gets
-- NOTHING, so unauthenticated requests can touch no table.
--
-- `authenticated` needs USAGE+SELECT on the SQL helper functions it calls
-- (they are SECURITY DEFINER, but EXECUTE is still required). auth.* helpers
-- are called transitively via app.* (SECURITY DEFINER runs as owner), so
-- granting EXECUTE on the app.* set is sufficient; we also grant the auth.*
-- readers for safety since policies may reference them directly.

GRANT USAGE ON SCHEMA app TO authenticated;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA auth TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.projects TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_shares TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_presence TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.feedback TO authenticated;  -- no DELETE on Neon

GRANT EXECUTE ON FUNCTION
  app.user_id(), app.current_email(), app.is_salesforce(), app.is_feedback_admin(),
  auth.jwt(), auth.user_id()
  TO authenticated;

-- anon: intentionally no grants.
