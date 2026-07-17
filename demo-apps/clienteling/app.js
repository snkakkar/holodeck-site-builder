/* ============================================================
   app.js — Clienteling controller (industry-agnostic)
   View rendering · associate actions · modals · chat wiring
   Story: a traveling VIP member signs up in-app -> arrival alert ->
   check-in greeting w/ their home-store manager's message -> event ->
   cross-store inventory hold at their home store.
   ALL customer/industry/story copy is read from window.APP_CONFIG via
   the tokens()/tpl()/conciergeName()/unitNoun() helpers — no wine or
   customer literals live here, so a generated (non-wine) config reads
   in its own industry voice.
   NOTE: static demo. All markup is app-controlled; free text is
   passed through esc() before injection. No external/untrusted HTML.
   ============================================================ */

const setHTML = (el, html) => { el.innerHTML = html; };
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/* ---- config accessors (neutral, industry-agnostic) ----
   Every user-visible chrome string comes from window.APP_CONFIG so a
   generated (non-wine) config reads in its own industry vocabulary. */
const CFG = window.APP_CONFIG;
const conciergeName = () => (CFG.brand && CFG.brand.conciergeName) || "Concierge";
const unitNoun = () => CFG.unitNoun || "items";
const navLabel = (k, dflt) => (CFG.navLabels && CFG.navLabels[k]) || dflt;
const featuredProduct = () => productById((CFG.event && CFG.event.featuredWineId) || CFG.featuredId) || (CFG.catalog && CFG.catalog[0]) || {};
// store.kpis is an ARRAY of {label,value,guest?,signup?,money?}. These helpers
// tolerate a legacy object shape too, so any config renders.
function kpiList() {
  const k = (CFG.store && CFG.store.kpis) || [];
  if (Array.isArray(k)) return k;
  return Object.keys(k).map((key) => ({ label: key, value: k[key] }));
}
function kpiBy(flag, idx) {
  const list = kpiList();
  const hit = list.find((x) => x && x[flag]);
  return hit || list[idx] || { label: "", value: 0 };
}
const kpiGuest = () => kpiBy("guest", 0);
const kpiSignup = () => kpiBy("signup", 1);
const kpiVal = (o) => (o && o.money ? money(o.value) : (o ? o.value : ""));

// Interpolate {tokens} in copy strings from config. Keeps app.js free of
// customer/story literals — the copy lives in APP_CONFIG.copy (one file).
function tokens() {
  const c = CFG.customer || {};
  const mgr = c.homeStoreManager || {};
  const feat = featuredProduct();
  const first = String(c.name || "").trim().split(/\s+/)[0] || (c.name || "guest");
  return {
    customer: c.name || "the guest",
    firstName: first,
    rank: c.rank || "Member",
    memberSince: c.memberSince || "",
    manager: mgr.name || "their home store",
    managerStore: mgr.store || c.location || "their home store",
    event: (CFG.event && CFG.event.name) || "event",
    feature: feat.name || "the featured item",
    store: (CFG.store && CFG.store.name) || "the store",
    concierge: conciergeName(),
    unit: unitNoun(),
  };
}
function tpl(key, fallback) {
  const raw = (CFG.copy && CFG.copy[key] != null) ? CFG.copy[key] : (fallback || "");
  const t = tokens();
  return String(raw).replace(/\{(\w+)\}/g, (m, k) => (t[k] != null ? t[k] : m));
}

const ICON = {
  store: '<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M13.5 21v-7.5h-3V21M3 13.5V21h18v-7.5M3.75 9.75L5.25 4.5h13.5l1.5 5.25M3.75 9.75h16.5"/></svg>',
  web: '<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 21a9 9 0 100-18 9 9 0 000 18zm0 0c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3 7.5 7.03 7.5 12s2.015 9 4.5 9zM3 12h18"/></svg>',
  mobile: '<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M10.5 1.5H8.25A2.25 2.25 0 006 3.75v16.5a2.25 2.25 0 002.25 2.25h7.5A2.25 2.25 0 0018 20.25V3.75a2.25 2.25 0 00-2.25-2.25H13.5m-3 0V3h3V1.5m-3 0h3m-3 18.75h3"/></svg>',
  bag: '<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M15.75 10.5V6a3.75 3.75 0 10-7.5 0v4.5m11.356-1.993l1.263 12A1.125 1.125 0 0119.748 21H4.252a1.125 1.125 0 01-1.12-1.243l1.264-12A1.125 1.125 0 015.513 6.75h12.974c.576 0 1.059.435 1.119 1.007z"/></svg>',
  glass: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path stroke-linecap="round" stroke-linejoin="round" d="M6 3h12l-1 6a5 5 0 01-10 0L6 3zM12 14v6M8 21h8"/></svg>',
};

/* ============================================================
   VIEW SWITCHING
   ============================================================ */
function switchView(view) {
  document.querySelectorAll(".view").forEach((v) => v.classList.toggle("active", v.id === "view-" + view));
  document.querySelectorAll(".nav-item[data-view]").forEach((n) => n.classList.toggle("active", n.dataset.view === view));
  window.scrollTo({ top: 0, behavior: "smooth" });
}

/* ============================================================
   DASHBOARD (store floor)
   ============================================================ */
function renderDashboard() {
  const kpis = kpiList();
  const g = kpiGuest(), su = kpiSignup();

  // The primary walk-in (matches the profiled customer's rank, or the first
  // one) routes to the full profile; others to the event. Keyed off data, not
  // literal IDs, so a generated config with different IDs still routes right.
  const primaryRank = (APP_CONFIG.customer && APP_CONFIG.customer.rank) || "";
  const primaryWalkIn = APP_CONFIG.walkIns.find((w) => primaryRank && w.tier === primaryRank) || APP_CONFIG.walkIns[0];
  const walkInCards = APP_CONFIG.walkIns.map((w) => {
    const vip = primaryWalkIn ? w.id === primaryWalkIn.id : !!w.vip;
    const action = (primaryWalkIn && w.id === primaryWalkIn.id)
      ? "selectCoach('" + w.id + "'); switchView('profile')"
      : "selectCoach('" + w.id + "'); switchView('event')";
    return `
      <div class="card card-pad ${vip ? "teal-border" : ""}" style="position:relative;overflow:hidden">
        ${vip ? '<div style="position:absolute;right:-30px;top:-30px;width:110px;height:110px;border-radius:9999px;background:rgba(1,102,92,.1);filter:blur(28px)"></div>' : ""}
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;position:relative">
          <span class="pill ${vip ? "pill-teal" : "pill-dim"}">${esc(w.tag || "")}</span>
          <div class="avatar ${vip ? "avatar-teal" : "avatar-brushed"}" style="width:40px;height:40px;font-size:13px">${esc(w.initials || "")}</div>
        </div>
        <h3 class="serif" style="margin:0;font-size:20px;color:var(--charcoal)">${esc(w.headline || "")}</h3>
        <p class="dim" style="font-size:13px;margin:8px 0 0;line-height:1.5">${esc(w.detail || "")}</p>
        <button class="btn ${vip ? "btn-primary" : "btn-ghost-teal"} btn-block" style="margin-top:14px" onclick="${action}">${esc(w.cta || "")}</button>
      </div>`;
  }).join("");

  const taskRows = APP_CONFIG.tasks.map((t) => `
    <div class="list-row" style="gap:10px">
      <span style="width:8px;height:8px;border-radius:9999px;flex-shrink:0;background:${t.priority === "high" ? "var(--red)" : t.priority === "med" ? "var(--gold)" : "var(--warm-dim)"}"></span>
      <div style="flex:1">
        <div style="font-size:13px;color:var(--charcoal)">${t.text}</div>
        <div class="dim" style="font-size:11px">${t.due}</div>
      </div>
      <button class="btn btn-sm" onclick="toast('Task completed')">Done</button>
    </div>`).join("");

  const feat = featuredProduct();
  const kpiColors = ["var(--teal)", "var(--gold)", "var(--teal)", "var(--green)", "var(--gold)"];
  const kpiGridCells = kpis.map((kp, i) => {
    const cls = i % 2 === 0 ? "teal-text" : "gold-text";
    return `<div class="kpi"><div class="top-line" style="background:${kpiColors[i % kpiColors.length]}"></div><div class="v ${cls}">${kpiVal(kp)}</div><div class="l">${esc(kp.label || "")}</div></div>`;
  }).join("");

  setHTML(document.getElementById("view-dashboard"), `
    <div class="card" style="position:relative;overflow:hidden;margin-bottom:20px;background:linear-gradient(120deg,var(--teal),var(--teal-dk))">
      <div style="position:relative;padding:30px 28px;display:flex;align-items:center;gap:22px;color:#fff">
        <div class="tw-mark" style="width:74px;height:74px;background:rgba(255,255,255,.14);box-shadow:none">${ICON.glass.replace("viewBox", 'width="34" height="34" viewBox')}</div>
        <div>
          <div class="eyebrow" style="color:rgba(255,255,255,.85)">Clienteling &middot; ${esc((APP_CONFIG.brand && APP_CONFIG.brand.name) || "")}</div>
          <h2 class="serif" style="margin:6px 0 0;font-size:30px;line-height:1.1">The art of the relationship.</h2>
          <p style="font-size:13.5px;margin:8px 0 0;max-width:480px;color:rgba(255,255,255,.85)">Every guest at the ${esc(APP_CONFIG.store.name)} store is a clienteling moment &mdash; a unified view that helps you serve better and sell more.</p>
        </div>
      </div>
    </div>

    <div id="arrivalBanner"></div>

    <div class="eyebrow">Performance</div>
    <h1 class="serif silver-text" style="margin:4px 0 0;font-size:30px">${esc(APP_CONFIG.store.name)} Store &middot; ${esc(navLabel("dashboard", "Floor Dashboard"))}</h1>
    <p class="dim" style="font-size:13.5px;margin:6px 0 18px">Shift from transactional selling to a clienteling culture &mdash; recognize every guest, act on every signal.</p>

    <div class="traffic">
      <div class="t-card"><div style="position:absolute;top:0;left:0;right:0;height:2px;background:var(--warm-dim)"></div><div class="t-v" id="guestCount">${g.value}</div><div class="t-l">${esc(g.label || "Guests today")}</div></div>
      <div class="t-card"><div style="position:absolute;top:0;left:0;right:0;height:2px;background:var(--teal)"></div><div class="t-v teal-text" id="signupCount">${su.value}</div><div class="t-l">${esc(su.label || "Sign-ups today")}</div></div>
      <div class="t-card"><div style="position:absolute;top:0;left:0;right:0;height:2px;background:var(--gold)"></div><div class="t-v gold-text">${kpiVal(kpiList()[2] || { value: 0 })}</div><div class="t-l">${esc((kpiList()[2] || {}).label || "VIP arrivals")}</div></div>
    </div>

    <div class="card card-pad brushed" style="margin-bottom:18px;display:flex;gap:20px;align-items:center;flex-wrap:wrap">
      <div class="bottle-frame" style="width:80px;height:150px">${productImage(feat, 62, 140)}</div>
      <div style="flex:1;min-width:220px">
        <div class="eyebrow">Tonight at ${esc(APP_CONFIG.store.name)}</div>
        <h3 class="serif silver-text" style="margin:4px 0 0;font-size:23px">${esc(APP_CONFIG.event.name)}</h3>
        <p class="dim" style="font-size:13px;margin:6px 0 0">${esc(APP_CONFIG.event.date)} &middot; ${esc(APP_CONFIG.event.host)} &middot; ${APP_CONFIG.event.attendees.length} of ${APP_CONFIG.event.seatsTotal} seats filled</p>
        <p style="font-size:12.5px;color:var(--charcoal);margin:8px 0 0">Featured: <strong class="teal">${esc(feat.name)} ${esc(feat.vintage || "")}</strong></p>
        <button class="btn btn-ghost-teal btn-sm" style="margin-top:12px" onclick="switchView('event')">Manage the ${esc((APP_CONFIG.event.type || "event").toLowerCase())} &rarr;</button>
      </div>
    </div>

    <div class="kpi-grid" style="margin-bottom:18px">${kpiGridCells}</div>

    <div class="layout-2col">
      <div>
        <div class="card card-pad" style="margin-bottom:18px">
          <div style="display:flex;align-items:center;gap:10px">
            <span style="width:9px;height:9px;border-radius:9999px;background:var(--teal);display:inline-block"></span>
            <span class="eyebrow">Agentforce &middot; Live Guest Alert</span>
          </div>
          <p class="dim" style="font-size:13px;margin:6px 0 16px">Real-time detection &mdash; guests who just signed up or checked in.</p>
          <div class="grid-2">${walkInCards}</div>
        </div>

        <div class="card card-pad">
          <div class="section-title"><span class="eyebrow">Today's Clienteling Tasks &middot; Einstein-prioritized</span></div>
          ${taskRows}
        </div>
      </div>

      <div>
        <div class="card" style="overflow:hidden;margin-bottom:16px">
          <div class="brushed" style="padding:14px 16px;border-bottom:1px solid var(--hairline);display:flex;align-items:center;gap:10px">
            <div class="avatar avatar-teal" style="width:30px;height:30px">${ICON.glass.replace("viewBox", 'width="15" height="15" viewBox')}</div>
            <div><div style="font-size:13.5px;color:var(--charcoal)">Agentforce &middot; ${esc(conciergeName())}</div><div class="dim" style="font-size:10px;letter-spacing:.12em">REAL-TIME FLOOR ASSIST</div></div>
          </div>
          <div class="card-pad" id="coachBody">
            <p class="dim" style="font-size:13px;line-height:1.6;margin:0">Select a guest alert to receive tailored conversation starters and the next best action.</p>
          </div>
        </div>
        <div class="card card-pad">
          <div class="eyebrow" style="margin-bottom:10px">Today's Coaching Tip</div>
          <p style="font-size:13.5px;color:var(--charcoal);line-height:1.6;margin:0">Lead with the relationship, not the register. Recognize the guest, relay what their home store knows, and the sale follows.</p>
          <button class="btn btn-ghost-teal btn-sm btn-block" style="margin-top:14px" onclick="openChat()">Open full ${esc(conciergeName())} &rarr;</button>
        </div>
      </div>
    </div>
  `);
}

function selectCoach(key) {
  const d = APP_CONFIG.coach[key];
  const body = document.getElementById("coachBody");
  if (!body || !d) return;
  setHTML(body, `
    <span class="pill pill-teal">${esc(d.badge || "")}</span>
    <h4 class="serif" style="margin:8px 0 0;font-size:17px;color:var(--charcoal)">${esc(d.title || "")}</h4>
    <div class="eyebrow" style="color:var(--warm-gray);font-size:9.5px;margin-top:12px">Conversation Starters</div>
    <ul style="margin:6px 0 0;padding-left:4px;list-style:none">
      ${(d.starters || []).map((s) => `<li style="display:flex;gap:8px;font-size:13px;color:var(--charcoal);margin-top:7px"><span class="teal">&bull;</span><span>${esc(s)}</span></li>`).join("")}
    </ul>
    <div class="alert-box" style="border-color:rgba(1,102,92,.3);background:rgba(1,102,92,.06);margin-top:12px">
      <div class="eyebrow" style="font-size:9.5px">Next Best Action</div>
      <div style="font-size:13px;color:var(--charcoal);margin-top:4px">${esc(d.nba || "")}</div>
    </div>
    <button class="btn btn-ghost-teal btn-sm btn-block" style="margin-top:12px" onclick="openChat()">Ask ${esc(conciergeName())} more &rarr;</button>`);
}

/* ============================================================
   INTRO SCENE (standalone, before the clienteling app)
   Alan signs up for the class in his mobile app (iframe over a
   store-background). Advancing "enters the store" -> reveals the
   clienteling app and fires the VIP arrival notification.
   ============================================================ */
function enterStore() {
  const intro = document.getElementById("introScene");
  if (intro) {
    intro.classList.add("leaving");
    setTimeout(() => { intro.style.display = "none"; }, 600);
  }
  // Alan has just signed up in his app -> reflect it, then alert the floor.
  bumpSignup();
  scheduleArrivalDrop();
}

/* ============================================================
   CHECK-IN (Scene 4)
   ============================================================ */
function renderSignin() {
  setHTML(document.getElementById("view-signin"), `
    <div class="kiosk-wrap">
      <div class="kiosk" id="kioskCard">
        <div class="tw-mark" style="width:60px;height:60px;margin:0 auto 14px">${ICON.glass.replace("viewBox", 'width="32" height="32" viewBox')}</div>
        <div class="eyebrow">Guest Check-In &middot; ${esc(APP_CONFIG.store.name)}</div>
        <h2 class="serif silver-text" style="margin:6px 0 0;font-size:26px">${esc(APP_CONFIG.event.name)}</h2>
        <p class="dim" style="font-size:13px;margin:8px 0 18px">Check a guest in for tonight's ${esc((APP_CONFIG.event.type || "event").toLowerCase())}. Their unified profile surfaces instantly for the associate.</p>
        <input class="field" id="suFirst" placeholder="First name" />
        <input class="field" id="suLast" placeholder="Last name" />
        <input class="field" id="suEmail" placeholder="Email" />
        <button class="btn btn-primary btn-block" style="margin-top:14px" onclick="submitSignin()">Check In</button>
        <button class="btn btn-block" style="margin-top:8px;background:none;border:none;color:var(--warm-gray)" onclick="skipSignin()">Skip &rarr;</button>
        <div class="kiosk-hint">Demo: try <b onclick="prefillSignin()">${esc(tokens().customer)}</b></div>
      </div>
    </div>`);
}
function skipSignin() { switchView("dashboard"); scheduleArrivalDrop(); }
function prefillSignin() {
  const c = APP_CONFIG.customer || {};
  const parts = String(c.name || "").trim().split(/\s+/);
  document.getElementById("suFirst").value = parts[0] || "";
  document.getElementById("suLast").value = parts.slice(1).join(" ") || "";
  document.getElementById("suEmail").value = (c.channels && c.channels.email) || "";
}
function submitSignin() {
  const first = (document.getElementById("suFirst").value || "").trim().toLowerCase();
  const email = (document.getElementById("suEmail").value || "").trim().toLowerCase();
  const c = APP_CONFIG.customer || {};
  const custFirst = String(c.name || "").trim().split(/\s+/)[0].toLowerCase();
  // Match the primary customer by first name or email → surface the VIP flow.
  const isPrimary = (!!custFirst && first.indexOf(custFirst) > -1) ||
    ((c.channels && c.channels.email) ? email && email === String(c.channels.email).toLowerCase() : false);

  if (isPrimary) {
    bumpSignup();
    setHTML(document.getElementById("kioskCard"), `
      <div class="tw-mark" style="width:56px;height:56px;margin:0 auto 12px">${ICON.glass.replace("viewBox", 'width="30" height="30" viewBox')}</div>
      <span class="pill pill-teal">&#9733; ${esc((c.rank || "MEMBER").toUpperCase())} &middot; CHECKED IN</span>
      <h2 class="serif silver-text" style="margin:12px 0 0;font-size:26px">${esc(tpl("checkinGreeting", "Greet {firstName} by name."))}</h2>
      <p class="dim" style="font-size:13px;margin:8px 0 0">${esc(tpl("checkinSub", "{rank} member since {memberSince} · traveling from {managerStore}."))}</p>

      <div class="marie-note" style="margin-top:16px;text-align:left">
        <div class="eyebrow" style="font-size:9px;color:var(--golddim)">${esc(tpl("managerNoteLabel", "MESSAGE FROM {manager} · THEIR HOME STORE"))}</div>
        <div class="quote">&ldquo;${esc(APP_CONFIG.managerMessage.text)}&rdquo;</div>
      </div>

      <div class="alert-box" style="margin-top:14px;text-align:left;border-color:rgba(1,102,92,.3);background:rgba(1,102,92,.05)">
        <div class="eyebrow" style="font-size:9px">Say this</div>
        <div style="font-size:13px;color:var(--charcoal);margin-top:4px">${esc(tpl("sayThis", ""))}</div>
      </div>

      <div style="display:flex;gap:8px;margin-top:16px">
        <button class="btn btn-primary btn-block" onclick="switchView('profile')">Open Full Profile</button>
        <button class="btn btn-block btn-ghost-teal" onclick="switchView('event')">Go to ${esc(APP_CONFIG.event.type || "Event")}</button>
      </div>
      <button class="btn btn-block" style="margin-top:8px;background:none;border:none;color:var(--warm-gray)" onclick="renderSignin()">Check in another guest</button>`);
    scheduleArrivalDrop();
  } else {
    const name = first ? first.charAt(0).toUpperCase() + first.slice(1) : "guest";
    bumpSignup();
    setHTML(document.getElementById("kioskCard"), `
      <div class="tw-mark" style="width:56px;height:56px;margin:0 auto 12px">${ICON.glass.replace("viewBox", 'width="30" height="30" viewBox')}</div>
      <h2 class="serif silver-text" style="margin:0;font-size:24px">Welcome, ${esc(name)}!</h2>
      <p class="dim" style="font-size:13px;margin:10px 0 18px">${esc(tpl("genericCheckedIn", "You're checked in for tonight's {event}. Enjoy."))}</p>
      <button class="btn btn-block" onclick="renderSignin()">Check in another guest</button>`);
  }
}

/* ============================================================
   PROFILE (Customer 360)
   ============================================================ */
function renderProfile() {
  const c = APP_CONFIG.customer;
  const feat = featuredProduct();
  const mgrStore = (c.homeStoreManager && c.homeStoreManager.store) || c.location || "home store";

  const historyRows = c.history.map((h) => `
    <div class="list-row">
      <div class="avatar avatar-brushed" style="width:34px;height:34px;font-size:11px">&#128722;</div>
      <div style="flex:1;min-width:0">
        <div style="font-size:13.5px;color:var(--charcoal)">${h.product}</div>
        <div class="dim" style="font-size:12px;margin-top:2px">${h.date} &middot; ${money(h.price)} &middot; qty ${h.qty}</div>
      </div>
      <span class="pill ${h.status.indexOf("Gifted") > -1 ? "pill-dim" : "pill-green"}">${h.status}</span>
    </div>`).join("");

  const affinityRows = c.affinities.map((a) => `
    <div style="margin-top:10px">
      <div style="display:flex;justify-content:space-between;font-size:12.5px"><span style="color:var(--charcoal)">${a.label}</span><span class="dim">${a.value}%</span></div>
      <div class="bar ${a.value >= 90 ? "" : "gold"}" style="margin-top:5px"><span style="width:${a.value}%"></span></div>
    </div>`).join("");

  const timelineRows = c.timeline.map((t) => `
    <div class="list-row" style="gap:12px">
      <div class="avatar avatar-brushed" style="width:30px;height:30px;color:var(--teal)">${ICON[t.icon] || ICON.bag}</div>
      <div style="flex:1"><div style="font-size:13px;color:var(--charcoal)">${t.text}</div></div>
      <span class="dim" style="font-size:11.5px;white-space:nowrap">${t.when}</span>
    </div>`).join("");

  setHTML(document.getElementById("view-profile"), `
    <div class="profile-layout">
      <div>
        <div class="card card-pad" style="text-align:center">
          <div class="avatar avatar-teal" style="width:88px;height:88px;font-size:30px;margin:0 auto">${c.initials}</div>
          <h2 class="serif silver-text" style="margin:14px 0 0;font-size:24px">${c.name}</h2>
          <div class="dim" style="font-size:12.5px;margin-top:2px">Home store: ${c.homeStoreManager.store} &middot; Member since ${c.memberSince}</div>
          <div style="margin-top:10px"><span class="pill pill-teal" style="font-size:11px;padding:5px 12px">&#9733; ${c.rank}</span></div>
          <div class="alert-box" style="margin-top:12px;text-align:left;border-color:rgba(184,151,90,.4)"><div class="eyebrow" style="font-size:9px;color:var(--golddim)">&#9992; Traveling</div><div style="font-size:12px;color:var(--charcoal);margin-top:4px">${c.travelNote}</div></div>
        </div>

        <div class="card card-pad" style="margin-top:14px">
          <div class="dim" style="font-size:10.5px;letter-spacing:.12em">PROPENSITY TO BUY</div>
          <div style="display:flex;align-items:center;gap:8px;margin-top:4px">
            <span style="font-size:17px;color:var(--charcoal)">${c.propensity}</span>
            <span style="margin-left:auto;display:flex;gap:3px">${[1, 2, 3, 4, 5].map(() => '<span style="width:6px;height:14px;border-radius:9999px;background:var(--teal)"></span>').join("")}</span>
          </div>
          <div class="bar green" style="margin-top:10px"><span style="width:${c.propensityScore}%"></span></div>
        </div>

        <div class="card card-pad" style="margin-top:14px">
          <div class="dim" style="font-size:10.5px;letter-spacing:.12em">LIFETIME VALUE</div>
          <div class="gold-text" style="font-size:26px;font-weight:400;margin-top:2px">${money(c.ltv)}</div>
          <div class="dim" style="font-size:11.5px;margin-top:2px">${money(c.ytdSpend)} YTD &middot; ${c.bottles} ${esc(unitNoun())} owned</div>
        </div>

        <div class="card card-pad" style="margin-top:14px">
          <div class="eyebrow" style="margin-bottom:8px">Affinities &middot; Data Cloud</div>
          ${affinityRows}
        </div>

        <div class="card card-pad" style="margin-top:14px">
          <div class="eyebrow" style="margin-bottom:8px">Details &amp; Dates</div>
          <div style="display:flex;justify-content:space-between;font-size:12.5px;padding:4px 0"><span class="dim">&#127874; Birthday</span><span style="color:var(--charcoal)">${c.birthday}</span></div>
          <div style="display:flex;justify-content:space-between;font-size:12.5px;padding:4px 0"><span class="dim">&#128141; Anniversary</span><span style="color:var(--charcoal)">${c.anniversary}</span></div>
          <div style="display:flex;justify-content:space-between;font-size:12.5px;padding:4px 0"><span class="dim">First visit</span><span style="color:var(--charcoal)">${c.firstVisit}</span></div>
          <div style="display:flex;justify-content:space-between;font-size:12.5px;padding:4px 0"><span class="dim">Preferred channel</span><span style="color:var(--charcoal)">${c.channels.preferred}</span></div>
        </div>

        <div class="card card-pad" style="margin-top:14px">
          <div class="eyebrow" style="margin-bottom:10px">Quick Actions</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
            <button class="btn btn-sm" onclick="openModal('draftMessage')">Message</button>
            <button class="btn btn-sm" onclick="openModal('call')">Call</button>
            <button class="btn btn-sm" onclick="openModal('fulfillment')">Hold ${esc(unitNoun())}</button>
            <button class="btn btn-sm" onclick="openModal('logNote')">Log note</button>
          </div>
          <button class="btn btn-ghost-teal btn-sm btn-block" style="margin-top:8px" onclick="switchView('dashboard')">&larr; Back to Floor</button>
        </div>
      </div>

      <div>
        <div class="card card-pad" style="margin-bottom:18px">
          <div class="section-title">
            <svg width="20" height="20" fill="none" stroke="var(--teal)" stroke-width="1.6" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M2.25 12.76c0 1.6 1.123 2.994 2.707 3.227 1.087.16 2.185.283 3.293.369V21l4.076-4.076a1.526 1.526 0 011.037-.443 48.282 48.282 0 005.68-.494c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.019z"/></svg>
            <h3 class="serif silver-text" style="margin:0;font-size:19px">Message from ${esc((APP_CONFIG.managerMessage.from && APP_CONFIG.managerMessage.from.name) || tokens().manager)} &middot; ${esc(tokens().customer)}'s Home Store</h3>
          </div>
          <div class="marie-note">
            <div class="eyebrow" style="font-size:9px;color:var(--golddim)">FROM ${esc(((APP_CONFIG.managerMessage.from && APP_CONFIG.managerMessage.from.name) || tokens().manager).toUpperCase())} &middot; ${esc(String(mgrStore).toUpperCase())} &middot; ${esc(APP_CONFIG.managerMessage.when)}</div>
            <div class="quote" style="margin-top:6px">&ldquo;${esc(APP_CONFIG.managerMessage.text)}&rdquo;</div>
          </div>
          <p class="dim" style="font-size:12.5px;margin:10px 0 0">Deliver this in person at check-in. It ties directly to tonight's feature &mdash; ${esc(feat.name || "the featured item")}.</p>
        </div>

        <div class="eyebrow" style="margin-bottom:10px">Einstein AI &middot; Next Best Action</div>
        <div class="card teal-border" style="overflow:hidden;margin-bottom:18px;cursor:pointer" onclick="openProduct('${feat.id}')">
          <div class="brushed" style="display:flex;flex-wrap:wrap;align-items:center;gap:20px;padding:22px">
            <div class="bottle-frame" style="width:110px;height:180px">${productImage(feat, 80, 170)}</div>
            <div style="flex:1;min-width:200px">
              <div class="eyebrow">${esc(feat.badge || "")}</div>
              <h3 class="serif silver-text" style="margin:4px 0 0;font-size:23px">${esc(feat.name)}</h3>
              <div class="wine-region" style="margin-top:4px">${esc([feat.region, feat.vintage].filter(Boolean).join(" · "))}</div>
              <div class="wine-notes">${esc(feat.tastingNotes || "")}</div>
              <div style="display:flex;align-items:center;gap:12px;margin-top:6px"><span class="wine-price">${money(feat.price)}</span><span class="score-badge"><span class="num">${feat.score}</span> ${esc(feat.scoreSource || "")}</span></div>
              <div class="dim" style="font-size:12px;margin-top:8px;display:flex;align-items:center;gap:6px"><span style="width:7px;height:7px;border-radius:9999px;background:var(--teal);display:inline-block"></span> ${(feat.stock && feat.stock.modesto) || 0} ${esc(unitNoun())} at their home store (${esc(mgrStore)})</div>
              <button class="btn btn-ghost-teal btn-sm" style="margin-top:12px" onclick="event.stopPropagation();openModal('fulfillment')">Hold ${esc(unitNoun())} for ${esc(tokens().firstName)} &rarr;</button>
            </div>
          </div>
        </div>

        <div class="card card-pad" style="margin-bottom:18px">
          <div class="eyebrow" style="margin-bottom:6px">Purchase History &middot; Data Cloud Unified</div>
          ${historyRows}
        </div>

        <div class="card card-pad" style="margin-bottom:18px">
          <div class="eyebrow" style="margin-bottom:6px">Cross-Channel Activity</div>
          ${timelineRows}
        </div>

        <div class="card" id="profileChatCard" style="overflow:hidden"></div>
      </div>
    </div>
  `);

  renderChat(document.getElementById("profileChatCard"));
}

/* ============================================================
   EVENT / CLASS VIEW (Scenes 1 & 5)
   ============================================================ */
function renderEvent() {
  const feat = featuredProduct();
  const mgrStore = (APP_CONFIG.customer && APP_CONFIG.customer.homeStoreManager && APP_CONFIG.customer.homeStoreManager.store) || (APP_CONFIG.customer && APP_CONFIG.customer.location) || "home store";
  const roster = APP_CONFIG.event.attendees.map((a) => `
    <div class="list-row">
      <div class="avatar ${a.vip ? "avatar-teal" : "avatar-brushed"}" style="width:34px;height:34px;font-size:11px">${a.initials}</div>
      <div style="flex:1;min-width:0">
        <div style="font-size:13.5px;color:var(--charcoal)">${a.name}${a.vip ? ' <span class="pill pill-teal" style="margin-left:4px">VIP</span>' : ""}</div>
        <div class="dim" style="font-size:11.5px">${a.tier} member</div>
      </div>
      ${a.vip
        ? '<button class="btn btn-sm btn-ghost-teal" onclick="switchView(\'profile\')">Open profile</button>'
        : '<button class="btn btn-sm" onclick="toast(\'Guest details — demo placeholder\')">View</button>'}
    </div>`).join("");

  setHTML(document.getElementById("view-event"), `
    <div class="page-head">
      <div>
        <div class="eyebrow">${esc((APP_CONFIG.event.type || "Event"))} Management</div>
        <h1 class="serif silver-text" style="margin:4px 0 0;font-size:30px">${esc(APP_CONFIG.event.name)}</h1>
        <p class="dim" style="font-size:13.5px;margin:6px 0 0">${esc(APP_CONFIG.event.date)} &middot; ${esc(APP_CONFIG.event.store)} &middot; Hosted by ${esc(APP_CONFIG.event.host)}</p>
      </div>
      <span class="demo-note">${APP_CONFIG.event.attendees.length} / ${APP_CONFIG.event.seatsTotal} seats</span>
    </div>

    <div class="kpi-grid" style="margin-bottom:18px">
      <div class="kpi"><div class="top-line" style="background:var(--teal)"></div><div class="v teal-text">${APP_CONFIG.event.attendees.length}</div><div class="l">Registered</div></div>
      <div class="kpi"><div class="top-line" style="background:var(--gold)"></div><div class="v gold-text">${APP_CONFIG.event.attendees.filter((a) => a.vip).length}</div><div class="l">VIP guests</div></div>
      <div class="kpi"><div class="top-line" style="background:var(--green)"></div><div class="v">${APP_CONFIG.event.seatsTotal - APP_CONFIG.event.attendees.length}</div><div class="l">Seats open</div></div>
      <div class="kpi"><div class="top-line" style="background:var(--teal)"></div><div class="v teal-text">${APP_CONFIG.catalog.length}</div><div class="l">${esc(unitNoun().charAt(0).toUpperCase() + unitNoun().slice(1))} featured</div></div>
    </div>

    <div class="layout-2col">
      <div>
        <div class="card card-pad" style="margin-bottom:18px">
          <div class="eyebrow" style="margin-bottom:12px">${esc(tpl("featurePourLabel", "Tonight's Featured Item"))}</div>
          <div style="display:flex;gap:20px;align-items:center;flex-wrap:wrap">
            <div class="bottle-frame" style="width:100px;height:180px">${productImage(feat, 76, 170)}</div>
            <div style="flex:1;min-width:200px">
              <div class="wine-region">${esc([feat.region, feat.vintage].filter(Boolean).join(" · "))}</div>
              <h3 class="serif silver-text" style="margin:2px 0 0;font-size:22px">${esc(feat.name)}</h3>
              <div style="display:flex;align-items:center;gap:12px;margin-top:8px"><span class="wine-price">${money(feat.price)}</span><span class="score-badge"><span class="num">${feat.score}</span> ${esc(feat.scoreSource || "")}</span></div>
              <div class="wine-notes">${esc(feat.tastingNotes || "")}</div>
              <div class="pairing-row">${(feat.foodPairings || []).map((f) => `<span class="pairing-chip">${esc(f)}</span>`).join("")}</div>
              <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:14px">
                <button class="btn btn-primary btn-sm" onclick="openModal('fulfillment')">Hold ${esc(unitNoun())} for a guest</button>
                <button class="btn btn-sm btn-ghost-teal" onclick="openProduct('${feat.id}')">Full details</button>
              </div>
            </div>
          </div>
        </div>

        <div class="card card-pad">
          <div class="section-title" style="justify-content:space-between">
            <span class="eyebrow">Attendee Roster</span>
            <button class="btn btn-sm" onclick="toast('Add attendee — demo placeholder')">+ Add guest</button>
          </div>
          ${roster}
        </div>
      </div>

      <div>
        <div class="insight" style="margin-bottom:16px">
          <div class="avatar avatar-teal" style="width:34px;height:34px;font-size:11px">AI</div>
          <div>
            <div style="font-size:13.5px;color:var(--charcoal);font-weight:600">${esc(tpl("coachTipTitle", "{concierge} tip"))}</div>
            <p class="dim" style="font-size:12.5px;line-height:1.6;margin:6px 0 0">${esc(tpl("coachTip", ""))}</p>
          </div>
        </div>
        <div class="card card-pad">
          <div class="eyebrow" style="margin-bottom:10px">Run of Show</div>
          <div class="list-row" style="gap:10px"><span class="pill pill-dim">7:00</span><span style="font-size:13px;color:var(--charcoal)">Welcome &amp; check-in</span></div>
          <div class="list-row" style="gap:10px"><span class="pill pill-teal">7:20</span><span style="font-size:13px;color:var(--charcoal)">Feature &mdash; ${esc(feat.name || "featured item")}</span></div>
          <div class="list-row" style="gap:10px"><span class="pill pill-dim">8:00</span><span style="font-size:13px;color:var(--charcoal)">Guest experience</span></div>
          <div class="list-row" style="gap:10px"><span class="pill pill-dim">8:40</span><span style="font-size:13px;color:var(--charcoal)">Holds &amp; checkout</span></div>
          <button class="btn btn-ghost-teal btn-sm btn-block" style="margin-top:12px" onclick="openChat()">Ask ${esc(conciergeName())} &rarr;</button>
        </div>
      </div>
    </div>
  `);
}

/* ============================================================
   INVENTORY & FULFILLMENT (Scene 5)
   ============================================================ */
function renderInventory() {
  const homeStore = (APP_CONFIG.customer && APP_CONFIG.customer.homeStoreManager && APP_CONFIG.customer.homeStoreManager.store) || (APP_CONFIG.customer && APP_CONFIG.customer.location) || "home store";
  const hereStore = APP_CONFIG.store.name;
  const cards = APP_CONFIG.catalog.map((p) => {
    const s = p.stock.sanDiego;
    const level = s <= 2 ? "var(--red)" : s <= 6 ? "var(--gold)" : "var(--green)";
    const levelLabel = s <= 2 ? "Low" : s <= 6 ? "Limited" : "In stock";
    return `
      <div class="rec-card ${p.featured ? "teal-border" : ""}" style="cursor:pointer" onclick="openProduct('${p.id}')">
        <div class="ph">${productImage(p, 66, 130)}</div>
        <div class="body">
          <div class="wine-region" style="font-size:9px">${esc(p.region || "")}</div>
          <div style="color:var(--charcoal);font-weight:500;font-size:13.5px;margin-top:4px">${esc(p.name)} <span class="dim">${esc(p.vintage || "")}</span></div>
          <div style="display:flex;align-items:center;justify-content:space-between;margin-top:4px">
            <span class="wine-price" style="font-size:18px">${money(p.price)}</span>
            <span class="score-badge" style="padding:3px 7px"><span class="num" style="font-size:13px">${p.score}</span></span>
          </div>
          <div style="display:flex;align-items:center;gap:7px;margin-top:10px;font-size:12px">
            <span class="stock-dot" style="background:${level}"></span>
            <span style="color:var(--charcoal)">${levelLabel}</span>
            <span class="dim" style="margin-left:auto">Here ${p.stock.sanDiego} &middot; Home ${p.stock.modesto}</span>
          </div>
          <div style="display:flex;gap:6px;margin-top:12px">
            <button class="btn btn-sm btn-block" onclick="event.stopPropagation();openModal('fulfillment')">Hold / Ship</button>
            <button class="btn btn-sm btn-block btn-ghost-teal" onclick="event.stopPropagation();openProduct('${p.id}')">Details</button>
          </div>
        </div>
      </div>`;
  }).join("");

  const feat = featuredProduct();
  const Unit = unitNoun().charAt(0).toUpperCase() + unitNoun().slice(1);

  setHTML(document.getElementById("view-inventory"), `
    <div class="page-head">
      <div>
        <div class="eyebrow">Fulfillment</div>
        <h1 class="serif silver-text" style="margin:4px 0 0;font-size:30px">Cross-Store Inventory</h1>
        <p class="dim" style="font-size:13.5px;margin:6px 0 0">${esc(tpl("inventorySub", "Real-time stock across {store} & {customer}'s home store ({managerStore})."))}</p>
      </div>
      <span class="demo-note">Live &middot; sample data</span>
    </div>

    <div class="card card-pad teal-border" style="margin-bottom:18px">
      <div class="eyebrow" style="margin-bottom:12px">Guest asked about tonight's feature &mdash; real-time lookup</div>
      <div style="display:flex;gap:20px;align-items:center;flex-wrap:wrap">
        <div class="bottle-frame" style="width:90px;height:160px">${productImage(feat, 70, 150)}</div>
        <div style="flex:1;min-width:240px">
          <div class="wine-region">${esc([feat.region, feat.vintage].filter(Boolean).join(" · "))}</div>
          <h3 class="serif silver-text" style="margin:2px 0 8px;font-size:21px">${esc(feat.name)}</h3>
          <div class="store-row">
            <span style="font-size:13px;color:var(--charcoal)"><span class="stock-dot" style="background:var(--gold);margin-right:8px"></span>${esc(hereStore)} (here)</span>
            <strong style="color:var(--charcoal)">${feat.stock.sanDiego} ${esc(unitNoun())}</strong>
          </div>
          <div class="store-row">
            <span style="font-size:13px;color:var(--charcoal)"><span class="stock-dot" style="background:var(--green);margin-right:8px"></span>${esc(homeStore)} <span class="home-tag">${esc((tokens().firstName + "'s home store").toUpperCase())}</span></span>
            <strong class="teal">${feat.stock.modesto} ${esc(unitNoun())}</strong>
          </div>
          <button class="btn btn-primary btn-sm" style="margin-top:14px" onclick="openModal('fulfillment')">Offer fulfillment options &rarr;</button>
        </div>
      </div>
    </div>

    <div class="kpi-grid" style="margin-bottom:18px">
      <div class="kpi"><div class="top-line" style="background:var(--teal)"></div><div class="v teal-text">${APP_CONFIG.catalog.length}</div><div class="l">Products tracked</div></div>
      <div class="kpi"><div class="top-line" style="background:var(--green)"></div><div class="v">${APP_CONFIG.catalog.reduce((a, p) => a + p.stock.sanDiego, 0)}</div><div class="l">${esc(Unit)} at ${esc(hereStore)}</div></div>
      <div class="kpi"><div class="top-line" style="background:var(--gold)"></div><div class="v">${APP_CONFIG.catalog.reduce((a, p) => a + p.stock.modesto, 0)}</div><div class="l">${esc(Unit)} at ${esc(homeStore)}</div></div>
      <div class="kpi"><div class="top-line" style="background:var(--red)"></div><div class="v">${APP_CONFIG.catalog.filter((p) => p.stock.sanDiego <= 2).length}</div><div class="l">Low stock here</div></div>
    </div>

    <div class="toolbar">
      ${((CFG.copy && CFG.copy.inventoryChips) || ["All", "Featured", "New arrivals", "Popular"]).map((ch) => `<button class="chip">${esc(ch)}</button>`).join("")}
      <div style="flex:1"></div>
      <button class="btn btn-sm" onclick="openChat()">Ask ${esc(conciergeName())} about stock</button>
    </div>

    <div class="inv-grid">${cards}</div>
  `);
}

/* ============================================================
   CONCIERGE CHAT
   ============================================================ */
function quickPrompts() {
  const raw = (CFG.copy && CFG.copy.quickPrompts) || [
    "Brief me on {customer}", "What did {manager} say?", "Best pick for {customer}?",
    "Tell me about the featured item", "Check inventory", "Fulfillment options", "Draft a message to {customer}",
  ];
  const t = tokens();
  return raw.map((q) => String(q).replace(/\{(\w+)\}/g, (m, k) => (t[k] != null ? t[k] : m)));
}

function quickButtons() {
  return quickPrompts().map((q) => `<button class="chip" onclick="AF.send(&quot;${esc(q).replace(/"/g, "")}&quot;)">${esc(q)}</button>`).join("");
}

function chatShellHTML(idPrefix) {
  return `
    <div class="brushed" style="padding:14px 16px;border-bottom:1px solid var(--hairline);display:flex;align-items:center;gap:10px">
      <div class="avatar avatar-teal" style="width:30px;height:30px">${ICON.glass.replace("viewBox", 'width="15" height="15" viewBox')}</div>
      <div><div style="font-size:13.5px;color:var(--charcoal)">${esc(conciergeName())} &middot; Agentforce</div><div class="dim" style="font-size:10px;display:flex;align-items:center;gap:5px"><span style="width:6px;height:6px;border-radius:9999px;background:var(--green);display:inline-block"></span> Online &middot; Floor Assist</div></div>
    </div>
    <div class="chat-log" id="${idPrefix}Log"></div>
    <div class="quick-row" id="${idPrefix}Quick">${quickButtons()}</div>
    <div class="chat-input-row">
      <input class="chat-input" id="${idPrefix}Input" placeholder="${esc(tpl("chatInputPlaceholder", "Ask about {customer}, {unit}, inventory…"))}" onkeydown="if(event.key==='Enter'){AF.send(this.value);this.value=''}" />
      <button class="btn btn-primary btn-sm" onclick="AF.sendFromInput('${idPrefix}Input')">Send</button>
    </div>`;
}

function renderChat(container) {
  if (!container) return;
  setHTML(container, chatShellHTML("chat"));
  AF.greet();
}

AF.activeLog = () => {
  const panel = document.getElementById("chatPanel");
  if (panel && panel.classList.contains("open")) return document.getElementById("panelLog");
  return document.getElementById("chatLog");
};

AF.bubble = (who, html) => {
  const log = AF.activeLog();
  if (!log) return;
  const wrap = document.createElement("div");
  wrap.className = "msg " + who;
  const ava = who === "ai"
    ? '<div class="avatar avatar-teal ava">AI</div>'
    : '<div class="avatar avatar-brushed ava">' + APP_CONFIG.customer.initials + '</div>';
  wrap.innerHTML = (who === "ai" ? ava : "") + '<div class="bubble">' + html + '</div>' + (who === "user" ? ava : "");
  log.appendChild(wrap);
  log.scrollTop = log.scrollHeight;
};

AF.greet = () => {
  const g = tpl("chatGreeting", "Hi — I'm your {concierge} for {customer}'s visit tonight. Ask me to brief you on {customer}, relay {manager}'s message, recommend {unit}, check inventory, or walk fulfillment options.");
  AF.bubble("ai", esc(g).replace(esc(conciergeName()), '<strong class="teal">' + esc(conciergeName()) + '</strong>') + ' Try a quick action below.');
};

AF.typing = () => {
  const log = AF.activeLog();
  if (!log) return;
  const t = document.createElement("div");
  t.className = "msg ai"; t.id = "typingIndicator";
  t.innerHTML = '<div class="avatar avatar-teal ava">AI</div><div class="bubble typing"><span class="live-dot"></span><span class="live-dot" style="animation-delay:.2s"></span><span class="live-dot" style="animation-delay:.4s"></span></div>';
  log.appendChild(t); log.scrollTop = log.scrollHeight;
};

AF.send = (text) => {
  if (!text || !text.trim()) return;
  AF.collapseQuick();
  AF.bubble("user", esc(text.trim()));
  AF.typing();
  setTimeout(() => {
    const ti = document.getElementById("typingIndicator");
    if (ti) ti.remove();
    AF.bubble("ai", AF.respond(text));
  }, 750);
};

AF.sendFromInput = (id) => {
  const el = document.getElementById(id);
  if (el) { AF.send(el.value); el.value = ""; }
};

AF.collapseQuick = () => {
  ["panelQuick", "chatQuick"].forEach((id) => {
    const q = document.getElementById(id);
    if (q) q.classList.add("compact");
  });
};

let chatGreeted = false;
function openChat() {
  const panel = document.getElementById("chatPanel");
  const scrim = document.getElementById("chatScrim");
  const quick = document.getElementById("panelQuick");
  if (quick && !quick.childElementCount) setHTML(quick, quickButtons());
  panel.classList.add("open");
  scrim.classList.add("open");
  if (!chatGreeted) {
    AF.bubble("ai", 'Hi &mdash; I\'m your <strong class="teal">' + esc(conciergeName()) + '</strong>. Ask me anything about ' + esc(tokens().firstName) + '\'s visit tonight. Try a quick action below.');
    chatGreeted = true;
  }
  setTimeout(() => { const i = document.getElementById("panelInput"); if (i) i.focus(); }, 280);
}
function closeChat() {
  document.getElementById("chatPanel").classList.remove("open");
  document.getElementById("chatScrim").classList.remove("open");
}

/* ============================================================
   ASSOCIATE ACTION MODALS
   ============================================================ */
const MODALS = {
  fulfillment: () => {
    const p = featuredProduct();
    const tk = tokens();
    const home = (APP_CONFIG.customer && APP_CONFIG.customer.homeStoreManager && APP_CONFIG.customer.homeStoreManager.store) || (APP_CONFIG.customer && APP_CONFIG.customer.location) || "home store";
    return {
      title: "Fulfillment Options — " + p.name,
      body: `
        <div class="alert-box" style="border-color:rgba(1,102,92,.3);background:rgba(1,102,92,.05)">
          <div class="eyebrow" style="font-size:9.5px">Real-time cross-store availability</div>
          <div class="store-row"><span style="font-size:13px;color:var(--charcoal)">${esc(tk.store)} (here)</span><strong style="color:var(--charcoal)">${(p.stock && p.stock.sanDiego) || 0} ${esc(unitNoun())}</strong></div>
          <div class="store-row"><span style="font-size:13px;color:var(--charcoal)">${esc(home)} <span class="home-tag">HOME STORE</span></span><strong class="teal">${(p.stock && p.stock.modesto) || 0} ${esc(unitNoun())}</strong></div>
        </div>

        <div class="eyebrow" style="margin:16px 0 8px">Choose fulfillment</div>
        <label style="display:flex;gap:10px;align-items:flex-start;padding:10px;border:1px solid rgba(1,102,92,.4);border-radius:10px;background:rgba(1,102,92,.05);cursor:pointer">
          <input type="radio" name="ffmethod" value="hold" checked style="margin-top:3px"/>
          <span><strong class="teal">${esc(tpl("holdOptionHome", "Hold at home store ({managerStore})"))}</strong><br><span class="dim" style="font-size:12px">${esc(tpl("holdOptionHomeSub", "Reserve for in-person pickup — recommended, {customer} is traveling."))}</span></span>
        </label>
        <label style="display:flex;gap:10px;align-items:flex-start;padding:10px;border:1px solid var(--hairline);border-radius:10px;margin-top:8px;cursor:pointer">
          <input type="radio" name="ffmethod" value="ship" style="margin-top:3px"/>
          <span><strong>${esc(tpl("holdOptionShip", "Ship to home"))}</strong><br><span class="dim" style="font-size:12px">${esc(tpl("holdOptionShipSub", "Deliver to their home address."))}</span></span>
        </label>
        <label style="display:flex;gap:10px;align-items:flex-start;padding:10px;border:1px solid var(--hairline);border-radius:10px;margin-top:8px;cursor:pointer">
          <input type="radio" name="ffmethod" value="buy" style="margin-top:3px"/>
          <span><strong>${esc(tpl("holdOptionBuy", "Buy in-store today"))}</strong><br><span class="dim" style="font-size:12px">${esc(tpl("holdOptionBuySub", "Take {unit} from {store} now."))}</span></span>
        </label>

        <div style="display:flex;gap:10px;margin-top:14px">
          <div style="flex:1"><div class="eyebrow" style="margin-bottom:5px">Quantity</div><input class="field" id="ffQty" type="number" value="4" min="1" max="${(p.stock && p.stock.modesto) || 12}"/></div>
          <div style="flex:1"><div class="eyebrow" style="margin-bottom:5px">Pickup</div><select class="field" id="ffWhen"><option>Friday</option><option>Saturday</option><option>Next week</option></select></div>
        </div>

        <button class="btn btn-primary btn-block" style="margin-top:16px" onclick="confirmFulfillment()">Confirm hold</button>`,
    };
  },
  draftMessage: () => {
    const tk = tokens();
    const body = tpl("draftMessageBody", "Hi {firstName} — great meeting you at tonight's {event}. Per {manager} at {managerStore}, I've held your {unit} at your home store for pickup. Enjoy!");
    return {
      title: "Draft Message to " + tk.customer,
      body: `<div class="alert-box" style="border-color:var(--hairline)">
          <div class="eyebrow" style="font-size:9.5px;color:var(--warm-gray)">TO: ${esc(String(tk.customer).toUpperCase())} &middot; ${esc((APP_CONFIG.customer.channels && APP_CONFIG.customer.channels.email) || "")}</div>
          <p style="font-size:13.5px;color:var(--charcoal);line-height:1.6;margin:8px 0 0">${esc(body)}</p>
        </div>
        <div class="eyebrow" style="margin:14px 0 6px">Einstein-generated &middot; editable</div>
        <textarea class="field" rows="4">${esc(body)}</textarea>
        <button class="btn btn-primary btn-block" style="margin-top:14px" onclick="confirmAction('Message sent to ${esc(tk.customer)}')">Send Now</button>`,
    };
  },
  call: () => {
    const tk = tokens();
    return {
      title: "Log / Place Call",
      body: `<p class="dim" style="font-size:13px;margin-top:0">Place a call to <strong style="color:var(--charcoal)">${esc(APP_CONFIG.customer.name)}</strong> at ${esc((APP_CONFIG.customer.channels && APP_CONFIG.customer.channels.phone) || "")}, or log an outcome.</p>
        <select class="field" style="margin-bottom:10px"><option>Outcome: Connected — interested</option><option>Left voicemail</option><option>No answer</option></select>
        <textarea class="field" rows="3">Discussed the ${esc(featuredProduct().name || "featured item")}. Holding ${esc(unitNoun())} at ${esc(tk.managerStore)} for pickup.</textarea>
        <div style="display:flex;gap:8px;margin-top:14px"><button class="btn btn-block" onclick="confirmAction('Call outcome logged')">Log Outcome</button><button class="btn btn-primary btn-block" onclick="confirmAction('Calling ${esc(tk.customer)}...')">Call Now</button></div>`,
    };
  },
  logNote: () => {
    const tk = tokens();
    return {
      title: "Log Client Interaction Note",
      body: `<p class="dim" style="font-size:13px;margin-top:0">Synced to ${esc(tk.customer)}'s Data Cloud profile and shared with ${esc(tk.manager)} at their home store.</p>
        <textarea class="field" rows="4">${esc(tk.customer)} attended the ${esc(APP_CONFIG.event.name)}. Loved the ${esc(featuredProduct().name || "featured item")}. Held ${esc(unitNoun())} at ${esc(tk.managerStore)} for pickup.</textarea>
        <button class="btn btn-primary btn-block" style="margin-top:14px" onclick="confirmAction('Interaction note logged & shared with ${esc(tk.manager)}')">Save Note</button>`,
    };
  },
};

function openModal(key) {
  const m = MODALS[key] && MODALS[key]();
  if (!m) return;
  const shell = document.querySelector("#modal .modal");
  if (shell) shell.classList.remove("wide");
  document.getElementById("modalTitle").textContent = m.title;
  setHTML(document.getElementById("modalBody"), m.body);
  document.getElementById("modal").classList.add("open");
}
function closeModal() {
  document.getElementById("modal").classList.remove("open");
  const m = document.querySelector("#modal .modal");
  if (m) m.classList.remove("wide");
}
function confirmAction(msg) { closeModal(); toast(msg); }
function comingSoon(label) { toast((label || "This") + " — demo placeholder"); }

function confirmFulfillment() {
  const checked = document.querySelector('input[name="ffmethod"]:checked');
  const method = checked ? checked.value : "hold";
  const qtyEl = document.getElementById("ffQty");
  const whenEl = document.getElementById("ffWhen");
  const qty = (qtyEl && qtyEl.value) || 4;
  const when = (whenEl && whenEl.value) || "Friday";
  const tk = tokens();
  const u = unitNoun();
  closeModal();
  if (method === "hold") {
    toast("Hold confirmed — " + qty + " " + u + " at " + tk.managerStore + " for " + when + " · " + tk.manager + " notified");
  } else if (method === "ship") {
    toast("Shipping " + qty + " " + u + " to " + tk.customer + "'s home · " + tk.manager + " notified");
  } else {
    toast(qty + " " + u + " rung up at " + tk.store + " · receipt sent to " + tk.customer);
  }
}

document.addEventListener("keydown", (e) => { if (e.key === "Escape") { closeModal(); closeChat(); } });

/* ============================================================
   TOAST
   ============================================================ */
let toastTimer;
function toast(msg, symbol) {
  const t = document.getElementById("toast");
  if (!t) return;
  t.textContent = (symbol || "✓") + " " + msg;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 4200);
}

/* ============================================================
   VIP ARRIVAL
   ============================================================ */
let vipArrived = false;
let arrivalPending = false;
let arrivalDropTimer;

function arrivalHighlights() {
  const c = APP_CONFIG.customer;
  const tk = tokens();
  const interest = (c.interests && c.interests[0]) || "their favorites";
  return `
    <span class="hl teal">&#9733; ${esc(c.rank)} &middot; since ${esc(String(c.memberSince))}</span>
    <span class="hl gold">LTV ${money(c.ltv)}</span>
    <span class="hl">Propensity: ${esc(c.propensity)}</span>
    <span class="hl teal">&#9992; Home store: ${esc(tk.managerStore)}</span>
    <span class="hl gold">&#128172; Message from ${esc(tk.manager)}</span>
    <span class="hl">&#128722; Likes ${esc(interest)}</span>`;
}

function scheduleArrivalDrop() {
  if (arrivalPending || vipArrived) return;
  arrivalPending = true;
  setTimeout(triggerVipArrival, 2600);
}

function triggerVipArrival() {
  arrivalPending = false;
  vipArrived = true;
  renderArrivalBanner();
  showArrivalDrop();
}

function showArrivalDrop() {
  const drop = document.getElementById("arrivalDrop");
  if (!drop) return;
  const c = APP_CONFIG.customer;
  setHTML(drop, `
    <div style="display:flex;align-items:center;gap:14px">
      <div class="avatar avatar-teal" style="width:44px;height:44px;font-size:16px">${c.initials}</div>
      <div style="flex:1;min-width:0">
        <div class="eyebrow" style="color:var(--teal)">&#9733; Live arrival &middot; greet at check-in</div>
        <div class="serif silver-text" style="font-size:19px;line-height:1.1;margin-top:2px">${esc(c.name)} signed up &amp; is heading in</div>
      </div>
      <button class="modal-x" onclick="hideArrivalDrop()" title="Dismiss">&times;</button>
    </div>
    <div class="hl-grid">${arrivalHighlights()}</div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px">
      <button class="btn btn-primary btn-sm" onclick="hideArrivalDrop();switchView('signin')">Check ${esc(tokens().firstName)} In</button>
      <button class="btn btn-sm btn-ghost-teal" onclick="hideArrivalDrop();briefMe()">Brief me with Agentforce</button>
      <button class="btn btn-sm" onclick="hideArrivalDrop()">Dismiss</button>
    </div>`);
  requestAnimationFrame(() => drop.classList.add("show"));
  clearTimeout(arrivalDropTimer);
  arrivalDropTimer = setTimeout(hideArrivalDrop, 9000);
}
function hideArrivalDrop() {
  const drop = document.getElementById("arrivalDrop");
  if (drop) drop.classList.remove("show");
  clearTimeout(arrivalDropTimer);
}

function renderArrivalBanner() {
  const slot = document.getElementById("arrivalBanner");
  if (!slot || !vipArrived) return;
  const c = APP_CONFIG.customer;
  setHTML(slot, `
    <div class="arrival">
      <div style="display:flex;align-items:center;gap:14px;position:relative">
        <div class="avatar avatar-teal" style="width:48px;height:48px;font-size:17px">${c.initials}</div>
        <div style="flex:1;min-width:0">
          <div class="eyebrow" style="color:var(--teal)">&#9733; Greet at check-in &middot; Live arrival</div>
          <div class="serif silver-text" style="font-size:21px;line-height:1.1;margin-top:2px">${esc(c.name)} signed up for tonight's ${esc((APP_CONFIG.event.type || "event").toLowerCase())}</div>
        </div>
        <button class="modal-x" style="align-self:flex-start" onclick="dismissArrival()" title="Dismiss">&times;</button>
      </div>
      <div class="hl-grid">${arrivalHighlights()}</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:14px;position:relative">
        <button class="btn btn-primary btn-sm" onclick="switchView('signin')">Check ${esc(tokens().firstName)} In</button>
        <button class="btn btn-sm btn-ghost-teal" onclick="switchView('profile')">Open Full Profile</button>
        <button class="btn btn-sm btn-ghost-teal" onclick="briefMe()">Brief me with Agentforce</button>
        <button class="btn btn-sm" onclick="dismissArrival()">Dismiss</button>
      </div>
    </div>`);
}
function dismissArrival() {
  const slot = document.getElementById("arrivalBanner");
  if (slot) setHTML(slot, "");
}
function briefMe() {
  openChat();
  setTimeout(() => AF.send("Brief me on " + tokens().firstName + " before I greet them"), 300);
}

/* ============================================================
   LIVE COUNTERS
   ============================================================ */
function bumpSignup() {
  const su = kpiSignup();
  su.value = (Number(su.value) || 0) + 1;
  const sc = document.getElementById("signupCount");
  if (sc) sc.textContent = su.value;
}
let trafficTicks = 0;
setInterval(() => {
  if (trafficTicks++ > 600) return;
  const g = kpiGuest();
  g.value = (Number(g.value) || 0) + 1 + (trafficTicks % 3);
  const el = document.getElementById("guestCount");
  if (el) el.textContent = g.value;
}, 5000);

/* ============================================================
   PRODUCT DETAIL MODAL
   ============================================================ */
function openProduct(id) {
  const p = productById(id);
  if (!p) return;
  const home = (APP_CONFIG.customer && APP_CONFIG.customer.homeStoreManager && APP_CONFIG.customer.homeStoreManager.store) || (APP_CONFIG.customer && APP_CONFIG.customer.location) || "home store";
  document.getElementById("modalTitle").textContent = p.variety || p.name;
  document.querySelector("#modal .modal").classList.add("wide");
  const level = p.stock.sanDiego <= 2 ? "var(--red)" : p.stock.sanDiego <= 6 ? "var(--gold)" : "var(--green)";
  setHTML(document.getElementById("modalBody"), `
    <div class="pd-grid">
      <div>
        <div class="pd-img">${productImage(p, 120, 260)}</div>
        <div style="display:flex;align-items:center;gap:12px;margin-top:12px"><span class="wine-price" style="font-size:26px">${money(p.price)}</span><span class="score-badge"><span class="num">${p.score}</span> ${esc(p.scoreSource || "")}</span></div>
        <div class="store-row" style="margin-top:10px"><span style="font-size:12.5px;color:var(--charcoal)"><span class="stock-dot" style="background:${level};margin-right:8px"></span>${esc(APP_CONFIG.store.name)}</span><strong style="color:var(--charcoal)">${p.stock.sanDiego}</strong></div>
        <div class="store-row"><span style="font-size:12.5px;color:var(--charcoal)"><span class="stock-dot" style="background:var(--green);margin-right:8px"></span>${esc(home)} <span class="home-tag">HOME</span></span><strong class="teal">${p.stock.modesto}</strong></div>
      </div>
      <div>
        <div class="wine-region">${esc([p.region, p.appellation].filter(Boolean).join(" · "))}</div>
        <h3 class="serif silver-text" style="margin:4px 0 0;font-size:24px">${esc(p.name)} <span class="wine-vintage">${esc(p.vintage || "")}</span></h3>
        <div class="wine-notes" style="margin-top:12px">${esc(p.tastingNotes || "")}</div>
        ${p.story ? `<p style="font-size:13px;color:var(--charcoal);line-height:1.65;margin:10px 0 0;font-style:italic">${esc(p.story)}</p>` : ""}
        ${(p.foodPairings && p.foodPairings.length) ? `<div class="eyebrow" style="margin:16px 0 6px">Pairs with</div>
        <div class="pairing-row">${p.foodPairings.map((f) => `<span class="pairing-chip">${esc(f)}</span>`).join("")}</div>` : ""}
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:18px">
          <button class="btn btn-primary btn-sm" onclick="openModal('fulfillment')">Hold / Ship</button>
          <button class="btn btn-sm" onclick="openModal('draftMessage')">Message ${esc(tokens().firstName)}</button>
          <button class="btn btn-sm btn-ghost-teal" onclick="tellStory('${p.id}')">Ask the concierge &rarr;</button>
        </div>
      </div>
    </div>`);
  document.getElementById("modal").classList.add("open");
}
function tellStory(id) {
  const p = productById(id);
  if (!p) return;
  closeModal();
  openChat();
  setTimeout(() => {
    AF.bubble("user", esc("Tell me about the " + p.name));
    AF.typing();
    setTimeout(() => {
      const ti = document.getElementById("typingIndicator");
      if (ti) ti.remove();
      AF.bubble("ai", '<strong class="teal">' + esc(p.name + " " + (p.vintage || "")) + '</strong><div class="wine-notes" style="margin-top:6px">' + esc(p.tastingNotes || "") + '</div>' + (p.story ? '<div style="margin-top:6px;font-style:italic;font-size:12.5px">' + esc(p.story) + "</div>" : "") + AF.productCardHTML(p, "View details", "openProduct('" + p.id + "')"));
    }, 700);
  }, 320);
}

/* ============================================================
   BRAND CHROME — populate static markup from APP_CONFIG
   ============================================================ */
function applyBrand() {
  const b = APP_CONFIG.brand || {};
  const set = (id, val) => { const el = document.getElementById(id); if (el && val != null) el.textContent = val; };
  const setPh = (id, val) => { const el = document.getElementById(id); if (el && val != null) el.setAttribute("placeholder", val); };
  set("brandName", b.name);
  set("brandSub", b.sub);
  set("brandHub", b.hubLabel);
  set("brandNameMobile", b.name);

  const conciergeLabel = b.conciergeName || "Concierge";
  const conciergeFull = conciergeLabel + (b.assistantName ? " · " + b.assistantName : "");
  document.querySelectorAll(".js-concierge-name").forEach((el) => { el.textContent = conciergeLabel; });
  document.querySelectorAll(".js-concierge-full").forEach((el) => { el.textContent = conciergeFull; });

  // Intro scene narrative.
  const intro = APP_CONFIG.introScene || {};
  set("introHeadline", intro.headline);
  const introDetail = document.getElementById("introDetail");
  if (introDetail && intro.detail) introDetail.textContent = intro.detail;
  const introBtn = document.querySelector(".intro-next span");
  if (introBtn && intro.ctaLabel) introBtn.textContent = intro.ctaLabel;

  // Sidebar nav labels (industry vocabulary).
  document.querySelectorAll(".js-nav").forEach((el) => {
    const k = el.getAttribute("data-nav");
    const v = navLabel(k, "");
    if (v) el.textContent = v;
  });

  // Search placeholder, topbar event label, store status + manager footer.
  setPh("searchInput", (APP_CONFIG.search && APP_CONFIG.search.placeholder) || null);
  set("topbarEventLabel", (APP_CONFIG.event && APP_CONFIG.event.displayLabel) || null);
  set("navStatus", (APP_CONFIG.store && APP_CONFIG.store.statusLabel) || null);
  const mgr = APP_CONFIG.managerMessage && APP_CONFIG.managerMessage.from;
  if (mgr) {
    set("navFootName", mgr.name);
    set("navFootInitials", mgr.initials);
    set("navFootTitle", (APP_CONFIG.store && APP_CONFIG.store.managerTitle) || mgr.title);
  }

  // Docked chat panel placeholder (rendered chat shells handle their own).
  document.querySelectorAll("[data-chat-placeholder]").forEach((el) => {
    el.setAttribute("placeholder", tpl("chatInputPlaceholder", "Ask about {customer}, {unit}, inventory…"));
  });

  if (b.name) document.title = b.name + " · Clienteling";
}

/* ============================================================
   INIT
   ============================================================ */
applyBrandColors();
applyBrand();
renderDashboard();
renderSignin();
renderProfile();
renderEvent();
renderInventory();
switchView("dashboard");

/* Intro scene is optional/config-driven. If APP_CONFIG.introFrameUrl is
   set, wire the iframe and show the intro. Otherwise skip straight to the
   store (fires the same signup + arrival flow enterStore() would). */
(function initIntro() {
  const intro = document.getElementById("introScene");
  const url = APP_CONFIG.introFrameUrl;
  if (intro && url) {
    const frame = document.getElementById("introFrame");
    if (frame) frame.src = url;
    // intro stays visible; user advances via the "Enter the store" button.
  } else {
    if (intro) intro.style.display = "none";
    // No intro: reflect the signup and schedule the VIP arrival drop.
    bumpSignup();
    scheduleArrivalDrop();
  }
})();
