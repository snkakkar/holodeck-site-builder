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
  // Shared copy generators — same module the builder's Step 8 preview
  // (preview-renderer.js) uses, so the exported deck and the preview derive
  // SE-layout copy (agent chat, demo-flow steps, next-steps phases) from one
  // source and can't drift. Loaded via <script src="js/holodeck-shared.js">.
  const SHARED = window.HOLO_SHARED || {};
  // Guard against a malformed config where slides is present but not an
  // array — degrade to an empty deck instead of throwing on .filter below.
  const allSlides = Array.isArray(plan.slides) ? plan.slides : [];
  // Demo deck = slides assigned to the "demo" section.  If nothing
  // tagged, treat all of them as demo (legacy configs).
  const demoSlides = allSlides.filter(function (s) { return !s.sectionId || s.sectionId === "demo"; });

  const wrap = document.getElementById("demo-wrap");
  if (!wrap) return;

  // Brand colors — flow through to JS-rendered accents (affinity dots,
  // opener particles, fallback color arrays) so a teal-and-orange
  // customer doesn't see Salesforce red bleed through inline-styled DOM.
  const BRAND = CFG.brand || {};
  const RED   = BRAND.primaryColor   || "#b22234";
  const BLUE  = BRAND.secondaryColor || "#1a5fa0";
  const GOLD  = BRAND.accentColor    || "#f5c06a";

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
  // Uploaded media slots (Step 7) — used as the real asset behind slide media,
  // with mediaTile() degrading to a skeleton + cue when a slot is empty.
  const demoAssets = CFG.demoAssets || {};
  // Evidence-driven "Powered by Salesforce" list (theme 4). The adapter
  // precomputes CFG.poweredBy; fall back to deriving here so a legacy
  // config without it still renders an attributed strip.
  const poweredBy = (CFG.poweredBy && CFG.poweredBy.length)
    ? CFG.poweredBy
    : (SHARED.poweredByProducts
        ? SHARED.poweredByProducts({ products: products, storyFoundations: f })
        : (products.length ? products : ["Data Cloud"]));

  // Every project gets a chapter-opener as the first demo slide.
  // If the SE hasn't already added one (or imported a saved plan
  // from before the layout existed), prepend a synthesized one so
  // the deck always opens with a polished anchor moment.
  ensureChapterOpener(demoSlides);
  function ensureChapterOpener(list) {
    const hasOpener = list.length && list[0] && list[0].layout === "chapterOpener";
    if (hasOpener) return;
    list.unshift({
      id: "demo-chapter-opener",
      layout: "chapterOpener",
      sectionId: "demo",
      // No title/sub — the renderer falls back to defaults that
      // weave in customer / persona / first-act timing automatically.
    });
  }

  // ─── Layout renderers ─────────────────────────────────────────
  // Every demo slide is a TWO-PANEL composition:
  //   • LEFT panel  → device frame (phone/laptop) OR full-bleed photo,
  //                   with a tasteful skeleton when no asset is given.
  //   • RIGHT panel → eyebrow (small caps red) + serif/sans display
  //                   headline + sub paragraph + chips/stats/quote.
  // This mirrors the original At-Home Holodeck deck (see
  // /Users/.../At Home Demo V2 demo) and keeps slides feeling like
  // pitchable customer storytelling even before assets are uploaded.
  // ─────────────────────────────────────────────────────────────
  const RENDERERS = {

    // ─── Chapter Opener ─────────────────────────────────────────
    // The "Every relationship begins with a single moment." slide.
    // Auto-inserted as the first demo slide on every project (see
    // ensureChapterOpener() below) so SEs always get a polished
    // anchor moment, even before they pick layouts in the Builder.
    // Visual: serif italic display headline on a soft Salesforce
    // gradient, with floating particles + an anchor sub line.
    chapterOpener: function (s) {
      const opener = (s && s.title) ? s.title : defaultOpenerHeadline();
      const sub    = (s && (s.sub || s.speakerNotes)) || defaultOpenerSub();
      const eyebrow = (s && (s.eyebrow || s.section)) ||
        (customer.demoTitle ? customer.demoTitle : "Customer Demo");
      const cap = el("div", { class: "dd-opener" }, [
        el("div", { class: "dd-opener-particles" }, openerParticles()),
        el("p", { class: "dd-opener-eyebrow", text: eyebrow }),
        el("h1", { class: "dd-opener-headline", html: opener }),
        el("p", { class: "dd-opener-sub",      html: sub }),
      ]);
      return [cap];
    },

    // ─── Hero (mid-deck pivot) ──────────────────────────────────
    // Centered display headline — used to open mid-deck pivots
    // between acts.  Same shape as the chapterOpener but with
    // chips and a slightly less ceremonial gradient.
    hero: function (s) {
      return [
        el("div", { class: "dd-hero" }, [
          el("p", { class: "dd-eyebrow",  text: deriveEyebrow(s) }),
          el("h1", { class: "dd-display", html: deriveHeadline(s) }),
          el("p", { class: "dd-hero-sub", html: deriveSub(s) }),
          poweredBy.length
            ? el("div", { class: "dd-poweredby dd-poweredby-center" }, [
                el("span", { class: "dd-poweredby-label", text: "Powered by Salesforce" }),
                el("div", { class: "dd-chips dd-chips-center" },
                  poweredBy.slice(0, 5).map(function (p) {
                    return el("span", { class: "dd-chip dd-chip-red", text: p });
                  })),
              ])
            : null,
        ]),
      ];
    },

    // ─── Story Foundation ──────────────────────────────────────
    // Two-panel: LEFT framed quote-card showing the strategic
    // thesis (or a skeleton if foundations are blank); RIGHT eyebrow
    // + headline + 3 stat chips drawn from foundation fields.
    storyFoundation: function (s) {
      const stats = [];
      if (f.businessProblem)    stats.push({ val: "Problem",  label: truncate(f.businessProblem,  46) });
      if (f.currentStatePain)   stats.push({ val: "Today",    label: truncate(f.currentStatePain, 46) });
      if (f.futureStateVision)  stats.push({ val: "Tomorrow", label: truncate(f.futureStateVision,46) });
      const headline = f.transformationThesis
        ? f.transformationThesis
        : (s.title || "From a single moment to a connected future.");
      return twoPanel({
        left: leftQuote({
          tag:   "Strategic foundation",
          quote: f.executiveTakeaway || f.futureStateVision || "Connect every channel into one continuous customer relationship.",
          stamp: customer.name ? customer.name + " · " + (customer.industry || "") : "",
        }),
        right: rightCopy({
          eyebrow:  "Story Foundation",
          headline: headline,
          sub:      f.businessProblem || "Add foundation details in Step 3 of the Builder to fill this slide.",
          stats:    stats,
        }),
      });
    },

    // ─── Current vs Future state ───────────────────────────────
    // Two-panel: LEFT split before/after card with two stacked
    // panels; RIGHT eyebrow + headline + product chips showing
    // what gets the customer from today → tomorrow.
    currentFutureState: function (s) {
      return twoPanel({
        left: el("div", { class: "dd-twostate-stack" }, [
          el("div", { class: "dd-twostate-card dd-twostate-current" }, [
            el("div", { class: "dd-twostate-tag", text: "Today" }),
            el("div", { class: "dd-twostate-text", text: truncate(f.currentStatePain || "Disconnected channels, anonymous browsers, lost revenue.", 180) }),
          ]),
          el("div", { class: "dd-twostate-arrow", text: "↓" }),
          el("div", { class: "dd-twostate-card dd-twostate-future" }, [
            el("div", { class: "dd-twostate-tag", text: "Tomorrow" }),
            el("div", { class: "dd-twostate-text", text: truncate(f.futureStateVision || "One unified profile across every channel.", 180) }),
          ]),
        ]),
        right: rightCopy({
          eyebrow:  "Before / After",
          headline: s.title || "From today to a <em>connected</em> future.",
          sub:      f.transformationThesis || "Identity + AI + agents turn fragmented touches into one experience.",
          chipsLabel: "Powered by Salesforce",
          chips:    poweredBy.slice(0, 6).map(function (p) { return { type: "red", label: p }; }),
        }),
      });
    },

    futureState: function (s) {
      return RENDERERS.hero(s);
    },

    // ─── Journey Timeline ───────────────────────────────────────
    // Six-month above-the-line / below-the-line visualization.
    // Centered horizontal track, hero milestone in red, rest in
    // muted blue.  Uses storyActs as the milestone source.
    journeyTimeline: function (s) {
      const months = ["DEC","JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV"];
      const milestones = (acts.length ? acts : Array.from({length:5},function(_,i){return{title:"Moment "+(i+1)};}))
        .slice(0, 7).map(function (a, i) {
          return {
            month: a.timing || months[i % 12] || ("M" + (i+1)),
            icon:  channelIcon(a.channel),
            label: a.title || a.demoMoment || ("Moment " + (i+1)),
            sub:   a.channel || "",
            hero:  i === 0 || a.heroMoment === true,
          };
        });
      const half = Math.ceil(milestones.length / 2);
      const above = milestones.slice(0, half);
      const below = milestones.slice(half);
      return [
        el("div", { class: "dd-stack-center" }, [
          el("p", { class: "dd-eyebrow", text: deriveEyebrow(s) }),
          el("h2", { class: "dd-display dd-display-mid", html: s.title || "One journey. Every channel. <em>Always personal.</em>" }),
          el("p", { class: "dd-sub-center",
            text: f.transformationThesis || "From one moment, AI turns identity into months of personalized engagement." }),
        ]),
        el("div", { class: "dd-jt" }, [
          el("div", { class: "dd-jt-row dd-jt-above" }, above.map(timelineNode)),
          el("div", { class: "dd-jt-track" }),
          el("div", { class: "dd-jt-row dd-jt-below" }, below.map(timelineNode)),
        ]),
      ];
    },

    // ─── Demo Map ───────────────────────────────────────────────
    // 3-up grid of mini "moment" cards. Each card ⇒ device-frame
    // skeleton + caption.  Acts as the demo's table of contents.
    demoMap: function (s) {
      // Demo-flow steps from HOLO_SHARED so the exported map and the Step 8
      // preview derive the same numbered steps from storyActs.
      const steps = (SHARED.demoFlowSteps ? SHARED.demoFlowSteps(acts) : [])
        .slice(0, 6);
      const items = steps.length
        ? steps
        : Array.from({ length: 6 }, function (_, i) { return { num: String(i+1).padStart(2,"0"), title: "Moment " + (i+1), channel: "" }; });
      return [
        el("div", { class: "dd-stack-center" }, [
          el("p", { class: "dd-eyebrow", text: "Demo Map" }),
          el("h2", { class: "dd-display dd-display-mid", html: s.title || "End-to-end <em>demo flow</em>" }),
        ]),
        el("div", { class: "dd-mapgrid" }, items.map(function (a, i) {
          return el("div", { class: "dd-mapcard" }, [
            el("div", { class: "dd-mapcard-num", text: a.num || String(i+1).padStart(2,"0") }),
            el("div", { class: "dd-skel dd-skel-mini" }, [skeletonShimmer()]),
            el("div", { class: "dd-mapcard-title", text: a.title || ("Moment " + (i+1)) }),
            a.channel ? el("div", { class: "dd-mapcard-meta", text: channelIcon(a.channel) + " " + a.channel }) : null,
          ]);
        })),
      ];
    },

    // ─── Persona Card / Customer spotlight ──────────────────────
    // Two-panel: LEFT phone frame containing a stylized "profile
    // card" (avatar circle + name + role); RIGHT eyebrow + name
    // headline + role + stats + pull quote — original "Meet" feel.
    personaCard: function (s) {
      const p = persona || {};
      const initial = (p.name || customer.name || "?").trim().charAt(0).toUpperCase();
      const stats = (p.stats && p.stats.length)
        ? p.stats.slice(0,3)
        : [
            { value: customer.industry || "Retail", label: "Industry" },
            { value: p.role ? truncate(p.role, 16) : "Persona",     label: "Role"     },
            { value: "Known",   label: "Identity" },
          ];
      return twoPanel({
        left: phoneFrame(
          el("div", { class: "dd-persona-card" }, [
            el("div", { class: "dd-persona-avatar", text: initial }),
            el("div", { class: "dd-persona-pname", text: p.name || customer.name || "Persona" }),
            p.role ? el("div", { class: "dd-persona-prole", text: p.role }) : null,
            el("div", { class: "dd-persona-pmeta", text: customer.name || "Customer" }),
          ])
        ),
        right: rightCopy({
          eyebrow:  "Customer Spotlight",
          headlineHtml: "Meet <strong>" + escapeHtml(p.name || customer.name || "your customer") + ".</strong>",
          sub:      p.demoRelevance || p.painPoints || (customer.name ? customer.name + " — the customer at the center of this story." : "The persona this demo is built around."),
          stats:    stats.map(function (st) { return { val: st.value, label: st.label }; }),
          quote:    p.goals ? truncate(p.goals, 140) : "",
        }),
      });
    },

    // ─── Agent Conversation ────────────────────────────────────
    // Two-panel: LEFT phone frame with a chat thread; RIGHT eyebrow
    // + headline + capabilities chips. Mirrors the SMS/agent slide
    // in the original deck.
    agentConversation: function (s) {
      const personaName = (persona && persona.name) || customer.name || "Customer";
      // Derive the chat from HOLO_SHARED.agentChat so the exported slide and
      // the Step 8 preview show identical copy (single source of truth).
      // Reconstruct the state shape the shared helper reads.
      const chat = SHARED.agentChat
        ? SHARED.agentChat({ story: plan.story || {}, personas: plan.personas || [], project: { industry: customer.industry || "" } })
        : {
            user:  (persona && persona.painPoints) ? truncate(persona.painPoints, 80) : "Can you help me find what I left behind?",
            agent: (acts[0] && acts[0].businessValue) ? truncate(acts[0].businessValue, 100)
                   : (f.futureStateVision ? truncate(f.futureStateVision, 100) : "Here's a recommendation grounded in your unified profile."),
          };
      const userMsg  = chat.user;
      const agentMsg = chat.agent;
      return twoPanel({
        left: phoneFrame(
          el("div", { class: "dd-chat-thread" }, [
            el("div", { class: "dd-chat-head" }, [
              el("div", { class: "dd-chat-headline", text: "Agentforce" }),
              el("div", { class: "dd-chat-sub",      text: "Live chat" }),
            ]),
            el("div", { class: "dd-chat-bubble dd-chat-them", text: agentMsg }),
            el("div", { class: "dd-chat-bubble dd-chat-me",   text: userMsg }),
            el("div", { class: "dd-chat-bubble dd-chat-them dd-chat-typing" }, [
              el("span", { class: "dd-typing-dot" }),
              el("span", { class: "dd-typing-dot" }),
              el("span", { class: "dd-typing-dot" }),
            ]),
          ])
        ),
        right: rightCopy({
          eyebrow:  "Agentforce moment",
          headlineHtml: s.title
            ? escapeHtml(s.title)
            : ("She left.<br/><em>" + escapeHtml(personaName) + " comes back.</em>"),
          sub:      "An agent reaches " + escapeHtml(personaName) + " in the channel she's already in — grounded in her unified profile.",
          stats: [
            { val: "Triggered", label: "Abandon signal" },
            { val: "Recovery",  label: "Opportunity"     },
            { val: "Personal",  label: "Every reply"     },
          ],
          quote: "The cart remembers. The agent makes sure " + (persona && persona.name ? persona.name : "she") + " does too.",
        }),
      });
    },

    // ─── Unified Profile ───────────────────────────────────────
    // Two-panel: LEFT laptop frame containing a stylized Data Cloud
    // profile.  Data Cloud unifies several FACETS, so the screen is a
    // small carousel — Identity / Affinities / Real-time signals /
    // Predicted needs — with clickable tabs.  RIGHT eyebrow + serif
    // headline + brand-aware "Powered by" attribution.
    unifiedProfile: function (s) {
      const p = persona || {};
      const fullName = p.name || customer.name || "Customer";
      const lifetime = "$" + (1500 + ((fullName.length * 137) % 6500)).toLocaleString() + ".00";

      // Facets from the shared generator (preview uses the same source).
      const facets = (SHARED.profileFacets ? SHARED.profileFacets({
        persona: p, products: products, storyFoundations: f, industry: customer.industry,
      }) : []) || [];

      // Deterministic monogram from the customer's name (first letters of up to 2 words).
      const monogram = (fullName.trim().split(/\s+/).slice(0, 2)
        .map(function (w) { return (w[0] || "").toUpperCase(); }).join("")) || "C";
      const roleText = p.role || p.jobTitle || ((customer.industry || "Customer") + " customer");
      const segText  = p.customerOf || (customer.industry ? customer.industry + " segment" : "Known customer");

      // A label/value detail field (Salesforce-console style).
      function field(r) {
        return el("div", { class: "dd-cdp-field" }, [
          el("div", { class: "dd-cdp-field-lbl", text: r.label }),
          el("div", { class: "dd-cdp-field-val", text: r.value }),
        ]);
      }

      // The right pane content varies per facet; the left rail is persistent.
      function paneBody(facet) {
        const rows = (facet.rows || []).slice(0, 6);
        if (facet.key === "affinities") {
          return el("div", { class: "dd-cdp-pane-flow" }, [
            el("div", { class: "dd-cdp-affinity" }, [
              affinityNode(74, 38, RED), affinityNode(48, 64, GOLD),
              affinityNode(62, 22, BLUE), affinityNode(82, 56, "#2e7a50"),
              affinityNode(34, 44, RED),
            ]),
            el("div", { class: "dd-cdp-track" }),
            el("div", { class: "dd-cdp-fields" }, rows.map(field)),
          ]);
        }
        if (facet.key === "signals") {
          return el("div", { class: "dd-cdp-timeline" }, rows.map(function (r) {
            return el("div", { class: "dd-cdp-tl-item" }, [
              el("span", { class: "dd-cdp-tl-dot" }),
              el("div", { class: "dd-cdp-tl-body" }, [
                el("div", { class: "dd-cdp-tl-lbl", text: r.label }),
                el("div", { class: "dd-cdp-tl-val", text: r.value }),
              ]),
            ]);
          }));
        }
        if (facet.key === "predicted") {
          const headline = (rows[0] && rows[0].value) || "Personalized offer";
          const nbaBtn = el("button", { class: "dd-cdp-nba-btn", type: "button", text: "Launch action" });
          // Non-interactive demo button: swallow the click so it doesn't advance the slide.
          nbaBtn.addEventListener("click", function (e) { e.stopPropagation(); });
          return el("div", { class: "dd-cdp-nba" }, [
            el("div", { class: "dd-cdp-nba-eyebrow", text: "Next Best Action" }),
            el("div", { class: "dd-cdp-nba-head", text: headline }),
            el("div", { class: "dd-cdp-fields" }, rows.slice(1).map(field)),
            nbaBtn,
          ]);
        }
        // identity (and any future facet): plain detail-field grid.
        return el("div", { class: "dd-cdp-fields" }, rows.map(field));
      }

      // The full screen for a facet: persistent profile rail + per-facet console pane.
      function facetScreen(facet) {
        return el("div", { class: "dd-cdp-body dd-cdp-console" }, [
          el("div", { class: "dd-cdp-rail" }, [
            el("div", { class: "dd-cdp-avatar", text: monogram }),
            el("div", { class: "dd-cdp-rail-name", text: fullName }),
            el("div", { class: "dd-cdp-rail-role", text: roleText }),
            el("div", { class: "dd-cdp-rail-seg",  text: segText }),
            el("div", { class: "dd-cdp-kpis" }, [
              el("div", { class: "dd-cdp-kpi" }, [
                el("div", { class: "dd-cdp-kpi-val", text: lifetime }),
                el("div", { class: "dd-cdp-kpi-lbl", text: "Lifetime Value" }),
              ]),
              el("div", { class: "dd-cdp-kpi" }, [
                el("div", { class: "dd-cdp-kpi-val", text: "4" }),
                el("div", { class: "dd-cdp-kpi-lbl", text: "Orders" }),
              ]),
            ]),
          ]),
          el("div", { class: "dd-cdp-pane" }, [
            el("div", { class: "dd-cdp-pane-head" }, [
              el("div", { class: "dd-cdp-pane-eyebrow", text: facet.eyebrow || "Profile" }),
              el("div", { class: "dd-cdp-pane-title", text: facet.label }),
            ]),
            paneBody(facet),
          ]),
        ]);
      }

      // Build the carousel: tabs across the top, one screen shown at a time.
      const screenHost = el("div", { class: "dd-cdp-screen-host" });
      const tabRow = el("div", { class: "dd-cdp-tabs" });
      function show(i) {
        screenHost.innerHTML = "";
        screenHost.appendChild(facetScreen(facets[i]));
        Array.prototype.forEach.call(tabRow.children, function (t, ti) {
          t.classList.toggle("is-active", ti === i);
        });
      }
      facets.forEach(function (facet, i) {
        const tab = el("button", { class: "dd-cdp-tab", type: "button", text: facet.label });
        // Keep tab clicks in-slide: matches the .pdot stopPropagation convention so the
        // deck's click-to-advance listener on .slides-wrap doesn't fire.
        tab.addEventListener("click", function (e) { e.stopPropagation(); show(i); });
        tabRow.appendChild(tab);
      });

      const cdp = el("div", { class: "dd-cdp" }, [
        el("div", { class: "dd-cdp-bar" }, [
          el("span", { class: "dd-cdp-pill", text: (customer.name || "BRAND").toUpperCase().slice(0,12) }),
          el("span", { class: "dd-cdp-bar-spacer" }),
          el("span", { class: "dd-cdp-bar-dot" }),
          el("span", { class: "dd-cdp-bar-name", text: fullName }),
        ]),
        tabRow,
        screenHost,
      ]);
      if (facets.length) show(0);

      return twoPanel({
        left: laptopFrame(cdp),
        right: rightCopy({
          eyebrow:  "Data Cloud · Unified Profile",
          headlineHtml: s.title
            ? escapeHtml(s.title)
            : "Who is she,<br/><em>really?</em>",
          sub:      "Data Cloud builds a rich affinity profile from " + (p.name || "her") + "'s behavior — past purchases, browse duration, categories explored. Over time, it scores against hundreds of attributes.",
          stats: [
            { val: "Real-Time", label: "Personalization" },
            { val: "→ Known",   label: "Anonymous" },
            { val: (poweredBy[0] || "Data Cloud"), label: "Powered by" },
          ],
          quote: "Every click, every scroll, every purchase is a signal — connected into a profile uniquely " + (p.name || "her") + ".",
        }),
      });
    },

    // ─── Architecture / Platform map ───────────────────────────
    // Three-tier system map.  Tiers stack: Sources → Salesforce
    // platform → Channels.  Connecting "rails" between tiers.
    architecture: function (s) {
      return [
        el("div", { class: "dd-stack-center" }, [
          el("p", { class: "dd-eyebrow", text: "Solution Architecture" }),
          el("h2", { class: "dd-display dd-display-mid", html: s.title || "One platform. <em>Every layer.</em>" }),
        ]),
        el("div", { class: "dd-arch" }, [
          archTier("Data Sources",    ["Web", "Mobile", "POS", "Email", "Service"], "blue"),
          el("div", { class: "dd-arch-rail" }),
          archTier("Salesforce",      products.length ? products.slice(0,6) : ["Pick products in Step 1"], "red"),
          el("div", { class: "dd-arch-rail" }),
          archTier("Channels",        ["Storefront", "App", "SMS", "Email", "Agent"], "gold"),
        ]),
      ];
    },

    // ─── Device Moment ─────────────────────────────────────────
    // Two-panel: LEFT device frame (phone OR laptop based on the
    // deviceFrame field / channel heuristic) showing a stylized
    // "screen" — eyebrow + image skeleton + product card row.
    // RIGHT eyebrow + headline + sub + capability chips.
    deviceMoment: function (s) {
      const act = (s.linkedActId && acts.find(function(a){return a.id===s.linkedActId;})) || acts[0] || {};
      const isMobile = (s && s.deviceFrame === "mobile") ||
                       (act.channel && /phone|sms|imessage|app|mobile/i.test(act.channel));
      const screenInner = el("div", { class: "dd-screen" }, [
        el("div", { class: "dd-screen-eyebrow", text: (act.channel || "Salesforce").toUpperCase() }),
        el("div", { class: "dd-screen-h", text: act.demoMoment || act.title || s.title || "Moment" }),
        // Real screenshot/GIF when uploaded for this device, else skeleton + cue.
        mediaTile({
          src: isMobile ? demoAssets.iPhoneRec
                        : (demoAssets.laptopBrowsingGif || demoAssets.webBrowseGif),
          kind: "gif",
          alt: act.demoMoment || act.title || "Demo moment",
          cue: "Add a screen recording in Step 7",
        }),
        el("div", { class: "dd-screen-rows" }, [
          el("div", { class: "dd-screen-row" }, [
            el("div", { class: "dd-skel dd-skel-tile" }, [skeletonShimmer()]),
            el("div", { class: "dd-skel-lines" }, [
              el("div", { class: "dd-skel-line" }),
              el("div", { class: "dd-skel-line dd-skel-line-short" }),
            ]),
          ]),
          el("div", { class: "dd-screen-row" }, [
            el("div", { class: "dd-skel dd-skel-tile" }, [skeletonShimmer()]),
            el("div", { class: "dd-skel-lines" }, [
              el("div", { class: "dd-skel-line" }),
              el("div", { class: "dd-skel-line dd-skel-line-short" }),
            ]),
          ]),
        ]),
        el("div", { class: "dd-screen-cta", text: act.businessValue ? truncate(act.businessValue, 28).toUpperCase() : "TAKE ACTION" }),
      ]);
      return twoPanel({
        left: isMobile ? phoneFrame(screenInner) : laptopFrame(screenInner),
        right: rightCopy({
          eyebrow:  (act.salesforceCapabilities || (s && s.capabilities && s.capabilities[0]) || "Live moment").toUpperCase(),
          headlineHtml: s.title
            ? escapeHtml(s.title)
            : (act.title ? escapeHtml(act.title) : "A moment that <em>matters.</em>"),
          sub:      act.summary || act.demoMoment || f.businessProblem || "Add a story act in Step 2 to fill this slide.",
          chips:    capsList(s).map(function (c) { return { type:"blue", label:c }; }),
        }),
      });
    },

    // ─── Scene Photo ───────────────────────────────────────────
    // Two-panel: LEFT a full-bleed scene photo (or skeleton);
    // RIGHT a structured icon-bulleted "WHEN / THE MOMENT / WHAT
    // HAPPENS NEXT / WHY IT MATTERS" list — mirrors the "At Home
    // Store" opener slide from the original deck.
    scenePhoto: function (s) {
      const act = (s.linkedActId && acts.find(function(a){return a.id===s.linkedActId;})) || acts[0] || {};
      const rows = [
        { eyebrow:"WHEN",              icon:"❄️", title: act.timing  || "December · Holiday Season",  sub: "Last-minute holiday shopping in-store" },
        { eyebrow:"THE MOMENT",        icon:"📧", title: act.demoMoment || "Email captured at checkout", sub: "She shares her email for a digital receipt" },
        { eyebrow:"WHAT HAPPENS NEXT", icon:"☁️", title: "CDP builds a unified profile",                sub: "In-store identity now connects every future channel" },
        { eyebrow:"WHY IT MATTERS",    icon:"🎯", title: "Anonymous → Known",                          sub: "The bridge that makes every touchpoint personal" },
      ];
      return [
        el("div", { class: "dd-scene" }, [
          // LEFT: full-bleed scene — uploaded store photo when available,
          // otherwise the skeleton (mediaTile handles the missing-asset cue).
          el("div", { class: "dd-scene-photo" }, [
            mediaTile({
              src: demoAssets.storeInterior || demoAssets.storeExterior,
              kind: "image",
              alt: act.location || "Scene",
              cue: "Add a scene photo in Step 7",
            }),
            el("div", { class: "dd-scene-tag", text: act.location || (customer.name ? customer.name + " Store" : "Store") + " · " + (act.timing || "December") }),
          ]),
          // RIGHT: copy + icon list
          el("div", { class: "dd-scene-copy" }, [
            el("p", { class: "dd-eyebrow", text: deriveEyebrow(s).toUpperCase() }),
            el("h2", { class: "dd-display dd-display-mid", html: s.title || "One visit.<br/>One email." }),
            el("p", { class: "dd-sub",
              text: act.summary || ("A digital receipt becomes the first data point in " + ((persona && persona.name) || "her") + "'s unified profile.") }),
            el("div", { class: "dd-iconlist" }, rows.map(function (r) {
              return el("div", { class: "dd-iconrow" }, [
                el("div", { class: "dd-iconrow-icon", text: r.icon }),
                el("div", { class: "dd-iconrow-body" }, [
                  el("div", { class: "dd-iconrow-eyebrow", text: r.eyebrow }),
                  el("div", { class: "dd-iconrow-title",   text: r.title }),
                  el("div", { class: "dd-iconrow-sub",     text: r.sub }),
                ]),
              ]);
            })),
          ]),
        ]),
      ];
    },

    // ─── Embedded CX Component ─────────────────────────────────
    // Two-panel: LEFT live iframe inside the matching device
    // frame; RIGHT eyebrow + headline + chips. Empty-state shows
    // a skeleton screen + clear CTA pointing back to Step 5.
    embeddedCxComponent: function (s) {
      const cxIds = s.linkedCxComponentIds || [];
      const linked = cxIds.map(cxById).filter(Boolean);
      const c = linked[0] || cxList[0] || null;
      const inner = c && c.url && /^https?:\/\//.test(c.url)
        ? renderCxIframe(c)
        : el("div", { class: "dd-skel dd-skel-screen" }, [
            skeletonShimmer(),
            el("div", { class: "dd-skel-screen-msg",
              text: c ? "Add a URL for this component in Step 5" : "Link a CX component in Step 5" }),
          ]);
      // Every Aubrey CX component renders in the phone frame — the clean,
      // content-fitting look from the Agent Conversation Moment slide. The
      // laptop frame is reserved for synthetic mock screens (unifiedProfile,
      // deviceMoment), not live embeds.
      return twoPanel({
        left:  phoneFrame(inner),
        right: rightCopy({
          eyebrow:  c && c.type ? ("Live · " + c.type.toUpperCase()) : "LIVE CX MOMENT",
          headlineHtml: s.title ? escapeHtml(s.title) : (c && c.name ? escapeHtml(c.name) : "Embedded demo screen"),
          sub:      c && c.description ? c.description : "A live, click-through Aubrey demo screen embedded right inside the deck.",
          chips:    capsList(s).map(function (cap) { return { type:"blue", label:cap }; }),
        }),
      });
    },

    // ─── KPI Scorecard ─────────────────────────────────────────
    // Centered headline + 4-card metric grid + BVS disclaimer.
    kpiScorecard: function (s) {
      const kpis = deriveKpis();
      return [
        el("div", { class: "dd-stack-center" }, [
          el("p", { class: "dd-eyebrow", text: "Business Value" }),
          el("h2", { class: "dd-display dd-display-mid", html: s.title || (customer.name ? "Why <em>" + escapeHtml(customer.name) + "</em> wins." : "Why this matters.") }),
          el("p", { class: "dd-sub-center", text: "Higher conversion. Bigger AOV. Lifelong loyalty." }),
        ]),
        el("div", { class: "dd-kpi-grid" }, kpis.map(function (k) {
          return el("div", { class: "dd-kpi-card" }, [
            el("div", { class: "dd-kpi-icon",  text: k.icon }),
            el("div", { class: "dd-kpi-value", text: k.value }),
            el("div", { class: "dd-kpi-label", text: k.label }),
            el("div", { class: "dd-kpi-todo",  text: "TODO" }),
          ]);
        })),
        el("div", { class: "dd-disclaimer", text: "Replace XX% / +$XX with BVS-approved values before presenting externally." }),
      ];
    },

    // ─── Executive Summary ─────────────────────────────────────
    // Two-panel: LEFT framed pull-quote with executive takeaway;
    // RIGHT three challenge / future / capabilities columns.
    executiveSummary: function (s) {
      return twoPanel({
        left: leftQuote({
          tag:   "Executive Takeaway",
          quote: f.executiveTakeaway || ("A single Salesforce platform compounds every customer touch into measurable lift" + (customer.name ? " for " + customer.name + "." : ".")),
          stamp: customer.name ? customer.name + " + Salesforce" : "Salesforce",
        }),
        right: el("div", { class: "dd-right" }, [
          el("p", { class: "dd-eyebrow", text: "The Takeaway" }),
          el("h2", { class: "dd-display dd-display-mid", html: s.title || "Three things that <em>compound.</em>" }),
          el("div", { class: "dd-exec-cols" }, [
            execCol("Challenge",    f.businessProblem    || f.currentStatePain || "Add a customer challenge in Step 3."),
            execCol("Future state", f.futureStateVision  || "Add the future-state vision in Step 3."),
            execCol("Capabilities", products.length ? products.slice(0,4).join(" · ") : "Pick products in Step 1."),
          ]),
        ]),
      });
    },

    // ─── Next Steps ────────────────────────────────────────────
    // Two-panel: LEFT framed quote-card with closing CTA; RIGHT
    // numbered roadmap items.
    nextSteps: function (s) {
      return twoPanel({
        left: leftQuote({
          tag:   "Roadmap",
          quote: "From discovery today to a connected customer experience in months — not years.",
          stamp: customer.name ? customer.name + " · roadmap" : "Salesforce roadmap",
        }),
        right: el("div", { class: "dd-right" }, [
          el("p", { class: "dd-eyebrow", text: "Roadmap & next steps" }),
          el("h2", { class: "dd-display dd-display-mid", html: s.title || "From <em>today</em> to launch." }),
          el("ol", { class: "dd-next-list" },
            (SHARED.nextStepsPhases
              ? SHARED.nextStepsPhases()
              : ["Discovery & alignment", "Pilot / POV", "Roll-out", "Scale & optimize"]
            ).map(function (p) {
              return el("li", { class: "dd-next-item", text: p });
            })
          ),
        ]),
      });
    },

    // ─── Fallback for unknown layouts ──────────────────────────
    unknown: function (s) {
      return [
        el("div", { class: "dd-hero" }, [
          el("p", { class: "dd-eyebrow",  text: "Slide" }),
          el("h1", { class: "dd-display", html: s.title || "Untitled slide" }),
          el("p", { class: "dd-hero-sub",
            text: "Pick a specific layout in the Builder so this slide can render with full detail." }),
        ]),
      ];
    },
  };

  // ─── Common composers ───────────────────────────────────────
  function twoPanel(parts) {
    return [el("div", { class: "dd-twopanel" }, [parts.left, parts.right])];
  }

  function rightCopy(o) {
    const right = el("div", { class: "dd-right" });
    if (o.eyebrow)     right.appendChild(el("p", { class: "dd-eyebrow", text: o.eyebrow }));
    if (o.headlineHtml) right.appendChild(el("h2", { class: "dd-display dd-display-mid", html: o.headlineHtml }));
    else if (o.headline) right.appendChild(el("h2", { class: "dd-display dd-display-mid", html: o.headline }));
    if (o.sub)         right.appendChild(el("p", { class: "dd-sub", text: o.sub }));
    if (o.stats && o.stats.length) {
      right.appendChild(el("div", { class: "dd-statchips" }, o.stats.map(function (st) {
        return el("div", { class: "dd-statchip" }, [
          el("div", { class: "dd-statchip-val", text: st.val }),
          el("div", { class: "dd-statchip-lbl", text: st.label }),
        ]);
      })));
    }
    if (o.chips && o.chips.length) {
      if (o.chipsLabel) right.appendChild(el("div", { class: "dd-chips-label", text: o.chipsLabel }));
      right.appendChild(el("div", { class: "dd-chips" }, o.chips.map(function (c) {
        return el("span", { class: "dd-chip dd-chip-" + (c.type||"blue"), text: c.label });
      })));
    }
    if (o.quote) {
      right.appendChild(el("div", { class: "dd-pullquote-mark", text: "”" }));
      right.appendChild(el("div", { class: "dd-pullquote", text: o.quote }));
    }
    return right;
  }

  function leftQuote(o) {
    return el("div", { class: "dd-left dd-left-quote" }, [
      el("div", { class: "dd-quotecard" }, [
        el("div", { class: "dd-quotecard-tag",  text: o.tag || "" }),
        el("div", { class: "dd-quotecard-mark", text: "”" }),
        el("div", { class: "dd-quotecard-body", text: o.quote || "" }),
        o.stamp ? el("div", { class: "dd-quotecard-stamp", text: o.stamp }) : null,
      ]),
    ]);
  }

  // Phone frame: rounded notch, side button silhouette.  The screen
  // is a child slot so callers can fill it with chat / profile / cta.
  function phoneFrame(child) {
    const screen = el("div", { class: "dd-phone-screen" }, [
      el("div", { class: "dd-phone-status" }, [
        el("span", { class: "dd-phone-time", text: "10:06" }),
        el("span", { class: "dd-phone-icons", text: "•••" }),
      ]),
      child,
    ]);
    const frame = el("div", { class: "dd-phone-frame" }, [
      el("div", { class: "dd-phone-notch" }),
      screen,
    ]);
    return el("div", { class: "dd-left dd-left-device" }, [frame]);
  }

  // Laptop frame: subtle bezel + camera dot, screen child slot.
  function laptopFrame(child) {
    const screen = el("div", { class: "dd-laptop-screen" }, [
      el("div", { class: "dd-laptop-bar" }, [
        el("span", { class: "dd-laptop-dot dd-dot-r" }),
        el("span", { class: "dd-laptop-dot dd-dot-y" }),
        el("span", { class: "dd-laptop-dot dd-dot-g" }),
      ]),
      child,
    ]);
    return el("div", { class: "dd-left dd-left-device" }, [
      el("div", { class: "dd-laptop-frame" }, [screen]),
      el("div", { class: "dd-laptop-base" }),
    ]);
  }

  // Skeleton shimmer overlay — adds a moving highlight to whatever
  // div it's parked in.  Keeps "unfilled" panels from looking dead.
  function skeletonShimmer() {
    return el("span", { class: "dd-skel-shimmer" });
  }

  // ── Unified media policy ───────────────────────────────────────
  // One way to render a GIF / screenshot / image across every slide:
  //   - With a usable src → an <img> that, on load failure, swaps itself
  //     for the same skeleton + "Add this asset in Step 7" cue.
  //   - With no src → the skeleton + cue directly (never a broken image).
  // opts: { src, kind, alt, cue }. Returns a DOM node ready to append.
  function mediaFallback(cue) {
    return el("div", { class: "dd-skel dd-skel-media" }, [
      skeletonShimmer(),
      el("div", { class: "dd-skel-screen-msg", text: cue || "Add this asset in Step 7" }),
    ]);
  }
  function mediaTile(opts) {
    opts = opts || {};
    var src = opts.src;
    var cue = opts.cue || "Add this asset in Step 7";
    // Treat empty, whitespace, or unresolved [TODO:] placeholders as missing.
    var usable = typeof src === "string" && src.trim() &&
                 src.indexOf("[TODO") === -1;
    if (!usable) return mediaFallback(cue);
    var host = el("div", { class: "dd-media" });
    var img = document.createElement("img");
    img.className = "dd-media-img";
    img.alt = opts.alt || "";
    img.src = src;
    img.onerror = function () {
      this.onerror = null;
      if (host.parentNode) host.parentNode.replaceChild(mediaFallback(cue), host);
      else { host.innerHTML = ""; host.appendChild(mediaFallback(cue)); }
    };
    host.appendChild(img);
    return host;
  }

  function timelineNode(m) {
    return el("div", { class: "dd-jt-node" + (m.hero ? " dd-jt-hero" : "") }, [
      el("div", { class: "dd-jt-month", text: m.month }),
      el("div", { class: "dd-jt-icon",  text: m.icon || "•" }),
      el("div", { class: "dd-jt-dot" }),
      el("div", { class: "dd-jt-label", text: m.label }),
      m.sub ? el("div", { class: "dd-jt-sub", text: m.sub }) : null,
    ]);
  }

  function affinityNode(top, left, color) {
    const n = document.createElement("span");
    n.className = "dd-cdp-aff-dot";
    n.style.cssText = "top:" + top + "%;left:" + left + "%;background:" + color + ";";
    return n;
  }

  function archTier(label, items, tone) {
    return el("div", { class: "dd-arch-tier dd-arch-tier-" + tone }, [
      el("div", { class: "dd-arch-tier-label", text: label }),
      el("div", { class: "dd-arch-tier-row" }, items.slice(0,6).map(function (it) {
        return el("span", { class: "dd-arch-node dd-arch-" + tone, text: it });
      })),
    ]);
  }

  function renderCxIframe(c) {
    const trusted = /aubreydemo\.com/i.test(c.url);
    const wrap = el("div", { class: "dd-cx-iframe-wrap" });
    const iframe = document.createElement("iframe");
    iframe.src = c.url;
    iframe.setAttribute("sandbox", trusted
      ? "allow-scripts allow-same-origin allow-forms allow-popups"
      : "allow-scripts allow-forms allow-popups");
    iframe.setAttribute("loading", "lazy");
    iframe.setAttribute("referrerpolicy", "no-referrer");
    iframe.setAttribute("title", c.name || "CX component");
    wrap.appendChild(iframe);
    return wrap;
  }

  function channelIcon(channel) {
    const c = String(channel || "").toLowerCase();
    if (/sms|text|imessage/.test(c)) return "💬";
    if (/email/.test(c))               return "📧";
    if (/insta|social|facebook|tiktok/.test(c)) return "📸";
    if (/store|pos|in-?person/.test(c)) return "🏪";
    if (/web|site|browse/.test(c))     return "🖥️";
    if (/mobile|app|phone/.test(c))    return "📱";
    if (/cart|checkout|purch/.test(c)) return "🛒";
    if (/agent|chat/.test(c))          return "🤖";
    return "•";
  }
  function capsList(s) {
    if (s && s.capabilities && s.capabilities.length) return s.capabilities.slice(0, 4);
    return products.slice(0, 4);
  }

  function execCol(label, body) {
    return el("div", { class: "dd-exec-col" }, [
      el("div", { class: "dd-exec-label", text: label }),
      el("div", { class: "dd-exec-body",  text: body }),
    ]);
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
  // ─── Chapter-opener helpers ─────────────────────────────────
  // Default headline / sub used when the SE hasn't customized them.
  // Persona name (if known) anchors the line, otherwise falls back
  // to the customer name.  Same general shape as the original
  // "Every relationship begins with a single moment." opener.
  function defaultOpenerHeadline() {
    return "Every relationship begins<br/>with a single <em>moment.</em>";
  }
  function defaultOpenerSub() {
    const who = (persona && persona.name) ? persona.name : (customer.name ? "your customer" : "her");
    const when = (acts[0] && acts[0].timing) ? acts[0].timing : "December";
    const place = customer.name ? customer.name + " store" : "this story";
    return "<strong>" + escapeHtml(when) + ".</strong> A " + escapeHtml(place) + ". <strong>" + escapeHtml(who) + "'s</strong> story begins.";
  }
  // 18 floating particle spans the CSS animates upward.
  function openerParticles() {
    const SHAPES = ["★","✦","●","■"];
    const COLORS = [RED, BLUE, GOLD, "#2e7a50"];
    const out = [];
    for (let i = 0; i < 18; i++) {
      const left = Math.round((i * 5.7) % 100);
      const dur  = 7 + ((i * 3) % 9);
      const delay = (i * 0.45) % 8;
      const size = 10 + ((i * 7) % 14);
      const sp = document.createElement("span");
      sp.className = "dd-opener-particle";
      sp.textContent = SHAPES[i % SHAPES.length];
      sp.style.cssText =
        "left:" + left + "%;" +
        "font-size:" + size + "px;" +
        "color:" + COLORS[i % COLORS.length] + ";" +
        "animation-duration:" + dur + "s;" +
        "animation-delay:" + delay.toFixed(2) + "s;";
      out.push(sp);
    }
    return out;
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
      if (current < TOTAL - 1) {
        goTo(current + 1);
        if (window.HOLO_NAV) window.HOLO_NAV.notifyChange();
      }
    });
  }
  // Keyboard + deep-links handled centrally by HOLO_NAV. This section is
  // already 0-based, so the adapter maps straight through.
  if (window.HOLO_NAV) window.HOLO_NAV.register({
    key: "demo",
    goToIndex: function (i) { goTo(i); },
    getCurrent: function () { return current; },
    getTotal: function () { return TOTAL; },
  });
})();
