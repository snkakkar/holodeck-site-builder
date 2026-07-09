-- 00_admin_bootstrap_roles_once_prefilled.sql
-- One-time bootstrap to be executed by a Postgres admin/superuser role.
-- Prefilled for this app login role: udmbkcnntqkveh
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

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'udmbkcnntqkveh') THEN
    RAISE EXCEPTION 'Role udmbkcnntqkveh does not exist';
  END IF;

  GRANT authenticated TO udmbkcnntqkveh;
  GRANT anon TO udmbkcnntqkveh;
END $$;
