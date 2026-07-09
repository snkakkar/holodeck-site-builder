-- 00_admin_bootstrap_roles_once.sql
-- One-time bootstrap to be executed by a Postgres admin/superuser role.
--
-- Why this exists:
-- - Heroku release runs as the app DB login role, which may not have CREATEROLE.
-- - PostgREST requires `authenticated` and `anon` roles to exist.
--
-- Safe to re-run: role creation and grants are idempotent.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
END $$;

-- Optional but recommended:
-- Replace <APP_LOGIN_ROLE> with the DATABASE_URL login role used by your app.
-- This lets that role SET ROLE into PostgREST roles.
DO $$
DECLARE
  app_role text := '<APP_LOGIN_ROLE>';
BEGIN
  IF app_role IS NULL OR app_role = '' OR app_role = '<APP_LOGIN_ROLE>' THEN
    RAISE NOTICE 'Skipping role membership grant. Replace <APP_LOGIN_ROLE> and re-run this block if needed.';
    RETURN;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = app_role) THEN
    RAISE EXCEPTION 'Role % does not exist', app_role;
  END IF;

  EXECUTE format('GRANT authenticated TO %I', app_role);
  EXECUTE format('GRANT anon TO %I', app_role);
END $$;
