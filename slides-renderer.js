// ════════════════════════════════════════════════════════════════
//  slides-renderer.js — buildBatchRequests(model)
//
//  Server-side Node analogue of builder/pptx-exporter.js's
//  TEMPLATE_RENDERERS. Turns the normalized export model
//  (HOLO_EXPORT_MODEL.buildExportModel → { meta, brand, slides })
//  into a flat list of Google Slides API request objects for a single
//  presentations.batchUpdate call.
//
//  The geometry mirrors the PPTX layout (a 13.33 × 7.5in / 16:9 page,
//  0.7in margin). Slides API positions/sizes are expressed in EMU
//  (914,400 per inch). Fonts + brand colors reuse the same tokens.
//
//  Images use ns.image.url (a signed, publicly-reachable GCS URL) —
//  the Slides API's createImage cannot take a base64 data URL, and the
//  browser already resolves the signed URL for us (export-model.js).
//
//  Public: buildBatchRequests(model) → { requests, pageSize }
// ════════════════════════════════════════════════════════════════

"use strict";

// ─── Geometry ──────────────────────────────────────────────────
// The layout numbers below are the SAME inch coordinates as
// pptx-exporter.js THEME (a 13.33 × 7.5in page). A newly-created Google
// Slides presentation, however, has a fixed native 16:9 page of
// 10 × 5.625in and the page size CANNOT be changed via the API. So we
// scale every inch coordinate by PAGE_SCALE (13.33→10, 7.5→5.625; both
// ≈ 0.75) before converting to EMU. Aspect ratio is preserved, so the
// layout matches the PPTX slide-for-slide, just at 75% linear size.
const EMU_PER_INCH = 914400;
const PAGE_SCALE = 10 / 13.33; // ≈ 0.75045 (7.5 * PAGE_SCALE ≈ 5.628 ≈ 16:9)
const IN = (v) => Math.round(v * PAGE_SCALE * EMU_PER_INCH);
const T = {
  W: 13.33, H: 7.5, MARGIN: 0.7,
  ink: "1A1A2E", muted: "6B7280", paper: "FFFFFF", band: "F5F7FF", line: "E2E6F0",
  font: "Inter",
};
const PAGE_SIZE = { width: { magnitude: IN(T.W), unit: "EMU" }, height: { magnitude: IN(T.H), unit: "EMU" } };

// Section labels — mirrors pptx-exporter.js sectionLabel().
function sectionLabel(id) {
  return ({
    "intro": "INTRODUCTION", "journey-map": "JOURNEY MAP", "meet-persona": "MEET THE PERSONA",
    "demo": "THE DEMO", "business-value": "BUSINESS VALUE",
  })[id] || String(id || "").toUpperCase();
}

// ─── Color helpers ─────────────────────────────────────────────
// Slides API wants rgbColor with 0..1 channels. Tokens are hex-without-#.
function rgb(hex) {
  const h = String(hex || "").replace(/^#/, "");
  const n = /^[0-9a-fA-F]{6}$/.test(h) ? h : "000000";
  return {
    red:   parseInt(n.slice(0, 2), 16) / 255,
    green: parseInt(n.slice(2, 4), 16) / 255,
    blue:  parseInt(n.slice(4, 6), 16) / 255,
  };
}
const solidFill = (hex) => ({ color: { rgbColor: rgb(hex) } });

// ─── ID generation ─────────────────────────────────────────────
// batchUpdate needs a unique objectId per created element. Deterministic
// counter keeps requests idempotent within one build (no Math.random).
function idGen(prefix) {
  let n = 0;
  return () => prefix + "_" + (++n);
}

// ─── Request primitives ────────────────────────────────────────
// Each returns an array of request objects appended to the batch.

// A rectangle/round-rect shape with an optional solid fill + outline.
function shapeReqs(pageId, id, kind, box, opts) {
  opts = opts || {};
  const reqs = [{
    createShape: {
      objectId: id,
      shapeType: kind === "round" ? "ROUND_RECTANGLE" : "RECTANGLE",
      elementProperties: {
        pageObjectId: pageId,
        size: { width: { magnitude: IN(box.w), unit: "EMU" }, height: { magnitude: IN(box.h), unit: "EMU" } },
        transform: { scaleX: 1, scaleY: 1, translateX: IN(box.x), translateY: IN(box.y), unit: "EMU" },
      },
    },
  }];
  if (opts.fill) {
    reqs.push({ updateShapeProperties: {
      objectId: id, fields: "shapeBackgroundFill.solidFill.color",
      shapeProperties: { shapeBackgroundFill: { solidFill: solidFill(opts.fill) } },
    } });
  }
  if (opts.outline) {
    reqs.push({ updateShapeProperties: {
      objectId: id, fields: "outline.outlineFill.solidFill.color,outline.weight,outline.dashStyle",
      shapeProperties: { outline: {
        outlineFill: { solidFill: solidFill(opts.outline) },
        weight: { magnitude: opts.outlineWeight || 1, unit: "PT" },
        dashStyle: opts.dash ? "DASH" : "SOLID",
      } },
    } });
  }
  return reqs;
}

// A text box: create shape (no fill) → insert text → style it.
// `runs` is [{ text, bold?, size?, color?, italic? }]; joined into one
// string, then per-run style updates by character range.
function textBoxReqs(pageId, id, box, runs, opts) {
  opts = opts || {};
  const reqs = [{
    createShape: {
      objectId: id, shapeType: "TEXT_BOX",
      elementProperties: {
        pageObjectId: pageId,
        size: { width: { magnitude: IN(box.w), unit: "EMU" }, height: { magnitude: IN(box.h), unit: "EMU" } },
        transform: { scaleX: 1, scaleY: 1, translateX: IN(box.x), translateY: IN(box.y), unit: "EMU" },
      },
    },
  }];
  const parts = (runs || []).filter((r) => r && String(r.text || "").length);
  if (!parts.length) return reqs;
  const full = parts.map((r) => r.text).join("");
  reqs.push({ insertText: { objectId: id, insertionIndex: 0, text: full } });

  let cursor = 0;
  parts.forEach((r) => {
    const start = cursor;
    const end = cursor + r.text.length;
    cursor = end;
    reqs.push({ updateTextStyle: {
      objectId: id,
      textRange: { type: "FIXED_RANGE", startIndex: start, endIndex: end },
      fields: "bold,italic,fontSize,foregroundColor,fontFamily",
      style: {
        bold: !!r.bold, italic: !!r.italic,
        fontSize: { magnitude: r.size || 14, unit: "PT" },
        foregroundColor: { opaqueColor: { rgbColor: rgb(r.color || T.ink) } },
        fontFamily: r.font || opts.font || T.font,
      },
    } });
  });
  // Paragraph alignment + vertical anchoring apply to the whole box.
  reqs.push({ updateParagraphStyle: {
    objectId: id, textRange: { type: "ALL" }, fields: "alignment",
    style: { alignment: (opts.align || "START") },
  } });
  if (opts.valign) {
    reqs.push({ updateShapeProperties: {
      objectId: id, fields: "contentAlignment",
      shapeProperties: { contentAlignment: opts.valign },
    } });
  }
  return reqs;
}

// Image (contain within box, centered) — mirrors pptx placeImage().
function imageReqs(pageId, id, url, box, img) {
  const iw = (img && img.w) || 16, ih = (img && img.h) || 9;
  const ar = iw / ih, boxAr = box.w / box.h;
  let w = box.w, h = box.h, x = box.x, y = box.y;
  if (ar > boxAr) { h = box.w / ar; y = box.y + (box.h - h) / 2; }
  else { w = box.h * ar; x = box.x + (box.w - w) / 2; }
  return [{
    createImage: {
      objectId: id, url: url,
      elementProperties: {
        pageObjectId: pageId,
        size: { width: { magnitude: IN(w), unit: "EMU" }, height: { magnitude: IN(h), unit: "EMU" } },
        transform: { scaleX: 1, scaleY: 1, translateX: IN(x), translateY: IN(y), unit: "EMU" },
      },
    },
  }];
}

// Set the whole page background color (used by title/divider slides).
function pageBgReqs(pageId, hex) {
  return [{ updatePageProperties: {
    objectId: pageId, fields: "pageBackgroundFill.solidFill.color",
    pageProperties: { pageBackgroundFill: { solidFill: solidFill(hex) } },
  } }];
}

// ─── Shared chrome (footer accent rule + section label) ─────────
function footer(pageId, ns, brand, nid) {
  const reqs = shapeReqs(pageId, nid(), "rect",
    { x: 0, y: T.H - 0.28, w: T.W, h: 0.06 }, { fill: brand.primary });
  if (ns.sectionId) {
    reqs.push(...textBoxReqs(pageId, nid(),
      { x: T.MARGIN, y: T.H - 0.5, w: T.W - 2 * T.MARGIN, h: 0.3 },
      [{ text: sectionLabel(ns.sectionId), size: 9, color: T.muted, font: brand.fontBody }],
      { align: "START" }));
  }
  return reqs;
}

// Eyebrow + big title header; returns the y-offset below the header.
function header(pageId, ns, brand, nid, opts) {
  opts = opts || {};
  const reqs = [];
  let y = T.MARGIN;
  const titleW = opts.titleW || (T.W - 2 * T.MARGIN);
  if (ns.eyebrow) {
    reqs.push(...textBoxReqs(pageId, nid(),
      { x: T.MARGIN, y: y, w: T.W - 2 * T.MARGIN, h: 0.35 },
      [{ text: ns.eyebrow.toUpperCase(), bold: true, size: 12, color: brand.primary, font: brand.fontBody }],
      { align: "START" }));
    y += 0.42;
  }
  const titleText = opts.title != null ? opts.title : ns.title;
  if (titleText) {
    const titleH = opts.titleH || 1.0;
    reqs.push(...textBoxReqs(pageId, nid(),
      { x: T.MARGIN, y: y, w: titleW, h: titleH },
      [{ text: titleText, bold: true, size: opts.titleSize || 30, color: T.ink, font: brand.fontHeading }],
      { align: "START", valign: "TOP" }));
    y += titleH + 0.12;
  }
  return { reqs, y };
}

// ─── Template renderers ────────────────────────────────────────
// Each returns { reqs, bg? }; bg (if set) recolors the whole page.
const RENDERERS = {
  titleSlide(pageId, ns, brand, nid) {
    const reqs = [];
    reqs.push(...shapeReqs(pageId, nid(), "rect", { x: 0, y: 0, w: 0.28, h: T.H }, { fill: brand.primary }));
    if (ns.eyebrow) {
      reqs.push(...textBoxReqs(pageId, nid(), { x: 1.0, y: 2.1, w: T.W - 2.0, h: 0.5 },
        [{ text: ns.eyebrow.toUpperCase(), bold: true, size: 15, color: brand.accent, font: brand.fontBody }],
        { align: "CENTER" }));
    }
    reqs.push(...textBoxReqs(pageId, nid(), { x: 1.0, y: 2.6, w: T.W - 2.0, h: 1.9 },
      [{ text: ns.title || "Customer Story", bold: true, size: 46, color: "FFFFFF", font: brand.fontHeading }],
      { align: "CENTER", valign: "MIDDLE" }));
    if (ns.sub) {
      reqs.push(...textBoxReqs(pageId, nid(), { x: 1.6, y: 4.7, w: T.W - 3.2, h: 1.2 },
        [{ text: ns.sub, size: 18, color: "D6DCE8", font: brand.fontBody }], { align: "CENTER", valign: "TOP" }));
    }
    return { reqs, bg: brand.navy };
  },

  sectionDivider(pageId, ns, brand, nid) {
    const reqs = [];
    if (ns.eyebrow) {
      reqs.push(...textBoxReqs(pageId, nid(), { x: 1.0, y: 2.5, w: T.W - 2.0, h: 0.5 },
        [{ text: ns.eyebrow.toUpperCase(), bold: true, size: 16, color: "FFFFFF", font: brand.fontBody }],
        { align: "CENTER" }));
    }
    reqs.push(...textBoxReqs(pageId, nid(), { x: 1.0, y: 3.0, w: T.W - 2.0, h: 1.6 },
      [{ text: ns.title || sectionLabel(ns.sectionId), bold: true, size: 40, color: "FFFFFF", font: brand.fontHeading }],
      { align: "CENTER", valign: "MIDDLE" }));
    if (ns.sub) {
      reqs.push(...textBoxReqs(pageId, nid(), { x: 1.6, y: 4.7, w: T.W - 3.2, h: 1.1 },
        [{ text: ns.sub, size: 17, color: "FFFFFF", font: brand.fontBody }], { align: "CENTER", valign: "TOP" }));
    }
    return { reqs, bg: brand.primary };
  },

  bulletJourney(pageId, ns, brand, nid) {
    const h = header(pageId, ns, brand, nid);
    const reqs = h.reqs;
    const rows = (ns.bullets || []).slice(0, 8);
    if (!rows.length) {
      reqs.push(...textBoxReqs(pageId, nid(), { x: T.MARGIN, y: h.y + 0.2, w: T.W - 2 * T.MARGIN, h: 0.5 },
        [{ text: "[No content generated for this slide yet]", italic: true, size: 14, color: T.muted, font: brand.fontBody }]));
      return { reqs };
    }
    const areaH = (T.H - 0.7) - h.y;
    const rowH = Math.min(1.0, areaH / rows.length);
    rows.forEach((b, i) => {
      const y = h.y + i * rowH;
      reqs.push(...shapeReqs(pageId, nid(), "rect", { x: T.MARGIN, y: y + 0.04, w: 0.12, h: rowH - 0.16 }, { fill: brand.accent }));
      const tx = T.MARGIN + 0.32;
      const runs = [{ text: b.title || "", bold: true, size: 15, color: T.ink, font: brand.fontBody }];
      if (b.desc) runs.push({ text: "\n" + b.desc, size: 12, color: T.muted, font: brand.fontBody });
      reqs.push(...textBoxReqs(pageId, nid(), { x: tx, y: y, w: T.W - tx - T.MARGIN, h: rowH }, runs, { align: "START", valign: "MIDDLE" }));
    });
    return { reqs };
  },

  deviceSceneImage(pageId, ns, brand, nid) {
    const hasImg = ns.image && ns.image.url;
    const textW = hasImg ? (T.W * 0.5 - T.MARGIN) : (T.W - 2 * T.MARGIN);
    const h = header(pageId, ns, brand, nid, { titleW: textW });
    const reqs = h.reqs;
    if (ns.sub) {
      reqs.push(...textBoxReqs(pageId, nid(), { x: T.MARGIN, y: h.y, w: textW, h: 2.4 },
        [{ text: ns.sub, size: 15, color: T.muted, font: brand.fontBody }], { align: "START", valign: "TOP" }));
    }
    if (hasImg) {
      reqs.push(...imageReqs(pageId, nid(), ns.image.url,
        { x: T.W * 0.5 + 0.15, y: 0.9, w: T.W * 0.5 - T.MARGIN - 0.15, h: T.H - 1.9 }, ns.image));
    }
    return { reqs };
  },

  splitTextImage(pageId, ns, brand, nid) {
    const hasImg = ns.image && ns.image.url;
    const textW = hasImg ? (T.W * 0.55 - T.MARGIN) : (T.W - 2 * T.MARGIN);
    const h = header(pageId, ns, brand, nid, { titleW: textW });
    const reqs = h.reqs;
    const rows = (ns.bullets || []).slice(0, 6);
    if (rows.length) {
      const runs = [];
      rows.forEach((b) => {
        runs.push({ text: (runs.length ? "\n" : "") + "•  " + (b.title || ""), bold: true, size: 14, color: T.ink, font: brand.fontBody });
        if (b.desc) runs.push({ text: "\n   " + b.desc, size: 12, color: T.muted, font: brand.fontBody });
      });
      reqs.push(...textBoxReqs(pageId, nid(), { x: T.MARGIN, y: h.y, w: textW, h: T.H - h.y - 0.7 }, runs, { align: "START", valign: "TOP" }));
    } else if (ns.sub) {
      reqs.push(...textBoxReqs(pageId, nid(), { x: T.MARGIN, y: h.y, w: textW, h: 2.0 },
        [{ text: ns.sub, size: 15, color: T.muted, font: brand.fontBody }]));
    }
    if (hasImg) {
      reqs.push(...imageReqs(pageId, nid(), ns.image.url, { x: T.W * 0.58, y: 0.9, w: T.W * 0.42 - T.MARGIN, h: T.H - 1.9 }, ns.image));
    }
    return { reqs };
  },

  personaCard(pageId, ns, brand, nid) {
    const hasImg = ns.image && ns.image.url;
    const h = header(pageId, ns, brand, nid, { titleW: T.W - 2 * T.MARGIN });
    const reqs = h.reqs;
    const leftX = T.MARGIN, imgW = 2.6;
    let contentX = leftX;
    if (hasImg) {
      reqs.push(...imageReqs(pageId, nid(), ns.image.url, { x: leftX, y: h.y, w: imgW, h: T.H - h.y - 0.7 }, ns.image));
      contentX = leftX + imgW + 0.4;
    }
    const contentW = T.W - contentX - T.MARGIN;
    const facets = (ns.facets || []).slice(0, 3);
    let y = h.y;
    if (facets.length) {
      const chipW = (contentW - (facets.length - 1) * 0.2) / facets.length;
      facets.forEach((fct, i) => {
        const cx = contentX + i * (chipW + 0.2);
        reqs.push(...shapeReqs(pageId, nid(), "round", { x: cx, y: y, w: chipW, h: 1.1 }, { fill: T.band, outline: T.line, outlineWeight: 1 }));
        reqs.push(...textBoxReqs(pageId, nid(), { x: cx + 0.1, y: y + 0.12, w: chipW - 0.2, h: 0.86 }, [
          { text: fct.value || "", bold: true, size: 18, color: brand.primary, font: brand.fontBody },
          { text: "\n" + (fct.label || ""), size: 10, color: T.muted, font: brand.fontBody },
        ], { align: "CENTER", valign: "MIDDLE" }));
      });
      y += 1.35;
    }
    if (ns.quote) {
      reqs.push(...textBoxReqs(pageId, nid(), { x: contentX, y: y, w: contentW, h: T.H - y - 0.7 },
        [{ text: "“" + ns.quote + "”", italic: true, size: 16, color: T.ink, font: brand.fontHeading }],
        { align: "START", valign: "TOP" }));
    }
    return { reqs };
  },

  agentChat(pageId, ns, brand, nid) {
    const h = header(pageId, ns, brand, nid);
    const reqs = h.reqs;
    const turns = (ns.chat || []).slice(0, 8);
    if (!turns.length) return { reqs };
    const areaH = (T.H - 0.7) - h.y;
    const rowH = Math.min(0.9, areaH / turns.length);
    turns.forEach((t, i) => {
      const y = h.y + i * rowH;
      const isUser = t.role === "user";
      const isCard = t.role === "card";
      const bw = T.W * 0.62;
      const bx = isUser ? (T.W - T.MARGIN - bw) : T.MARGIN;
      const fill = isCard ? brand.accent : (isUser ? T.band : brand.secondary);
      const fg = isCard ? T.ink : (isUser ? T.ink : "FFFFFF");
      reqs.push(...shapeReqs(pageId, nid(), "round", { x: bx, y: y, w: bw, h: rowH - 0.14 }, { fill: fill }));
      reqs.push(...textBoxReqs(pageId, nid(), { x: bx + 0.15, y: y, w: bw - 0.3, h: rowH - 0.14 },
        [{ text: (t.emoji ? t.emoji + " " : "") + (t.text || ""), size: 12, color: fg, font: brand.fontBody }],
        { align: "START", valign: "MIDDLE" }));
    });
    return { reqs };
  },

  metricScorecard(pageId, ns, brand, nid) {
    const h = header(pageId, ns, brand, nid);
    const reqs = h.reqs;
    const metrics = (ns.metrics || []).slice(0, 6);
    if (!metrics.length) return { reqs };
    const cols = metrics.length <= 3 ? metrics.length : 3;
    const rowsN = Math.ceil(metrics.length / cols);
    const gap = 0.3;
    const gridW = T.W - 2 * T.MARGIN;
    const gridH = (T.H - 0.7) - h.y;
    const cw = (gridW - (cols - 1) * gap) / cols;
    const ch = (gridH - (rowsN - 1) * gap) / rowsN;
    metrics.forEach((m, i) => {
      const r = Math.floor(i / cols), c = i % cols;
      const x = T.MARGIN + c * (cw + gap);
      const y = h.y + r * (ch + gap);
      reqs.push(...shapeReqs(pageId, nid(), "round", { x: x, y: y, w: cw, h: ch }, { fill: T.band, outline: brand.primary, outlineWeight: 1 }));
      reqs.push(...textBoxReqs(pageId, nid(), { x: x + 0.15, y: y + 0.12, w: cw - 0.3, h: ch - 0.24 }, [
        { text: (m.icon ? m.icon + " " : "") + (m.value || ""), bold: true, size: 30, color: brand.primary, font: brand.fontBody },
        { text: "\n" + (m.label || ""), size: 12, color: T.muted, font: brand.fontBody },
      ], { align: "CENTER", valign: "MIDDLE" }));
    });
    return { reqs };
  },

  placeholderCx(pageId, ns, brand, nid) {
    const h = header(pageId, ns, brand, nid);
    const reqs = h.reqs;
    const cx = ns.cxFallback || {};
    const bx = T.MARGIN, by = h.y + 0.1, bw = T.W - 2 * T.MARGIN, bh = (T.H - 0.7) - h.y - 0.1;
    reqs.push(...shapeReqs(pageId, nid(), "round", { x: bx, y: by, w: bw, h: bh },
      { fill: T.band, outline: brand.secondary, outlineWeight: 1.5, dash: true }));
    reqs.push(...textBoxReqs(pageId, nid(), { x: bx + 0.3, y: by, w: bw - 0.6, h: bh }, [
      { text: "🖥  " + (cx.name || ns.title || "CX Component"), bold: true, size: 20, color: T.ink, font: brand.fontBody },
      { text: "\nLive component — add a still image in the builder to embed it here.", size: 13, color: T.muted, font: brand.fontBody },
      { text: "\n" + (cx.targetUrl || ""), size: 12, color: brand.secondary, font: brand.fontBody },
    ], { align: "CENTER", valign: "MIDDLE" }));
    return { reqs };
  },
};

// ─── Public: buildBatchRequests ────────────────────────────────
function buildBatchRequests(model) {
  model = model || {};
  const brand = normalizeBrand(model.brand || {});
  const slides = Array.isArray(model.slides) ? model.slides : [];
  const requests = [];
  const nid = idGen("el");

  slides.forEach((ns, i) => {
    const pageId = "slide_" + i;
    // Create the slide (blank layout) with a known objectId.
    requests.push({ createSlide: { objectId: pageId, slideLayoutReference: { predefinedLayout: "BLANK" } } });

    const renderer = RENDERERS[ns.template] || RENDERERS.titleSlide;
    let out;
    try {
      out = renderer(pageId, ns, brand, nid);
    } catch (e) {
      out = RENDERERS.titleSlide(pageId, ns, brand, nid);
    }
    // Non-white page background (title/divider) OR the shared white paper.
    requests.push(...pageBgReqs(pageId, out.bg || T.paper));
    requests.push(...(out.reqs || []));
    // Shared footer chrome.
    requests.push(...footer(pageId, ns, brand, nid));
  });

  // Speaker notes are applied in a SECOND batchUpdate by the caller: the
  // notes-page placeholder objectId is only known after the presentation
  // exists (server.js reads it via presentations.get). We surface the
  // per-slide notes text keyed by page objectId here.
  const notes = slides.map((ns, i) => ({ pageId: "slide_" + i, text: String(ns.speakerNotes || "") }))
    .filter((n) => n.text.trim().length);

  return { requests, pageSize: PAGE_SIZE, slides, notes };
}

// Brand fallbacks mirror export-model.js brandTheme() defaults.
function normalizeBrand(b) {
  const hex = (c, fb) => {
    let s = String(c || "").replace(/^#/, "").trim();
    return /^[0-9a-fA-F]{6}$/.test(s) ? s.toUpperCase() : fb;
  };
  return {
    primary:   hex(b.primary,   "B22234"),
    secondary: hex(b.secondary, "1A5FA0"),
    accent:    hex(b.accent,    "F5C06A"),
    navy:      hex(b.navy,      "0D1B2E"),
    bg:        hex(b.bg,        "F5F7FF"),
    fontHeading: b.fontHeading || "Playfair Display",
    fontBody:    b.fontBody || "Inter",
  };
}

module.exports = { buildBatchRequests, PAGE_SIZE };
