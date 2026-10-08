/* ──────────────────────────────────────────────────────────────────────────
   Orders & Loyalty — mock service data for the Help Agent.

   The demo has no backend and no real order history, so this module is the
   single source of truth for the Help Agent's post-purchase flows (returns /
   exchanges, order status / WISMO / BOPIS, loyalty & rewards, care & warranty,
   order modification / cancellation). It mirrors the persona.js convention:
   inert data + a small resolution/mutation API on window.Orders. No org calls.

   Everything is gated on a signed-in shopper (the Rachel Morris persona). When
   signed out, list/latest return empty and mutations are inert — service flows
   prompt the shopper to sign in, exactly like the rest of the demo.

   Mutations (start a return, cancel, redeem …) flip a flag in sessionStorage so
   the effect survives within the demo session and re-renders read it back.
   ────────────────────────────────────────────────────────────────────────── */
(function () {
  var STORE = window.sessionStorage;
  var STATE_KEY = 'nto_order_state';       // per-order mutation flags
  var REDEEMED_KEY = 'nto_reward_redeemed'; // redeemed loyalty reward id

  // ── Brand-driven identity helpers ─────────────────────────────────────────
  // Order history is a DEMO fixture (no backend), but its product items, store,
  // and shopper details must reflect the GENERATED brand — not a baked one. The
  // three order shells below carry only the demo beats (status / shipping /
  // eligibility); their product items are filled at seed time from the loaded
  // catalog so a signed-in shopper always sees THIS brand's products.
  function _cfg() { return window.BrandConfig || {}; }
  // Generated-build flag (chipFilterTable is emitted only by the config
  // generator; baked Cavender's has none). Gates neutral return wording.
  var GEN_BRAND = !!_cfg().chipFilterTable;
  function _persona() { return _cfg().persona || {}; }
  function personaEmail() {
    var id = _persona().identity || {};
    return id.email || 'shopper@example.com';
  }
  function personaFirstName() {
    var id = _persona().identity || {};
    return id.firstName || 'there';
  }
  function homeStore() {
    var scripted = _cfg().homeStore; // set only when the demo script names a pickup store
    if (scripted && String(scripted).trim()) return String(scripted).trim();
    var loc = (_persona().profile || {}).location;
    return (loc && String(loc).trim()) || 'your local store';
  }

  // The three demo-beat order shells. `items` is populated by seedOrders() from
  // catalog products; `_familyPref` biases which product each order draws.
  //  #A drives the WISMO + fit-return + "find the right size" beat.
  //  #B is a just-placed order for the modify / cancel (BOPIS) beat.
  //  #C is delivered, seeding a straightforward return/exchange.
  var ORDER_SHELLS = [
    {
      id: '#10428',
      placedAt: 'Sep 12, 2026',
      status: 'out_for_delivery',
      statusLabel: 'Out for delivery',
      _itemSeed: { size: '8', width: 'B (Medium)' },
      shipping: {
        method: 'Standard shipping', carrier: 'FedEx',
        tracking: '7749 1183 0426',
        eta: 'Thursday, Sep 18',
        storePickup: null
      },
      returnEligible: true,
      modifiable: false,
      cancelWindowOpen: false
    },
    {
      id: '#10461',
      placedAt: 'Today',
      status: 'processing',
      statusLabel: 'Processing',
      _itemSeed: { size: 'One Size', width: null },
      shipping: {
        method: 'Store pickup', carrier: null,
        tracking: null,
        eta: null,
        storePickup: { store: homeStore(), ready: false, readyEta: 'Ready in ~2 hours' }
      },
      returnEligible: false,
      modifiable: true,
      cancelWindowOpen: true
    },
    {
      id: '#10390',
      placedAt: 'Aug 30, 2026',
      status: 'delivered',
      statusLabel: 'Delivered',
      _itemSeed: { size: '7.5', width: 'B (Medium)' },
      shipping: {
        method: 'Standard shipping', carrier: 'FedEx',
        tracking: '7749 0091 7732',
        eta: 'Delivered Sep 4',
        storePickup: null
      },
      returnEligible: true,
      modifiable: false,
      cancelWindowOpen: false
    }
  ];

  // Populated by seedOrders() from the loaded catalog. Until then, list/latest
  // return [] (same as signed-out), so no baked product ever surfaces.
  var ORDERS = [];

  // Build the order items from catalog products. Prefers distinct products drawn
  // from the persona's interest families so order history feels personalized;
  // falls back to the first available products. Deterministic (no randomness).
  function seedOrders(catalog) {
    if (!Array.isArray(catalog) || !catalog.length) { ORDERS = []; return; }
    var interests = (_persona().interests || {});
    var prefFamilies = Array.isArray(interests.families) ? interests.families.slice() : [];
    // Rank: products whose family is a persona interest come first, order stable.
    var ranked = catalog.slice().sort(function (a, b) {
      var ai = prefFamilies.indexOf(a.family) === -1 ? 1 : 0;
      var bi = prefFamilies.indexOf(b.family) === -1 ? 1 : 0;
      return ai - bi;
    });
    // Pick up to 3 distinct products (distinct ids), one per order shell.
    var picks = [];
    for (var i = 0; i < ranked.length && picks.length < ORDER_SHELLS.length; i++) {
      if (picks.indexOf(ranked[i]) === -1) picks.push(ranked[i]);
    }
    ORDERS = ORDER_SHELLS.map(function (shell, idx) {
      var p = picks[idx] || picks[picks.length - 1] || null;
      var seed = shell._itemSeed || {};
      var order = Object.assign({}, shell);
      delete order._itemSeed;
      order.items = p ? [{
        name: p.name,
        sku: p.sku || p.id,
        size: seed.size || null,
        width: seed.width || null,
        price: String(p.price),
        image: p.image || '',
        family: p.family || null
      }] : [];
      return order;
    });
  }

  // Seed as soon as the catalog is available. SiteSearch caches it; prefer the
  // preview override when present so the live preview matches the generated
  // brand. search-engine.js loads AFTER orders.js (and after DOMContentLoaded,
  // via the async DOWNSTREAM_SCRIPTS chain), so poll until window.SiteSearch
  // actually exists instead of giving up after one retry.
  function trySeed() {
    if (ORDERS.length) return true; // already seeded
    if (Array.isArray(window.__HOLO_PREVIEW_PRODUCTS) && window.__HOLO_PREVIEW_PRODUCTS.length) {
      seedOrders(window.__HOLO_PREVIEW_PRODUCTS);
      return true;
    }
    if (window.SiteSearch && window.SiteSearch.loadProducts) {
      window.SiteSearch.loadProducts().then(seedOrders).catch(function () {});
      return true;
    }
    return false;
  }
  (function pollSeed() {
    if (trySeed()) return;
    setTimeout(pollSeed, 150);
  })();

  // ── Loyalty ────────────────────────────────────────────────────────────────
  // tier mirrors BrandConfig.persona.profile.loyaltyTier; balance is mocked (no
  // numeric points exist in the config). Rewards are DERIVED from the generated
  // offers (window.Offers / BrandConfig.offers) so ids/codes/labels always match
  // the brand and redeeming activates a real stackable offer at checkout. The
  // point cost is assigned deterministically by position.
  var REWARD_COSTS = [0, 2000, 2500];
  function buildRewards() {
    var offers = (window.Offers && window.Offers.all && window.Offers.all()) ||
                 (_cfg().offers || []);
    return offers.slice(0, REWARD_COSTS.length).map(function (o, i) {
      return {
        id: o.id,
        label: o.label || o.short || 'Reward',
        cost: REWARD_COSTS[i] != null ? REWARD_COSTS[i] : 2500,
        code: o.code || ''
      };
    });
  }
  var LOYALTY = {
    tier: ((_persona().profile || {}).loyaltyTier) || 'Rewards Member',
    pointsBalance: 2450,
    pointsToNextReward: 550,
    nextRewardAt: 3000,
    rewards: buildRewards()
  };
  // Script-stated threshold (BrandConfig.loyalty, only present when the script
  // names one): keep the same ~82% progress ratio, scaled to that threshold.
  var _scriptedLoyalty = _cfg().loyalty;
  if (_scriptedLoyalty && Number(_scriptedLoyalty.threshold) > 0) {
    LOYALTY.nextRewardAt = Number(_scriptedLoyalty.threshold);
    LOYALTY.pointsBalance = Math.round(LOYALTY.nextRewardAt * 2450 / 3000);
    LOYALTY.pointsToNextReward = LOYALTY.nextRewardAt - LOYALTY.pointsBalance;
    // Scale reward costs the same way so "ready to redeem" stays consistent.
    LOYALTY.rewards.forEach(function (r) { r.cost = Math.round(r.cost * LOYALTY.nextRewardAt / 3000); });
  }

  // ── Identity gate ──────────────────────────────────────────────────────────
  // orders.js loads before web-curation-component.js, so read the persisted
  // identity directly (the same sessionStorage key WebCuration writes).
  function signedIn() {
    var id = null;
    if (window.WebCuration && window.WebCuration.getUserIdentity) {
      id = window.WebCuration.getUserIdentity();
    }
    if (!id) {
      try { id = JSON.parse(STORE.getItem('nto_user_identity') || 'null'); } catch (_) {}
    }
    return !!(id && (id.firstName || id.email));
  }

  function readState() {
    try { return JSON.parse(STORE.getItem(STATE_KEY) || '{}') || {}; } catch (_) { return {}; }
  }
  function writeState(state) {
    try { STORE.setItem(STATE_KEY, JSON.stringify(state)); } catch (_) {}
  }
  function orderState(id) { return readState()[id] || {}; }
  function setOrderState(id, patch) {
    var s = readState();
    s[id] = Object.assign({}, s[id], patch);
    writeState(s);
  }

  // Merge an order's seed data with any session mutation flags so callers always
  // see the current state (e.g. status flips to 'return_started' after a return).
  function hydrate(order) {
    if (!order) return null;
    var st = orderState(order.id);
    return Object.assign({}, order, { _state: st });
  }

  var Orders = {
    list: function () {
      if (!signedIn()) return [];
      return ORDERS.map(hydrate);
    },
    // Most recent actionable order (the boots — the demo's hero order).
    latest: function () {
      if (!signedIn()) return null;
      return hydrate(ORDERS[0]);
    },
    byId: function (id) {
      if (!signedIn()) return null;
      for (var i = 0; i < ORDERS.length; i++) {
        if (ORDERS[i].id === id) return hydrate(ORDERS[i]);
      }
      return null;
    },
    // First order matching a family (e.g. 'Boots') — used to resolve "my boots".
    byFamily: function (family) {
      if (!signedIn()) return null;
      for (var i = 0; i < ORDERS.length; i++) {
        var items = ORDERS[i].items || [];
        for (var j = 0; j < items.length; j++) {
          if ((items[j].family || '') === family) return hydrate(ORDERS[i]);
        }
      }
      return null;
    },
    loyalty: function () {
      if (!signedIn()) return null;
      var redeemed = null;
      try { redeemed = STORE.getItem(REDEEMED_KEY); } catch (_) {}
      return Object.assign({}, LOYALTY, { redeemedRewardId: redeemed });
    },
    rewardById: function (rewardId) {
      for (var i = 0; i < LOYALTY.rewards.length; i++) {
        if (LOYALTY.rewards[i].id === rewardId) return LOYALTY.rewards[i];
      }
      return null;
    },

    // ── Mutations (return next-step copy; flip session state) ──────────────────
    startReturn: function (id) {
      var order = this.byId(id);
      if (!order || !order.returnEligible) {
        return { ok: false, message: 'This order isn’t eligible for a return right now.' };
      }
      setOrderState(id, { status: 'return_started', returnStarted: true });
      return {
        ok: true,
        rma: 'RMA-' + id.replace('#', ''),
        message: 'Your return is started. A prepaid ' + (GEN_BRAND ? 'return' : 'FedEx') + ' label is on its way to ' +
          personaEmail() + ' — print it, drop the box at any ' + (GEN_BRAND ? 'carrier' : 'FedEx') + ' location, and your ' +
          'refund posts to your original payment within 3–5 business days.'
      };
    },
    startExchange: function (id, newSize) {
      var order = this.byId(id);
      if (!order || !order.returnEligible) {
        return { ok: false, message: 'This order isn’t eligible for an exchange right now.' };
      }
      setOrderState(id, { status: 'exchange_started', exchangeStarted: true, exchangeSize: newSize || null });
      return {
        ok: true,
        rma: 'EXC-' + id.replace('#', ''),
        message: 'Exchange started' + (newSize ? ' for size ' + newSize : '') +
          '. We’ll ship the new ' + (GEN_BRAND ? 'item' : 'pair') + ' as soon as we scan the return — a prepaid ' + (GEN_BRAND ? 'return' : 'FedEx') + ' ' +
          'label is on its way to ' + personaEmail() + '. No extra charge.'
      };
    },
    cancel: function (id) {
      var order = this.byId(id);
      if (!order || !order.cancelWindowOpen) {
        return { ok: false, message: 'This order has already entered fulfillment and can no ' +
          'longer be canceled — but once it arrives you can start a free return.' };
      }
      setOrderState(id, { status: 'canceled', canceled: true });
      return { ok: true, message: 'Order ' + id + ' is canceled and your card was never charged.' };
    },
    modify: function (id, changes) {
      var order = this.byId(id);
      if (!order || !order.modifiable) {
        return { ok: false, message: 'This order can no longer be modified — it’s already ' +
          'being prepared. I can help you start a return once it arrives.' };
      }
      setOrderState(id, { modified: true, changes: changes || {} });
      return { ok: true, message: 'Done — order ' + id + ' has been updated.' };
    },
    redeem: function (rewardId) {
      if (!signedIn()) return { ok: false, message: 'Sign in to redeem your rewards.' };
      var reward = this.rewardById(rewardId);
      if (!reward) return { ok: false, message: 'That reward isn’t available.' };
      if (reward.cost > LOYALTY.pointsBalance) {
        return { ok: false, message: 'You need ' + (reward.cost - LOYALTY.pointsBalance) +
          ' more points for that reward.' };
      }
      try { STORE.setItem(REDEEMED_KEY, rewardId); } catch (_) {}
      // Apply the matching stackable offer so it's waiting at checkout.
      if (window.Offers && window.Offers.activate && reward.id) window.Offers.activate(reward.id);
      return {
        ok: true, code: reward.code,
        message: reward.label + ' is applied — code ' + reward.code +
          ' is waiting in your cart. Let’s find something to use it on.'
      };
    },
    // Reset all session mutations (used by sign-out / start-over).
    clearAll: function () {
      try { STORE.removeItem(STATE_KEY); STORE.removeItem(REDEEMED_KEY); } catch (_) {}
    }
  };

  window.Orders = Orders;
})();
