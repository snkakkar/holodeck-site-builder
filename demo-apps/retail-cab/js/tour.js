/* Retail CAB — guided storefront tour.
   A self-contained spotlight walkthrough of what this demo shows. Loaded last
   from index.html; styles are injected here so the file ships alone in the
   export. On by default; BrandConfig.tour.enabled === false (set by the builder) turns it off. A small
   "Take the tour" pill opens it; ?tour=1 starts it automatically.
   Copy says "illustrates" on purpose: the agent, profile and checkout are
   scripted demo surfaces, not live Salesforce connections. */
(function () {
  "use strict";

  // On unless the builder explicitly turned it off, so storefronts generated
  // before the flag existed still get the walkthrough.
  var cfg = window.BrandConfig && window.BrandConfig.tour;
  if (!window.BrandConfig || (cfg && cfg.enabled === false)) return;

  var brand = (window.BrandConfig.brand && window.BrandConfig.brand.name) || "this storefront";
  var agent = (window.BrandConfig.brand && window.BrandConfig.brand.agentName) || "the AI shopping agent";

  var STOPS = [
    { sel: ".logo", title: "A storefront built for " + brand,
      body: "Brand, colors, navigation, catalog and photos were generated for this customer from their website and story. Nothing here is a generic template." },
    { sel: "#main-nav", title: "Navigation from the brand's catalog",
      body: "Categories and product pages are driven by the generated catalog, so every link leads to real demo products." },
    { sel: "#header-search-btn", title: "Cimulate-style intent search",
      body: "Open search and try a natural phrase. It illustrates intent-aware results, type-ahead, and trend chips, with a handoff to " + agent + "." },
    { sel: "#header-search-btn", title: "Agentforce-style shopping agent",
      body: "Ask " + agent + " for a look or set a budget. The scripted conversation curates products in the page and remembers what it showed." },
    { sel: "#signin-link, #header-account-btn", title: "Personalization after sign-in",
      body: "Sign in with any email. The home page switches to a personalized hero, \"Recommended for You\", and a loyalty reward." },
    { sel: "#header-account-btn", title: "Data 360 unified profile",
      body: "The profile page illustrates a unified customer profile: style persona, loyalty tier, preferences and lifetime value in one view." },
    { sel: ".cart-btn", title: "Commerce Cloud-style cart and checkout",
      body: "Add something to the cart and check out. Offers stack and apply at checkout, illustrating the commerce experience end to end." },
    { sel: "#app-root", title: "Shop the Look",
      body: "Scroll the home page for trends and styled looks. Tap a tag on a look to jump to the exact product." }
  ];

  var SEEN_KEY = "holo-cab-tour-seen";
  var idx = 0, layer, ring, card, pill;

  function css() {
    if (document.getElementById("holoTourCss")) return;
    var s = document.createElement("style");
    s.id = "holoTourCss";
    s.textContent =
      ".holo-tour-pill{position:fixed;right:18px;bottom:18px;z-index:99990;background:var(--primary,#222);color:#fff;border:0;border-radius:999px;padding:10px 16px;font:600 13px/1 system-ui,sans-serif;cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,.28)}" +
      ".holo-tour-layer{position:fixed;inset:0;z-index:99995}" +
      ".holo-tour-ring{position:fixed;border-radius:8px;box-shadow:0 0 0 9999px rgba(0,0,0,.55);transition:all .2s;pointer-events:none}" +
      ".holo-tour-card{position:fixed;width:min(340px,calc(100vw - 24px));background:#fff;color:#222;border-radius:10px;padding:16px 16px 12px;font:14px/1.45 system-ui,sans-serif;box-shadow:0 10px 32px rgba(0,0,0,.35)}" +
      ".holo-tour-card h4{margin:0 0 6px;font-size:15px}.holo-tour-card p{margin:0 0 12px}" +
      ".holo-tour-foot{display:flex;align-items:center;justify-content:space-between;gap:8px}" +
      ".holo-tour-foot span{color:#777;font-size:12px}.holo-tour-foot button{border:1px solid #ccc;background:#fff;border-radius:6px;padding:6px 10px;font:600 12px system-ui,sans-serif;cursor:pointer}" +
      ".holo-tour-foot .holo-tour-next{background:var(--primary,#222);border-color:var(--primary,#222);color:#fff}";
    document.head.appendChild(s);
  }

  function visible(el) { var r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; }
  function target(sel) {
    var list = document.querySelectorAll(sel);
    for (var i = 0; i < list.length; i++) if (visible(list[i])) return list[i];
    return null;
  }

  function close(markSeen) {
    if (layer && layer.parentNode) layer.parentNode.removeChild(layer);
    layer = ring = card = null;
    document.removeEventListener("keydown", onKey, true);
    if (markSeen) { try { localStorage.setItem(SEEN_KEY, "1"); } catch (e) { /* storage off */ } }
  }

  function draw() {
    var stop = STOPS[idx], el = target(stop.sel), pad = 6, r;
    if (el) {
      el.scrollIntoView({ block: "nearest", inline: "nearest" });
      r = el.getBoundingClientRect();
      // #app-root is tall: spotlight just the viewport-visible slice.
      var top = Math.max(r.top, 0), bottom = Math.min(r.bottom, window.innerHeight);
      ring.style.cssText = "left:" + (r.left - pad) + "px;top:" + (top - pad) + "px;width:" + (r.width + pad * 2) + "px;height:" + Math.max(bottom - top, 0) + "px";
      r = { left: r.left, top: top, bottom: bottom, width: r.width };
    } else {
      ring.style.cssText = "left:50%;top:50%;width:0;height:0";
      r = { left: window.innerWidth / 2, top: window.innerHeight / 2, bottom: window.innerHeight / 2, width: 0 };
    }
    card.innerHTML = "<h4></h4><p></p><div class=\"holo-tour-foot\"><button class=\"holo-tour-skip\">Skip</button><span></span><div>" +
      (idx > 0 ? "<button class=\"holo-tour-back\">Back</button> " : "") +
      "<button class=\"holo-tour-next\">" + (idx === STOPS.length - 1 ? "Done" : "Next") + "</button></div></div>";
    card.querySelector("h4").textContent = stop.title;
    card.querySelector("p").textContent = stop.body;
    card.querySelector("span").textContent = (idx + 1) + " / " + STOPS.length;
    card.querySelector(".holo-tour-skip").onclick = function () { close(true); };
    card.querySelector(".holo-tour-next").onclick = next;
    var b = card.querySelector(".holo-tour-back"); if (b) b.onclick = back;
    var cw = Math.min(340, window.innerWidth - 24);
    var left = Math.min(Math.max(12, r.left + r.width / 2 - cw / 2), window.innerWidth - cw - 12);
    var below = r.bottom + 16 + 180 < window.innerHeight;
    card.style.left = left + "px";
    card.style.top = el ? (below ? (r.bottom + 16) + "px" : Math.max(12, r.top - 16 - 170) + "px") : "30%";
  }

  function next() { if (idx >= STOPS.length - 1) return close(true); idx++; draw(); }
  function back() { if (idx > 0) { idx--; draw(); } }
  function onKey(e) {
    if (e.key === "Escape") close(true);
    else if (e.key === "ArrowRight") next();
    else if (e.key === "ArrowLeft") back();
  }

  function start() {
    close(false);
    css();
    idx = 0;
    layer = document.createElement("div"); layer.className = "holo-tour-layer";
    ring = document.createElement("div"); ring.className = "holo-tour-ring";
    card = document.createElement("div"); card.className = "holo-tour-card";
    layer.appendChild(ring); layer.appendChild(card);
    document.body.appendChild(layer);
    document.addEventListener("keydown", onKey, true);
    draw();
  }

  css();
  pill = document.createElement("button");
  pill.className = "holo-tour-pill";
  pill.type = "button";
  pill.textContent = "Take the tour";
  pill.onclick = start;
  document.body.appendChild(pill);
  window.addEventListener("resize", function () { if (layer) draw(); });

  var auto = /[?&]tour=1\b/.test(window.location.search);
  if (auto) start();
})();
