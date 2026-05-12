// ════════════════════════════════════════════════════════════════
//  PREVIEW RENDERER
//  Realistic per-layout previews of the final holodeck screens.
//  Driven by the real builder state — customer name, brand colors,
//  personas, story acts, products, business value text, assets.
//
//  Two modes:
//    • compact   — small card for scanning slide order
//    • expanded  — close approximation of the final screen
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

    const card = el("div", { class: "bx-preview hp-card hp-card-" + mode });

    // Header
    card.appendChild(el("div", { class: "bx-preview-num",
      text: "Slide " + ((slide.order || 0) + 1) }));
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

    // Footer actions
    if (handlers.onMoveUp || handlers.onMoveDown || handlers.onRemove) {
      const actions = el("div", { class: "bx-preview-actions" });
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
      embeddedCxComponent: "Embedded CX Component",
      kpiScorecard: "KPI Scorecard",
      executiveSummary: "Executive Takeaway",
      nextSteps: "Next Steps",
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
      const title = data.customerName
        ? el("h2", { class: "hp-title" }, [
            el("span", { class: "hp-title-customer", text: data.customerName }),
            el("br"),
            el("span", { class: "hp-title-tagline", text: data.theme || "+ Salesforce" }),
          ])
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
        root.appendChild(el("div", { class: "hp-logo-tag", text: data.brand.logoPath }));
      }
      return root;
    },

    // ── Journey timeline ─────────────────────────────────────────
    journeyTimeline: function (data, mode) {
      const root = el("div", { class: "hp hp-timeline" });
      root.appendChild(el("div", { class: "hp-eyebrow", text: data.eyebrow || "Customer journey" }));
      root.appendChild(el("h3", { class: "hp-h3", text: data.customerName ? "How " + data.customerName + " moves through the journey" : "Customer journey" }));

      if (!data.acts.length) {
        root.appendChild(el("div", { class: "hp-empty",
          html: "Add story acts in <strong>Step 2</strong> to populate the timeline." }));
        return root;
      }

      const rail = el("div", { class: "hp-rail" });
      const max = mode === "expanded" ? 8 : 5;
      data.acts.slice(0, max).forEach(function (a, i) {
        const node = el("div", { class: "hp-rail-node" }, [
          el("div", { class: "hp-rail-dot" }, [el("span", { text: String(i + 1) })]),
          el("div", { class: "hp-rail-card" }, [
            a.title ? el("div", { class: "hp-rail-title", text: a.title }) : null,
            a.persona ? el("div", { class: "hp-rail-meta", text: "👤 " + a.persona }) : null,
            a.channel ? el("div", { class: "hp-rail-meta", text: "📱 " + a.channel }) : null,
            a.summary ? el("div", { class: "hp-rail-summary", text: truncate(a.summary, mode === "expanded" ? 180 : 90) }) : null,
            a.salesforceCapabilities ? el("div", { class: "hp-rail-cap", text: a.salesforceCapabilities }) : null,
            a.businessValue ? el("div", { class: "hp-rail-bv", text: "→ " + a.businessValue }) : null,
          ]),
        ]);
        rail.appendChild(node);
      });
      root.appendChild(rail);
      if (data.acts.length > max) {
        root.appendChild(el("div", { class: "hp-more", text: "+ " + (data.acts.length - max) + " more acts" }));
      }
      return root;
    },

    // ── Demo map ──────────────────────────────────────────────────
    demoMap: function (data, mode) {
      const root = el("div", { class: "hp hp-demomap" });
      root.appendChild(el("div", { class: "hp-eyebrow", text: data.eyebrow || "Demo map" }));
      root.appendChild(el("h3", { class: "hp-h3", text: "End-to-end demo flow" }));

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
      return root;
    },

    // ── Persona card ──────────────────────────────────────────────
    personaCard: function (data, mode) {
      const root = el("div", { class: "hp hp-persona" });
      const p = data.persona;
      root.appendChild(el("div", { class: "hp-eyebrow", text: "Meet the persona" }));
      if (!p) {
        root.appendChild(el("div", { class: "hp-empty",
          html: "Add a persona in <strong>Step 2</strong> — name, role, goals, pain points." }));
        return root;
      }
      const left = el("div", { class: "hp-persona-l" }, [
        el("div", { class: "hp-persona-avatar", text: (p.name || "?").slice(0, 1).toUpperCase() }),
        el("div", { class: "hp-persona-name", text: p.name || "—" }),
        p.role ? el("div", { class: "hp-persona-role", text: p.role }) : null,
      ]);
      const right = el("div", { class: "hp-persona-r" }, [
        p.goals ? section("Goals", p.goals) : null,
        p.painPoints ? section("Pain points", p.painPoints) : null,
        (mode === "expanded" && p.demoRelevance) ? section("Why she anchors the demo", p.demoRelevance) : null,
      ]);
      root.appendChild(el("div", { class: "hp-persona-row" }, [left, right]));
      return root;

      function section(label, body) {
        return el("div", { class: "hp-persona-sec" }, [
          el("div", { class: "hp-persona-label", text: label }),
          el("div", { class: "hp-persona-body", text: truncate(body, mode === "expanded" ? 240 : 120) }),
        ]);
      }
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
      const sources = data.story.dataCloudMoments
        ? data.story.dataCloudMoments.split(/[,;\n]/).map(function (s) { return s.trim(); }).filter(Boolean)
        : ["Web", "Email", "POS", "App"];
      sources.slice(0, 6).forEach(function (s) {
        segChips.appendChild(el("span", { class: "hp-chip tone-gold", text: s }));
      });
      segs.appendChild(segChips);
      card.appendChild(segs);

      if (mode === "expanded") {
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
      root.appendChild(el("h3", { class: "hp-h3", text: data.customerName ? data.customerName + " · platform map" : "Platform map" }));

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
      const isLaptop = /laptop|macbook|web|desktop|store|associate|console/i.test(channel);
      root.appendChild(el("div", { class: "hp-eyebrow", text: "Channel · " + channel }));

      const stage = el("div", { class: "hp-device-stage" });
      const device = el("div", { class: "hp-device-frame " + (isLaptop ? "is-laptop" : "is-phone") });
      const screen = el("div", { class: "hp-device-screen" });
      // Faux UI inside the device
      screen.appendChild(el("div", { class: "hp-device-bar" }));
      const headline = el("div", { class: "hp-device-headline",
        text: (act && act.demoMoment) || "Product moment" });
      screen.appendChild(headline);
      if (act && act.summary) {
        screen.appendChild(el("div", { class: "hp-device-body", text: truncate(act.summary, 120) }));
      }
      const cta = el("div", { class: "hp-device-cta", text: act && act.businessValue ? truncate(act.businessValue, 40) : "Take action" });
      screen.appendChild(cta);
      device.appendChild(screen);
      stage.appendChild(device);

      const right = el("div", { class: "hp-device-narr" }, [
        el("div", { class: "hp-eyebrow", text: act && act.salesforceCapabilities ? act.salesforceCapabilities : data.products.slice(0, 2).join(" · ") }),
        el("h3", { class: "hp-h3", text: act && act.title ? act.title : "Live moment" }),
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

    // ── KPI scorecard ────────────────────────────────────────────
    kpiScorecard: function (data, mode) {
      const root = el("div", { class: "hp hp-kpi" });
      root.appendChild(el("div", { class: "hp-eyebrow", text: "Business value" }));
      root.appendChild(el("h3", { class: "hp-h3",
        text: data.customerName ? "Why " + data.customerName + " wins" : "Business value scorecard" }));

      const grid = el("div", { class: "hp-kpi-grid" });
      const kpis = (data.kpis || []).slice(0, mode === "expanded" ? 5 : 4);
      kpis.forEach(function (k) {
        grid.appendChild(el("div", { class: "hp-kpi-card" }, [
          el("div", { class: "hp-kpi-value", text: k.value }),
          el("div", { class: "hp-kpi-label", text: k.label }),
          mode === "expanded" && k.hint ? el("div", { class: "hp-kpi-hint", text: k.hint }) : null,
        ]));
      });
      root.appendChild(grid);
      if (data.story.businessValueMoments) {
        root.appendChild(el("div", { class: "hp-callout",
          text: truncate(data.story.businessValueMoments, mode === "expanded" ? 280 : 140) }));
      }
      root.appendChild(el("div", { class: "hp-disclaimer",
        text: "Replace XX% / +$XX / XXh placeholders with BVS-approved values before presenting." }));
      return root;
    },

    // ── Executive summary ────────────────────────────────────────
    executiveSummary: function (data, mode) {
      const root = el("div", { class: "hp hp-exec" });
      root.appendChild(el("div", { class: "hp-eyebrow", text: "Executive view" }));
      root.appendChild(el("h3", { class: "hp-h3",
        text: data.customerName ? data.customerName + " — the takeaway" : "The takeaway" }));

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
        const impact = data.story.executiveTakeaway || data.story.businessValueMoments;
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
        text: data.customerName ? "Why " + data.customerName + " — and why now" : "Why this matters" }));
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
      root.appendChild(el("h3", { class: "hp-h3", text: "From today to a connected future" }));
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
        text: data.customerName ? data.customerName + " — the future state" : "What good looks like" }));
      root.appendChild(el("p", { class: "hp-sub", text: truncate(future || "Add the future-state vision in Step 2.", mode === "expanded" ? 360 : 200) }));
      const outcomes = el("div", { class: "hp-future-outs" });
      (data.foundations.valueDrivers || []).slice(0, 4).forEach(function (v) {
        outcomes.appendChild(el("div", { class: "hp-future-out", text: v }));
      });
      if (outcomes.children.length) root.appendChild(outcomes);
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
        text: items.length === 1 ? items[0].name : (data.title || "Embedded demo moment") }));

      if (!items.length) {
        root.appendChild(el("div", { class: "hp-empty",
          html: "Link one or more <strong>AubreyDemo CX components</strong> in Step 4 to embed live screens here." }));
        return root;
      }

      const list = el("div", { class: "hp-embedded-list" });
      items.slice(0, mode === "expanded" ? 3 : 2).forEach(function (c) {
        list.appendChild(componentCard(c, mode));
      });
      root.appendChild(list);
      return root;

      function componentCard(c, mode) {
        const card = el("div", { class: "hp-embedded-card" });
        const head = el("div", { class: "hp-embedded-head" }, [
          el("div", { class: "hp-embedded-name", text: c.name || "(unnamed)" }),
          el("div", { class: "hp-embedded-type", text: (c.type || "web") + " · " + (c.deviceFrame || "desktop") }),
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
          const wrap = el("div", { class: "hp-embedded-frame is-" + (c.deviceFrame || "desktop") });
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
      root.appendChild(el("h3", { class: "hp-h3", text: "From today to launch" }));
      const phases = ["Discovery & alignment", "Pilot / POV", "Roll-out", "Scale & optimize"];
      const list = el("ol", { class: "hp-next-list" });
      phases.slice(0, mode === "expanded" ? 4 : 3).forEach(function (p) {
        list.appendChild(el("li", { class: "hp-next-item", text: p }));
      });
      root.appendChild(list);
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
  function pickUserMessage(data) {
    if (data.story.agentforceMoments) {
      const t = String(data.story.agentforceMoments).split(/[.!?\n]/)[0];
      if (t && t.trim().length > 8) return t.trim() + "?";
    }
    const personaPain = data.persona && data.persona.painPoints;
    if (personaPain) return truncate(personaPain, 80);
    return "I need help with " + (data.industry ? data.industry.toLowerCase() : "this") + ". Where do I start?";
  }
  function pickAgentMessage(data) {
    if (data.story.futureVision) return truncate(data.story.futureVision, 140);
    if (data.story.businessValueMoments) return truncate(data.story.businessValueMoments, 140);
    return "Here's what I'd recommend, grounded in your unified profile and your last interaction.";
  }
  function truncate(s, max) {
    if (!s) return "";
    s = String(s).replace(/\s+/g, " ").trim();
    if (s.length <= max) return s;
    return s.slice(0, max - 1).replace(/\s+\S*$/, "") + "…";
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
    LAYOUT_RENDERERS:            LAYOUT_RENDERERS,
  };
})(window);
