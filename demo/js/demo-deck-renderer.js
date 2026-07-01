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
  // Deck-wide length clamps: eyebrows (small-caps) ≤6 words, titles/headlines
  // ≤8 words. Route EVERY eyebrow/title assignment through these so no raw long
  // field (a comma-list of capabilities, a narrative thesis, an unbounded
  // AI/user title) ever reaches an eyebrow or headline. clampWords trims to the
  // word limit first, then a char cap as a hard backstop.
  const _cw = SHARED.clampWords ? SHARED.clampWords : function (s) { return String(s || ""); };
  function ebrow(v) { return _cw(v, 6, 42); }
  function ttl(v, fb) { return _cw(v, 8, 60) || fb || ""; }
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
  // True when a slot holds a usable image src (not empty / [TODO]). Used to
  // render a generated/uploaded CX still INSIDE a device frame in place of
  // the HTML mock; when false the existing mock renders unchanged.
  function hasStill(src) {
    return typeof src === "string" && src.trim() && src.indexOf("[TODO") === -1;
  }
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
          el("p", { class: "dd-eyebrow",  text: ebrow(deriveEyebrow(s)) }),
          el("h1", { class: "dd-display", html: ttl(deriveHeadline(s), "Demo moment") }),
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
        ? ttl(f.transformationThesis)
        : (ttl(s.title) || "From a single moment to a connected future.");
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
      return [
        el("div", { class: "dd-stack-center" }, [
          el("p", { class: "dd-eyebrow", text: ebrow(f.journeyTimelineEyebrow || deriveEyebrow(s)) }),
          el("h2", { class: "dd-display dd-display-mid",
            html: escapeHtml(ttl(f.journeyTimelineHeadline || "")) || "One journey. Every channel. <em>Always personal.</em>" }),
          el("p", { class: "dd-sub-center",
            text: f.journeyTimelineSub || f.transformationThesis || "From one moment, AI turns identity into months of personalized engagement." }),
        ]),
        buildTimelineTrack(),
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
          el("h2", { class: "dd-display dd-display-mid", html: ttl(s.title) || "End-to-end <em>demo flow</em>" }),
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
      // Prefer an AI-generated, story-contextual script when the SE generated
      // one in the builder (persisted on the project). Otherwise derive a
      // deterministic chat from HOLO_SHARED.agentChat — passing the story acts
      // + foundations so even the fallback is grounded in THIS script, not a
      // generic retail scenario.
      const aiScript = plan.agentChatScript;
      const chat = (aiScript && Array.isArray(aiScript.turns) && aiScript.turns.length)
        ? aiScript
        : SHARED.agentChat
        ? SHARED.agentChat({ story: plan.story || {}, personas: plan.personas || [], storyActs: acts, storyFoundations: f, project: { industry: customer.industry || "", customerName: customer.name || "" } })
        : {
            user:  (persona && persona.painPoints) ? truncate(persona.painPoints, 80) : "Can you help me find what I left behind?",
            agent: (acts[0] && acts[0].businessValue) ? truncate(acts[0].businessValue, 100)
                   : (f.futureStateVision ? truncate(f.futureStateVision, 100) : "Here's a recommendation grounded in your unified profile."),
          };
      // Build the scripted click-through. `turns` is an ordered array
      // [{from:"user"|"agent", text}] from the shared agentChat helper; we
      // fall back to a two-turn script from {user, agent} for back-compat.
      const turns = (chat.turns && chat.turns.length)
        ? chat.turns
        : [
            { from: "agent", text: chat.agent },
            { from: "user",  text: chat.user },
          ];

      // Render every bubble up front, then reveal progressively on tap —
      // mirrors unifiedProfile's pre-build + show(i) toggle. A trailing
      // typing indicator hints "tap to continue"; the slide's click-to-
      // advance listener is suppressed via e.stopPropagation() while turns
      // remain so taps walk the conversation instead of the deck.
      const thread = el("div", { class: "dd-chat-thread dd-chat-scripted" });
      thread.appendChild(
        el("div", { class: "dd-chat-head" }, [
          el("div", { class: "dd-chat-headline", text: "Agentforce" }),
          el("div", { class: "dd-chat-sub",      text: "Live chat" }),
        ])
      );
      const bubbles = turns.map(function (t) {
        const side = t.from === "user" ? "dd-chat-me" : "dd-chat-them";
        let b;
        if (t.kind === "card" && t.card) {
          // Rich agent message: a "next step" card (emoji tile + eyebrow +
          // title + detail + optional price · CTA row). Channel-neutral
          // defaults so a card without retail fields doesn't read as shopping.
          const c = t.card;
          b = el("div", { class: "dd-chat-bubble " + side + " dd-chat-card" }, [
            el("div", { class: "dd-chat-card-media", text: c.emoji || "🤖" }),
            el("div", { class: "dd-chat-card-body" }, [
              c.eyebrow ? el("div", { class: "dd-chat-card-eyebrow", text: c.eyebrow }) : null,
              el("div", { class: "dd-chat-card-title", text: c.title || "Your best next step" }),
              c.sub ? el("div", { class: "dd-chat-card-sub", text: c.sub }) : null,
              el("div", { class: "dd-chat-card-foot" }, [
                c.price ? el("span", { class: "dd-chat-card-price", text: c.price }) : null,
                el("span", { class: "dd-chat-card-cta", text: (c.cta || "See how") + " ›" }),
              ]),
            ]),
          ]);
        } else {
          b = el("div", { class: "dd-chat-bubble " + side, text: t.text || "" });
        }
        b.style.display = "none";
        thread.appendChild(b);
        return b;
      });
      const typing = el("div", { class: "dd-chat-bubble dd-chat-them dd-chat-typing" }, [
        el("span", { class: "dd-typing-dot" }),
        el("span", { class: "dd-typing-dot" }),
        el("span", { class: "dd-typing-dot" }),
      ]);
      thread.appendChild(typing);

      let revealed = 0;
      function reveal() {
        if (revealed < bubbles.length) {
          bubbles[revealed].style.display = "";
          revealed += 1;
        }
        // Show the typing indicator only while more turns remain.
        typing.style.display = (revealed < bubbles.length) ? "" : "none";
        thread.classList.toggle("is-complete", revealed >= bubbles.length);
        // Keep the newest bubble in view: the phone frame is a fixed size and
        // the thread scrolls internally (overflow-y:auto), so scroll to the
        // bottom rather than letting the conversation overflow out of frame.
        thread.scrollTop = thread.scrollHeight;
      }
      reveal(); // first turn visible immediately (and in the static preview)
      thread.addEventListener("click", function (e) {
        if (revealed < bubbles.length) {
          e.stopPropagation();
          reveal();
        }
      });

      return twoPanel({
        left: phoneFrame(thread),
        right: rightCopy({
          eyebrow:  "Agentforce moment",
          headlineHtml: s.title
            ? escapeHtml(ttl(s.title))
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
      // Screens are built once and toggled via display, rather than rebuilding
      // the active facet's DOM on every tab click (screenHost.innerHTML="").
      const screenHost = el("div", { class: "dd-cdp-screen-host" });
      const tabRow = el("div", { class: "dd-cdp-tabs" });
      const screens = facets.map(function (facet) {
        const scr = facetScreen(facet);
        scr.style.display = "none";
        screenHost.appendChild(scr);
        return scr;
      });
      function show(i) {
        screens.forEach(function (scr, si) { scr.style.display = (si === i) ? "" : "none"; });
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
        // The interactive Data Cloud profile carousel always renders here — it
        // *is* the feature. (A legacy cxUnifiedProfile still in an old config is
        // intentionally ignored; the slot is no longer generatable in Assets.)
        left: laptopFrame(cdp),
        right: rightCopy({
          eyebrow:  "Data Cloud · Unified Profile",
          headlineHtml: s.title
            ? escapeHtml(ttl(s.title))
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
          el("h2", { class: "dd-display dd-display-mid", html: ttl(s.title) || "One platform. <em>Every layer.</em>" }),
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
      // Default to a PHONE (mirrors embeddedCxComponent), flipping to the
      // laptop frame ONLY on an explicit desktop signal. The old logic
      // defaulted to laptop with a narrow mobile opt-in, so an "Instagram Ad
      // — Phone Moment" slide wrongly got the Mac browser chrome. We match the
      // full "revenue desk" / "desktop" — NOT bare "desk" — so a Revenue Desk
      // eyebrow doesn't accidentally force desktop.
      // Decide the frame from EXPLICIT signals first, prose last. The signal
      // string is the slide title + channel ONLY — NOT act.demoMoment/act.title
      // prose, which on a "Phone Moment" slide can contain "Salesforce Revenue
      // Desk" and wrongly force the laptop. Author override (s.deviceFrame) wins;
      // then a phone keyword; then a desktop keyword; else default to phone.
      const dmSig = (((s && s.title) || "") + " " + (act.channel || "")).toLowerCase();
      let isMobile;
      if (s && s.deviceFrame === "mobile") isMobile = true;
      else if (s && s.deviceFrame === "desktop") isMobile = false;
      else if (/phone|mobile|instagram|insta|social|sms|imessage|\bapp\b|paid|\bad\b/.test(dmSig)) isMobile = true;
      else if (/desktop|laptop|browser|web page|website|\bweb\b|revenue desk/.test(dmSig)) isMobile = false;
      else isMobile = true;
      const isDesktop = !isMobile;
      // Resolve the device "screen" with the same precedence embeddedCxComponent
      // uses, so a deviceMoment slide can show EITHER an assigned still or a live
      // iframe — whatever is bound to it:
      //   (a) a per-slide still explicitly assigned to this slide (s.imageSlot);
      //   (b) a live CX iframe if the slide links a component carrying a URL;
      //   (c) the device-appropriate global still by slot (phone vs laptop);
      //   (d) the skeleton + cue.
      const linkedCx = (s.linkedCxComponentIds || []).map(cxById).filter(Boolean);
      const cxComp = linkedCx[0] || null;
      const assignedStill = (s.imageSlot && demoAssets[s.imageSlot]) || "";
      const globalStill = isMobile
        ? (demoAssets.cxInstagramAd || demoAssets.cxShopperAgent || demoAssets.cxTextConvo || demoAssets.iPhoneRec)
        : (demoAssets.laptopBrowsingGif || demoAssets.webBrowseGif);
      // When the slide carries REAL media — an explicitly assigned still or a
      // live CX iframe — fill the device screen edge-to-edge with just that
      // media (like the Agent Conversation phone), dropping the skeleton
      // eyebrow/heading/rows/CTA chrome. The chrome is only an authoring cue,
      // so keep it ONLY for the empty/fallback state (no still, no iframe) so
      // an unconfigured slide still shows a meaningful skeleton.
      const hasAssigned = hasStill(assignedStill);
      const hasLiveIframe = !hasAssigned && cxComp && cxComp.url && /^https?:\/\//.test(cxComp.url);
      let screenInner;
      if (hasAssigned) {
        screenInner = mediaTile({
          src: assignedStill, kind: "image", fill: true,
          alt: act.demoMoment || act.title || "Demo moment",
        });
      } else if (hasLiveIframe) {
        screenInner = renderCxIframe(cxComp);
      } else {
        // Empty/fallback: full skeleton chrome + cue so the SE knows what to add.
        screenInner = el("div", { class: "dd-screen" }, [
          el("div", { class: "dd-screen-eyebrow", text: act.channel || "Salesforce" }),
          el("div", { class: "dd-screen-h", text: (function () {
            // SHORT screen heading — prefer the brief act title; never dump the
            // multi-sentence demoMoment script into the tiny phone screen.
            if (act.title)      return SHARED.cleanHeadline ? SHARED.cleanHeadline(act.title, 42) : act.title;
            if (act.demoMoment) return SHARED.oneSentence  ? SHARED.oneSentence(act.demoMoment, 42) : act.demoMoment;
            return s.title || "Moment";
          })() }),
          mediaTile({
            src: globalStill,
            kind: "gif",
            alt: act.demoMoment || act.title || "Demo moment",
            cue: "Add a screen recording or still in Step 7",
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
      }
      return twoPanel({
        left: isMobile ? phoneFrame(screenInner) : laptopFrame(screenInner),
        right: rightCopy({
          eyebrow:  ebrow(act.salesforceCapabilities || (s && s.capabilities && s.capabilities[0]) || "Live moment"),
          headlineHtml: s.title
            ? escapeHtml(ttl(s.title))
            : (act.title ? escapeHtml(ttl(act.title)) : "A moment that <em>matters.</em>"),
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
      // The NEXT act drives "what happens next" so the slide advances the real
      // story instead of echoing hardcoded retail-CDP copy.
      const sceneIdx  = acts.indexOf(act);
      const sceneNext = (sceneIdx >= 0 && acts[sceneIdx + 1]) || {};
      // Title helper: a SHORT but COMPLETE clause (not punchyTitle's 1-2 word
      // stub, which cuts "Split-Screen 1: Customer View…" down to the
      // meaningless "Split-Screen 1"). cleanHeadline trims to a word boundary.
      const tTitle = function (v, max, fb) {
        // Word-clamp FIRST (≤8 words) so a row title never runs long, then
        // cleanHeadline trims to a word boundary within the char budget.
        const clamped = _cw(v, 8, max || 56);
        const out = SHARED && SHARED.cleanHeadline ? SHARED.cleanHeadline(clamped, max || 56) : truncate(clamped, max || 56);
        return out || fb;
      };
      const tSub = function (v, max, fb) {
        const out = SHARED && SHARED.oneSentence ? SHARED.oneSentence(v, max || 70) : truncate(v, max || 70);
        return out || fb;
      };
      // Icons derive from the act's channel (semantic, story-driven) rather than
      // hardcoded retail glyphs. channelIcon falls back to a neutral dot/🤖.
      const ic = function (ch) { return (SHARED && SHARED.channelIcon ? SHARED.channelIcon(ch || "") : "") || "•"; };
      const hasNext = !!(sceneNext && (sceneNext.title || sceneNext.demoMoment || sceneNext.summary));
      // Skip generic placeholder titles ("Act 1", "Act 2", bare section headers)
      // AND mechanical scene labels ("Split-Screen 1", "Screen 1") so they never
      // leak into the row lines — isGenericTitle now rejects both. When the title
      // is mechanical we fall back to a contextual narrative source below.
      const goodTitle = function (a) {
        return a && a.title && !(SHARED && SHARED.isGenericTitle && SHARED.isGenericTitle(a.title))
          ? a.title : "";
      };
      // The opening clause of a narrative summary reads FAR better as a row
      // title than a scene label: "A complex inbound corporate RFP is instantly
      // qualified…" → "A complex inbound corporate RFP is instantly qualified".
      // cleanHeadline trims to a word boundary; oneSentence stops at the first
      // sentence so the title stays a single clause.
      const narrativeTitle = function (a) {
        const src = (a && a.summary) || (a && a.demoMoment) || "";
        const one = SHARED && SHARED.oneSentence ? SHARED.oneSentence(src, 46) : truncate(src, 46);
        return one || "";
      };
      const rows = [
        { eyebrow:"When",              icon:"🗓️",
          title: act.timing || act.month || "Opening",
          sub:   act.location || tSub(act.summary, 60, "The opening moment") },
        { eyebrow:"The moment",        icon: ic(act.channel),
          // Contextual precedence: a real (non-mechanical) act title first, then
          // the opening clause of the narrative summary, then demoMoment. The
          // raw scene label is no longer a title source. Sub carries the fuller
          // narrative so title + sub don't echo the same clause.
          title: tTitle(goodTitle(act) || narrativeTitle(act), 46, "The key moment"),
          sub:   tSub(act.demoMoment || act.summary, 70, "Where the story begins") },
        hasNext
          ? { eyebrow:"What happens next", icon: ic(sceneNext.channel || act.channel),
              title: tTitle(goodTitle(sceneNext) || narrativeTitle(sceneNext) || act.salesforceCapabilities, 46, "What happens next"),
              sub:   tSub(sceneNext.demoMoment || sceneNext.summary, 70, "The story continues") }
          : { eyebrow:"Where it leads",    icon: ic(act.channel),
              title: tTitle(act.salesforceCapabilities || act.businessValue, 42, "Where it leads"),
              sub:   tSub(act.businessValue || f.executiveTakeaway, 70, "The story continues") },
        { eyebrow:"Why it matters",    icon:"🎯",
          title: tTitle(act.businessValue || f.executiveTakeaway, 42, "Why it matters"),
          sub:   tSub(f.businessProblem || f.executiveTakeaway, 70, "The outcome that counts") },
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
            el("p", { class: "dd-eyebrow", text: ebrow(deriveEyebrow(s)) }),
            el("h2", { class: "dd-display dd-display-mid", html: ttl(s.title) || "One visit.<br/>One email." }),
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

    // ─── Story / context interstitial ──────────────────────────
    // A simple narrative beat ("Two months have passed…") to pace the
    // demo between sections. Reads per-slide fields (NOT storyActs):
    // kicker eyebrow + big headline + sub-line, with an optional image
    // panel. When no image is linked it centers the copy full-width.
    storyInterstitial: function (s) {
      const kicker   = s.kicker   || s.eyebrow || deriveEyebrow(s);
      const headline = s.headline || s.title   || "Two months have passed.";
      const sub      = s.sub      || s.subline || s.summary || "";
      // Optional image — a per-slide asset slot or any linked demo asset.
      const imgSlot  = s.imageSlot || s.assetSlot || "";
      const src      = (imgSlot && demoAssets[imgSlot]) || s.imageUrl || "";
      const hasImg   = hasStill(src);
      const copy = el("div", { class: "dd-interstitial-copy" }, [
        kicker   ? el("p", { class: "dd-eyebrow", text: ebrow(kicker) }) : null,
        el("h2", { class: "dd-display dd-display-lg", html: escapeHtml(ttl(headline)) }),
        sub ? el("p", { class: "dd-sub-center", text: sub }) : null,
      ]);
      if (!hasImg) {
        return [el("div", { class: "dd-interstitial dd-interstitial-solo" }, [copy])];
      }
      return [
        el("div", { class: "dd-interstitial dd-interstitial-split" }, [
          el("div", { class: "dd-interstitial-media" }, [
            mediaTile({ src: src, kind: "image", alt: headline, cue: "Add an image in Step 7" }),
          ]),
          copy,
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
      // Pick a CX still: an explicit Assets-page assignment (c.imageSlot)
      // wins; otherwise fall back to the type/name heuristic (mirrors the
      // adapter's buildScenes heuristics), then to whatever is available.
      const tn = ((c && (c.type || "")) + " " + (c && (c.name || ""))).toLowerCase();
      // A per-slide assignment (set in Step 5 next to the linked slide) wins
      // over the component-wide imageSlot, which wins over the heuristic.
      const perSlide = c && c.imageSlotsBySlide && s && c.imageSlotsBySlide[s.id];
      const assigned = (perSlide && demoAssets[perSlide]) ||
        (c && c.imageSlot && demoAssets[c.imageSlot]);
      const still = hasStill(assigned) ? assigned :
        /instagram|paid|ad/.test(tn)            ? demoAssets.cxInstagramAd  :
        /sms|text|message/.test(tn)             ? demoAssets.cxTextConvo    :
        /agent|shopper|chat|commerce/.test(tn)  ? demoAssets.cxShopperAgent :
        (demoAssets.cxShopperAgent || demoAssets.cxInstagramAd || demoAssets.cxTextConvo);
      // The Instagram ad is authored full-bleed 9:19 (Step 7 prompt), so fill the
      // phone screen edge-to-edge (cover) instead of letterboxing (contain).
      const isInstagramAd = hasStill(still) && still === demoAssets.cxInstagramAd;
      // A generated/uploaded still wins over the live iframe / skeleton.
      const inner = hasStill(still)
        ? mediaTile({ src: still, kind: "image", fill: isInstagramAd, adFill: isInstagramAd, alt: (c && c.name) || "CX component" })
        : c && c.url && /^https?:\/\//.test(c.url)
        ? renderCxIframe(c)
        : el("div", { class: "dd-skel dd-skel-screen" }, [
            skeletonShimmer(),
            el("div", { class: "dd-skel-screen-msg",
              text: c ? "Add a URL for this component in Step 5" : "Link a CX component in Step 5" }),
          ]);
      // Match the device frame to the component: desktop/tablet/web screens
      // render in the laptop frame, mobile-style screens (chat, SMS, social)
      // in the phone frame. Authored on the component as c.deviceFrame
      // (desktop/mobile/tablet/none); falls back to the type for older configs.
      const useLaptop = c && /desktop|tablet|web/i.test(c.deviceFrame || c.type || "");
      return twoPanel({
        left:  useLaptop ? laptopFrame(inner) : phoneFrame(inner),
        right: rightCopy({
          eyebrow:  ebrow(c && c.type ? ("Live · " + c.type) : "Live CX moment"),
          headlineHtml: s.title ? escapeHtml(ttl(s.title)) : (c && c.name ? escapeHtml(ttl(c.name)) : "Embedded demo screen"),
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
          el("h2", { class: "dd-display dd-display-mid", html: ttl(s.title) || (customer.name ? "Why <em>" + escapeHtml(customer.name) + "</em> wins." : "Why this matters.") }),
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
          el("h2", { class: "dd-display dd-display-mid", html: ttl(s.title) || "Three things that <em>compound.</em>" }),
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
          el("h2", { class: "dd-display dd-display-mid", html: ttl(s.title) || "From <em>today</em> to launch." }),
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
          el("h1", { class: "dd-display", html: ttl(s.title) || "Untitled slide" }),
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
    // opts.fill → the media should cover its container edge-to-edge (used by
    // deviceMoment so a real screenshot fills the phone like the chat does).
    // opts.adFill → the Instagram ad: full-bleed top-to-bottom but rendered a
    // touch thinner so the over-wide 9:19 still isn't over-cropped at the sides.
    var host = el("div", { class: "dd-media"
      + (opts.fill ? " is-fill" : "")
      + (opts.adFill ? " is-ad-fill" : "") });
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

  // pos: "above" | "below" — placement relative to the center track. Carried
  // on the NODE itself (not the row) so a single equal-column row can alternate
  // node-by-node and every node still occupies an equal 1/N column. The dot is
  // a sibling of the copy block so CSS can pin it to the center line while the
  // copy stacks into the top/bottom half.
  function timelineNode(m, pos) {
    const above = (pos || "above") !== "below";
    // Copy stacks toward the line: above → icon/month/label/sub (label nearest
    // the line); below → month/icon/label/sub (month nearest the line).
    const copyKids = above
      ? [ el("div", { class: "dd-jt-icon",  text: m.icon || "•" }),
          el("div", { class: "dd-jt-month", text: m.month }),
          el("div", { class: "dd-jt-label", text: m.label }),
          m.sub ? el("div", { class: "dd-jt-sub", text: m.sub }) : null ]
      : [ el("div", { class: "dd-jt-month", text: m.month }),
          el("div", { class: "dd-jt-icon",  text: m.icon || "•" }),
          el("div", { class: "dd-jt-label", text: m.label }),
          m.sub ? el("div", { class: "dd-jt-sub", text: m.sub }) : null ];
    return el("div", { class: "dd-jt-node dd-jt-" + (above ? "above" : "below") + (m.hero ? " dd-jt-hero" : "") }, [
      el("div", { class: "dd-jt-copy" }, copyKids),
      el("div", { class: "dd-jt-dot" }),
    ]);
  }

  // True when the SE has authored explicit timeline events (the journey-map
  // section then renders this horizontal timeline instead of the circle map).
  function hasAuthoredTimeline() {
    return Array.isArray(f.timelineEvents) && f.timelineEvents.length > 0;
  }

  // Build the horizontal-timeline track (above-row · track · below-row).
  // Shared by the journeyTimeline slide renderer and the journey-map section
  // (via window.HOLO_DEMO.renderJourneyTimeline) so both stay byte-identical.
  // Source precedence: SE timelineEvents → storyActs → placeholder scaffold.
  function buildTimelineTrack() {
    const months = ["DEC","JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV"];
    const evts = hasAuthoredTimeline()
      ? f.timelineEvents
      : (acts.length ? acts : Array.from({length:5},function(_,i){return{label:"Moment "+(i+1)};}));
    // Timeline copy must stay VERY short & sweet: titles ≤ 4 words, sub-lines
    // ≤ 20 words. clampWords enforces it at render time regardless of source
    // (SE-authored event, story act, or placeholder) so a long "ACT 2: ONSITE
    // EXPERIENCE & DYNAMIC PERSONALIZATION" collapses to a tidy stub.
    const cw = SHARED && SHARED.clampWords ? SHARED.clampWords : function (s) { return String(s || ""); };
    const milestones = evts.slice(0, 8).map(function (e, i) {
      e = e || {};
      const channel = e.channel || "";
      return {
        month: e.month || e.timing || months[i % 12] || ("M" + (i+1)),
        // An explicit picked icon wins; otherwise derive from the channel.
        icon:  (e.icon && String(e.icon).trim()) || channelIcon(channel),
        label: cw(e.label || e.title || e.demoMoment || ("Moment " + (i+1)), 4, 28),
        // Narrow columns — keep the sub tight so it fits ≤2 lines per column.
        sub:   cw(e.sub || channel || "", 12, 80),
        hero:  i === 0 || e.hero === true || e.heroMoment === true,
      };
    });
    const n = milestones.length;
    // ONE CSS-GRID row of N equal columns (grid-template-columns:repeat(N,
    // minmax(0,1fr))) so every milestone owns an identical, real-width column —
    // the track line runs through the vertical center behind them. Grid (not
    // flex-with-absolute-copy) is what guarantees the columns can't collapse:
    // minmax(0,1fr) forces long labels to WRAP inside their cell instead of
    // blowing the column out. ≤3 events all sit above the line (clean
    // side-by-side stops); ≥4 alternate above/below by index parity so a long
    // journey stays compact — but every node still owns an equal column, so
    // DEC·JAN·FEB·MAR land as 4 evenly-spaced points, never two clustered spots.
    const single = n <= 3;
    // Let the GRID divide the width; just cap + center the wrapper. No computed
    // px width (the old n*200px min-width forced a narrow track that collapsed).
    const wrapStyle = "max-width:min(100%, 980px);margin-left:auto;margin-right:auto;";
    const rowStyle = "grid-template-columns:repeat(" + n + ",minmax(0,1fr));";
    const nodes = milestones.map(function (m, i) {
      // single → all above; alternating → even index above, odd below.
      return timelineNode(m, single ? "above" : (i % 2 === 0 ? "above" : "below"));
    });
    return el("div", {
      class: "dd-jt dd-jt-cols" + (single ? " dd-jt-single" : " dd-jt-alt") + " dd-jt-n" + n,
      style: wrapStyle,
    }, [
      el("div", { class: "dd-jt-track" }),
      el("div", { class: "dd-jt-row", style: rowStyle }, nodes),
    ]);
  }

  // Public hook for the journey-map section (buildMap() in the deck HTML):
  // when the SE authored timeline events, swap the circle/flow map for the
  // horizontal timeline so the exported deck matches the builder preview.
  window.HOLO_DEMO = window.HOLO_DEMO || {};
  window.HOLO_DEMO.hasAuthoredTimeline = hasAuthoredTimeline;
  window.HOLO_DEMO.renderJourneyTimeline = function (container) {
    if (!container) return false;
    container.innerHTML = "";
    container.appendChild(buildTimelineTrack());
    return true;
  };

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

  // Channel → emoji. Defers to the shared catalog (HOLO_SHARED.channelIcon)
  // so the builder's icon picker and this renderer stay in lockstep; the
  // inline map is a fallback if shared isn't loaded.
  function channelIcon(channel) {
    if (SHARED.channelIcon) return SHARED.channelIcon(channel);
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

  // ─── Export stamp + expired-image banner ─────────────────────
  // AI images are hosted in a private bucket and embedded as 7-day signed
  // URLs at export time. We stamp the export date in a quiet footer, and
  // if any image fails to load after the URLs lapse we surface a one-time,
  // dismissible banner asking the SE to re-export (no cross-origin refresh
  // — the deck is fully static once exported).
  (function exportNotices() {
    const info = CFG.export || {};
    if (!info.exportedAt) return; // a non-exported preview has no stamp

    function fmtDate(iso) {
      try {
        const d = new Date(iso);
        if (isNaN(d.getTime())) return "";
        return d.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
      } catch (e) { return ""; }
    }

    const stampText = fmtDate(info.exportedAt);
    if (stampText) {
      const foot = document.createElement("div");
      foot.className = "dd-export-stamp";
      foot.setAttribute("aria-hidden", "true");
      foot.style.cssText =
        "position:fixed;right:10px;bottom:8px;z-index:40;" +
        "font:11px/1.4 Inter,system-ui,sans-serif;color:rgba(255,255,255,.38);" +
        "letter-spacing:.02em;pointer-events:none;user-select:none;";
      foot.textContent = "Exported " + stampText;
      document.body.appendChild(foot);
    }

    // Show the expired-images banner at most once per page load.
    let bannerShown = false;
    function showExpiredBanner() {
      if (bannerShown) return;
      bannerShown = true;
      const bar = document.createElement("div");
      bar.className = "dd-expired-banner";
      bar.setAttribute("role", "status");
      bar.style.cssText =
        "position:fixed;left:50%;top:14px;transform:translateX(-50%);z-index:9999;" +
        "max-width:min(680px,92vw);display:flex;align-items:center;gap:12px;" +
        "padding:11px 14px;border-radius:10px;background:#1b2233;color:#e8edf6;" +
        "border:1px solid rgba(245,192,106,.4);box-shadow:0 8px 28px rgba(0,0,0,.45);" +
        "font:13px/1.45 Inter,system-ui,sans-serif;";
      const msg = document.createElement("span");
      msg.style.flex = "1";
      msg.textContent =
        "Some images have expired — re-export this demo from the Holodeck builder to refresh them.";
      const close = document.createElement("button");
      close.type = "button";
      close.setAttribute("aria-label", "Dismiss");
      close.textContent = "×";
      close.style.cssText =
        "flex:none;background:none;border:0;color:#e8edf6;font-size:20px;line-height:1;" +
        "cursor:pointer;padding:0 4px;opacity:.7;";
      close.addEventListener("click", function () { bar.remove(); });
      bar.appendChild(msg);
      bar.appendChild(close);
      document.body.appendChild(bar);
    }

    // Listen in the capture phase — <img> error events don't bubble. A
    // failing signed-URL image (403 after expiry) trips the banner; broken
    // relative/local assets are ignored so we don't false-alarm on those.
    document.addEventListener("error", function (e) {
      const t = e && e.target;
      if (!t || t.tagName !== "IMG") return;
      const src = t.currentSrc || t.src || "";
      if (/storage\.googleapis\.com|storage\.cloud\.google\.com/.test(src)) {
        showExpiredBanner();
      }
    }, true);
  })();
})();
