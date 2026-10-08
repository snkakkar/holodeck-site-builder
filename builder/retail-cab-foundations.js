// ════════════════════════════════════════════════════════════════
//  storefront-foundations.js — window.HOLO_RETAILCABFOUND
//
//  Turns the builder's wizard state into (1) the Gemini text prompt that
//  produces the whole storefront (brand + persona + 40 tagged SKUs +
//  chip→filter table) and (2) the product-photo generation pass.
//
//  Design invariants baked into the prompt (the sharpest edges):
//   • PRE-TAGGED SKUs — every SKU carries gender|colors[]|priceTier|
//     category as real fields (F1). The engine looks these up; it never
//     infers from prose.
//   • genderLean weighting (~6:4:2) BUT ≥2 SKUs are cross-gender
//     ("unisex") so no chip/color/gender path is ever empty.
//   • persona.interests MUST be provable in the catalog (each interest
//     appears as a SKU color, category, or a word in a name/description),
//     or the "picked for you" grid comes up empty. This is the most
//     likely SILENT failure, so the prompt is emphatic about it.
//   • chipFilterTable is DECLARATIVE — each chip is one fixed filter.
//   • Nothing seeds from Kendra Scott / NTO. Everything derives from the
//     user's inputs + scraped context.
// ════════════════════════════════════════════════════════════════
(function () {
  "use strict";

  // Flatten the HOST builder's shared project state into the compact
  // context shape this module's prompt/schema were written against.
  // Reuses the same story-context source (HOLO_RULES.stateToCtx) and
  // persona slot as the Clienteling/Cimulate generator (app-foundations.js
  // ctxFrom) — this app draws from the SAME project inputs, not a
  // separate wizard. `simple` (optional) carries the Simple-mode wizard's
  // merged General + retailCab answers — { searchTerms:[…], chatChips:[…],
  // genderLean } — same shape/convention as promptForClienteling/Cimulate's
  // `simple` param in app-foundations.js. Absent for the full builder, so
  // these stay at their prior blank/unisex defaults (Gemini fills them; see
  // promptForStorefront's optionalBits). agentName/trends are still always
  // left blank — no wizard question feeds them yet.
  function ctxFrom(state, simple) {
    state = state || {};
    simple = simple || {};
    const rules = window.HOLO_RULES;
    const c = (rules && rules.stateToCtx) ? rules.stateToCtx(state) : {};
    const persona = (state.personas && state.personas[0]) || {};
    const b = state.brand || {};
    const searchTerms = Array.isArray(simple.searchTerms) ? simple.searchTerms.filter(Boolean).join(", ") : "";
    const agentChips = Array.isArray(simple.chatChips) ? simple.chatChips.filter(Boolean).join(", ") : "";
    // Facts the script states plainly (sanitized at extraction). Every field is
    // empty when the script names nothing, so the prompt stays unchanged.
    const sf = (state.storyFoundations && state.storyFoundations.scriptFacts) || {};
    const arr = function (v) { return Array.isArray(v) ? v : []; };
    return {
      requiredProducts: arr(sf.namedProducts).filter(function (p) { return p && p.name; }),
      scriptOffers: arr(sf.offers).filter(function (o) { return o && o.label; }),
      scriptLoyalty: (sf.loyalty && (sf.loyalty.threshold || sf.loyalty.rewardLabel)) ? sf.loyalty : null,
      pickupStore: (sf.pickupStore || "").trim(),
      scriptQuestions: arr(sf.shopperQuestions).filter(function (x) { return x && x.q; }),
      scriptSearches: arr(sf.shopperSearches).filter(Boolean),
      customerName: (c.customerName || "").trim(),
      industry: (c.industry || "Retail").trim(),
      website: (c.website || "").trim(),
      // Optional override. The untouched default (#b22234) is not a user
      // choice, so treat it as unset and let the scraped brand color win.
      brandColor: ((b.primaryColor || "").trim().toLowerCase() === "#b22234") ? "" : (b.primaryColor || "").trim(),
      personaName: (persona.name || "").trim(),
      personaDetails: [persona.role, persona.quote].filter(Boolean).join(" — "),
      genderLean: simple.genderLean || "unisex",
      searchTerms: searchTerms,
      trends: "",
      agentName: "",          // blank → Gemini names it
      agentChips: agentChips,
    };
  }

  // Response schema constrains the JSON output (server passes it through
  // as responseSchema). Keeps Gemini from drifting off-shape.
  //
  // ⚠ gender is men|women|unisex to match the foundation's normGender()
  // (search-engine.js) — NOT male|female. `family` is a required F1 field
  // (∈ persona.interests.families) that the foundation's persona.js BOX_RULES
  // and the trend rail both key on.
  function storefrontSchema() {
    const sku = {
      type: "object",
      properties: {
        id: { type: "string" },
        name: { type: "string" },
        price: { type: "number" },
        priceTier: { type: "string", enum: ["budget", "mid", "premium"] },
        gender: { type: "string", enum: ["men", "women", "unisex"] },
        colors: { type: "array", items: { type: "string" } },
        family: { type: "string" },
        category: { type: "string" },
        // Finer sub-style axis than category (family ⊇ category ⊇ type),
        // e.g. family "Clubs" → type "Driver"/"Putter"/"Wedge". Optional for
        // back-compat; buildStorefrontConfig() falls back to `family` when
        // absent. Lets search distinguish "drivers" from "putters" even when
        // category collapses to the same value as family (narrow-taxonomy
        // brands like golf/tools/electronics).
        type: { type: "string" },
        description: { type: "string" },
        // ── Cosmetic fields (display-only; NEVER used by selectProducts) ──
        // rating/reviewCount are NOT generated — Gemini spends real output-token
        // budget on every required field across up to 60 SKUs, and these two are
        // free-text-adjacent numeric filler with no bearing on selection. They're
        // computed deterministically in storefront-config-generator.js instead
        // (same 3.5–5.0 / 5–500 ranges), which also cuts truncation/retry risk.
        originalPrice: { type: "number" }, // > price when on sale; omit/0 otherwise
        badge: { type: "string", enum: ["new", "bestseller"] }, // optional; omit for no badge
        sizes: { type: "array", items: { type: "string" } }, // may be empty (one-size)
      },
      required: ["id", "name", "price", "priceTier", "gender", "colors", "family", "category", "description"],
    };
    const chip = {
      type: "object",
      properties: {
        id: { type: "string" },
        label: { type: "string" },
        loggedIn: { type: "boolean" },
        filter: {
          type: "object",
          properties: {
            gender: { type: "string" },
            family: { type: "string" },
            category: { type: "string" },
            priceTier: { type: "string" },
            colors: { type: "array", items: { type: "string" } },
          },
        },
      },
      required: ["id", "label", "loggedIn", "filter"],
    };
    // Declarative, serializable trend filter (compiled to a predicate by the
    // foundation's ?holo IIFE / the exporter). At least one field non-empty.
    const trendFilter = {
      type: "object",
      properties: {
        families: { type: "array", items: { type: "string" } },
        categories: { type: "array", items: { type: "string" } },
        keywords: { type: "array", items: { type: "string" } },
        priceTier: { type: "string", enum: ["budget", "mid", "premium"] },
      },
    };
    const trend = {
      type: "object",
      properties: {
        id: { type: "string" },
        label: { type: "string" },
        tag: { type: "string" },
        icon: { type: "string" },
        filterSpec: trendFilter,
      },
      required: ["id", "label", "filterSpec"],
    };
    const styledPost = {
      type: "object",
      properties: {
        id: { type: "string" },
        trendId: { type: "string" },
        handle: { type: "string" },
        caption: { type: "string" },
        likes: { type: "integer" },
        productNames: { type: "array", items: { type: "string" } },
      },
      required: ["trendId", "handle", "caption", "productNames"],
    };
    // Sparse intent patch a chip click bakes in directly — sets ONLY the
    // field(s) that chip decides (a recipient chip sets `recipient` only,
    // etc.) so the chat widget never has to re-derive meaning from label
    // text at runtime. Every field is optional; fields must be provable
    // against the real generated catalog (validated in the config-generator).
    const chipIntent = {
      type: "object",
      properties: {
        recipient: { type: "string", enum: ["self", "gift", "browsing"] },
        occasion: { type: "string" },
        family: { type: "string" },
        type: { type: "string" },
        color: { type: "string" },
      },
    };
    // A quick-reply chip: label is what's rendered; intent is the baked
    // patch applied on click. `intent` is OPTIONAL so legacy bare-string
    // chips (older generations) still validate — the config-generator
    // upgrades a missing intent to `{}`, which falls back to the runtime's
    // free-text parser for that one chip only.
    const funnelChip = {
      type: "object",
      properties: {
        label: { type: "string" },
        intent: chipIntent,
      },
      required: ["label"],
    };
    const colorPref = {
      type: "object",
      properties: { name: { type: "string" }, hex: { type: "string" } },
      required: ["name", "hex"],
    };
    const offer = {
      type: "object",
      properties: {
        id: { type: "string" },
        code: { type: "string" },
        label: { type: "string" },
        short: { type: "string" },
        long: { type: "string" },
        emoji: { type: "string" },
        type: { type: "string", enum: ["tiered-unit", "family-percent", "free-shipping"] },
        discountRates: { type: "array", items: { type: "number" }, description: "Fractions between 0 and 1, e.g. 0.2 for 20% off — NOT whole-number percentages." },
        percent: { type: "number", description: "Fraction between 0 and 1, e.g. 0.15 for 15% off — NOT a whole-number percentage." },
        family: { type: "string" },
        eligibleFirstName: { type: "string" },
        conflictsWith: { type: "array", items: { type: "string" } },
      },
      required: ["id", "code", "label", "short", "type"],
    };
    const persona = {
      type: "object",
      properties: {
        name: { type: "string" },
        firstName: { type: "string" },
        gender: { type: "string", enum: ["men", "women", "unisex"] },
        interests: {
          type: "object",
          properties: {
            families: { type: "array", items: { type: "string" } },
            categories: { type: "array", items: { type: "string" } },
            stones: { type: "array", items: { type: "string" } },
          },
          required: ["families", "categories", "stones"],
        },
        profile: {
          type: "object",
          properties: {
            stylePersona: { type: "string" },
            loyaltyTier: { type: "string" },
            birthday: { type: "string" },
            location: { type: "string" },
            memberSince: { type: "string" },
            favoriteCategories: { type: "array", items: { type: "string" } },
            colorPreferences: { type: "array", items: colorPref },
            signaturePreference: { type: "string" },
            preferredChannel: { type: "string" },
            lifetimeValue: { type: "string" },
          },
          required: ["stylePersona", "loyaltyTier", "birthday", "location", "favoriteCategories"],
        },
      },
      required: ["name", "firstName", "gender", "interests", "profile"],
    };
    return {
      type: "object",
      properties: {
        brand: {
          type: "object",
          properties: {
            name: { type: "string" },
            agentName: { type: "string" },
            agentRole: { type: "string" },
            signatureFeatureLabel: { type: "string" },
            tagline: { type: "string" },
            socialTag: { type: "string" },       // social hashtag, e.g. "#YourBrand"
            helpAgentLabel: { type: "string" },  // Help Agent speaker label, e.g. "YourBrand Help"
            pageTitleSuffix: { type: "string" }, // browser tab tagline after the brand name
          },
          required: ["name", "agentName"],
        },
        copy: {
          type: "object",
          properties: {
            heroEyebrow: { type: "string" },
            heroTitle: { type: "string" },
            heroSub: { type: "string" },
            heroCta: { type: "string" },
            trendingTitle: { type: "string" },
            agentIntro: { type: "string" },
            ourStoryLabel: { type: "string" },    // lifestyle panel eyebrow, e.g. "OUR STORY"
            ourStoryHeading: { type: "string" },  // lifestyle panel headline
            ourStoryBody: { type: "string" },     // 1–2 sentence brand story
            ourStoryCta: { type: "string" },      // lifestyle panel CTA label
            lookSubtitle: { type: "string" },     // "Shop the Look" section subtitle
            recsSubtitle: { type: "string" },     // recommendations rail subtitle
          },
        },
        customerStory: { type: "string" },
        persona: persona,
        offers: { type: "array", items: offer, minItems: 1 },
        navCategories: { type: "array", items: { type: "string" } },
        // NOTE: no minItems/maxItems here. Gemini's responseSchema rejects a
        // large array minItems (≥ ~a few dozen) with "invalid argument", which
        // would fail EVERY generation. The exact-40 target lives in the prompt
        // (REQUIREMENTS #1); buildStorefrontConfig slices to 40 and the
        // behavioral harness enforces the exact count.
        catalog: { type: "array", items: sku },
        trends: { type: "array", items: trend, minItems: 3, maxItems: 4 },
        styledPosts: { type: "array", items: styledPost },
        featuredId: { type: "string" },
        chipFilterTable: { type: "array", items: chip },
        // Which OTHER catalog families complete the look for a given family
        // (e.g. Boots → [Belts, Hats]), used by the "Complete the Look"
        // bundle picker and search's look-pairing. Small (≤6 entries) so the
        // added token cost is negligible; falls back to a round-robin over
        // real catalog families if omitted or malformed.
        lookComplements: {
          type: "array",
          items: {
            type: "object",
            properties: {
              family: { type: "string" },
              complements: { type: "array", items: { type: "string" } },
            },
            required: ["family", "complements"],
          },
          maxItems: 6,
        },
        // AI chat widget chips/copy that have no catalog-derivable substitute
        // (who's-this-for chips, care FAQ) — everything else the chat widget
        // needs (color/occasion/budget chips) is derived client-side from the
        // catalog itself. Optional: the widget falls back to generic copy
        // when this is missing or malformed.
        chatChips: {
          type: "object",
          properties: {
            who: { type: "array", items: funnelChip },
            careFaq: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  topic: { type: "string" },
                  question: { type: "string" },
                  answer: { type: "string" },
                },
                required: ["topic", "question", "answer"],
              },
              maxItems: 4,
            },
          },
        },
        // Structure of the AI chat widget's guided funnel (which questions it
        // asks, in what order, with what chip vocabulary) for THIS brand.
        // Optional: the widget falls back to a safe legacy tree when this is
        // missing or malformed (see cocoFunnelStages() client-side).
        chatFunnel: {
          type: "object",
          properties: {
            colorRelevant: { type: "boolean" },
            attributeLabel: { type: "string" },
            stages: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  key: { type: "string", enum: ["recipient", "occasion", "attribute"] },
                  question: { type: "string" },
                  chips: { type: "array", items: funnelChip },
                },
                required: ["key", "question", "chips"],
              },
              maxItems: 3,
            },
          },
        },
        // Small set of guaranteed-correct free-text search-bar queries for a
        // rehearsed demo script — bypasses generic scoring entirely at
        // runtime. Optional; unresolvable entries are dropped by the
        // config-generator (auto-repair, never blocks Generate).
        demoQueries: {
          type: "array",
          items: {
            type: "object",
            properties: {
              query: { type: "string" },
              family: { type: "string" },
              type: { type: "string" },
            },
            required: ["query"],
          },
          maxItems: 8,
        },
      },
      required: ["brand", "persona", "offers", "navCategories", "catalog", "trends", "chipFilterTable"],
    };
  }

  // The big text prompt. `scraped` is the /api/scrape/site result (may be
  // an empty/failed scrape — that's fine, Gemini fills everything).
  function promptForStorefront(cx, scraped) {
    scraped = scraped || {};
    const leanNote = {
      unisex: "Balanced for all shoppers. Roughly even men/women/unisex, but at least ~20% of SKUs are unisex.",
      female: "Lean toward products a women's shopper would browse (~55% women, ~25% unisex, ~20% men).",
      male: "Lean toward products a men's shopper would browse (~55% men, ~25% unisex, ~20% women).",
    }[cx.genderLean];

    // Scrape-first: if the scrape captured real product NAMES, feed them in so
    // Gemini reuses real SKUs (cheaper + higher fidelity) and only INVENTS to
    // fill gaps up to the target count. Cap the injected list to keep the prompt
    // bounded. sourceCategory (when captured) is the retailer's OWN department
    // signal — passed through as-is so Gemini can judge real vertical fit
    // instead of guessing from the name alone (a real multi-department
    // retailer's scrape can include products from a different department).
    const scrapedProducts = Array.isArray(scraped.products)
      ? scraped.products.filter(function (p) { return p && p.name; }).slice(0, 60)
      : [];
    const scrapedNames = scrapedProducts.map(function (p) { return p.name; });

    const optionalBits = [];
    if (cx.searchTerms) optionalBits.push('The shopper is interested in: "' + cx.searchTerms + '". Reflect these in catalog names/descriptions and in at least one search-friendly chip.');
    if (cx.trends) optionalBits.push('Highlight these trends: "' + cx.trends + '". Turn them into entries in the `trends` editorial rail.');
    if (cx.agentName) optionalBits.push('The AI shopping agent MUST be named "' + cx.agentName + '".');
    else optionalBits.push("Invent a short, friendly first name for the AI shopping agent (brand.agentName).");
    if (cx.agentChips) optionalBits.push('Use these as the shopping-agent chip labels (map each to a sensible fixed filter): "' + cx.agentChips + '".');
    else optionalBits.push("Invent 4–6 shopping-agent chip labels, each mapped to ONE fixed filter over the catalog fields.");
    if (cx.personaName) optionalBits.push('The signed-in shopper persona is named "' + cx.personaName + '".');
    if (cx.personaDetails) optionalBits.push('Persona details to honor: "' + cx.personaDetails + '".');
    // Script-stated shopper content: examples for the EXISTING slots only
    // (careFaq, chatFunnel labels, trends, demoQueries) — no new structures.
    const sq = Array.isArray(cx.scriptQuestions) ? cx.scriptQuestions : [];
    if (sq.length) optionalBits.push('The demo script has the shopper asking: ' + sq.map(function (x) { return '"' + x.q + '"' + (x.a ? ' (script answer: "' + x.a + '")' : ""); }).join("; ") + '. Where a question fits, use it as a chatChips.careFaq entry (reuse the script answer when given) or to shape chatFunnel chip labels. Skip any that do not fit this catalog.');
    const ss = Array.isArray(cx.scriptSearches) ? cx.scriptSearches : [];
    if (ss.length) optionalBits.push('The demo script has the shopper searching for: ' + ss.map(function (x) { return '"' + x + '"'; }).join(", ") + '. Use these as demoQueries entries where they resolve to real catalog products.');
    const so = Array.isArray(cx.scriptOffers) ? cx.scriptOffers : [];
    if (so.length) optionalBits.push('The demo script mentions these offers: ' + so.map(function (o) { return o.label + (o.value ? " (" + o.value + ")" : ""); }).join("; ") + '. Reflect them in the offers list (labels/short/long) where they fit the allowed offer types; do not invent others.');
    if (cx.scriptLoyalty) optionalBits.push('Loyalty program per the script: ' + [cx.scriptLoyalty.threshold ? cx.scriptLoyalty.threshold + " points threshold" : "", cx.scriptLoyalty.rewardLabel || ""].filter(Boolean).join(" → ") + '. Echo it in offer copy and persona.profile.loyaltyTier where natural.');
    if (cx.pickupStore) optionalBits.push('The script\'s pickup store is "' + cx.pickupStore + '"; use it as persona.profile.location where natural.');
    if (!cx.pickupStore) optionalBits.push('persona.profile.location MUST be a real "City, ST" (US state abbreviation) where THIS brand has a store or its headquarters — use the website/brand\'s real home market if you know it; if you do not, choose a plausible major US city. Never leave it blank.');
    if (cx.brandColor) optionalBits.push('The brand\'s primary color is approximately ' + cx.brandColor + ' (for context; colors are applied separately).');

    const scrapedNote = scraped.ok && scraped.imageCount
      ? "We scraped " + scraped.imageCount + " product images from the live site; you only need to invent product DATA, not imagery."
      : "No live product images were available; describe products vividly so realistic photos can be generated.";

    const scrapeFirstNote = scrapedNames.length
      ? [
          "SCRAPE-FIRST SOURCING: we already pulled these REAL product names from the live site (source category from the retailer's own site shown in parens where known). REUSE them as-is for the catalog `name` field wherever they are a genuine, clear fit for one of THIS brand's chosen categories/verticals. Do not paraphrase a scraped name you are reusing. If a scraped product is not a clear fit for any category this demo will actually feature (e.g. it's from a different department of a real multi-department retailer — a tennis racket scraped from a golf-and-tennis superstore, when this demo is only featuring golf), EXCLUDE it entirely — do NOT force it into the closest-sounding category/type. Only invent additional products to reach the target count or to fill category/gender/price gaps.",
          scrapedProducts.map(function (p) { return "  • " + p.name + (p.sourceCategory ? " (source category: " + p.sourceCategory + ")" : ""); }).join("\n"),
          "",
        ].join("\n")
      : "";

    // Script-grounding: products the demo script names must exist in the catalog.
    // Empty when the script names none, so the prompt is unchanged in that case.
    const requiredProducts = Array.isArray(cx.requiredProducts) ? cx.requiredProducts : [];
    const requiredNote = requiredProducts.length
      ? [
          "REQUIRED PRODUCTS: the demo script names these products. Include EACH as a catalog product, using the name EXACTLY as written, with a category/family that fits this brand and a realistic price (the approximate price is a hint when given). These count toward the 40 products.",
          requiredProducts.map(function (p) {
            return "  • " + p.name + (p.category ? " (category: " + p.category + ")" : "") + (p.approxPrice ? " (approx. price: " + p.approxPrice + ")" : "");
          }).join("\n"),
          "",
        ].join("\n")
      : "";

    return [
      "You are generating the complete content for an interactive retail storefront DEMO for the customer below.",
      "Return a SINGLE JSON object matching the provided schema. No prose, no markdown, no code fences.",
      "",
      "CUSTOMER: " + (cx.customerName || "(unnamed retailer)"),
      cx.website ? "WEBSITE: " + cx.website : "",
      scrapedNote,
      "",
      scrapeFirstNote,
      requiredNote,
      "GENDER LEAN: " + cx.genderLean + " — " + leanNote,
      "",
      "REQUIREMENTS:",
      "0. AUTHORING ORDER (do this in your own reasoning before emitting JSON — the output shape is unchanged, only the order in which you commit to products matters): FIRST decide the small set of chip/search/trend anchors you'll need — every planned chatFunnel/chatChips chip intent (recipient/occasion/type/color/family), every demoQueries entry, and every trend filterSpec — and make sure a real product exists for each one. THEN fill out the remaining catalog for breadth/variety. This ordering exists so no chip, demo query, or trend ever points at a product that doesn't exist.",
      "1. Produce EXACTLY 40 products with unique ids sku1..sku40.",
      "2. Every product MUST include real, self-consistent fields: gender (men|women|unisex — use these EXACT words, never 'male'/'female'), colors (1–3 lowercase color words), priceTier (budget|mid|premium), family, category, type, price (number), description. `type` is a THIRD, FINER axis than category: family ⊇ category ⊇ type (e.g. family \"Clubs\" → type \"Driver\"/\"Putter\"/\"Iron\"/\"Wedge\"/\"Hybrid\"). Every `type` value MUST recur across ≥2 products — never invent a one-off sub-type.",
      "3. CROSS-GENDER RULE: at least ~20% of products MUST have gender \"unisex\", so no shopper path is ever empty. (In addition to any implied by the gender lean.)",
      "4. navCategories: 4–6 category names; every catalog product's `category` MUST be one of them. `family` is a BROADER grouping (e.g. Boots, Hats, Jeans) that persona.interests.families references — every product's `family` MUST appear in persona.interests.families.",
      "5. persona.interests = { families[], categories[], stones[] }. CRITICAL: EVERY value must be provably present in the catalog — a family must equal ≥1 product's `family`; a category must equal ≥1 product's `category`; a `stones` keyword (free-text) must appear in ≥1 product name/description. An unprovable value silently empties the 'picked for you' grid.",
      "6. persona.profile is a rich dashboard: stylePersona, loyaltyTier, birthday (e.g. 'September 15'), location, memberSince (year), favoriteCategories[] (⊆ navCategories), colorPreferences[] ({name, hex}), signaturePreference, preferredChannel, lifetimeValue (e.g. '$1,240'). persona.name is the full name; persona.firstName is the first name only. persona.gender (men|women|unisex — same exact words as product gender, never 'male'/'female') is the signed-in shopper's OWN gender and drives which apparel/accessories the AI shopping assistant recommends when nothing else specifies a recipient — it MUST align with GENDER LEAN below (male lean → persona.gender:'men'; female lean → 'women'; unisex lean → pick whichever the invented persona name/details actually imply, defaulting to 'unisex' only if genuinely ambiguous). Never default this to 'women' out of habit.",
      "7. offers: 2–3 loyalty offers. Include one type:'tiered-unit' BIRTHDAY reward whose eligibleFirstName EQUALS persona.firstName; optionally a type:'family-percent' offer (set `family` to a real catalog family) and a type:'free-shipping' offer. Each offer: id, code, label, short, long, emoji, type, and (discountRates[] | percent | family as its type requires), eligibleFirstName (null-ish '' if open to all), conflictsWith[] referencing other offer ids consistently.",
      "8. trends: EXACTLY 3–4 editorial 'trending' topics. Each: id (kebab-case), label, tag (short subtitle), icon (one emoji), and filterSpec = { families[], categories[], keywords[], priceTier? }. filterSpec is DECLARATIVE (no code). Every trend's filterSpec MUST match ≥1 product: a product matches if it passes ALL provided fields (family∈families, category∈categories, priceTier===priceTier, and ANY keyword occurs in its name/description). At least one field must be non-empty. When a trend targets ONE sub-style within a family/category that has several (e.g. Driver-only or Putter-only within family 'Clubs'), do NOT rely on family+priceTier alone — that also matches every OTHER sub-style sharing that family/tier. Instead add a `keywords` entry naming the sub-style itself (e.g. 'driver', 'putter') — every catalog product's `type` (Driver/Putter/Wedge/…) already appears in its name/description, so this keyword match narrows correctly.",
      "9. styledPosts: 1–2 shoppable social posts PER trend (so total styledPosts stays ≤8). Each: id, trendId (∈ a trends id), handle (@handle), caption, likes (integer), productNames[] (1–2 names). CRITICAL: every productName MUST EXACTLY equal a catalog product `name`.",
      "10. chipFilterTable: EXACTLY 3 chips. Each: id, label, loggedIn (boolean), filter object using ONLY: gender, family, category, priceTier, colors. Every chip's filter MUST return ≥2 products (it will be capped to 4 results client-side). Mark 1 chip loggedIn:true (personalized), the rest false.",
      "10b. lookComplements: for EACH catalog `family`, list 1–3 OTHER real catalog families that complete that look (e.g. Boots → [Belts, Hats]). Every family name used (as a key or in a complements[] value) MUST be a real catalog `family` value.",
      "11. featuredId: the id of the single best hero product.",
      "12. copy: fill heroEyebrow, heroTitle, heroSub, heroCta, trendingTitle, and a warm one-sentence agentIntro spoken by the agent. ALSO fill the 'our story' lifestyle panel (ourStoryLabel like 'OUR STORY', ourStoryHeading, a 1–2 sentence ourStoryBody about this brand, ourStoryCta) and two short section subtitles: lookSubtitle (under the cross-catalog styling/pairing rail — see brand.signatureFeatureLabel below) and recsSubtitle (under the recommendations rail). Keep all copy on-brand — never mention western wear, boots, or heritage unless this brand actually sells those.",
      "13. brand also carries: socialTag (a social hashtag like '#YourBrand', letters/digits only), helpAgentLabel (the Help Agent's speaker name, e.g. 'YourBrand Help'), pageTitleSuffix (a short browser-tab tagline shown after the brand name), and signatureFeatureLabel — the heading for a rail that pairs products across families into one cohesive purchase. Invent a label that fits THIS brand's actual shopping behavior (e.g. apparel → 'Shop the Look'; golf → 'Build Your Bag' or 'Complete Your Setup' pairing clubs/balls/gloves/bags; furniture → 'Complete the Room'). Never default to 'Shop the Look' unless this brand genuinely sells outfit-style apparel.",
      "14. customerStory: 2–3 sentences on why this retailer wants a guided, AI-assisted storefront (demo narration).",
      "14b. chatChips (OPTIONAL but preferred): who = 3–4 quick-reply chips for \"who are we shopping for\", each an OBJECT {label, intent}: label is the button text (fit THIS brand's actual customer base — never western-wear phrasing like 'A gift for him' unless this genuinely is a western-wear brand; keep it brand-neutral, e.g. 'Treat myself', 'A gift', 'Just browsing'); intent = {recipient} where recipient ∈ self|gift|browsing matching the label's REAL meaning (not literal phrase-matching). careFaq = 2–4 {topic, question, answer} entries covering realistic care/warranty questions for THIS brand's actual navCategories/products — NEVER name a real competitor brand.",
      "14c. chatFunnel (OPTIONAL but preferred): describes the shopping-assistant's guided conversation for THIS brand. Set colorRelevant = true ONLY if color/finish is a genuine factor a real shopper would weigh when choosing between these products (e.g. apparel, jewelry, footwear, home decor) — set it FALSE for functional/equipment/performance categories where color is incidental (e.g. golf clubs, tools, electronics, supplements) even though every SKU is still tagged with 1–3 colors for catalog purposes. stages: an ORDERED list of 1–3 stages chosen from \"recipient\" (always include — who's this for), \"occasion\" (include only if this brand has real use-case/occasion variety, e.g. matching trends[]), \"attribute\" (include this stage whenever EITHER colorRelevant is true OR the catalog has ≥2 distinct `type` values worth branching on — e.g. golf clubs has no color relevance but DOES need an attribute stage to branch Driver vs Putter vs Iron; only omit \"attribute\" entirely when there is neither a real color factor NOR meaningful type variety). For each stage, chips are OBJECTS {label, intent} — NOT bare strings: label is the button text; intent is a SPARSE patch setting ONLY the field(s) that chip decides — a recipient chip sets intent.recipient (self|gift|browsing); an occasion chip sets intent.occasion, and that occasion value MUST also appear as a real trends[].label so it's groundable — an occasion chip NEVER sets intent.type/intent.family and never represents a product-type selection (e.g. a chip like \"New Tech Drivers\" is NOT an occasion — it names a product type, so it belongs on the attribute stage as intent.type:\"Driver\", never as intent.occasion); an attribute chip sets intent.color when colorRelevant (a real catalog color — same rule as chatChips vocabulary) OR intent.type/intent.family when attributeLabel indicates a non-color attribute (e.g. golf's \"More Distance\" attribute chip → intent.type:\"Driver\", not a color, and NOT intent.occasion). question = one short, warm, on-brand line per stage. attributeLabel: a category-appropriate name for the attribute stage (e.g. \"Finish\", \"Material\", or for non-color type-branching stages something like \"Club Type\") — default to \"Color\" if omitted.",
      "14d. CHIP-PATH RESOLVABILITY (critical): every chip's intent, combined with any plausible intent from an earlier stage, MUST resolve to ≥1 real product in the catalog you emit. Do not author a chip whose intent (alone or combined with a prior stage) points at a family/type/color combination with zero matching products — that is a dead-end path. Double-check this against the catalog you are producing, not a hypothetical one.",
      "14e. demoQueries (OPTIONAL but preferred): 4–8 short search-bar phrases a sales rep would plausibly type live during a demo (e.g. \"drivers\", \"putters\", \"golf balls\"), each {query, family?, type?} where family/type is the GUARANTEED-CORRECT real catalog family/type that query should resolve to. Include at least one of family/type per entry, and make sure the referenced family/type actually has matching products in the catalog you emit.",
      "15. For EVERY product also include realistic COSMETIC fields (display-only, never used for filtering):",
      "    - rating: a number from 3.5 to 5.0 (one decimal), varied across products.",
      "    - reviewCount: an integer from 5 to 500, varied.",
      "    - originalPrice: for roughly 10–15% of products put them ON SALE by setting originalPrice STRICTLY GREATER than price; for all others set originalPrice to 0 (not on sale).",
      "    - badge: OPTIONAL — set to \"new\" or \"bestseller\" for a few products; OMIT the field entirely for the rest (do not send an empty string).",
      "    - sizes: an array of size labels ONLY if the product genuinely has sizes (e.g. apparel [\"S\",\"M\",\"L\"]); otherwise an empty array.",
      "",
      "CRITICAL VOCABULARY RULE — this spans SIX surfaces that all resolve by EXACT match against the catalog you emit: (a) chip filters, (b) persona.interests (families/categories/stones), (c) trends[].filterSpec, (d) styledPosts[].productNames, (e) search-relevant copy, and (f) chatFunnel/chatChips chip intents + demoQueries (family/type/color). Every value on these surfaces MUST literally match a catalog field value (family/category/type/color) or a product name (styledPosts). Never use a synonym that doesn't literally appear in the catalog, or that surface renders EMPTY.",
      "",
      "CONTEXT / OPTIONAL INPUTS:",
    ].concat(optionalBits.map(function (b) { return "- " + b; }))
     .filter(Boolean)
     .join("\n");
  }

  function sleep(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }

  // Shared brand-safety guardrail appended to every image prompt — without
  // it Gemini has drawn a recognizable competitor's logo/product (e.g. a
  // New Balance shoe for a Nike-brand build) since "no logos" alone doesn't
  // rule out depicting another real brand's product unbranded-but-recognizable.
  function brandSafetyLine(cx) {
    const name = (cx && cx.customerName) || "this retailer";
    return "This is exclusively for the brand " + name + " — never depict any other real brand's name, logo, or trademarked product.";
  }

  // ── Product photos ──────────────────────────────────────────
  // One image prompt per SKU. Kept literal and studio-style so results
  // look like a real catalog, not clip art.
  function photoPrompt(product, cx) {
    const colors = (product.colors || []).join(", ");
    return [
      "Professional e-commerce product photograph of: " + product.name + ".",
      product.description || "",
      colors ? "Primary colors: " + colors + "." : "",
      "Centered single product, clean seamless light-neutral studio background, soft even lighting, subtle shadow, no text, no watermark, no people, square framing, photorealistic.",
      cx && cx.customerName ? "Styled to suit a retailer like " + cx.customerName + "." : "",
      brandSafetyLine(cx),
    ].filter(Boolean).join(" ");
  }

  // Generate photos ONLY for SKUs still missing an image. `existingImages`
  // maps skuId → url (scraped). Bounded-parallel (batch of `batchSize`)
  // to stay under the server rate limit. Never throws — a failed image
  // just leaves that SKU blank (the engine draws an SVG placeholder).
  function generateProductPhotos(catalog, existingImages, cx, opts) {
    opts = opts || {};
    const batchSize = opts.batchSize || 4;
    const onProgress = typeof opts.onProgress === "function" ? opts.onProgress : function () {};
    const gemini = window.HOLO_GEMINI;
    const images = Object.assign({}, existingImages || {});
    const todo = (catalog || []).filter(function (p) {
      const have = images[p.id];
      return !(have && String(have).trim());
    });

    if (!gemini || !todo.length) return Promise.resolve(images);

    let done = 0;
    const total = todo.length;

    function runBatch(start) {
      const slice = todo.slice(start, start + batchSize);
      if (!slice.length) return Promise.resolve();
      return Promise.all(slice.map(function (p) {
        return gemini.generateImage({ prompt: photoPrompt(p, cx) })
          .then(function (url) { if (url) images[p.id] = url; })
          .catch(function (err) {
            if (window.console) console.warn("[photos] " + p.id + " failed:", (err && err.message) || err);
          })
          .then(function () { done += 1; onProgress(done, total, p.id); });
      })).then(function () { return runBatch(start + batchSize); });
    }

    // One extra pass over whatever is still missing after the main run —
    // catches stragglers that exhausted gemini-client's retry budget during
    // the first attempt (more likely now that product/styled-post/hero
    // photos all fire concurrently instead of serially). Capped at a single
    // retry round (not more): more rounds blow past this build's share of
    // the shared Gemini rate budget and starve whichever app generates
    // next in the same build.
    function missingNow() {
      return todo.filter(function (p) {
        const have = images[p.id];
        return !(have && String(have).trim());
      });
    }
    function sweepRound(round) {
      const missing = missingNow();
      if (!missing.length) return Promise.resolve();
      return Promise.all(missing.map(function (p) {
        return gemini.generateImage({ prompt: photoPrompt(p, cx) })
          .then(function (url) { if (url) images[p.id] = url; })
          .catch(function (err) {
            if (window.console) console.warn("[photos] retry " + round + " " + p.id + " failed:", (err && err.message) || err);
          });
      })).then(function () {
        const stillMissing = missingNow();
        if (!stillMissing.length || round >= 1) {
          if (stillMissing.length && window.console) {
            console.warn("[photos] " + stillMissing.length + " of " + total + " product photos missing after retry: " +
              stillMissing.map(function (p) { return p.id; }).join(", "));
          }
          return;
        }
        return sleep(3000).then(function () { return sweepRound(round + 1); });
      });
    }

    return runBatch(0).then(function () { return sweepRound(1); }).then(function () { return images; });
  }

  // ── Styled-post photos ──────────────────────────────────────
  // One lifestyle-style image prompt per styled post, built from its
  // matched products so the shot is grounded in real catalog items.
  function styledPostPhotoPrompt(post, matchedProducts, cx) {
    const names = (matchedProducts || []).map(function (p) { return p.name; }).filter(Boolean);
    return [
      "Lifestyle social-media photograph styled around: " + (names.join(" and ") || post.caption || "a featured look") + ".",
      post.caption || "",
      "Candid, editorial lifestyle shot (not a plain studio product photo), natural lighting, on-model or in-scene, no text, no watermark, photorealistic.",
      cx && cx.customerName ? "Styled to suit a retailer like " + cx.customerName + "." : "",
      brandSafetyLine(cx),
    ].filter(Boolean).join(" ");
  }

  // Generate photos for styled posts still missing an image, keyed by post
  // id. Mirrors generateProductPhotos: bounded-parallel batches, never
  // throws — a failed image just leaves that post blank (the feed hides it).
  function generateStyledPostPhotos(styledPosts, productsByName, cx, opts) {
    opts = opts || {};
    const batchSize = opts.batchSize || 4;
    const onProgress = typeof opts.onProgress === "function" ? opts.onProgress : function () {};
    const gemini = window.HOLO_GEMINI;
    const images = {};
    const todo = (styledPosts || []).filter(function (p) { return p && p.id; });

    if (!gemini || !todo.length) return Promise.resolve(images);

    let done = 0;
    const total = todo.length;

    function shootOne(post) {
      const matched = (post.productNames || post.products || [])
        .map(function (n) { return productsByName[n]; })
        .filter(Boolean);
      return gemini.generateImage({ prompt: styledPostPhotoPrompt(post, matched, cx) })
        .then(function (url) { if (url) images[post.id] = url; });
    }

    function runBatch(start) {
      const slice = todo.slice(start, start + batchSize);
      if (!slice.length) return Promise.resolve();
      return Promise.all(slice.map(function (post) {
        return shootOne(post)
          .catch(function (err) {
            if (window.console) console.warn("[styled-photos] " + post.id + " failed:", (err && err.message) || err);
          })
          .then(function () { done += 1; onProgress(done, total, post.id); });
      })).then(function () { return runBatch(start + batchSize); });
    }

    // One extra pass over whatever is still missing after the main run —
    // same single-round straggler sweep as generateProductPhotos, for the
    // same reason.
    function sweepRound(round) {
      const missing = todo.filter(function (post) { return !images[post.id]; });
      if (!missing.length) return Promise.resolve();
      return Promise.all(missing.map(function (post) {
        return shootOne(post).catch(function (err) {
          if (window.console) console.warn("[styled-photos] retry " + round + " " + post.id + " failed:", (err && err.message) || err);
        });
      })).then(function () {
        const stillMissing = todo.filter(function (post) { return !images[post.id]; });
        if (!stillMissing.length || round >= 1) {
          if (stillMissing.length && window.console) {
            console.warn("[styled-photos] " + stillMissing.length + " of " + total + " styled-post photos missing after retry: " +
              stillMissing.map(function (post) { return post.id; }).join(", "));
          }
          return;
        }
        return sleep(3000).then(function () { return sweepRound(round + 1); });
      });
    }

    return runBatch(0).then(function () { return sweepRound(1); }).then(function () { return images; });
  }

  // ── Hero photos ─────────────────────────────────────────────
  // Two lifestyle hero shots: the signed-out homepage banner, and a warmer,
  // more personal shot for the signed-in "Insider"/loyalty hero.
  function heroPhotoPrompt(cx, variant, categorySummary) {
    const isSignedIn = variant === "signedIn";
    return [
      isSignedIn
        ? "Warm, welcoming lifestyle photograph for a loyalty/member homepage banner" +
          (cx && cx.customerName ? " for the retailer " + cx.customerName : "") + "."
        : "Aspirational lifestyle photograph for a retail homepage hero banner" +
          (cx && cx.customerName ? " for the retailer " + cx.customerName : "") + ".",
      cx && cx.industry ? "This is a " + cx.industry + " brand." : "",
      categorySummary ? "Their products: " + categorySummary + ". The scene must clearly reflect this — e.g. show the kind of products/activity/subjects this brand's category implies." : "",
      cx && cx.personaDetails ? "Audience: " + cx.personaDetails + "." : "",
      cx && cx.trends ? "Reflects these style trends: " + cx.trends + "." : "",
      isSignedIn
        ? "Candid, personal, on-model lifestyle shot conveying belonging and reward."
        : "Editorial, wide-format lifestyle shot conveying the brand's style at its best.",
      "Wide 16:9 framing, natural lighting, no text, no watermark, no logos, photorealistic.",
      brandSafetyLine(cx),
    ].filter(Boolean).join(" ");
  }

  // Top 2-3 most common category (fallback family) values across the real
  // catalog, so the hero prompt is grounded in what the brand actually
  // sells (e.g. "dog toys, dog treats" → a dog/cat belongs in the shot)
  // instead of inferring purely from the brand name string.
  function categorySummaryFrom(catalog) {
    const counts = {};
    (catalog || []).forEach(function (p) {
      const key = String((p && (p.category || p.family)) || "").trim();
      if (key) counts[key] = (counts[key] || 0) + 1;
    });
    return Object.keys(counts)
      .sort(function (a, b) { return counts[b] - counts[a]; })
      .slice(0, 3)
      .join(", ");
  }

  // Generates both hero images. Never throws — a failed image just leaves
  // that field blank (the template falls back to its brand-gradient hero).
  function generateHeroImages(cx, opts) {
    opts = opts || {};
    const onProgress = typeof opts.onProgress === "function" ? opts.onProgress : function () {};
    const gemini = window.HOLO_GEMINI;
    const result = { heroImage: "", heroImageSignedIn: "" };

    if (!gemini) return Promise.resolve(result);

    const categorySummary = categorySummaryFrom(opts.catalog);
    const jobs = [
      { key: "heroImage", variant: "signedOut" },
      { key: "heroImageSignedIn", variant: "signedIn" },
    ];
    let done = 0;
    return Promise.all(jobs.map(function (job) {
      return gemini.generateImage({ prompt: heroPhotoPrompt(cx, job.variant, categorySummary) })
        .then(function (url) { if (url) result[job.key] = url; })
        .catch(function (err) {
          if (window.console) console.warn("[hero] " + job.key + " failed:", (err && err.message) || err);
        })
        .then(function () { done += 1; onProgress(done, jobs.length, job.key); });
    })).then(function () { return result; });
  }

  window.HOLO_RETAILCABFOUND = {
    ctxFrom: ctxFrom,
    storefrontSchema: storefrontSchema,
    promptForStorefront: promptForStorefront,
    photoPrompt: photoPrompt,
    generateProductPhotos: generateProductPhotos,
    styledPostPhotoPrompt: styledPostPhotoPrompt,
    generateStyledPostPhotos: generateStyledPostPhotos,
    heroPhotoPrompt: heroPhotoPrompt,
    generateHeroImages: generateHeroImages,
  };
})();
