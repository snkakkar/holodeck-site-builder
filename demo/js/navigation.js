/**
 * HOLO_NAV — unified navigation controller for the exported demo.
 *
 * Why this exists: each deck section (intro / rachel / demo / bv) used to own
 * a duplicated `keydown` listener gated on `activeSection`, and there was no
 * deep-linking or slide counter. This module centralises that:
 *
 *   - Sections REGISTER a normalised adapter (0-based goToIndex/getCurrent/…).
 *     The existing per-section carousel logic is untouched — it just exposes
 *     hooks instead of binding its own global key handler.
 *   - One global keydown handler dispatches to the ACTIVE section:
 *       ← / →           prev / next slide
 *       Space           next slide
 *       Home / End      first / last slide
 *       1..9            jump to the Nth nav section
 *   - Hash deep-links  #section=<key>&slide=<n>  (n is 1-based, human-friendly).
 *     Written on every section/slide change (replaceState-style, no history
 *     spam) and re-synced on `hashchange`.
 *   - A slide counter ("3 / 7") in the ribbon, driven from registered totals.
 *
 * Backward compatible: if no sections register (older shells), the module is
 * inert. `setNavActive` is kept for any standalone pages that still call it.
 *
 * Load order: AFTER the section build IIFEs so `register()` calls land, OR the
 * shell calls HOLO_NAV.boot() once at the end. Sections may register before or
 * after boot(); boot() is idempotent.
 */
(function (global) {
  "use strict";

  var sections = {};        // key -> adapter
  var order = [];           // section keys in nav order
  var showSectionFn = null; // shell-provided section switcher
  var getActiveFn = null;   // shell-provided active-section getter
  var booted = false;
  var suppressHash = false; // guard so our own hash writes don't re-trigger sync

  // ── Section registry ───────────────────────────────────────────
  // adapter: {
  //   key, goToIndex(i), getCurrent() -> 0-based, getTotal() -> int,
  //   getIds?() -> [domId,...]   (optional, for diagnostics)
  // }
  function register(adapter) {
    if (!adapter || !adapter.key) return;
    sections[adapter.key] = adapter;
    if (order.indexOf(adapter.key) === -1) order.push(adapter.key);
    updateCounter();
  }

  // The shell wires these once.
  function configure(opts) {
    opts = opts || {};
    if (opts.showSection) showSectionFn = opts.showSection;
    if (opts.getActive)   getActiveFn   = opts.getActive;
    if (opts.order && opts.order.length) order = opts.order.slice();
  }

  function activeKey() {
    if (getActiveFn) return getActiveFn();
    return global._holoActiveSection || null;
  }

  function activeAdapter() {
    var k = activeKey();
    return k && sections[k] ? sections[k] : null;
  }

  // ── Slide counter in the ribbon ────────────────────────────────
  function counterEl() { return document.getElementById("nav-slide-counter"); }

  function updateCounter() {
    var el = counterEl();
    if (!el) return;
    var a = activeAdapter();
    if (!a || typeof a.getTotal !== "function" || a.getTotal() <= 1) {
      el.textContent = "";
      el.style.visibility = "hidden";
      return;
    }
    var cur = (typeof a.getCurrent === "function" ? a.getCurrent() : 0) + 1;
    var total = a.getTotal();
    el.textContent = cur + " / " + total;
    el.style.visibility = "visible";
  }

  // ── Hash deep-links ────────────────────────────────────────────
  // #section=<key>&slide=<1-based>
  function parseHash() {
    var h = (global.location && global.location.hash || "").replace(/^#/, "");
    if (!h) return null;
    var out = {};
    h.split("&").forEach(function (pair) {
      var kv = pair.split("=");
      if (kv.length === 2) out[decodeURIComponent(kv[0])] = decodeURIComponent(kv[1]);
    });
    if (!out.section) return null;
    var slide = parseInt(out.slide, 10);
    return { section: out.section, slide: isNaN(slide) ? null : slide };
  }

  function writeHash() {
    if (suppressHash) return;
    var k = activeKey();
    if (!k) return;
    var a = sections[k];
    var slide = (a && typeof a.getCurrent === "function") ? a.getCurrent() + 1 : 1;
    var hash = "#section=" + encodeURIComponent(k) + "&slide=" + slide;
    if (("#" + (global.location.hash || "").replace(/^#/, "")) === hash) return;
    suppressHash = true;
    try {
      if (global.history && global.history.replaceState) {
        global.history.replaceState(null, "", hash);
      } else {
        global.location.hash = hash;
      }
    } catch (e) { /* sandboxed file:// can throw on replaceState — ignore */ }
    suppressHash = false;
  }

  // Public: sections/shell call this AFTER a slide or section change so the
  // hash + counter stay in sync.
  function notifyChange() {
    updateCounter();
    writeHash();
  }

  function applyHash(h) {
    if (!h) return;
    if (order.indexOf(h.section) === -1 && !sections[h.section]) return;
    if (showSectionFn) showSectionFn(h.section);
    if (h.slide != null) {
      var a = sections[h.section];
      if (a && typeof a.goToIndex === "function") {
        // defer one tick so the section's slides exist / are active
        setTimeout(function () { a.goToIndex(h.slide - 1); updateCounter(); }, 0);
      }
    }
    updateCounter();
  }

  // Switch to another section and land on a specific slide. `landing` is
  // either a 0-based index or the string "last" (resolved once the target
  // section's slides exist). Mirrors applyHash's deferred goToIndex so the
  // section's carousel has a tick to become active before we move it.
  function crossToSection(key, landing) {
    if (!showSectionFn) return false;
    showSectionFn(key);
    var a = sections[key];
    if (a && typeof a.goToIndex === "function") {
      setTimeout(function () {
        var idx = landing;
        if (landing === "last") {
          var t = (typeof a.getTotal === "function") ? a.getTotal() : 1;
          idx = Math.max(0, t - 1);
        }
        a.goToIndex(idx);
        notifyChange();
      }, 0);
    }
    notifyChange();
    return true;
  }

  // ── Global keyboard ────────────────────────────────────────────
  function onKeydown(e) {
    // Digit → jump to Nth nav section.
    if (/^[1-9]$/.test(e.key)) {
      var idx = parseInt(e.key, 10) - 1;
      if (idx < order.length && showSectionFn) {
        showSectionFn(order[idx]);
        notifyChange();
      }
      return;
    }
    var a = activeAdapter();
    if (!a || typeof a.goToIndex !== "function") return;
    var cur = typeof a.getCurrent === "function" ? a.getCurrent() : 0;
    var total = typeof a.getTotal === "function" ? a.getTotal() : 1;
    // Where the active section sits in nav order, so ←/→ can roll over the
    // section boundary into the adjacent section (whole-deck traversal).
    var secIdx = order.indexOf(activeKey());
    if (e.key === "ArrowRight" || e.key === " ") {
      e.preventDefault();
      if (cur + 1 < total) {
        a.goToIndex(cur + 1); notifyChange();
      } else if (secIdx > -1 && secIdx + 1 < order.length) {
        // Past the last slide → first slide of the next section.
        crossToSection(order[secIdx + 1], 0);
      }
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      if (cur - 1 >= 0) {
        a.goToIndex(cur - 1); notifyChange();
      } else if (secIdx > 0) {
        // Before the first slide → last slide of the previous section.
        crossToSection(order[secIdx - 1], "last");
      }
    } else if (e.key === "Home") {
      e.preventDefault(); a.goToIndex(0); notifyChange();
    } else if (e.key === "End") {
      e.preventDefault(); a.goToIndex(total - 1); notifyChange();
    }
  }

  // ── Boot ───────────────────────────────────────────────────────
  function boot() {
    if (booted) { applyHash(parseHash()); updateCounter(); return; }
    booted = true;
    document.addEventListener("keydown", onKeydown);
    global.addEventListener("hashchange", function () {
      if (suppressHash) return;
      applyHash(parseHash());
    });
    // Honour a deep-link present at load.
    applyHash(parseHash());
    updateCounter();
  }

  // ── Legacy: standalone-page nav highlighting (kept for compat) ──
  function setNavActive(pageFile) {
    var links = document.querySelectorAll(".site-nav-links a, .site-nav-links button");
    Array.prototype.forEach.call(links, function (el) {
      var href = el.getAttribute("href") || (el.dataset && el.dataset.href) || "";
      if (href && href.indexOf(pageFile) !== -1) el.classList.add("active");
      else el.classList.remove("active");
    });
  }

  global.HOLO_NAV = {
    register: register,
    configure: configure,
    boot: boot,
    notifyChange: notifyChange,
    updateCounter: updateCounter,
    setNavActive: setNavActive,
  };
  // Keep the old global function name working for any inline callers.
  global.setNavActive = setNavActive;
})(window);
