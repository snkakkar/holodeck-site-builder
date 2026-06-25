// ════════════════════════════════════════════════════════════════
//  DOC EXTRACT
//  Pulls plain text out of an uploaded script file for Step 2.
//
//  Supported:
//    .txt / .md / .json  → read as text (no work)
//    .docx               → unzip word/document.xml, strip tags
//                          (browser-native inflate, no dependency)
//    .pdf                → pdf.js (vendored, lazy-loaded only when a
//                          PDF is actually picked; ~1.5MB worker is
//                          never fetched otherwise)
//
//  Everything runs locally in the browser — nothing is uploaded.
//
//  Public API:
//    HOLO_DOC_EXTRACT.extract(file) → Promise<{ text, kind, warning? }>
//    HOLO_DOC_EXTRACT.ACCEPT         → accept-attribute string
// ════════════════════════════════════════════════════════════════

(function (global) {
  "use strict";

  const ACCEPT = ".txt,.md,.json,.pdf,.docx";

  function extFor(file) {
    const name = (file && file.name) || "";
    const dot = name.lastIndexOf(".");
    return dot === -1 ? "" : name.slice(dot + 1).toLowerCase();
  }

  function readAsText(file) {
    return new Promise(function (resolve, reject) {
      const r = new FileReader();
      r.onload = function () { resolve(String(r.result || "")); };
      r.onerror = function () { reject(r.error || new Error("Could not read file")); };
      r.readAsText(file);
    });
  }

  // ── DOCX ──────────────────────────────────────────────────────
  // A .docx is a ZIP. We only need word/document.xml. We locate it by
  // scanning local file headers, inflate it with the browser's native
  // DecompressionStream("deflate-raw"), then strip XML to text.
  function extractDocx(file) {
    return file.arrayBuffer().then(function (buf) {
      return findZipEntry(new Uint8Array(buf), "word/document.xml");
    }).then(function (bytes) {
      if (!bytes) throw softError("This .docx didn't contain readable document text.");
      const xml = new TextDecoder("utf-8").decode(bytes);
      return { text: docxXmlToText(xml), kind: "docx" };
    });
  }

  // Minimal ZIP reader: walks local-file-header records (PK\x03\x04)
  // until it finds the wanted name, then inflates that entry's data.
  // Only "stored" (0) and "deflate" (8) methods are handled — the only
  // two Office uses for document.xml.
  function findZipEntry(u8, wantName) {
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    let i = 0;
    while (i + 30 <= u8.length) {
      if (dv.getUint32(i, true) !== 0x04034b50) break; // not a local header → stop scanning
      const method   = dv.getUint16(i + 8, true);
      const compSize = dv.getUint32(i + 18, true);
      const nameLen  = dv.getUint16(i + 26, true);
      const extraLen = dv.getUint16(i + 28, true);
      const nameStart = i + 30;
      const name = new TextDecoder("utf-8").decode(u8.subarray(nameStart, nameStart + nameLen));
      const dataStart = nameStart + nameLen + extraLen;
      const data = u8.subarray(dataStart, dataStart + compSize);
      if (name === wantName) {
        if (method === 0) return Promise.resolve(data);          // stored
        if (method === 8) return inflateRaw(data);               // deflate
        return Promise.reject(softError("Unsupported compression in this .docx."));
      }
      i = dataStart + compSize;
    }
    // Data-descriptor zips (compSize=0 in the header) are rare for
    // document.xml; if we couldn't walk cleanly, bail to a soft error.
    return Promise.resolve(null);
  }

  function inflateRaw(u8) {
    if (typeof DecompressionStream !== "function") {
      return Promise.reject(softError("Your browser can't decompress this file. Try pasting the text instead."));
    }
    const ds = new DecompressionStream("deflate-raw");
    const stream = new Blob([u8]).stream().pipeThrough(ds);
    return new Response(stream).arrayBuffer().then(function (b) { return new Uint8Array(b); });
  }

  // Turn WordprocessingML into readable text: paragraphs → newlines,
  // tabs → tabs, everything else stripped.
  function docxXmlToText(xml) {
    let out = xml
      .replace(/<w:tab\b[^>]*\/?>/g, "\t")
      .replace(/<\/w:p>/g, "\n")
      .replace(/<w:br\b[^>]*\/?>/g, "\n")
      .replace(/<[^>]+>/g, "");
    out = decodeEntities(out);
    return tidy(out);
  }

  // ── PDF ───────────────────────────────────────────────────────
  let pdfLibPromise = null;
  function loadPdfLib() {
    if (pdfLibPromise) return pdfLibPromise;
    pdfLibPromise = import("./vendor/pdf.min.mjs").then(function (mod) {
      const lib = mod && (mod.GlobalWorkerOptions ? mod : mod.default);
      // Point the library at our vendored worker (lazy: only now does
      // the ~1.5MB worker get fetched).
      try { lib.GlobalWorkerOptions.workerSrc = new URL("./vendor/pdf.worker.min.mjs", import.meta.url).href; }
      catch (e) { lib.GlobalWorkerOptions.workerSrc = "./vendor/pdf.worker.min.mjs"; }
      return lib;
    }).catch(function (err) {
      pdfLibPromise = null; // allow retry on a later pick
      throw softError("Couldn't load the PDF reader. Try pasting the text instead.");
    });
    return pdfLibPromise;
  }

  function extractPdf(file) {
    return Promise.all([loadPdfLib(), file.arrayBuffer()]).then(function (r) {
      const lib = r[0];
      const data = new Uint8Array(r[1]);
      return lib.getDocument({ data: data, isEvalSupported: false }).promise;
    }).then(function (doc) {
      const pages = [];
      let chain = Promise.resolve();
      for (let p = 1; p <= doc.numPages; p++) {
        (function (pageNum) {
          chain = chain.then(function () {
            return doc.getPage(pageNum)
              .then(function (page) { return page.getTextContent(); })
              .then(function (tc) { pages.push(pageTextToString(tc)); });
          });
        })(p);
      }
      return chain.then(function () {
        const text = tidy(pages.join("\n\n"));
        if (!text.replace(/\s/g, "").length) {
          // No text layer → almost certainly a scanned/image-only PDF.
          throw softError("This PDF has no selectable text (it may be scanned). Paste the text instead.");
        }
        return { text: text, kind: "pdf" };
      });
    }).catch(function (err) {
      if (err && err.__soft) throw err;
      throw softError("Couldn't read this PDF. Paste the text instead.");
    });
  }

  // Reconstruct lines from positioned text items. pdf.js gives each
  // item an x/y transform; we insert newlines on vertical jumps and
  // spaces between items that don't already end in whitespace.
  function pageTextToString(tc) {
    const items = tc.items || [];
    let out = "";
    let prevRight = null;  // x of previous item's right edge
    let prevY = null;      // baseline y of previous item
    let prevSize = 0;      // font size of previous item, for thresholds

    items.forEach(function (it) {
      if (typeof it.str !== "string") return; // skip marked-content markers
      const str = it.str;
      const tr = it.transform;
      const x = tr ? tr[4] : null;
      const y = tr ? tr[5] : null;
      const size = (tr && Math.abs(tr[3])) || it.height || prevSize || 10;
      const width = typeof it.width === "number" ? it.width : 0;

      if (out === "") {
        out += str;
      } else if (prevY !== null && y !== null && Math.abs(y - prevY) > size * 0.5) {
        if (!/\n$/.test(out)) out += "\n";
        out += str;
      } else {
        const endsWS = /\s$/.test(out);
        const startsWS = /^\s/.test(str);
        let needSpace = false;
        if (!endsWS && !startsWS && str !== "") {
          const gap = (x !== null && prevRight !== null) ? (x - prevRight) : 0;
          if (gap > size * 0.2) needSpace = true;
        }
        if (needSpace) out += " ";
        out += str;
      }

      if (it.hasEOL && !/\n$/.test(out)) out += "\n";
      if (x !== null) prevRight = x + (width > 0 ? width : 0);
      if (y !== null) prevY = y;
      prevSize = size;
    });

    return out;
  }

  // ── Shared helpers ────────────────────────────────────────────
  function decodeEntities(s) {
    return s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
      .replace(/&#(\d+);/g, function (_, n) { return String.fromCharCode(parseInt(n, 10)); });
  }
  function tidy(s) {
    return s.replace(/\r\n?/g, "\n")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .replace(/[ \t]{2,}/g, " ")
      .trim();
  }
  function softError(msg) {
    const e = new Error(msg);
    e.__soft = true; // a user-facing message, not a stack-trace bug
    return e;
  }

  // ── Entry point ───────────────────────────────────────────────
  function extract(file) {
    const ext = extFor(file);
    if (ext === "pdf")  return extractPdf(file);
    if (ext === "docx") return extractDocx(file);
    // txt / md / json / anything else → best-effort plain text.
    return readAsText(file).then(function (text) {
      return { text: tidy(text), kind: ext || "text" };
    });
  }

  global.HOLO_DOC_EXTRACT = { extract: extract, ACCEPT: ACCEPT };
})(window);
