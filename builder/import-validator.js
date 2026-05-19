// ════════════════════════════════════════════════════════════════
//  IMPORT VALIDATOR
//  Parses + validates + normalizes config text from any of:
//    • AI-generated JSON (the schema in ai-config-prompt.js)
//    • Builder snapshot JSON (from config-generator.toJsonString)
//    • Legacy holodeck.config.js  (window.HOLODECK_CONFIG = {...};)
//
//  Returns { state, warnings, errors }. Errors block import; warnings
//  are friendly nudges shown to the SE alongside a successful import.
//
//  This is the only place that knows how to coerce shapes — the
//  builder, home page, and project store all use the normalized state.
// ════════════════════════════════════════════════════════════════

(function (global) {
  "use strict";

  const STORE = global.HOLO_STORE; // for uid + newBlankState

  // ─── Public entry point ────────────────────────────────────────
  function importConfig(raw) {
    if (raw == null || typeof raw !== "string" || !raw.trim()) {
      return { state: null, errors: ["Paste a config first — JSON or window.HOLODECK_CONFIG = {...}."], warnings: [] };
    }
    const parsed = parseEither(raw);
    if (parsed.error) return { state: null, errors: [parsed.error], warnings: [] };
    const norm = normalize(parsed.value);
    return { state: norm.state, errors: norm.errors, warnings: norm.warnings };
  }

  // ─── Parse: try JSON, then JS file ─────────────────────────────
  function parseEither(raw) {
    const trimmed = raw.trim();

    // 1) JSON
    try {
      const v = JSON.parse(trimmed);
      if (v && typeof v === "object") return { value: v };
    } catch (e) { /* fall through */ }

    // 2) JS file (window.HOLODECK_CONFIG = {...};)
    const m = trimmed.match(/window\.HOLODECK_CONFIG\s*=\s*([\s\S]*?);?\s*$/);
    if (m) {
      try {
        // The SE pasted their own export; it's local to their browser.
        // eslint-disable-next-line no-new-func
        const fn = new Function("return (" + m[1] + ");");
        const v = fn();
        if (v && typeof v === "object") return { value: v };
      } catch (e) {
        return { error: "Could not parse the JS config: " + e.message };
      }
    }

    // 3) Sometimes models wrap JSON in ```json … ``` fences.
    const fence = trimmed.match(/```(?:json|js)?\s*([\s\S]*?)```/);
    if (fence) {
      try {
        const v = JSON.parse(fence[1].trim());
        if (v && typeof v === "object") return { value: v };
      } catch (e) { /* fall through */ }
    }

    return { error: "We couldn't read that. Paste either valid JSON or the contents of a holodeck.config.js file." };
  }

  // ─── Normalize the parsed object into builder state ────────────
  function normalize(parsed) {
    const errors = [];
    const warnings = [];

    if (parsed == null || typeof parsed !== "object") {
      return { state: null, errors: ["The pasted content is empty or not a valid object."], warnings: warnings };
    }

    // The pasted object can be one of three shapes — detect, then
    // hydrate a blank state and overlay what we find. We never throw.
    const blank = (STORE && STORE.newBlankState) ? STORE.newBlankState({}) : minimalBlank();
    const state = blank;

    // ── Project ────────────────────────────────────────────────
    // Sources, in priority order:
    //   parsed.project        — AI-generated / builder snapshot shape
    //   parsed.customer       — legacy holodeck.config.js shape
    //   parsed.builderPlan    — extra context our exporter writes
    const proj = parsed.project || parsed.customer || {};
    const plan = parsed.builderPlan || {};
    const presenter = parsed.presenter || {};
    state.project.customerName    = strOr(proj.customerName, proj.name, state.project.customerName);
    state.project.website         = strOr(proj.website, state.project.website);
    state.project.industry        = strOr(proj.industry, state.project.industry);
    state.project.audience        = strOr(proj.audience, plan.audience, state.project.audience);
    state.project.salesStage      = strOr(proj.salesStage, proj.stage, plan.salesStage, state.project.salesStage);
    state.project.products        = arrOr(proj.products, arrOr(plan.products, []));
    state.project.theme           = strOr(proj.theme, plan.theme, state.project.theme);
    state.project.tone            = strOr(proj.tone, plan.tone, (parsed.brand && parsed.brand.tone), state.project.tone);
    state.project.presenterName   = strOr(proj.presenterName,  presenter.name,  state.project.presenterName);
    state.project.presenterTitle  = strOr(proj.presenterTitle, presenter.title, state.project.presenterTitle);
    if (proj.id)         state.id        = String(proj.id);
    if (proj.name)       state.name      = String(proj.name);
    if (proj.createdAt)  state.createdAt = String(proj.createdAt);
    if (proj.updatedAt)  state.updatedAt = String(proj.updatedAt);

    // ── Brand ──────────────────────────────────────────────────
    const brand = parsed.brand || {};
    state.brand.logoPath        = strOr(brand.logoPath, brand.logoUrl, state.brand.logoPath);
    state.brand.primaryColor    = colorOr(brand.primaryColor,   state.brand.primaryColor);
    state.brand.secondaryColor  = colorOr(brand.secondaryColor, state.brand.secondaryColor);
    state.brand.accentColor     = colorOr(brand.accentColor,    state.brand.accentColor);
    state.brand.visualDirection = strOr(brand.visualDirection, state.brand.visualDirection);
    state.brand.notes           = strOr(brand.notes, state.brand.notes);

    // ── Personas ───────────────────────────────────────────────
    const personasSrc = parsed.personas
      || (parsed.builderPlan && parsed.builderPlan.personas)
      || [];
    state.personas = ensureArray(personasSrc).map(function (p) {
      // Stats/wishlist sometimes import as the polished
      // `persona.stats[]` / `persona.wishlist[]` arrays from a
      // generated config. Pass them through as-is when present so
      // the Step 7 editor can reopen them and the adapter can
      // re-emit them on the next export.
      const stats = ensureArray(p && p.stats).map(function (r) {
        return { value: strOr(r && r.value, ""), label: strOr(r && r.label, "") };
      });
      const wishlist = ensureArray(p && p.wishlist).map(function (r) {
        return {
          name:   strOr(r && r.name, ""),
          tag:    strOr(r && r.tag, ""),
          detail: strOr(r && r.detail, ""),
          emoji:  strOr(r && r.emoji, ""),
        };
      });
      return {
        id:            strOr(p && p.id, uid("persona_")),
        name:          strOr(p && p.name, ""),
        role:          strOr(p && p.role, p && p.jobTitle, ""),
        pronouns:      strOr(p && p.pronouns, ""),
        goals:         strOr(p && p.goals, ""),
        painPoints:    strOr(p && p.painPoints, ""),
        demoRelevance: strOr(p && p.demoRelevance, ""),
        stats:         stats,
        wishlist:      wishlist,
        wishlistHeadline: strOr(p && p.wishlistHeadline, ""),
        wishlistLabel:    strOr(p && p.wishlistLabel, ""),
      };
    });

    // ── Story acts ─────────────────────────────────────────────
    const actsSrc = parsed.storyActs
      || (parsed.builderPlan && parsed.builderPlan.storyActs)
      || [];
    state.storyActs = ensureArray(actsSrc).map(function (a) {
      return {
        id:                      strOr(a && a.id, uid("act_")),
        title:                   strOr(a && a.title, ""),
        persona:                 strOr(a && a.persona, ""),
        channel:                 strOr(a && a.channel, ""),
        summary:                 strOr(a && a.summary, ""),
        demoMoment:              strOr(a && a.demoMoment, ""),
        salesforceCapabilities:  strOr(a && a.salesforceCapabilities, ""),
        businessValue:           strOr(a && a.businessValue, ""),
        requiredAssets:          strOr(a && a.requiredAssets, ""),
        notes:                   strOr(a && a.notes, ""),
      };
    });

    // ── Story (manual fields) ──────────────────────────────────
    const story = parsed.story || (parsed.builderPlan && parsed.builderPlan.story) || {};
    Object.keys(state.story).forEach(function (k) {
      state.story[k] = strOr(story[k], state.story[k]);
    });

    // ── Script + scenes + assets ───────────────────────────────
    state.scriptText = strOr(parsed.scriptText, state.scriptText);
    state.scenes = ensureArray(parsed.scenes).map(function (s) {
      return {
        id:    strOr(s && s.id, uid("scene_")),
        label: strOr(s && s.label, ""),
        url:   strOr(s && s.url, ""),
      };
    });
    state.assets = ensureArray(parsed.assets).map(function (a) {
      return {
        id:             strOr(a && a.id, uid("asset_")),
        name:           strOr(a && a.name, ""),
        type:           strOr(a && a.type, ""),
        source:         strOr(a && a.source, ""),
        status:         strOr(a && a.status, "needed"),
        recommendedFor: arrOr(a && a.recommendedFor, []),
        notes:          strOr(a && a.notes, ""),
      };
    });
    // Step 7 asset library: a flat key → value (data URL or path) map.
    // Either at the top level or inside builderPlan from older exports.
    const libSrc = (parsed.assetLibrary && typeof parsed.assetLibrary === "object")
      ? parsed.assetLibrary
      : (parsed.builderPlan && parsed.builderPlan.assetLibrary) || {};
    state.assetLibrary = {};
    Object.keys(libSrc || {}).forEach(function (k) {
      const v = libSrc[k];
      if (typeof v === "string") state.assetLibrary[k] = v;
    });

    // ── Recommendations ────────────────────────────────────────
    state.recommendations = ensureArray(parsed.recommendations).map(function (r) {
      return {
        id:             strOr(r && r.id, uid("rec_")),
        title:          strOr(r && r.title, ""),
        type:           strOr(r && r.type, "slide"),
        layout:         strOr(r && r.layout, ""),
        capabilities:   arrOr(r && r.capabilities, []),
        priority:       numOr(r && r.priority, 60),
        rationale:      strOr(r && r.rationale, ""),
        sourceSignals:  arrOr(r && r.sourceSignals, []),
        requiredInputs: arrOr(r && r.requiredInputs, []),
        missingInputs:  arrOr(r && r.missingInputs, []),
        selected:       !!(r && r.selected),
      };
    });
    state.selectedRecIds = {};
    state.recommendations.forEach(function (r) { if (r.selected) state.selectedRecIds[r.id] = true; });

    // ── Slides ─────────────────────────────────────────────────
    // Prefer the rich array; fall back to a deckOutline if that's all
    // we have (legacy holodeck.config.js).
    const slidesSrc = parsed.slides
      || (parsed.builderPlan && parsed.builderPlan.slides)
      || (Array.isArray(parsed.deckOutline) ? parsed.deckOutline.map(deckOutlineToSlide) : []);
    state.slides = ensureArray(slidesSrc).map(function (s, i) {
      // Default missing layouts to "unknown" — never "executiveSummary".
      // That was the single biggest cause of duplicated previews.
      const layout = strOr(s && s.layout, "unknown");
      const sectionId = strOr(s && s.sectionId, layoutToSectionId(layout));
      return {
        id:                    strOr(s && s.id, uid("slide_")),
        title:                 strOr(s && s.title, "Slide " + (i + 1)),
        layout:                layout,
        sectionId:             sectionId,
        selected:              s && s.selected !== false,
        order:                 numOr(s && s.order, i),
        contentBlocks:         arrOr(s && s.contentBlocks, []),
        capabilities:          arrOr(s && s.capabilities, []),
        assets:                arrOr(s && s.assets, []),
        speakerNotes:          strOr(s && s.speakerNotes, ""),
        persona:               strOr(s && s.persona, null),
        selectionStatus:       strOr(s && s.selectionStatus, ""),
        selectionRationale:    strOr(s && s.selectionRationale, ""),
        readinessStatus:       strOr(s && s.readinessStatus, ""),
        missingInputs:         arrOr(s && s.missingInputs, []),
        linkedCxComponentIds:  arrOr(s && s.linkedCxComponentIds, []),
        deviceFrame:           strOr(s && s.deviceFrame, ""),
        fallbackLinks:         arrOr(s && s.fallbackLinks, []),
        subtitle:              strOr(s && s.subtitle, ""),
      };
    }).sort(function (a, b) { return (a.order || 0) - (b.order || 0); })
      .map(function (s, i) { s.order = i; return s; });

    // ── slideSections ──────────────────────────────────────────
    // If the import provides them, use them. Otherwise reconstruct
    // from the slide list's sectionIds.
    const sectionsSrc = parsed.slideSections
      || (parsed.builderPlan && parsed.builderPlan.slideSections)
      || [];
    state.slideSections = ensureArray(sectionsSrc).length
      ? ensureArray(sectionsSrc).map(function (s) {
          return {
            id:       strOr(s && s.id, ""),
            label:    strOr(s && s.label, ""),
            purpose:  strOr(s && s.purpose, ""),
            order:    numOr(s && s.order, 0),
            required: !!(s && s.required),
            slideIds: arrOr(s && s.slideIds, []),
            dynamicLabelTemplate: strOr(s && s.dynamicLabelTemplate, ""),
          };
        })
      : reconstructSectionsFromSlides(state.slides);

    // ── cxComponents ───────────────────────────────────────────
    const cxSrc = parsed.cxComponents
      || (parsed.builderPlan && parsed.builderPlan.cxComponents)
      || [];
    state.cxComponents = ensureArray(cxSrc).map(function (c) {
      return {
        id:                  strOr(c && c.id, uid("cx_")),
        name:                strOr(c && c.name, "(unnamed)"),
        url:                 sanitizeUrl(c && c.url),
        type:                strOr(c && c.type, "web"),
        sectionId:           strOr(c && c.sectionId, "demo"),
        linkedStoryActIds:   arrOr(c && c.linkedStoryActIds, []),
        linkedSlideIds:      arrOr(c && c.linkedSlideIds, []),
        deviceFrame:         strOr(c && c.deviceFrame, "desktop"),
        iframeAllowed:       c && c.iframeAllowed === false ? false : true,
        fallbackMode:        strOr(c && c.fallbackMode, "link-card"),
        notes:               strOr(c && c.notes, ""),
        status:              strOr(c && c.status, "ready"),
      };
    });

    // ── storyFoundations ───────────────────────────────────────
    const fSrc = parsed.storyFoundations
      || (parsed.builderPlan && parsed.builderPlan.storyFoundations)
      || null;
    if (fSrc && typeof fSrc === "object") {
      state.storyFoundations = {
        businessProblem:        strOr(fSrc.businessProblem, ""),
        currentStatePain:       strOr(fSrc.currentStatePain, ""),
        futureStateVision:      strOr(fSrc.futureStateVision, ""),
        primaryNarrative:       strOr(fSrc.primaryNarrative, ""),
        transformationThesis:   strOr(fSrc.transformationThesis, ""),
        executiveTakeaway:      strOr(fSrc.executiveTakeaway, ""),
        customerMoments:        arrOr(fSrc.customerMoments, []),
        operationalMoments:     arrOr(fSrc.operationalMoments, []),
        agentforceMoments:      arrOr(fSrc.agentforceMoments, []),
        dataCloudMoments:       arrOr(fSrc.dataCloudMoments, []),
        commerceMoments:        arrOr(fSrc.commerceMoments, []),
        marketingMoments:       arrOr(fSrc.marketingMoments, []),
        serviceMoments:         arrOr(fSrc.serviceMoments, []),
        loyaltyMoments:         arrOr(fSrc.loyaltyMoments, []),
        valueDrivers:           arrOr(fSrc.valueDrivers, []),
        assumptions:            arrOr(fSrc.assumptions, []),
        openQuestions:          arrOr(fSrc.openQuestions, []),
        bvsMetrics:             ensureArray(fSrc.bvsMetrics).map(function (m) {
          return { value: strOr(m && m.value, ""), label: strOr(m && m.label, "") };
        }),
      };
    }

    // ── Build notes ────────────────────────────────────────────
    state.buildNotes = ensureArray(parsed.buildNotes).map(function (n) {
      return typeof n === "string" ? n : (n && (n.text || n.note || JSON.stringify(n))) || "";
    }).filter(Boolean);

    // ── Bookkeeping ────────────────────────────────────────────
    state.name = strOr(state.name, state.project.customerName || "Imported project");
    state.updatedAt = new Date().toISOString();
    state.status = (STORE && STORE.derivedStatus) ? STORE.derivedStatus(state) : "Imported";

    // ── Friendly warnings ──────────────────────────────────────
    if (!state.project.customerName) warnings.push("No customer name found. Add one in Step 1.");
    if (!state.project.industry)     warnings.push("No industry — recommendations will be generic until you pick one.");
    if (!state.storyActs.length)     warnings.push("No story acts found. The journey timeline / demo map will be sparse.");
    if (!state.slides.length && !state.recommendations.length) {
      warnings.push("No slides or recommendations in the file. We'll regenerate suggestions from your inputs.");
    }
    if (!state.personas.length) warnings.push("No personas found. Add one so 'Meet the Persona' can be recommended.");
    const f = state.storyFoundations || {};
    if (!f.businessProblem && !state.story.bigProblem) {
      warnings.push("Story Foundations are incomplete: no business problem captured.");
    }
    if (!f.futureStateVision && !state.story.futureVision) {
      warnings.push("Story Foundations are incomplete: no future-state vision captured.");
    }

    return { state: state, errors: errors, warnings: warnings };
  }

  // ─── Helpers ──────────────────────────────────────────────────
  function uid(prefix) {
    if (STORE && STORE.uid) return STORE.uid(prefix);
    return (prefix || "id_") + Math.random().toString(36).slice(2, 9) + Date.now().toString(36);
  }
  function strOr() {
    for (let i = 0; i < arguments.length; i++) {
      const v = arguments[i];
      if (v != null && v !== "" && typeof v !== "object") return String(v);
      if (typeof v === "string" && v) return v;
    }
    return "";
  }
  function arrOr(v, fallback) { return Array.isArray(v) ? v.slice() : (fallback || []); }
  function numOr(v, fallback) { const n = Number(v); return isNaN(n) ? fallback : n; }
  function colorOr(v, fallback) {
    if (typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v.trim())) return v.trim();
    return fallback;
  }
  function ensureArray(v) { return Array.isArray(v) ? v : []; }
  function deckOutlineToSlide(o, i) {
    return {
      id: "slide_" + (i + 1),
      title: o && o.note ? o.note : "Slide " + (i + 1),
      layout: holodeckTypeToLayout(o && o.type) || "executiveSummary",
      order: i,
    };
  }
  function layoutToSectionId(layout) {
    if (global.HOLO_RULES && global.HOLO_RULES.layoutToSectionId) {
      return global.HOLO_RULES.layoutToSectionId(layout);
    }
    // Inline fallback for the case where rules haven't loaded yet.
    return ({
      hero: "intro", storyFoundation: "intro", currentFutureState: "intro", futureState: "intro",
      journeyTimeline: "journey-map", demoMap: "journey-map",
      personaCard: "meet-persona",
      unifiedProfile: "demo", agentConversation: "demo", deviceMoment: "demo",
      embeddedCxComponent: "demo", architecture: "demo",
      kpiScorecard: "business-value", executiveSummary: "business-value", nextSteps: "business-value",
    })[layout] || "demo";
  }
  function reconstructSectionsFromSlides(slides) {
    const SECTIONS = (global.HOLO_RULES && global.HOLO_RULES.SLIDE_SECTIONS) || [
      { id: "intro",         label: "Intro",         order: 1, required: true,  purpose: "" },
      { id: "journey-map",   label: "Journey Map",   order: 2, required: true,  purpose: "" },
      { id: "meet-persona",  label: "Meet the Persona", order: 3, required: true, purpose: "", dynamicLabelTemplate: "Meet {primaryPersonaFirstName}" },
      { id: "demo",          label: "Demo",          order: 4, required: true,  purpose: "" },
      { id: "business-value",label: "Business Value", order: 5, required: true, purpose: "" },
    ];
    return SECTIONS.map(function (s) {
      return {
        id: s.id, label: s.label, purpose: s.purpose, order: s.order, required: s.required,
        dynamicLabelTemplate: s.dynamicLabelTemplate || "",
        slideIds: slides.filter(function (sl) { return sl.sectionId === s.id; }).map(function (sl) { return sl.id; }),
      };
    });
  }
  function sanitizeUrl(u) {
    if (!u || typeof u !== "string") return "";
    const trimmed = u.trim();
    try {
      const parsed = new URL(trimmed);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return "";
      return parsed.toString();
    } catch (e) { return ""; }
  }
  function holodeckTypeToLayout(t) {
    return ({
      "title": "hero",
      "two-panel": "deviceMoment",
      "multi-state": "deviceMoment",
      "timeline": "journeyTimeline",
      "iframe-phone": "deviceMoment",
      "iframe-laptop": "embeddedCxComponent",
      "stat-grid": "kpiScorecard",
      "capability-grid": "architecture",
      "bridge": "executiveSummary",
      "fireworks": "executiveSummary",
    })[t] || null;
  }
  function minimalBlank() {
    // Used only if HOLO_STORE didn't load — we still want to import.
    return {
      id: uid(),
      name: "Imported project",
      project: { customerName: "", website: "", industry: "", audience: "", salesStage: "", products: [], theme: "", tone: "", presenterName: "", presenterTitle: "" },
      brand: { logoPath: "", primaryColor: "#b22234", secondaryColor: "#1a5fa0", accentColor: "#f5c06a", visualDirection: "", notes: "" },
      story: { bigProblem: "", currentPain: "", futureVision: "", keyCustomerMoments: "", operationalMoments: "", agentforceMoments: "", dataCloudMoments: "", businessValueMoments: "", executiveTakeaway: "" },
      personas: [], storyActs: [], scriptText: "", storyMode: "manual",
      scenes: [], assets: [], assetLibrary: {}, recommendations: [],
      selectedRecIds: {}, customRecTitles: {}, slides: [], buildNotes: [],
    };
  }

  global.HOLO_VALIDATOR = {
    importConfig: importConfig,
  };
})(window);
