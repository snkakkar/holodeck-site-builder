// Reproduces the BUILDER-PAGE export capture path: no #demo-wrap present, then
// call window.HOLO_DEMO.renderScreenFlow (what export-model.js captureScreenImage
// calls). Before the fix this returned null (RENDERERS undefined behind the early
// #demo-wrap return) → blank consoles in the PDF. After the fix it must return a
// real .sf-screen node.
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
    this.style = new Proxy(this._style, { set: (t, k, v) => { if (k !== "cssText") t[k] = v; return true; }, get: (t, k) => (k === "cssText" ? "" : t[k]) }); this.nodeType = 1; }
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
const registry = {}; // NO "demo-wrap" registered — this is the builder page.
const document = { createElement: (t) => new El(t), createTextNode: (t) => new TextNode(t), getElementById: (id) => registry[id] || null, querySelector: () => null, addEventListener: () => {} };
globalThis.document = document; globalThis.window = globalThis;
globalThis.requestAnimationFrame = (fn) => { fn && fn(0); return 0; };
globalThis.setTimeout = () => 0; globalThis.setInterval = () => 0; globalThis.clearInterval = () => {}; globalThis.clearTimeout = () => {};

function loadBrowser(relPath) { const src = readFileSync(join(ROOT, relPath), "utf8"); new Function("window", "globalThis", "document", src)(globalThis, globalThis, document); }

loadBrowser("builder/holodeck-shared.js");
loadBrowser("builder/screen-registry.js");
loadBrowser("builder/screen-config-generator.js");
loadBrowser("builder/screen-foundations.js");

// Load the renderer WITHOUT a #demo-wrap (builder-page condition). It must NOT
// throw and must register HOLO_DEMO.renderScreenFlow with a working RENDERERS.
globalThis.HOLODECK_CONFIG = undefined; // builder page has no deck config
loadBrowser("demo/js/demo-deck-renderer.js");

if (!globalThis.HOLO_DEMO || typeof globalThis.HOLO_DEMO.renderScreenFlow !== "function") {
  console.error("FAIL: HOLO_DEMO.renderScreenFlow not registered on builder page"); process.exit(1);
}

const REG = globalThis.HOLO_SCREENS || [];
const FOUND = globalThis.HOLO_SCREENFOUND;
const state = { project: { customerName: "Northlake Promo Group" }, brand: {}, personas: [{ name: "AE", role: "Account Executive" }], products: [], storyActs: [], storyFoundations: {}, screens: {} };

let pass = 0, fail = 0;
for (const entry of REG) {
  const gen = FOUND.fallbackScreenConfig(entry.id, { state });
  const config = gen && gen.config ? gen.config : gen;
  const slide = { sectionId: "demo", layout: "screenFlow", screenId: entry.id, family: entry.family,
    title: entry.label, eyebrow: entry.label,
    panels: [{ kind: "steps", steps: [{ n: 1, body: "One." }] }, { kind: "screen", family: entry.family, config }] };
  let node = null, err = null;
  try { node = globalThis.HOLO_DEMO.renderScreenFlow(slide, state, { brand: {} }); } catch (e) { err = e; }
  const html = node && node.outerHTML || "";
  const ok = !err && node && html.includes("sf-screen");
  if (ok) pass++; else { fail++; console.error(`FAIL ${entry.id}: err=${err && err.message} nodeNull=${!node} hasSfScreen=${html.includes("sf-screen")}`); }
}
console.log(`renderScreenFlow on builder page (no #demo-wrap): ${pass} pass, ${fail} fail (of ${REG.length} screens)`);
process.exit(fail ? 1 : 0);
