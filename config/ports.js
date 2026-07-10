"use strict";

// ════════════════════════════════════════════════════════════════
// Co-located service ports / targets (single source of truth)
// ────────────────────────────────────────────────────────────────
// The web dyno hosts three services on localhost (see start-web.js).
// The PostgREST and auth-shim ports — and the URLs server.js proxies
// to — were previously hardcoded independently in start-web.js and
// server.js, so a change in one could silently diverge from the other.
// Both files now import these constants.
//
// Ports are env-overridable (defaults 3001/3002). The proxy targets
// default to the loopback ports but can be fully overridden via
// POSTGREST_TARGET / AUTH_SHIM_TARGET (e.g. to point at a remote
// PostgREST in a split deployment).
// ════════════════════════════════════════════════════════════════

const POSTGREST_PORT = Number(process.env.PGRST_SERVER_PORT || 3001);
const SHIM_PORT = Number(process.env.AUTH_SHIM_PORT || 3002);

const POSTGREST_TARGET = process.env.POSTGREST_TARGET || `http://127.0.0.1:${POSTGREST_PORT}`;
const AUTH_SHIM_TARGET = process.env.AUTH_SHIM_TARGET || `http://127.0.0.1:${SHIM_PORT}`;

module.exports = { POSTGREST_PORT, SHIM_PORT, POSTGREST_TARGET, AUTH_SHIM_TARGET };
