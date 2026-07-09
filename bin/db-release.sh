#!/usr/bin/env bash
# Heroku release-phase migration. Runs on every deploy BEFORE the new
# web dynos start, so the schema/roles/RLS are in place before PostgREST
# connects. All SQL is idempotent (drop-if-exists), so re-running is safe.
set -euo pipefail

if [ -z "${DATABASE_URL:-}" ]; then
  echo "[db-release] DATABASE_URL is not set — aborting" >&2
  exit 1
fi

DIR="$(cd "$(dirname "$0")/.." && pwd)/db"

echo "[db-release] applying schema/roles/RLS from ${DIR}"
for f in 01_roles.sql 02_functions.sql 03_tables.sql 04_grants.sql 05_rls.sql; do
  if [ -f "${DIR}/${f}" ]; then
    echo "[db-release] -> ${f}"
    psql "$DATABASE_URL" --set ON_ERROR_STOP=1 -f "${DIR}/${f}"
  else
    echo "[db-release] skip ${f} (not present)"
  fi
done

# The DATABASE_URL login role must be able to SET ROLE into the RLS roles
# that PostgREST switches to. Grant membership (idempotent).
echo "[db-release] granting role membership to the app login role"
psql "$DATABASE_URL" --set ON_ERROR_STOP=1 <<'SQL'
DO $$
DECLARE me text := current_user;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE format('GRANT authenticated TO %I', me);
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE format('GRANT anon TO %I', me);
  END IF;
END $$;
SQL

echo "[db-release] done"
