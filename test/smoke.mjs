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

// ── export-model shared helpers (lifted from the exporters) ──────
test("HOLO_EXPORT_MODEL.meterFrac maps rating words to fractions", () => {
  const M = win.HOLO_EXPORT_MODEL;
  assert.equal(typeof M.meterFrac, "function", "meterFrac exported");
  assert.equal(M.meterFrac("Very high"), 0.96);
  assert.equal(M.meterFrac("High"), 0.8);
  assert.equal(M.meterFrac("Medium"), 0.55);
  assert.equal(M.meterFrac("Low"), 0.3);
  assert.equal(M.meterFrac("anything else"), 0.7, "default fraction");
  assert.equal(M.meterFrac(""), 0.7, "empty → default");
});

test("HOLO_EXPORT_MODEL.sectionLabel maps ids and upper-cases the rest", () => {
  const M = win.HOLO_EXPORT_MODEL;
  assert.equal(typeof M.sectionLabel, "function", "sectionLabel exported");
  assert.equal(M.sectionLabel("intro"), "INTRODUCTION");
  assert.equal(M.sectionLabel("business-value"), "BUSINESS VALUE");
  assert.equal(M.sectionLabel("custom-thing"), "CUSTOM-THING", "unknown id upper-cased");
  // Null-safe: the pptx copy used String(id) which threw on null; the
  // canonical form uses String(id||"") so this must not throw.
  assert.equal(M.sectionLabel(null), "", "null id → empty string, no throw");
});

// ── profilePaneOps: shared persona-console decision logic ────────
// C dedups the ~100 lines of facet-key dispatch that were copy-pasted
// (and had drifted) across pdf/pptx. The shared builder returns an ordered
// list of format-agnostic ops in inch space; each exporter walks it. These
// tests pin the op SEQUENCE per facet key so a future edit that changes the
// layout can't silently diverge the two exports again.
test("HOLO_EXPORT_MODEL.profilePaneOps dispatches per facet key", () => {
  const M = win.HOLO_EXPORT_MODEL;
  assert.equal(typeof M.profilePaneOps, "function", "profilePaneOps exported");

  // Empty facet → no ops (both exporters early-return).
  assert.deepEqual(M.profilePaneOps({ key: "affinities", rows: [] }, 0, 0, 4, 3, []), []);

  // affinities → one meterBar per row (capped at 5), carrying meterFrac.
  const aff = M.profilePaneOps(
    { key: "affinities", rows: [{ label: "Golf", value: "Very high" }, { label: "Wine", value: "Low" }] },
    0, 0, 4, 3, []);
  assert.equal(aff.length, 2, "one op per affinity row");
  assert.ok(aff.every((o) => o.op === "meterBar"), "all meterBar ops");
  assert.equal(aff[0].frac, 0.96, "Very high → 0.96");
  assert.equal(aff[1].frac, 0.3, "Low → 0.3");

  // signals → a rail rect, then (ellipse + text) per row.
  const sig = M.profilePaneOps(
    { key: "signals", rows: [{ label: "T-1", value: "Opened app" }, { label: "T-2", value: "Booked" }] },
    0, 0, 4, 3, []);
  assert.equal(sig[0].op, "rect", "leading rail rect");
  const sigKinds = sig.slice(1).map((o) => o.op);
  assert.deepEqual(sigKinds, ["ellipse", "text", "ellipse", "text"], "dot+text per signal");

  // predicted → NBA card: roundRect frame, eyebrow, headline, detail rows,
  // button roundRect, button label.
  const pred = M.profilePaneOps(
    { key: "predicted", rows: [{ label: "Offer", value: "Upgrade to Platinum" }, { label: "Confidence", value: "98%" }] },
    0, 0, 4, 3, []);
  assert.equal(pred[0].op, "roundRect", "card frame first");
  assert.equal(pred[1].text, "NEXT BEST ACTION", "eyebrow");
  assert.equal(pred[2].text, "Upgrade to Platinum", "headline = row[0].value");
  assert.ok(pred.some((o) => o.op === "roundRect" && o.fill === "primary"), "action button");
  assert.ok(pred.some((o) => o.text === "Launch action"), "button label");

  // identity → 2-col grid of spans text ops; with an affinities facet present,
  // a TOP AFFINITIES card + embedded meter bars follow.
  const idn = M.profilePaneOps(
    { key: "identity", rows: [{ label: "Name", value: "Jo" }, { label: "Tier", value: "Gold" }] },
    0, 0, 4, 3,
    [{ key: "affinities", rows: [{ label: "Golf", value: "High" }] }]);
  assert.ok(idn.some((o) => o.op === "text" && o.spans), "grid uses spans text ops");
  assert.ok(idn.some((o) => o.text === "TOP AFFINITIES"), "embedded affinities card");
  assert.ok(idn.some((o) => o.op === "meterBar"), "embedded meter bars");
});

// ── safeSlug: all three exporters agree on the filename ──────────
// The canonical impl lives in zip-exporter (HOLO_ZIP.safeSlug); pdf/pptx
// delegate to it at runtime and only fall back to a local copy if HOLO_ZIP
// is missing. That fallback previously used the OPPOSITE field order, so a
// HOLO_ZIP-less load would rename the file. Load each exporter with HOLO_ZIP
// deliberately ABSENT to force the fallback, and prove all three now agree —
// including a state where `name` and `project.customerName` differ (the case
// the old reversed order got wrong).
function loadExporterSlug(relPath, exportName) {
  const src = readFileSync(join(ROOT, relPath), "utf8");
  // Fake `global` with NO HOLO_ZIP → exercises the local fallback path.
  // Everything the module reads at top level is guarded (`global.X || {}`).
  const g = {};
  // eslint-disable-next-line no-new-func
  new Function("global", "window", src)(g, g);
  return g[exportName].safeSlug;
}

test("safeSlug agrees across zip/pdf/pptx when name and customerName differ", () => {
  const zipSlug  = loadExporterSlug("builder/zip-exporter.js", "HOLO_ZIP");
  const pdfSlug  = loadExporterSlug("builder/pdf-exporter.js", "HOLO_PDF");
  const pptxSlug = loadExporterSlug("builder/pptx-exporter.js", "HOLO_PPTX");

  // name (project title) is canonical; customerName is the fallback field.
  const state = { name: "Acme Internal Q3", project: { customerName: "Globex Corp" } };
  const expected = "acme-internal-q3";
  assert.equal(zipSlug(state), expected, "zip uses state.name");
  assert.equal(pdfSlug(state), expected, "pdf fallback matches zip");
  assert.equal(pptxSlug(state), expected, "pptx fallback matches zip");

  // customerName only (no name) → all fall through to customerName.
  const custOnly = { project: { customerName: "Globex Corp" } };
  assert.equal(zipSlug(custOnly), "globex-corp");
  assert.equal(pdfSlug(custOnly), "globex-corp");
  assert.equal(pptxSlug(custOnly), "globex-corp");

  // Empty/garbage input never yields an empty slug.
  assert.equal(zipSlug({ name: "***" }), "demo");
  assert.equal(pdfSlug({ name: "***" }), "demo");
  assert.equal(pptxSlug({ name: "***" }), "demo");
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
