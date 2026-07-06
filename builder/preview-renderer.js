// ════════════════════════════════════════════════════════════════
//  PREVIEW RENDERER  ⚠ INDICATIVE BUILDER PREVIEWS — NOT PRODUCTION OUTPUT
//
//  WHAT THIS FILE IS:
//    Lightweight, in-builder slide thumbnails. SEs use these to scan
//    their slide plan and confirm content is flowing correctly. They
//    are simplified renderings — useful for review, NOT customer-ready.
//
//  WHAT THIS FILE IS NOT:
//    The final customer-facing Holodeck output. That comes from the
//    polished /demo template — see holodeck-adapter.js + zip-exporter.js.
//    The exported ZIP ships a verbatim copy of the /demo template files
//    (HTML, 7 CSS files, runtime JS, device frames) plus an adapted
//    holodeck.config.js that drives them.
//
//  THE TWO RENDER PATHS — DO NOT CONFUSE
//    Builder UI       → preview-renderer.js  (this file — review only)
//    Customer demo    → /demo template + holodeck-adapter.js  (production)
//
//  Two modes for the in-builder preview:
//    • compact   — small card for scanning slide order
//    • expanded  — closer approximation of the final screen, still indicative
//
//  Public API:
//    HOLO_PREVIEW.renderPreviewCard(slide, state, handlers)
//      returns the SE-facing card (header, mode-aware preview, actions)
//    HOLO_PREVIEW.renderSlidePreview(slide, state, mode)
//      returns just the layout preview (used by the full-demo modal)
//    HOLO_PREVIEW.getPreviewDataForSlide(slide, state)
//      returns the resolved data each layout uses
//    HOLO_PREVIEW.getMissingInputsForPreview(slide, state)
//      returns a list of human-readable missing inputs
//    HOLO_PREVIEW.assetReadiness(asset)
//      → "ready" | "placeholder" | "url" | "missing" | "optional"
// ════════════════════════════════════════════════════════════════

(function (global) {
  "use strict";

  // ─── State-path utilities ──────────────────────────────────────
  // Resolve dotted/indexed paths like "personas[0].wishlistHeadline"
  // against a root object. Used by the inline popover editor so every
  // text field on every preview slide can bind to its canonical state
  // location with a one-line declaration in the runtime manifest.
  function parsePath(path) {
    const out = [];
    String(path || "").split(".").forEach(function (seg) {
      const m = seg.match(/^([^\[]+)((?:\[\d+\])*)$/);
      if (!m) { out.push(seg); return; }
      out.push(m[1]);
      const idx = m[2] || "";
      const rx = /\[(\d+)\]/g;
      let r;
      while ((r = rx.exec(idx))) out.push(parseInt(r[1], 10));
    });
    return out;
  }
  function getAtPath(root, path) {
    const parts = parsePath(path);
    let cur = root;
    for (let i = 0; i < parts.length; i++) {
      if (cur == null) return undefined;
      cur = cur[parts[i]];
    }
    return cur;
  }
  function setAtPath(root, path, value) {
    const parts = parsePath(path);
    if (!parts.length) return;
    let cur = root;
    for (let i = 0; i < parts.length - 1; i++) {
      const key = parts[i];
      const nextKey = parts[i + 1];
      if (cur[key] == null) cur[key] = (typeof nextKey === "number") ? [] : {};
      // If we're indexing into something that wasn't an array, leave it alone.
      cur = cur[key];
    }
    cur[parts[parts.length - 1]] = value;
  }

  // ─── Shared copy generators ────────────────────────────────────
  // Pure helpers (pronouns, stance, BVS, journey, opener copy, slide
  // manifest) live in holodeck-shared.js so the in-builder preview
  // and the exported polished template render the same defaults.
  // Local fallbacks here keep the preview from breaking if the shared
  // module fails to load (the build will still degrade gracefully).
  const SHARED = global.HOLO_SHARED || {};
  function pronounsFor(value) {
    return SHARED.pronounsFor ? SHARED.pronounsFor(value) : { subj: "Her", obj: "her", poss: "her", nom: "she" };
  }
  function wishlistHeadlineFor(pron) {
    return SHARED.wishlistHeadlineFor
      ? SHARED.wishlistHeadlineFor(pron, { wrapStrong: false })
      : pron.subj + " top 3. Picked just for " + pron.obj + ".";
  }
  function isLegacyWishlistHeadline(s) {
    return SHARED.isLegacyWishlistHeadline ? SHARED.isLegacyWishlistHeadline(s) : false;
  }

  // ─── DOM helper ────────────────────────────────────────────────
  function el(tag, attrs, children) {
    const node = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === "class") node.className = attrs[k];
      else if (k === "style") node.setAttribute("style", attrs[k]);
      else if (k === "html") node.innerHTML = attrs[k];
      else if (k === "text") node.textContent = attrs[k];
      else if (k === "on") {
        Object.keys(attrs[k]).forEach(function (ev) { node.addEventListener(ev, attrs[k][ev]); });
      }
      else node.setAttribute(k, attrs[k]);
    });
    (children || []).forEach(function (c) {
      if (c == null || c === false) return;
      node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    });
    return node;
  }

  // ─── Data resolution ───────────────────────────────────────────
  // Pull the right inputs out of state for a given slide. This is the
  // single source of truth — every layout reads from getPreviewDataForSlide.
  function getPreviewDataForSlide(slide, state) {
    state = state || {};
    const project = state.project || {};
    const brand = state.brand || {};
    const story = state.story || {};
    const personas = state.personas || [];
    const acts = state.storyActs || [];
    const persona = (slide && slide.persona)
      ? personas.find(function (p) { return p.name === slide.persona; }) || personas[0] || null
      : personas[0] || null;

    const customerName = project.customerName || "";
    const industry = project.industry || "";
    const audience = project.audience || "";
    const stage = project.salesStage || "";
    const products = (project.products || []).slice();

    const capabilities = (slide && slide.capabilities && slide.capabilities.length)
      ? slide.capabilities
      : products;

    return {
      slide: slide || {},
      title: (slide && slide.title) || "Untitled",
      eyebrow: deriveEyebrow(slide, project),
      customerName: customerName,
      industry: industry,
      audience: audience,
      salesStage: stage,
      brand: {
        primary:   brand.primaryColor   || "#b22234",
        secondary: brand.secondaryColor || "#1a5fa0",
        accent:    brand.accentColor    || "#f5c06a",
        logoPath:  brand.logoPath       || "",
        mode:            brand.mode || "salesforce",
        customerLogoPath: brand.customerLogoPath || "",
      },
      products: products,
      capabilities: capabilities,
      persona: persona,
      personas: personas,
      acts: acts,
      story: {
        bigProblem:        story.bigProblem || "",
        currentPain:       story.currentPain || "",
        futureVision:      story.futureVision || "",
        executiveTakeaway: story.executiveTakeaway || "",
        agentforceMoments: story.agentforceMoments || "",
        dataCloudMoments:  story.dataCloudMoments || "",
        businessValueMoments: story.businessValueMoments || "",
      },
      theme: project.theme || "",
      project: project,
      speakerNotes: (slide && slide.speakerNotes) || "",
      assets: (slide && slide.assets) || [],
      kpis: deriveKpis(state),
      tone: project.tone || "",
      foundations: state.storyFoundations || {},
      cxComponents: state.cxComponents || [],
      linkedCxComponents: linkedCxFor(slide, state),
    };
  }

  function linkedCxFor(slide, state) {
    if (!slide || !slide.linkedCxComponentIds || !slide.linkedCxComponentIds.length) return [];
    const cx = state && state.cxComponents || [];
    return slide.linkedCxComponentIds
      .map(function (id) { return cx.find(function (c) { return c.id === id; }); })
      .filter(Boolean);
  }

  function deriveEyebrow(slide, project) {
    const parts = [];
    if (project && project.industry)   parts.push(project.industry);
    if (project && project.salesStage) parts.push(project.salesStage);
    if (slide && slide.layout) {
      const map = {
        agentConversation: "Agentforce moment",
        unifiedProfile:    "Data Cloud · Unified Profile",
        architecture:      "Solution Architecture",
        deviceMoment:      "Channel moment",
        kpiScorecard:      "Business Value",
        executiveSummary:  "Executive view",
        journeyTimeline:   "Customer journey",
        demoMap:           "Demo map",
        personaCard:       "Meet the persona",
        hero:              "Holodeck",
      };
      if (map[slide.layout]) parts.unshift(map[slide.layout]);
    }
    return parts.slice(0, 2).join(" · ");
  }

  // Reasonable KPI defaults driven off products + industry.
  function deriveKpis(state) {
    const products = (state.project && state.project.products) || [];
    const industry = (state.project && state.project.industry) || "";
    const out = [];
    function push(value, label, hint) { out.push({ value: value, label: label, hint: hint }); }
    if (industry === "Retail" || industry === "Consumer Goods" || products.indexOf("Commerce") >= 0) {
      push("XX%",  "Conversion Lift",   "from personalized journeys");
      push("+$XX", "Average Order Value","with AI recommendations");
    }
    if (products.indexOf("Loyalty") >= 0) push("XX%", "Loyalty Enrollment", "tier upgrades & sign-ups");
    if (products.indexOf("Service Cloud") >= 0 || products.indexOf("Agentforce") >= 0) {
      push("XX%", "Service Efficiency", "agent + autonomous deflection");
    }
    if (industry === "Hospitality" || industry === "Travel") push("XXx", "Repeat Booking Rate", "across stays / trips");
    if (industry === "Financial Services" || industry === "Healthcare") push("XX%", "Time-to-First-Value", "vs. legacy stack");
    if (out.length < 3) push("XX%", "Revenue Lift", "from connected experiences");
    if (out.length < 4) push("XXh", "Time Saved",   "per associate per week");
    return out.slice(0, 5);
  }

  // ─── Missing-input detection ──────────────────────────────────
  // What a given layout actually depends on. Returns human-readable
  // labels so we can surface them on the preview.
  function getMissingInputsForPreview(slide, state) {
    const data = getPreviewDataForSlide(slide, state);
    const layout = (slide && slide.layout) || "executiveSummary";
    const missing = [];
    if (!data.customerName) missing.push("Customer name");
    function need(cond, label) { if (cond) missing.push(label); }
    switch (layout) {
      case "hero":
        need(!data.story.futureVision && !data.story.bigProblem && !data.theme, "Big problem or future-state vision");
        break;
      case "storyFoundation":
      case "storyFoundations":
        need(!data.story.bigProblem    && !(data.foundations && data.foundations.businessProblem),    "Business problem");
        need(!data.story.futureVision  && !(data.foundations && data.foundations.futureStateVision), "Future-state vision");
        break;
      case "currentFutureState":
        need(!data.story.currentPain   && !(data.foundations && data.foundations.currentStatePain),  "Current-state pain");
        need(!data.story.futureVision  && !(data.foundations && data.foundations.futureStateVision), "Future-state vision");
        break;
      case "futureState":
        need(!data.story.futureVision  && !(data.foundations && data.foundations.futureStateVision), "Future-state vision");
        break;
      case "journeyTimeline":
        need(!data.acts.length, "At least 2–3 story acts");
        break;
      case "demoMap":
        need(!data.acts.length, "Story acts to map");
        break;
      case "personaCard":
        need(!data.persona, "A persona");
        break;
      case "agentConversation":
        need(!data.persona, "A persona");
        need((data.products.indexOf("Agentforce") < 0) && !(data.foundations && (data.foundations.agentforceMoments || []).length), "Agentforce in the product mix");
        break;
      case "unifiedProfile":
        need(!data.persona, "A persona");
        need((data.products.indexOf("Data Cloud") < 0), "Data Cloud in the product mix");
        break;
      case "architecture":
        need(!data.products.length, "At least one Salesforce product");
        break;
      case "deviceMoment":
        need(!data.acts.length, "Story acts (channel/device cues)");
        break;
      case "embeddedCxComponent":
        need(!(slide.linkedCxComponentIds || []).length, "Link a CX component");
        break;
      case "kpiScorecard":
        need(!data.story.businessValueMoments && !(data.foundations && (data.foundations.valueDrivers || []).length), "Business value drivers");
        break;
      case "executiveSummary":
        need(!data.story.executiveTakeaway && !(data.foundations && data.foundations.executiveTakeaway), "Executive takeaway");
        break;
      case "nextSteps":
        // No required inputs — phases are scaffolded.
        break;
      case "unknown":
        missing.push("Pick a layout for this slide");
        break;
    }
    if (slide && slide.assets && slide.assets.length === 0 && (layout === "deviceMoment" || layout === "personaCard")) {
      // Only suggest, don't strictly require.
    }
    return missing;
  }

  // ─── Asset readiness ──────────────────────────────────────────
  function assetReadiness(asset) {
    if (!asset) return "missing";
    const status = (asset.status || "").toLowerCase();
    if (status === "have"  || status === "ready") return "ready";
    if (status === "placeholder")                 return "placeholder";
    if (status === "optional")                    return "optional";
    if (asset.source && /^https?:\/\//.test(asset.source)) return "url";
    if (asset.source) return "ready";
    return "missing";
  }

  function readinessPill(state) {
    const tone = ({
      ready: "good", url: "blue", placeholder: "gold", optional: "ink", missing: "red",
    })[state] || "ink";
    const labelMap = { ready: "Ready", url: "URL", placeholder: "Placeholder", optional: "Optional", missing: "Missing" };
    return el("span", { class: "hp-asset-pill tone-" + tone, text: labelMap[state] || state });
  }

  // ─── Card scaffold (header + mode-aware body + footer actions) ─
  function renderPreviewCard(slide, state, handlers) {
    handlers = handlers || {};
    const mode = handlers.mode || "compact";

    const card = el("div", { class: "bx-preview hp-card hp-card-" + mode + (slide.synthetic ? " is-synthetic" : "") });

    // Header
    const numEl = el("div", { class: "bx-preview-num",
      text: "Slide " + ((slide.order || 0) + 1) });
    if (slide.synthetic) {
      numEl.appendChild(el("span", { class: "bx-preview-default-pill", text: "Template default" }));
    }
    card.appendChild(numEl);
    const layoutLabel = layoutLabelFor(slide.layout);
    card.appendChild(el("div", { class: "bx-preview-h" }, [
      el("div", { class: "bx-preview-title", text: slide.title || "Untitled" }),
      el("div", { class: "bx-preview-layout", text: layoutLabel }),
    ]));

    // Realistic preview body
    card.appendChild(renderSlidePreview(slide, state, mode));

    // Missing-inputs strip
    const missing = getMissingInputsForPreview(slide, state);
    if (missing.length) {
      card.appendChild(el("div", { class: "bx-preview-warn",
        text: "Missing: " + missing.join(", ") }));
    }

    // Footer actions — Edit-text always shown when editor fields exist.
    const editorFields = editorFieldsForSlide(slide);
    const showActions = handlers.onEdit && editorFields.length;
    if (showActions || handlers.onMoveUp || handlers.onMoveDown || handlers.onRemove) {
      const actions = el("div", { class: "bx-preview-actions" });
      if (showActions) {
        const ed = el("button", { class: "bx-mini-btn bx-mini-btn-edit",
          "aria-label": "Edit text", html: "✎ Edit text" });
        ed.addEventListener("click", function (e) {
          e.stopPropagation();
          handlers.onEdit(slide, ed);
        });
        actions.appendChild(ed);
      }
      if (handlers.onMoveUp) {
        const up = el("button", { class: "bx-mini-btn", "aria-label": "Move up", text: "↑" });
        up.addEventListener("click", function () { handlers.onMoveUp(slide.id); });
        actions.appendChild(up);
      }
      if (handlers.onMoveDown) {
        const dn = el("button", { class: "bx-mini-btn", "aria-label": "Move down", text: "↓" });
        dn.addEventListener("click", function () { handlers.onMoveDown(slide.id); });
        actions.appendChild(dn);
      }
      if (handlers.onRemove) {
        const rm = el("button", { class: "bx-mini-btn is-danger", "aria-label": "Remove", text: "✕" });
        rm.addEventListener("click", function () { handlers.onRemove(slide.id); });
        actions.appendChild(rm);
      }
      card.appendChild(actions);
    }

    return card;
  }

  // ─── Editor field discovery ───────────────────────────────────
  // Synthetic runtime slides carry an `editorPaths` map; SE-authored
  // slides expose their own title / speakerNotes / persona. Returns an
  // array of {label, path, kind} where kind is one of:
  //   "text" | "textarea" | "list-strings" | "list-objects"
  function editorFieldsForSlide(slide) {
    if (!slide) return [];
    if (slide.editorPaths) {
      return Object.keys(slide.editorPaths).map(function (label) {
        // An editorPaths value is either a plain path string, or
        // { path, placeholder, prefill } where:
        //   placeholder = string | (slide, state) => string — greyed hint
        //     for true override fields; the live derivation keeps updating
        //     while the path stays blank ("blank = auto").
        //   prefill = (slide, state) => string — seed the input VALUE with
        //     the rendered default so plain display text (eyebrows, titles,
        //     subtitles) shows real, editable copy. Not persisted on render;
        //     the existing input listener persists only on first edit.
        const raw = slide.editorPaths[label];
        const path = (raw && typeof raw === "object") ? raw.path : raw;
        const placeholder = (raw && typeof raw === "object") ? raw.placeholder : undefined;
        const prefill = (raw && typeof raw === "object") ? raw.prefill : undefined;
        return { label: label, path: path, placeholder: placeholder, prefill: prefill, kind: kindForPath(path, label) };
      });
    }
    // Synthetic runtime slides without editorPaths (e.g. bvOpener,
    // which is hardcoded copy) have nothing the SE should edit —
    // showing "Slide title / Speaker notes" would be misleading
    // since those aren't real persisted fields on the slide.
    if (slide.synthetic) return [];
    // SE-authored slide → title + speaker notes + the state fields
    // the slide's renderer actually reads. Keeps the popover honest:
    // every visible string in the preview can be edited from one place.
    const base = [
      { label: "Slide title",   path: "__slide.title",        kind: "text",     slideField: "title" },
      { label: "Speaker notes", path: "__slide.speakerNotes", kind: "textarea", slideField: "speakerNotes" },
    ];
    const extras = defaultEditorPathsForLayout((slide && slide.layout) || "");
    Object.keys(extras).forEach(function (label) {
      const path = extras[label];
      // A "__slide.<field>" path binds the editor directly to a per-slide
      // field (like the base title/notes), instead of the global state tree.
      // Lets layouts such as storyInterstitial carry their own copy without
      // a dedicated state array.
      const m = /^__slide\.(.+)$/.exec(String(path || ""));
      const field = { label: label, path: path, kind: kindForPath(path, label) };
      if (m) field.slideField = m[1];
      base.push(field);
    });
    return base;
  }

  // What state fields each SE-authored layout pulls into its preview.
  // Mirrors the renderer in LAYOUT_RENDERERS — keep them in sync. The
  // runtime layouts (introHero/journeyMapMatrix/etc.) have their own
  // editorPaths in buildSlideManifest, so they don't show up here.
  function defaultEditorPathsForLayout(layout) {
    switch (layout) {
      case "hero":
        return {
          "Theme":           "project.theme",
          "Customer name":   "project.customerName",
          "Future vision":   "story.futureVision",
          "Big problem":     "story.bigProblem",
          "Audience":        "project.audience",
          "Sales stage":     "project.salesStage",
          "Products":        "project.products",  // rendered as badges
        };
      case "storyFoundation":
      case "storyFoundations":
        return {
          "Customer name":         "project.customerName",  // drives the h3
          "Business problem":      "storyFoundations.businessProblem",
          "Current-state pain":    "storyFoundations.currentStatePain",
          "Future-state vision":   "storyFoundations.futureStateVision",
          "Transformation thesis": "storyFoundations.transformationThesis",
          "Primary narrative":     "storyFoundations.primaryNarrative",
        };
      case "currentFutureState":
        return {
          "Current-state pain":  "storyFoundations.currentStatePain",
          "Future-state vision": "storyFoundations.futureStateVision",
          "Products":            "project.products",  // rendered as bridge badges
        };
      case "futureState":
        return {
          "Customer name":       "project.customerName",  // drives the h3
          "Future-state vision": "storyFoundations.futureStateVision",
          "Value drivers":       "storyFoundations.valueDrivers",
        };
      case "personaCard":
        // SE-authored mr-2 mirror — same fields as the runtime version.
        return {
          "Persona name (full)": "personas[0].name",
          "Role (top label)":    "personas[0].role",
          "Job title":           "personas[0].jobTitle",
          "Stats":               "personas[0].stats",
          "Quote (pain points)": "personas[0].painPoints",
        };
      case "unifiedProfile":
        return {
          "Goals":             "personas[0].goals",
          "Data Cloud moments": "storyFoundations.dataCloudMoments",
        };
      case "agentConversation":
        return {
          "Customer name": "project.customerName",
          "Products":      "project.products",  // gates capability badges
        };
      case "kpiScorecard":
        return {
          "BVS metrics": "storyFoundations.bvsMetrics",
        };
      case "executiveSummary":
        return {
          "Customer name":       "project.customerName",  // drives the h3
          "Big problem":         "story.bigProblem",
          "Current pain":        "story.currentPain",
          "Future vision":       "story.futureVision",
          "Products":            "project.products",  // rendered as the Capabilities column
          "Executive takeaway":  "storyFoundations.executiveTakeaway",
        };
      case "architecture":
        return {
          "Customer name": "project.customerName",  // drives the h3
          "Products":      "project.products",      // rendered as the platform layer
        };
      case "storyInterstitial":
        // Per-slide narrative beat — fields live on the slide object so an
        // SE can drop several with distinct copy. Bound via "__slide.*".
        return {
          "Kicker":    "__slide.kicker",
          "Headline":  "__slide.headline",
          "Sub-line":  "__slide.sub",
        };
      case "journeyTimeline":
        // The timeline carries its own copy (eyebrow / headline / sub) plus a
        // fully editable events array (add / remove / reorder + icon picker),
        // all in storyFoundations.* — decoupled from storyActs so editing the
        // timeline never disturbs the demoMap / scenePhoto slides. Mirrors the
        // synthetic _rt_journey_timeline editorPaths so an SE-authored
        // journeyTimeline slide gets the same rich editor, not just title/notes.
        return {
          "Eyebrow":         "storyFoundations.journeyTimelineEyebrow",
          "Headline":        "storyFoundations.journeyTimelineHeadline",
          "Sub-line":        "storyFoundations.journeyTimelineSub",
          "Timeline events": "storyFoundations.timelineEvents",
        };
      case "deviceMoment":
      case "demoMap":
      case "embeddedCxComponent":
      case "nextSteps":
      default:
        // These pull entirely from arrays the SE manages elsewhere
        // (storyActs, cxComponents) — exposing them as a single
        // editorPath here would be duplicative. The popover surfaces a
        // note (see buildEditorPopover) pointing the SE at Step 2.
        return {};
    }
  }

  // Layouts whose visible body is driven by state.storyActs (managed in
  // the Step 2 planner, not field-by-field). The popover shows a note so
  // the SE knows the per-act content is edited there, not here.
  // journeyTimeline is intentionally NOT here: it now has its own editable
  // timeline-events list (decoupled from storyActs), so the "edit in Step 2"
  // note would be misleading.
  const STORYACTS_LAYOUTS = ["deviceMoment", "demoMap", "journeyMapMatrix"];
  function kindForPath(path, label) {
    const p = String(path || "");
    // Heuristic: any path ending in [n] / a known list field is treated as a list.
    if (/\[\d+\]$/.test(p)) return "text";
    // Lists of plain strings (one per line in the popover textarea).
    if (/products$/.test(p)
        || /Moments$/.test(p)        // dataCloudMoments, commerceMoments, …
        || /valueDrivers$/.test(p)
        || /assumptions$/.test(p)
        || /openQuestions$/.test(p)) return "list-strings";
    // Lists of objects (one row per entry, multiple inputs).
    if (/wishlist$/.test(p) || /\.stats$/.test(p) || /bvsMetrics$/.test(p)
        || /orbitNodes$/.test(p) || /capabilities$/.test(p)
        || /timelineEvents$/.test(p)) return "list-objects";
    if (/Notes$/.test(p) || /narrative$/i.test(p) || /takeaway$/i.test(p) || /vision$/i.test(p)
        || /problem$/i.test(p) || /pain$/i.test(p) || /painPoints$/i.test(p) || /goals$/i.test(p)
        || /demoRelevance$/i.test(p) || /relevance$/i.test(p) || /thesis$/i.test(p)
        || label === "Speaker notes") return "textarea";
    return "text";
  }

  // ─── Popover editor ───────────────────────────────────────────
  // Renders an inline editor anchored next to a preview card. Each
  // input binds via {get, set} closures around state-path resolution
  // so commits flow through one place. `onChange` is fired (debounced)
  // after every keystroke so the parent can re-render the preview.
  function buildEditorPopover(slide, state, options) {
    options = options || {};
    const onChange = options.onChange || function () {};
    const onClose  = options.onClose  || function () {};

    const pop = el("div", { class: "bx-pop-edit", role: "dialog", "aria-label": "Edit slide text" });
    const head = el("div", { class: "bx-pop-edit-head" }, [
      el("div", { class: "bx-pop-edit-title", text: slide.title || "Edit slide text" }),
      (function () {
        const x = el("button", { class: "bx-pop-edit-close", "aria-label": "Close", text: "×" });
        x.addEventListener("click", onClose);
        return x;
      })(),
    ]);
    pop.appendChild(head);

    const body = el("div", { class: "bx-pop-edit-body" });
    const fields = editorFieldsForSlide(slide);
    if (!fields.length) {
      body.appendChild(el("div", { class: "bx-pop-edit-empty",
        text: "This slide doesn't have editable text fields. Adjust it from the slide planner instead." }));
    }
    fields.forEach(function (f) {
      body.appendChild(buildEditorField(f, slide, state, onChange));
    });
    // storyActs-driven layouts: the slide title is editable above, but the
    // per-step content (channels, summaries, capabilities) comes from the
    // Step 2 planner. Say so, so the SE isn't left wondering why those
    // strings can't be changed here.
    if (slide && STORYACTS_LAYOUTS.indexOf(slide.layout) >= 0) {
      body.appendChild(el("div", { class: "bx-pop-edit-empty",
        text: "The journey steps shown on this slide are edited in Step 2 (story planner)." }));
    }
    pop.appendChild(body);

    pop.appendChild(el("div", { class: "bx-pop-edit-foot",
      text: "Edits save automatically. Reopen Step 8 anytime to refine." }));
    return pop;
  }

  function buildEditorField(f, slide, state, onChange) {
    const row = el("div", { class: "bx-pop-edit-field" });
    row.appendChild(el("div", { class: "bx-pop-edit-label", text: f.label }));

    // Resolve get/set against either the slide itself (SE slides) or
    // the state tree (runtime slides via state-path).
    let get, set;
    if (f.slideField) {
      get = function () { return slide[f.slideField] || ""; };
      set = function (v) { slide[f.slideField] = v; };
    } else {
      get = function () { return getAtPath(state, f.path); };
      set = function (v) { setAtPath(state, f.path, v); };
    }

    if (f.kind === "list-strings") {
      // Newline-separated textarea → array of trimmed non-empty strings.
      const arr = get() || [];
      // Optional prefill — (slide, state) => array of default strings,
      // shown as the placeholder when empty (blank = use defaults).
      let phStr = "One per line";
      if ((!Array.isArray(arr) || !arr.length) && typeof f.prefill === "function") {
        try {
          const d = f.prefill(slide, state);
          if (Array.isArray(d) && d.length) phStr = d.join("\n");
        } catch (e) { /* keep default */ }
      }
      const ta = el("textarea", { class: "bx-textarea", rows: "3",
        placeholder: phStr });
      ta.value = (Array.isArray(arr) ? arr : []).join("\n");
      ta.addEventListener("input", function () {
        const list = ta.value.split("\n").map(function (s) { return s.trim(); }).filter(Boolean);
        set(list);
        onChange();
      });
      row.appendChild(ta);
      return row;
    }

    if (f.kind === "list-objects") {
      const wrap = el("div", { class: "bx-pop-edit-list" });
      // Optional prefill — (slide, state) => array of default row objects.
      // We DON'T persist these; instead each empty cell shows the matching
      // default as its placeholder so the SE sees the real rendered values
      // (e.g. persona stats / wishlist cards) and can overwrite per cell.
      let defaults = [];
      if (typeof f.prefill === "function") {
        try { const d = f.prefill(slide, state); if (Array.isArray(d)) defaults = d; } catch (e) { defaults = []; }
      }
      const layout = layoutForListPath(f.path);
      const dynamic = !!layout.dynamic;

      // Mutate the stored array, then re-render the list in place. Used by
      // the dynamic (add / remove / reorder) controls so the row numbers and
      // inputs stay in sync without rebuilding the whole popover.
      function mutate(fn) {
        const cur = (get() || []).slice();
        fn(cur);
        set(cur);
        onChange();
        renderList();
      }

      function renderList() {
        wrap.textContent = "";
        const arr = (get() || []).slice();
        // Dynamic lists size to the data (with a single empty starter row when
        // empty); fixed lists keep the lazy-allocated slot count so each
        // placeholder still shows the matching prefilled default.
        const slotCount = dynamic
          ? Math.max(arr.length, defaults.length, 1)
          : Math.max(arr.length, defaults.length, defaultRowsFor(f.path));
        for (let i = 0; i < slotCount; i++) {
          const rowObj = (arr[i] && typeof arr[i] === "object") ? arr[i] : {};
          const def = (defaults[i] && typeof defaults[i] === "object") ? defaults[i] : {};
          const card = el("div", { class: "bx-pop-edit-list-row" });
          card.appendChild(el("div", { class: "bx-pop-edit-list-num", text: "#" + (i + 1) }));
          layout.fields.forEach(function (fieldDef) {
            // Default value (if any) becomes the placeholder so blank = use default.
            const defVal = def[fieldDef.key];
            const ph = (defVal != null && String(defVal) !== "") ? String(defVal) : (fieldDef.placeholder || fieldDef.key);
            const inp = el("input", { type: "text", class: "bx-input bx-pop-edit-list-input",
              placeholder: ph,
              value: rowObj[fieldDef.key] || "" });
            const idx = i;
            inp.addEventListener("input", function () {
              const cur = (get() || []).slice();
              while (cur.length <= idx) cur.push({});
              const o = {}; o[fieldDef.key] = inp.value;
              cur[idx] = Object.assign({}, cur[idx], o);
              set(cur);
              onChange();
            });
            // Channel-icon picker: a strip of catalog buttons that write the
            // emoji into this cell (and fire the input listener) so the SE can
            // pick instead of typing. Falls back to a plain input if the
            // shared catalog is unavailable.
            if (fieldDef.picker === "channel" && SHARED.CHANNEL_ICONS && SHARED.CHANNEL_ICONS.length) {
              const cell = el("div", { class: "bx-pop-edit-icon-cell" });
              cell.appendChild(inp);
              const strip = el("div", { class: "bx-pop-edit-icon-strip" });
              SHARED.CHANNEL_ICONS.forEach(function (ic) {
                const btn = el("button", { type: "button", class: "bx-pop-edit-icon-btn",
                  title: ic.key, text: ic.icon });
                btn.addEventListener("click", function () {
                  inp.value = ic.icon;
                  inp.dispatchEvent(new Event("input", { bubbles: true }));
                });
                strip.appendChild(btn);
              });
              cell.appendChild(strip);
              card.appendChild(cell);
            } else {
              card.appendChild(inp);
            }
          });
          if (dynamic) {
            const idx = i;
            const ctrls = el("div", { class: "bx-pop-edit-list-ctrls" });
            const up = el("button", { type: "button", class: "bx-pop-edit-list-ctrl",
              title: "Move up", text: "↑", "aria-label": "Move up" });
            up.disabled = idx === 0;
            up.addEventListener("click", function () {
              mutate(function (cur) {
                while (cur.length <= idx) cur.push({});
                if (idx > 0) { const t = cur[idx - 1]; cur[idx - 1] = cur[idx]; cur[idx] = t; }
              });
            });
            const down = el("button", { type: "button", class: "bx-pop-edit-list-ctrl",
              title: "Move down", text: "↓", "aria-label": "Move down" });
            down.disabled = idx >= slotCount - 1;
            down.addEventListener("click", function () {
              mutate(function (cur) {
                while (cur.length <= idx + 1) cur.push({});
                const t = cur[idx + 1]; cur[idx + 1] = cur[idx]; cur[idx] = t;
              });
            });
            const rm = el("button", { type: "button", class: "bx-pop-edit-list-ctrl is-danger",
              title: "Remove", text: "✕", "aria-label": "Remove" });
            rm.addEventListener("click", function () {
              mutate(function (cur) { if (idx < cur.length) cur.splice(idx, 1); });
            });
            ctrls.appendChild(up);
            ctrls.appendChild(down);
            ctrls.appendChild(rm);
            card.appendChild(ctrls);
          }
          wrap.appendChild(card);
        }
        if (dynamic) {
          const add = el("button", { type: "button", class: "bx-pop-edit-list-add",
            text: "+ Add" });
          add.addEventListener("click", function () {
            mutate(function (cur) { cur.push({}); });
          });
          wrap.appendChild(add);
        }
      }

      renderList();
      row.appendChild(wrap);
      return row;
    }

    // text / textarea
    const v = get();
    // Optional placeholder — string, or a (slide, state) => string fn.
    // Used for override fields to show the auto-derived default (e.g. the
    // composed hero headline) without persisting it: blank = auto.
    let ph = "";
    if (typeof f.placeholder === "function") {
      try { ph = f.placeholder(slide, state) || ""; } catch (e) { ph = ""; }
    } else if (typeof f.placeholder === "string") {
      ph = f.placeholder;
    }
    // Optional prefill — (slide, state) => string. For plain display text
    // (eyebrows, titles, subtitles): when the stored value is empty, seed
    // the input VALUE with the rendered default so the SE sees real,
    // editable copy instead of a blank box. NOT persisted on render — the
    // input listener below persists only when the SE actually edits, so
    // saved projects stay lean and untouched defaults keep tracking source.
    let prefillVal = "";
    const stored = (v == null ? "" : String(v));
    if (!stored && typeof f.prefill === "function") {
      try { prefillVal = f.prefill(slide, state) || ""; } catch (e) { prefillVal = ""; }
    }
    let inp;
    if (f.kind === "textarea") {
      inp = el("textarea", { class: "bx-textarea", rows: "3" });
      inp.value = stored || prefillVal;
    } else {
      inp = el("input", { type: "text", class: "bx-input" });
      inp.value = stored || prefillVal;
    }
    if (ph) inp.setAttribute("placeholder", ph);
    inp.addEventListener("input", function () { set(inp.value); onChange(); });
    row.appendChild(inp);
    return row;
  }

  // Per-list default row count and per-list field structure. Keeps
  // the editor honest about what each array element holds (stat = val
  // + label, wishlist = name + tag + detail + emoji, bvsMetrics = val
  // + label) so SEs aren't typing JSON.
  function defaultRowsFor(path) {
    if (/wishlist$/.test(path))     return 3;
    if (/\.stats$/.test(path))      return 3;
    if (/bvsMetrics$/.test(path))   return 5;
    if (/orbitNodes$/.test(path))   return 6;
    if (/capabilities$/.test(path)) return 4;
    if (/timelineEvents$/.test(path)) return 5;
    return 3;
  }
  function layoutForListPath(path) {
    if (/timelineEvents$/.test(path)) {
      // Dynamic = SE can add / remove / reorder rows (not fixed-slot like
      // wishlist/stats). The "icon" field renders the channel-icon picker.
      return { dynamic: true, fields: [
        { key: "month",   placeholder: "Month (e.g. DEC)" },
        { key: "label",   placeholder: "Event label" },
        { key: "sub",     placeholder: "Sub-text (optional)" },
        { key: "channel", placeholder: "Channel (email / sms / store …)" },
        { key: "icon",    placeholder: "Pick or paste an emoji", picker: "channel" },
      ] };
    }
    if (/wishlist$/.test(path)) {
      return { fields: [
        { key: "name",   placeholder: "Item name" },
        { key: "tag",    placeholder: "Tag (e.g. FOR HER)" },
        { key: "detail", placeholder: "Short detail" },
        { key: "emoji",  placeholder: "Emoji" },
      ] };
    }
    if (/\.stats$/.test(path)) {
      // mr-2 stats are short phrases like "Top moment" / "Tradition"
      // — not numbers — so the placeholders mirror the polished slide.
      return { fields: [
        { key: "value", placeholder: "Value (e.g. Tom's son)" },
        { key: "label", placeholder: "Caption (e.g. Top moment)" },
      ] };
    }
    if (/bvsMetrics$/.test(path)) {
      return { fields: [
        { key: "value", placeholder: "Value (e.g. XX%)" },
        { key: "label", placeholder: "Label (e.g. Conversion Lift)" },
      ] };
    }
    if (/orbitNodes$/.test(path)) {
      return { fields: [
        { key: "icon",  placeholder: "Emoji (e.g. 📸)" },
        { key: "label", placeholder: "Label (e.g. Personalized Ad)" },
      ] };
    }
    if (/capabilities$/.test(path)) {
      return { fields: [
        { key: "label",       placeholder: "Capability (e.g. Data Cloud)" },
        { key: "description", placeholder: "Short description" },
      ] };
    }
    return { fields: [{ key: "value", placeholder: "Value" }] };
  }

  function layoutLabelFor(layout) {
    return ({
      hero: "Hero",
      storyFoundation: "Story Foundation",
      currentFutureState: "Current vs Future",
      futureState: "Future State",
      journeyTimeline: "Journey Timeline",
      demoMap: "Demo Map",
      personaCard: "Persona Card",
      agentConversation: "Agent Conversation",
      unifiedProfile: "Unified Profile",
      architecture: "Architecture",
      deviceMoment: "Device Moment",
      scenePhoto: "Scene Moment",
      storyInterstitial: "Story / Context",
      embeddedCxComponent: "Embedded CX Component",
      kpiScorecard: "KPI Scorecard",
      executiveSummary: "Executive Takeaway",
      nextSteps: "Next Steps",
      // Runtime-only layouts (rendered in the polished /demo template
      // regardless of what's in state.slides — see enumerateRuntimeSlides).
      journeyMapMatrix: "Journey Map · 5 phases",
      introHero:        "Intro · Hero",
      introStoryHook:   "Intro · Story hook",
      introThreeActs:   "Intro · Three acts",
      introVignette:    "Intro · Vignette",
      personaIntro:     "Persona · Meet",
      personaWishlist:  "Persona · Wishlist",
      personaCta:       "Persona · CTA",
      chapterOpener:    "Demo · Opener",
      bvOpener:         "BV · Outcome",
      bvOrbit:          "BV · Orbit",
      bvCapabilities:   "BV · Capabilities",
      bvClosing:        "BV · Closing",
      unknown: "Layout",
    })[layout] || (layout || "Layout");
  }

  // ─── Public: render the layout preview only ───────────────────
  // CRITICAL: never fall back to executiveSummary. Unknown layouts
  // get a neutral renderer so multiple slides don't all show the
  // same Challenge / Future State / Capabilities triplet.
  function renderSlidePreview(slide, state, mode) {
    const layout = (slide && slide.layout) || "unknown";
    const fn = LAYOUT_RENDERERS[layout] || LAYOUT_RENDERERS.unknown;
    const data = getPreviewDataForSlide(slide, state);
    const root = fn(data, mode || "compact");
    // Inject brand colors on the preview root so per-slide CSS can use them.
    root.style.setProperty("--hp-primary",   data.brand.primary);
    root.style.setProperty("--hp-secondary", data.brand.secondary);
    root.style.setProperty("--hp-accent",    data.brand.accent);
    root.setAttribute("data-layout", layout);
    return root;
  }

  // SE-authored slides always expose a "Slide title" editor field
  // (editorFieldsForSlide). Layouts whose headline would otherwise be
  // hardcoded/derived call this so editing that field is honored in the
  // preview (and matches the export, which already uses sl.title). Pass
  // the layout's previous hardcoded/derived headline as `fallback`.
  // Reads the RAW slide title (data.title carries an "Untitled" default).
  function slideTitleOr(data, fallback) {
    const t = data && data.slide && data.slide.title;
    return (t && String(t).trim()) || fallback;
  }

  // Synthetic intro/persona/journey/bv slides have no slide.title; their
  // editable eyebrow/headline/CTA overrides live in storyFoundations.*.
  // fOr() returns the SE override for `key` if set, else the literal
  // fallback. The matching editorPaths in buildSlideManifest expose these.
  function fOr(data, key, fallback) {
    const f = (data && data.foundations) || {};
    const v = f[key];
    return (v != null && String(v).trim()) ? String(v) : fallback;
  }

  // ═══════════════════════════════════════════════════════════════
  //  LAYOUT RENDERERS
  //  Each returns an HTMLElement. They use REAL data from `data`
  //  (resolved from state) and only fall back to neutral copy when
  //  a field is genuinely empty.
  // ═══════════════════════════════════════════════════════════════
  const LAYOUT_RENDERERS = {

    // ── Hero ──────────────────────────────────────────────────────
    hero: function (data, mode) {
      const root = el("div", { class: "hp hp-hero" });
      const eyebrow = el("div", { class: "hp-eyebrow", text: data.eyebrow || "Holodeck" });
      // Branding mode shapes the tagline: customer mode leads with the
      // customer and drops the explicit "+ Salesforce"; salesforce/cobrand keep it.
      const brandMode = (data.brand && data.brand.mode) || "salesforce";
      const tagline = data.theme || (brandMode === "customer" ? "" : "+ Salesforce");
      const titleKids = [
        el("span", { class: "hp-title-customer", text: data.customerName }),
      ];
      if (tagline) {
        titleKids.push(el("br"));
        titleKids.push(el("span", { class: "hp-title-tagline", text: tagline }));
      }
      const title = data.customerName
        ? el("h2", { class: "hp-title" }, titleKids)
        : el("h2", { class: "hp-title hp-title-faded", text: "Customer name → fills here" });
      const sub = el("p", { class: "hp-sub",
        text: data.story.futureVision || data.story.bigProblem || data.theme
              || "Add a future-state vision or business problem in Step 2." });
      const badges = el("div", { class: "hp-badges" });
      data.products.slice(0, 6).forEach(function (p) {
        badges.appendChild(el("span", { class: "hp-badge tone-blue", text: p }));
      });
      root.appendChild(eyebrow);
      root.appendChild(title);
      root.appendChild(sub);
      if (data.products.length) root.appendChild(badges);
      if (mode === "expanded") {
        const foot = el("div", { class: "hp-hero-foot" }, [
          el("div", { class: "hp-hero-foot-l" }, [
            el("div", { class: "hp-foot-label", text: "Audience" }),
            el("div", { class: "hp-foot-value", text: data.audience || "—" }),
          ]),
          el("div", { class: "hp-hero-foot-r" }, [
            el("div", { class: "hp-foot-label", text: "Stage" }),
            el("div", { class: "hp-foot-value", text: data.salesStage || "—" }),
          ]),
        ]);
        root.appendChild(foot);
      }
      if (data.brand.logoPath) {
        // Logos uploaded via Step 1 are data URLs (base64 strings
        // hundreds of KB long); AI/GCS-hosted logos are https:// URLs.
        // Render a thumbnail for any real image URL (data: or http(s)://),
        // and fall back to showing the pathname/text for a bare asset path.
        const isImageUrl = /^(data:|https?:\/\/)/i.test(data.brand.logoPath);
        if (isImageUrl) {
          const logoImg = el("img", { class: "hp-logo-img", src: data.brand.logoPath, alt: "Customer logo" });
          // Same missing-asset policy as the demo: a broken image hides itself
          // rather than showing the browser's broken-image icon.
          logoImg.addEventListener("error", function () { this.style.display = "none"; });
          root.appendChild(logoImg);
        } else {
          root.appendChild(el("div", { class: "hp-logo-tag", text: data.brand.logoPath }));
        }
      }
      return root;
    },

    // ── Journey timeline ─────────────────────────────────────────
    journeyTimeline: function (data, mode) {
      const fnd = data.foundations || {};
      const root = el("div", { class: "hp hp-timeline" });
      root.appendChild(el("div", { class: "hp-eyebrow",
        text: fnd.journeyTimelineEyebrow || data.eyebrow || "Customer journey" }));
      root.appendChild(el("h3", { class: "hp-h3",
        text: fnd.journeyTimelineHeadline || slideTitleOr(data, data.customerName ? "How " + data.customerName + " moves through the journey" : "Customer journey") }));

      // Prefer the SE-authored timeline-events override; fall back to story
      // acts so the wireframe matches the polished /demo renderer's source.
      const evts = (Array.isArray(fnd.timelineEvents) && fnd.timelineEvents.length)
        ? fnd.timelineEvents
        : (data.acts || []);
      const usingEvents = (Array.isArray(fnd.timelineEvents) && fnd.timelineEvents.length) > 0;

      if (!evts.length) {
        root.appendChild(el("div", { class: "hp-empty",
          html: "Add story acts in <strong>Step 2</strong> — or open this slide's editor to author timeline events." }));
        return root;
      }

      const rail = el("div", { class: "hp-rail" });
      const max = mode === "expanded" ? 8 : 5;
      evts.slice(0, max).forEach(function (e, i) {
        e = e || {};
        const channel = e.channel || "";
        const icon = (e.icon && String(e.icon).trim())
          || (SHARED.channelIcon ? SHARED.channelIcon(channel) : "");
        const title = usingEvents ? (e.label || e.title || "") : (e.title || "");
        const sub = usingEvents ? (e.sub || "") : (e.summary || "");
        const month = e.month || e.timing || "";
        const node = el("div", { class: "hp-rail-node" }, [
          el("div", { class: "hp-rail-dot" }, [el("span", { text: String(i + 1) })]),
          el("div", { class: "hp-rail-card" }, [
            month ? el("div", { class: "hp-rail-meta", text: month }) : null,
            title ? el("div", { class: "hp-rail-title", text: title }) : null,
            (!usingEvents && e.persona) ? el("div", { class: "hp-rail-meta", text: "👤 " + e.persona }) : null,
            channel ? el("div", { class: "hp-rail-meta", text: (icon ? icon + " " : "") + channel }) : null,
            sub ? el("div", { class: "hp-rail-summary", text: truncate(sub, mode === "expanded" ? 180 : 90) }) : null,
            (!usingEvents && e.salesforceCapabilities) ? el("div", { class: "hp-rail-cap", text: e.salesforceCapabilities }) : null,
            (!usingEvents && e.businessValue) ? el("div", { class: "hp-rail-bv", text: "→ " + e.businessValue }) : null,
          ]),
        ]);
        rail.appendChild(node);
      });
      root.appendChild(rail);
      if (evts.length > max) {
        root.appendChild(el("div", { class: "hp-more", text: "+ " + (evts.length - max) + " more" }));
      }
      return root;
    },

    // ── Demo map ──────────────────────────────────────────────────
    demoMap: function (data, mode) {
      const root = el("div", { class: "hp hp-demomap" });
      root.appendChild(el("div", { class: "hp-eyebrow", text: data.eyebrow || "Demo map" }));
      root.appendChild(el("h3", { class: "hp-h3", text: slideTitleOr(data, "End-to-end demo flow") }));

      if (!data.acts.length) {
        root.appendChild(el("div", { class: "hp-empty",
          html: "Add story acts in <strong>Step 2</strong> to map the demo." }));
        return root;
      }

      const grid = el("div", { class: "hp-demogrid" });
      const max = mode === "expanded" ? 8 : 4;
      data.acts.slice(0, max).forEach(function (a, i) {
        const card = el("div", { class: "hp-democard" }, [
          el("div", { class: "hp-demonum", text: String(i + 1).padStart(2, "0") }),
          a.title ? el("div", { class: "hp-democard-title", text: a.title }) : null,
          a.channel ? el("div", { class: "hp-democard-channel", text: a.channel }) : null,
          a.salesforceCapabilities ? el("div", { class: "hp-democard-cap", text: a.salesforceCapabilities }) : null,
          a.requiredAssets ? el("div", { class: "hp-democard-asset", text: "📎 " + a.requiredAssets }) : null,
        ]);
        grid.appendChild(card);
      });
      root.appendChild(grid);
      if (data.acts.length > max) {
        root.appendChild(el("div", { class: "hp-more", text: "+ " + (data.acts.length - max) + " more steps" }));
      }
      return root;
    },

    // ── Persona card ──────────────────────────────────────────────
    // Mirrors the polished mr-2 layout exactly:
    //   left  : avatar
    //   right : role · name (split into first / last) · jobTitle ·
    //           3-stat grid · pull quote
    // Same fields the adapter writes into HOLODECK_CONFIG.persona, so
    // edits the SE makes in the popover (role, fullName, jobTitle,
    // stats, painPoints/quote) show up identically in the export.
    personaCard: function (data, mode) {
      const root = el("div", { class: "hp hp-persona" });
      const p = data.persona;
      root.appendChild(el("div", { class: "hp-eyebrow", text: slideTitleOr(data, "Meet the persona") }));
      if (!p) {
        root.appendChild(el("div", { class: "hp-empty",
          html: "Add a persona in <strong>Step 2</strong> — name, role, job title, stats, and a quote." }));
        return root;
      }
      const fullName = p.name || "—";
      const nameParts = fullName.trim().split(/\s+/);
      const first = nameParts[0] || fullName;
      const last  = nameParts.slice(1).join(" ");
      const role = p.role || "";
      // jobTitle defaults to role (mirrors adapter's buildPersona).
      const jobTitle = p.jobTitle || p.role || "";
      const quote = p.painPoints || p.goals || "";

      const left = el("div", { class: "hp-persona-l" }, [
        el("div", { class: "hp-persona-avatar", text: (first || "?").slice(0, 1).toUpperCase() }),
      ]);
      const right = el("div", { class: "hp-persona-r" });
      if (role) right.appendChild(el("div", { class: "hp-persona-role", text: role }));
      right.appendChild(el("div", { class: "hp-persona-name" }, [
        document.createTextNode(first),
        last ? el("br") : null,
        last ? el("strong", { text: last }) : null,
      ].filter(Boolean)));
      if (jobTitle) right.appendChild(el("div", { class: "hp-persona-job", text: jobTitle }));

      // Stats grid — pulls from p.stats (SE's pending-text edits) and
      // falls back to the same [TODO]/Top Moment/Tradition/Signal
      // defaults the adapter uses, so preview = export.
      const defaultStats = [
        { value: "[TODO]", label: "Top Moment" },
        { value: "[TODO]", label: "Tradition"  },
        { value: "[TODO]", label: "Signal"     },
      ];
      const statsArr = Array.isArray(p.stats) ? p.stats : [];
      const stats = defaultStats.map(function (def, i) {
        const row = statsArr[i] || {};
        return {
          value: (row.value && String(row.value).trim()) || def.value,
          label: (row.label && String(row.label).trim()) || def.label,
        };
      });
      const statsRow = el("div", { class: "hp-persona-stats" });
      stats.forEach(function (s) {
        statsRow.appendChild(el("div", { class: "hp-persona-stat" }, [
          el("div", { class: "hp-persona-stat-v", text: s.value }),
          el("div", { class: "hp-persona-stat-l", text: s.label }),
        ]));
      });
      right.appendChild(statsRow);

      if (quote) {
        right.appendChild(el("div", { class: "hp-persona-quote-mark", text: "“" }));
        right.appendChild(el("div", { class: "hp-persona-quote",
          text: truncate(quote, mode === "expanded" ? 240 : 140) }));
      }
      root.appendChild(el("div", { class: "hp-persona-row" }, [left, right]));
      return root;
    },

    // ── Agent conversation ────────────────────────────────────────
    agentConversation: function (data, mode) {
      const root = el("div", { class: "hp hp-agent" });
      root.appendChild(el("div", { class: "hp-eyebrow", text: "Agentforce moment" }));
      const personaName = (data.persona && data.persona.name) || data.customerName || "Customer";
      root.appendChild(el("h3", { class: "hp-h3", text: personaName + " · live conversation" }));

      const conv = el("div", { class: "hp-chat" });
      const userMsg = pickUserMessage(data);
      const agentMsg = pickAgentMessage(data);
      conv.appendChild(el("div", { class: "hp-chat-bubble hp-chat-user" }, [
        el("div", { class: "hp-chat-who", text: personaName }),
        el("div", { class: "hp-chat-body", text: userMsg }),
      ]));
      conv.appendChild(el("div", { class: "hp-chat-bubble hp-chat-agent" }, [
        el("div", { class: "hp-chat-who", text: "Agentforce" }),
        el("div", { class: "hp-chat-body", text: agentMsg }),
      ]));
      root.appendChild(conv);

      const caps = el("div", { class: "hp-badges" });
      ["Agentforce", "Data Cloud", "Service Cloud", "Commerce"].forEach(function (cap) {
        if (data.products.indexOf(cap) >= 0) {
          caps.appendChild(el("span", { class: "hp-badge tone-red", text: cap }));
        }
      });
      if (caps.children.length) root.appendChild(caps);

      if (mode === "expanded") {
        root.appendChild(el("div", { class: "hp-callout", text: "Action: hand off to a human agent if confidence drops." }));
      }
      return root;
    },

    // ── Unified profile ──────────────────────────────────────────
    unifiedProfile: function (data, mode) {
      const root = el("div", { class: "hp hp-profile" });
      root.appendChild(el("div", { class: "hp-eyebrow", text: "Data Cloud · Unified Profile" }));
      const p = data.persona;
      if (!p) {
        root.appendChild(el("div", { class: "hp-empty", html: "Add a persona to populate the profile preview." }));
        return root;
      }
      const card = el("div", { class: "hp-profile-card" }, [
        el("div", { class: "hp-profile-head" }, [
          el("div", { class: "hp-profile-avatar", text: (p.name || "?").slice(0, 1).toUpperCase() }),
          el("div", {}, [
            el("div", { class: "hp-profile-name", text: p.name || "—" }),
            el("div", { class: "hp-profile-role", text: p.role || "" }),
          ]),
        ]),
      ]);
      const fields = el("div", { class: "hp-profile-fields" });
      pushField(fields, "Industry",  data.industry);
      pushField(fields, "Customer",  data.customerName);
      if (p.goals) pushField(fields, "Goal", truncate(p.goals, 60));
      if (data.acts[0] && data.acts[0].channel) pushField(fields, "Last channel", data.acts[0].channel);
      card.appendChild(fields);

      const segs = el("div", { class: "hp-profile-segs" });
      segs.appendChild(el("div", { class: "hp-profile-label", text: "Segments & signals" }));
      const segChips = el("div", { class: "hp-chiprow" });
      // Editor writes storyFoundations.dataCloudMoments (array, same field
      // the intro vi-3/4-6 slides use). Read that first; fall back to the
      // legacy story.dataCloudMoments string, then to defaults.
      const fdMoments = (data.foundations && data.foundations.dataCloudMoments) || null;
      const sources = (Array.isArray(fdMoments) && fdMoments.length)
        ? fdMoments.map(function (s) { return String(s).trim(); }).filter(Boolean)
        : (data.story.dataCloudMoments
            ? data.story.dataCloudMoments.split(/[,;\n]/).map(function (s) { return s.trim(); }).filter(Boolean)
            : ["Web", "Email", "POS", "App"]);
      sources.slice(0, 6).forEach(function (s) {
        segChips.appendChild(el("span", { class: "hp-chip tone-gold", text: s }));
      });
      segs.appendChild(segChips);
      card.appendChild(segs);

      if (mode === "expanded") {
        // Profile-depth facets (theme 3) — same generator the exported
        // demo's carousel uses, so preview and demo agree on the facets.
        const facets = (SHARED.profileFacets ? SHARED.profileFacets({
          persona: p, products: data.products || [],
          storyFoundations: data.foundations || {}, industry: data.industry,
        }) : []) || [];
        if (facets.length) {
          const fac = el("div", { class: "hp-profile-facets" });
          fac.appendChild(el("div", { class: "hp-profile-label", text: "Unified profile facets" }));
          fac.appendChild(el("div", { class: "hp-chiprow" },
            facets.map(function (ff) {
              return el("span", { class: "hp-chip tone-blue", text: ff.label });
            })));
          card.appendChild(fac);
        }
        card.appendChild(el("div", { class: "hp-profile-action",
          text: "Recommended next action: " + (data.acts[0] && data.acts[0].demoMoment ? data.acts[0].demoMoment : "personalized outreach") }));
      }
      root.appendChild(card);
      return root;

      function pushField(into, label, value) {
        if (!value) return;
        into.appendChild(el("div", { class: "hp-profile-field" }, [
          el("div", { class: "hp-profile-label", text: label }),
          el("div", { class: "hp-profile-value", text: value }),
        ]));
      }
    },

    // ── Architecture ─────────────────────────────────────────────
    architecture: function (data, mode) {
      const root = el("div", { class: "hp hp-arch" });
      root.appendChild(el("div", { class: "hp-eyebrow", text: "Solution architecture" }));
      root.appendChild(el("h3", { class: "hp-h3", text: slideTitleOr(data, data.customerName ? data.customerName + " · platform map" : "Platform map") }));

      if (!data.products.length) {
        root.appendChild(el("div", { class: "hp-empty",
          html: "Pick at least one Salesforce product in <strong>Step 1</strong>." }));
        return root;
      }

      // Three layers — sources, platform, channels
      const layers = el("div", { class: "hp-arch-layers" });
      layers.appendChild(layer("Data Sources",
        ["Web", "Mobile", "POS", "Email", "Service", "3rd-party"].slice(0, mode === "expanded" ? 6 : 4),
        "tone-blue"));
      layers.appendChild(layer("Salesforce Platform", data.products, "tone-red"));
      layers.appendChild(layer("Channels & Devices",
        ["Storefront", "App", "SMS", "Email", "Agent"].slice(0, mode === "expanded" ? 5 : 3),
        "tone-gold"));
      root.appendChild(layers);

      if (mode === "expanded") {
        root.appendChild(el("div", { class: "hp-callout",
          text: "Governance & security: SSO, encryption, audit, regional residency." }));
      }
      return root;

      function layer(title, items, tone) {
        return el("div", { class: "hp-arch-layer" }, [
          el("div", { class: "hp-arch-layer-h", text: title }),
          el("div", { class: "hp-arch-layer-row" }, items.map(function (it) {
            return el("span", { class: "hp-arch-node " + tone, text: it });
          })),
        ]);
      }
    },

    // ── Device moment ────────────────────────────────────────────
    deviceMoment: function (data, mode) {
      const root = el("div", { class: "hp hp-device" });
      const act = data.acts[0] || null;
      const channel = (act && act.channel) || "Phone";
      // Mirror the /demo renderer's deviceMoment frame logic: decide from
      // EXPLICIT signals (author deviceFrame, then slide-title + channel
      // keywords), defaulting to phone — so a slide titled "… Phone Moment"
      // isn't forced to a laptop by desk-prose elsewhere in the act.
      const dframe = data.slide && data.slide.deviceFrame;
      const dsig = ((slideTitleOr(data, "") || "") + " " + channel).toLowerCase();
      let isLaptop;
      if (dframe === "desktop") isLaptop = true;
      else if (dframe === "mobile") isLaptop = false;
      else if (/phone|mobile|instagram|insta|social|sms|imessage|\bapp\b|paid|\bad\b/.test(dsig)) isLaptop = false;
      else if (/laptop|macbook|web|desktop|browser|store|associate|console|revenue desk/.test(dsig)) isLaptop = true;
      else isLaptop = false;
      root.appendChild(el("div", { class: "hp-eyebrow", text: "Channel · " + channel }));

      const stage = el("div", { class: "hp-device-stage" });
      const device = el("div", { class: "hp-device-frame " + (isLaptop ? "is-laptop" : "is-phone") });
      const screen = el("div", { class: "hp-device-screen" });
      // Faux UI inside the device. Use a SHORT headline (the act title, or a
      // trimmed clause) — never the raw multi-sentence demoMoment script, which
      // would dump a whole paragraph into the tiny phone screen.
      screen.appendChild(el("div", { class: "hp-device-bar" }));
      const hText = (act && act.title)
        ? (SHARED.cleanHeadline ? SHARED.cleanHeadline(act.title, 42) : truncate(act.title, 42))
        : (act && act.demoMoment
            ? (SHARED.oneSentence ? SHARED.oneSentence(act.demoMoment, 42) : truncate(act.demoMoment, 42))
            : "Product moment");
      const headline = el("div", { class: "hp-device-headline", text: hText });
      screen.appendChild(headline);
      const bodySrc = (act && (act.summary || act.demoMoment)) || "";
      if (bodySrc) {
        const bText = SHARED.oneSentence ? SHARED.oneSentence(bodySrc, 90) : truncate(bodySrc, 90);
        screen.appendChild(el("div", { class: "hp-device-body", text: bText }));
      }
      const cta = el("div", { class: "hp-device-cta", text: act && act.businessValue ? truncate(act.businessValue, 40) : "Take action" });
      screen.appendChild(cta);
      device.appendChild(screen);
      stage.appendChild(device);

      const right = el("div", { class: "hp-device-narr" }, [
        el("div", { class: "hp-eyebrow", text: act && act.salesforceCapabilities ? act.salesforceCapabilities : data.products.slice(0, 2).join(" · ") }),
        el("h3", { class: "hp-h3", text: slideTitleOr(data, act && act.title ? act.title : "Live moment") }),
        el("p", { class: "hp-sub",
          text: (act && act.summary) || data.story.bigProblem || "Walk through the channel moment using real customer context." }),
      ]);
      // Stat strip
      const stats = el("div", { class: "hp-device-stats" });
      const personaName = (data.persona && data.persona.name) || data.customerName || "Customer";
      stats.appendChild(stat(personaName, "Persona"));
      if (act && act.channel) stats.appendChild(stat(act.channel, "Channel"));
      stats.appendChild(stat(data.industry || "—", "Industry"));
      right.appendChild(stats);

      stage.appendChild(right);
      root.appendChild(stage);
      return root;

      function stat(value, label) {
        return el("div", { class: "hp-device-stat" }, [
          el("div", { class: "hp-device-stat-v", text: value }),
          el("div", { class: "hp-device-stat-l", text: label }),
        ]);
      }
    },

    // ── KPI scorecard (bv-4 in polished template) ────────────────
    // Reads HOLO_SHARED.buildBvsMetrics — same source the adapter's
    // buildBvs() uses, so the preview and exported scorecard show
    // identical values and labels (including SE overrides from
    // storyFoundations.bvsMetrics).
    kpiScorecard: function (data, mode) {
      const root = el("div", { class: "hp hp-kpi" });
      root.appendChild(el("div", { class: "hp-eyebrow", text: fOr(data, "bvScorecardEyebrow", "BVS Benchmarks") }));
      // SE slide.title wins (SE layout); else bv-4 override; else literal.
      root.appendChild(el("h3", { class: "hp-h3", text: slideTitleOr(data, fOr(data, "bvScorecardHeadline", "The numbers that matter.")) }));
      const metrics = SHARED.buildBvsMetrics
        ? SHARED.buildBvsMetrics(data.foundations)
        : [];
      const grid = el("div", { class: "hp-kpi-grid" });
      // Render all metrics (buildBvsMetrics yields up to 5) so an edited
      // 5th metric isn't invisible in compact mode.
      metrics.forEach(function (k) {
        grid.appendChild(el("div", { class: "hp-kpi-card" }, [
          el("div", { class: "hp-kpi-value", text: k.value }),
          el("div", { class: "hp-kpi-label", text: k.label }),
        ]));
      });
      root.appendChild(grid);
      root.appendChild(el("div", { class: "hp-disclaimer",
        text: fOr(data, "bvScorecardDisclaimer", "⚠️ Replace placeholder values with real BVS benchmarks before presenting.") }));
      return root;
    },

    // ── Executive summary ────────────────────────────────────────
    executiveSummary: function (data, mode) {
      const root = el("div", { class: "hp hp-exec" });
      root.appendChild(el("div", { class: "hp-eyebrow", text: "Executive view" }));
      root.appendChild(el("h3", { class: "hp-h3",
        text: slideTitleOr(data, data.customerName ? data.customerName + " — the takeaway" : "The takeaway") }));

      const cols = el("div", { class: "hp-exec-cols" });
      cols.appendChild(execCol("Challenge",
        data.story.bigProblem || data.story.currentPain || "Add a current-state pain point in Step 2.",
        !data.story.bigProblem && !data.story.currentPain));
      cols.appendChild(execCol("Future state",
        data.story.futureVision || "Add the future-state vision in Step 2.",
        !data.story.futureVision));
      cols.appendChild(execCol("Capabilities",
        data.products.length ? data.products.join(" · ") : "Pick products in Step 1.",
        !data.products.length));
      root.appendChild(cols);

      if (mode === "expanded") {
        // Editor writes storyFoundations.executiveTakeaway; read that first,
        // then fall back to the legacy story.* values.
        const impact = (data.foundations && data.foundations.executiveTakeaway)
          || data.story.executiveTakeaway || data.story.businessValueMoments;
        if (impact) {
          root.appendChild(el("div", { class: "hp-callout", text: "Impact: " + truncate(impact, 240) }));
        }
        root.appendChild(el("div", { class: "hp-exec-cta",
          text: "Recommended next step: align on scope and confirm BVS metrics." }));
      }
      return root;

      function execCol(label, body, isFaded) {
        return el("div", { class: "hp-exec-col" + (isFaded ? " hp-faded" : "") }, [
          el("div", { class: "hp-exec-label", text: label }),
          el("div", { class: "hp-exec-body", text: truncate(body, mode === "expanded" ? 240 : 110) }),
        ]);
      }
    },

    // ── Story Foundation ─────────────────────────────────────────
    // Renders the four foundation pillars (problem, current, future,
    // thesis) — the "Why this matters" slide. Distinct from the
    // executive takeaway: this opens the deck, that closes it.
    storyFoundations:    function (d, m) { return LAYOUT_RENDERERS.storyFoundation(d, m); },
    storyFoundation: function (data, mode) {
      const f = data.foundations || {};
      const problem = f.businessProblem    || data.story.bigProblem   || data.story.currentPain   || "";
      const current = f.currentStatePain   || data.story.currentPain  || "";
      const future  = f.futureStateVision  || data.story.futureVision || "";
      const thesis  = f.transformationThesis || "";
      const root = el("div", { class: "hp hp-foundation" });
      root.appendChild(el("div", { class: "hp-eyebrow", text: data.eyebrow || "Story foundation" }));
      root.appendChild(el("h3", { class: "hp-h3",
        text: slideTitleOr(data, data.customerName ? "Why " + data.customerName + " — and why now" : "Why this matters") }));
      const grid = el("div", { class: "hp-foundation-grid" });
      grid.appendChild(pillar("Business problem",        problem, !problem));
      grid.appendChild(pillar("Current-state pain",      current, !current));
      grid.appendChild(pillar("Future-state vision",     future,  !future));
      grid.appendChild(pillar("Transformation thesis",   thesis || "Connect data + AI + CX so every interaction feels timely.", !thesis));
      root.appendChild(grid);
      if (mode === "expanded" && f.primaryNarrative) {
        root.appendChild(el("div", { class: "hp-callout", text: truncate(f.primaryNarrative, 240) }));
      }
      return root;

      function pillar(label, body, faded) {
        return el("div", { class: "hp-pillar" + (faded ? " hp-faded" : "") }, [
          el("div", { class: "hp-pillar-label", text: label }),
          el("div", { class: "hp-pillar-body", text: truncate(body, mode === "expanded" ? 200 : 110) }),
        ]);
      }
    },

    // ── Current vs Future ────────────────────────────────────────
    currentFutureState: function (data, mode) {
      const f = data.foundations || {};
      const current = f.currentStatePain  || data.story.currentPain  || data.story.bigProblem || "";
      const future  = f.futureStateVision || data.story.futureVision || "";
      const root = el("div", { class: "hp hp-twostate" });
      root.appendChild(el("div", { class: "hp-eyebrow", text: data.eyebrow || "Before / After" }));
      root.appendChild(el("h3", { class: "hp-h3", text: slideTitleOr(data, "From today to a connected future") }));
      const cols = el("div", { class: "hp-twostate-cols" });
      cols.appendChild(side("Today",  current || "Add the current-state pain.", !current, "hp-side-current"));
      cols.appendChild(side("Tomorrow", future  || "Add the future-state vision.", !future, "hp-side-future"));
      root.appendChild(cols);
      if (data.products.length) {
        const bridge = el("div", { class: "hp-bridge" });
        bridge.appendChild(el("div", { class: "hp-bridge-label", text: "What gets us there" }));
        const badges = el("div", { class: "hp-badges" });
        data.products.slice(0, 6).forEach(function (p) { badges.appendChild(el("span", { class: "hp-badge tone-red", text: p })); });
        bridge.appendChild(badges);
        if (data.products.length > 6) {
          bridge.appendChild(el("div", { class: "hp-more", text: "+ " + (data.products.length - 6) + " more products" }));
        }
        root.appendChild(bridge);
      }
      return root;
      function side(label, body, faded, klass) {
        return el("div", { class: "hp-side " + klass + (faded ? " hp-faded" : "") }, [
          el("div", { class: "hp-side-label", text: label }),
          el("div", { class: "hp-side-body", text: truncate(body, mode === "expanded" ? 240 : 110) }),
        ]);
      }
    },

    // ── Future state only ────────────────────────────────────────
    futureState: function (data, mode) {
      const f = data.foundations || {};
      const future = f.futureStateVision || data.story.futureVision || "";
      const root = el("div", { class: "hp hp-future" });
      root.appendChild(el("div", { class: "hp-eyebrow", text: "Future-state vision" }));
      root.appendChild(el("h3", { class: "hp-h3",
        text: slideTitleOr(data, data.customerName ? data.customerName + " — the future state" : "What good looks like") }));
      root.appendChild(el("p", { class: "hp-sub", text: truncate(future || "Add the future-state vision in Step 2.", mode === "expanded" ? 360 : 200) }));
      const outcomes = el("div", { class: "hp-future-outs" });
      const drivers = data.foundations.valueDrivers || [];
      drivers.slice(0, 4).forEach(function (v) {
        outcomes.appendChild(el("div", { class: "hp-future-out", text: v }));
      });
      if (outcomes.children.length) root.appendChild(outcomes);
      if (drivers.length > 4) {
        root.appendChild(el("div", { class: "hp-more", text: "+ " + (drivers.length - 4) + " more value drivers" }));
      }
      return root;
    },

    // ── Embedded CX Component (AubreyDemo) ───────────────────────
    embeddedCxComponent: function (data, mode) {
      const root = el("div", { class: "hp hp-embedded" });
      root.appendChild(el("div", { class: "hp-eyebrow", text: "Live CX component" }));
      const linked = data.linkedCxComponents || [];
      const fallback = (linked.length === 0 && data.cxComponents.length)
        ? data.cxComponents.slice(0, 1) : linked;
      const items = fallback.length ? fallback : [];
      root.appendChild(el("h3", { class: "hp-h3",
        text: slideTitleOr(data, items.length === 1 ? items[0].name : "Embedded demo moment") }));

      if (!items.length) {
        root.appendChild(el("div", { class: "hp-empty",
          html: "Link one or more <strong>AubreyDemo CX components</strong> in Step 4 to embed live screens here." }));
        return root;
      }

      const list = el("div", { class: "hp-embedded-list" });
      const cap = mode === "expanded" ? 3 : 2;
      items.slice(0, cap).forEach(function (c) {
        list.appendChild(componentCard(c, mode));
      });
      root.appendChild(list);
      if (items.length > cap) {
        root.appendChild(el("div", { class: "hp-more", text: "+ " + (items.length - cap) + " more components" }));
      }
      return root;

      function componentCard(c, mode) {
        const card = el("div", { class: "hp-embedded-card" });
        const head = el("div", { class: "hp-embedded-head" }, [
          el("div", { class: "hp-embedded-name", text: c.name || "(unnamed)" }),
          el("div", { class: "hp-embedded-type", text: (c.type || "web") + " · " + (c.deviceFrame || "mobile") }),
        ]);
        card.appendChild(head);
        const safe = isSafeHttpUrl(c.url) ? c.url : "";
        const trusted = isTrustedIframeOrigin(safe);
        if (mode === "expanded" && safe) {
          // Render a live iframe wrapped in a device chrome.
          // Sandbox tightening: drop allow-same-origin so a malicious
          // pasted URL can't read parent-origin cookies/storage. Trusted
          // origins (aubreydemo.com) keep allow-same-origin so their
          // scenes function normally.
          const wrap = el("div", { class: "hp-embedded-frame is-" + (c.deviceFrame || "mobile") });
          const ifr = el("iframe", {
            src: safe,
            sandbox: trusted
              ? "allow-scripts allow-same-origin allow-forms allow-popups"
              : "allow-scripts allow-forms allow-popups",
            referrerpolicy: "no-referrer",
            loading: "lazy",
            title: c.name || "CX component",
            style: "width: 100%; height: 100%; border: 0;",
          });
          wrap.appendChild(ifr);
          card.appendChild(wrap);
          if (!trusted) {
            card.appendChild(el("div", { class: "hp-asset-pill tone-gold",
              text: "Off-allowlist origin — sandbox tightened" }));
          }
        } else if (safe) {
          card.appendChild(el("div", { class: "hp-embedded-url", text: safe }));
        }
        if (!safe) {
          card.appendChild(el("div", { class: "hp-asset-pill tone-red", text: "URL needed" }));
        }
        if (c.linkedStoryActIds && c.linkedStoryActIds.length) {
          const act = (data.acts || []).find(function (a) { return c.linkedStoryActIds.indexOf(a.id) >= 0; });
          if (act) card.appendChild(el("div", { class: "hp-embedded-link", text: "Linked to: " + act.title }));
        }
        if (safe) {
          const open = el("a", { class: "hp-embedded-cta", href: safe, target: "_blank", rel: "noopener noreferrer", text: "Open in new tab ↗" });
          card.appendChild(open);
        }
        return card;
      }
    },

    // ── Next steps ───────────────────────────────────────────────
    nextSteps: function (data, mode) {
      const root = el("div", { class: "hp hp-next" });
      root.appendChild(el("div", { class: "hp-eyebrow", text: "Roadmap & next steps" }));
      root.appendChild(el("h3", { class: "hp-h3", text: slideTitleOr(data, "From today to launch") }));
      // Shared with the export so the phase list can't drift.
      const phases = SHARED.nextStepsPhases
        ? SHARED.nextStepsPhases()
        : ["Discovery & alignment", "Pilot / POV", "Roll-out", "Scale & optimize"];
      const list = el("ol", { class: "hp-next-list" });
      phases.slice(0, mode === "expanded" ? 4 : 3).forEach(function (p) {
        list.appendChild(el("li", { class: "hp-next-item", text: p }));
      });
      root.appendChild(list);
      return root;
    },

    // ═══════════════════════════════════════════════════════════
    //  RUNTIME-ONLY LAYOUTS
    //  Mirror slides the polished /demo template renders directly
    //  (intro, persona, business-value, journey-map sections) even
    //  when state.slides is empty. Surfaced via enumerateRuntimeSlides
    //  so SEs see the full deck in Step 8 and can edit copy via the
    //  pending-text editor.
    // ═══════════════════════════════════════════════════════════

    // ── Journey Map · 5-phase (Know · Reach · Engage · Recover · Convert) ──
    // Reads HOLO_SHARED.bucketActsIntoFive(): same source the adapter
    // uses, so the preview matrix and the exported circle row are
    // guaranteed to show identical phase titles/descriptions/badges.
    journeyMapMatrix: function (data, mode) {
      const prods = data.products || [];
      const f = data.foundations || {};
      const phases = SHARED.bucketActsIntoFive
        ? SHARED.bucketActsIntoFive(data.acts || [], prods, f.journeyPhases)
        : [];
      const root = el("div", { class: "hp hp-jmatrix" });
      const headline = f.transformationThesis
        ? truncate(f.transformationThesis, 70)
        : "A connected journey";
      root.appendChild(el("div", { class: "hp-eyebrow",
        text: fOr(data, "journeyEyebrow", data.customerName ? data.customerName + " · journey" : "Customer journey") }));
      root.appendChild(el("h3", { class: "hp-h3", text: headline }));
      const row = el("div", { class: "hp-jmatrix-row" });
      phases.forEach(function (p) {
        row.appendChild(el("div", { class: "hp-jmatrix-cell" }, [
          el("div", { class: "hp-jmatrix-icon", text: p.emoji }),
          el("div", { class: "hp-jmatrix-tag",  text: p.title }),
          el("div", { class: "hp-jmatrix-desc", text: p.descriptionShort }),
          el("div", { class: "hp-jmatrix-badge", text: p.badge }),
        ]));
      });
      root.appendChild(row);
      const tags = el("div", { class: "hp-badges" });
      const caps = prods.length ? prods : ["Agentforce", "Data Cloud", "Commerce", "Marketing Cloud"];
      caps.slice(0, 6).forEach(function (p) {
        tags.appendChild(el("span", { class: "hp-badge tone-red", text: p }));
      });
      root.appendChild(tags);
      if (caps.length > 6) {
        root.appendChild(el("div", { class: "hp-more", text: "+ " + (caps.length - 6) + " more products" }));
      }
      return root;
    },

    // ── Intro · Hero (vi-1) ──
    // Reads HOLO_SHARED.heroHeadlineParts so the headline stance
    // (agentic / unified / personalized / connected) and the sub-line
    // are byte-identical to the export.
    introHero: function (data, mode) {
      const root = el("div", { class: "hp hp-intro-hero" });
      const theme = data.theme || "Salesforce Customer Experience Vision";
      const name = data.customerName || "Customer";
      const parts = SHARED.heroHeadlineParts
        ? SHARED.heroHeadlineParts(name, data.foundations)
        : { name: name, before: "a", accent: "connected", after: "customer journey", override: "" };
      const heroHeadline = (parts.override && parts.override.trim())
        ? parts.override
        : (parts.name + ", " + parts.before + " " + parts.accent + " " + parts.after + ".");
      root.appendChild(el("div", { class: "hp-eyebrow", text: theme }));
      root.appendChild(el("h2", { class: "hp-title", text: heroHeadline }));
      root.appendChild(el("p", { class: "hp-sub", text: name + " + Salesforce" }));
      return root;
    },

    // ── Intro · Story hook (vi-2) ──
    // Reads HOLO_SHARED.storyHookParts + storyHookSubText so the
    // preview text equals what the polished template renders.
    introStoryHook: function (data, mode) {
      const root = el("div", { class: "hp hp-intro-hook" });
      const f = data.foundations || {};
      const theme = data.theme || "Salesforce Customer Experience Vision";
      const sub2 = (data.project && data.project.industry)
        ? data.project.industry + " · " + ((data.project && data.project.audience) || "Executive") + " story"
        : "Connected customer experience";
      const h = SHARED.storyHookParts
        ? SHARED.storyHookParts(f)
        : { lead: "From a single moment", emph: "lifetime", tail: "to a", suffix: "of relevance.", override: "" };
      const tail = h.tail ? h.tail + " " : "";
      const hook = (h.override && h.override.trim())
        ? h.override
        : (h.lead + " " + tail + h.emph + " " + h.suffix);
      const subText = SHARED.storyHookSubText
        ? SHARED.storyHookSubText(f)
        : "Every interaction builds context. Every context makes the next experience more personal.";
      root.appendChild(el("div", { class: "hp-eyebrow", text: theme + " · " + sub2 }));
      root.appendChild(el("h2", { class: "hp-title", text: hook }));
      root.appendChild(el("p", { class: "hp-sub", text: truncate(subText, mode === "expanded" ? 280 : 180) }));
      return root;
    },

    // ── Intro · Three acts overview (vi-3) ──
    // Reads HOLO_SHARED.threeActsFor() — same source the adapter's
    // buildDemoStructure() uses, so preview = export.
    introThreeActs: function (data, mode) {
      const acts = SHARED.threeActsFor ? SHARED.threeActsFor(data.foundations, data.acts || [], data.products || []) : [];
      const root = el("div", { class: "hp hp-three-acts" });
      root.appendChild(el("div", { class: "hp-eyebrow", text: fOr(data, "threeActsEyebrow", "What you'll see today") }));
      root.appendChild(el("h3", { class: "hp-h3", text: fOr(data, "threeActsHeadline", "Three acts. One agentic journey.") }));
      const grid = el("div", { class: "hp-three-grid" });
      acts.forEach(function (a, i) {
        grid.appendChild(el("div", { class: "hp-three-card" }, [
          el("div", { class: "hp-three-num", text: String(i + 1) }),
          el("div", { class: "hp-three-title", text: a.title }),
          el("div", { class: "hp-three-desc",  text: truncate(a.description, mode === "expanded" ? 200 : 110) }),
        ]));
      });
      root.appendChild(grid);
      return root;
    },

    // ── Intro · Vignette section (vi-4..6) ──
    // Reads HOLO_SHARED.vignettesFor() to share defaults with the
    // polished template's three vignette rows.
    introVignette: function (data, mode) {
      const idx = (data.slide && data.slide.runtimeIndex) || 0;
      const list = SHARED.vignettesFor ? SHARED.vignettesFor(data.foundations, data.acts || [], data.products || []) : [];
      const v = list[idx] || list[0] || { eyebrow: "DATA CLOUD", title: "Know & Reach", subtitle: "" };
      const root = el("div", { class: "hp hp-vignette" });
      root.appendChild(el("div", { class: "hp-eyebrow", text: v.eyebrow }));
      root.appendChild(el("h3", { class: "hp-h3", text: v.title }));
      root.appendChild(el("p", { class: "hp-sub",
        text: truncate(v.subtitle, mode === "expanded" ? 240 : 140) }));
      return root;
    },

    // ── Persona · Meet (mr-1) ──
    // Headline = "Meet <first>." Sub = "<Customer> · <journey arc>".
    // Pulls from HOLO_SHARED so the polished mr-s1 slide and this
    // tile read identically.
    personaIntro: function (data, mode) {
      const p = data.persona || {};
      const first = (SHARED.personaFirstName ? SHARED.personaFirstName(p) : "") || "your persona";
      const root = el("div", { class: "hp hp-persona-intro" });
      root.appendChild(el("div", { class: "hp-eyebrow", text: fOr(data, "personaIntroEyebrow", "Customer Spotlight") }));
      root.appendChild(el("h2", { class: "hp-title", text: "Meet " + first + "." }));
      root.appendChild(el("p", { class: "hp-sub",
        text: SHARED.personaIntroSub
          ? SHARED.personaIntroSub(p, data.customerName)
          : (data.customerName || "Customer") + " · [TODO: journey arc]" }));
      return root;
    },

    // ── Persona · Wishlist (mr-3) ──
    personaWishlist: function (data, mode) {
      const p = data.persona || {};
      const sf = data.foundations || {};
      const pron = pronounsFor(p.pronouns);
      // Precedence matches the export (holodeck-adapter.js buildPersona) and
      // the editor prefill (_rt_persona_wishlist): SE-typed persona rows →
      // story-driven chrome from the Gemini extraction (storyFoundations) →
      // neutral pronoun-aware default. Keeps preview ≡ exported deck even
      // before the SE opens the wishlist editor.
      const aiWish = (Array.isArray(sf.wishlist) && sf.wishlist.length) ? sf.wishlist : null;
      const wish = (p.wishlist && p.wishlist.length)
        ? p.wishlist
        : (aiWish || (SHARED.defaultWishlist ? SHARED.defaultWishlist(pron) : [
            { name: "[TODO: top recommendation]", tag: "FOR " + pron.obj.toUpperCase(), detail: "[TODO]", emoji: "⭐" },
            { name: "[TODO: companion]",          tag: "AI MATCH",                      detail: "[TODO]", emoji: "✨" },
            { name: "[TODO: related option]",     tag: "RELATED",                       detail: "[TODO]", emoji: "➕" },
          ]));
      const root = el("div", { class: "hp hp-wishlist" });
      // Headline: SE's own (non-legacy) → story-driven → pronoun default.
      // The story headline is authoritative custom copy, passed as-is.
      const stored = p.wishlistHeadline;
      const headline = (stored && !isLegacyWishlistHeadline(stored))
        ? stored
        : ((sf.wishlistHeadline && String(sf.wishlistHeadline).trim())
            || wishlistHeadlineFor(pron));
      const headlineClean = String(headline).replace(/<\/?[^>]+>/g, "");
      // Label/eyebrow: SE's own → story-driven eyebrow → "<First>'s Wishlist".
      const first = (SHARED.personaFirstName ? SHARED.personaFirstName(p) : "") || "";
      const wishLabelDefault = (sf.wishlistEyebrow && String(sf.wishlistEyebrow).trim())
        || (first ? (first + "'s Wishlist") : "Wishlist");
      root.appendChild(el("div", { class: "hp-eyebrow", text: p.wishlistLabel || wishLabelDefault }));
      root.appendChild(el("h3", { class: "hp-h3", text: headlineClean }));
      const cards = el("div", { class: "hp-wish-cards" });
      // Render up to 4 rows (matches the export cap) and show the emoji
      // subfield the polished deck renders, so editing a 4th row / emoji
      // shows here too.
      wish.slice(0, 4).forEach(function (item, i) {
        cards.appendChild(el("div", { class: "hp-wish-card" + (i === 0 ? " is-featured" : "") }, [
          item.emoji ? el("div", { class: "hp-wish-emoji", text: item.emoji }) : null,
          el("div", { class: "hp-wish-tag",    text: item.tag || "PICK" }),
          el("div", { class: "hp-wish-name",   text: item.name || "—" }),
          el("div", { class: "hp-wish-detail", text: truncate(item.detail || "", mode === "expanded" ? 90 : 50) }),
        ].filter(Boolean)));
      });
      root.appendChild(cards);
      if (wish.length > 4) {
        root.appendChild(el("div", { class: "hp-more", text: "+ " + (wish.length - 4) + " more items" }));
      }
      return root;
    },

    // ── Persona · CTA into demo (mr-4) ──
    // Matches holodeck-adapter.js buildPersona() ctaHeadline / ctaSub /
    // ctaLabel so what the SE sees here is exactly what the polished
    // /demo template will render.
    // CTA copy reads HOLO_SHARED.personaCtaCopy so the ctaHeadline /
    // ctaSub / ctaLabel the adapter writes into HOLODECK_CONFIG match
    // this preview tile exactly.
    personaCta: function (data, mode) {
      const cta = SHARED.personaCtaCopy
        ? SHARED.personaCtaCopy(data.persona || {}, data.story || {}, data.foundations || {})
        : { label: "BEGIN THE JOURNEY →", headline: "Let's follow the journey.", sub: "" };
      const root = el("div", { class: "hp hp-persona-cta" });
      root.appendChild(el("div", { class: "hp-eyebrow", text: fOr(data, "personaCtaEyebrow", "The Customer Journey") }));
      root.appendChild(el("h2", { class: "hp-title", text: cta.headline }));
      root.appendChild(el("p", { class: "hp-sub", text: cta.sub }));
      // Strip the &nbsp; that the export keeps (HTML context); preview
      // renders text nodes so we want a plain space + arrow. CTA label is
      // SE-overridable (personaCtaLabel) — fall back to the shared default.
      root.appendChild(el("div", { class: "hp-cta-btn",
        text: String(fOr(data, "personaCtaLabel", cta.label)).replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim() }));
      return root;
    },

    // ── Demo · Chapter opener (auto-prepended) ──
    // Reads HOLO_SHARED.chapterOpenerCopy so the eyebrow/headline/sub
    // are byte-identical to demo-deck-renderer.js defaultOpenerSub.
    chapterOpener: function (data, mode) {
      const root = el("div", { class: "hp hp-opener" });
      const c = SHARED.chapterOpenerCopy
        ? SHARED.chapterOpenerCopy({
            customerName: data.customerName,
            persona:      data.persona,
            acts:         data.acts || [],
            theme:        data.theme,
            demoTitle:    (data.foundations && data.foundations.demoTitle) || "",
          })
        : { eyebrow: "Customer Demo",
            headline: "Every relationship begins with a single moment.",
            sub: "" };
      root.appendChild(el("div", { class: "hp-eyebrow", text: c.eyebrow }));
      root.appendChild(el("h2", { class: "hp-title", text: c.headline }));
      root.appendChild(el("p", { class: "hp-sub", text: c.sub }));
      return root;
    },

    // ── BV · Outcome opener (bv-1) ──
    bvOpener: function (data, mode) {
      const root = el("div", { class: "hp hp-bv-opener" });
      root.appendChild(el("div", { class: "hp-eyebrow", text: fOr(data, "bvOpenerEyebrow", "The Business Outcome") }));
      root.appendChild(el("h2", { class: "hp-title",
        text: fOr(data, "bvOpenerHeadline", "A completely connected journey. Driven by AI.") }));
      root.appendChild(el("p", { class: "hp-sub",
        text: fOr(data, "bvOpenerSub", "Higher conversion. Increased AOV. Lifelong loyalty.") }));
      return root;
    },

    // ── BV · Orbit (bv-2) ──
    bvOrbit: function (data, mode) {
      const root = el("div", { class: "hp hp-bv-orbit" });
      root.appendChild(el("div", { class: "hp-eyebrow", text: fOr(data, "bvOrbitEyebrow", "How it all connects") }));
      root.appendChild(el("h3", { class: "hp-h3",
        text: fOr(data, "bvOrbitHeadline", data.customerName ? data.customerName + " · the orbit" : "One platform. Every moment.") }));
      const orbit = el("div", { class: "hp-orbit-vis" });
      // Match the export's orbit center (buildOrbitCenter): industry emoji
      // prefix + name, so preview = export.
      const centerEmoji = SHARED.emojiForIndustry ? SHARED.emojiForIndustry(data.industry) : "";
      orbit.appendChild(el("div", { class: "hp-orbit-center",
        text: (centerEmoji ? centerEmoji + " " : "") + (data.customerName || "BRAND").slice(0, 14).toUpperCase() }));
      // Same 6-slot list the adapter writes into HOLODECK_CONFIG.orbitNodes
      // (defaults → product-derived → storyFoundations.orbitNodes overrides).
      const nodes = SHARED.buildOrbitNodes
        ? SHARED.buildOrbitNodes(data.foundations, data.products || [])
        : [];
      nodes.slice(0, 6).forEach(function (n, i) {
        orbit.appendChild(el("div", { class: "hp-orbit-pill hp-orbit-pos-" + i,
          text: (n.icon ? n.icon + " " : "") + (n.label || "[TODO]") }));
      });
      root.appendChild(orbit);
      return root;
    },

    // ── BV · Capabilities recap (bv-3) ──
    // Reads the same SHARED.buildCapabilities the adapter writes
    // into HOLODECK_CONFIG.technologies, so SE overrides on
    // storyFoundations.capabilities show up identically in preview
    // and export.
    bvCapabilities: function (data, mode) {
      const root = el("div", { class: "hp hp-bv-caps" });
      root.appendChild(el("div", { class: "hp-eyebrow", text: fOr(data, "bvCapsEyebrow", "Key Capabilities Shown Today") }));
      root.appendChild(el("h3", { class: "hp-h3", text: fOr(data, "bvCapsHeadline", "Personalize. Search. Convert.") }));
      const grid = el("div", { class: "hp-bv-caps-grid" });
      const caps = SHARED.buildCapabilities
        ? SHARED.buildCapabilities(data.foundations, data.products || [])
        : [];
      const limit = mode === "expanded" ? 6 : 4;
      caps.slice(0, limit).forEach(function (c) {
        grid.appendChild(el("div", { class: "hp-bv-cap" }, [
          el("div", { class: "hp-bv-cap-title", text: c.label || "—" }),
          el("div", { class: "hp-bv-cap-desc",  text: truncate(c.description || "", mode === "expanded" ? 120 : 70) }),
        ]));
      });
      root.appendChild(grid);
      if (caps.length > limit) {
        root.appendChild(el("div", { class: "hp-more", text: "+ " + (caps.length - limit) + " more capabilities" }));
      }
      return root;
    },

    // ── BV · Closing slide (bv-5) ──
    bvClosing: function (data, mode) {
      const root = el("div", { class: "hp hp-bv-closing" });
      const f = data.foundations || {};
      const quote = f.executiveTakeaway || data.story.executiveTakeaway
        || "[TODO: closing executive quote]";
      root.appendChild(el("div", { class: "hp-eyebrow",
        text: fOr(data, "bvClosingEyebrow", (data.customerName || "Customer") + " + Salesforce") }));
      // Truncate to 120 to match the export (oneSentence/120) so the same
      // takeaway reads identically in preview and the polished deck.
      root.appendChild(el("h2", { class: "hp-title", text: "”" + truncate(quote, 120) + "”" }));
      return root;
    },

    // ── Story / context interstitial ───────────────────────────
    // Wireframe mirror of the /demo storyInterstitial renderer: kicker
    // eyebrow + big headline + sub-line, all from per-slide fields.
    storyInterstitial: function (data, mode) {
      const s = data.slide || {};
      const root = el("div", { class: "hp hp-interstitial" });
      const kicker = s.kicker || s.eyebrow || data.eyebrow || "";
      if (kicker) root.appendChild(el("div", { class: "hp-eyebrow", text: String(kicker).toUpperCase() }));
      root.appendChild(el("h3", { class: "hp-h3 hp-h3-xl",
        text: s.headline || s.title || data.title || "Two months have passed." }));
      const sub = s.sub || s.subline || "";
      if (sub) root.appendChild(el("p", { class: "hp-sub", text: sub }));
      return root;
    },

    // ── Unknown layout — neutral, never duplicates other slides ──
    unknown: function (data, mode) {
      const root = el("div", { class: "hp hp-unknown" });
      root.appendChild(el("div", { class: "hp-eyebrow", text: "Slide" }));
      root.appendChild(el("h3", { class: "hp-h3", text: data.title || "Untitled slide" }));
      root.appendChild(el("p", { class: "hp-sub",
        text: "This slide doesn't have a layout yet. Pick one in the slide planner so the preview can render it correctly." }));
      if (data.products.length) {
        const badges = el("div", { class: "hp-badges" });
        data.products.slice(0, 5).forEach(function (p) { badges.appendChild(el("span", { class: "hp-badge tone-blue", text: p })); });
        root.appendChild(badges);
      }
      return root;
    },
  };

  function isSafeHttpUrl(s) {
    if (!s || typeof s !== "string") return false;
    try { const u = new URL(s); return u.protocol === "http:" || u.protocol === "https:"; }
    catch (e) { return false; }
  }

  // Trusted origins are allowed allow-same-origin; everything else gets
  // a tightened sandbox. Edit this list when more demo platforms come on.
  const TRUSTED_IFRAME_HOSTS = ["aubreydemo.com"];
  function isTrustedIframeOrigin(s) {
    if (!s) return false;
    try {
      const u = new URL(s);
      return TRUSTED_IFRAME_HOSTS.some(function (h) {
        return u.hostname === h || u.hostname.endsWith("." + h);
      });
    } catch (e) { return false; }
  }

  // ─── Helpers used by multiple layouts ─────────────────────────
  // Delegate to HOLO_SHARED.agentChat so the agentConversation preview and
  // the exported iframe-phone slide show identical chat copy. Reconstruct
  // the minimal state shape the shared helper reads from `data`.
  function agentChatFromData(data) {
    const st = {
      story:    data.story || {},
      personas: data.persona ? [data.persona] : [],
      project:  { industry: data.industry || "" },
    };
    if (SHARED.agentChat) return SHARED.agentChat(st);
    return { user: "How can you help me?", agent: "Here's what I'd recommend." };
  }
  function pickUserMessage(data)  { return agentChatFromData(data).user; }
  function pickAgentMessage(data) { return agentChatFromData(data).agent; }
  // Delegate to HOLO_SHARED so adapter and preview produce identical
  // truncation (same ellipsis behavior, same whitespace handling).
  function truncate(s, max) {
    if (SHARED.truncate) return SHARED.truncate(s, max);
    if (!s) return "";
    s = String(s).replace(/\s+/g, " ").trim();
    if (s.length <= max) return s;
    return s.slice(0, max - 1).replace(/\s+\S*$/, "") + "…";
  }

  // ═══════════════════════════════════════════════════════════════
  //  enumerateRuntimeSlides
  //  Returns the EXACT ordered slide list the polished /demo template
  //  renders at runtime. The exported template is the source of truth:
  //
  //    • JOURNEY MAP   → 1 hardcoded slide (sec-map)
  //    • INTRO         → 3 hardcoded (vi-1..3) + 3 dynamic vignettes (vi-4..6)
  //    • MEET PERSONA  → 4 hardcoded (mr-1..4)
  //    • DEMO          → 1 chapter opener (auto-prepended) + state.slides
  //                      filtered to sectionId === "demo" (or untagged,
  //                      treated as demo for legacy state)
  //    • BUSINESS VALUE → 5 hardcoded (bv-1..5)
  //
  //  Total = 17 fixed + (demo slides). Slides the SE assigned to other
  //  sections are NOT shown here, because the polished /demo template
  //  doesn't render them — they would be silently dropped on export, so
  //  surfacing them in the preview just creates the mismatch the user
  //  reported (preview said 30, export had 21).
  //
  //  Section / layout order matches the on-screen order the polished
  //  template uses: Journey Map first, then Intro, Meet Persona, Demo,
  //  Business Value (see <nav> in demo-holodeck-unified.html).
  //
  //  Each entry is shaped like a state.slide so renderPreviewCard can
  //  consume it directly. Synthetic (runtime-only) entries are tagged
  //  with `synthetic: true` so the preview UI can suppress mutating
  //  actions (move/remove) for them.
  // ═══════════════════════════════════════════════════════════════
  function enumerateRuntimeSlides(state) {
    // Slide manifest lives in HOLO_SHARED.buildSlideManifest so the
    // builder's Step 8 preview list and the export's slide order are
    // generated from one place — adding/removing/reordering a runtime
    // slide here fixes both code paths automatically.
    if (SHARED.buildSlideManifest) return SHARED.buildSlideManifest(state);
    // Conservative fallback: if the shared module is missing, pass
    // through whatever real demo slides the SE authored so the preview
    // still has something to render.
    return ((state && state.slides) || []).slice();
  }

  // ─── Public API ───────────────────────────────────────────────
  global.HOLO_PREVIEW = {
    renderPreviewCard:           renderPreviewCard,
    renderSlidePreview:          renderSlidePreview,
    getPreviewDataForSlide:      getPreviewDataForSlide,
    getMissingInputsForPreview:  getMissingInputsForPreview,
    assetReadiness:              assetReadiness,
    readinessPill:               readinessPill,
    layoutLabelFor:              layoutLabelFor,
    enumerateRuntimeSlides:      enumerateRuntimeSlides,
    editorFieldsForSlide:        editorFieldsForSlide,
    buildEditorPopover:          buildEditorPopover,
    getAtPath:                   getAtPath,
    setAtPath:                   setAtPath,
    LAYOUT_RENDERERS:            LAYOUT_RENDERERS,
  };
})(window);
