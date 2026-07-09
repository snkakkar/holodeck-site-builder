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

const POSTGREST_PORT = 3001;
const SHIM_PORT = 3002;

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
