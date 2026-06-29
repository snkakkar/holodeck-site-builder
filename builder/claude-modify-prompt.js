// ════════════════════════════════════════════════════════════════
//  CLAUDE MODIFY PROMPT
//  Builds CLAUDE_MODIFY.md for exported demos.
//  Focus: plain-language, end-user editing guidance.
//
//  Public API:
//    HOLO_CLAUDE_MODIFY.generate(state) -> markdown string
// ════════════════════════════════════════════════════════════════

(function (global) {
  "use strict";

  const QUICK_START = [
    "## Quick start",
    "",
    "1. Open Claude or ChatGPT.",
    "2. Share this exported demo folder.",
    "3. Copy one prompt from this file.",
    "4. Replace bracketed placeholders like `[CUSTOMER]`.",
    "5. Ask the AI to make only the requested change.",
    "6. Review the summary of changes before presenting.",
    "",
  ];

  const SIMPLE_CONTEXT = [
    "## What to edit",
    "",
    "For most content changes, ask the AI to edit `demo/holodeck.config.js`.",
    "",
    "This is where story text, customer details, slides, links, and media mappings live.",
    "If you are only changing content (not behavior), this is usually the only file needed.",
    "",
  ];

  const EVERYDAY_PROMPTS = [
    "## Everyday prompts (copy/paste)",
    "",
    "### 1) Rename customer everywhere",
    "> Update the customer name everywhere in my demo to `[NEW CUSTOMER NAME]`. Keep the same structure and slide flow. Show exactly what changed.",
    "",
    "### 2) Rewrite for executive audience",
    "> Rewrite this demo for executive leaders: shorter sentences, outcomes first, and plain business language. Keep the same storyline.",
    "",
    "### 3) Adapt for a new industry",
    "> Adapt this demo for `[INDUSTRY]`. Keep the same storyline, but update examples, challenges, and benefits to match that industry.",
    "",
    "### 4) Shift product emphasis",
    "> Rebalance the story to emphasize `[PRODUCT A]` and `[PRODUCT B]` without changing the overall flow.",
    "",
    "### 5) Simplify for first meeting",
    "> Rewrite this demo so a first-time audience can understand it quickly. Use plain language and avoid unexplained acronyms.",
    "",
    "### 6) Create a 5-minute version",
    "> Trim this demo to a clear 5-minute version. Keep only the most important slides and smooth transitions.",
    "",
    "### 7) Add safe metric placeholders",
    "> Add placeholders like `[TODO: metric]` where impact is discussed. Do not invent numbers.",
    "",
    "### 8) Refresh persona",
    "> Replace the persona with: Name `[NAME]`, Role `[ROLE]`, Goals `[GOALS]`, Pain points `[PAINS]`. Update related slides so details stay consistent.",
    "",
    "### 9) Localize by region",
    "> Adjust wording for `[REGION/COUNTRY]` audience (tone, spelling, terminology) while keeping the same structure.",
    "",
    "### 10) Editorial cleanup",
    "> Do a final polish pass: improve clarity, remove repetition, and fix grammar. Keep facts and structure unchanged.",
    "",
    "### 11) Update assets and links",
    "> Apply these updates: Assets `[LIST]`, Live links `[LIST]`. Map each to the correct demo moment and keep everything else unchanged.",
    "",
    "### 12) Final quality gate",
    "> Run a final review and return PASS or FAIL. Check placeholders, story flow, link mapping, and audience fit. If FAIL, provide only the smallest required fixes.",
    "",
  ];

  const SAFETY_RULES = [
    "## Safety rules for AI edits",
    "",
    "1. Make small, focused updates.",
    "2. Do not invent customer facts, metrics, logos, or claims.",
    "3. Keep unknown details as `[TODO: ...]`.",
    "4. Keep slide structure stable unless explicitly asked to add/remove/reorder slides.",
    "5. Preserve fields you do not understand; do not delete unknown content.",
    "6. Return a clear summary of what changed.",
    "",
  ];

  const GOOD_VS_WEAK = [
    "## Good prompt vs weak prompt",
    "",
    "Good:",
    "> Update only the executive summary and value slides for Acme. Keep everything else unchanged and use `[TODO: ...]` for unknown metrics.",
    "",
    "Weak:",
    "> Make this whole demo better.",
    "",
  ];

  function header(state) {
    const project = (state && state.project) || {};
    const customer = project.customerName || (state && state.name) || "this customer";
    const products = (project.products || []).join(", ") || "Not set yet";
    const brand = (state && state.brand) || {};
    const mode = brand.mode || "salesforce";
    const slides = ((state && state.slides) || []).length;
    return [
      "# Edit this downloaded demo with AI",
      "",
      "Use this file to request safe, simple edits after export.",
      "",
      "**Current demo snapshot**",
      "",
      "- Customer: " + customer,
      "- Product focus: " + products,
      "- Branding mode: " + mode,
      "- Slide count: " + slides,
      "",
    ];
  }

  function generate(state) {
    return [].concat(
      header(state || {}),
      QUICK_START,
      SIMPLE_CONTEXT,
      EVERYDAY_PROMPTS,
      SAFETY_RULES,
      GOOD_VS_WEAK
    ).join("\n");
  }

  global.HOLO_CLAUDE_MODIFY = { generate: generate };
})(window);
