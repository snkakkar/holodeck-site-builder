"use strict";

// ════════════════════════════════════════════════════════════════
// Token-exchange shim (localhost:3002)
// ────────────────────────────────────────────────────────────────
// Neon Auth (Better Auth) signs its JWTs with EdDSA/Ed25519 and only
// publishes the verification key via a JWKS endpoint. Self-hosted
// PostgREST can validate ONLY an HS256 shared-secret JWT and cannot
// fetch a JWKS by URL. This shim bridges the two:
//
//   1. Forward the caller's Better Auth session cookie to Neon's
//      /token endpoint and receive Neon's EdDSA JWT.
//   2. Verify that JWT against Neon's JWKS (createRemoteJWKSet caches
//      + rotates keys for us).
//   3. Re-mint a short-lived HS256 JWT copying the identity claims
//      PostgREST RLS depends on: sub, email, role, emailVerified.
//
// The HS256 secret here MUST equal PostgREST's PGRST_JWT_SECRET, and
// `sub` MUST equal projects.owner_id for RLS ownership to hold.
//
// jose is the only dependency. No Express — the Node http module is
// enough for two routes and keeps the slug small.
// ════════════════════════════════════════════════════════════════

const http = require("http");
const { createRemoteJWKSet, jwtVerify, SignJWT } = require("jose");

const PORT = Number(process.env.AUTH_SHIM_PORT || 3002);
const HOST = "127.0.0.1";

// Neon Auth base, e.g.
//   https://<ep>.neonauth.<region>.aws.neon.tech/neondb/auth
const NEON_AUTH_BASE = (process.env.NEON_AUTH_BASE || "").replace(/\/+$/, "");
// Better Auth's jwt plugin serves the JWKS at <base>/jwks unless overridden.
const NEON_JWKS_URL = process.env.NEON_JWKS_URL || (NEON_AUTH_BASE ? `${NEON_AUTH_BASE}/jwks` : "");

const JWT_SECRET = process.env.JWT_SECRET || "";
const TOKEN_TTL = process.env.SHIM_TOKEN_TTL || "15m";

if (!NEON_AUTH_BASE) console.error("[auth-shim] WARNING: NEON_AUTH_BASE is not set");
if (!NEON_JWKS_URL) console.error("[auth-shim] WARNING: NEON_JWKS_URL could not be derived");
if (!JWT_SECRET) console.error("[auth-shim] WARNING: JWT_SECRET is not set — HS256 minting will fail");

const hsKey = JWT_SECRET ? new TextEncoder().encode(JWT_SECRET) : null;
// createRemoteJWKSet returns a key-resolver that caches and refreshes
// Neon's rotating verification keys; construct it once at boot.
const jwks = NEON_JWKS_URL ? createRemoteJWKSet(new URL(NEON_JWKS_URL)) : null;

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json",
    "content-length": Buffer.byteLength(payload),
    "cache-control": "no-store",
  });
  res.end(payload);
}

// Exchange the Neon session (via cookie) for an HS256 token PostgREST accepts.
async function handleToken(req, res) {
  if (!hsKey || !jwks) {
    return sendJson(res, 500, { error: "shim not configured" });
  }
  let neonToken;
  try {
    // Better Auth authenticates /token via the httpOnly session cookie.
    // Forward it verbatim (same-origin from the browser's perspective,
    // so the cookie is present on the proxied request that reaches us).
    const upstream = await fetch(`${NEON_AUTH_BASE}/token`, {
      method: "GET",
      headers: {
        cookie: req.headers.cookie || "",
        accept: "application/json",
      },
    });
    if (!upstream.ok) {
      return sendJson(res, upstream.status, { error: "neon /token rejected the session" });
    }
    const json = await upstream.json();
    neonToken = json.token || json.jwt;
    if (!neonToken) return sendJson(res, 502, { error: "neon /token returned no token" });
  } catch (_) {
    return sendJson(res, 502, { error: "failed to reach neon /token" });
  }

  let claims;
  try {
    // Verify Neon's EdDSA JWT against the published JWKS.
    const { payload } = await jwtVerify(neonToken, jwks);
    claims = payload;
  } catch (_) {
    return sendJson(res, 401, { error: "neon token failed verification" });
  }

  try {
    // Re-mint HS256 copying only the identity claims RLS reads. `role`
    // is forced to authenticated so PostgREST switches into that role.
    const now = Math.floor(Date.now() / 1000);
    const token = await new SignJWT({
      sub: claims.sub,
      email: claims.email,
      role: "authenticated",
      emailVerified: claims.emailVerified === true || claims.email_verified === true,
    })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setIssuedAt(now)
      .setExpirationTime(TOKEN_TTL)
      .sign(hsKey);
    // Match Better Auth's response shape so auth.js (json.token||json.jwt) parses it.
    return sendJson(res, 200, { token });
  } catch (_) {
    return sendJson(res, 500, { error: "failed to mint token" });
  }
}

const server = http.createServer((req, res) => {
  const url = (req.url || "").split("?")[0];
  if (req.method === "GET" && url === "/health") {
    return sendJson(res, 200, { ok: true });
  }
  if (req.method === "GET" && (url === "/token" || url === "/auth/token")) {
    return handleToken(req, res);
  }
  return sendJson(res, 404, { error: "not found" });
});

server.listen(PORT, HOST, () => {
  console.log(`[auth-shim] token-exchange listening on http://${HOST}:${PORT}`);
});
