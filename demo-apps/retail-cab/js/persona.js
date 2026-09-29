/**
 * The single, deterministic demo persona (Rachel Morris for Cavender's).
 *
 * This module is intentionally NOT a general profile system. There is exactly
 * ONE shopper, and everything about her — her interests, her "purchased" closet
 * (the box), and the attributes shown on her profile page — is pre-authored and
 * fixed. Signing in with any email loads her; her data is identical on every load.
 *
 * The only runtime work is mapping her fixed selector rules onto the real
 * product catalog so images/prices always match live catalog data (honoring the
 * repo rule: never show a wrong or missing image/price).
 *
 * Persona: "Country & Festival" — she leans into western boots, felt/straw hats,
 * and bootcut jeans. The keyword vocabulary (in BrandConfig.persona.interests)
 * must appear in this catalog's product names/descriptions, so her closet and
 * recommendations resolve to real pieces.
 *
 * Loaded after brand-config.js, before views.js and web-curation-component.js
 * in index.html.
 *
 * The persona DATA (identity, interests, profile) now lives in
 * window.BrandConfig.persona — this module holds only the reusable RESOLUTION
 * logic (jewelry box rules + recommendation scoring) applied to that data.
 */
(function () {
  'use strict';

  var CFG = (window.BrandConfig && window.BrandConfig.persona) || {};

  // Base identity. `email` is overwritten with whatever the user types at
  // sign-in, but the person is fixed by config.
  var RACHEL = CFG.identity || {};

  // Interest weighting used by recommendFromBox() and to bias the agent's
  // curation. Stone keywords must occur in the catalog's text (see config).
  var INTERESTS = CFG.interests || { families: [], categories: [], stones: [] };

  // Pre-authored profile attributes for the profile dashboard. All fixed —
  // nothing here is captured at runtime. piecesOwned is filled in from the
  // resolved jewelry box so the number always matches what's shown.
  var PROFILE = CFG.profile || {};

  function text(p) {
    return ((p && p.name) || '') + ' ' + ((p && p.description) || '');
  }

  /**
   * The persona's virtual box — one selector rule per interest family
   * (already brand-specific via BrandConfig.persona.interests), resolved
   * against the live catalog. Each rule picks the first catalog match (catalog
   * order is stable, so this is deterministic). Deduped by name. These are the
   * pieces she has "bought"; the same items appear on every load.
   */
  function buildBoxRules(interests) {
    var families = (interests && interests.families) || [];
    var seen = {};
    var rules = [];
    families.forEach(function (fam) {
      if (!fam || seen[fam]) return;
      seen[fam] = true;
      rules.push({ label: fam, match: function (p) { return p.family === fam; } });
    });
    return rules;
  }
  var BOX_RULES = buildBoxRules(INTERESTS);

  function getJewelryBox(products) {
    var box = [];
    var usedNames = {};
    if (!products || !products.length) return box;
    BOX_RULES.forEach(function (rule) {
      for (var i = 0; i < products.length; i++) {
        var p = products[i];
        if (!p.price) continue;
        if (usedNames[p.name]) continue;
        if (rule.match(p)) {
          box.push(p);
          usedNames[p.name] = true;
          break;
        }
      }
    });
    return box;
  }

  /**
   * Deterministic interest-based recommendations derived from the jewelry box.
   * Scoring mirrors the relevance style in search-engine.js:
   *   +3  stone keyword (interest) appears in name/description
   *   +2  product category is one of her interest categories
   *   +1  product family is one of her interest families
   * Items already in the box are excluded. Ties break alphabetically by name so
   * the output is identical on every load. Only positively-scored items are
   * returned, so the grid is strongly dominated by her signature look.
   */
  function recommendFromBox(box, allProducts, limit) {
    limit = limit || 8;
    if (!allProducts || !allProducts.length) return [];
    var inBox = {};
    (box || []).forEach(function (p) { inBox[p.name] = true; });

    var stones = INTERESTS.stones;
    var cats = INTERESTS.categories;
    var fams = INTERESTS.families;

    var scored = allProducts.filter(function (p) {
      return p.price && !inBox[p.name];
    }).map(function (p) {
      var score = 0;
      var t = text(p).toLowerCase();
      stones.forEach(function (s) { if (t.indexOf(s) !== -1) score += 3; });
      if (cats.indexOf(p.category) !== -1) score += 2;
      if (fams.indexOf(p.family) !== -1) score += 1;
      return { p: p, score: score };
    }).filter(function (s) {
      return s.score > 0;
    }).sort(function (a, b) {
      if (b.score !== a.score) return b.score - a.score;
      return (a.p.name || '').localeCompare(b.p.name || '');
    });

    return scored.slice(0, limit).map(function (s) { return s.p; });
  }

  window.Persona = {
    RACHEL: RACHEL,
    INTERESTS: INTERESTS,
    PROFILE: PROFILE,
    getJewelryBox: getJewelryBox,
    recommendFromBox: recommendFromBox
  };
})();
