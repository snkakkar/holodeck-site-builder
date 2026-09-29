/* ============================================================================
   BRAND CONFIG — single source of truth for everything customer-specific.

   To rebrand this demo for a new customer, edit THIS file (plus the catalog,
   the CSS :root token block in css/styles.css, and assets). No other JS file
   should contain the brand name, persona details, agent name, or offer copy.
   See REBRAND.md for the full checklist.

   Loaded FIRST in index.html (before persona.js and all other /js scripts),
   so every consumer can read window.BrandConfig synchronously.
   ============================================================================ */
(function () {
  'use strict';

  // ── Mount-path detection ────────────────────────────────────────────────
  // Every other file in this app (router.js, the products.json fetches,
  // index.html's asset tags) assumes root-absolute paths like "/js/x.js",
  // which only resolve correctly when the app is served at the domain root
  // — true for the standalone repo this was ported from, false once mounted
  // under a subpath (builder preview: /demo-apps/retail-cab/, export:
  // /apps/retail-cab/). Derive that mount prefix ONCE, here (loaded first,
  // via a real <script src> tag so document.currentScript is still this
  // script), and expose it so every absolute-path consumer can prefix with
  // it instead of assuming root.
  (function () {
    var script = document.currentScript;
    var src = script && script.src;
    if (!src) { window.APP_BASE_PATH = ''; return; }
    var path;
    try { path = new URL(src, window.location.href).pathname; } catch (e) { path = ''; }
    var idx = path.indexOf('/js/brand-config.js');
    window.APP_BASE_PATH = idx === -1 ? '' : path.slice(0, idx);
  })();

  var BrandConfig = {
    // ── Brand identity ──────────────────────────────────────────────────────
    brand: {
      name: "Cavender's",
      // Conversational assistant name (was "Coco"). Used in chat greetings,
      // launcher labels, and placeholders across web-curation-component.js.
      agentName: 'Cash',
      agentRole: 'outfitter',         // "your {brand} {agentRole}"
      // Signature merchandising feature (KS "Color Bar"). Generic slot so other
      // customers can relabel it. Cavender's = social/outfit-based merchandising.
      signatureFeatureLabel: 'Shop the Look'
    },

    // ── Persona (the single demo shopper) ────────────────────────────────────
    // Moved out of persona.js. The RESOLUTION logic (jewelry box rules,
    // recommendation scoring) stays in persona.js as reusable engine code —
    // only this DATA is customer-specific.
    //
    // ⚠ CONTRACT: interests.stones keywords MUST occur in the catalog product
    // names/descriptions, or recommendFromBox() returns an empty grid. Validate
    // against the new catalog when rebranding (see REBRAND.md step 5).
    persona: {
      identity: {
        name: 'Rachel Morris',
        firstName: 'Rachel',
        email: 'rmorris@example.com',
        memberSince: '2023'
      },
      // ⚠ interests.families/categories MUST match the values produced by
      // scripts/rebuild-catalog-cav.js (see FAMILIES + categoryOf). The `stones`
      // list is repurposed as free-text keywords that MUST occur in product
      // names/descriptions or recommendFromBox() returns empty (REBRAND.md step 5).
      interests: {
        families: ['Boots', 'Hats', 'Jeans'],
        categories: ['Western Boots', 'Booties', 'Felt Hats', 'Straw Hats', 'Bootcut'],
        stones: ['bootcut', 'suede', 'leather', 'fringe', 'turquoise', 'snip toe', 'square toe', 'concho']
      },
      profile: {
        stylePersona: 'Country & Festival',
        loyaltyTier: 'My Cavender’s · Trailblazer',
        birthday: 'September 15',
        location: 'Fort Worth, TX',
        memberSince: '2023',
        favoriteCategories: ['Western Boots', 'Felt Hats', 'Bootcut Jeans'],
        colorPreferences: [
          { name: 'Saddle Tan', hex: '#b07a4b' },
          { name: 'Indigo Denim', hex: '#3a5675' },
          { name: 'Turquoise', hex: '#3fb6a8' },
          { name: 'Black Felt', hex: '#2b2622' }
        ],
        metalPreference: 'Antique Silver',
        preferredChannel: 'SMS',
        lifetimeValue: '$1,240'
      }
    },

    // ── Loyalty / offers ─────────────────────────────────────────────────────
    // Read by birthday-promo.js (window.Offers + BirthdayPromo shim) and by
    // views.js (checkout / hero / profile). Multiple offers the shopper can
    // ACTIVATE; up to two stack at checkout. `conflictsWith` is the single
    // source of the mutual-exclusion rule — the UI derives its greying from it.
    //   type: 'tiered-unit'    → discountRates off the most-expensive units
    //         'family-percent' → percent off line items in `family`
    //         'free-shipping'  → zeroes the baseline shipping charge
    // eligibleFirstName gates an offer on the signed-in shopper's first name
    // (null = available to everyone).
    offers: [
      {
        id: 'birthday',
        code: 'MYCAV2026',
        label: 'My Cavender’s Birthday Reward',
        short: '$25 birthday reward + double points',
        long: 'Happy birthday from My Cavender’s — a $25 reward is waiting in ' +
          'your digital wallet, plus double points on everything you buy this month.',
        emoji: '🎂',
        type: 'tiered-unit',
        discountRates: [0.5, 0.25],
        eligibleFirstName: 'Rachel',
        conflictsWith: ['boots15']
      },
      {
        id: 'boots15',
        code: 'BOOTS15',
        label: '15% Off Boots',
        short: '15% off every pair of boots',
        long: 'Take 15% off every pair of boots in your cart — stack it with free shipping.',
        emoji: '🥾',
        type: 'family-percent',
        percent: 0.15,
        family: 'Boots',
        eligibleFirstName: null,
        conflictsWith: ['birthday']
      },
      {
        id: 'freeship',
        code: 'SHIPFREE',
        label: 'Free Shipping',
        short: 'Free standard shipping',
        long: 'Free standard shipping on this order — stacks with any reward.',
        emoji: '🚚',
        type: 'free-shipping',
        eligibleFirstName: null,
        conflictsWith: []
      }
    ],

    // ── Trending topics (editorial rail) ─────────────────────────────────────
    // Moved out of views.js. Each trend maps a country/festival moment onto the
    // catalog. `filter(p)` is a predicate over a product object; it MUST return
    // ≥1 product against the catalog or the trend carousel renders empty (the
    // behavioral harness enforces this). `styledPosts[].trendId` references these
    // ids. (The generator emits declarative, serializable filters; this
    // foundation keeps the original predicate functions.)
    trends: [
      {
        id: 'festival-ready',
        label: 'Festival Ready',
        tag: 'Free-Spirited & Bold',
        icon: '🤠',
        filter: function (p) {
          var t = ((p.name || '') + ' ' + (p.description || '')).toLowerCase();
          return (p.family === 'Hats' && /straw/.test(t)) ||
                 p.category === 'Booties' ||
                 /fringe|serape|aztec|graphic/.test(t);
        }
      },
      {
        id: 'rodeo-ready',
        label: 'Rodeo Ready',
        tag: 'For Him & Her',
        icon: '🐎',
        filter: function (p) {
          var t = ((p.name || '') + ' ' + (p.description || '')).toLowerCase();
          return p.category === 'Buckles' ||
                 p.family === 'Belts' ||
                 (p.family === 'Boots' && /snip toe|square toe|exotic|caiman|ostrich/.test(t)) ||
                 /concho|tooled|trophy|championship/.test(t);
        }
      },
      {
        id: 'denim-and-boots',
        label: 'Denim & Boots',
        tag: 'The Everyday Uniform',
        icon: '👢',
        filter: function (p) {
          return p.family === 'Jeans' ||
                 (p.family === 'Boots' && p.category === 'Western Boots');
        }
      },
      {
        id: 'ranch-ready',
        label: 'Ranch Ready',
        tag: 'Built to Work',
        icon: '🌾',
        filter: function (p) {
          var t = ((p.name || '') + ' ' + (p.description || '')).toLowerCase();
          return (p.family === 'Hats' && /felt|wool/.test(t)) ||
                 p.category === 'Work Boots' ||
                 /wrangler|cinch|work|pearl snap|cowboy cut|roughout/.test(t);
        }
      },
      {
        id: 'turquoise-and-fringe',
        label: 'Turquoise & Fringe',
        tag: 'Statement Western',
        icon: '💠',
        filter: function (p) {
          var t = ((p.name || '') + ' ' + (p.description || '')).toLowerCase();
          return /turquoise|fringe|concho|squash blossom|tooled|feather/.test(t) ||
                 p.category === 'Jewelry';
        }
      }
    ],

    // ── "See It Styled" — shoppable community lifestyle feed ─────────────────
    // Moved out of views.js. Each post's `products` names MUST match products.json
    // EXACTLY so a tag click resolves against the loaded catalog. `trendId` must
    // match a trends[] id — posts render inside that trend's carousel panel.
    styledPosts: [
      // Festival Ready — free-spirited & bold
      { id: 'fr1', trendId: 'festival-ready', image: '/images/styled/festival-ready-1.jpg', handle: '@desert.daze', caption: 'Straw hat, fringe, and dust on my boots. Festival season is ON ☀️', likes: 1102,
        products: ['Charlie 1 Horse Laney Wilson Women\'s Straw "Road Runner" Cowboy Hat', 'Rock & Roll Denim Women\'s Rust Faux Suede Fringed Cropped Shirt Jacket'] },
      { id: 'fr2', trendId: 'festival-ready', image: '/images/styled/festival-ready-2.jpg', handle: '@wildatart', caption: 'Snip-toe booties + a fringe skirt. Ready to two-step til sunrise.', likes: 894,
        products: ['Rockin C Women’s Black with Silver Braiding Snip Toe Booties', 'Peach Love Women\'s Metallic Silver with Rhinestone Fringe Skirt'] },
      { id: 'fr3', trendId: 'festival-ready', image: '/images/styled/festival-ready-3.jpg', handle: '@sun.and.sage', caption: 'Serape colors + a graphic tee. Golden hour uniform locked in 🎡', likes: 1320,
        products: ['Cinch Women\'s Royal Blue Deep Red & Spring Green Serape Long Sleeve Western Shirt', 'Girl Dangerous Women\'s Sweetheart Of The Rodeo Cream Graphic T-Shirt'] },

      // Rodeo Ready — for him & her
      { id: 'rc1', trendId: 'rodeo-ready', image: '/images/styled/rodeo-chic-1.jpg', handle: '@arena.ready', caption: 'Trophy buckle + tooled leather belt. Grand entry energy 🐎', likes: 1284,
        products: ['Montana Silversmiths Sanders Silver & Gold Bareback Bronc Rider Trophy Buckle', 'Ariat Brown Tooled Double Stitched Men\'s Western Belt'] },
      { id: 'rc2', trendId: 'rodeo-ready', image: '/images/styled/rodeo-chic-2.jpg', handle: '@thegrandentry', caption: 'Square-toe boots + a good belt. Never underdressed for the rail.', likes: 967,
        products: ['Ariat Men\'s Jasper Black Hybrid Rancher Wide Square Toe Cowboy Boots', 'Ariat Men\'s Black Embossed Floral Tooled Double Stitched Leather Belt'] },
      { id: 'rc3', trendId: 'rodeo-ready', image: '/images/styled/rodeo-chic-3.jpg', handle: '@buckle.and.bling', caption: 'Concho belt + denim. Arena-ready from the ground up 🤠', likes: 1543,
        products: ['Ariat Men\'s Etched Silver Buckle & Brown Genuine Leather Floral Tooled Belt', 'Wrangler Men\'s Rigid Indigo Cowboy Cut Slim Fit Jeans'] },

      // Denim & Boots — the everyday uniform
      { id: 'db1', trendId: 'denim-and-boots', image: '/images/styled/denim-and-boots-1.jpg', handle: '@everyday.western', caption: 'Square-toe boots + a good pair of jeans. My whole personality 👢', likes: 842,
        products: ['Cavender’s Women’s Camel Suede and Brown Maricopa Horseman Wide Square Toe Cowboy Boots', 'Rock & Roll Cowgirl Women\'s Light Wash Paisley Studded Jeans'] },
      { id: 'db2', trendId: 'denim-and-boots', image: '/images/styled/denim-and-boots-2.jpg', handle: '@denimdays', caption: 'Olive suede boots + wide-leg trousers. Effortless every time.', likes: 611,
        products: ['JRC & Sons Women’s Whitney Olive Suede Snip Toe Cowboy Boots', 'Warp & Weft Women\'s Venetian Sailing Day Wide Leg Trouser Jeans'] },
      { id: 'db3', trendId: 'denim-and-boots', image: '/images/styled/denim-and-boots-3.jpg', handle: '@bootsandbluejeans', caption: 'Tooled boots + a dark flare. Never met a denim I didn\'t like.', likes: 733,
        products: ['Rockin\' C Women\'s Nut Brown Tooled Snip Toe Cowboy Boots', 'Judy Blue Women\'s Mid Rise Button Fly Distress Flare Jeans - Plus Size'] },

      // Ranch Ready — built to work
      { id: 'rr1', trendId: 'ranch-ready', image: '/images/styled/ranch-ready-1.jpg', handle: '@fivemorningsafeedlot', caption: 'Felt hat, pearl snap, sun coming up over the pens 🌾', likes: 1456,
        products: ['Rockin\' C Women\'s Tan Wide Brim Standard Crown Felt Cowboy Hat', 'Rock & Roll Denim Women\'s Rust Western Scroll Embroidered Long Sleeve Pearl Snap Shirt'] },
      { id: 'rr2', trendId: 'ranch-ready', image: '/images/styled/ranch-ready-2.jpg', handle: '@workandwild', caption: 'Silverbelly felt + work-ready denim. Long days, good boots.', likes: 978,
        products: ['Rockin\' C Women\'s Silverbelly Tall Crown Felt Cowboy Hat', 'Bulwark Women\'s Curvy Fit FR Stretch Work Jeans'] },
      { id: 'rr3', trendId: 'ranch-ready', image: '/images/styled/ranch-ready-3.jpg', handle: '@dirtroad.diary', caption: 'Teal felt + a stitched leather belt. Ranch-to-town in one outfit.', likes: 705,
        products: ['Rockin\' C Women\'s Teal Tall Crown Felt Cowboy Hat', 'Cavender\'s Women\'s Tan with Fancy Stitch Leather Belt'] },

      // Turquoise & Fringe — statement western
      { id: 'tf1', trendId: 'turquoise-and-fringe', image: '/images/styled/turquoise-and-fringe-1.jpg', handle: '@turquoisetuesday', caption: 'Turquoise concho belt + cowhide inlay. Statement made 💠', likes: 1611,
        products: ['Southern Grace Women\'s Turquoise & Silver Floral Concho Ring Belt', 'Ariat Women\'s Red Flower with Cowhide Inlay and Turquoise Embellishments Tooled Belt'] },
      { id: 'tf2', trendId: 'turquoise-and-fringe', image: '/images/styled/turquoise-and-fringe-2.jpg', handle: '@fringe.and.feathers', caption: 'All fringe, all the time. Movement is the whole look ✨', likes: 1244,
        products: ['Cowgirl Hardware Women\'s Black Outlaw Country Graphic Fringe Sleeveless Top', 'Rock & Roll Denim Women\'s Green Cowboy Round Up Graphic Fringed Tank Top'] },
      { id: 'tf3', trendId: 'turquoise-and-fringe', image: '/images/styled/turquoise-and-fringe-3.jpg', handle: '@highplains.style', caption: 'Sunflower concho + a fringe jacket. Western, but make it loud.', likes: 903,
        products: ['Ariat Women\'s Brown Tooled with Sunflower Concho Leather Belt', 'Southern Grace Women\'s Change of Pace Metallic Hot Pink Fringed Jacket'] }
    ],

    // ── Store directory (BOPIS pickup picker) ────────────────────────────────
    // Moved out of views.js. Keyed by lowercase city; each city lists up to 3
    // stores. `pickupWindows` are the same-/next-day ready messages (indexed).
    // Unknown cities fall back to a generic 3-store list built from the city name.
    stores: {
      pickupWindows: ['Ready in 2 hours', 'Ready today by 5:00 PM', 'Ready tomorrow by 10:00 AM'],
      directory: {
        'austin':        [{ name: 'South Congress (SoCo)', addr: '1400 S Congress Ave' }, { name: 'The Domain', addr: '11701 Domain Blvd' }, { name: 'Barton Creek Mall', addr: '2901 Capital of TX Hwy' }],
        'san francisco': [{ name: 'Union Square', addr: '160 Geary St' }, { name: 'Corte Madera', addr: 'The Village at Corte Madera' }, { name: 'Stanford Shopping Center', addr: '660 Stanford Shopping Ctr' }],
        'dallas':        [{ name: 'Knox Street', addr: '3009 Knox St' }, { name: 'NorthPark Center', addr: '8687 N Central Expy' }, { name: 'Galleria Dallas', addr: '13350 Dallas Pkwy' }],
        'houston':       [{ name: 'Rice Village', addr: '2529 Amherst St' }, { name: 'The Galleria', addr: '5085 Westheimer Rd' }, { name: 'CityCentre', addr: '795 Town & Country Blvd' }],
        'new york':      [{ name: 'SoHo', addr: '110 Prince St' }, { name: 'Upper East Side', addr: '1050 Third Ave' }, { name: 'Hudson Yards', addr: '20 Hudson Yards' }],
        'los angeles':   [{ name: 'The Grove', addr: '189 The Grove Dr' }, { name: 'Beverly Center', addr: '8500 Beverly Blvd' }, { name: 'Century City', addr: '10250 Santa Monica Blvd' }],
        'chicago':       [{ name: 'Southport', addr: '3524 N Southport Ave' }, { name: 'Oakbrook Center', addr: '438 Oakbrook Center' }, { name: 'Old Orchard', addr: '4999 Old Orchard Ctr' }]
      }
    }
  };

  // Back-compat alias: earlier code read the single `BrandConfig.offer`
  // (the birthday reward). Keep it pointing at the first offer.
  BrandConfig.offer = BrandConfig.offers[0];

  // Convenience alias used widely for the persona (back-compat with prior
  // window.Persona.RACHEL shape).
  BrandConfig.persona.RACHEL = BrandConfig.persona.identity;

  // The baked Cavender's styledPosts point at local root-absolute images
  // ("/images/styled/*.jpg"), rendered straight into <img src> — same
  // subpath-mount problem as the script/css tags above. Prefix them with
  // the detected mount path now, once, rather than at every render site.
  if (window.APP_BASE_PATH && Array.isArray(BrandConfig.styledPosts)) {
    BrandConfig.styledPosts.forEach(function (p) {
      if (p && typeof p.image === 'string' && p.image.charAt(0) === '/') {
        p.image = window.APP_BASE_PATH + p.image;
      }
    });
  }

  window.BrandConfig = BrandConfig;

  // ── Preview override (?holo=<token>) ─────────────────────────────────────
  // The builder stashes a generated preview payload under localStorage key
  // "holo-appconfig-<token>" = { brandConfig, products } — same mechanism
  // used by the Clienteling/Cimulate apps (see demo-apps/clienteling/
  // app-config.js) — so the preview page can render the generated brand
  // WITHOUT a full export. When the storefront is opened with ?holo=<token>
  // we (a) replace the baked BrandConfig with the generated one and (b)
  // expose the generated catalog on window.__HOLO_PREVIEW_PRODUCTS, which
  // search-engine.js / views.js prefer over the baked /js/products.json fetch.
  //
  // Trend `filter` predicates can't survive JSON, so a generated trend carrying
  // a serializable `filterSpec` ({families,categories,keywords,priceTier}) is
  // compiled back into a live predicate here — keeping preview↔export parity.
  //
  // Exported (downloaded) builds ship the baked config, a real products.json,
  // and no ?holo token, so this whole block resolves immediately there.
  //
  // window.__HOLO_BRAND_READY is a promise index.html awaits before loading
  // persona.js and everything downstream that reads window.BrandConfig at
  // module-init time — otherwise those scripts would run against the stale
  // baked default before the override lands.
  function compileTrendFilters(cfg) {
    if (!cfg || !cfg.trends || !cfg.trends.length) return;
    cfg.trends.forEach(function (tr) {
      if (typeof tr.filter === 'function') return; // already live
      var spec = tr.filterSpec || tr.filter || {};
      var fams = (spec.families || []).map(function (s) { return String(s).toLowerCase(); });
      var cats = (spec.categories || []).map(function (s) { return String(s).toLowerCase(); });
      var types = (spec.types || []).map(function (s) { return String(s).toLowerCase(); });
      var kws  = (spec.keywords || []).map(function (s) { return String(s).toLowerCase(); });
      var tier = spec.priceTier ? String(spec.priceTier).toLowerCase() : '';
      tr.filter = function (p) {
        var fam = String(p.family || '').toLowerCase();
        var cat = String(p.category || '').toLowerCase();
        var typ = String(p.type || '').toLowerCase();
        var txt = ((p.name || '') + ' ' + (p.description || '')).toLowerCase();
        if (fams.length && fams.indexOf(fam) === -1) return false;
        if (cats.length && cats.indexOf(cat) === -1) return false;
        if (types.length && types.indexOf(typ) === -1) return false;
        if (tier && String(p.priceTier || '').toLowerCase() !== tier) return false;
        if (kws.length && !kws.some(function (k) { return txt.indexOf(k) !== -1; })) return false;
        // With no positive signal, don't match everything.
        return !!(fams.length || cats.length || types.length || kws.length || tier);
      };
    });
  }
  function readPreviewPayload(token) {
    var key = 'holo-appconfig-' + token;
    var raw = null;
    try { raw = window.localStorage.getItem(key) || window.sessionStorage.getItem(key); } catch (e) { /* storage disabled */ }
    if (!raw) return null;
    try { return JSON.parse(raw); } catch (e) { return null; }
  }

  var _holo = new URLSearchParams(window.location.search).get('holo');
  var _payload = _holo ? readPreviewPayload(_holo) : null;
  if (_payload) {
    var _cfg = _payload.brandConfig ? _payload.brandConfig : _payload;
    if (_cfg && typeof _cfg === 'object') {
      compileTrendFilters(_cfg);
      _cfg.offer = _cfg.offer || (_cfg.offers && _cfg.offers[0]);
      if (_cfg.persona && _cfg.persona.identity) _cfg.persona.RACHEL = _cfg.persona.identity;
      window.BrandConfig = _cfg;
    }
    if (Array.isArray(_payload.products)) {
      window.__HOLO_PREVIEW_PRODUCTS = _payload.products;
    }
  }
  window.__HOLO_BRAND_READY = Promise.resolve();
})();
