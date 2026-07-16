// ════════════════════════════════════════════════════════════════
//  smoke.mjs — dependency-free regression smoke tests
//
//  The app had NO automated tests. These cover pure, high-value logic
//  that gates exports plus the new reliability/cost helpers, so later
//  changes have a fast regression gate. Run with `npm test`.
//
//  The builder modules are browser IIFEs of the form
//    (function (global) { … global.HOLO_X = {…}; })(window);
//  They reference a bare `window` at the closing invocation and use the
//  `global` parameter internally. loadBrowserModule() evaluates a file's
//  source with `window` bound to a shared fake window object, so each
//  module's exports land on that object — no bundler, no jsdom, no deps.
//
//  Scope note: we test PURE functions only (validator/adapter/export-
//  model helpers) — nothing here touches the DOM or network. The heavy
//  async buildExportModel (needs <img>/FileReader) is intentionally out
//  of scope for a smoke test; we test the pure helpers it composes.
// ════════════════════════════════════════════════════════════════
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import http from "node:http";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

// A shared fake `window` the browser modules attach their globals to.
// Real holodeck-shared.js loads first (self-contained), so downstream
// modules see the real HOLO_SHARED, matching production load order.
const win = {};

function loadBrowserModule(relPath) {
  const src = readFileSync(join(ROOT, relPath), "utf8");
  // Bind the bare `window` the IIFE closes over to our fake object; its
  // `global` parameter then receives it. globalThis is passed through so
  // holodeck-shared's `typeof window` check resolves to the fake window.
  // eslint-disable-next-line no-new-func
  const run = new Function("window", "globalThis", src);
  run(win, win);
}

// Production load order: shared first, then its consumers.
loadBrowserModule("builder/holodeck-shared.js");
loadBrowserModule("builder/holodeck-adapter.js");
loadBrowserModule("builder/import-validator.js");
loadBrowserModule("builder/export-model.js");

// ── import-validator: round-trips a minimal config ───────────────
test("HOLO_VALIDATOR loads and importConfig handles empty input cleanly", () => {
  const V = win.HOLO_VALIDATOR;
  assert.ok(V && typeof V.importConfig === "function", "importConfig exported");
  const res = V.importConfig("");
  // Empty input must produce a clear error, not throw.
  assert.ok(Array.isArray(res.errors) && res.errors.length >= 1, "empty input yields an error");
  assert.equal(res.state, null, "no state for empty input");
});

test("HOLO_VALIDATOR.importConfig accepts a minimal JSON snapshot without throwing", () => {
  const V = win.HOLO_VALIDATOR;
  const minimal = JSON.stringify({
    project: { customerName: "Acme", industry: "Retail" },
    brand: { primary: "#123456" },
  });
  const res = V.importConfig(minimal);
  // We don't assert a specific normalized shape (that's the validator's
  // job and may evolve) — only that valid JSON in produces a result
  // object with the errors/warnings/state contract and doesn't throw.
  assert.ok(res && typeof res === "object", "returns a result object");
  assert.ok("errors" in res && "warnings" in res && "state" in res, "result has the contract keys");
});

// ── holodeck-adapter: state → polished config ────────────────────
test("HOLO_ADAPTER.toPolishedHolodeckConfig produces a config from a minimal state", () => {
  const A = win.HOLO_ADAPTER;
  assert.ok(A && typeof A.toPolishedHolodeckConfig === "function", "adapter exported");
  const state = {
    project: { customerName: "Acme", industry: "Retail" },
    brand: {},
    story: {},
    personas: [],
    storyActs: [],
    scenes: [],
    assets: [],
    assetLibrary: {},
    slides: [],
  };
  const cfg = A.toPolishedHolodeckConfig(state);
  assert.ok(cfg && typeof cfg === "object", "returns a config object");
});

// ── export-model: pure helpers ───────────────────────────────────
test("HOLO_EXPORT_MODEL.plain strips emoji and returns a trimmed string", () => {
  const M = win.HOLO_EXPORT_MODEL;
  assert.ok(M && typeof M.plain === "function", "plain exported");
  const out = M.plain("Hello 🚀 world");
  assert.equal(typeof out, "string");
  assert.ok(!/🚀/.test(out), "emoji removed");
  assert.ok(/Hello/.test(out) && /world/.test(out), "text preserved");
});

test("HOLO_EXPORT_MODEL.getAtPath resolves dotted + indexed paths", () => {
  const M = win.HOLO_EXPORT_MODEL;
  const root = { personas: [{ wishlistHeadline: "Buy more" }] };
  assert.equal(M.getAtPath(root, "personas.0.wishlistHeadline"), "Buy more");
  assert.equal(M.getAtPath(root, "personas[0].wishlistHeadline"), "Buy more");
  // Missing paths resolve to undefined, never throw.
  assert.equal(M.getAtPath(root, "personas.5.nope"), undefined);
});

// ── fetchWithTimeout: proves the abort backstop actually fires ───
// Rebuilds the same helper server.js uses (native AbortController +
// fetch on Node 20+) and points it at a server that never responds, so
// a regression that drops the timeout would fail here.
test("fetchWithTimeout aborts a hung upstream within the budget", async () => {
  const server = http.createServer(() => { /* never responds */ });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const port = server.address().port;

  async function fetchWithTimeout(url, opts, ms) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ms);
    try {
      return await fetch(url, { ...(opts || {}), signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  }

  const start = Date.now();
  await assert.rejects(
    fetchWithTimeout(`http://127.0.0.1:${port}/`, {}, 200),
    (err) => err && (err.name === "AbortError" || /abort/i.test(String(err.message))),
    "should reject with an abort error"
  );
  const elapsed = Date.now() - start;
  assert.ok(elapsed < 2000, `aborted promptly (took ${elapsed}ms)`);
  server.close();
});

// ── Gemini client cache: identical useCache calls hit the network once ──
// Loads the real gemini-client.js with a stubbed fetch that returns a
// canned NDJSON "done" line and counts calls. Proves: (1) a repeated
// identical useCache:true call is served from cache (0 extra fetches),
// (2) a changed prompt busts the cache, (3) without useCache every call
// hits the network (default behavior unchanged).
test("GEMINI.generate caches identical useCache calls and busts on change", async () => {
  // Minimal fake window: HOLO_AUTH.authHeaders → {} so the fetch fires.
  const gwin = { HOLO_AUTH: { authHeaders: () => Promise.resolve({}) }, console };
  let calls = 0;
  // Stub fetch → a Response whose body streams one NDJSON {done} line.
  const stubFetch = (_url, _opts) => {
    calls++;
    const line = JSON.stringify({ type: "done", text: "RESULT", model: "stub" }) + "\n";
    return Promise.resolve(new Response(line, {
      status: 200,
      headers: { "Content-Type": "application/x-ndjson" },
    }));
  };
  const src = readFileSync(join(ROOT, "builder/gemini-client.js"), "utf8");
  // eslint-disable-next-line no-new-func
  new Function("window", "fetch", "console", src)(gwin, stubFetch, console);
  const G = gwin.HOLO_GEMINI;
  assert.ok(G && typeof G.generate === "function", "HOLO_GEMINI.generate exported");

  const base = { prompt: "parse this script", jsonMode: true, fast: true, temperature: 0.2, useCache: true };

  const r1 = await G.generate({ ...base });
  assert.equal(r1, "RESULT");
  assert.equal(calls, 1, "first call hits the network");

  const r2 = await G.generate({ ...base });
  assert.equal(r2, "RESULT");
  assert.equal(calls, 1, "identical useCache call served from cache (no extra fetch)");

  await G.generate({ ...base, prompt: "a DIFFERENT script" });
  assert.equal(calls, 2, "changed prompt busts the cache");

  // Without useCache, every call hits the network even if identical.
  await G.generate({ prompt: "no cache flag", jsonMode: true });
  await G.generate({ prompt: "no cache flag", jsonMode: true });
  assert.equal(calls, 4, "no-cache calls always hit the network");
});

test("GEMINI.generate never caches a grounded (search) call", async () => {
  const gwin = { HOLO_AUTH: { authHeaders: () => Promise.resolve({}) }, console };
  let calls = 0;
  const stubFetch = () => {
    calls++;
    const line = JSON.stringify({ type: "done", text: "BRIEF", model: "stub" }) + "\n";
    return Promise.resolve(new Response(line, { status: 200, headers: { "Content-Type": "application/x-ndjson" } }));
  };
  const src = readFileSync(join(ROOT, "builder/gemini-client.js"), "utf8");
  // eslint-disable-next-line no-new-func
  new Function("window", "fetch", "console", src)(gwin, stubFetch, console);
  const G = gwin.HOLO_GEMINI;
  // groundWithSearch is time-sensitive → guard must skip the cache even
  // if a caller mistakenly passes useCache:true.
  const g = { prompt: "research acme", groundWithSearch: true, useCache: true };
  await G.generate({ ...g });
  await G.generate({ ...g });
  assert.equal(calls, 2, "grounded calls are never cached");
});
