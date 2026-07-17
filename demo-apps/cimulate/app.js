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
function quicks(arr){ return `<div class="quicks">${arr.map(q=>`<button class="chip" data-q="${esc(q.q)}" onclick="sommQuick(this)">${esc(q.label)}</button>`).join("")}</div>`; }

/* Update the main page with a curated rail reflecting the conversation */
function showCuratedRail(title,sub,ids){
  document.getElementById("curatedTitle").textContent=title;
  document.getElementById("curatedSub").textContent=sub;
  document.getElementById("curatedGrid").innerHTML=ids.map(id=>productCardHTML(byId(id))).join("");
  const rail=document.getElementById("curatedRail");
  rail.classList.add("show");
  setTimeout(()=>rail.scrollIntoView({behavior:"smooth",block:"start"}),150);
}

/* Greeting / service chips come from config (fall back to a generic set). */
const GREET_CHIPS   = (APP_CONFIG.greetChips   && APP_CONFIG.greetChips.length)   ? APP_CONFIG.greetChips   : [
  {label:"🛍️ Recommend something", q:"recommend something for me"},
  {label:"🎁 A gift", q:"help me pick a gift"},
  {label:"🛎️ Service & Account Help", q:"help me with something"},
];
const SERVICE_CHIPS = (APP_CONFIG.serviceChips && APP_CONFIG.serviceChips.length) ? APP_CONFIG.serviceChips : [
  {label:"📦 Track My Order", q:"track my order"},
  {label:"🚚 Delivery & Address", q:"delivery status"},
  {label:"🏬 Store Hours & Pickup", q:"my store hours and pickup"},
  {label:"⭐ Rewards & Points", q:"my loyalty rewards and points"},
  {label:"↩️ Return or Refund", q:"i want to return an item"},
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

const SOMM_INTENTS = buildShoppingIntents().concat(buildServiceIntents());

const SOMM_STOP = new Set(["a","an","the","my","me","for","to","of","and","or","is","it","in","on","at","with","your","you","i","do","does","can","help","please","get","show","find","some","something","thing","want","need","would","like","how"]);
function sommRespond(text){
  const t=" "+text.toLowerCase().replace(/[^a-z0-9$ ]/g," ").replace(/\s+/g," ").trim()+" ";
  // Pass 1 — score every intent by its LONGEST whole-word matching keyword, so
  // specific phrases (e.g. "update my delivery") beat short generic ones.
  let best=null, bestLen=0;
  for(const it of SOMM_INTENTS){
    for(const k of it.keys){
      if(t.includes(" "+k+" ") && k.length>bestLen){ bestLen=k.length; best=it; }
    }
  }
  if(best)return best.reply();
  // Pass 2 — token-overlap fallback. Generated chips (e.g. "Book a Fitting
  // session") aren't guaranteed to phrase-match any intent's keys, which used
  // to dead-end into the generic fallback. Route to the intent sharing the most
  // meaningful words with the message so the chip still does something on-point.
  const words=t.trim().split(" ").filter(w=>w && !SOMM_STOP.has(w));
  if(words.length){
    let bestScore=0;
    for(const it of SOMM_INTENTS){
      const hay=(it.keys||[]).join(" ").toLowerCase();
      let score=0;
      for(const w of words){ if(hay.indexOf(w)>=0) score++; }
      if(score>bestScore){ bestScore=score; best=it; }
    }
    if(best && bestScore>0) return best.reply();
  }
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
function sommRun(text){
  if(!text||!text.trim())return;
  sommBubble("user",esc(text.trim()));
  sommTyping();
  setTimeout(()=>{
    const t=document.getElementById("sommTyping"); if(t)t.remove();
    sommBubble("ai",sommRespond(text));
  }, 900+Math.random()*500);
}
function sommSend(){ const i=document.getElementById("sommInput"); sommRun(i.value); i.value=""; }
function sommQuick(el){ sommRun(typeof el==="string" ? el : el.getAttribute("data-q")); }

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
   CIMULATE CONTEXTUAL SEARCH — intent parsing (scripted) + ranking
   ===================================================================== */
const SEARCH_STOP=["under","over","a","an","the","for","with","and","to","of","$","me","show"];
// Celebrity/affinity tie-in lookup. Tolerates BOTH config shapes:
//   • stock array:  [{ match:[...], name, brand, ids:[...], blurb }]
//   • generated map: { "<lowercasename>": { match:string, productIds:[...] } }
// Returns a normalized { ids, brand, blurb } or null. Fully guarded so a
// missing/oddly-shaped celebs field can never throw and abort the search.
function findCeleb(t){
  const raw=APP_CONFIG.celebs;
  if(!raw) return null;
  // Normalize to a list of {keys:[...], ids:[...], brand, blurb}.
  let list=[];
  if(Array.isArray(raw)){
    list=raw.map(c=>({
      keys: Array.isArray(c.match) ? c.match : (c.match ? [String(c.match)] : (c.name ? [String(c.name)] : [])),
      ids: Array.isArray(c.ids) ? c.ids : (Array.isArray(c.productIds) ? c.productIds : []),
      brand: c.brand || c.name || "",
      blurb: c.blurb || "",
    }));
  } else if(typeof raw==="object"){
    list=Object.keys(raw).map(name=>{
      const c=raw[name]||{};
      return {
        keys: Array.isArray(c.match) ? c.match : [String(name)],
        ids: Array.isArray(c.ids) ? c.ids : (Array.isArray(c.productIds) ? c.productIds : []),
        brand: c.brand || name || "",
        blurb: c.blurb || (typeof c.match==="string" ? c.match : ("Cimulate recognized <b>"+esc(name)+"</b> and connected them to their brand.")),
      };
    });
  }
  const hit=list.find(c=>c.keys.some(m=>m && t.includes(String(m).toLowerCase())));
  return (hit && hit.ids.length) ? hit : null; // only trigger celeb path if it maps to real products
}
// Distinct product categories present in the live catalog, in first-seen order.
// Drives the facet rail + category matching so search adapts to ANY customer.
function catalogCats(){
  const seen=[], out=[];
  (APP_CONFIG.products||[]).forEach(p=>{ if(p.cat && !seen.includes(p.cat)){ seen.push(p.cat); out.push(p.cat); } });
  return out;
}
function hasCat(name){ return catalogCats().some(c=>c.toLowerCase()===name.toLowerCase()); }
function parseIntent(q){
  const t=q.toLowerCase();
  const priceMatch=t.match(/\$?\s?(\d{2,4})/);
  const maxPrice=priceMatch?parseInt(priceMatch[1]):null;
  const flavors=[];
  ["smoky","japanese","whisky","whiskey","scotch","bold","crisp","white","summer","seafood","ipa","craft","party","easy-drinking","lager","citrus","celebration","peat"].forEach(f=>{ if(t.includes(f))flavors.push(f); });
  // Category detection: first try to match any LIVE catalog category by name
  // (so a golf retailer matches "clubs"/"apparel", etc.); then fall back to the
  // beverage keyword heuristics, but ONLY for categories the catalog actually has.
  let cat=null;
  const cats=catalogCats();
  for(const c of cats){ const cl=c.toLowerCase(); if(cl.length>2 && (t.includes(cl)||t.includes(cl.replace(/s$/,"")))){ cat=c; break; } }
  if(!cat){
    if(hasCat("Spirits") && /whisk|scotch|tequila|vodka|\bgin\b|\brum\b|mezcal|spirit|bourbon|cognac/.test(t))cat="Spirits";
    else if(hasCat("Wine") && /wine|red|white|cabernet|pinot|chardonnay|sauvignon|champagne|rosé|rose|merlot|malbec|riesling|prosecco/.test(t))cat="Wine";
    else if(hasCat("Beer") && /beer|ipa|lager|ale|pilsner|stout|pale ale/.test(t))cat="Beer";
  }
  // Wine color intent — "bold red", "cabernet", "pinot" ⇒ red; "crisp white", "chardonnay", "sauvignon blanc" ⇒ white
  let wineColor=null;
  if(cat==="Wine"){
    if(/\bred\b|bold|cabernet|pinot noir|merlot|malbec|syrah|zinfandel/.test(t))wineColor="red";
    else if(/\bwhite\b|crisp|chardonnay|sauvignon|pinot grigio|riesling/.test(t))wineColor="white";
    else if(/champagne|sparkling|prosecco|bubbly/.test(t))wineColor="sparkling";
    else if(/rosé|rose/.test(t))wineColor="rosé";
  }
  // Spirit type intent — keeps tequila/vodka/etc. out of a "whisky" search and vice-versa
  let spiritType=null;
  if(cat==="Spirits"){
    if(/whisk|scotch|bourbon/.test(t))spiritType="whisky";
    else if(/tequila/.test(t))spiritType="tequila";
    else if(/mezcal/.test(t))spiritType="mezcal";
    else if(/vodka/.test(t))spiritType="vodka";
    else if(/\bgin\b/.test(t))spiritType="gin";
    else if(/\brum\b/.test(t))spiritType="rum";
    else if(/cognac/.test(t))spiritType="cognac";
  }
  const wantsJapanese=/japanese|japan/.test(t);
  const celeb=findCeleb(t);
  return {maxPrice,flavors,cat,wineColor,spiritType,wantsJapanese,celeb,raw:q};
}
// Classify a wine product as red / white / sparkling / rosé
function wineColorOf(p){
  const s=((p.type||"")+" "+(p.name||"")+" "+((p.flavors||[]).join(" "))).toLowerCase();
  if(/champagne|sparkling|prosecco|cava|crémant|cremant/.test(s))return "sparkling";
  if(/rosé|rose\b/.test(s))return "rosé";
  if(/cabernet|pinot noir|merlot|malbec|syrah|zinfandel|red blend|\bred\b|bold/.test(s))return "red";
  return "white"; // chardonnay, sauv blanc, riesling, etc.
}
// Classify a spirit by type from its data
function spiritTypeOf(p){
  const s=((p.type||"")+" "+(p.name||"")+" "+((p.flavors||[]).join(" "))).toLowerCase();
  if(/whisk|scotch|bourbon/.test(s))return "whisky";
  if(/tequila/.test(s))return "tequila";
  if(/mezcal/.test(s))return "mezcal";
  if(/vodka/.test(s))return "vodka";
  if(/\bgin\b/.test(s))return "gin";
  if(/\brum\b/.test(s))return "rum";
  if(/cognac|brandy/.test(s))return "cognac";
  return "other";
}
function scoreProduct(p,intent){
  let score=0;
  if(intent.cat && p.cat===intent.cat)score+=40;
  // Wine color: reward a match, strongly penalize the wrong color (keeps whites out of a "bold red" search)
  if(intent.wineColor && p.cat==="Wine"){
    if(wineColorOf(p)===intent.wineColor)score+=30; else score-=80;
  }
  // Spirit type: reward a match, strongly penalize wrong type (keeps tequila out of a "whisky" search)
  if(intent.spiritType && p.cat==="Spirits"){
    if(spiritTypeOf(p)===intent.spiritType)score+=30; else score-=80;
  }
  // Japanese origin preference (soft) — lifts Japanese products when asked
  if(intent.wantsJapanese){
    const isJp=/japan/.test(((p.region||"")+" "+(p.type||"")).toLowerCase());
    if(isJp)score+=20; else if(p.cat==="Spirits")score-=25;
  }
  intent.flavors.forEach(f=>{ if((p.flavors||[]).includes(f)||(p.type||"").toLowerCase().includes(f))score+=14; });
  // Free-text token overlap: lets INTENT-style queries ("driver to fix my
  // slice", "waterproof jacket for tournaments") surface the right product for
  // ANY industry, not just beverage keywords. Match query words against the
  // product's name/type/notes/flavors/category.
  const hay=((p.name||"")+" "+(p.type||"")+" "+(p.notes||"")+" "+(p.cat||"")+" "+((p.flavors||[]).join(" "))+" "+((p.pairings||[]).join(" "))).toLowerCase();
  const STOP={the:1,a:1,an:1,to:1,for:1,my:1,me:1,of:1,and:1,or:1,with:1,in:1,on:1,under:1,best:1,good:1,some:1,that:1,this:1,i:1,need:1,want:1,find:1,looking:1,new:1,get:1};
  ((intent.raw||"").toLowerCase().match(/[a-z]{3,}/g)||[]).forEach(w=>{ if(!STOP[w] && hay.includes(w))score+=12; });
  if(intent.maxPrice && p.price<=intent.maxPrice)score+=18;
  if(intent.maxPrice && p.price>intent.maxPrice)score-=60; // hard filter-ish
  // Data 360 personalization: lift items matching the shopper's affinity SKUs.
  // Sourced from config (profile.affinityIds) so it's per-customer, not wine.
  const affIds=(APP_CONFIG.profile&&APP_CONFIG.profile.affinityIds)||[];
  if(affIds.includes(p.id))score+=8;
  score+=((Number(p.rating)||85)-85); // guard: missing rating must not make score NaN
  return score;
}
function runSearch(q){
  q=(q||"").trim(); if(!q)return;
  showSearchHints(false);
  const intent=parseIntent(q);
  let results;
  if(intent.celeb){
    // Celebrity search: surface that person's owned brand, ranked by rating.
    results=intent.celeb.ids.map(id=>byId(id)).filter(Boolean)
      .map(p=>({p,s:(Number(p.rating)||85)})).sort((a,b)=>b.s-a.s);
    if(!results.length){ // celeb's product ids not in this catalog → don't dead-end
      results=APP_CONFIG.products.map(p=>({p,s:scoreProduct(p,intent)})).sort((a,b)=>b.s-a.s).slice(0,3);
      intent.celeb=null; // fall back to the standard intent explanation
    }
  } else {
    results=APP_CONFIG.products
      .map(p=>({p,s:scoreProduct(p,intent)}))
      .filter(x=> intent.maxPrice ? byId(x.p.id).price<=intent.maxPrice : true)
      .filter(x=> intent.cat ? x.p.cat===intent.cat : true)
      .filter(x=> intent.wineColor && x.p.cat==="Wine" ? wineColorOf(x.p)===intent.wineColor : true)
      .filter(x=> intent.spiritType && x.p.cat==="Spirits" ? spiritTypeOf(x.p)===intent.spiritType : true)
      .sort((a,b)=>b.s-a.s);
    if(!results.length){ // fall back to loose match if nothing passes hard filters
      results=APP_CONFIG.products.map(p=>({p,s:scoreProduct(p,intent)})).sort((a,b)=>b.s-a.s).slice(0,3);
    }
  }
  results=results.slice(0,6);

  // Profile is customer-variable and may be partial on a generated config —
  // read defensively so a missing name/tier never throws and aborts the render.
  const prof=APP_CONFIG.profile||{};
  const profName=prof.name||"you";
  const profTier=prof.tier||"Member";

  document.getElementById("ssQuery").textContent=`"${q}"`;
  document.getElementById("ssMeta").textContent=`${results.length} intent-matched results · ranked for ${profName} (${profTier})`;

  // signals
  const sigs=[];
  if(intent.celeb){
    const celebCat=(byId(intent.celeb.ids&&intent.celeb.ids[0])||{}).cat;
    sigs.push(`entity: person recognized`);
    sigs.push(`brand: ${intent.celeb.brand}`);
    if(celebCat)sigs.push(`category: ${celebCat}`);
    sigs.push(`profile: ${profTier} tier`);
  } else {
    if(intent.cat)sigs.push(`category: ${intent.cat}`);
    intent.flavors.slice(0,4).forEach(f=>sigs.push(`taste: ${f}`));
    if(intent.maxPrice)sigs.push(`price ≤ $${intent.maxPrice}`);
    sigs.push(`profile: ${profTier} tier`);
    sigs.push(`profile: your purchase history`);
  }
  document.getElementById("ssExplain").innerHTML= intent.celeb
    ? `${intent.celeb.blurb}
     <div class="ss-signals">${sigs.map(s=>`<span class="sig"><i class="fa-solid fa-check"></i> ${esc(s)}</span>`).join("")}</div>`
    : `<b>Cimulate understood your intent</b> — not just keywords. It parsed the meaning of your query and ranked results by relevance to <b>${profName}'s unified profile</b>.
     <div class="ss-signals">${sigs.map(s=>`<span class="sig"><i class="fa-solid fa-check"></i> ${esc(s)}</span>`).join("")}</div>`;

  document.getElementById("ssGrid").innerHTML=results.map((x,i)=>
    productCardHTML(x.p,{rankTag:i===0?`Top match for ${tokens().firstName}`:i===1?"Strong match":""})).join("");

  // Facet rail (nike.com-style refinements — reflect the parsed intent).
  // Categories are derived from the live catalog so ANY customer's categories
  // (clubs/apparel/… for a golf retailer, etc.) render — never hardcoded wine.
  const cats=catalogCats();
  const facetHTML=`
    <h4>Refine</h4>
    ${cats.map(c=>`<label class="facet ${intent.cat===c?'on':''}"><span><input type="checkbox" ${intent.cat===c?'checked':''} onclick="return false"> ${c}</span><small>${APP_CONFIG.products.filter(p=>p.cat===c).length}</small></label>`).join("")}
    <h4>Price</h4>
    <label class="facet ${intent.maxPrice?'on':''}"><span><input type="checkbox" ${intent.maxPrice?'checked':''} onclick="return false"> Under $${intent.maxPrice||100}</span></label>
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
