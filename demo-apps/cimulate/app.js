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
function sizeLine(p){ return /pack/i.test(p.type||"") ? p.type.split("·")[1]?.trim()||"6-pack" : "750ml Bottle"; }

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
  return `<a href="#featured" ${onclick?`onclick="${onclick}"`:""}><span class="ci">${p?productImage(p,96,248):'<i class="fa-solid fa-wine-bottle"></i>'}</span><span>${esc(label)}</span></a>`;
}
function renderGrid(){
  const order=["caymus","hakushu","silveroak","kimcrawford","macallan18","sierraneva","cakebread","veuve","meiomi","casamigos"];
  document.getElementById("productGrid").innerHTML = order.map(id=>productCardHTML(byId(id))).join("");
}
function renderTrending(){
  const ids=["meiomi","casamigos","voodoo","veuve","cakebread","kimcrawford","stellabeer","nikka","sierraneva","silveroak"];
  document.getElementById("trendingGrid").innerHTML = ids.map(id=>productCardHTML(byId(id))).join("");
}
function renderSpecials(){
  const ids=["kimcrawford","casamigos","meiomi","stellabeer","cakebread","sierraneva","nikka","hakushu","voodoo","veuve"];
  document.getElementById("specialsGrid").innerHTML = ids.map(id=>productCardHTML(byId(id))).join("");
}
function renderCircles(){
  document.getElementById("matchDayStrip").innerHTML = [
    catCircleHTML("Bold Reds for Game Day","caymus"),
    catCircleHTML("Cocktails for Your Team","casamigos"),
    catCircleHTML("Savings on Red Wine","silveroak"),
    catCircleHTML("Ready to Drink Sips","stellabeer"),
    catCircleHTML("Party Beer","sierraneva"),
    catCircleHTML("Curated Picks","veuve"),
  ].join("");
  document.getElementById("topCatStrip").innerHTML = [
    catCircleHTML("Sauvignon Blanc","kimcrawford"),
    catCircleHTML("Cabernet Sauvignon","caymus"),
    catCircleHTML("Reposado","casamigos"),
    catCircleHTML("Pinot Noir","meiomi"),
    catCircleHTML("Japanese Whisky","hakushu"),
    catCircleHTML("Champagne","veuve"),
  ].join("");
  document.getElementById("cocktailStrip").innerHTML = [
    catCircleHTML("French 75","veuve"),
    catCircleHTML("Whisky Highball","hakushu"),
    catCircleHTML("Margarita","casamigos"),
    catCircleHTML("Old Fashioned","macallan18"),
    catCircleHTML("Summer Cocktails","kimcrawford"),
    catCircleHTML("Ask Somm to Mix","caymus","openSomm();return false"),
  ].join("");
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
    toast("data","Data 360 profile updated",`New purchase-intent signal captured for ${APP_CONFIG.profile.name} — feeds future recommendations.`);
  }
}
function updateCart(){
  const count=CART.reduce((n,c)=>n+c.qty,0);
  document.getElementById("cartCount").textContent=count;
  const items=document.getElementById("cartItems");
  if(!CART.length){ items.innerHTML=`<div class="cart-empty"><i class="fa-solid fa-wine-bottle"></i>Your cart is empty.<br/>Ask Somm for a recommendation!</div>`; }
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

const SOMM_INTENTS=[
  { keys:["steak","dinner party","bold red","cabernet","pair with steak","hosting"],
    reply:()=>{
      showCuratedRail("Curated for your steak dinner party",
        "Somm selected these bold reds based on your conversation and your Premium profile (you love big Napa Cabs).",
        ["caymus","silveroak","veuve"]);
      return `<p>A steak dinner party — my favorite! 🥩 Since your profile tells me you lean toward <em>bold Napa Cabernet</em>, here are two showstoppers that pair beautifully with a ribeye:</p>
        ${recCardChat("caymus")}${recCardChat("silveroak")}
        <p>I've also refreshed the page with a <em>"Curated for your dinner party"</em> selection ↑. Want a sparkling option to open the evening?</p>
        ${quicks([{label:"Add a Bubbly to start",q:"suggest a champagne to open the party"},{label:"Under $100 Only",q:"keep the reds under $100"}])}`;
    }},
  { keys:["champagne","bubbly","sparkling","open the party","celebrate"],
    reply:()=>`<p>Perfect way to greet guests. The <em>Veuve Clicquot Yellow Label</em> is a crowd-pleaser — crisp, toasty, and always celebratory.</p>${recCardChat("veuve")}`
  },
  { keys:["under $100","under $50","keep the reds","budget","cheaper","affordable"],
    reply:()=>{
      showCuratedRail("Bold reds under $100","Trimmed to your budget while keeping the impress-your-guests factor.",["caymus","silveroak","meiomi"]);
      return `<p>Absolutely — all three of these land under $100. The <em>Caymus</em> and <em>Silver Oak</em> are the showstoppers, and the <em>Meiomi</em> is a beautifully smooth value pick:</p>${recCardChat("silveroak")}${recCardChat("meiomi")}<p>I've updated the curated rail to under-$100 reds ↑.</p>`;
    }},
  { keys:["whisky","whiskey","scotch","smoky","japanese","bourbon","spirit"],
    reply:()=>{
      showCuratedRail("Smoky whiskies you'll love","Grounded on your past whisky purchases (you bought Hakushu in September).",["hakushu","nikka","macallan18"]);
      return `<p>You've explored Japanese whisky before, so you'll feel right at home here. For something <em>smoky</em>, I'd start with:</p>${recCardChat("hakushu")}${recCardChat("nikka")}<p>Both under $80. Want me to pull up the full smoky-whisky search?</p>${quicks([{label:"Show Full Search",q:"open cimulate search for smoky japanese whisky under $80"}])}`;
    }},
  { keys:["cimulate search","open cimulate","full search","open search"],
    reply:()=>{ setTimeout(()=>runSearch("smoky Japanese whisky under $80"),400); return `<p>On it — opening Cimulate intent search for <em>"smoky Japanese whisky under $80"</em>…</p>`; }},
  { keys:["beer","ipa","party beer","lager","craft"],
    reply:()=>{
      showCuratedRail("Party-ready craft beer","Easy-drinking crowd-pleasers for a gathering.",["sierraneva","voodoo","stellabeer"]);
      return `<p>For an easy-drinking party crowd-pleaser, you can't go wrong with a juicy hazy IPA:</p>${recCardChat("sierraneva")}<p>I've added a party-beer rail up top ↑ with a few more options.</p>`;
    }},
  { keys:["white","seafood","summer","crisp","sauvignon","chardonnay"],
    reply:()=>{
      showCuratedRail("Crisp whites for seafood","Bright, zesty whites to match lighter fare.",["kimcrawford","cakebread"]);
      return `<p>For seafood, a crisp white is ideal. The <em>Kim Crawford Sauvignon Blanc</em> is zesty and refreshing:</p>${recCardChat("kimcrawford")}`;
    }},
  { keys:["gift","present","birthday","give"],
    reply:()=>`<p>A great gift bottle should feel special. For a wine lover, <em>Silver Oak</em> or a bottle of <em>Veuve Clicquot</em> both wrap beautifully and always impress:</p>${recCardChat("veuve")}`
  },
  // ---------- SERVICE NEEDS ----------
  { keys:["help me with something","service","customer service","support","i need help","account help"],
    reply:()=>`<p>Of course — I can handle service needs right here, no waiting on hold. What do you need a hand with?</p>${quicks(SERVICE_CHIPS)}`
  },
  { keys:["order status","track my order","where is my order","track order","order","shipment"],
    reply:()=>`<p>Here's your latest order, pulled straight from your unified profile:</p>
      <div class="svc-card"><div class="svc-row"><span>Order</span><b>#TW-48120</b></div>
        <div class="svc-row"><span>Placed</span><b>Nov 3 · 2 bottles</b></div>
        <div class="svc-row"><span>Status</span><b class="svc-ok"><i class="fa-solid fa-truck-fast"></i> Out for delivery</b></div>
        <div class="svc-row"><span>ETA</span><b>By 6:00 PM today · Modesto, CA</b></div></div>
      <p>Anything you'd like to change on it?</p>${quicks([{label:"Change Delivery Address",q:"update my delivery address"},{label:"Report a Missing Item",q:"report a missing bottle"},{label:"More Service Options",q:"help me with something"}])}`
  },
  { keys:["delivery","deliver","track","shipment status","when will it arrive"],
    reply:()=>`<p>Your order <em>#TW-48120</em> is <em>out for delivery</em> to your Modesto address, arriving <b>by 6 PM today</b>. Signature isn't required (age verified on your Premium profile). Want to reroute it or leave a delivery note?</p>${quicks([{label:"Change Delivery Address",q:"update my delivery address"},{label:"Report a Missing Item",q:"report a missing bottle"}])}`
  },
  { keys:["update my delivery","update address","change address","change delivery","reroute"],
    reply:()=>`<p>Got it — I can reroute order <em>#TW-48120</em>. It's still with the local driver, so a change is easy. Where should it go?</p>${quicks([{label:"To my Home Store for Pickup",q:"send it to my modesto store for pickup"},{label:"Keep Home Delivery",q:"keep home delivery, thanks"}])}`
  },
  { keys:["report a missing","missing bottle","missing item","damaged","broken bottle"],
    reply:()=>`<p>I'm sorry about that — I've opened a case on order <em>#TW-48120</em> and, since you're a <em>Premium</em> member, pre-approved a replacement or refund. A specialist will confirm within a minute; no need to repeat anything. Anything else? 🍷</p>`
  },
  { keys:["pickup","store hours","my store","curbside","store location","modesto store","hours"],
    reply:()=>`<p>Your home store is <em>Total Wine — Modesto, CA</em>.</p>
      <div class="svc-card"><div class="svc-row"><span>Hours today</span><b>9:00 AM – 9:00 PM</b></div>
        <div class="svc-row"><span>Curbside pickup</span><b class="svc-ok"><i class="fa-solid fa-circle-check"></i> Available · ~15 min</b></div>
        <div class="svc-row"><span>Wine consultant</span><b>Marie L. · on floor today</b></div></div>
      <p>Want me to set up a pickup order or hold a bottle for you?</p>${quicks([{label:"Hold a Bottle for Pickup",q:"hold a bottle at my store"},{label:"Shop for Something",q:"help me shop"}])}`
  },
  { keys:["hold a bottle","reserve","set aside","in stock","availability","do you have"],
    reply:()=>`<p>Done — I can place a <em>same-day hold</em> at your Modesto store. Tell me which bottle (or ask me to recommend one) and I'll reserve it under your Premium account for pickup today.</p>${quicks([{label:"Recommend a Bold Red",q:"recommend a bold red to hold"},{label:"Recommend a Whisky",q:"recommend a whisky to hold"}])}`
  },
  { keys:["loyalty","points","rewards","membership","premium perks","my account","account"],
    reply:()=>`<p>Here's your <em>Total Wine &amp; More Rewards</em> snapshot, Lauren:</p>
      <div class="svc-card"><div class="svc-row"><span>Tier</span><b>Premium</b></div>
        <div class="svc-row"><span>Points balance</span><b>4,820 pts</b></div>
        <div class="svc-row"><span>Available reward</span><b class="svc-ok">$25 off your next order</b></div>
        <div class="svc-row"><span>Home store</span><b>Modesto, CA</b></div></div>
      <p>Want me to apply your $25 reward to your cart, or explain how to earn double points this month?</p>${quicks([{label:"Apply my $25 Reward",q:"apply my reward to my cart"},{label:"How Do I Earn More Points?",q:"how do i earn more points"}])}`
  },
  { keys:["apply my reward","apply reward","use my points","redeem"],
    reply:()=>`<p>✅ Applied — <em>$25 off</em> is now attached to your cart and will show at checkout. Your remaining balance is <em>2,320 pts</em>. Anything else I can help with?</p>`
  },
  { keys:["earn more points","double points","how do i earn"],
    reply:()=>`<p>Easy wins this month: Premium members earn <em>2× points</em> on wine over $40 and on any in-store class. You've got the <em>Wine &amp; Cheese Pairing Class</em> available at your Modesto store — that alone is ~600 points. Want me to reserve a seat?</p>${quicks([{label:"Reserve a Class Seat",q:"reserve a class seat for me"},{label:"Maybe Later",q:"maybe later, help me shop"}])}`
  },
  { keys:["reserve a class","class seat","book a class","wine class"],
    reply:()=>`<p>🎉 Reserved! You're confirmed for the <em>Wine &amp; Cheese Pairing Class</em> at Total Wine — Modesto. A confirmation is in your app, and you'll earn double points. See you there, Lauren!</p>`
  },
  { keys:["return","refund","send it back","exchange"],
    reply:()=>`<p>No problem — Total Wine accepts returns on unopened bottles within 30 days. Since I can see your purchase history, I don't need a receipt. Which order would you like to return, or is it the most recent (<em>#TW-48120</em>)?</p>${quicks([{label:"Return Order #TW-48120",q:"return my most recent order"},{label:"A Different Order",q:"return a different order"}])}`
  },
  { keys:["return my most recent","return a different","return order"],
    reply:()=>`<p>Got it — I've started the return on <em>#TW-48120</em> and emailed you a prepaid label. Your refund of <em>$114.98</em> will post to your original payment within 3–5 days. Anything else I can take care of? 🍷</p>`
  },
  { keys:["hi","hello","hey","help","what can you"],
    reply:()=>`<p>Hi Lauren! 👋 I'm <em>Somm</em>, your Total Wine concierge. I can help you <em>discover a bottle</em> or handle <em>service needs</em> — orders, delivery, pickup, rewards, returns. What can I do for you?</p>${quicks(GREET_CHIPS)}`
  },
];
const GREET_CHIPS=[
  {label:"🥩 Bold Red for a Steak Dinner Party", q:"I'm hosting a dinner party and need a bold red to pair with steak"},
  {label:"🥃 Smoky Whisky", q:"show me a smoky Japanese whisky"},
  {label:"🍺 Party Beer", q:"an easy-drinking craft IPA for a party"},
  {label:"🎁 A Gift Bottle", q:"help me pick a gift bottle"},
  {label:"🛎️ Service & Account Help", q:"help me with something"},
];
// Service-needs menu — surfaced when Lauren asks for help beyond shopping
const SERVICE_CHIPS=[
  {label:"📦 Track My Order", q:"track my order"},
  {label:"🚚 Delivery & Address", q:"delivery status"},
  {label:"🏬 Store Hours & Pickup", q:"my store hours and pickup"},
  {label:"⭐ Rewards & Points", q:"my loyalty rewards and points"},
  {label:"↩️ Return or Refund", q:"i want to return a bottle"},
];

function sommRespond(text){
  const t=" "+text.toLowerCase().replace(/[^a-z0-9$ ]/g," ").replace(/\s+/g," ").trim()+" ";
  // Score every intent by its LONGEST whole-word matching keyword, so specific
  // phrases (e.g. "update my delivery") beat short generic ones (e.g. "delivery").
  let best=null, bestLen=0;
  for(const it of SOMM_INTENTS){
    for(const k of it.keys){
      if(t.includes(" "+k+" ") && k.length>bestLen){ bestLen=k.length; best=it; }
    }
  }
  if(best)return best.reply();
  return `<p>Great question! I can help with wine, spirits, beer, gifts, pairings — even orders, delivery, pickup, rewards or returns. Tell me what you're after and I'll take care of it.</p>${quicks(GREET_CHIPS)}`;
}

function sommBubble(who,html){
  const log=document.getElementById("sommLog");
  const ava = who==="ai" ? `<span class="m-ava"><i class="fa-solid fa-wine-glass"></i></span>` : `<span class="m-ava">L</span>`;
  const el=document.createElement("div"); el.className="msg "+who;
  el.innerHTML=ava+`<div class="bubble">${html}</div>`;
  log.appendChild(el); log.scrollTop=log.scrollHeight;
}
function sommTyping(){
  const log=document.getElementById("sommLog");
  const el=document.createElement("div"); el.className="msg ai"; el.id="sommTyping";
  el.innerHTML=`<span class="m-ava"><i class="fa-solid fa-wine-glass"></i></span><div class="bubble"><div class="typing"><span></span><span></span><span></span></div></div>`;
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
      sommBubble("ai",`<p>Hi Lauren! 👋 I'm <em>Somm</em>, your personal Total Wine concierge. I already know a bit about your taste from your <em>Premium</em> profile — bold reds, smoky whisky, and hosting a good gathering.</p><p>What can I help you find today?</p>${quicks(GREET_CHIPS)}`);
    },700);
  }
}
function closeSomm(){ document.getElementById("sommPanel").classList.remove("open"); document.getElementById("sommFab").classList.remove("hidden"); }

/* =====================================================================
   CIMULATE CONTEXTUAL SEARCH — intent parsing (scripted) + ranking
   ===================================================================== */
const SEARCH_STOP=["under","over","a","an","the","for","with","and","to","of","$","me","show"];
function findCeleb(t){ return APP_CONFIG.celebs.find(c=>c.match.some(m=>t.includes(m))) || null; }
function parseIntent(q){
  const t=q.toLowerCase();
  const priceMatch=t.match(/\$?\s?(\d{2,4})/);
  const maxPrice=priceMatch?parseInt(priceMatch[1]):null;
  const flavors=[];
  ["smoky","japanese","whisky","whiskey","scotch","bold","crisp","white","summer","seafood","ipa","craft","party","easy-drinking","lager","citrus","celebration","peat"].forEach(f=>{ if(t.includes(f))flavors.push(f); });
  let cat=null;
  if(/whisk|scotch|tequila|vodka|\bgin\b|\brum\b|mezcal|spirit|bourbon|cognac/.test(t))cat="Spirits";
  else if(/wine|red|white|cabernet|pinot|chardonnay|sauvignon|champagne|rosé|rose|merlot|malbec|riesling|prosecco/.test(t))cat="Wine";
  else if(/beer|ipa|lager|ale|pilsner|stout|pale ale/.test(t))cat="Beer";
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
  if(intent.maxPrice && p.price<=intent.maxPrice)score+=18;
  if(intent.maxPrice && p.price>intent.maxPrice)score-=60; // hard filter-ish
  // Data 360 personalization: Lauren's affinities lift matching items
  if(["caymus","silveroak"].includes(p.id))score+=6;          // bold reds
  if(["hakushu","nikka","macallan18"].includes(p.id))score+=8; // whisky explorer
  score+=(p.rating-85);
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
      .map(p=>({p,s:p.rating})).sort((a,b)=>b.s-a.s);
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

  document.getElementById("ssQuery").textContent=`"${q}"`;
  document.getElementById("ssMeta").textContent=`${results.length} intent-matched results · ranked for ${APP_CONFIG.profile.name} (${APP_CONFIG.profile.tier})`;

  // signals
  const sigs=[];
  if(intent.celeb){
    sigs.push(`entity: person recognized`);
    sigs.push(`brand: ${intent.celeb.brand}`);
    sigs.push(`category: Spirits · Tequila`);
    sigs.push(`profile: Premium tier`);
  } else {
    if(intent.cat)sigs.push(`category: ${intent.cat}`);
    intent.flavors.slice(0,4).forEach(f=>sigs.push(`taste: ${f}`));
    if(intent.maxPrice)sigs.push(`price ≤ $${intent.maxPrice}`);
    sigs.push(`profile: Premium tier`);
    sigs.push(`profile: past whisky & bold-red purchases`);
  }
  document.getElementById("ssExplain").innerHTML= intent.celeb
    ? `${intent.celeb.blurb}
     <div class="ss-signals">${sigs.map(s=>`<span class="sig"><i class="fa-solid fa-check"></i> ${esc(s)}</span>`).join("")}</div>`
    : `<b>Cimulate understood your intent</b> — not just keywords. It parsed the meaning of your query and ranked results by relevance to <b>${APP_CONFIG.profile.name}'s unified profile</b>.
     <div class="ss-signals">${sigs.map(s=>`<span class="sig"><i class="fa-solid fa-check"></i> ${esc(s)}</span>`).join("")}</div>`;

  document.getElementById("ssGrid").innerHTML=results.map((x,i)=>
    productCardHTML(x.p,{rankTag:i===0?"Top match for Lauren":i===1?"Strong match":""})).join("");

  // Facet rail (nike.com-style refinements — reflect the parsed intent)
  const cats=["Wine","Spirits","Beer"];
  const facetHTML=`
    <h4>Refine</h4>
    ${cats.map(c=>`<label class="facet ${intent.cat===c?'on':''}"><span><input type="checkbox" ${intent.cat===c?'checked':''} onclick="return false"> ${c}</span><small>${APP_CONFIG.products.filter(p=>p.cat===c).length}</small></label>`).join("")}
    <h4>Price</h4>
    <label class="facet ${intent.maxPrice?'on':''}"><span><input type="checkbox" ${intent.maxPrice?'checked':''} onclick="return false"> Under $${intent.maxPrice||100}</span></label>
    <h4>Ranked for</h4>
    <label class="facet on"><span><input type="checkbox" checked onclick="return false"> ${esc(APP_CONFIG.profile.name)} · ${esc(APP_CONFIG.profile.tier)}</span></label>`;
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
