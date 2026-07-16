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
  // Chips/labels that come straight off the adapter cfg (product names, etc.)
  // haven't been through the model's plain() chokepoint — strip emoji/HTML here
  // so no tofu boxes reach the deck. Model-resolved fields are already clean.
  const plainText = MODEL.plain || function (s) { return String(s == null ? "" : s); };

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

  // ─── Data Cloud console: per-facet "LWC" pane body ─────────────
  // Mirrors /demo's unifiedProfile paneBody (demo-deck-renderer.js ~486-524):
  // each facet gets a purpose-built layout instead of a flat table, and it
  // fills the whole [y, y+h] box so the console never leaves a big empty gap.
  //   affinities → labeled meter bars   signals → dotted timeline
  //   predicted  → Next Best Action card  identity/other → detail grid
  function profilePaneBody(slide, ctx, facet, x, y, w, h, allFacets) {
    const rows = (facet.rows || []).slice(0, 6);
    const key = facet.key || "identity";
    if (!rows.length) return;

    // A word→fill-fraction map so "Very high / High / Medium / Low" become bars.
    function meterFrac(v) {
      const s = String(v || "").toLowerCase();
      if (/very high|98|primed|very strong/.test(s)) return 0.96;
      if (/high|strong|elevated/.test(s))            return 0.8;
      if (/medium|moderate/.test(s))                 return 0.55;
      if (/low/.test(s))                             return 0.3;
      return 0.7;
    }
    // Affinity meter bars (label + rating + filled track). Shared by the
    // Affinities tab and the Identity view's embedded affinity widget.
    function drawMeters(meterRows, mx, my, mw, mh) {
      const list = (meterRows || []).slice(0, 5);
      if (!list.length) return;
      const rowH = Math.min(0.6, mh / list.length);
      list.forEach(function (r, i) {
        const ry = my + i * rowH;
        slide.addText(r.label || "", {
          x: mx, y: ry, w: mw, h: 0.2, fontSize: 9.5, bold: true, color: T.ink,
          fontFace: ctx.brand.fontBody, align: ctx.AlignH.left, valign: ctx.AlignV.middle, shrinkText: true,
        });
        slide.addText(r.value || "", {
          x: mx, y: ry, w: mw, h: 0.2, fontSize: 8.5, color: ctx.brand.primary,
          fontFace: ctx.brand.fontBody, align: ctx.AlignH.right, valign: ctx.AlignV.middle,
        });
        const trackY = ry + 0.23, trackH = 0.11;
        slide.addShape(ctx.ShapeType.roundRect, { x: mx, y: trackY, w: mw, h: trackH, fill: { color: "FFFFFF" }, line: { color: T.line, width: 0.5 }, rectRadius: 0.055 });
        slide.addShape(ctx.ShapeType.roundRect, { x: mx, y: trackY, w: Math.max(0.12, mw * meterFrac(r.value)), h: trackH, fill: { color: ctx.brand.primary }, line: { type: "none" }, rectRadius: 0.055 });
      });
    }

    if (key === "affinities") {
      drawMeters(rows, x, y, w, h);
      return;
    }

    if (key === "signals") {
      const rowH = Math.min(0.7, h / rows.length);
      const dotX = x + 0.06;
      // Vertical rail behind the dots.
      slide.addShape(ctx.ShapeType.rect, { x: dotX + 0.055, y: y + 0.08, w: 0.02, h: Math.max(0.1, (rows.length - 1) * rowH), fill: { color: T.line }, line: { type: "none" } });
      rows.forEach(function (r, i) {
        const ry = y + i * rowH;
        slide.addShape(ctx.ShapeType.ellipse, { x: dotX, y: ry + 0.04, w: 0.14, h: 0.14, fill: { color: ctx.brand.accent }, line: { color: ctx.brand.primary, width: 1 } });
        slide.addText([
          { text: (r.label || "") + "", options: { fontSize: 8, bold: true, color: T.muted, charSpacing: 1, breakLine: true } },
          { text: (r.value || "") + "", options: { fontSize: 10.5, bold: true, color: T.ink } },
        ], { x: dotX + 0.3, y: ry, w: w - 0.36, h: rowH - 0.08, fontFace: ctx.brand.fontBody, align: ctx.AlignH.left, valign: ctx.AlignV.top, shrinkText: true });
      });
      return;
    }

    if (key === "predicted") {
      // Next Best Action card: eyebrow + headline (row[0].value) + supporting
      // detail rows + a faux action button.
      const headline = (rows[0] && rows[0].value) || "Personalized offer";
      const rest = rows.slice(1);
      slide.addShape(ctx.ShapeType.roundRect, { x: x, y: y, w: w, h: h, fill: { color: T.band }, line: { color: T.line, width: 1 }, rectRadius: 0.06 });
      slide.addText("NEXT BEST ACTION", {
        x: x + 0.2, y: y + 0.16, w: w - 0.4, h: 0.22, fontSize: 8, bold: true, color: ctx.brand.primary,
        fontFace: ctx.brand.fontBody, align: ctx.AlignH.left, valign: ctx.AlignV.middle, charSpacing: 2,
      });
      slide.addText(headline, {
        x: x + 0.2, y: y + 0.4, w: w - 0.4, h: 0.5, fontSize: 15, bold: true, color: T.ink,
        fontFace: ctx.brand.fontHeading, align: ctx.AlignH.left, valign: ctx.AlignV.top, shrinkText: true,
      });
      let py2 = y + 0.94;
      const availH = (y + h - 0.62) - py2;
      const rH = rest.length ? Math.min(0.4, availH / rest.length) : 0;
      rest.forEach(function (r, i) {
        const ry = py2 + i * rH;
        slide.addText(r.label || "", { x: x + 0.2, y: ry, w: w * 0.42, h: rH, fontSize: 9, color: T.muted, fontFace: ctx.brand.fontBody, align: ctx.AlignH.left, valign: ctx.AlignV.middle, shrinkText: true });
        slide.addText(r.value || "", { x: x + 0.2 + w * 0.42, y: ry, w: w * 0.58 - 0.4, h: rH, fontSize: 9.5, bold: true, color: T.ink, fontFace: ctx.brand.fontBody, align: ctx.AlignH.left, valign: ctx.AlignV.middle, shrinkText: true });
      });
      // Faux "Launch action" button pinned to the card bottom.
      const btnW = 1.5, btnH = 0.34, btnY = y + h - btnH - 0.16;
      slide.addShape(ctx.ShapeType.roundRect, { x: x + 0.2, y: btnY, w: btnW, h: btnH, fill: { color: ctx.brand.primary }, line: { type: "none" }, rectRadius: 0.05 });
      slide.addText("Launch action", { x: x + 0.2, y: btnY, w: btnW, h: btnH, fontSize: 9, bold: true, color: "FFFFFF", fontFace: ctx.brand.fontBody, align: ctx.AlignH.center, valign: ctx.AlignV.middle });
      return;
    }

    // identity / demographics / engagement / value → a COMPACT two-column
    // detail grid in a short top block, then an embedded "Affinities" meter
    // widget card filling the space below (a second LWC-style component, so
    // the console reads like a real Salesforce workspace, not a tall list).
    const affinityRows = (allFacets || []).reduce(function (acc, f) {
      return acc || (f && f.key === "affinities" ? f.rows : null);
    }, null);

    // Top block: fields in 2 columns, 2 per row → short, dense.
    const cols = 2;
    const fieldRows = Math.ceil(rows.length / cols);
    const fRowH = 0.36;
    const gridH = fieldRows * fRowH;
    const colW = w / cols;
    rows.forEach(function (r, i) {
      const cc = i % cols, rr = Math.floor(i / cols);
      const fx = x + cc * colW, fy = y + rr * fRowH;
      slide.addText([
        { text: (r.label || "") + "", options: { fontSize: 7.5, bold: true, color: T.muted, charSpacing: 1, breakLine: true } },
        { text: (r.value || "") + "", options: { fontSize: 10, bold: true, color: T.ink } },
      ], { x: fx, y: fy, w: colW - 0.12, h: fRowH - 0.03, fontFace: ctx.brand.fontBody, align: ctx.AlignH.left, valign: ctx.AlignV.middle, shrinkText: true });
    });

    // Affinity widget card below the fields.
    if (affinityRows && affinityRows.length) {
      const wy = y + gridH + 0.16;
      const wh = (y + h) - wy;
      if (wh > 0.6) {
        slide.addShape(ctx.ShapeType.roundRect, { x: x, y: wy, w: w, h: wh, fill: { color: T.band }, line: { color: T.line, width: 1 }, rectRadius: 0.06 });
        slide.addText("TOP AFFINITIES", {
          x: x + 0.18, y: wy + 0.12, w: w - 0.36, h: 0.2, fontSize: 8, bold: true, color: ctx.brand.primary,
          fontFace: ctx.brand.fontBody, align: ctx.AlignH.left, valign: ctx.AlignV.middle, charSpacing: 2,
        });
        drawMeters(affinityRows, x + 0.18, wy + 0.42, w - 0.36, wh - 0.56);
      }
    }
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
          x: 1.6, y: 4.7, w: T.W - 3.2, h: 1.0, fontSize: 18, color: "D6DCE8",
          fontFace: ctx.brand.fontBody, align: ctx.AlignH.center, valign: ctx.AlignV.top, shrinkText: true,
        });
      }
      // "Powered by" product chips (mirrors /demo hero's chip row).
      const chips = (ns.products || []).slice(0, 5).map(plainText).filter(Boolean);
      if (chips.length) {
        slide.addText(chips.join("     •     "), {
          x: 1.0, y: 5.9, w: T.W - 2.0, h: 0.5, fontSize: 12, bold: true, color: ctx.brand.accent,
          fontFace: ctx.brand.fontBody, align: ctx.AlignH.center, valign: ctx.AlignV.middle, charSpacing: 1, shrinkText: true,
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
      const chips = (ns.chips || []).map(plainText).filter(Boolean);
      const subH = chips.length ? 2.0 : 2.6;
      if (ns.sub) {
        slide.addText(ns.sub, {
          x: T.MARGIN, y: top, w: textW, h: subH, fontSize: 15, color: T.muted,
          fontFace: ctx.brand.fontBody, align: ctx.AlignH.left, valign: ctx.AlignV.top, shrinkText: true,
        });
      }
      if (chips.length) {
        slide.addText(chips.join("   •   "), {
          x: T.MARGIN, y: top + subH + 0.1, w: textW, h: 0.5, fontSize: 12, bold: true, color: ctx.brand.secondary,
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
      // Facets as a chip grid. personaCard shows ~3 stats; unifiedProfile
      // flattens up to ~6 resolved-profile rows into a 3-col grid.
      const facets = (ns.facets || []).slice(0, 6);
      let y = top;
      if (facets.length) {
        const cols = facets.length <= 3 ? facets.length : 3;
        const rowsN = Math.ceil(facets.length / cols);
        const gap = 0.2, chipH = rowsN > 1 ? 0.95 : 1.1;
        const chipW = (contentW - (cols - 1) * gap) / cols;
        facets.forEach(function (fct, i) {
          const r = Math.floor(i / cols), c = i % cols;
          const cx = contentX + c * (chipW + gap);
          const cy = y + r * (chipH + gap);
          slide.addShape(ctx.ShapeType.roundRect, { x: cx, y: cy, w: chipW, h: chipH, fill: { color: T.band }, line: { color: T.line, width: 1 }, rectRadius: 0.08 });
          slide.addText([
            { text: plainText(fct.value || ""), options: { bold: true, fontSize: rowsN > 1 ? 13 : 18, color: ctx.brand.primary, breakLine: true } },
            { text: plainText(fct.label || ""), options: { fontSize: rowsN > 1 ? 9 : 10, color: T.muted } },
          ], { x: cx + 0.1, y: cy + 0.1, w: chipW - 0.2, h: chipH - 0.2, align: ctx.AlignH.center, valign: ctx.AlignV.middle, fontFace: ctx.brand.fontBody, shrinkText: true });
        });
        y += rowsN * (chipH + gap) + 0.15;
      }
      if (ns.quote && y < T.H - 1.1) {
        slide.addText("“" + ns.quote + "”", {
          x: contentX, y: y, w: contentW, h: T.H - y - 0.7, fontSize: 16, italic: true, color: T.ink,
          fontFace: ctx.brand.fontHeading, align: ctx.AlignH.left, valign: ctx.AlignV.top, shrinkText: true,
        });
      }
    },

    // Unified profile — unifiedProfile. A native reproduction of /demo's Data
    // Cloud console: browser bar, profile rail (avatar monogram + name/role/
    // segment + LTV / Orders KPIs), facet tabs, and the active facet's rows.
    // This "blows up" the actual profile UI rather than showing loose chips.
    profileConsole: function (slide, ns, ctx) {
      const c = ns.console;
      if (!c) { return TEMPLATE_RENDERERS.personaCard(slide, ns, ctx); }
      const top = header(slide, ns, ctx, { titleW: T.W - 2 * T.MARGIN, titleH: 0.8, titleSize: 26 });
      // Console card fills the remaining body.
      const cx0 = T.MARGIN, cyTop = top;
      const cw = T.W - 2 * T.MARGIN;
      const chBottom = T.H - 0.72;
      const chH = chBottom - cyTop;
      // Outer window frame.
      slide.addShape(ctx.ShapeType.roundRect, {
        x: cx0, y: cyTop, w: cw, h: chH, fill: { color: "FFFFFF" },
        line: { color: T.line, width: 1 }, rectRadius: 0.08,
      });
      // Browser/app title bar.
      const barH = 0.34;
      slide.addShape(ctx.ShapeType.rect, { x: cx0, y: cyTop, w: cw, h: barH, fill: { color: ctx.brand.navy }, line: { type: "none" } });
      slide.addText((c.brand || "BRAND") + "   ·   " + (c.name || ""), {
        x: cx0 + 0.2, y: cyTop, w: cw - 0.4, h: barH, fontSize: 10, bold: true,
        color: "FFFFFF", fontFace: ctx.brand.fontBody, align: ctx.AlignH.left, valign: ctx.AlignV.middle, charSpacing: 2,
      });

      const bodyY = cyTop + barH + 0.12;
      const bodyH = chBottom - bodyY - 0.14;
      // ── Left rail: avatar + identity + KPIs ──
      const railW = Math.min(3.0, cw * 0.28);
      const railX = cx0 + 0.14;
      slide.addShape(ctx.ShapeType.roundRect, {
        x: railX, y: bodyY, w: railW, h: bodyH, fill: { color: ctx.brand.navy }, line: { type: "none" }, rectRadius: 0.06,
      });
      // Avatar monogram (circle).
      const avD = 0.9, avX = railX + (railW - avD) / 2, avY = bodyY + 0.22;
      slide.addShape(ctx.ShapeType.ellipse, { x: avX, y: avY, w: avD, h: avD, fill: { color: ctx.brand.primary }, line: { type: "none" } });
      slide.addText(c.monogram || "C", {
        x: avX, y: avY, w: avD, h: avD, fontSize: 26, bold: true, color: "FFFFFF",
        fontFace: ctx.brand.fontHeading, align: ctx.AlignH.center, valign: ctx.AlignV.middle,
      });
      let ry = avY + avD + 0.12;
      slide.addText(c.name || "Customer", {
        x: railX + 0.12, y: ry, w: railW - 0.24, h: 0.34, fontSize: 15, bold: true, color: "FFFFFF",
        fontFace: ctx.brand.fontHeading, align: ctx.AlignH.center, valign: ctx.AlignV.middle, shrinkText: true,
      });
      ry += 0.34;
      slide.addText([
        { text: (c.role || "") + "", options: { color: "C9D2E3", breakLine: true } },
        { text: (c.segment || "") + "", options: { color: "8A97AE" } },
      ], {
        x: railX + 0.12, y: ry, w: railW - 0.24, h: 0.6, fontSize: 9,
        fontFace: ctx.brand.fontBody, align: ctx.AlignH.center, valign: ctx.AlignV.top, shrinkText: true,
      });
      ry += 0.66;
      // KPI tiles.
      (c.kpis || []).slice(0, 2).forEach(function (k) {
        slide.addShape(ctx.ShapeType.roundRect, {
          x: railX + 0.16, y: ry, w: railW - 0.32, h: 0.56,
          fill: { color: "16273D" }, line: { color: "27364C", width: 0.75 }, rectRadius: 0.05,
        });
        slide.addText([
          { text: k.value + "", options: { bold: true, fontSize: 14, color: ctx.brand.accent, breakLine: true } },
          { text: (k.label || "") + "", options: { fontSize: 8, color: "9AA6BC" } },
        ], {
          x: railX + 0.2, y: ry + 0.04, w: railW - 0.4, h: 0.48,
          fontFace: ctx.brand.fontBody, align: ctx.AlignH.center, valign: ctx.AlignV.middle, shrinkText: true,
        });
        ry += 0.66;
      });

      // ── Right pane: facet tabs + active-facet LWC-style body ──
      const paneX = railX + railW + 0.24;
      const paneW = (cx0 + cw) - paneX - 0.2;
      const facets = (c.facets || []);
      const active = facets[0] || { key: "identity", label: "Profile", eyebrow: "Resolved profile", rows: [] };
      // Tab row (all facet labels; first highlighted like the live show(0)).
      const tabH = 0.34, tabGap = 0.1;
      const tabW = facets.length ? (paneW - (facets.length - 1) * tabGap) / facets.length : paneW;
      facets.forEach(function (fct, i) {
        const tx = paneX + i * (tabW + tabGap);
        const on = i === 0;
        slide.addShape(ctx.ShapeType.roundRect, {
          x: tx, y: bodyY, w: tabW, h: tabH,
          fill: { color: on ? ctx.brand.primary : T.band },
          line: { color: on ? ctx.brand.primary : T.line, width: 0.75 }, rectRadius: 0.05,
        });
        slide.addText(fct.label || "", {
          x: tx + 0.04, y: bodyY, w: tabW - 0.08, h: tabH, fontSize: 9, bold: on,
          color: on ? "FFFFFF" : T.muted, fontFace: ctx.brand.fontBody,
          align: ctx.AlignH.center, valign: ctx.AlignV.middle, shrinkText: true,
        });
      });
      // Facet header — eyebrow ABOVE the label (stacked, no overlap).
      let py = bodyY + tabH + 0.2;
      slide.addText((active.eyebrow || "").toUpperCase(), {
        x: paneX, y: py, w: paneW, h: 0.22, fontSize: 8, bold: true,
        color: ctx.brand.primary, fontFace: ctx.brand.fontBody, align: ctx.AlignH.left, valign: ctx.AlignV.middle, charSpacing: 2,
      });
      py += 0.24;
      slide.addText(active.label || "", {
        x: paneX, y: py, w: paneW, h: 0.34, fontSize: 15, bold: true,
        color: T.ink, fontFace: ctx.brand.fontHeading, align: ctx.AlignH.left, valign: ctx.AlignV.middle,
      });
      py += 0.42;
      // Body fills the remaining pane height so there's no dead whitespace —
      // dispatched per facet like /demo's paneBody (affinity meters, signal
      // timeline, next-best-action card, else a resolved detail grid).
      const bodyBottom = chBottom - 0.2;
      profilePaneBody(slide, ctx, active, paneX, py, paneW, bodyBottom - py, facets);
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
        { text: (cx.name || ns.title || "CX Component"), options: { bold: true, fontSize: 20, color: T.ink, breakLine: true } },
        { text: "Live component — add a still image in the builder to embed it here.", options: { fontSize: 13, color: T.muted, breakLine: true } },
        { text: cx.targetUrl || "", options: { fontSize: 12, color: ctx.brand.secondary } },
      ], { x: bx + 0.3, y: by, w: bw - 0.6, h: bh, align: ctx.AlignH.center, valign: ctx.AlignV.middle, fontFace: ctx.brand.fontBody, shrinkText: true });
    },

    // Icon list — scenePhoto. Full-bleed scene image left, structured
    // eyebrow/title/sub rows right (mirrors /demo's .dd-iconlist).
    iconList: function (slide, ns, ctx) {
      const hasImg = ns.image && ns.image.dataUrl;
      const imgW = hasImg ? T.W * 0.42 : 0;
      if (hasImg) {
        placeImage(slide, ns.image, { x: T.MARGIN, y: 0.9, w: imgW - T.MARGIN, h: T.H - 1.9 }, ctx, true);
      }
      const contentX = hasImg ? imgW + 0.2 : T.MARGIN;
      const contentW = T.W - contentX - T.MARGIN;
      // Header (eyebrow + title) anchored on the content column.
      let y = T.MARGIN;
      if (ns.eyebrow) {
        slide.addText(ns.eyebrow.toUpperCase(), {
          x: contentX, y: y, w: contentW, h: 0.35, fontSize: 12, bold: true, color: ctx.brand.primary,
          fontFace: ctx.brand.fontBody, align: ctx.AlignH.left, charSpacing: 3,
        });
        y += 0.42;
      }
      if (ns.title) {
        slide.addText(ns.title, {
          x: contentX, y: y, w: contentW, h: 0.9, fontSize: 26, bold: true, color: T.ink,
          fontFace: ctx.brand.fontHeading, align: ctx.AlignH.left, valign: ctx.AlignV.top, shrinkText: true, autoFit: true,
        });
        y += 1.0;
      }
      const rows = (ns.rows || []).slice(0, 4);
      const areaH = (T.H - 0.7) - y;
      const rowH = rows.length ? Math.min(1.1, areaH / rows.length) : 0;
      rows.forEach(function (r, i) {
        const ry = y + i * rowH;
        slide.addShape(ctx.ShapeType.rect, { x: contentX, y: ry + 0.04, w: 0.1, h: rowH - 0.16, fill: { color: ctx.brand.accent }, line: { type: "none" } });
        const tx = contentX + 0.28;
        slide.addText([
          { text: plainText(r.eyebrow || "").toUpperCase(), options: { bold: true, fontSize: 9, color: ctx.brand.secondary, charSpacing: 2, breakLine: true } },
          { text: plainText(r.title || ""), options: { bold: true, fontSize: 14, color: T.ink, breakLine: !!r.sub } },
        ].concat(r.sub ? [{ text: plainText(r.sub), options: { fontSize: 11, color: T.muted } }] : []), {
          x: tx, y: ry, w: contentW - 0.28, h: rowH, fontFace: ctx.brand.fontBody,
          align: ctx.AlignH.left, valign: ctx.AlignV.middle, shrinkText: true,
        });
      });
    },

    // Quote + columns — storyFoundation / executiveSummary / currentFutureState.
    // Left framed quote card, right eyebrow + headline + labeled columns
    // (stat chips or prose) + optional chip row (mirrors /demo's twoPanel).
    quotePlusColumns: function (slide, ns, ctx) {
      const leftW = T.W * 0.36;
      const gx = T.MARGIN, gy = T.MARGIN, gw = leftW - T.MARGIN, gh = T.H - 2 * T.MARGIN;
      // Left quote card.
      if (ns.quote) {
        slide.addShape(ctx.ShapeType.roundRect, { x: gx, y: gy, w: gw, h: gh, fill: { color: ctx.brand.navy }, line: { type: "none" }, rectRadius: 0.1 });
        const parts = [];
        if (ns.quoteTag) parts.push({ text: plainText(ns.quoteTag).toUpperCase(), options: { bold: true, fontSize: 11, color: ctx.brand.accent, charSpacing: 2, breakLine: true } });
        parts.push({ text: "“" + ns.quote + "”", options: { fontSize: 17, italic: true, color: "FFFFFF", breakLine: true } });
        if (ns.stamp) parts.push({ text: plainText(ns.stamp), options: { fontSize: 11, color: "D6DCE8" } });
        slide.addText(parts, { x: gx + 0.3, y: gy + 0.3, w: gw - 0.6, h: gh - 0.6, fontFace: ctx.brand.fontHeading, align: ctx.AlignH.left, valign: ctx.AlignV.middle, lineSpacingMultiple: 1.15, shrinkText: true });
      }
      // Right column.
      const rx = leftW + 0.2, rw = T.W - rx - T.MARGIN;
      let y = T.MARGIN;
      if (ns.eyebrow) {
        slide.addText(ns.eyebrow.toUpperCase(), { x: rx, y: y, w: rw, h: 0.35, fontSize: 12, bold: true, color: ctx.brand.primary, fontFace: ctx.brand.fontBody, align: ctx.AlignH.left, charSpacing: 3 });
        y += 0.42;
      }
      if (ns.title) {
        slide.addText(ns.title, { x: rx, y: y, w: rw, h: 1.0, fontSize: 26, bold: true, color: T.ink, fontFace: ctx.brand.fontHeading, align: ctx.AlignH.left, valign: ctx.AlignV.top, shrinkText: true, autoFit: true });
        y += 1.05;
      }
      const cols = ns.columns || [];
      const isStat = cols.length && cols[0] && cols[0].value != null && cols[0].body == null;
      if (cols.length) {
        if (isStat) {
          // Value/label stat chips, stacked.
          const chipH = Math.min(1.1, ((T.H - 0.7) - y) / cols.length - 0.15);
          cols.forEach(function (c, i) {
            const cy = y + i * (chipH + 0.15);
            slide.addShape(ctx.ShapeType.roundRect, { x: rx, y: cy, w: rw, h: chipH, fill: { color: T.band }, line: { color: T.line, width: 1 }, rectRadius: 0.08 });
            slide.addText([
              { text: plainText(c.value || ""), options: { bold: true, fontSize: 15, color: ctx.brand.primary, breakLine: true } },
              { text: plainText(c.label || ""), options: { fontSize: 11, color: T.muted } },
            ], { x: rx + 0.2, y: cy + 0.08, w: rw - 0.4, h: chipH - 0.16, align: ctx.AlignH.left, valign: ctx.AlignV.middle, fontFace: ctx.brand.fontBody, shrinkText: true });
          });
          y += cols.length * (chipH + 0.15);
        } else {
          // Prose columns side by side (Challenge / Future / Capabilities).
          const gap = 0.2, cw = (rw - (cols.length - 1) * gap) / cols.length;
          const chipsH = (ns.chips && ns.chips.length) ? 0.5 : 0;
          const ch = (T.H - 0.7) - y - chipsH - (chipsH ? 0.15 : 0);
          cols.forEach(function (c, i) {
            const cx = rx + i * (cw + gap);
            slide.addText([
              { text: plainText(c.label || "").toUpperCase(), options: { bold: true, fontSize: 11, color: ctx.brand.secondary, charSpacing: 1.5, breakLine: true } },
              { text: plainText(c.body || ""), options: { fontSize: 12, color: T.ink } },
            ], { x: cx, y: y, w: cw, h: ch, align: ctx.AlignH.left, valign: ctx.AlignV.top, fontFace: ctx.brand.fontBody, shrinkText: true, lineSpacingMultiple: 1.05 });
          });
          y += ch + 0.15;
        }
      }
      // Optional chip row (currentFutureState "Powered by Salesforce").
      const chips = (ns.chips || []).map(plainText).filter(Boolean);
      if (chips.length) {
        const label = ns.chipsLabel ? (plainText(ns.chipsLabel) + ":  ") : "";
        slide.addText(label + chips.join("   •   "), {
          x: rx, y: Math.min(y, T.H - 1.1), w: rw, h: 0.5, fontSize: 11, bold: true, color: ctx.brand.primary,
          fontFace: ctx.brand.fontBody, align: ctx.AlignH.left, valign: ctx.AlignV.middle, shrinkText: true,
        });
      }
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
