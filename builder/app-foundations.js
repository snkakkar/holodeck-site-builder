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
    // Flat brand colors from project setup (state.brand.{primary,secondary,
    // accent}Color). The config generator derives the full theme palette from
    // these so both apps recolor per-customer instead of staying teal.
    const b = (state && state.brand) || {};
    const flatColors = {
      primary: b.primaryColor || "",
      secondary: b.secondaryColor || "",
      accent: b.accentColor || "",
    };
    return {
      flatColors: flatColors,
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
      "You are generating realistic demo data for a RETAIL CLIENTELING app (a store-associate / sales-floor tool) for the customer \"" + cx.customerName + "\" in the " + cx.industry + " industry.",
      cx.website ? ("Their website: " + cx.website + ".") : "",
      cx.bigProblem ? ("Business problem in the demo story: " + cx.bigProblem) : "",
      cx.futureVision ? ("Future vision: " + cx.futureVision) : "",
      cx.persona ? ("Primary persona: " + JSON.stringify({ name: cx.persona.name, role: cx.persona.role, quote: cx.persona.quote })) : "",
      "",
      "CRITICAL VOCABULARY RULE: Use " + cx.customerName + "'s REAL industry language everywhere. Do NOT use wine/bottle/tasting/sommelier/vintage/cellar terminology UNLESS " + cx.customerName + " actually sells wine. Every label, product, event, and unit noun must fit THIS customer's category (e.g. a golf retailer uses 'clubs'/'fitting'/'bay'; a beauty retailer uses 'products'/'consultation'; a bank uses 'accounts'/'appointment'). The app chrome (nav labels, KPI labels, search placeholder, concierge name, intro narrative, unit noun) is rendered VERBATIM from the fields you return.",
      "",
      "Return STRICT JSON (no markdown) with this shape:",
      "{",
      '  "conciergeName": string,  // branded in-store assistant name in the customer\'s voice (NOT "Vino")',
      '  "unitNoun": string,       // what one catalog item is called, plural (e.g. "items","clubs","pairs","bottles"). Used in copy like "96 <unitNoun> owned".',
      '  "introScene": { "headline": string, "detail": string, "ctaLabel": string },  // opening narrative: <persona> arrives / opens the app for <event>. ctaLabel e.g. "Enter the store".',
      '  "navLabels": { "dashboard": string, "checkin": string, "customer360": string, "event": string, "inventory": string },  // sidebar nav in the customer\'s language',
      '  "searchPlaceholder": string,  // e.g. "Search guests, <items>, orders…"',
      '  "copy": { "checkinGreeting": string, "checkinSub": string, "coachTipTitle": string, "featurePourLabel": string, "chatGreeting": string, "chatInputPlaceholder": string, "quickPrompts":[string], "inventoryChips":[string] },  // associate-facing UI copy in the customer\'s voice. You MAY use these {token} placeholders (substituted at runtime): {firstName} {customer} {rank} {memberSince} {manager} {managerStore} {store} {event} {unit} {concierge}. featurePourLabel = the "Tonight\'s Featured Item" heading. Do NOT invent other tokens.',
      '  "customer": { "name","location","visitingStore","rank","memberSince"(number),"ltv"(number),"ytdSpend"(number),"itemCount"(number),"interests":[string],"affinities":[{"label","value"(0-100)}],"birthday","travelNote","channels":{"email","phone","preferred"},"history":[{"product","date","price"(number),"status","qty"(number)}],"timeline":[{"icon":"mobile|store|web|bag","text","when"}] },',
      '  "homeStoreManager": { "name","store","title" },',
      '  "managerMessage": { "from":{"name","store","title"},"to","forwardTo","text","when" },',
      '  "event": { "name","type","displayLabel","store","date","host","seatsTotal"(number),"blurb","attendees":[{"name","tier","vip"(bool)}] },  // an on-brand in-store event/class/experience. displayLabel e.g. "<name> · Tonight 7PM".',
      '  "store": { "name","statusLabel","managerTitle","kpis":[{"label":string,"value":(number|string)}] },  // 5 sales-floor KPIs with industry-appropriate LABELS (NOT "Wines poured")',
      '  "walkIns": [{ "id","name","tag","tier","headline","detail","cta" }],',
      '  "tasks": [{ "text","due","priority":"high|med|low" }],',
      '  "coach": { "<walkInId>": { "badge","title","starters":[string],"nba" } },  // starters = quick-prompt chips the associate can tap',
      '  "catalog": [{ "id","name","cat","variety","region","price"(number),"score"(number),"scoreSource","badge","tastingNotes","story","foodPairings":[string] }]  // 6 realistic on-brand products. "cat"=category; reuse variety/region/tastingNotes/foodPairings as generic attribute/origin/description/complements for non-wine categories.',
      "}",
      "Make the catalog products genuinely appropriate for " + cx.customerName + " (real-sounding SKUs in their category). 6 products. Keep copy concise and sales-floor realistic.",
    ].filter(Boolean).join("\n");
  }

  function promptForCimulate(cx) {
    return [
      "You are generating realistic demo data for an INTENT-AWARE PRODUCT SEARCH + concierge-agent shopping experience (an e-commerce storefront) for \"" + cx.customerName + "\" in the " + cx.industry + " industry.",
      cx.website ? ("Their website: " + cx.website + ".") : "",
      cx.bigProblem ? ("Business problem in the demo story: " + cx.bigProblem) : "",
      cx.futureVision ? ("Future vision the demo builds toward: " + cx.futureVision) : "",
      cx.persona ? ("Primary shopper persona: " + JSON.stringify({ name: cx.persona.name, role: cx.persona.role, quote: cx.persona.quote })) : "",
      (cx.storyActs && cx.storyActs.length) ? ("Demo story beats (use these to ground the shopper's goals and the example search queries): " + JSON.stringify(cx.storyActs).slice(0, 1200)) : "",
      "",
      "CRITICAL VOCABULARY RULE: Use " + cx.customerName + "'s REAL industry language everywhere. Do NOT use wine/bottle/sommelier/'Somm'/tasting terminology UNLESS " + cx.customerName + " actually sells wine. The storefront chrome (brand logo text, concierge name/subtitle, hero headline, search suggestion chips, category nav, promo tiles, footer blurb, section headings) is rendered VERBATIM from the fields you return — make every string fit THIS customer's category.",
      "",
      "Return STRICT JSON (no markdown) with this shape:",
      "{",
      '  "brand": { "logoTop": string, "logoSub": string, "conciergeName": string, "conciergeSub": string },  // logoTop=brand name; conciergeName=on-brand assistant (NOT "Somm"); conciergeSub e.g. "Your personal <category> concierge"',
      '  "storeLocation": string,',
      '  "unitNoun": string,       // what one catalog item is called, singular (e.g. "item","club","pair","bottle"). Used in copy like "Find your next favorite <unitNoun>".',
      '  "heroHeadline": string,   // e.g. "Find your next favorite <thing>" in the customer\'s category',
      '  "searchChips": [string],  // 3-5 INTENT-RICH natural-language search queries this persona would type — describe a GOAL or PROBLEM in their own words, not a bare category/product name. Ground them in the demo story above. Each MUST map to a real product in your "catalog" below so clicking it returns results. Good (golf): "driver to fix my slice", "waterproof rain jacket for tournaments", "beginner iron set under $600". Bad: "Clubs", "Drivers", a bare SKU name. NEVER wine unless the customer sells wine.',
      '  "navCategories": [string],// 2-4 top category labels for the storefront nav',
      '  "promoTiles": [{ "title": string, "sub": string }],  // 1-3 merchandising promo tiles',
      '  "footerBlurb": string,    // one-line brand descriptor for the footer (NOT "America\'s Wine Superstore")',
      '  "sectionHeadings": { "featured": string, "curated": string, "trending": string, "specials": string, "topCat": string, "savings": string },  // homepage rail titles in the customer\'s voice',
      '  "copy": { "heroEyebrow": string, "heroSub": string, "heroShopCta": string, "heroAskCta": string, "featuredHeading": string, "featuredSub": string, "profileGreeting": string, "profileTierTag": string, "searchHintLabel": string, "curatedSub": string, "sommIntro": string, "utilityFulfill": string },  // customer-voiced UI copy. You MAY use these {token} placeholders and they will be substituted: {firstName} {tier} {concierge} {searchProduct} {unit} {store} {brand}. Do NOT invent other tokens.',
      '  "profile": { "name","tier","interests":[string] },',
      '  "catalog": [{ "id","cat","name","type","region","price"(number),"rating"(number),"ratingSource","badge","notes","pairings":[string],"flavors":[string] }],  // 12 realistic on-brand products across 2-3 categories. Reuse type/region/pairings/flavors as generic attribute/origin/complements/traits for non-wine categories.',
      '  "greetChips": [{ "label": string, "q": string }],  // 4-5 opening quick-reply chips for the concierge (label=button text w/ optional emoji, q=the query it sends). Industry-appropriate shopping starters + one service chip.',
      '  "sommIntents": [{ "keys":[string], "text": string, "recIds":[string], "rail": { "title": string, "sub": string, "ids":[string] }, "chips":[{ "label": string, "q": string }] }],  // 6 shopping intents. keys=trigger phrases; text=concierge reply (HTML ok); recIds=catalog ids to show as rec cards; rail (optional)=a curated rail of ids; chips (optional)=follow-up quick chips. The concierge is generic — do NOT self-refer as a sommelier.',
      '  "serviceData": { "order": string, "orderPlaced": string, "eta": string, "hoursToday": string, "pickupEta": string, "associate": string, "points": string, "reward": string, "refundAmt": string },  // sample values for the built-in service flows (order status, delivery, hours, rewards, returns) in the customer\'s voice',
      '  "celebs": { "<lowercasename>": { "match": string, "productIds":[string] } }  // 1-2 celebrity/affinity tie-ins if relevant, else {}',
      "}",
      "Products must be genuinely appropriate for " + cx.customerName + " (their real category). 12 products. sommIntents should cover shopping (find/recommend by taste, occasion, budget, category). The service flows (order status, delivery, returns, rewards) are built in and driven by serviceData — do NOT duplicate them as intents.",
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
  // INDUSTRY-NEUTRAL: names swapped in from the project, generic chrome, and
  // NO wine vocabulary. Every chrome field the templates render verbatim has a
  // neutral value here so a Gemini-off build never shows wine text.
  function fallbackFoundation(appId, cx) {
    const seedCat = seedCatalog(cx);
    // When there's no customer yet (the generic first-preview), fall back to
    // neutral retail wording instead of interpolating an empty name.
    const name = cx.customerName || "";
    const brandWord = name || "the store";
    const conciergeName = name ? (name + " Concierge") : "Store Concierge";
    const personaName = (cx.persona && cx.persona.name) || "Your customer";
    const personaLoc = (cx.persona && cx.persona.location) || "Your City";
    const base = {
      customerName: name,
      conciergeName: conciergeName,
      conciergeSub: name ? ("Your personal " + name + " concierge") : "Your personal shopping concierge",
      storeLocation: personaLoc,
      unitNoun: "items",
      introScene: {
        headline: name ? (personaName + " opens the " + name + " app") : (personaName + " opens the app"),
        detail: "A personalized in-store experience, waiting at the location near them.",
        ctaLabel: "Enter the store",
      },
      navLabels: { dashboard: "Floor Dashboard", checkin: "Check-In", customer360: "Customer 360", event: "Event", inventory: "Inventory" },
      searchPlaceholder: "Search guests, items, orders…",
      heroHeadline: name ? ("Find your next favorite from " + name) : "Find your next favorite item",
      searchChips: [],
      navCategories: (cx.products || []).slice(0, 3),
      promoTiles: [],
      footerBlurb: (brandWord.charAt(0).toUpperCase() + brandWord.slice(1)) + " — personalized shopping, powered by your unified profile.",
      sectionHeadings: { featured: "Featured", curated: "Curated for you" },
      catalog: seedCat,
      customer: {
        name: personaName,
        location: personaLoc,
        rank: "Member",
        interests: (cx.products || []).slice(0, 3),
        affinities: [{ label: "Top category", value: 92 }, { label: "Secondary", value: 74 }],
      },
      profile: {
        name: personaName,
        tier: "Premium",
        interests: (cx.products || []).slice(0, 3),
      },
      _fallback: true,
    };
    return base;
  }

  // A neutral 6-SKU seed catalog when nothing else is available. GENERIC RETAIL
  // (no wine terms) so the pre-context preview reads like a real store — the
  // distinct `cat` values also drive the storefront category nav + search chips.
  function seedCatalog(cx) {
    // When there's no customer yet (generic first preview) use neutral wording
    // so SKU names don't render with a leading space / empty brand.
    const name = cx.customerName || "";
    const label = name ? (name + " ") : "";
    const owner = name || "our";
    // Generic retail departments — rotated across the seed SKUs so the nav /
    // chips show a believable multi-category store before any real context.
    const CATS = ["Featured", "Best Sellers", "New Arrivals", "Accessories"];
    const out = [];
    for (let i = 1; i <= 6; i++) {
      const c = CATS[(i - 1) % CATS.length];
      out.push({
        id: "sku" + i,
        name: label + "Signature Item " + i,
        category: c,
        cat: c,
        type: "Signature",
        variety: "Signature",
        region: "",
        price: 20 + i * 15,
        rating: 88 + (i % 5),
        score: 88 + (i % 5),
        notes: "A popular " + owner + " selection — placeholder copy until generated.",
        pairings: [],
        foodPairings: [],
        flavors: [],
      });
    }
    return out;
  }

  // ── main: generate foundation + config for one app ───────────
  // opts.onStatus(msg, frac) — optional progress callback. `frac` is this
  // stage's own 0→1 completion (data extraction + config assembly); the
  // caller maps it into whatever slice of an overall bar it owns.
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
      const brand = { name: cx.customerName, flatColors: cx.flatColors };
      if (state.brand && state.brand.colors) brand.colors = state.brand.colors;
      const appgen = APPGEN();
      const config = appId === "clienteling"
        ? appgen.buildClientelingConfig(found, brand, shared)
        : appgen.buildCimulateConfig(found, brand, shared);
      return { found: found, config: config };
    }

    if (!gen) {
      status("Gemini unavailable — using a customer-flavored template.", 1);
      const r = assemble(fallbackFoundation(appId, cx));
      return Promise.resolve(Object.assign(r, { usedGemini: false }));
    }

    status("Checking AI availability…", 0.1);
    return gen.isConfigured().then(function (ok) {
      if (!ok) {
        status("Gemini not configured — using a customer-flavored template.", 1);
        return Object.assign(assemble(fallbackFoundation(appId, cx)), { usedGemini: false });
      }
      status("Generating " + appId + " data for " + cx.customerName + "…", 0.25);
      return gen.generate({ prompt: prompt, jsonMode: true, useCache: true, temperature: 0.4 })
        .then(function (text) {
          const parsed = parseJson(text);
          if (!parsed) {
            status("AI response wasn't usable — using a customer-flavored template.", 1);
            return Object.assign(assemble(fallbackFoundation(appId, cx)), { usedGemini: false });
          }
          status("Assembling " + appId + " configuration…", 0.9);
          parsed.customerName = cx.customerName;
          return Object.assign(assemble(parsed), { usedGemini: true });
        })
        .catch(function () {
          status("AI call failed — using a customer-flavored template.", 1);
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
    const signal = opts.signal || null; // AbortSignal — lets the caller cancel mid-run
    const aborted = function () { return !!(signal && signal.aborted); };
    const gen = global.HOLO_GEMINI;
    const products = (config && (config.products || config.catalog)) || [];
    if (!gen || !gen.generateImage || !products.length) return Promise.resolve({});

    const total = products.length;
    return gen.isConfigured().then(function (ok) {
      if (!ok) { status("Image generation unavailable — keeping illustrated fallbacks.", 1); return {}; }
      const images = {};
      let done = 0;
      // Sequential to respect the server rate limit; progress per item. `frac`
      // is this stage's own 0→1 (photos completed / total). If the caller
      // aborts, we stop issuing new image calls and return what we have.
      return products.reduce(function (chain, p) {
        return chain.then(function () {
          if (aborted()) return; // cancelled — issue no further image calls
          status("Generating photo " + (done + 1) + " of " + total + "…", done / total);
          return gen.generateImage({ prompt: photoPrompt(p, config, opts) })
            .then(function (res) {
              const url = (res && (res.url || res.signedUrl || res)) || null;
              if (url && typeof url === "string") images[p.id] = url;
            })
            .catch(function () { /* leave this id to SVG fallback */ })
            .then(function () { done++; });
        });
      }, Promise.resolve()).then(function () {
        if (aborted()) { status("Cancelled.", done / total); return images; }
        status("Generated " + Object.keys(images).length + " of " + total + " photos.", 1);
        return images;
      });
    });
  }

  function photoPrompt(p, config, opts) {
    opts = opts || {};
    const brand = (config && config.brand) || {};
    const name = p.name || "product";
    const cat = p.cat || p.category || p.variety || "";
    const brandName = opts.customerName || brand.logoTop || brand.name || "";
    const industry = opts.industry || "";
    // Is this genuinely a beverage? Only then may the image show a bottle/glass.
    // Otherwise the photo must depict the actual product in the customer's
    // category — never default to wine/bottles for non-beverage retailers.
    const bevCat = /wine|spirit|beer|liquor|whisk|vodka|tequila|champagne|cocktail|beverage|drink/i.test(cat + " " + name);
    return [
      "Photorealistic studio product photo of \"" + name + "\"" + (cat ? (" (a " + cat + " product)") : "") + ",",
      industry ? ("a real retail product sold by a " + industry + " retailer" + (brandName ? (" (" + brandName + ")") : "") + ".") : "",
      "Centered on a clean neutral seamless background, soft even lighting, subtle reflection,",
      "e-commerce hero shot, no text overlay, no watermark, high detail.",
      bevCat ? "" : "IMPORTANT: This is NOT a beverage. Do NOT depict a wine bottle, liquor bottle, glass, or any alcohol — show the actual " + (cat || "retail") + " item itself.",
    ].filter(Boolean).join(" ");
  }

  // Synchronous, token-free config for the FIRST preview an app card shows —
  // before the user clicks "Preview". Runs the deterministic fallback path with
  // NO customer context (opts.generic) so it reads as plain, generic retail
  // (never Total Wine, never the customer's data yet). Cheap enough to call on
  // every render; the builder stashes the result so the iframe loads generic
  // retail instead of the stock (Total Wine) app-config.js.
  function buildFallbackConfig(appId, state, opts) {
    opts = opts || {};
    const cx = ctxFrom(state || {});
    if (opts.generic) {
      // Strip customer identity so the placeholder is industry-neutral retail.
      cx.customerName = "";
      cx.industry = "Retail";
      cx.website = "";
      cx.persona = null;
      cx.products = [];
      cx.storyActs = [];
    }
    const found = fallbackFoundation(appId, cx);
    const shared = found.catalog || [];
    // Keep the customer's brand colors even in the generic preview so the flow
    // is shown ON-BRAND from the very first (pre-Gemini) render.
    const brand = { name: cx.customerName || "", flatColors: cx.flatColors };
    const appgen = APPGEN();
    const config = appId === "clienteling"
      ? appgen.buildClientelingConfig(found, brand, shared)
      : appgen.buildCimulateConfig(found, brand, shared);
    // Mark the generic/preview config so the app shows neutral shopping-cart
    // placeholders for products (no AI photos yet). The AI pass clears this by
    // supplying real productImages; the confirmed preview drops the flag too.
    if (opts.generic) config._placeholder = true;
    return config;
  }

  global.HOLO_APPFOUND = {
    generate: generate,
    generateProductPhotos: generateProductPhotos,
    buildFallbackConfig: buildFallbackConfig,
    _parseJson: parseJson,
  };
})(window);
