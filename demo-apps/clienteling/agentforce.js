/* ============================================================
   agentforce.js — Vino Concierge (scripted Agentforce assistant)
   Intent-matched, context-aware replies for the clienteling demo.
   Each reply returns an HTML string so we can render rich wine
   cards, tasting notes, and action buttons inline in the chat.
   Data is read from window.APP_CONFIG (see app-config.js).
   ============================================================ */

const AF = (() => {
  const money = window.money;

  /* reusable inline wine card for chat (bottle SVG + score + price) */
  function productCardHTML(p, ctaLabel, ctaAction) {
    return `
      <div class="rec-card" style="margin-top:8px;max-width:280px">
        <div class="ph" style="height:150px">${productImage(p, 70, 150)}</div>
        <div class="body">
          <div class="wine-region" style="font-size:9px">${p.region}</div>
          <div class="wine-name" style="font-size:16px;margin-top:3px">${p.name} <span class="wine-vintage">${p.vintage}</span></div>
          <div style="display:flex;align-items:center;justify-content:space-between;margin-top:8px">
            <span class="wine-price" style="font-size:18px">${money(p.price)}</span>
            <span class="score-badge"><span class="num">${p.score}</span> ${p.scoreSource}</span>
          </div>
          ${ctaLabel ? `<button class="btn btn-primary btn-sm btn-block" style="margin-top:10px" onclick="${ctaAction}">${ctaLabel}</button>` : ""}
        </div>
      </div>`;
  }

  const pairChips = (p) =>
    `<div class="pairing-row">${p.foodPairings.map((f) => `<span class="pairing-chip">${f}</span>`).join("")}</div>`;

  /* ---- Intent handlers. Each returns an HTML string. ---- */
  const intents = [
    {
      keys: ["brief", "who is", "summary", "highlights", "rundown", "greet", "check-in", "check in"],
      reply: () => {
        const c = APP_CONFIG.customer;
        return `<strong class="teal">Quick brief — ${c.name}</strong>
        <ul style="margin:8px 0 0;padding-left:18px;line-height:1.7;font-size:13px">
          <li><strong class="teal">${c.rank}</strong> member since ${c.memberSince} · LTV <strong class="gold">${money(c.ltv)}</strong></li>
          <li>Propensity to buy: <strong>${c.propensity}</strong> (${c.propensityScore})</li>
          <li>✈️ <strong>Traveling</strong> — home store is <strong>${c.homeStoreManager.store}</strong>, currently at <strong>${c.visitingStore}</strong></li>
          <li>💬 <strong class="gold">Marie (his home-store manager) sent a personal message</strong> to pass along</li>
          <li>Loves <strong>Left Bank Bordeaux &amp; bold reds</strong> — tonight's feature is right in his lane</li>
          <li>🎂 Birthday ${c.birthday} · prefers the <strong>${c.channels.preferred}</strong></li>
        </ul>
        <div style="margin-top:8px">Recommended opener: greet by name, thank him for his Grand Reserve status, then deliver Marie's note.</div>
        <div style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap">
          <button class="chip" onclick="AF.send('what did Marie say')">Marie's message</button>
          <button class="chip" onclick="AF.send('best wine for Alan')">Best wine</button>
          <button class="chip" onclick="AF.send('check inventory')">Check inventory</button>
        </div>`;
      },
    },
    {
      keys: ["marie", "message", "note", "manager", "what did"],
      reply: () => {
        return `Marie L. — Alan's home-store manager in <strong>Modesto</strong> — sent this to hand off in person:
        <div class="marie-note" style="margin-top:8px">
          <div class="eyebrow" style="font-size:9px;color:var(--golddim)">FROM MARIE · ${APP_CONFIG.managerMessage.when}</div>
          <div class="quote" style="font-size:15px;margin-top:6px">“${APP_CONFIG.managerMessage.text}”</div>
        </div>
        <div style="margin-top:8px">This is the relationship moment — deliver it word for word. It ties straight into tonight's feature, the Château Les Carmes.</div>
        <button class="btn btn-primary btn-sm" style="margin-top:10px" onclick="AF.send('tell me about the feature wine')">About the feature wine →</button>`;
      },
    },
    {
      keys: ["best", "recommend", "suggest", "what should", "which wine", "next", "for alan"],
      reply: () => {
        const feat = productById("carmesBordeaux");
        const caymus = productById("caymus");
        return `Based on Alan's affinity for <strong class="gold">Left Bank Bordeaux &amp; bold reds</strong> and his Grand Reserve history, the standout is tonight's feature — the <strong class="teal">Château Les Carmes Haut-Brion 2019</strong>. It's the exact wine Marie flagged for him.
        ${productCardHTML(feat, "View details", "openProduct('carmesBordeaux')")}
        <div style="margin-top:10px">A natural second pour to offer:</div>
        <ul style="margin:6px 0 0;padding-left:18px;line-height:1.7;font-size:13px">
          <li><strong>${caymus.name}</strong> (${money(caymus.price)}) — he bought the 2020 vintage last August.</li>
        </ul>
        <div style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap">
          <button class="chip" onclick="AF.send('pairing')">Cheese pairing</button>
          <button class="chip" onclick="AF.send('check inventory')">Check inventory</button>
          <button class="chip" onclick="AF.send('fulfillment options')">Fulfillment options</button>
        </div>`;
      },
    },
    {
      keys: ["feature", "carmes", "bordeaux", "tonight", "tell me about the", "story"],
      reply: () => {
        const p = productById("carmesBordeaux");
        return `Tonight's feature — the <strong class="teal">${p.name} ${p.vintage}</strong>:
        <div class="wine-notes" style="margin-top:8px">${p.tastingNotes}</div>
        <div style="font-style:italic;font-size:12.5px;color:var(--warm-gray);margin-top:6px">${p.story}</div>
        ${pairChips(p)}
        ${productCardHTML(p, "Open full product page", "openProduct('carmesBordeaux')")}`;
      },
    },
    {
      keys: ["pair", "pairing", "cheese", "food", "goes with"],
      reply: () => {
        const p = productById("carmesBordeaux");
        return `For the class's Château Les Carmes pour, lead with these pairings:
        ${pairChips(p)}
        <div style="margin-top:10px">The aged gouda is the crowd-pleaser — its nutty depth mirrors the wine's graphite and cedar notes. Suggest Alan take a few bottles home to recreate it.</div>
        <button class="btn btn-primary btn-sm" style="margin-top:10px" onclick="AF.send('fulfillment options')">Offer to hold bottles →</button>`;
      },
    },
    {
      keys: ["inventory", "stock", "available", "in store", "units", "how many", "check"],
      reply: () => {
        const p = productById("carmesBordeaux");
        return `<strong>${p.name}</strong> — real-time cross-store availability:
        <ul style="margin:8px 0 0;padding-left:18px;line-height:1.7;font-size:13px">
          <li>San Diego (here) — <strong>${p.stock.sanDiego}</strong> bottles</li>
          <li>Modesto (<strong class="teal">Alan's home store</strong>) — <strong class="gold">${p.stock.modesto} bottles</strong></li>
        </ul>
        <div style="margin-top:8px">Since Alan's traveling, the move is to hold bottles at his home store for pickup when he's back. Want me to open fulfillment options?</div>
        <div style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap">
          <button class="chip" onclick="switchView('inventory')">Open inventory view</button>
          <button class="chip" onclick="AF.send('fulfillment options')">Fulfillment options</button>
        </div>`;
      },
    },
    {
      keys: ["fulfill", "hold", "ship", "reserve", "pickup", "buy", "friday", "options"],
      reply: () => {
        const p = productById("carmesBordeaux");
        return `Three ways to close for Alan on the <strong>${p.name}</strong>:
        <ul style="margin:8px 0 0;padding-left:18px;line-height:1.7;font-size:13px">
          <li><strong class="teal">Hold at home store</strong> — reserve bottles at Modesto for in-person pickup (recommended — he's traveling).</li>
          <li><strong>Ship to home</strong> — deliver to his address in Modesto.</li>
          <li><strong>Buy in-store today</strong> — take bottles from San Diego now.</li>
        </ul>
        <div style="margin-top:8px">Marie has 6 bottles in Modesto. I'd hold 4 for Friday pickup.</div>
        <button class="btn btn-primary btn-sm" style="margin-top:10px" onclick="openModal('fulfillment')">Open fulfillment →</button>`;
      },
    },
    {
      keys: ["draft", "text", "write", "send", "sms", "email"],
      reply: () => {
        return `Drafted, personalized to Alan and tied to Marie's note:
        <div class="alert-box" style="border-color:var(--hairline);margin-top:8px">
          <div class="eyebrow" style="font-size:9px;color:var(--warm-gray)">TO: ALAN R. · ${APP_CONFIG.customer.channels.email}</div>
          <div style="font-size:13px;color:var(--charcoal);margin-top:6px">“Hi Alan — great meeting you at tonight's class. Per Marie in Modesto, I've held 4 bottles of the Château Les Carmes at your home store for Friday pickup. Enjoy the tasting!”</div>
        </div>
        <button class="btn btn-primary btn-sm" style="margin-top:10px" onclick="openModal('draftMessage')">Review &amp; send →</button>`;
      },
    },
    {
      keys: ["class", "event", "roster", "attendee", "signup", "sign up", "tasting"],
      reply: () => {
        return `Tonight's <strong class="teal">${APP_CONFIG.event.name}</strong> — ${APP_CONFIG.event.date}, hosted by ${APP_CONFIG.event.host}. ${APP_CONFIG.event.attendees.length} of ${APP_CONFIG.event.seatsTotal} seats filled.
        <div style="margin-top:8px">Alan R. is on the roster, flagged <strong class="gold">Grand Reserve · VIP</strong>. Tonight's feature pour is the Château Les Carmes.</div>
        <button class="btn btn-primary btn-sm" style="margin-top:10px" onclick="switchView('event')">Open class view →</button>`;
      },
    },
    {
      keys: ["history", "owns", "purchase", "bought", "cellar"],
      reply: () => `Alan has bought <strong>${APP_CONFIG.customer.bottles} bottles</strong> lifetime — recently a Château Margaux 2015 (×2) and Caymus Cabernet (×6). Lifetime value <strong class="gold">${money(APP_CONFIG.customer.ltv)}</strong>. He's a Bordeaux-leaning cellar collector, which is exactly why tonight's feature lands.`,
    },
    {
      keys: ["hello", "hi", "hey", "help", "what can"],
      reply: () => `I'm your <strong class="teal">Vino Concierge</strong> for Alan's visit tonight. I can brief you on him, relay Marie's message, recommend wines &amp; pairings, check cross-store inventory, walk fulfillment options, or draft outreach. Try a quick action below or just ask.`,
    },
  ];

  function respond(text) {
    const q = text.toLowerCase();
    const hit = intents.find((it) => it.keys.some((k) => q.includes(k)));
    if (hit) return hit.reply();
    return `Good question. For Alan tonight, the strongest move is the <strong class="teal">Château Les Carmes</strong> feature tied to Marie's note. Want me to <button class="chip" onclick="AF.send('brief me on Alan')">brief you on Alan</button>, <button class="chip" onclick="AF.send('check inventory')">check inventory</button>, or <button class="chip" onclick="AF.send('fulfillment options')">show fulfillment options</button>?`;
  }

  return { respond, productCardHTML };
})();
