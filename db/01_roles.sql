-- 01_roles.sql — PostgREST roles.
-- Idempotent: safe to re-run on every release.
--
-- PostgREST connects as the DATABASE_URL login role (the "authenticator"),
-- then SET ROLE switches to `authenticated` (valid JWT) or `anon` (no JWT),
-- per postgrest.conf db-anon-role. On Neon `authenticated` already existed but
-- `anon` did not — we create both here so the same SQL is portable to any
-- Postgres. `anon` gets NO grants anywhere, so unauthenticated requests see
-- nothing (they 401/return []).

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
END $$;
