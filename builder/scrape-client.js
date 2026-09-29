// ════════════════════════════════════════════════════════════════
//  scrape-client.js — window.HOLO_SCRAPE
//
//  Thin client for POST /api/scrape/site. Pulls product image URLs +
//  a brand color from the customer's live site BEFORE the Gemini text
//  call, so the scraped count can inform how many photos Gemini must
//  gap-fill. Never throws — a failed scrape returns an empty result and
//  the pipeline falls back to Gemini image-gen / SVG.
//
//  mapImagesToSkus() assigns scraped images to skus by NAME similarity
//  (scraped.products, from JSON-LD Product entries / <img alt> text), so a
//  photo of "Driver X" actually lands on the generated SKU named "Driver X"
//  instead of whatever sku happens to share its array index. Any sku left
//  unmatched (or any site with no structured product data at all) falls back
//  to the previous positional assignment, so today's behavior is a floor
//  rather than a regression. Uses the PROXIED same-origin URLs for the live
//  preview (so the browser can load them without CORS); the exporter later
//  re-fetches the ORIGINAL CDN urls to bake bytes into the ZIP.
// ════════════════════════════════════════════════════════════════
(function () {
  "use strict";

  // The host gates this route on the same salesforce.com JWT as the
  // Gemini routes (cost guard) — attach it via HOLO_AUTH.authHeaders(),
  // mirroring gemini-client.js. Resolves to {} if auth isn't available so
  // the fetch still fires (and the server returns a clean 401).
  function authHeaders() {
    const auth = window.HOLO_AUTH;
    return auth && auth.authHeaders ? auth.authHeaders() : Promise.resolve({});
  }

  function scrapeSite(website) {
    if (!website || !String(website).trim()) {
      return Promise.resolve({ ok: false, images: [], proxiedImages: [], products: [], brandColor: null, imageCount: 0 });
    }
    return authHeaders().then(function (extra) {
      return fetch("/api/scrape/site", {
        method: "POST",
        headers: Object.assign({ "Content-Type": "application/json", Accept: "application/json" }, extra),
        body: JSON.stringify({ url: String(website).trim() }),
      });
    })
      .then(function (res) { return res.json(); })
      .catch(function () {
        return { ok: false, images: [], proxiedImages: [], products: [], brandColor: null, imageCount: 0 };
      });
  }

  function normalizeWords(s) {
    return String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().split(" ").filter(function (w) { return w.length > 2; });
  }

  // Count of shared significant (>2 char) words between two names — a cheap,
  // dependency-free stand-in for a real similarity score. 0 = no match.
  function nameOverlap(a, b) {
    const wa = normalizeWords(a);
    if (!wa.length) return 0;
    const wb = new Set(normalizeWords(b));
    let n = 0;
    wa.forEach(function (w) { if (wb.has(w)) n++; });
    return n;
  }

  // Assign scraped images to skus. `skus` is [{id, name}]. Returns
  // { skuId → url }. `useProxied` picks the same-origin proxied urls (for
  // the live preview); pass false to keep the raw CDN urls (for baking
  // into the ZIP).
  function mapImagesToSkus(scraped, skus, useProxied) {
    const out = {};
    if (!scraped || !skus || !skus.length) return out;
    const rawImages = scraped.images || [];
    const proxiedImages = scraped.proxiedImages || [];
    const proxiedFor = function (rawUrl) {
      const idx = rawImages.indexOf(rawUrl);
      return idx !== -1 && proxiedImages[idx] ? proxiedImages[idx] : rawUrl;
    };
    const urlFor = function (rawUrl) { return useProxied === false ? rawUrl : proxiedFor(rawUrl); };

    const products = Array.isArray(scraped.products) ? scraped.products : [];
    const usedProducts = new Set();
    const usedUrls = new Set();
    const unmatched = [];

    skus.forEach(function (sku) {
      let bestIdx = -1, bestScore = 0;
      products.forEach(function (p, i) {
        if (usedProducts.has(i)) return;
        const score = nameOverlap(sku.name, p.name);
        if (score > bestScore) { bestScore = score; bestIdx = i; }
      });
      if (bestIdx !== -1) {
        usedProducts.add(bestIdx);
        const url = urlFor(products[bestIdx].image);
        out[sku.id] = url;
        usedUrls.add(url);
      } else {
        unmatched.push(sku);
      }
    });

    // Positional fallback for leftovers — same behavior as before this
    // change, just scoped to whatever a name match didn't already claim.
    const fallbackPool = (useProxied === false ? rawImages : proxiedImages).filter(function (u) {
      return u && !usedUrls.has(u);
    });
    unmatched.forEach(function (sku, i) {
      if (fallbackPool[i]) out[sku.id] = fallbackPool[i];
    });

    return out;
  }

  window.HOLO_SCRAPE = {
    scrapeSite: scrapeSite,
    mapImagesToSkus: mapImagesToSkus,
  };
})();
