// ════════════════════════════════════════════════════════════════
//  APP CONFIG GENERATOR  (R3)
//  Turns a project's extracted app-foundation data (see
//  app-foundations.js) into the exact window.APP_CONFIG object shape
//  each template app expects. Two entry points:
//     HOLO_APPGEN.buildClientelingConfig(found, brand, catalog)
//     HOLO_APPGEN.buildCimulateConfig(found, brand, catalog)
//  plus HOLO_APPGEN.toConfigJs(obj) for the exported app-config.js.
//
//  These are PURE, deterministic assemblers — no network. The gap-
//  filling / Gemini calls live in app-foundations.js; this module only
//  maps that data onto the template contract, applying safe defaults so
//  the produced object always renders. The shapes here MUST stay in
//  lockstep with demo-apps/<app>/app-config.js (the default configs).
// ════════════════════════════════════════════════════════════════

(function (global) {
  "use strict";

  // ── helpers ──────────────────────────────────────────────────
  function initialsOf(name) {
    const w = String(name || "").trim().split(/\s+/).filter(Boolean);
    if (!w.length) return "??";
    if (w.length === 1) return w[0].slice(0, 2).toUpperCase();
    return (w[0][0] + w[w.length - 1][0]).toUpperCase();
  }
  function pick(v, dflt) { return (v === undefined || v === null || v === "") ? dflt : v; }
  function arr(v) { return Array.isArray(v) ? v : []; }

  // Default brand palettes (used when branding hasn't produced colors yet).
  const DEFAULT_CLIENT_COLORS = { primary: "#01665c", primaryDk: "#014a43", primaryLt: "#0a877a", accent: "#b8975a", accentDk: "#96773f", accentLt: "#d8bd85" };
  const DEFAULT_CIM_COLORS    = { primary: "#008573", primaryDk: "#016d5e", primaryDeep: "#013b35", accent: "#b8975a", promo: "#e01a2b", promoDk: "#b8121f" };

  // Deterministic bottle/product cosmetic colors so procedural SVGs vary
  // without Gemini. Indexed round-robin over the catalog.
  const CAPSULES = [
    { capsuleColor: "#3a0d12", capsuleShine: "#6b1f2a", glassColor: "#2a0a10" },
    { capsuleColor: "#0a5d54", capsuleShine: "#12857a", glassColor: "#3f5f2a" },
    { capsuleColor: "#b8975a", capsuleShine: "#e4cf95", glassColor: "#2f5f2a" },
    { capsuleColor: "#3a2a10", capsuleShine: "#6b4f1f", glassColor: "#5a2f0a" },
    { capsuleColor: "#4a1018", capsuleShine: "#8b2535", glassColor: "#2a0a10" },
  ];
  function capsuleFor(i) { return CAPSULES[i % CAPSULES.length]; }

  // ── CLIENTELING ──────────────────────────────────────────────
  // found: output of HOLO_APPFOUND.extractClienteling(state) (see that file).
  // brand: { name, sub, colors } (from branding, optional).
  // catalog: shared retail catalog [{id,name,variety,region,price,...}].
  function buildClientelingConfig(found, brand, catalog) {
    found = found || {};
    brand = brand || {};
    const cat = mapCatalogToClienteling(arr(catalog).length ? catalog : found.catalog);
    const cust = found.customer || {};
    const mgr = found.homeStoreManager || {};

    const featuredId = (cat[0] && cat[0].id) || "";
    if (cat[0]) { cat[0].featured = true; cat[0].badge = cat[0].badge || "TONIGHT'S FEATURE"; }

    return {
      brand: {
        name: pick(brand.name, found.customerName || "YOUR BRAND").toUpperCase(),
        sub: pick(brand.sub, ""),
        hubLabel: "Clienteling Hub",
        conciergeName: pick(found.conciergeName, "Concierge"),
        assistantName: "Agentforce",
        colors: Object.assign({}, DEFAULT_CLIENT_COLORS, brand.colors || {}),
      },
      catalog: cat,
      featuredId: featuredId,
      customer: {
        id: "primary",
        name: pick(cust.name, "Jordan M."),
        initials: initialsOf(pick(cust.name, "Jordan M.")),
        location: pick(cust.location, "Austin, TX"),
        visitingStore: pick(cust.visitingStore, "Downtown Flagship"),
        rank: pick(cust.rank, "VIP Member"),
        memberSince: pick(cust.memberSince, 2015),
        propensity: "Most Likely",
        propensityScore: pick(cust.propensityScore, 92),
        ltv: pick(cust.ltv, 48200),
        ytdSpend: pick(cust.ytdSpend, 6100),
        bottles: pick(cust.itemCount, 96),
        engagementScore: pick(cust.engagementScore, 90),
        channels: cust.channels || { email: "member@example.com", phone: "+1 (•••) •••-••••", preferred: "Mobile App" },
        birthday: pick(cust.birthday, ""),
        anniversary: pick(cust.anniversary, ""),
        firstVisit: pick(cust.firstVisit, ""),
        travelNote: pick(cust.travelNote, "Meet the relationship where they are."),
        interests: arr(cust.interests).length ? cust.interests : ["Premium selections", "New arrivals"],
        affinities: arr(cust.affinities).length ? cust.affinities : [
          { label: "Top category", value: 92 }, { label: "Secondary interest", value: 74 },
        ],
        homeStoreManager: {
          name: pick(mgr.name, "Marie L."),
          initials: initialsOf(pick(mgr.name, "Marie L.")),
          store: pick(mgr.store, cust.location || "Home store"),
          title: pick(mgr.title, "Store Manager · home store"),
        },
        history: arr(cust.history),
        timeline: arr(cust.timeline),
      },
      managerMessage: found.managerMessage || {
        from: { name: pick(mgr.name, "Marie L."), initials: initialsOf(pick(mgr.name, "Marie L.")), store: pick(mgr.store, ""), title: pick(mgr.title, "Store Manager") },
        to: "Store team",
        forwardTo: pick(cust.name, "the member"),
        text: "Please give them a warm welcome and let them know we're thinking of them.",
        when: "Sent via Clienteling",
      },
      event: found.event || {
        id: "event",
        name: pick(found.eventName, "VIP Tasting Event"),
        store: pick(cust.visitingStore, "Flagship"),
        date: "Tonight · 7:00 PM",
        host: "Store Manager",
        seatsTotal: 16,
        featuredWineId: featuredId,
        blurb: "An intimate guided experience for members.",
        attendees: arr(found.attendees),
      },
      store: found.store || {
        name: pick(cust.visitingStore, "Flagship"),
        kpis: { guestsToday: 184, classSignups: 14, vipArrivals: 3, holdsPending: 7, pipeline: 12400 },
      },
      walkIns: arr(found.walkIns),
      tasks: arr(found.tasks),
      coach: found.coach || {},
      productImages: found.productImages || {},
    };
  }

  // ── CIMULATE ─────────────────────────────────────────────────
  function buildCimulateConfig(found, brand, catalog) {
    found = found || {};
    brand = brand || {};
    const products = mapCatalogToCimulate(arr(catalog).length ? catalog : found.catalog);

    return {
      brand: {
        logoTop: pick(brand.name, found.customerName || "Your Brand"),
        logoSub: pick(brand.sub, ""),
        conciergeName: pick(found.conciergeName, "Concierge"),
        conciergeSub: pick(found.conciergeSub, "Your personal concierge"),
        searchProduct: "Cimulate",
        colors: Object.assign({}, DEFAULT_CIM_COLORS, brand.colors || {}),
      },
      storeLocation: pick(found.storeLocation, (found.customer && found.customer.location) || "Your City"),
      products: products,
      profile: found.profile || {
        name: pick(found.customer && found.customer.name, "Member"),
        tier: pick(found.customer && found.customer.rank, "Premium"),
        interests: arr(found.customer && found.customer.interests),
      },
      sommIntents: arr(found.sommIntents),
      celebs: found.celebs || {},
      productImages: found.productImages || {},
    };
  }

  // ── catalog mappers ──────────────────────────────────────────
  // The shared retail catalog is a neutral SKU list. Each app needs a few
  // app-specific fields; these mappers add safe defaults so a raw catalog
  // (even a Gemini/seed one) renders in either template.
  function mapCatalogToClienteling(catalog) {
    return arr(catalog).map(function (p, i) {
      const cap = capsuleFor(i);
      return {
        id: pick(p.id, "sku" + i),
        name: pick(p.name, "Product " + (i + 1)),
        variety: pick(p.variety, p.type || p.category || ""),
        region: pick(p.region, ""),
        appellation: pick(p.appellation, p.region || ""),
        vintage: pick(p.vintage, ""),
        price: Number(pick(p.price, 0)),
        score: pick(p.score, p.rating || 90),
        scoreSource: pick(p.scoreSource, p.ratingSource || "Editor's Pick"),
        badge: pick(p.badge, ""),
        tastingNotes: pick(p.tastingNotes, p.notes || p.description || ""),
        story: pick(p.story, ""),
        foodPairings: arr(p.foodPairings).length ? p.foodPairings : arr(p.pairings),
        capsuleColor: pick(p.capsuleColor, cap.capsuleColor),
        capsuleShine: pick(p.capsuleShine, cap.capsuleShine),
        glassColor: pick(p.glassColor, cap.glassColor),
        labelSub: pick(p.labelSub, p.region || ""),
        stock: p.stock || { sanDiego: 6, modesto: 6, total: 12 },
      };
    });
  }
  function mapCatalogToCimulate(catalog) {
    return arr(catalog).map(function (p, i) {
      const cap = capsuleFor(i);
      return {
        id: pick(p.id, "sku" + i),
        cat: pick(p.cat, p.category || "General"),
        name: pick(p.name, "Product " + (i + 1)),
        type: pick(p.type, p.variety || ""),
        region: pick(p.region, ""),
        vintage: pick(p.vintage, ""),
        price: Number(pick(p.price, 0)),
        rating: pick(p.rating, p.score || 90),
        ratingSource: pick(p.ratingSource, p.scoreSource || "Editor's Pick"),
        badge: pick(p.badge, ""),
        notes: pick(p.notes, p.tastingNotes || p.description || ""),
        pairings: arr(p.pairings).length ? p.pairings : arr(p.foodPairings),
        flavors: arr(p.flavors),
        abv: pick(p.abv, ""),
        capsuleColor: pick(p.capsuleColor, cap.capsuleColor),
        capsuleShine: pick(p.capsuleShine, cap.capsuleShine),
        glassColor: pick(p.glassColor, cap.glassColor),
      };
    });
  }

  // ── serialize to a standalone app-config.js (for export, R5) ──
  function toConfigJs(obj, header) {
    const json = JSON.stringify(obj, null, 2);
    return "/* " + (header || "Generated app-config.js") + " — generated by Holodeck. */\n" +
      "window.APP_CONFIG = " + json + ";\n";
  }

  global.HOLO_APPGEN = {
    buildClientelingConfig: buildClientelingConfig,
    buildCimulateConfig: buildCimulateConfig,
    mapCatalogToClienteling: mapCatalogToClienteling,
    mapCatalogToCimulate: mapCatalogToCimulate,
    toConfigJs: toConfigJs,
    DEFAULT_CLIENT_COLORS: DEFAULT_CLIENT_COLORS,
    DEFAULT_CIM_COLORS: DEFAULT_CIM_COLORS,
  };
})(window);
