/**
 * Cimulate-Style Intelligent Site Search Engine
 *
 * Client-side search over the Kendra Scott product catalog with:
 * - Intent parsing (occasion, price, recipient)
 * - Synonym & concept expansion ("gift for her" → pendants, studs, gift sets…)
 * - Fuzzy matching (Levenshtein distance for typo tolerance)
 * - Relevance scoring (name 40%, category 30%, description 20%, concept 10%)
 * - Category grouping for browsable results
 *
 * Shares the product catalog with views.js (same /js/products.json fetch).
 */

(function () {
  'use strict';

  // ── Product catalog (shared fetch with views.js) ──
  var _products = null;
  var _productsPromise = null;

  // F1: gender is a STORED field on every product (`men | women | unisex`),
  // generated once and baked into products.json — NEVER inferred at runtime.
  // normGender maps any gender value (stored field OR a parsed search intent
  // like 'Women'/'Men'/'Kids') to the canonical lowercase engine vocabulary.
  // Returns 'men' | 'women' | '' where '' means neutral/unconstrained (unisex,
  // missing, or a 'kids' intent we don't hard-filter on). "men" is a substring
  // of "women", so test women first.
  function normGender(g) {
    if (!g) return '';
    var s = String(g).toLowerCase();
    if (s.indexOf('women') !== -1) return 'women';
    if (s.indexOf('men') !== -1) return 'men';
    return ''; // unisex / kids / anything else → neutral
  }

  // True when a shopper is signed in (the demo persona is female, so signed-in
  // search defaults to women's items unless the query is explicitly for him/kids).
  // Safe before WebCuration exists.
  function isSignedIn() {
    var id = window.WebCuration && window.WebCuration.getUserIdentity
      ? window.WebCuration.getUserIdentity() : null;
    return !!(id && id.firstName);
  }

  function loadProducts() {
    if (_products) return Promise.resolve(_products);
    if (_productsPromise) return _productsPromise;
    // Preview override: when the builder opens the storefront with ?holo=<token>,
    // brand-config.js stashes the GENERATED catalog on window.__HOLO_PREVIEW_PRODUCTS.
    // Use it instead of fetching the baked /js/products.json so the live preview
    // shows the generated brand. Exported builds never set this global.
    if (Array.isArray(window.__HOLO_PREVIEW_PRODUCTS) && window.__HOLO_PREVIEW_PRODUCTS.length) {
      _productsPromise = Promise.resolve(window.__HOLO_PREVIEW_PRODUCTS.slice());
    } else {
      _productsPromise = fetch((window.APP_BASE_PATH || '') + '/js/products.json').then(function (r) { return r.json(); });
    }
    _productsPromise = _productsPromise
      .then(function (data) {
        _products = data;
        // Pre-compute lowercase fields for search
        _products.forEach(function (p) {
          p._nameLower = (p.name || '').toLowerCase();
          p._categoryLower = (p.category || '').toLowerCase();
          p._familyLower = (p.family || '').toLowerCase();
          p._typeLower = (p.type || p.family || '').toLowerCase();
          p._descLower = (p.description || '').toLowerCase();
          p._priceNum = parseFloat(p.price) || 0;
          p._gender = normGender(p.gender); // stored F1 field → 'men'|'women'|''
        });
        buildDerivedVocabulary(_products);
        console.log('[SiteSearch] Catalog loaded: ' + _products.length + ' products');
        return _products;
      });
    return _productsPromise;
  }

  // ── Derived, brand-agnostic vocabulary ──
  // The tables below (CONCEPT_MAP, TYPE_SYNONYMS, etc.) are Western-wear-
  // specific defaults used ONLY for the baked Cavender's demo (no ?holo
  // preview token / no generated BrandConfig). For a GENERATED brand, every
  // one of these is instead derived from the brand's own catalog/BrandConfig
  // fields (family, category, colors[], trends[]) — same gated-fallback
  // pattern already used by router.js's ROUTES / navCategories check, so a
  // brand whose vocabulary doesn't fit "boots and hats" still gets working
  // search instead of silently collapsing to the Western defaults.
  var _derived = null; // set by buildDerivedVocabulary() once a real catalog loads

  function hasGeneratedBrand() {
    var bc = window.BrandConfig || {};
    return !!((bc.navCategories && bc.navCategories.length) || (bc.trends && bc.trends.length));
  }

  function titleCase(s) {
    s = String(s || '');
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  function naivePlural(s) {
    s = String(s || '');
    if (!s || /s$/i.test(s)) return s;
    return s + 's';
  }

  function naiveSingular(s) {
    s = String(s || '');
    if (s.length > 3 && /s$/i.test(s)) return s.slice(0, -1);
    return s;
  }

  // A multi-word category/family string ("Polo Shirts", "Men's Polos") is
  // only ever indexed by that exact string today — a single-word query
  // token ("polo"/"polos") can never match it. Index each significant word
  // too (plus its plural/singular), without clobbering an existing exact-
  // string key, so a sub-word query still resolves to the right bucket.
  function indexWords(map, wholeKey, value) {
    wholeKey.split(/\s+/).forEach(function (word) {
      word = word.replace(/[^a-z0-9]/gi, '');
      if (word.length <= 2) return;
      [word, naivePlural(word), naiveSingular(word)].forEach(function (k) {
        if (k && !map[k]) map[k] = value;
      });
    });
  }

  function buildDerivedVocabulary(products) {
    if (!hasGeneratedBrand()) { _derived = null; return; }

    var families = []; // real casing, in first-seen order
    var categoryFamily = {}, typeSynonyms = {}, styleSynonyms = {}, genericTokens = {},
      tokenFamily = {}, colorWordsSet = {}, typeCategory = {};

    products.forEach(function (p) {
      var fam = p.family, cat = p.category, typ = p.type;
      if (fam && families.indexOf(fam) === -1) families.push(fam);
      if (cat && fam) categoryFamily[cat.toLowerCase()] = fam;
      if (typ && cat) typeCategory[typ.toLowerCase()] = cat;
      (p.colors || []).forEach(function (c) {
        if (c) colorWordsSet[String(c).toLowerCase()] = 1;
      });
    });

    // Sub-type vocabulary (finer than category): a distinct `type` value
    // (e.g. "Driver"/"Putter" within family "Clubs") is a HIGH-WEIGHT style
    // word, mirroring how categories are indexed below — but kept in its
    // OWN map (typeStyleSynonyms → real-cased type value) since a type value
    // matches against product.type, not product.category, and the two must
    // never be conflated in scoreProduct.
    var typeStyleSynonyms = {};
    var typesSeen = {};
    // Which distinct `type` values contain each single word (across the
    // whole catalog) — built in a first pass so the second pass can tell a
    // word that's UNIQUE to one type ("driver" in "Driver Club") from a word
    // shared by several ("club" in "Driver Club"/"Putter Club", "golf" in
    // "Golf Ball"/"Golf Glove"). Deliberately position-independent — the
    // identifying word in a multi-word type can be first OR last depending
    // on how the brand names things, so no fixed "head noun" assumption.
    var typeWordOwners = {};
    products.forEach(function (p) {
      var typ = p.type;
      if (!typ || typesSeen[typ]) return;
      typesSeen[typ] = true;
      var typLower = typ.toLowerCase();
      typeStyleSynonyms[typLower] = typ;
      typeStyleSynonyms[naivePlural(typLower)] = typ;
      typLower.split(/\s+/).forEach(function (w) {
        w = w.replace(/[^a-z0-9]/gi, '');
        if (w.length <= 2) return;
        [w, naivePlural(w), naiveSingular(w)].forEach(function (k) {
          if (!k) return;
          typeWordOwners[k] = typeWordOwners[k] || {};
          typeWordOwners[k][typ] = true;
        });
      });
    });
    // Also register ownership from CATEGORY values (not just type values) —
    // a word that's unique among types can still be a generic, catalog-wide
    // filler word one layer up (e.g. every category here is prefixed "Golf":
    // "Golf Clubs"/"Golf Balls"/"Golf Apparel"/"Golf Shoes"). Without this,
    // "golf" looks uniquely owned by the one type that happens to contain it
    // ("Golf Pants") and hijacks every "golf ___" query into that type before
    // the correct category-level match ever runs. Tagged with a "cat:" prefix
    // so the promotion check below can tell a type-owner from a category-owner.
    var categoriesSeen = {};
    products.forEach(function (p) {
      var cat = p.category;
      if (!cat || categoriesSeen[cat]) return;
      categoriesSeen[cat] = true;
      cat.toLowerCase().split(/\s+/).forEach(function (w) {
        w = w.replace(/[^a-z0-9]/gi, '');
        if (w.length <= 2) return;
        [w, naivePlural(w), naiveSingular(w)].forEach(function (k) {
          if (!k) return;
          typeWordOwners[k] = typeWordOwners[k] || {};
          typeWordOwners[k]['cat:' + cat] = true;
        });
      });
    });
    // A word only earns a loose single-word synonym entry when it names
    // exactly one real type AND doesn't also recur across category labels —
    // an ambiguous (shared, or catalog-wide-generic) word is left generic
    // rather than arbitrarily hijacked to whichever type was seen first.
    Object.keys(typeWordOwners).forEach(function (w) {
      var owners = Object.keys(typeWordOwners[w]);
      var soleOwner = owners.length === 1 ? owners[0] : null;
      if (soleOwner && soleOwner.indexOf('cat:') !== 0 && !typeStyleSynonyms[w]) {
        typeStyleSynonyms[w] = soleOwner;
      }
    });

    families.forEach(function (fam) {
      var famLower = fam.toLowerCase();
      var famPlural = naivePlural(famLower);
      var cats = [];
      products.forEach(function (p) {
        if (p.family === fam && p.category && cats.indexOf(p.category) === -1) cats.push(p.category);
      });
      typeSynonyms[famLower] = cats;
      typeSynonyms[famPlural] = cats;
      indexWords(typeSynonyms, famLower, cats);
      genericTokens[famLower] = 1;
      genericTokens[famPlural] = 1;
      tokenFamily[famLower] = fam;
      tokenFamily[famPlural] = fam;
      indexWords(tokenFamily, famLower, fam);
    });

    Object.keys(categoryFamily).forEach(function (catLower) {
      styleSynonyms[catLower] = [catLower];
      styleSynonyms[naivePlural(catLower)] = [catLower];
      indexWords(styleSynonyms, catLower, [catLower]);
    });

    var colorWords = {};
    Object.keys(colorWordsSet).forEach(function (c) { colorWords[c] = 1; });
    var colorSynonyms = {};
    Object.keys(colorWords).forEach(function (c) { colorSynonyms[c] = [c]; });

    // trends[] → loose occasion/vibe hints (CONCEPT_MAP equivalent). Trends
    // are harness-guaranteed to match ≥1 product, so every entry here is
    // provably non-empty.
    var conceptMap = {};
    var bc = window.BrandConfig || {};
    (Array.isArray(bc.trends) ? bc.trends : []).forEach(function (t) {
      if (!t || !t.label) return;
      var spec = t.filterSpec || {};
      conceptMap[String(t.label).toLowerCase()] = {
        families: (spec.families || []).filter(Boolean),
        categories: (spec.categories || []).filter(Boolean),
        keywords: (spec.keywords || []).filter(Boolean)
      };
    });

    // Family-adjacency "look" pairing. Prefer Gemini-generated
    // BrandConfig.lookComplements (see storefront-foundations.js schema); fall
    // back to a deterministic round-robin over the real families so the
    // Complete-the-Look row never dead-ends when that field is empty/malformed.
    var lookComplements = {};
    var validFamilySet = {};
    families.forEach(function (f) { validFamilySet[f] = true; });
    var lc = Array.isArray(bc.lookComplements) ? bc.lookComplements : [];
    lc.forEach(function (entry) {
      if (!entry || !validFamilySet[entry.family]) return;
      var comps = (entry.complements || []).filter(function (f) { return validFamilySet[f] && f !== entry.family; });
      if (comps.length) lookComplements[entry.family] = comps;
    });
    families.forEach(function (fam) {
      if (lookComplements[fam] && lookComplements[fam].length) return;
      lookComplements[fam] = families.filter(function (f) { return f !== fam; }).slice(0, 3);
    });

    _derived = {
      families: families,
      categoryFamily: categoryFamily,
      typeCategory: typeCategory,
      typeStyleSynonyms: typeStyleSynonyms,
      typeSynonyms: typeSynonyms,
      styleSynonyms: styleSynonyms,
      genericTokens: genericTokens,
      tokenFamily: tokenFamily,
      colorWords: colorWords,
      colorSynonyms: colorSynonyms,
      conceptMap: conceptMap,
      lookComplements: lookComplements,
      demoQueries: Array.isArray(bc.demoQueries) ? bc.demoQueries : []
    };
  }

  function activeLookFamilies() { return (_derived && _derived.families.length) ? _derived.families : LOOK_FAMILIES; }
  function activeConceptMap() { return _derived ? _derived.conceptMap : CONCEPT_MAP; }
  function activeTypeSynonyms() { return _derived ? _derived.typeSynonyms : TYPE_SYNONYMS; }
  function activeStyleSynonyms() { return _derived ? _derived.styleSynonyms : STYLE_SYNONYMS; }
  function activeGenericTokens() { return _derived ? _derived.genericTokens : GENERIC_TOKENS; }
  function activeTokenFamily() { return _derived ? _derived.tokenFamily : TOKEN_FAMILY; }
  function activeCategoryFamily() { return _derived ? _derived.categoryFamily : CATEGORY_FAMILY; }
  function activeColorSynonyms() { return _derived ? _derived.colorSynonyms : COLOR_SYNONYMS; }
  function activeColorWords() { return _derived ? _derived.colorWords : COLOR_WORDS; }
  function activeLookComplements() { return _derived ? _derived.lookComplements : LOOK_COMPLEMENTS; }
  function activeTypeCategory() { return _derived ? _derived.typeCategory : {}; }
  function activeTypeStyleSynonyms() { return _derived ? _derived.typeStyleSynonyms : {}; }
  function activeDemoQueries() { return _derived ? _derived.demoQueries : []; }

  // ── Baked-demo defaults (Western-wear) — used only when no generated
  // BrandConfig is present (see hasGeneratedBrand()/buildDerivedVocabulary()
  // above, which supersede these for any generated brand). ──
  // Maps user terms → relevant categories, keywords, and product terms
  var CONCEPT_MAP = {
    // Occasions / vibes → relevant categories (loose, low-weight hints)
    'gift':            { categories: ['western boots', 'felt hats'], keywords: ['popular', 'best'] },
    'gift for her':    { categories: ['booties', 'straw hats', 'jewelry'], keywords: ['everyday', 'favorite'] },
    'rodeo':           { categories: ['western boots', 'buckles', 'felt hats'], keywords: ['concho', 'rhinestone', 'tooled'] },
    'festival':        { categories: ['straw hats', 'booties', 'jewelry'], keywords: ['fringe', 'serape', 'aztec'] },
    'concert':         { categories: ['booties', 'straw hats'], keywords: ['fringe', 'graphic', 'studded'] },
    'everyday':        { categories: ['western boots', 'bootcut', 'tops'], keywords: ['versatile', 'everyday', 'classic'] },
    'date night':      { categories: ['booties', 'dresses', 'jewelry'], keywords: ['bold', 'metallic'] },
    'work':            { categories: ['work boots', 'bootcut'], keywords: ['durable', 'stretch', 'everyday'] },
    'ranch':           { categories: ['work boots', 'felt hats', 'western shirts'], keywords: ['roughout', 'pearl snap', 'durable'] },
    'vacation':        { categories: ['straw hats', 'booties', 'tops'], keywords: ['colorful', 'fun'] },
    'party':           { categories: ['booties', 'dresses', 'jewelry'], keywords: ['bold', 'metallic', 'rhinestone'] },
    'wedding':         { categories: ['booties', 'dresses', 'felt hats'], keywords: ['dressy', 'elegant'] },
    'graduation':      { categories: ['western boots', 'jewelry'], keywords: ['classic', 'keepsake'] },
    'birthday':        { categories: ['western boots', 'felt hats'], keywords: ['gift', 'favorite'] },
    'summer':          { categories: ['straw hats', 'tops', 'booties'], keywords: ['light', 'breathable'] },
    'winter':          { categories: ['felt hats', 'western boots'], keywords: ['wool', 'warm'] },
    'new arrivals':    { categories: ['western boots', 'felt hats', 'bootcut'], keywords: ['new', 'popular'] },
    // Stone/color that lives in specific families — nudge scoring toward the
    // families that actually carry it (turquoise concentrates in jewelry, belts,
    // and hats — never in boots/jeans) so a "turquoise" search surfaces real
    // turquoise pieces instead of family-assembling around boots.
    'turquoise':       { categories: ['jewelry', 'belts', 'buckles', 'felt hats'], keywords: ['turquoise', 'teal', 'concho'] },
    'teal':            { categories: ['jewelry', 'belts', 'felt hats'], keywords: ['teal', 'turquoise'] }
  };

  // Generic TYPE words → the subcategories of that product type. These are
  // LOW-WEIGHT hints: "boots" shouldn't out-rank a specific "bootie" request,
  // it should only broaden when no specific style was named.
  var TYPE_SYNONYMS = {
    'boot': ['western boots', 'booties', 'work boots'], 'boots': ['western boots', 'booties', 'work boots'],
    'hat': ['felt hats', 'straw hats', 'cowboy hats'], 'hats': ['felt hats', 'straw hats', 'cowboy hats'],
    'jean': ['bootcut', 'slim'], 'jeans': ['bootcut', 'slim'], 'denim': ['bootcut', 'slim'],
    'belt': ['belts', 'buckles'], 'belts': ['belts', 'buckles'],
    'shirt': ['western shirts', 'tops'], 'shirts': ['western shirts', 'tops'], 'top': ['tops', 'western shirts'], 'tops': ['tops', 'western shirts']
  };

  // Specific STYLE words → their exact category. HIGH-WEIGHT: naming a style
  // ("bootie", "felt", "bootcut") makes that category authoritative so results
  // stay targeted instead of flooding with the type's most common subcategory.
  var STYLE_SYNONYMS = {
    'cowboy boots': ['western boots'], 'western boots': ['western boots'], 'cowgirl boots': ['western boots'], 'roper': ['western boots'],
    'bootie': ['booties'], 'booties': ['booties'], 'ankle boot': ['booties'], 'ankle boots': ['booties'],
    'work boot': ['work boots'], 'work boots': ['work boots'], 'lacer': ['work boots'],
    'felt': ['felt hats'], 'felt hat': ['felt hats'], 'wool': ['felt hats'],
    'straw': ['straw hats'], 'straw hat': ['straw hats'],
    'cap': ['caps'], 'caps': ['caps'], 'ball cap': ['caps'], 'trucker': ['caps'],
    'bootcut': ['bootcut'], 'flare': ['bootcut'], 'wide leg': ['bootcut'], 'trouser': ['bootcut'],
    'slim': ['slim'], 'skinny': ['slim'], 'straight': ['slim'],
    'buckle': ['buckles'], 'buckles': ['buckles'],
    'western shirt': ['western shirts'], 'pearl snap': ['western shirts'], 'snap shirt': ['western shirts'],
    'dress': ['dresses'], 'dresses': ['dresses'],
    'wild rag': ['wild rags'], 'wild rags': ['wild rags'], 'bandana': ['wild rags'],
    'bag': ['bags'], 'bags': ['bags'], 'purse': ['bags'], 'crossbody': ['bags'], 'tote': ['bags']
  };

  // Generic type words appear in EVERY product name of that family ("Cowboy
  // Boots", "Felt Hat"), so matching them like a real keyword floods results.
  // They score low and only broaden — the specific style word decides.
  var GENERIC_TOKENS = {
    'boot': 1, 'boots': 1, 'hat': 1, 'hats': 1,
    'jean': 1, 'jeans': 1, 'denim': 1, 'belt': 1, 'belts': 1,
    'shirt': 1, 'shirts': 1, 'top': 1, 'tops': 1,
    'piece': 1, 'pieces': 1
  };

  // Generic type word → product family, so "studded jeans" stays in Jeans and
  // never leaks a studded belt.
  var TOKEN_FAMILY = {
    'boot': 'Boots', 'boots': 'Boots',
    'hat': 'Hats', 'hats': 'Hats',
    'jean': 'Jeans', 'jeans': 'Jeans', 'denim': 'Jeans',
    'belt': 'Belts', 'belts': 'Belts',
    'shirt': 'Apparel', 'shirts': 'Apparel'
  };

  // Family-exclusive STYLE categories → their one and only family. Naming a
  // "bootie"/"felt"/"bootcut" style implies the family, so we can scope results
  // even when the shopper never typed the generic type word ("suede booties" →
  // Boots only, so loose occasion hints can't leak a hat in).
  var CATEGORY_FAMILY = {
    'western boots': 'Boots', 'booties': 'Boots', 'work boots': 'Boots', 'exotic': 'Boots',
    'felt hats': 'Hats', 'straw hats': 'Hats', 'cowboy hats': 'Hats', 'caps': 'Hats',
    'bootcut': 'Jeans', 'slim': 'Jeans',
    'buckles': 'Belts', 'belts': 'Belts',
    'western shirts': 'Apparel', 'dresses': 'Apparel',
    'wild rags': 'Accessories', 'bags': 'Accessories'
  };

  // Color synonyms → color/material terms that actually appear in product copy,
  // so a shopper typing a loose color word still surfaces the right pieces.
  var COLOR_SYNONYMS = {
    'tan': ['tan', 'saddle', 'camel', 'cognac'], 'brown': ['brown', 'chocolate', 'nut brown'],
    'blue': ['indigo', 'denim', 'teal'], 'turquoise': ['turquoise', 'teal'],
    'silver': ['silverbelly', 'silver'], 'denim': ['indigo', 'wash']
  };

  // Every color/finish word a shopper might search on its own. Broader than
  // COLOR_SYNONYMS (which only maps the ones needing expansion) — used to detect
  // a pure "attribute-only" query ("black", "red") that should list ALL matching
  // pieces as a grid rather than assembling a thin styled "look".
  var COLOR_WORDS = {
    'black': 1, 'brown': 1, 'tan': 1, 'turquoise': 1, 'teal': 1, 'red': 1,
    'blue': 1, 'navy': 1, 'indigo': 1, 'pink': 1, 'blush': 1, 'silver': 1,
    'white': 1, 'cream': 1, 'ivory': 1, 'gray': 1, 'grey': 1, 'green': 1,
    'purple': 1, 'gold': 1, 'saddle': 1, 'cognac': 1, 'chocolate': 1, 'camel': 1
  };

  // ── Fuzzy Matching (Levenshtein) ──
  function levenshtein(a, b) {
    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;
    var matrix = [];
    for (var i = 0; i <= b.length; i++) matrix[i] = [i];
    for (var j = 0; j <= a.length; j++) matrix[0][j] = j;
    for (var i = 1; i <= b.length; i++) {
      for (var j = 1; j <= a.length; j++) {
        if (b.charAt(i - 1) === a.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }
    return matrix[b.length][a.length];
  }

  function fuzzyMatch(word, target, maxDist) {
    if (!maxDist) maxDist = word.length >= 6 ? 2 : (word.length >= 4 ? 1 : 0);
    return levenshtein(word, target) <= maxDist;
  }

  // ── Intent Parsing ──
  function parseIntent(query) {
    var q = query.toLowerCase().trim();
    var intent = {
      raw: query,
      tokens: [],
      categories: [],      // specific STYLE categories (authoritative, high weight)
      typeCategories: [],  // generic TYPE subcategories (broad hint, low weight)
      family: null,        // product family named by a generic type word
      type: null,          // product sub-type named explicitly (e.g. "Driver") — MORE authoritative than family
      keywords: [],
      priceMin: null,
      priceMax: null,
      gender: null,
      activity: null,
      isNaturalLanguage: false
    };

    // Detect natural language patterns
    if (/what (?:do i|should i|gear|stuff)|i need|looking for|help me find|show me|recommend/i.test(q)) {
      intent.isNaturalLanguage = true;
    }

    // Price extraction
    var priceUnder = q.match(/(?:under|below|less than|max|up to)\s*\$?(\d+)/i) || q.match(/\$?(\d+)\s+or\s+(?:under|less|below)/i);
    var priceOver = q.match(/(?:over|above|more than|min|at least)\s*\$?(\d+)/i);
    var priceBetween = q.match(/(?:between|\$)\s*(\d+)\s*(?:and|to|-)\s*\$?(\d+)/i);
    var priceCheap = /\b(?:cheap|budget|affordable|inexpensive)\b/i.test(q);
    var priceExpensive = /\b(?:premium|expensive|high.?end|luxury|top.?tier)\b/i.test(q);

    if (priceBetween) {
      intent.priceMin = parseFloat(priceBetween[1]);
      intent.priceMax = parseFloat(priceBetween[2]);
    } else {
      if (priceUnder) intent.priceMax = parseFloat(priceUnder[1]);
      if (priceOver) intent.priceMin = parseFloat(priceOver[1]);
    }
    if (priceCheap && !intent.priceMax) intent.priceMax = 50;
    if (priceExpensive && !intent.priceMin) intent.priceMin = 150;

    // Gender detection
    if (/\b(?:women'?s?|for (?:her|women)|female|ladies)\b/i.test(q)) intent.gender = 'Women';
    else if (/\b(?:men'?s?|for (?:him|men)|male|guys)\b/i.test(q)) intent.gender = 'Men';
    else if (/\b(?:kids?'?s?|children'?s?|youth|junior|boys?|girls?)\b/i.test(q)) intent.gender = 'Kids';

    // Logged-in default: the signed-in persona is female, so unless the query is
    // explicitly shopping for him (or kids), a signed-in shopper only sees
    // women's items. Signed-out search stays gender-neutral.
    if (!intent.gender && isSignedIn()) intent.gender = 'Women';

    // Activity/concept detection — check multi-word concepts first
    var conceptMap = activeConceptMap();
    var conceptKeys = Object.keys(conceptMap).sort(function (a, b) { return b.length - a.length; });
    for (var i = 0; i < conceptKeys.length; i++) {
      var conceptRe = new RegExp('\\b' + conceptKeys[i].replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b');
      if (conceptRe.test(q)) {
        intent.activity = conceptKeys[i];
        var concept = conceptMap[conceptKeys[i]];
        // Occasion/vibe associations are loose → treat as broad (low-weight) hints.
        intent.typeCategories = intent.typeCategories.concat(concept.categories || []);
        intent.keywords = intent.keywords.concat(concept.keywords || []);
        // A trend naming exactly one family (e.g. filterSpec.families:['Balls'])
        // is unambiguous — scope the lead family to it directly, the same way
        // this trend's own filterSpec resolves the trending-rail carousel, so
        // typed/chip search for a trend's own label can't diverge from it.
        if (concept.families && concept.families.length === 1 && !intent.family) {
          intent.family = concept.families[0];
        }
        break;
      }
    }

    // Tokenize and expand via synonyms
    var cleanQ = q
      .replace(/(?:under|below|less than|over|above|more than|between|up to|at least)\s*\$?\d+(\s*(and|to|-)\s*\$?\d+)?/gi, '')
      .replace(/\b(for|the|a|an|i|me|my|some|any|good|best|great|nice|show|find|need|looking|help|recommend|what|do|should|gear|stuff|things|items|products?)\b/gi, '')
      .replace(/[^a-z0-9\s'-]/g, '')
      .trim();

    intent.tokens = cleanQ.split(/\s+/).filter(function (t) { return t.length > 1; });

    // Expand tokens: specific STYLE words are authoritative (intent.categories);
    // generic TYPE words only broaden (intent.typeCategories, low weight).
    var styleSynonyms = activeStyleSynonyms();
    var typeSynonyms = activeTypeSynonyms();
    var tokenFamily = activeTokenFamily();
    var typeStyleSynonyms = activeTypeStyleSynonyms();
    var typeCategoryMap = activeTypeCategory();
    var categoryFamilyMap = activeCategoryFamily();
    intent.tokens.forEach(function (token) {
      // Two-word compounds (e.g. "multi strand") — style only.
      intent.tokens.forEach(function (token2) {
        if (token === token2) return;
        var compound = token + ' ' + token2;
        if (styleSynonyms[compound]) {
          intent.categories = intent.categories.concat(styleSynonyms[compound]);
        }
      });
      if (styleSynonyms[token]) {
        intent.categories = intent.categories.concat(styleSynonyms[token]);
      }
      if (typeSynonyms[token]) {
        intent.typeCategories = intent.typeCategories.concat(typeSynonyms[token]);
      }
      if (tokenFamily[token] && !intent.family) intent.family = tokenFamily[token];
      // Naming a sub-type ("drivers", "putters") is MORE authoritative than a
      // generic family word — it locks both intent.type and (via the type's
      // own category → family lookup) intent.family, so "next gen drivers"
      // can never resolve to an unrelated family through an accidental
      // name-substring match elsewhere.
      if (typeStyleSynonyms[token] && !intent.type) {
        intent.type = typeStyleSynonyms[token];
        var typCat = typeCategoryMap[String(intent.type).toLowerCase()];
        var typFam = typCat && categoryFamilyMap[typCat.toLowerCase()];
        if (typFam) intent.family = typFam;
      }
    });

    // Expand color tokens into the stone/color terms used in product copy so a
    // "blue" search still matches "teal glass" pieces (a whole search term, not
    // just a keyword, so it clears the relevance threshold).
    var colorSynonyms = activeColorSynonyms();
    var addedColorTokens = [];
    intent.tokens.forEach(function (token) {
      if (colorSynonyms[token]) {
        colorSynonyms[token].forEach(function (syn) {
          if (intent.tokens.indexOf(syn) === -1 && addedColorTokens.indexOf(syn) === -1) {
            addedColorTokens.push(syn);
          }
        });
      }
    });
    intent.tokens = intent.tokens.concat(addedColorTokens);

    // Deduplicate. A specific style category always wins over the same category
    // arriving as a broad type hint (avoid double-counting / dilution).
    intent.categories = Array.from(new Set(intent.categories));
    intent.typeCategories = Array.from(new Set(intent.typeCategories)).filter(function (c) {
      return intent.categories.indexOf(c) === -1;
    });

    // If a specific style names an unambiguous family, scope to it (unless a
    // generic type word already set a different family). Skip when the shopper
    // named styles across families (e.g. "studs and pendants") — leave unscoped.
    if (!intent.family) {
      var categoryFamily = activeCategoryFamily();
      var fams = [];
      intent.categories.forEach(function (c) {
        var f = categoryFamily[c];
        if (f && fams.indexOf(f) === -1) fams.push(f);
      });
      if (fams.length === 1) intent.family = fams[0];
    }
    intent.keywords = Array.from(new Set(intent.keywords));

    return intent;
  }

  // ── Relevance Scoring ──
  // Match a term as a whole WORD inside text (so "ring" doesn't match
  // "earring", "gold" doesn't match "goldstone", etc.). Falls back to a plain
  // substring test only for multi-word phrases.
  function wordIn(term, text) {
    if (!term || !text) return false;
    if (term.indexOf(' ') !== -1) return text.indexOf(term) !== -1;
    var re = new RegExp('(^|[^a-z0-9])' + term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '([^a-z0-9]|$)');
    return re.test(text);
  }

  function scoreProduct(product, intent) {
    var score = 0;
    var nameScore = 0, catScore = 0, descScore = 0, conceptScore = 0;

    var tokens = intent.tokens;
    var name = product._nameLower;
    var cat = product._categoryLower;
    var desc = product._descLower;
    var family = product._familyLower;
    var genericTokens = activeGenericTokens();

    // 1. Name matching (40% weight) — whole-word keyword in product name.
    // Generic type words ("earrings", "necklace") match every product of that
    // family, so they score low; specific words carry the signal.
    tokens.forEach(function (token) {
      var generic = !!genericTokens[token];
      if (wordIn(token, name)) {
        nameScore += generic ? 2 : 10;
      } else if (!generic) {
        // Fuzzy match on name words (typo tolerance)
        var nameWords = name.split(/[\s\-–—]+/);
        for (var i = 0; i < nameWords.length; i++) {
          if (fuzzyMatch(token, nameWords[i])) {
            nameScore += 5;
            break;
          }
        }
      }
    });

    // Bonus: full query phrase match in name
    if (tokens.length > 1 && name.indexOf(tokens.join(' ')) !== -1) {
      nameScore += 15;
    }

    // 2a. Specific STYLE category (authoritative, high weight)
    intent.categories.forEach(function (c) {
      var cl = c.toLowerCase();
      if (cat === cl || wordIn(cl, cat)) {
        catScore += 12;
      }
    });

    // 2a-2. Explicit sub-TYPE (e.g. "Driver") — MORE authoritative than
    // category, since it distinguishes SKUs that share the same family AND
    // category (narrow-taxonomy catalogs like golf clubs).
    if (intent.type) {
      var typ = product._typeLower;
      var wantType = intent.type.toLowerCase();
      if (typ === wantType || wordIn(wantType, typ)) {
        catScore += 16;
      }
    }

    // 2b. Generic TYPE subcategory (broad hint, low weight) — only nudges,
    // never enough on its own to out-rank a specific-style match.
    intent.typeCategories.forEach(function (c) {
      var cl = c.toLowerCase();
      if (cat === cl || wordIn(cl, cat)) catScore += 2;
    });

    // Direct category token match (whole word) — generic tokens score low.
    tokens.forEach(function (token) {
      if (cat === token || wordIn(token, cat)) catScore += genericTokens[token] ? 2 : 6;
      if (family === token || wordIn(token, family)) catScore += genericTokens[token] ? 1 : 3;
    });

    // 3. Description matching (20% weight) — whole word. Color/stone lives here
    // (e.g. "blue", "turquoise", "pearl"), so a description hit is meaningful.
    tokens.forEach(function (token) {
      if (wordIn(token, desc)) {
        descScore += genericTokens[token] ? 1 : 6;
      }
    });

    // Keyword matching from concept expansion
    intent.keywords.forEach(function (kw) {
      if (wordIn(kw, name)) descScore += 4;
      if (wordIn(kw, desc)) descScore += 2;
    });

    // 4. Concept/activity bonus (10% weight)
    if (intent.activity) {
      var activityConcept = activeConceptMap()[intent.activity];
      if (activityConcept) {
        activityConcept.categories.forEach(function (c) {
          if (cat === c.toLowerCase() || cat.indexOf(c.toLowerCase()) !== -1) {
            conceptScore += 5;
          }
        });
      }
    }

    // Weighted total
    score = (nameScore * 0.4) + (catScore * 0.3) + (descScore * 0.2) + (conceptScore * 0.1);

    // Gender filter bonus/penalty — keyed off the STORED gender field (product
    // `family` is a type like "Boots"/"Hats", never a gender). Boost the matching
    // gender, hard-penalize the opposite, and leave unisex/untagged items neutral
    // so "a gift for him" surfaces men's pieces without dropping accessories.
    var wantG = normGender(intent.gender); // '' for kids/neutral → no constraint
    if (wantG) {
      if (product._gender === wantG) {
        score *= 1.6;
      } else if (product._gender && product._gender !== wantG) {
        score *= 0.15; // Wrong gender — push well down the results.
      }
    }

    // Price filter
    if (intent.priceMin !== null && product._priceNum < intent.priceMin) score *= 0.1;
    if (intent.priceMax !== null && product._priceNum > intent.priceMax) score *= 0.1;

    return score;
  }

  // ── Variant collapse + look assembly (shop for LOOKS, not color walls) ──
  // Kendra Scott product names follow "<Style> ... in <Color>". Stripping the
  // trailing " in <Color>" collapses the same style in 11 colors to one key, so
  // search results never become a wall of the identical piece.
  function styleKey(p) {
    var n = (p.name || '').toLowerCase();
    return (n.replace(/\s+in\s+.+$/i, '').trim()) || n;
  }

  // Keep ONE representative per style (input is already score-sorted, so the
  // first occurrence is the best). Record the other colors on _variants so the
  // card can show a subtle "+N colors" chip.
  function collapseVariants(scored) {
    var byKey = {};
    var order = [];
    scored.forEach(function (s) {
      var p = s.product || s;
      var key = (p._familyLower || (p.family || '').toLowerCase()) + '|' + styleKey(p);
      if (!byKey[key]) {
        byKey[key] = { rep: s, colors: [] };
        order.push(key);
      } else {
        var m = (p.name || '').match(/\s+in\s+(.+)$/i);
        if (m) byKey[key].colors.push(m[1].trim());
      }
    });
    return order.map(function (key) {
      var entry = byKey[key];
      var p = entry.rep.product || entry.rep;
      if (entry.colors.length) {
        p._variants = entry.colors.length;
        p._variantColors = entry.colors;
      } else {
        p._variants = 0;
      }
      return entry.rep;
    });
  }

  // Which families complete a look, given the family the shopper is leading with.
  var LOOK_COMPLEMENTS = {
    'Boots':       ['Jeans', 'Hats', 'Belts'],
    'Hats':        ['Boots', 'Jeans', 'Apparel'],
    'Jeans':       ['Boots', 'Belts', 'Apparel'],
    'Apparel':     ['Jeans', 'Boots', 'Accessories'],
    'Belts':       ['Jeans', 'Boots', 'Apparel'],
    'Accessories': ['Apparel', 'Hats', 'Boots']
  };
  var LOOK_FAMILIES = ['Boots', 'Hats', 'Jeans', 'Apparel', 'Belts', 'Accessories'];

  // ── Main Search Function ──
  function search(query) {
    if (!_products || !query || !query.trim()) {
      return { results: [], look: {}, leadFamily: null, families: [], categories: {}, suggestions: [], intent: null, total: 0 };
    }

    var intent = parseIntent(query);
    // Demo-query override: an exact (case-insensitive) hit against the
    // generator-authored, catalog-validated demoQueries list is guaranteed to
    // resolve correctly — skip generic scoring's inference for it and feed its
    // family/type straight into the same typeScoped/leadFamily/topN machinery,
    // so a rehearsed demo script search never depends on free-text parsing.
    var qNorm = query.trim().toLowerCase();
    activeDemoQueries().some(function (dq) {
      if (!dq || String(dq.query || '').trim().toLowerCase() !== qNorm) return false;
      if (dq.family) intent.family = dq.family;
      if (dq.type) intent.type = dq.type;
      return true;
    });
    // Normalized explicit gender intent ('men'|'women'|''); drives the hard
    // exclusions below. '' = neutral/kids → never gender-filters.
    var wantG = normGender(intent.gender);

    // Score all products. Only surface products with a real image — a card
    // with no/wrong photo should never appear in search results.
    var scored = _products.map(function (p) {
      return { product: p, score: scoreProduct(p, intent) };
    }).filter(function (s) {
      return s.score >= 1.0 && !!s.product.image; // relevant AND has a real photo
    }).filter(function (s) {
      // Hard price cap: never show over-budget products regardless of score
      if (intent.priceMax !== null && s.product._priceNum > intent.priceMax) return false;
      if (intent.priceMin !== null && s.product._priceNum < intent.priceMin) return false;
      // Hard gender exclusion: when the shopper explicitly asks for men's/women's
      // ("a gift for him", "for her"), drop the opposite gender entirely so it
      // can't fill complement rows. Unisex/untagged items (hats, jewelry, belts)
      // stay eligible.
      if (wantG === 'men' && s.product._gender === 'women') return false;
      if (wantG === 'women' && s.product._gender === 'men') return false;
      return true;
    }).sort(function (a, b) {
      return b.score - a.score;
    });

    // ── Assemble a LOOK, not a color wall ──
    // scored is the full, relevance-sorted set across all families. We keep it
    // intact (rather than narrowing to one family) so we can pair the lead piece
    // with complementary earrings / bracelets to complete the look.
    var scoredAll = scored;

    // Lead family = the piece type the shopper named ("necklace" → Necklaces),
    // else the family of the single strongest result.
    var lookFamilies = activeLookFamilies();
    function famName(f) {
      if (!f) return null;
      f = f.charAt(0).toUpperCase() + f.slice(1).toLowerCase();
      return lookFamilies.indexOf(f) !== -1 ? f : null;
    }
    // Belt-and-suspenders guard (beyond intent.family/type above): when neither
    // resolved, don't let the top RAW score pick leadFamily if that score came
    // solely from a generic-token substring hit — e.g. a shoe named "...NEXT%"
    // outscoring every driver on "next gen drivers" purely by accident. Prefer
    // the top-scored product that has at least one specific (non-generic) name/
    // category/type match; only fall through to raw top score if none do.
    function hasSpecificSignal(product) {
      var genericTokens = activeGenericTokens();
      var name = product._nameLower, cat = product._categoryLower, family = product._familyLower;
      var specific = false;
      intent.tokens.forEach(function (token) {
        if (genericTokens[token]) return;
        if (wordIn(token, name) || wordIn(token, cat) || wordIn(token, family)) specific = true;
      });
      intent.categories.forEach(function (c) {
        var cl = c.toLowerCase();
        if (cat === cl || wordIn(cl, cat)) specific = true;
      });
      if (intent.type) {
        var wantType = intent.type.toLowerCase();
        if (product._typeLower === wantType || wordIn(wantType, product._typeLower || '')) specific = true;
      }
      return specific;
    }
    var specificLead = scoredAll.filter(function (s) { return hasSpecificSignal(s.product); })[0];
    var leadFamily = famName(intent.family) ||
      (specificLead && famName(specificLead.product.family)) ||
      (scoredAll[0] && famName(scoredAll[0].product.family)) || lookFamilies[0] ||
      (hasGeneratedBrand() && _products[0] && _products[0].family) || 'Boots';

    // For a SPECIFIC style query ("hoops", "stackable"), keep the lead pool tight
    // to genuinely on-target items so search NARROWS rather than pads. Applied to
    // the lead family only; complements stay looser to complete the look.
    function targetedList(list) {
      if (!intent.categories.length) return list;
      var genericTokens = activeGenericTokens();
      var specificTokens = intent.tokens.filter(function (t) { return !genericTokens[t]; });
      var styleCats = intent.categories.map(function (c) { return c.toLowerCase(); });
      var t = list.filter(function (s) {
        var pc = (s.product.category || '').toLowerCase();
        if (styleCats.indexOf(pc) !== -1) return true;
        var hay = (s.product._nameLower || '') + ' ' + (s.product._descLower || '');
        return specificTokens.some(function (tok) { return wordIn(tok, hay); });
      });
      return t.length ? t : list;
    }

    // Narrow to the explicitly-named sub-TYPE within a family ("drivers" among
    // Clubs) so a narrow-taxonomy catalog (family === category for every SKU)
    // doesn't pad a type-specific query with unrelated sub-types. Only applied
    // to the lead family's own pool; falls back to the untyped list if the
    // narrowed set is empty (never disqualify a real match over this).
    function targetedByType(list) {
      if (!intent.type) return list;
      var wantType = intent.type.toLowerCase();
      var t = list.filter(function (s) {
        var typ = s.product._typeLower || '';
        return typ === wantType || wordIn(wantType, typ);
      });
      return t.length ? t : list;
    }

    // Collapsed, best-first candidates for one family.
    function familyPool(fam, applyTarget) {
      var list = scoredAll.filter(function (s) { return (s.product.family || '') === fam; });
      if (applyTarget) list = targetedByType(targetedList(list));
      return collapseVariants(list);
    }

    // Take up to n distinct styles for a family. When `pad` is true and a family
    // is thin on relevant matches, top up from the catalog so the row still
    // floors at n (2–3+ options) instead of looking broken with 0-2 results.
    // Real relevance-sorted matches always come first; padding only fills
    // remaining slots. The lead family also passes pad=true (see call site)
    // for the same reason.
    function topN(collapsedList, fam, n, pad, wantedType) {
      var picks = collapsedList.slice(0, n).map(function (s) { return s.product; });
      if (pad !== false && picks.length < n) {
        var have = {};
        picks.forEach(function (p) { have[p.name] = true; });
        // Rank padding candidates by residual relevance to THIS query (below the
        // 1.0 relevance cutoff, but still distinguishing candidates) rather than
        // fixed catalog order — otherwise two different weak queries that land
        // on the same lead family pad with the identical catalog-order list.
        var extraPool = _products
          .filter(function (p) {
            if ((p.family || '') !== fam || !p.image || have[p.name]) return false;
            // Respect an explicit gender intent even when padding from catalog,
            // so a men's query never tops up a row with women's items.
            if (wantG === 'men' && p._gender === 'women') return false;
            if (wantG === 'women' && p._gender === 'men') return false;
            return true;
          })
          .map(function (p) { return { product: p, score: scoreProduct(p, intent) }; })
          .sort(function (a, b) { return b.score - a.score; });
        // When a sub-type was explicitly named, pad ONLY from matching-type
        // candidates — never relax to another type in the same family, even
        // if that means the row comes back shorter than `n`. A demo rep
        // needs every visible result to be defensible: a search for
        // "drivers" showing 5 correct results beats 8 results padded with a
        // putter to look fuller.
        if (wantedType) {
          var wt = wantedType.toLowerCase();
          extraPool = extraPool.filter(function (s) { return (s.product._typeLower || '') === wt; });
        }
        var extra = collapseVariants(extraPool);
        for (var i = 0; i < extra.length && picks.length < n; i++) picks.push(extra[i].product);
      }
      return picks;
    }

    // A pure ATTRIBUTE query — one or more color/finish words ("black",
    // "turquoise") with NO style, type, or family named — should return a full
    // GRID of every matching piece across families (a proper filtered listing),
    // not a thin 3-per-row "look". Without this, a signed-in shopper's color
    // search collapses to ~9 items (lead family + 2 short complement rows) even
    // when 15+ match. A color's own CONCEPT_MAP hints (e.g. turquoise → jewelry)
    // may populate typeCategories, so we DON'T disqualify on those — we require
    // that no style category or family was named and that every meaningful token
    // is itself a color word (a bare "black", "turquoise", "red brown").
    // A token is "color-ish" if it's a color word OR a synonym parseIntent
    // auto-added from one (e.g. brown → "chocolate", "nut brown"). Those synonym
    // tokens must not disqualify the attribute-only path.
    function colorish(t) {
      var colorWords = activeColorWords();
      var colorSynonyms = activeColorSynonyms();
      if (colorWords[t]) return true;
      for (var base in colorSynonyms) {
        if (colorSynonyms[base].indexOf(t) !== -1) return true;
      }
      return false;
    }
    var colorTokens = intent.tokens.filter(colorish);
    var nonColorTokens = intent.tokens.filter(function (t) { return !colorish(t); });
    var attributeOnly = colorTokens.length > 0 && nonColorTokens.length === 0 &&
      !intent.categories.length && !intent.family;

    // A query that NAMES a product type/style ("earrings", "hoops", "necklace")
    // sets intent.family — the shopper asked for a specific thing, so we scope to
    // just that family and show the rest as "frequently bought with". A vibe /
    // occasion query ("gift for her", "date night") leaves family null → we build
    // the full varied look across families. An attribute-only query behaves like
    // a scoped grid so it lists ALL matches rather than assembling a look.
    var typeScoped = !!intent.family || !!intent.type || attributeOnly;

    var look = {};
    var frequentlyBoughtWith = [];
    // An attribute-only query ("black") lists EVERY matching piece across all
    // families as one grid — not scoped to a single family and not padded — so
    // the shopper sees the full colorway inventory (gender-filtered upstream).
    if (attributeOnly) {
      // Only keep pieces that ACTUALLY carry the color in their name/description
      // — a color's CONCEPT_MAP hints (turquoise → jewelry) can score off-color
      // items above threshold, and an attribute grid must be exact.
      var colorMatch = function (p) {
        var hay = (p._nameLower || '') + ' ' + (p._descLower || '');
        return colorTokens.some(function (t) { return hay.indexOf(t) !== -1; });
      };
      look[leadFamily] = collapseVariants(scoredAll.filter(function (s) {
        return colorMatch(s.product);
      })).map(function (s) { return s.product; });
    } else {
      // Scoped queries return a full grid of the requested type; look queries keep
      // the tight "styled 3 ways" lead so complements have room. pad=true so a
      // real-but-thin match still floors at n (a demo should never look broken
      // with 0-2 results) — real relevance-sorted matches always come first;
      // padding only fills remaining slots from the same family.
      look[leadFamily] = topN(familyPool(leadFamily, true), leadFamily, typeScoped ? 6 : 3, true, intent.type);
    }

    // Complete the look with the most natural pairings — but ONLY for vibe /
    // occasion queries ("festival outfit", "gift for her") where the shopper
    // hasn't named a specific type. When the query NAMES a product type
    // ("cowboy boots for festival"), stay strictly on that type: no pants/hats
    // padding in as if they were results.
    var complements = typeScoped ? [] : (activeLookComplements()[leadFamily] || []).slice(0, 2);
    complements.forEach(function (fam) {
      var picks = topN(familyPool(fam, false), fam, 3);
      if (picks.length) look[fam] = picks;
    });

    var families = [leadFamily].concat(complements).filter(function (f) {
      return look[f] && look[f].length;
    });

    // Flat results (back-compat): the look flattened, lead family first, de-duped.
    var seenName = {};
    var topResults = [];
    families.forEach(function (fam) {
      look[fam].forEach(function (p) {
        if (!seenName[p.name]) { seenName[p.name] = true; topResults.push(p); }
      });
    });

    // Group by category (back-compat for the search-overlay category chips).
    var categories = {};
    topResults.forEach(function (p) {
      var cat = p.category || 'Other';
      if (!categories[cat]) categories[cat] = [];
      categories[cat].push(p);
    });

    // Generate suggestions if few results
    var suggestions = [];
    if (topResults.length < 3) {
      suggestions = generateSuggestions(intent);
    }

    return {
      results: topResults,
      look: look,
      leadFamily: leadFamily,
      families: families,
      typeScoped: typeScoped,
      frequentlyBoughtWith: frequentlyBoughtWith,
      categories: categories,
      suggestions: suggestions,
      intent: intent,
      total: topResults.length
    };
  }

  // ── Autocomplete Suggestions ──
  function suggest(partial) {
    if (!_products || !partial || partial.length < 2) return [];

    var q = partial.toLowerCase().trim();
    var suggestions = [];
    var seen = {};

    // 1. Category matches
    var allCategories = {};
    _products.forEach(function (p) {
      var cat = p.category || '';
      if (!allCategories[cat]) allCategories[cat] = 0;
      allCategories[cat]++;
    });

    Object.keys(allCategories).forEach(function (cat) {
      if (cat.toLowerCase().indexOf(q) !== -1) {
        suggestions.push({
          type: 'category',
          text: cat,
          count: allCategories[cat],
          icon: getCategoryIcon(cat)
        });
      }
    });

    // 2. Concept/activity matches
    Object.keys(activeConceptMap()).forEach(function (concept) {
      if (concept.indexOf(q) !== -1 && !seen[concept]) {
        seen[concept] = true;
        suggestions.push({
          type: 'activity',
          text: concept.charAt(0).toUpperCase() + concept.slice(1) + ' essentials',
          icon: getActivityIcon(concept)
        });
      }
    });

    // 3. Product name matches (top 5)
    var productMatches = _products.filter(function (p) {
      return p._nameLower.indexOf(q) !== -1;
    }).slice(0, 5);

    productMatches.forEach(function (p) {
      suggestions.push({
        type: 'product',
        text: p.name,
        category: p.category,
        price: p.price,
        image: p.image
      });
    });

    return suggestions.slice(0, 10);
  }

  // ── Suggestion Generation for Poor Results ──
  function generateSuggestions(intent) {
    var suggestions = [];
    var tokens = intent.tokens;

    // Fuzzy-match tokens against category names
    var allCategories = [];
    _products.forEach(function (p) {
      var cat = p.category || '';
      if (allCategories.indexOf(cat) === -1) allCategories.push(cat);
    });

    tokens.forEach(function (token) {
      allCategories.forEach(function (cat) {
        var catWords = cat.toLowerCase().split(/\s+/);
        catWords.forEach(function (w) {
          if (fuzzyMatch(token, w, 2)) {
            suggestions.push('Browse ' + cat);
          }
        });
      });
    });

    // Activity suggestions
    Object.keys(activeConceptMap()).forEach(function (concept) {
      tokens.forEach(function (token) {
        if (concept.indexOf(token) !== -1 || fuzzyMatch(token, concept.split(' ')[0], 2)) {
          suggestions.push(concept.charAt(0).toUpperCase() + concept.slice(1) + ' gear');
        }
      });
    });

    return Array.from(new Set(suggestions)).slice(0, 5);
  }

  // ── Helper: Category Icons (shared with views.js) ──
  var _catIcons = {
    'work boots': '🥾', 'booties': '👢', 'western boots': '👢', 'boots': '👢',
    'felt hats': '🤠', 'straw hats': '👒', 'cowboy hats': '🤠', 'caps': '🧢', 'hats': '🤠',
    'bootcut': '👖', 'slim': '👖', 'jeans': '👖',
    'buckles': '🥇', 'belts': '🔗',
    'western shirts': '👔', 'dresses': '👗', 'tops': '👚', 'apparel': '👚',
    'wild rags': '🧣', 'bags': '👜', 'jewelry': '💠', 'accessories': '👜',
    'fringe': '🌾', 'turquoise': '💠', 'concho': '💠'
  };

  function getCategoryIcon(cat) {
    var key = (cat || '').toLowerCase();
    for (var k in _catIcons) {
      if (key.indexOf(k) !== -1) return _catIcons[k];
    }
    return hasGeneratedBrand() ? '🛍️' : '🤠';
  }

  var _activityIcons = {
    'gift': '🎁', 'gift for her': '💝',
    'wedding': '💍', 'bridal': '👰', 'everyday': '✨', 'date night': '💎',
    'work': '💼', 'layering': '📿', 'birthday': '🎂', 'anniversary': '💝',
    'graduation': '🎓', 'holiday': '🎄', 'new arrivals': '🌟'
  };

  function getActivityIcon(activity) {
    return _activityIcons[activity] || '🔍';
  }

  // ── Contextual example searches ──
  // Derived from BrandConfig.trends (already brand-specific editorial topics)
  // so this surface travels with whatever brand is loaded, instead of a fixed
  // Western-wear example list. Falls back to nav categories if trends are
  // somehow empty (the behavioral harness normally guarantees they aren't).
  // `id` is included so a click can look up the SAME trend object (and its
  // already-compiled, catalog-validated `filter` function baked in by
  // toBrandConfigJs) in window.BrandConfig.trends, instead of re-parsing
  // `text` as a free-text query — see search-overlay.js's trending-chip
  // click handler. Nav-category fallback entries have no `id`: they're a
  // literal category name, so the general search engine resolves them fine.
  function getTrendingSearches() {
    var bc = window.BrandConfig || {};
    var trends = Array.isArray(bc.trends) ? bc.trends : [];
    var fromTrends = trends.slice(0, 3)
      .map(function (t) { return { text: String((t && t.label) || ''), icon: String((t && t.icon) || '🔍'), id: (t && t.id) || '' }; })
      .filter(function (t) { return t.text; });
    if (fromTrends.length) return fromTrends;
    var cats = Array.isArray(bc.navCategories) ? bc.navCategories : [];
    return cats.slice(0, 3).map(function (c) { return { text: 'New in ' + c, icon: '🔍' }; });
  }

  // ── Public API ──
  window.SiteSearch = {
    search: search,
    suggest: suggest,
    parseIntent: parseIntent,
    // F1: read a product's STORED gender field, normalized to the canonical
    // engine vocabulary ('men' | 'women' | '' for unisex/neutral). Never infers
    // from the name. Accepts a product object.
    productGender: function (p) { return normGender(p && p.gender); },
    getTrendingSearches: getTrendingSearches,
    getCategoryIcon: getCategoryIcon,
    // Derived (brand-agnostic) family list, shared with views.js so
    // TREND_LOOK_ORDER/buildLooks/categoryPicks don't duplicate this logic.
    getLookFamilies: activeLookFamilies,
    // Derived (brand-agnostic) family-adjacency map, shared with
    // web-curation-component.js's Complete-the-Look bundle picker.
    getLookComplements: activeLookComplements,
    // Derived (brand-agnostic) category→family map (lowercased category ->
    // real-cased family), shared with router/web-curation-component.js so a
    // category-page navigation (which only knows the category label) can
    // still resolve the coarser family for chat-intent seeding.
    getCategoryFamily: activeCategoryFamily,
    loadProducts: loadProducts,
    isReady: function () { return !!_products; }
  };

  // Pre-load products
  loadProducts();

})();
