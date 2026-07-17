/* ============================================================
   app-config.js — Clienteling template data layer
   ALL demo data lives here in window.APP_CONFIG. The builder
   regenerates this file per-customer; its shape is the contract.
   Default config = the Total Wine reference data (verbatim).
   Also holds shared helpers: money, esc-safe image resolver,
   procedural bottle SVG fallback, productById, applyBrandColors.
   ============================================================ */

window.APP_CONFIG = {
  brand: {
    name: "TOTAL WINE",
    sub: "& MORE",
    hubLabel: "Clienteling Hub",
    conciergeName: "Vino Concierge",
    assistantName: "Agentforce",
    // brand tokens (defaults = current teal/gold theme). These map to CSS :root vars.
    colors: { primary: "#01665c", primaryDk: "#014a43", primaryLt: "#0a877a", accent: "#b8975a", accentDk: "#96773f", accentLt: "#d8bd85" },
  },

  /* ============================================================
     APP CHROME — rendered verbatim by the template. The builder
     regenerates these per-customer in the customer's own industry
     vocabulary. Defaults below = the Total Wine reference voice.
     ============================================================ */
  unitNoun: "bottles",
  introScene: {
    headline: "Alan opens the Total Wine app",
    detail: "He's signing up for tonight's Wine & Cheese Pairing Class — a personalized in-store experience, ready when he arrives.",
    ctaLabel: "Enter the store",
  },
  navLabels: { dashboard: "Floor Dashboard", checkin: "Check-In", customer360: "Customer 360", event: "Event", inventory: "Inventory" },
  search: { placeholder: "Search guests, wines, orders…" },

  /* ============================================================
     COPY — every customer-variable narrative string the template
     renders. app.js reads these; generic UI verbs (Done, Send,
     Skip, Call Now) stay inline. The builder regenerates this block
     per-customer so no wine/story literal is baked into app.js.
     Tokens: {customer}, {firstName}, {manager}, {managerStore},
     {event}, {feature}, {store}, {unit}. app.js interpolates them.
     ============================================================ */
  copy: {
    checkinGreeting: "Greet {firstName} by name.",
    checkinSub: "{rank} member since {memberSince} · traveling from {managerStore}.",
    managerNoteLabel: "MESSAGE FROM {manager} · THEIR HOME STORE",
    sayThis: "\"Welcome, {firstName} — great to have a {rank} member with us tonight. {manager} back at {managerStore} says hi, and will follow up on your order.\"",
    genericCheckedIn: "You're checked in for tonight's {event}. Enjoy.",
    coachTipTitle: "{concierge} tip",
    coachTip: "{customer} is your {rank} guest tonight. When they ask about the feature, offer to hold {unit} at their home store ({managerStore}) — they're traveling.",
    featurePourLabel: "Tonight's Featured Item",
    inventorySub: "Real-time stock across {store} & {customer}'s home store ({managerStore}).",
    holdOptionHome: "Hold at home store ({managerStore})",
    holdOptionHomeSub: "Reserve for in-person pickup — recommended, {customer} is traveling.",
    holdOptionShip: "Ship to home",
    holdOptionShipSub: "Deliver to their home address.",
    holdOptionBuy: "Buy in-store today",
    holdOptionBuySub: "Take {unit} from {store} now.",
    draftMessageBody: "Hi {firstName} — great meeting you at tonight's {event}. Per {manager} at {managerStore}, I've held your {unit} at your home store for pickup. Enjoy!",
    chatGreeting: "Hi — I'm your {concierge} for {customer}'s visit tonight. Ask me to brief you on {customer}, relay {manager}'s message, recommend {unit}, check inventory, or walk fulfillment options.",
    chatInputPlaceholder: "Ask about {customer}, {unit}, inventory…",
    // Quick-prompt chips for the concierge chat (industry-neutral; the builder
    // regenerates these from coach.starters / the customer's vocabulary).
    quickPrompts: [
      "Brief me on {customer}",
      "What did {manager} say?",
      "Best pick for {customer}?",
      "Tell me about the featured item",
      "Check inventory",
      "Fulfillment options",
      "Draft a message to {customer}",
    ],
    // Inventory filter chips (categories). Regenerated per-customer.
    inventoryChips: ["All", "Featured", "New arrivals", "Popular"],
  },

  /* ============================================================
     PRODUCT CATALOG — wines & spirits
     Per-store stock uses the two stores in Alan's story:
     sanDiego = the store he's visiting; modesto = his home store.
     ============================================================ */
  catalog: [
    {
      id: "carmesBordeaux",
      name: "Château Les Carmes Haut-Brion",
      variety: "Bordeaux Blend",
      region: "Pessac-Léognan, Bordeaux",
      appellation: "Pessac-Léognan · Left Bank",
      vintage: "2019",
      price: 189,
      score: 96,
      scoreSource: "Wine Spectator",
      badge: "TONIGHT'S FEATURE",
      featured: true,
      tastingNotes:
        "Violet, graphite, and dark plum with a whisper of cedar. Silky, structured tannins and a long, savory finish — a benchmark Left Bank Bordeaux.",
      story:
        "From a walled vineyard in the heart of Pessac-Léognan, Château Les Carmes Haut-Brion blends Cabernet Franc, Merlot, and Cabernet Sauvignon into a wine of rare finesse. The 2019 is a standout vintage — perfumed, layered, and built to age for two decades. It's the wine Marie has been waiting on for Alan.",
      foodPairings: ["Aged gouda", "Roast lamb", "Mushroom risotto", "Dark chocolate"],
      capsuleColor: "#4a1018", capsuleShine: "#8b2535", glassColor: "#2a0a10", labelSub: "Pessac-Léognan",
      stock: { sanDiego: 3, modesto: 6, total: 9 },
    },
    {
      id: "caymus",
      name: "Caymus Cabernet Sauvignon",
      variety: "Cabernet Sauvignon",
      region: "Napa Valley, California",
      appellation: "Napa Valley",
      vintage: "2021",
      price: 89,
      score: 94,
      scoreSource: "Wine Enthusiast",
      badge: "GRAND RESERVE PICK",
      tastingNotes:
        "Ripe blackberry, cassis, and vanilla oak with a plush, full-bodied palate. A crowd-pleasing Napa Cab with velvety tannins.",
      story:
        "Caymus is Napa royalty — the Wagner family's flagship Cabernet, rich and opulent vintage after vintage. A reliable favorite for Grand Reserve members who love a bold, generous red.",
      foodPairings: ["Ribeye steak", "Braised short rib", "Aged cheddar"],
      capsuleColor: "#3a0d12", capsuleShine: "#6b1f2a", glassColor: "#2a0a10", labelSub: "Napa Valley",
      stock: { sanDiego: 12, modesto: 9, total: 21 },
    },
    {
      id: "meiomi",
      name: "Meiomi Pinot Noir",
      variety: "Pinot Noir",
      region: "California",
      appellation: "Sonoma · Monterey · Santa Barbara",
      vintage: "2022",
      price: 24,
      score: 90,
      scoreSource: "Wine Spectator",
      badge: "POPULAR",
      tastingNotes:
        "Bright cherry, mocha, and toasted oak with a smooth, silky finish. An approachable, food-friendly Pinot.",
      story:
        "Sourced from three cool-climate coastal counties, Meiomi is a benchmark California Pinot — soft, fruit-forward, and endlessly versatile at the table.",
      foodPairings: ["Grilled salmon", "Roast chicken", "Charcuterie"],
      capsuleColor: "#4a1018", capsuleShine: "#8b2535", glassColor: "#3a0d12", labelSub: "California",
      stock: { sanDiego: 22, modesto: 18, total: 40 },
    },
    {
      id: "cakebread",
      name: "Cakebread Cellars Chardonnay",
      variety: "Chardonnay",
      region: "Napa Valley, California",
      appellation: "Napa Valley",
      vintage: "2022",
      price: 52,
      score: 92,
      scoreSource: "Wine Enthusiast",
      badge: "AGED WHITE",
      tastingNotes:
        "Green apple, lemon curd, and a creamy, subtly oaked texture. Crisp acidity with a lingering, mineral finish.",
      story:
        "A California classic — Cakebread's Chardonnay balances rich fruit with bright acidity, exactly the kind of aged-style white Alan gravitates toward.",
      foodPairings: ["Lobster", "Roast chicken", "Brie", "Creamy pasta"],
      capsuleColor: "#0a5d54", capsuleShine: "#12857a", glassColor: "#3f5f2a", labelSub: "Napa Valley",
      stock: { sanDiego: 8, modesto: 5, total: 13 },
    },
    {
      id: "veuve",
      name: "Veuve Clicquot Brut Yellow Label",
      variety: "Champagne",
      region: "Reims, France",
      appellation: "Champagne AOC",
      vintage: "NV",
      price: 65,
      score: 93,
      scoreSource: "Wine Spectator",
      badge: "CELEBRATION",
      tastingNotes:
        "Toasted brioche, white peach, and citrus with a fine, persistent mousse. Crisp, dry, and celebratory.",
      story:
        "The iconic yellow label — a benchmark non-vintage Champagne with the depth and consistency that made the house famous. A go-to gift for a Grand Reserve member.",
      foodPairings: ["Oysters", "Fried chicken", "Aged comté", "Sushi"],
      capsuleColor: "#b8975a", capsuleShine: "#e4cf95", glassColor: "#2f5f2a", labelSub: "Champagne",
      stock: { sanDiego: 15, modesto: 11, total: 26 },
    },
    {
      id: "macallan18",
      name: "The Macallan 18 Sherry Oak",
      variety: "Single Malt Scotch",
      region: "Speyside, Scotland",
      appellation: "Highland · Speyside",
      vintage: "18 Yr",
      price: 399,
      score: 95,
      scoreSource: "Whisky Advocate",
      badge: "GRAND RESERVE PICK",
      tastingNotes:
        "Dried fruit, clove, and rich sherry sweetness with wood smoke and a long, warming finish. Matured in hand-picked sherry-seasoned oak.",
      story:
        "The Macallan 18 is a benchmark sherried single malt — deep, spiced, and luxurious. A natural cross-sell for a high-tier member who appreciates aged spirits.",
      foodPairings: ["Dark chocolate", "Aged cheese", "Dried figs"],
      capsuleColor: "#3a2a10", capsuleShine: "#6b4f1f", glassColor: "#5a2f0a", labelSub: "Speyside",
      stock: { sanDiego: 2, modesto: 4, total: 6 },
    },
  ],
  featuredId: "carmesBordeaux",

  /* ============================================================
     PRIMARY CUSTOMER — Alan R.
     ============================================================ */
  customer: {
    id: "alan",
    name: "Alan R.",
    initials: "AR",
    location: "Modesto, CA",             // home
    visitingStore: "San Diego, CA",       // where he is now (near hotel)
    rank: "Grand Reserve",
    memberSince: 2013,
    propensity: "Most Likely",
    propensityScore: 94,
    ltv: 61240,
    ytdSpend: 8420,
    bottles: 142,
    engagementScore: 93,
    channels: { email: "alan.r@example.com", phone: "+1 (209) •••-3382", preferred: "Mobile App" },

    birthday: "April 9",
    anniversary: "October 3 · Wedding",
    firstVisit: "Feb 2013",
    travelNote: "Traveling for business — 380 mi from his home store. Meet the relationship where he is.",

    interests: ["Left Bank Bordeaux", "Bold Napa Cabernet", "Aged single malt", "Cellar collector"],
    affinities: [
      { label: "Bordeaux & bold reds", value: 96 },
      { label: "Aged whites (Chardonnay)", value: 78 },
      { label: "Single malt Scotch", value: 71 },
      { label: "Champagne (gifting)", value: 64 },
      { label: "Wine education & classes", value: 88 },
    ],

    /* Home-store manager relationship — the heart of Chapter 2 */
    homeStoreManager: {
      name: "Marie L.",
      initials: "ML",
      store: "Modesto, CA",
      title: "Store Manager · Alan's home store",
    },

    history: [
      { product: "Château Margaux 2015", date: "Nov 2025", price: 899, status: "Purchased", qty: 2 },
      { product: "Caymus Cabernet Sauvignon 2020", date: "Aug 2025", price: 85, status: "Purchased", qty: 6 },
      { product: "The Macallan 18 Sherry Oak", date: "Apr 2025", price: 389, status: "Purchased · Birthday", qty: 1 },
      { product: "Veuve Clicquot Brut (case)", date: "Dec 2024", price: 780, status: "Gifted", qty: 12 },
    ],

    timeline: [
      { icon: "mobile", text: "Signed up for Wine & Cheese Pairing Class via Mobile App", when: "Just now" },
      { icon: "store", text: "Checked in at San Diego store for the class", when: "Moments ago" },
      { icon: "web", text: "Browsed Left Bank Bordeaux on TotalWine.com", when: "3 days ago" },
      { icon: "bag", text: "Purchased Château Margaux 2015 (×2) — $1,798", when: "Nov 2025" },
    ],
  },

  /* Marie's personal message — surfaced at check-in and on the profile */
  managerMessage: {
    from: { name: "Marie L.", initials: "ML", store: "Modesto, CA", title: "Store Manager · Alan's home store" },
    to: "James (San Diego store)",
    forwardTo: "Alan",
    text:
      "Tell Alan Marie says Hi and I'll let him know when the new Bordeaux bottles arrive from Château Les Carmes.",
    when: "Sent 12 min ago via Clienteling",
  },

  /* ============================================================
     THE EVENT — Wine & Cheese Pairing Class
     ============================================================ */
  event: {
    id: "wineCheeseClass",
    name: "Wine & Cheese Pairing Class",
    type: "Class",
    displayLabel: "Wine & Cheese Pairing Class · Tonight 7PM",
    store: "San Diego, CA",
    date: "Tonight · 7:00 PM",
    host: "James O. · Store Manager",
    seatsTotal: 16,
    featuredWineId: "carmesBordeaux",
    blurb:
      "An intimate guided tasting pairing five wines with artisan cheeses, led by our in-store sommelier. Tonight's feature: a benchmark 2019 Left Bank Bordeaux.",
    attendees: [
      { name: "Alan R.", initials: "AR", tier: "Grand Reserve", vip: true },
      { name: "Dana Cho", initials: "DC", tier: "Select", vip: false },
      { name: "Marcus Webb", initials: "MW", tier: "Select", vip: false },
      { name: "Elena Ruiz", initials: "ER", tier: "Reserve", vip: false },
      { name: "Tom Barrett", initials: "TB", tier: "Select", vip: false },
    ],
  },

  /* ============================================================
     STORE FLOOR DASHBOARD DATA (San Diego — the visiting store)
     ============================================================ */
  store: {
    name: "San Diego",
    statusLabel: "San Diego store · online",
    managerTitle: "Store Manager",
    // KPIs are an ARRAY of {label,value}. The first three render as the
    // traffic cards; all render in the KPI grid. `guest`/`signup` flags mark
    // the two counters the live-traffic ticker animates (optional).
    kpis: [
      { label: "Guests today", value: 184, guest: true },
      { label: "Class sign-ups today", value: 14, signup: true },
      { label: "VIP arrivals", value: 3 },
      { label: "Pipeline value", value: 12400, money: true },
      { label: "Holds pending", value: 7 },
    ],
  },

  /* Live floor alerts */
  walkIns: [
    {
      id: "alan",
      name: "Alan R.",
      initials: "AR",
      tag: "VIP · GRAND RESERVE",
      tier: "Grand Reserve",
      headline: "Alan R. signed up for tonight's class",
      detail:
        "Grand Reserve member from Modesto, traveling for business. His home-store manager Marie sent a personal message to pass along.",
      cta: "Open Profile",
    },
    {
      id: "dana",
      name: "Dana Cho",
      initials: "DC",
      tag: "SELECT · NEW",
      tier: "Select",
      headline: "Dana Cho registered online",
      detail: "First class sign-up. Browsing Napa Cabernet on TotalWine.com this week.",
      cta: "View Details",
    },
  ],

  /* Today's tasks (Einstein-prioritized) */
  tasks: [
    { text: "Greet Alan R. by name — thank him for Grand Reserve status", due: "At check-in", priority: "high" },
    { text: "Deliver Marie's personal message to Alan", due: "At check-in", priority: "high" },
    { text: "Prep tonight's Château Les Carmes feature pour", due: "Before 7 PM", priority: "med" },
    { text: "Confirm cheese board for 16 attendees", due: "Before 7 PM", priority: "low" },
  ],

  /* Sales-coach scripts keyed to each walk-in */
  coach: {
    alan: {
      badge: "VIP · GRAND RESERVE",
      title: "Alan R. — Lead with recognition + Marie's message",
      starters: [
        "Greet by name and thank him for being a Grand Reserve member since 2013.",
        "Deliver Marie's note: she says hi and will let him know when the Château Les Carmes bottles arrive.",
        "He loves Left Bank Bordeaux — tonight's feature is exactly on-brand for him.",
      ],
      nba: "During the class, offer to hold the featured Bordeaux at his home store in Modesto for pickup.",
    },
    dana: {
      badge: "SELECT · NEW GUEST",
      title: "Dana Cho — Welcome a first-time class guest",
      starters: [
        "Welcome her warmly — it's her first Total Wine class.",
        "She's been browsing Napa Cabernet online; mention tonight's Caymus pour.",
        "Invite her to join the loyalty program for member class pricing.",
      ],
      nba: "Capture her preferences tonight and enroll her in the loyalty program.",
    },
  },

  /* Optional per-product photo map {id: url}. Empty by default;
     procedural SVG (getBottleSVG) is the fallback. */
  productImages: {},

  // introFrameUrl: (optional) external intro-scene iframe URL. Absent by
  // default so the template skips the intro and goes straight to the store.
};

/* ============================================================
   BUILDER PREVIEW OVERRIDE (R3/R4)
   When previewed inside the Holodeck builder, the builder writes a
   generated per-customer config to sessionStorage under
   "holo-appconfig-<token>" and loads the iframe with "?holo=<token>".
   If present we swap it in so the template renders the customer's data.
   No effect standalone or in the exported ZIP.
   ============================================================ */
(function () {
  try {
    var m = /[?&]holo=([^&]+)/.exec(window.location.search);
    if (!m) return;
    var raw = window.sessionStorage.getItem("holo-appconfig-" + decodeURIComponent(m[1]));
    if (!raw) return;
    var override = JSON.parse(raw);
    if (override && typeof override === "object") window.APP_CONFIG = override;
  } catch (e) { /* fall back to the default config */ }
})();

/* ============================================================
   Shared helpers
   ============================================================ */
window.money = (n) => "$" + Number(n).toLocaleString();

window.productById = (id) => window.APP_CONFIG.catalog.find((p) => p.id === id);

/* ============================================================
   Procedural NEUTRAL product SVG. Renders any product without
   photography — a clean labeled "package" card driven by the
   product name + the customer's brand colors. NOT a wine bottle,
   and never prints a hardcoded brand name. Photos (productImages)
   are always preferred; this is the fallback.
   ============================================================ */
window.getProductSVG = function (p, w = 80, h = 220) {
  const svgEsc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const colors = (window.APP_CONFIG.brand && window.APP_CONFIG.brand.colors) || {};
  // Prefer per-product swatch (generator sets these to brand colors), then
  // brand palette, then a neutral slate — never a wine-bottle default.
  const primary = p.capsuleColor || colors.primary || "#334155";
  const shine = p.capsuleShine || colors.primaryLt || colors.accent || "#64748b";
  const accent = p.glassColor || colors.accent || "#94a3b8";
  const attr = p.variety || p.type || p.cat || p.category || "";
  const origin = p.labelSub || (p.region || "").split(",")[0] || "";
  const meta = p.vintage || "";
  const name = p.name || "";
  // Rough visual balance: use a portrait "package" card that scales to the
  // requested box. viewBox is fixed; width/height come from the call site.
  const uid = "p" + String(p.id || Math.round(w * h)).replace(/\W/g, "");
  const initials = name.trim().split(/\s+/).slice(0, 2).map((x) => x[0] || "").join("").toUpperCase() || "•";
  return `
  <svg viewBox="0 0 80 240" width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg" aria-label="${svgEsc(name)}">
    <defs>
      <linearGradient id="${uid}g" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="${shine}"/>
        <stop offset="1" stop-color="${primary}"/>
      </linearGradient>
    </defs>
    <!-- product package card -->
    <rect x="12" y="26" width="56" height="188" rx="10" fill="url(#${uid}g)"/>
    <rect x="12" y="26" width="56" height="188" rx="10" fill="none" stroke="#fff" stroke-opacity=".18"/>
    <!-- accent band -->
    <rect x="12" y="150" width="56" height="30" fill="${accent}" opacity=".9"/>
    <!-- monogram medallion -->
    <circle cx="40" cy="86" r="22" fill="#fff" opacity=".14"/>
    <text x="40" y="94" text-anchor="middle" font-family="Fraunces, Georgia, serif" font-size="20" font-weight="700" fill="#fff">${svgEsc(initials)}</text>
    <!-- label block -->
    <text x="40" y="168" text-anchor="middle" font-family="Inter, sans-serif" font-size="5.4" letter-spacing="1.2" fill="#fff" opacity=".92">${svgEsc(origin.toUpperCase().slice(0, 18))}</text>
    <text x="40" y="200" text-anchor="middle" font-family="Fraunces, Georgia, serif" font-size="8" font-style="italic" fill="#fff" opacity=".9">${svgEsc(attr.slice(0, 18))}</text>
    <text x="40" y="211" text-anchor="middle" font-family="Inter, sans-serif" font-size="6" fill="#fff" opacity=".8">${svgEsc(String(meta).slice(0, 12))}</text>
  </svg>`;
};

/* Back-compat alias — older call sites / exports may reference getBottleSVG. */
window.getBottleSVG = window.getProductSVG;

/* Neutral shopping-cart placeholder — shown in the GENERIC/PREVIEW app before
   AI product photos are generated. On-brand, no product silhouette. Once AI
   runs, real photos (productImages) replace this. */
window.cartPlaceholderSVG = function (p, w = 80, h = 220) {
  const c = (window.APP_CONFIG.brand && window.APP_CONFIG.brand.colors) || {};
  const bg = c.primary || "#334155", fg = c.accent || c.primaryLt || "#94a3b8";
  const uid = "phc" + String((p && p.id) || "x").replace(/\W/g, "");
  return '<svg viewBox="0 0 80 240" width="' + w + '" height="' + h + '" xmlns="http://www.w3.org/2000/svg" aria-label="Product image coming soon">'
    + '<defs><linearGradient id="' + uid + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + bg + '" stop-opacity=".92"/><stop offset="1" stop-color="' + bg + '"/></linearGradient></defs>'
    + '<rect x="10" y="44" width="60" height="152" rx="12" fill="url(#' + uid + ')"/>'
    + '<g transform="translate(24,100) scale(1.4)" fill="none" stroke="' + fg + '" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">'
    + '<path d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 00-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 00-16.536-1.84M7.5 14.25L5.106 5.272M6 20.25a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm12.75 0a.75.75 0 11-1.5 0 .75.75 0 011.5 0z"/></g></svg>';
};

/* Product image resolver — a generated photo (productImages) always wins. In a
   generic/preview config (before AI), show the neutral shopping-cart
   placeholder; otherwise the branded procedural silhouette.
   Signature mirrors getProductSVG so call sites keep width/height args. */
window.productImage = function (p, w, h) {
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const src = (window.APP_CONFIG.productImages || {})[p.id];
  if (src) return '<img class="prod-img" src="' + src + '" alt="' + esc(p.name) + '" style="max-width:100%;max-height:100%;object-fit:contain"/>';
  if (window.APP_CONFIG._placeholder) return window.cartPlaceholderSVG(p, w, h);
  return window.getProductSVG(p, w, h);
};

/* Apply per-customer brand colors to the CSS :root generic tokens. */
window.applyBrandColors = function () {
  const c = (window.APP_CONFIG.brand && window.APP_CONFIG.brand.colors) || {};
  const r = document.documentElement.style;
  if (c.primary) r.setProperty("--app-primary", c.primary);
  if (c.primaryDk) r.setProperty("--app-primary-dk", c.primaryDk);
  if (c.primaryLt) r.setProperty("--app-primary-lt", c.primaryLt);
  if (c.accent) r.setProperty("--app-accent", c.accent);
  if (c.accentDk) r.setProperty("--app-accent-dk", c.accentDk);
  if (c.accentLt) r.setProperty("--app-accent-lt", c.accentLt);
};
