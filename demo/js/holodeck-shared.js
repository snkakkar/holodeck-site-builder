// ════════════════════════════════════════════════════════════════
//  holodeck-shared.js
//  Pure copy-generators that BOTH the export adapter
//  (holodeck-adapter.js) and the in-builder preview
//  (preview-renderer.js) read from. This is the single source of
//  truth for any text that appears in the polished /demo template.
//
//  Rule: nothing in here touches the DOM, the network, or
//  side-effecty state. Inputs are plain state shapes, outputs are
//  plain strings or plain-object descriptors. Both consumers wrap
//  these in their own renderers (innerHTML for export, DOM nodes
//  for preview).
//
//  When the polished template changes a default copy line, change
//  it HERE — both code paths pick it up automatically.
// ════════════════════════════════════════════════════════════════
(function (global) {
  "use strict";

  // ─── Text helpers ─────────────────────────────────────────────
  function truncate(s, max) {
    if (!s) return "";
    s = String(s).replace(/\s+/g, " ").trim();
    if (s.length <= max) return s;
    return s.slice(0, max - 1).replace(/\s+\S*$/, "") + "…";
  }
  function cleanHeadline(s, max) {
    s = String(s || "").replace(/\s+/g, " ").trim();
    if (s.length > max) s = s.slice(0, max - 1).replace(/\s+\S*$/, "") + "…";
    return s;
  }
  function oneSentence(s, max) {
    s = String(s || "").replace(/\s+/g, " ").trim();
    if (!s) return "";
    const m = s.match(/^[^.!?]+[.!?]/);
    let out = m ? m[0].trim() : s;
    if (out.length > max) out = out.slice(0, max - 1).replace(/\s+\S*$/, "") + "…";
    return out;
  }
  function shortenTitle(s) {
    s = String(s || "").replace(/\s+/g, " ").trim();
    if (s.length > 22) s = s.slice(0, 22).replace(/\s+\S*$/, "");
    return s;
  }
  function isHeaderTitle(t) {
    return !t || /^(intro|opening|open|chapter\s|section\s|close|closing)/i.test(t);
  }
  function titleCase(s) {
    return String(s || "").replace(/\b\w/g, function (c) { return c.toUpperCase(); });
  }
  function shortenDriverLabel(s) {
    s = String(s || "").replace(/\s+/g, " ").trim();
    const m = s.match(/^(?:higher|increased|improved|reduced|faster)\s+([\w\s\/]+?)(\s+through|\s+via|\s+from|$)/i);
    if (m) return titleCase(m[1].trim());
    return titleCase(s.split(/[.;]/)[0].slice(0, 32));
  }

  // ─── Pronouns ─────────────────────────────────────────────────
  // Default to she/her for legacy back-compat. SE picks he/him or
  // they/them on Step 4 / 7 when it doesn't fit the persona.
  function pronounsFor(value) {
    const v = String(value || "").toLowerCase();
    if (v === "he/him")    return { subj: "His",   obj: "him",  poss: "his",   nom: "he"   };
    if (v === "they/them") return { subj: "Their", obj: "them", poss: "their", nom: "they" };
    return                        { subj: "Her",   obj: "her",  poss: "her",   nom: "she"  };
  }
  // Wishlist headline default. Adapter wraps "Picked just for X" in
  // <strong>; preview renders plain text. Both call this to pick the
  // pronoun-aware default.
  function wishlistHeadlineFor(pron, opts) {
    const wrapStrong = !!(opts && opts.wrapStrong);
    const tail = "Picked just for " + pron.obj + ".";
    return pron.subj + " top 3. " + (wrapStrong ? "<strong>" + tail + "</strong>" : tail);
  }
  function isLegacyWishlistHeadline(s) {
    return /^(?:Her|His|Their)\s+top\s+3\.\s*(?:<strong>)?Picked just for (?:her|him|them)\.(?:<\/strong>)?$/i
      .test(String(s || "").trim());
  }

  // ─── Stance (drives intro hero + story hook copy) ─────────────
  // Bias headline tone toward whichever foundation moments the SE
  // emphasized in Step 2/3.
  function pickStance(f) {
    f = f || {};
    if (f.agentforceMoments && f.agentforceMoments.length) {
      return { key: "agentforce", before: "reimagined as one", accent: "agentic", after: "journey" };
    }
    if (f.dataCloudMoments && f.dataCloudMoments.length) {
      return { key: "dataCloud", before: "powered by a", accent: "unified", after: "customer profile" };
    }
    if (f.commerceMoments && f.commerceMoments.length) {
      return { key: "commerce", before: "a", accent: "personalized", after: "shopper journey" };
    }
    return { key: "default", before: "a", accent: "connected", after: "customer journey" };
  }
  // Hero (vi-1): adapter wants <em>accent</em> in HTML; preview
  // wants plain text. Returns parts so both can compose.
  function heroHeadlineParts(name, f) {
    f = f || {};
    const stance = pickStance(f);
    return {
      name:   name || "Customer",
      before: stance.before,
      accent: stance.accent,
      after:  stance.after,
      // SE override (vi-1 "Headline" editor field). When set, both the
      // preview and the export use it verbatim instead of the composed
      // stance line. Blank = auto-derived (the parts above).
      override: (f.heroHeadlineOverride && String(f.heroHeadlineOverride).trim()) || "",
    };
  }
  // The auto-derived hero headline as a plain string (used as the editor
  // placeholder so the SE sees the default without it being persisted).
  function heroHeadlineDefault(name, f) {
    const p = heroHeadlineParts(name, f);
    return p.name + ", " + p.before + " " + p.accent + " " + p.after + ".";
  }
  // Story hook (vi-2): adapter wants <br/> and <em>; preview wants
  // a single plain line. Returns the hook text in two forms.
  function storyHookParts(f) {
    f = f || {};
    const stance = pickStance(f);
    const map = {
      agentforce: { lead: "From a single signal", emph: "agentic", tail: "to an", suffix: "journey." },
      dataCloud:  { lead: "From scattered signals", emph: "unified", tail: "to a", suffix: "profile." },
      commerce:   { lead: "From browse to buy,", emph: "personalized", tail: "", suffix: "end to end." },
      default:    { lead: "From a single moment", emph: "lifetime", tail: "to a", suffix: "of relevance." },
    };
    // SE override (vi-2 "Headline" editor field) — verbatim when set.
    const override = (f.storyHookOverride && String(f.storyHookOverride).trim()) || "";
    return Object.assign({ stance: stance.key, override: override }, map[stance.key] || map.default);
  }
  // Auto-derived story-hook headline as a plain string (editor placeholder).
  function storyHookDefault(f) {
    const h = storyHookParts(f);
    const tail = h.tail ? h.tail + " " : "";
    return h.lead + " " + tail + h.emph + " " + h.suffix;
  }
  function storyHookSubText(f) {
    f = f || {};
    if (f.businessProblem)  return truncate(f.businessProblem, 280);
    if (f.primaryNarrative) return truncate(f.primaryNarrative, 280);
    return "Every interaction builds context. Every context makes the next experience more personal.";
  }

  // ─── Three-acts (vi-3) overview ───────────────────────────────
  // Act titles are overridable via storyFoundations.threeActTitles[i]
  // (editor "Act N title"); descriptions come 1:1 from the moments arrays.
  function threeActsFor(f) {
    f = f || {};
    const tOv = Array.isArray(f.threeActTitles) ? f.threeActTitles : [];
    function actTitle(i, def) { return (tOv[i] && String(tOv[i]).trim()) || def; }
    return [
      {
        title: actTitle(0, "Know & Reach"),
        description: (f.dataCloudMoments && f.dataCloudMoments[0])
          || "Data Cloud unifies the customer's signals across channels — a foundation for every downstream moment.",
        tags: ["Data Cloud", "Email", "Paid Media", "Anonymous → Known"],
      },
      {
        title: actTitle(1, "Engage & Recover"),
        description: (f.commerceMoments && f.commerceMoments[0])
          || (f.marketingMoments && f.marketingMoments[0])
          || "Personalized engagement adapts to the customer's intent in real time. Proactive re-engagement closes near-misses.",
        tags: ["Commerce", "AI Search", "Agentic SMS", "MCP"],
      },
      {
        title: actTitle(2, "Convert"),
        description: (f.agentforceMoments && f.agentforceMoments[0])
          || (f.serviceMoments && f.serviceMoments[0])
          || "An agentic moment closes the loop with the customer.",
        tags: ["Agentforce", "Commerce", "Clicks not code", "GA today"],
      },
    ];
  }

  // ─── Intro vignettes (vi-4..6) ────────────────────────────────
  // Each vignette's subtitle comes 1:1 from ONE moments field (matching
  // the runtimeIndex). Eyebrow/title are overridable via
  // storyFoundations.vignetteEyebrows[i] / vignetteTitles[i]. vi-5 eyebrow
  // fixed to "MARKETING CLOUD" so it matches its source (marketingMoments).
  function vignettesFor(f) {
    f = f || {};
    const eOv = Array.isArray(f.vignetteEyebrows) ? f.vignetteEyebrows : [];
    const vtOv = Array.isArray(f.vignetteTitles) ? f.vignetteTitles : [];
    function ov(arr, i, def) { return (arr[i] && String(arr[i]).trim()) || def; }
    return [
      {
        eyebrow:  ov(eOv, 0, "DATA CLOUD · MARKETING CLOUD"),
        title:    ov(vtOv, 0, "Know & Reach"),
        subtitle: f.dataCloudMoments && f.dataCloudMoments.length
          ? truncate(f.dataCloudMoments[0], 220)
          : "Identity, signals, and segments power every downstream touchpoint.",
      },
      {
        eyebrow:  ov(eOv, 1, "MARKETING CLOUD"),
        title:    ov(vtOv, 1, "Engage & Recover"),
        subtitle: f.marketingMoments && f.marketingMoments.length
          ? truncate(f.marketingMoments[0], 220)
          : "Personalized engagement, then proactive recovery when the customer drops off.",
      },
      {
        eyebrow:  ov(eOv, 2, "AGENTFORCE"),
        title:    ov(vtOv, 2, "Convert"),
        subtitle: f.agentforceMoments && f.agentforceMoments.length
          ? truncate(f.agentforceMoments[0], 220)
          : "One conversation. Full cart. Closed loop. Then post-purchase nurture extends the relationship.",
      },
    ];
  }

  // ─── Journey map (5-phase bucket) ─────────────────────────────
  // Single source for the polished template's circle phases and the
  // preview's matrix. `acts` is state.storyActs (or the equivalent).
  const PHASE_TITLES = ["Know", "Reach", "Engage", "Recover", "Convert"];
  const PHASE_EMOJIS = ["🏪", "📸", "🛍️", "💬", "🤖"];
  const PHASE_CIRCLE_CLASSES = ["circle-anticipate", "circle-engage", "circle-guide", "circle-convert", "circle-delight"];
  function phaseDescription(t) {
    return ({
      "Know":    "Identity captured; the journey begins from a single moment.",
      "Reach":   "Targeted, personalized outreach finds the customer where they already are.",
      "Engage":  "Personalized content adapts to the customer's intent in real time.",
      "Recover": "Proactive re-engagement turns a near-miss into a relationship.",
      "Convert": "An agentic moment closes the loop — purchase, service, or loyalty.",
    })[t] || "Salesforce powers a connected moment.";
  }
  function bucketActsIntoFive(acts, prods) {
    prods = prods || [];
    const milestones = (acts || []).filter(function (a) {
      return a && a.summary && !isHeaderTitle(a.title);
    });
    const out = [];
    for (let i = 0; i < 5; i++) {
      const a = milestones[i];
      out.push({
        index:        i,
        title:        a && a.title ? shortenTitle(a.title) : PHASE_TITLES[i],
        phaseTitle:   PHASE_TITLES[i],
        badge:        a && a.salesforceCapabilities ? truncate(a.salesforceCapabilities, 36) : (prods[i] || "Salesforce"),
        emoji:        PHASE_EMOJIS[i],
        circleClass:  PHASE_CIRCLE_CLASSES[i],
        description:  a && a.summary ? truncate(a.summary, 200) : phaseDescription(PHASE_TITLES[i]),
        descriptionShort: a && a.summary ? truncate(a.summary, 110) : phaseDescription(PHASE_TITLES[i]),
        detail:       a && (a.notes || a.summary) ? truncate((a.notes || "") + " " + (a.summary || ""), 280)
                        : phaseDescription(PHASE_TITLES[i]) + " [TODO: enrich with customer-specific detail]",
        technologies: a && a.salesforceCapabilities
          ? a.salesforceCapabilities.split(/[,/·•]/).map(function (s) { return s.trim(); }).filter(Boolean)
          : (prods.slice(0, 2).length ? prods.slice(0, 2) : ["Data Cloud"]),
      });
    }
    return out;
  }

  // ─── Orbit nodes (bv-2) ───────────────────────────────────────
  // 6-slot orbit visualization. Last-wins layering matches BVS:
  //   1. Hardcoded defaults so the slide always renders something.
  //   2. Product-derived labels (Marketing/Commerce/Agentforce).
  //   3. SE overrides (storyFoundations.orbitNodes[i].{icon,label}).
  // Returns the full 6-node array with icon/label/r/startDeg/dur/dir
  // already filled in — same shape the polished /demo template
  // (orbitNodes in HOLODECK_CONFIG) consumes.
  function buildOrbitNodes(f, prods) {
    f = f || {};
    prods = prods || [];
    const overrides = Array.isArray(f.orbitNodes) ? f.orbitNodes : [];
    const seedIcons = ["📸", "🔍", "💬", "🤖", "🛒", "📧"];
    const productLabels = [];
    if (prods.indexOf("Marketing Cloud") >= 0) productLabels.push("Personalized Ad");
    if (prods.indexOf("Commerce") >= 0)         productLabels.push("AI-Powered Search");
    if (prods.indexOf("Marketing Cloud") >= 0) productLabels.push("SMS Re-engagement");
    if (prods.indexOf("Agentforce") >= 0)       productLabels.push("Shopper Agent");
    if (prods.indexOf("Commerce") >= 0)         productLabels.push("Commerce");
    if (prods.indexOf("Marketing Cloud") >= 0) productLabels.push("Post-Purchase Email");
    const fallbackLabels = ["Personalized Ad", "AI-Powered Search", "SMS Re-engagement",
                            "Shopper Agent", "Commerce", "Post-Purchase Email"];
    const out = [];
    for (let i = 0; i < 6; i++) {
      const ov = overrides[i] || {};
      const ovIcon  = ov.icon  && String(ov.icon).trim();
      const ovLabel = ov.label && String(ov.label).trim();
      const label = ovLabel || productLabels[i] || fallbackLabels[i];
      out.push({
        icon:     ovIcon || seedIcons[i] || "•",
        label:    label,
        r:        i < 3 ? 210 : 120,
        startDeg: (i * 60) % 360,
        dur:      200,
        dir:      i < 3 ? 1 : -1,
      });
    }
    return out;
  }

  // ─── Capabilities (bv-3 recap) ────────────────────────────────
  // Up-to-6 capability cards. Layering:
  //   1. Hardcoded defaults if no products.
  //   2. Product-derived (label = product, description from map).
  //   3. SE overrides (storyFoundations.capabilities[i].{label,description}).
  function buildCapabilities(f, prods) {
    f = f || {};
    prods = prods || [];
    const overrides = Array.isArray(f.capabilities) ? f.capabilities : [];
    const descMap = {
      "Data Cloud":      "Unified customer data across every channel and signal.",
      "Agentforce":      "Conversational AI agents that ground answers in customer context and close the loop.",
      "Sales Cloud":     "Pipeline, accounts, and deal-team workflows in one platform.",
      "Service Cloud":   "Case management with AI-assisted resolution and proactive service.",
      "Marketing Cloud": "Personalized SMS, email, and journeys triggered by real-time signals.",
      "Commerce":        "Personalized storefront with AI-powered search built in.",
      "Loyalty":         "Tier-based programs that drive repeat purchase and lifetime value.",
      "MuleSoft":        "Integration across systems of record without ripping and replacing.",
      "Tableau":         "Embedded analytics that make every conversation data-grounded.",
    };
    const baseList = prods.length
      ? prods.map(function (p) { return { label: p, description: descMap[p] || "[TODO: " + p + " value statement]" }; })
      : [
          { label: "Data Cloud",      description: descMap["Data Cloud"] },
          { label: "Agentforce",      description: descMap["Agentforce"] },
          { label: "Commerce",        description: descMap["Commerce"] },
          { label: "Marketing Cloud", description: descMap["Marketing Cloud"] },
        ];
    const slots = Math.max(baseList.length, overrides.length);
    const out = [];
    for (let i = 0; i < slots; i++) {
      const base = baseList[i] || { label: "", description: "" };
      const ov   = overrides[i] || {};
      const label = (ov.label && String(ov.label).trim()) || base.label;
      const desc  = (ov.description && String(ov.description).trim()) || base.description
                  || (label ? "[TODO: " + label + " value statement]" : "");
      if (!label && !desc) continue;
      out.push({ label: label, description: desc });
    }
    return out;
  }

  // ─── BVS metrics (bv-4 scorecard) ─────────────────────────────
  // Three layers, last-wins:
  //   1. Hardcoded defaults (XX% / +$XX) so the slide always renders.
  //   2. Driver-derived label (from storyFoundations.valueDrivers).
  //   3. SE overrides (storyFoundations.bvsMetrics[i].{value,label})
  //      set via Step 7's pending-text editor.
  function buildBvsMetrics(f) {
    f = f || {};
    const icons    = ["↑", "💳", "★", "🔄", "⚡"];
    const drivers  = (f.valueDrivers || []).slice(0, 5);
    const overrides = Array.isArray(f.bvsMetrics) ? f.bvsMetrics : [];
    const fallback = [
      { value: "XX%",  label: "Conversion Lift"      },
      { value: "+$XX", label: "Average Order Value"  },
      { value: "XX%",  label: "Loyalty Enrollment"   },
      { value: "XXx",  label: "Repeat Purchase Rate" },
      { value: "XX%",  label: "Service Efficiency"   },
    ];
    return fallback.map(function (def, i) {
      const driverLabel = drivers[i] ? shortenDriverLabel(drivers[i]) : "";
      const ov = overrides[i] || {};
      return {
        icon:  icons[i] || "→",
        value: (ov.value && String(ov.value).trim()) || (drivers[i] ? "[TODO: %]" : def.value),
        label: (ov.label && String(ov.label).trim()) || driverLabel || def.label,
      };
    });
  }

  // ─── Persona CTA / intro (mr-1, mr-4) ─────────────────────────
  function personaFirstName(p) {
    if (!p) return "";
    return (p.name || "").trim().split(/\s+/)[0] || "";
  }
  function personaCtaCopy(p, story, f) {
    p = p || {};
    story = story || {};
    f = f || {};
    const first = personaFirstName(p);
    // CTA button label is SE-overridable (mr-4 "CTA button label").
    const labelOverride = (f.personaCtaLabel && String(f.personaCtaLabel).trim()) || "";
    return {
      label:    labelOverride || "BEGIN THE JOURNEY &nbsp;→",
      headline: first ? "Let's follow " + first + "'s journey." : "Let's follow the journey.",
      sub:      truncate(p.demoRelevance || story.futureVision || "From inspiration to purchase to loyalty.", 110),
    };
  }
  function personaIntroSub(p, customerName) {
    p = p || {};
    const arc = p.demoRelevance || p.goals || "[TODO: one-line journey arc]";
    return (customerName || "Customer") + " · " + truncate(arc, 110);
  }

  // ─── Chapter opener (auto-prepended demo slide) ───────────────
  // Mirrors demo-deck-renderer.js defaultOpenerSub() so the preview
  // shows the same "<timing>. A <Customer> store. <Persona>'s story
  // begins." line the export will produce.
  function chapterOpenerCopy(opts) {
    opts = opts || {};
    const customer = opts.customerName || "";
    const persona  = opts.persona || null;
    const acts     = opts.acts || [];
    const theme    = opts.theme || "";
    const eyebrow  = theme || (opts.demoTitle && String(opts.demoTitle).trim()) || "Customer Demo";
    const headline = "Every relationship begins with a single moment.";
    const personaName = (persona && persona.name && persona.name.trim())
      || (persona ? pronounsFor(persona.pronouns).obj : "your customer");
    const when  = (acts[0] && acts[0].timing) || "December";
    const place = customer ? customer + " store" : "this story";
    return {
      eyebrow:  eyebrow,
      headline: headline,
      sub:      when + ". A " + place + ". " + personaName + "'s story begins.",
    };
  }

  // ─── Slide manifest (Step 8 preview must equal the export) ────
  // Returns the EXACT ordered slide list the polished /demo template
  // renders at runtime, given the current builder state. Used by:
  //   - preview-renderer.js : enumerateRuntimeSlides() wrapper for
  //                           in-builder Step 8 thumbnails.
  //   - holodeck-adapter.js : matches what /demo's renderer will emit
  //                           after export (intro + journey + persona
  //                           + chapter-opener + demo + BV).
  //
  // Order MUST match demo-holodeck-unified.html nav (Intro → Journey
  // Map → Meet Persona → Demo → BV). Demo SE-authored slides are the
  // only variable; everything else is fixed scaffold.
  function buildSlideManifest(state) {
    state = state || {};
    const out = [];
    function add(entry) {
      out.push(Object.assign({ assets: [], capabilities: [] }, entry));
    }

    // INTRO ─ vi-1 hero, vi-2 hook, vi-3 three-acts, vi-4..6 vignettes
    add({ id: "_rt_intro_hero", synthetic: true, sectionId: "intro",
          layout: "introHero", title: "Customer hero (vi-1)",
          editorPaths: {
            // Headline override — blank = auto-derived stance line (shown
            // as the placeholder). Both preview and export honor it.
            "Headline":      { path: "storyFoundations.heroHeadlineOverride",
                               placeholder: function (sl, st) {
                                 st = st || {};
                                 return heroHeadlineDefault((st.project && st.project.customerName) || "Customer",
                                                            st.storyFoundations || {});
                               } },
            "Theme (eyebrow)": "project.theme",
            "Customer name": "project.customerName",
          } });
    add({ id: "_rt_intro_hook", synthetic: true, sectionId: "intro",
          layout: "introStoryHook", title: "Story hook (vi-2)",
          editorPaths: {
            "Headline":          { path: "storyFoundations.storyHookOverride",
                                   placeholder: function (sl, st) {
                                     st = st || {};
                                     return storyHookDefault(st.storyFoundations || {});
                                   } },
            // These two feed the SUB-line (storyHookSubText), not the
            // headline; businessProblem wins, primaryNarrative is the
            // fallback. Labelled so the precedence is clear.
            "Sub-line · business problem":      "storyFoundations.businessProblem",
            "Sub-line · primary narrative":     "storyFoundations.primaryNarrative",
            "Theme (eyebrow)":                  "project.theme",
          } });
    add({ id: "_rt_intro_three", synthetic: true, sectionId: "intro",
          layout: "introThreeActs", title: "Three acts (vi-3)",
          editorPaths: {
            // Single-line, 1:1 with each act's description. Each binds to
            // index [0] of the moments array the renderer (threeActsFor)
            // actually reads, so what you type is what shows.
            "Act 1 title":              "storyFoundations.threeActTitles[0]",
            "Act 1 · Know & Reach":     "storyFoundations.dataCloudMoments[0]",
            "Act 2 title":              "storyFoundations.threeActTitles[1]",
            "Act 2 · Engage & Recover": "storyFoundations.commerceMoments[0]",
            "Act 3 title":              "storyFoundations.threeActTitles[2]",
            "Act 3 · Convert":          "storyFoundations.agentforceMoments[0]",
          } });
    [0, 1, 2].forEach(function (i) {
      // Each vignette renders exactly ONE moments field (by runtimeIndex):
      //   vig1 → dataCloud, vig2 → marketing, vig3 → agentforce.
      const vigField = ["dataCloudMoments", "marketingMoments", "agentforceMoments"][i];
      const vigLabel = ["Subtitle · Know & Reach", "Subtitle · Engage & Recover", "Subtitle · Convert"][i];
      add({ id: "_rt_intro_vig_" + i, synthetic: true, sectionId: "intro",
            layout: "introVignette", runtimeIndex: i,
            title: "Vignette " + (i + 1) + " (vi-" + (4 + i) + ")",
            editorPaths: (function () {
              const ep = {};
              ep["Eyebrow"] = "storyFoundations.vignetteEyebrows[" + i + "]";
              ep["Title"]   = "storyFoundations.vignetteTitles[" + i + "]";
              ep[vigLabel]  = "storyFoundations." + vigField + "[0]";
              return ep;
            })() });
    });

    // JOURNEY MAP ─ single 5-phase matrix slide
    add({ id: "_rt_journey_matrix", synthetic: true, sectionId: "journey-map",
          layout: "journeyMapMatrix", title: "Journey map",
          editorPaths: {
            "Eyebrow":               "storyFoundations.journeyEyebrow",
            "Customer name":         "project.customerName",
            "Products":              "project.products",
            "Transformation thesis": "storyFoundations.transformationThesis",
          } });

    // MEET PERSONA ─ mr-1 intro, mr-2 spotlight, mr-3 wishlist, mr-4 CTA
    add({ id: "_rt_persona_intro", synthetic: true, sectionId: "meet-persona",
          layout: "personaIntro", title: "Meet persona (mr-1)",
          editorPaths: {
            "Eyebrow":         "storyFoundations.personaIntroEyebrow",
            "Persona name (headline shows first name)": "personas[0].name",
            "Customer name":   "project.customerName",
            "Sub-line · demo relevance (wins)": "personas[0].demoRelevance",
            "Sub-line · goals (fallback)":      "personas[0].goals",
          } });
    add({ id: "_rt_persona_card", synthetic: true, sectionId: "meet-persona",
          layout: "personaCard", title: "Spotlight · stats + quote (mr-2)",
          editorPaths: {
            "Persona name (full)": "personas[0].name",
            "Role (top label)":    "personas[0].role",
            "Job title":           "personas[0].jobTitle",
            "Stats":               "personas[0].stats",
            "Quote (pain points)": "personas[0].painPoints",
            // Quote falls back to goals when pain points is empty — expose it.
            "Quote fallback · goals": "personas[0].goals",
          } });
    add({ id: "_rt_persona_wishlist", synthetic: true, sectionId: "meet-persona",
          layout: "personaWishlist", title: "Wishlist (mr-3)",
          editorPaths: {
            "Wishlist":          "personas[0].wishlist",
            "Wishlist label":    "personas[0].wishlistLabel",
            "Wishlist headline": "personas[0].wishlistHeadline",
            "Pronouns":          "personas[0].pronouns",
          } });
    add({ id: "_rt_persona_cta", synthetic: true, sectionId: "meet-persona",
          layout: "personaCta", title: "Begin the journey (mr-4)",
          editorPaths: {
            "Eyebrow":          "storyFoundations.personaCtaEyebrow",
            "CTA button label": "storyFoundations.personaCtaLabel",
            "Persona name":     "personas[0].name",
            // Sub-line: demoRelevance wins over futureVision (relabeled so
            // the precedence is clear — editing futureVision is dead when
            // demoRelevance is set).
            "Sub-line · demo relevance (wins)": "personas[0].demoRelevance",
            "Sub-line · future vision (fallback)": "story.futureVision",
          } });

    // DEMO ─ chapter opener (auto-prepend) + state.slides[demo only]
    const demoSlides = (state.slides || []).filter(function (sl) {
      return !sl.sectionId || sl.sectionId === "demo";
    });
    const hasOpener = demoSlides.length && demoSlides[0] && demoSlides[0].layout === "chapterOpener";
    if (!hasOpener) {
      add({ id: "_rt_demo_opener", synthetic: true, sectionId: "demo",
            layout: "chapterOpener", title: "Chapter opener",
            editorPaths: {
              "Theme":         "project.theme",
              "Demo title":    "storyFoundations.demoTitle",
              "Customer name": "project.customerName",
              "Persona name":  "personas[0].name",
            } });
    }
    demoSlides.forEach(function (sl) {
      out.push(Object.assign({ assets: [], capabilities: [] }, sl, { sectionId: "demo" }));
    });

    // BUSINESS VALUE ─ bv-1..5
    add({ id: "_rt_bv_opener", synthetic: true, sectionId: "business-value",
          layout: "bvOpener", title: "Outcome opener (bv-1)",
          editorPaths: {
            "Eyebrow":  "storyFoundations.bvOpenerEyebrow",
            "Headline": "storyFoundations.bvOpenerHeadline",
            "Sub-line": "storyFoundations.bvOpenerSub",
          } });
    add({ id: "_rt_bv_orbit", synthetic: true, sectionId: "business-value",
          layout: "bvOrbit", title: "Orbit (bv-2)",
          editorPaths: {
            "Eyebrow":       "storyFoundations.bvOrbitEyebrow",
            "Headline":      "storyFoundations.bvOrbitHeadline",
            "Customer name": "project.customerName",
            "Products (orbit node labels)": "project.products",
            "Orbit nodes":   "storyFoundations.orbitNodes",
          } });
    add({ id: "_rt_bv_caps", synthetic: true, sectionId: "business-value",
          layout: "bvCapabilities", title: "Capabilities recap (bv-3)",
          editorPaths: {
            "Eyebrow":      "storyFoundations.bvCapsEyebrow",
            "Headline":     "storyFoundations.bvCapsHeadline",
            "Products":     "project.products",
            "Capabilities": "storyFoundations.capabilities",
          } });
    add({ id: "_rt_bv_scorecard", synthetic: true, sectionId: "business-value",
          layout: "kpiScorecard", title: "BVS scorecard (bv-4)",
          editorPaths: {
            "Eyebrow":     "storyFoundations.bvScorecardEyebrow",
            "Headline":    "storyFoundations.bvScorecardHeadline",
            "BVS metrics": "storyFoundations.bvsMetrics",
            "Disclaimer":  "storyFoundations.bvScorecardDisclaimer",
          } });
    add({ id: "_rt_bv_closing", synthetic: true, sectionId: "business-value",
          layout: "bvClosing", title: "Closing quote (bv-5)",
          editorPaths: {
            "Eyebrow":            "storyFoundations.bvClosingEyebrow",
            "Customer name":      "project.customerName",
            "Executive takeaway": "storyFoundations.executiveTakeaway",
          } });

    return out;
  }

  // ─── Demo-section SE layouts (shared preview ↔ export) ───────
  // These three keep the in-builder preview (preview-renderer.js
  // LAYOUT_RENDERERS) and the exported /demo deck (holodeck-adapter.js
  // buildSlidesStub) in lock-step, the same way threeActsFor/vignettesFor
  // do for the intro slides.

  // demoMap: numbered demo-flow steps from the story acts.
  function demoFlowSteps(acts) {
    return (acts || []).filter(function (a) { return a && a.title; }).slice(0, 8).map(function (a, i) {
      return {
        num:     String(i + 1).padStart(2, "0"),
        title:   a.title || "",
        channel: a.channel || "",
        cap:     a.salesforceCapabilities || "",
        asset:   a.requiredAssets || "",
      };
    });
  }

  // agentConversation: the two chat bubbles. Derives from state the same
  // way the preview's pickUserMessage/pickAgentMessage did, so export and
  // preview show identical copy. Accepts the builder state.
  function agentChat(state) {
    state = state || {};
    const story = state.story || {};
    const persona = (state.personas || [])[0] || null;
    const industry = (state.project && state.project.industry) || "";
    let user;
    if (story.agentforceMoments) {
      const t = String(story.agentforceMoments).split(/[.!?\n]/)[0];
      if (t && t.trim().length > 8) user = t.trim() + "?";
    }
    if (!user) {
      user = (persona && persona.painPoints)
        ? truncate(persona.painPoints, 80)
        : "I need help with " + (industry ? industry.toLowerCase() : "this") + ". Where do I start?";
    }
    const agent = story.futureVision
      ? truncate(story.futureVision, 140)
      : (story.businessValueMoments
          ? truncate(story.businessValueMoments, 140)
          : "Here's what I'd recommend, grounded in your unified profile and your last interaction.");
    return { user: user, agent: agent };
  }

  // nextSteps: the roadmap phase list (preview renders these as an <ol>).
  const NEXT_STEPS_PHASES = ["Discovery & alignment", "Pilot / POV", "Roll-out", "Scale & optimize"];
  function nextStepsPhases() { return NEXT_STEPS_PHASES.slice(); }

  // Industry → emoji for the bv-2 orbit center. Shared so the preview's
  // orbit center matches the exported buildOrbitCenter.
  function emojiForIndustry(industry) {
    return ({
      "Retail":             "🛍️",
      "Consumer Goods":     "🧺",
      "Hospitality":        "🏨",
      "Travel":             "✈️",
      "Financial Services": "🏦",
      "Healthcare":         "⚕️",
    })[industry] || "🏠";
  }

  // ─── Public API ──────────────────────────────────────────────
  global.HOLO_SHARED = {
    // text helpers
    truncate:                truncate,
    cleanHeadline:           cleanHeadline,
    oneSentence:             oneSentence,
    shortenTitle:            shortenTitle,
    isHeaderTitle:           isHeaderTitle,
    titleCase:               titleCase,
    shortenDriverLabel:      shortenDriverLabel,
    // pronouns
    pronounsFor:             pronounsFor,
    wishlistHeadlineFor:     wishlistHeadlineFor,
    isLegacyWishlistHeadline: isLegacyWishlistHeadline,
    // intro
    pickStance:              pickStance,
    heroHeadlineParts:       heroHeadlineParts,
    heroHeadlineDefault:     heroHeadlineDefault,
    storyHookParts:          storyHookParts,
    storyHookDefault:        storyHookDefault,
    storyHookSubText:        storyHookSubText,
    threeActsFor:            threeActsFor,
    vignettesFor:            vignettesFor,
    // journey
    PHASE_TITLES:            PHASE_TITLES,
    PHASE_EMOJIS:            PHASE_EMOJIS,
    PHASE_CIRCLE_CLASSES:    PHASE_CIRCLE_CLASSES,
    phaseDescription:        phaseDescription,
    bucketActsIntoFive:      bucketActsIntoFive,
    // bv
    buildBvsMetrics:         buildBvsMetrics,
    buildOrbitNodes:         buildOrbitNodes,
    buildCapabilities:       buildCapabilities,
    // persona
    personaFirstName:        personaFirstName,
    personaCtaCopy:          personaCtaCopy,
    personaIntroSub:         personaIntroSub,
    // chapter opener
    chapterOpenerCopy:       chapterOpenerCopy,
    // demo-section SE layouts (preview ↔ export)
    demoFlowSteps:           demoFlowSteps,
    agentChat:               agentChat,
    nextStepsPhases:         nextStepsPhases,
    emojiForIndustry:        emojiForIndustry,
    // slide manifest
    buildSlideManifest:      buildSlideManifest,
  };
})(typeof window !== "undefined" ? window : globalThis);
