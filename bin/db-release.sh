#!/usr/bin/env bash
# Heroku release-phase migration. Runs on every deploy BEFORE the new web
# dynos start, so the schema/functions/grants/RLS are in place before PostgREST
# connects. All SQL is idempotent (drop-if-exists), so re-running is safe.
#
# Single-role model: the app DB login role (which owns the tables) cannot
# CREATE ROLE on Heroku, so there is no `authenticated`/`anon` role. We do NOT
# create roles or grant role membership. Row isolation is enforced entirely by
# FORCE ROW LEVEL SECURITY + policies TO PUBLIC (05), gated on JWT claims.
# Files 00_admin_bootstrap_* and 01_roles.sql exist only for Neon portability
# and are intentionally NOT applied here.
set -euo pipefail

if [ -z "${DATABASE_URL:-}" ]; then
  echo "[db-release] DATABASE_URL is not set — aborting" >&2
  exit 1
fi

DIR="$(cd "$(dirname "$0")/.." && pwd)/db"

FILES="02_functions.sql 03_tables.sql 04_grants.sql 05_rls.sql"

echo "[db-release] applying migrations from ${DIR}"
for f in $FILES; do
  if [ -f "${DIR}/${f}" ]; then
    echo "[db-release] -> ${f}"
    psql "$DATABASE_URL" --set ON_ERROR_STOP=1 -f "${DIR}/${f}"
  else
    echo "[db-release] skip ${f} (not present)"
  fi
done

# Assertion: every table must have RLS ENABLED and FORCED and carry at least
# one policy. This converts "silently-disabled RLS" (owner bypass, missing
# FORCE, or skipped 05) into a loud release failure instead of a data leak.
echo "[db-release] asserting RLS is enabled + forced with policies on every table"
psql "$DATABASE_URL" --set ON_ERROR_STOP=1 <<'SQL'
DO $$
DECLARE
  tables text[] := ARRAY[
    'projects', 'project_shares', 'project_presence', 'profiles', 'feedback'
  ];
  t text;
  enabled boolean;
  forced boolean;
  npol int;
BEGIN
  FOREACH t IN ARRAY tables LOOP
    SELECT c.relrowsecurity, c.relforcerowsecurity
      INTO enabled, forced
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = t;

    IF enabled IS NULL THEN
      RAISE EXCEPTION 'RLS assertion failed: table public.% does not exist', t;
    END IF;
    IF NOT enabled THEN
      RAISE EXCEPTION 'RLS assertion failed: RLS not ENABLED on public.%', t;
    END IF;
    IF NOT forced THEN
      RAISE EXCEPTION 'RLS assertion failed: RLS not FORCED on public.% (owner would bypass)', t;
    END IF;

    SELECT count(*) INTO npol FROM pg_policies
     WHERE schemaname = 'public' AND tablename = t;
    IF npol = 0 THEN
      RAISE EXCEPTION 'RLS assertion failed: no policies on public.%', t;
    END IF;

    RAISE NOTICE 'RLS ok: public.% (enabled, forced, % policies)', t, npol;
  END LOOP;
END $$;
SQL

echo "[db-release] done"
