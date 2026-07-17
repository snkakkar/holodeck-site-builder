/* ============================================================
   agentforce.js — in-store concierge (scripted Agentforce assistant)
   Intent-matched, context-aware replies for the clienteling demo.
   Each reply returns an HTML string so we can render rich product
   cards, notes, and action buttons inline in the chat.
   ALL customer/story/industry vocabulary is read from window.APP_CONFIG
   (see app-config.js) via the tokens()/tpl()/conciergeName() helpers
   defined in app.js — this file holds NO wine/customer literals so a
   generated (non-wine) config reads in its own industry voice.
   ============================================================ */

const AF = (() => {
  const money = window.money;
  // These helpers live in app.js and are hoisted by the time AF runs.
  const t = () => (typeof tokens === "function" ? tokens() : {});
  const concierge = () => (typeof conciergeName === "function" ? conciergeName() : "Concierge");
  const unit = () => (typeof unitNoun === "function" ? unitNoun() : "items");
  const feat = () => (typeof featuredProduct === "function" ? featuredProduct() : (APP_CONFIG.catalog && APP_CONFIG.catalog[0]) || {});
  const homeStore = () => {
    const c = APP_CONFIG.customer || {};
    return (c.homeStoreManager && c.homeStoreManager.store) || c.location || "their home store";
  };

  /* reusable inline product card for chat (image + score + price) */
  function productCardHTML(p, ctaLabel, ctaAction) {
    return `
      <div class="rec-card" style="margin-top:8px;max-width:280px">
        <div class="ph" style="height:150px">${productImage(p, 70, 150)}</div>
        <div class="body">
          <div class="product-region" style="font-size:9px">${esc(p.region || "")}</div>
          <div class="product-name" style="font-size:16px;margin-top:3px">${esc(p.name)} <span class="product-vintage">${esc(p.vintage || "")}</span></div>
          <div style="display:flex;align-items:center;justify-content:space-between;margin-top:8px">
            <span class="product-price" style="font-size:18px">${money(p.price)}</span>
            <span class="score-badge"><span class="num">${p.score}</span> ${esc(p.scoreSource || "")}</span>
          </div>
          ${ctaLabel ? `<button class="btn btn-primary btn-sm btn-block" style="margin-top:10px" onclick="${ctaAction}">${esc(ctaLabel)}</button>` : ""}
        </div>
      </div>`;
  }

  const pairChips = (p) =>
    `<div class="pairing-row">${(p.foodPairings || []).map((f) => `<span class="pairing-chip">${esc(f)}</span>`).join("")}</div>`;

  /* ---- Intent handlers. Each returns an HTML string. ---- */
  const intents = [
    {
      keys: ["brief", "who is", "summary", "highlights", "rundown", "greet", "check-in", "check in"],
      reply: () => {
        const c = APP_CONFIG.customer;
        const tk = t();
        const interest = (c.interests && c.interests[0]) || "their favorites";
        return `<strong class="teal">Quick brief — ${esc(c.name)}</strong>
        <ul style="margin:8px 0 0;padding-left:18px;line-height:1.7;font-size:13px">
          <li><strong class="teal">${esc(c.rank)}</strong> member since ${esc(String(c.memberSince))} · LTV <strong class="gold">${money(c.ltv)}</strong></li>
          <li>Propensity to buy: <strong>${esc(c.propensity)}</strong> (${c.propensityScore})</li>
          <li>✈️ <strong>Traveling</strong> — home store is <strong>${esc(homeStore())}</strong>, currently at <strong>${esc(c.visitingStore || tk.store)}</strong></li>
          <li>💬 <strong class="gold">${esc(tk.manager)} (their home-store manager) sent a personal message</strong> to pass along</li>
          <li>Interested in <strong>${esc(interest)}</strong> — tonight's feature is right in their lane</li>
          <li>Prefers the <strong>${esc((c.channels && c.channels.preferred) || "mobile app")}</strong></li>
        </ul>
        <div style="margin-top:8px">Recommended opener: greet by name, thank them for their ${esc(c.rank)} status, then deliver ${esc(tk.manager)}'s note.</div>
        <div style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap">
          <button class="chip" onclick="AF.send('what did the manager say')">${esc(tk.manager)}'s message</button>
          <button class="chip" onclick="AF.send('best pick')">Best pick</button>
          <button class="chip" onclick="AF.send('check inventory')">Check inventory</button>
        </div>`;
      },
    },
    {
      keys: ["message", "note", "manager", "what did", "say"],
      reply: () => {
        const tk = t();
        return `${esc(tk.manager)} — ${esc(tk.customer)}'s home-store manager at <strong>${esc(homeStore())}</strong> — sent this to hand off in person:
        <div class="marie-note" style="margin-top:8px">
          <div class="eyebrow" style="font-size:9px;color:var(--golddim)">FROM ${esc(String(tk.manager).toUpperCase())} · ${esc(APP_CONFIG.managerMessage.when)}</div>
          <div class="quote" style="font-size:15px;margin-top:6px">“${esc(APP_CONFIG.managerMessage.text)}”</div>
        </div>
        <div style="margin-top:8px">This is the relationship moment — deliver it word for word. It ties straight into tonight's feature, ${esc(feat().name || "the featured item")}.</div>
        <button class="btn btn-primary btn-sm" style="margin-top:10px" onclick="AF.send('tell me about the feature')">About the feature →</button>`;
      },
    },
    {
      keys: ["best", "recommend", "suggest", "what should", "which", "next", "pick"],
      reply: () => {
        const tk = t();
        const p = feat();
        const c = APP_CONFIG.customer || {};
        const interest = (c.interests && c.interests[0]) || "their favorites";
        const second = (APP_CONFIG.catalog || []).find((x) => x.id !== p.id);
        return `Based on ${esc(tk.customer)}'s affinity for <strong class="gold">${esc(interest)}</strong> and their ${esc(c.rank)} history, the standout is tonight's feature — the <strong class="teal">${esc(p.name)}</strong>. It's the exact item ${esc(tk.manager)} flagged for them.
        ${productCardHTML(p, "View details", "openProduct('" + p.id + "')")}
        ${second ? `<div style="margin-top:10px">A natural second option to offer:</div>
        <ul style="margin:6px 0 0;padding-left:18px;line-height:1.7;font-size:13px">
          <li><strong>${esc(second.name)}</strong> (${money(second.price)})</li>
        </ul>` : ""}
        <div style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap">
          <button class="chip" onclick="AF.send('check inventory')">Check inventory</button>
          <button class="chip" onclick="AF.send('fulfillment options')">Fulfillment options</button>
        </div>`;
      },
    },
    {
      keys: ["feature", "featured", "tonight", "tell me about the", "story"],
      reply: () => {
        const p = feat();
        return `Tonight's feature — the <strong class="teal">${esc(p.name)} ${esc(p.vintage || "")}</strong>:
        <div class="product-notes" style="margin-top:8px">${esc(p.tastingNotes || "")}</div>
        ${p.story ? `<div style="font-style:italic;font-size:12.5px;color:var(--warm-gray);margin-top:6px">${esc(p.story)}</div>` : ""}
        ${pairChips(p)}
        ${productCardHTML(p, "Open full product page", "openProduct('" + p.id + "')")}`;
      },
    },
    {
      keys: ["pair", "pairing", "goes with", "complement", "match"],
      reply: () => {
        const p = feat();
        return `For tonight's ${esc(p.name)}, lead with these complements:
        ${pairChips(p)}
        <div style="margin-top:10px">Suggest ${esc(t().customer)} take a few ${esc(unit())} home to enjoy again.</div>
        <button class="btn btn-primary btn-sm" style="margin-top:10px" onclick="AF.send('fulfillment options')">Offer to hold ${esc(unit())} →</button>`;
      },
    },
    {
      keys: ["inventory", "stock", "available", "in store", "units", "how many", "check"],
      reply: () => {
        const p = feat();
        const tk = t();
        return `<strong>${esc(p.name)}</strong> — real-time cross-store availability:
        <ul style="margin:8px 0 0;padding-left:18px;line-height:1.7;font-size:13px">
          <li>${esc(tk.store)} (here) — <strong>${(p.stock && p.stock.sanDiego) || 0}</strong> ${esc(unit())}</li>
          <li>${esc(homeStore())} (<strong class="teal">${esc(tk.customer)}'s home store</strong>) — <strong class="gold">${(p.stock && p.stock.modesto) || 0} ${esc(unit())}</strong></li>
        </ul>
        <div style="margin-top:8px">Since ${esc(tk.customer)} is traveling, the move is to hold ${esc(unit())} at their home store for pickup when they're back. Want me to open fulfillment options?</div>
        <div style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap">
          <button class="chip" onclick="switchView('inventory')">Open inventory view</button>
          <button class="chip" onclick="AF.send('fulfillment options')">Fulfillment options</button>
        </div>`;
      },
    },
    {
      keys: ["fulfill", "hold", "ship", "reserve", "pickup", "buy", "options"],
      reply: () => {
        const p = feat();
        const tk = t();
        return `Three ways to close for ${esc(tk.customer)} on the <strong>${esc(p.name)}</strong>:
        <ul style="margin:8px 0 0;padding-left:18px;line-height:1.7;font-size:13px">
          <li><strong class="teal">Hold at home store</strong> — reserve ${esc(unit())} at ${esc(homeStore())} for in-person pickup (recommended — they're traveling).</li>
          <li><strong>Ship to home</strong> — deliver to their address.</li>
          <li><strong>Buy in-store today</strong> — take ${esc(unit())} from ${esc(tk.store)} now.</li>
        </ul>
        <div style="margin-top:8px">${esc(tk.manager)} has ${(p.stock && p.stock.modesto) || 0} ${esc(unit())} at ${esc(homeStore())}.</div>
        <button class="btn btn-primary btn-sm" style="margin-top:10px" onclick="openModal('fulfillment')">Open fulfillment →</button>`;
      },
    },
    {
      keys: ["draft", "text", "write", "send", "sms", "email"],
      reply: () => {
        const tk = t();
        const body = (typeof tpl === "function")
          ? tpl("draftMessageBody", "Hi {firstName} — great meeting you at tonight's {event}. Per {manager} at {managerStore}, I've held your {unit} at your home store for pickup. Enjoy!")
          : "";
        return `Drafted, personalized to ${esc(tk.customer)} and tied to ${esc(tk.manager)}'s note:
        <div class="alert-box" style="border-color:var(--hairline);margin-top:8px">
          <div class="eyebrow" style="font-size:9px;color:var(--warm-gray)">TO: ${esc(String(tk.customer).toUpperCase())} · ${esc((APP_CONFIG.customer.channels && APP_CONFIG.customer.channels.email) || "")}</div>
          <div style="font-size:13px;color:var(--charcoal);margin-top:6px">“${esc(body)}”</div>
        </div>
        <button class="btn btn-primary btn-sm" style="margin-top:10px" onclick="openModal('draftMessage')">Review &amp; send →</button>`;
      },
    },
    {
      keys: ["class", "event", "roster", "attendee", "signup", "sign up"],
      reply: () => {
        const tk = t();
        return `Tonight's <strong class="teal">${esc(APP_CONFIG.event.name)}</strong> — ${esc(APP_CONFIG.event.date)}, hosted by ${esc(APP_CONFIG.event.host)}. ${APP_CONFIG.event.attendees.length} of ${APP_CONFIG.event.seatsTotal} seats filled.
        <div style="margin-top:8px">${esc(tk.customer)} is on the roster, flagged <strong class="gold">${esc(APP_CONFIG.customer.rank)} · VIP</strong>. Tonight's feature is ${esc(feat().name || "the featured item")}.</div>
        <button class="btn btn-primary btn-sm" style="margin-top:10px" onclick="switchView('event')">Open ${esc((APP_CONFIG.event.type || "event").toLowerCase())} view →</button>`;
      },
    },
    {
      keys: ["history", "owns", "purchase", "bought", "owned"],
      reply: () => {
        const c = APP_CONFIG.customer;
        return `${esc(c.name)} has bought <strong>${c.bottles} ${esc(unit())}</strong> lifetime. Lifetime value <strong class="gold">${money(c.ltv)}</strong>. That history is exactly why tonight's feature lands.`;
      },
    },
    {
      keys: ["hello", "hi", "hey", "help", "what can"],
      reply: () => {
        const tk = t();
        return `I'm your <strong class="teal">${esc(concierge())}</strong> for ${esc(tk.customer)}'s visit tonight. I can brief you on them, relay ${esc(tk.manager)}'s message, recommend ${esc(unit())} &amp; complements, check cross-store inventory, walk fulfillment options, or draft outreach. Try a quick action below or just ask.`;
      },
    },
  ];

  function respond(text) {
    const q = text.toLowerCase();
    const hit = intents.find((it) => it.keys.some((k) => q.includes(k)));
    if (hit) return hit.reply();
    const tk = t();
    return `Good question. For ${esc(tk.customer)} tonight, the strongest move is the <strong class="teal">${esc(feat().name || "featured")}</strong> feature tied to ${esc(tk.manager)}'s note. Want me to <button class="chip" onclick="AF.send('brief me')">brief you on ${esc(tk.customer)}</button>, <button class="chip" onclick="AF.send('check inventory')">check inventory</button>, or <button class="chip" onclick="AF.send('fulfillment options')">show fulfillment options</button>?`;
  }

  return { respond, productCardHTML };
})();
