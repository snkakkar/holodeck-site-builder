// ════════════════════════════════════════════════════════════════
//  render-harness.mjs — headless render check for screenFlow families
//
//  demo-deck-renderer.js is one self-invoking browser IIFE: it reads
//  window.HOLODECK_CONFIG, grabs #demo-wrap, and appends one .pslide per
//  slide. There is no exported render fn, so to exercise the private
//  sfPanel* builders we hand it a minimal DOM + a HOLODECK_CONFIG whose
//  builderPlan.slides is one screenFlow slide per family, then read back
//  the produced #demo-wrap HTML.
//
//  This is a DEV harness (not part of `npm test`) — it lets the rebuild
//  be verified section-by-section against the reference screens by
//  asserting the expected DOM markers appear for each family.
// ════════════════════════════════════════════════════════════════
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

// ── Minimal DOM ────────────────────────────────────────────────
// Implements exactly the surface el() and the renderer use: createElement,
// className, innerHTML (stored raw), textContent, setAttribute, style,
// appendChild, createTextNode, getElementById, plus outerHTML serialization.
const VOID = new Set(["br", "img", "input", "hr", "meta", "link"]);
function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }

class TextNode {
  constructor(t) { this.text = t == null ? "" : String(t); this.nodeType = 3; }
  get outerHTML() { return esc(this.text); }
}
class El {
  constructor(tag) {
    this.tagName = tag;
    this.children = [];
    this.attrs = {};
    this.className = "";
    this._html = null;
    this._text = null;
    this._style = {};
    this.style = new Proxy(this._style, {
      set: (t, k, v) => { if (k !== "cssText") t[k] = v; return true; },
      get: (t, k) => (k === "cssText" ? Object.keys(t).map((p) => `${p}:${t[p]}`).join(";") : t[k]),
    });
    this.nodeType = 1;
  }
  setAttribute(k, v) { this.attrs[k] = v; }
  getAttribute(k) { return this.attrs[k] == null ? null : this.attrs[k]; }
  addEventListener() {}
  removeEventListener() {}
  querySelector() { return null; }
  querySelectorAll() { return []; }
  get firstChild() { return this.children[0] || null; }
  appendChild(c) { this.children.push(c); this._text = null; this._html = null; return c; }
  set textContent(v) { this._text = v == null ? "" : String(v); this.children = []; this._html = null; }
  get textContent() {
    if (this._text != null) return this._text;
    if (this._html != null) return this._html.replace(/<[^>]*>/g, "");
    return this.children.map((c) => (c instanceof TextNode ? c.text : c.textContent)).join("");
  }
  set innerHTML(v) { this._html = v == null ? "" : String(v); this.children = []; this._text = null; }
  get innerHTML() {
    if (this._html != null) return this._html;
    if (this._text != null) return esc(this._text);
    return this.children.map((c) => c.outerHTML).join("");
  }
  get outerHTML() {
    const cls = this.className ? ` class="${esc(this.className)}"` : "";
    const st = this.style.cssText ? ` style="${esc(this.style.cssText)}"` : "";
    const at = Object.keys(this.attrs).map((k) => ` ${k}="${esc(this.attrs[k])}"`).join("");
    if (VOID.has(this.tagName)) return `<${this.tagName}${cls}${st}${at}>`;
    return `<${this.tagName}${cls}${st}${at}>${this.innerHTML}</${this.tagName}>`;
  }
}

const registry = {};
const document = {
  createElement: (tag) => new El(tag),
  createTextNode: (t) => new TextNode(t),
  getElementById: (id) => registry[id] || null,
  querySelector: () => null,
  addEventListener: () => {},
};

globalThis.document = document;
globalThis.window = globalThis;
globalThis.requestAnimationFrame = (fn) => { fn && fn(0); return 0; };
globalThis.setTimeout = (fn) => { return 0; }; // suppress live-transcript timers
globalThis.setInterval = () => 0;
globalThis.clearInterval = () => {};
globalThis.clearTimeout = () => {};

// ── Load shared + config-generator (for building configs) ──────
function loadBrowser(relPath) {
  const src = readFileSync(join(ROOT, relPath), "utf8");
  const run = new Function("window", "globalThis", "document", src);
  run(globalThis, globalThis, document);
}
loadBrowser("builder/holodeck-shared.js");
loadBrowser("builder/screen-registry.js");
loadBrowser("builder/screen-config-generator.js");
loadBrowser("builder/screen-foundations.js");

const REG = globalThis.HOLO_SCREENS || [];
const FOUND = globalThis.HOLO_SCREENFOUND;

// Build a screenFlow slide (steps + screen panel) per screen id, using the
// OFFLINE fallback config so no network is needed.
const state = {
  project: { customerName: "Northlake Promo Group" },
  brand: {}, personas: [{ name: "AE", role: "Account Executive" }],
  products: [], storyActs: [], storyFoundations: {}, screens: {},
};

export function renderScreen(screenId) {
  const entry = REG.find((e) => e.id === screenId);
  if (!entry) throw new Error("unknown screen " + screenId);
  const gen = FOUND.fallbackScreenConfig(screenId, { state });
  const config = gen && gen.config ? gen.config : gen;
  const slide = {
    sectionId: "demo", layout: "screenFlow",
    screenId: screenId, family: entry.family,
    title: entry.label, eyebrow: entry.label,
    steps: [{ n: 1, body: "Step one." }, { n: 2, body: "Step two." }, { n: 3, body: "Step three." }],
    panels: [
      { kind: "steps", steps: [{ n: 1, body: "Step one." }, { n: 2, body: "Step two." }] },
      { kind: "screen", family: entry.family, config: config },
    ],
  };
  return renderSlide(slide);
}

export function renderSlide(slide) {
  // Fresh #demo-wrap each call.
  const wrap = new El("div");
  registry["demo-wrap"] = wrap;
  globalThis.HOLODECK_CONFIG = {
    customer: { name: state.project.customerName },
    brand: {},
    builderPlan: { slides: [slide], storyActs: [], storyFoundations: {}, personas: state.personas, products: [] },
  };
  // Re-load the renderer IIFE fresh (it runs on load, consuming the config).
  loadBrowser("demo/js/demo-deck-renderer.js");
  return wrap.outerHTML;
}

export { REG, FOUND };

// CLI: `node test/render-harness.mjs <screenId>` prints the produced HTML.
if (process.argv[1] && process.argv[1].endsWith("render-harness.mjs")) {
  const id = process.argv[2];
  if (id) {
    console.log(renderScreen(id));
  } else {
    for (const e of REG) {
      const html = renderScreen(e.id);
      console.log(`\n===== ${e.id} (${e.family}) len=${html.length} =====`);
      console.log(html.slice(0, 400));
    }
  }
}
