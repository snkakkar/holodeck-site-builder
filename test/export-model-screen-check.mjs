// MEASURE the real buildExportModel → PDF boundary for a console-screen deck.
// The smoke suite explicitly skips async buildExportModel (needs <img>/canvas),
// which is exactly where the "nothing in the PDF for console elements" bug can
// hide. This harness shims just enough of the browser (document/Image/canvas/
// XMLSerializer) to run the REAL buildExportModel(state) on a state that has a
// console screen selected, then reports, per slide:
//   • is a screenImage slide present in model.slides at all?
//   • did captureScreenImage produce an .image dataUrl, or null (and why)?
// It does NOT assert a pass/fail on the raster (that needs a real browser) — it
// reports facts so we can see WHERE the chain breaks instead of guessing.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

// ── Minimal DOM the renderer + capture path touch ────────────────────────────
const VOID = new Set(["br", "img", "input", "hr", "meta", "link"]);
function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
class TextNode { constructor(t) { this.text = t == null ? "" : String(t); this.nodeType = 3; } get outerHTML() { return esc(this.text); } }
class El {
  constructor(tag) {
    this.tagName = tag; this.children = []; this.attrs = {}; this.className = ""; this._html = null; this._text = null;
    this._style = {}; this.parentNode = null; this.nodeType = 1;
    this.style = new Proxy(this._style, {
      set: (t, k, v) => { if (k === "cssText") { this._cssText = v; } else t[k] = v; return true; },
      get: (t, k) => (k === "cssText" ? (this._cssText || "") : (k === "setProperty" ? (kk, vv) => { t[kk] = vv; } : t[k])),
    });
  }
  setAttribute(k, v) { this.attrs[k] = v; } getAttribute(k) { return this.attrs[k] == null ? null : this.attrs[k]; }
  addEventListener() {} removeEventListener() {}
  querySelector() { return null; } querySelectorAll() { return []; }
  appendChild(c) { c.parentNode = this; this.children.push(c); this._text = null; this._html = null; return c; }
  removeChild(c) { const i = this.children.indexOf(c); if (i >= 0) this.children.splice(i, 1); if (c) c.parentNode = null; return c; }
  set textContent(v) { this._text = v == null ? "" : String(v); this.children = []; }
  get textContent() { if (this._text != null) return this._text; return this.children.map((c) => (c instanceof TextNode ? c.text : c.textContent)).join(""); }
  set innerHTML(v) { this._html = v == null ? "" : String(v); this.children = []; }
  get innerHTML() { if (this._html != null) return this._html; if (this._text != null) return esc(this._text); return this.children.map((c) => c.outerHTML).join(""); }
  get outerHTML() {
    const cls = this.className ? ` class="${esc(this.className)}"` : "";
    const at = Object.keys(this.attrs).map((k) => ` ${k}="${esc(this.attrs[k])}"`).join("");
    if (VOID.has(this.tagName)) return `<${this.tagName}${cls}${at}>`;
    return `<${this.tagName}${cls}${at}>${this.innerHTML}</${this.tagName}>`;
  }
}
const body = new El("body");
const registry = {}; // NO demo-wrap: this is the builder page.
const document = {
  createElement: (t) => new El(t),
  createTextNode: (t) => new TextNode(t),
  getElementById: (id) => registry[id] || null,
  querySelector: () => null, querySelectorAll: () => [],
  addEventListener: () => {}, body,
  styleSheets: [], // collectScreenCss iterates this
};
document.body = body;

let rasterAttempts = 0, imgLoads = 0;
globalThis.XMLSerializer = class { serializeToString(node) { return node && node.outerHTML || ""; } };
// canvas → drawImage → toDataURL: return a valid-looking PNG data URL so we can
// see whether the chain would embed a real image (the raster fidelity itself
// needs a browser; here we only test that the pipeline RUNS end-to-end).
globalThis.HTMLCanvasElement = El;
const realCreate = document.createElement;
document.createElement = function (t) {
  const e = realCreate(t);
  if (t === "canvas") { e.getContext = () => ({ fillRect() {}, drawImage() {}, fillStyle: "", }); e.toDataURL = () => "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+P+/HgAFhAJ/wlseKgAAAABJRU5ErkJggg=="; }
  return e;
};
// Image: onload fires as soon as .src is set (jsdom-free stand-in).
globalThis.Image = class { constructor() { this.onload = null; this.onerror = null; } set src(v) { imgLoads++; if (this.onload) queueMicrotask(() => this.onload()); } get src() { return this._src; } };
globalThis.document = document;
globalThis.window = globalThis;
globalThis.requestAnimationFrame = (fn) => { fn && fn(0); return 0; };
globalThis.setTimeout = (fn) => { if (typeof fn === "function") queueMicrotask(fn); return 0; };
globalThis.setInterval = () => 0; globalThis.clearInterval = () => {}; globalThis.clearTimeout = () => {};

function loadBrowser(relPath) { const src = readFileSync(join(ROOT, relPath), "utf8"); new Function("window", "globalThis", "document", src)(globalThis, globalThis, document); }

// Production load order.
loadBrowser("builder/holodeck-shared.js");
loadBrowser("builder/holodeck-adapter.js");
loadBrowser("builder/import-validator.js");
loadBrowser("builder/export-model.js");
loadBrowser("builder/screen-registry.js");
loadBrowser("builder/screen-config-generator.js");
loadBrowser("builder/screen-foundations.js");
// The renderer (registers HOLO_DEMO.renderScreenFlow). No #demo-wrap present.
globalThis.HOLODECK_CONFIG = undefined;
loadBrowser("demo/js/demo-deck-renderer.js");

const MODEL = globalThis.HOLO_EXPORT_MODEL;
if (!MODEL || typeof MODEL.buildExportModel !== "function") { console.error("FAIL: buildExportModel not exported"); process.exit(1); }
console.log("HOLO_DEMO.renderScreenFlow present:", typeof (globalThis.HOLO_DEMO && globalThis.HOLO_DEMO.renderScreenFlow) === "function");

// A state with a console screen SELECTED. Mirror what the builder persists:
// screens[id] = { enabled, config }, plus a storyAct so the manifest emits it.
const REG = globalThis.HOLO_SCREENS || (globalThis.HOLO_SCREEN_REGISTRY && globalThis.HOLO_SCREEN_REGISTRY.SCREENS) || [];
const FOUND = globalThis.HOLO_SCREENFOUND;
const sample = REG.find((e) => e.id === "sdr-agent-lead") || REG[0];
const gen = FOUND.fallbackScreenConfig(sample.id, { state: { project: { customerName: "Northlake Promo Group" }, personas: [{ name: "AE", role: "Account Executive" }] } });
const config = gen && gen.config ? gen.config : gen;

const state = {
  project: { customerName: "Northlake Promo Group", name: "Northlake" },
  brand: { primary: "#0176D3" },
  personas: [{ name: "AE", role: "Account Executive" }],
  products: [],
  storyActs: [{ title: "The call", summary: "A cold call that closes itself." }],
  storyFoundations: {},
  // The persisted shape: a screenFlow slide in state.slides (what the builder
  // writes when a screen is selected in Step 5), PLUS the screens selection map.
  // REPRODUCE THE USER'S REAL STATE (measured via HOLO_STORE.loadProject):
  //   • 12 screenFlow slides in state.slides (all selected screens materialized)
  //   • state.screens === undefined  ← the observed anomaly
  // We build one screenFlow slide per registered screen, exactly as
  // buildSlidePlanFromSelections writes them, and leave state.screens OFF.
  slides: REG.map(function (e, i) {
    return {
      id: "screen-" + e.id, title: e.label, layout: "screenFlow",
      sectionId: "sf-ui", screenId: e.id, family: e.family,
      selectionStatus: "recommended", capabilities: [], assets: [],
    };
  }),
  // state.screens intentionally OMITTED to mirror the user's `undefined`.
};

MODEL.buildExportModel(state).then(function (model) {
  console.log("\nmodel.slides count:", model.slides.length);
  const screenSlides = model.slides.filter((s) => s.template === "screenImage");
  console.log("screenImage slides:", screenSlides.length);
  if (!screenSlides.length) {
    console.error("\n*** ROOT CAUSE CANDIDATE: no screenImage slide in the export model.");
    console.error("    Layouts present:", model.slides.map((s) => s.layout + "→" + s.template).join(", "));
    process.exit(2);
  }
  let withImg = 0, withoutImg = 0;
  screenSlides.forEach(function (s, i) {
    const has = !!(s.image && s.image.dataUrl);
    if (has) withImg++; else withoutImg++;
    console.log(`[#${i}] ${s.layout} title=${JSON.stringify(s.title)} img=${has ? ("dataUrl " + s.image.dataUrl.length + " " + s.image.w + "x" + s.image.h) : "NULL→placeholder"}`);
  });
  console.log(`\nwith image: ${withImg} · null (placeholder): ${withoutImg}`);
  console.log(`\nraster: imgLoads=${imgLoads}`);
  console.log("\nRESULT: buildExportModel produced", screenSlides.length, "console slide(s). PDF WILL render at least header+placeholder for each.");
  process.exit(0);
}).catch(function (e) {
  console.error("\n*** buildExportModel REJECTED:", e && e.stack || e);
  process.exit(3);
});
