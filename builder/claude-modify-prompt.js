// ════════════════════════════════════════════════════════════════
//  CLAUDE MODIFY PROMPT
//  Builds CLAUDE_MODIFY.md — a reusable, copy-paste prompt file
//  shipped inside every exported Holodeck. An SE can hand the demo
//  folder to Claude / ChatGPT and use these prompts to make further
//  edits (rebrand, add a slide, rewrite the persona, swap assets…)
//  without re-opening the Builder.
//
//  Pure string generation, no DOM. Mirrors ai-config-prompt.js in
//  spirit: a constant body plus a state-aware header.
//
//  Public API:
//    HOLO_CLAUDE_MODIFY.generate(state) → markdown string
// ════════════════════════════════════════════════════════════════

(function (global) {
  "use strict";

  // ── Orientation: how the exported demo is wired together ───────
  const ORIENTATION = [
    "## How this demo is structured",
    "",
    "This is a **static, no-build** Salesforce Holodeck demo. There is no",
    "bundler, framework, or compile step — every file is plain HTML/CSS/JS",
    "served as-is. To preview a change, edit the file and refresh the browser.",
    "",
    "```",
    "demo/",
    "  demo-holodeck-unified.html   The full polished demo (5 sections)",
    "  holodeck.config.js           ALL customer content lives here — edit this first",
    "  data/holodeck-config.json    JSON snapshot (round-trips back into the Builder)",
    "  styles/                      Design system (tokens, slides, components, nav…)",
    "  js/                          Config-driven renderer (do not hand-edit content here)",
    "  assets/                      Logos, persona images, scene photos, GIFs",
    "```",
    "",
    "**Golden rule:** customer-facing content (copy, slides, brand, persona,",
    "products, CX components) is data in `demo/holodeck.config.js`. Change the",
    "config, not the renderer. The `js/` files turn that config into the DOM and",
    "should only change if you're altering *behavior*, not *content*.",
    "",
  ];

  // ── The config shape, summarized for the model ────────────────
  const CONFIG_SHAPE = [
    "## What's in `holodeck.config.js`",
    "",
    "The file assigns `window.HOLODECK_CONFIG = { … }`. Key blocks:",
    "",
    "- `customer` / `project` — name, industry, audience, products, theme.",
    "- `brand` — `mode` (`\"salesforce\"` | `\"customer\"` | `\"cobrand\"`),",
    "  `primaryColor`, `secondaryColor`, `accentColor`, `logoPath`,",
    "  `customerLogoPath`. The mode controls the lockup: Salesforce-led,",
    "  customer-led, or co-branded.",
    "- `persona` — the spotlighted persona (name, role, goals, hero image).",
    "- `poweredBy.products` — the \"Powered by Salesforce\" attribution strip,",
    "  derived from the story; edit to pin a specific product list.",
    "- `slides[]` — the deck. Each slide has a `layout`, `title`, `sectionId`,",
    "  and layout-specific content. Allowed layouts: hero, storyFoundation,",
    "  currentFutureState, futureState, journeyTimeline, demoMap, personaCard,",
    "  agentConversation, unifiedProfile, architecture, deviceMoment,",
    "  embeddedCxComponent, kpiScorecard, executiveSummary, nextSteps.",
    "- `demoAssets` — paths for scene/device media (storeInterior, productHero,",
    "  iPhoneRec, laptopBrowsingGif, …). Empty → the slide shows a clean,",
    "  brand-styled placeholder, never a broken image.",
    "- `builderPlan` — the full round-trip snapshot (sections, CX components,",
    "  story foundations). `builderPlan.cxComponents[].url` controls embedded",
    "  iframes; `deviceFrame` controls the phone/desktop chrome.",
    "",
  ];

  // ── Copy-paste prompt recipes ─────────────────────────────────
  const RECIPES = [
    "## Ready-to-use prompts",
    "",
    "Paste any of these into Claude or ChatGPT alongside this folder. Each is",
    "written so the model edits the **config**, preserves structure, and keeps",
    "the demo runnable.",
    "",
    "### Rebrand to the customer",
    "> In `demo/holodeck.config.js`, set `brand.mode` to `\"customer\"`, update",
    "> `brand.primaryColor` / `secondaryColor` / `accentColor` to <CUSTOMER>'s",
    "> palette, and point `brand.customerLogoPath` at a file I'll drop in",
    "> `demo/assets/`. Keep everything else unchanged. Show me the diff.",
    "",
    "### Switch to co-branded (Salesforce + customer)",
    "> Set `brand.mode` to `\"cobrand\"` in the config. Keep the Salesforce mark",
    "> via `brand.logoPath` and add the customer mark via",
    "> `brand.customerLogoPath`. Don't touch slide content.",
    "",
    "### Add a new slide",
    "> Add one slide to `slides[]` in `demo/holodeck.config.js`: layout",
    "> `<LAYOUT from the allowed list>`, title \"<TITLE>\", in the `<SECTION>`",
    "> section. Populate its content fields to match the surrounding slides of",
    "> the same layout. Set a clear `selectionStatus` and `order`. Don't",
    "> renumber unrelated slides destructively — just insert.",
    "",
    "### Remove or reorder slides",
    "> In `slides[]`, remove the slide titled \"<TITLE>\" and re-sort the",
    "> remaining slides' `order` fields so they stay 0-based and contiguous",
    "> within each section. Verify no other slide referenced it.",
    "",
    "### Rewrite the persona",
    "> Rewrite the `persona` block (and the matching personaCard / unifiedProfile",
    "> slides) for <NEW PERSONA: name, role, goals, pain points>. Keep the tone",
    "> consistent with the rest of the deck. Leave layout and structure intact.",
    "",
    "### Sharpen the story / value",
    "> Tighten the `storyFoundation`, `currentFutureState`, and `executiveSummary`",
    "> slide copy in the config to emphasize <OUTCOME / METRIC>. Keep it concise",
    "> and executive-ready; don't invent metrics — use [TODO:] for unknowns.",
    "",
    "### Swap in a real asset",
    "> I added `demo/assets/<FILE>`. Update the matching path in",
    "> `demoAssets` (or the relevant slide) so the demo uses it. If a slide had",
    "> a placeholder, it should now show the image.",
    "",
    "### Add an embedded live screen (CX component)",
    "> Add an entry to `builderPlan.cxComponents` with the URL <URL>, a sensible",
    "> `deviceFrame` (commerce/web → desktop; SMS/agent → mobile), and add a",
    "> matching `embeddedCxComponent` slide in the Demo section linked to it.",
    "",
  ];

  // ── Guardrails ────────────────────────────────────────────────
  const GUARDRAILS = [
    "## Guardrails for the AI",
    "",
    "1. Edit `holodeck.config.js` for content; only touch `js/` for behavior.",
    "2. Keep the file valid JavaScript — it must still assign",
    "   `window.HOLODECK_CONFIG`. After editing, the demo must load with no",
    "   console errors.",
    "3. Use only the allowed slide layouts listed above.",
    "4. Don't invent customer facts (names, metrics, logos). Use `[TODO: …]`",
    "   placeholders and call them out.",
    "5. Preserve backward compatibility: leave unrecognized fields untouched.",
    "6. Prefer small, reviewable diffs over wholesale rewrites.",
    "",
  ];

  function header(state) {
    const project = (state && state.project) || {};
    const customer = project.customerName || (state && state.name) || "this customer";
    const products = (project.products || []).join(", ") || "—";
    const brand = (state && state.brand) || {};
    const mode = brand.mode || "salesforce";
    return [
      "# Modify this Holodeck with AI",
      "",
      "This file ships with your exported Salesforce Holodeck. Hand the demo",
      "folder to Claude or ChatGPT, then use the prompts below to make changes",
      "without re-opening the Builder.",
      "",
      "**This demo at a glance**",
      "",
      "- Customer: " + customer,
      "- Products in scope: " + products,
      "- Current branding mode: `" + mode + "`",
      "- Slides: " + ((state && state.slides) || []).length,
      "",
    ];
  }

  function generate(state) {
    return [].concat(
      header(state || {}),
      ORIENTATION,
      CONFIG_SHAPE,
      RECIPES,
      GUARDRAILS
    ).join("\n");
  }

  global.HOLO_CLAUDE_MODIFY = { generate: generate };
})(window);
