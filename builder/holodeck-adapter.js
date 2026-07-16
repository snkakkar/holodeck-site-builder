// ════════════════════════════════════════════════════════════════
//  HOLODECK ADAPTER
//  Maps the Builder's internal state into the rich config shape the
//  polished /demo template expects (`window.HOLODECK_CONFIG`).
//
//  THE TWO RENDER PATHS — IMPORTANT
//  ─────────────────────────────────
//  Builder UI    → preview-renderer.js  (lightweight thumbnails — Step 7 only)
//  Final export  → /demo template files (polished customer-facing demo)
//
//  The builder previews are NOT the final output. They are indicative
//  cards. The final ZIP ships a copy of the /demo template — the same
//  HTML, CSS, JS, animations, device frames, deck navigation, and
//  premium visual hierarchy the customer-facing Holodeck has.
//
//  This adapter is the bridge. It takes the SE's inputs (customer
//  details, story foundations, story acts, personas, CX components)
//  and produces a complete HOLODECK_CONFIG that drives the polished
//  template without manual editing.
//
//  Public API:
//    HOLO_ADAPTER.toPolishedHolodeckConfig(state)
//        → object matching /demo/holodeck.config.js shape
//    HOLO_ADAPTER.toPolishedHolodeckConfigJs(state)
//        → string: "window.HOLODECK_CONFIG = {...};"
//
//  When fields are missing (Zone-2 content the SE didn't provide),
//  the adapter inserts clearly-marked "[TODO: ...]" placeholders so
//  the SE knows what to fill in before going live.
// ════════════════════════════════════════════════════════════════

(function (global) {
  "use strict";

  // Pure copy generators live in holodeck-shared.js so the adapter
  // and the in-builder preview agree on every default line. If H/SHARED
  // is missing we fall back to noops — the export still produces a
  // valid (if degraded) config rather than throwing.
  const SHARED = global.HOLO_SHARED || {};

  const TODO = "[TODO: confirm with customer]";

  // ─── Asset library lookup ────────────────────────────────────
  // Step 7's "Assets" panel writes uploads (data URLs) into
  // state.assetLibrary keyed by slot name. The adapter looks up
  // each slot here so anything the SE uploaded flows into the
  // exported config. Slots without an upload fall back to the
  // legacy empty-string default — same as before this feature.
  function asset(state, slot) {
    const lib = (state && state.assetLibrary) || {};
    const v = lib[slot];
    return (typeof v === "string" && v) ? v : "";
  }

  // ─── Public entry ────────────────────────────────────────────
  function toPolishedHolodeckConfig(state) {
    state = state || {};
    const project = state.project || {};
    const brand   = state.brand   || {};
    const f       = state.storyFoundations || {};
    const personas = state.personas || [];
    const persona  = personas[0] || null;
    const acts     = state.storyActs || [];
    const products = (project.products || []);

    return {
      customer:          buildCustomer(state, project, f),
      presenter:         buildPresenter(project),
      brand:             buildBrand(brand),
      scenes:            buildScenes(state),
      deckOutline:       buildDeckOutline(state),
      bvs:               buildBvs(state, f),
      persona:           buildPersona(persona, project, state),
      journey:           buildJourney(state, f, products, acts),
      customer_narrative: buildCustomerNarrative(project, f),
      demoStructure:     buildDemoStructure(state, f, acts, products),
      vignetteSections:  buildVignetteSections(state, f, acts, products),
      slides:            buildSlidesStub(state, acts, persona),
      mcpStates:         buildMcpStates(),
      technologies:      buildTechnologies(state, products),
      orbitNodes:        buildOrbitNodes(state, products),
      orbitCenter:       buildOrbitCenter(project),
      orbitCopy:         buildOrbitCopy(state, f, products),
      bvCopy:            buildBvCopy(f),
      enabledSlides:     buildEnabledSlides(state),
      // Evidence-driven "Powered by Salesforce" list (theme 4).
      poweredBy:         buildPoweredBy(state, project, f, products),
      timeline:          buildTimeline(state, f, acts),
      demoAssets:        buildDemoAssets(state),
      demoSlideText:     buildDemoSlideText(state, persona, project, f),
      openItems:         buildOpenItems(state),

      // ── Builder context, kept around for re-import & for Claude
      //    if the SE wants to enrich Zone 2 further with AI ───
      builderPlan:       buildBuilderPlan(state),
    };
  }

  function toPolishedHolodeckConfigJs(state, exportInfo) {
    const cfg = toPolishedHolodeckConfig(state);
    // Stamp deck-facing export metadata (date + signed-URL expiry + builder
    // origin) so the standalone deck can show "Exported <date>" and a
    // graceful "images expired — re-export" banner. Optional: a bare
    // builder preview call omits it and the deck simply shows no stamp.
    if (exportInfo && typeof exportInfo === "object") {
      cfg.export = {
        exportedAt:         exportInfo.exportedAt || "",
        signedUrlsExpireAt: exportInfo.signedUrlsExpireAt || "",
        builderOrigin:      exportInfo.builderOrigin || "",
      };
    }
    const banner = [
      "// ════════════════════════════════════════════════════════════════",
      "//  HOLODECK CONFIG — generated by the Holodeck Builder",
      "//  Generated: " + new Date().toISOString(),
      "//",
      "//  This file is loaded by /demo/demo-holodeck-unified.html and",
      "//  drives the polished customer-facing Holodeck.",
      "//",
      "//  Anything tagged [TODO: ...] is a placeholder the SE should",
      "//  replace before presenting externally.",
      "// ════════════════════════════════════════════════════════════════",
      "",
      "window.HOLODECK_CONFIG = " + stringifyJs(cfg, 2) + ";",
      "",
    ].join("\n");
    return banner;
  }

  // ─── customer ────────────────────────────────────────────────
  function buildCustomer(state, project, f) {
    const name        = project.customerName || "Customer";
    const nameDisplay = (project.customerName || "CUSTOMER").toUpperCase();
    const theme       = project.theme || "Salesforce Customer Experience Vision";
    return {
      name:           name,
      nameDisplay:    nameDisplay,
      website:        project.website || "",
      industry:       project.industry || "",
      demoTitle:      theme,
      demoSubtitle:   sub2(project, f),
      journeyTagline: titleTagline(products(project), f),
      // Hero headline must be SHORT — these slots are display-type
      // (60+ pt). Long paragraphs overflow. We keep the long prose
      // for the sub fields below.
      heroHeadline:   shortHeroHeadline(name, project, f),
      heroSub:        heroSubLine(name, project, f),
      storyHook:      shortStoryHook(name, f),
      storyHookSub:   storyHookSub(f, name),
      closingQuote:   shortClosingQuote(f),
    };
  }
  function products(p) { return (p && p.products) || []; }
  function sub2(project, f) {
    if (project.theme) return project.theme;
    if (project.industry) return project.industry + " · " + (project.audience || "Executive") + " story";
    return "Connected customer experience";
  }
  function titleTagline(prods, f) {
    const verbs = ["PERSONALIZED", "AGENTIC", "CONNECTED"];
    if (prods.indexOf("Loyalty") >= 0) verbs.push("LOYAL");
    return verbs.slice(0, 3).join(" • ");
  }

  // ─── Short, display-type headline copy ───────────────────────
  // Templates render hero/story headlines at 60-80pt with em accents.
  // Long script paragraphs overflow these slots. We synthesize a
  // crisp headline from the customer name + a one-word stance, and
  // let the long prose live in the sub-headline.
  // Hero/hook/stance copy lives in HOLO_SHARED so the in-builder
  // preview and the export both render the same lines. Adapter
  // wraps the shared parts in <br/> + <em> for display-type slots;
  // preview renders plain text. Same source, two presentations.
  function shortHeroHeadline(name, project, f) {
    const parts = SHARED.heroHeadlineParts
      ? SHARED.heroHeadlineParts(name, f)
      : { name: name, before: "a", accent: "connected", after: "customer journey", override: "" };
    // SE override (vi-1 "Headline") wins — verbatim, no <em> composition.
    if (parts.override && parts.override.trim()) return parts.override;
    return parts.name + ",<br/>" + parts.before + " <em>" + parts.accent + "</em> " + parts.after + ".";
  }
  function heroSubLine(name) {
    return name + " + Salesforce";
  }
  function shortStoryHook(name, f) {
    const h = SHARED.storyHookParts
      ? SHARED.storyHookParts(f)
      : { lead: "From a single moment", emph: "lifetime", tail: "to a", suffix: "of relevance.", override: "" };
    // SE override (vi-2 "Headline") wins — verbatim.
    if (h.override && h.override.trim()) return h.override;
    // Adapter slot is display-type — line-break before the accent and
    // wrap it in <em>. Order: "<lead><br/>[<tail> ]<em>emph</em> <suffix>"
    const tail = h.tail ? h.tail + " " : "";
    return h.lead + "<br/>" + tail + "<em>" + h.emph + "</em> " + h.suffix;
  }
  function storyHookSub(f) {
    return SHARED.storyHookSubText
      ? SHARED.storyHookSubText(f)
      : "Every interaction builds context. Every context makes the next experience more personal.";
  }
  function shortClosingQuote(f) {
    if (f.executiveTakeaway) return fitSentences(f.executiveTakeaway, 120) || truncate(f.executiveTakeaway, 120);
    return TODO + " — closing one-line takeaway";
  }
  function oneSentence(s, max) {
    return SHARED.oneSentence ? SHARED.oneSentence(s, max) : "";
  }
  // Whole-sentences-that-fit, NO trailing "…" (narrative slots). Falls back to
  // oneSentence's clean single-clause when even the first sentence overflows.
  function fitSentences(s, max) {
    return SHARED.fitSentences ? SHARED.fitSentences(s, max) : oneSentence(s, max);
  }
  function cleanHeadline(s, max) {
    return SHARED.cleanHeadline ? SHARED.cleanHeadline(s, max) : truncate(s, max);
  }

  // ─── presenter / brand ───────────────────────────────────────
  function buildPresenter(project) {
    return {
      name:    project.presenterName  || "[PRESENTER NAME]",
      title:   project.presenterTitle || "[TITLE]",
      company: "Salesforce",
    };
  }
  function buildBrand(b) {
    return {
      // Branding mode (theme 1). Default "salesforce" → identical to legacy.
      mode:             b.mode || "salesforce",
      logoPath:         b.logoPath || null,
      customerLogoPath: b.customerLogoPath || null,
      primaryColor:   b.primaryColor   || "#b22234",
      secondaryColor: b.secondaryColor || "#1a5fa0",
      accentColor:    b.accentColor    || "#f5c06a",
      navyColor:      "#0d1b2e",
      bgColor:        "#f5f7ff",
      fontHeading:    "'Playfair Display', Georgia, serif",
      fontBody:       "'Inter', -apple-system, sans-serif",
      googleFontsUrl: "https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,700;1,400;1,600&family=Inter:wght@300;400;500;600;700;800&display=swap",
    };
  }

  // "Powered by Salesforce" attribution — derived from selected products
  // plus the capability moments the story actually exercises. Respects an
  // SE-pinned list (state.poweredBy.auto === false). See HOLO_SHARED.
  function buildPoweredBy(state, project, f, products) {
    if (SHARED.poweredByProducts) {
      return SHARED.poweredByProducts({
        products: products,
        storyFoundations: f,
        poweredBy: state.poweredBy,
      });
    }
    return (products && products.length) ? products : ["Data Cloud"];
  }

  // ─── scenes (CX component links → /demo's scenes shape) ──────
  // /demo expects scenes as an OBJECT keyed by id (instagramAd, agenticSms,
  // shopperAgent) used directly in the HTML (#scene-instagram .src etc.).
  // We provide both shapes: the legacy array (for builder round-trip) and
  // the keyed object the polished template reads.
  function buildScenes(state) {
    const cx = state.cxComponents || [];
    // The polished template references three named iframes:
    //   #scene-instagram, #scene-sms, #scene-shopper
    // Map by component type / id heuristics.
    const out = { instagramAd: "", agenticSms: "", shopperAgent: "" };
    cx.forEach(function (c) {
      const k = String(c.id || "").toLowerCase();
      const t = String(c.type || "").toLowerCase();
      const n = String(c.name || "").toLowerCase();
      if (/instagram|paid|ad/.test(k + n) || t === "marketing" && /ad|paid/.test(n)) {
        if (!out.instagramAd) out.instagramAd = c.url || "";
      } else if (/sms|text|message/.test(k + n) || (t === "marketing" && c.deviceFrame === "mobile")) {
        if (!out.agenticSms) out.agenticSms = c.url || "";
      } else if (/agent|shopper|chat/.test(k + n) || t === "agent" || t === "commerce") {
        if (!out.shopperAgent) out.shopperAgent = c.url || "";
      }
    });
    // Fill any gap with the next available CX URL so the template
    // doesn't load empty iframes.
    cx.forEach(function (c) {
      if (!out.instagramAd  && c.url) out.instagramAd  = c.url;
      else if (!out.agenticSms   && c.url) out.agenticSms   = c.url;
      else if (!out.shopperAgent && c.url) out.shopperAgent = c.url;
    });
    // Empty strings for un-linked scene slots (rather than literal
    // [TODO:] paths) so iframes don't try to load a bogus URL — they
    // simply stay blank with the device frame visible. SE replaces
    // these with real /frame URLs in holodeck.config.js after export.
    if (!out.instagramAd)  out.instagramAd  = "about:blank";
    if (!out.agenticSms)   out.agenticSms   = "about:blank";
    if (!out.shopperAgent) out.shopperAgent = "about:blank";
    return out;
  }

  // ─── deckOutline (legacy Holodeck slide-types ordering) ─────
  function buildDeckOutline(state) {
    const layoutToType = (global.HOLO_RULES && global.HOLO_RULES.LAYOUT_TO_SLIDE_TYPE) || {};
    const linkedSlideIds = explicitlyLinkedSlideIds(state);
    return (state.slides || []).map(function (s) {
      // Same promotion as buildBuilderPlan — explicit CX link forces
      // an embedded layout regardless of the saved slide.layout.
      const layout = linkedSlideIds[s.id] ? "embeddedCxComponent" : s.layout;
      const type = layoutToType[layout] || "two-panel";
      const note = s.title + (s.speakerNotes ? " — " + s.speakerNotes : "");
      return { type: type, note: note };
    });
  }
  function explicitlyLinkedSlideIds(state) {
    const out = {};
    (state.cxComponents || []).forEach(function (c) {
      const sid = (c.linkedSlideIds && c.linkedSlideIds[0]) || "";
      if (sid) out[sid] = true;
    });
    return out;
  }

  // ─── bvs ─────────────────────────────────────────────────────
  // Three layers, last-wins:
  //   1. Hardcoded defaults (XX% / +$XX) — so the slide always renders.
  //   2. Driver-derived label (from storyFoundations.valueDrivers).
  //   3. SE overrides (storyFoundations.bvsMetrics[i].{value,label})
  //      — set via Step 7's pending-text editor.
  function buildBvs(state, f) {
    return {
      disclaimer: "Replace placeholders with BVS-approved values before presenting externally.",
      metrics:    SHARED.buildBvsMetrics ? SHARED.buildBvsMetrics(f) : [],
    };
  }

  // ─── persona ─────────────────────────────────────────────────
  function buildPersona(p, project, state) {
    if (!p) {
      const fallbackPron = pronounsFor("");
      return {
        name:        "[TODO: persona first name]",
        fullName:    "[TODO: persona full name]",
        role:        "[TODO: persona role]",
        jobTitle:    "[TODO: persona job title]",
        customerOf:  project.customerName || "[Customer Name]",
        journeyArc:  "[TODO: one-line journey arc]",
        quote:       "[TODO: persona quote in their own voice]",
        stats:       defaultPersonaStats(),
        wishlist:    defaultPersonaWishlist(),
        wishlistHeadline: wishlistHeadlineFor(fallbackPron),
        wishlistLabel:    "[TODO: wishlist section label]",
        ctaLabel:         "BEGIN THE JOURNEY &nbsp;→",
        ctaHeadline:      "[TODO: closing CTA headline]",
        ctaSub:           "[TODO: closing CTA sub]",
        heroBackground:   asset(state, "persona.heroBackground"),
        heroGif:          asset(state, "persona.heroGif"),
        phoneGif:         asset(state, "persona.phoneGif"),
        portrait:         asset(state, "persona.portrait"),
      };
    }
    const first = (p.name || "").trim().split(/\s+/)[0] || "[TODO: persona]";
    const full  = p.name || "[TODO: persona full name]";
    const pron  = pronounsFor(p.pronouns);
    const stats = personaStatsFrom(p);
    const wish  = personaWishlistFrom(p, state);
    // Story-driven wishlist chrome (from the Gemini extraction, on
    // storyFoundations) — used as a fallback layer below any headline
    // the SE typed on the persona, and above the neutral default.
    const sf    = (state && state.storyFoundations) || {};
    const aiWishHead = (sf.wishlistHeadline && String(sf.wishlistHeadline).trim()) || "";
    return {
      name:        first,
      fullName:    full,
      role:        p.role || "[TODO: persona role]",
      // Honor an explicit jobTitle (the personaCard editor field) before
      // falling back to role — mirrors the preview renderer (p.jobTitle || p.role).
      jobTitle:    p.jobTitle || p.role || "[TODO: persona job title]",
      customerOf:  project.customerName || "",
      journeyArc:  truncate(p.demoRelevance || p.goals || "[TODO: one-line journey arc]", 110),
      quote:       p.painPoints
                     ? cleanQuote(p.painPoints)
                     : (p.goals ? cleanQuote(p.goals) : "[TODO: persona quote]"),
      stats:       stats,
      wishlist:    wish,
      // Skip a stored wishlistHeadline that's just the old hardcoded
      // "Her top 3..." string — those round-tripped in from earlier
      // exports before the pronoun feature, and would otherwise stomp
      // on the new pronoun-aware default. Treat any custom phrasing
      // (the SE wrote their own) as authoritative.
      // Precedence: SE's own headline → story-driven AI headline →
      // pronoun-aware neutral default. The AI headline is authoritative
      // custom copy, so we pass it through as-is (no <strong> wrap).
      wishlistHeadline: (p.wishlistHeadline && !isLegacyWishlistHeadline(p.wishlistHeadline))
                          ? p.wishlistHeadline
                          : (aiWishHead || wishlistHeadlineFor(pron)),
      // Section eyebrow: story-driven when present, else the persona's
      // "First's Wishlist" default.
      wishlistLabel:    p.wishlistLabel
                          ? p.wishlistLabel
                          : ((sf.wishlistEyebrow && String(sf.wishlistEyebrow).trim()) || (first + "'s Wishlist")),
      // CTA copy comes from SHARED so the mr-4 preview tile and the
      // exported slide stay in lock-step. Story passed through so the
      // sub falls back to story.futureVision when demoRelevance is empty.
      ctaLabel:         (SHARED.personaCtaCopy ? SHARED.personaCtaCopy(p, state.story, state.storyFoundations).label    : "BEGIN THE JOURNEY &nbsp;→"),
      ctaHeadline:      (SHARED.personaCtaCopy ? SHARED.personaCtaCopy(p, state.story, state.storyFoundations).headline : "Let's follow " + first + "'s journey."),
      ctaSub:           (SHARED.personaCtaCopy ? SHARED.personaCtaCopy(p, state.story, state.storyFoundations).sub      : truncate(p.demoRelevance || "From inspiration to purchase to loyalty.", 110)),
      // Empty strings (not literal "[TODO:]" paths) so the browser
      // skips fetching a broken image. Step 7's Assets panel writes
      // any uploads into state.assetLibrary, which we read here so
      // the SE doesn't have to drop files into demo/assets/ post-export.
      heroBackground:   asset(state, "persona.heroBackground"),
      heroGif:          asset(state, "persona.heroGif"),
      phoneGif:         asset(state, "persona.phoneGif"),
      portrait:         asset(state, "persona.portrait"),
      // Step 8 eyebrow overrides (mr-1 / mr-4) — blank = template default.
      introEyebrow:     (state.storyFoundations && state.storyFoundations.personaIntroEyebrow) || "",
      ctaEyebrow:       (state.storyFoundations && state.storyFoundations.personaCtaEyebrow) || "",
    };
  }
  // Pronoun helpers live in HOLO_SHARED so changes propagate to the
  // preview without keeping two regexes in lock-step.
  function pronounsFor(value) {
    return SHARED.pronounsFor ? SHARED.pronounsFor(value) : { subj: "Her", obj: "her" };
  }
  // Adapter writes the wishlist headline with <strong> wrapping for
  // the polished template; preview reads the plain-text variant.
  function wishlistHeadlineFor(pron) {
    return SHARED.wishlistHeadlineFor
      ? SHARED.wishlistHeadlineFor(pron, { wrapStrong: true })
      : pron.subj + " top 3. <strong>Picked just for " + pron.obj + ".</strong>";
  }
  function isLegacyWishlistHeadline(s) {
    return SHARED.isLegacyWishlistHeadline
      ? SHARED.isLegacyWishlistHeadline(s)
      : false;
  }
  // Pull stats/wishlist from the persona itself when the SE has
  // filled them in on Step 7's pending-text editor. Otherwise fall
  // back to the [TODO] defaults so the slide still renders.
  function personaStatsFrom(p) {
    const arr = Array.isArray(p.stats) ? p.stats : [];
    const def = defaultPersonaStats();
    return def.map(function (d, i) {
      const row = arr[i] || {};
      return {
        value: (row.value && String(row.value).trim()) || d.value,
        label: (row.label && String(row.label).trim()) || d.label,
      };
    });
  }
  function personaWishlistFrom(p, state) {
    const arr = Array.isArray(p.wishlist) ? p.wishlist : [];
    // Default source: the story-driven wishlist from the Gemini
    // extraction (on storyFoundations) when present, else the neutral
    // placeholder rows. Either way `def` fills any gap the SE left in a
    // persona row (name/tag/emoji/detail), so no cell renders blank.
    const sf  = (state && state.storyFoundations) || {};
    const aiWish = Array.isArray(sf.wishlist) && sf.wishlist.length ? sf.wishlist : null;
    const def = aiWish || defaultPersonaWishlist();
    // Render every SE row, not just the first 3 — previously this mapped
    // over `def` (length 3) and silently dropped a 4th+ wishlist item.
    const n = Math.max(arr.length, def.length);
    const out = [];
    for (let i = 0; i < n; i++) {
      const row = arr[i] || {};
      const d   = def[i] || { name: "", tag: "", detail: "", emoji: "" };
      out.push({
        name:   (row.name   && String(row.name).trim())   || d.name,
        tag:    (row.tag    && String(row.tag).trim())    || d.tag,
        detail: (row.detail && String(row.detail).trim()) || d.detail,
        emoji:  (row.emoji  && String(row.emoji).trim())  || d.emoji,
      });
    }
    return out;
  }
  function defaultPersonaStats() {
    return [
      { value: "[TODO]", label: "Top Moment"   },
      { value: "[TODO]", label: "Tradition"    },
      { value: "[TODO]", label: "Signal"       },
    ];
  }
  function defaultPersonaWishlist() {
    // Single source in HOLO_SHARED so the mr-3 preview empty-state matches.
    if (SHARED.defaultWishlist) return SHARED.defaultWishlist();
    return [
      { name: "[TODO: top recommendation]", tag: "PRIMARY CONSIDERATION", detail: "[TODO]", emoji: "⭐" },
      { name: "[TODO: companion]",          tag: "AI MATCH",              detail: "[TODO]", emoji: "✨" },
      { name: "[TODO: related option]",     tag: "RELATED",               detail: "[TODO]", emoji: "➕" },
    ];
  }
  function cleanQuote(s) {
    s = String(s || "").replace(/\s+/g, " ").trim();
    if (!s) return "";
    if (s.length > 140) s = s.slice(0, 137).replace(/\s+\S*$/, "") + "…";
    return s;
  }

  // ─── journey (Section A: Journey Map circles) ───────────────
  // /demo expects 5 circle-classes: anticipate, engage, guide, convert, delight.
  // We map storyActs into 5 buckets (or pad with sensible defaults).
  function buildJourney(state, f, prods, acts) {
    const headline = f.transformationThesis
      ? cleanHeadline(f.transformationThesis, 70)
      : "A <strong>connected journey</strong>";
    // Phase bucketing lives in HOLO_SHARED so the preview's
    // journeyMapMatrix and the export's circle row share defaults.
    const steps = SHARED.bucketActsIntoFive ? SHARED.bucketActsIntoFive(acts, prods, f && f.journeyPhases) : [];
    // Fold any Gemini-generated per-phase circle image (slot "journeyStep<i>")
    // into the step so the exported config carries it. Empty when unset →
    // the live map renders the emoji fallback.
    steps.forEach(function (step, i) {
      step.imageUrl = asset(state, "journeyStep" + i) || step.imageUrl || "";
    });
    return {
      headline: headline,
      steps:    steps,
      platform: {
        title:    "Salesforce Platform",
        subtitle: prods.map(function (p) { return p.toUpperCase(); }).join(" · ") || "AGENTFORCE · DATA CLOUD · COMMERCE",
        capabilities: prods.length ? prods : ["Agentforce", "Data Cloud", "Commerce", "Marketing Cloud"],
      },
    };
  }
  function shortenTitle(s) {
    return SHARED.shortenTitle ? SHARED.shortenTitle(s) : String(s || "").slice(0, 22);
  }

  // ─── customer_narrative (Intro deck + closing) ──────────────
  function buildCustomerNarrative(project, f) {
    const theme = project.theme || "Salesforce Customer Experience Vision";
    return {
      demoTitle:      theme,
      demoSubtitle:   project.industry ? (project.industry + " journey") : "Connected customer journey",
      journeyTagline: "PERSONALIZED • AGENTIC • CONNECTED",
      heroHeadline:   f.futureStateVision
        ? cleanHeadline(f.futureStateVision, 100)
        : "A connected, <em>agentic</em><br/>customer journey.",
      heroSub:        (project.customerName || "Customer") + " + Salesforce",
      storyHook:      f.primaryNarrative
        ? cleanHeadline(f.primaryNarrative, 100)
        : "See how a single moment becomes a connected journey.",
      storyHookSub:   f.businessProblem
        ? truncate(f.businessProblem, 240)
        : "Every interaction builds context. Every context makes the next experience more personal.",
      closingQuote:   f.executiveTakeaway || "[TODO: closing executive quote]",
    };
  }

  // demoStructure + vignettes default copy lives in HOLO_SHARED so
  // the in-builder Step 8 preview shows the same lines the export
  // produces. Adapter just truncates per its slot widths.
  function buildDemoStructure(state, f, acts, prods) {
    const threeActs = SHARED.threeActsFor ? SHARED.threeActsFor(f, acts, prods) : [];
    return threeActs.map(function (a) {
      return {
        title:       a.title,
        description: fitSentences(a.description, 200),
        tags:        a.tags,
      };
    });
  }
  function buildVignetteSections(state, f, acts, prods) {
    return SHARED.vignettesFor ? SHARED.vignettesFor(f, acts, prods) : [];
  }

  // ─── slides (Demo deck slide payload) ────────────────────────
  // The polished template's Demo section is built around At-Home-style
  // demo slides ("is-1" through "is-14"). Without a Claude pass we
  // can't generate that level of detail. We emit a deckOutline-shaped
  // slides[] so the legacy renderer at least has structure, and we
  // mark with [TODO:] for the SE.
  // Stable re-sort of state.slides by the SE's manual reorder
  // (state.slideOrder = array of slide ids). Ids absent from slideOrder keep
  // their relative order at the tail. Mirrors buildSlideManifest / preview.
  function orderSlides(state) {
    const slides = (state.slides || []).slice();
    const order = state.slideOrder;
    if (Array.isArray(order) && order.length) {
      const rank = {};
      order.forEach(function (id, i) { rank[id] = i; });
      slides.sort(function (a, b) {
        const ra = (a.id in rank) ? rank[a.id] : Infinity;
        const rb = (b.id in rank) ? rank[b.id] : Infinity;
        return ra - rb;
      });
    }
    return slides;
  }

  function buildSlidesStub(state, acts, persona) {
    // Honor the SE's manual reorder (state.slideOrder) here too so the legacy
    // slides[] stub matches builderPlan.slides ordering.
    const slides = orderSlides(state);
    if (!slides.length) {
      return [{
        type:     "title",
        eyebrow:  "Open the demo",
        headline: "[TODO: opening slide headline]",
        sub:      "[TODO: opening slide sub]",
      }];
    }
    const linkedSlideIds = explicitlyLinkedSlideIds(state);
    return slides.map(function (sl, i) {
      // Map builder layouts to /demo slide types — promote any
      // explicitly-linked slide to embeddedCxComponent so it renders
      // as an iframe (consistent with buildBuilderPlan above).
      const layout = linkedSlideIds[sl.id] ? "embeddedCxComponent" : sl.layout;
      const type = builderLayoutToHolodeckSlideType(layout);
      // First content-bearing story act — the same source the preview
      // renderers (demoMap/deviceMoment) use, so export = preview.
      const act = firstContentAct(acts);
      const base = {
        type:     type,
        eyebrow:  capitalize(sl.sectionId || "demo").replace("-", " "),
        headline: sl.title || ("Slide " + (i + 1)),
        sub:      sl.speakerNotes || (act && act.summary ? fitSentences(act.summary, 200) : "[TODO: slide narration]"),
      };
      if (type === "two-panel") {
        // demoMap (and other two-panel SE layouts) render a numbered
        // demo-flow in the preview. Carry the real story-act content into
        // the export's right panel instead of a TODO placeholder.
        base.left  = { imagePath: "assets/[TODO: " + slug(sl.title) + ".jpg]", tag: sl.title };
        base.right = {
          eyebrow:  base.eyebrow,
          headline: sl.title || (act && act.title ? act.title : ""),
          sub:      (act && act.summary) ? fitSentences(act.summary, 200) : "[TODO: slide narrative]",
          stats:    [],
          quote:    "",
        };
        if (layout === "demoMap") {
          base.right.steps = SHARED.demoFlowSteps ? SHARED.demoFlowSteps(acts) : demoFlowStepsLocal(acts);
        }
      }
      if (type === "iframe-phone" || type === "iframe-laptop") {
        // deviceMoment / agentConversation render real channel + narrative
        // content in the preview; mirror it here rather than a TODO.
        base.left = {
          backgroundPath: "assets/[TODO: scene-bg.jpg]",
          iframeSrc:      "{{scenes." + (sl.linkedCxComponentIds && sl.linkedCxComponentIds[0] || "instagramAd") + "}}",
          tag:            (act && act.channel) || sl.title || "",
        };
        base.right = {
          eyebrow:  (act && act.salesforceCapabilities) || base.eyebrow,
          headline: sl.title || (act && act.title ? act.title : ""),
          sub:      (act && act.summary) ? fitSentences(act.summary, 200) : (sl.speakerNotes || "[TODO: scene narration]"),
          stats:    [],
          quote:    "",
        };
        if (layout === "agentConversation") {
          base.right.chat = SHARED.agentChat
            ? SHARED.agentChat(state)
            : { user: "[TODO: customer message]", agent: "[TODO: Agentforce reply]" };
        }
      }
      if (type === "title" && layout === "nextSteps") {
        // nextSteps preview shows a roadmap phase list — carry it through.
        base.phases = SHARED.nextStepsPhases ? SHARED.nextStepsPhases() : NEXT_STEPS_PHASES;
      }
      return base;
    });
  }
  // Local fallbacks (used when HOLO_SHARED isn't loaded) — kept in sync
  // with the shared helpers so a degraded export still carries content.
  const NEXT_STEPS_PHASES = ["Discovery & alignment", "Pilot / POV", "Roll-out", "Scale & optimize"];
  function firstContentAct(acts) {
    function isGeneric(t) { return !t || /^(intro|opening|open|chapter\s|section\s|close|closing)/i.test(t); }
    return (acts || []).find(function (a) { return a && a.summary && !isGeneric(a.title); }) || (acts || [])[0] || null;
  }
  function demoFlowStepsLocal(acts) {
    return (acts || []).filter(function (a) { return a && a.title; }).slice(0, 8).map(function (a, i) {
      return {
        num:     String(i + 1).padStart(2, "0"),
        title:   a.title || "",
        channel: a.channel || "",
        cap:     a.salesforceCapabilities || "",
      };
    });
  }
  function builderLayoutToHolodeckSlideType(layout) {
    return ({
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
    })[layout] || "two-panel";
  }

  // ─── mcpStates (the 3-state click-through on slide is-8) ────
  function buildMcpStates() {
    return [
      { tag: "[TODO: MCP scene 1 tag]",   headline: "[TODO: MCP scene 1 headline]",   sub: "[TODO: MCP scene 1 sub]",   quote: "[TODO]", counter: "1 / 3" },
      { tag: "[TODO: MCP scene 2 tag]",   headline: "[TODO: MCP scene 2 headline]",   sub: "[TODO: MCP scene 2 sub]",   quote: "[TODO]", counter: "2 / 3" },
      { tag: "[TODO: MCP scene 3 tag]",   headline: "[TODO: MCP scene 3 headline]",   sub: "[TODO: MCP scene 3 sub]",   quote: "[TODO]", counter: "3 / 3" },
    ];
  }

  // ─── technologies (BV capabilities slide) ────────────────────
  // Same defaults + product-derived list + SE overrides
  // (storyFoundations.capabilities) used by the bv-3 preview.
  function buildTechnologies(state, prods) {
    const f = (state && state.storyFoundations) || {};
    return SHARED.buildCapabilities
      ? SHARED.buildCapabilities(f, prods)
      : [];
  }

  // ─── orbit (BV section) ──────────────────────────────────────
  // Delegates to SHARED so preview + export read from one place,
  // including any storyFoundations.orbitNodes overrides the SE made
  // in Step 8.
  function buildOrbitNodes(state, prods) {
    const f = (state && state.storyFoundations) || {};
    return SHARED.buildOrbitNodes
      ? SHARED.buildOrbitNodes(f, prods)
      : [];
  }
  function buildOrbitCenter(project) {
    return {
      emoji: emojiForIndustry(project.industry),
      label: (project.customerName || "CUSTOMER").toUpperCase(),
    };
  }
  // Which fixed-section slides are enabled (Step 5 selection). Keyed by the
  // polished template's DOM slide id so demo-holodeck-unified.html can skip
  // de-selected slides in its section build/nav. A synthetic manifest id
  // ABSENT from selectedRecIds means "default on".
  //   manifest id            → template DOM id
  //   _rt_intro_hero         → vi-1
  //   _rt_intro_hook         → vi-2
  //   _rt_intro_three        → vi-3
  //   _rt_intro_vig_0/1/2    → vi-4 / vi-5 / vi-6
  //   _rt_journey_matrix     → sec-map (whole journey section)
  //   _rt_persona_intro      → mr-1
  //   _rt_persona_card       → mr-2
  //   _rt_persona_wishlist   → mr-3
  //   _rt_persona_cta        → mr-4
  //   _rt_bv_opener/orbit/caps/scorecard/closing → bv-1..5
  function buildEnabledSlides(state) {
    const sel = (state && state.selectedRecIds) || {};
    function on(id) { return !(id in sel) || !!sel[id]; }
    return {
      "vi-1":  on("_rt_intro_hero"),
      "vi-2":  on("_rt_intro_hook"),
      "vi-3":  on("_rt_intro_three"),
      "vi-4":  on("_rt_intro_vig_0"),
      "vi-5":  on("_rt_intro_vig_1"),
      "vi-6":  on("_rt_intro_vig_2"),
      // Journey map is a REQUIRED manifest slide — never gate it off, even if a
      // stale selectedRecIds carries _rt_journey_matrix:false from an older project.
      "sec-map": true,
      "mr-1":  on("_rt_persona_intro"),
      "mr-2":  on("_rt_persona_card"),
      "mr-3":  on("_rt_persona_wishlist"),
      "mr-4":  on("_rt_persona_cta"),
      "bv-1":  on("_rt_bv_opener"),
      "bv-2":  on("_rt_bv_orbit"),
      "bv-3":  on("_rt_bv_caps"),
      "bv-4":  on("_rt_bv_scorecard"),
      "bv-5":  on("_rt_bv_closing"),
    };
  }

  // bv-1..5 eyebrows/headlines the SE can override in Step 8 (the polished
  // template's static HTML reads these, falling back to its literals). Only
  // emit keys the SE actually set so blank = the template default.
  function buildBvCopy(f) {
    f = f || {};
    const keys = [
      "bvOpenerEyebrow", "bvOpenerHeadline", "bvOpenerSub",
      "bvOrbitEyebrow", "bvOrbitHeadline",
      "bvCapsEyebrow", "bvCapsHeadline",
      "bvScorecardEyebrow", "bvScorecardHeadline", "bvScorecardDisclaimer",
      "bvClosingEyebrow",
    ];
    const out = {};
    keys.forEach(function (k) {
      if (f[k] != null && String(f[k]).trim()) out[k] = String(f[k]);
    });
    return out;
  }
  function emojiForIndustry(industry) {
    // Single source in HOLO_SHARED so the bv-2 preview orbit center and
    // this exported center use the same mapping.
    if (SHARED.emojiForIndustry) return SHARED.emojiForIndustry(industry);
    return ({
      "Retail":             "🛍️",
      "Consumer Goods":     "🧺",
      "Hospitality":        "🏨",
      "Travel":             "✈️",
      "Financial Services": "🏦",
      "Healthcare":         "⚕️",
    })[industry] || "🏠";
  }
  function buildOrbitCopy(state, f, prods) {
    return {
      eyebrow:  "One Connected Platform",
      headline: "Personalized at every<br/><span class=\"accent\">touchpoint.</span>",
      body:     f.transformationThesis
        ? truncate(f.transformationThesis, 280)
        : "Salesforce connects data, AI, commerce, marketing, and service into one journey. Every signal informs every channel.",
      stats: [
        { val: prods[0] || "Data Cloud",  label: "Foundation"     },
        { val: prods[1] || "Agentforce",  label: "Agentic moments"},
        { val: prods[2] || "Commerce",    label: "Conversion"     },
      ],
    };
  }

  // ─── timeline (Demo section is-3 horizontal timeline) ───────
  function buildTimeline(state, f, acts) {
    // Skip "chapter header" acts (titles like "Intro" / "Opening" /
    // "Chapter 1") so the timeline shows real journey milestones.
    function isHeaderTitle(t) { return !t || /^(intro|opening|open|chapter\s|section\s|close|closing)/i.test(t); }
    const milestones = acts.filter(function (a) {
      return a && a.summary && !isHeaderTitle(a.title);
    });
    return {
      eyebrow:  "Salesforce · " + ((state.project && state.project.industry) || "Customer Journey"),
      headline: "One journey. Every channel.<br/><span class=\"accent\">Always personal.</span>",
      sub:      f.primaryNarrative
        ? truncate(f.primaryNarrative, 260)
        : "From a single moment, every downstream interaction is connected and personal.",
      above:    milestones.slice(0, 3).map(function (a, i) {
        return { month: pickMonth(i, "above"), icon: pickIcon(a.channel, "above"), label: shortenTitle(a.title || ("Step " + (i + 1))), sub: truncate(a.summary || "", 60) };
      }),
      below:    milestones.slice(0, 7).map(function (a, i, arr) {
        const hero = i === 0 || i === arr.length - 1;
        return { month: pickMonth(i, "below"), icon: pickIcon(a.channel, "below"), label: shortenTitle(a.title || ("Moment " + (i + 1))), sub: truncate(a.summary || "", 60), hero: hero };
      }),
    };
  }
  function pickMonth(i, _row) {
    return ["DEC", "FEB", "APR", "JUN", "JUL", "AUG", "SEP"][i] || "—";
  }
  function pickIcon(channel, _row) {
    if (!channel) return "📱";
    const c = String(channel).toLowerCase();
    if (/store|in[-\s]?store/.test(c)) return "🏪";
    if (/instagram|facebook|paid|ad/.test(c)) return "📸";
    if (/sms|text/.test(c)) return "💬";
    if (/email/.test(c)) return "📧";
    if (/web|site|storefront/.test(c)) return "🖥️";
    if (/imessage|whatsapp/.test(c)) return "💬";
    if (/agent|chat/.test(c)) return "🤖";
    if (/laptop|macbook/.test(c)) return "💻";
    return "📱";
  }

  // ─── demoSlideText (Demo section is-1 + is-2 inline copy) ──
  // The polished template hard-references C.demoSlideText.s1 and
  // C.demoSlideText.s2 in its inline populate script. Without this
  // block the script throws (Cannot read properties of undefined)
  // and the whole demo stops rendering. We emit safe defaults.
  function buildDemoSlideText(state, persona, project, f) {
    const customer = (project.customerName || "Customer");
    const personaName = persona && persona.name ? persona.name.split(/\s+/)[0] : "the customer";
    // First story act with concrete content (skip generic chapter
    // headers like "Intro" / "Open" that don't read as slide copy)
    const acts = (state.storyActs || []);
    function isGenericTitle(t) { return !t || /^(intro|opening|open|chapter\s|section\s|act\s*\d)/i.test(t); }
    const firstAct  = acts.find(function (a) { return a && a.summary && !isGenericTitle(a.title); }) || acts[0] || null;
    const secondAct = acts.slice(acts.indexOf(firstAct) + 1).find(function (a) { return a && a.summary; }) || null;

    return {
      s1: {
        eyebrow:  project.theme || (project.industry ? project.industry + " · Vision" : "Salesforce Customer Experience"),
        headline: f.primaryNarrative
          ? "Every great experience begins<br/>with <em>a single signal.</em>"
          : "Every relationship begins<br/>with a <em>single moment.</em>",
        sub:      f.businessProblem
          ? fitSentences(f.businessProblem, 220)
          : (firstAct && firstAct.summary
              ? fitSentences(firstAct.summary, 220)
              : "Connected data and AI turn each customer touchpoint into the foundation of the next."),
      },
      s2: {
        sceneCaption: firstAct && firstAct.demoMoment
          ? firstAct.demoMoment
          : (firstAct && firstAct.title && !isGenericTitle(firstAct.title) ? firstAct.title : (firstAct && firstAct.channel ? firstAct.channel + " moment" : "Demo moment")),
        role:     persona && persona.role ? persona.role : "Customer",
        name:     personaName + ".",
        sub:      firstAct && firstAct.summary
          ? fitSentences(firstAct.summary, 200)
          : (f.businessProblem ? fitSentences(f.businessProblem, 200) : "The demo opens here."),
        items:    [
          {
            icon:  "🛍️",
            label: "MOMENT",
            text:  firstAct && firstAct.title && !isGenericTitle(firstAct.title) ? firstAct.title : "Discover",
            sub:   firstAct && firstAct.salesforceCapabilities
              ? firstAct.salesforceCapabilities
              : (project.products && project.products[0] ? project.products[0] : "Salesforce"),
          },
          {
            icon:  "📍",
            label: "CHANNEL",
            text:  firstAct && firstAct.channel ? firstAct.channel : "Multi-channel",
            sub:   secondAct && secondAct.channel ? "Then: " + secondAct.channel : "Across the journey",
          },
          {
            icon:  "→",
            label: "OUTCOME",
            text:  firstAct && firstAct.businessValue ? firstAct.businessValue : "Anonymous → Known",
            sub:   "First profile signal in " + customer + "'s data foundation.",
          },
        ],
      },
    };
  }

  // ─── demoAssets (image paths used across slides) ─────────────
  // We deliberately emit empty strings (not "assets/[TODO:…]") for
  // assets the SE hasn't provided yet.  The unified template's
  // populateFromConfig sets .src on these <img> elements; an empty
  // string keeps the browser from rendering the broken-image icon
  // and lets the slide's gradient background show through cleanly.
  // The SE still sees the gap (it's flagged in ASSET_INSTRUCTIONS.md
  // and on the Builder side); but the polished demo doesn't look
  // broken.  Device-frame PNGs (which we *do* ship) keep their paths.
  function buildDemoAssets(state) {
    return {
      storeExterior:     asset(state, "storeExterior"),
      storeInterior:     asset(state, "storeInterior"),
      productHero:       asset(state, "productHero"),
      iPhoneRec:         asset(state, "iPhoneRec"),
      webBrowseGif:      asset(state, "webBrowseGif"),
      laptopBrowsingGif: asset(state, "laptopBrowsingGif"),
      // CX component stills — empty string when unset; the demo renderer
      // treats empty as "render the HTML mock instead" (non-destructive).
      cxUnifiedProfile:  asset(state, "cxUnifiedProfile"),
      cxInstagramAd:     asset(state, "cxInstagramAd"),
      cxShopperAgent:    asset(state, "cxShopperAgent"),
      cxTextConvo:       asset(state, "cxTextConvo"),
      cxEmailConvo:      asset(state, "cxEmailConvo"),
      macbookFrame:      "assets/macbook-transparent.png",
      iPhoneFrame:       "assets/iPhone16Pro_FRAME.png",
    };
  }

  // ─── openItems ───────────────────────────────────────────────
  function buildOpenItems(state) {
    const out = [];
    out.push("Update presenter.name and presenter.title");
    out.push("Replace all XX% / +$XX BVS placeholder values with approved benchmarks");
    out.push("Confirm scenes URLs are live and loading in iframes");
    out.push("Add customer logo to assets/ and set brand.logoPath");
    if (!(state.personas || []).length) out.push("Add a persona — at least name, role, and one quote");
    if (!(state.storyActs || []).length) out.push("Outline at least 3 story acts so the journey timeline is rich");
    out.push("Drop persona portrait + product images into assets/ and update demoAssets.* paths");
    return out;
  }

  // ─── builderPlan (round-trip back to the builder) ────────────
  function buildBuilderPlan(state) {
    const project = state.project || {};

    // Build a map of slide.id -> [cxComponentId] from the SE's explicit
    // links. We need this at export time (not just inside the builder's
    // buildSlidePlanFromSelections) so saved projects from before the
    // promotion rule was added still export correctly. The demo runtime
    // ONLY renders an iframe when slide.layout === "embeddedCxComponent",
    // so any explicit link must promote the layout — otherwise the
    // exported config has the link but no iframe slot to put it in.
    const cxAll = state.cxComponents || [];
    const explicitBySlide = {};
    cxAll.forEach(function (c) {
      const sid = (c.linkedSlideIds && c.linkedSlideIds[0]) || "";
      if (sid) {
        explicitBySlide[sid] = explicitBySlide[sid] || [];
        explicitBySlide[sid].push(c.id);
      }
    });

    return {
      audience:   project.audience   || "",
      salesStage: project.salesStage || "",
      products:   project.products   || [],
      tone:       project.tone       || "",
      theme:      project.theme      || "",
      story:            state.story            || {},
      storyFoundations: state.storyFoundations || {},
      personas:         state.personas         || [],
      storyActs:        state.storyActs        || [],
      // AI-generated agent-conversation script; the demo's agentConversation
      // slide prefers this over the deterministic SHARED.agentChat() fallback.
      agentChatScript:  state.agentChatScript  || null,
      cxComponents:     cxAll,
      assetLibrary:     state.assetLibrary || {},
      slideSections:    state.slideSections || [],
      // The exported /demo Demo section renders builderPlan.slides. Two things
      // never used to reach it: the synthetic journey timeline (manifest-only)
      // and the SE's manual reorder (state.slideOrder). Derive the demo-section
      // entries from the shared manifest helper — it injects the timeline FIRST
      // (before Agent Moments), honors the Step-5 selection gate, and applies
      // slideOrder. Non-demo authored slides pass through raw.
      slides:           (function () {
        const SHARED = (typeof global !== "undefined" && global.HOLO_SHARED) ||
                       (typeof window !== "undefined" && window.HOLO_SHARED) || null;
        const demoOrdered = (SHARED && SHARED.demoSlidesForExport)
          ? SHARED.demoSlidesForExport(state)
          : (state.slides || []).filter(function (s) {
              return !s.sectionId || s.sectionId === "demo";
            });
        const nonDemo = (state.slides || []).filter(function (s) {
          return s.sectionId && s.sectionId !== "demo";
        });
        return nonDemo.concat(demoOrdered).map(function (s, i) {
          const explicitCx = explicitBySlide[s.id] || [];
          // Merge: explicit links win, but preserve any pre-existing
          // linkedCxComponentIds (e.g. for native embeddedCxComponent
          // slides whose links were stamped earlier without going
          // through the explicit picker).
          const mergedCx = explicitCx.length
            ? explicitCx
            : (s.linkedCxComponentIds || []);
          const promotedLayout = (explicitCx.length || s.layout === "embeddedCxComponent")
            ? "embeddedCxComponent"
            : s.layout;
          return {
            order: i + 1, id: s.id, title: s.title, layout: promotedLayout,
            sectionId: s.sectionId || "demo",
            selectionStatus: s.selectionStatus || "",
            selectionRationale: s.selectionRationale || "",
            capabilities: s.capabilities || [],
            persona: s.persona || null,
            linkedCxComponentIds: mergedCx,
            deviceFrame: s.deviceFrame || "",
            speakerNotes: s.speakerNotes || "",
            // Per-slide narrative copy for the storyInterstitial layout (and any
            // future per-slide-text layouts). Harmless/empty for other layouts;
            // must round-trip so the exported /demo deck matches the preview.
            kicker:   s.kicker   || "",
            headline: s.headline || "",
            sub:      s.sub      || "",
            imageSlot: s.imageSlot || "",
          };
        });
      })(),
    };
  }

  // ─── Helpers ─────────────────────────────────────────────────
  // Text helpers delegate to HOLO_SHARED so the preview and export
  // use byte-identical truncation/sentence logic.
  function truncate(s, max) {
    return SHARED.truncate ? SHARED.truncate(s, max) : (function () {
      s = String(s || "").replace(/\s+/g, " ").trim();
      if (s.length <= max) return s;
      return s.slice(0, max - 1).replace(/\s+\S*$/, "") + "…";
    })();
  }
  function slug(s) {
    return String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 32) || "item";
  }
  function capitalize(s) { return String(s || "").replace(/^./, function (c) { return c.toUpperCase(); }); }

  // Pretty-printed JS object literal (unquoted identifier keys). Mirrors
  // config-generator.stringifyJs so SEs see a readable file.
  function stringifyJs(value, indent) {
    indent = indent || 2;
    return walk(value, 0);
    function walk(v, depth) {
      if (v === null || v === undefined) return "null";
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

  global.HOLO_ADAPTER = {
    toPolishedHolodeckConfig: toPolishedHolodeckConfig,
    toPolishedHolodeckConfigJs: toPolishedHolodeckConfigJs,
  };
})(window);
