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
  // Labels (eyebrows, kickers) and headlines are NOT sentences — they must never
  // show a mid-word "…". clampWords adds one when it cuts, so strip it and any
  // trailing separator: a whole-word label reads clean even one word shorter.
  function noEllipsis(s) { return String(s || "").replace(/…$/, "").replace(/[\s,;:–—-]+$/, ""); }
  function ebrow(v) { return noEllipsis(_cw(v, 6, 46)); }
  function ttl(v, fb) { return noEllipsis(_cw(v, 8, 60)) || fb || ""; }
  // Whole-sentences-that-fit, NO trailing "…" — for every narrative/prose slot
  // (quotes, exec columns, two-state text, closing takeaway). Packs complete
  // sentences up to `max`, and for a single long run-on trims to the last clause
  // boundary + period. Falls back to plain truncate only if the shared helper is
  // somehow absent.
  function fitS(v, max) {
    return SHARED && SHARED.fitSentences ? SHARED.fitSentences(v, max)
         : (SHARED && SHARED.oneSentence ? SHARED.oneSentence(v, max) : truncate(v, max));
  }
  // Prefer an AI-authored slot-sized COMPLETE-THOUGHT variant (`*Short`) when
  // present; otherwise fall back to the long source field. Either way ALWAYS
  // clamp with the same helper the fallback uses — the model can exceed budget,
  // and a blank/whitespace short field must degrade to today's behavior.
  function shortOr(shortVal, longVal, budget, clamp) {
    const c = clamp || truncate;
    const sv = String(shortVal == null ? "" : shortVal).trim();
    return sv ? c(sv, budget) : c(longVal, budget);
  }
  // Guard against a malformed config where slides is present but not an
  // array — degrade to an empty deck instead of throwing on .filter below.
  const allSlides = Array.isArray(plan.slides) ? plan.slides : [];
  // Demo deck = slides assigned to the "demo" section.  If nothing
  // tagged, treat all of them as demo (legacy configs).
  const demoSlides = allSlides.filter(function (s) { return !s.sectionId || s.sectionId === "demo"; });

  // ─── Public API (registered BEFORE the #demo-wrap guard) ────────
  // The builder page loads this renderer solely to reuse renderScreenFlow for
  // export screenshot capture — it has no #demo-wrap, so the auto-render below
  // bails. Register the HOLO_DEMO API up here so it's available in that context
  // too. These closures only READ RENDERERS/el/buildTimelineTrack when CALLED
  // (long after load), so referencing the later const/function decls is safe.
  window.HOLO_DEMO = window.HOLO_DEMO || {};
  window.HOLO_DEMO.hasAuthoredTimeline = hasAuthoredTimeline;
  window.HOLO_DEMO.renderJourneyTimeline = function (container) {
    if (!container) return false;
    container.textContent = "";
    container.appendChild(buildTimelineTrack());
    return true;
  };
  // Render ONE screenFlow / screenActOpener slide as a detached DOM node so
  // the export pipeline (export-model.js captureScreenImage) can rasterize the
  // exact same console the live deck draws. Returns a wrapper .dd-slide-content
  // element, or null if the slide isn't a screen layout. The renderer reads
  // only the slide object (panels/config/openerConfig already resolved by the
  // adapter), so it's independent of the live deck's HOLODECK_CONFIG.
  window.HOLO_DEMO.renderScreenFlow = function (slide, state, cfg) {
    if (!slide) return null;
    var layout = slide.layout ||
      (slide.openerConfig ? "screenActOpener" : (slide.panels || slide.screenId ? "screenFlow" : ""));
    // Only the two console-screen layouts capture as images; anything else
    // returns null so this can't be misused to rasterize arbitrary slides.
    if (layout !== "screenFlow" && layout !== "screenActOpener") return null;
    var fn = RENDERERS[layout];
    if (typeof fn !== "function") return null;
    var nodes = fn(slide) || [];
    var wrap = el("div", { class: "dd-slide-content dd-layout-" + layout },
      (Array.isArray(nodes) ? nodes : [nodes]).filter(Boolean));
    return wrap;
  };

  // #demo-wrap only exists on the /demo deck page. The builder page loads this
  // file solely to reuse window.HOLO_DEMO.renderScreenFlow (registered above)
  // for PDF/PPTX screen capture — it has NO #demo-wrap. We must NOT early-return
  // here, or the RENDERERS map (defined ~line 1260) and every sf* atom builder
  // renderScreenFlow depends on never get defined, and every console capture
  // throws → blank consoles in the export. Instead, define everything, and gate
  // only the deck auto-mount below on the presence of #demo-wrap.
  const wrap = document.getElementById("demo-wrap");

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
    // Simple / Guided mode decks are just the selected experiences — no
    // framing. Skip the auto-injected opener so the deck opens straight
    // on the first experience slide.
    if (plan.simpleMode) return;
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

  // ════════════════════════════════════════════════════════════
  //  CONFIG-DRIVEN SALESFORCE CONSOLE/CRM SCREENS
  //  ──────────────────────────────────────────
  //  The `screenFlow` composition renders a generated Salesforce
  //  console screen (from slide.panels[].config, a screenConfig)
  //  IN-DOM — no iframe, no asset dependency — inside a paired
  //  layout: numbered story steps beside the screen, two screens
  //  side by side, or a phone-framed screen. `screenActOpener`
  //  renders the animated act/scene opener.
  //
  //  The 12 screens collapse to ~8 families; each family has one
  //  sfPanel* builder. Shared atoms (sfCard/sfScore/sfTimeline/…)
  //  are reused across families. EVERY generated string routes
  //  through the copy-fit helpers (ebrow/ttl/fitS/_cw) and arrays
  //  are length-capped so dense fixed-width fields never overflow.
  // ════════════════════════════════════════════════════════════

  // Small local clamp: whole-word trim to a char budget, no ellipsis noise.
  function sfClip(v, max) { return noEllipsis(_cw(v, 40, max || 60)); }
  function sfArr(v, cap) { return (Array.isArray(v) ? v : []).slice(0, cap || 6); }
  function sfPct(n) { var x = Number(n); if (!isFinite(x)) x = 0; return Math.max(0, Math.min(100, Math.round(x))); }

  // ── Shared atoms ──────────────────────────────────────────────
  // Chrome: nav + tabs. `chrome` = { logo, tabs[], activeTab }.
  function sfChrome(chrome) {
    chrome = chrome || {};
    var tabs = sfArr(chrome.tabs, 4);
    var activeIdx = 0;
    // Single compact chrome strip: app-launcher (9 dots) + a brand lockup
    // (Salesforce cloud mark + customer name) on the left, then the object
    // tabs. The old full-width nav row (logo/search/icons) was dropped — it
    // stole vertical space from the console body without adding demo value.
    return el("div", {}, [
      el("div", { class: "sf-tabs" }, [
        el("div", { class: "sf-app-launcher" }, [0,0,0,0,0,0,0,0,0].map(function () { return el("span"); })),
        el("div", { class: "sf-brand-lockup" }, [
          el("span", { class: "sf-brand-mark" }),
          el("span", { class: "sf-brand-name", text: sfClip(chrome.logo || customer.name || "Salesforce", 24) }),
        ]),
      ].concat(tabs.length ? tabs.map(function (t, i) {
        return el("div", { class: "sf-tab" + (i === activeIdx ? " active" : ""), text: sfClip(t, 22) });
      }) : [el("div", { class: "sf-tab active", text: "Home" })])),
    ]);
  }

  // Record header: { recordType, name, fields:[{label,value,link}], followLabel }
  function sfHeader(h, opts) {
    h = h || {};
    opts = opts || {};
    var fields = sfArr(h.fields, 4).map(function (fld) {
      return el("div", { class: "sf-field" }, [
        el("div", { class: "sf-field-label", text: sfClip(fld.label, 18) }),
        el("div", { class: "sf-field-value" + (fld.link ? " link" : ""), text: sfClip(fld.value, 40) }),
      ]);
    });
    return el("div", { class: "sf-header" + (opts.compact ? " sf-header-compact" : "") }, [
      el("div", { class: "sf-header-main" }, [
        el("div", { class: "sf-header-label", text: sfClip(h.recordType || "Record", 40) }),
        el("div", { class: "sf-header-name", text: sfClip(h.name || customer.name || "Record", 44) }),
        el("div", { class: "sf-header-fields" }, fields),
      ]),
      el("div", { class: "sf-follow-btn", text: h.followLabel || "+ Follow" }),
    ]);
  }

  // Progress bar: { steps:N (completed), label, action }
  function sfProgress(p) {
    if (!p) return null;
    var done = Math.max(0, Math.min(6, Number(p.steps) || 0));
    var cells = [];
    for (var i = 0; i < (p.total || Math.max(done, 4)); i++) {
      cells.push(el("div", { class: "sf-pb-step" + (i < done ? "" : " todo"), text: i < done ? "✓" : "" }));
    }
    if (p.label) cells.push(el("div", { class: "sf-pb-label", text: sfClip(p.label, 24) }));
    if (p.action) cells.push(el("button", { class: "sf-pb-btn", text: sfClip(p.action, 30) }));
    return el("div", { class: "sf-progress" }, cells);
  }

  // Card wrapper with an optional AI head. head = { icon, title, sub, badge }.
  function sfCard(head, bodyNodes) {
    var kids = [];
    if (head) {
      kids.push(el("div", { class: "sf-card-head" }, [
        el("div", { class: "sf-card-head-icon", text: head.icon || "✦" }),
        el("div", {}, [
          el("div", { class: "sf-card-head-title", text: sfClip(head.title, 40) }),
          head.sub ? el("div", { class: "sf-card-head-sub", text: sfClip(head.sub, 46) }) : null,
        ]),
        head.badge ? el("div", { class: "sf-card-head-badge", text: sfClip(head.badge, 18) }) : null,
      ]));
    }
    (bodyNodes || []).forEach(function (n) { if (n) kids.push(n); });
    return el("div", { class: "sf-card" }, kids);
  }

  // Score block: { value, of, label, meta, insight }
  function sfScore(sc) {
    if (!sc) return null;
    return el("div", { class: "sf-score-row" }, [
      el("div", { class: "sf-score-circle" }, [
        el("div", { class: "sf-score-num", text: String(sc.value != null ? sc.value : "—") }),
        el("div", { class: "sf-score-denom", text: "/ " + (sc.of != null ? sc.of : 100) }),
      ]),
      el("div", {}, [
        el("div", { class: "sf-score-label", text: sfClip(sc.label || "Score", 28) }),
        el("div", { class: "sf-score-meta", text: sfClip(sc.meta || "", 48) }),
        sc.insight ? el("div", { class: "sf-score-insight", text: fitS(sc.insight, 220) }) : null,
      ]),
    ]);
  }

  // Criteria list: [{icon,name,sub,pct,score}] (≤5)
  function sfCriteria(rows) {
    rows = sfArr(rows, 5);
    if (!rows.length) return null;
    return el("div", { class: "sf-criteria" }, rows.map(function (r) {
      return el("div", { class: "sf-criteria-row" }, [
        el("div", { class: "sf-criteria-icon", text: r.icon || "•" }),
        el("div", {}, [
          el("div", { class: "sf-criteria-name", text: sfClip(r.name, 40) }),
          r.sub ? el("div", { class: "sf-criteria-sub", text: sfClip(r.sub, 48) }) : null,
          el("div", { class: "sf-criteria-bar" }, [
            el("div", { class: "sf-criteria-bar-fill", style: "width:" + sfPct(r.pct) + "%" }),
          ]),
        ]),
        el("div", { class: "sf-criteria-score", text: sfClip(r.score || "", 12) }),
      ]);
    }));
  }

  // Activity timeline: header + month + items. items = [{title,sub,from,time,status,statusTone,body}]
  function sfTimeline(tl) {
    tl = tl || {};
    var items = sfArr(tl.items, 5).map(function (it) {
      var kids = [];
      if (it.title) {
        kids.push(el("div", { class: "sf-activity-item-head" }, [
          el("div", { class: "sf-ai-dot agent", text: "✦" }),
          el("div", {}, [
            el("div", { class: "sf-activity-item-title", text: sfClip(it.title, 56) }),
            it.sub ? el("div", { class: "sf-activity-item-sub", text: sfClip(it.sub, 56) }) : null,
          ]),
        ]));
      }
      if (it.body || it.from) {
        var tone = it.statusTone === "pending" ? "pending" : "viewed";
        kids.push(el("div", { class: "sf-msg" }, [
          it.from ? el("div", { class: "sf-msg-from" }, [
            el("span", { text: sfClip(it.from, 52) }),
            it.time ? el("span", { class: "sf-time", text: sfClip(it.time, 20) }) : null,
          ]) : null,
          it.status ? el("div", { class: "sf-msg-status" }, [
            el("span", { class: "sf-dot " + tone }), document.createTextNode(" " + sfClip(it.status, 20)),
          ]) : null,
          it.body ? el("div", { class: "sf-msg-body", text: fitS(it.body, 260) }) : null,
        ]));
      }
      return el("div", { class: "sf-activity-item" }, kids);
    });
    return el("div", { class: "sf-card" }, [
      el("div", { class: "sf-activity-head" }, [
        document.createTextNode(sfClip(tl.title || "Activity", 20)),
        el("div", { class: "sf-icons" }, ["✉️","💬","📞","📅"].map(function (c) { return el("span", { text: c }); })),
      ]),
      tl.month ? el("div", { class: "sf-activity-month", text: "▾ " + sfClip(tl.month, 24) }) : null,
    ].concat(items));
  }

  // Two-column key/value detail card (Identity).
  function sfDetail(d) {
    if (!d || !d.fields) return null;
    var fields = sfArr(d.fields, 6).map(function (fld) {
      return el("div", {}, [
        el("div", { class: "sf-detail-label", text: sfClip(fld.label, 18) }),
        el("div", { class: "sf-detail-value", text: sfClip(fld.value, 40) }),
      ]);
    });
    return el("div", { class: "sf-card" }, [
      el("div", { class: "sf-detail" }, [
        el("div", { class: "sf-detail-title", text: sfClip(d.title || "Identity", 24) }),
        el("div", { class: "sf-detail-grid" }, fields),
      ]),
    ]);
  }

  // AI narrative panel: { title, badge, body, sources:[] }
  function sfAiPanel(ai) {
    if (!ai) return null;
    var body = [];
    if (ai.body) body.push(el("div", { class: "sf-score-insight", text: fitS(ai.body, 320) }));
    var srcs = sfArr(ai.sources, 4);
    if (srcs.length) {
      body.push(el("div", { class: "sf-ai-sources" }, srcs.map(function (sname) {
        return el("span", { class: "sf-ai-source", text: sfClip(sname, 26) });
      })));
    }
    return sfCard({ icon: "✦", title: sfClip(ai.title || "Einstein Insight", 40), badge: ai.badge }, body);
  }

  // Metric cards row: [{label,value,sub,delta,tone}] (≤4)
  function sfMetricCards(cards) {
    cards = sfArr(cards, 4);
    if (!cards.length) return null;
    return el("div", { class: "sf-metric-cards" }, cards.map(function (m) {
      var tone = (m.tone === "down") ? "down" : (m.tone === "flat" ? "flat" : "up");
      return el("div", { class: "sf-metric-card" }, [
        el("div", { class: "sf-metric-card-label", text: sfClip(m.label, 28) }),
        el("div", { class: "sf-metric-card-value", text: sfClip(String(m.value != null ? m.value : "—"), 16) }),
        (m.delta || m.sub) ? el("div", { class: "sf-metric-card-delta " + tone, text: sfClip(m.delta || m.sub, 24) }) : null,
      ]);
    }));
  }

  // Data table: { columns:[…], rows:[[…]], barColumn?(int) } — barColumn cell renders a bar.
  function sfTable(t) {
    t = t || {};
    var cols = sfArr(t.columns, 5);
    if (!cols.length) return null;
    var barCol = (typeof t.barColumn === "number") ? t.barColumn : -1;
    var head = el("div", { class: "sf-tr sf-tr-head" }, cols.map(function (c) {
      return el("div", { class: "sf-th", text: sfClip(c, 22) });
    }));
    var rows = sfArr(t.rows, 6).map(function (r) {
      return el("div", { class: "sf-tr" }, sfArr(r, 5).map(function (cell, ci) {
        if (ci === barCol) {
          var pct = sfPct(cell);
          return el("div", { class: "sf-td" }, [
            el("div", { class: "sf-criteria-bar" }, [el("div", { class: "sf-criteria-bar-fill", style: "width:" + pct + "%" })]),
          ]);
        }
        return el("div", { class: "sf-td", text: sfClip(String(cell), 26) });
      }));
    });
    return el("div", { class: "sf-table" }, [head].concat(rows));
  }

  // Funnel / list rows: [{primary, secondary, badge:{tone,text}, value}] (≤6)
  function sfList(rows) {
    rows = sfArr(rows, 6);
    if (!rows.length) return null;
    return el("div", { class: "sf-list" }, rows.map(function (r) {
      var badge = r.badge || null;
      return el("div", { class: "sf-list-row" }, [
        el("div", { class: "sf-list-main" }, [
          el("div", { class: "sf-list-primary", text: sfClip(r.primary, 40) }),
          r.secondary ? el("div", { class: "sf-list-secondary", text: sfClip(r.secondary, 52) }) : null,
        ]),
        r.value != null ? el("div", { class: "sf-list-value", text: sfClip(String(r.value), 14) }) : null,
        badge ? el("div", { class: "sf-pill sf-pill-" + (badge.tone || "neutral"), text: sfClip(badge.text, 18) }) : null,
      ]);
    }));
  }

  // Lightweight inline markup for agent-reply items/highlights: escapes first,
  // then renders **bold**→<strong>, *em*→<em>, [link]→<a> (Lightning-blue).
  // Faithful to sales-assistant.html where items carry strong/em/link spans.
  function sfInline(s) {
    var out = escapeHtml(s);
    out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    out = out.replace(/\[([^\]]+)\]/g, '<a>$1</a>');
    out = out.replace(/(^|[^*])\*([^*]+)\*(?!\*)/g, '$1<em>$2</em>');
    return out;
  }

  // Chat turns: [{role:"user|agent", who, body, time, greeting?, intro?,
  //   sections:[{title, items:[str]}], highlight:{title, body, sub, source}}]
  // + optional suggestedReply. Agent replies render structured multi-section
  // bodies with a highlight callout box (sales-assistant reference).
  function sfChat(turns, suggested) {
    var kids = sfArr(turns, 6).map(function (t) {
      var isAgent = t.role === "agent" || t.role === "system";
      var secs = sfArr(t.sections, 5);
      var hl = t.highlight;
      var bubbleKids = [];
      if (t.who) bubbleKids.push(el("div", { class: "sf-chat-who", text: sfClip(t.who, 28) }));
      // Agent greeting = italic muted line, no card body.
      if (isAgent && t.greeting) {
        bubbleKids.push(el("div", { class: "sf-chat-greeting", text: fitS(t.greeting, 220) }));
      }
      // Primary body paragraph (intro to a structured reply, or the plain turn).
      if (t.body) bubbleKids.push(el("div", { class: "sf-chat-body", html: sfInline(fitS(t.body, 260)) }));
      // Structured sections: title + dashed bullet items with inline markup.
      secs.forEach(function (sec) {
        var items = sfArr(sec.items, 6).filter(Boolean);
        if (!sec.title && !items.length) return;
        bubbleKids.push(el("div", { class: "sf-agent-section" }, [
          sec.title ? el("div", { class: "sf-agent-sec-title", text: sfClip(sec.title, 40) }) : null,
        ].concat(items.map(function (it) {
          return el("div", { class: "sf-agent-item", html: sfInline(fitS(it, 200)) });
        }))));
      });
      // Highlight callout box — title (strong), body, sub, source (em).
      if (hl && (hl.title || hl.body)) {
        bubbleKids.push(el("div", { class: "sf-agent-highlight" }, [
          hl.title ? el("div", { class: "sf-ah-title", html: sfInline(sfClip(hl.title, 60)) }) : null,
          hl.body ? el("div", { class: "sf-ah-body", html: sfInline(fitS(hl.body, 320)) }) : null,
          hl.sub ? el("div", { class: "sf-ah-body", html: sfInline(fitS(hl.sub, 200)) }) : null,
          hl.source ? el("div", { class: "sf-ah-source", text: fitS(hl.source, 140) }) : null,
        ]));
      }
      return el("div", { class: "sf-chat-turn " + (isAgent ? "agent" : "user") }, [
        el("div", { class: "sf-chat-avatar" + (isAgent ? " agent" : ""), text: isAgent ? "✦" : (initialsOf(t.who) || "U") }),
        el("div", { class: "sf-chat-bubble" }, bubbleKids),
      ]);
    });
    if (suggested && suggested.body) {
      kids.push(el("div", { class: "sf-suggested" }, [
        el("div", { class: "sf-suggested-head", text: "✦ " + sfClip(suggested.groundedOn || "Suggested reply", 40) }),
        el("div", { class: "sf-suggested-body", text: fitS(suggested.body, 260) }),
        (sfArr(suggested.actions, 3).length) ? el("div", { class: "sf-suggested-actions" },
          sfArr(suggested.actions, 3).map(function (a) { return el("span", { class: "sf-suggested-btn", text: sfClip(a, 20) }); })) : null,
      ]));
    }
    return el("div", { class: "sf-chat" }, kids);
  }

  // Small local: initials from a name.
  function initialsOf(name) {
    var parts = String(name || "").trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return "";
    return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
  }

  // KPI strip: [{value, label, active?}] (≤8) — big-number summary counters.
  function sfKpiStrip(kpis) {
    kpis = sfArr(kpis, 8);
    if (!kpis.length) return null;
    return el("div", { class: "sf-kpi-strip" }, kpis.map(function (k) {
      return el("div", { class: "sf-kpi" + (k.active ? " active" : "") }, [
        el("div", { class: "sf-kpi-value", text: sfClip(String(k.value != null ? k.value : "—"), 12) }),
        el("div", { class: "sf-kpi-label", text: sfClip(k.label, 22) }),
      ]);
    }));
  }

  // Rich account table: { columns, rows:[{cells, sub, signal:{tone,text}, tags:[{tone,text}], selected}], footnote }.
  // First cell of each row gets the primary/sub stack + signal badge; remaining cells plain;
  // tag chips render under the row. Distinct from sfTable (bar-column numeric table).
  function sfAccountTable(t) {
    t = t || {};
    var cols = sfArr(t.columns, 7);
    if (!cols.length) return null;
    var head = el("div", { class: "sf-atbl-tr sf-atbl-head" }, cols.map(function (c) {
      return el("div", { class: "sf-atbl-th", text: sfClip(c, 18) });
    }));
    var rows = sfArr(t.rows, 6).map(function (r) {
      var cells = sfArr(r.cells, 7).map(function (cell, ci) {
        if (ci === 0) {
          return el("div", { class: "sf-atbl-td sf-atbl-primary" }, [
            el("div", { class: "sf-atbl-name-row" }, [
              el("span", { class: "sf-atbl-name", text: sfClip(String(cell), 28) }),
              r.signal ? el("span", { class: "sf-pill sf-pill-" + (r.signal.tone || "neutral"), text: sfClip(r.signal.text, 10) }) : null,
            ]),
            r.sub ? el("div", { class: "sf-atbl-sub", text: sfClip(r.sub, 60) }) : null,
            (r.tags && r.tags.length) ? el("div", { class: "sf-atbl-tags" }, sfArr(r.tags, 4).map(function (tg) {
              return el("span", { class: "sf-tag sf-tag-" + (tg.tone || "neutral"), text: sfClip(tg.text, 16) });
            })) : null,
          ]);
        }
        return el("div", { class: "sf-atbl-td", text: sfClip(String(cell), 22) });
      });
      return el("div", { class: "sf-atbl-tr" + (r.selected ? " selected" : "") }, cells);
    });
    var kids = [el("div", { class: "sf-atbl" }, [head].concat(rows))];
    if (t.footnote) kids.push(el("div", { class: "sf-atbl-foot", text: fitS(t.footnote, 140) }));
    return el("div", {}, kids);
  }

  // ── Panel builders (one per family) ───────────────────────────
  // recordWithScoreAndTimeline: header + progress + [score card + identity | timeline]
  function sfPanelScoreTimeline(cfg) {
    cfg = cfg || {};
    var scoreCard = sfCard(
      cfg.aiHead || { icon: "✦", title: "AI Opportunity Score", sub: "Einstein scoring model", badge: (cfg.score && cfg.score.badge) },
      [sfScore(cfg.score), sfCriteria(cfg.criteria)]
    );
    return el("div", { class: "sf-screen" }, [
      sfChrome(cfg.chrome),
      sfHeader(cfg.header),
      sfProgress(cfg.progress),
      el("div", { class: "sf-main" }, [
        el("div", { class: "sf-col" }, [scoreCard, sfDetail(cfg.identity)]),
        el("div", { class: "sf-col" }, [sfTimeline(cfg.timeline)]),
      ]),
    ]);
  }

  // recordWithAiPanel: header + a two-column record body. One enriched layout
  // that both screens fill differently via config presence:
  //   • account-research → donut header + AI panel + Account Plan detail (left),
  //     research narrative sections (right).
  //   • eci-opportunity  → transcript-with-highlights + stage bar (left),
  //     AI panel + recognition/insight sections (right).
  // Any absent block simply drops out, so the same panel serves both.
  function sfPanelRecordAi(cfg) {
    cfg = cfg || {};
    var left = [];
    if (cfg.donut) left.push(sfCard({ icon: "📊", title: sfClip((cfg.donutTitle) || "Account signals", 32) }, [sfDonut(cfg.donut)]));
    if (cfg.transcript) left.push(sfTranscript(cfg.transcript));
    if (cfg.stageBar) left.push(sfCard({ icon: "🧭", title: sfClip((cfg.stageTitle) || "Deal stage", 28) }, [sfStageBar(cfg.stageBar)]));
    if (cfg.aiPanel && !cfg.transcript) left.push(sfAiPanel(cfg.aiPanel));  // AI panel leads on account-research, trails on eci
    if (cfg.identity) left.push(sfDetail(cfg.identity));

    var right = [];
    if (cfg.transcript && cfg.aiPanel) right.push(sfAiPanel(cfg.aiPanel));
    if (cfg.sections && cfg.sections.length) right.push(sfCard({ icon: "✦", title: sfClip((cfg.sectionsTitle) || "Research", 28) }, [sfSections(cfg.sections)]));
    if (cfg.timeline && (cfg.timeline.items || []).length) right.push(sfTimeline(cfg.timeline));
    else if ((cfg.list || []).length) right.push(sfCard({ icon: "📋", title: sfClip(cfg.listTitle || "Related", 28) }, [sfList(cfg.list)]));

    // Guard against an empty column so the two-col grid never collapses.
    if (!left.length) left.push(sfAiPanel(cfg.aiPanel));
    if (!right.length && cfg.identity) right.push(sfDetail(cfg.identity));

    return el("div", { class: "sf-screen" }, [
      sfChrome(cfg.chrome),
      sfHeader(cfg.header),
      el("div", { class: "sf-main" }, [
        el("div", { class: "sf-col" }, left),
        el("div", { class: "sf-col" }, right),
      ]),
    ]);
  }

  // assistantChat: a phone-framed assistant panel — titled head, a scrolling
  // conversational thread (greeting + structured replies + highlight box), and
  // a bottom input bar. (sales-assistant reference)
  function sfPanelAssistantChat(cfg) {
    cfg = cfg || {};
    var title = sfClip((cfg.aiPanel && cfg.aiPanel.title) || "Agentforce Sales Assistant", 40);
    return el("div", { class: "sf-screen sf-screen-assist" }, [
      el("div", { class: "sf-assist" }, [
        el("div", { class: "sf-assist-head" }, [
          el("div", { class: "sf-assist-title", text: title }),
          el("div", { class: "sf-assist-close" }, [
            el("span", { text: "◀" }), el("span", { text: "✕" }),
          ]),
        ]),
        el("div", { class: "sf-assist-msgs" }, [
          sfChat(cfg.chat || cfg.timelineTurns || [], cfg.suggestedReply),
        ]),
        el("div", { class: "sf-assist-input" }, [
          el("div", { class: "sf-assist-field", text: "Describe your task or ask a question…" }),
        ]),
      ]),
    ]);
  }

  // metricsAndTable: one enriched panel both screens fill by config presence.
  //   • territory-planning → two-column split: map+pins + growth table (left);
  //     brief hero + recent activity + recommended play + coverage math (right).
  //   • mc-next-attribution → stacked: metric cards → funnel → campaign table → insight.
  // The presence of `map`/`brief` switches to the two-column territory layout.
  function sfPanelMetricsTable(cfg) {
    cfg = cfg || {};
    var isTerritory = !!(cfg.map || cfg.brief || cfg.recommendedPlay);

    if (isTerritory) {
      var left = [];
      if (cfg.map) left.push(sfMap(cfg.map));
      if (cfg.table && (cfg.table.rows || []).length)
        left.push(sfCard({ icon: "📈", title: sfClip((cfg.table.title) || "Accounts", 40) }, [sfTable(cfg.table)]));

      var right = [];
      if (cfg.brief) right.push(sfBriefHero(cfg.brief));
      if (cfg.activity && cfg.activity.length)
        right.push(sfCard({ icon: "🎯", title: sfClip(cfg.activityTitle || "Recent Activity", 30) }, [sfList(cfg.activity)]));
      if (cfg.recommendedPlay) {
        var rp = cfg.recommendedPlay;
        var rpBody = [];
        if (rp.aiPanel && rp.aiPanel.body) rpBody.push(el("div", { class: "sf-score-insight", text: fitS(rp.aiPanel.body, 340) }));
        if (rp.cta && rp.cta.length) rpBody.push(sfCtaRow(rp.cta));
        right.push(sfCard({ icon: "✨", title: sfClip(rp.title || "Recommended Play", 40), badge: (rp.aiPanel && rp.aiPanel.badge) || "AI" }, rpBody));
      }
      if (cfg.coverage) right.push(sfCard({ icon: "🗺", title: sfClip(cfg.coverage.title || "Coverage Math", 32) }, [sfCoverage(cfg.coverage)]));

      if (!left.length) left.push(sfCard({ icon: "📈", title: "Accounts" }, [sfTable(cfg.table)]));
      if (!right.length && cfg.aiPanel) right.push(sfAiPanel(cfg.aiPanel));

      return el("div", { class: "sf-screen" }, [
        sfChrome(cfg.chrome),
        cfg.header ? sfHeader(cfg.header) : null,
        el("div", { class: "sf-main" }, [
          el("div", { class: "sf-col" }, left),
          el("div", { class: "sf-col" }, right),
        ]),
      ]);
    }

    // mc-next-attribution → stacked single column.
    return el("div", { class: "sf-screen" }, [
      sfChrome(cfg.chrome),
      cfg.header ? sfHeader(cfg.header) : null,
      cfg.subtitle ? el("div", { class: "sf-screen-subtitle", text: fitS(cfg.subtitle, 160) }) : null,
      el("div", { class: "sf-main sf-main-single" }, [
        el("div", { class: "sf-col" }, [
          sfMetricCards(cfg.metrics),
          (cfg.funnel && cfg.funnel.length)
            ? sfCard({ icon: "🔗", title: sfClip(cfg.funnelTitle || "Attribution model", 44) }, [sfFunnel(cfg.funnel)])
            : null,
          (cfg.table && (cfg.table.rows || []).length)
            ? sfCard({ icon: "📈", title: sfClip((cfg.table.title) || "Breakdown", 40) }, [sfTable(cfg.table)])
            : null,
          cfg.aiPanel ? sfAiPanel(cfg.aiPanel) : null,
        ]),
      ]),
    ]);
  }

  // serviceCase: case header + [sentiment/AI summary | customer/agent timeline]
  // (sentiment-case, case-summary-lwc)
  // Enriched shared layout; both screens fill by config presence:
  //   • sentiment-case → sentiment bar + escalation timeline + CTA rows.
  //   • case-summary-lwc → AI wrap-up summary + suggested reply + related cases.
  // Left column: badges → sentiment → AI summary → CTAs. Right: timeline/related.
  function sfPanelServiceCase(cfg) {
    cfg = cfg || {};
    var left = [];
    if (cfg.badges && cfg.badges.length) left.push(sfBadgeRow(cfg.badges));
    if (cfg.sentiment) {
      var sentBody = [];
      if (cfg.sentiment.bar) sentBody.push(sfSentimentBar(cfg.sentiment.bar));
      else if (cfg.sentiment.score) sentBody.push(sfScore(cfg.sentiment.score));
      if (cfg.sentiment.body) sentBody.push(el("div", { class: "sf-score-insight", text: fitS(cfg.sentiment.body, 300) }));
      left.push(sfCard({ icon: "🎧", title: sfClip((cfg.sentiment.title) || "Case Sentiment", 34), badge: cfg.sentiment.badge }, sentBody));
    }
    if (cfg.aiPanel) {
      var aiBody = [];
      if (cfg.aiPanel.body) aiBody.push(el("div", { class: "sf-score-insight", text: fitS(cfg.aiPanel.body, 320) }));
      var srcs = sfArr(cfg.aiPanel.sources, 4);
      if (srcs.length) aiBody.push(el("div", { class: "sf-ai-sources" }, srcs.map(function (s) { return el("span", { class: "sf-ai-source", text: sfClip(s, 26) }); })));
      if (cfg.cta && cfg.cta.length) aiBody.push(sfCtaRow(cfg.cta));
      left.push(sfCard({ icon: "✦", title: sfClip(cfg.aiPanel.title || "Case Summary", 40), badge: cfg.aiPanel.badge }, aiBody));
    } else if (cfg.cta && cfg.cta.length) {
      left.push(sfCtaRow(cfg.cta));
    }
    if (cfg.identity) left.push(sfDetail(cfg.identity));

    var right = [];
    if (cfg.suggestedReply && cfg.suggestedReply.body) {
      right.push(sfCard({ icon: "💬", title: sfClip((cfg.suggestedReply.groundedOn) || "Suggested reply", 40), badge: "AI" },
        [el("div", { class: "sf-suggested-body", text: fitS(cfg.suggestedReply.body, 280) }),
         (sfArr(cfg.suggestedReply.actions, 3).length) ? sfCtaRow(sfArr(cfg.suggestedReply.actions, 3).map(function (a, i) { return { text: a, primary: i === 0 }; })) : null]));
    }
    if (cfg.timeline && (cfg.timeline.items || []).length) right.push(sfTimeline(cfg.timeline));
    if (cfg.related && cfg.related.length) right.push(sfCard({ icon: "🗂", title: sfClip(cfg.relatedTitle || "Related cases", 30) }, [sfList(cfg.related)]));
    if (cfg.coverage) right.push(sfCard({ icon: "⏱", title: sfClip(cfg.coverage.title || "Handle time", 28) }, [sfCoverage(cfg.coverage)]));

    if (!left.length) left.push(sfAiPanel({ title: "Case Summary", body: "" }));
    if (!right.length) right.push(sfTimeline(cfg.timeline));

    return el("div", { class: "sf-screen" }, [
      sfChrome(cfg.chrome),
      sfHeader(cfg.header),
      el("div", { class: "sf-main" }, [
        el("div", { class: "sf-col" }, left),
        el("div", { class: "sf-col" }, right),
      ]),
    ]);
  }

  // voiceConsole: live-call header + [transcript stream | AI assist / next-best-action]
  // (voice-console-live). Transcript reuses the timeline atom with a live feel.
  // Animated live transcript: turns fade+slide in on a stagger (pure CSS
  // animation-delay, so it plays once on slide entry and renders the final
  // state in export/headless — no imperative timers). Each turn is tinted by
  // role (rep|customer). Per the user's directive this is the ONE screen that
  // keeps a "messages coming in" animation; everything else is static.
  function sfVoiceTranscript(tr) {
    tr = tr || {};
    var turns = sfArr(tr.turns, 8).map(function (t, i) {
      var isAgent = t.role === "agent" || t.role === "system" || t.roleColor === "rep";
      return el("div", { class: "sf-vt-turn " + (isAgent ? "rep" : "customer") + " sf-vt-in",
                         style: "animation-delay:" + (i * 0.6).toFixed(2) + "s" }, [
        el("div", { class: "sf-vt-who", text: sfClip(t.who || (isAgent ? "Agent" : "Caller"), 24) }),
        el("div", { class: "sf-vt-bubble", text: fitS(t.body, 220) }),
      ]);
    });
    return el("div", { class: "sf-vt" }, turns);
  }

  // A quiet placeholder for a side column when the generated config didn't
  // populate it — beats a bare empty flex cell (or a titled card with no
  // fields) leaving a visible gap in the 3-column voice console. Reads like a
  // dimmed, labeled panel so the layout still looks intentional.
  function sfEmptyCol(label) {
    return el("div", { class: "sf-card sf-card-empty" }, [
      el("div", { class: "sf-card-empty-label", text: sfClip(label || "—", 28) }),
    ]);
  }

  function sfPanelVoiceConsole(cfg) {
    cfg = cfg || {};
    var callBar = el("div", { class: "sf-callbar" }, [
      el("span", { class: "sf-callbar-dot" }),
      el("span", { class: "sf-callbar-label", text: sfClip((cfg.call && cfg.call.status) || "On call — live", 32) }),
      el("span", { class: "sf-callbar-timer", text: sfClip((cfg.call && cfg.call.timer) || "04:12", 10) }),
    ]);

    // Left column: caller detail cards + a live sentiment pill.
    var left = [];
    if (cfg.identity) left.push(sfDetail(cfg.identity));
    if (cfg.sentiment) left.push(sfCard({ icon: "🎧", title: sfClip(cfg.sentiment.title || "Live Sentiment", 30), badge: cfg.sentiment.badge },
      [cfg.sentiment.bar ? sfSentimentBar(cfg.sentiment.bar) : sfScore(cfg.sentiment.score)]));

    // Center column: the animated transcript.
    var center = [sfCard(
      { icon: "🎙", title: sfClip((cfg.transcript && cfg.transcript.title) || "Live Transcript", 32), badge: "LIVE" },
      [sfVoiceTranscript(cfg.transcript || { turns: cfg.chat })]
    )];

    // Right column: SRA assist + next-best actions + grounded knowledge.
    var right = [];
    if (cfg.aiPanel) right.push(sfAiPanel(cfg.aiPanel));
    if ((cfg.list || []).length) right.push(sfCard({ icon: "⚡", title: "Next Best Actions" }, [sfList(cfg.list)]));
    if ((cfg.knowledge || []).length) right.push(sfCard({ icon: "📚", title: sfClip(cfg.knowledgeTitle || "Knowledge", 28) }, [sfList(cfg.knowledge)]));

    return el("div", { class: "sf-screen" }, [
      sfChrome(cfg.chrome),
      sfHeader(cfg.header, { compact: true }),
      callBar,
      el("div", { class: "sf-main sf-main-3col" }, [
        el("div", { class: "sf-col" }, left.length ? left : [sfEmptyCol("Caller details")]),
        el("div", { class: "sf-col" }, center),
        el("div", { class: "sf-col" }, right.length ? right : [sfEmptyCol("Agent assist")]),
      ]),
    ]);
  }

  // Prompt box: the natural-language ask with highlight phrases wrapped inline.
  function sfPromptBox(cfg) {
    var body = fitS(cfg.prompt, 360);
    sfArr(cfg.promptHighlights, 6).forEach(function (h) {
      var clipped = sfClip(h, 80);
      if (clipped && body.indexOf(clipped) >= 0) {
        body = body.split(clipped).join('<span class="sf-prompt-hl">' + escapeHtml(clipped) + "</span>");
      }
    });
    return el("div", { class: "sf-prompt-box" }, [
      el("div", { class: "sf-prompt-input", html: body }),
      el("div", { class: "sf-prompt-foot" }, [
        el("span", { class: "sf-prompt-btn", text: sfClip(cfg.buildLabel || "✨ Build campaign", 24) }),
        cfg.promptMeta ? el("span", { class: "sf-prompt-meta", text: sfClip(cfg.promptMeta, 56) }) : null,
      ]),
    ]);
  }

  // Build-step strip: numbered stages left→right, done stages get a green check.
  function sfStepStrip(steps) {
    steps = sfArr(steps, 5);
    if (!steps.length) return null;
    return el("div", { class: "sf-step-strip" }, steps.map(function (s, i) {
      return el("div", { class: "sf-cstep" + (s.done !== false ? " done" : "") }, [
        el("div", { class: "sf-cstep-num", text: String(i + 1) }),
        el("div", { class: "sf-cstep-title", text: sfClip(s.title, 30) }),
        s.preview ? el("div", { class: "sf-cstep-preview", text: sfClip(s.preview, 40) }) : null,
      ]);
    }));
  }

  // Campaign preview grid (2×2): each card renders by kind (count/email/attrs/cta).
  function sfPreviewGrid(cards) {
    cards = sfArr(cards, 4);
    if (!cards.length) return null;
    return el("div", { class: "sf-cp-grid" }, cards.map(function (c) {
      var body;
      if (c.kind === "count") {
        body = [el("div", { class: "sf-cp-count", text: sfClip(c.count, 12) }),
                c.countSub ? el("div", { class: "sf-cp-count-sub", text: sfClip(c.countSub, 44) }) : null,
                sfAttrRows(c.attrs)];
      } else if (c.kind === "email") {
        body = [el("div", { class: "sf-cp-email" }, [
          el("div", { class: "sf-cp-email-subj", text: sfClip(c.subject, 52) }),
          el("div", { class: "sf-cp-email-body", text: fitS(c.body, 340) }),
        ])];
      } else if (c.kind === "cta") {
        body = [c.body ? el("div", { class: "sf-cp-cta-note", text: fitS(c.body, 220) }) : null,
                (c.ctas && c.ctas.length) ? sfCtaRow(c.ctas) : null];
      } else {
        body = [sfAttrRows(c.attrs)];
      }
      return el("div", { class: "sf-cp-card" }, [
        el("div", { class: "sf-cp-head" }, [
          el("span", { class: "sf-cp-head-title", text: (c.icon ? c.icon + " " : "") + sfClip(c.title, 34) }),
          c.badge ? el("span", { class: "sf-pill sf-pill-" + (c.badge.tone || "neutral"), text: sfClip(c.badge.text, 14) }) : null,
        ]),
        el("div", { class: "sf-cp-body" }, body),
      ]);
    }));
  }

  // Key/value attribute rows (dashed dividers) — campaign preview + email meta.
  function sfAttrRows(rows) {
    rows = sfArr(rows, 6);
    if (!rows.length) return null;
    return el("div", { class: "sf-attrs" }, rows.map(function (r) {
      return el("div", { class: "sf-attr-row" }, [
        el("span", { class: "sf-attr-k", text: sfClip(r.k, 22) }),
        el("span", { class: "sf-attr-v", text: sfClip(r.v, 30) }),
      ]);
    }));
  }

  // campaignBuilder: prompt box (highlighted) + build-step strip + 2×2 preview grid.
  // (prompt-campaign-builder)
  function sfPanelCampaignBuilder(cfg) {
    cfg = cfg || {};
    return el("div", { class: "sf-screen" }, [
      sfChrome(cfg.chrome),
      cfg.subtitle ? el("div", { class: "sf-screen-subtitle", text: fitS(cfg.subtitle, 120) }) : null,
      el("div", { class: "sf-main sf-main-single" }, [
        el("div", { class: "sf-col" }, [
          sfCard({ icon: "💬", title: "Describe your campaign" }, [
            cfg.prompt ? sfPromptBox(cfg) : null,
            sfStepStrip(cfg.steps),
          ]),
          sfPreviewGrid(cfg.previewCards),
          (!cfg.previewCards || !cfg.previewCards.length) && cfg.aiPanel ? sfAiPanel(cfg.aiPanel) : null,
        ]),
      ]),
    ]);
  }

  // A single rendered email view (personalized OR generic): banner + intro +
  // product grid + why-picked callout + cta + footer. Banner/why-picked/cta
  // can render in a muted variant for the generic (non-personalized) view.
  function sfEmailView(v) {
    if (!v) return null;
    var products = sfArr(v.products, 4).map(function (p) {
      return el("div", { class: "sf-eproduct" }, [
        el("div", { class: "sf-eproduct-img", text: sfClip(p.emoji || "•", 4) }),
        el("div", { class: "sf-eproduct-name", text: sfClip(p.name, 30) }),
        p.meta ? el("div", { class: "sf-eproduct-meta", text: sfClip(p.meta, 34) }) : null,
      ]);
    });
    return el("div", { class: "sf-eview" }, [
      el("div", { class: "sf-ebanner" + (v.bannerAlt ? " alt" : "") }, [
        v.bannerTag ? el("span", { class: "sf-ebanner-tag", text: sfClip(v.bannerTag, 28) }) : null,
        el("span", { class: "sf-ebanner-text", text: sfClip(v.bannerText, 44) }),
      ]),
      el("div", { class: "sf-ebody" }, [
        v.intro ? el("div", { class: "sf-eintro", text: fitS(v.intro, 220) }) : null,
        products.length ? el("div", { class: "sf-eproduct-grid" }, products) : null,
        v.whyPicked ? el("div", { class: "sf-ewhy" + (v.whyPicked.muted ? " muted" : "") }, [
          el("span", { class: "sf-ewhy-dot" }),
          el("span", { html: "<strong>" + escapeHtml(sfClip(v.whyPicked.title, 30)) + "</strong> " + escapeHtml(fitS(v.whyPicked.body, 260)) }),
        ]) : null,
        v.cta ? el("div", { class: "sf-ecta" + (v.ctaMuted ? " muted" : ""), text: sfClip(v.cta, 40) }) : null,
      ]),
      v.footer ? el("div", { class: "sf-efoot" + (v.footerMuted ? " muted" : ""), text: fitS(v.footer, 180) }) : null,
    ]);
  }

  // emailPreview: a phone-framed marketing email. Renders the personalized view
  // as the final static state, with the audience toggle-bar shown (generic tab
  // present but inactive — no toggling, per the static-snapshot directive).
  // (thursday-spotlight)
  function sfPanelEmailPreview(cfg) {
    cfg = cfg || {};
    var em = cfg.email || {};
    var view = em.personalized || em.generic;

    // Fallback for the legacy block-list shape (older configs).
    var legacy = null;
    if (!view && sfArr(em.blocks).length) {
      legacy = el("div", { class: "sf-ebody" }, sfArr(em.blocks, 5).map(function (b) {
        if (b.type === "image") return el("div", { class: "sf-ebanner" }, [el("span", { class: "sf-ebanner-text", text: sfClip(b.alt || "Image", 40) })]);
        if (b.type === "button") return el("div", { class: "sf-ecta", text: sfClip(b.text || "Learn more", 30) });
        if (b.type === "heading") return el("div", { class: "sf-eintro", html: "<strong>" + escapeHtml(fitS(b.text, 90)) + "</strong>" });
        return el("div", { class: "sf-eintro", text: fitS(b.text, 300) });
      }));
    }

    var tabs = sfArr(em.tabs, 2);
    var toggleBar = tabs.length ? el("div", { class: "sf-etoggle" }, tabs.map(function (t) {
      return el("div", { class: "sf-etab" + (t.active ? " active" : ""), text: sfClip(t.label, 24) });
    })) : null;

    var shell = el("div", { class: "sf-email-shell" }, [
      el("div", { class: "sf-email-head" }, [
        el("div", { class: "sf-email-from", text: sfClip(em.from || (customer.name + " Marketing"), 46) }),
        el("div", { class: "sf-email-subj", text: sfClip(em.subject || "This week's spotlight", 60) }),
        em.toTag ? el("span", { class: "sf-email-to", text: sfClip(em.toTag, 44) }) : null,
      ]),
      toggleBar,
      view ? sfEmailView(view) : legacy,
    ]);

    return el("div", { class: "sf-screen sf-screen-email" }, [
      el("div", { class: "sf-main sf-main-single" }, [
        el("div", { class: "sf-col" }, [shell]),
      ]),
    ]);
  }

  // kpiTable: chrome + subtitle + KPI strip + a scored multi-account table,
  // with an optional Agentforce panel underneath. (prospecting-agent-view)
  function sfPanelKpiTable(cfg) {
    cfg = cfg || {};
    return el("div", { class: "sf-screen" }, [
      sfChrome(cfg.chrome),
      cfg.subtitle ? el("div", { class: "sf-screen-subtitle", text: fitS(cfg.subtitle, 160) }) : null,
      el("div", { class: "sf-main sf-main-single" }, [
        el("div", { class: "sf-col" }, [
          sfKpiStrip(cfg.kpis),
          (cfg.table && (cfg.table.rows || []).length)
            ? sfCard({ icon: "🎯", title: sfClip((cfg.table.title) || "Prioritized accounts", 32) }, [sfAccountTable(cfg.table)])
            : null,
          cfg.aiPanel ? sfAiPanel(cfg.aiPanel) : null,
        ]),
      ]),
    ]);
  }

  // Donut header: { value, caption, segments:[{label, pct, tone}] }. Renders a
  // conic-gradient ring with a center value + a small legend. Semantic tones
  // (good/bad) fixed; "brand" uses the customer brand color.
  function sfDonut(d) {
    if (!d) return null;
    var TONE = { good: "var(--sf-success,#2E844A)", bad: "var(--sf-danger,#BA0517)",
                 warn: "var(--sf-warning,#FE9339)", brand: "var(--sf-brand,#0176D3)" };
    var segs = sfArr(d.segments, 6);
    var acc = 0, stops = [];
    segs.forEach(function (s) {
      var col = TONE[s.tone] || TONE.brand;
      var start = acc, end = acc + sfPct(s.pct);
      stops.push(col + " " + start + "% " + end + "%");
      acc = end;
    });
    if (acc < 100) stops.push("var(--sf-border-soft,#EDEBE9) " + acc + "% 100%");
    var legend = segs.map(function (s) {
      return el("div", { class: "sf-donut-leg" }, [
        el("span", { class: "sf-donut-swatch", style: "background:" + (TONE[s.tone] || TONE.brand) }),
        el("span", { class: "sf-donut-leg-label", text: sfClip(s.label, 26) }),
        el("span", { class: "sf-donut-leg-pct", text: sfPct(s.pct) + "%" }),
      ]);
    });
    return el("div", { class: "sf-donut-row" }, [
      el("div", { class: "sf-donut", style: "background:conic-gradient(" + stops.join(",") + ")" }, [
        el("div", { class: "sf-donut-hole" }, [
          el("div", { class: "sf-donut-value", text: sfClip(String(d.value != null ? d.value : "—"), 8) }),
          d.caption ? el("div", { class: "sf-donut-caption", text: sfClip(d.caption, 18) }) : null,
        ]),
      ]),
      legend.length ? el("div", { class: "sf-donut-legend" }, legend) : null,
    ]);
  }

  // Stage progress bar: { labels:[], segments:[{state:"done|current|future"}] }.
  function sfStageBar(sb) {
    if (!sb || !sfArr(sb.segments).length) return null;
    var labels = sfArr(sb.labels, 8);
    var segs = sfArr(sb.segments, 8).map(function (s, i) {
      var st = (s.state === "done" || s.state === "current") ? s.state : "future";
      return el("div", { class: "sf-stage-seg " + st }, [
        el("div", { class: "sf-stage-bar" }),
        labels[i] ? el("div", { class: "sf-stage-label", text: sfClip(labels[i], 16) }) : null,
      ]);
    });
    return el("div", { class: "sf-stagebar" }, segs);
  }

  // Transcript with speaker roles + inline highlight spans (objection/action).
  // t = { title, badge, meta, turns:[{who, roleColor:"rep|customer", body, time, highlights:[{text,tone}]}] }
  function sfTranscript(t) {
    if (!t || !sfArr(t.turns).length) return null;
    var turns = sfArr(t.turns, 10).map(function (tn) {
      var body = fitS(tn.body, 260);
      // Wrap any highlight phrases present in the (clipped) body with a tone span.
      sfArr(tn.highlights, 4).forEach(function (h) {
        if (h.text && body.indexOf(h.text) >= 0) {
          body = body.split(h.text).join('<span class="sf-hl sf-hl-' + (h.tone === "action" ? "action" : "objection") + '">' + escapeHtml(h.text) + "</span>");
        }
      });
      return el("div", { class: "sf-tr-turn " + (tn.roleColor === "customer" ? "customer" : "rep") }, [
        el("div", { class: "sf-tr-meta" }, [
          el("span", { class: "sf-tr-who", text: sfClip(tn.who, 24) }),
          tn.time ? el("span", { class: "sf-time", text: sfClip(tn.time, 14) }) : null,
        ]),
        el("div", { class: "sf-tr-body", html: body }),
      ]);
    });
    return sfCard(
      { icon: "🎙", title: sfClip(t.title || "Transcript", 32), sub: t.meta ? sfClip(t.meta, 40) : "", badge: t.badge },
      turns
    );
  }

  // Named narrative sections: [{heading, body}] — research output, briefs.
  function sfSections(rows) {
    rows = sfArr(rows, 6);
    if (!rows.length) return null;
    return el("div", { class: "sf-sections" }, rows.map(function (r) {
      return el("div", { class: "sf-section" }, [
        el("div", { class: "sf-section-head", text: sfClip(r.heading, 40) }),
        el("div", { class: "sf-section-body", text: fitS(r.body, 300) }),
      ]);
    }));
  }

  // Signed sentiment bar: { value(-1..1), label, meta, insight, marker(0-100) }.
  // Track is a fixed red→amber→green gradient (semantic); a marker sits at `marker`%.
  function sfSentimentBar(s) {
    if (!s) return null;
    var mk = sfPct(s.marker != null ? s.marker : 50);
    return el("div", { class: "sf-sent" }, [
      el("div", { class: "sf-sent-top" }, [
        el("span", { class: "sf-sent-value", text: sfClip(String(s.value != null ? s.value : ""), 8) }),
        el("span", { class: "sf-sent-label", text: sfClip(s.label || "Sentiment", 24) }),
        s.meta ? el("span", { class: "sf-sent-meta", text: sfClip(s.meta, 34) }) : null,
      ]),
      el("div", { class: "sf-sent-track" }, [
        el("div", { class: "sf-sent-marker", style: "left:" + mk + "%" }),
      ]),
      s.insight ? el("div", { class: "sf-score-insight", text: fitS(s.insight, 260) }) : null,
    ]);
  }

  // Badge/tag row: [{tone, text}] (≤6) — multi-status header chips.
  function sfBadgeRow(rows) {
    rows = sfArr(rows, 6);
    if (!rows.length) return null;
    return el("div", { class: "sf-badge-row" }, rows.map(function (b) {
      return el("span", { class: "sf-pill sf-pill-" + (b.tone || "neutral"), text: sfClip(b.text, 22) });
    }));
  }

  // CTA button rows: [{text, primary?}] (≤4).
  function sfCtaRow(rows) {
    rows = sfArr(rows, 4);
    if (!rows.length) return null;
    return el("div", { class: "sf-cta-row" }, rows.map(function (c) {
      return el("button", { class: "sf-cta" + (c.primary ? " primary" : ""), text: sfClip(c.text, 26) });
    }));
  }

  // Related cases / list-with-status: reuses sfList shape but titled card is caller's job.
  // Coverage/scale math rows: { title, rows:[{label,value,badge}], footer }.
  function sfCoverage(c) {
    if (!c || !sfArr(c.rows).length) return null;
    var rows = sfArr(c.rows, 4).map(function (r) {
      return el("div", { class: "sf-cov-row" }, [
        el("span", { class: "sf-cov-label", text: sfClip(r.label, 32) }),
        el("span", { class: "sf-cov-value", text: sfClip(String(r.value), 16) }),
        r.badge ? el("span", { class: "sf-pill sf-pill-" + (r.badge.tone || "neutral"), text: sfClip(r.badge.text, 16) }) : null,
      ]);
    });
    var kids = rows.slice();
    if (c.footer) kids.push(el("div", { class: "sf-cov-foot", text: fitS(c.footer, 140) }));
    return el("div", { class: "sf-cov" }, kids);
  }

  // Territory map: illustrative pins on a gradient panel. m = { label, legend:[{tone,text}],
  // pins:[{tone:"hot|warm|cool", top, left, label?, selected?}] }. Positions are percentages.
  // Pin colors are semantic (hot=danger red, warm=amber, cool=neutral) — never brand-recolored.
  function sfMap(m) {
    if (!m) return null;
    var pins = [];
    sfArr(m.pins, 16).forEach(function (p) {
      var top = sfPct(p.top), left = sfPct(p.left);
      var cls = "sf-pin sf-pin-" + (p.tone === "hot" ? "hot" : (p.tone === "warm" ? "warm" : "cool")) + (p.selected ? " sf-pin-selected" : "");
      pins.push(el("div", { class: cls, style: "top:" + top + "%;left:" + left + "%" }));
      if (p.label) pins.push(el("div", { class: "sf-pin-label", style: "top:" + top + "%;left:" + left + "%", text: sfClip(p.label, 28) }));
    });
    var legend = sfArr(m.legend, 4).map(function (l) {
      return el("span", { class: "sf-map-leg" }, [
        el("span", { class: "sf-map-dot sf-pin-" + (l.tone === "hot" ? "hot" : (l.tone === "warm" ? "warm" : "cool")) }),
        el("span", { text: sfClip(l.text, 24) }),
      ]);
    });
    return el("div", { class: "sf-map" }, [
      el("div", { class: "sf-map-label", text: sfClip(m.label, 60) }),
    ].concat(pins).concat([legend.length ? el("div", { class: "sf-map-legend" }, legend) : null]));
  }

  // Attribution funnel: [{label, value, sub}] stages rendered left→right with arrows.
  function sfFunnel(stages) {
    stages = sfArr(stages, 5);
    if (!stages.length) return null;
    var kids = [];
    stages.forEach(function (s, i) {
      if (i) kids.push(el("div", { class: "sf-funnel-arrow", text: "→" }));
      kids.push(el("div", { class: "sf-funnel-stage" }, [
        el("div", { class: "sf-funnel-stage-label", text: sfClip(s.label, 22) }),
        el("div", { class: "sf-funnel-stage-value", text: sfClip(String(s.value != null ? s.value : "—"), 12) }),
        s.sub ? el("div", { class: "sf-funnel-stage-sub", text: sfClip(s.sub, 42) }) : null,
      ]));
    });
    return el("div", { class: "sf-funnel" }, kids);
  }

  // Pre-call brief hero: gradient card with eyebrow, name, sub, and a signal grid.
  // b = { eyebrow, name, sub, signals:[{k,v}] (≤3) }.
  function sfBriefHero(b) {
    if (!b) return null;
    var sig = sfArr(b.signals, 3).map(function (s) {
      return el("div", { class: "sf-brief-signal" }, [
        el("div", { class: "sf-brief-signal-k", text: sfClip(s.k, 18) }),
        el("div", { class: "sf-brief-signal-v", text: sfClip(String(s.v), 12) }),
      ]);
    });
    return el("div", { class: "sf-brief-hero" }, [
      el("div", { class: "sf-brief-eyebrow", text: sfClip(b.eyebrow, 34) }),
      el("div", { class: "sf-brief-name", text: sfClip(b.name, 40) }),
      b.sub ? el("div", { class: "sf-brief-sub", text: sfClip(b.sub, 70) }) : null,
      sig.length ? el("div", { class: "sf-brief-signals" }, sig) : null,
    ]);
  }

  // Dispatch a panel config to the right family builder. Returns the screen DOM.
  function sfBuildFamily(family, cfg) {
    switch (family) {
      case "kpiTable":                   return sfPanelKpiTable(cfg);
      case "recordWithScoreAndTimeline": return sfPanelScoreTimeline(cfg);
      case "recordWithAiPanel":          return sfPanelRecordAi(cfg);
      case "assistantChat":              return sfPanelAssistantChat(cfg);
      case "metricsAndTable":            return sfPanelMetricsTable(cfg);
      case "serviceCase":                return sfPanelServiceCase(cfg);
      case "voiceConsole":               return sfPanelVoiceConsole(cfg);
      case "campaignBuilder":            return sfPanelCampaignBuilder(cfg);
      case "emailPreview":               return sfPanelEmailPreview(cfg);
      default:
        // Unknown/not-yet-built family → a minimal shell so the slide never blanks.
        return el("div", { class: "sf-screen" }, [
          sfChrome(cfg && cfg.chrome),
          sfHeader(cfg && cfg.header),
          el("div", { class: "sf-main" }, [
            el("div", { class: "sf-col" }, [sfCard({ icon: "✦", title: sfClip((cfg && cfg.title) || family || "Screen", 40) }, [
              el("div", { class: "sf-detail", html: "" }),
            ])]),
          ]),
        ]);
    }
  }

  // Numbered steps rail (left panel of a steps+screen composition).
  // steps = [{n, body, payoff?}] — number circle colors cycle brand→navy.
  function stepsRail(steps) {
    var STEP_COLORS = [BLUE, "#5D2E8C", "#2E7A50", "#FF7043", BLUE];
    var items = sfArr(steps, 5).map(function (st, i) {
      var isPayoff = !!st.payoff || (i === (Math.min(steps.length, 5) - 1) && steps.length >= 4);
      return el("li", { class: "sf-step" + (isPayoff ? " sf-step-payoff" : "") }, [
        el("div", { class: "sf-step-num", style: "background:" + (STEP_COLORS[i] || BLUE), text: String(st.n || (i + 1)) }),
        el("div", { class: "sf-step-body", html: escapeHtml(fitS(st.body || st.text || "", 240)) }),
      ]);
    });
    return el("ol", { class: "sf-steps" }, items);
  }

  // Wrap a console screen node in a mobile phone frame. Named distinctly
  // from the deck's own phoneFrame() (below, ~1660) — that one is
  // redeclared later in this IIFE and would otherwise shadow this via
  // function hoisting, silently swapping the .sf-phone shell for the
  // generic .dd-left device frame.
  function sfPhoneFrame(node) {
    return el("div", { style: "display:flex; justify-content:center; align-items:flex-start;" }, [
      el("div", { class: "sf-phone" }, [
        el("div", { class: "sf-phone-notch" }),
        el("div", { class: "sf-phone-screen" }, [node]),
        el("div", { class: "sf-phone-bar" }),
      ]),
    ]);
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
      // SE overrides (chapter-opener editor fields) win verbatim so the /demo
      // opener matches what the SE edited in the builder preview; else the
      // slide's own copy; else the auto-woven defaults.
      const ovE = (f.chapterOpenerEyebrow  && String(f.chapterOpenerEyebrow).trim())  || "";
      const ovH = (f.chapterOpenerHeadline && String(f.chapterOpenerHeadline).trim()) || "";
      const ovS = (f.chapterOpenerSub      && String(f.chapterOpenerSub).trim())      || "";
      const opener = ovH || ((s && s.title) ? s.title : defaultOpenerHeadline());
      const sub    = ovS || ((s && (s.sub || s.speakerNotes)) || defaultOpenerSub());
      const eyebrow = ovE || ((s && (s.eyebrow || s.section)) ||
        (customer.demoTitle ? customer.demoTitle : "Customer Demo"));
      const cap = el("div", { class: "dd-opener" }, [
        el("div", { class: "dd-opener-particles" }, openerParticles()),
        el("p", { class: "dd-opener-eyebrow", text: eyebrow }),
        el("h1", { class: "dd-opener-headline", html: opener }),
        el("p", { class: "dd-opener-sub",      html: sub }),
      ]);
      return [cap];
    },

    // ─── Screen Flow (paired console composition) ───────────────
    // Renders a generated Salesforce console screen IN-DOM inside a
    // paired composition. `s.panels[]` drives the columns:
    //   [{kind:"steps", steps}, {kind:"screen", family, config}]  → steps + screen
    //   [{kind:"screen"…}, {kind:"screen"…, frame:"phone"}]        → two screens
    // Falls back to a single-column screen when only one panel.
    screenFlow: function (s) {
      var panels = Array.isArray(s.panels) ? s.panels.slice(0, 2) : [];
      // Legacy/degenerate config with no panels: synthesize steps+screen from
      // the slide's own screenId/config so it never blanks.
      if (!panels.length) {
        panels = [
          { kind: "steps", steps: s.steps || [] },
          { kind: "screen", family: s.family, config: s.config || {} },
        ];
      }
      // Choose the grid shape from the panel kinds/frames.
      var kinds = panels.map(function (p) { return p.kind === "steps" ? "steps" : (p.frame === "phone" ? "phone" : "screen"); });
      var hasPhone = kinds.indexOf("phone") !== -1;
      var colClass = "sf-cols-single";
      if (panels.length === 2) {
        if (kinds[0] === "steps") colClass = hasPhone ? "sf-cols-steps-phone" : "sf-cols-steps-screen";
        else if (hasPhone) colClass = "sf-cols-screen-phone";
        else colClass = "sf-cols-screen-screen";
      }
      var cols = panels.map(function (p) {
        if (p.kind === "steps") return stepsRail(p.steps || s.steps || []);
        var node = sfBuildFamily(p.family, p.config || {});
        return p.frame === "phone" ? sfPhoneFrame(node) : el("div", { class: "sf-screen-wrap" }, [node]);
      });
      var out = [];
      var eyebrow = ebrow(s.eyebrow || deriveEyebrow(s));
      if (eyebrow) out.push(el("p", { class: "sf-flow-eyebrow", text: eyebrow }));
      out.push(el("h2", { class: "sf-flow-headline", html: ttl(s.title || deriveHeadline(s), "Autonomous outreach.") }));
      // Solo (component-only) layout: no steps rail, so the narrative that would
      // have lived in the rail instead becomes an intro paragraph above the
      // full-width screen. Only shown when there's a single screen panel.
      var isSolo = s.soloScreen || (panels.length === 1 && kinds[0] !== "steps");
      if (isSolo) {
        var body = (typeof s.flowBody === "string" && s.flowBody.trim())
          ? s.flowBody
          : (s.sub || deriveSub(s) || "");
        if (body) out.push(el("p", { class: "sf-flow-body", html: fitS(body, 320) }));
        colClass = "sf-cols-single";
      }
      out.push(el("div", { class: "sf-flow-grid " + colClass }, cols));
      return out;
    },

    // ─── Screen Act Opener (animated scene opener) ──────────────
    // Ported from the coworker deck's "The call that runs itself."
    // Renders from s.openerConfig {eyebrow, headline, body, scene}.
    // A pure-CSS animated frustrated-caller illustration (inline SVG
    // silhouette + two pulsing rings + a bouncing emoji) sits above the
    // sub-paragraph and a red-accent SCENE card. No assets.
    screenActOpener: function (s) {
      var cfg = s.openerConfig || {};
      var scene = cfg.scene || {};
      var rows = sfArr(scene.rows, 4).map(function (r) {
        return el("div", { html: "<strong>" + escapeHtml(sfClip(r.k, 18)) + ":</strong> " + escapeHtml(fitS(r.v, 160)) });
      });
      // Neutral caller silhouette (head + shoulders) — brand-neutral per plan;
      // only the pulsing rings pull the red accent.
      var callerSvg = el("div", { class: "sf-caller-svg", html:
        '<svg viewBox="0 0 64 64" fill="currentColor" xmlns="http://www.w3.org/2000/svg" width="96" height="96">' +
        '<circle cx="32" cy="20" r="12"/>' +
        '<path d="M8 60c0-13 11-22 24-22s24 9 24 22z"/>' +
        '</svg>' });
      var caller = el("div", { class: "sf-opener-caller" }, [
        el("span", { class: "sf-ring" }),
        el("span", { class: "sf-ring" }),
        callerSvg,
        el("span", { class: "sf-frust-emoji", text: cfg.emoji || "😤" }),
      ]);
      return [
        el("div", { class: "sf-opener" }, [
          el("p", { class: "sf-flow-eyebrow", text: ebrow(cfg.eyebrow || deriveEyebrow(s)) }),
          el("h2", { class: "sf-flow-headline", html: ttl(cfg.headline || s.title, "The call that runs itself.") }),
          caller,
          cfg.body ? el("p", { class: "sf-opener-body", html: fitS(cfg.body, 220) }) : null,
          rows.length ? el("div", { class: "sf-opener-scene" }, [
            el("div", { class: "sf-opener-scene-label", text: sfClip(scene.label || "SCENE", 40) }),
          ].concat(rows)) : null,
        ]),
      ];
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
      if (f.businessProblem)    stats.push({ val: "Problem",  label: shortOr(f.businessProblemShort,   f.businessProblem,   46) });
      if (f.currentStatePain)   stats.push({ val: "Today",    label: shortOr(f.currentStatePainShort,  f.currentStatePain,  46) });
      if (f.futureStateVision)  stats.push({ val: "Tomorrow", label: shortOr(f.futureStateVisionShort, f.futureStateVision, 46) });
      const headline = f.transformationThesis
        ? ttl(f.transformationThesis)
        : (ttl(s.title) || "From a single moment to a connected future.");
      return twoPanel({
        left: leftQuote({
          tag:   "Strategic foundation",
          quote: f.executiveTakeaway ? fitS(f.executiveTakeaway, 160) : (f.futureStateVision ? fitS(f.futureStateVision, 160) : "Connect every channel into one continuous customer relationship."),
          stamp: customer.name ? customer.name + " · " + (customer.industry || "") : "",
        }),
        right: rightCopy({
          eyebrow:  "Story Foundation",
          headline: headline,
          sub:      f.businessProblem ? fitS(f.businessProblem, 220) : "Add foundation details in Step 3 of the Builder to fill this slide.",
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
            el("div", { class: "dd-twostate-text", text: f.currentStatePain ? fitS(f.currentStatePain, 180) : "Disconnected channels, anonymous browsers, lost revenue." }),
          ]),
          el("div", { class: "dd-twostate-arrow", text: "↓" }),
          el("div", { class: "dd-twostate-card dd-twostate-future" }, [
            el("div", { class: "dd-twostate-tag", text: "Tomorrow" }),
            el("div", { class: "dd-twostate-text", text: f.futureStateVision ? fitS(f.futureStateVision, 180) : "One unified profile across every channel." }),
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
      // When the slide carries REAL media — an explicitly assigned still or a
      // live CX iframe — fill the device screen edge-to-edge with just that
      // media (like the Agent Conversation phone), dropping the skeleton
      // eyebrow/heading/rows/CTA chrome. The chrome is only an authoring cue,
      // so keep it ONLY for the empty/fallback state (no still, no iframe) so
      // an unconfigured slide still shows a meaningful skeleton.
      // Priority: a LIVE CX link (Aubrey iframe) ALWAYS wins → then an
      // explicitly assigned still → then the skeleton. The live, click-through
      // component must never be overridden by its static screenshot.
      const hasAssigned = hasStill(assignedStill);
      const hasLiveIframe = !!(cxComp && (SHARED.isEmbeddableUrl
        ? SHARED.isEmbeddableUrl(cxRuntimeUrl(cxComp))
        : /^https?:\/\//.test(cxRuntimeUrl(cxComp) || "")));
      let screenInner;
      if (hasLiveIframe) {
        screenInner = renderCxIframe(cxComp);
      } else if (hasAssigned) {
        // If the assigned still IS the Instagram ad, route it through the same
        // adFill path embeddedCxComponent uses (identity check, mirrors L888) so
        // both slide types size the ad identically: .is-ad-fill fills the 9:19
        // screen with `contain` — never a divergent per-path crop. A non-ad
        // still keeps fill:true (.is-fill cover).
        const isAd = assignedStill === demoAssets.cxInstagramAd;
        screenInner = mediaTile({
          src: assignedStill, kind: "image", fill: true, adFill: isAd,
          alt: act.demoMoment || act.title || "Demo moment",
        });
      } else {
        // Empty/fallback: full skeleton chrome + cue so the SE knows what to add.
        screenInner = el("div", { class: "dd-screen" }, [
          el("div", { class: "dd-screen-eyebrow", text: act.channel || "Salesforce" }),
          el("div", { class: "dd-screen-h", text: (function () {
            // SHORT screen heading — prefer the brief act title; never dump the
            // multi-sentence demoMoment script into the tiny phone screen.
            if (act.title)      return SHARED.cleanHeadline ? SHARED.cleanHeadline(act.title, 42) : act.title;
            const dm = act.demoMomentShort || act.demoMoment;
            if (dm) return SHARED.oneSentence ? SHARED.oneSentence(dm, 42) : dm;
            return s.title || "Moment";
          })() }),
          // Deterministic empty state: render the neutral skeleton cue, NOT a
          // borrowed global CX still. An ad/screenshot appears in the phone ONLY
          // when explicitly assigned to THIS slide (the hasAssigned branch above)
          // or via a linked CX iframe — never because some other deck asset
          // (e.g. demoAssets.cxInstagramAd) happens to exist.
          mediaTile({
            src: "",
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
          el("div", { class: "dd-screen-cta", text: act.businessValue ? truncate(act.businessValueShort || act.businessValue, 28).toUpperCase() : "TAKE ACTION" }),
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
      // Sub-lines must read as a COMPLETE thought with NO trailing "…".
      // fitSentences packs whole sentences up to the char budget (150) and ends
      // on real punctuation with NO "…": a one-sentence summary fits whole; a
      // long run-on is trimmed to its last clause boundary + period. The row's
      // CSS 2-line clamp bounds any residual length visually.
      const tSub = function (v, max, fb) {
        return fitS(v, max || 150) || fb;
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
        const src = (a && a.summaryShort) || (a && a.summary) || (a && a.demoMoment) || "";
        const one = SHARED && SHARED.oneSentence ? SHARED.oneSentence(src, 46) : truncate(src, 46);
        return one || "";
      };
      const rows = [
        { eyebrow:"When",              icon:"🗓️",
          title: act.timing || act.month || "Opening",
          sub:   act.location || tSub(act.summary, 150, "The opening moment") },
        { eyebrow:"The moment",        icon: ic(act.channel),
          // Contextual precedence: a real (non-mechanical) act title first, then
          // the opening clause of the narrative summary, then demoMoment. The
          // raw scene label is no longer a title source. Sub carries the fuller
          // narrative so title + sub don't echo the same clause.
          title: tTitle(goodTitle(act) || narrativeTitle(act), 46, "The key moment"),
          sub:   tSub(act.demoMoment || act.summary, 150, "Where the story begins") },
        hasNext
          ? { eyebrow:"What happens next", icon: ic(sceneNext.channel || act.channel),
              title: tTitle(goodTitle(sceneNext) || narrativeTitle(sceneNext) || act.salesforceCapabilities, 46, "What happens next"),
              sub:   tSub(sceneNext.demoMoment || sceneNext.summary, 150, "The story continues") }
          : { eyebrow:"Where it leads",    icon: ic(act.channel),
              title: tTitle(act.salesforceCapabilities || act.businessValue, 42, "Where it leads"),
              sub:   tSub(act.businessValue || f.executiveTakeaway, 150, "The story continues") },
        { eyebrow:"Why it matters",    icon:"🎯",
          title: tTitle(act.businessValue || f.executiveTakeaway, 42, "Why it matters"),
          sub:   tSub(f.businessProblem || f.executiveTakeaway, 150, "The outcome that counts") },
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
      const nonAppCx = cxList.filter(function (x) { return x && !x._builtAppComponent; });
      const c = linked[0] || nonAppCx[0] || null;
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
      // Priority: a LIVE CX link (Aubrey iframe) ALWAYS wins → then a
      // generated/uploaded still → then the skeleton. A live, click-through
      // component must never be replaced by its static screenshot.
      const inner = (c && (SHARED.isEmbeddableUrl
        ? SHARED.isEmbeddableUrl(cxRuntimeUrl(c))
        : /^https?:\/\//.test(cxRuntimeUrl(c) || "")))
        ? renderCxIframe(c)
        : hasStill(still)
        ? mediaTile({ src: still, kind: "image", fill: isInstagramAd, adFill: isInstagramAd, alt: (c && c.name) || "CX component" })
        : el("div", { class: "dd-skel dd-skel-screen" }, [
            skeletonShimmer(),
            el("div", { class: "dd-skel-screen-msg",
              text: c ? "Add a URL for this component in Step 5" : "Link a CX component in Step 5" }),
          ]);
      // Live CX components DEFAULT to the mobile/phone frame. Only render the
      // laptop frame when the component EXPLICITLY opts into a desktop/tablet
      // deviceFrame — an unset deviceFrame (or a type-only older config) stays
      // mobile rather than inferring desktop from a "web"/"commerce" type.
      const useLaptop = c && /desktop|tablet/i.test(c.deviceFrame || "");
      return twoPanel({
        left:  useLaptop ? laptopFrame(inner) : phoneFrame(inner),
        right: rightCopy({
          eyebrow:  ebrow(c && c.type ? ("Live · " + c.type) : "Live CX moment"),
          headlineHtml: s.title ? escapeHtml(ttl(s.title)) : (c && c.name ? escapeHtml(ttl(c.name)) : "Embedded demo screen"),
          // Per-slide description (Step 8 editor) wins → linked component's
          // description → the shared default live-demo line.
          sub:      (s && s.cxDescription) ? s.cxDescription
                    : (c && c.description) ? c.description
                    : "A live, click-through Aubrey demo screen embedded right inside the deck.",
          chips:    capsList(s).map(function (cap) { return { type:"blue", label:cap }; }),
        }),
      });
    },

    // ─── App Console Iframe ────────────────────────────────────
    // Full-width console stage: top copy + one large iframe body.
    appConsoleIframe: function (s) {
      function inferAppId(slideLike) {
        const sid = String(slideLike && slideLike.id || "").toLowerCase();
        const ttl = String(slideLike && slideLike.title || "").toLowerCase();
        if (/cimulate|simulate/.test(sid) || /cimulate|simulate/.test(ttl)) return "cimulate";
        if (/clienteling|concierge/.test(sid) || /clienteling|concierge/.test(ttl)) return "clienteling";
        return "";
      }
      const cxIds = s.linkedCxComponentIds || [];
      const linked = cxIds.map(cxById).filter(Boolean);
      const appId = s.appId || inferAppId(s);
      const appMatch = (appId && cxList.find(function (c) {
        return c && c._builtAppComponent && c._builtAppId === appId;
      })) || null;
      const c = appId ? appMatch : (appMatch || linked[0] || cxList[0] || null);
      const hasLive = !!(c && (SHARED.isEmbeddableUrl
        ? SHARED.isEmbeddableUrl(cxRuntimeUrl(c))
        : /^https?:\/\//.test(cxRuntimeUrl(c) || "")));
      const stage = hasLive
        ? renderCxIframe(c)
        : el("div", { class: "dd-skel dd-skel-screen" }, [
            skeletonShimmer(),
            el("div", { class: "dd-skel-screen-msg",
              text: c ? "App URL unavailable. Rebuild the app in Step 4." : "Build and link an app in Step 4/7." }),
          ]);
      return [
        el("div", { class: "dd-app-console" }, [
          el("div", { class: "dd-app-console-copy" }, [
            el("p", { class: "dd-eyebrow", text: ebrow(s.eyebrow || "Live app console") }),
            el("h2", { class: "dd-display dd-display-mid",
              html: s.title ? escapeHtml(ttl(s.title)) : (c && c.name ? escapeHtml(ttl(c.name)) : "App console moment") }),
            (s.cxDescription || s.speakerNotes)
              ? el("p", { class: "dd-sub", text: s.cxDescription || s.speakerNotes })
              : null,
          ]),
          el("div", { class: "dd-app-console-stage" }, [stage]),
        ]),
      ];
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
          quote: f.executiveTakeaway ? fitS(f.executiveTakeaway, 160) : ("A single Salesforce platform compounds every customer touch into measurable lift" + (customer.name ? " for " + customer.name + "." : ".")),
          stamp: customer.name ? customer.name + " + Salesforce" : "Salesforce",
        }),
        right: el("div", { class: "dd-right" }, [
          el("p", { class: "dd-eyebrow", text: "The Takeaway" }),
          el("h2", { class: "dd-display dd-display-mid", html: ttl(s.title) || "Three things that <em>compound.</em>" }),
          el("div", { class: "dd-exec-cols" }, [
            execCol("Challenge",    f.businessProblem ? fitS(f.businessProblem, 180) : (f.currentStatePain ? fitS(f.currentStatePain, 180) : "Add a customer challenge in Step 3.")),
            execCol("Future state", f.futureStateVision ? fitS(f.futureStateVision, 180) : "Add the future-state vision in Step 3."),
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
    const rowStyle = "grid-template-columns:repeat(" + n + ",minmax(0,1fr));grid-auto-flow:column;grid-auto-columns:minmax(0,1fr);";
    const nodes = milestones.map(function (m, i) {
      // single → all above; alternating → even index above, odd below.
      return timelineNode(m, single ? "above" : (i % 2 === 0 ? "above" : "below"));
    });
    return el("div", {
      class: "dd-jt dd-jt-cols" + (single ? " dd-jt-single" : " dd-jt-alt") + " dd-jt-n" + n,
      style: wrapStyle,
    }, [
      // The connector line lives INSIDE the row (its positioning context) so its
      // top:50% resolves against the fixed-height nodes — the true dot-band center
      // — instead of the wrapper's asymmetrically-padded box. This lands every dot
      // (hero and non-hero) exactly on the line.
      el("div", { class: "dd-jt-row", style: rowStyle }, [el("div", { class: "dd-jt-track" })].concat(nodes)),
    ]);
  }

  // Public hook for the journey-map section (buildMap() in the deck HTML):
  // when the SE authored timeline events, swap the circle/flow map for the
  // horizontal timeline so the exported deck matches the builder preview.
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

  function cxRuntimeUrl(c) {
    if (!c) return "";
    if (c._builtAppComponent && c._builtAppId) {
      // Keep this relative so it works both on localhost and file:// exports.
      return "../apps/" + c._builtAppId + "/index.html";
    }
    return c.url || "";
  }

  function renderCxIframe(c) {
    const src = cxRuntimeUrl(c);
    const trusted = /aubreydemo\.com/i.test(src)
      || !!(c && c._builtAppComponent)
      || /^(\/|\.\/|\.\.\/)/.test(String(src || ""));
    const wrap = el("div", { class: "dd-cx-iframe-wrap" });
    const iframe = document.createElement("iframe");
    iframe.src = src;
    iframe.setAttribute("sandbox", trusted
      ? "allow-scripts allow-same-origin allow-forms allow-popups"
      : "allow-scripts allow-forms allow-popups");
    iframe.setAttribute("loading", "lazy");
    iframe.setAttribute("referrerpolicy", "no-referrer");
    iframe.setAttribute("title", c.name || "CX component");
    // Deck keyboard nav (HOLO_NAV) listens on the PARENT document. Once the
    // user clicks into an app iframe, focus is trapped inside it and ←/→ never
    // reach the parent — noticeable in the simple deck, which opens directly on
    // an interactive experience. For same-origin (trusted) iframes, forward the
    // arrow keys back up so slide navigation keeps working. Skip when the app's
    // own focus is on a text field so in-app typing isn't hijacked.
    if (trusted) {
      iframe.addEventListener("load", function () {
        var doc;
        try { doc = iframe.contentDocument; } catch (e) { return; } // cross-origin
        if (!doc) return;
        doc.addEventListener("keydown", function (ev) {
          if (ev.key !== "ArrowLeft" && ev.key !== "ArrowRight") return;
          var t = ev.target;
          var tag = (t && t.tagName) ? t.tagName.toLowerCase() : "";
          if (tag === "input" || tag === "textarea" || (t && t.isContentEditable)) return;
          try {
            document.dispatchEvent(new KeyboardEvent("keydown", { key: ev.key, bubbles: true }));
          } catch (e) { /* older engines — ignore */ }
        });
      });
    }
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
    // Industry-neutral frame: "With <Customer>." works for any business
    // (was "A <Customer> store." — retail-only). No-customer fallback keeps
    // the original "A this story." shape.
    const place = customer.name ? "With " + escapeHtml(customer.name) : "A new story";
    return "<strong>" + escapeHtml(when) + ".</strong> " + place + ". <strong>" + escapeHtml(who) + "'s</strong> story begins.";
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
    // Prefer the shared clean-trim (period, no "…"); local fallback matches it.
    if (SHARED && SHARED.truncate) return SHARED.truncate(s, max);
    s = String(s || "").replace(/\s+/g, " ").trim();
    if (s.length <= max) return s;
    var out = s.slice(0, max).replace(/\s+\S*$/, "")
      .replace(/[\s,;:–—-]+$/, "").replace(/\s+(?:and|or|but|the|of|to|for|with|from|a|an|in|on|at|by)$/i, "");
    if (out && !/[.!?]$/.test(out)) out += ".";
    return out;
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
  // Auto-mount only runs on the /demo deck page (which has #demo-wrap). On the
  // builder page there's no #demo-wrap; renderScreenFlow was already registered
  // above and everything it needs (RENDERERS + atoms) is now defined, so we
  // simply skip the mount instead of early-returning before those definitions.
  if (!wrap) return;

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
