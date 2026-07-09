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

# Keep release-time bootstrap limited to schema/functions/tables and, when
# available, grants/RLS. Role creation is a one-time admin task.
HAS_AUTHENTICATED="$(psql "$DATABASE_URL" -tA -c "SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated')" | tr -d '[:space:]')"
HAS_ANON="$(psql "$DATABASE_URL" -tA -c "SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')" | tr -d '[:space:]')"

if [ "$HAS_AUTHENTICATED" != "t" ] || [ "$HAS_ANON" != "t" ]; then
  echo "[db-release] required PostgREST roles are missing (authenticated/anon)."
  echo "[db-release] applying non-role migrations only (02_functions.sql, 03_tables.sql)."
  echo "[db-release] to enable grants/RLS, run admin bootstrap once and deploy again."
  FILES="02_functions.sql 03_tables.sql"
else
  FILES="02_functions.sql 03_tables.sql 04_grants.sql 05_rls.sql"
fi

echo "[db-release] applying migrations from ${DIR}"
for f in $FILES; do
  if [ -f "${DIR}/${f}" ]; then
    echo "[db-release] -> ${f}"
    psql "$DATABASE_URL" --set ON_ERROR_STOP=1 -f "${DIR}/${f}"
  else
    echo "[db-release] skip ${f} (not present)"
  fi
done

# The DATABASE_URL login role must be able to SET ROLE into the RLS roles
# that PostgREST switches to. Grant membership (idempotent).
if [ "$HAS_AUTHENTICATED" = "t" ] || [ "$HAS_ANON" = "t" ]; then
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
else
  echo "[db-release] skipping role membership grant (roles not present yet)"
fi

echo "[db-release] done"
