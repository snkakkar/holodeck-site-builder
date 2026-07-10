"use strict";

// ── Minimal .env loader (zero dependencies) ────────────────────
// Reads KEY=VALUE lines from a .env file next to the repo root and
// populates process.env for any key not already set in the real
// environment. .env is gitignored, so secrets stay out of git.
//
// Extracted from server.js so the web-dyno supervisor (start-web.js)
// loads the SAME env before it spawns its children (PostgREST + the
// auth-shim). Previously only server.js loaded .env; the supervisor
// read a bare process.env, so the children silently ran without
// DATABASE_URL / JWT_SECRET / NEON_* unless those happened to be
// exported in the launching shell — the root cause of the "config
// only lived in one terminal" failures (get-session 404, /rest/v1
// 401). Both entrypoints now share this loader so they can never
// disagree about what the environment is.
//
// We avoid adding a dotenv dependency for one small need.

const fs = require("fs");
const path = require("path");

function loadDotEnv(dir) {
  const file = path.join(dir || __dirname, ".env");
  try {
    const raw = fs.readFileSync(file, "utf8");
    raw.split(/\r?\n/).forEach((line) => {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!m) return; // skip blanks/comments
      const key = m[1];
      let val = m[2];
      // Strip a single layer of surrounding quotes if present.
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      // Real environment always wins over the file.
      if (process.env[key] === undefined) process.env[key] = val;
    });
  } catch (_) {
    // No .env file — fine, env vars may be set another way.
  }
}

module.exports = { loadDotEnv };
