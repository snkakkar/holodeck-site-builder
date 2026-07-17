// ════════════════════════════════════════════════════════════════
//  APP FOUNDATIONS  (R3 + R4)
//  Runs when the user clicks "Generate this app" on the Demos step.
//  Produces the per-app foundation data that app-config-generator.js
//  turns into a window.APP_CONFIG. One Gemini JSON call per app fills
//  the domain-specific gaps (customer, manager, event, coach, catalog,
//  somm intents…); a deterministic skeleton is used if Gemini is
//  unconfigured or fails, so generation NEVER hard-errors.
//
//  Entry points (all return Promises):
//     HOLO_APPFOUND.generate(appId, state, opts) → { found, config }
//     HOLO_APPFOUND.generateProductPhotos(appId, config, opts) (R4)
//
//  Nothing here touches the slide deck. The shared retail catalog lives
//  on state.retailCatalog and is built once, then reused by both apps.
// ════════════════════════════════════════════════════════════════

(function (global) {
  "use strict";

  const GEN = (global.HOLO_GEMINI || null);
  const APPGEN = function () { return global.HOLO_APPGEN; };

  function ctxFrom(state) {
    const rules = global.HOLO_RULES;
    const c = (rules && rules.stateToCtx) ? rules.stateToCtx(state) : {};
    const p = (state && state.project) || {};
    return {
      customerName: c.customerName || p.customerName || "the customer",
      industry: c.industry || p.industry || "Retail",
      website: c.website || p.website || "",
      audience: c.audience || p.audience || "",
      products: c.products || [],
      persona: (state.personas && state.personas[0]) || null,
      storyActs: c.storyActs || [],
      scriptText: c.scriptText || "",
      bigProblem: c.bigProblem || "",
      futureVision: c.futureVision || "",
    };
  }

  // ── Gemini prompt: ask for the whole domain object as JSON ───
  // We describe the target shape narratively (not a strict schema) so the
  // model has room to produce rich, on-brand copy; app-config-generator.js
  // then normalizes/defaults anything missing, so a partial answer is safe.
  function promptForClienteling(cx) {
    return [
      "You are generating realistic demo data for a RETAIL CLIENTELING app (a store-associate tool) for the customer \"" + cx.customerName + "\" in the " + cx.industry + " industry.",
      cx.website ? ("Their website: " + cx.website + ".") : "",
      cx.bigProblem ? ("Business problem in the demo story: " + cx.bigProblem) : "",
      cx.futureVision ? ("Future vision: " + cx.futureVision) : "",
      cx.persona ? ("Primary persona: " + JSON.stringify({ name: cx.persona.name, role: cx.persona.role, quote: cx.persona.quote })) : "",
      "",
      "Return STRICT JSON (no markdown) with this shape:",
      "{",
      '  "conciergeName": string,  // e.g. a branded concierge name',
      '  "customer": { "name","location","visitingStore","rank","memberSince"(number),"ltv"(number),"ytdSpend"(number),"itemCount"(number),"interests":[string],"affinities":[{"label","value"(0-100)}],"birthday","travelNote","channels":{"email","phone","preferred"},"history":[{"product","date","price"(number),"status","qty"(number)}],"timeline":[{"icon":"mobile|store|web|bag","text","when"}] },',
      '  "homeStoreManager": { "name","store","title" },',
      '  "managerMessage": { "from":{"name","store","title"},"to","forwardTo","text","when" },',
      '  "event": { "name","store","date","host","seatsTotal"(number),"blurb","attendees":[{"name","tier","vip"(bool)}] },',
      '  "store": { "name","kpis":{"guestsToday","classSignups","vipArrivals","holdsPending","pipeline"} },',
      '  "walkIns": [{ "id","name","tag","tier","headline","detail","cta" }],',
      '  "tasks": [{ "text","due","priority":"high|med|low" }],',
      '  "coach": { "<walkInId>": { "badge","title","starters":[string],"nba" } },',
      '  "catalog": [{ "id","name","variety","region","vintage","price"(number),"score"(number),"scoreSource","badge","tastingNotes","story","foodPairings":[string] }]  // 6 realistic on-brand products',
      "}",
      "Make the catalog products genuinely appropriate for " + cx.customerName + " (real-sounding SKUs in their category — NOT necessarily wine unless they sell wine). 6 products. Keep copy concise and sales-floor realistic.",
    ].filter(Boolean).join("\n");
  }

  function promptForCimulate(cx) {
    return [
      "You are generating realistic demo data for an INTENT-AWARE PRODUCT SEARCH + concierge-agent shopping experience for \"" + cx.customerName + "\" in the " + cx.industry + " industry.",
      cx.website ? ("Their website: " + cx.website + ".") : "",
      cx.persona ? ("Primary shopper persona: " + JSON.stringify({ name: cx.persona.name, role: cx.persona.role })) : "",
      "",
      "Return STRICT JSON (no markdown) with this shape:",
      "{",
      '  "conciergeName": string, "conciergeSub": string,',
      '  "storeLocation": string,',
      '  "profile": { "name","tier","interests":[string] },',
      '  "catalog": [{ "id","cat","name","type","region","price"(number),"rating"(number),"ratingSource","badge","notes","pairings":[string],"flavors":[string] }],  // 12 realistic on-brand products across 2-3 categories',
      '  "sommIntents": [{ "keywords":[string], "reply": string, "productIds":[string] }],  // 6 shopping/service intents referencing catalog ids',
      '  "celebs": { "<lowercasename>": { "match": string, "productIds":[string] } }  // 1-2 celebrity/affinity tie-ins if relevant, else {}',
      "}",
      "Products must be genuinely appropriate for " + cx.customerName + " (their real category). 12 products. Intents should cover both shopping (find/recommend) and service (order status, delivery, returns).",
    ].filter(Boolean).join("\n");
  }

  // Best-effort JSON parse of a model response (strips ```json fences).
  function parseJson(text) {
    if (!text) return null;
    let t = String(text).trim();
    const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fence) t = fence[1].trim();
    // Grab the outermost object if there's leading/trailing prose.
    const first = t.indexOf("{"), last = t.lastIndexOf("}");
    if (first !== -1 && last !== -1) t = t.slice(first, last + 1);
    try { return JSON.parse(t); } catch (e) { return null; }
  }

  // Deterministic fallback foundation — used when Gemini is off/fails.
  // Names swapped in from the project so it's still customer-flavored.
  function fallbackFoundation(appId, cx) {
    const seedCat = seedCatalog(cx);
    const base = {
      customerName: cx.customerName,
      conciergeName: "Concierge",
      conciergeSub: cx.customerName + " concierge",
      storeLocation: (cx.persona && cx.persona.location) || "Your City",
      catalog: seedCat,
      customer: {
        name: (cx.persona && cx.persona.name) || "Jordan M.",
        location: "Your City",
        rank: "VIP Member",
        interests: (cx.products || []).slice(0, 3),
        affinities: [{ label: "Top category", value: 92 }, { label: "Secondary", value: 74 }],
      },
      profile: {
        name: (cx.persona && cx.persona.name) || "Member",
        tier: "Premium",
        interests: (cx.products || []).slice(0, 3),
      },
      _fallback: true,
    };
    return base;
  }

  // A neutral 6-SKU seed catalog when nothing else is available.
  function seedCatalog(cx) {
    const name = cx.customerName;
    const out = [];
    for (let i = 1; i <= 6; i++) {
      out.push({
        id: "sku" + i,
        name: name + " Signature Item " + i,
        category: "Featured",
        cat: "Featured",
        variety: "Signature",
        region: "",
        price: 20 + i * 15,
        rating: 88 + (i % 5),
        score: 88 + (i % 5),
        notes: "A popular " + name + " selection — placeholder copy until generated.",
        pairings: [],
        foodPairings: [],
        flavors: [],
      });
    }
    return out;
  }

  // ── main: generate foundation + config for one app ───────────
  // opts.onStatus(msg) — optional progress callback.
  // Resolves { found, config, usedGemini }.
  function generate(appId, state, opts) {
    opts = opts || {};
    const cx = ctxFrom(state);
    const status = opts.onStatus || function () {};
    const gen = global.HOLO_GEMINI;

    const prompt = appId === "clienteling" ? promptForClienteling(cx) : promptForCimulate(cx);

    function assemble(found) {
      // Share the retail catalog across apps: first app to generate seeds it;
      // later apps reuse it unless empty.
      const shared = (state.retailCatalog && state.retailCatalog.length) ? state.retailCatalog : (found.catalog || []);
      if (!(state.retailCatalog && state.retailCatalog.length) && shared.length) {
        state.retailCatalog = shared;
      }
      const brand = (state.brand && state.brand.colors) ? { name: cx.customerName, colors: state.brand.colors } : { name: cx.customerName };
      const appgen = APPGEN();
      const config = appId === "clienteling"
        ? appgen.buildClientelingConfig(found, brand, shared)
        : appgen.buildCimulateConfig(found, brand, shared);
      return { found: found, config: config };
    }

    if (!gen) {
      status("Gemini unavailable — using a customer-flavored template.");
      const r = assemble(fallbackFoundation(appId, cx));
      return Promise.resolve(Object.assign(r, { usedGemini: false }));
    }

    status("Checking AI availability…");
    return gen.isConfigured().then(function (ok) {
      if (!ok) {
        status("Gemini not configured — using a customer-flavored template.");
        return Object.assign(assemble(fallbackFoundation(appId, cx)), { usedGemini: false });
      }
      status("Generating " + appId + " data for " + cx.customerName + "…");
      return gen.generate({ prompt: prompt, jsonMode: true, useCache: true, temperature: 0.4 })
        .then(function (text) {
          const parsed = parseJson(text);
          if (!parsed) {
            status("AI response wasn't usable — using a customer-flavored template.");
            return Object.assign(assemble(fallbackFoundation(appId, cx)), { usedGemini: false });
          }
          parsed.customerName = cx.customerName;
          return Object.assign(assemble(parsed), { usedGemini: true });
        })
        .catch(function () {
          status("AI call failed — using a customer-flavored template.");
          return Object.assign(assemble(fallbackFoundation(appId, cx)), { usedGemini: false });
        });
    });
  }

  // ── R4: product photos via Gemini (default photorealistic) ───
  // Iterates the config's products, generating one image each, and returns
  // a { id → signedUrl } map to drop into config.productImages. SVG remains
  // the fallback for any product that fails. Batched, cache-friendly, and
  // fully skippable — returns {} if Gemini image-gen is unavailable.
  function generateProductPhotos(appId, config, opts) {
    opts = opts || {};
    const status = opts.onStatus || function () {};
    const gen = global.HOLO_GEMINI;
    const products = (config && (config.products || config.catalog)) || [];
    if (!gen || !gen.generateImage || !products.length) return Promise.resolve({});

    return gen.isConfigured().then(function (ok) {
      if (!ok) { status("Image generation unavailable — keeping illustrated fallbacks."); return {}; }
      const images = {};
      let done = 0;
      // Sequential to respect the server rate limit; progress per item.
      return products.reduce(function (chain, p) {
        return chain.then(function () {
          status("Generating photo " + (done + 1) + " of " + products.length + "…");
          return gen.generateImage({ prompt: photoPrompt(p, config) })
            .then(function (res) {
              const url = (res && (res.url || res.signedUrl || res)) || null;
              if (url && typeof url === "string") images[p.id] = url;
            })
            .catch(function () { /* leave this id to SVG fallback */ })
            .then(function () { done++; });
        });
      }, Promise.resolve()).then(function () {
        status("Generated " + Object.keys(images).length + " of " + products.length + " photos.");
        return images;
      });
    });
  }

  function photoPrompt(p, config) {
    const brand = (config && config.brand) || {};
    const name = p.name || "product";
    const cat = p.cat || p.category || p.variety || "";
    return [
      "Photorealistic studio product photo of \"" + name + "\"" + (cat ? (" (" + cat + ")") : "") + ",",
      "centered on a clean neutral seamless background, soft even lighting, subtle reflection,",
      "e-commerce hero shot, no text overlay, no watermark, high detail.",
      brand.logoTop ? ("Brand context: " + brand.logoTop + ".") : "",
    ].filter(Boolean).join(" ");
  }

  global.HOLO_APPFOUND = {
    generate: generate,
    generateProductPhotos: generateProductPhotos,
    _parseJson: parseJson,
  };
})(window);
