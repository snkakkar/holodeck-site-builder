// ════════════════════════════════════════════════════════════════
//  export-model.js — HOLO_EXPORT_MODEL
//
//  ONE normalization layer that both file exporters (PPTX, PDF) build
//  from, so the resolution logic lives in exactly one place and both
//  formats carry the SAME words + structured data + brand as /demo.
//
//  buildExportModel(state) → Promise<{ meta, brand, slides:[NormalizedSlide] }>
//
//  Pipeline (mirrors what /demo consumes):
//    1. STORE.signAssets(state)            — rehydrate GCS tokens → signed URLs
//    2. HOLO_ADAPTER.toPolishedHolodeckConfig(state)
//                                          — demo-identical structured payload
//                                            (persona, journey, bvs, timeline,
//                                             orbitNodes, poweredBy, brand,
//                                             demoAssets, …)
//    3. HOLO_SHARED.buildSlideManifest(state)
//                                          — the FULL ordered deck (intro →
//                                            journey-map → meet-persona → demo →
//                                            business-value), honoring Step-5
//                                            selection + reorder
//    4. per slide: map layout → template, resolve copy with the SAME
//       precedence the preview/demo use (stored || prefill || placeholder),
//       pull template-specific structured data from the adapter cfg +
//       shared generators, resolve the image slot → signed URL, carry notes.
//
//  Pure/no-DOM (except an offscreen <img> to measure image dimensions,
//  and FileReader for data-URL conversion — both browser-standard, no
//  layout). Classic IIFE global, same style as the rest of builder/.
// ════════════════════════════════════════════════════════════════

(function (global) {
  "use strict";

  const SHARED   = global.HOLO_SHARED   || {};
  const ADAPTER  = global.HOLO_ADAPTER  || {};
  const PREVIEW  = global.HOLO_PREVIEW  || {};
  const STORE    = global.HOLO_STORE    || {};

  // ─── State-path utilities ──────────────────────────────────────
  // Ported verbatim from preview-renderer.js so this module has no
  // hard dependency on HOLO_PREVIEW being loaded (it usually is, but
  // the exporters must not throw if load order shifts). Resolve dotted/
  // indexed paths like "personas[0].wishlistHeadline" against a root.
  function parsePath(path) {
    const out = [];
    String(path || "").split(".").forEach(function (seg) {
      const m = seg.match(/^([^\[]+)((?:\[\d+\])*)$/);
      if (!m) { out.push(seg); return; }
      out.push(m[1]);
      const idx = m[2] || "";
      const rx = /\[(\d+)\]/g;
      let r;
      while ((r = rx.exec(idx))) out.push(parseInt(r[1], 10));
    });
    return out;
  }
  function getAtPath(root, path) {
    const parts = parsePath(path);
    let cur = root;
    for (let i = 0; i < parts.length; i++) {
      if (cur == null) return undefined;
      cur = cur[parts[i]];
    }
    return cur;
  }

  // ─── Shared exporter helpers ───────────────────────────────────
  // These were duplicated byte-for-byte in pdf-exporter.js and
  // pptx-exporter.js (both load AFTER this module). Owned here so a fix
  // to the fraction map or the label lookup lands in one place; each
  // exporter keeps a matched local fallback in case load order shifts.
  //
  // meterFrac: maps a rating word ("Very high / High / Medium / Low") to a
  // 0–1 fill fraction for the affinity meter bars.
  function meterFrac(v) {
    const s = String(v || "").toLowerCase();
    if (/very high|98|primed|very strong/.test(s)) return 0.96;
    if (/high|strong|elevated/.test(s))            return 0.8;
    if (/medium|moderate/.test(s))                 return 0.55;
    if (/low/.test(s))                             return 0.3;
    return 0.7;
  }
  // sectionLabel: fixed section id → display eyebrow, else the id upper-cased.
  function sectionLabel(id) {
    return ({
      "intro": "INTRODUCTION", "journey-map": "JOURNEY MAP", "meet-persona": "MEET THE PERSONA",
      "demo": "THE DEMO", "business-value": "BUSINESS VALUE",
    })[id] || String(id || "").toUpperCase();
  }

  // ─── Persona profile-console pane: shared op list ──────────────
  // The Data Cloud "unifiedProfile" console draws a per-facet "LWC" pane.
  // The DECISION LOGIC (facet-key dispatch, row slicing, meterFrac math,
  // grid/card/timeline geometry) was copy-pasted byte-for-byte into both
  // exporters and had begun to drift (meter track height, corner radius).
  // profilePaneOps owns that logic ONCE and returns an ordered list of
  // format-agnostic primitives in the PPTX inch coordinate space (the
  // canonical geometry — THEME is authored in inches; the PDF exporter
  // scales ×72). Each exporter keeps only a thin adapter that walks these
  // ops and emits its native draw calls (jsPDF imperative / PptxGenJS
  // declarative). Colors are given as SEMANTIC tokens the adapter maps to
  // real hex, so brand/theme resolution stays in the exporter.
  //
  // Op shapes (all coords/sizes in inches, canonical space):
  //   { op:"roundRect", x,y,w,h, radius, fill, line, lineWidth }
  //   { op:"rect",      x,y,w,h, fill }
  //   { op:"ellipse",   x,y,w,h, fill, line, lineWidth }
  //   { op:"text",      x,y,w,h, size, bold, color, align, valign,
  //                     charSpacing?, spans?[{text,size,bold,color,break}] }
  //   { op:"meterBar",  x,y,w, label, value, frac }   // one affinity row
  // Color tokens: "ink" | "muted" | "line" | "band" | "white" | "primary"
  //   | "accent"  (adapter resolves brand/theme).
  function profilePaneOps(facet, x, y, w, h, allFacets) {
    const rows = ((facet && facet.rows) || []).slice(0, 6);
    const key = (facet && facet.key) || "identity";
    const ops = [];
    if (!rows.length) return ops;

    // Affinity meter rows → one meterBar op each (label + rating + track).
    // Shared by the Affinities tab and the Identity view's embedded widget.
    function pushMeters(meterRows, mx, my, mw, mh) {
      const list = (meterRows || []).slice(0, 5);
      if (!list.length) return;
      const rowH = Math.min(0.6, mh / list.length);
      list.forEach(function (r, i) {
        ops.push({
          op: "meterBar", x: mx, y: my + i * rowH, w: mw,
          label: r.label || "", value: r.value || "", frac: meterFrac(r.value),
        });
      });
    }

    if (key === "affinities") {
      pushMeters(rows, x, y, w, h);
      return ops;
    }

    if (key === "signals") {
      const rowH = Math.min(0.7, h / rows.length);
      const dotX = x + 0.06;
      // Vertical rail behind the dots.
      ops.push({ op: "rect", x: dotX + 0.055, y: y + 0.08, w: 0.02,
        h: Math.max(0.1, (rows.length - 1) * rowH), fill: "line" });
      rows.forEach(function (r, i) {
        const ry = y + i * rowH;
        ops.push({ op: "ellipse", x: dotX, y: ry + 0.04, w: 0.14, h: 0.14,
          fill: "accent", line: "primary", lineWidth: 1 });
        ops.push({ op: "text", x: dotX + 0.3, y: ry, w: w - 0.36, h: rowH - 0.08,
          align: "left", valign: "top", spans: [
            { text: (r.label || "") + "", size: 8, bold: true, color: "muted", charSpacing: 1, break: true },
            { text: (r.value || "") + "", size: 10.5, bold: true, color: "ink" },
          ] });
      });
      return ops;
    }

    if (key === "predicted") {
      // Next Best Action card: eyebrow + headline (row[0].value) + detail
      // rows + a faux action button.
      const headline = (rows[0] && rows[0].value) || "Personalized offer";
      const rest = rows.slice(1);
      ops.push({ op: "roundRect", x: x, y: y, w: w, h: h, radius: 0.06,
        fill: "band", line: "line", lineWidth: 1 });
      ops.push({ op: "text", x: x + 0.2, y: y + 0.16, w: w - 0.4, h: 0.22,
        text: "NEXT BEST ACTION", size: 8, bold: true, color: "primary",
        align: "left", valign: "middle", charSpacing: 2 });
      ops.push({ op: "text", x: x + 0.2, y: y + 0.4, w: w - 0.4, h: 0.5,
        text: headline, size: 15, bold: true, color: "ink", heading: true,
        align: "left", valign: "top" });
      const py2 = y + 0.94;
      const availH = (y + h - 0.62) - py2;
      const rH = rest.length ? Math.min(0.4, availH / rest.length) : 0;
      rest.forEach(function (r, i) {
        const ry = py2 + i * rH;
        ops.push({ op: "text", x: x + 0.2, y: ry, w: w * 0.42, h: rH,
          text: r.label || "", size: 9, color: "muted", align: "left", valign: "middle" });
        ops.push({ op: "text", x: x + 0.2 + w * 0.42, y: ry, w: w * 0.58 - 0.4, h: rH,
          text: r.value || "", size: 9.5, bold: true, color: "ink", align: "left", valign: "middle" });
      });
      const btnW = 1.5, btnH = 0.34, btnY = y + h - btnH - 0.16;
      ops.push({ op: "roundRect", x: x + 0.2, y: btnY, w: btnW, h: btnH, radius: 0.05, fill: "primary" });
      ops.push({ op: "text", x: x + 0.2, y: btnY, w: btnW, h: btnH,
        text: "Launch action", size: 9, bold: true, color: "white", align: "center", valign: "middle" });
      return ops;
    }

    // identity / demographics / engagement / value → a COMPACT two-column
    // detail grid in a short top block, then an embedded "Affinities" meter
    // widget card filling the space below.
    const affinityRows = (allFacets || []).reduce(function (acc, f) {
      return acc || (f && f.key === "affinities" ? f.rows : null);
    }, null);

    const cols = 2;
    const fieldRows = Math.ceil(rows.length / cols);
    const fRowH = 0.36;
    const gridH = fieldRows * fRowH;
    const colW = w / cols;
    rows.forEach(function (r, i) {
      const cc = i % cols, rr = Math.floor(i / cols);
      const fx = x + cc * colW, fy = y + rr * fRowH;
      ops.push({ op: "text", x: fx, y: fy, w: colW - 0.12, h: fRowH - 0.03,
        align: "left", valign: "middle", spans: [
          { text: (r.label || "") + "", size: 7.5, bold: true, color: "muted", charSpacing: 1, break: true },
          { text: (r.value || "") + "", size: 10, bold: true, color: "ink" },
        ] });
    });

    if (affinityRows && affinityRows.length) {
      const wy = y + gridH + 0.16;
      const wh = (y + h) - wy;
      if (wh > 0.6) {
        ops.push({ op: "roundRect", x: x, y: wy, w: w, h: wh, radius: 0.06,
          fill: "band", line: "line", lineWidth: 1 });
        ops.push({ op: "text", x: x + 0.18, y: wy + 0.12, w: w - 0.36, h: 0.2,
          text: "TOP AFFINITIES", size: 8, bold: true, color: "primary",
          align: "left", valign: "middle", charSpacing: 2 });
        pushMeters(affinityRows, x + 0.18, wy + 0.42, w - 0.36, wh - 0.56);
      }
    }
    return ops;
  }

  // ─── Theme / geometry ──────────────────────────────────────────
  // Shared geometry (in the PPTX 13.33×7.5in coordinate space) + the
  // brand-independent palette bits. Both exporters read from THEME so
  // the two formats stay visually aligned. The PDF exporter scales
  // these inch values into its 960×540pt page (×72).
  const THEME = {
    // 16:9 canvas
    W: 13.33, H: 7.5,
    MARGIN: 0.7,
    // Neutral ink / paper (brand colors override where used)
    ink:   "1A1A2E",
    muted: "6B7280",
    paper: "FFFFFF",
    band:  "F5F7FF",
    line:  "E2E6F0",
    // Type scale (pt)
    fsTitle: 40, fsHeadline: 32, fsEyebrow: 13, fsSub: 18,
    fsBody: 14, fsSmall: 11, fsMetric: 34, fsMetricLabel: 12,
    font: "Inter",
  };

  // ─── Layout → template mapping ─────────────────────────────────
  // 8 clean native templates. Device-frame chrome + live iframes are a
  // documented fast-follow; v1 renders still images / labeled placeholders.
  const LAYOUT_TO_TEMPLATE = {
    introHero:          "titleSlide",
    introStoryHook:     "titleSlide",
    chapterOpener:      "sectionDivider",
    personaCta:         "sectionDivider",
    bvOpener:           "sectionDivider",
    bvClosing:          "sectionDivider",
    introThreeActs:     "bulletJourney",
    journeyMapMatrix:   "bulletJourney",
    journeyTimeline:    "bulletJourney",
    demoMap:            "bulletJourney",
    bvOrbit:            "bulletJourney",
    bvCapabilities:     "bulletJourney",
    executiveSummary:   "quotePlusColumns",
    nextSteps:          "bulletJourney",
    introVignette:      "deviceSceneImage",
    deviceMoment:       "deviceSceneImage",
    personaIntro:       "splitTextImage",
    personaWishlist:    "splitTextImage",
    personaCard:        "personaCard",
    unifiedProfile:     "profileConsole",
    agentConversation:  "agentChat",
    kpiScorecard:       "metricScorecard",
    // ── SE-authored DEMO-section layouts (demo-deck-renderer.js vocabulary) ──
    // These reach the manifest verbatim (holodeck-shared.js buildSlideManifest
    // pushes state.slides[] into the demo section). Without an entry here they
    // fell through templateFor() → titleSlide, dropping all body copy. Map each
    // to the template that best mirrors what /demo renders for it.
    hero:               "titleSlide",
    futureState:        "titleSlide",       // demo renderer aliases futureState → hero
    storyInterstitial:  "titleSlide",       // → deviceSceneImage when it carries an image (templateFor)
    storyFoundation:    "quotePlusColumns",
    currentFutureState: "quotePlusColumns",
    architecture:       "bulletJourney",
    scenePhoto:         "iconList",
    // Config-driven Salesforce console screens. These render a live in-DOM
    // console in /demo that no static template can reproduce, so on export
    // they are CAPTURED to a screenshot PNG in the browser (see the
    // "screen" _imageSlot in normalizeSlide) and embedded full-bleed via the
    // screenImage template — the SE's own eyebrow/headline sit above it.
    screenFlow:         "screenImage",
    screenActOpener:    "screenImage",
    // embeddedCxComponent/appConsoleIframe handled specially: still image → deviceSceneImage,
    // else placeholderCx (see templateFor()).
  };

  function templateFor(slide) {
    const layout = (slide && slide.layout) || "";
    if (layout === "embeddedCxComponent" || layout === "appConsoleIframe") {
      return "cx"; // resolved to deviceSceneImage-or-placeholder by the exporter
    }
    if (layout === "storyInterstitial") {
      // Narrative beat: text-only titleSlide, unless it carries an image — then
      // it renders as a split text/image, mirroring /demo's .dd-interstitial-split.
      // normalizeSlide resolves the image and swaps the template accordingly.
      return "interstitial";
    }
    const t = LAYOUT_TO_TEMPLATE[layout];
    if (!t) {
      try { console.warn("[export-model] no template for layout '" + layout + "' — using titleSlide"); }
      catch (e) {}
      return "titleSlide";
    }
    return t;
  }

  // ─── Field resolution (stored || prefill || placeholder) ───────
  // Mirrors the preview/demo precedence exactly (preview-renderer.js
  // ~lines 790-822): the STORED value at the editor path wins; when it's
  // blank we fall back to the field's prefill (seeded default copy) and
  // then to its placeholder (override hint). editorPaths values are either
  // a plain path string or { path, placeholder, prefill } where the last
  // two are (slide, state) => string. "__slide.<field>" paths read from
  // the slide object itself, not the global state tree.
  function normEntry(raw) {
    if (raw && typeof raw === "object") {
      return { path: raw.path, placeholder: raw.placeholder, prefill: raw.prefill };
    }
    return { path: raw, placeholder: undefined, prefill: undefined };
  }
  function storedAt(slide, state, path) {
    const m = /^__slide\.(.+)$/.exec(String(path || ""));
    if (m) return slide ? slide[m[1]] : undefined;
    return getAtPath(state, path);
  }
  function resolveEntry(slide, state, raw) {
    const f = normEntry(raw);
    const v = storedAt(slide, state, f.path);
    // A non-null non-string (array/object, e.g. a wishlist) is a real
    // stored value → return as-is. A string wins only when non-blank.
    if (v != null && typeof v !== "string") return v;
    const stored = (v == null ? "" : v);
    if (stored.trim()) return stored;
    // blank string → prefill, then placeholder
    if (typeof f.prefill === "function") {
      try { const p = f.prefill(slide, state); if (p != null && String(p).trim()) return p; } catch (e) {}
    }
    if (typeof f.placeholder === "function") {
      try { const p = f.placeholder(slide, state); if (p != null && String(p).trim()) return p; } catch (e) {}
    } else if (typeof f.placeholder === "string" && f.placeholder.trim()) {
      return f.placeholder;
    }
    return stored; // "" or the empty value
  }
  // Resolve a single labeled field on a slide (exported helper).
  function resolveField(slide, state, label) {
    const eps = (slide && slide.editorPaths) || {};
    if (!(label in eps)) return "";
    return resolveEntry(slide, state, eps[label]);
  }
  // Resolve every editorPaths label on a slide → { label: value }.
  function resolveAll(slide, state) {
    const out = {};
    const eps = (slide && slide.editorPaths) || {};
    Object.keys(eps).forEach(function (label) {
      out[label] = resolveEntry(slide, state, eps[label]);
    });
    return out;
  }
  // First non-empty resolved value among a list of candidate labels.
  function firstOf(fields, labels) {
    for (let i = 0; i < labels.length; i++) {
      const v = fields[labels[i]];
      if (v != null && String(v).trim()) return String(v);
    }
    return "";
  }
  // Strip emoji + other pictographic symbols. PPTX/PDF render them with
  // wrong metrics / tofu boxes (fonts aren't embedded and the vendored
  // libs don't shape color-emoji), so we drop them entirely on export.
  // Covers the common Unicode emoji/symbol blocks + ZWJ sequences,
  // variation selectors, skin-tone modifiers, and keycap combiners.
  // Deliberately runs BEFORE the \s+ collapse in plain() so any space
  // that was prepended to an emoji (e.g. `emoji + " "`) is tidied up.
  const EMOJI_RE = new RegExp(
    "[" +
      "\\u{1F000}-\\u{1FAFF}" +   // misc symbols/pictographs, emoticons, transport, supplemental, symbols-and-pictographs-extended
      "\\u{2600}-\\u{27BF}"  +   // misc symbols + dingbats
      "\\u{2B00}-\\u{2BFF}"  +   // misc symbols and arrows (stars, etc.)
      "\\u{1F1E6}-\\u{1F1FF}" +  // regional indicators (flags)
      "\\u{2190}-\\u{21FF}"  +   // arrows
      "\\u{2300}-\\u{23FF}"  +   // misc technical (⌚, ⏰, …)
      "\\u{FE00}-\\u{FE0F}"  +   // variation selectors
      "\\u{1F3FB}-\\u{1F3FF}" +  // skin-tone modifiers
      "\\u{20D0}-\\u{20FF}"  +   // combining marks for symbols (keycaps)
      "\\u{200D}"            +   // zero-width joiner (ZWJ sequences)
      "\\u{20E3}"            +   // combining enclosing keycap
      "\\u{2122}\\u{2139}"   +   // ™, ℹ
    "]",
    "gu"
  );
  function stripEmoji(s) {
    return String(s == null ? "" : s).replace(EMOJI_RE, "");
  }

  // Strip inline HTML that the shared/adapter copy sometimes carries
  // (e.g. <strong>/<em>/<br/>) — file exporters want plain text runs.
  // Also drops emoji (see stripEmoji) since exported files render them
  // poorly; plain() is the single chokepoint every text run passes through.
  function plain(s) {
    return stripEmoji(String(s == null ? "" : s))
      .replace(/<br\s*\/?>/gi, " ")
      .replace(/<\/?[^>]+>/g, "")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
      .replace(/\s+/g, " ")
      .trim();
  }

  // ─── Console screen → screenshot PNG (in-browser rasterizer) ───
  // Config-driven Salesforce console screens render as live in-DOM markup
  // that no static export template can reproduce. So at export time we render
  // the SAME screen the /demo deck draws (via HOLO_DEMO.renderScreenFlow),
  // then rasterize that DOM subtree to a PNG using the native
  // SVG-<foreignObject> → <canvas> path — zero dependencies, no server.
  //
  // Returns { dataUrl, w, h } | null. Null (no DOM / capture failed / no
  // renderer) makes the exporter fall back to the eyebrow+headline text card.
  const SCREEN_CAPTURE_CACHE = {};
  function captureScreenImage(slide, cfg, state) {
    // Only possible in a real browser with the demo renderer present.
    if (typeof document === "undefined" || typeof window === "undefined") {
      return Promise.resolve(null);
    }
    const DEMO = window.HOLO_DEMO;
    if (!DEMO || typeof DEMO.renderScreenFlow !== "function") {
      try { console.warn("[export-model] HOLO_DEMO.renderScreenFlow unavailable — screen slide falls back to text card"); }
      catch (e) {}
      return Promise.resolve(null);
    }
    // Cache per slide id (a deck can repeat a screen family; capture once).
    const cacheKey = (slide && slide.id) || (slide && slide.screenId) || JSON.stringify(slide && slide.panels || {});
    if (SCREEN_CAPTURE_CACHE[cacheKey] !== undefined) return Promise.resolve(SCREEN_CAPTURE_CACHE[cacheKey]);
    const done = function (r) { SCREEN_CAPTURE_CACHE[cacheKey] = r; return r; };

    // Fixed capture canvas — 16:9 at 2× for crisp embedding. The live deck
    // slide canvas is 1280×720; we match its aspect so layout mirrors /demo.
    const W = 1280, H = 720, SCALE = 2;

    let node, host;
    try {
      node = DEMO.renderScreenFlow(slide, state, cfg);
      if (!node) return Promise.resolve(done(null));
    } catch (e) {
      try { console.warn("[export-model] renderScreenFlow threw:", e && e.message); } catch (e2) {}
      return Promise.resolve(done(null));
    }

    // Attach offscreen so the browser lays it out (foreignObject needs a laid-
    // out subtree). Fixed pixel size = the capture frame. Brand variables ride
    // in via the wrapper's inline style so recolor mirrors the live deck.
    host = document.createElement("div");
    host.setAttribute("aria-hidden", "true");
    host.style.cssText =
      "position:fixed;left:-99999px;top:0;z-index:-1;pointer-events:none;" +
      "width:" + W + "px;height:" + H + "px;overflow:hidden;background:#fff;";
    // Carry the demo layout class so .dd-layout-screenFlow rules apply, and
    // mark it active so entry-gated animations resolve to their final state.
    host.className = "pslide dd-slide active dd-layout-" + ((slide && slide.layout) || "screenFlow");
    applyBrandVars(host, cfg);
    const body = document.createElement("div");
    body.className = "dd-slide-body";
    body.appendChild(node);
    host.appendChild(body);
    document.body.appendChild(host);

    return rasterizeNode(host, W, H, SCALE)
      .then(function (dataUrl) {
        if (host && host.parentNode) host.parentNode.removeChild(host);
        if (!dataUrl) return done(null);
        return done({ dataUrl: dataUrl, w: W * SCALE, h: H * SCALE });
      })
      .catch(function () {
        if (host && host.parentNode) host.parentNode.removeChild(host);
        return done(null);
      });
  }

  // Set the --hd-*/brand CSS variables the screen shell reads onto a host
  // element, so a captured screen recolors exactly like the live deck.
  function applyBrandVars(host, cfg) {
    const b = (cfg && cfg.brand) || {};
    const setVar = function (name, val) { if (val) host.style.setProperty(name, String(val)); };
    // Mirror the tokens demo-deck-renderer applies to its root (best-effort;
    // absent values fall back to the screens.css defaults).
    setVar("--sf-brand", b.primary || b.accent);
    setVar("--sf-brand-dark", b.primaryDark || b.accentDark);
    setVar("--red", b.accent || b.primary);
    setVar("--navy", b.ink || b.text);
    // Console content gutters. These are declared on :root in screens.css, but
    // inside the export's SVG <foreignObject> the inlined ":root" selector
    // matches the SVG document root — NOT this host div — so the console never
    // inherits them and every "padding: … var(--sf-gutter-x)" collapses to no
    // padding. Set them on the host (a real ancestor of the console subtree) so
    // they resolve at capture exactly as they do in the live/preview DOM. Keep
    // these values in sync with the :root defaults in demo/styles/screens.css.
    host.style.setProperty("--sf-gutter-x", "28px");
    host.style.setProperty("--sf-gutter-y", "18px");
    host.style.setProperty("--sf-body-gap", "16px");
    host.style.setProperty("--sf-pad", "20px");
  }

  // Rasterize a laid-out DOM subtree to a PNG data URL via SVG foreignObject.
  // Inlines the console stylesheet (screens.css) into the SVG so the sandboxed
  // foreignObject document is styled identically to the page.
  function rasterizeNode(hostEl, W, H, scale) {
    return collectScreenCss().then(function (cssText) {
      // Serialize a CLONE of the host with its offscreen-staging styles
      // stripped. The live host is positioned "position:fixed; left:-99999px"
      // so it lays out on the page without flashing — but that style is baked
      // into the serialized string, and when the SAME node is re-inserted into
      // the SVG <foreignObject> it shifts the entire console 99999px out of the
      // foreignObject viewport → a pure-white capture. Inside the SVG the host
      // must sit at the origin and fill the frame, so re-home it to static.
      const clone = hostEl.cloneNode(true);
      clone.style.cssText =
        "position:static;left:0;top:0;margin:0;width:" + W + "px;height:" + H + "px;overflow:hidden;background:#fff;";
      // Preserve the brand/gutter custom properties the console reads (cssText
      // above cleared them along with the staging styles).
      var carry = ["--sf-brand", "--sf-brand-dark", "--red", "--navy",
                   "--sf-gutter-x", "--sf-gutter-y", "--sf-body-gap", "--sf-pad"];
      carry.forEach(function (name) {
        var v = hostEl.style.getPropertyValue(name);
        if (v) clone.style.setProperty(name, v);
      });
      // Serialize the subtree. XHTML-namespaced so the SVG parser accepts it.
      const inner = new XMLSerializer().serializeToString(clone);
      const svg =
        '<svg xmlns="http://www.w3.org/2000/svg" width="' + (W * scale) + '" height="' + (H * scale) + '" viewBox="0 0 ' + W + ' ' + H + '">' +
          '<foreignObject x="0" y="0" width="' + W + '" height="' + H + '">' +
            '<div xmlns="http://www.w3.org/1999/xhtml">' +
              '<style>' + cssText + '</style>' +
              inner +
            '</div>' +
          '</foreignObject>' +
        '</svg>';
      const svgUrl = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
      return new Promise(function (resolve) {
        const img = new Image();
        img.onload = function () {
          try {
            const canvas = document.createElement("canvas");
            canvas.width = W * scale; canvas.height = H * scale;
            const ctx = canvas.getContext("2d");
            ctx.fillStyle = "#ffffff";
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            resolve(canvas.toDataURL("image/png"));
          } catch (e) { resolve(null); }
        };
        img.onerror = function () { resolve(null); };
        img.src = svgUrl;
      });
    });
  }

  // Concatenate the rules of the console stylesheet (screens.css) so they can
  // be inlined into the foreignObject. Cached after first read. Cross-origin
  // sheets throw on .cssRules access — caught and skipped.
  let SCREEN_CSS_CACHE = null;
  function collectScreenCss() {
    if (SCREEN_CSS_CACHE != null) return Promise.resolve(SCREEN_CSS_CACHE);
    let text = "";
    try {
      const sheets = document.styleSheets || [];
      for (let i = 0; i < sheets.length; i++) {
        const sheet = sheets[i];
        const href = sheet.href || "";
        // Inline every same-origin sheet's rules (screens.css carries the
        // console styling; slides.css carries .dd-slide/.dd-layout shells).
        try {
          const rules = sheet.cssRules;
          if (!rules) continue;
          for (let j = 0; j < rules.length; j++) text += rules[j].cssText + "\n";
        } catch (e) {
          // Cross-origin sheet — skip (can't read cssRules).
        }
      }
    } catch (e) {}
    SCREEN_CSS_CACHE = text;
    return Promise.resolve(text);
  }

  // ─── Image → data URL (via the same-origin proxy) ──────────────
  // jsPDF requires a data URL; keeping pptxgenjs on data: too avoids a
  // second failure mode. Signed GCS URLs are cross-origin (no bucket
  // CORS), so we route http(s) fetches through GET /api/asset/proxy.
  // data: URLs (e.g. freshly-generated Gemini images) pass through.
  // Resolves null on ANY failure so the caller draws a placeholder.
  const IMG_CACHE = {};
  function imageToDataUrl(url) {
    url = url && String(url).trim();
    if (!url) return Promise.resolve(null);
    if (IMG_CACHE[url] !== undefined) return Promise.resolve(IMG_CACHE[url]);
    const done = function (result) { IMG_CACHE[url] = result; return result; };

    const measure = function (dataUrl) {
      return new Promise(function (resolve) {
        try {
          const img = new Image();
          img.onload = function () {
            resolve(done({ dataUrl: dataUrl, w: img.naturalWidth || img.width || 0, h: img.naturalHeight || img.height || 0 }));
          };
          img.onerror = function () { resolve(done(null)); };
          img.src = dataUrl;
        } catch (e) { resolve(done(null)); }
      });
    };

    if (/^data:/i.test(url)) return measure(url);

    let fetchUrl = url;
    let viaProxy = false;
    if (/^https?:\/\//i.test(url)) {
      fetchUrl = "/api/asset/proxy?url=" + encodeURIComponent(url);
      viaProxy = true;
    }
    // The proxy is gated on the same JWT as the Data API; attach it when
    // routing through it. Direct (non-proxy) fetches carry no auth header.
    const auth = window.HOLO_AUTH;
    const headersP = viaProxy && auth && auth.authHeaders ? auth.authHeaders() : Promise.resolve({});
    return headersP
      .then(function (authHeaders) {
        return fetch(fetchUrl, viaProxy ? { headers: authHeaders } : undefined);
      })
      .then(function (res) { if (!res.ok) throw new Error("proxy " + res.status); return res.blob(); })
      .then(function (blob) {
        return new Promise(function (resolve) {
          const fr = new FileReader();
          fr.onload = function () { resolve(fr.result); };
          fr.onerror = function () { resolve(null); };
          fr.readAsDataURL(blob);
        });
      })
      .then(function (dataUrl) { return dataUrl ? measure(dataUrl) : done(null); })
      .catch(function () { return done(null); });
  }

  // ─── Image slot per layout ─────────────────────────────────────
  // Pick the ONE hero image a template shows, from the signed demoAssets
  // (adapter) + per-slide assets. Returns { url, kind } | null (URL, not
  // yet a data URL — buildExportModel resolves it via imageToDataUrl).
  function imageSlotFor(slide, cfg, state) {
    const da = (cfg && cfg.demoAssets) || {};
    const layout = (slide && slide.layout) || "";
    // Per-slide explicit assets win (SE dropped an image on this slide).
    const slAssets = (slide && slide.assets) || [];
    const firstSlideAsset = slAssets.find(function (a) { return a && (a.url || a.path || a.src); });
    const pick = function (v, kind) { return (v && String(v).trim()) ? { url: String(v), kind: kind || "image" } : null; };

    if (firstSlideAsset) {
      const u = firstSlideAsset.url || firstSlideAsset.path || firstSlideAsset.src;
      if (u && String(u).trim()) return { url: String(u), kind: "image" };
    }

    switch (layout) {
      case "personaIntro":
      case "personaCard":
      case "unifiedProfile":
        return pick((cfg.persona && (cfg.persona.portrait || cfg.persona.heroBackground)), "portrait");
      case "personaWishlist":
        return pick((cfg.persona && (cfg.persona.phoneGif || cfg.persona.heroGif)), "device");
      case "introVignette":
        return pick(da.productHero || da.storeInterior || da.iPhoneRec, "scene");
      case "deviceMoment":
        return pick(da.iPhoneRec || da.laptopBrowsingGif || da.webBrowseGif, "device");
      case "scenePhoto":
        // Mirrors /demo scenePhoto: storeInterior first (the photo it shows),
        // then storeExterior / productHero.
        return pick(da.storeInterior || da.storeExterior || da.productHero, "scene");
      case "storyInterstitial": {
        // A per-slide asset slot or a linked demo asset (mirrors /demo).
        const slot = (slide && (slide.imageSlot || slide.assetSlot)) || "";
        return pick((slot && da[slot]) || (slide && slide.imageUrl), "scene");
      }
      case "demoMap":
        return pick(da.productHero || da.storeInterior, "scene");
      default:
        return null;
    }
  }

  // CX component still lookup (embeddedCxComponent). Returns
  // { stillUrl|null, targetUrl, name } for the "still else placeholder" path.
  //
  // In EXPORTS the still wins over the live link (an iframe can't render in a
  // PDF/PPTX). The assigned still lives in assetLibrary under a slot NAME
  // (cxInstagramAd/cxShopperAgent/…), referenced by the component's per-slide
  // (imageSlotsBySlide[slideId]) or component-wide (imageSlot) assignment — so
  // resolve those slot names through cfg.demoAssets exactly as imageSlotFor
  // does. EXPLICIT assignments only: no type/name heuristic, so we never borrow
  // an unrelated still. A direct URL already on the component still works first.
  function cxFallbackFor(slide, cfg, state) {
    const da = (cfg && cfg.demoAssets) || {};
    const ids = (slide && slide.linkedCxComponentIds) || [];
    const comps = (state && state.cxComponents) || [];
    let comp = null;
    if (ids.length) comp = comps.find(function (c) { return c && c.id === ids[0]; }) || null;
    if (!comp && slide && slide.cxComponentId) {
      comp = comps.find(function (c) { return c && c.id === slide.cxComponentId; }) || null;
    }
    comp = comp || {};

    const urlOf = function (v) { return (v && String(v).trim()) ? String(v) : ""; };
    // Resolve a slot name (e.g. "cxShopperAgent") to its signed asset URL.
    const slotUrl = function (slot) { return slot ? urlOf(da[slot]) : ""; };

    const perSlideSlot = (comp.imageSlotsBySlide && slide && comp.imageSlotsBySlide[slide.id]) || "";
    const still =
      urlOf(comp.stillImage || comp.still || comp.screenshot || comp.image) || // 1. direct URL
      slotUrl(perSlideSlot) ||                                                 // 2. per-slide slot
      slotUrl(comp.imageSlot);                                                 // 3. component slot

    return {
      stillUrl:  still || null,
      targetUrl: comp._exportUrl || comp.url || comp.targetUrl || comp.href || "",
      name:      comp.name || comp.label || slide.title || "CX Component",
    };
  }

  // ─── Per-template structured data ──────────────────────────────
  // Pull the template-relevant structured content from the adapter cfg
  // + shared generators (never re-clip / re-invent copy). Returns the
  // template-specific slice of a NormalizedSlide.
  function structuredFor(template, slide, cfg, state, fields) {
    const layout = (slide && slide.layout) || "";

    if (template === "bulletJourney") {
      return bulletsFor(layout, slide, cfg, state, fields);
    }
    if (template === "metricScorecard") {
      const metrics = ((cfg.bvs && cfg.bvs.metrics) || []).map(function (m) {
        // icon is a standalone glyph field the scorecard may render — an
        // emoji-only icon becomes "" after stripEmoji, so the exporter
        // simply omits it rather than drawing a tofu box.
        return { value: plain(m.value || m.stat || ""), label: plain(m.label || m.title || ""), icon: stripEmoji(m.icon || "").trim() };
      });
      return { metrics: metrics };
    }
    if (template === "agentChat") {
      const chat = SHARED.agentChat ? SHARED.agentChat(state) : { turns: [] };
      const turns = (chat.turns || []).map(function (t) {
        if (t.kind === "card" && t.card) {
          return { role: "card", text: plain(t.card.title) + (t.card.sub ? " — " + plain(t.card.sub) : ""), emoji: stripEmoji(t.card.emoji || "").trim() };
        }
        return { role: t.from === "user" ? "user" : "agent", text: plain(t.text) };
      });
      return { chat: turns };
    }
    if (template === "profileConsole") {
      // unifiedProfile renders as a native reproduction of /demo's Data Cloud
      // console (demo-deck-renderer.js unifiedProfile ~461-611): a browser bar,
      // a persistent profile rail (avatar monogram + name/role/segment + LTV /
      // Orders KPIs), facet tabs, and the active facet's label/value rows. We
      // reconstruct that layout natively rather than flatten it into chips.
      return profileConsoleFor(slide, cfg, state);
    }
    if (template === "personaCard") {
      const p = cfg.persona || {};
      return {
        facets: (p.stats || []).map(function (s) { return { label: plain(s.label), value: plain(s.value) }; }),
        quote:  plain(p.quote),
        products: (cfg.journey && cfg.journey.platform && cfg.journey.platform.capabilities) || [],
      };
    }
    if (template === "quotePlusColumns") {
      return quotePlusColumnsFor(layout, slide, cfg, state, fields);
    }
    if (template === "iconList") {
      return { rows: sceneRowsFor(slide, cfg, state), image: null };
    }
    if (template === "deviceSceneImage" && layout === "deviceMoment") {
      // Capability chips under the sub-line (mirrors /demo deviceMoment's
      // capsList: slide.capabilities, else the project product list).
      const caps = (slide && slide.capabilities && slide.capabilities.length)
        ? slide.capabilities.slice(0, 4)
        : ((state.project && state.project.products) || []).slice(0, 4);
      return { chips: caps.map(plain).filter(Boolean) };
    }
    if (template === "splitTextImage") {
      if (layout === "personaWishlist") {
        const p = cfg.persona || {};
        return {
          bullets: (p.wishlist || []).map(function (w) {
            return { title: plain((w.emoji ? w.emoji + " " : "") + (w.name || "")), desc: plain(w.tag || w.detail || "") };
          }),
        };
      }
      return {};
    }
    return {};
  }

  // bulletJourney feeds several very different layouts; each pulls its
  // rows from the adapter cfg / shared generators the /demo renders from.
  function bulletsFor(layout, slide, cfg, state, fields) {
    const bullets = [];
    if (layout === "journeyMapMatrix") {
      ((cfg.journey && cfg.journey.steps) || []).forEach(function (s) {
        bullets.push({ title: plain(s.phaseTitle || s.title), desc: plain(s.descriptionShort || s.description) });
      });
    } else if (layout === "journeyTimeline") {
      const tl = cfg.timeline || {};
      (tl.below || tl.above || []).forEach(function (e) {
        bullets.push({ title: plain((e.icon ? e.icon + " " : "") + (e.month ? e.month + " · " : "") + e.label), desc: plain(e.sub) });
      });
    } else if (layout === "introThreeActs") {
      (cfg.demoStructure || []).forEach(function (a, i) {
        bullets.push({ title: plain("Act " + (i + 1) + " · " + a.title), desc: plain(a.description) });
      });
    } else if (layout === "bvOrbit") {
      (cfg.orbitNodes || []).forEach(function (n) {
        bullets.push({ title: plain(n.label || n.title || n.name), desc: plain(n.sub || n.detail || "") });
      });
    } else if (layout === "bvCapabilities") {
      const caps = (SHARED.buildCapabilities
        ? SHARED.buildCapabilities(state.storyFoundations || {}, (state.project && state.project.products) || [])
        : []);
      caps.forEach(function (c) {
        bullets.push({ title: plain(c.title || c.name || c.label), desc: plain(c.desc || c.description || "") });
      });
    } else if (layout === "nextSteps") {
      (SHARED.nextStepsPhases ? SHARED.nextStepsPhases() : []).forEach(function (p, i) {
        bullets.push({ title: plain((i + 1) + ". " + p), desc: "" });
      });
    } else if (layout === "architecture") {
      // Mirrors /demo architecture (~616-629): three tiers. Salesforce tier is
      // the actual product list; sources + channels are the fixed demo tiers.
      const prods = (state.project && state.project.products) || [];
      bullets.push({ title: "Data Sources", desc: "Web · Mobile · POS · Email · Service" });
      bullets.push({ title: "Salesforce",   desc: plain((prods.length ? prods.slice(0, 6) : ["Pick products in Step 1"]).join(" · ")) });
      bullets.push({ title: "Channels",     desc: "Storefront · App · SMS · Email · Agent" });
    } else if (layout === "demoMap") {
      // SE-authored demo slides: their own bullet fields win when present…
      const items = (slide && (slide.bullets || slide.points || slide.items)) || [];
      items.forEach(function (it) {
        if (typeof it === "string") bullets.push({ title: plain(it), desc: "" });
        else bullets.push({ title: plain(it.title || it.label || it.text || ""), desc: plain(it.desc || it.sub || "") });
      });
      // …otherwise rebuild the demo flow from the story acts (mirrors /demo).
      if (!bullets.length && SHARED.demoFlowSteps) {
        SHARED.demoFlowSteps(state.storyActs || []).forEach(function (step) {
          const sub = [step.channel, step.cap].filter(Boolean).map(plain).join(" · ");
          bullets.push({ title: plain(step.num + " · " + step.title), desc: sub });
        });
      }
    }
    return { bullets: bullets };
  }

  // quotePlusColumns feeds storyFoundation / executiveSummary / currentFutureState.
  // Mirrors /demo's twoPanel(leftQuote + rightCopy) sourcing (demo-deck-renderer.js
  // storyFoundation ~207, currentFutureState ~234, executiveSummary ~958): a framed
  // quote card on the left, a labeled column set on the right. Columns are either
  // {label, value} stat chips or {label, body} prose columns; the exporter draws
  // both. fitSentences matches the live char clamps (no trailing "…").
  function quotePlusColumnsFor(layout, slide, cfg, state, fields) {
    const f = state.storyFoundations || {};
    const cust = cfg.customer || {};
    const fit = function (s, n) { return SHARED.fitSentences ? plain(SHARED.fitSentences(s, n)) : plain(s); };
    const products = (state.project && state.project.products) || [];
    const poweredBy = (cfg.poweredBy || []).map(function (p) {
      return typeof p === "string" ? p : (p.product || p.title || p.name || "");
    }).filter(Boolean);

    if (layout === "currentFutureState") {
      return {
        quote: "", quoteTag: "",
        columns: [
          { label: "Today",    body: fit(f.currentStatePain, 180) || "Disconnected channels, anonymous browsers, lost revenue." },
          { label: "Tomorrow", body: fit(f.futureStateVision, 180) || "One unified profile across every channel." },
        ],
        chips: (poweredBy.length ? poweredBy : products).slice(0, 6),
        chipsLabel: "Powered by Salesforce",
      };
    }
    if (layout === "executiveSummary") {
      return {
        quote: fit(f.executiveTakeaway, 160) ||
               ("A single Salesforce platform compounds every customer touch into measurable lift" + (cust.name ? " for " + cust.name + "." : ".")),
        quoteTag: "Executive Takeaway",
        stamp: cust.name ? plain(cust.name) + " + Salesforce" : "Salesforce",
        columns: [
          { label: "Challenge",    body: fit(f.businessProblem, 180) || fit(f.currentStatePain, 180) },
          { label: "Future state", body: fit(f.futureStateVision, 180) },
          { label: "Capabilities", body: products.slice(0, 4).map(plain).join(" · ") },
        ].filter(function (c) { return c.body; }),
      };
    }
    // storyFoundation (default): quote + Problem/Today/Tomorrow stat chips.
    const stats = [];
    if (f.businessProblem)   stats.push({ value: "Problem",  label: plain(SHARED.truncate ? SHARED.truncate(f.businessProblem, 46) : f.businessProblem) });
    if (f.currentStatePain)  stats.push({ value: "Today",    label: plain(SHARED.truncate ? SHARED.truncate(f.currentStatePain, 46) : f.currentStatePain) });
    if (f.futureStateVision) stats.push({ value: "Tomorrow", label: plain(SHARED.truncate ? SHARED.truncate(f.futureStateVision, 46) : f.futureStateVision) });
    return {
      quote: fit(f.executiveTakeaway, 160) || fit(f.futureStateVision, 160) ||
             "Connect every channel into one continuous customer relationship.",
      quoteTag: "Strategic foundation",
      stamp: cust.name ? (plain(cust.name) + (cust.industry ? " · " + plain(cust.industry) : "")) : "",
      columns: stats,
    };
  }

  // scenePhoto → iconList rows. Mirrors demo-deck-renderer.js scenePhoto
  // (~749-816): 4 rows (When / The moment / What happens next|Where it leads /
  // Why it matters) sourced from the linked storyAct + the next act + foundations.
  // Emoji icons are dropped on export (plain()), so rows carry text only.
  function sceneRowsFor(slide, cfg, state) {
    const acts = state.storyActs || [];
    const f = state.storyFoundations || {};
    const act = (slide && slide.linkedActId && acts.find(function (a) { return a.id === slide.linkedActId; })) || acts[0] || {};
    const idx = acts.indexOf(act);
    const next = (idx >= 0 && acts[idx + 1]) || {};
    const hasNext = !!(next && (next.title || next.demoMoment || next.summary));

    const good = function (a) {
      return a && a.title && !(SHARED.isGenericTitle && SHARED.isGenericTitle(a.title)) ? a.title : "";
    };
    const narr = function (a) {
      const src = (a && a.summaryShort) || (a && a.summary) || (a && a.demoMoment) || "";
      return SHARED.oneSentence ? SHARED.oneSentence(src, 46) : src;
    };
    const tTitle = function (v, max, fb) {
      const out = SHARED.cleanHeadline ? SHARED.cleanHeadline(v, max) : v;
      return plain(out) || fb;
    };
    const tSub = function (v, max, fb) {
      const out = SHARED.fitSentences ? SHARED.fitSentences(v, max) : v;
      return plain(out) || fb;
    };

    const rows = [
      { eyebrow: "When",
        title: plain(act.timing || act.month || "Opening"),
        sub:   tSub(act.location || act.summary, 150, "The opening moment") },
      { eyebrow: "The moment",
        title: tTitle(good(act) || narr(act), 46, "The key moment"),
        sub:   tSub(act.demoMoment || act.summary, 150, "Where the story begins") },
      hasNext
        ? { eyebrow: "What happens next",
            title: tTitle(good(next) || narr(next) || act.salesforceCapabilities, 46, "What happens next"),
            sub:   tSub(next.demoMoment || next.summary, 150, "The story continues") }
        : { eyebrow: "Where it leads",
            title: tTitle(act.salesforceCapabilities || act.businessValueShort || act.businessValue, 42, "Where it leads"),
            sub:   tSub(act.businessValue || f.executiveTakeaway, 150, "The story continues") },
      { eyebrow: "Why it matters",
        title: tTitle(act.businessValueShort || act.businessValue || f.executiveTakeaway, 42, "Why it matters"),
        sub:   tSub(f.businessProblem || f.executiveTakeaway, 150, "The outcome that counts") },
    ];
    return rows;
  }

  // unifiedProfile → profileConsole. Reconstructs /demo's Data Cloud console
  // (demo-deck-renderer.js unifiedProfile ~461-611) as native export data so
  // the exporters can draw the same UI — brand bar, profile rail (avatar
  // monogram + name/role/segment + LTV / Orders KPIs), facet tabs, and the
  // rows of each facet — rather than scattering the facets into loose chips.
  function profileConsoleFor(slide, cfg, state) {
    const p = cfg.persona || {};
    const cust = cfg.customer || {};
    const fullName = p.name || cust.name || "Customer";
    // Same deterministic lifetime-value formula the live renderer uses so the
    // export shows the identical number for a given persona.
    const lifetime = "$" + (1500 + ((fullName.length * 137) % 6500)).toLocaleString() + ".00";
    const monogram = (fullName.trim().split(/\s+/).slice(0, 2)
      .map(function (w) { return (w[0] || "").toUpperCase(); }).join("")) || "C";
    const roleText = plain(p.role || p.jobTitle || ((cust.industry || "Customer") + " customer"));
    const segText  = plain(p.customerOf || (cust.industry ? cust.industry + " segment" : "Known customer"));

    const facetGroups = (SHARED.profileFacets ? SHARED.profileFacets({
      persona: p,
      products: (state.project && state.project.products) || [],
      storyFoundations: state.storyFoundations || {},
      industry: (state.project && state.project.industry) || cust.industry || "",
    }) : []) || [];
    // The live console surfaces the four richest facets across its tabs.
    const wanted = ["identity", "affinities", "signals", "predicted"];
    const picked = wanted
      .map(function (k) { return facetGroups.find(function (g) { return g.key === k; }); })
      .filter(Boolean);
    const groups = (picked.length ? picked : facetGroups).slice(0, 4);
    const facets = groups.map(function (g) {
      return {
        key:     g.key,
        label:   plain(g.label || ""),
        eyebrow: plain(g.eyebrow || "Profile"),
        rows: (g.rows || []).slice(0, 6).map(function (r) {
          return { label: plain(r.label || ""), value: plain(r.value || "") };
        }),
      };
    });

    return {
      console: {
        brand:    plain((cust.name || "BRAND").toUpperCase()).slice(0, 14),
        name:     plain(fullName),
        monogram: monogram,
        role:     roleText,
        segment:  segText,
        kpis: [
          { value: lifetime, label: "Lifetime Value" },
          { value: "4",      label: "Orders" },
        ],
        facets: facets,
      },
      quote: plain(p.quote),
    };
  }

  // ─── Title / eyebrow / headline / sub resolution ───────────────
  // Pull the display-text fields off the resolved editorPaths, with
  // sensible per-template fallbacks to the adapter's customer copy.
  function copyFor(template, slide, cfg, state, fields) {
    const cust = cfg.customer || {};
    const persona = cfg.persona || {};
    const layout = (slide && slide.layout) || "";
    const f = state.storyFoundations || {};
    const acts = state.storyActs || [];
    const fit = function (s, n) { return SHARED.fitSentences ? plain(SHARED.fitSentences(s, n)) : plain(s); };
    // SE-authored DEMO-section slides (demo-deck-renderer.js vocabulary) carry
    // their display text ON THE SLIDE (slide.title/kicker/headline/sub), not via
    // editorPaths against global state. Resolve those here so the export mirrors
    // /demo instead of falling back to a title-only slide.
    const demoLayouts = {
      hero: 1, futureState: 1, storyInterstitial: 1, storyFoundation: 1,
      currentFutureState: 1, executiveSummary: 1, architecture: 1,
      scenePhoto: 1, deviceMoment: 1, screenFlow: 1, screenActOpener: 1,
    };
    if (demoLayouts[layout]) {
      const cleanT = function (s, fb) { return (SHARED.cleanHeadline ? plain(SHARED.cleanHeadline(s, 90)) : plain(s)) || fb; };
      const act = (slide && slide.linkedActId && acts.find(function (a) { return a.id === slide.linkedActId; })) || acts[0] || {};
      switch (layout) {
        case "hero":
        case "futureState":
          return {
            title:   cleanT(slide.title || slide.headline, plain(cust.heroHeadline || cust.name || "Customer")),
            eyebrow: plain(slide.section || slide.eyebrow || cust.demoTitle || "Demo"),
            sub:     fit(slide.sub || slide.subline || slide.summary || f.businessProblem, 220) || plain(cust.heroSub || ""),
          };
        case "storyInterstitial":
          return {
            title:   cleanT(slide.headline || slide.title, plain(cust.heroHeadline || "")),
            eyebrow: plain(slide.kicker || slide.eyebrow || slide.section || cust.demoTitle || "Demo"),
            sub:     fit(slide.sub || slide.subline || slide.summary, 220),
          };
        case "storyFoundation":
          return {
            title:   cleanT(f.transformationThesis || slide.title, "From a single moment to a connected future."),
            eyebrow: "Story Foundation", sub: "",
          };
        case "currentFutureState":
          return {
            title:   cleanT(slide.title, "From today to a connected future."),
            eyebrow: "Before / After",
            sub:     fit(f.transformationThesis, 200) || "Identity + AI + agents turn fragmented touches into one experience.",
          };
        case "executiveSummary":
          return { title: cleanT(slide.title, "Three things that compound."), eyebrow: "The Takeaway", sub: "" };
        case "architecture":
          return { title: cleanT(slide.title, "One platform. Every layer."), eyebrow: "Solution Architecture", sub: "" };
        case "scenePhoto":
          return {
            title:   cleanT(slide.title, "One visit. One email."),
            eyebrow: plain(slide.section || cust.demoTitle || "Demo"),
            sub:     fit(act.summary, 220),
          };
        case "deviceMoment":
          return {
            title:   cleanT(slide.title || act.title, "A moment that matters."),
            eyebrow: plain(act.salesforceCapabilities || (slide.capabilities && slide.capabilities[0]) || "Live moment"),
            sub:     fit(act.summary || act.demoMoment || f.businessProblem, 220),
          };
        case "screenFlow":
          // The console screenshot IS the slide; the eyebrow + headline sit
          // above it, mirroring the /demo screenFlow header (sf-flow-eyebrow /
          // sf-flow-headline). Solo screens carry a flowBody intro paragraph.
          return {
            title:   cleanT(slide.title, plain(cust.demoTitle || "Inside the console")),
            eyebrow: plain(slide.eyebrow || slide.section || cust.demoTitle || "Demo"),
            sub:     slide.soloScreen ? fit(slide.flowBody || slide.sub, 220) : "",
          };
        case "screenActOpener": {
          // The animated opener captures as an image too; its display copy
          // lives in openerConfig (mirrors demo-deck-renderer.js screenActOpener).
          const oc = (slide && slide.openerConfig) || {};
          return {
            title:   cleanT(oc.headline || slide.title, "The call that runs itself."),
            eyebrow: plain(oc.eyebrow || slide.eyebrow || cust.demoTitle || "Demo"),
            sub:     fit(oc.body || slide.sub, 220),
          };
        }
      }
    }
    // Only treat a resolved editor "Headline"/"Title" as the display title.
    // Falling back to slide.title here would surface the builder-internal
    // label ("Spotlight · stats + quote (mr-2)"), so layouts WITHOUT a
    // headline field get a customer-facing default from the adapter cfg below.
    const editorTitle = plain(firstOf(fields, ["Headline", "Title"]));
    const eyebrow = plain(firstOf(fields, [
      "Theme (top label / eyebrow)", "Eyebrow (small label above the title)", "Theme",
    ]));
    let sub = plain(firstOf(fields, [
      "Sub-line", "Sub-line · business problem", "Sub-line · primary narrative",
      "Sub-line · demo relevance (wins)", "Sub-line · future vision (fallback)",
      "Sub-line · demo relevance", "Sub-line · goals (fallback)", "Transformation thesis",
    ]));

    // Customer-facing default headline per layout — mirrors what /demo
    // renders as the slide's big title (never the internal editor label).
    let defTitle = "";
    switch (layout) {
      case "personaIntro":   defTitle = persona.name ? ("Meet " + persona.name) : "Meet the persona"; break;
      case "personaCard":    defTitle = persona.fullName || persona.name || "Persona spotlight"; break;
      case "unifiedProfile": defTitle = persona.fullName ? (persona.fullName + " · unified profile") : "Unified customer profile"; break;
      case "personaWishlist":defTitle = plain(firstOf(fields, ["Wishlist headline"])) || persona.wishlistHeadline || "The wishlist"; break;
      case "personaCta":     defTitle = persona.ctaHeadline || "Begin the journey"; break;
      case "chapterOpener":  defTitle = plain(firstOf(fields, ["Demo title", "Theme"])) || cust.demoTitle || "The demo"; break;
      case "bvClosing":      defTitle = cust.closingQuote || cust.name + " + Salesforce"; break;
      default:               defTitle = plain(slide && slide.title || "");
    }
    const title = editorTitle || defTitle;
    const out = { title: title, eyebrow: eyebrow, sub: sub };

    if (template === "titleSlide") {
      out.title = editorTitle || plain(cust.heroHeadline || cust.storyHook || cust.name || "Customer");
      out.eyebrow = eyebrow || plain(cust.demoTitle || "");
      out.sub = sub || plain(cust.heroSub || cust.storyHookSub || "");
    } else if (template === "sectionDivider") {
      // Closing/CTA carry a takeaway or CTA sub beneath the divider title.
      if (layout === "personaCta") out.sub = sub || plain(persona.ctaSub || "");
      else if (layout === "bvClosing") out.sub = sub || plain(firstOf(fields, ["Executive takeaway"]) || cust.closingQuote || "");
      else out.sub = sub;
    } else if (template === "personaCard" && layout === "personaCard") {
      // Persona spotlight: a short relevance/pain line under the title.
      out.sub = sub || fit(persona.demoRelevance || persona.painPoints || persona.role, 200);
    } else if (template === "profileConsole") {
      // Match /demo's unifiedProfile right-pane copy: a Data Cloud eyebrow and a
      // "who is she, really?" framing line above the console reproduction.
      out.eyebrow = eyebrow || "Data Cloud · Unified Profile";
      out.sub = sub || fit(
        "Data Cloud builds a rich, real-time profile of " + (persona.name || "the customer") +
        " from behavior across every channel — resolved into one identity.", 200);
    }
    return out;
  }

  // ─── NormalizedSlide builder (sync part) ───────────────────────
  function normalizeSlide(slide, cfg, state) {
    const template = templateFor(slide);
    // "cx" and "interstitial" are deferred markers resolved below; structured
    // data isn't pulled for them here (their resolved template drives it).
    const deferred = template === "cx" || template === "interstitial";
    const fields = resolveAll(slide, state);
    const copy = copyFor(template, slide, cfg, state, fields);
    const structured = deferred ? {} : structuredFor(template, slide, cfg, state, fields);

    const ns = {
      id:           slide.id || slide.layout || "",
      layout:       slide.layout || "",
      template:     template,
      sectionId:    slide.sectionId || "",
      title:        copy.title,
      eyebrow:      copy.eyebrow,
      headline:     copy.title,
      sub:          copy.sub,
      bullets:      structured.bullets || [],
      metrics:      structured.metrics || [],
      chat:         structured.chat || [],
      facets:       structured.facets || [],
      quote:        structured.quote || "",
      quoteTag:     structured.quoteTag || "",
      stamp:        structured.stamp || "",
      columns:      structured.columns || [],
      rows:         structured.rows || [],
      chips:        structured.chips || [],
      chipsLabel:   structured.chipsLabel || "",
      console:      structured.console || null,
      products:     structured.products || [],
      image:        null, // filled async below
      _imageSlot:   null,
      deviceHint:   (slide && slide.deviceHint) || "",
      speakerNotes: plain(resolveField(slide, state, "Speaker notes") || (slide && slide.speakerNotes) || ""),
      cxFallback:   null,
    };

    if (template === "cx") {
      ns.cxFallback = cxFallbackFor(slide, cfg, state);
      // A still image is treated exactly like a device scene image.
      ns.template = ns.cxFallback.stillUrl ? "deviceSceneImage" : "placeholderCx";
      if (ns.cxFallback.stillUrl) ns._imageSlot = { url: ns.cxFallback.stillUrl, kind: "cx" };
    } else if (template === "interstitial") {
      // Narrative beat: split text/image when it carries an image, else a
      // centered titleSlide — mirrors /demo's .dd-interstitial-split vs solo.
      ns._imageSlot = imageSlotFor(slide, cfg, state);
      ns.template = ns._imageSlot ? "deviceSceneImage" : "titleSlide";
    } else if (template === "screenImage") {
      // Console screens have no static asset — mark the slide for in-browser
      // screenshot capture. buildExportModel's imgJobs renders the live screen
      // via HOLO_DEMO.renderScreenFlow + rasterizes it to a PNG data URL. If
      // capture is unavailable (headless/no DOM), the slot resolves to null and
      // the exporter falls back to the eyebrow+headline text card.
      ns._imageSlot = { kind: "screen", captureSlide: slide };
    } else {
      ns._imageSlot = imageSlotFor(slide, cfg, state);
    }
    return ns;
  }

  // ─── Public: buildExportModel ──────────────────────────────────
  function buildExportModel(state) {
    state = state || {};
    // signAssets mutates the SAME state object it resolves with — clone
    // is unnecessary (the adapter reads the freshly-signed assetLibrary),
    // and matches zip-exporter's `STORE.signAssets(state).catch(()=>state)`.
    const signPromise = STORE.signAssets
      ? Promise.resolve(STORE.signAssets(state)).catch(function () { return state; })
      : Promise.resolve(state);

    return signPromise.then(function (signedState) {
      const st = signedState || state;
      const cfg = ADAPTER.toPolishedHolodeckConfig
        ? ADAPTER.toPolishedHolodeckConfig(st)
        : { brand: {}, demoAssets: {}, customer: {}, persona: {}, journey: {}, bvs: {} };
      const manifest = SHARED.buildSlideManifest ? SHARED.buildSlideManifest(st) : [];

      const slides = manifest.map(function (sl) { return normalizeSlide(sl, cfg, st); });

      // Resolve every image slot → data URL (parallel; failures → null).
      const imgJobs = slides.map(function (ns) {
        if (!ns._imageSlot) return Promise.resolve();
        const slot = ns._imageSlot;
        const slotKind = slot.kind;
        // Console screens: capture the live in-DOM screen to a PNG here in the
        // browser (no static URL exists). Failure → null → text-card fallback.
        if (slotKind === "screen") {
          return captureScreenImage(slot.captureSlide, cfg, st).then(function (img) {
            if (img && img.dataUrl) ns.image = { dataUrl: img.dataUrl, w: img.w, h: img.h, kind: "screen" };
            delete ns._imageSlot;
          }).catch(function () { delete ns._imageSlot; });
        }
        // Keep the original (signed) URL alongside the data URL. The
        // PPTX/PDF exporters embed dataUrl.
        const srcUrl = slot.url;
        return imageToDataUrl(srcUrl).then(function (img) {
          if (img) ns.image = { dataUrl: img.dataUrl, url: srcUrl, w: img.w, h: img.h, kind: slotKind };
          delete ns._imageSlot;
        });
      });

      return Promise.all(imgJobs).then(function () {
        const project = st.project || {};
        return {
          meta: {
            name:         project.name || "Holodeck",
            customerName: project.customerName || "",
            theme:        project.theme || "",
            slideCount:   slides.length,
          },
          brand: brandTheme(cfg.brand || {}),
          slides: slides,
        };
      });
    });
  }

  // Normalize the adapter brand into hex-without-# tokens the exporters use.
  function brandTheme(b) {
    const hex = function (c, fallback) {
      let s = String(c || fallback || "").trim();
      if (s.charAt(0) === "#") s = s.slice(1);
      return /^[0-9a-fA-F]{6}$/.test(s) ? s.toUpperCase() : fallback;
    };
    return {
      primary:   hex(b.primaryColor,   "B22234"),
      secondary: hex(b.secondaryColor, "1A5FA0"),
      accent:    hex(b.accentColor,    "F5C06A"),
      navy:      hex(b.navyColor,      "0D1B2E"),
      bg:        hex(b.bgColor,        "F5F7FF"),
      logoPath:  b.logoPath || "",
      customerLogoPath: b.customerLogoPath || "",
      fontHeading: cleanFont(b.fontHeading) || "Playfair Display",
      fontBody:    cleanFont(b.fontBody)    || "Inter",
    };
  }
  function cleanFont(f) {
    // adapter stores CSS font stacks ("'Playfair Display', serif") — take
    // the first family, unquoted, for the exporters' font name.
    if (!f) return "";
    return String(f).split(",")[0].replace(/['"]/g, "").trim();
  }

  // ─── Public API ────────────────────────────────────────────────
  global.HOLO_EXPORT_MODEL = {
    buildExportModel:  buildExportModel,
    resolveField:      resolveField,
    imageToDataUrl:    imageToDataUrl,
    LAYOUT_TO_TEMPLATE: LAYOUT_TO_TEMPLATE,
    templateFor:       templateFor,
    THEME:             THEME,
    // exposed for exporters + tests
    plain:             plain,
    stripEmoji:        stripEmoji,
    getAtPath:         getAtPath,
    meterFrac:         meterFrac,
    sectionLabel:      sectionLabel,
    profilePaneOps:    profilePaneOps,
    cxFallbackFor:     cxFallbackFor,
  };
})(window);
