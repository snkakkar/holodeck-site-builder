// holodeck-render.js
// Reads window.HOLODECK_CONFIG and does two things:
//   1. Injects brand CSS custom properties into :root
//   2. Builds window.STORY (the shape the existing render code expects)
// Load this AFTER holodeck.config.js and BEFORE the inline script in demo-holodeck-unified.html.

(function () {
  "use strict";
  var C = window.HOLODECK_CONFIG;
  if (!C) { console.error("HOLODECK_CONFIG not found"); return; }

  // ── 1. Brand CSS vars ──────────────────────────────────────
  var style = document.createElement("style");
  style.textContent = [
    ":root {",
    "  --red: "       + C.brand.primaryColor   + ";",
    "  --blue: "      + C.brand.secondaryColor + ";",
    "  --gold: "      + C.brand.accentColor    + ";",
    "  --navy: "      + C.brand.navyColor      + ";",
    "  --bg: "        + C.brand.bgColor        + ";",
    "  --font-sans: " + C.brand.fontBody       + ";",
    "  --font-serif: "+ C.brand.fontHeading    + ";",
    "}",
  ].join("\n");
  document.head.appendChild(style);

  // ── 2. Page title ──────────────────────────────────────────
  document.title = C.customer.name + " + Salesforce | " + C.customer.demoTitle;

  // ── 3. Google Fonts ────────────────────────────────────────
  if (C.brand.googleFontsUrl) {
    var link = document.createElement("link");
    link.rel  = "stylesheet";
    link.href = C.brand.googleFontsUrl;
    document.head.insertBefore(link, document.head.firstChild);
  }

  // ── 4. Build window.STORY (shape expected by demo-holodeck-unified.html) ──
  window.STORY = {
    presenterName:  C.presenter.name,
    presenterTitle: C.presenter.title + ", " + C.presenter.company,

    customer: C.customer,
    persona:  C.persona,

    steps:    C.journey.steps,
    platform: C.journey.platform,

    demoStructure:    C.demoStructure,
    vignetteSections: C.vignetteSections,
    technologies:     C.technologies,

    timeline:   C.timeline,
    scenes:     C.scenes,
    mcpStates:  C.mcpStates,

    orbitNodes:  C.orbitNodes,
    orbitCenter: C.orbitCenter,
    orbitCopy:   C.orbitCopy,

    bvsMetrics: C.bvs.metrics,
  };
})();
