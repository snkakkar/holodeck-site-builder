/* =====================================================================
   app.js — Cimulate search demo LOGIC (config-driven)
   All raw data (products, profile, celebs, brand) lives in app-config.js
   (window.APP_CONFIG), loaded before this file. Helpers money/esc/byId/
   productSVG/productImage are also defined there. Behavior is identical
   to the original single-file app; only the data source is swapped.
   Security note: markup is app-controlled; free text passes through esc().
   ===================================================================== */

function stars(r){ const full=Math.round(r/20); let s=""; for(let i=0;i<5;i++)s+=`<i class="fa-${i<full?'solid':'regular'} fa-star"></i>`; return s; }

/* =====================================================================
   RENDER — hero bottles + product grid
   ===================================================================== */
// deterministic pseudo review-count per product (stable, no RNG)
function reviewCount(p){ let h=0; for(const c of p.id)h=(h*31+c.charCodeAt(0))%1000; return 40+h*2; }
// Sub-line under a product name: prefer the product's own size/type; else the
// generic type/variety. No wine-specific "750ml Bottle" default.
function sizeLine(p){
  if(/pack/i.test(p.type||"")) return p.type.split("·")[1]?.trim()||p.type;
  return p.size || p.type || p.variety || p.cat || "";
}

function productCardHTML(p,{rankTag=""}={}){
  const badgeClass = p.cat==="Beer" ? "red" : p.badge==="CELEBRATION"||p.badge==="GRAND RESERVE" ? "gold" : "";
  return `<div class="card">
    <div class="card-media">
      ${rankTag?`<span class="card-badge">${rankTag}</span>`:p.badge?`<span class="card-badge ${badgeClass}">${p.badge}</span>`:""}
      ${productImage(p,80,206)}
    </div>
    <div class="card-body">
      <div class="card-name">${esc(p.name)}</div>
      <div class="card-variety">${esc(sizeLine(p))}</div>
      <div class="card-rating"><span class="stars">${stars(p.rating)}</span><span class="rev">(${reviewCount(p)})</span></div>
      <div class="card-foot">
        <div class="card-price">${money(p.price)}</div>
        <button class="add-btn" onclick="addToCart('${p.id}')">Add To Cart</button>
      </div>
    </div>
  </div>`;
}
// Circular category thumbnail using a representative product bottle
function catCircleHTML(label,pid,onclick){
  const p=byId(pid);
  return `<a href="#featured" ${onclick?`onclick="${onclick}"`:""}><span class="ci">${p?productImage(p,96,248):'<i class="fa-solid fa-bag-shopping"></i>'}</span><span>${esc(label)}</span></a>`;
}
/* Resolve a section's product ids: prefer config ids that exist in the
   catalog, else fall back to a slice of the catalog so ANY generated config
   (with different ids) still fills the rail. */
function sectionIds(key, fallbackCount){
  const S=(APP_CONFIG.sections||{})[key]||{};
  const wanted=(Array.isArray(S.ids)?S.ids:[]).filter(id=>byId(id));
  if(wanted.length) return wanted;
  return APP_CONFIG.products.slice(0, fallbackCount||10).map(p=>p.id);
}
function renderGrid(){
  document.getElementById("productGrid").innerHTML = sectionIds("featured",10).map(id=>productCardHTML(byId(id))).join("");
}
function renderTrending(){
  document.getElementById("trendingGrid").innerHTML = sectionIds("trending",10).map(id=>productCardHTML(byId(id))).join("");
}
function renderSpecials(){
  document.getElementById("specialsGrid").innerHTML = sectionIds("specials",10).map(id=>productCardHTML(byId(id))).join("");
}
/* Circle strips: prefer config circles [{label,id,onclick?}]; else derive
   generic circles from the first products in the catalog. */
function circlesFor(key, count){
  const S=(APP_CONFIG.sections||{})[key]||{};
  const cfg=(Array.isArray(S.circles)?S.circles:[]).filter(c=>c&&byId(c.id));
  if(cfg.length) return cfg;
  return APP_CONFIG.products.slice(0, count||6).map(p=>({ label:p.cat||p.type||p.name, id:p.id }));
}
function renderCircles(){
  const strip=(elId,key)=>{
    const el=document.getElementById(elId); if(!el)return;
    el.innerHTML = circlesFor(key,6).map(c=>catCircleHTML(c.label,c.id,c.onclick)).join("");
  };
  strip("matchDayStrip","matchDay");
  strip("topCatStrip","topCat");
  strip("cocktailStrip","cocktail");
}
function renderHero(){
  // Hero is now the "Sips for the Cup!" banner (pure CSS) — no SVG bottles to inject.
  const el=document.getElementById("heroVisual"); if(!el)return;
}

/* =====================================================================
   CART
   ===================================================================== */
let CART=[];
function addToCart(id,silent){
  const p=byId(id); if(!p)return;
  const ex=CART.find(c=>c.id===id); if(ex)ex.qty++; else CART.push({id,qty:1});
  updateCart();
  if(!silent){
    toast("cart",`Added to cart`,`${p.name} · ${money(p.price)}`);
    toast("data", tpl("dataToastTitle","Data 360 profile updated"), tpl("dataToastSub","New purchase-intent signal captured — feeds future recommendations."));
  }
}
function updateCart(){
  const count=CART.reduce((n,c)=>n+c.qty,0);
  document.getElementById("cartCount").textContent=count;
  const items=document.getElementById("cartItems");
  if(!CART.length){ items.innerHTML=`<div class="cart-empty"><i class="fa-solid fa-bag-shopping"></i>${tpl("cartEmpty","Your cart is empty.")}</div>`; }
  else items.innerHTML=CART.map(c=>{const p=byId(c.id);return `<div class="cart-row">
    <div class="cr-media">${productImage(p,36,104)}</div>
    <div class="cr-body"><div class="cr-name">${esc(p.name)}</div><div class="cr-meta">${esc(p.type)} · Qty ${c.qty}</div></div>
    <div class="cr-price">${money(p.price*c.qty)}</div></div>`;}).join("");
  const total=CART.reduce((s,c)=>s+byId(c.id).price*c.qty,0);
  document.getElementById("cartTotal").textContent=money(total);
}
function openCart(){document.getElementById("cartDrawer").classList.add("open");document.getElementById("backdrop").classList.add("open");}
function closeCart(){document.getElementById("cartDrawer").classList.remove("open");document.getElementById("backdrop").classList.remove("open");}

/* =====================================================================
   TOASTS
   ===================================================================== */
function toast(kind,title,sub){
  const wrap=document.getElementById("toastWrap");
  const el=document.createElement("div");
  el.className="toast "+(kind==="cart"?"cart":"");
  el.innerHTML=`<i class="fa-solid ${kind==='cart'?'fa-cart-shopping':'fa-database'}"></i><div><b>${title}</b><small>${sub}</small></div>`;
  wrap.appendChild(el);
  setTimeout(()=>{el.style.transition="opacity .4s";el.style.opacity="0";setTimeout(()=>el.remove(),420);},4200);
}

/* =====================================================================
   SOMM CONCIERGE — intent engine + dynamic page updates
   ===================================================================== */
function recCardChat(id){
  const p=byId(id);
  return `<div class="rec-card">
    <div class="rc-media">${productImage(p,52,150)}</div>
    <div class="rc-body">
      <div class="rc-region">${esc(p.region)}${p.vintage?" · "+p.vintage:""}</div>
      <div class="rc-name">${esc(p.name)}</div>
      <div class="rc-notes">${esc(p.notes)}</div>
      <div class="rc-foot">
        <div><span class="rc-price">${money(p.price)}</span> &nbsp;<span class="rc-score">${p.rating} pts</span></div>
        <button class="rec-add" onclick="addToCart('${p.id}')"><i class="fa-solid fa-plus"></i> Add</button>
      </div>
    </div></div>`;
}
// A chip carries BOTH: data-q (the exact intent key it maps 1:1 to — used for
// the deterministic reply lookup) and data-say (the natural phrase shown in the
// user's chat bubble, derived from the label). Splitting them lets q stay a bare
// key while the bubble still reads like a real sentence.
function chipSay(c){ return String(c.say || c.label || c.q || "").replace(/^[^\w]+\s*/,"").trim(); }
function quicks(arr){ return `<div class="quicks">${arr.map(q=>`<button class="chip" data-q="${esc(q.q)}" data-say="${esc(chipSay(q))}" onclick="sommQuick(this)">${esc(q.label)}</button>`).join("")}</div>`; }

/* Update the main page with a curated rail reflecting the conversation */
function showCuratedRail(title,sub,ids){
  document.getElementById("curatedTitle").textContent=title;
  document.getElementById("curatedSub").textContent=sub;
  document.getElementById("curatedGrid").innerHTML=ids.map(id=>productCardHTML(byId(id))).join("");
  const rail=document.getElementById("curatedRail");
  rail.classList.add("show");
  setTimeout(()=>rail.scrollIntoView({behavior:"smooth",block:"start"}),150);
}

/* Greeting / service chips come from config (fall back to a generic set).
   Each fallback chip's `q` is a VERBATIM built-in service key (see
   buildServiceIntents) so it maps 1:1 even when a config supplies no
   sommIntents — a bare "recommend something" q would have nothing to resolve
   against. `say` is the natural phrase shown in the user's chat bubble. */
const GREET_CHIPS   = (APP_CONFIG.greetChips   && APP_CONFIG.greetChips.length)   ? APP_CONFIG.greetChips   : [
  {label:"🛎️ Service & Account Help", q:"help me with something", say:"I need help with my account"},
  {label:"📦 Track My Order", q:"track my order", say:"Track my order"},
  {label:"⭐ Rewards & Points", q:"rewards", say:"My loyalty rewards and points"},
];
const SERVICE_CHIPS = (APP_CONFIG.serviceChips && APP_CONFIG.serviceChips.length) ? APP_CONFIG.serviceChips : [
  {label:"📦 Track My Order", q:"track my order", say:"Track my order"},
  {label:"🚚 Delivery & Address", q:"delivery", say:"What's my delivery status?"},
  {label:"🏬 Store Hours & Pickup", q:"store hours", say:"My store hours and pickup"},
  {label:"⭐ Rewards & Points", q:"rewards", say:"My loyalty rewards and points"},
  {label:"↩️ Return or Refund", q:"return", say:"I want to return an item"},
];

/* Build the shopping intents from APP_CONFIG.sommIntents. Each config intent:
   { keys[], text, recIds[], rail?{title,sub,ids}, chips?[{label,q}] }.
   recIds/rail ids are filtered against the catalog so a generated config with
   different ids never renders a broken card. */
function buildShoppingIntents(){
  return (APP_CONFIG.sommIntents||[]).map(it=>({
    keys: it.keys||[],
    reply: ()=>{
      const recIds=(it.recIds||[]).filter(id=>byId(id));
      if(it.rail && Array.isArray(it.rail.ids)){
        const ids=it.rail.ids.filter(id=>byId(id));
        if(ids.length) showCuratedRail(interp(it.rail.title||tpl("curatedTitle")), interp(it.rail.sub||tpl("curatedSub")), ids);
      }
      let html=`<p>${interp(it.text||"")}</p>`;
      html+=recIds.map(id=>recCardChat(id)).join("");
      if(Array.isArray(it.chips)&&it.chips.length) html+=quicks(it.chips);
      return html;
    },
  }));
}
// Interpolate {token} in a raw string via the shared tokens() map.
function interp(s){ const tk=tokens(); return String(s).replace(/\{(\w+)\}/g,(m,k)=> (k in tk)?tk[k]:m); }

/* Generic service flows — data-driven from APP_CONFIG.serviceData so no
   customer literals live in code. {order},{eta},{store},{tier},{points},
   {reward},{associate},{refundAmt} interpolate. */
function svc(key){ const d=APP_CONFIG.serviceData||{}; return d[key]!=null?d[key]:""; }
function buildServiceIntents(){
  const tk=tokens();
  const rowStore=svc("associate")?`<div class="svc-row"><span>Associate</span><b>${esc(svc("associate"))} · on floor today</b></div>`:"";
  return [
    { keys:["help me with something","service","customer service","support","i need help","account help"],
      reply:()=>`<p>Of course — I can handle service needs right here, no waiting on hold. What do you need a hand with?</p>${quicks(SERVICE_CHIPS)}` },
    { keys:["order status","track my order","where is my order","track order","order","shipment"],
      reply:()=>`<p>Here's your latest order, pulled straight from your unified profile:</p>
        <div class="svc-card"><div class="svc-row"><span>Order</span><b>${esc(svc("order"))}</b></div>
          <div class="svc-row"><span>Placed</span><b>${esc(svc("orderPlaced"))}</b></div>
          <div class="svc-row"><span>Status</span><b class="svc-ok"><i class="fa-solid fa-truck-fast"></i> Out for delivery</b></div>
          <div class="svc-row"><span>ETA</span><b>${esc(svc("eta"))} · ${esc(tk.store)}</b></div></div>
        <p>Anything you'd like to change on it?</p>${quicks([{label:"Change Delivery Address",q:"update my delivery address"},{label:"Report a Missing Item",q:"report a missing item"},{label:"More Service Options",q:"help me with something"}])}` },
    { keys:["delivery","deliver","track","shipment status","when will it arrive"],
      reply:()=>`<p>Your order <em>${esc(svc("order"))}</em> is <em>out for delivery</em>, arriving <b>${esc(svc("eta"))}</b>. Want to reroute it or leave a delivery note?</p>${quicks([{label:"Change Delivery Address",q:"update my delivery address"},{label:"Report a Missing Item",q:"report a missing item"}])}` },
    { keys:["update my delivery","update address","change address","change delivery","reroute"],
      reply:()=>`<p>Got it — I can reroute order <em>${esc(svc("order"))}</em>. It's still with the local driver, so a change is easy. Where should it go?</p>${quicks([{label:"To my Store for Pickup",q:"send it to my store for pickup"},{label:"Keep Home Delivery",q:"keep home delivery, thanks"}])}` },
    { keys:["report a missing","missing item","damaged","broken"],
      reply:()=>`<p>I'm sorry about that — I've opened a case on order <em>${esc(svc("order"))}</em> and, since you're a <em>${esc(tk.tier)}</em> member, pre-approved a replacement or refund. A specialist will confirm within a minute. Anything else?</p>` },
    { keys:["pickup","store hours","my store","curbside","store location","hours"],
      reply:()=>`<p>Your home store is <em>${esc(tk.brand||tk.concierge)} — ${esc(tk.store)}</em>.</p>
        <div class="svc-card"><div class="svc-row"><span>Hours today</span><b>${esc(svc("hoursToday"))}</b></div>
          <div class="svc-row"><span>Curbside pickup</span><b class="svc-ok"><i class="fa-solid fa-circle-check"></i> Available · ${esc(svc("pickupEta"))}</b></div>
          ${rowStore}</div>
        <p>Want me to set up a pickup order or hold an item for you?</p>${quicks([{label:"Hold an Item for Pickup",q:"hold an item at my store"},{label:"Shop for Something",q:"help me shop"}])}` },
    { keys:["hold an item","hold a","reserve","set aside","in stock","availability","do you have"],
      reply:()=>`<p>Done — I can place a <em>same-day hold</em> at ${esc(tk.store)}. Tell me which item (or ask me to recommend one) and I'll reserve it under your ${esc(tk.tier)} account for pickup today.</p>${quicks([{label:"Recommend Something",q:"recommend something to hold"}])}` },
    { keys:["loyalty","points","rewards","membership","perks","my account","account"],
      reply:()=>`<p>Here's your <em>${esc(tk.brand||"")} Rewards</em> snapshot, ${esc(tk.firstName)}:</p>
        <div class="svc-card"><div class="svc-row"><span>Tier</span><b>${esc(tk.tier)}</b></div>
          <div class="svc-row"><span>Points balance</span><b>${esc(svc("points"))}</b></div>
          <div class="svc-row"><span>Available reward</span><b class="svc-ok">${esc(svc("reward"))}</b></div>
          <div class="svc-row"><span>Home store</span><b>${esc(tk.store)}</b></div></div>
        <p>Want me to apply your reward to your cart, or explain how to earn more points this month?</p>${quicks([{label:"Apply my Reward",q:"apply my reward to my cart"},{label:"How Do I Earn More Points?",q:"how do i earn more points"}])}` },
    { keys:["apply my reward","apply reward","use my points","redeem"],
      reply:()=>`<p>✅ Applied — your reward is now attached to your cart and will show at checkout. Anything else I can help with?</p>` },
    { keys:["earn more points","double points","how do i earn"],
      reply:()=>`<p>Easy wins this month: ${esc(tk.tier)} members earn <em>2× points</em> on featured items and any in-store event. Want me to reserve a seat at the next one?</p>${quicks([{label:"Reserve a Seat",q:"reserve a seat for me"},{label:"Maybe Later",q:"maybe later, help me shop"}])}` },
    { keys:["reserve a seat","class seat","book a class","reserve a class"],
      reply:()=>`<p>🎉 Reserved! You're confirmed. A confirmation is in your app, and you'll earn double points. See you there, ${esc(tk.firstName)}!</p>` },
    { keys:["return","refund","send it back","exchange"],
      reply:()=>`<p>No problem — we accept returns on unopened items within 30 days. Since I can see your purchase history, I don't need a receipt. Return the most recent order (<em>${esc(svc("order"))}</em>)?</p>${quicks([{label:"Return "+svc("order"),q:"return my most recent order"},{label:"A Different Order",q:"return a different order"}])}` },
    { keys:["return my most recent","return a different","return order"],
      reply:()=>`<p>Got it — I've started the return on <em>${esc(svc("order"))}</em> and emailed you a prepaid label. Your refund of <em>${esc(svc("refundAmt"))}</em> will post within 3–5 days. Anything else I can take care of?</p>` },
    { keys:["hi","hello","hey","help","what can you"],
      reply:()=>`<p>${tpl("sommGreetShort")}</p>${quicks(GREET_CHIPS)}` },
  ];
}

// Two intent sources, registered SHOPPING-first into the 1:1 chip map below:
//   • SHOPPING intents come from APP_CONFIG.sommIntents (Gemini, per-customer).
//   • SERVICE intents are the generic hardcoded flows (order status, delivery,
//     loyalty, returns, greeting).
// Registering shopping first means a customer key wins any collision with a
// generic service key. There is no scoring/matching — see SOMM_BY_Q below.
const SOMM_SHOPPING = buildShoppingIntents();
const SOMM_SERVICE  = buildServiceIntents();
const SOMM_INTENTS  = SOMM_SHOPPING.concat(SOMM_SERVICE); // kept for any external readers

// DETERMINISTIC 1:1 concierge (scripted demo — no free typing, no matching).
// Every clickable chip carries a `q`; we build an exact map q → intent at load,
// keyed by each intent's `keys`. A chip click is a direct lookup, so clicking a
// chip ALWAYS shows exactly that chip's authored reply — never an off-topic one.
// Shopping (Gemini, per-customer) is registered FIRST so that if a service key
// ever collides with a customer key, the customer's own reply wins.
function normKey(s){ return String(s||"").toLowerCase().replace(/[^a-z0-9$ ]/g," ").replace(/\s+/g," ").trim(); }
const SOMM_BY_Q = {};
[].concat(SOMM_SHOPPING, SOMM_SERVICE).forEach(it=>{
  (it.keys||[]).forEach(k=>{ const nk=normKey(k); if(nk && !(nk in SOMM_BY_Q)) SOMM_BY_Q[nk]=it; });
});
function sommRespond(text){
  const it = SOMM_BY_Q[normKey(text)];
  if(it) return it.reply();
  // A chip whose q wasn't registered (shouldn't happen — the map is built from
  // the same intents the chips point at) degrades to the generic opener rather
  // than guessing. This is the only non-chip path now that free typing is gone.
  return `<p>${tpl("sommFallback","Great question! Tell me what you're after and I'll take care of it.")}</p>${quicks(GREET_CHIPS)}`;
}

function userInitial(){ return (tokens().firstName[0]||"?").toUpperCase(); }
function sommBubble(who,html){
  const log=document.getElementById("sommLog");
  const ava = who==="ai" ? `<span class="m-ava"><i class="fa-solid fa-wand-magic-sparkles"></i></span>` : `<span class="m-ava">${esc(userInitial())}</span>`;
  const el=document.createElement("div"); el.className="msg "+who;
  el.innerHTML=ava+`<div class="bubble">${html}</div>`;
  log.appendChild(el); log.scrollTop=log.scrollHeight;
}
function sommTyping(){
  const log=document.getElementById("sommLog");
  const el=document.createElement("div"); el.className="msg ai"; el.id="sommTyping";
  el.innerHTML=`<span class="m-ava"><i class="fa-solid fa-wand-magic-sparkles"></i></span><div class="bubble"><div class="typing"><span></span><span></span><span></span></div></div>`;
  log.appendChild(el); log.scrollTop=log.scrollHeight;
}
// `say` is what the user "typed" (shown in their bubble); `key` is the exact
// intent key used to look up the deterministic reply. When only one is passed
// (e.g. the opener greeting), it serves as both.
function sommRun(say, key){
  if(key==null) key=say;
  if(!say||!String(say).trim())return;
  sommBubble("user",esc(String(say).trim()));
  sommTyping();
  setTimeout(()=>{
    const t=document.getElementById("sommTyping"); if(t)t.remove();
    sommBubble("ai",sommRespond(key));
  }, 900+Math.random()*500);
}
// Scripted demo: the ONLY way to talk to the concierge is by clicking a chip,
// each of which carries the exact `q` (data-q) that maps 1:1 to its reply and a
// natural data-say for the chat bubble. (Free-text send was removed with the
// intent matcher.)
function sommQuick(el){
  if(typeof el==="string"){ sommRun(el); return; }
  sommRun(el.getAttribute("data-say")||el.getAttribute("data-q"), el.getAttribute("data-q"));
}

let sommGreeted=false;
function openSomm(){
  document.getElementById("sommPanel").classList.add("open");
  document.getElementById("sommFab").classList.add("hidden");
  if(!sommGreeted){
    sommGreeted=true;
    sommTyping();
    setTimeout(()=>{ const t=document.getElementById("sommTyping"); if(t)t.remove();
      sommBubble("ai",`<p>${tpl("sommIntro")}</p>${quicks(GREET_CHIPS)}`);
    },700);
  }
}
function closeSomm(){ document.getElementById("sommPanel").classList.remove("open"); document.getElementById("sommFab").classList.remove("hidden"); }

/* =====================================================================
   CIMULATE CONTEXTUAL SEARCH — deterministic, chip-driven (scripted demo)
   ---------------------------------------------------------------------
   Search has NO free typing: the only entry point is the intent chips, and
   each chip pins its exact result products via resultIds. There is no intent
   parser / scorer — the former beverage-keyword parser (parseIntent /
   scoreProduct / wineColorOf / spiritTypeOf / findCeleb) was removed because
   it was wine-locked and unreachable once search became chip-pinned.
   ===================================================================== */
// Find the searchChip whose query matches `q` (exact, then case-insensitive).
// The chips are the ONLY entry point to search (this is a scripted demo), so a
// chip always exists for any q that reaches here.
function chipFor(q){
  const chips=APP_CONFIG.searchChips||[];
  const t=String(q||"").trim().toLowerCase();
  return chips.find(c=>String(c.q||"").trim().toLowerCase()===t) || null;
}
// Resolve a chip's pinned result products, in the order Gemini specified.
// DETERMINISTIC: each chip carries resultIds:[...]; we render exactly those.
function chipResults(chip){
  const ids=(chip && Array.isArray(chip.resultIds)) ? chip.resultIds : [];
  return ids.map(id=>byId(id)).filter(Boolean);
}
function runSearch(q){
  q=(q||"").trim(); if(!q)return;
  showSearchHints(false);
  const chip=chipFor(q);
  let results=chipResults(chip);
  // Defensive only (never expected in the demo): if a chip's ids don't resolve,
  // show the first few catalog items so the page is never empty.
  if(!results.length) results=(APP_CONFIG.products||[]).slice(0,3);
  results=results.slice(0,6);

  // Profile is customer-variable and may be partial on a generated config —
  // read defensively so a missing name/tier never throws and aborts the render.
  const prof=APP_CONFIG.profile||{};
  const profName=prof.name||"you";
  const profTier=prof.tier||"Member";

  document.getElementById("ssQuery").textContent=`"${q}"`;
  document.getElementById("ssMeta").textContent=`${results.length} intent-matched results · ranked for ${profName} (${profTier})`;

  // Explanation signals: prefer the chip's own signals (Gemini-authored so they
  // describe the ACTUAL query), else derive a couple from the results.
  let sigs=(chip && Array.isArray(chip.signals) && chip.signals.length) ? chip.signals.slice(0,4) : [];
  if(!sigs.length){
    const cat=(results[0]||{}).cat;
    if(cat) sigs.push(`category: ${cat}`);
    const maxPrice=results.reduce((m,p)=>Math.max(m,Number(p.price)||0),0);
    if(maxPrice) sigs.push(`price ≤ $${Math.ceil(maxPrice/10)*10}`);
  }
  sigs.push(`profile: ${profTier} tier`);
  sigs.push(`profile: your purchase history`);
  document.getElementById("ssExplain").innerHTML=
    `<b>Cimulate understood your intent</b> — not just keywords. It parsed the meaning of your query and ranked results by relevance to <b>${esc(profName)}'s unified profile</b>.
     <div class="ss-signals">${sigs.map(s=>`<span class="sig"><i class="fa-solid fa-check"></i> ${esc(String(s))}</span>`).join("")}</div>`;

  document.getElementById("ssGrid").innerHTML=results.map((x,i)=>
    productCardHTML(x,{rankTag:i===0?`Top match for ${tokens().firstName}`:i===1?"Strong match":""})).join("");

  // Facet rail (nike.com-style refinements). Categories are derived from the
  // pinned results so the refinements reflect what's actually shown.
  const cats=[]; results.forEach(p=>{ if(p.cat && !cats.includes(p.cat)) cats.push(p.cat); });
  const topCat=cats[0]||"";
  const maxPrice=results.reduce((m,p)=>Math.max(m,Number(p.price)||0),0);
  const priceCap=maxPrice?Math.ceil(maxPrice/10)*10:100;
  const facetHTML=`
    <h4>Refine</h4>
    ${cats.map(c=>`<label class="facet ${c===topCat?'on':''}"><span><input type="checkbox" ${c===topCat?'checked':''} onclick="return false"> ${esc(c)}</span><small>${results.filter(p=>p.cat===c).length}</small></label>`).join("")}
    <h4>Price</h4>
    <label class="facet on"><span><input type="checkbox" checked onclick="return false"> Under $${priceCap}</span></label>
    <h4>Ranked for</h4>
    <label class="facet on"><span><input type="checkbox" checked onclick="return false"> ${esc(profName)} · ${esc(profTier)}</span></label>`;
  const fEl=document.getElementById("ssFacets"); if(fEl)fEl.innerHTML=facetHTML;

  // Show the results PAGE, hide the home sections (nike.com-style navigation)
  setHomeHidden(true);
  const page=document.getElementById("searchPage");
  page.hidden=false;
  const si=document.getElementById("searchInput"); if(si)si.value=q;
  window.scrollTo({top:0,behavior:"auto"});
}
function setHomeHidden(hide){
  document.querySelectorAll("[data-home]").forEach(el=>{ el.hidden=hide; });
}
function closeSearch(){
  const page=document.getElementById("searchPage"); if(page)page.hidden=true;
  setHomeHidden(false);
  showSearchHints(false);
  window.scrollTo({top:0,behavior:"auto"});
}
function showSearchHints(open){
  document.getElementById("searchHint").classList.toggle("open",open);
  if(open) setTimeout(()=>document.addEventListener("click",hintOutside),0);
}
function hintOutside(e){
  if(!e.target.closest(".search")){ document.getElementById("searchHint").classList.remove("open"); document.removeEventListener("click",hintOutside); }
}

/* Close overlays on Escape */
document.addEventListener("keydown",e=>{ if(e.key==="Escape"){ closeSearch(); closeCart(); }});

/* =====================================================================
   INIT
   ===================================================================== */
applyBrandColors();
applyBrandText();
renderHero();
renderGrid();
renderTrending();
renderSpecials();
renderCircles();
updateCart();
