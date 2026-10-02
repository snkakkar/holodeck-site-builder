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
      // Real company logo (data URL or path) from setup. Rendered in place of the
      // apps' generic text logo when present; empty falls back to the text logo.
      logoImage: b.logoPath || "",
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
  // `simple` (optional) carries the Simple-mode wizard answers for this app:
  //   { memberPromos, recProducts } — free-text hints the SE typed. Absent for
  //   the full builder, so those lines drop out and the prompt is unchanged.
  function promptForClienteling(cx, simple, seedCatalog) {
    simple = simple || {};
    const hasSeed = Array.isArray(seedCatalog) && seedCatalog.length === 12;
    return [
      "You are generating realistic demo data for a RETAIL CLIENTELING app (a store-associate / sales-floor tool) for the customer \"" + cx.customerName + "\" in the " + cx.industry + " industry.",
      cx.website ? ("Their website: " + cx.website + ".") : "",
      cx.bigProblem ? ("Business problem in the demo story: " + cx.bigProblem) : "",
      cx.futureVision ? ("Future vision: " + cx.futureVision) : "",
      cx.persona ? ("Primary persona: " + JSON.stringify({ name: cx.persona.name, role: cx.persona.role, quote: cx.persona.quote })) : "",
      simple.memberPromos ? ("MEMBER PROMOS to feature: " + String(simple.memberPromos).slice(0, 400) + ". Weave these into walkIns[].headline/detail, coach.<id>.nba, and copy.featurePourLabel so the associate can pitch them.") : "",
      simple.recProducts ? ("RECOMMENDED PRODUCTS to spotlight: " + String(simple.recProducts).slice(0, 400) + ". Make sku1 (the flagship/featured catalog item) and the coach.<id>.starters reflect these; keep them on-brand for " + cx.customerName + ".") : "",
      hasSeed ? ("THIS CUSTOMER'S REAL PRODUCT CATALOG (already photographed for their storefront) — do NOT invent different products: " + JSON.stringify(seedCatalog) + ". Return these EXACT 12 items verbatim as your \"catalog\" array (same ids/names/cat/price), and make every reference (coach.<id>.starters, walkIns, event, featured item) point at THESE real products.") : "",
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
      '  "catalog": [{ "id","name","cat","variety","region","price"(number),"score"(number),"scoreSource","badge","tastingNotes","story","foodPairings":[string] }]  // ' + (hasSeed
        ? "Return the EXACT 12 products given above, verbatim (same ids/names/cat/price) — do not invent new ones."
        : 'EXACTLY 12 realistic on-brand products. Use STABLE ids "sku1".."sku12" IN ORDER (sku1 is the flagship/featured item). "cat"=category across 2-3 categories; reuse variety/region/tastingNotes/foodPairings as generic attribute/origin/description/complements for non-wine categories.'),
      "}",
      hasSeed
        ? ("This catalog is FIXED (given above) and already shared with this customer's other app (an e-commerce storefront) — \"sku3\" is the SAME physical product in both apps. Keep copy concise and sales-floor realistic.")
        : ("SHARED CATALOG CONTRACT: this customer\'s other app (an e-commerce storefront) uses the SAME 12-SKU catalog with the SAME ids sku1..sku12 — so \"sku3\" is the SAME physical product in both apps. Make the catalog genuinely appropriate for " + cx.customerName + " (real-sounding SKUs in their category), EXACTLY 12 products with ids sku1..sku12, sku1 = the flagship. Keep copy concise and sales-floor realistic."),
    ].filter(Boolean).join("\n");
  }

  // `simple` (optional) carries the Simple-mode wizard answers, merged from
  // the shared "General" question group plus this app's own:
  //   { searchTerms:[…], chatChips:[…] } — up to 4/6 respectively. When
  //   present we ask Gemini to seed the searchChips / greetChips from them
  //   WHILE still honoring the strict 4×3=12 SKU-union and verbatim-key
  //   routing contracts. Absent for the full builder → the extra lines drop
  //   out unchanged.
  function promptForCimulate(cx, simple, seedCatalog) {
    simple = simple || {};
    const sq = (simple.searchTerms || []).filter(Boolean).slice(0, 4);
    const aq = (simple.chatChips || []).filter(Boolean).slice(0, 4);
    const hasSeed = Array.isArray(seedCatalog) && seedCatalog.length === 12;
    return [
      "You are generating realistic demo data for an INTENT-AWARE PRODUCT SEARCH + concierge-agent shopping experience (an e-commerce storefront) for \"" + cx.customerName + "\" in the " + cx.industry + " industry.",
      cx.website ? ("Their website: " + cx.website + ".") : "",
      cx.bigProblem ? ("Business problem in the demo story: " + cx.bigProblem) : "",
      cx.futureVision ? ("Future vision the demo builds toward: " + cx.futureVision) : "",
      cx.persona ? ("Primary shopper persona: " + JSON.stringify({ name: cx.persona.name, role: cx.persona.role, quote: cx.persona.quote })) : "",
      (cx.storyActs && cx.storyActs.length) ? ("Demo story beats (use these to ground the shopper's goals and the example search queries): " + JSON.stringify(cx.storyActs).slice(0, 1200)) : "",
      sq.length ? ("SEED SEARCH QUERIES: use these exact shopper queries as the label/q of the FIRST " + sq.length + " searchChips (in order), then invent the remaining chips to reach EXACTLY 4: " + JSON.stringify(sq) + ". Each seeded chip still needs its own 3 distinct resultIds so the 4×3=12 SKU-union contract holds.") : "",
      aq.length ? ("SEED AGENT QUESTIONS: the shopper wants to ask the concierge these — make each one a sommIntent whose FIRST key is a clean chip-friendly phrase, and surface them as the leading greetChips (each greetChip q copied VERBATIM from its sommIntent key): " + JSON.stringify(aq) + ".") : "",
      hasSeed ? ("THIS CUSTOMER'S REAL PRODUCT CATALOG (already photographed for their storefront) — do NOT invent different products: " + JSON.stringify(seedCatalog) + ". Return these EXACT 12 items verbatim as your \"catalog\" array (same ids/names/cat/price). Build your 4 searchChips by grouping these 12 products by shared \"cat\" (or sensible shopping intent) into chips of 3 — every resultId must be one of these given ids, and every given id must appear in exactly one chip.") : "",
      "",
      "CRITICAL VOCABULARY RULE: Use " + cx.customerName + "'s REAL industry language everywhere. Do NOT use wine/bottle/sommelier/'Somm'/tasting terminology UNLESS " + cx.customerName + " actually sells wine. The storefront chrome (brand logo text, concierge name/subtitle, hero headline, search suggestion chips, category nav, promo tiles, footer blurb, section headings) is rendered VERBATIM from the fields you return — make every string fit THIS customer's category.",
      "",
      "Return STRICT JSON (no markdown) with this shape:",
      "{",
      '  "brand": { "logoTop": string, "logoSub": string, "conciergeName": string, "conciergeSub": string },  // logoTop=brand name; conciergeName=on-brand assistant (NOT "Somm"); conciergeSub e.g. "Your personal <category> concierge"',
      '  "storeLocation": string,',
      '  "unitNoun": string,       // what one catalog item is called, singular (e.g. "item","club","pair","bottle"). Used in copy like "Find your next favorite <unitNoun>".',
      '  "heroHeadline": string,   // e.g. "Find your next favorite <thing>" in the customer\'s category',
      '  "searchChips": [{ "label": string, "icon": string, "q": string, "resultIds": [string,string,string], "signals": [string] }],  // EXACTLY 4 chips. This is a scripted demo: clicking a chip shows EXACTLY its 3 resultIds (no live search). label/q=an INTENT-RICH natural-language query this persona would type (a GOAL or PROBLEM in their own words, NOT a bare category/SKU). Good (golf): "driver to fix my slice","waterproof rain jacket for tournaments","beginner iron set under $600". icon=a Font Awesome name (e.g. "fa-golf-ball-tee","fa-shirt","fa-fire"). resultIds=EXACTLY 3 ids that exist in your "catalog" and genuinely match the query. signals=3-4 short Data-360 explanation tags for the results page (e.g. "category: Clubs","fixes: slice","price ≤ $500"). NEVER wine unless the customer sells wine.',
      '  "navCategories": [string],// 2-4 top category labels for the storefront nav',
      '  "promoTiles": [{ "title": string, "sub": string }],  // 1-3 merchandising promo tiles',
      '  "footerBlurb": string,    // one-line brand descriptor for the footer (NOT "America\'s Wine Superstore")',
      '  "sectionHeadings": { "featured": string, "curated": string, "trending": string, "specials": string, "topCat": string, "savings": string },  // homepage rail titles in the customer\'s voice',
      '  "copy": { "heroEyebrow": string, "heroSub": string, "heroShopCta": string, "heroAskCta": string, "featuredHeading": string, "featuredSub": string, "profileGreeting": string, "profileTierTag": string, "searchHintLabel": string, "curatedSub": string, "sommIntro": string, "utilityFulfill": string },  // customer-voiced UI copy. You MAY use these {token} placeholders and they will be substituted: {firstName} {tier} {concierge} {searchProduct} {unit} {store} {brand}. Do NOT invent other tokens.',
      '  "profile": { "name","tier","interests":[string] },',
      '  "catalog": [{ "id","cat","name","type","region","price"(number),"rating"(number),"ratingSource","badge","notes","pairings":[string],"flavors":[string] }],  // ' + (hasSeed
        ? "Return the EXACT 12 products given above, verbatim (same ids/names/cat/price) — do not invent new ones."
        : 'EXACTLY 12 realistic on-brand products = the union of the 4 searchChips\' resultIds (4 chips × 3 = 12). Use STABLE ids "sku1".."sku12" IN ORDER; every searchChips resultId MUST be one of these ids. Across 2-3 categories. Reuse type/region/pairings/flavors as generic attribute/origin/complements/traits for non-wine categories.'),
      '  "greetChips": [{ "label": string, "q": string, "say": string }],  // 4-5 opening quick-reply chips for the concierge. DETERMINISTIC (scripted demo, no free typing): "q" MUST be COPIED VERBATIM from the "keys" of exactly one sommIntent below — clicking the chip shows that intent\'s reply 1:1. "label"=button text w/ optional emoji; "say"=the natural sentence shown in the user\'s chat bubble. Include industry-appropriate shopping starters + one service chip (its q = a built-in service key: one of "help me with something","track my order","delivery","store hours","rewards","return").',
      '  "sommIntents": [{ "keys":[string], "text": string, "recIds":[string], "rail": { "title": string, "sub": string, "ids":[string] }, "chips":[{ "label": string, "q": string, "say": string }] }],  // 6 shopping intents. keys=SHORT trigger phrases that chips will reference by EXACT string (make the FIRST key a clean, chip-friendly phrase like "fix my slice","launch monitor","gift"); text=concierge reply (HTML ok); recIds=catalog ids to show as rec cards; rail (optional)=a curated rail of ids; chips (optional)=follow-up quick chips whose "q" is ALSO a verbatim key of one sommIntent (so every follow-up also routes 1:1). The concierge is generic — do NOT self-refer as a sommelier.',
      '  "serviceData": { "order": string, "orderPlaced": string, "eta": string, "hoursToday": string, "pickupEta": string, "associate": string, "points": string, "reward": string, "refundAmt": string },  // sample values for the built-in service flows (order status, delivery, hours, rewards, returns) in the customer\'s voice',
      '  "celebs": { "<lowercasename>": { "match": string, "productIds":[string] } }  // 1-2 celebrity/affinity tie-ins if relevant, else {}',
      "}",
      "Products must be genuinely appropriate for " + cx.customerName + " (their real category). " + (hasSeed
        ? "This catalog is FIXED (given above) and already shared with this customer's other app (an in-store clienteling tool) — \"sku3\" is the SAME physical product in both apps."
        : "SHARED CATALOG CONTRACT: this customer's other app (an in-store clienteling tool) uses the SAME 12-SKU catalog with the SAME ids sku1..sku12 — so \"sku3\" is the SAME physical product in both apps.") + " CRITICAL: use STABLE ids sku1..sku12; return EXACTLY 4 searchChips, each with EXACTLY 3 resultIds, and EXACTLY 12 catalog products whose ids (sku1..sku12) are precisely the union of those resultIds — every resultId maps to a catalog product and every catalog product is the result of some chip. The 12 resultIds MUST be DISTINCT: no SKU may appear in more than one chip (4 chips × 3 unique ids each = all 12 SKUs, each used exactly once). The 3 products under a chip must genuinely satisfy that chip's query. sommIntents should cover shopping (find/recommend by taste, occasion, budget, category) and reuse the SAME catalog ids in recIds/rail. The service flows (order status, delivery, returns, rewards) are built in and driven by serviceData — do NOT duplicate them as intents. DETERMINISTIC CONCIERGE CONTRACT: there is NO free-text search — every greetChip and every follow-up chip's \"q\" MUST be copied verbatim from some sommIntent's \"keys\" (or one of the built-in service keys listed above) so each click maps 1:1 to exactly one reply. Do NOT invent a chip q that isn't an intent key.",
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
      // ── DETERMINISTIC CONCIERGE (Gemini-off) ──────────────────────
      // cimulate's concierge is chip-driven and 1:1: every chip `q` must be a
      // verbatim key of some sommIntent, or the click dead-ends on the generic
      // opener. When Gemini is off we still need a working concierge, so seed a
      // few neutral intents keyed off the seed SKUs (sku1..sku12). greetChips'
      // `q` values match the intent keys exactly. Clienteling ignores these.
      greetChips: [
        { label: "✨ Recommend something", q: "recommend", say: "Recommend something popular" },
        { label: "🔥 What's trending", q: "trending", say: "What's trending right now?" },
        { label: "🎁 Help me pick a gift", q: "gift", say: "Help me pick a gift" },
        { label: "🛎️ Service & account help", q: "help me with something", say: "I need help with my account" },
      ],
      sommIntents: [
        { keys: ["recommend", "popular", "best seller", "what should i get"],
          text: "Happy to help! Based on your profile, here are two of our most-loved picks:",
          recIds: ["sku1", "sku2"],
          rail: { title: "Recommended for you", sub: "{concierge} picked these from your unified profile.", ids: ["sku1", "sku2", "sku3"] } },
        { keys: ["trending", "new", "whats new", "new arrivals"],
          text: "These are getting a lot of love from customers like you right now:",
          recIds: ["sku4", "sku5"],
          rail: { title: "New & trending", sub: "Fresh picks moving fast.", ids: ["sku4", "sku5", "sku6"] } },
        { keys: ["gift", "present", "birthday", "give"],
          text: "A great gift should feel special. Either of these makes a memorable pick:",
          recIds: ["sku1", "sku7"] },
      ],
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

  // A neutral 12-SKU seed catalog when nothing else is available. GENERIC RETAIL
  // (no wine terms) so the pre-context preview reads like a real store — the
  // distinct `cat` values also drive the storefront category nav + search chips.
  // 12 (not 6) because cimulate's scripted search pins 4 chips × 3 results = 12
  // distinct SKUs; a 6-SKU seed would force chips to share results. Clienteling
  // simply uses the first 6-ish it needs, so a larger seed is harmless there.
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
    for (let i = 1; i <= 12; i++) {
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

  // Derive the Clienteling/Cimulate shared 12-SKU catalog from Retail CAB's
  // real (already-photographed) catalog instead of inventing + photographing
  // a brand-new one. Groups CAB's SKUs by category (up to 4 categories, 3
  // each) so the result lines up with cimulate's "4 chips × 3 results"
  // contract, backfills from any category if some are short, and remaps the
  // chosen ids to sku1..sku12. Returns null if cabCatalog isn't usable.
  function pickSharedCatalogFromCab(cabCatalog, cabImages, cx) {
    const list = Array.isArray(cabCatalog) ? cabCatalog.filter(function (p) { return p && p.id; }) : [];
    if (list.length < 1) return null;
    cabImages = cabImages || {};
    const byCat = {};
    list.forEach(function (p) {
      const c = String(p.category || p.family || "General");
      (byCat[c] = byCat[c] || []).push(p);
    });
    const cats = Object.keys(byCat).sort(function (a, b) { return byCat[b].length - byCat[a].length; }).slice(0, 4);
    const picked = [];
    cats.forEach(function (c) { picked.push.apply(picked, byCat[c].slice(0, 3)); });
    if (picked.length < 12) {
      const pickedIds = {};
      picked.forEach(function (p) { pickedIds[p.id] = true; });
      for (let i = 0; i < list.length && picked.length < 12; i++) {
        if (!pickedIds[list[i].id]) { picked.push(list[i]); pickedIds[list[i].id] = true; }
      }
    }
    const chosen = picked.slice(0, 12);
    if (!chosen.length) return null;
    const images = {};
    const catalog = chosen.map(function (p, i) {
      const newId = "sku" + (i + 1);
      const url = cabImages[p.id];
      if (url) images[newId] = url;
      const cat = String(p.category || p.family || "General");
      return {
        id: newId, name: p.name, price: Number(p.price) || 0,
        cat: cat, category: cat,
        variety: p.type || p.family || "", type: p.type || p.family || "",
        description: p.description || "", badge: "",
      };
    });
    return { catalog: catalog, images: images };
  }

  // ── main: generate foundation + config for one app ───────────
  // opts.onStatus(msg, frac) — optional progress callback. `frac` is this
  // stage's own 0→1 completion (data extraction + config assembly); the
  // caller maps it into whatever slice of an overall bar it owns.
  // Resolves { found, config, usedGemini }.
  function generate(appId, state, opts) {
    opts = opts || {};
    if (appId === "retailCab") return generateRetailCab(state, opts);
    const cx = ctxFrom(state);
    const status = opts.onStatus || function () {};
    const gen = global.HOLO_GEMINI;

    // Simple-mode answers for this app (optional) steer the prompt; undefined
    // in the full builder so behavior is identical.
    const simpleAnswers = opts.simpleAnswers || {};
    // When Retail CAB was generated in this same build (opts.cabSeed =
    // { catalog, images } from its config), derive the shared catalog from
    // CAB's real, already-photographed products instead of inventing a new
    // one — this is what lets Clienteling/Cimulate reuse CAB's photos with
    // zero additional Gemini image calls (see assemble() below).
    const cabSeed = (opts.cabSeed && Array.isArray(opts.cabSeed.catalog) && opts.cabSeed.catalog.length)
      ? pickSharedCatalogFromCab(opts.cabSeed.catalog, opts.cabSeed.images, cx)
      : null;
    const prompt = appId === "clienteling"
      ? promptForClienteling(cx, simpleAnswers, cabSeed && cabSeed.catalog)
      : promptForCimulate(cx, simpleAnswers, cabSeed && cabSeed.catalog);

    // Build the runtime config from an extracted/fallback foundation. Resolves
    // the shared 12-SKU catalog (reuse-or-rebuild, never a growing union), then
    // hands it to the per-app config builder.
    function assemble(found) {
      // ── ONE SHARED CATALOG, TWO VIEWS ──────────────────────────
      // Both apps share a single 12-SKU brand catalog keyed by STABLE ids
      // (sku1..sku12), so "sku3" is the SAME physical product in the storefront
      // (cimulate) and the in-store tool (clienteling). The catalog is built
      // ONCE and keyed to the story signature (opts.storySig): the first app to
      // generate seeds state.retailCatalog; the second app REUSES it verbatim
      // (0 image calls downstream). We only REBUILD — replacing the whole set,
      // never unioning — when there is no shared catalog yet or the story
      // signature changed (opts.rebuildCatalog). This is what keeps the catalog
      // pinned at exactly 12 SKUs instead of ballooning on each regenerate.
      const own = Array.isArray(found.catalog) ? found.catalog : [];
      const prevShared = Array.isArray(state.retailCatalog) ? state.retailCatalog : [];
      const haveShared = prevShared.length >= 1;
      const sigMatch = opts.storySig != null && state.retailCatalogSig === opts.storySig;
      let shared;
      if (haveShared && sigMatch && !opts.rebuildCatalog) {
        // REUSE: same story, catalog already built — keep it exactly as-is.
        shared = prevShared;
      } else if (cabSeed) {
        // REBUILD from Retail CAB's real catalog: the shared 12 ARE a slice
        // of CAB's actual (already-photographed) products, so seed the
        // shared image store from CAB's images too — generateProductPhotos'
        // existing dedup then sees nothing pending and makes 0 image calls.
        shared = cabSeed.catalog;
        state.retailCatalog = shared;
        state.retailCatalogSig = opts.storySig || "";
        state.retailImages = cabSeed.images;
      } else {
        // REBUILD: fresh, complete set (replace, not union). Fall back to the
        // neutral seed so we always land a clean 12. Clear the shared images —
        // they were generated against the old catalog and must be regenerated.
        shared = own.length ? own : seedCatalog(cx);
        state.retailCatalog = shared;
        state.retailCatalogSig = opts.storySig || "";
        state.retailImages = null;
      }
      found.catalog = shared;
      const brand = { name: cx.customerName, flatColors: cx.flatColors, logoImage: cx.logoImage || "" };
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

  // ── Retail CAB: own generation pipeline ───────────────────────
  // Retail CAB doesn't fit the clienteling/cimulate prompt+shared-catalog
  // shape above — it's a schema-constrained Gemini call over its own
  // (much larger) catalog, seeded by a site scrape, with its own three
  // image-generation passes (product/styled-post/hero). Ported from the
  // standalone Retail CAB Demo Creator's builder.js onGenerate() flow;
  // logic unchanged, just wrapped in a promise chain that matches this
  // dispatcher's { found, config, usedGemini } contract instead of
  // driving its own status/progress DOM directly.
  function generateRetailCab(state, opts) {
    opts = opts || {};
    const status = opts.onStatus || function () {};
    const F = global.HOLO_RETAILCABFOUND;
    const CG = global.HOLO_RETAILCABGEN;
    const SCRAPE = global.HOLO_SCRAPE;
    const gen = global.HOLO_GEMINI;

    // Each failure point passes its own reason so the user sees what
    // actually broke instead of one generic "Gemini unavailable" message
    // regardless of whether it was auth, scrape, bad AI output, or image gen.
    function fallback(reason) {
      status((reason || "Gemini unavailable") + " — using stock storefront defaults.", 1);
      return { found: null, config: null, usedGemini: false };
    }

    if (!gen || !F || !CG) return Promise.resolve(fallback("Gemini client not available"));

    const cx = F.ctxFrom(state, opts.simpleAnswers);
    status("Checking AI availability…", 0.05);
    return gen.isConfigured().then(function (ok) {
      if (!ok) return fallback("Gemini not configured");
      status("Scraping " + (cx.website || "site") + "…", 0.1);
      const scrapePromise = (SCRAPE && cx.website) ? SCRAPE.scrapeSite(cx.website) : Promise.resolve(null);
      // Scrape failure is non-fatal — continue without scraped data rather
      // than aborting the whole generation over a site that just couldn't
      // be reached.
      return scrapePromise.catch(function (err) {
        status("Site scrape failed (" + ((err && err.message) || "unknown error") + ") — continuing without it…", 0.15);
        return null;
      }).then(function (scraped) {
        status("Generating catalog & brand with Gemini…", 0.25);
        return gen.generate({
          prompt: F.promptForStorefront(cx, scraped),
          jsonMode: true,
          schema: F.storefrontSchema(),
          temperature: 0.4,
          maxOutputTokens: 65536,
          useCache: true,
        }).then(function (text) {
          const found = parseJson(text);
          if (!found || !Array.isArray(found.catalog)) return fallback("AI response wasn't usable");
          status("Assembling storefront configuration…", 0.4);
          // Build once (no photos yet) to get the catalog + styledPosts shape —
          // neither depends on images, so all three photo passes below can read
          // from this same config and run concurrently instead of serially.
          const baseConfig = CG.buildStorefrontConfig(found, cx, {}, scraped && scraped.brandColor, null, scraped);
          const productsByName = {};
          baseConfig.catalog.forEach(function (p) { productsByName[p.name] = p; });
          status("Generating product, styled-post, and hero photos…", 0.45);
          return Promise.all([
            F.generateProductPhotos(baseConfig.catalog, baseConfig.productImages, cx, {
              batchSize: opts.batch || 8,
              onProgress: function (d, t) { status("Product photos " + d + "/" + t + "…", 0.45 + (t ? 0.2 * d / t : 0)); },
            }),
            F.generateStyledPostPhotos(baseConfig.styledPosts, productsByName, cx, {
              batchSize: opts.batch || 8,
              onProgress: function (d, t) { status("Styled-post photos " + d + "/" + t + "…", 0.45 + (t ? 0.2 * d / t : 0)); },
            }),
            F.generateHeroImages(cx, {
              catalog: baseConfig.catalog,
              onProgress: function (d, t) { status("Hero photos " + d + "/" + t + "…", 0.45 + (t ? 0.2 * d / t : 0)); },
            }),
          ]).then(function (results) {
            const images = results[0], styledImages = results[1], heroImages = results[2];
            const config = CG.buildStorefrontConfig(found, cx, images, scraped && scraped.brandColor, styledImages, scraped, heroImages);
            status("Retail CAB configuration ready.", 1);
            return { found: found, config: config, usedGemini: true };
          }).catch(function (err) {
            if (global.console) console.warn("[retailCab] image generation failed:", (err && err.message) || err);
            return fallback("Image generation failed (" + ((err && err.message) || "unknown error") + ")");
          });
        });
      });
    }).catch(function (err) {
      const msg = (err && err.message) || String(err);
      if (global.console) console.warn("[retailCab] generation failed:", msg);
      return fallback("Generation failed (" + msg + ")");
    });
  }

  // ── R4: product photos via Gemini (default photorealistic) ───
  // Iterates the config's products, generating one image each, and returns
  // a { id → signedUrl } map to drop into config.productImages. SVG remains
  // the fallback for any product that fails. Batched, cache-friendly, and
  // fully skippable — returns {} if Gemini image-gen is unavailable.
  //
  // opts.existingImages ({id:url}) lets the caller pass the SHARED image store
  // so already-imaged SKUs are reused, not regenerated. This is what makes the
  // second app (and an unchanged-story regenerate) cost 0 image calls: it starts
  // from the shared 12 and only images the ids that are actually missing.
  function generateProductPhotos(appId, config, opts) {
    opts = opts || {};
    const status = opts.onStatus || function () {};
    const signal = opts.signal || null; // AbortSignal — lets the caller cancel mid-run
    const aborted = function () { return !!(signal && signal.aborted); };
    const gen = global.HOLO_GEMINI;
    const products = (config && (config.products || config.catalog)) || [];
    // Start from any images the caller already has (shared store) so we skip them.
    const images = Object.assign({}, opts.existingImages || {});
    if (!products.length) return Promise.resolve(images);

    // Only the products still missing an image need a Gemini call.
    const pending = products.filter(function (p) { return p && p.id && !images[p.id]; });
    if (!pending.length) { status("Reusing existing product photos.", 1); return Promise.resolve(images); }
    if (!gen || !gen.generateImage) return Promise.resolve(images);

    const total = pending.length;
    return gen.isConfigured().then(function (ok) {
      if (!ok) { status("Image generation unavailable — keeping illustrated fallbacks.", 1); return images; }
      let done = 0;
      // Bounded-parallel waves (mirrors the Assets "Generate all" runBatch):
      // BATCH images at a time so a run is ~BATCH× faster than one-at-a-time
      // while staying well under the server's 30-req/60s rate limit. `frac`
      // is this stage's own 0→1 (photos completed / total). If the caller
      // aborts, we stop issuing new waves and return what we have.
      // Callers may raise the wave size via opts.batch (Simple mode passes 8 to
      // shave a wave off its ~12-image run); default 4 preserves the full
      // builder's Assets "Generate all" behavior exactly.
      const BATCH = Math.max(1, opts.batch || 4);
      const genOne = function (p) {
        return gen.generateImage({ prompt: photoPrompt(p, config, opts) })
          .then(function (res) {
            const url = (res && (res.url || res.signedUrl || res)) || null;
            if (url && typeof url === "string") images[p.id] = url;
          })
          .catch(function () { /* leave this id to SVG fallback */ })
          .then(function () {
            done++;
            status("Generating photo " + done + " of " + total + "…", done / total);
          });
      };
      const runWave = function (start) {
        if (aborted()) return Promise.resolve(); // cancelled — issue no further waves
        const slice = pending.slice(start, start + BATCH);
        if (!slice.length) return Promise.resolve();
        return Promise.all(slice.map(genOne)).then(function () { return runWave(start + BATCH); });
      };
      return runWave(0).then(function () {
        if (aborted()) { status("Cancelled.", done / total); return images; }
        status("Generated " + Object.keys(images).length + " of " + products.length + " photos.", 1);
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
    // Retail CAB doesn't use this clienteling/cimulate fallback assembly — its
    // stock template already ships full generic-retail default data.
    if (appId === "retailCab") return null;
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
    const brand = { name: cx.customerName || "", flatColors: cx.flatColors, logoImage: cx.logoImage || "" };
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
