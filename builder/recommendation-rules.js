// ════════════════════════════════════════════════════════════════
//  RECOMMENDATION RULES ENGINE
//  Deterministic rules that turn the SE's inputs into ranked
//  recommendations (slides, assets, components, KPIs, talk tracks).
//
//  HOW IT WORKS
//  ────────────
//  1. extractScriptSignals(text) → { signal: weight } from keywords
//  2. Each rule has:
//       id        — stable identifier
//       title     — default editable title
//       type      — slide | section | asset | component | deviceMoment | kpi | talkTrack
//       layout    — preview layout (hero, journeyTimeline, demoMap, ...)
//       capabilities — Salesforce capabilities highlighted
//       requiredInputs — fields needed before this is "ready"
//       match(ctx) → { hit, signals[], priority } or null
//
//  Adding new rules: append to RULES below. Adding a new layout:
//  also extend preview-renderer.js so the wireframe renders.
// ════════════════════════════════════════════════════════════════

(function (global) {
  "use strict";

  // ─── Keyword → signal map ──────────────────────────────────────
  // Lowercase keys. Used by the script keyword extractor.
  const KEYWORD_SIGNALS = {
    // Agentforce
    "agent": "agentforce", "agentic": "agentforce", "ai assistant": "agentforce",
    "autonomous": "agentforce", "copilot": "agentforce", "chatbot": "agentforce",
    "assistant": "agentforce", "shopper agent": "agentforce", "service agent": "agentforce",
    "topic": "agentforce", "action": "agentforce", "handoff": "agentforce_handoff",
    // Data Cloud
    "profile": "datacloud", "identity": "datacloud", "unified": "datacloud",
    "segment": "datacloud", "audience": "datacloud", "real-time": "datacloud",
    "event stream": "datacloud", "cdp": "datacloud", "first-party": "datacloud",
    // Marketing Cloud / Personalization
    "email": "marketing", "journey": "marketing", "campaign": "marketing",
    "personalization": "marketing", "mcp": "marketing",
    // Commerce
    "cart": "commerce", "checkout": "commerce", "storefront": "commerce",
    "product recommendation": "commerce", "browse": "commerce", "ecommerce": "commerce",
    // Loyalty
    "loyalty": "loyalty", "points": "loyalty", "member": "loyalty", "tier": "loyalty",
    // Service
    "case": "service", "service": "service", "contact center": "service",
    "support": "service",
    // Retail / store
    "store": "retail_store", "associate": "retail_store", "clienteling": "retail_store",
    "inventory": "retail_store", "pos": "retail_store",
    // Hospitality / Travel
    "guest": "hospitality", "booking": "hospitality", "reservation": "hospitality",
    "trip": "hospitality", "property": "hospitality", "concierge": "hospitality",
    // SMS
    "sms": "sms", "text": "sms", "whatsapp": "sms",
    // Paid media
    "instagram": "paidmedia", "facebook": "paidmedia", "linkedin": "paidmedia",
    "ad": "paidmedia",
  };

  // ─── Industry / audience expansion sets ────────────────────────
  const PRODUCT_SIGNALS = {
    "Agentforce":      ["agentforce"],
    "Data Cloud":      ["datacloud"],
    "Marketing Cloud": ["marketing"],
    "Sales Cloud":     ["sales"],
    "Service Cloud":   ["service"],
    "Commerce":        ["commerce"],
    "Loyalty":         ["loyalty"],
    "MuleSoft":        ["mulesoft", "integration"],
    "Tableau":         ["tableau", "analytics"],
  };

  const INDUSTRY_SIGNALS = {
    "Retail":             ["retail_store", "commerce", "loyalty"],
    "Consumer Goods":     ["commerce", "datacloud"],
    "Hospitality":        ["hospitality", "loyalty"],
    "Travel":             ["hospitality", "loyalty"],
    "Financial Services": ["service", "datacloud", "compliance"],
    "Healthcare":         ["service", "datacloud", "compliance"],
    "Other":              [],
  };

  const AUDIENCE_TONE = {
    "Executive":  { tone: "value",     skipTechnical: true  },
    "IT":         { tone: "technical", skipTechnical: false },
    "Marketing":  { tone: "channel",   skipTechnical: true  },
    "Sales":      { tone: "pipeline",  skipTechnical: true  },
    "Service":    { tone: "service",   skipTechnical: false },
    "Store Ops":  { tone: "ops",       skipTechnical: true  },
    "Field Ops":  { tone: "ops",       skipTechnical: true  },
    "Mixed":      { tone: "balanced",  skipTechnical: false },
  };

  const STAGE_FOCUS = {
    "Vision":               ["story", "value", "future"],
    "Discovery":            ["pain", "story", "persona"],
    "Technical Validation": ["architecture", "data", "integration"],
    "Executive Readout":    ["value", "kpi", "summary"],
    "RFP / POV":            ["architecture", "value", "scope"],
  };

  // ─── Extract signals from a free-form script ───────────────────
  function extractScriptSignals(text) {
    const signals = {};
    if (!text) return signals;
    const lower = text.toLowerCase();
    Object.keys(KEYWORD_SIGNALS).forEach(function (kw) {
      if (lower.indexOf(kw) !== -1) {
        const sig = KEYWORD_SIGNALS[kw];
        signals[sig] = (signals[sig] || 0) + 1;
      }
    });
    return signals;
  }

  // ─── Build a unified signal map from all inputs ────────────────
  function buildSignalMap(ctx) {
    const map = {};
    function add(sig, weight) {
      if (!sig) return;
      map[sig] = (map[sig] || 0) + (weight || 1);
    }
    (ctx.products || []).forEach(function (p) {
      (PRODUCT_SIGNALS[p] || []).forEach(function (s) { add(s, 3); });
    });
    (INDUSTRY_SIGNALS[ctx.industry] || []).forEach(function (s) { add(s, 2); });
    if (ctx.audience && AUDIENCE_TONE[ctx.audience]) {
      add("aud_" + ctx.audience.toLowerCase().replace(/\s+/g, "_"), 2);
    }
    if (ctx.salesStage && STAGE_FOCUS[ctx.salesStage]) {
      STAGE_FOCUS[ctx.salesStage].forEach(function (s) { add("focus_" + s, 2); });
    }
    const scriptSigs = extractScriptSignals(ctx.scriptText || "");
    Object.keys(scriptSigs).forEach(function (s) { add(s, scriptSigs[s]); });
    (ctx.storyActs || []).forEach(function (act) {
      const text = [act.title, act.summary, act.demoMoment, act.notes].join(" ");
      const sigs = extractScriptSignals(text);
      Object.keys(sigs).forEach(function (s) { add(s, sigs[s]); });
    });
    return map;
  }

  // ─── Recommendation rule definitions ───────────────────────────
  // Each rule's match() returns { priority, signals } or null.
  // Priority is added to a base score; higher priority sorts first.
  // Every rule declares a sectionId so the slide selector can group
  // it correctly: intro | journey-map | meet-persona | demo | business-value
  const RULES = [

    // ── Intro section ───────────────────────────────────────────
    {
      id: "slide-hero",
      title: "Hero / Title Slide",
      type: "slide",
      layout: "hero",
      sectionId: "intro",
      selectionStatus: "required",
      capabilities: [],
      requiredInputs: ["customerName", "demoTitle"],
      match: function (ctx, sig) {
        return { priority: 100, signals: ["always-on"] };
      },
    },
    {
      id: "slide-story-foundation",
      title: "Story Foundation — Why This Matters",
      type: "slide",
      layout: "storyFoundation",
      sectionId: "intro",
      selectionStatus: "required",
      capabilities: [],
      requiredInputs: ["bigProblem", "futureVision"],
      match: function (ctx) {
        if (ctx.bigProblem || ctx.futureVision || ctx.scriptText) return { priority: 96, signals: ["foundation"] };
        return { priority: 80, signals: ["scaffolding"] };
      },
    },
    {
      id: "slide-customer-challenge",
      title: "The Customer Challenge",
      type: "slide",
      layout: "currentFutureState",
      sectionId: "intro",
      selectionStatus: "recommended",
      capabilities: [],
      requiredInputs: ["bigProblem"],
      match: function (ctx) {
        if (ctx.bigProblem && ctx.currentPain) return { priority: 86, signals: ["story", "transformation"] };
        if (ctx.bigProblem || ctx.currentPain) return { priority: 70, signals: ["story"] };
        return null;
      },
    },
    {
      id: "slide-future-state",
      title: "Future-State Vision",
      type: "slide",
      layout: "futureState",
      sectionId: "intro",
      selectionStatus: "recommended",
      capabilities: [],
      requiredInputs: ["futureVision"],
      match: function (ctx, sig) {
        if (!ctx.futureVision && !sig.focus_future) return null;
        let p = 78;
        if (sig.focus_future || sig.focus_value) p += 8;
        if (ctx.audience === "Executive") p += 6;
        return { priority: p, signals: ["future-state"] };
      },
    },

    // ── Journey Map section ─────────────────────────────────────
    // NOTE: journey-map is manifest-owned (see buildSlideManifest +
    // MANIFEST_SECTIONS) — the journey timeline now ships as the synthetic
    // slide _rt_journey_timeline, which carries its editorPaths. The old
    // RULES timeline entry was filtered out before rendering and has been
    // removed. (slide-demo-map below is likewise manifest-gated.)
    {
      id: "slide-demo-map",
      title: "One Journey, Many Signals",
      type: "slide",
      layout: "demoMap",
      sectionId: "journey-map",
      selectionStatus: "recommended",
      capabilities: [],
      requiredInputs: ["storyActs"],
      match: function (ctx) {
        if ((ctx.storyActs || []).length >= 2) return { priority: 84, signals: ["acts"] };
        return null;
      },
    },

    // ── Meet the Persona section ────────────────────────────────
    {
      id: "slide-persona",
      title: "Meet the Persona",
      type: "slide",
      layout: "personaCard",
      sectionId: "meet-persona",
      selectionStatus: "required",
      capabilities: [],
      requiredInputs: ["personas"],
      match: function (ctx) {
        if ((ctx.personas || []).length >= 1) return { priority: 88, signals: ["persona"] };
        return { priority: 60, signals: ["scaffolding"] };
      },
    },

    // ── Meet-Persona enrichments ────────────────────────────────
    {
      id: "slide-unified-profile-teaser",
      title: "Persona's Unified Profile",
      type: "slide",
      layout: "unifiedProfile",
      sectionId: "meet-persona",
      selectionStatus: "recommended",
      capabilities: ["Data Cloud"],
      requiredInputs: ["personas"],
      match: function (ctx, sig) {
        if (!sig.datacloud) return null;
        if (!(ctx.personas || []).length) return null;
        return { priority: 80, signals: ["datacloud", "persona"] };
      },
    },

    // ── Demo section: agent / commerce / data / device moments ──
    {
      // "The moment that starts everything" — the cinematic scene-photo
      // beat (one visit, one email) that opens the demo. Renders in /demo
      // from storyActs + demoAssets.storeInterior; this rule makes it
      // discoverable + selectable in the Step-5 selector.
      id: "slide-scene-photo",
      title: "The moment that starts everything",
      type: "slide",
      layout: "scenePhoto",
      sectionId: "demo",
      selectionStatus: "recommended",
      capabilities: ["Data Cloud"],
      requiredInputs: ["storyActs"],
      match: function (ctx) {
        if (!(ctx.storyActs || []).length) return null;
        return { priority: 88, signals: ["story"] };
      },
    },
    {
      // Story / context interstitial — a pacing beat ("Two months have
      // passed…") the SE can drop anywhere in the demo. Always available
      // (optional), low priority so it never crowds the recommended cards.
      id: "slide-story-interstitial",
      title: "Story / context beat",
      type: "slide",
      layout: "storyInterstitial",
      sectionId: "demo",
      selectionStatus: "optional",
      capabilities: [],
      requiredInputs: [],
      match: function () {
        return { priority: 20, signals: ["story"] };
      },
    },
    {
      id: "slide-agent-conversation",
      title: "Agent Conversation Moment",
      type: "slide",
      layout: "agentConversation",
      sectionId: "demo",
      selectionStatus: "recommended",
      capabilities: ["Agentforce"],
      requiredInputs: ["scenes"],
      match: function (ctx, sig) {
        if (!sig.agentforce) return null;
        return { priority: 82, signals: ["agentforce"] };
      },
    },
    {
      id: "slide-agent-topics",
      title: "Agentforce Topics & Actions",
      type: "slide",
      layout: "architecture",
      sectionId: "demo",
      selectionStatus: "optional",
      capabilities: ["Agentforce"],
      requiredInputs: [],
      match: function (ctx, sig) {
        if (!sig.agentforce) return null;
        if (ctx.audience === "IT" || ctx.salesStage === "Technical Validation") {
          return { priority: 72, signals: ["agentforce", "technical"] };
        }
        return null;
      },
    },
    {
      id: "slide-agent-handoff",
      title: "Human + Agent Handoff",
      type: "slide",
      layout: "agentConversation",
      sectionId: "demo",
      selectionStatus: "optional",
      capabilities: ["Agentforce", "Service Cloud"],
      requiredInputs: [],
      match: function (ctx, sig) {
        if (sig.agentforce_handoff || (sig.agentforce && sig.service)) {
          return { priority: 68, signals: ["handoff"] };
        }
        return null;
      },
    },
    {
      id: "slide-unified-profile",
      title: "Unified Customer Profile",
      type: "slide",
      layout: "unifiedProfile",
      sectionId: "demo",
      selectionStatus: "recommended",
      capabilities: ["Data Cloud"],
      requiredInputs: [],
      match: function (ctx, sig) {
        if (!sig.datacloud) return null;
        return { priority: 80, signals: ["datacloud"] };
      },
    },
    {
      id: "slide-identity-resolution",
      title: "Identity Resolution",
      type: "slide",
      layout: "architecture",
      sectionId: "demo",
      selectionStatus: "optional",
      capabilities: ["Data Cloud"],
      requiredInputs: [],
      match: function (ctx, sig) {
        if (!sig.datacloud) return null;
        if (ctx.audience === "IT" || ctx.salesStage === "Technical Validation") {
          return { priority: 76, signals: ["datacloud", "technical"] };
        }
        return null;
      },
    },
    {
      id: "slide-segment-activation",
      title: "Segment / Audience Activation",
      type: "slide",
      layout: "unifiedProfile",
      sectionId: "demo",
      selectionStatus: "optional",
      capabilities: ["Data Cloud", "Marketing Cloud"],
      requiredInputs: [],
      match: function (ctx, sig) {
        if (!sig.datacloud) return null;
        return { priority: 62, signals: ["datacloud", "activation"] };
      },
    },

    // ── Embedded CX components (AubreyDemo) — Demo section ──────
    {
      id: "slide-embedded-cx",
      title: "Embedded CX Demo Moment",
      type: "slide",
      layout: "embeddedCxComponent",
      sectionId: "demo",
      selectionStatus: "recommended",
      capabilities: [],
      requiredInputs: ["cxComponents"],
      match: function (ctx) {
        if ((ctx.cxComponents || []).length >= 1) return { priority: 86, signals: ["cx-component"] };
        return null;
      },
    },

    // ── Channel device moments — Demo section ───────────────────
    {
      id: "device-instagram",
      title: "Instagram Ad",
      type: "deviceMoment",
      layout: "deviceMoment",
      sectionId: "demo",
      deviceFrame: "mobile",   // always the phone frame (immune to title/channel prose)
      selectionStatus: "optional",
      capabilities: ["Marketing Cloud"],
      requiredInputs: ["scenes"],
      match: function (ctx, sig) {
        if (sig.paidmedia || (sig.marketing && (ctx.industry === "Retail" || ctx.industry === "Consumer Goods"))) {
          return { priority: 65, signals: ["paid-media"] };
        }
        return null;
      },
    },
    {
      id: "device-sms",
      title: "Agentic SMS",
      type: "deviceMoment",
      layout: "deviceMoment",
      sectionId: "demo",
      deviceFrame: "mobile",   // always the phone frame
      selectionStatus: "optional",
      capabilities: ["Agentforce", "Marketing Cloud"],
      requiredInputs: ["scenes"],
      match: function (ctx, sig) {
        if (sig.sms || (sig.agentforce && sig.marketing)) {
          return { priority: 62, signals: ["sms"] };
        }
        return null;
      },
    },
    {
      id: "device-email",
      title: "Agentic Email Conversation",
      type: "deviceMoment",
      layout: "deviceMoment",
      sectionId: "demo",
      deviceFrame: "mobile",   // phone frame — shows a linked CX moment or a cxEmailConvo still
      selectionStatus: "optional",
      capabilities: ["Agentforce", "Marketing Cloud"],
      requiredInputs: ["scenes"],
      match: function (ctx, sig) {
        if (sig.agentforce && sig.marketing) {
          return { priority: 60, signals: ["email"] };
        }
        return null;
      },
    },
    {
      id: "device-shopper-agent",
      title: "Shopper Agent",
      type: "deviceMoment",
      layout: "deviceMoment",
      sectionId: "demo",
      deviceFrame: "mobile",   // force phone — was defaulting to the desktop frame via act channel prose
      selectionStatus: "recommended",
      capabilities: ["Agentforce", "Commerce"],
      requiredInputs: ["scenes"],
      match: function (ctx, sig) {
        if (sig.commerce && sig.agentforce) {
          return { priority: 72, signals: ["agentforce", "commerce"] };
        }
        return null;
      },
    },
    {
      id: "device-storefront",
      title: "Personalized Storefront — Laptop Moment",
      type: "deviceMoment",
      layout: "deviceMoment",
      sectionId: "demo",
      selectionStatus: "recommended",
      capabilities: ["Commerce", "Marketing Cloud"],
      requiredInputs: [],
      match: function (ctx, sig) {
        if (sig.commerce) return { priority: 60, signals: ["commerce"] };
        return null;
      },
    },
    {
      id: "device-store-associate",
      title: "Store Associate / POS — Clienteling",
      type: "deviceMoment",
      layout: "deviceMoment",
      sectionId: "demo",
      selectionStatus: "optional",
      capabilities: ["Service Cloud", "Data Cloud"],
      requiredInputs: [],
      match: function (ctx, sig) {
        if (sig.retail_store) return { priority: 55, signals: ["retail-store"] };
        return null;
      },
    },
    {
      id: "device-service-console",
      title: "Service Cloud Console",
      type: "deviceMoment",
      layout: "deviceMoment",
      sectionId: "demo",
      selectionStatus: "optional",
      capabilities: ["Service Cloud"],
      requiredInputs: [],
      match: function (ctx, sig) {
        if (sig.service) return { priority: 55, signals: ["service"] };
        return null;
      },
    },

    // ── Architecture / IT-leaning — Demo section ────────────────
    {
      id: "slide-architecture",
      title: "Architecture / Data Flow Diagram",
      type: "slide",
      layout: "architecture",
      sectionId: "demo",
      selectionStatus: "optional",
      audienceTags: ["IT", "Mixed"],
      capabilities: ["MuleSoft", "Data Cloud"],
      requiredInputs: [],
      match: function (ctx, sig) {
        if (ctx.audience === "IT" || ctx.salesStage === "Technical Validation" ||
            ctx.salesStage === "RFP / POV") {
          return { priority: 78, signals: ["technical"] };
        }
        return null;
      },
    },
    {
      id: "slide-integration-map",
      title: "Integration Map — Systems of Record",
      type: "slide",
      layout: "architecture",
      sectionId: "demo",
      selectionStatus: "optional",
      audienceTags: ["IT"],
      capabilities: ["MuleSoft"],
      requiredInputs: [],
      match: function (ctx, sig) {
        if ((ctx.audience === "IT" || ctx.salesStage === "Technical Validation") && sig.mulesoft) {
          return { priority: 70, signals: ["technical", "integration"] };
        }
        return null;
      },
    },
    {
      id: "slide-governance",
      title: "Governance, Security & Compliance",
      type: "slide",
      layout: "architecture",
      sectionId: "demo",
      selectionStatus: "optional",
      audienceTags: ["IT"],
      capabilities: ["Data Cloud"],
      requiredInputs: [],
      match: function (ctx, sig) {
        if (ctx.industry === "Financial Services" || ctx.industry === "Healthcare" ||
            ctx.audience === "IT") {
          return { priority: 68, signals: ["compliance"] };
        }
        return null;
      },
    },

    // ── Business Value section ──────────────────────────────────
    {
      id: "slide-kpi-scorecard",
      title: "Business Value Scorecard",
      type: "slide",
      layout: "kpiScorecard",
      sectionId: "business-value",
      selectionStatus: "required",
      capabilities: [],
      requiredInputs: ["bvsMetrics"],
      match: function (ctx, sig) {
        let p = 75;
        if (ctx.audience === "Executive" || ctx.salesStage === "Executive Readout") p += 15;
        return { priority: p, signals: ["value"] };
      },
    },
    {
      id: "slide-value-drivers",
      title: "Value Drivers",
      type: "slide",
      layout: "kpiScorecard",
      sectionId: "business-value",
      selectionStatus: "recommended",
      capabilities: [],
      requiredInputs: [],
      match: function (ctx, sig) {
        return { priority: 70, signals: ["value"] };
      },
    },
    {
      id: "slide-before-after",
      title: "Before / After Operating Model",
      type: "slide",
      layout: "currentFutureState",
      sectionId: "business-value",
      selectionStatus: "optional",
      capabilities: [],
      requiredInputs: ["currentPain", "futureVision"],
      match: function (ctx, sig) {
        if (ctx.currentPain && ctx.futureVision) return { priority: 70, signals: ["transformation"] };
        return null;
      },
    },
    {
      id: "slide-capability-summary",
      title: "Capability Summary",
      type: "slide",
      layout: "architecture",
      sectionId: "business-value",
      selectionStatus: "optional",
      capabilities: [],
      requiredInputs: [],
      match: function (ctx, sig) {
        if ((ctx.products || []).length >= 2) return { priority: 60, signals: ["capabilities"] };
        return null;
      },
    },
    {
      id: "slide-executive-takeaway",
      title: "Executive Takeaway",
      type: "slide",
      layout: "executiveSummary",
      sectionId: "business-value",
      selectionStatus: "required",
      capabilities: [],
      requiredInputs: ["executiveTakeaway"],
      match: function (ctx, sig) {
        return { priority: 88, signals: ["always-on", "close"] };
      },
    },
    {
      id: "slide-next-steps",
      title: "Roadmap / Next Steps",
      type: "slide",
      layout: "nextSteps",
      sectionId: "business-value",
      selectionStatus: "optional",
      capabilities: [],
      requiredInputs: [],
      match: function (ctx, sig) {
        if (ctx.salesStage === "Executive Readout" || ctx.salesStage === "RFP / POV") {
          return { priority: 64, signals: ["roadmap"] };
        }
        return null;
      },
    },
    {
      id: "kpi-conversion-lift",
      title: "Conversion Lift",
      type: "kpi",
      layout: "kpiScorecard",
      sectionId: "business-value",
      selectionStatus: "recommended",
      capabilities: [],
      requiredInputs: [],
      match: function (ctx, sig) {
        if (sig.commerce || ctx.industry === "Retail" || ctx.industry === "Consumer Goods") {
          return { priority: 60, signals: ["commerce"] };
        }
        return null;
      },
    },
    {
      id: "kpi-aov",
      title: "Average Order Value",
      type: "kpi",
      layout: "kpiScorecard",
      sectionId: "business-value",
      selectionStatus: "recommended",
      capabilities: [],
      requiredInputs: [],
      match: function (ctx, sig) {
        if (sig.commerce || ctx.industry === "Retail") return { priority: 55, signals: ["commerce"] };
        return null;
      },
    },
    {
      id: "kpi-loyalty",
      title: "Loyalty Enrollment Rate",
      type: "kpi",
      layout: "kpiScorecard",
      sectionId: "business-value",
      selectionStatus: "recommended",
      capabilities: ["Loyalty"],
      requiredInputs: [],
      match: function (ctx, sig) {
        if (sig.loyalty) return { priority: 58, signals: ["loyalty"] };
        return null;
      },
    },
    {
      id: "kpi-service-efficiency",
      title: "Service Efficiency / Deflection",
      type: "kpi",
      layout: "kpiScorecard",
      sectionId: "business-value",
      selectionStatus: "recommended",
      capabilities: ["Service Cloud", "Agentforce"],
      requiredInputs: [],
      match: function (ctx, sig) {
        if (sig.service || sig.agentforce) return { priority: 58, signals: ["service"] };
        return null;
      },
    },

    // ── Industry-specific: Retail / Consumer Goods (Demo) ───────
    {
      id: "slide-shopper-journey",
      title: "Shopper Journey",
      type: "slide",
      layout: "journeyTimeline",
      sectionId: "journey-map",
      selectionStatus: "optional",
      capabilities: ["Marketing Cloud", "Commerce"],
      requiredInputs: [],
      match: function (ctx, sig) {
        if (ctx.industry === "Retail" || ctx.industry === "Consumer Goods") {
          return { priority: 65, signals: ["retail"] };
        }
        return null;
      },
    },
    {
      id: "slide-clienteling",
      title: "Associate Clienteling View",
      type: "slide",
      layout: "deviceMoment",
      sectionId: "demo",
      selectionStatus: "optional",
      capabilities: ["Service Cloud", "Data Cloud"],
      requiredInputs: [],
      match: function (ctx, sig) {
        if (ctx.industry === "Retail" && (sig.retail_store || ctx.audience === "Store Ops")) {
          return { priority: 64, signals: ["retail-store"] };
        }
        return null;
      },
    },
    {
      id: "slide-product-recs",
      title: "Product Recommendations",
      type: "slide",
      layout: "deviceMoment",
      sectionId: "demo",
      selectionStatus: "recommended",
      capabilities: ["Commerce", "Marketing Cloud"],
      requiredInputs: [],
      match: function (ctx, sig) {
        if (sig.commerce || ctx.industry === "Retail") {
          return { priority: 60, signals: ["commerce"] };
        }
        return null;
      },
    },
    {
      id: "slide-loyalty-moment",
      title: "Loyalty Moment",
      type: "slide",
      layout: "deviceMoment",
      sectionId: "demo",
      selectionStatus: "optional",
      capabilities: ["Loyalty"],
      requiredInputs: [],
      match: function (ctx, sig) {
        if (sig.loyalty) return { priority: 60, signals: ["loyalty"] };
        return null;
      },
    },
    {
      id: "slide-post-purchase",
      title: "Post-Purchase Engagement",
      type: "slide",
      layout: "deviceMoment",
      sectionId: "demo",
      selectionStatus: "optional",
      capabilities: ["Marketing Cloud", "Commerce"],
      requiredInputs: [],
      match: function (ctx, sig) {
        if (sig.commerce || sig.marketing) return { priority: 55, signals: ["lifecycle"] };
        return null;
      },
    },

    // ── Industry-specific: Hospitality / Travel ─────────────────
    {
      id: "slide-guest-profile",
      title: "Guest Profile",
      type: "slide",
      layout: "unifiedProfile",
      sectionId: "meet-persona",
      selectionStatus: "recommended",
      capabilities: ["Data Cloud"],
      requiredInputs: [],
      match: function (ctx, sig) {
        if (ctx.industry === "Hospitality" || ctx.industry === "Travel") {
          return { priority: 75, signals: ["hospitality"] };
        }
        return null;
      },
    },
    {
      id: "slide-booking-journey",
      title: "Booking Journey",
      type: "slide",
      layout: "journeyTimeline",
      sectionId: "journey-map",
      selectionStatus: "recommended",
      capabilities: ["Commerce", "Marketing Cloud"],
      requiredInputs: [],
      match: function (ctx, sig) {
        if (ctx.industry === "Hospitality" || ctx.industry === "Travel") {
          return { priority: 70, signals: ["hospitality"] };
        }
        return null;
      },
    },
    {
      id: "slide-prearrival",
      title: "Pre-Arrival / On-Property / Post-Trip",
      type: "slide",
      layout: "journeyTimeline",
      sectionId: "demo",
      selectionStatus: "recommended",
      capabilities: ["Marketing Cloud", "Service Cloud"],
      requiredInputs: [],
      match: function (ctx, sig) {
        if (ctx.industry === "Hospitality" || ctx.industry === "Travel") {
          return { priority: 65, signals: ["hospitality"] };
        }
        return null;
      },
    },
    {
      id: "slide-disruption",
      title: "Disruption Handling — Agent Recovery",
      type: "slide",
      layout: "agentConversation",
      sectionId: "demo",
      selectionStatus: "recommended",
      capabilities: ["Agentforce", "Service Cloud"],
      requiredInputs: [],
      match: function (ctx, sig) {
        if ((ctx.industry === "Hospitality" || ctx.industry === "Travel") && sig.agentforce) {
          return { priority: 68, signals: ["hospitality", "agentforce"] };
        }
        return null;
      },
    },
    {
      id: "slide-concierge",
      title: "Concierge Moment",
      type: "slide",
      layout: "agentConversation",
      sectionId: "demo",
      selectionStatus: "optional",
      capabilities: ["Agentforce"],
      requiredInputs: [],
      match: function (ctx, sig) {
        if ((ctx.industry === "Hospitality" || ctx.industry === "Travel") && sig.agentforce) {
          return { priority: 60, signals: ["hospitality"] };
        }
        return null;
      },
    },
  ];

  // ─── Evaluate all rules and return ranked recommendations ──────
  function recommend(ctx) {
    const sig = buildSignalMap(ctx);
    const out = [];
    RULES.forEach(function (rule) {
      let result;
      try { result = rule.match(ctx, sig); }
      catch (e) { result = null; }
      if (!result) return;
      const missing = (rule.requiredInputs || []).filter(function (k) {
        const v = ctx[k];
        if (Array.isArray(v)) return v.length === 0;
        return v == null || v === "";
      });
      out.push({
        id: rule.id,
        title: rule.title,
        type: rule.type,
        layout: rule.layout,
        sectionId: rule.sectionId || layoutToSectionId(rule.layout),
        selectionStatus: rule.selectionStatus || "optional",
        audienceTags: rule.audienceTags || [],
        capabilities: rule.capabilities ? rule.capabilities.slice() : [],
        priority: result.priority,
        // Intent grouping for the Step-5 selector: an explicit tag on the
        // rule wins, else derive from the layout. Lets the demo section
        // collapse its many near-duplicate cards under a few intent headers.
        intentGroup: rule.intentGroup || intentGroupFor(rule.layout, result.signals),
        rationale: rationaleFor(rule, result, ctx),
        sourceSignals: result.signals || [],
        missingInputs: missing,
      });
    });
    out.sort(function (a, b) { return b.priority - a.priority; });
    return { recommendations: out, signals: sig };
  }

  function rationaleFor(rule, result, ctx) {
    const reasons = [];
    (result.signals || []).forEach(function (s) {
      if (s === "always-on")     reasons.push("Core scaffolding for any holodeck");
      else if (s === "agentforce") reasons.push("Agentforce is in your selected products or script");
      else if (s === "datacloud")  reasons.push("Data Cloud signal detected");
      else if (s === "commerce")   reasons.push("Commerce signal detected");
      else if (s === "marketing")  reasons.push("Marketing / personalization signal detected");
      else if (s === "service")    reasons.push("Service signal detected");
      else if (s === "loyalty")    reasons.push("Loyalty signal detected");
      else if (s === "retail-store") reasons.push("Retail / store-ops signal detected");
      else if (s === "hospitality") reasons.push("Hospitality / travel industry");
      else if (s === "technical")   reasons.push("Audience or stage indicates technical depth");
      else if (s === "value")       reasons.push("Sales stage / audience favors business value");
      else if (s === "future-state") reasons.push("Vision-stage future-state framing");
      else if (s === "transformation") reasons.push("You captured both current pain and future vision");
      else if (s === "compliance")  reasons.push("Industry typically requires compliance posture");
      else if (s === "acts" || s === "multi-act" || s === "persona") reasons.push("Story acts / personas defined");
      else if (s === "scaffolding") reasons.push("Recommended scaffolding for any demo");
      else if (s === "close")       reasons.push("Always close with executive takeaway");
      else if (s === "lifecycle")   reasons.push("Extends the post-purchase / lifecycle moment");
      else reasons.push(s);
    });
    return reasons.join(" • ");
  }

  // ─── Layout catalog (used by preview-renderer.js) ─────────────
  const LAYOUTS = {
    hero:                { label: "Hero",                blocks: ["Eyebrow tag", "Title headline", "Sub-headline", "Brand mark"] },
    storyFoundation:     { label: "Story Foundation",    blocks: ["Business problem", "Future-state vision", "Transformation thesis", "Primary narrative"] },
    currentFutureState:  { label: "Current vs Future",   blocks: ["Current pain", "Future state", "Capability bridge", "Transformation thesis"] },
    futureState:         { label: "Future State",        blocks: ["Future-state vision", "Outcome statements", "Capability badges"] },
    journeyTimeline:     { label: "Journey Timeline",    blocks: ["Timeline rail", "Per-act persona/channel", "Capability badges", "Business value"] },
    demoMap:             { label: "Demo Map",            blocks: ["Act cards", "Channels", "Capabilities", "Required assets"] },
    personaCard:         { label: "Persona Card",        blocks: ["Portrait", "Name & role", "Goals", "Pain points", "Demo relevance"] },
    agentConversation:   { label: "Agent Conversation",  blocks: ["User turn", "Agent turn", "Capability chips", "Action callout"] },
    unifiedProfile:      { label: "Unified Profile",     blocks: ["Profile card", "Identity fields", "Segments / signals", "Recommended next action"] },
    architecture:        { label: "Architecture",        blocks: ["Data sources", "Salesforce platform", "Channels & devices", "Governance"] },
    deviceMoment:        { label: "Device Moment",       blocks: ["Device frame", "Live scene", "Narrative", "Stat strip"] },
    embeddedCxComponent: { label: "Embedded CX Component", blocks: ["AubreyDemo iframe", "Device chrome", "Linked story act", "Fallback link"] },
    kpiScorecard:        { label: "KPI Scorecard",       blocks: ["3–5 metric cards", "Icon + value + label", "Disclaimer"] },
    executiveSummary:    { label: "Executive Takeaway",  blocks: ["Headline", "Three pillars", "Call to action"] },
    nextSteps:           { label: "Next Steps",          blocks: ["Roadmap phases", "Owners", "Timeline"] },
    unknown:             { label: "Layout",              blocks: ["Editable content"] },
  };

  // ─── Map a layout to a Holodeck slide deckOutline type ─────────
  // (Used when generating the final config so the existing renderer
  //  reads the right slide type.)
  const LAYOUT_TO_SLIDE_TYPE = {
    hero:                "title",
    storyFoundation:     "title",
    currentFutureState:  "two-panel",
    futureState:         "title",
    journeyTimeline:     "timeline",
    demoMap:             "two-panel",
    personaCard:         "two-panel",
    agentConversation:   "iframe-phone",
    unifiedProfile:      "two-panel",
    architecture:        "two-panel",
    deviceMoment:        "iframe-phone",
    embeddedCxComponent: "iframe-laptop",
    kpiScorecard:        "stat-grid",
    executiveSummary:    "title",
    nextSteps:           "title",
    unknown:             "two-panel",
  };

  // ─── Slide sections (the narrative the SE follows) ────────────
  const SLIDE_SECTIONS = [
    { id: "intro",          label: "Intro",         order: 1, required: true,
      purpose: "Establish the customer, the business challenge, and the Salesforce vision." },
    { id: "journey-map",    label: "Journey Map",   order: 2, required: true,
      purpose: "Show the end-to-end customer journey before diving into screens." },
    { id: "meet-persona",   label: "Meet the Persona", order: 3, required: true,
      dynamicLabelTemplate: "Meet {primaryPersonaFirstName}",
      purpose: "Introduce the main persona so every demo moment lands." },
    { id: "demo",           label: "Demo",          order: 4, required: true,
      purpose: "Walk through the actual demo moments, agent conversations, and embedded CX components." },
    { id: "business-value", label: "Business Value", order: 5, required: true,
      purpose: "Tie the demo back to outcomes and the transformation thesis." },
  ];

  // Used by config-generator and import-validator when a slide doesn't
  // already declare its sectionId.
  function layoutToSectionId(layout) {
    return ({
      hero:                "intro",
      storyFoundation:     "intro",
      currentFutureState:  "intro",
      futureState:         "intro",
      journeyTimeline:     "demo",
      demoMap:             "journey-map",
      scenePhoto:          "demo",
      storyInterstitial:   "demo",
      personaCard:         "meet-persona",
      unifiedProfile:      "demo",
      agentConversation:   "demo",
      deviceMoment:        "demo",
      embeddedCxComponent: "demo",
      architecture:        "demo",
      kpiScorecard:        "business-value",
      executiveSummary:    "business-value",
      nextSteps:           "business-value",
    })[layout] || "demo";
  }

  // Group label for the Step-5 selector's demo section, so the many
  // near-duplicate demo cards collapse under a handful of intent headers.
  // Derived from layout + signals; rules may override with `intentGroup`.
  function intentGroupFor(layout, signals) {
    signals = signals || [];
    if (layout === "scenePhoto" || layout === "storyInterstitial") return "Context & story";
    if (layout === "agentConversation") return "Agent moments";
    if (layout === "unifiedProfile") return "Data moments";
    if (layout === "embeddedCxComponent") return "Live CX moments";
    if (layout === "architecture") {
      // Architecture cards split between agent topics/handoff and data/integration.
      if (signals.indexOf("agentforce") >= 0 || signals.indexOf("handoff") >= 0) return "Agent moments";
      return "Data moments";
    }
    if (layout === "deviceMoment") {
      if (signals.indexOf("commerce") >= 0 || signals.indexOf("loyalty") >= 0 || signals.indexOf("lifecycle") >= 0) return "Commerce moments";
      if (signals.indexOf("datacloud") >= 0 || signals.indexOf("activation") >= 0) return "Data moments";
      return "Device moments";
    }
    return "Other moments";
  }

  // Compute the dynamic label for the Meet section.
  function sectionLabelFor(section, state) {
    if (!section.dynamicLabelTemplate) return section.label;
    const persona = (state && state.personas && state.personas[0]) || null;
    if (!persona || !persona.name) return section.label;
    const first = String(persona.name).trim().split(/\s+/)[0];
    return section.dynamicLabelTemplate.replace("{primaryPersonaFirstName}", first);
  }

  // ═══════════════════════════════════════════════════════════════
  //  generateRecommendedNarrativePlan
  //  Returns a section-grouped, opinionated plan: which slides
  //  every demo should probably have (anchor), which to keep
  //  optional, and the "Why this sequence?" explanation.
  // ═══════════════════════════════════════════════════════════════
  // The four "fixed" sections whose slides are defined by the runtime
  // manifest (buildSlideManifest in holodeck-shared.js) — NOT by RULES.
  // Their selector cards are synthesized from the manifest so the selector
  // is 1:1 with what actually gets generated/exported. The demo section
  // keeps coming from RULES (its cards map to real state.slides).
  const MANIFEST_SECTIONS = ["intro", "journey-map", "meet-persona", "business-value"];

  // Of the synthetic manifest slides, only these few are truly "Required"
  // (max 1–3 per section) — the spine the template can't tell a story
  // without. Everything else is "recommended": still selected by default
  // (recompute() defaults synthetic slides ON), but the SE is free to trim
  // them without the UI shouting "Required" at every slide.
  const MANIFEST_REQUIRED = {
    "_rt_intro_hero": 1, "_rt_intro_hook": 1,
    "_rt_journey_matrix": 1,
    "_rt_persona_intro": 1, "_rt_persona_card": 1,
    "_rt_bv_closing": 1,
  };

  // Synthetic manifest slides that ship OFF by default (still fully visible and
  // re-selectable in the Step-5 selector). The Business Value section leads with
  // just the Closing Quote (bv-5); the opener/orbit/capabilities/scorecard slides
  // are opt-in. recompute() seeds these to false when the SE hasn't chosen yet.
  const MANIFEST_DEFAULT_OFF = {
    "_rt_bv_opener": 1, "_rt_bv_orbit": 1, "_rt_bv_caps": 1, "_rt_bv_scorecard": 1,
  };

  // Turn the synthetic manifest slides (everything except the demo section)
  // into selector recommendation entries with the SAME id/layout/section the
  // generator/export use. A small set is "required"; the rest are
  // "recommended" but still default on (synthetic + priority 100).
  function manifestRecommendations(state) {
    const SH = global.HOLO_SHARED;
    if (!SH || !SH.buildSlideManifest) return [];
    // includeDeselected: the Step-5 selector must show EVERY synthetic slide,
    // including ones the SE turned off (rendered dimmed / "Hidden from deck"),
    // so they stay re-selectable. Preview/export call buildSlideManifest with
    // no opts → still gated.
    const manifest = SH.buildSlideManifest(state, { includeDeselected: true }) || [];
    return manifest
      .filter(function (sl) {
        return sl && sl.synthetic && MANIFEST_SECTIONS.indexOf(sl.sectionId) >= 0;
      })
      .map(function (sl) {
        const required = !!MANIFEST_REQUIRED[sl.id];
        const defaultOff = !!MANIFEST_DEFAULT_OFF[sl.id];
        return {
          id: sl.id,
          title: sl.title || sl.layout,
          type: "slide",
          layout: sl.layout,
          sectionId: sl.sectionId,
          selectionStatus: required ? "required" : "recommended",
          defaultOff: defaultOff,
          audienceTags: [],
          capabilities: [],
          priority: 100,
          rationale: required
            ? "Core slide for this section — kept by default."
            : defaultOff
              ? "Rendered by the polished template; off by default, turn on to include."
              : "Rendered by the polished template; on by default, safe to trim.",
          sourceSignals: [],
          missingInputs: [],
          synthetic: true,
          // Carry the per-vignette runtime index so the Step-5 grid card
          // renders the right vignette (Know & Reach / Engage & Recover /
          // Convert) instead of all three defaulting to index 0.
          runtimeIndex: (typeof sl.runtimeIndex === "number") ? sl.runtimeIndex : undefined,
        };
      });
  }

  function generateRecommendedNarrativePlan(state) {
    if (!state) state = {};
    const ctx = stateToCtx(state);
    const res = recommend(ctx);

    // Group recommendations by section. The four fixed sections are sourced
    // from the manifest (1:1 with generation); only the demo section uses
    // the RULES recommendations.
    const bySection = {};
    SLIDE_SECTIONS.forEach(function (s) { bySection[s.id] = []; });
    manifestRecommendations(state).forEach(function (r) {
      if (!bySection[r.sectionId]) bySection[r.sectionId] = [];
      bySection[r.sectionId].push(r);
    });
    res.recommendations.forEach(function (r) {
      const sid = r.sectionId || "demo";
      // Skip RULES entries for the four manifest-owned sections — those
      // cards never actually render (the export uses the synthetic slides).
      if (MANIFEST_SECTIONS.indexOf(sid) >= 0) return;
      if (!bySection[sid]) bySection[sid] = [];
      bySection[sid].push(r);
    });

    // Filter out audience-mismatched optional rules
    const audience = (state.project && state.project.audience) || "";
    Object.keys(bySection).forEach(function (sid) {
      bySection[sid] = bySection[sid].filter(function (r) {
        if (!r.audienceTags || !r.audienceTags.length) return true;
        if (audience && r.audienceTags.indexOf(audience) === -1 && r.selectionStatus === "optional") {
          // Drop optional technical slides for executive audience (and v.v.)
          if (audience === "Executive" && r.audienceTags.indexOf("IT") >= 0) return false;
        }
        return true;
      });
    });

    // Build the section-grouped plan
    const sections = SLIDE_SECTIONS.map(function (s) {
      const slides = (bySection[s.id] || []).slice().sort(byPriorityDesc);
      return {
        id: s.id,
        label: sectionLabelFor(s, state),
        order: s.order,
        required: s.required,
        purpose: s.purpose,
        slides: slides,
      };
    });

    // Every slide is selectable and on by default — no anchor auto-trim,
    // no "why this sequence" narrative (the Recommended Narrative feature
    // was removed). allSlideIds lets the caller pre-select everything.
    const allSlideIds = [];
    sections.forEach(function (s) { s.slides.forEach(function (r) { allSlideIds.push(r.id); }); });

    return {
      sections: sections,
      allSlideIds: allSlideIds,
      signals: res.signals,
    };
  }

  function byPriorityDesc(a, b) { return b.priority - a.priority; }

  // Convert state → ctx for recommend()
  function stateToCtx(state) {
    const f = state.storyFoundations || {};
    return {
      customerName: state.project && state.project.customerName,
      website:      state.project && state.project.website,
      industry:     state.project && state.project.industry,
      audience:     state.project && state.project.audience,
      salesStage:   state.project && state.project.salesStage,
      products:     (state.project && state.project.products) || [],
      personas:     state.personas  || [],
      storyActs:    state.storyActs || [],
      scriptText:   state.scriptText || "",
      cxComponents: state.cxComponents || [],
      bigProblem:        (state.story && state.story.bigProblem)        || f.businessProblem    || "",
      currentPain:       (state.story && state.story.currentPain)       || f.currentStatePain   || "",
      futureVision:      (state.story && state.story.futureVision)      || f.futureStateVision  || "",
      executiveTakeaway: (state.story && state.story.executiveTakeaway) || f.executiveTakeaway  || "",
      bvsMetrics:   state.bvsMetrics || [],
      scenes:       state.scenes || [],
    };
  }

  // ─── App intent detection (R2) ─────────────────────────────────
  // Decides, per optional demo app, whether the current project's story
  // shows signals that make it a RECOMMENDED build (vs. a hidden opt-in).
  // Reuses the same signal machinery as slide recommendations so the two
  // stay consistent. Returns per-app:
  //   { hasSignal, weight, evidence:[{keyword, signal}] }
  // `evidence` powers the chips under a recommended card — it lists the
  // actual matched keywords, not the internal signal names.
  //
  // Mapping rules:
  //   clienteling — any `retail_store` signal (store / associate / clienteling
  //                 / inventory / pos, or Retail industry).
  //   cimulate    — `commerce` signal, OR (`agentforce` present AND a retail/
  //                 consumer context), OR `retail_store`. This mirrors the
  //                 concierge app: intent-aware commerce search + a shopper/
  //                 service agent, which fits retail/consumer + agentic stories.
  const APP_SIGNAL_RULES = {
    clienteling: { any: ["retail_store"] },
    cimulate:    { any: ["commerce", "retail_store"], allGroups: [["agentforce", "retail_store"], ["agentforce", "commerce"]] },
  };

  // Which keywords, if present in the project's free text, count as evidence
  // for each app. Derived from KEYWORD_SIGNALS so it never drifts.
  function keywordsForSignals(signalSet) {
    const out = [];
    Object.keys(KEYWORD_SIGNALS).forEach(function (kw) {
      if (signalSet.indexOf(KEYWORD_SIGNALS[kw]) !== -1) out.push(kw);
    });
    return out;
  }

  function detectAppIntents(state) {
    const ctx = stateToCtx(state);
    const map = buildSignalMap(ctx);

    // Gather the free text once so evidence chips can quote real matches.
    const freeText = [
      ctx.scriptText,
      (ctx.storyActs || []).map(function (a) {
        return [a.title, a.summary, a.demoMoment, a.notes].join(" ");
      }).join(" "),
    ].join(" ").toLowerCase();

    const isRetailContext =
      (ctx.industry === "Retail" || ctx.industry === "Consumer Goods") ||
      !!map.retail_store || !!map.commerce;

    function evidenceFor(signals) {
      const kws = keywordsForSignals(signals);
      const hits = [];
      kws.forEach(function (kw) {
        if (freeText.indexOf(kw) !== -1) hits.push({ keyword: kw, signal: KEYWORD_SIGNALS[kw] });
      });
      // Industry can trigger a signal with no literal keyword — surface it too.
      if (signals.indexOf("retail_store") !== -1 && !map.retail_store && isRetailContext && ctx.industry) {
        hits.push({ keyword: ctx.industry + " (industry)", signal: "retail_store" });
      }
      if (signals.indexOf("commerce") !== -1 && map.commerce && !hits.some(function (h) { return h.signal === "commerce"; }) && ctx.industry) {
        hits.push({ keyword: ctx.industry + " (industry)", signal: "commerce" });
      }
      return hits;
    }

    function evalApp(appId) {
      const rule = APP_SIGNAL_RULES[appId];
      let weight = 0;
      let hit = false;
      // "any": a single matching signal triggers.
      (rule.any || []).forEach(function (sig) {
        if (map[sig]) { hit = true; weight += map[sig]; }
      });
      // "allGroups": every signal in a group must be present.
      (rule.allGroups || []).forEach(function (group) {
        if (group.every(function (sig) { return !!map[sig]; })) {
          hit = true;
          group.forEach(function (sig) { weight += map[sig]; });
        }
      });
      // Collect the union of signals this app cares about for evidence.
      const careSignals = {};
      (rule.any || []).forEach(function (s) { careSignals[s] = 1; });
      (rule.allGroups || []).forEach(function (g) { g.forEach(function (s) { careSignals[s] = 1; }); });
      return {
        hasSignal: hit,
        weight: weight,
        evidence: hit ? evidenceFor(Object.keys(careSignals)) : [],
      };
    }

    return {
      clienteling: evalApp("clienteling"),
      cimulate:    evalApp("cimulate"),
    };
  }

  global.HOLO_RULES = {
    extractScriptSignals: extractScriptSignals,
    detectAppIntents: detectAppIntents,
    buildSignalMap: buildSignalMap,
    recommend: recommend,
    LAYOUTS: LAYOUTS,
    LAYOUT_TO_SLIDE_TYPE: LAYOUT_TO_SLIDE_TYPE,
    KEYWORD_SIGNALS: KEYWORD_SIGNALS,
    PRODUCT_SIGNALS: PRODUCT_SIGNALS,
    INDUSTRY_SIGNALS: INDUSTRY_SIGNALS,
    SLIDE_SECTIONS: SLIDE_SECTIONS,
    layoutToSectionId: layoutToSectionId,
    sectionLabelFor: sectionLabelFor,
    generateRecommendedNarrativePlan: generateRecommendedNarrativePlan,
    manifestRecommendations: manifestRecommendations,
    MANIFEST_SECTIONS: MANIFEST_SECTIONS,
    stateToCtx: stateToCtx,
  };
})(window);
