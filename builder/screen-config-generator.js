// ════════════════════════════════════════════════════════════════
//  SCREEN CONFIG GENERATOR
//  Normalizes a per-screen "foundation" (either a Gemini JSON answer
//  or the deterministic fallback) into the SHARED screenConfig shape
//  the demo renderer's sfPanel* builders consume. One buildScreenConfig
//  entry, switched on `family`. Mirrors app-config-generator.js.
//
//  The renderer already length-caps and copy-fits every field, so this
//  layer's job is purely structural: coerce a loose foundation object
//  into a stable { screenId, family, chrome, header, … } config, with
//  family-appropriate defaults so a partial/failed answer still renders.
// ════════════════════════════════════════════════════════════════

(function (global) {
  "use strict";

  function str(v, fb) { return (v == null ? "" : String(v)) || (fb || ""); }
  function num(v, fb) { var n = Number(v); return isFinite(n) ? n : (fb == null ? 0 : fb); }
  function arr(v) { return Array.isArray(v) ? v : []; }

  // Chrome is derived from brand/customer, not from the model — keeps the
  // console shell consistent and on-brand across every family.
  function chromeFrom(found, brand) {
    var name = str(brand && brand.name, "Salesforce");
    var f = found || {};
    return {
      logo: str(f.orgName, name),
      tabs: arr(f.tabs).length ? arr(f.tabs) : ["Home", str(f.recordName || (f.header && f.header.name), "Record"), name],
      activeTab: 1,
    };
  }

  function headerFrom(found) {
    var h = (found && found.header) || {};
    return {
      recordType: str(h.recordType, "Record"),
      name: str(h.name, found && found.recordName ? found.recordName : "Record"),
      fields: arr(h.fields).slice(0, 4).map(function (x) {
        return { label: str(x.label), value: str(x.value), link: !!x.link };
      }),
      followLabel: str(h.followLabel, "+ Follow"),
    };
  }

  // ── recordWithScoreAndTimeline (sdr-agent-lead, prospecting-agent-view) ──
  function buildScoreTimeline(found, brand) {
    var f = found || {};
    var sc = f.score || {};
    var criteria = arr(sc.criteria).slice(0, 5).map(function (c) {
      return {
        icon: str(c.icon, "•"),
        name: str(c.name),
        sub: str(c.sub),
        pct: num(c.pct, 60),
        score: str(c.score),
      };
    });
    var tl = f.timeline || {};
    var items = arr(tl.items).slice(0, 5).map(function (it) {
      return {
        title: str(it.title),
        sub: str(it.sub),
        from: str(it.from),
        time: str(it.time),
        status: str(it.status),
        statusTone: it.statusTone === "pending" ? "pending" : "viewed",
        body: str(it.body),
      };
    });
    return {
      screenId: str(f.screenId),
      family: "recordWithScoreAndTimeline",
      chrome: chromeFrom(f, brand),
      header: headerFrom(f),
      progress: f.progress ? {
        steps: num(f.progress.steps, 4),
        total: num(f.progress.total, 4),
        label: str(f.progress.label, "Qualified"),
        action: str(f.progress.action),
      } : { steps: 4, total: 4, label: "Qualified" },
      aiHead: {
        icon: "✦",
        title: str(sc.cardTitle, "AI Opportunity Score"),
        sub: str(sc.cardSub, "Einstein scoring model"),
        badge: str(sc.badge, "HIGH INTENT"),
      },
      score: {
        value: num(sc.value, 87),
        of: num(sc.of, 100),
        label: str(sc.label, "High Intent"),
        meta: str(sc.meta, criteria.length + " weighted criteria · updated just now"),
        insight: str(sc.insight),
      },
      criteria: criteria,
      identity: f.identity ? {
        title: str(f.identity.title, "Identity"),
        fields: arr(f.identity.fields).slice(0, 6).map(function (x) {
          return { label: str(x.label), value: str(x.value) };
        }),
      } : null,
      timeline: {
        title: str(tl.title, "Activity"),
        month: str(tl.month),
        items: items,
      },
    };
  }

  // Shared sub-normalizers reused across the Phase-2 families.
  function aiPanelFrom(x) {
    x = x || {};
    return {
      title: str(x.title, "Einstein Insight"),
      badge: str(x.badge),
      body: str(x.body),
      sources: arr(x.sources).slice(0, 4).map(function (s) { return str(s); }).filter(Boolean),
    };
  }
  function timelineFrom(tl) {
    tl = tl || {};
    return {
      title: str(tl.title, "Activity"),
      month: str(tl.month),
      items: arr(tl.items).slice(0, 5).map(function (it) {
        return {
          title: str(it.title), sub: str(it.sub), from: str(it.from), time: str(it.time),
          status: str(it.status), statusTone: it.statusTone === "pending" ? "pending" : "viewed", body: str(it.body),
        };
      }),
    };
  }
  function listFrom(rows) {
    return arr(rows).slice(0, 6).map(function (r) {
      var out = { primary: str(r.primary), secondary: str(r.secondary) };
      if (r.value != null) out.value = str(r.value);
      if (r.badge) out.badge = { tone: str(r.badge.tone, "neutral"), text: str(r.badge.text) };
      return out;
    });
  }
  function metricsFrom(ms) {
    return arr(ms).slice(0, 4).map(function (m) {
      return { label: str(m.label), value: str(m.value), sub: str(m.sub), delta: str(m.delta),
               tone: (m.tone === "down" || m.tone === "flat") ? m.tone : "up" };
    });
  }
  function tableFrom(t) {
    t = t || {};
    return {
      title: str(t.title, "Breakdown"),
      columns: arr(t.columns).slice(0, 5).map(function (c) { return str(c); }),
      rows: arr(t.rows).slice(0, 6).map(function (r) { return arr(r).slice(0, 5).map(function (c) { return c; }); }),
      barColumn: (typeof t.barColumn === "number") ? t.barColumn : undefined,
    };
  }
  function chatFrom(turns) {
    return arr(turns).slice(0, 6).map(function (t) {
      return { role: (t.role === "agent" || t.role === "system") ? t.role : "user",
               who: str(t.who), body: str(t.body), time: str(t.time),
               greeting: str(t.greeting),
               // Optional structured reply (assistantChat): sections + a highlight box.
               sections: arr(t.sections).slice(0, 5).map(function (sec) {
                 return { title: str(sec.title), items: arr(sec.items).slice(0, 6).map(function (x) { return str(x); }).filter(Boolean) };
               }),
               highlight: t.highlight ? { title: str(t.highlight.title), body: str(t.highlight.body),
                 sub: str(t.highlight.sub), source: str(t.highlight.source) } : null };
    });
  }

  // ── extra sub-normalizers for the faithful rebuild ────────────
  // (Additive — consumed only by rebuilt families; existing ones unaffected.)
  // Field grid: [{label, value, link?}] — Account Plan / detail cards.
  function fieldsFrom(rows, cap) {
    return arr(rows).slice(0, cap || 8).map(function (r) {
      return { label: str(r.label), value: str(r.value), link: !!r.link };
    });
  }
  // Named narrative sections: [{heading, body}] — Account Research output, briefs.
  function sectionsFrom(rows, cap) {
    return arr(rows).slice(0, cap || 6).map(function (r) {
      return { heading: str(r.heading || r.title), body: str(r.body || r.text) };
    });
  }
  // Transcript with speaker roles + inline highlight spans (ECI, voice console).
  function transcriptFrom(t) {
    t = t || {};
    return {
      title: str(t.title, "Live Transcript"),
      badge: str(t.badge),
      meta: str(t.meta),
      turns: arr(t.turns).slice(0, 10).map(function (tn) {
        return {
          who: str(tn.who),
          roleColor: (tn.roleColor === "customer" || tn.role === "customer") ? "customer" : "rep",
          body: str(tn.body),
          time: str(tn.time),
          highlights: arr(tn.highlights).slice(0, 4).map(function (h) {
            return { text: str(h.text), tone: (h.tone === "action" ? "action" : "objection") };
          }).filter(function (h) { return h.text; }),
        };
      }),
    };
  }
  // Stage progress bar: { segments:[{state:"done|current|future"}] } or a count shortcut.
  function stageBarFrom(sb) {
    if (!sb) return null;
    if (Array.isArray(sb.segments)) {
      return { labels: arr(sb.labels).slice(0, 8).map(function (x) { return str(x); }),
        segments: sb.segments.slice(0, 8).map(function (s) {
          var st = (s && s.state) || (typeof s === "string" ? s : "future");
          return { state: (st === "done" || st === "current") ? st : "future" };
        }) };
    }
    var total = num(sb.total, 5), done = num(sb.done, 0), cur = num(sb.current, done);
    var segs = [];
    for (var i = 0; i < total; i++) segs.push({ state: i < done ? "done" : (i === cur ? "current" : "future") });
    return { labels: arr(sb.labels).slice(0, 8).map(function (x) { return str(x); }), segments: segs };
  }
  // Donut: { value, caption, segments:[{label, pct, tone}] } — account metrics header.
  function donutFrom(d) {
    if (!d) return null;
    return {
      value: str(d.value),
      caption: str(d.caption),
      segments: arr(d.segments).slice(0, 6).map(function (s) {
        return { label: str(s.label), pct: num(s.pct, 0), tone: str(s.tone, "brand") };
      }),
    };
  }
  // CTA button rows: [{text, primary?}] (≤4).
  function ctaFrom(rows) {
    return arr(rows).slice(0, 4).map(function (r) {
      if (typeof r === "string") return { text: str(r), primary: false };
      return { text: str(r.text || r.label), primary: !!r.primary };
    }).filter(function (c) { return c.text; });
  }
  // Tag/badge row: [{tone, text}] (≤6).
  function tagsFrom(rows) {
    return arr(rows).slice(0, 6).map(function (r) {
      if (typeof r === "string") return { tone: "neutral", text: str(r) };
      return { tone: str(r.tone, "neutral"), text: str(r.text) };
    }).filter(function (t) { return t.text; });
  }
  // Signed-sentiment bar block: { value(-1..1), label, meta, insight, marker(0-100) }.
  function sentimentBarFrom(s) {
    if (!s) return null;
    var v = num(s.value, 0);
    return {
      value: v, of: num(s.of, 1),
      label: str(s.label, v < -0.2 ? "Negative" : (v > 0.2 ? "Positive" : "Neutral")),
      meta: str(s.meta), insight: str(s.insight),
      marker: (s.marker != null) ? num(s.marker, 50) : Math.round((v + 1) / 2 * 100),
    };
  }
  // KPI strip: [{value, label, active?}] (≤8) — prospecting header counts.
  function kpiStripFrom(rows) {
    return arr(rows).slice(0, 8).map(function (r) {
      return { value: str(r.value), label: str(r.label), active: !!r.active };
    });
  }
  // Rich account table: { columns:[], rows:[{cells, sub, signal, tags, selected}] }.
  function accountTableFrom(t) {
    t = t || {};
    return {
      title: str(t.title),
      columns: arr(t.columns).slice(0, 7).map(function (c) { return str(c); }),
      rows: arr(t.rows).slice(0, 6).map(function (r) {
        return {
          cells: arr(r.cells).slice(0, 7).map(function (c) { return str(c); }),
          sub: str(r.sub),
          signal: r.signal ? { tone: str(r.signal.tone, "neutral"), text: str(r.signal.text) } : null,
          tags: tagsFrom(r.tags),
          selected: !!r.selected,
        };
      }),
      footnote: str(t.footnote),
    };
  }
  // Funnel stages: [{label, value, sub}] (≤5), rendered left→right.
  function funnelFrom(rows) {
    return arr(rows).slice(0, 5).map(function (r) {
      return { label: str(r.label), value: str(r.value), sub: str(r.sub) };
    });
  }
  // Step-strip: [{title, preview, done?}] (≤5) — campaign builder progress.
  function stepStripFrom(rows) {
    return arr(rows).slice(0, 5).map(function (r) {
      return { title: str(r.title), preview: str(r.preview), done: r.done !== false };
    });
  }
  // Product grid cards: [{emoji, name, meta}] (≤4) — email spotlight.
  function productGridFrom(rows) {
    return arr(rows).slice(0, 4).map(function (r) {
      return { emoji: str(r.emoji, "•"), name: str(r.name), meta: str(r.meta) };
    });
  }
  // Key/value attribute rows: [{k, v}] (≤6) — campaign preview cards, email meta.
  function attrRowsFrom(rows) {
    return arr(rows).slice(0, 6).map(function (r) {
      return { k: str(r.k || r.label), v: str(r.v || r.value) };
    }).filter(function (r) { return r.k || r.v; });
  }
  // Campaign preview cards (≤4) — each card is one of:
  //   { title, icon, badge:{tone,text}, kind:"count", count, countSub, attrs:[{k,v}] }
  //   { …, kind:"email", subject, body }
  //   { …, kind:"attrs", attrs:[{k,v}] }
  //   { …, kind:"cta", body, ctas:[{text,primary?}] }
  function previewCardsFrom(rows) {
    return arr(rows).slice(0, 4).map(function (r) {
      var kind = ["count", "email", "attrs", "cta"].indexOf(r.kind) >= 0 ? r.kind : "attrs";
      return {
        title: str(r.title), icon: str(r.icon, "•"),
        badge: r.badge ? { tone: str(r.badge.tone, "neutral"), text: str(r.badge.text) } : null,
        kind: kind,
        count: str(r.count), countSub: str(r.countSub),
        attrs: attrRowsFrom(r.attrs),
        subject: str(r.subject), body: str(r.body),
        ctas: ctaFrom(r.ctas),
      };
    }).filter(function (c) { return c.title; });
  }
  // Email view (personalized OR generic): banner + intro + product grid + why-picked + cta + footer.
  function emailViewFrom(v) {
    if (!v) return null;
    return {
      bannerTag: str(v.bannerTag),
      bannerText: str(v.bannerText),
      bannerAlt: !!v.bannerAlt,
      intro: str(v.intro),
      products: productGridFrom(v.products),
      whyPicked: v.whyPicked ? { title: str(v.whyPicked.title, "Why these?"), body: str(v.whyPicked.body), muted: !!v.whyPicked.muted } : null,
      cta: str(v.cta),
      ctaMuted: !!v.ctaMuted,
      footer: str(v.footer),
      footerMuted: !!v.footerMuted,
    };
  }
  // Coverage/scale math rows: [{label, value, badge}] (≤4) + footer.
  function coverageFrom(c) {
    if (!c) return null;
    return {
      title: str(c.title, "Coverage"),
      rows: arr(c.rows).slice(0, 4).map(function (r) {
        return { label: str(r.label), value: str(r.value),
          badge: r.badge ? { tone: str(r.badge.tone, "neutral"), text: str(r.badge.text) } : null };
      }),
      footer: str(c.footer),
    };
  }
  // Territory map: { label, legend:[{tone,text}], pins:[{tone:"hot|warm|cool", top, left, label?, selected?}] }.
  // top/left are percentages (0-100) — positions are illustrative, clamped.
  function mapFrom(m) {
    if (!m) return null;
    var TONES = { hot: 1, warm: 1, cool: 1 };
    return {
      label: str(m.label, "Territory map"),
      legend: arr(m.legend).slice(0, 4).map(function (l) {
        return { tone: TONES[l.tone] ? str(l.tone) : "cool", text: str(l.text) };
      }),
      pins: arr(m.pins).slice(0, 16).map(function (p) {
        return { tone: TONES[p.tone] ? str(p.tone) : "cool",
          top: num(p.top, 50), left: num(p.left, 50),
          label: str(p.label), selected: !!p.selected };
      }),
    };
  }
  // Brief hero: { eyebrow, name, sub, signals:[{k,v}] (≤3) } — gradient pre-call brief.
  function briefFrom(b) {
    if (!b) return null;
    return {
      eyebrow: str(b.eyebrow, "Pre-Call Brief"),
      name: str(b.name),
      sub: str(b.sub),
      signals: arr(b.signals).slice(0, 3).map(function (s) {
        return { k: str(s.k || s.label), v: str(s.v || s.value) };
      }),
    };
  }

  // ── recordWithAiPanel (account-research-agent, eci-opportunity) ──
  function buildRecordAi(found, brand) {
    var f = found || {};
    return {
      screenId: str(f.screenId), family: "recordWithAiPanel",
      chrome: chromeFrom(f, brand), header: headerFrom(f),
      // Enriched blocks (all optional — presence drives the layout):
      donut: donutFrom(f.donut), donutTitle: str(f.donutTitle, "Account signals"),
      transcript: (f.transcript && arr(f.transcript.turns).length) ? transcriptFrom(f.transcript) : null,
      stageBar: stageBarFrom(f.stageBar), stageTitle: str(f.stageTitle, "Deal stage"),
      sections: sectionsFrom(f.sections), sectionsTitle: str(f.sectionsTitle, "Research"),
      aiPanel: aiPanelFrom(f.aiPanel),
      identity: f.identity ? { title: str(f.identity.title, "Details"),
        fields: fieldsFrom(f.identity.fields, 8) } : null,
      timeline: (f.timeline && arr(f.timeline.items).length) ? timelineFrom(f.timeline) : null,
      list: listFrom(f.list), listTitle: str(f.listTitle, "Related"),
    };
  }

  // ── assistantChat (sales-assistant) ──
  function buildAssistantChat(found, brand) {
    var f = found || {};
    var sr = f.suggestedReply || null;
    return {
      screenId: str(f.screenId), family: "assistantChat",
      chrome: chromeFrom(f, brand), header: (f.header) ? headerFrom(f) : null,
      aiPanel: aiPanelFrom(f.aiPanel || { title: "Sales Assistant" }),
      chat: chatFrom(f.chat || f.turns),
      suggestedReply: sr ? { groundedOn: str(sr.groundedOn, "Suggested reply"), body: str(sr.body),
        actions: arr(sr.actions).slice(0, 3).map(function (a) { return str(a); }) } : null,
    };
  }

  // ── metricsAndTable (territory-planning, mc-next-attribution) ──
  // One enriched panel both screens fill via config presence:
  //   • territory-planning → two-column split: map+pins + growth table (left),
  //     brief hero + recent activity + recommended play (AI+CTAs) + coverage math (right).
  //   • mc-next-attribution → stacked: metric cards → funnel → campaign table → Einstein insight.
  function buildMetricsTable(found, brand) {
    var f = found || {};
    return {
      screenId: str(f.screenId), family: "metricsAndTable",
      chrome: chromeFrom(f, brand), header: (f.header) ? headerFrom(f) : null,
      subtitle: str(f.subtitle),
      metrics: metricsFrom(f.metrics),
      funnel: funnelFrom(f.funnel), funnelTitle: str(f.funnelTitle, "Attribution model"),
      aiPanel: f.aiPanel ? aiPanelFrom(f.aiPanel) : null,
      table: tableFrom(f.table),
      // Territory blocks (optional — presence switches the panel to two-column):
      map: mapFrom(f.map),
      brief: briefFrom(f.brief),
      activity: listFrom(f.activity), activityTitle: str(f.activityTitle, "Recent Activity"),
      recommendedPlay: f.recommendedPlay ? {
        title: str(f.recommendedPlay.title, "Agentforce Recommended Play"),
        aiPanel: aiPanelFrom(f.recommendedPlay.aiPanel || f.recommendedPlay),
        cta: ctaFrom(f.recommendedPlay.cta),
      } : null,
      coverage: coverageFrom(f.coverage),
    };
  }

  // ── serviceCase (sentiment-case, case-summary-lwc) ──
  function buildServiceCase(found, brand) {
    var f = found || {};
    var sm = f.sentiment || null;
    var sr = f.suggestedReply || null;
    return {
      screenId: str(f.screenId), family: "serviceCase",
      chrome: chromeFrom(f, brand), header: headerFrom(f),
      badges: tagsFrom(f.badges),
      sentiment: sm ? {
        title: str(sm.title, "Case Sentiment"), badge: str(sm.badge),
        // Prefer the signed sentiment bar; fall back to a plain score circle.
        bar: sm.bar ? sentimentBarFrom(sm.bar) : (sm.value != null ? sentimentBarFrom(sm) : null),
        score: (!sm.bar && sm.score) ? { value: num(sm.score.value, 0), of: num(sm.score.of, 100),
          label: str(sm.score.label, "Sentiment"), meta: str(sm.score.meta), insight: str(sm.score.insight) } : null,
        body: str(sm.body),
      } : null,
      aiPanel: f.aiPanel ? aiPanelFrom(f.aiPanel) : null,
      cta: ctaFrom(f.cta),
      suggestedReply: sr ? { groundedOn: str(sr.groundedOn, "Suggested reply"), body: str(sr.body),
        actions: arr(sr.actions).slice(0, 3).map(function (a) { return str(a); }) } : null,
      identity: f.identity ? { title: str(f.identity.title, "Case Details"),
        fields: fieldsFrom(f.identity.fields, 8) } : null,
      timeline: timelineFrom(f.timeline),
      related: listFrom(f.related), relatedTitle: str(f.relatedTitle, "Related cases"),
      coverage: coverageFrom(f.coverage),
    };
  }

  // ── voiceConsole (voice-console-live) ──
  function buildVoiceConsole(found, brand) {
    var f = found || {};
    var call = f.call || {};
    var tr = f.transcript || {};
    var sm = f.sentiment || null;
    return {
      screenId: str(f.screenId), family: "voiceConsole",
      chrome: chromeFrom(f, brand), header: headerFrom(f),
      call: { status: str(call.status, "On call — live"), timer: str(call.timer, "04:12") },
      transcript: { title: str(tr.title, "Live Transcript"), turns: chatFrom(tr.turns || f.chat) },
      identity: f.identity ? { title: str(f.identity.title, "Caller"),
        fields: fieldsFrom(f.identity.fields, 6) } : null,
      sentiment: sm ? { title: str(sm.title, "Live Sentiment"), badge: str(sm.badge),
        bar: sm.bar ? sentimentBarFrom(sm.bar) : (sm.value != null ? sentimentBarFrom(sm) : null),
        score: (!sm.bar && sm.score) ? { value: num(sm.score.value, 0), of: num(sm.score.of, 100),
          label: str(sm.score.label, "Sentiment"), meta: str(sm.score.meta) } : null } : null,
      aiPanel: f.aiPanel ? aiPanelFrom(f.aiPanel) : null,
      list: listFrom(f.list),
      knowledge: listFrom(f.knowledge), knowledgeTitle: str(f.knowledgeTitle, "Grounded knowledge"),
    };
  }

  // ── campaignBuilder (prompt-campaign-builder) ──
  // Prompt box (with highlight phrases) + a step-strip of build stages + a 2×2
  // preview grid of result cards (audience count, generated email, report attrs, send CTA).
  function buildCampaignBuilder(found, brand) {
    var f = found || {};
    return {
      screenId: str(f.screenId), family: "campaignBuilder",
      chrome: chromeFrom(f, brand), header: (f.header) ? headerFrom(f) : null,
      subtitle: str(f.subtitle),
      prompt: str(f.prompt),
      promptHighlights: arr(f.promptHighlights).slice(0, 6).map(function (h) { return str(h); }).filter(Boolean),
      promptMeta: str(f.promptMeta),
      buildLabel: str(f.buildLabel, "✨ Build campaign"),
      steps: stepStripFrom(f.steps),
      previewCards: previewCardsFrom(f.previewCards),
      aiPanel: f.aiPanel ? aiPanelFrom(f.aiPanel) : null,
    };
  }

  // ── emailPreview (thursday-spotlight) ──
  // A phone-framed marketing email. Renders the PERSONALIZED view as the final
  // static state, with the audience toggle-bar shown (generic tab present, inactive).
  function buildEmailPreview(found, brand) {
    var f = found || {};
    var em = f.email || {};
    // Back-compat: accept the old {from, subject, blocks} shape as a minimal view.
    var personalized = em.personalized || (em.blocks ? null : em);
    return {
      screenId: str(f.screenId), family: "emailPreview",
      chrome: chromeFrom(f, brand),
      email: {
        from: str(em.from, "Marketing"),
        subject: str(em.subject, "This week's spotlight"),
        toTag: str(em.toTag),
        tabs: arr(em.tabs).slice(0, 2).map(function (t) {
          return { label: str(t.label), active: !!t.active };
        }),
        // Legacy block list (kept so old configs still render something).
        blocks: arr(em.blocks).slice(0, 5).map(function (b) {
          var type = ["image", "button", "heading", "paragraph"].indexOf(b.type) >= 0 ? b.type : "paragraph";
          return { type: type, text: str(b.text), alt: str(b.alt) };
        }),
        personalized: emailViewFrom(personalized),
        generic: emailViewFrom(em.generic),
      },
    };
  }

  // Generic pass-through for families whose renderer isn't built yet (Phase 2):
  // preserve the foundation verbatim under a stable envelope so the fallback
  // shell renders and re-import round-trips. Additive — Phase 2 replaces this
  // with a proper per-family assembler.
  function buildGeneric(found, brand, family) {
    var f = found || {};
    return Object.assign({}, f, {
      screenId: str(f.screenId),
      family: family,
      chrome: chromeFrom(f, brand),
      header: headerFrom(f),
    });
  }

  // ── kpiTable (prospecting-agent-view) ──
  // A prospecting work-queue: a KPI strip over a scored multi-account table.
  function buildKpiTable(found, brand) {
    var f = found || {};
    return {
      screenId: str(f.screenId), family: "kpiTable",
      chrome: chromeFrom(f, brand),
      subtitle: str(f.subtitle, "Prospecting Agent identified and scored accounts overnight."),
      kpis: kpiStripFrom(f.kpis),
      table: accountTableFrom(f.table),
      aiPanel: f.aiPanel ? aiPanelFrom(f.aiPanel) : null,
    };
  }

  // ── main dispatch ────────────────────────────────────────────
  function buildScreenConfig(family, found, brand, ctx) {
    switch (family) {
      case "recordWithScoreAndTimeline":
        return buildScoreTimeline(found || {}, brand || {});
      case "recordWithAiPanel":
        return buildRecordAi(found || {}, brand || {});
      case "assistantChat":
        return buildAssistantChat(found || {}, brand || {});
      case "metricsAndTable":
        return buildMetricsTable(found || {}, brand || {});
      case "serviceCase":
        return buildServiceCase(found || {}, brand || {});
      case "voiceConsole":
        return buildVoiceConsole(found || {}, brand || {});
      case "campaignBuilder":
        return buildCampaignBuilder(found || {}, brand || {});
      case "emailPreview":
        return buildEmailPreview(found || {}, brand || {});
      case "kpiTable":
        return buildKpiTable(found || {}, brand || {});
      default:
        return buildGeneric(found || {}, brand || {}, family);
    }
  }

  global.HOLO_SCREENGEN = {
    buildScreenConfig: buildScreenConfig,
  };
})(window);
