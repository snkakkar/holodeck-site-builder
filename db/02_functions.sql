-- 02_functions.sql — auth + app helper functions.
-- Idempotent (CREATE OR REPLACE).
--
-- On Neon, auth.jwt()/auth.user_id() are C functions from the proprietary
-- `pg_session_jwt` extension, which does NOT exist on Heroku Postgres. We
-- reimplement them in plain SQL reading the `request.jwt.claims` GUC that
-- PostgREST sets from the (HS256, shim-minted) bearer token. The app.*
-- helpers are copied verbatim from live Neon, EXCEPT app.current_email()
-- which drops the neon_auth."user" fallback (that schema is not migrated;
-- the shim always puts `email` in the JWT).

CREATE SCHEMA IF NOT EXISTS auth;
CREATE SCHEMA IF NOT EXISTS app;

-- ── auth.jwt(): the decoded JWT claims PostgREST injected for this request ──
CREATE OR REPLACE FUNCTION auth.jwt()
  RETURNS jsonb
  LANGUAGE sql
  STABLE
AS $function$
  SELECT coalesce(
    nullif(current_setting('request.jwt.claims', true), ''),
    '{}'
  )::jsonb
$function$;

-- ── auth.user_id(): the JWT `sub` (== projects.owner_id) ──
CREATE OR REPLACE FUNCTION auth.user_id()
  RETURNS text
  LANGUAGE sql
  STABLE
AS $function$
  SELECT auth.jwt() ->> 'sub'
$function$;

-- ── app.user_id(): thin wrapper over auth.user_id() (as on Neon) ──
CREATE OR REPLACE FUNCTION app.user_id()
  RETURNS text
  LANGUAGE sql
  STABLE SECURITY DEFINER
  SET search_path TO 'auth', 'pg_catalog'
AS $function$ SELECT auth.user_id() $function$;

-- ── app.current_email(): JWT-only (Neon's neon_auth."user" fallback dropped) ──
CREATE OR REPLACE FUNCTION app.current_email()
  RETURNS text
  LANGUAGE sql
  STABLE SECURITY DEFINER
  SET search_path TO 'auth', 'pg_catalog'
AS $function$ SELECT lower(nullif(auth.jwt() ->> 'email', '')) $function$;

-- ── app.is_salesforce(): email domain gate (verbatim from Neon) ──
CREATE OR REPLACE FUNCTION app.is_salesforce()
  RETURNS boolean
  LANGUAGE sql
  STABLE SECURITY DEFINER
  SET search_path TO 'app', 'pg_catalog'
AS $function$ SELECT coalesce(split_part(app.current_email(), '@', 2) = 'salesforce.com', false) $function$;

-- ── app.is_feedback_admin(): the single feedback triager (verbatim from Neon) ──
CREATE OR REPLACE FUNCTION app.is_feedback_admin()
  RETURNS boolean
  LANGUAGE sql
  STABLE SECURITY DEFINER
  SET search_path TO 'app', 'pg_catalog'
AS $function$ SELECT app.current_email() = 'shachi.kakkar@salesforce.com' $function$;
