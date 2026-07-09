// ════════════════════════════════════════════════════════════════
//  pptx-exporter.js — HOLO_PPTX
//
//  Renders the normalized export model (HOLO_EXPORT_MODEL.buildExportModel)
//  into a native 16:9 PowerPoint file via the vendored PptxGenJS bundle.
//  Same words + brand + images as /demo; clean native templates (no CSS
//  device-frame chrome, no live iframes — documented fast-follow).
//
//  Public: HOLO_PPTX.downloadDeckPptx(state) → Promise<void>
//
//  Depends on: window.PptxGenJS (vendor/pptxgen.bundle.js),
//              window.HOLO_EXPORT_MODEL, window.HOLO_ZIP.safeSlug.
// ════════════════════════════════════════════════════════════════

(function (global) {
  "use strict";

  const MODEL = global.HOLO_EXPORT_MODEL || {};
  const T = MODEL.THEME || { W: 13.33, H: 7.5, MARGIN: 0.7, font: "Inter" };

  function safeSlug(state) {
    if (global.HOLO_ZIP && global.HOLO_ZIP.safeSlug) return global.HOLO_ZIP.safeSlug(state);
    const p = (state && state.project) || {};
    const base = (p.customerName || p.name || "demo").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    return (base || "demo").slice(0, 48);
  }

  // ─── Download entry ────────────────────────────────────────────
  function downloadDeckPptx(state) {
    const PptxGenJS = global.PptxGenJS;
    if (typeof PptxGenJS !== "function") {
      return Promise.reject(new Error("PowerPoint library didn't load (vendor/pptxgen.bundle.js). Reload and try again."));
    }
    if (!MODEL.buildExportModel) {
      return Promise.reject(new Error("Export model unavailable (export-model.js not loaded)."));
    }
    return MODEL.buildExportModel(state).then(function (model) {
      const pptx = buildDeck(model);
      return pptx.writeFile({ fileName: "holodeck-" + safeSlug(state) + ".pptx" });
    });
  }

  // ─── Deck assembly ─────────────────────────────────────────────
  function buildDeck(model) {
    const PptxGenJS = global.PptxGenJS;
    const pptx = new PptxGenJS();
    pptx.layout = "LAYOUT_WIDE"; // 13.33 × 7.5in, 16:9
    pptx.author = "Holodeck Builder";
    pptx.company = "Salesforce";
    pptx.title = model.meta.name || "Holodeck";

    const brand = model.brand || {};
    const ctx = { pptx: pptx, brand: brand, ShapeType: pptx.ShapeType, AlignH: pptx.AlignH, AlignV: pptx.AlignV };

    model.slides.forEach(function (ns) {
      const slide = pptx.addSlide();
      slide.background = { color: T.paper };
      const renderer = TEMPLATE_RENDERERS[ns.template] || TEMPLATE_RENDERERS.titleSlide;
      try {
        renderer(slide, ns, ctx);
      } catch (e) {
        try { console.warn("[pptx] renderer failed for " + ns.template + " (" + ns.layout + "):", e); } catch (_) {}
        TEMPLATE_RENDERERS.titleSlide(slide, ns, ctx);
      }
      // Brand footer band + slide chrome on every slide.
      footer(slide, ns, ctx);
      if (ns.speakerNotes) { try { slide.addNotes(ns.speakerNotes); } catch (_) {} }
    });
    return pptx;
  }

  // ─── Shared chrome ─────────────────────────────────────────────
  function footer(slide, ns, ctx) {
    // Thin accent rule near the bottom + section label.
    slide.addShape(ctx.ShapeType.rect, {
      x: 0, y: T.H - 0.28, w: T.W, h: 0.06, fill: { color: ctx.brand.primary }, line: { type: "none" },
    });
    if (ns.sectionId) {
      slide.addText(sectionLabel(ns.sectionId), {
        x: T.MARGIN, y: T.H - 0.5, w: T.W - 2 * T.MARGIN, h: 0.3,
        fontSize: 9, color: T.muted, fontFace: ctx.brand.fontBody, align: ctx.AlignH.left, charSpacing: 2,
      });
    }
  }
  function sectionLabel(id) {
    return ({
      "intro": "INTRODUCTION", "journey-map": "JOURNEY MAP", "meet-persona": "MEET THE PERSONA",
      "demo": "THE DEMO", "business-value": "BUSINESS VALUE",
    })[id] || String(id).toUpperCase();
  }
  // Eyebrow + big title header used by several templates. Returns the
  // y-offset below the header so callers can lay content beneath it.
  function header(slide, ns, ctx, opts) {
    opts = opts || {};
    let y = T.MARGIN;
    if (ns.eyebrow) {
      slide.addText(ns.eyebrow.toUpperCase(), {
        x: T.MARGIN, y: y, w: T.W - 2 * T.MARGIN, h: 0.35,
        fontSize: 12, bold: true, color: ctx.brand.primary, fontFace: ctx.brand.fontBody,
        align: ctx.AlignH.left, charSpacing: 3,
      });
      y += 0.42;
    }
    const titleText = opts.title != null ? opts.title : ns.title;
    if (titleText) {
      slide.addText(titleText, {
        x: T.MARGIN, y: y, w: (opts.titleW || (T.W - 2 * T.MARGIN)), h: opts.titleH || 1.0,
        fontSize: opts.titleSize || 30, bold: true, color: T.ink, fontFace: ctx.brand.fontHeading,
        align: ctx.AlignH.left, valign: ctx.AlignV.top, shrinkText: true, autoFit: true,
      });
      y += (opts.titleH || 1.0) + 0.12;
    }
    return y;
  }

  // ─── Template renderers ────────────────────────────────────────
  const TEMPLATE_RENDERERS = {
    // Big centered hero — introHero / introStoryHook.
    titleSlide: function (slide, ns, ctx) {
      slide.background = { color: ctx.brand.navy };
      slide.addShape(ctx.ShapeType.rect, { x: 0, y: 0, w: 0.28, h: T.H, fill: { color: ctx.brand.primary }, line: { type: "none" } });
      if (ns.eyebrow) {
        slide.addText(ns.eyebrow.toUpperCase(), {
          x: 1.0, y: 2.1, w: T.W - 2.0, h: 0.5, fontSize: 15, bold: true,
          color: ctx.brand.accent, fontFace: ctx.brand.fontBody, align: ctx.AlignH.center, charSpacing: 4,
        });
      }
      slide.addText(ns.title || "Customer Story", {
        x: 1.0, y: 2.6, w: T.W - 2.0, h: 1.9, fontSize: 46, bold: true, color: "FFFFFF",
        fontFace: ctx.brand.fontHeading, align: ctx.AlignH.center, valign: ctx.AlignV.middle, shrinkText: true, autoFit: true,
      });
      if (ns.sub) {
        slide.addText(ns.sub, {
          x: 1.6, y: 4.7, w: T.W - 3.2, h: 1.2, fontSize: 18, color: "D6DCE8",
          fontFace: ctx.brand.fontBody, align: ctx.AlignH.center, valign: ctx.AlignV.top, shrinkText: true,
        });
      }
    },

    // Section divider — chapterOpener / personaCta / bvOpener / bvClosing.
    sectionDivider: function (slide, ns, ctx) {
      slide.background = { color: ctx.brand.primary };
      if (ns.eyebrow) {
        slide.addText(ns.eyebrow.toUpperCase(), {
          x: 1.0, y: 2.5, w: T.W - 2.0, h: 0.5, fontSize: 16, bold: true,
          color: "FFFFFF", fontFace: ctx.brand.fontBody, align: ctx.AlignH.center, charSpacing: 4, transparency: 20,
        });
      }
      slide.addText(ns.title || sectionLabel(ns.sectionId), {
        x: 1.0, y: 3.0, w: T.W - 2.0, h: 1.6, fontSize: 40, bold: true, color: "FFFFFF",
        fontFace: ctx.brand.fontHeading, align: ctx.AlignH.center, valign: ctx.AlignV.middle, shrinkText: true, autoFit: true,
      });
      if (ns.sub) {
        slide.addText(ns.sub, {
          x: 1.6, y: 4.7, w: T.W - 3.2, h: 1.1, fontSize: 17, color: "FFFFFF",
          fontFace: ctx.brand.fontBody, align: ctx.AlignH.center, valign: ctx.AlignV.top, transparency: 12, shrinkText: true,
        });
      }
    },

    // Bullet / journey rows — the workhorse for list-ish layouts.
    bulletJourney: function (slide, ns, ctx) {
      const top = header(slide, ns, ctx);
      const rows = (ns.bullets || []).slice(0, 8);
      if (!rows.length) {
        slide.addText("[No content generated for this slide yet]", {
          x: T.MARGIN, y: top + 0.2, w: T.W - 2 * T.MARGIN, h: 0.5, fontSize: 14, italic: true, color: T.muted, fontFace: ctx.brand.fontBody,
        });
        return;
      }
      const areaH = (T.H - 0.7) - top;
      const rowH = Math.min(1.0, areaH / rows.length);
      rows.forEach(function (b, i) {
        const y = top + i * rowH;
        // Accent index chip.
        slide.addShape(ctx.ShapeType.rect, {
          x: T.MARGIN, y: y + 0.04, w: 0.12, h: rowH - 0.16, fill: { color: ctx.brand.accent }, line: { type: "none" },
        });
        const tx = T.MARGIN + 0.32;
        const parts = [{ text: b.title || "", options: { bold: true, fontSize: 15, color: T.ink, breakLine: !!b.desc } }];
        if (b.desc) parts.push({ text: b.desc, options: { fontSize: 12, color: T.muted, breakLine: true } });
        slide.addText(parts, {
          x: tx, y: y, w: T.W - tx - T.MARGIN, h: rowH, fontFace: ctx.brand.fontBody,
          align: ctx.AlignH.left, valign: ctx.AlignV.middle, shrinkText: true,
        });
      });
    },

    // Device / scene image — introVignette / deviceMoment / scenePhoto /
    // CX still. Text left, image right (device chrome omitted).
    deviceSceneImage: function (slide, ns, ctx) {
      const hasImg = ns.image && ns.image.dataUrl;
      const textW = hasImg ? (T.W * 0.5 - T.MARGIN) : (T.W - 2 * T.MARGIN);
      const top = header(slide, ns, ctx, { titleW: textW });
      if (ns.sub) {
        slide.addText(ns.sub, {
          x: T.MARGIN, y: top, w: textW, h: 2.4, fontSize: 15, color: T.muted,
          fontFace: ctx.brand.fontBody, align: ctx.AlignH.left, valign: ctx.AlignV.top, shrinkText: true,
        });
      }
      if (hasImg) {
        placeImage(slide, ns.image, { x: T.W * 0.5 + 0.15, y: 0.9, w: T.W * 0.5 - T.MARGIN - 0.15, h: T.H - 1.9 }, ctx);
      }
    },

    // Split text / image — personaIntro / personaWishlist.
    splitTextImage: function (slide, ns, ctx) {
      const hasImg = ns.image && ns.image.dataUrl;
      const textW = hasImg ? (T.W * 0.55 - T.MARGIN) : (T.W - 2 * T.MARGIN);
      let top = header(slide, ns, ctx, { titleW: textW });
      const rows = (ns.bullets || []).slice(0, 6);
      if (rows.length) {
        const parts = [];
        rows.forEach(function (b) {
          parts.push({ text: "•  " + (b.title || ""), options: { bold: true, fontSize: 14, color: T.ink, breakLine: !b.desc } });
          if (b.desc) parts.push({ text: "   " + b.desc, options: { fontSize: 12, color: T.muted, breakLine: true } });
        });
        slide.addText(parts, {
          x: T.MARGIN, y: top, w: textW, h: T.H - top - 0.7, fontFace: ctx.brand.fontBody,
          align: ctx.AlignH.left, valign: ctx.AlignV.top, shrinkText: true, lineSpacingMultiple: 1.1,
        });
      } else if (ns.sub) {
        slide.addText(ns.sub, {
          x: T.MARGIN, y: top, w: textW, h: 2.0, fontSize: 15, color: T.muted, fontFace: ctx.brand.fontBody, shrinkText: true,
        });
      }
      if (hasImg) {
        placeImage(slide, ns.image, { x: T.W * 0.58, y: 0.9, w: T.W * 0.42 - T.MARGIN, h: T.H - 1.9 }, ctx);
      }
    },

    // Persona card — personaCard / unifiedProfile. Portrait + facets + quote.
    personaCard: function (slide, ns, ctx) {
      const hasImg = ns.image && ns.image.dataUrl;
      const top = header(slide, ns, ctx, { titleW: T.W - 2 * T.MARGIN });
      const leftX = T.MARGIN;
      const imgW = 2.6;
      let contentX = leftX;
      if (hasImg) {
        placeImage(slide, ns.image, { x: leftX, y: top, w: imgW, h: T.H - top - 0.7 }, ctx, true);
        contentX = leftX + imgW + 0.4;
      }
      const contentW = T.W - contentX - T.MARGIN;
      // Facets as a 3-up chip row.
      const facets = (ns.facets || []).slice(0, 3);
      let y = top;
      if (facets.length) {
        const chipW = (contentW - (facets.length - 1) * 0.2) / facets.length;
        facets.forEach(function (fct, i) {
          const cx = contentX + i * (chipW + 0.2);
          slide.addShape(ctx.ShapeType.roundRect, { x: cx, y: y, w: chipW, h: 1.1, fill: { color: T.band }, line: { color: T.line, width: 1 }, rectRadius: 0.08 });
          slide.addText([
            { text: fct.value || "", options: { bold: true, fontSize: 18, color: ctx.brand.primary, breakLine: true } },
            { text: fct.label || "", options: { fontSize: 10, color: T.muted } },
          ], { x: cx + 0.1, y: y + 0.12, w: chipW - 0.2, h: 0.86, align: ctx.AlignH.center, valign: ctx.AlignV.middle, fontFace: ctx.brand.fontBody, shrinkText: true });
        });
        y += 1.35;
      }
      if (ns.quote) {
        slide.addText("“" + ns.quote + "”", {
          x: contentX, y: y, w: contentW, h: T.H - y - 0.7, fontSize: 16, italic: true, color: T.ink,
          fontFace: ctx.brand.fontHeading, align: ctx.AlignH.left, valign: ctx.AlignV.top, shrinkText: true,
        });
      }
    },

    // Agent chat — agentConversation. Stacked chat bubbles.
    agentChat: function (slide, ns, ctx) {
      const top = header(slide, ns, ctx);
      const turns = (ns.chat || []).slice(0, 8);
      if (!turns.length) return;
      const areaH = (T.H - 0.7) - top;
      const rowH = Math.min(0.9, areaH / turns.length);
      turns.forEach(function (t, i) {
        const y = top + i * rowH;
        const isUser = t.role === "user";
        const isCard = t.role === "card";
        const bw = T.W * 0.62;
        const bx = isUser ? (T.W - T.MARGIN - bw) : T.MARGIN;
        const fill = isCard ? ctx.brand.accent : (isUser ? T.band : ctx.brand.secondary);
        const fg = isCard ? T.ink : (isUser ? T.ink : "FFFFFF");
        slide.addShape(ctx.ShapeType.roundRect, { x: bx, y: y, w: bw, h: rowH - 0.14, fill: { color: fill }, line: { type: "none" }, rectRadius: 0.08 });
        slide.addText(((t.emoji ? t.emoji + " " : "") + (t.text || "")), {
          x: bx + 0.15, y: y, w: bw - 0.3, h: rowH - 0.14, fontSize: 12, color: fg,
          fontFace: ctx.brand.fontBody, align: ctx.AlignH.left, valign: ctx.AlignV.middle, shrinkText: true,
        });
      });
    },

    // Metric scorecard — kpiScorecard. Grid of value/label tiles.
    metricScorecard: function (slide, ns, ctx) {
      const top = header(slide, ns, ctx);
      const metrics = (ns.metrics || []).slice(0, 6);
      if (!metrics.length) return;
      const cols = metrics.length <= 3 ? metrics.length : 3;
      const rowsN = Math.ceil(metrics.length / cols);
      const gap = 0.3;
      const gridW = T.W - 2 * T.MARGIN;
      const gridH = (T.H - 0.7) - top;
      const cw = (gridW - (cols - 1) * gap) / cols;
      const ch = (gridH - (rowsN - 1) * gap) / rowsN;
      metrics.forEach(function (m, i) {
        const r = Math.floor(i / cols), c = i % cols;
        const x = T.MARGIN + c * (cw + gap);
        const y = top + r * (ch + gap);
        slide.addShape(ctx.ShapeType.roundRect, { x: x, y: y, w: cw, h: ch, fill: { color: T.band }, line: { color: ctx.brand.primary, width: 1 }, rectRadius: 0.1 });
        slide.addText([
          { text: (m.icon ? m.icon + " " : "") + (m.value || ""), options: { bold: true, fontSize: 30, color: ctx.brand.primary, breakLine: true } },
          { text: m.label || "", options: { fontSize: 12, color: T.muted } },
        ], { x: x + 0.15, y: y + 0.12, w: cw - 0.3, h: ch - 0.24, align: ctx.AlignH.center, valign: ctx.AlignV.middle, fontFace: ctx.brand.fontBody, shrinkText: true });
      });
    },

    // CX with no still — labeled placeholder box (component name + URL).
    placeholderCx: function (slide, ns, ctx) {
      const top = header(slide, ns, ctx);
      const cx = ns.cxFallback || {};
      const bx = T.MARGIN, by = top + 0.1, bw = T.W - 2 * T.MARGIN, bh = (T.H - 0.7) - top - 0.1;
      slide.addShape(ctx.ShapeType.roundRect, {
        x: bx, y: by, w: bw, h: bh, fill: { color: T.band },
        line: { color: ctx.brand.secondary, width: 1.5, dashType: "dash" }, rectRadius: 0.1,
      });
      slide.addText([
        { text: "🖥  " + (cx.name || ns.title || "CX Component"), options: { bold: true, fontSize: 20, color: T.ink, breakLine: true } },
        { text: "Live component — add a still image in the builder to embed it here.", options: { fontSize: 13, color: T.muted, breakLine: true } },
        { text: cx.targetUrl || "", options: { fontSize: 12, color: ctx.brand.secondary } },
      ], { x: bx + 0.3, y: by, w: bw - 0.6, h: bh, align: ctx.AlignH.center, valign: ctx.AlignV.middle, fontFace: ctx.brand.fontBody, shrinkText: true });
    },
  };

  // ─── Image placement (contain, centered in box) ────────────────
  function placeImage(slide, img, box, ctx, rounded) {
    const iw = img.w || 16, ih = img.h || 9;
    const ar = iw / ih, boxAr = box.w / box.h;
    let w = box.w, h = box.h, x = box.x, y = box.y;
    if (ar > boxAr) { h = box.w / ar; y = box.y + (box.h - h) / 2; }
    else { w = box.h * ar; x = box.x + (box.w - w) / 2; }
    try {
      slide.addImage({ data: img.dataUrl, x: x, y: y, w: w, h: h, rounding: !!rounded });
    } catch (e) {
      try { console.warn("[pptx] addImage failed:", e); } catch (_) {}
    }
  }

  global.HOLO_PPTX = {
    downloadDeckPptx: downloadDeckPptx,
    buildDeck:        buildDeck,
    safeSlug:         safeSlug,
    TEMPLATE_RENDERERS: TEMPLATE_RENDERERS,
  };
})(window);
