// ════════════════════════════════════════════════════════════════
//  export-model.js — HOLO_EXPORT_MODEL
//
//  ONE normalization layer that both file exporters (PPTX, PDF) build
//  from, so the resolution logic lives in exactly one place and both
//  formats carry the SAME words + structured data + brand as /demo.
//
//  buildExportModel(state) → Promise<{ meta, brand, slides:[NormalizedSlide] }>
//
//  Pipeline (mirrors what /demo consumes):
//    1. STORE.signAssets(state)            — rehydrate GCS tokens → signed URLs
//    2. HOLO_ADAPTER.toPolishedHolodeckConfig(state)
//                                          — demo-identical structured payload
//                                            (persona, journey, bvs, timeline,
//                                             orbitNodes, poweredBy, brand,
//                                             demoAssets, …)
//    3. HOLO_SHARED.buildSlideManifest(state)
//                                          — the FULL ordered deck (intro →
//                                            journey-map → meet-persona → demo →
//                                            business-value), honoring Step-5
//                                            selection + reorder
//    4. per slide: map layout → template, resolve copy with the SAME
//       precedence the preview/demo use (stored || prefill || placeholder),
//       pull template-specific structured data from the adapter cfg +
//       shared generators, resolve the image slot → signed URL, carry notes.
//
//  Pure/no-DOM (except an offscreen <img> to measure image dimensions,
//  and FileReader for data-URL conversion — both browser-standard, no
//  layout). Classic IIFE global, same style as the rest of builder/.
// ════════════════════════════════════════════════════════════════

(function (global) {
  "use strict";

  const SHARED   = global.HOLO_SHARED   || {};
  const ADAPTER  = global.HOLO_ADAPTER  || {};
  const PREVIEW  = global.HOLO_PREVIEW  || {};
  const STORE    = global.HOLO_STORE    || {};

  // ─── State-path utilities ──────────────────────────────────────
  // Ported verbatim from preview-renderer.js so this module has no
  // hard dependency on HOLO_PREVIEW being loaded (it usually is, but
  // the exporters must not throw if load order shifts). Resolve dotted/
  // indexed paths like "personas[0].wishlistHeadline" against a root.
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

  // ─── Theme / geometry ──────────────────────────────────────────
  // Shared geometry (in the PPTX 13.33×7.5in coordinate space) + the
  // brand-independent palette bits. Both exporters read from THEME so
  // the two formats stay visually aligned. The PDF exporter scales
  // these inch values into its 960×540pt page (×72).
  const THEME = {
    // 16:9 canvas
    W: 13.33, H: 7.5,
    MARGIN: 0.7,
    // Neutral ink / paper (brand colors override where used)
    ink:   "1A1A2E",
    muted: "6B7280",
    paper: "FFFFFF",
    band:  "F5F7FF",
    line:  "E2E6F0",
    // Type scale (pt)
    fsTitle: 40, fsHeadline: 32, fsEyebrow: 13, fsSub: 18,
    fsBody: 14, fsSmall: 11, fsMetric: 34, fsMetricLabel: 12,
    font: "Inter",
  };

  // ─── Layout → template mapping ─────────────────────────────────
  // 8 clean native templates. Device-frame chrome + live iframes are a
  // documented fast-follow; v1 renders still images / labeled placeholders.
  const LAYOUT_TO_TEMPLATE = {
    introHero:          "titleSlide",
    introStoryHook:     "titleSlide",
    chapterOpener:      "sectionDivider",
    personaCta:         "sectionDivider",
    bvOpener:           "sectionDivider",
    bvClosing:          "sectionDivider",
    introThreeActs:     "bulletJourney",
    journeyMapMatrix:   "bulletJourney",
    journeyTimeline:    "bulletJourney",
    demoMap:            "bulletJourney",
    bvOrbit:            "bulletJourney",
    bvCapabilities:     "bulletJourney",
    executiveSummary:   "bulletJourney",
    nextSteps:          "bulletJourney",
    introVignette:      "deviceSceneImage",
    deviceMoment:       "deviceSceneImage",
    scenePhoto:         "deviceSceneImage",
    personaIntro:       "splitTextImage",
    personaWishlist:    "splitTextImage",
    personaCard:        "personaCard",
    unifiedProfile:     "personaCard",
    agentConversation:  "agentChat",
    kpiScorecard:       "metricScorecard",
    // embeddedCxComponent handled specially: still image → deviceSceneImage,
    // else placeholderCx (see templateFor()).
  };

  function templateFor(slide) {
    const layout = (slide && slide.layout) || "";
    if (layout === "embeddedCxComponent") {
      return "cx"; // resolved to deviceSceneImage-or-placeholder by the exporter
    }
    const t = LAYOUT_TO_TEMPLATE[layout];
    if (!t) {
      try { console.warn("[export-model] no template for layout '" + layout + "' — using titleSlide"); }
      catch (e) {}
      return "titleSlide";
    }
    return t;
  }

  // ─── Field resolution (stored || prefill || placeholder) ───────
  // Mirrors the preview/demo precedence exactly (preview-renderer.js
  // ~lines 790-822): the STORED value at the editor path wins; when it's
  // blank we fall back to the field's prefill (seeded default copy) and
  // then to its placeholder (override hint). editorPaths values are either
  // a plain path string or { path, placeholder, prefill } where the last
  // two are (slide, state) => string. "__slide.<field>" paths read from
  // the slide object itself, not the global state tree.
  function normEntry(raw) {
    if (raw && typeof raw === "object") {
      return { path: raw.path, placeholder: raw.placeholder, prefill: raw.prefill };
    }
    return { path: raw, placeholder: undefined, prefill: undefined };
  }
  function storedAt(slide, state, path) {
    const m = /^__slide\.(.+)$/.exec(String(path || ""));
    if (m) return slide ? slide[m[1]] : undefined;
    return getAtPath(state, path);
  }
  function resolveEntry(slide, state, raw) {
    const f = normEntry(raw);
    const v = storedAt(slide, state, f.path);
    // A non-null non-string (array/object, e.g. a wishlist) is a real
    // stored value → return as-is. A string wins only when non-blank.
    if (v != null && typeof v !== "string") return v;
    const stored = (v == null ? "" : v);
    if (stored.trim()) return stored;
    // blank string → prefill, then placeholder
    if (typeof f.prefill === "function") {
      try { const p = f.prefill(slide, state); if (p != null && String(p).trim()) return p; } catch (e) {}
    }
    if (typeof f.placeholder === "function") {
      try { const p = f.placeholder(slide, state); if (p != null && String(p).trim()) return p; } catch (e) {}
    } else if (typeof f.placeholder === "string" && f.placeholder.trim()) {
      return f.placeholder;
    }
    return stored; // "" or the empty value
  }
  // Resolve a single labeled field on a slide (exported helper).
  function resolveField(slide, state, label) {
    const eps = (slide && slide.editorPaths) || {};
    if (!(label in eps)) return "";
    return resolveEntry(slide, state, eps[label]);
  }
  // Resolve every editorPaths label on a slide → { label: value }.
  function resolveAll(slide, state) {
    const out = {};
    const eps = (slide && slide.editorPaths) || {};
    Object.keys(eps).forEach(function (label) {
      out[label] = resolveEntry(slide, state, eps[label]);
    });
    return out;
  }
  // First non-empty resolved value among a list of candidate labels.
  function firstOf(fields, labels) {
    for (let i = 0; i < labels.length; i++) {
      const v = fields[labels[i]];
      if (v != null && String(v).trim()) return String(v);
    }
    return "";
  }
  // Strip inline HTML that the shared/adapter copy sometimes carries
  // (e.g. <strong>/<em>/<br/>) — file exporters want plain text runs.
  function plain(s) {
    return String(s == null ? "" : s)
      .replace(/<br\s*\/?>/gi, " ")
      .replace(/<\/?[^>]+>/g, "")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
      .replace(/\s+/g, " ")
      .trim();
  }

  // ─── Image → data URL (via the same-origin proxy) ──────────────
  // jsPDF requires a data URL; keeping pptxgenjs on data: too avoids a
  // second failure mode. Signed GCS URLs are cross-origin (no bucket
  // CORS), so we route http(s) fetches through GET /api/asset/proxy.
  // data: URLs (e.g. freshly-generated Gemini images) pass through.
  // Resolves null on ANY failure so the caller draws a placeholder.
  const IMG_CACHE = {};
  function imageToDataUrl(url) {
    url = url && String(url).trim();
    if (!url) return Promise.resolve(null);
    if (IMG_CACHE[url] !== undefined) return Promise.resolve(IMG_CACHE[url]);
    const done = function (result) { IMG_CACHE[url] = result; return result; };

    const measure = function (dataUrl) {
      return new Promise(function (resolve) {
        try {
          const img = new Image();
          img.onload = function () {
            resolve(done({ dataUrl: dataUrl, w: img.naturalWidth || img.width || 0, h: img.naturalHeight || img.height || 0 }));
          };
          img.onerror = function () { resolve(done(null)); };
          img.src = dataUrl;
        } catch (e) { resolve(done(null)); }
      });
    };

    if (/^data:/i.test(url)) return measure(url);

    let fetchUrl = url;
    if (/^https?:\/\//i.test(url)) {
      fetchUrl = "/api/asset/proxy?url=" + encodeURIComponent(url);
    }
    return fetch(fetchUrl)
      .then(function (res) { if (!res.ok) throw new Error("proxy " + res.status); return res.blob(); })
      .then(function (blob) {
        return new Promise(function (resolve) {
          const fr = new FileReader();
          fr.onload = function () { resolve(fr.result); };
          fr.onerror = function () { resolve(null); };
          fr.readAsDataURL(blob);
        });
      })
      .then(function (dataUrl) { return dataUrl ? measure(dataUrl) : done(null); })
      .catch(function () { return done(null); });
  }

  // ─── Image slot per layout ─────────────────────────────────────
  // Pick the ONE hero image a template shows, from the signed demoAssets
  // (adapter) + per-slide assets. Returns { url, kind } | null (URL, not
  // yet a data URL — buildExportModel resolves it via imageToDataUrl).
  function imageSlotFor(slide, cfg, state) {
    const da = (cfg && cfg.demoAssets) || {};
    const layout = (slide && slide.layout) || "";
    // Per-slide explicit assets win (SE dropped an image on this slide).
    const slAssets = (slide && slide.assets) || [];
    const firstSlideAsset = slAssets.find(function (a) { return a && (a.url || a.path || a.src); });
    const pick = function (v, kind) { return (v && String(v).trim()) ? { url: String(v), kind: kind || "image" } : null; };

    if (firstSlideAsset) {
      const u = firstSlideAsset.url || firstSlideAsset.path || firstSlideAsset.src;
      if (u && String(u).trim()) return { url: String(u), kind: "image" };
    }

    switch (layout) {
      case "personaIntro":
      case "personaCard":
      case "unifiedProfile":
        return pick((cfg.persona && (cfg.persona.portrait || cfg.persona.heroBackground)), "portrait");
      case "personaWishlist":
        return pick((cfg.persona && (cfg.persona.phoneGif || cfg.persona.heroGif)), "device");
      case "introVignette":
        return pick(da.productHero || da.storeInterior || da.iPhoneRec, "scene");
      case "deviceMoment":
        return pick(da.iPhoneRec || da.laptopBrowsingGif || da.webBrowseGif, "device");
      case "scenePhoto":
        return pick(da.storeExterior || da.storeInterior || da.productHero, "scene");
      case "demoMap":
        return pick(da.productHero || da.storeInterior, "scene");
      default:
        return null;
    }
  }

  // CX component still lookup (embeddedCxComponent). Returns
  // { stillUrl|null, targetUrl, name } for the "still else placeholder" path.
  function cxFallbackFor(slide, state) {
    const ids = (slide && slide.linkedCxComponentIds) || [];
    const comps = (state && state.cxComponents) || [];
    let comp = null;
    if (ids.length) comp = comps.find(function (c) { return c && c.id === ids[0]; }) || null;
    if (!comp && slide && slide.cxComponentId) {
      comp = comps.find(function (c) { return c && c.id === slide.cxComponentId; }) || null;
    }
    comp = comp || {};
    const still = comp.stillImage || comp.still || comp.screenshot || comp.image || "";
    return {
      stillUrl:  (still && String(still).trim()) ? String(still) : null,
      targetUrl: comp.url || comp.targetUrl || comp.href || "",
      name:      comp.name || comp.label || slide.title || "CX Component",
    };
  }

  // ─── Per-template structured data ──────────────────────────────
  // Pull the template-relevant structured content from the adapter cfg
  // + shared generators (never re-clip / re-invent copy). Returns the
  // template-specific slice of a NormalizedSlide.
  function structuredFor(template, slide, cfg, state, fields) {
    const layout = (slide && slide.layout) || "";

    if (template === "bulletJourney") {
      return bulletsFor(layout, slide, cfg, state, fields);
    }
    if (template === "metricScorecard") {
      const metrics = ((cfg.bvs && cfg.bvs.metrics) || []).map(function (m) {
        return { value: plain(m.value || m.stat || ""), label: plain(m.label || m.title || ""), icon: m.icon || "" };
      });
      return { metrics: metrics };
    }
    if (template === "agentChat") {
      const chat = SHARED.agentChat ? SHARED.agentChat(state) : { turns: [] };
      const turns = (chat.turns || []).map(function (t) {
        if (t.kind === "card" && t.card) {
          return { role: "card", text: plain(t.card.title) + (t.card.sub ? " — " + plain(t.card.sub) : ""), emoji: t.card.emoji || "" };
        }
        return { role: t.from === "user" ? "user" : "agent", text: plain(t.text) };
      });
      return { chat: turns };
    }
    if (template === "personaCard") {
      const p = cfg.persona || {};
      return {
        facets: (p.stats || []).map(function (s) { return { label: plain(s.label), value: plain(s.value) }; }),
        quote:  plain(p.quote),
        products: (cfg.journey && cfg.journey.platform && cfg.journey.platform.capabilities) || [],
      };
    }
    if (template === "splitTextImage") {
      if (layout === "personaWishlist") {
        const p = cfg.persona || {};
        return {
          bullets: (p.wishlist || []).map(function (w) {
            return { title: plain((w.emoji ? w.emoji + " " : "") + (w.name || "")), desc: plain(w.tag || w.detail || "") };
          }),
        };
      }
      return {};
    }
    return {};
  }

  // bulletJourney feeds several very different layouts; each pulls its
  // rows from the adapter cfg / shared generators the /demo renders from.
  function bulletsFor(layout, slide, cfg, state, fields) {
    const bullets = [];
    if (layout === "journeyMapMatrix") {
      ((cfg.journey && cfg.journey.steps) || []).forEach(function (s) {
        bullets.push({ title: plain(s.phaseTitle || s.title), desc: plain(s.descriptionShort || s.description) });
      });
    } else if (layout === "journeyTimeline") {
      const tl = cfg.timeline || {};
      (tl.below || tl.above || []).forEach(function (e) {
        bullets.push({ title: plain((e.icon ? e.icon + " " : "") + (e.month ? e.month + " · " : "") + e.label), desc: plain(e.sub) });
      });
    } else if (layout === "introThreeActs") {
      (cfg.demoStructure || []).forEach(function (a, i) {
        bullets.push({ title: plain("Act " + (i + 1) + " · " + a.title), desc: plain(a.description) });
      });
    } else if (layout === "bvOrbit") {
      (cfg.orbitNodes || []).forEach(function (n) {
        bullets.push({ title: plain(n.label || n.title || n.name), desc: plain(n.sub || n.detail || "") });
      });
    } else if (layout === "bvCapabilities") {
      const caps = (SHARED.buildCapabilities
        ? SHARED.buildCapabilities(state.storyFoundations || {}, (state.project && state.project.products) || [])
        : []);
      caps.forEach(function (c) {
        bullets.push({ title: plain(c.title || c.name || c.label), desc: plain(c.desc || c.description || "") });
      });
    } else if (layout === "nextSteps") {
      (SHARED.nextStepsPhases ? SHARED.nextStepsPhases() : []).forEach(function (p, i) {
        bullets.push({ title: plain((i + 1) + ". " + p), desc: "" });
      });
    } else if (layout === "demoMap" || layout === "executiveSummary") {
      // SE-authored demo slides: use their own bullet-ish fields when present.
      const items = (slide && (slide.bullets || slide.points || slide.items)) || [];
      items.forEach(function (it) {
        if (typeof it === "string") bullets.push({ title: plain(it), desc: "" });
        else bullets.push({ title: plain(it.title || it.label || it.text || ""), desc: plain(it.desc || it.sub || "") });
      });
      // Fall back to the "powered by" evidence list so the slide isn't empty.
      if (!bullets.length && layout === "executiveSummary") {
        (cfg.poweredBy || []).forEach(function (p) {
          bullets.push({ title: plain(p.product || p.title || p.name || ""), desc: plain(p.evidence || p.detail || p.sub || "") });
        });
      }
    }
    return { bullets: bullets };
  }

  // ─── Title / eyebrow / headline / sub resolution ───────────────
  // Pull the display-text fields off the resolved editorPaths, with
  // sensible per-template fallbacks to the adapter's customer copy.
  function copyFor(template, slide, cfg, state, fields) {
    const cust = cfg.customer || {};
    const persona = cfg.persona || {};
    const layout = (slide && slide.layout) || "";
    // Only treat a resolved editor "Headline"/"Title" as the display title.
    // Falling back to slide.title here would surface the builder-internal
    // label ("Spotlight · stats + quote (mr-2)"), so layouts WITHOUT a
    // headline field get a customer-facing default from the adapter cfg below.
    const editorTitle = plain(firstOf(fields, ["Headline", "Title"]));
    const eyebrow = plain(firstOf(fields, [
      "Theme (top label / eyebrow)", "Eyebrow (small label above the title)", "Theme",
    ]));
    let sub = plain(firstOf(fields, [
      "Sub-line", "Sub-line · business problem", "Sub-line · primary narrative",
      "Sub-line · demo relevance (wins)", "Sub-line · future vision (fallback)",
      "Sub-line · demo relevance", "Sub-line · goals (fallback)", "Transformation thesis",
    ]));

    // Customer-facing default headline per layout — mirrors what /demo
    // renders as the slide's big title (never the internal editor label).
    let defTitle = "";
    switch (layout) {
      case "personaIntro":   defTitle = persona.name ? ("Meet " + persona.name) : "Meet the persona"; break;
      case "personaCard":    defTitle = persona.fullName || persona.name || "Persona spotlight"; break;
      case "unifiedProfile": defTitle = persona.fullName ? (persona.fullName + " · unified profile") : "Unified customer profile"; break;
      case "personaWishlist":defTitle = plain(firstOf(fields, ["Wishlist headline"])) || persona.wishlistHeadline || "The wishlist"; break;
      case "personaCta":     defTitle = persona.ctaHeadline || "Begin the journey"; break;
      case "chapterOpener":  defTitle = plain(firstOf(fields, ["Demo title", "Theme"])) || cust.demoTitle || "The demo"; break;
      case "bvClosing":      defTitle = cust.closingQuote || cust.name + " + Salesforce"; break;
      default:               defTitle = plain(slide && slide.title || "");
    }
    const title = editorTitle || defTitle;
    const out = { title: title, eyebrow: eyebrow, sub: sub };

    if (template === "titleSlide") {
      out.title = editorTitle || plain(cust.heroHeadline || cust.storyHook || cust.name || "Customer");
      out.eyebrow = eyebrow || plain(cust.demoTitle || "");
      out.sub = sub || plain(cust.heroSub || cust.storyHookSub || "");
    } else if (template === "sectionDivider") {
      // Closing/CTA carry a takeaway or CTA sub beneath the divider title.
      if (layout === "personaCta") out.sub = sub || plain(persona.ctaSub || "");
      else if (layout === "bvClosing") out.sub = sub || plain(firstOf(fields, ["Executive takeaway"]) || cust.closingQuote || "");
      else out.sub = sub;
    }
    return out;
  }

  // ─── NormalizedSlide builder (sync part) ───────────────────────
  function normalizeSlide(slide, cfg, state) {
    const template = templateFor(slide);
    const fields = resolveAll(slide, state);
    const copy = copyFor(template === "cx" ? "titleSlide" : template, slide, cfg, state, fields);
    const structured = (template === "cx") ? {} : structuredFor(template, slide, cfg, state, fields);

    const ns = {
      id:           slide.id || slide.layout || "",
      layout:       slide.layout || "",
      template:     template === "cx" ? "cx" : template,
      sectionId:    slide.sectionId || "",
      title:        copy.title,
      eyebrow:      copy.eyebrow,
      headline:     copy.title,
      sub:          copy.sub,
      bullets:      structured.bullets || [],
      metrics:      structured.metrics || [],
      chat:         structured.chat || [],
      facets:       structured.facets || [],
      quote:        structured.quote || "",
      products:     structured.products || [],
      image:        null, // filled async below
      _imageSlot:   null,
      deviceHint:   (slide && slide.deviceHint) || "",
      speakerNotes: plain(resolveField(slide, state, "Speaker notes") || (slide && slide.speakerNotes) || ""),
      cxFallback:   null,
    };

    if (template === "cx") {
      ns.cxFallback = cxFallbackFor(slide, state);
      // A still image is treated exactly like a device scene image.
      ns.template = ns.cxFallback.stillUrl ? "deviceSceneImage" : "placeholderCx";
      if (ns.cxFallback.stillUrl) ns._imageSlot = { url: ns.cxFallback.stillUrl, kind: "cx" };
    } else {
      ns._imageSlot = imageSlotFor(slide, cfg, state);
    }
    return ns;
  }

  // ─── Public: buildExportModel ──────────────────────────────────
  function buildExportModel(state) {
    state = state || {};
    // signAssets mutates the SAME state object it resolves with — clone
    // is unnecessary (the adapter reads the freshly-signed assetLibrary),
    // and matches zip-exporter's `STORE.signAssets(state).catch(()=>state)`.
    const signPromise = STORE.signAssets
      ? Promise.resolve(STORE.signAssets(state)).catch(function () { return state; })
      : Promise.resolve(state);

    return signPromise.then(function (signedState) {
      const st = signedState || state;
      const cfg = ADAPTER.toPolishedHolodeckConfig
        ? ADAPTER.toPolishedHolodeckConfig(st)
        : { brand: {}, demoAssets: {}, customer: {}, persona: {}, journey: {}, bvs: {} };
      const manifest = SHARED.buildSlideManifest ? SHARED.buildSlideManifest(st) : [];

      const slides = manifest.map(function (sl) { return normalizeSlide(sl, cfg, st); });

      // Resolve every image slot → data URL (parallel; failures → null).
      const imgJobs = slides.map(function (ns) {
        if (!ns._imageSlot) return Promise.resolve();
        return imageToDataUrl(ns._imageSlot.url).then(function (img) {
          if (img) ns.image = { dataUrl: img.dataUrl, w: img.w, h: img.h, kind: ns._imageSlot.kind };
          delete ns._imageSlot;
        });
      });

      return Promise.all(imgJobs).then(function () {
        const project = st.project || {};
        return {
          meta: {
            name:         project.name || "Holodeck",
            customerName: project.customerName || "",
            theme:        project.theme || "",
            slideCount:   slides.length,
          },
          brand: brandTheme(cfg.brand || {}),
          slides: slides,
        };
      });
    });
  }

  // Normalize the adapter brand into hex-without-# tokens the exporters use.
  function brandTheme(b) {
    const hex = function (c, fallback) {
      let s = String(c || fallback || "").trim();
      if (s.charAt(0) === "#") s = s.slice(1);
      return /^[0-9a-fA-F]{6}$/.test(s) ? s.toUpperCase() : fallback;
    };
    return {
      primary:   hex(b.primaryColor,   "B22234"),
      secondary: hex(b.secondaryColor, "1A5FA0"),
      accent:    hex(b.accentColor,    "F5C06A"),
      navy:      hex(b.navyColor,      "0D1B2E"),
      bg:        hex(b.bgColor,        "F5F7FF"),
      logoPath:  b.logoPath || "",
      customerLogoPath: b.customerLogoPath || "",
      fontHeading: cleanFont(b.fontHeading) || "Playfair Display",
      fontBody:    cleanFont(b.fontBody)    || "Inter",
    };
  }
  function cleanFont(f) {
    // adapter stores CSS font stacks ("'Playfair Display', serif") — take
    // the first family, unquoted, for the exporters' font name.
    if (!f) return "";
    return String(f).split(",")[0].replace(/['"]/g, "").trim();
  }

  // ─── Public API ────────────────────────────────────────────────
  global.HOLO_EXPORT_MODEL = {
    buildExportModel:  buildExportModel,
    resolveField:      resolveField,
    imageToDataUrl:    imageToDataUrl,
    LAYOUT_TO_TEMPLATE: LAYOUT_TO_TEMPLATE,
    templateFor:       templateFor,
    THEME:             THEME,
    // exposed for exporters + tests
    plain:             plain,
    getAtPath:         getAtPath,
  };
})(window);
