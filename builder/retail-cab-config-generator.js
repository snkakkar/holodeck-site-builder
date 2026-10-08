// ════════════════════════════════════════════════════════════════
//  retail-cab-config-generator.js — window.HOLO_RETAILCABGEN
//
//  Ported from the standalone Retail CAB Demo Creator (storefront-
//  config-generator.js). Normalizes the Gemini output ("found") + ctx
//  into the exact BrandConfig/products shape demo-apps/retail-cab
//  renders, derives the brand palette, attaches product images, and
//  serializes it for export via toBrandConfigJs()/toProductsJson().
//
//  No-bleed guarantee: builds the config PURELY from `found`, `cx`,
//  and the resolved image map — never seeds from a prior/sample
//  customer. Missing fields fall back to a NEUTRAL generic value.
// ════════════════════════════════════════════════════════════════
(function () {
  "use strict";

  // Salesforce base palette (the neutral default when no brand color).
  const SF = { primary: "#0176D3", primaryDk: "#014486", primaryLt: "#E3F0FE", navy: "#032D60" };

  function clamp(n) { return Math.max(0, Math.min(255, Math.round(n))); }
  function hexToRgb(hex) {
    const h = String(hex || "").replace("#", "");
    if (h.length === 3) return { r: parseInt(h[0] + h[0], 16), g: parseInt(h[1] + h[1], 16), b: parseInt(h[2] + h[2], 16) };
    if (h.length >= 6) return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) };
    return null;
  }
  function rgbToHex(r, g, b) {
    return "#" + [r, g, b].map(function (v) { return clamp(v).toString(16).padStart(2, "0"); }).join("");
  }
  function mix(rgb, target, t) {
    return { r: rgb.r + (target - rgb.r) * t, g: rgb.g + (target - rgb.g) * t, b: rgb.b + (target - rgb.b) * t };
  }

  // Derive a full palette from a single primary color; fall back to the
  // Salesforce base if the color is missing/unparseable.
  function derivePalette(primaryHex) {
    const rgb = hexToRgb(primaryHex);
    if (!rgb) return Object.assign({ surface: "#F3F3F3", text: "#181818" }, SF);
    const dk = mix(rgb, 0, 0.35);   // 35% toward black
    const lt = mix(rgb, 255, 0.86); // 86% toward white (tint)
    const navy = mix(rgb, 0, 0.6);  // deep version for headings
    return {
      primary: rgbToHex(rgb.r, rgb.g, rgb.b),
      primaryDk: rgbToHex(dk.r, dk.g, dk.b),
      primaryLt: rgbToHex(lt.r, lt.g, lt.b),
      navy: rgbToHex(navy.r, navy.g, navy.b),
      surface: "#F3F3F3",
      text: "#181818",
    };
  }

  function slug(s) {
    return String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "demo";
  }

  const GENDERS = ["men", "women", "unisex"];
  const TIERS = ["budget", "mid", "premium"];
  const RECIPIENTS = ["self", "gift", "browsing"];

  // Cross-department collision lexicon — the SECONDARY, weaker fallback for
  // 4.1's off-vertical-SKU backstop, used only when a scraped product has no
  // captured `sourceCategory` (see buildStorefrontConfig below). Deliberately
  // small and generic: it exists to catch an obviously wrong department
  // (e.g. a tennis racket scraped into a golf catalog), not to second-guess
  // legitimate cross-sell within one sport.
  const DEPARTMENT_LEXICON = {
    golf: ["golf", "driver", "putter", "wedge", "fairway", "iron", "caddie"],
    tennis: ["tennis", "racket", "racquet", "baseline"],
    basketball: ["basketball", "hoop", "dribble"],
    running: ["running", "marathon", "treadmill", "trail run"],
    baseball: ["baseball", "bat", "glove", "diamond", "pitcher"],
    fitness: ["fitness", "gym", "dumbbell", "yoga", "workout"],
  };
  function wordsOf(s) {
    return String(s || "").toLowerCase().match(/[a-z0-9]+/g) || [];
  }

  // Script-named products (cx.requiredProducts, from the story's scriptFacts).
  // A product "is" a required one when the normalized required name equals, or
  // is contained in, the normalized product name. Used to (a) exempt them from
  // the off-vertical filter and (b) inject any Gemini failed to emit.
  function normName(s) { return wordsOf(s).join(" "); }
  function matchesRequired(name, required) {
    const n = normName(name);
    if (!n) return false;
    return required.some(function (r) {
      const rn = normName(r.name);
      return rn && (n === rn || (" " + n + " ").indexOf(" " + rn + " ") !== -1);
    });
  }

  // Append any required product that is missing. Reuses an EXISTING catalog
  // category/family/type/colors (via the best word-overlap donor product) so
  // every exact-match vocabulary surface (chips, trends, interests) stays
  // valid. Never removes a required product; if the catalog would exceed 40,
  // drops non-required products from the tail (never the featured one).
  function ensureRequiredProducts(products, required, featuredId) {
    const repairs = [];
    const missing = required.filter(function (r) { return !matchesRequired_any(products, r); });
    if (!missing.length || !products.length) return { products: products, repairs: repairs };
    const prices = products.map(function (p) { return Number(p.price) || 0; }).filter(Boolean).sort(function (a, b) { return a - b; });
    const q = function (f) { return prices.length ? prices[Math.min(prices.length - 1, Math.floor(f * prices.length))] : 0; };
    const lo = q(1 / 3), hi = q(2 / 3);
    let maxN = 0;
    products.forEach(function (p) { const m = /^sku(\d+)$/.exec(p.id); if (m) maxN = Math.max(maxN, Number(m[1])); });
    const usedIds = {};
    products.forEach(function (p) { usedIds[p.id] = true; });
    const added = [];
    missing.forEach(function (r) {
      const rw = wordsOf(r.name).concat(wordsOf(r.category));
      let donor = products[0], best = -1;
      products.forEach(function (p) {
        const pw = wordsOf(p.name + " " + p.category + " " + p.family + " " + p.type);
        const score = rw.filter(function (w) { return pw.indexOf(w) !== -1; }).length;
        if (score > best) { best = score; donor = p; }
      });
      do { maxN += 1; } while (usedIds["sku" + maxN]);
      const id = "sku" + maxN; usedIds[id] = true;
      const price = Number(r.approxPrice) > 0 ? Number(r.approxPrice) : (Number(donor.price) || 0);
      added.push({
        id: id, sku: id, name: String(r.name), price: price.toFixed(2), image: "",
        family: donor.family, type: donor.type, category: donor.category,
        description: String(r.name) + (r.category ? " — " + r.category : "") + ".",
        gender: "unisex",
        colors: donor.colors && donor.colors.length ? donor.colors.slice(0, 1) : ["white"],
        priceTier: !price || !prices.length ? "mid" : (price <= lo ? "budget" : (price > hi ? "premium" : "mid")),
      });
      repairs.push('Script-named product "' + r.name + '" was missing from the generated catalog — added (donor: "' + donor.name + '").');
    });
    let out = products.concat(added);
    for (let i = out.length - 1; i >= 0 && out.length > 40; i--) {
      if (out[i].id !== featuredId && !matchesRequired(out[i].name, required)) out.splice(i, 1);
    }
    return { products: out, repairs: repairs };
  }
  function matchesRequired_any(products, r) {
    return products.some(function (p) { return matchesRequired(p.name, [r]); });
  }

  // Case-insensitive membership test against a real catalog field, returning
  // the REAL-cased value from the catalog (so downstream string comparisons
  // — e.g. inside search-engine.js — stay exact-match) or null if unprovable.
  function realCasedValue(list, want) {
    if (!want) return null;
    const w = String(want).toLowerCase();
    for (let i = 0; i < list.length; i++) {
      if (String(list[i]).toLowerCase() === w) return list[i];
    }
    return null;
  }

  // How many products match a sparse {family?, type?, color?} patch. Every
  // present field must match (case-insensitive); color checks the colors[]
  // array. No fields present → matches everything (caller only calls this
  // when at least one field is set).
  function matchCount(products, patch) {
    const fam = patch.family ? String(patch.family).toLowerCase() : null;
    const typ = patch.type ? String(patch.type).toLowerCase() : null;
    const col = patch.color ? String(patch.color).toLowerCase() : null;
    return products.filter(function (p) {
      if (fam && String(p.family || "").toLowerCase() !== fam) return false;
      if (typ && String(p.type || "").toLowerCase() !== typ) return false;
      if (col && (p.colors || []).map(function (c) { return String(c).toLowerCase(); }).indexOf(col) === -1) return false;
      return true;
    }).length;
  }

  // A misauthored occasion chip: Gemini names a product type/family (e.g.
  // "Carbon Face Drivers") instead of a real use-case occasion, most often
  // because the attribute stage that should have carried this as intent.type
  // was skipped. Rather than just dropping it (which loses real signal and
  // reproduces the exact "asks an unnecessary follow-up" bug), detect a real
  // catalog type/family named inside the occasion text and reclassify to it.
  function occasionAsTaxonomy(text, catalogTypes, catalogFamilies) {
    const lower = String(text).toLowerCase();
    // A chip label naming a type/family is often pluralized ("Drivers")
    // while the catalog value is singular ("Driver") or vice versa — match
    // either form so "New Tech Drivers" resolves against type:"Driver".
    function variants(word) {
      const w = word.toLowerCase();
      const out = [w];
      if (/s$/.test(w)) out.push(w.slice(0, -1));
      else out.push(w + "s");
      return out;
    }
    function wordHit(list) {
      for (let i = 0; i < list.length; i++) {
        const forms = variants(list[i]);
        for (let j = 0; j < forms.length; j++) {
          const esc = forms[j].replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
          if (new RegExp("\\b" + esc + "\\b").test(lower)) return list[i];
        }
      }
      return null;
    }
    const typeHit = wordHit(catalogTypes);
    if (typeHit) return { type: typeHit };
    const famHit = wordHit(catalogFamilies);
    if (famHit) return { family: famHit };
    return null;
  }

  // Validate + auto-repair one chip's sparse intent patch against the real
  // catalog/trends. Drops any unprovable field (never guesses a substitute).
  // If the surviving family/type/color combo resolves to 0 products on its
  // own, strips those fields too (the reliability contract: a chip's intent
  // is dropped down toward `{}` rather than ever shipping a dead end — the
  // click then falls back to the free-text parser at runtime).
  function normalizeChipIntent(rawIntent, products, catalogFamilies, catalogTypes, catalogColors, trendLabelsLower, repairs, label) {
    const raw = rawIntent && typeof rawIntent === "object" ? rawIntent : {};
    const clean = {};
    if (raw.recipient && RECIPIENTS.indexOf(raw.recipient) === -1) {
      repairs.push('Chip "' + label + '" intent.recipient "' + raw.recipient + '" is not a recognized recipient — dropped.');
    } else if (RECIPIENTS.indexOf(raw.recipient) !== -1) clean.recipient = raw.recipient;
    if (raw.occasion && trendLabelsLower.indexOf(String(raw.occasion).toLowerCase()) === -1) {
      const reclassified = occasionAsTaxonomy(raw.occasion, catalogTypes, catalogFamilies);
      if (reclassified) {
        if (reclassified.type) clean.type = reclassified.type; else clean.family = reclassified.family;
        repairs.push('Chip "' + label + '" intent.occasion "' + raw.occasion + '" names a product type/family, not a real occasion — reclassified as intent.' +
          (reclassified.type ? 'type="' + reclassified.type + '"' : 'family="' + reclassified.family + '"') + '.');
      } else {
        repairs.push('Chip "' + label + '" intent.occasion "' + raw.occasion + '" matches no real trend — dropped.');
      }
    } else if (raw.occasion) clean.occasion = String(raw.occasion);
    const fam = realCasedValue(catalogFamilies, raw.family);
    if (raw.family && !fam) repairs.push('Chip "' + label + '" intent.family "' + raw.family + '" matches no real catalog family — dropped.');
    else if (fam) clean.family = fam;
    const typ = realCasedValue(catalogTypes, raw.type);
    if (raw.type && !typ) repairs.push('Chip "' + label + '" intent.type "' + raw.type + '" matches no real catalog type — dropped.');
    else if (typ) clean.type = typ;
    const col = realCasedValue(catalogColors, raw.color);
    if (raw.color && !col) repairs.push('Chip "' + label + '" intent.color "' + raw.color + '" matches no real catalog color — dropped.');
    else if (col) clean.color = col;
    if ((clean.family || clean.type || clean.color) && matchCount(products, clean) === 0) {
      repairs.push('Chip "' + label + '" intent (family=' + (clean.family || "-") + ", type=" + (clean.type || "-") +
        ", color=" + (clean.color || "-") + ") matched 0 products — stripped to free-text fallback.");
      delete clean.family; delete clean.type; delete clean.color;
    }
    return clean;
  }

  function normalizeFunnelChip(raw, products, catalogFamilies, catalogTypes, catalogColors, trendLabelsLower, repairs) {
    if (typeof raw === "string") {
      const label = raw.trim();
      return label ? { label: label, intent: {} } : null;
    }
    if (!raw || !raw.label) return null;
    const label = String(raw.label).trim();
    if (!label) return null;
    return { label: label, intent: normalizeChipIntent(raw.intent, products, catalogFamilies, catalogTypes, catalogColors, trendLabelsLower, repairs, label) };
  }

  // Cross-stage resolvability: a chip's intent must resolve to >=1 product
  // in combination with SOME plausible pick from every earlier stage — not
  // necessarily every combination, since a shopper only ever picks one chip
  // per stage. If it dead-ends against every earlier-stage chip, the
  // combined path can never be reached — strip this (later) chip's
  // family/type/color, same auto-repair rule as the single-chip case.
  function repairCrossStageDeadEnds(stagesNorm, products, repairs) {
    let priorCombos = [{}]; // merged intent patches reachable so far
    stagesNorm.forEach(function (stage) {
      stage.chips.forEach(function (chip) {
        const patchFields = ["family", "type", "color"].filter(function (k) { return chip.intent[k]; });
        if (!patchFields.length) return;
        const reachable = priorCombos.some(function (prior) {
          const merged = Object.assign({}, prior, chip.intent);
          return matchCount(products, merged) > 0;
        });
        if (!reachable) {
          repairs.push('Chip "' + chip.label + '" (stage "' + stage.key + '") dead-ends against every earlier-stage pick — stripped to free-text fallback.');
          patchFields.forEach(function (k) { delete chip.intent[k]; });
        }
      });
      // Grow the reachable-combo set with this stage's (now-repaired) chips
      // for the next stage to combine against.
      const nextCombos = [];
      priorCombos.forEach(function (prior) {
        stage.chips.forEach(function (chip) {
          nextCombos.push(Object.assign({}, prior, chip.intent));
        });
      });
      if (nextCombos.length) priorCombos = nextCombos;
    });
  }

  // Coerce Gemini's gender to the foundation's canonical men|women|unisex
  // (search-engine.js normGender reads these). Tolerate legacy male|female.
  function coerceGender(g) {
    const s = String(g || "").toLowerCase();
    if (s.indexOf("women") !== -1 || s === "female" || s === "f") return "women";
    if (s.indexOf("men") !== -1 || s === "male" || s === "m") return "men";
    if (GENDERS.indexOf(s) !== -1) return s;
    return "unisex";
  }

  // Build the storefront config. `found` = parsed Gemini JSON, `cx` =
  // ctxFrom(state), `images` = { skuId → url }, `brandColor` optional override.
  //
  // Returns an object that is BOTH:
  //   • the exported artifacts — `brandConfig` (→ window.BrandConfig) and
  //     `products` (→ products.json), in the Cavender's FOUNDATION shape; and
  //   • back-compat top-level fields (`brand`, `catalog`, `productImages`,
  //     `chipFilterTable`, …) that builder.js's photo loop, the harness, the
  //     preview stash, and the thumbnail still read.
  function buildStorefrontConfig(found, cx, images, brandColor, styledImages, scraped, heroImages) {
    found = found || {};
    cx = cx || {};
    images = images || {};
    styledImages = styledImages || {};
    scraped = scraped || {};
    heroImages = heroImages || {};

    const brandName = (found.brand && found.brand.name) || cx.customerName || "Your Store";
    const agentName = cx.agentName || (found.brand && found.brand.agentName) || "Ava";
    const agentRole = (found.brand && found.brand.agentRole) || "shopping assistant";
    const signatureFeatureLabel = (found.brand && found.brand.signatureFeatureLabel) || "Shop the Look";
    // cx.brandColor is the user's explicit typed hex; brandColor is only a
    // scraped guess (site's most-frequent non-neutral color) and must never
    // outrank a color the user actually chose.
    const colors = derivePalette(cx.brandColor || brandColor || SF.primary);

    // ── Catalog → foundation product shape (price STRING, image inline) ──
    // ids sku1..skuN, gender men|women|unisex, family required (∈ interests).
    const rawCatalog = Array.isArray(found.catalog) ? found.catalog : [];
    const navFirst = (Array.isArray(found.navCategories) && found.navCategories[0]) || "All";
    let products = rawCatalog.slice(0, 40).map(function (p, i) {
      const id = p.id || "sku" + (i + 1);
      const priceNum = Number(p.price) || 0;
      const family = String(p.family || navFirst);
      return {
        id: id,
        sku: String(p.sku || id),
        name: String(p.name || "Product " + (i + 1)),
        // Foundation renders price as a string ('$' + p.price); keep 2dp.
        price: priceNum ? priceNum.toFixed(2) : "0.00",
        image: images[id] || String(p.image || ""),
        family: family,
        // Finer sub-style axis than category (search-engine.js keys off it
        // to distinguish e.g. "Driver" from "Putter" within one family);
        // falls back to `family` when Gemini omits it.
        type: String(p.type || family).trim() || family,
        category: String(p.category || navFirst),
        description: String(p.description || ""),
        gender: coerceGender(p.gender),
        colors: Array.isArray(p.colors) ? p.colors.map(function (c) { return String(c).toLowerCase(); }) : [],
        priceTier: TIERS.indexOf(p.priceTier) !== -1 ? p.priceTier : "mid",
      };
    });

    // ── 4.1 backstop: drop scraped SKUs Gemini force-fit into this brand's
    // taxonomy even though they don't genuinely belong (e.g. a tennis racket
    // scraped from a multi-department retailer, tagged family:"Drivers").
    // Primary signal: the REAL scraped `sourceCategory` (a structured field
    // captured at scrape time — never AI-generated text) compared by word
    // overlap against this brand's own family/category/nav vocabulary.
    // Only when no sourceCategory was captured do we fall back to the
    // smaller, weaker DEPARTMENT_LEXICON scan of name/description.
    const sourceCategoryByName = {};
    (Array.isArray(scraped.products) ? scraped.products : []).forEach(function (sp) {
      if (sp && sp.name && sp.sourceCategory) sourceCategoryByName[sp.name] = sp.sourceCategory;
    });
    const catalogVocab = {};
    products.forEach(function (p) {
      wordsOf(p.family).forEach(function (w) { catalogVocab[w] = 1; });
      wordsOf(p.category).forEach(function (w) { catalogVocab[w] = 1; });
    });
    (Array.isArray(found.navCategories) ? found.navCategories : []).forEach(function (c) {
      wordsOf(c).forEach(function (w) { catalogVocab[w] = 1; });
    });
    const catalogAutoRepairs = [];
    const requiredProducts = Array.isArray(cx.requiredProducts) ? cx.requiredProducts.filter(function (r) { return r && r.name; }) : [];
    products = products.filter(function (p) {
      if (requiredProducts.length && matchesRequired(p.name, requiredProducts)) return true;
      const sourceCategory = sourceCategoryByName[p.name];
      if (sourceCategory) {
        const scWords = wordsOf(sourceCategory);
        if (!scWords.length) return true;
        const overlaps = scWords.some(function (w) { return catalogVocab[w]; });
        if (!overlaps) {
          catalogAutoRepairs.push(
            'Product "' + p.name + '" (scraped source category "' + sourceCategory +
            '") shares no vocabulary with this brand\'s own categories — excluded as an off-vertical scraped item.'
          );
          return false;
        }
        return true;
      }
      // Fallback: no captured source signal. Only flag a CLEAR mismatch —
      // the product's own text names a department the brand's own
      // vocabulary has no trace of.
      const text = (p.name + " " + p.description).toLowerCase();
      const textDepts = Object.keys(DEPARTMENT_LEXICON).filter(function (dept) {
        return DEPARTMENT_LEXICON[dept].some(function (kw) { return text.indexOf(kw) !== -1; });
      });
      if (!textDepts.length) return true;
      const brandDepts = Object.keys(DEPARTMENT_LEXICON).filter(function (dept) {
        return DEPARTMENT_LEXICON[dept].some(function (kw) { return catalogVocab[kw]; });
      });
      const conflicts = brandDepts.length ? textDepts.filter(function (d) { return brandDepts.indexOf(d) === -1; }) : [];
      if (conflicts.length) {
        catalogAutoRepairs.push(
          'Product "' + p.name + '" reads as ' + conflicts.join("/") + " gear, which doesn't match this brand's own " +
          brandDepts.join("/") + " vocabulary — excluded as a likely off-vertical scraped item."
        );
        return false;
      }
      return true;
    });

    // Guarantee script-named products exist (no-op when the script names none).
    if (requiredProducts.length) {
      const ensured = ensureRequiredProducts(products, requiredProducts, found.featuredId);
      products = ensured.products;
      ensured.repairs.forEach(function (m) { catalogAutoRepairs.push(m); });
    }

    // Back-compat catalog view (numeric price) + productImages map for the
    // photo-gap loop / harness / exporter baking (keyed by final ids).
    const catalog = products.map(function (p) {
      return {
        id: p.id, name: p.name, price: Number(p.price) || 0,
        priceTier: p.priceTier, gender: p.gender, colors: p.colors,
        family: p.family, type: p.type, category: p.category, description: p.description,
        image: p.image,
      };
    });
    const productImages = {};
    products.forEach(function (p) { productImages[p.id] = p.image || ""; });

    const navCategories = Array.isArray(found.navCategories) && found.navCategories.length
      ? found.navCategories.slice(0, 6).map(String)
      : Array.from(new Set(products.map(function (p) { return p.category; }))).slice(0, 6);

    // ── Persona (foundation BrandConfig.persona shape) ──
    const fp = found.persona || {};
    const fpi = fp.interests || {};
    const fpp = fp.profile || {};
    const fullName = cx.personaName || fp.name || "Shopper";
    // When the user explicitly overrode the persona's full name, firstName
    // must be derived from THAT name, not from Gemini's own (possibly
    // self-invented) fp.firstName — otherwise the name and greeting can
    // silently diverge (e.g. name "Tom Morris" but greeted as "Rachel").
    const firstName = cx.personaName
      ? String(fullName).split(/\s+/)[0]
      : (fp.firstName || String(fullName).split(/\s+/)[0] || "Shopper");
    // Gemini is asked to align persona.gender with the wizard's genderLean
    // input, but if it's omitted/malformed, fall back to a genderLean-
    // derived value rather than defaulting silently to any one gender —
    // this is what cocoTargetGender() reads to decide who the AI chat
    // recommends apparel to when signed in with no explicit recipient.
    const genderFallback = { male: "men", female: "women", unisex: "unisex" }[cx.genderLean] || "unisex";
    const personaGenderFellBack = ["men", "women", "unisex"].indexOf(fp.gender) === -1;
    const personaGender = personaGenderFellBack ? genderFallback : fp.gender;
    const persona = {
      identity: {
        name: fullName,
        firstName: firstName,
        email: String(fp.email || (firstName.toLowerCase() + "@example.com")),
        memberSince: String(fpp.memberSince || "2023"),
      },
      gender: personaGender,
      interests: {
        families: Array.isArray(fpi.families) ? fpi.families.map(String) : [],
        categories: Array.isArray(fpi.categories) ? fpi.categories.map(String) : [],
        stones: Array.isArray(fpi.stones) ? fpi.stones.map(String) : [],
      },
      profile: {
        stylePersona: String(fpp.stylePersona || ""),
        loyaltyTier: String(fpp.loyaltyTier || ""),
        birthday: String(fpp.birthday || ""),
        location: String(fpp.location || ""),
        memberSince: String(fpp.memberSince || "2023"),
        favoriteCategories: Array.isArray(fpp.favoriteCategories) ? fpp.favoriteCategories.map(String) : [],
        // hex is rendered straight into an inline style="background:..." —
        // validate the shape so a malformed value can't inject CSS.
        colorPreferences: Array.isArray(fpp.colorPreferences)
          ? fpp.colorPreferences.filter(function (c) { return c && c.name; })
              .map(function (c) { return { name: String(c.name), hex: /^#[0-9a-fA-F]{3,8}$/.test(c.hex) ? String(c.hex) : "#888888" }; })
          : [],
        signaturePreference: String(fpp.signaturePreference || ""),
        preferredChannel: String(fpp.preferredChannel || "Email"),
        lifetimeValue: String(fpp.lifetimeValue || ""),
      },
    };

    // ── Offers (foundation BrandConfig.offers shape) ──
    const rawOffers = Array.isArray(found.offers) ? found.offers : [];
    const offers = rawOffers
      .filter(function (o) { return o && o.id && o.code && o.type; })
      .map(function (o) {
        const type = ["tiered-unit", "family-percent", "free-shipping"].indexOf(o.type) !== -1 ? o.type : "free-shipping";
        const offer = {
          id: String(o.id),
          code: String(o.code),
          label: String(o.label || o.code),
          short: String(o.short || ""),
          long: String(o.long || o.short || ""),
          emoji: String(o.emoji || "🎁"),
          type: type,
          eligibleFirstName: o.eligibleFirstName ? String(o.eligibleFirstName) : null,
          conflictsWith: Array.isArray(o.conflictsWith) ? o.conflictsWith.map(String) : [],
        };
        if (type === "tiered-unit") {
          // Rates must be 0–1 fractions (0.2 == 20% off) — the model sometimes
          // emits whole-number percentages (20) instead, which birthday-promo.js
          // would otherwise apply as a 2000% discount (same bug class as `percent`
          // above).
          const rawRates = Array.isArray(o.discountRates) && o.discountRates.length ? o.discountRates.map(Number) : [0.5, 0.25];
          offer.discountRates = rawRates.map(function (r) {
            if (!isFinite(r) || r <= 0) return 0;
            return Math.min(r > 1 ? r / 100 : r, 0.9);
          });
        }
        if (type === "family-percent") {
          // `percent` must be a 0–1 fraction (0.15 == 15% off) — the model
          // sometimes emits a whole-number percentage (15) instead, which
          // birthday-promo.js would otherwise apply as a 1500% discount.
          let pct = Number(o.percent);
          if (!isFinite(pct) || pct <= 0) pct = 0.15;
          else if (pct > 1) pct = pct / 100;
          offer.percent = Math.min(pct, 0.9);
          offer.family = String(o.family || (products[0] && products[0].family) || "");
        }
        return offer;
      });
    // The storefront treats offers[0] as the birthday reward and only shows the
    // signed-in hero when its eligibleFirstName equals the persona's firstName.
    // Gemini emits those independently, so reconcile here: the birthday offer
    // is the first gated offer (else the first offer), moved to the front and
    // gated to the persona — otherwise a signed-in shopper sees the anonymous hero.
    if (offers.length) {
      let bdayIdx = offers.findIndex(function (o) { return o.eligibleFirstName; });
      if (bdayIdx === -1) bdayIdx = 0;
      const bday = offers.splice(bdayIdx, 1)[0];
      bday.eligibleFirstName = firstName;
      offers.unshift(bday);
    }
    // Guarantee at least a free-shipping offer so checkout never lacks one.
    if (!offers.length) {
      offers.push({ id: "freeship", code: "SHIPFREE", label: "Free Shipping", short: "Free standard shipping",
        long: "Free standard shipping on this order.", emoji: "🚚", type: "free-shipping", eligibleFirstName: null, conflictsWith: [] });
    }

    // ── Trends (keep filterSpec for the ?holo/export compile; drop empties) ──
    const trends = (Array.isArray(found.trends) ? found.trends : [])
      .filter(function (t) { return t && t.label && t.filterSpec && typeof t.filterSpec === "object"; })
      .map(function (t, i) {
        const spec = t.filterSpec || {};
        return {
          id: t.id || ("trend-" + i),
          label: String(t.label),
          tag: String(t.tag || ""),
          icon: String(t.icon || "✨"),
          filterSpec: {
            families: Array.isArray(spec.families) ? spec.families.map(String) : [],
            categories: Array.isArray(spec.categories) ? spec.categories.map(String) : [],
            keywords: Array.isArray(spec.keywords) ? spec.keywords.map(String) : [],
            priceTier: TIERS.indexOf(spec.priceTier) !== -1 ? spec.priceTier : "",
          },
        };
      });

    // ── Styled posts (productNames must match a product name; drop stragglers) ──
    const nameSet = {};
    products.forEach(function (p) { nameSet[p.name] = true; });
    const trendIds = {};
    trends.forEach(function (t) { trendIds[t.id] = true; });
    // `autoRepairs` collects a human-readable trail of everything silently
    // fixed up so Generate never blocks — see 0.2/0.3 of the systemic-
    // determinism plan. Declared here (before its main chatChips/chatFunnel/
    // demoQueries use below) so the styled-post image fallback can log into
    // the same list.
    const autoRepairs = catalogAutoRepairs.slice();
    if (personaGenderFellBack) {
      autoRepairs.push('Persona gender was missing/invalid — defaulted to "' + genderFallback + '" from the gender lean.');
    }
    const productsByName = {};
    products.forEach(function (p) { productsByName[p.name] = p; });
    const styledPosts = (Array.isArray(found.styledPosts) ? found.styledPosts : [])
      .filter(function (s) { return s && s.trendId && trendIds[s.trendId] && Array.isArray(s.productNames); })
      .map(function (s, i) {
        const names = s.productNames.map(String).filter(function (n) { return nameSet[n]; });
        // The styled-post photo call is a per-post Gemini image generation
        // that can transiently fail (rate limit, timeout) independently of
        // the rest of generation. Never let a single failed call leave a
        // post imageless and block export — fall back to the first matched
        // product's own (already-generated) photo, which always exists.
        const postId = s.id || ("post-" + i);
        const generatedImage = styledImages[postId] || s.image || "";
        const fallbackImage = names.length && productsByName[names[0]] ? productsByName[names[0]].image : "";
        if (!generatedImage && fallbackImage) {
          autoRepairs.push('Styled post "' + postId + '" had no generated photo — using its product photo instead.');
        }
        return {
          id: postId,
          trendId: String(s.trendId),
          image: String(generatedImage || fallbackImage || ""),
          handle: String(s.handle || "@shopper"),
          caption: String(s.caption || ""),
          likes: Math.max(0, Math.round(Number(s.likes) || 0)),
          products: names,
        };
      })
      .filter(function (s) { return s.products.length; });

    const copy = found.copy || {};
    const storyBody = String(found.customerStory || copy.ourStoryBody || "").trim();
    const copyOut = {
      heroEyebrow: String(copy.heroEyebrow || "New arrivals"),
      heroTitle: String(copy.heroTitle || brandName),
      heroSub: String(copy.heroSub || ""),
      heroCta: String(copy.heroCta || "Shop the collection"),
      trendingTitle: String(copy.trendingTitle || "Trending now"),
      agentIntro: String(copy.agentIntro || ("Hi, I'm " + agentName + ". What can I help you find?")),
      // "Our story" lifestyle panel (views.js renderHome). Drives the label /
      // heading / body / CTA so no baked Cavender's western copy leaks.
      ourStoryLabel: String(copy.ourStoryLabel || "OUR STORY"),
      ourStoryHeading: String(copy.ourStoryHeading || ("The " + brandName + " Story.")),
      ourStoryBody: storyBody || ("At " + brandName + ", every piece is chosen with care — quality you can feel and a look that's unmistakably yours."),
      ourStoryCta: String(copy.ourStoryCta || "Shop the Collection"),
      // Section subtitles (views.js Shop-the-Look + recommendations rails).
      lookSubtitle: String(copy.lookSubtitle || "Curated pairings to complete your look."),
      recsSubtitle: String(copy.recsSubtitle || "More pieces we think you'll love."),
      // Hero photography — Gemini-generated (see generateHeroImages). Blank
      // when generation hasn't run yet or failed; the template falls back to
      // its brand-gradient hero when these are unset.
      heroImage: String(heroImages.heroImage || ""),
      heroImageSignedIn: String(heroImages.heroImageSignedIn || ""),
    };

    // chipFilterTable — keep only well-formed chips with a usable filter,
    // capped to exactly 3 chips with each filter's results capped to 4
    // (client-side, so this never depends on Gemini counting correctly).
    const chipFilterTable = (Array.isArray(found.chipFilterTable) ? found.chipFilterTable : [])
      .filter(function (c) { return c && c.label && c.filter && typeof c.filter === "object"; })
      .slice(0, 3)
      .map(function (c, i) {
        return { id: c.id || ("chip_" + i), label: String(c.label), loggedIn: Boolean(c.loggedIn), filter: Object.assign({}, c.filter, { limit: 4 }) };
      });

    // lookComplements — which OTHER real catalog families complete a look.
    // Every family/complement value must be a real catalog family or it's
    // dropped; search-engine.js's buildDerivedVocabulary() round-robins over
    // real families if this ends up empty.
    const catalogFamilies = Array.from(new Set(products.map(function (p) { return p.family; })));
    const lookComplements = (Array.isArray(found.lookComplements) ? found.lookComplements : [])
      .filter(function (e) { return e && e.family && catalogFamilies.indexOf(String(e.family)) !== -1 && Array.isArray(e.complements); })
      .map(function (e) {
        return {
          family: String(e.family),
          complements: e.complements.map(String)
            .filter(function (c) { return catalogFamilies.indexOf(c) !== -1 && c !== String(e.family); })
            .slice(0, 3),
        };
      })
      .filter(function (e) { return e.complements.length; });

    const featuredId = (products.filter(function (p) { return p.id === found.featuredId; })[0] || products[0] || {}).id || "sku1";

    // chatChips/chatFunnel/demoQueries — the AI chat's fully-scripted intent
    // paths (see 0.2/0.3 of the systemic-determinism plan). Every chip/query
    // carries a baked `intent` patch validated against THIS catalog; any
    // unprovable or dead-end field is auto-repaired (stripped), never
    // shipped broken and never blocking Generate — logged into the same
    // `autoRepairs` list declared above.
    const chipCatalogFamilies = Array.from(new Set(products.map(function (p) { return p.family; }).filter(Boolean)));
    const catalogTypes = Array.from(new Set(products.map(function (p) { return p.type; }).filter(Boolean)));
    const catalogColors = Array.from(new Set([].concat.apply([], products.map(function (p) { return p.colors || []; }))));
    const trendLabelsLower = trends.map(function (t) { return String(t.label).toLowerCase(); });

    const foundChatChips = found.chatChips || {};
    const chatChips = {
      who: (Array.isArray(foundChatChips.who) ? foundChatChips.who : [])
        .map(function (raw) { return normalizeFunnelChip(raw, products, chipCatalogFamilies, catalogTypes, catalogColors, trendLabelsLower, autoRepairs); })
        .filter(Boolean),
      careFaq: (Array.isArray(foundChatChips.careFaq) ? foundChatChips.careFaq : [])
        .filter(function (f) { return f && f.topic && f.question && f.answer; })
        .map(function (f) { return { topic: String(f.topic), question: String(f.question), answer: String(f.answer) }; })
        .slice(0, 4),
    };

    // chatFunnel — Gemini-authored chat-widget stage order/vocabulary.
    // colorRelevant is safety-netted against the REAL generated catalog
    // (not just trusted from Gemini's own claim): even if Gemini says color
    // matters, don't believe it unless the catalog actually has meaningful
    // color diversity — otherwise a golf-club catalog could still surface a
    // color question because Gemini guessed wrong. False positives from
    // Gemini are corrected here; false negatives (Gemini says false) are
    // always honored as-is. Malformed/missing chatFunnel → empty stages;
    // web-curation-component.js falls back to its own safe legacy tree.
    const VALID_FUNNEL_STAGE_KEYS = ["recipient", "occasion", "attribute"];
    const foundChatFunnel = found.chatFunnel || {};
    const distinctCatalogColors = {};
    products.forEach(function (p) { (p.colors || []).forEach(function (c) { distinctCatalogColors[String(c).toLowerCase()] = 1; }); });
    const colorRelevant = foundChatFunnel.colorRelevant === true && Object.keys(distinctCatalogColors).length >= 3;
    const seenFunnelKeys = {};
    // The "attribute" stage isn't color-exclusive: a chip can set intent.color
    // (color-relevant brands) OR intent.type/family (e.g. golf's "More
    // Distance" -> Driver) — see 14c. Keep the stage when EITHER colorRelevant
    // is true OR at least one of its chips carries a non-color field; when
    // colorRelevant is false, strip any color field from its chips so a
    // stray color chip never leaks in for a non-color brand.
    const chatFunnelStagesNorm = (Array.isArray(foundChatFunnel.stages) ? foundChatFunnel.stages : [])
      .filter(function (s) { return s && VALID_FUNNEL_STAGE_KEYS.indexOf(s.key) !== -1 && s.question && Array.isArray(s.chips) && s.chips.length; })
      .filter(function (s) {
        if (s.key !== "attribute" || colorRelevant) return true;
        return s.chips.some(function (c) { return c && typeof c === "object" && c.intent && (c.intent.type || c.intent.family); });
      })
      .filter(function (s) { return seenFunnelKeys[s.key] ? false : (seenFunnelKeys[s.key] = true); })
      .slice(0, 3)
      .map(function (s) {
        return {
          key: s.key,
          question: String(s.question),
          chips: s.chips
            .map(function (raw) {
              if (s.key === "attribute" && !colorRelevant && raw && typeof raw === "object" && raw.intent) {
                raw = Object.assign({}, raw, { intent: Object.assign({}, raw.intent, { color: undefined }) });
              }
              return normalizeFunnelChip(raw, products, chipCatalogFamilies, catalogTypes, catalogColors, trendLabelsLower, autoRepairs);
            })
            .filter(Boolean)
            .slice(0, 5),
        };
      })
      .filter(function (s) { return s.chips.length; });
    repairCrossStageDeadEnds(chatFunnelStagesNorm, products, autoRepairs);
    const chatFunnel = {
      colorRelevant: colorRelevant,
      attributeLabel: String(foundChatFunnel.attributeLabel || "Color"),
      stages: chatFunnelStagesNorm,
    };

    // demoQueries — guaranteed-correct search-bar phrases for a rehearsed
    // demo script (see 0.3 of the plan). Any entry whose family/type doesn't
    // provably match the real catalog is dropped rather than shipped broken.
    const demoQueries = (Array.isArray(found.demoQueries) ? found.demoQueries : [])
      .filter(function (d) { return d && d.query && String(d.query).trim(); })
      .slice(0, 8)
      .map(function (d) {
        const fam = realCasedValue(chipCatalogFamilies, d.family);
        const typ = realCasedValue(catalogTypes, d.type);
        if (d.family && !fam) autoRepairs.push('Demo query "' + d.query + '" family "' + d.family + '" matches no real catalog family — dropped.');
        if (d.type && !typ) autoRepairs.push('Demo query "' + d.query + '" type "' + d.type + '" matches no real catalog type — dropped.');
        return { query: String(d.query).trim(), family: fam || "", type: typ || "" };
      })
      .filter(function (d) {
        if (!d.family && !d.type) {
          autoRepairs.push('Demo query "' + d.query + '" has no provable family/type — dropped.');
          return false;
        }
        if (matchCount(products, d) === 0) {
          autoRepairs.push('Demo query "' + d.query + '" (family=' + (d.family || "-") + ", type=" + (d.type || "-") + ") matched 0 products — dropped.");
          return false;
        }
        return true;
      });

    // The window.BrandConfig object the foundation reads (foundation shape).
    const fb = found.brand || {};
    const socialTag = String(fb.socialTag || ("#" + String(brandName).replace(/[^A-Za-z0-9]+/g, ""))) || "#Shop";
    const helpAgentLabel = String(fb.helpAgentLabel || (brandName + " Help"));
    const pageTitleSuffix = String(fb.pageTitleSuffix || copy.pageTitleSuffix || "Shop the Collection");
    const brandConfig = {
      brand: {
        name: brandName,
        agentName: agentName,
        agentRole: agentRole,
        signatureFeatureLabel: signatureFeatureLabel,
        // Brand-driven surfaces that previously leaked Cavender's defaults:
        //   socialTag       → views.js See-It-Styled header + @handle fallback
        //   helpAgentLabel  → web-curation-component.js Help Agent speaker
        //   pageTitleSuffix → index.html <title> tagline (boot IIFE)
        socialTag: socialTag,
        helpAgentLabel: helpAgentLabel,
        pageTitleSuffix: pageTitleSuffix,
        colors: colors,
      },
      copy: copyOut,
      customerStory: String(found.customerStory || ""),
      persona: persona,
      offers: offers,
      offer: offers[0],
      navCategories: navCategories,
      trends: trends,
      styledPosts: styledPosts,
      chipFilterTable: chipFilterTable,
      featuredId: featuredId,
      lookComplements: lookComplements,
      chatChips: chatChips,
      chatFunnel: chatFunnel,
      demoQueries: demoQueries,
      // stores: left to the foundation's baked default unless a generator adds them.
    };

    return {
      // New foundation artifacts:
      brandConfig: brandConfig,
      products: products,
      // Back-compat top-level (builder photo loop / harness / thumbnail / exporter):
      brand: brandConfig.brand,
      copy: copyOut,
      customerStory: brandConfig.customerStory,
      persona: persona,
      offers: offers,
      navCategories: navCategories,
      catalog: catalog,
      trends: trends,
      styledPosts: styledPosts,
      featuredId: featuredId,
      chipFilterTable: chipFilterTable,
      productImages: productImages,
      lookComplements: lookComplements,
      chatChips: chatChips,
      chatFunnel: chatFunnel,
      demoQueries: demoQueries,
      // Everything auto-repaired while validating chatChips/chatFunnel/demoQueries
      // against this catalog — surfaced instantly (never blocks Generate).
      autoRepairs: autoRepairs,
    };
  }

  // Serialize BrandConfig to a self-contained brand-config.js (full-file
  // replacement — no money-split tail). Includes the ?holo preview override so
  // preview and export share ONE file. Trends carry `filterSpec` (declarative);
  // the override + a small compile step turn them into live predicates.
  function toBrandConfigJs(brandConfig, header) {
    // header carries the brand name (Gemini-sourced); strip "*/" so it can't
    // close this comment early and inject executable JS into the emitted file.
    const safeHeader = String(header || "").replace(/\*\//g, "");
    const banner = safeHeader
      ? "/* " + safeHeader + "\n   Generated by Retail CAB Demo Creator. Edit freely; see CLAUDE_MODIFY.md. */\n"
      : "";
    // Compile trend filterSpec → live filter fn INSIDE the emitted file so the
    // exported (token-less) build renders the trend rail without a compile pass.
    return banner +
      "(function () {\n" +
      "  'use strict';\n" +
      // Mount-path detection — the template's own js/brand-config.js carries
      // this same IIFE, but a GENERATED config replaces that file wholesale
      // via this serializer, dropping it. Without it window.APP_BASE_PATH is
      // never set, and every /js/products.json fetch (search-engine.js,
      // views.js, web-curation-component.js) resolves against the domain
      // root instead of the app's mount point (e.g. /apps/retailCab/),
      // 404ing once exported under that subpath.
      "  (function () {\n" +
      "    var script = document.currentScript;\n" +
      "    var src = script && script.src;\n" +
      "    if (!src) { window.APP_BASE_PATH = ''; return; }\n" +
      "    var path;\n" +
      "    try { path = new URL(src, window.location.href).pathname; } catch (e) { path = ''; }\n" +
      "    var idx = path.indexOf('/js/brand-config.js');\n" +
      "    window.APP_BASE_PATH = idx === -1 ? '' : path.slice(0, idx);\n" +
      "  })();\n" +
      "  var BrandConfig = " + JSON.stringify(brandConfig, null, 2) + ";\n" +
      "  BrandConfig.offer = BrandConfig.offer || (BrandConfig.offers && BrandConfig.offers[0]);\n" +
      "  if (BrandConfig.persona && BrandConfig.persona.identity) BrandConfig.persona.RACHEL = BrandConfig.persona.identity;\n" +
      "  (BrandConfig.trends || []).forEach(function (tr) {\n" +
      "    if (typeof tr.filter === 'function') return;\n" +
      "    var spec = tr.filterSpec || {};\n" +
      "    var fams = (spec.families || []).map(function (s) { return String(s).toLowerCase(); });\n" +
      "    var cats = (spec.categories || []).map(function (s) { return String(s).toLowerCase(); });\n" +
      "    var kws  = (spec.keywords || []).map(function (s) { return String(s).toLowerCase(); });\n" +
      "    var tier = spec.priceTier ? String(spec.priceTier).toLowerCase() : '';\n" +
      "    tr.filter = function (p) {\n" +
      "      var fam = String(p.family || '').toLowerCase();\n" +
      "      var cat = String(p.category || '').toLowerCase();\n" +
      "      var txt = ((p.name || '') + ' ' + (p.description || '')).toLowerCase();\n" +
      "      if (fams.length && fams.indexOf(fam) === -1) return false;\n" +
      "      if (cats.length && cats.indexOf(cat) === -1) return false;\n" +
      "      if (tier && String(p.priceTier || '').toLowerCase() !== tier) return false;\n" +
      "      if (kws.length && !kws.some(function (k) { return txt.indexOf(k) !== -1; })) return false;\n" +
      "      return !!(fams.length || cats.length || kws.length || tier);\n" +
      "    };\n" +
      "  });\n" +
      "  window.BrandConfig = BrandConfig;\n" +
      "})();\n";
  }

  // Serialize the products array to products.json (foundation shape).
  function toProductsJson(products) {
    return JSON.stringify(products || [], null, 2) + "\n";
  }

  window.HOLO_RETAILCABGEN = {
    buildStorefrontConfig: buildStorefrontConfig,
    toBrandConfigJs: toBrandConfigJs,
    toProductsJson: toProductsJson,
    derivePalette: derivePalette,
    slug: slug,
  };
})();
