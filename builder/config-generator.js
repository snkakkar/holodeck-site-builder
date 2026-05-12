// ════════════════════════════════════════════════════════════════
//  CONFIG GENERATOR
//  Translates the builder's internal state into:
//    • A clean Holodeck builder JSON snapshot (portable)
//    • A holodeck.config.js stub aligned with Zone 1 of the existing
//      demo/holodeck.config.js (so Claude can fill in Zone 2 next)
//
//  Also handles importing either format back into the builder.
// ════════════════════════════════════════════════════════════════

(function (global) {
  "use strict";

  // ─── Build the portable snapshot (the rich object the builder
  //     uses internally and that round-trips on import) ───────────
  function buildSnapshot(state) {
    return {
      version: 2,
      generatedAt: new Date().toISOString(),
      project: state.project || {},
      brand:   state.brand   || {},
      personas: state.personas || [],
      storyActs: state.storyActs || [],
      story: state.story || {},
      storyFoundations: state.storyFoundations || {},
      scriptText: state.scriptText || "",
      scenes: state.scenes || [],
      cxComponents: state.cxComponents || [],
      slideSections: state.slideSections || [],
      recommendations: (state.recommendations || []).map(function (r) {
        return {
          id: r.id, title: r.title, type: r.type, layout: r.layout,
          sectionId: r.sectionId || "",
          selectionStatus: r.selectionStatus || "",
          capabilities: r.capabilities, priority: r.priority,
          rationale: r.rationale, sourceSignals: r.sourceSignals,
          missingInputs: r.missingInputs, selected: !!r.selected,
        };
      }),
      slides: (state.slides || []).map(function (s, i) {
        return {
          id: s.id, title: s.title, layout: s.layout, order: i,
          sectionId: s.sectionId || "",
          selectionStatus: s.selectionStatus || "",
          selectionRationale: s.selectionRationale || "",
          readinessStatus: s.readinessStatus || "",
          capabilities: s.capabilities || [], assets: s.assets || [],
          contentBlocks: s.contentBlocks || [], speakerNotes: s.speakerNotes || "",
          persona: s.persona || null,
          linkedCxComponentIds: s.linkedCxComponentIds || [],
          deviceFrame: s.deviceFrame || "",
        };
      }),
      assets: state.assets || [],
      buildNotes: buildOpenItems(state),
    };
  }

  // ─── Open / pre-live items derived from the snapshot ───────────
  function buildOpenItems(state) {
    const items = [];
    if (!state.project || !state.project.customerName) items.push("Add customer name");
    if (!state.brand   || !state.brand.primaryColor)   items.push("Confirm primary brand color");
    if (!state.brand   || !state.brand.logoPath)       items.push("Drop customer logo into demo/assets/ and set brand.logoPath");
    if (!state.personas || !state.personas.length)     items.push("Add at least one persona");
    if (!state.storyActs || !state.storyActs.length)   items.push("Outline at least 2–3 story acts");
    items.push("Replace XX% / +$XX BVS placeholders with approved values");
    items.push("Confirm all live scene URLs load before presenting");
    return items;
  }

  // ─── Map selected builder slides to Holodeck deckOutline + slide
  //     stubs that the existing renderer accepts. We only fill what
  //     we know — Claude's Zone 2 pass will flesh out copy. ──────
  function buildDeckOutline(state) {
    const layoutToType = (global.HOLO_RULES && global.HOLO_RULES.LAYOUT_TO_SLIDE_TYPE) || {};
    return (state.slides || []).map(function (s) {
      const type = layoutToType[s.layout] || "two-panel";
      const note = s.title + (s.speakerNotes ? " — " + s.speakerNotes : "");
      return { type: type, note: note };
    });
  }

  function buildScenes(state) {
    if (state.scenes && state.scenes.length) return state.scenes;
    // Reasonable empty starter aligned with the existing template.
    return [
      { id: "instagramAd", label: "Instagram Ad",        url: "[TODO: paste /frame URL from aubreydemo.com]" },
      { id: "agenticSms",  label: "Agentic SMS",         url: "[TODO: paste /frame URL from aubreydemo.com]" },
      { id: "shopperAgent",label: "Shopper Agent",       url: "[TODO: paste /frame URL from aubreydemo.com]" },
    ];
  }

  function buildBvsMetrics(state) {
    if (state.bvsMetrics && state.bvsMetrics.length) return state.bvsMetrics;
    return [
      { icon: "↑",  value: "XX%",  label: "Conversion Lift"     },
      { icon: "💳", value: "+$XX", label: "Average Order Value"  },
      { icon: "★",  value: "XX%",  label: "Loyalty Enrollment"   },
      { icon: "🔄", value: "XXx",  label: "Repeat Purchase Rate" },
      { icon: "⚡", value: "XX%",  label: "Service Efficiency"   },
    ];
  }

  // ─── Build the object that becomes window.HOLODECK_CONFIG. ────
  function buildHolodeckConfig(state) {
    const project = state.project || {};
    const brand   = state.brand   || {};
    return {
      customer: {
        name:        project.customerName || "[Customer Name]",
        nameDisplay: (project.customerName || "Customer").toUpperCase(),
        website:     project.website  || "",
        industry:    project.industry || "",
      },
      presenter: {
        name:    project.presenterName  || "[PRESENTER NAME]",
        title:   project.presenterTitle || "[TITLE]",
        company: "Salesforce",
      },
      brand: {
        logoPath:       brand.logoPath || null,
        primaryColor:   brand.primaryColor   || "#b22234",
        secondaryColor: brand.secondaryColor || "#1a5fa0",
        accentColor:    brand.accentColor    || "#f5c06a",
        navyColor:      "#0d1b2e",
        bgColor:        "#f5f7ff",
        fontHeading:    "'Playfair Display', Georgia, serif",
        fontBody:       "'Inter', -apple-system, sans-serif",
        googleFontsUrl: "https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,700;1,400;1,600&family=Inter:wght@300;400;500;600;700;800&display=swap",
      },
      scenes: buildScenes(state),
      deckOutline: buildDeckOutline(state),
      bvs: {
        disclaimer: "Replace placeholders with BVS-approved values before presenting externally.",
        metrics: buildBvsMetrics(state),
      },
      // Builder-generated planning context — Claude reads this when
      // filling in Zone 2 (persona, journey, slides, etc.).
      builderPlan: {
        audience:   project.audience   || "",
        salesStage: project.salesStage || "",
        products:   project.products   || [],
        tone:       project.tone       || "",
        theme:      project.theme      || "",
        story:            state.story            || {},
        storyFoundations: state.storyFoundations || {},
        personas:         state.personas         || [],
        storyActs:        state.storyActs        || [],
        cxComponents:     (state.cxComponents || []).map(function (c) {
          return {
            id: c.id, name: c.name, url: c.url, type: c.type, sectionId: c.sectionId,
            linkedStoryActIds: c.linkedStoryActIds || [],
            linkedSlideIds:    c.linkedSlideIds    || [],
            deviceFrame: c.deviceFrame, iframeAllowed: c.iframeAllowed !== false,
            fallbackMode: c.fallbackMode, status: c.status, notes: c.notes,
          };
        }),
        slideSections:    state.slideSections || [],
        slides:     (state.slides || []).map(function (s, i) {
          return {
            order: i + 1, id: s.id, title: s.title, layout: s.layout,
            sectionId: s.sectionId || layoutSection(s.layout),
            selectionStatus: s.selectionStatus || "",
            selectionRationale: s.selectionRationale || "",
            readinessStatus: s.readinessStatus || "",
            capabilities: s.capabilities || [], persona: s.persona || null,
            linkedCxComponentIds: s.linkedCxComponentIds || [],
            deviceFrame: s.deviceFrame || "",
            speakerNotes: s.speakerNotes || "",
            missingInputs: s.missingInputs || [],
          };
        }),
      },
    };
  }

  function layoutSection(layout) {
    if (global.HOLO_RULES && global.HOLO_RULES.layoutToSectionId) {
      return global.HOLO_RULES.layoutToSectionId(layout);
    }
    return ({
      hero: "intro", storyFoundation: "intro", currentFutureState: "intro", futureState: "intro",
      journeyTimeline: "journey-map", demoMap: "journey-map",
      personaCard: "meet-persona",
      unifiedProfile: "demo", agentConversation: "demo", deviceMoment: "demo",
      embeddedCxComponent: "demo", architecture: "demo",
      kpiScorecard: "business-value", executiveSummary: "business-value", nextSteps: "business-value",
    })[layout] || "demo";
  }

  // ─── Serialize to a JS file the existing renderer can load ────
  function toHolodeckConfigJs(state) {
    const cfg = buildHolodeckConfig(state);
    const banner = [
      "// ════════════════════════════════════════════════════════════════",
      "//  HOLODECK CONFIG — generated by builder/index.html",
      "//  Generated: " + new Date().toISOString(),
      "//",
      "//  This file is the SE's authored Zone 1 + a builderPlan block.",
      "//  Hand it to Claude with the project zip and demo script to",
      "//  generate Zone 2 (persona, journey, slides, technologies,",
      "//  orbit, vignettes). Then drop the full result into",
      "//  demo/holodeck.config.js.",
      "// ════════════════════════════════════════════════════════════════",
      "",
      "window.HOLODECK_CONFIG = " + stringifyJs(cfg, 2) + ";",
      "",
    ].join("\n");
    return banner;
  }

  function toJsonString(state) {
    return JSON.stringify(buildSnapshot(state), null, 2);
  }

  // ─── Pretty-print a JS object literal (preserving key order,
  //     unquoted identifier keys, single-line short objects) ─────
  function stringifyJs(value, indent) {
    indent = indent || 2;
    return walk(value, 0);

    function walk(v, depth) {
      if (v === null) return "null";
      if (v === undefined) return "null";
      const t = typeof v;
      if (t === "string") return JSON.stringify(v);
      if (t === "number" || t === "boolean") return String(v);
      if (Array.isArray(v)) return arr(v, depth);
      if (t === "object") return obj(v, depth);
      return JSON.stringify(v);
    }

    function pad(d) { return " ".repeat(d * indent); }

    function arr(a, depth) {
      if (a.length === 0) return "[]";
      const inner = a.map(function (item) { return pad(depth + 1) + walk(item, depth + 1); }).join(",\n");
      return "[\n" + inner + "\n" + pad(depth) + "]";
    }

    function obj(o, depth) {
      const keys = Object.keys(o);
      if (keys.length === 0) return "{}";
      const inner = keys.map(function (k) {
        const safe = /^[A-Za-z_$][\w$]*$/.test(k) ? k : JSON.stringify(k);
        return pad(depth + 1) + safe + ": " + walk(o[k], depth + 1);
      }).join(",\n");
      return "{\n" + inner + ",\n" + pad(depth) + "}";
    }
  }

  // ─── Download helpers ─────────────────────────────────────────
  function downloadFile(name, content, mime) {
    const blob = new Blob([content], { type: mime || "text/plain" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url; a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 250);
  }

  function copyToClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text);
    }
    return new Promise(function (resolve, reject) {
      try {
        const ta = document.createElement("textarea");
        ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
        document.body.appendChild(ta); ta.select();
        document.execCommand("copy");
        ta.remove();
        resolve();
      } catch (e) { reject(e); }
    });
  }

  global.HOLO_CONFIG = {
    buildSnapshot: buildSnapshot,
    buildHolodeckConfig: buildHolodeckConfig,
    toHolodeckConfigJs: toHolodeckConfigJs,
    toJsonString: toJsonString,
    downloadFile: downloadFile,
    copyToClipboard: copyToClipboard,
  };
})(window);
