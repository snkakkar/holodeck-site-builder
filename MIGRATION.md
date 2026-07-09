# Migration runbook: project data → Heroku Postgres (Neon Auth kept as-is)

This app moves its **application data** off Neon onto **Heroku Postgres** served by
self-hosted **PostgREST**, while keeping **Neon Auth** (login, email-OTP, sessions) exactly
as it is today. A small Node **token-exchange shim** bridges the two JWT formats.

## Why the shim
PostgREST validates only **HS256 shared-secret** JWTs and cannot fetch a JWKS by URL. Neon
Auth signs **EdDSA/Ed25519** and publishes keys via JWKS. The shim (`auth-service/`) forwards
the Better Auth session cookie to Neon's `/token`, verifies the returned EdDSA JWT against
Neon's JWKS, and re-mints a short-lived HS256 token copying `sub`, `email`,
`role:"authenticated"`, `emailVerified`. **`sub` must equal `projects.owner_id`** or RLS
ownership breaks — see the continuity check below.

## Architecture (single web dyno)
```
Browser (same-origin)
  ├── /builder,/demo,/api/*  → server.js ($PORT)      static + Gemini + GCS  (unchanged)
  ├── /rest/v1/*  →proxy→ 127.0.0.1:3001  PostgREST ──→ Heroku Postgres (DATABASE_URL)
  ├── /auth/token →proxy→ 127.0.0.1:3002  auth-shim  ──(verify EdDSA / mint HS256)
  └── /auth/**    →proxy→ Neon Auth origin            login / OTP / session  (unchanged)
```
`start-web.js` supervises PostgREST + shim, health-checks both, then loads `server.js`.

## Config vars (Heroku — never commit)
| Var | Purpose |
|---|---|
| `DATABASE_URL` | provided by the `heroku-postgresql` add-on (PostgREST `PGRST_DB_URI`) |
| `JWT_SECRET` | shared HS256 secret — shim signs, PostgREST verifies (**must match**) |
| `NEON_AUTH_BASE` | `https://<ep>.neonauth.<region>.aws.neon.tech/neondb/auth` (shim + `/auth/**` proxy) |
| `NEON_JWKS_URL` | optional; defaults to `${NEON_AUTH_BASE}/jwks` |
| `GEMINI_API_KEY`, `GCS_BUCKET`, `GCS_KEY_JSON` | existing — carry over unchanged |

## One-time setup
```bash
heroku addons:create heroku-postgresql:standard-0 -a <app>
heroku config:set JWT_SECRET="$(openssl rand -hex 32)" -a <app>
heroku config:set NEON_AUTH_BASE="https://ep-round-hill-ajwf0r6a.neonauth.c-3.us-east-2.aws.neon.tech/neondb/auth" -a <app>
# GEMINI_API_KEY / GCS_* as today
```

## Deploy
`git push heroku <branch>:main`. The **release phase** runs `bin/db-release.sh`
(`db/01`–`05` under `ON_ERROR_STOP=1`, then grants role membership). The **build** runs
`heroku-postbuild` → fetches the PostgREST binary + installs the shim's deps.

## Data migration (after the first deploy has created the schema)
Requires **pg_dump ≥ Neon server version (PG17+)**. Local was 16.14 →
`brew install postgresql@17` and put its `bin` on PATH first.
```bash
PGDUMP=/opt/homebrew/opt/postgresql@17/bin/pg_dump
"$PGDUMP" --data-only --no-owner --no-privileges \
  -t public.projects -t public.project_shares -t public.project_presence \
  -t public.profiles -t public.feedback \
  "<NEON_READONLY_DATABASE_URL>" \
  | grep -v transaction_timeout \
  | psql "$(heroku config:get DATABASE_URL -a <app>)"
```

### Continuity check (gate cutover on this)
```sql
-- Must equal the row count of projects, i.e. every owner_id maps to a Neon user.
select count(*) from projects p
  join neon_auth."user" u on u.id::text = p.owner_id;
select count(*) from projects;
```
If these differ, `sub` ≠ `owner_id` for some rows and those owners would lose their projects
under RLS — do NOT cut over until reconciled.

## Runtime verification
- Anon `GET /rest/v1/projects` → **401**.
- Signed-in `@salesforce.com`: OTP → Neon cookie → `/auth/token` mints HS256 → sees only own
  projects; forged `?owner_id=eq.<other>` returns `[]`.
- Shares appear; presence soft-lock updates + release beacon works; `feedback` INSERT for all,
  SELECT only for `shachi.kakkar@salesforce.com`.
- Gemini `/api/gemini/*` and GCS `/api/asset/sign` unchanged and working.

## Rollback
Revert the three frontend constants (or set `HOLO_AUTH_BASE`/`HOLO_DATA_API` config vars back
to the Neon URLs) and redeploy — Neon still holds the original data until decommissioned.
