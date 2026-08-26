// ════════════════════════════════════════════════════════════════
//  SIMPLE MODE — experience + question catalog
//  ──────────────────────────────────────────
//  Data-driven config for the guided "Simple / Guided" builder path
//  (state.mode === "simple"). The wizard in builder.js renders this
//  verbatim: one selectable card per experience, and for each selected
//  experience its OPTIONAL follow-up questions.
//
//  Adding or editing an experience/question is pure config here — no
//  wizard code change. Each question declares a `targetPath` the wizard
//  writes the answer into via setByPath(state, path, value); the app
//  generators + prompt builders read those paths back.
//
//  kind:
//    "app"   → an iframe demo-app (cimulate/clienteling). Generated via
//              HOLO_APPFOUND.generate + generateProductPhotos, surfaced as
//              a cx_app_<id> component and an appConsoleIframe slide.
//    "slide" → an in-DOM slide layout (unifiedProfile/agentConversation).
//              No app slice, no cxComponent — just an authored demo slide
//              plus the state fields its renderer reads.
//
//  question.type: "text" | "textarea" | "list" (comma / newline split,
//  capped at `max`).
// ════════════════════════════════════════════════════════════════
(function () {
  "use strict";

  window.HOLO_SIMPLE_EXP = {
    experiences: [
      {
        id: "cimulate",
        label: "Cimulate storefront",
        blurb: "Intent-aware product search + a shopper concierge agent, branded to the customer.",
        icon: "🔎",
        kind: "app",
        generatorId: "cimulate",
        questions: [
          {
            id: "searchQueries",
            label: "Search queries a shopper would type",
            hint: "1–2 (up to 4). One per line or comma-separated.",
            type: "list",
            max: 4,
            targetPath: "simple.answers.cimulate.searchQueries",
          },
          {
            id: "agentQuestions",
            label: "Things to ask the shopper agent",
            hint: "1–2 (up to 4). One per line or comma-separated.",
            type: "list",
            max: 4,
            targetPath: "simple.answers.cimulate.agentQuestions",
          },
        ],
      },
      {
        id: "clienteling",
        label: "Clienteling app",
        blurb: "Store-associate tool — customer 360, walk-ins, guided selling, next-best actions.",
        icon: "🛍️",
        kind: "app",
        generatorId: "clienteling",
        questions: [
          {
            id: "memberPromos",
            label: "Promos for members",
            hint: "Offers or perks to feature for loyalty members.",
            type: "textarea",
            targetPath: "simple.answers.clienteling.memberPromos",
          },
          {
            id: "recProducts",
            label: "Recommended products",
            hint: "Products to spotlight in guided selling.",
            type: "textarea",
            targetPath: "simple.answers.clienteling.recProducts",
          },
        ],
      },
      {
        id: "unifiedProfile",
        label: "Unified profile (Data Cloud)",
        blurb: "A live customer 360 profile assembled from unified Data Cloud signals.",
        icon: "🧬",
        kind: "slide",
        layout: "unifiedProfile",
        questions: [
          {
            id: "personName",
            label: "Person name",
            hint: "Whose profile is this? (optional)",
            type: "text",
            targetPath: "personas.0.name",
          },
        ],
      },
      {
        id: "helpAgent",
        label: "Help agent conversation",
        blurb: "A live agent conversation resolving a customer-service inquiry end to end.",
        icon: "💬",
        kind: "slide",
        layout: "agentConversation",
        questions: [
          {
            id: "serviceInquiry",
            label: "Customer-service inquiry to solve",
            hint: "What is the customer trying to resolve? (optional)",
            type: "textarea",
            targetPath: "simple.answers.helpAgent.serviceInquiry",
          },
        ],
      },
    ],
  };
})();
