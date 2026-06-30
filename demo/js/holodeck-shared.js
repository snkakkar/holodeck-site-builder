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
  // Punchy 1-2 word title via "educated consolidation": keep the first meaningful
  // segment (cut at the first connector), drop filler stopwords, cap at 2 significant
  // words. Never returns empty or an orphaned connector — falls back to shortenTitle.
  function punchyTitle(s) {
    const STOP = { the: 1, of: 1, a: 1, an: 1, to: 1, in: 1, for: 1, and: 1, "&": 1, with: 1, on: 1 };
    const orig = String(s || "").replace(/\s+/g, " ").trim();
    if (!orig) return "";
    // Cut at the first connector, keeping only the first segment.
    let seg = orig.split(/\s*(?:&|\band\b|:|—|–|\s-\s|,|\/)\s*/i)[0] || orig;
    let words = seg.split(/\s+/).filter(function (w) { return w; });
    // Drop leading/trailing filler stopwords.
    while (words.length && STOP[words[0].toLowerCase()]) words.shift();
    while (words.length && STOP[words[words.length - 1].toLowerCase()]) words.pop();
    if (!words.length) return shortenTitle(orig);
    return words.slice(0, 2).join(" ");
  }
  function isHeaderTitle(t) {
    return !t || /^(intro|opening|open|chapter\s|section\s|close|closing)/i.test(t);
  }
  // True when a title is empty or a generic placeholder ("Act 1", "Act 3b",
  // a bare section header). Used so the journey-map circles fall back to the
  // canonical stage name (PHASE_TITLES) instead of echoing "ACT N".
  function isGenericTitle(t) {
    t = String(t || "").trim();
    return !t || /^act\s*\d/i.test(t) || isHeaderTitle(t);
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
  // Vignette N mirrors Act N: title + subtitle are derived from the same
  // three-act objects (threeActsFor) so the intro vignettes and the
  // three-acts overview can never describe different things. Title and
  // eyebrow stay overridable via storyFoundations.vignetteTitles[i] /
  // vignetteEyebrows[i]; the default eyebrow comes from the act's product
  // tags so it reflects the act's actual products.
  function vignettesFor(f) {
    f = f || {};
    const acts = threeActsFor(f);
    const eOv = Array.isArray(f.vignetteEyebrows) ? f.vignetteEyebrows : [];
    const vtOv = Array.isArray(f.vignetteTitles) ? f.vignetteTitles : [];
    function ov(arr, i, def) { return (arr[i] && String(arr[i]).trim()) || def; }
    function eyebrowFromTags(tags) {
      const t = Array.isArray(tags) ? tags.slice(0, 2) : [];
      return t.length ? t.join(" · ").toUpperCase() : "SALESFORCE";
    }
    return acts.map(function (act, i) {
      return {
        eyebrow:  ov(eOv, i, eyebrowFromTags(act.tags)),
        title:    ov(vtOv, i, punchyTitle(act.title)),
        subtitle: truncate(act.description, 220),
      };
    });
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
    // Adaptive count: at least 3 circles, at most 5, never padded beyond the
    // real milestone count once we're above the floor of 3.
    const count = Math.max(3, Math.min(5, milestones.length || 0)) || 3;
    for (let i = 0; i < count; i++) {
      const a = milestones[i];
      out.push({
        index:        i,
        title:        a && a.title && !isGenericTitle(a.title) ? punchyTitle(a.title) : PHASE_TITLES[i],
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

  // ─── Branding tokens (theme 1) ────────────────────────────────
  // Resolve the active palette + which logo(s) to show from the
  // brand mode. Pure — both the demo shell and the builder preview
  // call this so a "customer-branded" demo looks identical in both.
  //   mode "salesforce" (default): Salesforce mark, brand palette.
  //   mode "customer":  lead with the customer logo.
  //   mode "cobrand":   show both marks side by side.
  // Back-compat: a brand object with no `mode` resolves to salesforce.
  function brandTokens(brand) {
    brand = brand || {};
    const mode = brand.mode || "salesforce";
    const sfLogo  = brand.logoPath || "";          // Salesforce-side / primary
    const custLogo = brand.customerLogoPath || "";  // customer mark
    return {
      mode: mode,
      primary:   brand.primaryColor   || "#b22234",
      secondary: brand.secondaryColor || "#1a5fa0",
      accent:    brand.accentColor    || "#f5c06a",
      // Which marks to render, in lockup order.
      showSalesforce: mode !== "customer",
      showCustomer:   mode !== "salesforce" && !!custLogo,
      // Primary lockup logo: customer leads in customer/cobrand when present.
      leadLogo: (mode !== "salesforce" && custLogo) ? custLogo : sfLogo,
      salesforceLogo: sfLogo,
      customerLogo: custLogo,
    };
  }

  // ─── Powered-by attribution (theme 4) ─────────────────────────
  // Derive an ordered, deduped "Powered by Salesforce" product list
  // from what the SE selected PLUS what the story actually exercises
  // (capability moments → product labels). This makes the attribution
  // evidence-driven instead of a single static chip.
  //   - SE-selected products always lead (their explicit intent).
  //   - Capability buckets that have moments add their product.
  //   - If the SE pinned the list (poweredBy.auto === false), respect it.
  // Pure + deterministic; never returns empty (falls back to Data Cloud).
  function poweredByProducts(input) {
    input = input || {};
    const pinned = input.poweredBy && input.poweredBy.auto === false
      ? (input.poweredBy.products || []) : null;
    if (pinned && pinned.length) return uniqStrings(pinned);

    const selected = (input.products || []).filter(Boolean);
    const f = input.storyFoundations || {};
    // capability bucket (storyFoundations.<key>Moments) → product label
    const bucketProduct = {
      agentforceMoments: "Agentforce",
      dataCloudMoments:  "Data Cloud",
      commerceMoments:   "Commerce",
      marketingMoments:  "Marketing Cloud",
      serviceMoments:    "Service Cloud",
      loyaltyMoments:    "Loyalty",
    };
    const fromStory = [];
    Object.keys(bucketProduct).forEach(function (k) {
      const arr = f[k];
      if (Array.isArray(arr) && arr.length) fromStory.push(bucketProduct[k]);
    });
    const merged = uniqStrings(selected.concat(fromStory));
    return merged.length ? merged : ["Data Cloud"];
  }
  function uniqStrings(arr) {
    const seen = {}; const out = [];
    (arr || []).forEach(function (v) {
      const s = String(v || "").trim();
      if (!s) return;
      const key = s.toLowerCase();
      if (seen[key]) return;
      seen[key] = true; out.push(s);
    });
    return out;
  }

  // ─── Unified-profile facets (theme 3) ─────────────────────────
  // The unified-profile slide used to be one shallow card. Data Cloud
  // really unifies several FACETS, so return an ordered set of them for
  // an in-slide carousel. Every facet is derived/defaulted so none is
  // ever empty. Consumed by both the demo renderer and preview.
  //   { key, label, eyebrow, rows: [{ label, value }] }
  function profileFacets(input) {
    input = input || {};
    const p = input.persona || {};
    const prods = (input.products || []).filter(Boolean);
    const f = input.storyFoundations || {};
    const first = personaFirstName(p) || (p.name || "the customer");
    const pron = pronounsFor(p.pronouns);
    const hasAgentforce = prods.indexOf("Agentforce") >= 0;
    // Persona stats ({value,label}) double as concrete profile facts when present.
    const stats = (Array.isArray(p.stats) ? p.stats : []).filter(function (s) {
      return s && (String(s.value || "").trim() || String(s.label || "").trim());
    });
    function statRow(i, fallbackLabel, fallbackValue) {
      const s = stats[i];
      if (s && String(s.value || "").trim()) {
        return { label: shortenTitle(s.label) || fallbackLabel, value: truncate(s.value, 36) };
      }
      return { label: fallbackLabel, value: fallbackValue };
    }

    const facets = [];

    // 1. Identity — who Data Cloud resolved this person to be (deepened).
    facets.push({
      key: "identity", label: "Identity", eyebrow: "Resolved profile",
      rows: [
        { label: "Name",        value: p.name || p.fullName || "[TODO: persona name]" },
        { label: "Role",        value: p.role || p.jobTitle || "[TODO: persona role]" },
        { label: "Segment",     value: p.customerOf || (input.industry ? input.industry + " customer" : "Known customer") },
        { label: "Pronouns",    value: pron.nom + "/" + pron.obj },
        { label: "Profile",     value: "Unified across web, mobile & store" },
        { label: "Match confidence", value: "98% — single resolved identity" },
      ],
    });

    // 2. Demographics & context — the "who/where" Data Cloud stitches together.
    facets.push({
      key: "demographics", label: "Demographics", eyebrow: "Who & where",
      rows: [
        statRow(0, "Location", "Metro area · mobile-first"),
        statRow(1, "Lifecycle stage", "Active customer"),
        { label: "Preferred device", value: "Mobile (iOS)" },
        { label: "Industry",  value: input.industry || (p.customerOf || "Retail / DTC") },
      ],
    });

    // 3. Affinities — what the behavioral data says they care about (deepened).
    const affinitySource = Array.isArray(p.wishlist) && p.wishlist.length
      ? p.wishlist
      : (Array.isArray(f.valueDrivers) ? f.valueDrivers : []);
    const affinityRows = affinitySource.slice(0, 5).map(function (w, i) {
      const label = typeof w === "string" ? w : (w && (w.title || w.label)) || ("Affinity " + (i + 1));
      return { label: shortenTitle(label) || ("Affinity " + (i + 1)), value: i === 0 ? "Very high" : "High" };
    });
    facets.push({
      key: "affinities", label: "Affinities", eyebrow: "Behavioral signals",
      rows: affinityRows.length ? affinityRows : [
        { label: "Category interest", value: "High" },
        { label: "Price sensitivity", value: "Medium" },
        { label: "Brand loyalty",     value: "High" },
        { label: "Channel: mobile",   value: "High" },
      ],
    });

    // 4. Real-time signals — recent moments that drive the next action (deepened).
    const moments = []
      .concat(Array.isArray(f.customerMoments) ? f.customerMoments : [])
      .concat(Array.isArray(f.dataCloudMoments) ? f.dataCloudMoments : []);
    const signalRows = moments.slice(0, 5).map(function (m, i) {
      return { label: "Signal " + (i + 1), value: truncate(typeof m === "string" ? m : (m && m.summary) || "", 40) };
    });
    facets.push({
      key: "signals", label: "Real-time signals", eyebrow: "Live activity",
      rows: signalRows.length ? signalRows : [
        { label: "Last seen",   value: "Browsing on mobile" },
        { label: "Cart",        value: "1 item, not purchased" },
        { label: "Engagement",  value: "Opened last 3 emails" },
        { label: "Recency",     value: "Active in the last hour" },
      ],
    });

    // 5. Channels & engagement — where and how this person is reachable.
    facets.push({
      key: "engagement", label: "Channels", eyebrow: "Engagement & reach",
      rows: [
        { label: "Primary channel", value: "Mobile app & SMS" },
        { label: "Email",       value: "Opted in · highly engaged" },
        { label: "Best time",   value: "Evenings & weekends" },
        { label: "Consent",     value: "Marketing + service permitted" },
      ],
    });

    // 6. Value — the lifetime-value lens that justifies proactive action.
    facets.push({
      key: "value", label: "Lifetime value", eyebrow: "Worth & loyalty",
      rows: [
        statRow(2, "Lifetime value", "High-value · top decile"),
        { label: "Loyalty tier", value: "Established member" },
        { label: "Repeat rate",  value: "Returns regularly" },
        { label: "Churn risk",   value: hasAgentforce ? "Elevated — recoverable" : "Low" },
      ],
    });

    // 7. Predicted needs — the "so what" Agentforce can act on (deepened).
    facets.push({
      key: "predicted", label: "Predicted needs", eyebrow: "AI propensity",
      rows: [
        { label: "Next best action", value: hasAgentforce ? "Proactive agent outreach" : "Personalized offer" },
        { label: "Propensity to buy", value: "High — primed to convert" },
        { label: "Predicted intent", value: "Browsing → ready to purchase" },
        { label: "Recommended for " + first, value: pron.poss + " top affinity" },
      ],
    });

    return facets;
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
  function buildSlideManifest(state, opts) {
    state = state || {};
    const out = [];
    // includeDeselected: when true, emit EVERY synthetic slide regardless of
    // selection. The Step-5 selector passes this so deselected slides stay
    // visible (parked) and re-selectable. The runtime/preview/export paths
    // omit it, so they still drop deselected slides.
    const includeDeselected = !!(opts && opts.includeDeselected);
    // Selection gate: a synthetic slide is emitted unless the SE explicitly
    // de-selected it in Step 5. selectedRecIds maps id → bool; an id ABSENT
    // from the map means "default on" (so legacy state / first run is
    // unchanged), an id present and falsy means "turned off".
    const sel = state.selectedRecIds || {};
    function isEnabled(id) {
      if (!id) return true;
      return !(id in sel) || !!sel[id];
    }
    function add(entry) {
      // Skip synthetic slides the SE de-selected; non-synthetic always added.
      if (!includeDeselected && entry && entry.synthetic && entry.id && !isEnabled(entry.id)) return;
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
            "Theme (top label / eyebrow)":
                             { path: "project.theme",
                               prefill: function (sl, st) {
                                 st = st || {};
                                 return ((st.project && st.project.theme) || "").trim()
                                   || "Salesforce Customer Experience Vision";
                               } },
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
            // fallback. Labelled so the precedence is clear. Prefill the
            // sub with the rendered default so it's never blank.
            "Sub-line · business problem":      { path: "storyFoundations.businessProblem",
                                                  prefill: function (sl, st) {
                                                    st = st || {};
                                                    return storyHookSubText(st.storyFoundations || {});
                                                  } },
            "Sub-line · primary narrative":     "storyFoundations.primaryNarrative",
            "Theme (top label / eyebrow)":      { path: "project.theme",
                                                  prefill: function (sl, st) {
                                                    st = st || {};
                                                    return ((st.project && st.project.theme) || "").trim()
                                                      || "Salesforce Customer Experience Vision";
                                                  } },
          } });
    add({ id: "_rt_intro_three", synthetic: true, sectionId: "intro",
          layout: "introThreeActs", title: "Three acts (vi-3)",
          editorPaths: {
            // Eyebrow + headline are top-of-slide labels; new state fields,
            // both read via fOr(...,default) by the renderer so an old
            // project (no value) still shows the literal default.
            "Eyebrow (small label above the title)":
                                        { path: "storyFoundations.threeActsEyebrow",
                                          prefill: function () { return "What you'll see today"; } },
            "Headline":                 { path: "storyFoundations.threeActsHeadline",
                                          prefill: function () { return "Three acts. One agentic journey."; } },
            // Single-line, 1:1 with each act's description. Each binds to
            // index [0] of the moments array the renderer (threeActsFor)
            // actually reads, so what you type is what shows. Prefill the
            // title + description with the rendered default.
            "Act 1 title":              { path: "storyFoundations.threeActTitles[0]",
                                          prefill: function (sl, st) {
                                            return threeActsFor((st || {}).storyFoundations || {})[0].title;
                                          } },
            "Act 1 · Know & Reach":     { path: "storyFoundations.dataCloudMoments[0]",
                                          prefill: function (sl, st) {
                                            return threeActsFor((st || {}).storyFoundations || {})[0].description;
                                          } },
            "Act 2 title":              { path: "storyFoundations.threeActTitles[1]",
                                          prefill: function (sl, st) {
                                            return threeActsFor((st || {}).storyFoundations || {})[1].title;
                                          } },
            "Act 2 · Engage & Recover": { path: "storyFoundations.commerceMoments[0]",
                                          prefill: function (sl, st) {
                                            return threeActsFor((st || {}).storyFoundations || {})[1].description;
                                          } },
            "Act 3 title":              { path: "storyFoundations.threeActTitles[2]",
                                          prefill: function (sl, st) {
                                            return threeActsFor((st || {}).storyFoundations || {})[2].title;
                                          } },
            "Act 3 · Convert":          { path: "storyFoundations.agentforceMoments[0]",
                                          prefill: function (sl, st) {
                                            return threeActsFor((st || {}).storyFoundations || {})[2].description;
                                          } },
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
              // Prefill eyebrow/title/subtitle with the rendered default for
              // THIS vignette (by index) so each card shows real, distinct
              // text instead of a blank field (fixes the blank-subtitle case).
              ep["Eyebrow (small label above the title)"] =
                { path: "storyFoundations.vignetteEyebrows[" + i + "]",
                  prefill: function (sl, st) {
                    return vignettesFor((st || {}).storyFoundations || {})[i].eyebrow;
                  } };
              ep["Title"] =
                { path: "storyFoundations.vignetteTitles[" + i + "]",
                  prefill: function (sl, st) {
                    return vignettesFor((st || {}).storyFoundations || {})[i].title;
                  } };
              ep[vigLabel] =
                { path: "storyFoundations." + vigField + "[0]",
                  prefill: function (sl, st) {
                    return vignettesFor((st || {}).storyFoundations || {})[i].subtitle;
                  } };
              return ep;
            })() });
    });

    // JOURNEY MAP ─ single 5-phase matrix slide
    add({ id: "_rt_journey_matrix", synthetic: true, sectionId: "journey-map",
          layout: "journeyMapMatrix", title: "Journey map",
          editorPaths: {
            "Eyebrow (small label above the title)":
                                     { path: "storyFoundations.journeyEyebrow",
                                       prefill: function (sl, st) {
                                         st = st || {};
                                         const cn = (st.project && st.project.customerName) || "";
                                         return cn ? cn + " · journey" : "Customer journey";
                                       } },
            "Customer name":         "project.customerName",
            "Products":              "project.products",
            "Transformation thesis": { path: "storyFoundations.transformationThesis",
                                       prefill: function (sl, st) {
                                         st = st || {};
                                         const t = (st.storyFoundations && st.storyFoundations.transformationThesis) || "";
                                         return t.trim() || "A connected journey";
                                       } },
          } });
    // Journey timeline (above/below-the-line milestones). Recommended (not
    // required) so SEs can trim it. Its editor only surfaces when the slide
    // is kept. Timeline events live in storyFoundations.timelineEvents — a
    // dedicated override array so the timeline editor never mutates
    // storyActs (which demoMap + scenePhoto also read).
    add({ id: "_rt_journey_timeline", synthetic: true, sectionId: "journey-map",
          layout: "journeyTimeline", title: "Journey timeline",
          editorPaths: {
            "Eyebrow (small label above the title)":
                                  { path: "storyFoundations.journeyTimelineEyebrow",
                                    prefill: function () { return "The Customer Journey"; } },
            "Headline":           { path: "storyFoundations.journeyTimelineHeadline",
                                    prefill: function () { return "One journey. Every channel. Always personal."; } },
            "Sub-line":           { path: "storyFoundations.journeyTimelineSub",
                                    prefill: function (sl, st) {
                                      st = st || {};
                                      const t = (st.storyFoundations && st.storyFoundations.transformationThesis) || "";
                                      return t.trim() || "From one moment, AI turns identity into months of personalized engagement.";
                                    } },
            // Timeline events — resolves to the dynamic list-objects editor
            // (add / remove / reorder + per-row icon picker). Blank = fall
            // back to storyActs at render time, so legacy projects are
            // unchanged. Prefill seeds the rows from storyActs so the SE
            // edits real moments instead of an empty list.
            "Timeline events":    { path: "storyFoundations.timelineEvents",
                                    prefill: function (sl, st) {
                                      st = st || {};
                                      const acts = (st.storyActs || []).slice(0, 7);
                                      const months = ["DEC","JAN","FEB","MAR","APR","MAY","JUN","JUL"];
                                      return acts.map(function (a, i) {
                                        return {
                                          month:   a.timing || months[i] || "",
                                          label:   a.title || a.demoMoment || ("Moment " + (i + 1)),
                                          sub:     a.channel || "",
                                          channel: a.channel || "",
                                          icon:    "",
                                        };
                                      });
                                    } },
          } });

    // MEET PERSONA ─ mr-1 intro, mr-2 spotlight, mr-3 wishlist, mr-4 CTA
    add({ id: "_rt_persona_intro", synthetic: true, sectionId: "meet-persona",
          layout: "personaIntro", title: "Meet persona (mr-1)",
          editorPaths: {
            "Eyebrow (small label above the title)":
                               { path: "storyFoundations.personaIntroEyebrow",
                                 prefill: function () { return "Customer Spotlight"; } },
            "Persona name (headline shows first name)": "personas[0].name",
            "Customer name":   "project.customerName",
            // Sub-line: "<Customer> · <journey arc>". demoRelevance wins,
            // goals is the fallback (matches personaIntroSub). Prefill the
            // winning field with the rendered sub so it isn't blank.
            "Sub-line · demo relevance (wins)":
                               { path: "personas[0].demoRelevance",
                                 prefill: function (sl, st) {
                                   st = st || {};
                                   const p = (st.personas && st.personas[0]) || {};
                                   return personaIntroSub(p, (st.project && st.project.customerName) || "");
                                 } },
            "Sub-line · goals (fallback)":      "personas[0].goals",
          } });
    add({ id: "_rt_persona_card", synthetic: true, sectionId: "meet-persona",
          layout: "personaCard", title: "Spotlight · stats + quote (mr-2)",
          editorPaths: {
            "Persona name (full)": "personas[0].name",
            "Role (top label)":    "personas[0].role",
            // Job title defaults to the role when blank (mirrors the
            // renderer + adapter) — prefill with role so it's not empty.
            "Job title":           { path: "personas[0].jobTitle",
                                     prefill: function (sl, st) {
                                       st = st || {};
                                       const p = (st.personas && st.personas[0]) || {};
                                       return p.jobTitle || p.role || "";
                                     } },
            // Three stats; rows fall back to the [TODO]/Top Moment/Tradition/
            // Signal defaults the renderer + adapter use. Seed the rows so
            // the SE edits real placeholders instead of an empty list.
            "Stats":               { path: "personas[0].stats",
                                     prefill: function () {
                                       return [
                                         { value: "[TODO]", label: "Top Moment" },
                                         { value: "[TODO]", label: "Tradition"  },
                                         { value: "[TODO]", label: "Signal"     },
                                       ];
                                     } },
            // Quote = pain points, falling back to goals. Prefill with the
            // rendered quote text (pain points wins).
            "Quote (pain points)": { path: "personas[0].painPoints",
                                     prefill: function (sl, st) {
                                       st = st || {};
                                       const p = (st.personas && st.personas[0]) || {};
                                       return p.painPoints || p.goals || "";
                                     } },
            // Quote falls back to goals when pain points is empty — expose it.
            "Quote fallback · goals": "personas[0].goals",
          } });
    add({ id: "_rt_persona_wishlist", synthetic: true, sectionId: "meet-persona",
          layout: "personaWishlist", title: "Wishlist (mr-3)",
          editorPaths: {
            // Seed the cards/label/headline with the same pronoun-aware
            // defaults the renderer + adapter use, so the SE edits real rows
            // (names, tags, emoji) instead of an empty list.
            "Wishlist":          { path: "personas[0].wishlist",
                                   prefill: function (sl, st) {
                                     st = st || {};
                                     const p = (st.personas && st.personas[0]) || {};
                                     return defaultWishlist(pronounsFor(p.pronouns));
                                   } },
            "Wishlist label":    { path: "personas[0].wishlistLabel",
                                   prefill: function (sl, st) {
                                     st = st || {};
                                     const p = (st.personas && st.personas[0]) || {};
                                     const first = personaFirstName(p);
                                     return first ? (first + "'s Wishlist") : "Wishlist";
                                   } },
            "Wishlist headline": { path: "personas[0].wishlistHeadline",
                                   prefill: function (sl, st) {
                                     st = st || {};
                                     const p = (st.personas && st.personas[0]) || {};
                                     const stored = p.wishlistHeadline;
                                     return (stored && !isLegacyWishlistHeadline(stored))
                                       ? String(stored).replace(/<\/?[^>]+>/g, "")
                                       : wishlistHeadlineFor(pronounsFor(p.pronouns));
                                   } },
            "Pronouns":          "personas[0].pronouns",
          } });
    add({ id: "_rt_persona_cta", synthetic: true, sectionId: "meet-persona",
          layout: "personaCta", title: "Begin the journey (mr-4)",
          editorPaths: {
            "Eyebrow (small label above the title)":
                                { path: "storyFoundations.personaCtaEyebrow",
                                  prefill: function () { return "The Customer Journey"; } },
            // CTA button label — prefill the shared default (arrow + caps),
            // stripped of the &nbsp; the export keeps.
            "CTA button label": { path: "storyFoundations.personaCtaLabel",
                                  prefill: function (sl, st) {
                                    st = st || {};
                                    const cta = personaCtaCopy((st.personas && st.personas[0]) || {},
                                                               st.story || {}, st.storyFoundations || {});
                                    return String(cta.label).replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
                                  } },
            "Persona name":     "personas[0].name",
            // Sub-line: demoRelevance wins over futureVision (relabeled so
            // the precedence is clear — editing futureVision is dead when
            // demoRelevance is set). Prefill the winning field with the
            // rendered CTA sub.
            "Sub-line · demo relevance (wins)":
                                { path: "personas[0].demoRelevance",
                                  prefill: function (sl, st) {
                                    st = st || {};
                                    const cta = personaCtaCopy((st.personas && st.personas[0]) || {},
                                                               st.story || {}, st.storyFoundations || {});
                                    return cta.sub;
                                  } },
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
            "Eyebrow (small label above the title)":
                        { path: "storyFoundations.bvOpenerEyebrow",
                          prefill: function () { return "The Business Outcome"; } },
            "Headline": { path: "storyFoundations.bvOpenerHeadline",
                          prefill: function () { return "A completely connected journey. Driven by AI."; } },
            "Sub-line": { path: "storyFoundations.bvOpenerSub",
                          prefill: function () { return "Higher conversion. Increased AOV. Lifelong loyalty."; } },
          } });
    add({ id: "_rt_bv_orbit", synthetic: true, sectionId: "business-value",
          layout: "bvOrbit", title: "Orbit (bv-2)",
          editorPaths: {
            "Eyebrow (small label above the title)":
                             { path: "storyFoundations.bvOrbitEyebrow",
                               prefill: function () { return "How it all connects"; } },
            "Headline":      { path: "storyFoundations.bvOrbitHeadline",
                               prefill: function (sl, st) {
                                 st = st || {};
                                 const cn = (st.project && st.project.customerName) || "";
                                 return cn ? cn + " · the orbit" : "One platform. Every moment.";
                               } },
            "Customer name": "project.customerName",
            "Products (orbit node labels)": "project.products",
            "Orbit nodes":   "storyFoundations.orbitNodes",
          } });
    add({ id: "_rt_bv_caps", synthetic: true, sectionId: "business-value",
          layout: "bvCapabilities", title: "Capabilities recap (bv-3)",
          editorPaths: {
            "Eyebrow (small label above the title)":
                            { path: "storyFoundations.bvCapsEyebrow",
                              prefill: function () { return "Key Capabilities Shown Today"; } },
            "Headline":     { path: "storyFoundations.bvCapsHeadline",
                              prefill: function () { return "Personalize. Search. Convert."; } },
            "Products":     "project.products",
            "Capabilities": "storyFoundations.capabilities",
          } });
    add({ id: "_rt_bv_scorecard", synthetic: true, sectionId: "business-value",
          layout: "kpiScorecard", title: "BVS scorecard (bv-4)",
          editorPaths: {
            "Eyebrow (small label above the title)":
                           { path: "storyFoundations.bvScorecardEyebrow",
                             prefill: function () { return "BVS Benchmarks"; } },
            "Headline":    { path: "storyFoundations.bvScorecardHeadline",
                             prefill: function () { return "The numbers that matter."; } },
            "BVS metrics": "storyFoundations.bvsMetrics",
            "Disclaimer":  "storyFoundations.bvScorecardDisclaimer",
          } });
    add({ id: "_rt_bv_closing", synthetic: true, sectionId: "business-value",
          layout: "bvClosing", title: "Closing quote (bv-5)",
          editorPaths: {
            "Eyebrow (small label above the title)":
                                  { path: "storyFoundations.bvClosingEyebrow",
                                    prefill: function (sl, st) {
                                      st = st || {};
                                      return ((st.project && st.project.customerName) || "Customer") + " + Salesforce";
                                    } },
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

  // mr-3 wishlist empty-state defaults — shared so the preview tile and the
  // exported deck show identical placeholder rows (name, tag, detail, emoji).
  // `pron` (from pronounsFor) is optional; when present the first row's tag
  // reads "FOR <obj>", else the canonical "PRIMARY CONSIDERATION".
  function defaultWishlist(pron) {
    const firstTag = pron && pron.obj ? ("FOR " + String(pron.obj).toUpperCase()) : "PRIMARY CONSIDERATION";
    return [
      { name: "[TODO: top product]",       tag: firstTag,           detail: "[TODO]", emoji: "🛍️" },
      { name: "[TODO: companion]",         tag: "AI MATCH",         detail: "[TODO]", emoji: "✨" },
      { name: "[TODO: complete-the-look]", tag: "COMPLETE THE LOOK", detail: "[TODO]", emoji: "🎁" },
    ];
  }

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

  // ─── Channel icon catalog ─────────────────────────────────────
  // Single source of truth for the channel → emoji mapping used by the
  // journey timeline and demo-map nodes. The builder's timeline-event
  // editor renders these as a pickable icon strip; the /demo renderer's
  // channelIcon() derives from this list. Order = picker display order.
  // Each entry: { key (canonical channel), icon, match (keyword regex) }.
  const CHANNEL_ICONS = [
    { key: "email",  icon: "📧",  match: /email/ },
    { key: "sms",    icon: "💬",  match: /sms|text|imessage/ },
    { key: "social", icon: "📸",  match: /insta|social|facebook|tiktok/ },
    { key: "store",  icon: "🏪",  match: /store|pos|in-?person/ },
    { key: "web",    icon: "🖥️",  match: /web|site|browse/ },
    { key: "mobile", icon: "📱",  match: /mobile|app|phone/ },
    { key: "cart",   icon: "🛒",  match: /cart|checkout|purch/ },
    { key: "agent",  icon: "🤖",  match: /agent|chat/ },
  ];

  // Map a free-text channel string to its emoji. Mirrors the original
  // inline channelIcon() (kept order-sensitive: SMS-style keywords are
  // tested before the generic "mobile/phone" bucket). "•" = no match.
  function channelIcon(channel) {
    const c = String(channel || "").toLowerCase().trim();
    if (!c) return "•";
    // An exact catalog key wins (e.g. the icon-picker stores "store").
    for (let i = 0; i < CHANNEL_ICONS.length; i++) {
      if (CHANNEL_ICONS[i].key === c) return CHANNEL_ICONS[i].icon;
    }
    // SMS/text keywords first so "text message" doesn't fall to mobile.
    const sms = CHANNEL_ICONS.find(function (e) { return e.key === "sms"; });
    if (sms && sms.match.test(c)) return sms.icon;
    for (let i = 0; i < CHANNEL_ICONS.length; i++) {
      if (CHANNEL_ICONS[i].key !== "sms" && CHANNEL_ICONS[i].match.test(c)) return CHANNEL_ICONS[i].icon;
    }
    return "•";
  }

  // ─── Public API ──────────────────────────────────────────────
  global.HOLO_SHARED = {
    // text helpers
    truncate:                truncate,
    cleanHeadline:           cleanHeadline,
    oneSentence:             oneSentence,
    shortenTitle:            shortenTitle,
    isHeaderTitle:           isHeaderTitle,
    isGenericTitle:          isGenericTitle,
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
    // branding + attribution + profile depth
    brandTokens:             brandTokens,
    poweredByProducts:       poweredByProducts,
    profileFacets:           profileFacets,
    // persona
    personaFirstName:        personaFirstName,
    personaCtaCopy:          personaCtaCopy,
    personaIntroSub:         personaIntroSub,
    // chapter opener
    chapterOpenerCopy:       chapterOpenerCopy,
    // demo-section SE layouts (preview ↔ export)
    demoFlowSteps:           demoFlowSteps,
    agentChat:               agentChat,
    // channel icons (timeline + demo-map)
    CHANNEL_ICONS:           CHANNEL_ICONS,
    channelIcon:             channelIcon,
    nextStepsPhases:         nextStepsPhases,
    defaultWishlist:         defaultWishlist,
    emojiForIndustry:        emojiForIndustry,
    // slide manifest
    buildSlideManifest:      buildSlideManifest,
  };
})(typeof window !== "undefined" ? window : globalThis);
