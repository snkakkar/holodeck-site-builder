// ════════════════════════════════════════════════════════════════
//  DEMO DECK RENDERER
//  Builds the Demo section's slide deck dynamically from
//  window.HOLODECK_CONFIG.builderPlan.slides[]
//
//  WHY THIS EXISTS
//  ───────────────
//  The Holodeck template's other four sections (Journey Map, Intro,
//  Meet Persona, Business Value) are config-driven and render
//  cleanly for any customer.  The Demo section used to be 14
//  hardcoded At-Home-specific slides — which meant:
//    1. Other customer demos showed At Home copy bleeding through.
//    2. Empty asset paths left half the screen blank.
//
//  This file replaces those 14 fixed slides with a slide-per-layout
//  renderer.  The SE picks a slide plan in the Builder; that plan is
//  serialized into builderPlan.slides[] and the Demo section renders
//  one polished slide per entry, regardless of what assets are or
//  aren't available.
//
//  HOW IT'S WIRED
//  ──────────────
//  Loaded after holodeck-render.js (which builds STORY).  Reads
//  STORY.builderSlides if present (preferred — contains demo-section
//  slides only); falls back to walking builderPlan.slides directly.
//
//  Each slide layout has its own renderer below.  All renderers
//  return a fully-styled <div class="pslide"> — no asset dependency,
//  so the deck is presentable from the moment of export.
// ════════════════════════════════════════════════════════════════

(function () {
  "use strict";

  // ─── Read the slide plan ──────────────────────────────────────
  const CFG  = window.HOLODECK_CONFIG || {};
  const plan = CFG.builderPlan || {};
  const allSlides = plan.slides || [];
  // Demo deck = slides assigned to the "demo" section.  If nothing
  // tagged, treat all of them as demo (legacy configs).
  const demoSlides = allSlides.filter(function (s) { return !s.sectionId || s.sectionId === "demo"; });

  const wrap = document.getElementById("demo-wrap");
  if (!wrap) return;

  // ─── Helpers ──────────────────────────────────────────────────
  function el(tag, attrs, children) {
    const node = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === "class") node.className = attrs[k];
      else if (k === "html") node.innerHTML = attrs[k];
      else if (k === "text") node.textContent = attrs[k];
      else node.setAttribute(k, attrs[k]);
    });
    (children || []).forEach(function (c) {
      if (c == null || c === false) return;
      node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    });
    return node;
  }

  function escapeHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  // Resolve a CX component ID to its config entry (for embedded slides)
  const cxList = (plan.cxComponents || []);
  function cxById(id) { return cxList.find(function (c) { return c.id === id; }) || null; }

  const persona = (plan.personas && plan.personas[0]) || null;
  const customer = CFG.customer || {};
  const products = plan.products || [];
  const acts = plan.storyActs || [];
  const f = plan.storyFoundations || {};

  // ─── Layout renderers ─────────────────────────────────────────
  // Each takes the slide config and returns the slide's INNER DOM.
  // The wrapper (.pslide) is added by buildSlide() below.
  const RENDERERS = {

    // Title / hero — used for Setup, Future State, Takeaway, Hero
    hero: function (s) {
      return [
        el("p", { class: "dd-title-eyebrow", text: deriveEyebrow(s) }),
        el("h1", { class: "dd-title-headline", html: deriveHeadline(s) }),
        el("p", { class: "dd-title-sub", text: deriveSub(s) }),
      ];
    },
    storyFoundation: function (s) {
      const items = [];
      if (f.businessProblem)      items.push(["Business problem",      f.businessProblem]);
      if (f.currentStatePain)     items.push(["Current-state pain",    f.currentStatePain]);
      if (f.futureStateVision)    items.push(["Future-state vision",   f.futureStateVision]);
      if (f.transformationThesis) items.push(["Transformation thesis", f.transformationThesis]);
      return [
        el("p", { class: "dd-title-eyebrow", text: "Story Foundation" }),
        el("h1", { class: "dd-title-headline", html: s.title || "Why this matters" }),
        el("div", { class: "dd-foundation-grid" },
          items.length
            ? items.map(function (kv) {
                return el("div", { class: "dd-foundation-card" }, [
                  el("div", { class: "dd-foundation-label", text: kv[0] }),
                  el("div", { class: "dd-foundation-body",  text: kv[1] }),
                ]);
              })
            : [el("div", { class: "dd-empty-msg", text: "Add foundations in Step 3 of the Builder." })]
        ),
      ];
    },
    currentFutureState: function (s) {
      return [
        el("p", { class: "dd-title-eyebrow", text: "Before / After" }),
        el("h1", { class: "dd-title-headline", html: s.title || "From today to a connected future" }),
        el("div", { class: "dd-twostate" }, [
          el("div", { class: "dd-twostate-col dd-twostate-current" }, [
            el("div", { class: "dd-twostate-label", text: "Today" }),
            el("div", { class: "dd-twostate-body", text: f.currentStatePain || "Add a current-state pain in Step 3." }),
          ]),
          el("div", { class: "dd-twostate-col dd-twostate-future" }, [
            el("div", { class: "dd-twostate-label", text: "Tomorrow" }),
            el("div", { class: "dd-twostate-body", text: f.futureStateVision || "Add the future-state vision in Step 3." }),
          ]),
        ]),
        products.length ? el("div", { class: "dd-bridge" }, [
          el("div", { class: "dd-bridge-label", text: "What gets us there" }),
          el("div", { class: "dd-badges" }, products.slice(0, 6).map(function (p) {
            return el("span", { class: "dd-badge dd-badge-red", text: p });
          })),
        ]) : null,
      ];
    },
    futureState: function (s) {
      return RENDERERS.hero(s);
    },

    // Journey Timeline — uses storyActs as horizontal timeline
    journeyTimeline: function (s) {
      return [
        el("p", { class: "dd-title-eyebrow", text: deriveEyebrow(s) }),
        el("h1", { class: "dd-title-headline", html: s.title || "Customer Journey" }),
        acts.length ? el("div", { class: "dd-timeline" },
          acts.slice(0, 7).map(function (a, i) {
            return el("div", { class: "dd-timeline-step" }, [
              el("div", { class: "dd-timeline-dot", text: String(i + 1) }),
              el("div", { class: "dd-timeline-card" }, [
                a.title    ? el("div", { class: "dd-timeline-title", text: a.title }) : null,
                a.channel  ? el("div", { class: "dd-timeline-meta", text: "📱 " + a.channel }) : null,
                a.summary  ? el("div", { class: "dd-timeline-summary", text: truncate(a.summary, 130) }) : null,
                a.salesforceCapabilities ? el("div", { class: "dd-timeline-cap", text: a.salesforceCapabilities }) : null,
              ]),
            ]);
          })
        ) : el("div", { class: "dd-empty-msg", text: "Add story acts in Step 2 to fill the journey timeline." }),
      ];
    },

    // Demo Map — grid of acts as cards
    demoMap: function (s) {
      return [
        el("p", { class: "dd-title-eyebrow", text: "Demo Map" }),
        el("h1", { class: "dd-title-headline", html: s.title || "End-to-end demo flow" }),
        acts.length ? el("div", { class: "dd-democards" },
          acts.slice(0, 8).map(function (a, i) {
            return el("div", { class: "dd-democard" }, [
              el("div", { class: "dd-democard-num", text: String(i + 1).padStart(2, "0") }),
              a.title    ? el("div", { class: "dd-democard-title", text: a.title }) : null,
              a.channel  ? el("div", { class: "dd-democard-channel", text: a.channel }) : null,
              a.salesforceCapabilities ? el("div", { class: "dd-democard-cap", text: a.salesforceCapabilities }) : null,
            ]);
          })
        ) : el("div", { class: "dd-empty-msg", text: "Add story acts in Step 2 to build a demo map." }),
      ];
    },

    // Persona Card — reuses persona block for non-Meet sections
    personaCard: function (s) {
      if (!persona) {
        return [
          el("p", { class: "dd-title-eyebrow", text: "Persona" }),
          el("h1", { class: "dd-title-headline", html: s.title || "Meet the Persona" }),
          el("div", { class: "dd-empty-msg", text: "Add a persona in Step 2 of the Builder." }),
        ];
      }
      const initial = (persona.name || "?").trim().charAt(0).toUpperCase();
      return [
        el("p", { class: "dd-title-eyebrow", text: "Customer Spotlight" }),
        el("div", { class: "dd-persona" }, [
          el("div", { class: "dd-persona-avatar", text: initial }),
          el("div", { class: "dd-persona-body" }, [
            el("h1", { class: "dd-persona-name", text: persona.name }),
            persona.role ? el("div", { class: "dd-persona-role", text: persona.role }) : null,
            persona.goals ? el("div", { class: "dd-persona-section" }, [
              el("div", { class: "dd-persona-label", text: "Goals" }),
              el("div", { class: "dd-persona-text", text: persona.goals }),
            ]) : null,
            persona.painPoints ? el("div", { class: "dd-persona-section" }, [
              el("div", { class: "dd-persona-label", text: "Pain points" }),
              el("div", { class: "dd-persona-text", text: persona.painPoints }),
            ]) : null,
            persona.demoRelevance ? el("div", { class: "dd-persona-section" }, [
              el("div", { class: "dd-persona-label", text: "Why she anchors the demo" }),
              el("div", { class: "dd-persona-text", text: persona.demoRelevance }),
            ]) : null,
          ]),
        ]),
      ];
    },

    // Agent Conversation — chat-style preview
    agentConversation: function (s) {
      const personaName = (persona && persona.name) || customer.name || "Customer";
      const userMsg = (persona && persona.painPoints)
        ? truncate(persona.painPoints, 100)
        : "I need help — where do I start?";
      const agentMsg = f.futureStateVision
        ? truncate(f.futureStateVision, 140)
        : "Here's a recommendation grounded in your unified profile and history.";
      return [
        el("p", { class: "dd-title-eyebrow", text: "Agentforce moment" }),
        el("h1", { class: "dd-title-headline", html: s.title || (personaName + " · Live conversation") }),
        el("div", { class: "dd-chat" }, [
          el("div", { class: "dd-chat-bubble dd-chat-user" }, [
            el("div", { class: "dd-chat-who", text: personaName }),
            el("div", { class: "dd-chat-body", text: userMsg }),
          ]),
          el("div", { class: "dd-chat-bubble dd-chat-agent" }, [
            el("div", { class: "dd-chat-who", text: "Agentforce" }),
            el("div", { class: "dd-chat-body", text: agentMsg }),
          ]),
        ]),
        el("div", { class: "dd-badges" }, capsBadges(s)),
      ];
    },

    // Unified Profile — Data Cloud profile card
    unifiedProfile: function (s) {
      const initial = persona ? (persona.name || "?").trim().charAt(0).toUpperCase() : "?";
      return [
        el("p", { class: "dd-title-eyebrow", text: "Data Cloud · Unified Profile" }),
        el("h1", { class: "dd-title-headline", html: s.title || "One customer, many signals" }),
        el("div", { class: "dd-profile" }, [
          el("div", { class: "dd-profile-head" }, [
            el("div", { class: "dd-profile-avatar", text: initial }),
            el("div", {}, [
              el("div", { class: "dd-profile-name", text: persona ? persona.name : "[Persona]" }),
              el("div", { class: "dd-profile-role", text: (persona && persona.role) || customer.industry || "" }),
            ]),
          ]),
          el("div", { class: "dd-profile-fields" }, [
            customer.name      ? profileField("Customer", customer.name) : null,
            customer.industry  ? profileField("Industry", customer.industry) : null,
            persona && persona.goals ? profileField("Goal", truncate(persona.goals, 60)) : null,
            acts[0] && acts[0].channel ? profileField("Last channel", acts[0].channel) : null,
          ]),
          el("div", { class: "dd-profile-segs" }, [
            el("div", { class: "dd-profile-label", text: "Signals & sources" }),
            el("div", { class: "dd-chips" }, dataCloudSourcesChips()),
          ]),
        ]),
      ];
    },

    // Architecture — three-layer system map
    architecture: function (s) {
      return [
        el("p", { class: "dd-title-eyebrow", text: "Solution Architecture" }),
        el("h1", { class: "dd-title-headline", html: s.title || "Platform map" }),
        el("div", { class: "dd-arch-layers" }, [
          archLayer("Data Sources",        ["Web", "Mobile", "POS", "Email", "Service"], "blue"),
          archLayer("Salesforce Platform", products.length ? products : ["Pick products"], "red"),
          archLayer("Channels & Devices",  ["Storefront", "App", "SMS", "Email", "Agent"], "gold"),
        ]),
      ];
    },

    // Device Moment — single device frame with the slide narrative
    deviceMoment: function (s) {
      const act = acts[0] || {};
      const channel = (s && s.deviceFrame === "mobile") || (act.channel && /phone|sms|imessage|app|mobile/i.test(act.channel))
        ? "phone" : "laptop";
      return [
        el("p", { class: "dd-title-eyebrow", text: "Channel · " + (act.channel || "Device moment") }),
        el("h1", { class: "dd-title-headline", html: s.title || (act.title || "Device moment") }),
        el("div", { class: "dd-device-stage" }, [
          el("div", { class: "dd-device-frame dd-device-" + channel }, [
            el("div", { class: "dd-device-screen" }, [
              el("div", { class: "dd-device-headline", text: act.demoMoment || s.title || "Moment" }),
              act.summary ? el("div", { class: "dd-device-body", text: truncate(act.summary, 120) }) : null,
              el("div", { class: "dd-device-cta", text: act.businessValue ? truncate(act.businessValue, 40) : "Take action" }),
            ]),
          ]),
          el("div", { class: "dd-device-narr" }, [
            act.salesforceCapabilities ? el("div", { class: "dd-device-cap", text: act.salesforceCapabilities }) : null,
            el("p", { class: "dd-device-sub", text: act.summary || f.businessProblem || "" }),
            el("div", { class: "dd-badges" }, capsBadges(s)),
          ]),
        ]),
      ];
    },

    // Embedded CX Component — iframe with device frame
    embeddedCxComponent: function (s) {
      const cxIds = s.linkedCxComponentIds || [];
      const linked = cxIds.map(cxById).filter(Boolean);
      const items = linked.length ? linked : cxList.slice(0, 1);

      if (!items.length) {
        return [
          el("p", { class: "dd-title-eyebrow", text: "Live CX moment" }),
          el("h1", { class: "dd-title-headline", html: s.title || "Embedded demo screen" }),
          el("div", { class: "dd-empty-msg",
            text: "No CX components linked yet. Add an AubreyDemo URL in Step 5 of the Builder." }),
        ];
      }

      return [
        el("p", { class: "dd-title-eyebrow", text: "Live CX moment" }),
        el("h1", { class: "dd-title-headline", html: s.title || items[0].name }),
        el("div", { class: "dd-embedded-list" }, items.slice(0, 2).map(function (c) {
          return renderEmbeddedCxCard(c);
        })),
      ];
    },

    // KPI Scorecard — value driver cards
    kpiScorecard: function (s) {
      const kpis = deriveKpis();
      return [
        el("p", { class: "dd-title-eyebrow", text: "Business Value" }),
        el("h1", { class: "dd-title-headline", html: s.title || (customer.name ? "Why " + customer.name + " wins" : "Business Value Scorecard") }),
        el("div", { class: "dd-kpi-grid" }, kpis.map(function (k) {
          return el("div", { class: "dd-kpi-card" }, [
            el("div", { class: "dd-kpi-icon", text: k.icon }),
            el("div", { class: "dd-kpi-value", text: k.value }),
            el("div", { class: "dd-kpi-label", text: k.label }),
          ]);
        })),
        el("div", { class: "dd-disclaimer", text: "Replace XX% / +$XX with BVS-approved values before presenting externally." }),
      ];
    },

    // Executive Summary — closing takeaway
    executiveSummary: function (s) {
      return [
        el("p", { class: "dd-title-eyebrow", text: "Executive Takeaway" }),
        el("h1", { class: "dd-title-headline", html: s.title || (customer.name ? customer.name + " — the takeaway" : "The takeaway") }),
        el("div", { class: "dd-exec-cols" }, [
          execCol("Challenge",    f.businessProblem    || f.currentStatePain || "Add a customer challenge in Step 3."),
          execCol("Future state", f.futureStateVision  || "Add the future-state vision in Step 3."),
          execCol("Capabilities", products.length ? products.join(" · ") : "Pick products in Step 1."),
        ]),
        f.executiveTakeaway ? el("div", { class: "dd-exec-callout", text: f.executiveTakeaway }) : null,
      ];
    },

    // Next Steps
    nextSteps: function (s) {
      return [
        el("p", { class: "dd-title-eyebrow", text: "Roadmap & next steps" }),
        el("h1", { class: "dd-title-headline", html: s.title || "From today to launch" }),
        el("ol", { class: "dd-next-list" },
          ["Discovery & alignment", "Pilot / POV", "Roll-out", "Scale & optimize"].map(function (p) {
            return el("li", { class: "dd-next-item", text: p });
          })
        ),
      ];
    },

    // Fallback for unknown layouts
    unknown: function (s) {
      return [
        el("p", { class: "dd-title-eyebrow", text: "Slide" }),
        el("h1", { class: "dd-title-headline", html: s.title || "Untitled slide" }),
        el("p", { class: "dd-title-sub",
          text: "Pick a specific layout in the Builder so this slide can render with full detail." }),
      ];
    },
  };

  // ─── Composers ────────────────────────────────────────────────
  function profileField(label, value) {
    return el("div", { class: "dd-profile-field" }, [
      el("div", { class: "dd-profile-label", text: label }),
      el("div", { class: "dd-profile-value", text: value }),
    ]);
  }

  function archLayer(title, items, tone) {
    return el("div", { class: "dd-arch-layer" }, [
      el("div", { class: "dd-arch-layer-h", text: title }),
      el("div", { class: "dd-arch-layer-row" }, items.map(function (it) {
        return el("span", { class: "dd-arch-node dd-arch-" + tone, text: it });
      })),
    ]);
  }

  function execCol(label, body) {
    return el("div", { class: "dd-exec-col" }, [
      el("div", { class: "dd-exec-label", text: label }),
      el("div", { class: "dd-exec-body",  text: body }),
    ]);
  }

  function renderEmbeddedCxCard(c) {
    const card = el("div", { class: "dd-embedded-card" });
    card.appendChild(el("div", { class: "dd-embedded-head" }, [
      el("div", { class: "dd-embedded-name", text: c.name || "(unnamed)" }),
      el("div", { class: "dd-embedded-type", text: (c.type || "web") + " · " + (c.deviceFrame || "desktop") }),
    ]));
    const url = c.url && /^https?:\/\//.test(c.url) ? c.url : "";
    if (url) {
      const trusted = /aubreydemo\.com/i.test(url);
      const wrap = el("div", { class: "dd-embedded-frame dd-embedded-" + (c.deviceFrame || "desktop") });
      const iframe = document.createElement("iframe");
      iframe.src = url;
      iframe.setAttribute("sandbox", trusted
        ? "allow-scripts allow-same-origin allow-forms allow-popups"
        : "allow-scripts allow-forms allow-popups");
      iframe.setAttribute("loading", "lazy");
      iframe.setAttribute("referrerpolicy", "no-referrer");
      iframe.setAttribute("title", c.name || "CX component");
      wrap.appendChild(iframe);
      card.appendChild(wrap);
      const open = document.createElement("a");
      open.className = "dd-embedded-cta";
      open.href = url;
      open.target = "_blank";
      open.rel = "noopener noreferrer";
      open.textContent = "Open in new tab ↗";
      card.appendChild(open);
    } else {
      card.appendChild(el("div", { class: "dd-embedded-empty",
        text: "URL not added yet — fill in builderPlan.cxComponents[].url in holodeck.config.js" }));
    }
    return card;
  }

  // ─── Data derivers ────────────────────────────────────────────
  function deriveEyebrow(s) {
    if (s && s.section)  return s.section;
    if (customer.demoTitle) return customer.demoTitle;
    return "Demo";
  }
  function deriveHeadline(s) {
    if (s && s.title)    return s.title;
    return customer.heroHeadline || "Demo moment";
  }
  function deriveSub(s) {
    if (s && s.speakerNotes) return s.speakerNotes;
    return f.businessProblem || customer.heroSub || "";
  }
  function capsBadges(s) {
    const caps = (s && s.capabilities) || products;
    return caps.slice(0, 5).map(function (c) {
      return el("span", { class: "dd-badge dd-badge-blue", text: c });
    });
  }
  function dataCloudSourcesChips() {
    const sources = ["Web", "Email", "POS", "App", "Service"];
    return sources.map(function (s) {
      return el("span", { class: "dd-chip", text: s });
    });
  }
  function deriveKpis() {
    if (CFG.bvs && CFG.bvs.metrics && CFG.bvs.metrics.length) {
      return CFG.bvs.metrics.map(function (m) {
        return { icon: m.icon || "→", value: m.value || "XX%", label: m.label || "Metric" };
      });
    }
    return [
      { icon: "↑",  value: "XX%",  label: "Conversion Lift" },
      { icon: "💳", value: "+$XX", label: "Average Order Value" },
      { icon: "★",  value: "XX%",  label: "Loyalty Enrollment" },
      { icon: "⚡", value: "XX%",  label: "Service Efficiency" },
    ];
  }
  function truncate(s, max) {
    s = String(s || "").replace(/\s+/g, " ").trim();
    if (s.length <= max) return s;
    return s.slice(0, max - 1).replace(/\s+\S*$/, "") + "…";
  }

  // ─── Build a single slide ─────────────────────────────────────
  function buildSlide(slide, idx) {
    const layout = (slide && slide.layout) || "unknown";
    const renderFn = RENDERERS[layout] || RENDERERS.unknown;
    const pslide = el("div", {
      class: "pslide dd-slide dd-layout-" + layout + (idx === 0 ? " active" : ""),
      id: "dd-slide-" + idx,
      "data-layout": layout,
    });
    const body = el("div", { class: "dd-slide-body" });
    const children = renderFn(slide || {});
    children.forEach(function (c) { if (c) body.appendChild(c); });
    pslide.appendChild(body);
    return pslide;
  }

  // ─── Render the deck ──────────────────────────────────────────
  // Empty-state if nothing planned
  if (!demoSlides.length) {
    const empty = el("div", { class: "pslide active dd-slide dd-layout-empty" }, [
      el("div", { class: "dd-slide-body" }, [
        el("p", { class: "dd-title-eyebrow", text: "Demo deck" }),
        el("h1", { class: "dd-title-headline", html: "No slides selected yet." }),
        el("p", { class: "dd-title-sub",
          text: "Open the Holodeck Builder, build a slide plan, and re-export this ZIP. Slides will render here automatically." }),
      ]),
    ]);
    wrap.appendChild(empty);
    return;
  }

  demoSlides.forEach(function (s, i) { wrap.appendChild(buildSlide(s, i)); });

  // ─── Dot navigation + arrow / click advance ──────────────────
  const dotsEl = document.getElementById("demo-dots");
  const ctaEl  = document.getElementById("demo-cta");
  const TOTAL = demoSlides.length;
  let current = 0;

  if (dotsEl) {
    dotsEl.innerHTML = "";
    for (let i = 0; i < TOTAL; i++) {
      const dot = document.createElement("div");
      dot.className = "pdot" + (i === 0 ? " active" : "");
      dot.addEventListener("click", function (e) { e.stopPropagation(); goTo(i); });
      dotsEl.appendChild(dot);
    }
    // Hidden by default — section-nav showSection() will reveal these
    dotsEl.style.display = "none";
    if (ctaEl) ctaEl.style.display = "none";
  }

  function goTo(n) {
    const next = Math.max(0, Math.min(TOTAL - 1, n));
    if (next === current) return;
    const oldSlide = document.getElementById("dd-slide-" + current);
    if (oldSlide) {
      oldSlide.classList.add("exit");
      setTimeout(function () {
        oldSlide.classList.remove("active", "exit");
        const newSlide = document.getElementById("dd-slide-" + next);
        if (newSlide) newSlide.classList.add("active");
      }, 280);
    } else {
      const newSlide = document.getElementById("dd-slide-" + next);
      if (newSlide) newSlide.classList.add("active");
    }
    if (dotsEl && dotsEl.children[current]) dotsEl.children[current].classList.remove("active");
    current = next;
    if (dotsEl && dotsEl.children[current]) {
      const dot = dotsEl.children[current];
      dot.classList.remove("pulse"); void dot.offsetWidth;
      dot.classList.add("active", "pulse");
      setTimeout(function () { dot.classList.remove("pulse"); }, 360);
    }
    if (ctaEl) {
      ctaEl.style.display = (current === TOTAL - 1) ? "none" : (window._holoActiveSection === "demo" ? "flex" : "none");
    }
  }

  if (wrap) {
    wrap.addEventListener("click", function () {
      if (current < TOTAL - 1) goTo(current + 1);
    });
  }
  document.addEventListener("keydown", function (e) {
    if (window._holoActiveSection !== "demo") return;
    if (e.key === "ArrowRight" || e.key === " ") { e.preventDefault(); goTo(current + 1); }
    if (e.key === "ArrowLeft") goTo(current - 1);
  });
})();
