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
  // Convert "#RRGGBB" / "#RGB" → "r,g,b" so rgba(var(--red-rgb), .25) works.
  function hexToRgbTriplet(hex, fallback) {
    if (typeof hex !== "string") return fallback;
    var h = hex.trim().replace(/^#/, "");
    if (h.length === 3) h = h[0]+h[0]+h[1]+h[1]+h[2]+h[2];
    if (!/^[0-9a-fA-F]{6}$/.test(h)) return fallback;
    var n = parseInt(h, 16);
    return ((n >> 16) & 255) + "," + ((n >> 8) & 255) + "," + (n & 255);
  }
  var redRgb  = hexToRgbTriplet(C.brand.primaryColor,   "178,34,52");
  var blueRgb = hexToRgbTriplet(C.brand.secondaryColor, "26,95,160");
  var goldRgb = hexToRgbTriplet(C.brand.accentColor,    "245,192,106");
  var navyRgb = hexToRgbTriplet(C.brand.navyColor,      "13,27,46");

  var style = document.createElement("style");
  style.textContent = [
    ":root {",
    "  --red: "       + C.brand.primaryColor   + ";",
    "  --blue: "      + C.brand.secondaryColor + ";",
    "  --gold: "      + C.brand.accentColor    + ";",
    "  --navy: "      + C.brand.navyColor      + ";",
    "  --red-rgb: "   + redRgb  + ";",
    "  --blue-rgb: "  + blueRgb + ";",
    "  --gold-rgb: "  + goldRgb + ";",
    "  --navy-rgb: "  + navyRgb + ";",
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
