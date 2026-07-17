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

  // ── color helpers ────────────────────────────────────────────
  // Project setup captures three flat colors (primary/secondary/accent). The
  // app themes need a fuller palette (a darker + lighter primary, plus a deep
  // shade for cimulate). We derive the missing shades by shifting lightness so
  // the whole app recolors from just the three picked colors.
  function clamp8(n) { return n < 0 ? 0 : n > 255 ? 255 : Math.round(n); }
  function parseHex(hex) {
    const m = String(hex || "").trim().replace(/^#/, "");
    if (!/^[0-9a-fA-F]{6}$/.test(m)) return null;
    return { r: parseInt(m.slice(0, 2), 16), g: parseInt(m.slice(2, 4), 16), b: parseInt(m.slice(4, 6), 16) };
  }
  function toHex(c) {
    const h = function (n) { return clamp8(n).toString(16).padStart(2, "0"); };
    return "#" + h(c.r) + h(c.g) + h(c.b);
  }
  // amt > 0 lightens toward white, amt < 0 darkens toward black. |amt| in 0..1.
  function shade(hex, amt) {
    const c = parseHex(hex);
    if (!c) return hex;
    if (amt >= 0) return toHex({ r: c.r + (255 - c.r) * amt, g: c.g + (255 - c.g) * amt, b: c.b + (255 - c.b) * amt });
    const k = 1 + amt; // amt is negative
    return toHex({ r: c.r * k, g: c.g * k, b: c.b * k });
  }
  // Build a clienteling palette from a flat {primary, secondary, accent} set.
  // secondary is unused by the clienteling theme today (kept for parity).
  function clientPaletteFrom(flat) {
    const p = parseHex(flat.primary) ? flat.primary : null;
    const a = parseHex(flat.accent) ? flat.accent : null;
    if (!p && !a) return null;
    const prim = p || DEFAULT_CLIENT_COLORS.primary;
    const acc = a || DEFAULT_CLIENT_COLORS.accent;
    return {
      primary: prim, primaryDk: shade(prim, -0.28), primaryLt: shade(prim, 0.28),
      accent: acc, accentDk: shade(acc, -0.28), accentLt: shade(acc, 0.32),
    };
  }
  // Build a cimulate palette. promo/promoDk stay on the default red (a
  // sale/promo accent, intentionally not the brand hue).
  function cimPaletteFrom(flat) {
    const p = parseHex(flat.primary) ? flat.primary : null;
    const a = parseHex(flat.accent) ? flat.accent : null;
    if (!p && !a) return null;
    const prim = p || DEFAULT_CIM_COLORS.primary;
    const acc = a || DEFAULT_CIM_COLORS.accent;
    return {
      primary: prim, primaryDk: shade(prim, -0.22), primaryDeep: shade(prim, -0.55),
      primaryLt: shade(prim, 0.32),
      accent: acc, promo: DEFAULT_CIM_COLORS.promo, promoDk: DEFAULT_CIM_COLORS.promoDk,
    };
  }

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

  // Industry-neutral cimulate fallbacks (used when Gemini omits the field).
  const DEFAULT_PROMO_TILES = [
    { tone: "teal", title: "Deals!<br/>Just For You", sub: "VIEW ALL DEALS ›" },
    { tone: "red",  title: "Limited-Time<br/>Specials", sub: "SHOP SPECIALS ›" },
    { tone: "gold", title: "Buy 2<br/>& Save", sub: "SHOP MULTI-BUY ›" },
  ];
  const DEFAULT_SERVICE_CHIPS = [
    { label: "📦 Track My Order",       q: "track my order" },
    { label: "🚚 Delivery & Address",   q: "delivery status" },
    { label: "🏬 Store Hours & Pickup", q: "my store hours and pickup" },
    { label: "⭐ Rewards & Points",     q: "my loyalty rewards and points" },
    { label: "↩️ Return or Refund",     q: "i want to return an item" },
  ];
  const DEFAULT_SERVICE_DATA = {
    order: "#ORD-48120", orderPlaced: "2 items", eta: "By 6:00 PM today",
    hoursToday: "9:00 AM – 9:00 PM", pickupEta: "~15 min", associate: "Marie L.",
    points: "4,820 pts", reward: "$25 off your next order", refundAmt: "$114.98",
  };

  // ── CLIENTELING ──────────────────────────────────────────────
  // found: output of HOLO_APPFOUND.extractClienteling(state) (see that file).
  // brand: { name, sub, colors } (from branding, optional).
  // catalog: shared retail catalog [{id,name,variety,region,price,...}].
  function buildClientelingConfig(found, brand, catalog) {
    found = found || {};
    brand = brand || {};
    // Resolve the theme palette from the project's brand colors. Accept either
    // a full palette (brand.colors) or the flat setup trio (brand.flatColors),
    // deriving dark/light shades from the latter. This keeps swatchFor + the
    // config's brand.colors on the SAME per-customer palette (no teal leak).
    const clientPalette = clientPaletteFrom(brand.flatColors || {});
    if (clientPalette) brand = Object.assign({}, brand, { colors: Object.assign({}, clientPalette, brand.colors || {}) });
    const cat = mapCatalogToClienteling(arr(catalog).length ? catalog : found.catalog, brand);
    const cust = found.customer || {};
    const mgr = found.homeStoreManager || {};
    const custName = found.customerName || brand.name || "the customer";
    const unitNoun = pick(found.unitNoun, "items");

    const featuredId = (cat[0] && cat[0].id) || "";
    if (cat[0]) { cat[0].featured = true; cat[0].badge = cat[0].badge || "FEATURED"; }

    const ev = found.event || {};
    const evName = pick(ev.name, "Featured Event");
    const st = found.store || {};
    // KPIs: accept the new array shape [{label,value}] from Gemini; fall back
    // to a neutral generic set (NO wine labels). Legacy object shape tolerated.
    let kpis = arr(st.kpis);
    if (!kpis.length && st.kpis && typeof st.kpis === "object") {
      kpis = Object.keys(st.kpis).map(function (k) { return { label: k, value: st.kpis[k] }; });
    }
    if (!kpis.length) {
      kpis = [
        { label: "Guests today", value: 184 },
        { label: "Sign-ups", value: 14 },
        { label: "VIP arrivals", value: 3 },
        { label: "Holds pending", value: 7 },
        { label: "Pipeline", value: 12400 },
      ];
    }

    const nav = found.navLabels || {};
    const intro = found.introScene || {};
    // `copy` — customer-variable strings read by the template via tpl().
    // Gemini may return `found.copy`; otherwise the app's own inline fallbacks
    // (all {token}-interpolated, already industry-neutral) fill the gaps. We
    // only forward whatever Gemini supplied so per-customer phrasing reaches
    // the app; missing keys degrade to the template's neutral fallback.
    const gcopy = found.copy || {};

    // Reconcile walkIns ↔ coach so every walk-in CTA resolves to a coaching
    // brief. The template's selectCoach(walkIn.id) reads APP_CONFIG.coach[id];
    // Gemini doesn't guarantee its coach keys equal the walkIn ids (or that a
    // coach entry exists at all), which makes the CTA a silent no-op. Key the
    // coach map by walkIn.id, matching Gemini's entry by exact/fuzzy key and
    // synthesizing a brief from the walk-in when none is provided.
    const walkIns = arr(found.walkIns).map(function (w, i) {
      w = w || {};
      if (!w.id) w.id = "guest" + (i + 1);
      return w;
    });
    const rawCoach = found.coach || {};
    const normKey = function (s) { return String(s || "").toLowerCase().replace(/[^a-z0-9]/g, ""); };
    const coach = {};
    walkIns.forEach(function (w) {
      let entry = rawCoach[w.id];
      if (!entry) {
        const want = normKey(w.id);
        for (const k in rawCoach) {
          if (!Object.prototype.hasOwnProperty.call(rawCoach, k)) continue;
          const nk = normKey(k);
          if (nk && (nk === want || nk.indexOf(want) >= 0 || want.indexOf(nk) >= 0)) { entry = rawCoach[k]; break; }
        }
      }
      if (!entry) {
        const first = (w.name || "").split(" ")[0] || "the guest";
        entry = {
          badge: w.tag || "",
          title: w.headline || (w.name ? w.name + " — Personalized brief" : "Guest brief"),
          starters: [
            w.detail || ("Recognize " + first + " and reference their history with us."),
            "Ask what brought " + first + " in today and tailor recommendations.",
          ],
          nba: w.cta ? ("Next best action: " + w.cta + ".") : "Offer to hold a recommended item or book a follow-up.",
        };
      }
      coach[w.id] = entry;
    });

    return {
      brand: {
        name: pick(brand.name, custName).toUpperCase(),
        sub: pick(brand.sub, ""),
        hubLabel: pick(found.hubLabel, "Clienteling Hub"),
        conciergeName: pick(found.conciergeName, custName + " Concierge"),
        assistantName: "Agentforce",
        colors: Object.assign({}, DEFAULT_CLIENT_COLORS, brand.colors || {}),
      },
      unitNoun: unitNoun,
      introScene: {
        headline: pick(intro.headline, (pick(cust.name, "Your guest")) + " opens the " + custName + " app"),
        detail: pick(intro.detail, "A personalized in-store experience, ready when they arrive."),
        ctaLabel: pick(intro.ctaLabel, "Enter the store"),
      },
      navLabels: {
        dashboard: pick(nav.dashboard, "Floor Dashboard"),
        checkin: pick(nav.checkin, "Check-In"),
        customer360: pick(nav.customer360, "Customer 360"),
        event: pick(nav.event, "Event"),
        inventory: pick(nav.inventory, "Inventory"),
      },
      search: { placeholder: pick(found.searchPlaceholder, "Search guests, " + unitNoun + ", orders…") },
      // Forward Gemini-supplied copy verbatim; the app fills any omitted key
      // from its own {token}-interpolated neutral fallbacks.
      copy: gcopy,
      catalog: cat,
      featuredId: featuredId,
      customer: {
        id: "primary",
        name: pick(cust.name, "Your guest"),
        initials: initialsOf(pick(cust.name, "Your guest")),
        location: pick(cust.location, "Your City"),
        visitingStore: pick(cust.visitingStore, "Flagship store"),
        rank: pick(cust.rank, "Member"),
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
      event: {
        id: "event",
        name: evName,
        type: pick(ev.type, "Event"),
        displayLabel: pick(ev.displayLabel, evName + " · Tonight 7PM"),
        store: pick(ev.store, cust.visitingStore || "Flagship"),
        date: pick(ev.date, "Tonight · 7:00 PM"),
        host: pick(ev.host, "Store Manager"),
        seatsTotal: pick(ev.seatsTotal, 16),
        featuredWineId: featuredId,
        blurb: pick(ev.blurb, "An intimate guided experience for members."),
        attendees: arr(ev.attendees).length ? ev.attendees : arr(found.attendees),
      },
      store: {
        name: pick(st.name, cust.visitingStore || "Flagship"),
        statusLabel: pick(st.statusLabel, pick(cust.location, "Your City") + " store · online"),
        managerTitle: pick(st.managerTitle, "Store Manager"),
        kpis: kpis,
      },
      walkIns: walkIns,
      tasks: arr(found.tasks),
      coach: coach,
      productImages: found.productImages || {},
    };
  }

  // Normalize concierge intents to the shape the cimulate app reads
  // (keys / text / recIds / rail / chips). Tolerates the prompt's alternate
  // field names (keywords / reply / productIds) so either shape works.
  function normSommIntents(list) {
    return arr(list).map(function (it) {
      it = it || {};
      const out = {
        keys: arr(it.keys).length ? it.keys : arr(it.keywords),
        text: pick(it.text, pick(it.reply, "")),
        recIds: arr(it.recIds).length ? it.recIds : arr(it.productIds),
      };
      if (it.rail && (Array.isArray(it.rail.ids) || it.rail.title)) out.rail = it.rail;
      if (arr(it.chips).length) out.chips = it.chips;
      return out;
    });
  }

  // ── CIMULATE ─────────────────────────────────────────────────
  function buildCimulateConfig(found, brand, catalog) {
    found = found || {};
    brand = brand || {};
    // Resolve the cimulate theme palette (see buildClientelingConfig).
    const cimPalette = cimPaletteFrom(brand.flatColors || {});
    if (cimPalette) brand = Object.assign({}, brand, { colors: Object.assign({}, cimPalette, brand.colors || {}) });
    const products = mapCatalogToCimulate(arr(catalog).length ? catalog : found.catalog, brand);
    const custName = found.customerName || brand.name || "Your Brand";
    // The prompt returns a nested `brand` object; tolerate a flat legacy shape.
    const fb = found.brand || {};
    const sh = found.sectionHeadings || {};
    // `copy` is where the template reads every customer-variable string via
    // tpl(). Gemini may return it as `found.copy` (preferred) or as scattered
    // flat fields (legacy); tolerate both, and fall back to INDUSTRY-NEUTRAL
    // strings ({token}s interpolate at runtime — NEVER hardcode wine here).
    const gc = found.copy || {};
    const conciergeName = pick(fb.conciergeName, pick(found.conciergeName, custName + " Concierge"));
    const unitNoun = pick(found.unitNoun, "item");
    const cp = function (key, dflt) { return pick(gc[key], dflt); };

    // Reconcile concierge chips ↔ intents so every clickable chip does
    // something on-point. A chip's `q` is matched against each intent's
    // `keys[]` at runtime; Gemini generates chips and intents separately, so a
    // chip (e.g. "Book a Fitting session") can point at an intent that doesn't
    // exist and dead-end into the generic fallback. Guarantee coverage: for any
    // chip `q` not covered by an existing intent's keys, add a catch-all intent
    // keyed to that chip's meaningful words so it always routes to a reply.
    const somm = normSommIntents(found.sommIntents);
    const greet = arr(found.greetChips);
    const CHIP_STOP = { a:1, an:1, the:1, my:1, me:1, for:1, to:1, of:1, and:1, or:1, is:1, it:1, in:1, on:1, at:1, with:1, your:1, you:1, i:1, do:1, does:1, can:1, help:1, please:1, get:1, show:1, find:1, some:1, something:1, want:1, need:1, like:1, how:1 };
    const chipWords = function (q) {
      return String(q || "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(function (w) { return w && !CHIP_STOP[w]; });
    };
    const coveredBy = function (q) {
      const t = " " + String(q || "").toLowerCase().replace(/[^a-z0-9$ ]/g, " ").replace(/\s+/g, " ").trim() + " ";
      const words = chipWords(q);
      for (const it of somm) {
        for (const k of (it.keys || [])) {
          const kk = String(k || "").toLowerCase();
          if (kk && t.indexOf(" " + kk + " ") >= 0) return true;
        }
        // token-overlap: chip shares a meaningful word with this intent's keys
        const hay = (it.keys || []).join(" ").toLowerCase();
        for (const w of words) { if (hay.indexOf(w) >= 0) return true; }
      }
      return false;
    };
    const allChipQs = [];
    greet.forEach(function (c) { if (c && c.q) allChipQs.push(c.q); });
    somm.forEach(function (it) { arr(it.chips).forEach(function (c) { if (c && c.q) allChipQs.push(c.q); }); });
    allChipQs.forEach(function (q) {
      if (coveredBy(q)) return;
      const words = chipWords(q);
      if (!words.length) return;
      somm.push({
        keys: words.concat([String(q).toLowerCase().trim()]),
        text: "I can help with that. Tell me a bit more and I'll take care of it, or ask me to recommend something for you.",
        recIds: products.slice(0, 2).map(function (p) { return p.id; }).filter(Boolean),
      });
    });

    return {
      brand: {
        logoTop: pick(brand.name, pick(fb.logoTop, custName)),
        logoSub: pick(brand.sub, pick(fb.logoSub, "")),
        conciergeName: conciergeName,
        conciergeSub: pick(fb.conciergeSub, pick(found.conciergeSub, "Your personal " + custName + " concierge")),
        conciergeIntro: pick(fb.conciergeIntro, pick(found.conciergeIntro, "Your personal concierge")),
        rewardsLabel: pick(fb.rewardsLabel, "Rewards"),
        searchProduct: "Cimulate",
        colors: Object.assign({}, DEFAULT_CIM_COLORS, brand.colors || {}),
      },
      unitNoun: unitNoun,
      storeLocation: pick(found.storeLocation, (found.customer && found.customer.location) || "Your City"),
      // Legacy top-level mirrors (kept so older readers/exports don't break).
      heroHeadline: pick(found.heroHeadline, cp("heroHeadline", "Find your next favorite " + unitNoun)),
      // Normalize search chips: Gemini returns plain query strings, but the
      // template expects { q, icon, tag } objects. Use a neutral magnifying-
      // glass icon (never a wine-bottle/beer icon) so generated chips render.
      searchChips: (function () {
        const fromGemini = arr(found.searchChips).map(function (c) {
          if (c && typeof c === "object") {
            return { q: pick(c.q, c.query || c.label || ""), icon: pick(c.icon, "fa-magnifying-glass"), tag: pick(c.tag, "") };
          }
          return { q: String(c || ""), icon: "fa-magnifying-glass", tag: "" };
        }).filter(function (c) { return c.q; });
        // Fall back to catalog-derived chips so no tier ever renders empty.
        return fromGemini.length ? fromGemini : deriveSearchChips(products);
      })(),
      // Prefer Gemini's nav labels; else derive from the live catalog so the
      // dropdown never falls back to the template's hardcoded wine categories.
      navCategories: arr(found.navCategories).length ? arr(found.navCategories) : deriveNavCategories(products),
      promoTiles: arr(found.promoTiles).length ? found.promoTiles : DEFAULT_PROMO_TILES,
      footerBlurb: pick(found.footerBlurb, custName + " — personalized shopping, powered by your unified profile."),
      sectionHeadings: {
        featured: pick(sh.featured, "Featured"),
        curated: pick(sh.curated, "Curated for you"),
      },
      // ── COPY BLOCK — read by tpl(); {token}s interpolate at runtime. ──
      copy: {
        utilityFulfill: cp("utilityFulfill", "Fast pickup & delivery available in"),
        utilityLinks: arr(gc.utilityLinks).length ? gc.utilityLinks : ["Track Order", "Store Locator", "Events", "Help"],
        searchPlaceholder: cp("searchPlaceholder", "Search by taste, occasion, or intent…"),
        searchHintLabel: cp("searchHintLabel", "{searchProduct} understands intent — try one"),
        profileGreeting: cp("profileGreeting", "Welcome back, {firstName} — your experience is personalized from your unified profile."),
        profileTierTag: cp("profileTierTag", "PREMIUM MEMBER"),
        heroEyebrow: cp("heroEyebrow", "Personalized for you"),
        heroHeadline: cp("heroHeadline", "Find your next favorite " + unitNoun),
        heroSub: cp("heroSub", "Search by taste, occasion or intent — {searchProduct} reads what you mean and ranks against your unified profile."),
        heroShopCta: cp("heroShopCta", "Shop recommended"),
        heroAskCta: cp("heroAskCta", "Ask the concierge"),
        curatedTitle: cp("curatedTitle", pick(sh.curated, "Curated for you")),
        curatedSub: cp("curatedSub", "{concierge} selected these based on your conversation and your {tier} profile."),
        featuredHeading: cp("featuredHeading", "Recommended for you, {firstName}"),
        featuredSub: cp("featuredSub", "Handpicked for you — ranked by your unified profile."),
        footerBlurb: cp("footerBlurb", pick(found.footerBlurb, custName + " — personalized shopping, powered by your unified profile.")),
        footerDisclaimer1: cp("footerDisclaimer1", "© 2026 Demo experience. Not a live storefront."),
        footerDisclaimer2: cp("footerDisclaimer2", ""),
        cartWhy: cp("cartWhy", "Data 360: every item you add updates {firstName}'s unified profile — informing future recommendations, journeys & in-store clienteling."),
        cartEmpty: cp("cartEmpty", "Your cart is empty.<br/>Ask {concierge} for a recommendation!"),
        dataToastTitle: cp("dataToastTitle", "Data 360 profile updated"),
        dataToastSub: cp("dataToastSub", "New purchase-intent signal captured for {firstName} — feeds future recommendations."),
        sommIntro: cp("sommIntro", "Hi {firstName}! 👋 I'm {concierge}, your personal concierge. I already know a bit about your taste from your {tier} profile.<br/>What can I help you find today?"),
        sommGreetShort: cp("sommGreetShort", "Hi {firstName}! 👋 I'm {concierge}, your concierge. I can help you discover a {unit} or handle service needs. What can I do for you?"),
        sommFallback: cp("sommFallback", "Great question! Tell me what you're after and I'll take care of it."),
      },
      // ── HOMEPAGE SECTIONS — headings drive each rail; circles/ids optional. ──
      sections: found.sections || {
        trending:  { heading: pick(sh.trending, "New & Trending") },
        specials:  { heading: pick(sh.specials, "Limited Time Specials") },
        matchDay:  { heading: pick(sh.matchDay, "Essentials"), circles: [] },
        topCat:    { heading: pick(sh.topCat, "Top Categories For You"), circles: [] },
        cocktail:  { heading: pick(sh.cocktail, "Explore More"), band: pick(sh.cocktail, "Explore More"), circles: [] },
        savings:   { heading: pick(sh.savings, "Special Savings") },
      },
      products: products,
      profile: Object.assign(
        {
          name: pick(found.customer && found.customer.name, "Member"),
          tier: pick(found.customer && found.customer.rank, "Premium"),
          interests: arr(found.customer && found.customer.interests),
          // Affinity SKUs lift matching items in search ranking. Prefer any
          // Gemini-supplied ids; else seed from the top catalog items so the
          // "personalized for you" signal shows for any customer (never wine).
          affinityIds: arr(found.affinityIds).length
            ? found.affinityIds
            : products.slice(0, 3).map(function (p) { return p.id; }).filter(Boolean),
        },
        found.profile || {}
      ),
      // Conversational concierge. Gemini supplies industry-appropriate chips +
      // intents; neutral service chips/data below keep the service flows working.
      greetChips: greet,
      serviceChips: arr(found.serviceChips).length ? found.serviceChips : DEFAULT_SERVICE_CHIPS,
      sommIntents: somm,
      serviceData: Object.assign({}, DEFAULT_SERVICE_DATA, found.serviceData || {}),
      celebs: found.celebs || {},
      productImages: found.productImages || {},
    };
  }

  // ── catalog mappers ──────────────────────────────────────────
  // The shared retail catalog is a neutral SKU list. Each app needs a few
  // app-specific fields; these mappers add safe defaults so a raw catalog
  // (even a Gemini/seed one) renders in either template.
  // The cosmetic swatch for the neutral procedural product SVG. Prefer the
  // customer's brand accent so product cards are ON-BRAND, not wine-bottle
  // colored; fall back to the deterministic palette only when there's no brand.
  function swatchFor(i, brand) {
    const c = (brand && brand.colors) || {};
    if (c.primary || c.accent) {
      return {
        capsuleColor: c.primary || c.accent || capsuleFor(i).capsuleColor,
        capsuleShine: c.primaryLt || c.accentLt || c.accent || capsuleFor(i).capsuleShine,
        glassColor: c.accent || c.primaryDk || capsuleFor(i).glassColor,
      };
    }
    return capsuleFor(i);
  }
  function mapCatalogToClienteling(catalog, brand) {
    return arr(catalog).map(function (p, i) {
      const cap = swatchFor(i, brand);
      return {
        id: pick(p.id, "sku" + i),
        name: pick(p.name, "Product " + (i + 1)),
        // Generic attribute/origin/description — pass through Gemini values,
        // else empty. NO wine defaults (no "vintage"/"appellation" invention).
        variety: pick(p.variety, p.type || p.cat || p.category || ""),
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
  // Build search-suggestion chips from the live catalog so EVERY tier (generic
  // preview, non-Gemini fallback, or a Gemini response that omitted chips) has
  // working, category-appropriate chips — never empty, never wine-locked.
  // `products` is the mapped cimulate catalog ([{cat, name, price, ...}]).
  // Build INTENT-STYLE search chips (natural-language shopper goals, not bare
  // category/SKU names) for the deterministic (non-Gemini) tiers. Each chip is
  // grounded in a real product so clicking it returns results. Gemini's own
  // story-grounded chips are preferred upstream; this is the fallback.
  function deriveSearchChips(products) {
    const chips = [];
    const seenProd = {};
    // One goal-oriented chip per distinct category, anchored on a real product
    // name from that category so the query always matches something.
    const catSeen = {};
    arr(products).forEach(function (p) {
      const c = (p.cat || "").trim();
      const n = (p.name || "").trim();
      if (!c || catSeen[c.toLowerCase()] || !n || chips.length >= 4) return;
      catSeen[c.toLowerCase()] = true;
      seenProd[n.toLowerCase()] = true;
      // e.g. "best driver in Clubs", "top-rated Nike Vapor" — reads as intent,
      // still contains real tokens (category + product) so search returns hits.
      chips.push({ q: "best " + n.toLowerCase() + " for me", icon: "fa-magnifying-glass", tag: "" });
    });
    // Fill toward ~4 chips with a "under $X" style intent on remaining products.
    for (let i = 0; i < products.length && chips.length < 4; i++) {
      const n = (products[i].name || "").trim();
      const price = Number(products[i].price) || 0;
      if (!n || seenProd[n.toLowerCase()]) continue;
      seenProd[n.toLowerCase()] = true;
      chips.push({ q: price ? (n.toLowerCase() + " under $" + Math.ceil(price / 10) * 10) : ("show me " + n.toLowerCase()), icon: "fa-magnifying-glass", tag: "" });
    }
    // Absolute floor if the catalog is empty (generic first preview with no SKUs).
    if (!chips.length) {
      ["show me your best sellers", "what's new this week", "top-rated picks for me", "great gifts under $50"].forEach(function (q) {
        chips.push({ q: q, icon: "fa-magnifying-glass", tag: "" });
      });
    }
    return chips;
  }
  // Distinct product categories from the mapped catalog, in first-seen order.
  // Drives the storefront category nav so it reflects THIS customer's catalog
  // (clubs/apparel/… for a golf retailer) instead of the template's wine nav.
  function deriveNavCategories(products) {
    const seen = {}, out = [];
    arr(products).forEach(function (p) {
      const c = (p.cat || "").trim();
      if (c && !seen[c.toLowerCase()]) { seen[c.toLowerCase()] = true; out.push(c); }
    });
    // Generic-retail floor so the storefront nav can NEVER fall back to the
    // template's hardcoded wine categories, even with an empty catalog.
    if (!out.length) return ["Featured", "Best Sellers", "New Arrivals", "Accessories"];
    return out;
  }
  function mapCatalogToCimulate(catalog, brand) {
    return arr(catalog).map(function (p, i) {
      const cap = swatchFor(i, brand);
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
