// MEASURE the exact fidelity bug: a console screen renders SPARSE in the PDF
// (empty "Caller details / Agent assist" placeholder columns) because the
// EXPORT/PREVIEW path consumes buildSlideManifest directly — and the manifest
// used to emit screenFlow slides with only {screenId, family}, no panels[].
// renderScreenFlow then synthesized `config:{}` → sfBuildFamily got an empty
// config → every body column collapsed to sfEmptyCol().
//
// This harness runs the REAL buildSlideManifest on the user's measured state
// (screenFlow slides in state.slides, state.screens undefined) and asserts, per
// screen slide:
//   1. the manifest slide now carries panels[] (derived via buildScreenFields)
//   2. the screen panel's config is POPULATED (not {})
//   3. renderScreenFlow(slide) produces DOM with NO sf-card-empty placeholder
// If any fail, the console would render sparse in the PDF.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const VOID = new Set(["br", "img", "input", "hr", "meta", "link"]);
function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
class TextNode { constructor(t) { this.text = t == null ? "" : String(t); this.nodeType = 3; } get outerHTML() { return esc(this.text); } }
class El {
  constructor(tag) { this.tagName = tag; this.children = []; this.attrs = {}; this.className = ""; this._html = null; this._text = null; this._style = {};
    this.style = new Proxy(this._style, { set: (t, k, v) => { if (k !== "cssText") t[k] = v; return true; }, get: (t, k) => (k === "cssText" ? "" : (k === "setProperty" ? (kk, vv) => { t[kk] = vv; } : t[k])) }); this.nodeType = 1; }
  setAttribute(k, v) { this.attrs[k] = v; } getAttribute(k) { return this.attrs[k] == null ? null : this.attrs[k]; }
  setProperty(k, v) { this._style[k] = v; } addEventListener() {} removeEventListener() {}
  querySelector() { return null; } querySelectorAll() { return []; }
  appendChild(c) { this.children.push(c); this._text = null; this._html = null; return c; }
  set textContent(v) { this._text = v == null ? "" : String(v); this.children = []; }
  get textContent() { if (this._text != null) return this._text; return this.children.map((c) => (c instanceof TextNode ? c.text : c.textContent)).join(""); }
  set innerHTML(v) { this._html = v == null ? "" : String(v); this.children = []; }
  get innerHTML() { if (this._html != null) return this._html; if (this._text != null) return esc(this._text); return this.children.map((c) => c.outerHTML).join(""); }
  get outerHTML() { const cls = this.className ? ` class="${esc(this.className)}"` : ""; const at = Object.keys(this.attrs).map((k) => ` ${k}="${esc(this.attrs[k])}"`).join("");
    if (VOID.has(this.tagName)) return `<${this.tagName}${cls}${at}>`; return `<${this.tagName}${cls}${at}>${this.innerHTML}</${this.tagName}>`; }
}
const registry = {};
const document = { createElement: (t) => new El(t), createTextNode: (t) => new TextNode(t), getElementById: (id) => registry[id] || null, querySelector: () => null, querySelectorAll: () => [], addEventListener: () => {} };
globalThis.document = document; globalThis.window = globalThis;
globalThis.requestAnimationFrame = (fn) => { fn && fn(0); return 0; };
globalThis.setTimeout = () => 0; globalThis.setInterval = () => 0; globalThis.clearInterval = () => {}; globalThis.clearTimeout = () => {};

function loadBrowser(relPath) { const src = readFileSync(join(ROOT, relPath), "utf8"); new Function("window", "globalThis", "document", src)(globalThis, globalThis, document); }

// Production load order (screen-registry BEFORE shared, adapter after).
loadBrowser("builder/screen-registry.js");
loadBrowser("builder/holodeck-shared.js");
loadBrowser("builder/holodeck-adapter.js");
loadBrowser("builder/screen-config-generator.js");
loadBrowser("builder/screen-foundations.js");
globalThis.HOLODECK_CONFIG = undefined;
loadBrowser("demo/js/demo-deck-renderer.js");

const SHARED = globalThis.HOLO_SHARED;
const DEMO = globalThis.HOLO_DEMO;
const REG = globalThis.HOLO_SCREENS || (globalThis.HOLO_SCREEN_REGISTRY && globalThis.HOLO_SCREEN_REGISTRY.SCREENS) || [];

// The user's measured state: screenFlow slides in state.slides, screens undefined.
const state = {
  project: { customerName: "Northlake Promo Group", name: "Northlake" },
  brand: { primary: "#0176D3" },
  personas: [{ name: "AE", role: "Account Executive" }],
  products: [],
  storyActs: [{ title: "The call", summary: "A cold call that closes itself." }],
  storyFoundations: {},
  slides: REG.map(function (e) {
    return { id: "screen-" + e.id, title: e.label, layout: "screenFlow",
      sectionId: "sf-ui", screenId: e.id, family: e.family, selectionStatus: "recommended" };
  }),
  // state.screens intentionally OMITTED (mirrors the anomaly).
};

const manifest = SHARED.buildSlideManifest(state);
const screenSlides = manifest.filter((s) => s.layout === "screenFlow");

let pass = 0, fail = 0;
for (const sl of screenSlides) {
  const hasPanels = Array.isArray(sl.panels) && sl.panels.length > 0;
  const screenPanel = hasPanels ? sl.panels.find((p) => p.kind === "screen") : null;
  const cfg = screenPanel && screenPanel.config;
  const cfgKeys = cfg && typeof cfg === "object" ? Object.keys(cfg) : [];
  // A real config has more than just {screenId, family} — it has body atoms.
  const cfgPopulated = cfgKeys.length > 2;

  let html = "";
  try { const node = DEMO.renderScreenFlow(sl, state, { brand: {} }); html = (node && node.outerHTML) || ""; } catch (e) { html = "THREW:" + e.message; }
  const hasEmptyCol = html.includes("sf-card-empty");
  const hasSfScreen = html.includes("sf-screen");

  const ok = hasPanels && cfgPopulated && hasSfScreen && !hasEmptyCol;
  if (ok) pass++;
  else { fail++;
    console.error(`FAIL ${sl.screenId}: panels=${hasPanels} cfgKeys=${cfgKeys.length}(${cfgKeys.slice(0,6).join(",")}) sfScreen=${hasSfScreen} emptyCol=${hasEmptyCol}`);
  }
}
console.log(`\nmanifest screenFlow slides: ${screenSlides.length} | full-config render: ${pass} pass, ${fail} fail`);
console.log(pass && !fail
  ? "RESULT: every console carries a populated panel config and renders NO empty placeholder columns → PDF captures full-fidelity consoles."
  : "RESULT: at least one console would render SPARSE (empty columns) in the PDF.");
process.exit(fail ? 1 : 0);
