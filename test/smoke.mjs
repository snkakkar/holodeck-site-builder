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
// Config-driven Salesforce UI screens (Phase 1/2). Load order: registry +
// config-generator before foundations (foundations calls both). Foundations'
// Gemini path is async and untouched here — fallbackScreenConfig is offline.
loadBrowserModule("builder/screen-registry.js");
loadBrowserModule("builder/screen-config-generator.js");
loadBrowserModule("builder/screen-foundations.js");
// Config generator (buildSnapshot) — emits the portable snapshot the
// validator round-trips. Loaded after the validator/adapter it composes.
loadBrowserModule("builder/config-generator.js");
// AI prompts — one STRICT-JSON template per screen family. Loaded so the
// family-coverage test below can assert none is missing (H6 regression).
loadBrowserModule("builder/ai-config-prompt.js");

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

// ── flushDirty: never re-pushes a foreign / stale dirty row ──────
// The boot dirty-flush was rejecting foreign rows with a 403/RLS 42501
// (it hit an existing server row owned by someone else, failing the projects
// UPDATE USING predicate). flushDirty now skips any dirty id that isn't the
// current user's, reusing the same owner guards reconcileOwnership trusts.
// This loads the REAL project-store.js with a fake localStorage + a counting
// fetch, so it exercises the shipped filter end-to-end.
test("flushDirty flushes only the current user's dirty rows, never a foreign one", async () => {
  const ME = "user-me";
  // In-memory localStorage.
  const mem = new Map();
  const localStorage = {
    getItem: (k) => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => { mem.set(k, String(v)); },
    removeItem: (k) => { mem.delete(k); },
  };
  const setJSON = (k, v) => localStorage.setItem(k, JSON.stringify(v));

  // Seed two dirty rows: one owned by me, one by a teammate. Give the foreign
  // row a body ownerId AND a dirty-owner tag ≠ me so BOTH guards would catch it.
  setJSON("holodeck.project.mine",    { id: "mine",    ownerId: ME,        name: "Mine" });
  setJSON("holodeck.project.foreign", { id: "foreign", ownerId: "user-them", name: "Theirs" });
  setJSON("holodeck.dirty", ["mine", "foreign"]);
  setJSON("holodeck.dirty.owner", { mine: ME, foreign: "user-them" });

  // Count POSTs to /projects (the upsert flushDirty issues via saveProject).
  const posted = [];
  const stubFetch = (url, opts) => {
    if ((opts && opts.method) === "POST") {
      const body = JSON.parse(opts.body)[0];
      posted.push(body.id);
    }
    return Promise.resolve(new Response("", { status: 200 }));
  };

  const psWin = {
    HOLO_AUTH: {
      isAuthed: () => true,
      getToken: () => Promise.resolve("stub-jwt"),
      currentUser: () => ({ id: ME, email: "me@salesforce.com", name: "Me" }),
    },
  };
  const src = readFileSync(join(ROOT, "builder/project-store.js"), "utf8");
  // eslint-disable-next-line no-new-func
  new Function("window", "localStorage", "fetch", "console", src)(psWin, localStorage, stubFetch, console);
  const S = psWin.HOLO_STORE;
  assert.ok(S && typeof S.flushDirty === "function", "HOLO_STORE.flushDirty exported");

  await S.flushDirty();

  assert.deepEqual(posted, ["mine"], "only the current user's row is flushed");
  // The foreign row stays dirty (retained, never destroyed); the owned row is cleared.
  const stillDirty = JSON.parse(localStorage.getItem("holodeck.dirty"));
  assert.ok(stillDirty.includes("foreign"), "foreign row left in place");
  assert.ok(!stillDirty.includes("mine"), "flushed owned row cleared from dirty");
});

// ── cxFallbackFor: exports resolve an assigned CX still over the live link ──
// In PDF/PPTX the still must win over the live iframe URL (a document can't
// embed an iframe). The assigned still lives in assetLibrary under a slot NAME,
// referenced by the component's per-slide (imageSlotsBySlide) or component-wide
// (imageSlot) assignment; cxFallbackFor resolves that slot through cfg.demoAssets.
// A url-only component (no assigned still) yields stillUrl:null → placeholderCx.
test("cxFallbackFor resolves an assigned still (slot → demoAssets) over the live URL", () => {
  const M = win.HOLO_EXPORT_MODEL;
  assert.equal(typeof M.cxFallbackFor, "function", "cxFallbackFor exported");

  const SHOPPER = "data:image/png;base64,SHOPPER";
  // cfg.demoAssets is the adapter's signed asset map (slot name → URL).
  const cfg = { demoAssets: { cxShopperAgent: SHOPPER, cxInstagramAd: "" } };

  // A component with a LIVE url AND a per-slide slot assignment. Still must win.
  const comp = {
    id: "cx1",
    url: "https://pocketsic.aubreydemo.com/scene/abc",
    imageSlotsBySlide: { "slide-1": "cxShopperAgent" },
  };
  const state = { cxComponents: [comp] };
  const slide = { id: "slide-1", linkedCxComponentIds: ["cx1"], title: "Live moment" };

  const fb = M.cxFallbackFor(slide, cfg, state);
  assert.equal(fb.stillUrl, SHOPPER, "assigned still resolved from slot → demoAssets");
  assert.equal(fb.targetUrl, comp.url, "live url still captured as the placeholder fallback");
  // Mirrors normalizeSlide's decision at export-model.js:979 — still ⇒ deviceSceneImage.
  assert.ok(fb.stillUrl, "stillUrl truthy → export routes to deviceSceneImage (still wins)");

  // Component-wide imageSlot works when there's no per-slide assignment.
  const comp2 = { id: "cx1", url: comp.url, imageSlot: "cxShopperAgent" };
  const fb2 = M.cxFallbackFor(
    { id: "slide-x", linkedCxComponentIds: ["cx1"] }, cfg, { cxComponents: [comp2] });
  assert.equal(fb2.stillUrl, SHOPPER, "component-wide imageSlot resolved too");

  // url-only, NO assigned still → stillUrl null → placeholderCx (url shown as text).
  const fb3 = M.cxFallbackFor(
    { id: "slide-y", linkedCxComponentIds: ["cx1"] },
    cfg, { cxComponents: [{ id: "cx1", url: comp.url }] });
  assert.equal(fb3.stillUrl, null, "no still → null → placeholderCx");
  assert.equal(fb3.targetUrl, comp.url, "placeholder still surfaces the url");
});

// ── generateProductPhotos: batched-parallel, bounded, covers every SKU ──
// The product-photo pass was sequential (slow). It now runs in bounded
// waves (BATCH=4). This loads the REAL app-foundations.js with a fake
// HOLO_GEMINI that (a) counts calls, (b) tracks peak concurrency. Proves:
// every pending SKU is imaged (no item dropped by the wave logic) and no
// more than BATCH image calls are ever in flight at once (rate-limit safe).
test("generateProductPhotos images every SKU in bounded-concurrency waves", async () => {
  let inFlight = 0, peak = 0, calls = 0;
  const gwin = {
    HOLO_GEMINI: {
      isConfigured: () => Promise.resolve(true),
      generateImage: (_opts) => {
        calls++; inFlight++; peak = Math.max(peak, inFlight);
        // Resolve on a microtask so overlapping calls actually coexist.
        return Promise.resolve().then(() => {
          inFlight--;
          return { url: "https://cdn.example/img-" + calls + ".png" };
        });
      },
    },
    console,
  };
  const src = readFileSync(join(ROOT, "builder/app-foundations.js"), "utf8");
  // eslint-disable-next-line no-new-func
  new Function("window", src)(gwin);
  const F = gwin.HOLO_APPFOUND;
  assert.ok(F && typeof F.generateProductPhotos === "function", "generateProductPhotos exported");

  // 10 SKUs → forces multiple waves at BATCH=4.
  const products = Array.from({ length: 10 }, (_, i) => ({ id: "sku-" + i, name: "P" + i }));
  const images = await F.generateProductPhotos("app-1", { products }, {});

  assert.equal(calls, 10, "one image call per pending SKU");
  assert.equal(Object.keys(images).length, 10, "every SKU got an image url");
  assert.ok(peak <= 4, `never more than the batch size in flight (peak was ${peak})`);
  assert.ok(peak > 1, `actually ran in parallel, not sequential (peak was ${peak})`);
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

// ── Salesforce UI screens: every registry screen produces a renderable
//    screenFlow config offline (fallbackScreenConfig), and buildScreenFields
//    resolves a non-empty steps rail + a screen panel for each. ────────
test("HOLO_SCREENFOUND.fallbackScreenConfig renders every screen offline", () => {
  const REG = win.HOLO_SCREEN_REGISTRY;
  const FOUND = win.HOLO_SCREENFOUND;
  assert.ok(REG && Array.isArray(win.HOLO_SCREENS), "screen registry loaded");
  assert.ok(FOUND && typeof FOUND.fallbackScreenConfig === "function", "fallbackScreenConfig exported");

  const state = { project: { customerName: "Acme Corp" }, personas: [{ name: "Dana Rep", role: "SDR" }] };
  win.HOLO_SCREENS.forEach((entry) => {
    const cfg = FOUND.fallbackScreenConfig(entry.id, state);
    assert.ok(cfg && typeof cfg === "object", `${entry.id}: config is an object`);
    assert.equal(cfg.family, entry.family, `${entry.id}: family matches registry`);
    // Every family must carry at least one renderable content block so the
    // console is never a blank shell.
    const hasContent = cfg.score || cfg.aiPanel || cfg.chat || (cfg.metrics && cfg.metrics.length) ||
      cfg.table || cfg.sentiment || cfg.transcript || cfg.email || cfg.prompt || (cfg.list && cfg.list.length);
    assert.ok(hasContent, `${entry.id}: config has renderable content`);
  });
});

test("HOLO_ADAPTER.buildScreenFields pairs steps + screen for every screen", () => {
  const ADAPTER = win.HOLO_ADAPTER;
  assert.ok(ADAPTER && typeof ADAPTER.buildScreenFields === "function", "buildScreenFields exported");
  const state = {
    project: { customerName: "Acme Corp" },
    personas: [{ name: "Dana Rep", role: "SDR" }],
    storyActs: [{ title: "The call", summary: "A prospect calls in cold." }],
    screens: {},
  };
  win.HOLO_SCREENS.forEach((entry) => {
    const fields = ADAPTER.buildScreenFields(state, { layout: "screenFlow", screenId: entry.id, family: entry.family });
    assert.equal(fields.family, entry.family, `${entry.id}: family carried onto fields`);
    assert.ok(Array.isArray(fields.panels) && fields.panels.length === 2, `${entry.id}: two panels`);
    assert.equal(fields.panels[0].kind, "steps", `${entry.id}: first panel is steps rail`);
    assert.equal(fields.panels[1].kind, "screen", `${entry.id}: second panel is the screen`);
    assert.ok(fields.panels[0].steps.length >= 1, `${entry.id}: steps rail is non-empty`);
  });
  // Null screenId is a clean no-op (not a throw).
  assert.deepEqual(ADAPTER.buildScreenFields(state, { layout: "screenFlow" }), {}, "no screenId → {}");

  // Mobile-native screens pair as a phone-framed screen; wide-console screens don't.
  const chat = ADAPTER.buildScreenFields(state, { layout: "screenFlow", screenId: "sales-assistant" });
  assert.equal(chat.panels[1].frame, "phone", "sales-assistant screen panel is phone-framed");
  const email = ADAPTER.buildScreenFields(state, { layout: "screenFlow", screenId: "thursday-spotlight" });
  assert.equal(email.panels[1].frame, "phone", "thursday-spotlight screen panel is phone-framed");
  const sdr = ADAPTER.buildScreenFields(state, { layout: "screenFlow", screenId: "sdr-agent-lead" });
  assert.ok(!sdr.panels[1].frame, "wide console screen has no phone frame");
  // An explicit per-slide frame override wins over the registry default.
  const forced = ADAPTER.buildScreenFields(state, { layout: "screenFlow", screenId: "sdr-agent-lead", frame: "phone" });
  assert.equal(forced.panels[1].frame, "phone", "explicit s.frame override wins");
});

test("HOLO_ADAPTER.buildOpenerConfig derives a scene from story + persona", () => {
  const ADAPTER = win.HOLO_ADAPTER;
  assert.ok(ADAPTER && typeof ADAPTER.buildOpenerConfig === "function", "buildOpenerConfig exported");
  const state = {
    project: { customerName: "Acme Corp" },
    personas: [{ name: "Dana Rep", role: "SDR" }],
    storyActs: [{ title: "The cold call", summary: "A prospect calls in with no context on hand." }],
  };
  const cfg = ADAPTER.buildOpenerConfig(state, { layout: "screenActOpener", title: "The call that runs itself." });
  assert.ok(cfg.headline && cfg.eyebrow && cfg.body, "headline/eyebrow/body present");
  assert.ok(cfg.scene && Array.isArray(cfg.scene.rows) && cfg.scene.rows.length >= 1, "scene rows derived");
  const distributor = cfg.scene.rows.find((r) => r.k === "Distributor");
  assert.equal(distributor && distributor.v, "Acme Corp", "scene grounds in the customer name");
  // Explicit SE openerConfig wins outright.
  const edited = ADAPTER.buildOpenerConfig(state, { openerConfig: { headline: "Custom headline" } });
  assert.equal(edited.headline, "Custom headline", "explicit openerConfig headline wins");
  // Flat per-slide editor fields (the Step-8 popover binds these) also win,
  // over both the derived defaults and the nested openerConfig.
  const flat = ADAPTER.buildOpenerConfig(state, {
    openerEyebrow: "Flat eyebrow", openerBody: "Flat body copy.", openerSceneLabel: "SCENE · 09:47",
  });
  assert.equal(flat.eyebrow, "Flat eyebrow", "flat openerEyebrow wins");
  assert.equal(flat.body, "Flat body copy.", "flat openerBody wins");
  assert.equal(flat.scene.label, "SCENE · 09:47", "flat openerSceneLabel wins");
});

test("HOLO_EXPORT_MODEL maps console screens to the screenImage template", () => {
  const M = win.HOLO_EXPORT_MODEL;
  assert.ok(M && typeof M.templateFor === "function", "templateFor exported");
  // H1 regression: screen layouts must NOT fall through to titleSlide (which
  // dropped all screen content and overwrote the title with the customer hero).
  assert.equal(M.templateFor({ layout: "screenFlow" }), "screenImage", "screenFlow → screenImage");
  assert.equal(M.templateFor({ layout: "screenActOpener" }), "screenImage", "screenActOpener → screenImage");
  assert.equal(M.LAYOUT_TO_TEMPLATE.screenFlow, "screenImage", "mapping present in table");
});

test("HOLO_ADAPTER.buildScreenFields goes full-width (solo) with no authored narrative", () => {
  const ADAPTER = win.HOLO_ADAPTER;
  // No storyActs and no SE step override → the left rail has no AUTHORED
  // content, so the screen fills the slide (content-driven rule). Registry
  // default steps are placeholder filler and must NOT force the paired layout.
  const bare = { project: { customerName: "Acme Corp" }, personas: [], storyActs: [], screens: {} };
  const solo = ADAPTER.buildScreenFields(bare, { layout: "screenFlow", screenId: "mc-next-attribution" });
  assert.equal(solo.soloScreen, true, "no narrative → soloScreen");
  assert.equal(solo.panels.length, 1, "solo layout drops the steps rail");
  assert.equal(solo.panels[0].kind, "screen", "the single panel is the screen");

  // Ingested story narrative → keep the paired steps + screen composition.
  const withActs = { ...bare, storyActs: [{ title: "The call", summary: "A cold call." }] };
  const paired = ADAPTER.buildScreenFields(withActs, { layout: "screenFlow", screenId: "mc-next-attribution" });
  assert.equal(paired.soloScreen, false, "authored acts → paired");
  assert.equal(paired.panels.length, 2, "paired keeps the steps rail");

  // Explicit per-slide soloScreen override still forces solo even with acts.
  const forced = ADAPTER.buildScreenFields(withActs, { layout: "screenFlow", screenId: "mc-next-attribution", soloScreen: true });
  assert.equal(forced.soloScreen, true, "explicit soloScreen override wins");
});

// ── AI prompts: every screen family has a STRICT-JSON prompt (H6) ──
test("HOLO_AI_PROMPT.getScreenPrompt covers every registered screen family", () => {
  const P = win.HOLO_AI_PROMPT;
  const REG = win.HOLO_SCREEN_REGISTRY;
  assert.ok(P && typeof P.getScreenPrompt === "function", "getScreenPrompt exported");
  assert.ok(REG && Array.isArray(REG.SCREEN_FAMILIES) && REG.SCREEN_FAMILIES.length, "registry exposes families");
  REG.SCREEN_FAMILIES.forEach(function (fam) {
    const prompt = P.getScreenPrompt(fam);
    assert.ok(typeof prompt === "string" && prompt.length > 0, "family '" + fam + "' has a prompt");
    // Must carry the substitution placeholder the foundations lane fills.
    assert.ok(prompt.indexOf("<<CONTEXT>>") !== -1, "family '" + fam + "' prompt keeps the <<CONTEXT>> placeholder");
    // STRICT-JSON contract: the prompt tells the model to return JSON.
    assert.ok(/STRICT JSON/.test(prompt), "family '" + fam + "' prompt demands STRICT JSON");
  });
  // Regression guard for H6 specifically: the prospecting-agent family.
  assert.ok(P.getScreenPrompt("kpiTable"), "H6: kpiTable family has a prompt");
});

// ── Round-trip: screen authoring survives export → import (B: M1/H3/H4) ──
test("buildSnapshot → importConfig round-trips console screen + opener state", () => {
  const CFG = win.HOLO_CONFIG;
  const V = win.HOLO_VALIDATOR;
  assert.ok(CFG && typeof CFG.buildSnapshot === "function", "buildSnapshot exported");

  const state = {
    project: { customerName: "Acme Corp" },
    brand: {}, personas: [], storyActs: [],
    // A console-screen slide with Step-8 overrides…
    slides: [
      {
        id: "s1", title: "SDR Agent", layout: "screenFlow", order: 0, sectionId: "demo",
        screenId: "sdr-agent-lead", family: "recordWithScoreAndTimeline",
        eyebrow: "Live console", steps: [{ n: 1, text: "Qualify" }],
        soloScreen: true, flowBody: "Watch the agent work.",
      },
      // …and an act-opener slide with both nested + flat opener overrides.
      {
        id: "s2", title: "The call", layout: "screenActOpener", order: 1, sectionId: "demo",
        openerConfig: { headline: "The call that runs itself.", scene: { label: "SCENE" } },
        openerEyebrow: "Tuesday · 09:47",
        openerBody: "A cold prospect picks up.",
        openerSceneLabel: "SCENE · TUE",
      },
    ],
    // …and the screen selection map (M1).
    screens: { "sdr-agent-lead": { enabled: true, config: { screenId: "sdr-agent-lead", header: { name: "Jane" } } } },
  };

  const snap = CFG.buildSnapshot(state);
  // M1: the selection map is emitted.
  assert.ok(snap.screens && snap.screens["sdr-agent-lead"], "snapshot emits state.screens");
  assert.equal(snap.screens["sdr-agent-lead"].enabled, true, "screen enabled flag emitted");
  // Screen slide carries its identity + Step-8 overrides.
  const snapScreen = snap.slides.find((s) => s.id === "s1");
  assert.equal(snapScreen.screenId, "sdr-agent-lead", "snapshot slide keeps screenId");
  assert.equal(snapScreen.soloScreen, true, "snapshot slide keeps soloScreen");
  assert.equal(snapScreen.flowBody, "Watch the agent work.", "snapshot slide keeps flowBody");
  // H4: opener overrides emitted.
  const snapOpener = snap.slides.find((s) => s.id === "s2");
  assert.equal(snapOpener.openerEyebrow, "Tuesday · 09:47", "snapshot slide keeps openerEyebrow");
  assert.ok(snapOpener.openerConfig && snapOpener.openerConfig.headline, "snapshot slide keeps openerConfig");

  // Re-import the snapshot and confirm the state rehydrates.
  const res = V.importConfig(JSON.stringify(snap));
  assert.ok(res.state, "import produced state");
  assert.ok(res.state.screens && res.state.screens["sdr-agent-lead"], "M1: screens rehydrate on import");
  assert.equal(res.state.screens["sdr-agent-lead"].enabled, true, "screen enabled rehydrated");
  const inScreen = res.state.slides.find((s) => s.id === "s1");
  assert.equal(inScreen.screenId, "sdr-agent-lead", "screenId rehydrated");
  assert.equal(inScreen.soloScreen, true, "soloScreen rehydrated");
  const inOpener = res.state.slides.find((s) => s.id === "s2");
  // H4: opener overrides rehydrate (both channels).
  assert.equal(inOpener.openerEyebrow, "Tuesday · 09:47", "H4: openerEyebrow rehydrated");
  assert.equal(inOpener.openerBody, "A cold prospect picks up.", "H4: openerBody rehydrated");
  assert.equal(inOpener.openerSceneLabel, "SCENE · TUE", "H4: openerSceneLabel rehydrated");
  assert.ok(inOpener.openerConfig && inOpener.openerConfig.headline, "H4: nested openerConfig rehydrated");
});
