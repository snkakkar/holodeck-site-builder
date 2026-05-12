// ════════════════════════════════════════════════════════════════
//  ZIP EXPORTER
//  Packages a ready-to-run holodeck demo folder into a single .zip.
//
//  Why no JSZip? We don't want to vendor a 90KB library or rely on
//  a CDN. ZIP supports a "store" (uncompressed) mode that's a few
//  dozen lines of code and produces archives every standard tool
//  reads. We use that.
//
//  Public API:
//    HOLO_ZIP.downloadCompleteDemoZip(state)
//    HOLO_ZIP.buildDemoZipPayload(state)  → { files: [{path, content}] }
//    HOLO_ZIP.encodeZip(files)            → Blob
//    HOLO_ZIP.safeSlug(value)
// ════════════════════════════════════════════════════════════════

(function (global) {
  "use strict";

  const CONFIG = global.HOLO_CONFIG;
  const PREVIEW = global.HOLO_PREVIEW;

  // ─── Public entry point ──────────────────────────────────────
  function downloadCompleteDemoZip(state) {
    const payload = buildDemoZipPayload(state);
    const blob = encodeZip(payload.files);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "holodeck-" + safeSlug(state) + ".zip";
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 250);
    return payload;
  }

  // ─── Build the file list to put into the ZIP ─────────────────
  function buildDemoZipPayload(state) {
    const slug = safeSlug(state);
    const root = "holodeck-" + slug + "/";
    const cfgJs   = CONFIG.toHolodeckConfigJs(state);
    const cfgJson = CONFIG.toJsonString(state);
    const exportMeta = generateExportMetadata(state);

    const files = [
      // Top-level docs
      { path: root + "README.md",                    content: generateReadme(state) },
      { path: root + "HOW_TO_RUN.md",                content: generateHowToRun(state) },

      // Runnable demo folder
      { path: root + "demo/index.html",              content: generateDemoIndexHtml(state) },
      { path: root + "demo/holodeck.config.js",      content: cfgJs },
      { path: root + "demo/data/holodeck-config.json", content: cfgJson },
      { path: root + "demo/css/styles.css",          content: generateDemoCss(state) },
      { path: root + "demo/js/app.js",               content: generateDemoAppJs(state) },
      { path: root + "demo/js/renderer.js",          content: generateDemoRendererJs(state) },
      { path: root + "demo/assets/ASSET_INSTRUCTIONS.md", content: generateAssetInstructions(state) },

      // Builder metadata for round-trip back into the builder
      { path: root + "source/builder-export-metadata.json", content: JSON.stringify(exportMeta, null, 2) },
      { path: root + "source/holodeck-builder.json",        content: cfgJson },
    ];
    return { files: files, slug: slug, root: root };
  }

  // ─── Slug helper ─────────────────────────────────────────────
  function safeSlug(state) {
    const candidate = (state && (state.name
      || (state.project && state.project.customerName)
      || "demo")) || "demo";
    return String(candidate).toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "demo";
  }

  // ─── Asset references ────────────────────────────────────────
  function collectAssetReferences(state) {
    const refs = [];
    (state.assets || []).forEach(function (a) {
      refs.push({
        name:           a.name || "(unnamed)",
        type:           a.type || "image",
        source:         a.source || "",
        status:         a.status || "needed",
        recommendedFor: a.recommendedFor || [],
        notes:          a.notes || "",
      });
    });
    // Slide-attached assets surface here too.
    (state.slides || []).forEach(function (s) {
      (s.assets || []).forEach(function (a) {
        if (typeof a === "string") refs.push({ name: a, type: "image", source: "", status: "needed", recommendedFor: [s.id] });
        else if (a) refs.push(Object.assign({ recommendedFor: [s.id] }, a));
      });
    });
    return refs;
  }

  // ─── Top-level README ────────────────────────────────────────
  function generateReadme(state) {
    const project = state.project || {};
    const customer = project.customerName || "Customer";
    const products = (project.products || []).join(", ") || "—";
    return [
      "# " + (state.name || customer + " Holodeck"),
      "",
      "A ready-to-run Salesforce Holodeck demo, exported from the Holodeck Builder.",
      "",
      "## What's in this package",
      "",
      "```",
      "demo/                  Runnable static-site holodeck",
      "  index.html           Open this to run the demo",
      "  holodeck.config.js   Customer + slide config (the file you edit)",
      "  data/                JSON snapshot of the config (round-trips to the builder)",
      "  css/styles.css       Theme + slide layouts",
      "  js/app.js            Navigation + boot",
      "  js/renderer.js       Renders slides from the config",
      "  assets/              Drop logos / images / scene URLs here",
      "source/                Builder metadata for re-importing",
      "```",
      "",
      "## Quick start",
      "",
      "Open `HOW_TO_RUN.md` for the simple version.",
      "",
      "## Project info",
      "",
      "- **Customer:** " + customer,
      "- **Industry:** " + (project.industry || "—"),
      "- **Audience:** " + (project.audience || "—"),
      "- **Sales stage:** " + (project.salesStage || "—"),
      "- **Products in scope:** " + products,
      "- **Slides:** " + ((state.slides || []).length),
      "- **Personas:** " + ((state.personas || []).length),
      "- **Story acts:** " + ((state.storyActs || []).length),
      "",
      "## Editing",
      "",
      "1. Open `demo/holodeck.config.js` in any text editor.",
      "2. Update the `customer`, `presenter`, `brand`, and `slides` blocks as needed.",
      "3. Drop logos and images into `demo/assets/` and update the paths in the config.",
      "4. Refresh the browser — no build step.",
      "",
      "## Re-import into the Builder",
      "",
      "Open the Holodeck Builder, click **Import Config**, and paste either",
      "`demo/holodeck.config.js` or `source/holodeck-builder.json`. The builder",
      "will rehydrate setup, story, slides, and recommendations.",
      "",
      "## CX components & iframes",
      "",
      "Embedded CX component slides render AubreyDemo URLs inside an iframe.",
      "Trusted origins (aubreydemo.com) get a normal sandbox; everything else",
      "is sandboxed without `allow-same-origin` so a third-party page can't",
      "read parent state. If a component refuses to load (some sites block",
      "embedding via `X-Frame-Options` or CSP), the slide shows an",
      "**Open in new tab** button as a fallback. To replace or add component",
      "URLs, edit the `builderPlan.cxComponents` array in",
      "`holodeck.config.js` — the `url` field controls what's embedded, and",
      "the `deviceFrame` field controls the phone / desktop / tablet chrome.",
      "",
    ].join("\n");
  }

  // ─── HOW_TO_RUN ──────────────────────────────────────────────
  function generateHowToRun(state) {
    return [
      "# How to run this holodeck",
      "",
      "## Option 1 — open the file directly",
      "",
      "Double-click `demo/index.html`. Most slides will work; some browsers block",
      "loading the JSON config from a `file://` URL, so if the slides don't appear,",
      "use Option 2.",
      "",
      "## Option 2 — local server (recommended)",
      "",
      "```bash",
      "cd demo",
      "python3 -m http.server 8000",
      "```",
      "",
      "Then open `http://localhost:8000` in Chrome.",
      "",
      "## Keyboard shortcuts",
      "",
      "- `→` or `Space` — next slide",
      "- `←` — previous slide",
      "- `Home` — jump to the first slide",
      "- `End` — jump to the last slide",
      "",
      "## What if I want to edit the slides?",
      "",
      "Open `demo/holodeck.config.js`, change any text, and refresh the browser.",
      "Or, re-open the Holodeck Builder, **Import Config** with this file, and",
      "edit visually.",
      "",
    ].join("\n");
  }

  // ─── Builder metadata ────────────────────────────────────────
  function generateExportMetadata(state) {
    const project = state.project || {};
    const slides = (state.slides || []).map(function (s, i) {
      return {
        order: i,
        id: s.id,
        title: s.title,
        layout: s.layout,
        capabilities: s.capabilities || [],
      };
    });
    return {
      exportedAt:   new Date().toISOString(),
      projectId:    state.id || null,
      projectName:  state.name || project.customerName || "Untitled",
      customerName: project.customerName || "",
      industry:     project.industry || "",
      audience:     project.audience || "",
      salesStage:   project.salesStage || "",
      products:     project.products || [],
      slides:       slides,
      assets:       collectAssetReferences(state),
      personas:     (state.personas || []).map(function (p) { return { id: p.id, name: p.name, role: p.role }; }),
      builderVersion: "1.0.0",
    };
  }

  // ─── Generated demo HTML ─────────────────────────────────────
  function generateDemoIndexHtml(state) {
    const project = state.project || {};
    const title = (state.name || project.customerName || "Holodeck Demo") + " — Holodeck";
    return [
      "<!DOCTYPE html>",
      "<html lang=\"en\">",
      "<head>",
      "  <meta charset=\"UTF-8\" />",
      "  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\" />",
      "  <title>" + escapeHtml(title) + "</title>",
      "  <link rel=\"stylesheet\" href=\"https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,700;1,400;1,600&family=Inter:wght@300;400;500;600;700;800&display=swap\" />",
      "  <link rel=\"stylesheet\" href=\"css/styles.css\" />",
      "</head>",
      "<body>",
      "  <header class=\"hd-nav\" id=\"hdNav\"></header>",
      "  <main class=\"hd-deck\" id=\"hdDeck\"></main>",
      "  <nav class=\"hd-dots\" id=\"hdDots\"></nav>",
      "  <div class=\"hd-cta\" id=\"hdCta\">Click or → to advance</div>",
      "",
      "  <script src=\"holodeck.config.js\"></script>",
      "  <script src=\"js/renderer.js\"></script>",
      "  <script src=\"js/app.js\"></script>",
      "</body>",
      "</html>",
    ].join("\n");
  }

  // ─── Generated demo CSS ──────────────────────────────────────
  // Inherits the brand colors from the config at runtime.
  function generateDemoCss(state) {
    return [
      "/* Holodeck demo runtime stylesheet — generated by the Holodeck Builder */",
      ":root {",
      "  --hd-primary:   #b22234;",
      "  --hd-secondary: #1a5fa0;",
      "  --hd-accent:    #f5c06a;",
      "  --hd-navy:      #0d1b2e;",
      "  --hd-bg:        #f5f7ff;",
      "  --hd-bg-2:      #eef2fb;",
      "  --hd-card:      #ffffff;",
      "  --hd-line:      rgba(13, 27, 46, 0.10);",
      "  --hd-line-2:    rgba(13, 27, 46, 0.20);",
      "  --hd-ink:       #0d1b2e;",
      "  --hd-ink-2:     #4a5a6a;",
      "  --hd-ink-3:     #7a8fa8;",
      "  --hd-warn:      #c47e1a;",
      "  --hd-good:      #2e7a50;",
      "  --hd-radius:    16px;",
      "  --hd-radius-s:  10px;",
      "  --hd-radius-pill: 22px;",
      "  --hd-shadow:    0 14px 40px rgba(13, 27, 46, 0.12);",
      "  --hd-font-sans: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;",
      "  --hd-font-serif:'Playfair Display', Georgia, serif;",
      "  --hd-nav-h:     56px;",
      "}",
      "",
      "* { box-sizing: border-box; }",
      "html, body { margin: 0; padding: 0; height: 100%; background: var(--hd-bg); color: var(--hd-ink); font-family: var(--hd-font-sans); -webkit-font-smoothing: antialiased; }",
      "",
      "/* Nav */",
      ".hd-nav { position: fixed; top: 0; left: 0; right: 0; height: var(--hd-nav-h); display: flex; align-items: center; justify-content: space-between; padding: 0 22px; background: rgba(255,255,255,0.92); border-bottom: 1px solid var(--hd-line); backdrop-filter: blur(8px); z-index: 50; }",
      ".hd-nav-l { display: flex; align-items: center; gap: 14px; }",
      ".hd-nav-mark { font-family: var(--hd-font-serif); font-size: 18px; font-weight: 700; color: var(--hd-navy); letter-spacing: -0.01em; }",
      ".hd-nav-customer { font-size: 11px; font-weight: 700; color: var(--hd-ink-3); letter-spacing: 0.10em; text-transform: uppercase; }",
      ".hd-nav-r { display: flex; align-items: center; gap: 10px; }",
      ".hd-nav-pill { font-size: 11px; font-weight: 700; color: var(--hd-primary); padding: 5px 12px; border: 1.5px solid var(--hd-primary); border-radius: var(--hd-radius-pill); }",
      "",
      "/* Deck */",
      ".hd-deck { position: relative; width: 100%; height: 100vh; padding-top: var(--hd-nav-h); }",
      ".hd-slide { position: absolute; inset: var(--hd-nav-h) 0 0 0; display: flex; align-items: center; justify-content: center; padding: 36px 40px 70px; opacity: 0; pointer-events: none; transition: opacity 0.4s ease; overflow: auto; }",
      ".hd-slide.is-active { opacity: 1; pointer-events: auto; }",
      ".hd-stage { width: 100%; max-width: 1100px; }",
      "",
      "/* Dots */",
      ".hd-dots { position: fixed; bottom: 18px; left: 50%; transform: translateX(-50%); display: flex; gap: 8px; z-index: 40; }",
      ".hd-dot { width: 9px; height: 9px; border-radius: 50%; background: rgba(178, 34, 52, 0.30); border: 1.5px solid rgba(178, 34, 52, 0.50); cursor: pointer; transition: transform 0.2s ease; }",
      ".hd-dot.is-active { background: var(--hd-primary); border-color: var(--hd-primary); transform: scale(1.35); }",
      ".hd-cta { position: fixed; bottom: 22px; right: 22px; font-size: 11px; font-weight: 700; letter-spacing: 0.06em; color: var(--hd-ink-3); pointer-events: none; z-index: 40; }",
      "",
      "/* Common preview/slide pieces — match the builder previews */",
      ".hp { background: var(--hd-card); border: 1px solid var(--hd-line); border-radius: var(--hd-radius); padding: 32px 36px; box-shadow: var(--hd-shadow); }",
      ".hp-eyebrow { font-size: 12px; font-weight: 800; letter-spacing: 0.14em; text-transform: uppercase; color: var(--hd-primary); margin-bottom: 8px; }",
      ".hp-title { font-family: var(--hd-font-serif); font-size: 44px; font-weight: 700; color: var(--hd-navy); line-height: 1.1; margin: 0 0 12px; letter-spacing: -0.01em; }",
      ".hp-title-customer { color: var(--hd-primary); }",
      ".hp-title-tagline { color: var(--hd-navy); font-style: italic; font-weight: 600; }",
      ".hp-title-faded { color: var(--hd-ink-3); font-style: italic; }",
      ".hp-h3 { font-family: var(--hd-font-serif); font-size: 26px; font-weight: 700; color: var(--hd-navy); margin: 4px 0 16px; }",
      ".hp-sub { font-size: 16px; color: var(--hd-ink-2); line-height: 1.55; max-width: 70ch; margin: 0 0 14px; }",
      ".hp-empty { background: var(--hd-bg-2); border: 1px dashed var(--hd-line-2); padding: 14px 16px; border-radius: var(--hd-radius-s); color: var(--hd-ink-3); font-size: 13px; }",
      ".hp-badges { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 12px; }",
      ".hp-badge { font-size: 10px; font-weight: 800; letter-spacing: 0.10em; text-transform: uppercase; padding: 5px 12px; border-radius: var(--hd-radius-pill); }",
      ".hp-badge.tone-blue { background: rgba(26,95,160,0.12); color: var(--hd-secondary); }",
      ".hp-badge.tone-red  { background: rgba(178,34,52,0.10); color: var(--hd-primary); }",
      ".hp-badge.tone-gold { background: rgba(245,192,106,0.20); color: var(--hd-warn); }",
      ".hp-callout { background: rgba(245,192,106,0.16); color: var(--hd-warn); border-radius: var(--hd-radius-s); padding: 10px 14px; font-size: 13px; margin-top: 14px; }",
      ".hp-disclaimer { color: var(--hd-ink-3); font-size: 11px; margin-top: 12px; font-style: italic; }",
      ".hp-more { color: var(--hd-ink-3); font-size: 12px; margin-top: 8px; }",
      "",
      "/* Hero */",
      ".hp-hero { background: linear-gradient(160deg, #ffffff 0%, var(--hd-bg) 60%, var(--hd-bg-2) 100%); }",
      ".hp-hero-foot { display: flex; gap: 32px; margin-top: 22px; padding-top: 18px; border-top: 1px solid var(--hd-line); }",
      ".hp-foot-label { font-size: 10px; font-weight: 800; letter-spacing: 0.10em; color: var(--hd-ink-3); text-transform: uppercase; }",
      ".hp-foot-value { font-size: 14px; font-weight: 700; color: var(--hd-navy); margin-top: 4px; }",
      ".hp-logo-tag { position: absolute; top: 18px; right: 22px; font-size: 11px; color: var(--hd-ink-3); }",
      "",
      "/* Timeline */",
      ".hp-rail { display: flex; gap: 16px; overflow-x: auto; padding-bottom: 6px; }",
      ".hp-rail-node { flex: 0 0 240px; }",
      ".hp-rail-dot { width: 28px; height: 28px; border-radius: 50%; background: var(--hd-primary); color: #fff; display: inline-flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 800; margin-bottom: 8px; }",
      ".hp-rail-card { background: var(--hd-bg); border: 1px solid var(--hd-line); border-radius: var(--hd-radius-s); padding: 12px 14px; }",
      ".hp-rail-title { font-size: 13px; font-weight: 800; color: var(--hd-navy); }",
      ".hp-rail-meta  { font-size: 11px; color: var(--hd-ink-2); margin-top: 4px; }",
      ".hp-rail-summary { font-size: 12px; color: var(--hd-ink-2); margin-top: 6px; line-height: 1.5; }",
      ".hp-rail-cap   { font-size: 10px; font-weight: 800; color: var(--hd-secondary); margin-top: 6px; letter-spacing: 0.06em; text-transform: uppercase; }",
      ".hp-rail-bv    { font-size: 11px; font-weight: 600; color: var(--hd-warn); margin-top: 4px; }",
      "",
      "/* Demo map */",
      ".hp-demogrid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 14px; }",
      ".hp-democard { background: var(--hd-bg); border: 1px solid var(--hd-line); border-radius: var(--hd-radius-s); padding: 14px 14px; position: relative; }",
      ".hp-demonum { position: absolute; top: 10px; right: 14px; font-size: 10px; font-weight: 800; color: var(--hd-ink-3); letter-spacing: 0.10em; }",
      ".hp-democard-title { font-size: 13px; font-weight: 800; color: var(--hd-navy); padding-right: 30px; }",
      ".hp-democard-channel { font-size: 11px; color: var(--hd-secondary); margin-top: 4px; }",
      ".hp-democard-cap { font-size: 10px; font-weight: 800; color: var(--hd-primary); letter-spacing: 0.06em; text-transform: uppercase; margin-top: 6px; }",
      ".hp-democard-asset { font-size: 11px; color: var(--hd-ink-3); margin-top: 6px; }",
      "",
      "/* Persona */",
      ".hp-persona-row { display: grid; grid-template-columns: 220px 1fr; gap: 24px; align-items: start; }",
      ".hp-persona-l { text-align: center; }",
      ".hp-persona-avatar { width: 96px; height: 96px; border-radius: 50%; background: linear-gradient(135deg, var(--hd-primary), var(--hd-secondary)); color: #fff; display: inline-flex; align-items: center; justify-content: center; font-family: var(--hd-font-serif); font-size: 36px; font-weight: 700; }",
      ".hp-persona-name { font-family: var(--hd-font-serif); font-size: 22px; font-weight: 700; color: var(--hd-navy); margin-top: 10px; }",
      ".hp-persona-role { font-size: 12px; color: var(--hd-ink-3); letter-spacing: 0.06em; text-transform: uppercase; margin-top: 2px; }",
      ".hp-persona-r { display: flex; flex-direction: column; gap: 12px; }",
      ".hp-persona-sec {}",
      ".hp-persona-label { font-size: 10px; font-weight: 800; color: var(--hd-secondary); letter-spacing: 0.10em; text-transform: uppercase; }",
      ".hp-persona-body { font-size: 14px; color: var(--hd-ink); line-height: 1.55; margin-top: 4px; }",
      "",
      "/* Agent chat */",
      ".hp-chat { display: flex; flex-direction: column; gap: 10px; max-width: 540px; margin: 8px 0; }",
      ".hp-chat-bubble { padding: 12px 14px; border-radius: 14px; line-height: 1.45; font-size: 14px; }",
      ".hp-chat-user  { align-self: flex-start; background: var(--hd-bg-2); color: var(--hd-ink); border-bottom-left-radius: 4px; }",
      ".hp-chat-agent { align-self: flex-end; background: var(--hd-primary); color: #fff; border-bottom-right-radius: 4px; }",
      ".hp-chat-who { font-size: 10px; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase; opacity: 0.75; margin-bottom: 4px; }",
      "",
      "/* Profile */",
      ".hp-profile-card { background: var(--hd-bg); border: 1px solid var(--hd-line); border-radius: var(--hd-radius-s); padding: 18px 20px; }",
      ".hp-profile-head { display: flex; align-items: center; gap: 14px; }",
      ".hp-profile-avatar { width: 52px; height: 52px; border-radius: 50%; background: var(--hd-secondary); color: #fff; display: inline-flex; align-items: center; justify-content: center; font-weight: 800; font-size: 22px; }",
      ".hp-profile-name { font-size: 16px; font-weight: 800; color: var(--hd-navy); }",
      ".hp-profile-role { font-size: 11px; color: var(--hd-ink-3); letter-spacing: 0.06em; text-transform: uppercase; }",
      ".hp-profile-fields { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px; margin-top: 14px; padding-top: 14px; border-top: 1px solid var(--hd-line); }",
      ".hp-profile-label { font-size: 10px; font-weight: 800; color: var(--hd-ink-3); letter-spacing: 0.08em; text-transform: uppercase; }",
      ".hp-profile-value { font-size: 13px; font-weight: 600; color: var(--hd-navy); margin-top: 2px; }",
      ".hp-profile-segs { margin-top: 14px; padding-top: 14px; border-top: 1px solid var(--hd-line); }",
      ".hp-chiprow { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 6px; }",
      ".hp-chip { font-size: 11px; padding: 3px 10px; border-radius: var(--hd-radius-pill); }",
      ".hp-chip.tone-gold { background: rgba(245,192,106,0.20); color: var(--hd-warn); }",
      ".hp-profile-action { font-size: 13px; color: var(--hd-secondary); margin-top: 14px; padding-top: 12px; border-top: 1px solid var(--hd-line); font-weight: 600; }",
      "",
      "/* Architecture */",
      ".hp-arch-layers { display: flex; flex-direction: column; gap: 10px; }",
      ".hp-arch-layer { background: var(--hd-bg); border: 1px solid var(--hd-line); border-radius: var(--hd-radius-s); padding: 12px 14px; }",
      ".hp-arch-layer-h { font-size: 10px; font-weight: 800; letter-spacing: 0.10em; color: var(--hd-ink-3); text-transform: uppercase; margin-bottom: 8px; }",
      ".hp-arch-layer-row { display: flex; flex-wrap: wrap; gap: 6px; }",
      ".hp-arch-node { font-size: 12px; font-weight: 700; padding: 6px 12px; border-radius: var(--hd-radius-s); border: 1px solid var(--hd-line-2); }",
      ".hp-arch-node.tone-blue { background: rgba(26,95,160,0.08); color: var(--hd-secondary); border-color: rgba(26,95,160,0.30); }",
      ".hp-arch-node.tone-red  { background: rgba(178,34,52,0.08); color: var(--hd-primary);   border-color: rgba(178,34,52,0.30); }",
      ".hp-arch-node.tone-gold { background: rgba(245,192,106,0.18); color: var(--hd-warn); border-color: rgba(245,192,106,0.45); }",
      "",
      "/* Device moment */",
      ".hp-device-stage { display: grid; grid-template-columns: 240px 1fr; gap: 24px; align-items: stretch; }",
      ".hp-device-frame { width: 220px; border-radius: 28px; padding: 14px; background: var(--hd-navy); position: relative; min-height: 360px; }",
      ".hp-device-frame.is-laptop { width: 100%; max-width: 360px; border-radius: 12px; min-height: 220px; }",
      ".hp-device-screen { background: var(--hd-card); border-radius: 18px; height: 100%; padding: 18px 16px; min-height: 320px; display: flex; flex-direction: column; gap: 10px; }",
      ".hp-device-frame.is-laptop .hp-device-screen { min-height: 200px; border-radius: 6px; }",
      ".hp-device-bar { height: 6px; width: 60px; background: var(--hd-line-2); border-radius: 4px; }",
      ".hp-device-headline { font-family: var(--hd-font-serif); font-size: 18px; font-weight: 700; color: var(--hd-navy); line-height: 1.2; }",
      ".hp-device-body { font-size: 12px; color: var(--hd-ink-2); line-height: 1.5; }",
      ".hp-device-cta { margin-top: auto; align-self: flex-start; background: var(--hd-primary); color: #fff; font-size: 11px; font-weight: 800; letter-spacing: 0.06em; padding: 8px 14px; border-radius: var(--hd-radius-pill); text-transform: uppercase; }",
      ".hp-device-narr { display: flex; flex-direction: column; gap: 8px; }",
      ".hp-device-stats { display: flex; gap: 16px; margin-top: auto; padding-top: 12px; border-top: 1px solid var(--hd-line); }",
      ".hp-device-stat-v { font-family: var(--hd-font-serif); font-size: 18px; font-weight: 700; color: var(--hd-primary); }",
      ".hp-device-stat-l { font-size: 10px; color: var(--hd-ink-3); letter-spacing: 0.06em; text-transform: uppercase; }",
      "",
      "/* KPI */",
      ".hp-kpi-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px; }",
      ".hp-kpi-card { background: var(--hd-bg); border: 1px solid var(--hd-line); border-radius: var(--hd-radius-s); padding: 16px 14px; text-align: left; }",
      ".hp-kpi-value { font-family: var(--hd-font-serif); font-size: 30px; font-weight: 700; color: var(--hd-primary); line-height: 1; }",
      ".hp-kpi-label { font-size: 11px; font-weight: 800; color: var(--hd-navy); letter-spacing: 0.06em; text-transform: uppercase; margin-top: 6px; }",
      ".hp-kpi-hint  { font-size: 11px; color: var(--hd-ink-3); margin-top: 6px; }",
      "",
      "/* Executive */",
      ".hp-exec-cols { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 14px; }",
      ".hp-exec-col { background: var(--hd-bg); border: 1px solid var(--hd-line); border-radius: var(--hd-radius-s); padding: 14px 14px; }",
      ".hp-exec-col.hp-faded { color: var(--hd-ink-3); font-style: italic; }",
      ".hp-exec-label { font-size: 10px; font-weight: 800; color: var(--hd-secondary); letter-spacing: 0.10em; text-transform: uppercase; }",
      ".hp-exec-body { font-size: 13px; color: var(--hd-ink); line-height: 1.55; margin-top: 6px; }",
      ".hp-exec-cta { margin-top: 12px; font-size: 13px; font-weight: 700; color: var(--hd-primary); }",
      "",
      "/* Story Foundation */",
      ".hp-foundation-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }",
      ".hp-pillar { background: var(--hd-bg); border: 1px solid var(--hd-line); border-radius: var(--hd-radius-s); padding: 16px 18px; }",
      ".hp-pillar.hp-faded { color: var(--hd-ink-3); font-style: italic; }",
      ".hp-pillar-label { font-size: 10px; font-weight: 800; color: var(--hd-secondary); letter-spacing: 0.10em; text-transform: uppercase; }",
      ".hp-pillar-body { font-size: 14px; color: var(--hd-ink); line-height: 1.55; margin-top: 6px; }",
      "",
      "/* Current vs Future */",
      ".hp-twostate-cols { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }",
      ".hp-side { background: var(--hd-bg); border: 1px solid var(--hd-line); border-radius: var(--hd-radius-s); padding: 16px 18px; }",
      ".hp-side-current { border-left: 4px solid var(--hd-warn); }",
      ".hp-side-future  { border-left: 4px solid var(--hd-good); }",
      ".hp-side.hp-faded { color: var(--hd-ink-3); font-style: italic; }",
      ".hp-side-label { font-size: 10px; font-weight: 800; letter-spacing: 0.10em; text-transform: uppercase; color: var(--hd-ink-3); }",
      ".hp-side-body { font-size: 14px; color: var(--hd-ink); line-height: 1.55; margin-top: 6px; }",
      ".hp-bridge { margin-top: 14px; padding-top: 14px; border-top: 1px solid var(--hd-line); }",
      ".hp-bridge-label { font-size: 10px; font-weight: 800; color: var(--hd-ink-3); letter-spacing: 0.10em; text-transform: uppercase; margin-bottom: 6px; }",
      "",
      "/* Future state */",
      ".hp-future-outs { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 10px; margin-top: 14px; }",
      ".hp-future-out { background: var(--hd-bg); border-left: 4px solid var(--hd-primary); padding: 10px 14px; border-radius: 6px; font-size: 13px; }",
      "",
      "/* Embedded CX */",
      ".hp-embedded-list { display: grid; grid-template-columns: 1fr; gap: 16px; }",
      ".hp-embedded-card { background: var(--hd-bg); border: 1px solid var(--hd-line); border-radius: var(--hd-radius-s); padding: 14px 16px; }",
      ".hp-embedded-head { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; margin-bottom: 10px; }",
      ".hp-embedded-name { font-size: 15px; font-weight: 800; color: var(--hd-navy); }",
      ".hp-embedded-type { font-size: 10px; font-weight: 800; color: var(--hd-ink-3); letter-spacing: 0.10em; text-transform: uppercase; }",
      ".hp-embedded-frame { background: var(--hd-navy); border-radius: 12px; padding: 10px; min-height: 320px; }",
      ".hp-embedded-frame.is-mobile  { width: 280px; max-width: 100%; margin: 0 auto; min-height: 480px; border-radius: 28px; padding: 14px; }",
      ".hp-embedded-frame.is-tablet  { max-width: 600px; }",
      ".hp-embedded-frame.is-desktop { width: 100%; }",
      ".hp-embedded-frame.is-none    { background: transparent; padding: 0; }",
      ".hp-embedded-frame iframe { background: #fff; border-radius: 8px; min-height: 300px; }",
      ".hp-embedded-frame.is-mobile iframe { min-height: 460px; border-radius: 18px; }",
      ".hp-embedded-url { font-family: ui-monospace, monospace; font-size: 11px; color: var(--hd-ink-3); word-break: break-all; padding: 8px 10px; background: rgba(13,27,46,0.04); border-radius: 6px; }",
      ".hp-embedded-link { font-size: 11px; color: var(--hd-secondary); margin-top: 8px; }",
      ".hp-embedded-cta { display: inline-block; margin-top: 10px; font-size: 12px; font-weight: 700; color: var(--hd-primary); text-decoration: none; padding: 6px 12px; border: 1.5px solid var(--hd-primary); border-radius: var(--hd-radius-pill); }",
      ".hp-asset-pill { font-size: 9px; font-weight: 800; letter-spacing: 0.10em; text-transform: uppercase; padding: 3px 9px; border-radius: var(--hd-radius-pill); display: inline-block; }",
      ".hp-asset-pill.tone-red  { background: rgba(178,34,52,0.10); color: var(--hd-primary); }",
      ".hp-asset-pill.tone-gold { background: rgba(245,192,106,0.20); color: var(--hd-warn); }",
      ".hp-asset-pill.tone-good { background: rgba(46,122,80,0.12); color: var(--hd-good); }",
      "",
      "/* Next steps */",
      ".hp-next-list { padding-left: 22px; line-height: 1.8; font-size: 14px; color: var(--hd-ink); }",
      ".hp-next-item { padding: 6px 0; }",
      "",
      "/* Unknown */",
      ".hp-unknown { background: var(--hd-bg); border-style: dashed; }",
      "",
      "/* Section banners between slide groups */",
      ".hd-section-banner { position: absolute; top: var(--hd-nav-h); left: 0; right: 0; padding: 6px 22px; background: rgba(13,27,46,0.90); color: #fff; font-size: 11px; font-weight: 800; letter-spacing: 0.12em; text-transform: uppercase; z-index: 30; pointer-events: none; }",
      ".hd-section-banner span { color: rgba(255,255,255,0.55); margin-right: 10px; font-weight: 600; }",
      "",
      "@media (max-width: 760px) {",
      "  .hp { padding: 22px 18px; }",
      "  .hp-title { font-size: 30px; }",
      "  .hp-h3 { font-size: 20px; }",
      "  .hp-persona-row, .hp-device-stage, .hp-foundation-grid, .hp-twostate-cols { grid-template-columns: 1fr; }",
      "  .hp-exec-cols { grid-template-columns: 1fr; }",
      "}",
      "",
    ].join("\n");
  }

  // ─── Generated demo runtime: app.js (boot + nav + sections) ──
  function generateDemoAppJs(state) {
    return [
      "/* Holodeck demo runtime — boot, navigation, keyboard. Generated. */",
      "(function () {",
      "  \"use strict\";",
      "  const cfg = window.HOLODECK_CONFIG || {};",
      "  const plan = cfg.builderPlan || {};",
      "  const slides = (plan.slides || []).slice().sort(function (a, b) { return (a.order || 0) - (b.order || 0); });",
      "  const project = cfg.customer || {};",
      "  const brand = cfg.brand || {};",
      "  const root = document.documentElement;",
      "  if (brand.primaryColor)   root.style.setProperty(\"--hd-primary\",   brand.primaryColor);",
      "  if (brand.secondaryColor) root.style.setProperty(\"--hd-secondary\", brand.secondaryColor);",
      "  if (brand.accentColor)    root.style.setProperty(\"--hd-accent\",    brand.accentColor);",
      "",
      "  const SECTION_LABELS = {",
      "    \"intro\":          \"Intro\",",
      "    \"journey-map\":    \"Journey Map\",",
      "    \"meet-persona\":   \"Meet the Persona\",",
      "    \"demo\":           \"Demo\",",
      "    \"business-value\": \"Business Value\"",
      "  };",
      "  const personas = (plan.personas || []);",
      "  const personaFirstName = personas[0] && personas[0].name ? String(personas[0].name).split(/\\s+/)[0] : \"\";",
      "  function sectionLabel(id) {",
      "    if (id === \"meet-persona\" && personaFirstName) return \"Meet \" + personaFirstName;",
      "    return SECTION_LABELS[id] || \"\";",
      "  }",
      "",
      "  // Build nav",
      "  const nav = document.getElementById(\"hdNav\");",
      "  nav.innerHTML = \"\";",
      "  const navL = document.createElement(\"div\"); navL.className = \"hd-nav-l\";",
      "  const mark = document.createElement(\"div\"); mark.className = \"hd-nav-mark\";",
      "  mark.textContent = (project.name || \"Holodeck\");",
      "  navL.appendChild(mark);",
      "  if (project.industry) {",
      "    const c = document.createElement(\"div\"); c.className = \"hd-nav-customer\"; c.textContent = project.industry;",
      "    navL.appendChild(c);",
      "  }",
      "  nav.appendChild(navL);",
      "  const navR = document.createElement(\"div\"); navR.className = \"hd-nav-r\";",
      "  const pill = document.createElement(\"div\"); pill.className = \"hd-nav-pill\"; pill.textContent = \"Salesforce\";",
      "  navR.appendChild(pill);",
      "  nav.appendChild(navR);",
      "  document.title = (project.name || \"Holodeck\") + \" — Holodeck\";",
      "",
      "  // Build deck — slides are pre-grouped by section via their sectionId.",
      "  const deck = document.getElementById(\"hdDeck\");",
      "  const dots = document.getElementById(\"hdDots\");",
      "  deck.innerHTML = \"\";",
      "  dots.innerHTML = \"\";",
      "  if (!slides.length) {",
      "    const empty = document.createElement(\"div\");",
      "    empty.className = \"hd-slide is-active\";",
      "    empty.innerHTML = '<div class=\"hd-stage\"><div class=\"hp\"><div class=\"hp-eyebrow\">Empty deck</div><h2 class=\"hp-title\">No slides selected yet.</h2><p class=\"hp-sub\">Open holodeck.config.js or re-export from the Holodeck Builder.</p></div></div>';",
      "    deck.appendChild(empty);",
      "    return;",
      "  }",
      "",
      "  slides.forEach(function (s, i) {",
      "    const slideEl = document.createElement(\"section\");",
      "    slideEl.className = \"hd-slide\" + (i === 0 ? \" is-active\" : \"\");",
      "    if (s.sectionId) {",
      "      const banner = document.createElement(\"div\");",
      "      banner.className = \"hd-section-banner\";",
      "      const lbl = sectionLabel(s.sectionId);",
      "      if (lbl) {",
      "        banner.innerHTML = '<span>Section</span>' + lbl;",
      "        slideEl.appendChild(banner);",
      "      }",
      "    }",
      "    const stage = document.createElement(\"div\"); stage.className = \"hd-stage\";",
      "    const block = window.HOLODECK_RENDER && window.HOLODECK_RENDER.renderSlide(s, cfg);",
      "    if (block) stage.appendChild(block);",
      "    slideEl.appendChild(stage);",
      "    deck.appendChild(slideEl);",
      "    const dot = document.createElement(\"button\");",
      "    dot.className = \"hd-dot\" + (i === 0 ? \" is-active\" : \"\");",
      "    dot.title = (s.title || \"Slide \" + (i + 1));",
      "    dot.addEventListener(\"click\", function () { go(i); });",
      "    dots.appendChild(dot);",
      "  });",
      "",
      "  let current = 0;",
      "  function go(i) {",
      "    if (i < 0 || i >= slides.length) return;",
      "    current = i;",
      "    Array.prototype.forEach.call(deck.children, function (s, idx) {",
      "      s.classList.toggle(\"is-active\", idx === i);",
      "    });",
      "    Array.prototype.forEach.call(dots.children, function (d, idx) {",
      "      d.classList.toggle(\"is-active\", idx === i);",
      "    });",
      "  }",
      "",
      "  document.addEventListener(\"keydown\", function (e) {",
      "    if (e.key === \"ArrowRight\" || e.key === \" \") go(current + 1);",
      "    else if (e.key === \"ArrowLeft\") go(current - 1);",
      "    else if (e.key === \"Home\") go(0);",
      "    else if (e.key === \"End\") go(slides.length - 1);",
      "  });",
      "  deck.addEventListener(\"click\", function (e) {",
      "    // Don't advance from clicks on iframes, links, buttons, etc.",
      "    if (e.target.closest(\"a, button, input, select, textarea, iframe, .hp-embedded-card\")) return;",
      "    go(current + 1);",
      "  });",
      "})();",
      "",
    ].join("\n");
  }

  // ─── Generated demo runtime: renderer.js ─────────────────────
  // Reuses the same DOM-building approach as preview-renderer.js so
  // the exported demo looks just like the builder previews.
  function generateDemoRendererJs(state) {
    // Re-emit the layout renderers from preview-renderer.js into the
    // exported demo. We do this by re-defining the same functions in
    // a self-contained file so the demo doesn't depend on the builder.
    return [
      "/* Holodeck demo renderer — layout-aware slide rendering. Generated. */",
      "(function (global) {",
      "  \"use strict\";",
      "",
      "  function el(tag, attrs, children) {",
      "    const node = document.createElement(tag);",
      "    if (attrs) Object.keys(attrs).forEach(function (k) {",
      "      if (k === \"class\") node.className = attrs[k];",
      "      else if (k === \"style\") node.setAttribute(\"style\", attrs[k]);",
      "      else if (k === \"text\") node.textContent = attrs[k];",
      "      else node.setAttribute(k, attrs[k]);",
      "    });",
      "    (children || []).forEach(function (c) {",
      "      if (c == null || c === false) return;",
      "      node.appendChild(typeof c === \"string\" ? document.createTextNode(c) : c);",
      "    });",
      "    return node;",
      "  }",
      "",
      "  function truncate(s, max) {",
      "    if (!s) return \"\";",
      "    s = String(s).replace(/\\s+/g, \" \").trim();",
      "    if (s.length <= max) return s;",
      "    return s.slice(0, max - 1).replace(/\\s+\\S*$/, \"\") + \"…\";",
      "  }",
      "",
      "  function pickPersona(plan, slide) {",
      "    if (!plan || !plan.personas) return null;",
      "    if (slide && slide.persona) {",
      "      const match = plan.personas.find(function (p) { return p.name === slide.persona; });",
      "      if (match) return match;",
      "    }",
      "    return plan.personas[0] || null;",
      "  }",
      "",
      "  function deriveKpis(plan) {",
      "    const products = (plan && plan.products) || [];",
      "    const industry = (plan && plan.industry) || \"\";",
      "    const out = [];",
      "    function push(v, l, h) { out.push({ value: v, label: l, hint: h }); }",
      "    if (industry === \"Retail\" || industry === \"Consumer Goods\" || products.indexOf(\"Commerce\") >= 0) {",
      "      push(\"XX%\", \"Conversion Lift\", \"from personalized journeys\");",
      "      push(\"+$XX\", \"Average Order Value\", \"with AI recommendations\");",
      "    }",
      "    if (products.indexOf(\"Loyalty\") >= 0) push(\"XX%\", \"Loyalty Enrollment\", \"tier upgrades & sign-ups\");",
      "    if (products.indexOf(\"Service Cloud\") >= 0 || products.indexOf(\"Agentforce\") >= 0) push(\"XX%\", \"Service Efficiency\", \"agent + autonomous deflection\");",
      "    if (industry === \"Hospitality\" || industry === \"Travel\") push(\"XXx\", \"Repeat Booking Rate\", \"across stays / trips\");",
      "    if (out.length < 3) push(\"XX%\", \"Revenue Lift\", \"from connected experiences\");",
      "    if (out.length < 4) push(\"XXh\", \"Time Saved\", \"per associate per week\");",
      "    return out.slice(0, 5);",
      "  }",
      "",
      "  function getData(slide, cfg) {",
      "    const plan = (cfg && cfg.builderPlan) || {};",
      "    const project = (cfg && cfg.customer) || {};",
      "    const products = plan.products || [];",
      "    const cx = plan.cxComponents || [];",
      "    const linkedCx = ((slide && slide.linkedCxComponentIds) || []).map(function (id) { return cx.find(function (c) { return c.id === id; }); }).filter(Boolean);",
      "    return {",
      "      slide: slide || {},",
      "      title: (slide && slide.title) || \"Untitled\",",
      "      customerName: project.name || \"\",",
      "      industry:     project.industry || \"\",",
      "      audience:     plan.audience || \"\",",
      "      salesStage:   plan.salesStage || \"\",",
      "      products:     products,",
      "      capabilities: (slide && slide.capabilities) || products,",
      "      persona:      pickPersona(plan, slide),",
      "      personas:     plan.personas || [],",
      "      acts:         plan.storyActs || [],",
      "      story:        (plan.story || {}),",
      "      foundations:  (plan.storyFoundations || {}),",
      "      cxComponents: cx,",
      "      linkedCxComponents: linkedCx,",
      "      theme:        plan.theme || \"\",",
      "      kpis:         deriveKpis({ products: products, industry: project.industry }),",
      "    };",
      "  }",
      "  function safeUrl(s) { if (!s) return \"\"; try { const u = new URL(s); return (u.protocol === \"http:\" || u.protocol === \"https:\") ? u.toString() : \"\"; } catch (e) { return \"\"; } }",
      "  const TRUSTED_IFRAME_HOSTS = [\"aubreydemo.com\"];",
      "  function isTrustedIframeOrigin(s) { if (!s) return false; try { const u = new URL(s); return TRUSTED_IFRAME_HOSTS.some(function (h) { return u.hostname === h || u.hostname.endsWith(\".\" + h); }); } catch (e) { return false; } }",
      "",
      "  // Each layout renderer mirrors the builder's preview-renderer.",
      "  const RENDERERS = {",
      "    hero: function (data) {",
      "      const root = el(\"div\", { class: \"hp hp-hero\" });",
      "      root.appendChild(el(\"div\", { class: \"hp-eyebrow\", text: [data.industry, data.salesStage].filter(Boolean).join(\" · \") || \"Holodeck\" }));",
      "      root.appendChild(el(\"h2\", { class: \"hp-title\" }, [",
      "        el(\"span\", { class: \"hp-title-customer\", text: data.customerName || \"Customer\" }),",
      "        el(\"br\"), el(\"span\", { class: \"hp-title-tagline\", text: data.theme || \"+ Salesforce\" }),",
      "      ]));",
      "      root.appendChild(el(\"p\", { class: \"hp-sub\", text: data.story.futureVision || data.story.bigProblem || \"Add a future-state vision.\" }));",
      "      const badges = el(\"div\", { class: \"hp-badges\" });",
      "      data.products.slice(0, 6).forEach(function (p) { badges.appendChild(el(\"span\", { class: \"hp-badge tone-blue\", text: p })); });",
      "      if (data.products.length) root.appendChild(badges);",
      "      return root;",
      "    },",
      "    journeyTimeline: function (data) {",
      "      const root = el(\"div\", { class: \"hp hp-timeline\" });",
      "      root.appendChild(el(\"div\", { class: \"hp-eyebrow\", text: \"Customer journey\" }));",
      "      root.appendChild(el(\"h3\", { class: \"hp-h3\", text: data.customerName ? \"How \" + data.customerName + \" moves through the journey\" : \"Customer journey\" }));",
      "      if (!data.acts.length) return (root.appendChild(el(\"div\", { class: \"hp-empty\", text: \"Add story acts to populate this timeline.\" })), root);",
      "      const rail = el(\"div\", { class: \"hp-rail\" });",
      "      data.acts.slice(0, 8).forEach(function (a, i) {",
      "        rail.appendChild(el(\"div\", { class: \"hp-rail-node\" }, [",
      "          el(\"div\", { class: \"hp-rail-dot\" }, [el(\"span\", { text: String(i + 1) })]),",
      "          el(\"div\", { class: \"hp-rail-card\" }, [",
      "            a.title ? el(\"div\", { class: \"hp-rail-title\", text: a.title }) : null,",
      "            a.persona ? el(\"div\", { class: \"hp-rail-meta\", text: \"👤 \" + a.persona }) : null,",
      "            a.channel ? el(\"div\", { class: \"hp-rail-meta\", text: \"📱 \" + a.channel }) : null,",
      "            a.summary ? el(\"div\", { class: \"hp-rail-summary\", text: truncate(a.summary, 180) }) : null,",
      "            a.salesforceCapabilities ? el(\"div\", { class: \"hp-rail-cap\", text: a.salesforceCapabilities }) : null,",
      "            a.businessValue ? el(\"div\", { class: \"hp-rail-bv\", text: \"→ \" + a.businessValue }) : null,",
      "          ]),",
      "        ]));",
      "      });",
      "      root.appendChild(rail);",
      "      return root;",
      "    },",
      "    demoMap: function (data) {",
      "      const root = el(\"div\", { class: \"hp hp-demomap\" });",
      "      root.appendChild(el(\"div\", { class: \"hp-eyebrow\", text: \"Demo map\" }));",
      "      root.appendChild(el(\"h3\", { class: \"hp-h3\", text: \"End-to-end demo flow\" }));",
      "      if (!data.acts.length) return (root.appendChild(el(\"div\", { class: \"hp-empty\", text: \"Add story acts to map the demo.\" })), root);",
      "      const grid = el(\"div\", { class: \"hp-demogrid\" });",
      "      data.acts.slice(0, 8).forEach(function (a, i) {",
      "        grid.appendChild(el(\"div\", { class: \"hp-democard\" }, [",
      "          el(\"div\", { class: \"hp-demonum\", text: String(i + 1).padStart(2, \"0\") }),",
      "          a.title ? el(\"div\", { class: \"hp-democard-title\", text: a.title }) : null,",
      "          a.channel ? el(\"div\", { class: \"hp-democard-channel\", text: a.channel }) : null,",
      "          a.salesforceCapabilities ? el(\"div\", { class: \"hp-democard-cap\", text: a.salesforceCapabilities }) : null,",
      "          a.requiredAssets ? el(\"div\", { class: \"hp-democard-asset\", text: \"📎 \" + a.requiredAssets }) : null,",
      "        ]));",
      "      });",
      "      root.appendChild(grid);",
      "      return root;",
      "    },",
      "    personaCard: function (data) {",
      "      const root = el(\"div\", { class: \"hp hp-persona\" });",
      "      const p = data.persona;",
      "      root.appendChild(el(\"div\", { class: \"hp-eyebrow\", text: \"Meet the persona\" }));",
      "      if (!p) return (root.appendChild(el(\"div\", { class: \"hp-empty\", text: \"Add a persona — name, role, goals, pain points.\" })), root);",
      "      const left = el(\"div\", { class: \"hp-persona-l\" }, [",
      "        el(\"div\", { class: \"hp-persona-avatar\", text: (p.name || \"?\").slice(0, 1).toUpperCase() }),",
      "        el(\"div\", { class: \"hp-persona-name\", text: p.name || \"—\" }),",
      "        p.role ? el(\"div\", { class: \"hp-persona-role\", text: p.role }) : null,",
      "      ]);",
      "      const right = el(\"div\", { class: \"hp-persona-r\" }, [",
      "        p.goals ? el(\"div\", { class: \"hp-persona-sec\" }, [el(\"div\", { class: \"hp-persona-label\", text: \"Goals\" }), el(\"div\", { class: \"hp-persona-body\", text: truncate(p.goals, 240) })]) : null,",
      "        p.painPoints ? el(\"div\", { class: \"hp-persona-sec\" }, [el(\"div\", { class: \"hp-persona-label\", text: \"Pain points\" }), el(\"div\", { class: \"hp-persona-body\", text: truncate(p.painPoints, 240) })]) : null,",
      "        p.demoRelevance ? el(\"div\", { class: \"hp-persona-sec\" }, [el(\"div\", { class: \"hp-persona-label\", text: \"Why she anchors the demo\" }), el(\"div\", { class: \"hp-persona-body\", text: truncate(p.demoRelevance, 240) })]) : null,",
      "      ]);",
      "      root.appendChild(el(\"div\", { class: \"hp-persona-row\" }, [left, right]));",
      "      return root;",
      "    },",
      "    agentConversation: function (data) {",
      "      const root = el(\"div\", { class: \"hp hp-agent\" });",
      "      root.appendChild(el(\"div\", { class: \"hp-eyebrow\", text: \"Agentforce moment\" }));",
      "      const personaName = (data.persona && data.persona.name) || data.customerName || \"Customer\";",
      "      root.appendChild(el(\"h3\", { class: \"hp-h3\", text: personaName + \" · live conversation\" }));",
      "      const conv = el(\"div\", { class: \"hp-chat\" });",
      "      const userMsg = (data.persona && data.persona.painPoints) ? truncate(data.persona.painPoints, 80) : \"I need help. Where do I start?\";",
      "      const agentMsg = data.story.futureVision ? truncate(data.story.futureVision, 140) : \"Here's what I'd recommend, grounded in your unified profile.\";",
      "      conv.appendChild(el(\"div\", { class: \"hp-chat-bubble hp-chat-user\" }, [el(\"div\", { class: \"hp-chat-who\", text: personaName }), el(\"div\", { class: \"hp-chat-body\", text: userMsg })]));",
      "      conv.appendChild(el(\"div\", { class: \"hp-chat-bubble hp-chat-agent\" }, [el(\"div\", { class: \"hp-chat-who\", text: \"Agentforce\" }), el(\"div\", { class: \"hp-chat-body\", text: agentMsg })]));",
      "      root.appendChild(conv);",
      "      return root;",
      "    },",
      "    unifiedProfile: function (data) {",
      "      const root = el(\"div\", { class: \"hp hp-profile\" });",
      "      root.appendChild(el(\"div\", { class: \"hp-eyebrow\", text: \"Data Cloud · Unified Profile\" }));",
      "      const p = data.persona;",
      "      if (!p) return (root.appendChild(el(\"div\", { class: \"hp-empty\", text: \"Add a persona.\" })), root);",
      "      const card = el(\"div\", { class: \"hp-profile-card\" }, [",
      "        el(\"div\", { class: \"hp-profile-head\" }, [",
      "          el(\"div\", { class: \"hp-profile-avatar\", text: (p.name || \"?\").slice(0, 1).toUpperCase() }),",
      "          el(\"div\", {}, [el(\"div\", { class: \"hp-profile-name\", text: p.name || \"—\" }), el(\"div\", { class: \"hp-profile-role\", text: p.role || \"\" })]),",
      "        ]),",
      "      ]);",
      "      const fields = el(\"div\", { class: \"hp-profile-fields\" });",
      "      [[\"Industry\", data.industry], [\"Customer\", data.customerName], [\"Goal\", p.goals && truncate(p.goals, 60)]].forEach(function (kv) {",
      "        if (!kv[1]) return;",
      "        fields.appendChild(el(\"div\", { class: \"hp-profile-field\" }, [el(\"div\", { class: \"hp-profile-label\", text: kv[0] }), el(\"div\", { class: \"hp-profile-value\", text: kv[1] })]));",
      "      });",
      "      card.appendChild(fields);",
      "      root.appendChild(card);",
      "      return root;",
      "    },",
      "    architecture: function (data) {",
      "      const root = el(\"div\", { class: \"hp hp-arch\" });",
      "      root.appendChild(el(\"div\", { class: \"hp-eyebrow\", text: \"Solution architecture\" }));",
      "      root.appendChild(el(\"h3\", { class: \"hp-h3\", text: data.customerName ? data.customerName + \" · platform map\" : \"Platform map\" }));",
      "      const layers = el(\"div\", { class: \"hp-arch-layers\" });",
      "      function layer(t, items, tone) {",
      "        return el(\"div\", { class: \"hp-arch-layer\" }, [el(\"div\", { class: \"hp-arch-layer-h\", text: t }), el(\"div\", { class: \"hp-arch-layer-row\" }, items.map(function (it) { return el(\"span\", { class: \"hp-arch-node \" + tone, text: it }); }))]);",
      "      }",
      "      layers.appendChild(layer(\"Data Sources\", [\"Web\", \"Mobile\", \"POS\", \"Email\", \"Service\"], \"tone-blue\"));",
      "      layers.appendChild(layer(\"Salesforce Platform\", data.products.length ? data.products : [\"Pick products\"], \"tone-red\"));",
      "      layers.appendChild(layer(\"Channels & Devices\", [\"Storefront\", \"App\", \"SMS\", \"Email\", \"Agent\"], \"tone-gold\"));",
      "      root.appendChild(layers);",
      "      return root;",
      "    },",
      "    deviceMoment: function (data) {",
      "      const root = el(\"div\", { class: \"hp hp-device\" });",
      "      const act = data.acts[0] || {};",
      "      const channel = act.channel || \"Phone\";",
      "      const isLaptop = /laptop|macbook|web|desktop|store|associate|console/i.test(channel);",
      "      root.appendChild(el(\"div\", { class: \"hp-eyebrow\", text: \"Channel · \" + channel }));",
      "      const stage = el(\"div\", { class: \"hp-device-stage\" });",
      "      const device = el(\"div\", { class: \"hp-device-frame \" + (isLaptop ? \"is-laptop\" : \"is-phone\") });",
      "      const screen = el(\"div\", { class: \"hp-device-screen\" });",
      "      screen.appendChild(el(\"div\", { class: \"hp-device-bar\" }));",
      "      screen.appendChild(el(\"div\", { class: \"hp-device-headline\", text: act.demoMoment || \"Product moment\" }));",
      "      if (act.summary) screen.appendChild(el(\"div\", { class: \"hp-device-body\", text: truncate(act.summary, 120) }));",
      "      screen.appendChild(el(\"div\", { class: \"hp-device-cta\", text: act.businessValue ? truncate(act.businessValue, 40) : \"Take action\" }));",
      "      device.appendChild(screen);",
      "      stage.appendChild(device);",
      "      const right = el(\"div\", { class: \"hp-device-narr\" }, [",
      "        el(\"div\", { class: \"hp-eyebrow\", text: act.salesforceCapabilities || data.products.slice(0, 2).join(\" · \") }),",
      "        el(\"h3\", { class: \"hp-h3\", text: act.title || \"Live moment\" }),",
      "        el(\"p\", { class: \"hp-sub\", text: act.summary || data.story.bigProblem || \"\" }),",
      "      ]);",
      "      stage.appendChild(right);",
      "      root.appendChild(stage);",
      "      return root;",
      "    },",
      "    kpiScorecard: function (data) {",
      "      const root = el(\"div\", { class: \"hp hp-kpi\" });",
      "      root.appendChild(el(\"div\", { class: \"hp-eyebrow\", text: \"Business value\" }));",
      "      root.appendChild(el(\"h3\", { class: \"hp-h3\", text: data.customerName ? \"Why \" + data.customerName + \" wins\" : \"Business value scorecard\" }));",
      "      const grid = el(\"div\", { class: \"hp-kpi-grid\" });",
      "      data.kpis.slice(0, 5).forEach(function (k) {",
      "        grid.appendChild(el(\"div\", { class: \"hp-kpi-card\" }, [",
      "          el(\"div\", { class: \"hp-kpi-value\", text: k.value }),",
      "          el(\"div\", { class: \"hp-kpi-label\", text: k.label }),",
      "          k.hint ? el(\"div\", { class: \"hp-kpi-hint\", text: k.hint }) : null,",
      "        ]));",
      "      });",
      "      root.appendChild(grid);",
      "      if (data.story.businessValueMoments) root.appendChild(el(\"div\", { class: \"hp-callout\", text: truncate(data.story.businessValueMoments, 280) }));",
      "      root.appendChild(el(\"div\", { class: \"hp-disclaimer\", text: \"Replace XX% / +$XX / XXh placeholders with BVS-approved values before presenting.\" }));",
      "      return root;",
      "    },",
      "    executiveSummary: function (data) {",
      "      const root = el(\"div\", { class: \"hp hp-exec\" });",
      "      root.appendChild(el(\"div\", { class: \"hp-eyebrow\", text: \"Executive view\" }));",
      "      root.appendChild(el(\"h3\", { class: \"hp-h3\", text: data.customerName ? data.customerName + \" — the takeaway\" : \"The takeaway\" }));",
      "      const cols = el(\"div\", { class: \"hp-exec-cols\" });",
      "      function col(label, body) { return el(\"div\", { class: \"hp-exec-col\" }, [el(\"div\", { class: \"hp-exec-label\", text: label }), el(\"div\", { class: \"hp-exec-body\", text: truncate(body, 240) })]); }",
      "      cols.appendChild(col(\"Challenge\", data.story.bigProblem || data.story.currentPain || \"Add a current-state pain.\"));",
      "      cols.appendChild(col(\"Future state\", data.story.futureVision || \"Add the future-state vision.\"));",
      "      cols.appendChild(col(\"Capabilities\", data.products.length ? data.products.join(\" · \") : \"Pick products.\"));",
      "      root.appendChild(cols);",
      "      if (data.story.executiveTakeaway) root.appendChild(el(\"div\", { class: \"hp-callout\", text: \"Impact: \" + truncate(data.story.executiveTakeaway, 240) }));",
      "      return root;",
      "    },",
      "    storyFoundation: function (data) {",
      "      const f = data.foundations || {};",
      "      const root = el(\"div\", { class: \"hp hp-foundation\" });",
      "      root.appendChild(el(\"div\", { class: \"hp-eyebrow\", text: \"Story foundation\" }));",
      "      root.appendChild(el(\"h3\", { class: \"hp-h3\", text: data.customerName ? \"Why \" + data.customerName + \" — and why now\" : \"Why this matters\" }));",
      "      const grid = el(\"div\", { class: \"hp-foundation-grid\" });",
      "      function pillar(label, body) { return el(\"div\", { class: \"hp-pillar\" }, [el(\"div\", { class: \"hp-pillar-label\", text: label }), el(\"div\", { class: \"hp-pillar-body\", text: truncate(body, 200) })]); }",
      "      grid.appendChild(pillar(\"Business problem\",      f.businessProblem || data.story.bigProblem || \"Add the business problem.\"));",
      "      grid.appendChild(pillar(\"Current-state pain\",    f.currentStatePain || data.story.currentPain || \"Add the current pain.\"));",
      "      grid.appendChild(pillar(\"Future-state vision\",   f.futureStateVision || data.story.futureVision || \"Add the future vision.\"));",
      "      grid.appendChild(pillar(\"Transformation thesis\", f.transformationThesis || \"Connect data + AI + CX.\"));",
      "      root.appendChild(grid);",
      "      if (f.primaryNarrative) root.appendChild(el(\"div\", { class: \"hp-callout\", text: truncate(f.primaryNarrative, 240) }));",
      "      return root;",
      "    },",
      "    currentFutureState: function (data) {",
      "      const f = data.foundations || {};",
      "      const root = el(\"div\", { class: \"hp hp-twostate\" });",
      "      root.appendChild(el(\"div\", { class: \"hp-eyebrow\", text: \"Before / After\" }));",
      "      root.appendChild(el(\"h3\", { class: \"hp-h3\", text: \"From today to a connected future\" }));",
      "      const cols = el(\"div\", { class: \"hp-twostate-cols\" });",
      "      function side(klass, label, body) { return el(\"div\", { class: \"hp-side \" + klass }, [el(\"div\", { class: \"hp-side-label\", text: label }), el(\"div\", { class: \"hp-side-body\", text: truncate(body, 240) })]); }",
      "      cols.appendChild(side(\"hp-side-current\", \"Today\", f.currentStatePain || data.story.currentPain || \"Add the current pain.\"));",
      "      cols.appendChild(side(\"hp-side-future\",  \"Tomorrow\", f.futureStateVision || data.story.futureVision || \"Add the future vision.\"));",
      "      root.appendChild(cols);",
      "      if (data.products.length) {",
      "        const bridge = el(\"div\", { class: \"hp-bridge\" });",
      "        bridge.appendChild(el(\"div\", { class: \"hp-bridge-label\", text: \"What gets us there\" }));",
      "        const badges = el(\"div\", { class: \"hp-badges\" });",
      "        data.products.slice(0, 6).forEach(function (p) { badges.appendChild(el(\"span\", { class: \"hp-badge tone-red\", text: p })); });",
      "        bridge.appendChild(badges);",
      "        root.appendChild(bridge);",
      "      }",
      "      return root;",
      "    },",
      "    futureState: function (data) {",
      "      const f = data.foundations || {};",
      "      const root = el(\"div\", { class: \"hp hp-future\" });",
      "      root.appendChild(el(\"div\", { class: \"hp-eyebrow\", text: \"Future-state vision\" }));",
      "      root.appendChild(el(\"h3\", { class: \"hp-h3\", text: data.customerName ? data.customerName + \" — the future state\" : \"What good looks like\" }));",
      "      root.appendChild(el(\"p\", { class: \"hp-sub\", text: truncate(f.futureStateVision || data.story.futureVision || \"\", 360) }));",
      "      const outs = el(\"div\", { class: \"hp-future-outs\" });",
      "      ((f.valueDrivers || []).slice(0, 4)).forEach(function (v) { outs.appendChild(el(\"div\", { class: \"hp-future-out\", text: v })); });",
      "      if (outs.children.length) root.appendChild(outs);",
      "      return root;",
      "    },",
      "    embeddedCxComponent: function (data) {",
      "      const root = el(\"div\", { class: \"hp hp-embedded\" });",
      "      root.appendChild(el(\"div\", { class: \"hp-eyebrow\", text: \"Live CX component\" }));",
      "      const items = data.linkedCxComponents.length ? data.linkedCxComponents : data.cxComponents.slice(0, 1);",
      "      root.appendChild(el(\"h3\", { class: \"hp-h3\", text: items.length === 1 ? items[0].name : (data.title || \"Embedded demo moment\") }));",
      "      if (!items.length) {",
      "        root.appendChild(el(\"div\", { class: \"hp-empty\", text: \"Link an AubreyDemo CX component to embed it here.\" }));",
      "        return root;",
      "      }",
      "      const list = el(\"div\", { class: \"hp-embedded-list\" });",
      "      items.slice(0, 3).forEach(function (c) {",
      "        const card = el(\"div\", { class: \"hp-embedded-card\" });",
      "        card.appendChild(el(\"div\", { class: \"hp-embedded-head\" }, [",
      "          el(\"div\", { class: \"hp-embedded-name\", text: c.name || \"(unnamed)\" }),",
      "          el(\"div\", { class: \"hp-embedded-type\", text: (c.type || \"web\") + \" · \" + (c.deviceFrame || \"desktop\") }),",
      "        ]));",
      "        const url = safeUrl(c.url);",
      "        const trusted = isTrustedIframeOrigin(url);",
      "        if (url && c.iframeAllowed !== false) {",
      "          const wrap = el(\"div\", { class: \"hp-embedded-frame is-\" + (c.deviceFrame || \"desktop\") });",
      "          const ifr = document.createElement(\"iframe\");",
      "          ifr.src = url;",
      "          // Tightened sandbox: allow-same-origin only for trusted hosts.",
      "          ifr.setAttribute(\"sandbox\", trusted ? \"allow-scripts allow-same-origin allow-forms allow-popups\" : \"allow-scripts allow-forms allow-popups\");",
      "          ifr.setAttribute(\"referrerpolicy\", \"no-referrer\");",
      "          ifr.setAttribute(\"loading\", \"lazy\");",
      "          ifr.setAttribute(\"title\", c.name || \"CX component\");",
      "          ifr.style.width = \"100%\"; ifr.style.height = \"100%\"; ifr.style.minHeight = \"320px\"; ifr.style.border = \"0\";",
      "          wrap.appendChild(ifr);",
      "          card.appendChild(wrap);",
      "          if (!trusted) {",
      "            card.appendChild(el(\"div\", { class: \"hp-asset-pill tone-gold\", text: \"Off-allowlist origin — sandbox tightened\" }));",
      "          }",
      "        } else if (url) {",
      "          card.appendChild(el(\"div\", { class: \"hp-embedded-url\", text: url }));",
      "        } else {",
      "          card.appendChild(el(\"div\", { class: \"hp-asset-pill tone-red\", text: \"URL needed\" }));",
      "        }",
      "        if (url) {",
      "          const a = document.createElement(\"a\");",
      "          a.className = \"hp-embedded-cta\"; a.href = url; a.target = \"_blank\"; a.rel = \"noopener noreferrer\";",
      "          a.textContent = \"Open in new tab ↗\";",
      "          card.appendChild(a);",
      "        }",
      "        list.appendChild(card);",
      "      });",
      "      root.appendChild(list);",
      "      return root;",
      "    },",
      "    nextSteps: function (data) {",
      "      const root = el(\"div\", { class: \"hp hp-next\" });",
      "      root.appendChild(el(\"div\", { class: \"hp-eyebrow\", text: \"Roadmap & next steps\" }));",
      "      root.appendChild(el(\"h3\", { class: \"hp-h3\", text: \"From today to launch\" }));",
      "      const list = el(\"ol\", { class: \"hp-next-list\" });",
      "      [\"Discovery & alignment\", \"Pilot / POV\", \"Roll-out\", \"Scale & optimize\"].forEach(function (p) { list.appendChild(el(\"li\", { class: \"hp-next-item\", text: p })); });",
      "      root.appendChild(list);",
      "      return root;",
      "    },",
      "    unknown: function (data) {",
      "      const root = el(\"div\", { class: \"hp hp-unknown\" });",
      "      root.appendChild(el(\"div\", { class: \"hp-eyebrow\", text: \"Slide\" }));",
      "      root.appendChild(el(\"h3\", { class: \"hp-h3\", text: data.title || \"Untitled slide\" }));",
      "      root.appendChild(el(\"p\", { class: \"hp-sub\", text: \"This slide doesn't have a layout assigned.\" }));",
      "      return root;",
      "    },",
      "  };",
      "",
      "  function renderSlide(slide, cfg) {",
      "    const data = getData(slide, cfg);",
      "    // Never fall back to executiveSummary; unknown layouts get the neutral renderer.",
      "    const fn = RENDERERS[(slide && slide.layout)] || RENDERERS.unknown;",
      "    return fn(data);",
      "  }",
      "",
      "  global.HOLODECK_RENDER = { renderSlide: renderSlide };",
      "})(window);",
      "",
    ].join("\n");
  }

  // ─── Asset instructions inside the assets/ folder ────────────
  function generateAssetInstructions(state) {
    const refs = collectAssetReferences(state);
    const lines = [
      "# Assets folder",
      "",
      "Drop logos, persona portraits, scene URLs, and any image/GIF the demo needs",
      "into this folder. Then update the corresponding paths in",
      "`../holodeck.config.js`.",
      "",
      "## Naming rules",
      "",
      "- Lowercase, no spaces, hyphens for word breaks (`acme-logo.png`).",
      "- Keep files under ~2 MB for snappy presentation.",
      "- Don't replace the device frame files if you copy them in",
      "  (`iPhone16Pro_FRAME.png`, `macbook-transparent.png`).",
      "",
      "## What this demo expects",
      "",
    ];
    if (!refs.length) {
      lines.push("(No specific assets recommended yet. Add some in the Holodeck Builder.)");
    } else {
      refs.forEach(function (a) {
        lines.push("### " + (a.name || "(unnamed)"));
        lines.push("");
        lines.push("- **Type:** " + (a.type || "image"));
        lines.push("- **Status:** " + (a.status || "needed"));
        if (a.source)         lines.push("- **Source:** " + a.source);
        if ((a.recommendedFor || []).length) lines.push("- **Used by slides:** " + a.recommendedFor.join(", "));
        if (a.notes)          lines.push("- **Notes:** " + a.notes);
        lines.push("");
      });
    }
    lines.push("");
    lines.push("## After you drop files in");
    lines.push("");
    lines.push("Open `../holodeck.config.js` and replace asset paths with the new file names.");
    lines.push("Refresh the browser — no build step needed.");
    return lines.join("\n");
  }

  // ─── Misc helpers ────────────────────────────────────────────
  function escapeHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  // ═══════════════════════════════════════════════════════════════
  //  ZIP ENCODER (STORE / no compression)
  //  Writes a valid PKZIP archive: local headers, central directory,
  //  end-of-central-directory record. Tested against `unzip -l/-t`.
  //
  //  Refs:
  //    APPNOTE.TXT 4.3 — Local file header, central directory header,
  //    end of central directory record. We only support method 0
  //    (stored) which lets us skip a deflate implementation.
  // ═══════════════════════════════════════════════════════════════
  function encodeZip(files) {
    const enc = new TextEncoder();
    const records = [];
    let offset = 0;
    let centralBytes = 0;
    const centralChunks = [];

    files.forEach(function (f) {
      const nameBytes = enc.encode(f.path);
      const data = typeof f.content === "string" ? enc.encode(f.content) : f.content;
      const crc = crc32(data);
      const size = data.length;

      // Local file header
      const local = makeLocalHeader(nameBytes, crc, size);
      records.push(local);
      records.push(nameBytes);
      records.push(data);

      // Central directory header
      const central = makeCentralHeader(nameBytes, crc, size, offset);
      centralChunks.push(central);
      centralChunks.push(nameBytes);
      centralBytes += central.length + nameBytes.length;

      offset += local.length + nameBytes.length + size;
    });

    // End of central directory record
    const eocd = makeEocd(files.length, centralBytes, offset);
    return new Blob(records.concat(centralChunks).concat([eocd]), { type: "application/zip" });
  }

  function makeLocalHeader(nameBytes, crc, size) {
    const buf = new Uint8Array(30);
    const dv  = new DataView(buf.buffer);
    dv.setUint32(0,  0x04034b50, true);   // signature
    dv.setUint16(4,  20, true);            // version needed
    dv.setUint16(6,  0, true);             // general purpose
    dv.setUint16(8,  0, true);             // method = stored
    dv.setUint16(10, 0, true);             // mod time
    dv.setUint16(12, 0, true);             // mod date
    dv.setUint32(14, crc, true);
    dv.setUint32(18, size, true);          // compressed size
    dv.setUint32(22, size, true);          // uncompressed size
    dv.setUint16(26, nameBytes.length, true);
    dv.setUint16(28, 0, true);             // extra length
    return buf;
  }

  function makeCentralHeader(nameBytes, crc, size, localHeaderOffset) {
    const buf = new Uint8Array(46);
    const dv  = new DataView(buf.buffer);
    dv.setUint32(0,  0x02014b50, true);
    dv.setUint16(4,  20, true);            // version made by
    dv.setUint16(6,  20, true);            // version needed
    dv.setUint16(8,  0, true);
    dv.setUint16(10, 0, true);             // method
    dv.setUint16(12, 0, true);
    dv.setUint16(14, 0, true);
    dv.setUint32(16, crc, true);
    dv.setUint32(20, size, true);
    dv.setUint32(24, size, true);
    dv.setUint16(28, nameBytes.length, true);
    dv.setUint16(30, 0, true);             // extra
    dv.setUint16(32, 0, true);             // comment
    dv.setUint16(34, 0, true);             // disk
    dv.setUint16(36, 0, true);             // internal attrs
    dv.setUint32(38, 0, true);             // external attrs
    dv.setUint32(42, localHeaderOffset, true);
    return buf;
  }

  function makeEocd(count, centralSize, centralOffset) {
    const buf = new Uint8Array(22);
    const dv  = new DataView(buf.buffer);
    dv.setUint32(0,  0x06054b50, true);
    dv.setUint16(4,  0, true);             // disk
    dv.setUint16(6,  0, true);             // disk with central
    dv.setUint16(8,  count, true);         // entries on this disk
    dv.setUint16(10, count, true);         // total entries
    dv.setUint32(12, centralSize, true);
    dv.setUint32(16, centralOffset, true);
    dv.setUint16(20, 0, true);             // comment length
    return buf;
  }

  // CRC32 (cached table)
  let CRC_TABLE = null;
  function crcTable() {
    if (CRC_TABLE) return CRC_TABLE;
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
      t[n] = c >>> 0;
    }
    CRC_TABLE = t;
    return t;
  }
  function crc32(bytes) {
    const t = crcTable();
    let c = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) c = (t[(c ^ bytes[i]) & 0xff] ^ (c >>> 8)) >>> 0;
    return (c ^ 0xffffffff) >>> 0;
  }

  // ─── Public API ──────────────────────────────────────────────
  global.HOLO_ZIP = {
    downloadCompleteDemoZip: downloadCompleteDemoZip,
    buildDemoZipPayload:     buildDemoZipPayload,
    encodeZip:               encodeZip,
    safeSlug:                safeSlug,
    collectAssetReferences:  collectAssetReferences,
    generateDemoIndexHtml:   generateDemoIndexHtml,
    generateDemoCss:         generateDemoCss,
    generateDemoAppJs:       generateDemoAppJs,
    generateDemoRendererJs:  generateDemoRendererJs,
    generateReadme:          generateReadme,
    generateHowToRun:        generateHowToRun,
    generateExportMetadata:  generateExportMetadata,
    generateAssetInstructions: generateAssetInstructions,
  };
})(window);
