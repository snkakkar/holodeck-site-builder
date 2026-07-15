// ════════════════════════════════════════════════════════════════
//  pdf-exporter.js — HOLO_PDF
//
//  Renders the normalized export model (HOLO_EXPORT_MODEL.buildExportModel)
//  into a landscape 16:9 PDF handout via the vendored jsPDF UMD build.
//  Same words + brand + images as the PPTX; one page per slide.
//  NO speaker notes (PDF has no native notes field — documented
//  simplification; notes live in the PPTX).
//
//  Public: HOLO_PDF.downloadDeckPdf(state) → Promise<void>
//
//  Depends on: window.jspdf.jsPDF (vendor/jspdf.umd.min.js),
//              window.HOLO_EXPORT_MODEL, window.HOLO_ZIP.safeSlug.
//
//  Geometry mirrors the PPTX THEME (inches) scaled ×72 into a 960×540pt
//  page, so the two formats stay visually aligned.
// ════════════════════════════════════════════════════════════════

(function (global) {
  "use strict";

  const MODEL = global.HOLO_EXPORT_MODEL || {};
  const T = MODEL.THEME || { W: 13.33, H: 7.5, MARGIN: 0.7 };

  const PW = 960, PH = 540;           // page size (pt), 16:9
  const S = PW / T.W;                 // inch → pt scale (≈72)
  const M = T.MARGIN * S;             // margin (pt)
  const px = function (inch) { return inch * S; };
  // Adapter-cfg chips (product names, etc.) skip the model's plain() chokepoint;
  // strip emoji/HTML here so no tofu reaches the PDF. Model fields are clean.
  const plainText = MODEL.plain || function (s) { return String(s == null ? "" : s); };

  function safeSlug(state) {
    if (global.HOLO_ZIP && global.HOLO_ZIP.safeSlug) return global.HOLO_ZIP.safeSlug(state);
    const p = (state && state.project) || {};
    const base = (p.customerName || p.name || "demo").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    return (base || "demo").slice(0, 48);
  }
  const hx = function (c) { const s = String(c || "").replace(/^#/, ""); return "#" + (/^[0-9a-fA-F]{6}$/.test(s) ? s : "1A1A2E"); };

  // ─── Download entry ────────────────────────────────────────────
  function downloadDeckPdf(state) {
    const jsPDF = global.jspdf && global.jspdf.jsPDF;
    if (typeof jsPDF !== "function") {
      return Promise.reject(new Error("PDF library didn't load (vendor/jspdf.umd.min.js). Reload and try again."));
    }
    if (!MODEL.buildExportModel) {
      return Promise.reject(new Error("Export model unavailable (export-model.js not loaded)."));
    }
    return MODEL.buildExportModel(state).then(function (model) {
      const doc = buildDoc(model);
      doc.save("holodeck-" + safeSlug(state) + ".pdf");
    });
  }

  // ─── Doc assembly ──────────────────────────────────────────────
  function buildDoc(model) {
    const jsPDF = global.jspdf.jsPDF;
    const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: [PW, PH], compress: true });
    const brand = model.brand || {};
    const ctx = { doc: doc, brand: brand };

    model.slides.forEach(function (ns, i) {
      if (i > 0) doc.addPage([PW, PH], "landscape");
      // white paper
      doc.setFillColor("#FFFFFF"); doc.rect(0, 0, PW, PH, "F");
      const renderer = TEMPLATE_RENDERERS[ns.template] || TEMPLATE_RENDERERS.titleSlide;
      try { renderer(doc, ns, ctx); }
      catch (e) {
        try { console.warn("[pdf] renderer failed for " + ns.template + " (" + ns.layout + "):", e); } catch (_) {}
        TEMPLATE_RENDERERS.titleSlide(doc, ns, ctx);
      }
      footer(doc, ns, ctx);
    });
    return doc;
  }

  // ─── Text helpers ──────────────────────────────────────────────
  // Draw wrapped text with a max-line clamp; returns the y after the block.
  function wrapText(doc, text, x, y, w, opts) {
    opts = opts || {};
    text = String(text == null ? "" : text);
    if (!text) return y;
    doc.setFont("helvetica", opts.style || "normal");
    doc.setFontSize(opts.size || 14);
    doc.setTextColor(hx(opts.color || T.ink));
    const lh = (opts.size || 14) * (opts.lineHeight || 1.25);
    let lines = doc.splitTextToSize(text, w);
    if (opts.maxLines && lines.length > opts.maxLines) {
      lines = lines.slice(0, opts.maxLines);
      lines[lines.length - 1] = String(lines[lines.length - 1]).replace(/\.*$/, "") + "…";
    }
    const align = opts.align || "left";
    const tx = align === "center" ? x + w / 2 : (align === "right" ? x + w : x);
    lines.forEach(function (ln, i) {
      doc.text(ln, tx, y + (i + 1) * lh - lh * 0.25, { align: align, maxWidth: w });
    });
    return y + lines.length * lh;
  }
  function eyebrow(doc, ns, ctx, x, y, w, align, color) {
    if (!ns.eyebrow) return y;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(hx(color || ctx.brand.primary));
    const tx = align === "center" ? x + w / 2 : x;
    doc.text(String(ns.eyebrow).toUpperCase(), tx, y, { align: align || "left", charSpace: 1.2 });
    return y + 18;
  }
  function sectionLabel(id) {
    return ({
      "intro": "INTRODUCTION", "journey-map": "JOURNEY MAP", "meet-persona": "MEET THE PERSONA",
      "demo": "THE DEMO", "business-value": "BUSINESS VALUE",
    })[id] || String(id || "").toUpperCase();
  }
  function footer(doc, ns, ctx) {
    doc.setFillColor(hx(ctx.brand.primary));
    doc.rect(0, PH - px(0.28), PW, px(0.06), "F");
    if (ns.sectionId) {
      doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(hx(T.muted));
      doc.text(sectionLabel(ns.sectionId), M, PH - px(0.34), { charSpace: 1 });
    }
  }
  // Header (eyebrow + title) for content templates; returns y below it.
  function header(doc, ns, ctx, w) {
    w = w || (PW - 2 * M);
    let y = M + 14;
    y = eyebrow(doc, ns, ctx, M, y, w, "left");
    if (ns.title) {
      y += 6;
      y = wrapText(doc, ns.title, M, y, w, { size: 24, style: "bold", color: T.ink, maxLines: 2, lineHeight: 1.15 });
    }
    return y + 10;
  }

  // ─── Image placement (contain) ─────────────────────────────────
  function placeImage(doc, img, box) {
    if (!img || !img.dataUrl) return;
    const iw = img.w || 16, ih = img.h || 9;
    const ar = iw / ih, boxAr = box.w / box.h;
    let w = box.w, h = box.h, x = box.x, y = box.y;
    if (ar > boxAr) { h = box.w / ar; y = box.y + (box.h - h) / 2; }
    else { w = box.h * ar; x = box.x + (box.w - w) / 2; }
    const fmt = /^data:image\/png/i.test(img.dataUrl) ? "PNG" : (/^data:image\/webp/i.test(img.dataUrl) ? "WEBP" : "JPEG");
    try { doc.addImage(img.dataUrl, fmt, x, y, w, h); }
    catch (e) { try { console.warn("[pdf] addImage failed:", e); } catch (_) {} }
  }

  // ─── Template renderers ────────────────────────────────────────
  const TEMPLATE_RENDERERS = {
    titleSlide: function (doc, ns, ctx) {
      doc.setFillColor(hx(ctx.brand.navy)); doc.rect(0, 0, PW, PH, "F");
      doc.setFillColor(hx(ctx.brand.primary)); doc.rect(0, 0, px(0.28), PH, "F");
      let y = PH * 0.32;
      if (ns.eyebrow) {
        doc.setFont("helvetica", "bold"); doc.setFontSize(13); doc.setTextColor(hx(ctx.brand.accent));
        doc.text(String(ns.eyebrow).toUpperCase(), PW / 2, y, { align: "center", charSpace: 1.6 }); y += 36;
      }
      y = wrapText(doc, ns.title || "Customer Story", PW * 0.12, y, PW * 0.76, { size: 38, style: "bold", color: "FFFFFF", align: "center", maxLines: 3, lineHeight: 1.12 });
      if (ns.sub) y = wrapText(doc, ns.sub, PW * 0.18, y + 16, PW * 0.64, { size: 15, color: "D6DCE8", align: "center", maxLines: 3 });
      const chips = (ns.products || []).slice(0, 5).map(plainText).filter(Boolean);
      if (chips.length) {
        doc.setFont("helvetica", "bold"); doc.setFontSize(12); doc.setTextColor(hx(ctx.brand.accent));
        doc.text(chips.join("     •     "), PW / 2, PH * 0.82, { align: "center", charSpace: 0.8 });
      }
    },

    sectionDivider: function (doc, ns, ctx) {
      doc.setFillColor(hx(ctx.brand.primary)); doc.rect(0, 0, PW, PH, "F");
      let y = PH * 0.36;
      if (ns.eyebrow) {
        doc.setFont("helvetica", "bold"); doc.setFontSize(13); doc.setTextColor("#FFFFFF");
        doc.text(String(ns.eyebrow).toUpperCase(), PW / 2, y, { align: "center", charSpace: 1.6 }); y += 34;
      }
      y = wrapText(doc, ns.title || sectionLabel(ns.sectionId), PW * 0.12, y, PW * 0.76, { size: 34, style: "bold", color: "FFFFFF", align: "center", maxLines: 2 });
      if (ns.sub) wrapText(doc, ns.sub, PW * 0.18, y + 14, PW * 0.64, { size: 14, color: "FFFFFF", align: "center", maxLines: 3 });
    },

    bulletJourney: function (doc, ns, ctx) {
      let top = header(doc, ns, ctx);
      const rows = (ns.bullets || []).slice(0, 8);
      if (!rows.length) {
        wrapText(doc, "[No content generated for this slide yet]", M, top + 6, PW - 2 * M, { size: 13, style: "italic", color: T.muted });
        return;
      }
      const areaH = (PH - px(0.7)) - top;
      const rowH = Math.min(px(1.0), areaH / rows.length);
      rows.forEach(function (b, i) {
        const y = top + i * rowH;
        doc.setFillColor(hx(ctx.brand.accent)); doc.rect(M, y + 4, px(0.12), rowH - 12, "F");
        const tx = M + px(0.32);
        let ty = y + 4;
        ty = wrapText(doc, b.title || "", tx, ty, PW - tx - M, { size: 14, style: "bold", color: T.ink, maxLines: 2 });
        if (b.desc) wrapText(doc, b.desc, tx, ty + 2, PW - tx - M, { size: 11, color: T.muted, maxLines: 2 });
      });
    },

    deviceSceneImage: function (doc, ns, ctx) {
      const hasImg = ns.image && ns.image.dataUrl;
      const textW = hasImg ? (PW * 0.5 - M) : (PW - 2 * M);
      let top = header(doc, ns, ctx, textW);
      const chips = (ns.chips || []).map(plainText).filter(Boolean);
      if (ns.sub) top = wrapText(doc, ns.sub, M, top, textW, { size: 14, color: T.muted, maxLines: chips.length ? 8 : 10 });
      if (chips.length) {
        doc.setFont("helvetica", "bold"); doc.setFontSize(12); doc.setTextColor(hx(ctx.brand.secondary));
        doc.text(chips.join("   •   "), M, top + 16, { maxWidth: textW });
      }
      if (hasImg) placeImage(doc, ns.image, { x: PW * 0.5 + 10, y: px(0.9), w: PW * 0.5 - M - 10, h: PH - px(1.9) });
    },

    splitTextImage: function (doc, ns, ctx) {
      const hasImg = ns.image && ns.image.dataUrl;
      const textW = hasImg ? (PW * 0.55 - M) : (PW - 2 * M);
      let top = header(doc, ns, ctx, textW);
      const rows = (ns.bullets || []).slice(0, 6);
      if (rows.length) {
        let y = top;
        rows.forEach(function (b) {
          y = wrapText(doc, "•  " + (b.title || ""), M, y, textW, { size: 13, style: "bold", color: T.ink, maxLines: 2 });
          if (b.desc) y = wrapText(doc, "    " + b.desc, M, y, textW, { size: 11, color: T.muted, maxLines: 2 });
          y += 6;
        });
      } else if (ns.sub) {
        wrapText(doc, ns.sub, M, top, textW, { size: 14, color: T.muted, maxLines: 10 });
      }
      if (hasImg) placeImage(doc, ns.image, { x: PW * 0.58, y: px(0.9), w: PW * 0.42 - M, h: PH - px(1.9) });
    },

    personaCard: function (doc, ns, ctx) {
      let top = header(doc, ns, ctx);
      const hasImg = ns.image && ns.image.dataUrl;
      const leftX = M, imgW = px(2.6);
      let contentX = leftX;
      if (hasImg) { placeImage(doc, ns.image, { x: leftX, y: top, w: imgW, h: PH - top - px(0.7) }); contentX = leftX + imgW + px(0.4); }
      const contentW = PW - contentX - M;
      let y = top;
      const facets = (ns.facets || []).slice(0, 6);
      if (facets.length) {
        const cols = facets.length <= 3 ? facets.length : 3;
        const rowsN = Math.ceil(facets.length / cols);
        const gap = px(0.2), chipW = (contentW - (cols - 1) * gap) / cols, chipH = rowsN > 1 ? px(0.95) : px(1.1);
        facets.forEach(function (f, i) {
          const r = Math.floor(i / cols), c = i % cols;
          const cx = contentX + c * (chipW + gap);
          const cy = y + r * (chipH + gap);
          doc.setFillColor(hx(T.band)); doc.setDrawColor(hx(T.line)); doc.setLineWidth(1);
          doc.roundedRect(cx, cy, chipW, chipH, 6, 6, "FD");
          doc.setFont("helvetica", "bold"); doc.setFontSize(rowsN > 1 ? 13 : 18); doc.setTextColor(hx(ctx.brand.primary));
          doc.text(plainText(f.value || ""), cx + chipW / 2, cy + chipH * 0.42, { align: "center", maxWidth: chipW - 10 });
          doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(hx(T.muted));
          doc.text(plainText(f.label || ""), cx + chipW / 2, cy + chipH * 0.72, { align: "center", maxWidth: chipW - 10 });
        });
        y += rowsN * (chipH + gap) + px(0.1);
      }
      if (ns.quote && y < PH - px(1.1)) wrapText(doc, "“" + ns.quote + "”", contentX, y, contentW, { size: 15, style: "italic", color: T.ink, maxLines: 6 });
    },

    agentChat: function (doc, ns, ctx) {
      let top = header(doc, ns, ctx);
      const turns = (ns.chat || []).slice(0, 8);
      if (!turns.length) return;
      const areaH = (PH - px(0.7)) - top;
      const rowH = Math.min(px(0.9), areaH / turns.length);
      turns.forEach(function (t, i) {
        const y = top + i * rowH;
        const isUser = t.role === "user", isCard = t.role === "card";
        const bw = PW * 0.62, bx = isUser ? (PW - M - bw) : M;
        const fill = isCard ? ctx.brand.accent : (isUser ? T.band : ctx.brand.secondary);
        const fg = isCard ? T.ink : (isUser ? T.ink : "FFFFFF");
        doc.setFillColor(hx(fill)); doc.roundedRect(bx, y, bw, rowH - 10, 6, 6, "F");
        doc.setFont("helvetica", "normal"); doc.setFontSize(11); doc.setTextColor(hx(fg));
        const txt = (t.emoji ? t.emoji + " " : "") + (t.text || "");
        const lines = doc.splitTextToSize(txt, bw - 20).slice(0, 2);
        doc.text(lines, bx + 10, y + (rowH - 10) / 2 - (lines.length - 1) * 6 + 4, { maxWidth: bw - 20 });
      });
    },

    metricScorecard: function (doc, ns, ctx) {
      let top = header(doc, ns, ctx);
      const metrics = (ns.metrics || []).slice(0, 6);
      if (!metrics.length) return;
      const cols = metrics.length <= 3 ? metrics.length : 3;
      const rowsN = Math.ceil(metrics.length / cols);
      const gap = px(0.3);
      const gridW = PW - 2 * M, gridH = (PH - px(0.7)) - top;
      const cw = (gridW - (cols - 1) * gap) / cols, ch = (gridH - (rowsN - 1) * gap) / rowsN;
      metrics.forEach(function (m, i) {
        const r = Math.floor(i / cols), c = i % cols;
        const x = M + c * (cw + gap), y = top + r * (ch + gap);
        doc.setFillColor(hx(T.band)); doc.setDrawColor(hx(ctx.brand.primary)); doc.setLineWidth(1);
        doc.roundedRect(x, y, cw, ch, 8, 8, "FD");
        doc.setFont("helvetica", "bold"); doc.setFontSize(28); doc.setTextColor(hx(ctx.brand.primary));
        doc.text(((m.icon ? m.icon + " " : "") + (m.value || "")), x + cw / 2, y + ch * 0.45, { align: "center", maxWidth: cw - 16 });
        doc.setFont("helvetica", "normal"); doc.setFontSize(11); doc.setTextColor(hx(T.muted));
        const ll = doc.splitTextToSize(String(m.label || ""), cw - 16).slice(0, 2);
        doc.text(ll, x + cw / 2, y + ch * 0.68, { align: "center", maxWidth: cw - 16 });
      });
    },

    placeholderCx: function (doc, ns, ctx) {
      let top = header(doc, ns, ctx);
      const cx = ns.cxFallback || {};
      const bx = M, by = top + 6, bw = PW - 2 * M, bh = (PH - px(0.7)) - top - 6;
      doc.setFillColor(hx(T.band)); doc.setDrawColor(hx(ctx.brand.secondary)); doc.setLineWidth(1.5);
      doc.roundedRect(bx, by, bw, bh, 8, 8, "FD");
      let y = by + bh * 0.36;
      y = wrapText(doc, (cx.name || ns.title || "CX Component"), bx + 20, y, bw - 40, { size: 18, style: "bold", color: T.ink, align: "center", maxLines: 2 });
      y = wrapText(doc, "Live component — add a still image in the builder to embed it here.", bx + 20, y + 6, bw - 40, { size: 12, color: T.muted, align: "center", maxLines: 2 });
      if (cx.targetUrl) wrapText(doc, cx.targetUrl, bx + 20, y + 6, bw - 40, { size: 11, color: ctx.brand.secondary, align: "center", maxLines: 1 });
    },

    // Icon list — scenePhoto. Scene image left, eyebrow/title/sub rows right.
    iconList: function (doc, ns, ctx) {
      const hasImg = ns.image && ns.image.dataUrl;
      const imgW = hasImg ? PW * 0.42 : 0;
      if (hasImg) placeImage(doc, ns.image, { x: M, y: px(0.9), w: imgW - M, h: PH - px(1.9) });
      const contentX = hasImg ? imgW + 12 : M;
      const contentW = PW - contentX - M;
      let y = M + 14;
      if (ns.eyebrow) {
        doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(hx(ctx.brand.primary));
        doc.text(String(ns.eyebrow).toUpperCase(), contentX, y, { charSpace: 1.2 });
        y += 16;
      }
      if (ns.title) { y += 6; y = wrapText(doc, ns.title, contentX, y, contentW, { size: 22, style: "bold", color: T.ink, maxLines: 2, lineHeight: 1.15 }); }
      y += 10;
      const rows = (ns.rows || []).slice(0, 4);
      const areaH = (PH - px(0.7)) - y;
      const rowH = rows.length ? Math.min(px(1.1), areaH / rows.length) : 0;
      rows.forEach(function (r, i) {
        const ry = y + i * rowH;
        doc.setFillColor(hx(ctx.brand.accent)); doc.rect(contentX, ry + 4, px(0.1), rowH - 12, "F");
        const tx = contentX + px(0.28);
        let ty = ry + 2;
        doc.setFont("helvetica", "bold"); doc.setFontSize(8); doc.setTextColor(hx(ctx.brand.secondary));
        doc.text(plainText(r.eyebrow || "").toUpperCase(), tx, ty + 8, { charSpace: 1.5 });
        ty += 14;
        ty = wrapText(doc, plainText(r.title || ""), tx, ty, contentW - px(0.28), { size: 13, style: "bold", color: T.ink, maxLines: 2 });
        if (r.sub) wrapText(doc, plainText(r.sub), tx, ty + 1, contentW - px(0.28), { size: 10, color: T.muted, maxLines: 2 });
      });
    },

    // Quote + columns — storyFoundation / executiveSummary / currentFutureState.
    quotePlusColumns: function (doc, ns, ctx) {
      const leftW = PW * 0.36;
      const gx = M, gy = M, gw = leftW - M, gh = PH - 2 * M;
      if (ns.quote) {
        doc.setFillColor(hx(ctx.brand.navy)); doc.roundedRect(gx, gy, gw, gh, 8, 8, "F");
        let qy = gy + gh * 0.3;
        if (ns.quoteTag) {
          doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(hx(ctx.brand.accent));
          doc.text(plainText(ns.quoteTag).toUpperCase(), gx + 20, qy, { charSpace: 1.5 }); qy += 20;
        }
        qy = wrapText(doc, "“" + ns.quote + "”", gx + 20, qy, gw - 40, { size: 15, style: "italic", color: "FFFFFF", maxLines: 8, lineHeight: 1.25 });
        if (ns.stamp) wrapText(doc, plainText(ns.stamp), gx + 20, qy + 8, gw - 40, { size: 11, color: "D6DCE8", maxLines: 2 });
      }
      const rx = leftW + 12, rw = PW - rx - M;
      let y = M + 14;
      if (ns.eyebrow) {
        doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(hx(ctx.brand.primary));
        doc.text(String(ns.eyebrow).toUpperCase(), rx, y, { charSpace: 1.2 }); y += 16;
      }
      if (ns.title) { y += 6; y = wrapText(doc, ns.title, rx, y, rw, { size: 22, style: "bold", color: T.ink, maxLines: 2, lineHeight: 1.15 }); }
      y += 10;
      const cols = ns.columns || [];
      const isStat = cols.length && cols[0] && cols[0].value != null && cols[0].body == null;
      const chipsArr = (ns.chips || []).map(plainText).filter(Boolean);
      if (cols.length && isStat) {
        const chipH = Math.min(px(1.0), ((PH - px(0.7)) - y) / cols.length - 6);
        cols.forEach(function (c, i) {
          const cy = y + i * (chipH + 6);
          doc.setFillColor(hx(T.band)); doc.setDrawColor(hx(T.line)); doc.setLineWidth(1);
          doc.roundedRect(rx, cy, rw, chipH, 6, 6, "FD");
          doc.setFont("helvetica", "bold"); doc.setFontSize(14); doc.setTextColor(hx(ctx.brand.primary));
          doc.text(plainText(c.value || ""), rx + 14, cy + chipH * 0.42, { maxWidth: rw - 28 });
          doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.setTextColor(hx(T.muted));
          const ll = doc.splitTextToSize(plainText(c.label || ""), rw - 28).slice(0, 1);
          doc.text(ll, rx + 14, cy + chipH * 0.72, { maxWidth: rw - 28 });
        });
        y += cols.length * (chipH + 6);
      } else if (cols.length) {
        const gap = 12, cw = (rw - (cols.length - 1) * gap) / cols.length;
        const chipsH = chipsArr.length ? 24 : 0;
        const ch = (PH - px(0.7)) - y - chipsH;
        cols.forEach(function (c, i) {
          const cx = rx + i * (cw + gap);
          let cy = wrapText(doc, plainText(c.label || "").toUpperCase(), cx, y, cw, { size: 10, style: "bold", color: ctx.brand.secondary, maxLines: 2 });
          wrapText(doc, plainText(c.body || ""), cx, cy + 4, cw, { size: 11, color: T.ink, maxLines: 8 });
        });
        y += ch;
      }
      if (chipsArr.length) {
        const label = ns.chipsLabel ? (plainText(ns.chipsLabel) + ":  ") : "";
        doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(hx(ctx.brand.primary));
        doc.text(label + chipsArr.join("   •   "), rx, Math.min(y + 14, PH - px(0.5)), { maxWidth: rw });
      }
    },
  };

  global.HOLO_PDF = {
    downloadDeckPdf: downloadDeckPdf,
    buildDoc:        buildDoc,
    safeSlug:        safeSlug,
    TEMPLATE_RENDERERS: TEMPLATE_RENDERERS,
  };
})(window);
