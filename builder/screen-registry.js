/* ============================================================================
 * screen-registry.js — catalog of the config-driven Salesforce console/CRM
 * screens offered as generated Holodeck slide types.
 *
 * These mirror how apps are cataloged (APP_SIGNAL_RULES in recommendation-rules.js,
 * APP_TEMPLATE_FILES in zip-exporter.js), but screens are lighter: they render
 * IN-DOM from a generated `screenConfig` (no per-screen template file), inside a
 * paired `screenFlow` composition — never as standalone full-bleed slides.
 *
 * The 11 hand-authored screens collapse to ~7 data "families." A family shares
 * one panel-builder function (sfPanel* in demo-deck-renderer.js), one Gemini
 * prompt (ai-config-prompt.js), and one assembler branch (screen-config-generator.js).
 * So `family` — not `id` — is what the render/generate lanes switch on.
 *
 * `signals` are the recommendation signals (see KEYWORD_SIGNALS / PRODUCT_SIGNALS
 * / INDUSTRY_SIGNALS in recommendation-rules.js) that make a screen relevant.
 * SCREEN_SIGNAL_RULES in recommendation-rules.js is derived from these.
 *
 * Exposed as window.HOLO_SCREENS (browser) and module.exports (tests).
 * ========================================================================== */
(function () {
  "use strict";

  // id → catalog entry. `family` groups screens that share a renderer/prompt.
  var HOLO_SCREENS = [
    {
      id: "account-research-agent",
      label: "Account Research Agent",
      product: "Sales Cloud", extraProducts: ["Agentforce"],
      persona: "Account Executive",
      family: "recordWithAiPanel",
      signals: ["sales", "agentforce"],
      blurb: "Account record with an Agentforce research panel summarizing signals and next steps.",
    },
    {
      id: "eci-opportunity",
      label: "Opportunity (Einstein Conversation Insights)",
      product: "Sales Cloud",
      persona: "Account Executive",
      family: "recordWithAiPanel",
      signals: ["sales", "agentforce"],
      blurb: "Opportunity record with an Einstein AI panel surfacing call insights and risk.",
    },
    {
      id: "sdr-agent-lead",
      label: "SDR Agent — Lead",
      product: "Agentforce", extraProducts: ["Sales Cloud"],
      persona: "Sales Development Rep",
      family: "recordWithScoreAndTimeline",
      signals: ["agentforce", "sales"],
      blurb: "Lead record with an AI opportunity score, weighted criteria, and an activity timeline.",
      // Default numbered story-steps for the paired left rail. Ported from the
      // hand-authored reference deck's Slide 4. Used ONLY when the SE hasn't
      // authored storyActs yet — an ingested demo script overrides these, and
      // the SE can edit them in Preview. See buildScreenFields in
      // holodeck-adapter.js and [[sf-screen-wrap-scroll-fix]].
      defaultSteps: [
        { n: 1, body: "SDR Agent kicks off a personalized two-way outbound cadence — AI-crafted per account, not templated." },
        { n: 2, body: "The prospect replies with interest but a constraint; the agent answers securely in-thread using grounded account data." },
        { n: 3, body: "SDR Agent qualifies — budget confirmed, scope agreed — schedules a meeting, and creates a qualified opportunity." },
        { n: 4, body: "Clean handoff: the qualified opportunity lands as a structured alert to the assigned rep, fully briefed.", payoff: true },
      ],
    },
    {
      id: "prospecting-agent-view",
      label: "Prospecting Agent",
      product: "Sales Cloud", extraProducts: ["Agentforce"],
      persona: "Sales Development Rep",
      // NOT a single-record score view — the reference is a prospecting work-queue:
      // a KPI strip over a multi-account table (signal badges + tags per row).
      family: "kpiTable",
      signals: ["agentforce", "sales"],
      blurb: "Prospecting work queue — KPI strip over a scored multi-account table with buying signals.",
    },
    {
      id: "sales-assistant",
      label: "Sales Assistant",
      product: "Agentforce", extraProducts: ["Sales Cloud"],
      persona: "Account Executive",
      family: "assistantChat",
      signals: ["agentforce", "sales"],
      // A conversational assistant reads as a mobile experience — render the
      // screen inside a phone frame (Slide-5 style) rather than the wide
      // console shell. See frameFor + buildScreenFields.
      frame: "phone",
      blurb: "Conversational Agentforce assistant with grounded suggested replies and actions.",
    },
    {
      id: "territory-planning",
      label: "Territory Planning",
      product: "Sales Cloud",
      persona: "Sales Operations",
      family: "metricsAndTable",
      signals: ["sales"],
      blurb: "Territory metrics with a data table of accounts, quota, and coverage.",
    },
    {
      id: "mc-next-attribution",
      label: "Marketing Cloud Next — Attribution",
      product: "Marketing Cloud",
      persona: "Marketer",
      family: "metricsAndTable",
      signals: ["marketing", "datacloud"],
      blurb: "Attribution KPIs with a channel/campaign performance table.",
    },
    {
      id: "sentiment-case",
      label: "Sentiment Case",
      product: "Service Cloud",
      persona: "Service Agent",
      family: "serviceCase",
      signals: ["service", "agentforce"],
      blurb: "Case record with a real-time sentiment read and AI-suggested resolution.",
    },
    {
      id: "case-summary-lwc",
      label: "Case Summary (Einstein)",
      product: "Service Cloud", extraProducts: ["Agentforce"],
      persona: "Service Agent",
      family: "serviceCase",
      signals: ["service", "agentforce"],
      blurb: "Case record with an Einstein-generated wrap-up summary and next actions.",
    },
    {
      id: "voice-console-live",
      label: "Voice Console (Live)",
      product: "Service Cloud", extraProducts: ["Agentforce"],
      persona: "Service Agent",
      family: "voiceConsole",
      signals: ["service", "agentforce"],
      blurb: "Live Service Cloud Voice console with a streaming transcript and AI assist.",
    },
    {
      id: "prompt-campaign-builder",
      label: "Prompt Campaign Builder",
      product: "Marketing Cloud",
      persona: "Marketer",
      family: "campaignBuilder",
      signals: ["marketing", "agentforce"],
      blurb: "Marketing Cloud Next builder that turns a prompt into a campaign plan.",
    },
    {
      id: "thursday-spotlight",
      label: "Spotlight Email",
      product: "Marketing Cloud",
      persona: "Marketer",
      family: "emailPreview",
      signals: ["marketing"],
      // A rendered email preview reads as an inbox/mobile artifact — phone-frame it.
      frame: "phone",
      blurb: "Rendered marketing email preview with subject, hero, and body blocks.",
    },
  ];

  // Convenience lookups (mirrors how apps are addressed by id elsewhere).
  var BY_ID = {};
  HOLO_SCREENS.forEach(function (s) { BY_ID[s.id] = s; });

  // Distinct families in declaration order — used by generate/render switches.
  var FAMILIES = [];
  HOLO_SCREENS.forEach(function (s) {
    if (FAMILIES.indexOf(s.family) === -1) FAMILIES.push(s.family);
  });

  function getScreen(id) { return BY_ID[id] || null; }
  function familyOf(id) { var s = BY_ID[id]; return s ? s.family : null; }
  // Deterministic device frame for a screen's paired composition (plan
  // decision 3, bundled model). "phone" for mobile-native experiences
  // (assistant chat, email preview); "" (wide console) otherwise.
  function frameFor(id) { var s = BY_ID[id]; return (s && s.frame) || ""; }
  // Default numbered story-steps for a screen's paired left rail (fallback used
  // when the SE hasn't authored storyActs). Returns a fresh copy so callers
  // can't mutate the registry. Empty array if none defined.
  function defaultStepsFor(id) {
    var s = BY_ID[id];
    if (!s || !Array.isArray(s.defaultSteps)) return [];
    return s.defaultSteps.map(function (st, i) {
      return { n: st.n || (i + 1), body: st.body || "", payoff: !!st.payoff };
    });
  }

  var API = {
    HOLO_SCREENS: HOLO_SCREENS,
    SCREENS_BY_ID: BY_ID,
    SCREEN_FAMILIES: FAMILIES,
    getScreen: getScreen,
    familyOf: familyOf,
    frameFor: frameFor,
    defaultStepsFor: defaultStepsFor,
  };

  if (typeof window !== "undefined") {
    window.HOLO_SCREENS = HOLO_SCREENS;
    window.HOLO_SCREEN_REGISTRY = API;
  }
  if (typeof module !== "undefined" && module.exports) {
    module.exports = API;
  }
})();
