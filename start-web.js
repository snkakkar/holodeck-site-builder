"use strict";

// ════════════════════════════════════════════════════════════════
// Web-dyno supervisor
// ────────────────────────────────────────────────────────────────
// Heroku routes exactly one public port per dyno, so the web process
// must host three services co-located on localhost:
//   • PostgREST         127.0.0.1:3001  (Data API over Heroku Postgres)
//   • auth-shim         127.0.0.1:3002  (Neon EdDSA JWT → HS256 exchange)
//   • server.js         $PORT           (public: static + Gemini + GCS + proxies)
//
// This supervisor spawns the two localhost children, waits until both
// are healthy, then loads server.js in-process (server.js binds $PORT
// itself). If a child dies we exit the whole dyno so Heroku restarts it
// cleanly rather than serving from a half-up stack.
// ════════════════════════════════════════════════════════════════

const { spawn } = require("child_process");
const http = require("http");
const path = require("path");

// Load .env FIRST, before validating or spawning children. The
// supervisor spawns PostgREST and the auth-shim with our process.env,
// so if .env isn't loaded here the children run with blank
// DATABASE_URL / JWT_SECRET / NEON_* — the stack comes up "healthy"
// but every /rest/v1 and /auth call fails at runtime. Shared with
// server.js via ./load-dotenv so the two can never disagree.
require("./load-dotenv").loadDotEnv(__dirname);

// Shared with server.js so the two can never disagree (see config/ports.js).
const { POSTGREST_PORT, SHIM_PORT } = require("./config/ports");

// ── Fail-fast env validation ───────────────────────────────────
// Missing auth/DB config used to surface as a runtime 404/401 far
// from its cause (the shim only warned and kept minting broken
// tokens). Assert the invariants up front so a misconfigured stack
// dies loudly at boot with an actionable message instead of serving
// a half-broken app. Heroku sets these as real env vars (which win
// over .env); locally they come from the gitignored .env — see
// .env.example for the template.
function validateEnv() {
  const problems = [];
  const dbUri = process.env.DATABASE_URL || process.env.PGRST_DB_URI || "";
  if (!dbUri) {
    problems.push("DATABASE_URL is not set (Postgres connection string).");
  } else {
    // PostgREST SET ROLEs into the token's `role` claim, which the
    // auth-shim derives from the URI's userinfo. No role → tokens are
    // minted without a `role` claim → PostgREST rejects them as
    // anonymous → every authenticated /rest/v1 call 401s.
    let role = "";
    let host = "";
    try {
      const u = new URL(dbUri);
      role = decodeURIComponent(u.username || "");
      host = (u.hostname || "").toLowerCase();
    } catch (_) {}
    if (!role && !process.env.PGRST_DB_ROLE) {
      problems.push(
        "DATABASE_URL has no role (e.g. postgresql://USER@host/db) and PGRST_DB_ROLE is unset — " +
        "PostgREST would reject every token as anonymous. Add the DB login role."
      );
    }
    // ── DATA STORE INVARIANT: Heroku Postgres is the ONE data store. ──
    // Neon is auth-only (NEON_AUTH_BASE / NEON_JWKS_URL). The project data
    // (projects, project_shares, profiles, …) lives in Heroku Postgres. Once
    // a Neon connection string leaked into DATABASE_URL and the live app
    // silently read/wrote the WRONG database — reads returned nothing (data
    // sat in the other DB), writes stranded work, and it took a full
    // forensic migration to untangle. Never again: if this is a deployed
    // dyno (or strict mode is requested) and DATABASE_URL points at a Neon
    // host, refuse to boot rather than serve against the wrong data store.
    const isNeonHost = /neon\.tech$/.test(host) || /\.neon\./.test(host) || /neondb/.test(dbUri.toLowerCase());
    const onDyno = !!process.env.DYNO; // Heroku sets DYNO on every dyno
    const strict = process.env.HOLO_REQUIRE_HEROKU_PG === "1" || onDyno;
    if (isNeonHost && strict) {
      problems.push(
        "DATABASE_URL points at a Neon host (" + host + "), but Heroku Postgres is the required " +
        "data store. Neon is auth-ONLY (NEON_AUTH_BASE / NEON_JWKS_URL). Set DATABASE_URL to the " +
        "Heroku Postgres connection string (heroku config:get DATABASE_URL) — refusing to start " +
        "against the wrong database."
      );
    } else if (isNeonHost) {
      console.warn(
        "[supervisor] WARNING: DATABASE_URL points at a Neon host (" + host + "). Heroku Postgres is " +
        "the intended data store (Neon is auth-only). Allowed for local dev; set HOLO_REQUIRE_HEROKU_PG=1 " +
        "to make this fatal."
      );
    }
  }
  if (!(process.env.JWT_SECRET || process.env.PGRST_JWT_SECRET)) {
    problems.push("JWT_SECRET is not set (HS256 secret shared by the auth-shim and PostgREST).");
  }
  if (!process.env.NEON_AUTH_BASE) {
    problems.push("NEON_AUTH_BASE is not set (Neon Auth origin; the /auth/** proxy is skipped without it).");
  }
  if (!process.env.NEON_JWKS_URL && !process.env.NEON_AUTH_BASE) {
    problems.push("NEON_JWKS_URL could not be derived (needs NEON_JWKS_URL or NEON_AUTH_BASE).");
  }
  if (problems.length) {
    console.error("[supervisor] Refusing to start — required environment is incomplete:");
    problems.forEach((p) => console.error("  • " + p));
    console.error("[supervisor] Set these in the environment or in a gitignored .env (see .env.example).");
    process.exit(1);
  }
}
validateEnv();

const children = [];
let shuttingDown = false;

function log(msg) {
  console.log(`[supervisor] ${msg}`);
}

// The DB login role, parsed from a postgres:// URI's userinfo. PostgREST
// connects as this role; the shim stamps it as the token's `role` claim.
function dbRoleFromUri(uri) {
  try { return decodeURIComponent(new URL(uri).username || "") || ""; }
  catch (_) { return ""; }
}

function spawnChild(name, command, args, env) {
  const child = spawn(command, args, {
    stdio: "inherit",
    env: { ...process.env, ...env },
  });
  child._name = name;
  children.push(child);
  child.on("exit", (code, signal) => {
    if (shuttingDown) return;
    log(`${name} exited (code=${code} signal=${signal}) — bringing down the dyno`);
    shutdown(1);
  });
  child.on("error", (err) => {
    if (shuttingDown) return;
    log(`${name} failed to start: ${err.message}`);
    shutdown(1);
  });
  return child;
}

// Poll a TCP port until something accepts a connection (or we give up).
function waitForPort(name, port, { retries = 60, delayMs = 500 } = {}) {
  return new Promise((resolve, reject) => {
    let attempt = 0;
    const tick = () => {
      const req = http.request(
        { host: "127.0.0.1", port, method: "GET", path: "/", timeout: 1000 },
        (res) => {
          res.resume();
          log(`${name} is up on :${port}`);
          resolve();
        }
      );
      // Any HTTP response — even 400/404 — means the port is listening.
      req.on("response", () => resolve());
      req.on("error", () => {
        if (++attempt >= retries) return reject(new Error(`${name} never came up on :${port}`));
        setTimeout(tick, delayMs);
      });
      req.on("timeout", () => req.destroy());
      req.end();
    };
    tick();
  });
}

function shutdown(code) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const c of children) {
    try { c.kill("SIGTERM"); } catch (_) {}
  }
  // Give children a moment to exit, then force-exit.
  setTimeout(() => process.exit(code), 2000);
}

process.on("SIGTERM", () => { log("SIGTERM"); shutdown(0); });
process.on("SIGINT", () => { log("SIGINT"); shutdown(0); });

(async function main() {
  // PostgREST: prefer the fetched ./bin/postgrest, else assume it's on PATH.
  const localPostgrest = path.join(__dirname, "bin", "postgrest");
  const postgrestBin = require("fs").existsSync(localPostgrest) ? localPostgrest : "postgrest";
  spawnChild("postgrest", postgrestBin, [path.join(__dirname, "postgrest.conf")], {
    // Env overrides in the conf: real DB + secret come from Heroku config.
    PGRST_DB_URI: process.env.DATABASE_URL || process.env.PGRST_DB_URI || "",
    PGRST_JWT_SECRET: process.env.JWT_SECRET || process.env.PGRST_JWT_SECRET || "",
    PGRST_DB_SCHEMAS: process.env.PGRST_DB_SCHEMAS || "public",
    // No PGRST_DB_ANON_ROLE: with no anon role, PostgREST 401s token-less
    // requests. The conf leaves db-anon-role unset; only forward an explicit
    // override if one is deliberately set in the environment.
    ...(process.env.PGRST_DB_ANON_ROLE ? { PGRST_DB_ANON_ROLE: process.env.PGRST_DB_ANON_ROLE } : {}),
    PGRST_SERVER_PORT: String(POSTGREST_PORT),
    PGRST_SERVER_HOST: "127.0.0.1",
  });

  spawnChild("auth-shim", process.execPath, [path.join(__dirname, "auth-service", "index.js")], {
    AUTH_SHIM_PORT: String(SHIM_PORT),
    // The shim stamps the token's `role` claim with the DB login role so
    // PostgREST can SET ROLE into it. Derive it from the same URI PostgREST
    // connects with, so the two can never disagree across DB promotions.
    // (The shim also derives this itself from DATABASE_URL; passing it here
    // keeps the source of truth aligned with PostgREST's PGRST_DB_URI.)
    PGRST_DB_ROLE:
      process.env.PGRST_DB_ROLE ||
      dbRoleFromUri(process.env.DATABASE_URL || process.env.PGRST_DB_URI || ""),
  });

  try {
    await Promise.all([
      waitForPort("postgrest", POSTGREST_PORT),
      waitForPort("auth-shim", SHIM_PORT),
    ]);
  } catch (err) {
    log(`startup healthcheck failed: ${err.message}`);
    return shutdown(1);
  }

  log("both children healthy — starting public server (server.js)");
  // server.js binds $PORT and registers the reverse proxies to the children.
  require("./server.js");
})();
