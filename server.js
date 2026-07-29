const express = require("express");
const path = require("path");
const fs = require("fs");
const { jwtVerify, SignJWT, createRemoteJWKSet } = require("jose");
const compression = require("compression");

// ── .env loading ───────────────────────────────────────────────
// Populate process.env from a gitignored .env before reading any
// config below. Shared with start-web.js via ./load-dotenv so the
// supervisor and this server can never disagree about the env.
require("./load-dotenv").loadDotEnv(__dirname);

const app = express();
const port = process.env.PORT || 4173;
const rootDir = __dirname;

// ── gzip compression ───────────────────────────────────────────
// Compresses static JS/CSS/HTML and JSON API responses. Registered
// first so it wraps every downstream handler. The NDJSON streaming
// routes (/api/gemini/*) MUST NOT be buffered — compression would
// hold back the {type:"start"}/{type:"ping"} heartbeats that keep
// Heroku's router from timing out. They set `Cache-Control:
// no-transform` (see beginNdjson), which compression's default
// filter already honors by skipping; the explicit filter below is a
// belt-and-suspenders guard against that behavior ever changing.
app.use(
  compression({
    filter(req, res) {
      if (res.getHeader("Content-Type") === "application/x-ndjson; charset=utf-8") return false;
      return compression.filter(req, res);
    },
  })
);

// ── Gemini config ──────────────────────────────────────────────
// The API key lives ONLY here, server-side, read from the env. The
// browser never sees it — the builder calls /api/gemini/* and we
// forward to Google with the key attached. This keeps a billable
// Google Cloud credential out of localStorage, exported ZIPs, and
// shared project JSON (mirroring why Aubrey keys are kept out of
// project state — see aubrey-client.js).
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const GEMINI_TEXT_MODEL = process.env.GEMINI_TEXT_MODEL || "gemini-3.5-flash";
const GEMINI_IMAGE_MODEL = process.env.GEMINI_IMAGE_MODEL || "gemini-3-pro-image";
const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta";

// ── Outbound fetch timeouts ────────────────────────────────────
// Every upstream fetch (Gemini, Aubrey, logo, GCS asset proxy) used a
// bare fetch() with no timeout, so a slow/hung upstream held the socket
// open until the OS eventually gave up — a dyno-level reliability hole.
// fetchWithTimeout wires an AbortController so a dead upstream fails fast
// through each handler's EXISTING catch branch (same status/shape as a
// network error). AbortController + fetch are native on the Node 20–22
// runtime this project targets, so no new dependency. Timeouts are class
// constants (tune here):
//   • Gemini text/image: generous — these legitimately run long, and the
//     NDJSON heartbeat already keeps Heroku's router happy. This is only a
//     backstop against a truly dead upstream, not a latency cap.
//   • Aubrey / logo / GCS proxy: short — quick JSON/image fetches should
//     fail fast to their fallback (502 / next source / 404).
const FETCH_TIMEOUT_GEMINI_MS = 120000;
const FETCH_TIMEOUT_PROXY_MS = 10000;
async function fetchWithTimeout(url, opts, ms) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...(opts || {}), signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// One bounded retry for idempotent, read-only GET proxies (logo, Aubrey)
// against a TRANSIENT failure — a thrown network error or a timeout abort.
// A returned HTTP response (even 4xx/5xx) is NOT retried: a 404/401 is a
// real answer from upstream, not a blip, and retrying it just doubles
// latency. Single retry, short fixed backoff — never blind/unbounded, and
// deliberately NOT used on Gemini (non-idempotent, already streamed) or any
// write path.
const RETRY_BACKOFF_MS = 300;
async function getWithRetry(url, opts, ms) {
  try {
    return await fetchWithTimeout(url, opts, ms);
  } catch (_) {
    await new Promise((r) => setTimeout(r, RETRY_BACKOFF_MS));
    return fetchWithTimeout(url, opts, ms);
  }
}

// ── Aubrey Demo: shared-key proxy config ───────────────────────
// The Aubrey ecosystem (PocketSIC / Scriptwriter / Brand Kit Builder)
// can be reached with ONE shared API key per app held server-side.
// The browser never sees the key — the builder calls /api/aubrey/*
// and we forward to Aubrey with the key attached and the signed-in
// user's email (from the verified JWT) as ?email=. "The key owner
// acts on behalf of the email user." This is a FALLBACK path: SEs
// who set their own per-device key in the UI still call Aubrey
// directly (see aubrey-client.js); the proxy only serves the keyless
// case. Each app's key is optional — if unset, its routes 503 and
// the UI simply doesn't offer the shared path (see /api/aubrey/status).
// Bases are hardcoded from env (SSRF-safe: the client never supplies
// a host/URL, only ids that go into fixed path templates).
const AUBREY = {
  pocketsic:    { key: process.env.AUBREY_POCKETSIC_KEY    || "", base: process.env.AUBREY_POCKETSIC_BASE    || "https://pocketsic.aubreydemo.com" },
  scriptwriter: { key: process.env.AUBREY_SCRIPTWRITER_KEY || "", base: process.env.AUBREY_SCRIPTWRITER_BASE || "https://scriptwriter.aubreydemo.com" },
  brandkit:     { key: process.env.AUBREY_BRANDKIT_KEY     || "", base: process.env.AUBREY_BRANDKIT_BASE     || "https://brandkit.aubreydemo.com" },
};

// ── API authentication ─────────────────────────────────────────
// The billable/proxy /api routes (Gemini generation, logo fetch,
// GCS sign/proxy) are gated behind the SAME salesforce.com JWT the
// Data API already uses. The auth-shim (auth-service/index.js) mints
// an HS256 token — {sub, email, role, emailVerified} — signed with
// JWT_SECRET; PostgREST verifies it for /rest/v1, and we verify it
// here so nobody can burn the Gemini key by hitting the raw endpoint.
// Same secret, same domain rule — no new trust surface.
//
// /api/gemini/status stays public: it returns only booleans and is
// polled before auth is warm to decide whether to show AI buttons.
const JWT_SECRET = process.env.JWT_SECRET || "";
const JWT_KEY = JWT_SECRET ? new TextEncoder().encode(JWT_SECRET) : null;
const ALLOWED_EMAIL_DOMAIN = "salesforce.com";
// Single admin identity for reporting/metrics — MUST match the DB's
// app.is_feedback_admin() (db/02_functions.sql) so server-side gating and
// RLS agree on who the one admin is.
const ADMIN_EMAIL = "shachi.kakkar@salesforce.com";
const NEON_AUTH_BASE = (process.env.NEON_AUTH_BASE || "").replace(/\/+$/, "");
const NEON_JWKS_URL = process.env.NEON_JWKS_URL || (NEON_AUTH_BASE ? `${NEON_AUTH_BASE}/jwks` : "");
const NEON_JWKS = NEON_JWKS_URL ? createRemoteJWKSet(new URL(NEON_JWKS_URL)) : null;
const SHIM_TOKEN_TTL = process.env.SHIM_TOKEN_TTL || "15m";

function dbRoleFromUri(uri) {
  try { return decodeURIComponent(new URL(uri).username || "") || ""; }
  catch (_) { return ""; }
}
const PGRST_DB_ROLE =
  process.env.PGRST_DB_ROLE ||
  dbRoleFromUri(process.env.DATABASE_URL || process.env.PGRST_DB_URI || "");

// ── Direct Postgres pool (admin reporting only) ────────────────
// The app is otherwise 100% client→PostgREST, so all reads are RLS-scoped
// to the caller. The metrics dashboard needs cross-user aggregates, which
// RLS forbids. We open ONE pool here as the DATABASE_URL login role (the
// table owner — not subject to RLS) and use it ONLY for the admin-gated
// /api/metrics roll-ups, which return counts/series, never raw rows.
// Lazily built on first use so the server still boots without a DB
// (mirrors the GCS lazy-init pattern below).
const DATABASE_URL = process.env.DATABASE_URL || process.env.PGRST_DB_URI || "";
let _pgPool = null;
let _pgInit = false;
function getPgPool() {
  if (_pgInit) return _pgPool;
  _pgInit = true;
  if (!DATABASE_URL) return null;
  try {
    const { Pool } = require("pg");
    // Heroku Postgres (and Neon) REQUIRE TLS — a plaintext connect is
    // rejected by pg_hba.conf ("no encryption"). node-pg does NOT infer
    // SSL from the connection string, so enable it explicitly unless the
    // target is local or the URL opts out via sslmode=disable. Heroku PG
    // serves a self-signed cert, hence rejectUnauthorized:false.
    const isLocal = /@(localhost|127\.0\.0\.1|\[::1\])[:\/]/.test(DATABASE_URL);
    const sslDisabled = /[?&]sslmode=disable\b/.test(DATABASE_URL);
    const useSsl = !isLocal && !sslDisabled;
    _pgPool = new Pool({
      connectionString: DATABASE_URL,
      ssl: useSsl ? { rejectUnauthorized: false } : false,
      max: 3,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });
    _pgPool.on("error", (err) => {
      console.warn("[holodeck] pg pool error:", (err && err.message) || err);
    });
  } catch (err) {
    console.warn("[holodeck] pg init failed; /api/metrics disabled:", (err && err.message) || err);
    _pgPool = null;
  }
  return _pgPool;
}

async function verifyBearerToken(jwt) {
  if (JWT_KEY) {
    try {
      return await jwtVerify(jwt, JWT_KEY);
    } catch (_) {
      // Fall through: local dev can carry a Neon token if the shim isn't up.
    }
  }
  if (NEON_JWKS) {
    return jwtVerify(jwt, NEON_JWKS);
  }
  throw new Error("no-token-verifier");
}

// Verify the Bearer token, enforce the salesforce.com email claim, and
// stash the identity on req.holoUser for downstream handlers (the rate
// limiter keys on it). Fails closed: no secret configured → 503.
async function requireHolodeckAuth(req, res, next) {
  if (!JWT_KEY) {
    return res.status(503).json({ error: "Auth is not configured on the server (JWT_SECRET unset)." });
  }
  const header = req.get("authorization") || "";
  const m = header.match(/^Bearer\s+(.+)$/i);
  if (!m) {
    return res.status(401).json({ error: "Missing bearer token." });
  }
  try {
    const { payload } = await verifyBearerToken(m[1]);
    const email = String(payload.email || "").trim().toLowerCase();
    if (email.split("@")[1] !== ALLOWED_EMAIL_DOMAIN) {
      return res.status(403).json({ error: "Not authorized." });
    }
    req.holoUser = { sub: payload.sub || "", email: email };
    return next();
  } catch (_) {
    return res.status(401).json({ error: "Invalid or expired token." });
  }
}

// Gate a route to the single admin identity. Chain AFTER requireHolodeckAuth,
// which populates req.holoUser. This is the authoritative server-side check
// for the metrics endpoint (the client nav-link gate is cosmetic only).
function requireAdmin(req, res, next) {
  if (!req.holoUser || req.holoUser.email !== ADMIN_EMAIL) {
    return res.status(403).json({ error: "Not authorized." });
  }
  return next();
}

// ── Rate limit (fixed window, in-memory) ───────────────────────
// Bounds Gemini cost even for a valid token. Keyed by JWT sub (falls
// back to IP). In-memory + per-dyno — fine for a single-dyno demo;
// it resets on restart and isn't shared across dynos. Not a security
// boundary, a cost guard on top of requireHolodeckAuth.
const RATE_LIMIT_MAX = Number(process.env.API_RATE_LIMIT_MAX || 30); // requests
const RATE_LIMIT_WINDOW_MS = Number(process.env.API_RATE_LIMIT_WINDOW_MS || 60000); // per window
const _rateBuckets = new Map(); // key → { count, resetAt }

function rateLimit(req, res, next) {
  const key = (req.holoUser && req.holoUser.sub) || req.ip || "anon";
  const now = Date.now();
  let bucket = _rateBuckets.get(key);
  if (!bucket || now >= bucket.resetAt) {
    bucket = { count: 0, resetAt: now + RATE_LIMIT_WINDOW_MS };
    _rateBuckets.set(key, bucket);
  }
  bucket.count += 1;
  if (bucket.count > RATE_LIMIT_MAX) {
    const retry = Math.ceil((bucket.resetAt - now) / 1000);
    res.set("Retry-After", String(retry));
    return res.status(429).json({ error: `Rate limit exceeded — retry in ${retry}s.` });
  }
  return next();
}

// ── Google Cloud Storage (image bytes) ─────────────────────────
// AI-generated images come back from Gemini as raw base64 bytes. If
// we leave them inline as data: URLs inside the project state, the
// state blob blows past the Neon Data API's ~1MB request-body limit
// and cloud saves 400. So we upload the bytes to a PRIVATE GCS bucket
// (the org forbids public buckets) and store only the short object
// PATH (e.g. "ai/abc.png") in the project — tiny, so saves never 400.
// The browser can't read a private object directly, so we hand it a
// short-lived V4 SIGNED URL, minted fresh whenever a project loads
// (see /api/asset/sign). Lazily build the client on first use so the
// server still boots (and image gen still works via the data: URL
// fallback) when GCS is not configured.
//
// Credentials: prefer GCS_KEY_JSON (the service-account key's JSON
// contents in one env var — how Heroku gets it), else fall back to
// GOOGLE_APPLICATION_CREDENTIALS (a key file path — local dev / ADC).
const GCS_BUCKET = process.env.GCS_BUCKET || "";
const GCS_SIGNED_URL_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days (V4 max)
let _gcsBucket = null;       // cached Bucket handle
let _gcsInit = false;        // have we attempted init?
const gcsConfigured = () => Boolean(GCS_BUCKET && (process.env.GCS_KEY_JSON || process.env.GOOGLE_APPLICATION_CREDENTIALS));

function getGcsBucket() {
  if (_gcsInit) return _gcsBucket;
  _gcsInit = true;
  if (!gcsConfigured()) return null;
  try {
    const { Storage } = require("@google-cloud/storage");
    let opts = {};
    if (process.env.GCS_KEY_JSON) {
      const creds = JSON.parse(process.env.GCS_KEY_JSON);
      opts = { projectId: creds.project_id, credentials: creds };
    }
    // No GCS_KEY_JSON → Storage() picks up GOOGLE_APPLICATION_CREDENTIALS / ADC.
    _gcsBucket = new Storage(opts).bucket(GCS_BUCKET);
  } catch (err) {
    console.warn("[holodeck] GCS init failed; falling back to inline data URLs:", (err && err.message) || err);
    _gcsBucket = null;
  }
  return _gcsBucket;
}

// Upload raw image bytes to the private bucket; resolve to the object
// PATH (e.g. "ai/171234-ab12.png"), NOT a URL — the path is what we
// persist in project state. Object lives under ai/ with a unique name.
function uploadImageToGcs(buffer, mime) {
  const bucket = getGcsBucket();
  if (!bucket) return Promise.reject(new Error("GCS not configured"));
  const ext = String(mime || "image/png").split("/")[1] || "png";
  const name = "ai/" + Date.now() + "-" + Math.random().toString(36).slice(2, 10) + "." + ext;
  return bucket
    .file(name)
    .save(buffer, { contentType: mime || "image/png", resumable: false })
    .then(function () { return name; });
}

// Mint a short-lived V4 signed READ URL for a private object path.
// Only ai/ paths are signable (guards against signing arbitrary
// objects from a client-supplied path). Resolves to the https URL.
function signGcsUrl(objectPath) {
  const bucket = getGcsBucket();
  if (!bucket) return Promise.reject(new Error("GCS not configured"));
  if (typeof objectPath !== "string" || objectPath.indexOf("ai/") !== 0) {
    return Promise.reject(new Error("Refusing to sign non-ai/ path"));
  }
  return bucket
    .file(objectPath)
    .getSignedUrl({ action: "read", version: "v4", expires: Date.now() + GCS_SIGNED_URL_TTL_MS })
    .then(function (res) { return res[0]; });
}

// ── Google Slides export (per-user OAuth) ──────────────────────
// A "Create Google Slides" export builds a real Slides deck in the
// signed-in user's OWN Google Drive. The user grants consent once
// via OAuth (the guide's credentials.json flow); we keep only their
// refresh token, server-side, and never expose the OAuth client
// secret to the browser (mirrors the Gemini/GCS key isolation above).
//
// OAuth client: GOOGLE_OAUTH_CLIENT_JSON holds the JSON contents of
// the Desktop/Web OAuth client downloaded from Google Cloud Console
// (the guide's credentials.json). Redirect URI is derived per-request
// from the request origin (/api/slides/oauth/callback) so it works in
// both local dev and the deployed host.
//
// Token storage: refresh tokens are small; we persist them as tiny
// JSON objects in the SAME private GCS bucket under oauth/ (keyed by a
// hash of the user's email). This avoids a new dependency/table and
// survives dyno restarts. If GCS is unconfigured we fall back to an
// in-memory map (non-persistent; documented).
const GOOGLE_OAUTH_CLIENT_JSON = process.env.GOOGLE_OAUTH_CLIENT_JSON || "";
const SLIDES_SCOPES = [
  "https://www.googleapis.com/auth/presentations",
  "https://www.googleapis.com/auth/drive.file",
];
const slidesConfigured = () => Boolean(GOOGLE_OAUTH_CLIENT_JSON && JWT_KEY);
const _oauthTokensMem = new Map(); // email → refresh_token (fallback store)

// Parse the OAuth client JSON once. Google wraps it under `web` or
// `installed`; accept either.
let _oauthClientConf = null;
function oauthClientConf() {
  if (_oauthClientConf !== null) return _oauthClientConf || null;
  try {
    const parsed = JSON.parse(GOOGLE_OAUTH_CLIENT_JSON);
    _oauthClientConf = parsed.web || parsed.installed || parsed;
  } catch (err) {
    console.warn("[holodeck] GOOGLE_OAUTH_CLIENT_JSON parse failed:", (err && err.message) || err);
    _oauthClientConf = false;
  }
  return _oauthClientConf || null;
}

// Build a fresh OAuth2 client bound to this request's redirect URI.
function makeOAuthClient(redirectUri) {
  const conf = oauthClientConf();
  if (!conf) return null;
  const { google } = require("googleapis");
  return new google.auth.OAuth2(conf.client_id, conf.client_secret, redirectUri);
}
function redirectUriFor(req) {
  const proto = (req.get("x-forwarded-proto") || req.protocol || "https").split(",")[0];
  return `${proto}://${req.get("host")}/api/slides/oauth/callback`;
}

// Stable, non-reversible object key for a user's stored token.
function tokenKeyFor(email) {
  const crypto = require("crypto");
  return "oauth/slides-" + crypto.createHash("sha256").update(String(email)).digest("hex").slice(0, 32) + ".json";
}
function saveRefreshToken(email, refreshToken) {
  const bucket = getGcsBucket();
  if (!bucket) { _oauthTokensMem.set(email, refreshToken); return Promise.resolve(); }
  return bucket.file(tokenKeyFor(email))
    .save(JSON.stringify({ refresh_token: refreshToken }), { contentType: "application/json", resumable: false });
}
function loadRefreshToken(email) {
  const bucket = getGcsBucket();
  if (!bucket) return Promise.resolve(_oauthTokensMem.get(email) || null);
  return bucket.file(tokenKeyFor(email)).download()
    .then((res) => { try { return JSON.parse(res[0].toString("utf8")).refresh_token || null; } catch (_) { return null; } })
    .catch(() => null);
}

// The OAuth callback carries no bearer token (it's a browser redirect),
// so we round-trip the user's email through a short-lived signed `state`
// JWT (signed with the same JWT_SECRET). This binds the consent to the
// user who initiated it and can't be forged.
function signOAuthState(email) {
  return new SignJWT({ email: email, purpose: "slides_oauth" })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("15m")
    .sign(JWT_KEY);
}
async function verifyOAuthState(state) {
  const { payload } = await jwtVerify(state, JWT_KEY);
  if (payload.purpose !== "slides_oauth" || !payload.email) throw new Error("bad state");
  return String(payload.email);
}

// ── NDJSON streaming helper ────────────────────────────────────
// Heroku's router kills any request whose first byte or idle gap
// exceeds ~30s/55s (H12 Request Timeout). Slow Gemini calls (long
// script parses, image generation) blow past that. We answer as
// newline-delimited JSON: a {type:"start"} line flushed immediately,
// {type:"ping"} heartbeats every 10s while we wait, and a terminal
// {type:"done",...} or {type:"error",error}. This keeps the
// connection alive no matter how long the upstream call takes. The
// client (gemini-client.js) reads these lines and ignores pings.
// Returns { writeLine, finish } — call finish() exactly once.
function beginNdjson(res) {
  res.status(200);
  res.set("Content-Type", "application/x-ndjson; charset=utf-8");
  res.set("Cache-Control", "no-cache, no-transform");
  res.set("X-Accel-Buffering", "no");
  const writeLine = (obj) => { try { res.write(JSON.stringify(obj) + "\n"); } catch (_) {} };
  writeLine({ type: "start" });
  const heartbeat = setInterval(() => writeLine({ type: "ping" }), 10000);
  const finish = (obj) => {
    clearInterval(heartbeat);
    writeLine(obj);
    res.end();
  };
  return { writeLine, finish };
}

app.get("/", (_req, res) => {
  res.redirect(302, "/builder/");
});

app.get("/demo/", (_req, res) => {
  res.redirect(302, "/builder/");
});

// JSON body parsing, scoped to the API routes so static serving is
// untouched. 2 MB ceiling comfortably covers a full prompt + script.
app.use("/api", express.json({ limit: "2mb" }));

// ── Gemini: availability probe ─────────────────────────────────
// Lets the builder show/hide AI buttons without ever shipping the
// key. Returns only booleans + the model name.
app.get("/api/gemini/status", (_req, res) => {
  res.json({
    configured: Boolean(GEMINI_API_KEY),
    model: GEMINI_TEXT_MODEL,
    imageModel: GEMINI_IMAGE_MODEL,
    imageHosting: gcsConfigured() ? "gcs" : "inline",
  });
});

// ── Gemini: text/JSON generation (streamed NDJSON) ─────────────
// Body: { prompt: string, schema?: object, jsonMode?: bool, model?: string }
//
// A full-script parse can take well over Heroku's 30s router limit
// (H12 Request Timeout), which killed the old buffered response. We
// avoid that by proxying Gemini's streaming endpoint and replying as
// newline-delimited JSON (NDJSON):
//   {"type":"start"}                       ← flushed immediately (beats
//                                             the 30s time-to-first-byte)
//   {"type":"ping"}                        ← heartbeat while generating
//                                             (keeps the 55s idle window
//                                             from closing)
//   {"type":"done","text":…,"model":…}     ← final, full text
//   {"type":"error","error":…}             ← failure (terminal line)
// The client (gemini-client.js) reads these lines, ignores pings, and
// resolves with the full text — so callers still just get a string.
// The result is still buffered server-side before `done`, so JSON /
// responseSchema validation downstream is unchanged; streaming only
// keeps the HTTP connection alive past 30s.
app.post("/api/gemini/generate", requireHolodeckAuth, rateLimit, async (req, res) => {
  if (!GEMINI_API_KEY) {
    return res.status(503).json({ error: "Gemini is not configured on the server (GEMINI_API_KEY unset)." });
  }
  const body = req.body || {};
  const prompt = typeof body.prompt === "string" ? body.prompt : "";
  if (!prompt.trim()) {
    return res.status(400).json({ error: "prompt is required" });
  }
  const model = typeof body.model === "string" && body.model ? body.model : GEMINI_TEXT_MODEL;

  // JSON output can be requested two ways:
  //  • jsonMode: true        → ask for application/json, let the
  //                            prompt define the shape (no schema).
  //  • schema: <OpenAPI obj> → also constrain to a responseSchema.
  // The schema MUST be a real OpenAPI/JSON-Schema object
  // ({type, properties, …}) — NOT a sample/example object, or
  // Gemini rejects it field-by-field.
  // Google Search grounding: when the caller asks, attach the google_search
  // tool so Gemini researches the customer on the web before answering. On
  // Gemini 2.x this is MUTUALLY EXCLUSIVE with structured JSON output — the
  // API rejects responseMimeType/responseSchema alongside a tool — so when
  // grounding we suppress JSON mode and let the model return free-form text
  // (the caller parses it). Syntax is `googleSearch` (2.x); the older
  // `google_search_retrieval` is 1.5-only and would be rejected here.
  const grounding = body.groundWithSearch === true;

  const generationConfig = {};
  const wantsJson = !grounding && (body.jsonMode === true || (body.schema && typeof body.schema === "object"));
  if (wantsJson) generationConfig.responseMimeType = "application/json";
  if (!grounding && body.schema && typeof body.schema === "object") {
    generationConfig.responseSchema = body.schema;
  }
  // Opt-in latency controls (only applied when the caller asks). For a
  // mechanical JSON extraction these cut a lot of wall-clock:
  //  • fast → minimize the model's "thinking" pass (the big win)
  //  • temperature / maxOutputTokens → deterministic, bounded output
  // Gemini 3.x uses thinkingConfig.thinkingLevel (thinkingBudget is rejected);
  // 2.5 uses thinkingConfig.thinkingBudget (0 disables). "minimal" is the
  // closest Gemini 3 gets to off — thinking can't be fully disabled there.
  if (body.fast === true) {
    generationConfig.thinkingConfig = /gemini-3/.test(model)
      ? { thinkingLevel: "minimal" }
      : { thinkingBudget: 0 };
  }
  if (typeof body.temperature === "number") generationConfig.temperature = body.temperature;
  if (typeof body.maxOutputTokens === "number") generationConfig.maxOutputTokens = body.maxOutputTokens;

  const payload = {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
  };
  if (grounding) payload.tools = [{ googleSearch: {} }];
  if (Object.keys(generationConfig).length) payload.generationConfig = generationConfig;

  // Begin the NDJSON response immediately so Heroku sees a first byte
  // long before its 30s limit (see beginNdjson).
  const { finish } = beginNdjson(res);

  // Stream from Gemini via SSE (alt=sse). Each event's data is a partial
  // GenerateContentResponse; we concatenate the text parts as they land.
  const url = `${GEMINI_BASE}/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`;
  try {
    const upstream = await fetchWithTimeout(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": GEMINI_API_KEY },
      body: JSON.stringify(payload),
    }, FETCH_TIMEOUT_GEMINI_MS);

    if (!upstream.ok) {
      const raw = await upstream.text();
      let parsed; try { parsed = JSON.parse(raw); } catch (_) { parsed = null; }
      const msg = (parsed && parsed.error && parsed.error.message) || `Gemini HTTP ${upstream.status}`;
      return finish({ type: "error", error: msg });
    }

    // Parse the SSE byte stream line-by-line, accumulating "data:" JSON
    // chunks into the full text. `finishReason` is captured for error
    // messages if no text comes back.
    let text = "";
    let finishReason = "";
    let buffer = "";
    const decoder = new TextDecoder();
    const handleEvent = (jsonStr) => {
      let evt; try { evt = JSON.parse(jsonStr); } catch (_) { return; }
      if (evt && evt.error && evt.error.message) { finishReason = "ERROR: " + evt.error.message; return; }
      const cand = evt && evt.candidates && evt.candidates[0];
      if (!cand) return;
      if (cand.finishReason) finishReason = cand.finishReason;
      const parts = (cand.content && cand.content.parts) || [];
      for (const p of parts) if (p && p.text) text += p.text;
    };

    for await (const chunk of upstream.body) {
      buffer += decoder.decode(chunk, { stream: true });
      // SSE events are separated by blank lines; each event has one or
      // more "data: …" lines.
      let nl;
      while ((nl = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, nl).replace(/\r$/, "");
        buffer = buffer.slice(nl + 1);
        if (line.startsWith("data:")) {
          const data = line.slice(5).trim();
          if (data && data !== "[DONE]") handleEvent(data);
        }
      }
    }
    if (buffer.trim().startsWith("data:")) {
      const data = buffer.trim().slice(5).trim();
      if (data && data !== "[DONE]") handleEvent(data);
    }

    if (!text) {
      const fr = finishReason ? ` (finishReason: ${finishReason})` : "";
      return finish({ type: "error", error: `Gemini returned no text${fr}` });
    }
    return finish({ type: "done", text, model });
  } catch (err) {
    return finish({ type: "error", error: `Could not reach Gemini: ${(err && err.message) || err}` });
  }
});

// ── Gemini: image generation (NDJSON-wrapped) ──────────────────
// Body: { prompt: string, model?: string }
// The image model returns the picture as an inlineData part (base64)
// rather than text, so we can't reuse /generate. We pull the first
// inlineData part and hand the browser a ready-to-use data: URL, which
// drops straight into the builder's assetLibrary slots (same shape the
// manual uploader produces).
//
// Image generation can also exceed Heroku's 30s router limit, so the
// response is wrapped in the same NDJSON start/ping/done protocol as
// /generate (see beginNdjson). We still buffer the upstream call (the
// base64 image arrives in one piece); the heartbeat is what keeps the
// connection alive. Terminal line is {type:"done",dataUrl,model}.
app.post("/api/gemini/generate-image", requireHolodeckAuth, rateLimit, async (req, res) => {
  if (!GEMINI_API_KEY) {
    return res.status(503).json({ error: "Gemini is not configured on the server (GEMINI_API_KEY unset)." });
  }
  const body = req.body || {};
  const prompt = typeof body.prompt === "string" ? body.prompt : "";
  if (!prompt.trim()) {
    return res.status(400).json({ error: "prompt is required" });
  }
  const model = typeof body.model === "string" && body.model ? body.model : GEMINI_IMAGE_MODEL;

  // Gemini 3 image models (gemini-3-pro-image) require responseModalities to
  // emit an image; 2.5-flash-image emitted implicitly, and the field is a
  // harmless no-op there — so we always send it for forward-compat.
  const payload = {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: { responseModalities: ["TEXT", "IMAGE"] },
  };

  const { finish } = beginNdjson(res);
  const url = `${GEMINI_BASE}/models/${encodeURIComponent(model)}:generateContent`;
  try {
    const upstream = await fetchWithTimeout(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": GEMINI_API_KEY },
      body: JSON.stringify(payload),
    }, FETCH_TIMEOUT_GEMINI_MS);
    const raw = await upstream.text();
    let parsed;
    try { parsed = JSON.parse(raw); } catch (_) { parsed = null; }

    if (!upstream.ok) {
      const msg = (parsed && parsed.error && parsed.error.message) || `Gemini HTTP ${upstream.status}`;
      return finish({ type: "error", error: msg });
    }

    // Find the first inlineData part in the first candidate.
    const cand = parsed && parsed.candidates && parsed.candidates[0];
    const parts = (cand && cand.content && cand.content.parts) || [];
    const imgPart = parts.filter((p) => p && p.inlineData && p.inlineData.data)[0];
    if (!imgPart) {
      const fr = cand && cand.finishReason ? ` (finishReason: ${cand.finishReason})` : "";
      // Surface any text the model returned instead of an image — it
      // often explains a safety block or refusal.
      const note = parts.map((p) => (p && p.text) || "").join("").trim();
      return finish({
        type: "error",
        error: `Gemini returned no image${fr}${note ? ": " + note.slice(0, 200) : ""}`,
      });
    }
    const mime = imgPart.inlineData.mimeType || "image/png";
    const b64 = imgPart.inlineData.data;

    // When GCS is configured, upload the bytes and hand back the object
    // PATH (persisted in state) plus a freshly-signed URL (so the client
    // can display the image immediately without a second round-trip).
    // This keeps the saved project state tiny — see the GCS block above.
    // Otherwise fall back to the inline data: URL so image generation
    // still works locally without a bucket. If the upload/sign fails,
    // degrade to the data: URL rather than error out the generation.
    if (gcsConfigured()) {
      try {
        const path = await uploadImageToGcs(Buffer.from(b64, "base64"), mime);
        const signed = await signGcsUrl(path);
        return finish({ type: "done", path, url: signed, model });
      } catch (upErr) {
        console.warn("[holodeck] GCS upload failed; using inline data URL:", (upErr && upErr.message) || upErr);
      }
    }
    return finish({ type: "done", dataUrl: `data:${mime};base64,${b64}`, model });
  } catch (err) {
    return finish({ type: "error", error: `Could not reach Gemini: ${(err && err.message) || err}` });
  }
});

// ── Asset signing (private GCS → short-lived signed URLs) ──────
// Body: { paths: ["ai/abc.png", ...] }
// Returns: { urls: { "ai/abc.png": "<signed https url>", ... } }
// The client calls this on project load to turn the stored gcs object
// paths into displayable URLs (and again right before export). Paths
// that can't be signed (not ai/, sign failure) are simply omitted from
// the result — the caller leaves a placeholder. Permissive CORS so a
// same-origin exported deck could refresh too; the bucket stays private
// and only ai/ paths are signable (see signGcsUrl), so this exposes
// nothing beyond the demo images it already generated.
app.options("/api/asset/sign", (_req, res) => {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.sendStatus(204);
});
app.post("/api/asset/sign", requireHolodeckAuth, async (req, res) => {
  res.set("Access-Control-Allow-Origin", "*");
  if (!gcsConfigured()) {
    return res.status(503).json({ error: "GCS not configured", urls: {} });
  }
  const paths = Array.isArray(req.body && req.body.paths) ? req.body.paths : [];
  // De-dupe and bound the batch so a bad caller can't ask for thousands.
  const unique = Array.from(new Set(paths.filter((p) => typeof p === "string"))).slice(0, 100);
  const urls = {};
  await Promise.all(unique.map(async (p) => {
    try { urls[p] = await signGcsUrl(p); }
    catch (_) { /* unsignable → omit; caller falls back to placeholder */ }
  }));
  return res.json({ urls });
});

// ── Google Slides export routes ────────────────────────────────
// Availability probe — the builder hides/disables the button when
// unconfigured (mirrors /api/gemini/status).
app.get("/api/slides/status", (_req, res) => {
  res.json({ available: slidesConfigured() });
});

// POST /api/slides/create — body is the normalized export model
// ({ meta, brand, slides }) built in the browser. Creates the deck in
// the caller's own Drive. Returns { presentationUrl } or, when the user
// hasn't consented yet, 409 { auth_required:true, authUrl }.
app.post("/api/slides/create", requireHolodeckAuth, rateLimit, async (req, res) => {
  if (!slidesConfigured()) {
    return res.status(503).json({ error: "Google Slides export isn't configured on the server (GOOGLE_OAUTH_CLIENT_JSON unset)." });
  }
  const email = req.holoUser.email;
  const model = req.body || {};
  if (!Array.isArray(model.slides) || !model.slides.length) {
    return res.status(400).json({ error: "No slides to export." });
  }

  const oauth = makeOAuthClient(redirectUriFor(req));
  if (!oauth) return res.status(503).json({ error: "OAuth client misconfigured." });

  const refreshToken = await loadRefreshToken(email);
  if (!refreshToken) {
    // No consent yet → tell the client where to send the user.
    const state = await signOAuthState(email);
    const authUrl = oauth.generateAuthUrl({
      access_type: "offline", prompt: "consent", scope: SLIDES_SCOPES,
      login_hint: email, state: state,
    });
    return res.status(409).json({ auth_required: true, authUrl: authUrl });
  }

  try {
    oauth.setCredentials({ refresh_token: refreshToken });
    const { google } = require("googleapis");
    const slides = google.slides({ version: "v1", auth: oauth });

    const { buildBatchRequests } = require("./slides-renderer");
    const built = buildBatchRequests(model);

    const title = (model.meta && model.meta.name) || "Holodeck";
    const created = await slides.presentations.create({ requestBody: { title: title } });
    const presentationId = created.data.presentationId;

    // The BLANK layout still ships one default slide (slideId "p"); the
    // deck reads cleaner without it. We delete it after our slides land.
    const defaultSlideId = (created.data.slides && created.data.slides[0] && created.data.slides[0].objectId) || null;

    // 1) Create all slides + elements in one batch. The renderer scales
    //    the PPTX 13.33×7.5in layout down to the presentation's native
    //    16:9 page (10×5.625in) — see slides-renderer.js PAGE_SCALE.
    await slides.presentations.batchUpdate({
      presentationId,
      requestBody: { requests: built.requests },
    });

    // 2) Speaker notes need the notes-page placeholder id, known only now.
    if (built.notes && built.notes.length) {
      const full = await slides.presentations.get({ presentationId });
      const byId = {};
      (full.data.slides || []).forEach((s) => {
        const notesId = s.slideProperties &&
          s.slideProperties.notesPage &&
          (s.slideProperties.notesPage.notesProperties || {}).speakerNotesObjectId;
        if (notesId) byId[s.objectId] = notesId;
      });
      const noteReqs = built.notes
        .filter((n) => byId[n.pageId])
        .map((n) => ({ insertText: { objectId: byId[n.pageId], insertionIndex: 0, text: n.text } }));
      if (noteReqs.length) {
        await slides.presentations.batchUpdate({ presentationId, requestBody: { requests: noteReqs } });
      }
    }

    // 3) Drop the leftover default blank slide.
    if (defaultSlideId) {
      try {
        await slides.presentations.batchUpdate({
          presentationId, requestBody: { requests: [{ deleteObject: { objectId: defaultSlideId } }] },
        });
      } catch (_) { /* non-fatal — leave the stray slide rather than fail the export */ }
    }

    return res.json({ presentationUrl: `https://docs.google.com/presentation/d/${presentationId}/edit` });
  } catch (err) {
    const msg = (err && err.message) || String(err);
    // A revoked/expired refresh token reads as invalid_grant — force re-consent.
    if (/invalid_grant|invalid_token|unauthorized/i.test(msg)) {
      const state = await signOAuthState(email);
      const authUrl = oauth.generateAuthUrl({ access_type: "offline", prompt: "consent", scope: SLIDES_SCOPES, login_hint: email, state: state });
      return res.status(409).json({ auth_required: true, authUrl: authUrl });
    }
    console.warn("[holodeck] slides create failed:", msg);
    return res.status(502).json({ error: "Couldn't create the Google Slides deck: " + msg });
  }
});

// GET /api/slides/oauth/callback — Google redirects here after consent.
// Exchange the code for tokens, persist the refresh token, and show a
// close-this-tab page. No bearer token here; identity comes from `state`.
app.get("/api/slides/oauth/callback", async (req, res) => {
  const closeHtml = (msg) => `<!doctype html><html><body style="font-family:system-ui;padding:3rem;text-align:center">
    <h2>${msg}</h2><p>You can close this tab and return to the builder.</p>
    <script>setTimeout(function(){window.close();},1500);</script></body></html>`;
  if (!slidesConfigured()) return res.status(503).send(closeHtml("Google Slides isn’t configured."));
  const code = typeof req.query.code === "string" ? req.query.code : "";
  const state = typeof req.query.state === "string" ? req.query.state : "";
  if (!code || !state) return res.status(400).send(closeHtml("Authorization failed — missing code."));
  try {
    const email = await verifyOAuthState(state);
    const oauth = makeOAuthClient(redirectUriFor(req));
    const { tokens } = await oauth.getToken(code);
    if (!tokens.refresh_token) {
      // Google only returns a refresh token on first consent; prompt=consent
      // (used above) forces it, but guard anyway.
      return res.status(200).send(closeHtml("Authorized — but no refresh token was returned. Try again."));
    }
    await saveRefreshToken(email, tokens.refresh_token);
    return res.status(200).send(closeHtml("Google authorized ✓"));
  } catch (err) {
    console.warn("[holodeck] oauth callback failed:", (err && err.message) || err);
    return res.status(400).send(closeHtml("Authorization failed."));
  }
});

// ── Real brand logo proxy ──────────────────────────────────────
// Query: ?domain=<bare domain, e.g. salesforce.com>
// Fetches the REAL brand logo/icon from a public service so the
// builder can use the genuine mark instead of an AI-invented one.
// Done server-side because these services aren't guaranteed to send
// CORS headers for a browser fetch; same-origin keeps it simple.
// Tries Clearbit (full transparent-PNG logo, when reachable) first,
// then DuckDuckGo's icon service (largest real favicon), then
// Google's favicon service at a high size — falling back through the
// list until one returns a real image. Streams the bytes back with
// the upstream mime type. On a complete miss the client falls back
// to AI generation.
app.get("/api/logo", requireHolodeckAuth, async (req, res) => {
  const raw = typeof req.query.domain === "string" ? req.query.domain : "";
  // Normalize to a bare host: strip protocol, path, and a leading www.
  const domain = raw
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/\/.*$/, "")
    .replace(/^www\./i, "")
    .toLowerCase();
  if (!domain || !/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(domain)) {
    return res.status(400).json({ error: "a valid domain is required" });
  }

  const sources = [
    `https://logo.clearbit.com/${encodeURIComponent(domain)}?size=512`,
    `https://icons.duckduckgo.com/ip3/${encodeURIComponent(domain)}.ico`,
    `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=256`,
  ];

  for (const src of sources) {
    try {
      const upstream = await getWithRetry(src, { redirect: "follow" }, FETCH_TIMEOUT_PROXY_MS);
      if (!upstream.ok) continue;
      const buf = Buffer.from(await upstream.arrayBuffer());
      // Skip trivially-blank / placeholder responses (a real icon is
      // comfortably larger than ~150 bytes; a 1px transparent gif is not).
      if (buf.length < 150) continue;
      const type = upstream.headers.get("content-type") || "image/png";
      if (!/^image\//i.test(type)) continue;
      res.set("Content-Type", type);
      res.set("Cache-Control", "public, max-age=86400");
      return res.send(buf);
    } catch (_) {
      // Try the next source.
    }
  }
  return res.status(404).json({ error: `No logo found for ${domain}` });
});

// ── Signed-asset image proxy (for file exporters) ──────────────
// Query: ?url=<signed GCS url>
// Signed GCS URLs are cross-origin from the builder origin and the
// bucket has no CORS config, so a browser fetch → blob → data URL
// (which the PPTX/PDF exporters need to embed images) fails. This
// same-origin proxy fetches the bytes server-side and streams them
// back with the upstream content-type. Host is locked to
// storage.googleapis.com so it can't be used as an open proxy; the
// URL still carries its own signature (we don't add credentials).
app.get("/api/asset/proxy", requireHolodeckAuth, async (req, res) => {
  res.set("Access-Control-Allow-Origin", "*");
  const raw = typeof req.query.url === "string" ? req.query.url : "";
  let parsed;
  try { parsed = new URL(raw); } catch (_) { parsed = null; }
  if (!parsed || parsed.protocol !== "https:" || parsed.hostname !== "storage.googleapis.com") {
    return res.status(400).json({ error: "a valid storage.googleapis.com url is required" });
  }
  try {
    const upstream = await fetchWithTimeout(parsed.toString(), { redirect: "follow" }, FETCH_TIMEOUT_PROXY_MS);
    if (!upstream.ok) return res.status(upstream.status).json({ error: `upstream ${upstream.status}` });
    const type = upstream.headers.get("content-type") || "image/png";
    if (!/^image\//i.test(type)) return res.status(415).json({ error: "not an image" });
    const buf = Buffer.from(await upstream.arrayBuffer());
    res.set("Content-Type", type);
    res.set("Cache-Control", "private, max-age=3600");
    return res.send(buf);
  } catch (_) {
    return res.status(502).json({ error: "failed to fetch asset" });
  }
});

// ── Aubrey Demo: shared-key proxy ──────────────────────────────
// Availability probe — public (returns only booleans, polled before
// auth is warm to decide whether to reveal the shared-key path and
// the Brand Kit button). Mirrors /api/gemini/status.
app.get("/api/aubrey/status", (_req, res) => {
  res.json({
    pocketsic:    Boolean(AUBREY.pocketsic.key),
    scriptwriter: Boolean(AUBREY.scriptwriter.key),
    // Brand Kit currently needs no key; it's "configured" as long as
    // we have a base to reach. If a key is later required, set
    // AUBREY_BRANDKIT_KEY and this still holds.
    brandkit:     Boolean(AUBREY.brandkit.base),
  });
});

// Generic GET forwarder. `appKey` selects the AUBREY config entry;
// `upstreamPath` is a fixed template with ids already encoded by the
// caller. Always appends the server-verified email as ?email=. Buffers
// and returns the upstream JSON, surfacing its own .error text.
async function aubreyProxyGet(res, appKey, upstreamPath, email) {
  const cfg = AUBREY[appKey];
  if (!cfg || !cfg.base) {
    return res.status(503).json({ error: `Aubrey ${appKey} is not configured on the server.` });
  }
  // Brand Kit may need no key; the others must have one to proxy.
  if (appKey !== "brandkit" && !cfg.key) {
    return res.status(503).json({ error: `Aubrey ${appKey} is not configured on the server (key unset).` });
  }
  let url = cfg.base + upstreamPath;
  if (email) url += (url.indexOf("?") >= 0 ? "&" : "?") + "email=" + encodeURIComponent(email);
  const headers = {};
  if (cfg.key) headers["X-API-Key"] = cfg.key;
  try {
    const upstream = await getWithRetry(url, { headers, redirect: "follow" }, FETCH_TIMEOUT_PROXY_MS);
    const body = await upstream.text();
    let parsed = null;
    try { parsed = JSON.parse(body); } catch (_) { parsed = null; }
    if (!upstream.ok) {
      const msg = (parsed && parsed.error) || ("HTTP " + upstream.status);
      return res.status(upstream.status).json({ error: msg });
    }
    if (parsed && parsed.error) return res.status(502).json({ error: parsed.error });
    if (parsed == null) return res.status(502).json({ error: "Unexpected non-JSON response from Aubrey." });
    return res.json(parsed);
  } catch (_) {
    return res.status(502).json({ error: `Could not reach Aubrey ${appKey}.` });
  }
}

// Six read-only routes, all gated by the same salesforce.com JWT and
// rate limit as the Gemini proxy. The email is ALWAYS req.holoUser.email
// (server-verified) — no client-supplied email is read, so it can't be
// spoofed. Ids arrive only as path params and are encodeURIComponent'd.
app.get("/api/aubrey/pocketsic/projects", requireHolodeckAuth, rateLimit, (req, res) =>
  aubreyProxyGet(res, "pocketsic", "/api/projects", req.holoUser.email));
app.get("/api/aubrey/pocketsic/projects/:id/scenes", requireHolodeckAuth, rateLimit, (req, res) =>
  aubreyProxyGet(res, "pocketsic", "/api/projects/" + encodeURIComponent(req.params.id) + "/scenes", req.holoUser.email));
app.get("/api/aubrey/scriptwriter/scripts", requireHolodeckAuth, rateLimit, (req, res) =>
  aubreyProxyGet(res, "scriptwriter", "/api/scripts", req.holoUser.email));
app.get("/api/aubrey/scriptwriter/scripts/:id", requireHolodeckAuth, rateLimit, (req, res) =>
  aubreyProxyGet(res, "scriptwriter", "/api/scripts/" + encodeURIComponent(req.params.id), req.holoUser.email));
app.get("/api/aubrey/brandkit/items", requireHolodeckAuth, rateLimit, (req, res) =>
  aubreyProxyGet(res, "brandkit", "/api/items", req.holoUser.email));
app.get("/api/aubrey/brandkit/items/:id", requireHolodeckAuth, rateLimit, (req, res) =>
  aubreyProxyGet(res, "brandkit", "/api/items/" + encodeURIComponent(req.params.id), req.holoUser.email));

// ── Admin reporting / metrics ──────────────────────────────────
// Cross-user aggregates for the admin dashboard. RLS scopes every normal
// (client→PostgREST) read to the caller, so aggregation happens here via the
// owner-role pool (getPgPool). Double-gated: requireHolodeckAuth (valid
// salesforce.com JWT) → requireAdmin (single admin email). Returns ONLY
// counts and time series — no demo names, feedback text, emails, or ids.
// Phase 1 uses only existing columns; exports / true active users are not
// tracked yet and are surfaced as "not tracked" flags for the UI.
app.get("/api/metrics", requireHolodeckAuth, requireAdmin, async (req, res) => {
  const pool = getPgPool();
  if (!pool) {
    return res.status(503).json({ error: "Metrics unavailable — database not configured." });
  }
  // Each query returns pure aggregates. `now()` is DB-side so trends are
  // stable regardless of the app server's clock. Weekly series cover the
  // trailing 12 weeks, oldest first, with zero-filled gaps.
  const q = {
    demos: `SELECT
        count(*)::int AS total,
        count(*) FILTER (WHERE created_at >= now() - interval '7 days')::int  AS last7,
        count(*) FILTER (WHERE created_at >= now() - interval '30 days')::int AS last30,
        count(*) FILTER (WHERE visibility = 'gallery')::int AS gallery,
        count(*) FILTER (WHERE visibility = 'private')::int AS private
      FROM public.projects`,
    activeAuthors: `SELECT
        count(DISTINCT owner_id) FILTER (
          WHERE greatest(created_at, updated_at) >= now() - interval '7 days')::int  AS last7,
        count(DISTINCT owner_id) FILTER (
          WHERE greatest(created_at, updated_at) >= now() - interval '30 days')::int AS last30
      FROM public.projects`,
    feedback: `SELECT
        count(*)::int AS total,
        count(*) FILTER (WHERE type = 'like')::int      AS like_count,
        count(*) FILTER (WHERE type = 'dislike')::int   AS dislike_count,
        count(*) FILTER (WHERE type = 'bug')::int       AS bug_count,
        count(*) FILTER (WHERE type = 'complaint')::int AS complaint_count,
        count(*) FILTER (WHERE status = 'new')::int         AS new_count,
        count(*) FILTER (WHERE status = 'in_progress')::int AS in_progress_count,
        count(*) FILTER (WHERE status = 'resolved')::int    AS resolved_count,
        round(avg(rating)::numeric, 2)::float AS avg_rating
      FROM public.feedback`,
    shares: `SELECT
        count(*)::int AS total,
        count(*) FILTER (WHERE permission = 'view')::int AS view_count,
        count(*) FILTER (WHERE permission = 'edit')::int AS edit_count
      FROM public.project_shares`,
    demoTrend: `SELECT to_char(wk, 'YYYY-MM-DD') AS week, coalesce(c, 0)::int AS count
      FROM generate_series(date_trunc('week', now()) - interval '11 weeks',
                           date_trunc('week', now()), interval '1 week') AS wk
      LEFT JOIN (
        SELECT date_trunc('week', created_at) AS wk, count(*) AS c
        FROM public.projects GROUP BY 1
      ) t USING (wk)
      ORDER BY wk`,
    feedbackTrend: `SELECT to_char(wk, 'YYYY-MM-DD') AS week, coalesce(c, 0)::int AS count
      FROM generate_series(date_trunc('week', now()) - interval '11 weeks',
                           date_trunc('week', now()), interval '1 week') AS wk
      LEFT JOIN (
        SELECT date_trunc('week', created_at) AS wk, count(*) AS c
        FROM public.feedback GROUP BY 1
      ) t USING (wk)
      ORDER BY wk`,
  };
  // The tables carry FORCE ROW LEVEL SECURITY, so even this owner login role
  // sees ZERO rows unless a policy admits it. We therefore run the roll-ups in
  // a transaction that first sets `request.jwt.claims` to the verified admin
  // identity — exactly the GUC PostgREST sets per request — so the admin
  // branch of projects_select / shares_select / feedback_select (all gated on
  // app.is_feedback_admin()) fires and returns cross-user rows. requireAdmin
  // has already proven req.holoUser is the single admin; the DB gate is the
  // authoritative second check. is_local=true scopes the GUC to this tx.
  const claims = JSON.stringify({
    sub: (req.holoUser && req.holoUser.sub) || "",
    email: (req.holoUser && req.holoUser.email) || "",
  });
  let client;
  try {
    client = await pool.connect();
    await client.query("BEGIN");
    await client.query("SELECT set_config('request.jwt.claims', $1, true)", [claims]);
    const [demos, activeAuthors, feedback, shares, demoTrend, feedbackTrend] =
      await Promise.all([
        client.query(q.demos),
        client.query(q.activeAuthors),
        client.query(q.feedback),
        client.query(q.shares),
        client.query(q.demoTrend),
        client.query(q.feedbackTrend),
      ]);
    await client.query("COMMIT");
    res.set("Cache-Control", "no-store");
    return res.json({
      demos: demos.rows[0],
      activeAuthors: activeAuthors.rows[0],
      feedback: feedback.rows[0],
      shares: shares.rows[0],
      trends: {
        demosPerWeek: demoTrend.rows,
        feedbackPerWeek: feedbackTrend.rows,
      },
      // Phase 2 — no event data exists yet; the UI shows these as "not tracked".
      notTracked: ["exportsByFormat", "activeUsers", "demoOpens"],
    });
  } catch (err) {
    if (client) { try { await client.query("ROLLBACK"); } catch (_) { /* ignore */ } }
    console.error("[holodeck] /api/metrics failed:", (err && err.message) || err);
    return res.status(500).json({ error: "Failed to compute metrics." });
  } finally {
    if (client) client.release();
  }
});

// ── Backend endpoint config for the browser ───────────────────
// The frontend reads window.HOLO_ENV to learn where the Data API and
// Auth live. We serve them same-origin (relative paths) so the browser
// makes no cross-origin calls — the httpOnly session cookie and the
// Bearer JWT both flow without CORS. Overridable via env for staging.
const HOLO_ENV = {
  AUTH_BASE: process.env.HOLO_AUTH_BASE || "/auth",
  DATA_API: process.env.HOLO_DATA_API || "/rest/v1",
};
app.get("/env-config.js", (_req, res) => {
  res.set("Content-Type", "application/javascript; charset=utf-8");
  res.set("Cache-Control", "no-store");
  res.send(`window.HOLO_ENV = ${JSON.stringify(HOLO_ENV)};\n`);
});

// ── /auth/token exchange (same-origin) ──────────────────────────
// Prefer minting an HS256 token (PostgREST-compatible) from the Neon
// session cookie directly in this process. If local HS256 minting
// isn't possible, return Neon's token verbatim; requireHolodeckAuth
// accepts both HS256 and Neon tokens (via JWKS) as a dev-safe fallback.
app.get("/auth/token", async (req, res) => {
  if (!NEON_AUTH_BASE) {
    return res.status(503).json({ error: "NEON_AUTH_BASE is not configured." });
  }
  let neonToken = "";
  try {
    const upstream = await fetchWithTimeout(`${NEON_AUTH_BASE}/token`, {
      method: "GET",
      headers: {
        cookie: req.headers.cookie || "",
        accept: "application/json",
      },
    }, FETCH_TIMEOUT_PROXY_MS);
    const body = await upstream.text();
    let parsed = null;
    try { parsed = body ? JSON.parse(body) : null; } catch (_) { parsed = null; }
    if (!upstream.ok) {
      const msg = (parsed && (parsed.error || parsed.message)) || ("HTTP " + upstream.status);
      return res.status(upstream.status).json({ error: msg });
    }
    neonToken = parsed && (parsed.token || parsed.jwt) ? String(parsed.token || parsed.jwt) : "";
    if (!neonToken) return res.status(502).json({ error: "neon /token returned no token" });
  } catch (err) {
    return res.status(504).json({ error: "Auth token exchange failed upstream timeout/network." });
  }

  if (!JWT_KEY || !NEON_JWKS) {
    return res.json({ token: neonToken });
  }
  try {
    const { payload } = await jwtVerify(neonToken, NEON_JWKS);
    const now = Math.floor(Date.now() / 1000);
    const token = await new SignJWT({
      sub: payload.sub,
      email: payload.email,
      ...(PGRST_DB_ROLE ? { role: PGRST_DB_ROLE } : {}),
      emailVerified: payload.emailVerified === true || payload.email_verified === true,
    })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setIssuedAt(now)
      .setExpirationTime(SHIM_TOKEN_TTL)
      .sign(JWT_KEY);
    return res.json({ token });
  } catch (_) {
    return res.json({ token: neonToken });
  }
});

// ── Reverse proxies to the co-located backend services ─────────
// Mounted AFTER /api/* (above) and BEFORE the static catch-all (below)
// so they claim /rest/v1 and /auth without shadowing the app's own API
// or its static files.
//
//   /rest/v1/**  → PostgREST      127.0.0.1:3001  (strip the /rest/v1 prefix)
//   /auth/token  → auth-shim      127.0.0.1:3002  (EdDSA→HS256 exchange)
//   /auth/**     → Neon Auth origin               (login/OTP/session, unchanged)
//
// Bodies stream (default), which the presence `keepalive` DELETE relies on.
const { createProxyMiddleware } = require("http-proxy-middleware");

// Loopback targets shared with start-web.js (see config/ports.js).
const { POSTGREST_TARGET, AUTH_SHIM_TARGET } = require("./config/ports");
// Where the untouched Neon Auth endpoints live.

app.use(
  createProxyMiddleware({
    pathFilter: "/rest/v1/**",
    target: POSTGREST_TARGET,
    changeOrigin: true,
    pathRewrite: { "^/rest/v1": "" },
    xfwd: false,
  })
);

// Only /auth/token is intercepted for the token exchange.
app.use(
  createProxyMiddleware({
    pathFilter: "/auth/token",
    target: AUTH_SHIM_TARGET,
    changeOrigin: true,
    pathRewrite: { "^/auth": "" }, // shim serves /token
    xfwd: false,
  })
);

// Everything else under /auth/** is forwarded transparently to Neon Auth.
if (NEON_AUTH_BASE) {
  app.use(
    createProxyMiddleware({
      pathFilter: "/auth/**",
      target: NEON_AUTH_BASE, // already includes the /neondb/auth path
      changeOrigin: true,
      pathRewrite: { "^/auth": "" },
      xfwd: false,
    })
  );
}

// Static assets. Filenames are NOT content-hashed, so we can't use
// immutable/1-year caching — a deploy would keep serving stale JS/CSS.
// A short max-age still spares the browser from re-downloading all ~24
// builder scripts on every navigation, while HTML entry points stay
// no-cache so a new deploy is picked up immediately. env-config.js has
// its own no-store route above and isn't affected.
app.use(
  express.static(rootDir, {
    extensions: ["html"],
    setHeaders(res, filePath) {
      if (/\.html$/i.test(filePath)) {
        res.set("Cache-Control", "no-cache");
      } else if (/\.(?:js|mjs|css)$/i.test(filePath)) {
        // no-cache (not no-store): the browser may keep a copy but MUST
        // revalidate with the server every load, so an edited builder/demo
        // script is picked up on a normal reload instead of being served
        // stale for up to an hour. Static assets (images/fonts) below keep
        // their default (no explicit header).
        res.set("Cache-Control", "no-cache");
      }
    },
  })
);

app.listen(port, () => {
  console.log(`Holodeck server listening on port ${port}`);
});
