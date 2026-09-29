/* ──────────────────────────────────────────────────────────────────────────
   Birthday Promo — a website "push" notification that greets the shopper on
   sign-in with her My Cavender's birthday reward, plus shared promo state that
   the checkout sidebar reads for its one-click "quick apply" button.

   ONE offer, ONE code, everywhere on the site (profile page, this toast, the
   logged-in home hero, and checkout). The actual copy, code, and discount rates
   are read from window.BrandConfig.offer (brand-config.js) — the strings below
   are only inert fallbacks used if that config is absent.

   The shopper's birthday lives in window.Persona.PROFILE.birthday.
   window.BirthdayPromo is the single source of truth so views.js (checkout /
   hero / profile) can read the code, the offer copy, and compute the discount.
   ────────────────────────────────────────────────────────────────────────── */
(function () {
  // Offer catalog (multiple activatable offers) with a back-compat single-offer
  // alias. The birthday reward is always offers[0] / BrandConfig.offer.
  var OFFERS = (window.BrandConfig && window.BrandConfig.offers) ||
    [(window.BrandConfig && window.BrandConfig.offer) || {}];
  var OFFER = OFFERS[0] || {};
  var CODE = OFFER.code || 'BDAY2026';
  var OFFER_SHORT = OFFER.short || '50% off one item + 25% off another';
  var OFFER_LONG = OFFER.long || 'Take 50% off one fashion jewelry item and 25% off one fine, ' +
    'demi-fine, home, or sunglasses collection item.';
  var ELIGIBLE_NAME = OFFER.eligibleFirstName || 'Rachel';
  var LEGACY_APPLIED_KEY = 'nto_promo_applied'; // pre-multi-offer birthday key
  var SHOWN_KEY = 'nto_bday_toast_shown';
  var STORE = window.sessionStorage;

  // ── Multi-offer manager (read by profile / checkout) ────────────────────────
  // Each offer's activation lives under `nto_offer_<id>_applied`. Up to two
  // offers stack at checkout; `conflictsWith` (from BrandConfig) is the single
  // source of the mutual-exclusion rule.
  function offerKey(id) { return 'nto_offer_' + id + '_applied'; }

  function currentFirstName() {
    var id = window.WebCuration && window.WebCuration.getUserIdentity
      ? window.WebCuration.getUserIdentity() : null;
    return id && id.firstName;
  }

  function round2(n) { return Math.round(n * 100) / 100; }

  var Offers = {
    all: function () { return OFFERS.slice(); },
    byId: function (id) {
      for (var i = 0; i < OFFERS.length; i++) if (OFFERS[i].id === id) return OFFERS[i];
      return null;
    },
    // Eligibility: an offer with eligibleFirstName is gated on the signed-in
    // shopper; a null gate is available to everyone. Safe before sign-in.
    isEligible: function (offer) {
      if (!offer) return false;
      if (!offer.eligibleFirstName) return true;
      return currentFirstName() === offer.eligibleFirstName;
    },
    // Offers the shopper can see/activate right now (eligible only).
    list: function () {
      var self = this;
      return OFFERS.filter(function (o) { return self.isEligible(o); });
    },
    isActive: function (id) {
      var offer = this.byId(id);
      return !!offer && this.isEligible(offer) && STORE.getItem(offerKey(id)) === '1';
    },
    activeIds: function () {
      var self = this;
      return OFFERS.filter(function (o) { return self.isActive(o.id); }).map(function (o) { return o.id; });
    },
    // Ids that must be greyed out: any offer that conflicts with a currently
    // active one (and is not itself active).
    conflictedIds: function () {
      var active = this.activeIds();
      var out = [];
      OFFERS.forEach(function (o) {
        if (active.indexOf(o.id) !== -1) return;
        var conflicts = (o.conflictsWith || []).some(function (c) { return active.indexOf(c) !== -1; });
        if (conflicts) out.push(o.id);
      });
      return out;
    },
    // Activate an offer, auto-deactivating anything it conflicts with (so a
    // conflicting pair can never both be on). Fires 'offers:changed'.
    activate: function (id) {
      var offer = this.byId(id);
      if (!offer || !this.isEligible(offer)) return;
      (offer.conflictsWith || []).forEach(function (c) { STORE.removeItem(offerKey(c)); });
      STORE.setItem(offerKey(id), '1');
      window.dispatchEvent(new CustomEvent('offers:changed'));
    },
    deactivate: function (id) {
      STORE.removeItem(offerKey(id));
      window.dispatchEvent(new CustomEvent('offers:changed'));
    },
    clearAll: function () {
      OFFERS.forEach(function (o) { STORE.removeItem(offerKey(o.id)); });
      STORE.removeItem(LEGACY_APPLIED_KEY);
    },
    // Dollar discount contribution of ONE offer for a cart (0 for free shipping,
    // which is handled by shippingFor). Does not check active state.
    contribution: function (offer, cart) {
      if (!offer || !cart || !cart.length) return 0;
      if (offer.type === 'tiered-unit') {
        var rates = offer.discountRates || [0.5, 0.25];
        var units = [];
        cart.forEach(function (item) {
          var price = parseFloat(item.price) || 0;
          var qty = item.quantity || 1;
          for (var i = 0; i < qty; i++) units.push(price);
        });
        units.sort(function (a, b) { return b - a; });
        return round2((units[0] || 0) * (rates[0] || 0) + (units[1] || 0) * (rates[1] || 0));
      }
      if (offer.type === 'family-percent') {
        var sum = 0;
        cart.forEach(function (item) {
          if ((item.family || '') === offer.family) {
            sum += (parseFloat(item.price) || 0) * (item.quantity || 1) * (offer.percent || 0);
          }
        });
        return round2(sum);
      }
      return 0; // free-shipping contributes via shippingFor, not a line discount
    },
    // Total dollar discount from all ACTIVE, eligible discount offers.
    discountFor: function (cart) {
      var self = this;
      var total = 0;
      OFFERS.forEach(function (o) {
        if (self.isActive(o.id)) total += self.contribution(o, cart);
      });
      return round2(total);
    },
    // Baseline shipping cost after offers: 0 if a free-shipping offer is active.
    shippingFor: function (base) {
      var self = this;
      var free = OFFERS.some(function (o) { return o.type === 'free-shipping' && self.isActive(o.id); });
      return free ? 0 : base;
    }
  };

  // Migrate the legacy single-offer key: if the birthday reward was applied
  // under the old scheme, carry it into the new per-offer state once.
  if (STORE.getItem(LEGACY_APPLIED_KEY) === '1' && OFFER.id) {
    STORE.setItem(offerKey(OFFER.id), '1');
    STORE.removeItem(LEGACY_APPLIED_KEY);
  }

  window.Offers = Offers;

  // ── Back-compat shim (read by checkout / hero / toast) ──────────────────────
  // BirthdayPromo now delegates to the birthday offer inside the Offers manager,
  // so it never double-counts alongside Offers.discountFor.
  var BirthdayPromo = {
    code: CODE,
    label: OFFER.label || 'Birthday Reward',
    offerShort: OFFER_SHORT,
    offerLong: OFFER_LONG,
    isEligible: function () { return Offers.isEligible(OFFER); },
    isApplied: function () { return Offers.isActive(OFFER.id); },
    apply: function () { Offers.activate(OFFER.id); },
    clear: function () { Offers.deactivate(OFFER.id); },
    // Only the birthday offer's contribution (checkout uses Offers.discountFor
    // for the stacked total).
    discountFor: function (cart) {
      return Offers.isActive(OFFER.id) ? Offers.contribution(OFFER, cart) : 0;
    }
  };
  window.BirthdayPromo = BirthdayPromo;

  // ── Birthday date helpers ────────────────────────────────────────────────
  function birthdayLabel() {
    return (window.Persona && window.Persona.PROFILE && window.Persona.PROFILE.birthday) || 'September 15';
  }
  // Days until the next occurrence of the birthday (0 = today).
  function daysUntilBirthday() {
    var parsed = new Date(birthdayLabel() + ', ' + new Date().getFullYear());
    if (isNaN(parsed)) return null;
    var today = new Date();
    today.setHours(0, 0, 0, 0);
    parsed.setHours(0, 0, 0, 0);
    if (parsed < today) parsed.setFullYear(parsed.getFullYear() + 1);
    return Math.round((parsed - today) / 86400000);
  }

  function greeting() {
    var name = ELIGIBLE_NAME;
    var days = daysUntilBirthday();
    if (days === 0) return "It's your birthday, " + name + "! 🎉";
    if (days !== null && days <= 30) return 'Happy Birthday Month, ' + name + '! 🎂';
    return 'A little something for you, ' + name + ' 🎂';
  }
  function subline() {
    // Config-driven so the reward copy travels with the brand (BrandConfig.offer).
    return esc(OFFER_LONG);
  }

  // ── Product picks for the toast (her wishlist, else jewelry-box recs) ───────
  function pickForToast() {
    // Prefer things she's wishlisted; fall back to recommendations from her box.
    var wish = (window.Views && window.Views.getWishlist) ? window.Views.getWishlist() : [];
    wish = (wish || []).filter(function (w) { return w && w.image; });
    if (wish.length >= 2) {
      return Promise.resolve(wish.slice(0, 3).map(function (w) {
        return { name: w.name, image: w.image, price: w.price };
      }));
    }
    var loader = window.SiteSearch && window.SiteSearch.loadProducts
      ? window.SiteSearch.loadProducts() : Promise.resolve(null);
    return loader.then(function (products) {
      if (!products || !window.Persona) return [];
      var box = window.Persona.getJewelryBox(products);
      var recs = window.Persona.recommendFromBox(box, products, 3);
      return recs.map(function (p) { return { name: p.name, image: p.image, price: p.price }; });
    }).catch(function () { return []; });
  }

  function esc(s) { var d = document.createElement('div'); d.textContent = s == null ? '' : s; return d.innerHTML; }

  // ── Toast ────────────────────────────────────────────────────────────────
  function dismiss(toast) {
    toast.classList.remove('bday-toast--in');
    setTimeout(function () { if (toast.parentNode) toast.parentNode.removeChild(toast); }, 320);
  }

  function showToast() {
    if (!BirthdayPromo.isEligible()) return;
    // Never stack duplicates.
    if (document.querySelector('.bday-toast')) return;

    var toast = document.createElement('div');
    toast.className = 'bday-toast';
    toast.setAttribute('role', 'status');
    toast.setAttribute('aria-live', 'polite');
    toast.innerHTML =
      '<button class="bday-toast-close" aria-label="Dismiss">&times;</button>' +
      '<div class="bday-toast-emoji">🎂</div>' +
      '<div class="bday-toast-body">' +
        '<div class="bday-toast-title">' + greeting() + '</div>' +
        '<div class="bday-toast-text">' + subline() + '</div>' +
        '<div class="bday-toast-recs" aria-hidden="true"></div>' +
        '<div class="bday-toast-code">CODE <strong>' + CODE + '</strong></div>' +
        '<button class="bday-toast-cta">Shop your reward &rarr;</button>' +
      '</div>';

    document.body.appendChild(toast);
    // Force reflow so the entrance transition runs.
    void toast.offsetWidth;
    toast.classList.add('bday-toast--in');
    sessionStorage.setItem(SHOWN_KEY, '1');

    // Populate 2–3 product picks (wishlist / recs) once resolved.
    pickForToast().then(function (picks) {
      var row = toast.querySelector('.bday-toast-recs');
      if (!row || !picks || !picks.length) return;
      row.setAttribute('aria-hidden', 'false');
      row.innerHTML =
        '<span class="bday-toast-recs-label">Picked for you</span>' +
        '<div class="bday-toast-recs-imgs">' +
          picks.map(function (p) {
            return '<img src="' + esc(p.image) + '" alt="' + esc(p.name) + '" title="' + esc(p.name) + '">';
          }).join('') +
        '</div>';
    });

    toast.querySelector('.bday-toast-close').addEventListener('click', function () { dismiss(toast); });
    toast.querySelector('.bday-toast-cta').addEventListener('click', function () {
      // Pre-apply the reward so it's already waiting at checkout, then go shop.
      BirthdayPromo.apply();
      dismiss(toast);
      if (window.Router && window.Router.navigate) window.Router.navigate('/');
    });

    // Auto-dismiss after a comfortable read.
    setTimeout(function () { if (toast.parentNode) dismiss(toast); }, 14000);
  }

  // Show on the sign-in moment (the demo highlight) …
  window.addEventListener('identity:changed', function (e) {
    if (e.detail && e.detail.firstName === ELIGIBLE_NAME) {
      // Small delay so it lands after the modal closes and the route re-renders.
      setTimeout(showToast, 450);
    } else {
      // Signed out — clear the once-per-session guard and all applied offers.
      sessionStorage.removeItem(SHOWN_KEY);
      Offers.clearAll();
    }
  });

  // … and once on load if Rachel is already signed in (persisted session).
  function onReady() {
    if (BirthdayPromo.isEligible() && sessionStorage.getItem(SHOWN_KEY) !== '1') {
      setTimeout(showToast, 600);
    }
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', onReady);
  } else {
    onReady();
  }
})();
