// ════════════════════════════════════════════════════════════════
//  SCREEN FOUNDATIONS
//  Runs when a config-driven Salesforce console/CRM screen is selected
//  in Slide Selection. Produces the per-screen foundation, then hands it
//  to screen-config-generator.js to normalize into a screenConfig the
//  demo renderer consumes. One Gemini JSON call per SCREEN FAMILY fills
//  the domain gaps; a deterministic fallback is used when Gemini is
//  unconfigured or fails, so generation NEVER hard-errors.
//
//  Mirrors app-foundations.js:
//     HOLO_SCREENFOUND.generate(screenId, state, opts) → { found, config, usedGemini }
//     HOLO_SCREENFOUND.fallbackScreenConfig(screenId, ctx)
//
//  `family` (not screenId) is what the prompt/assembler switch on — the
//  12 screens collapse to ~8 families sharing one lane each.
// ════════════════════════════════════════════════════════════════

(function (global) {
  "use strict";

  var SCREENGEN = function () { return global.HOLO_SCREENGEN; };
  var REGISTRY = function () { return global.HOLO_SCREEN_REGISTRY; };
  var PROMPTS = function () { return global.HOLO_AI_PROMPT; };

  // Reuse the same context shape app-foundations builds (verbatim seam).
  function ctxFrom(state) {
    var rules = global.HOLO_RULES;
    var c = (rules && rules.stateToCtx) ? rules.stateToCtx(state) : {};
    var p = (state && state.project) || {};
    var b = (state && state.brand) || {};
    var f = (state && state.storyFoundations) || {};
    return {
      flatColors: {
        primary: b.primaryColor || "",
        secondary: b.secondaryColor || "",
        accent: b.accentColor || "",
      },
      customerName: c.customerName || p.customerName || "the customer",
      industry: c.industry || p.industry || "",
      website: c.website || p.website || "",
      audience: c.audience || p.audience || "",
      products: c.products || [],
      persona: (state && state.personas && state.personas[0]) || null,
      storyActs: c.storyActs || [],
      scriptText: c.scriptText || "",
      bigProblem: c.bigProblem || f.businessProblem || "",
      futureVision: c.futureVision || f.futureStateVision || "",
      foundations: f,
    };
  }

  function familyOf(screenId) {
    var reg = REGISTRY();
    return (reg && reg.familyOf(screenId)) || null;
  }
  function screenDef(screenId) {
    var reg = REGISTRY();
    return (reg && reg.getScreen(screenId)) || null;
  }

  // Best-effort JSON parse (strips ```json fences) — same as app-foundations.
  function parseJson(text) {
    if (!text) return null;
    var t = String(text).trim();
    var fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fence) t = fence[1].trim();
    var first = t.indexOf("{"), last = t.lastIndexOf("}");
    if (first !== -1 && last !== -1) t = t.slice(first, last + 1);
    try { return JSON.parse(t); } catch (e) { return null; }
  }

  // Resolve a per-family prompt. Prefer the shared HOLO_AI_PROMPT registry
  // (ai-config-prompt.js) with a <<CONTEXT>> placeholder; fall back to a
  // built-in prompt so this lane is self-sufficient for the first family.
  function promptFor(family, cx) {
    var reg = PROMPTS();
    var contextBlock = buildContextBlock(family, cx);
    if (reg && reg.getScreenPrompt) {
      var tpl = reg.getScreenPrompt(family);
      if (tpl) return String(tpl).replace("<<CONTEXT>>", contextBlock);
    }
    return builtinPrompt(family, cx, contextBlock);
  }

  function buildContextBlock(family, cx) {
    var f = cx.foundations || {};
    return [
      "Customer: " + cx.customerName + (cx.industry ? (" (" + cx.industry + " industry)") : ""),
      cx.website ? ("Website: " + cx.website) : "",
      cx.persona ? ("Primary persona: " + JSON.stringify({ name: cx.persona.name, role: cx.persona.role, quote: cx.persona.quote })) : "",
      cx.bigProblem ? ("Business problem: " + cx.bigProblem) : "",
      cx.futureVision ? ("Future vision: " + cx.futureVision) : "",
      (f.agentforceMoments && f.agentforceMoments.length) ? ("Agentforce moments: " + JSON.stringify(f.agentforceMoments).slice(0, 800)) : "",
      (cx.storyActs && cx.storyActs.length) ? ("Story beats: " + JSON.stringify(cx.storyActs).slice(0, 1000)) : "",
    ].filter(Boolean).join("\n");
  }

  // Built-in prompts by family (Phase 1 ships recordWithScoreAndTimeline).
  function builtinPrompt(family, cx, contextBlock) {
    if (family === "recordWithScoreAndTimeline") {
      return [
        "You are generating realistic Salesforce demo data for an AI SDR / prospecting console screen (a Lead or Prospect record with an AI opportunity score and an activity timeline) for this customer:",
        contextBlock,
        "",
        "CRITICAL VOCABULARY RULE: Use the customer's REAL industry language for company names, products, and criteria. Do NOT invent numbers that contradict the business story. Keep every string SHORT and console-realistic.",
        "",
        "Return STRICT JSON (no markdown) with this shape:",
        "{",
        '  "header": { "recordType": string, "name": string, "fields": [{"label","value","link"(bool)}] },  // 4 fields e.g. Title, Company, Phone, Email',
        '  "progress": { "steps"(int), "total"(int), "label": string, "action": string },  // sales-path progress; label e.g. "Qualified"',
        '  "score": { "value"(0-100 int), "of"(int, default 100), "label": string, "badge": string, "meta": string, "insight": string, "criteria": [{"icon","name","sub","pct"(0-100),"score"}] },  // 5 weighted criteria; icon=one emoji; score e.g. "+20 / 25"; insight=1-2 sentences on why this lead scores high',
        '  "identity": { "title": "Identity", "fields": [{"label","value"}] },  // 4 key/value pairs',
        '  "timeline": { "title": "Activity", "month": string, "items": [{"title","sub","from","time","status","statusTone":"viewed|pending","body"}] }  // 4 activity items, newest first; body=short email/SMS text',
        "}",
        "Ground the score and timeline in an autonomous outbound-SDR narrative (AI agent reaches out, the contact replies, the agent qualifies and creates an opportunity).",
      ].filter(Boolean).join("\n");
    }
    var GUARD = "CRITICAL VOCABULARY RULE: Use the customer's REAL industry language. Do NOT invent numbers that contradict the business story. Keep every string SHORT and console-realistic.";

    if (family === "recordWithAiPanel") {
      return [
        "You are generating realistic Salesforce demo data for an AI account-research / opportunity screen (a record with an Einstein AI narrative panel and a conversation-insights timeline) for this customer:",
        contextBlock, "", GUARD, "",
        "Return STRICT JSON (no markdown):",
        "{",
        '  "header": { "recordType": string, "name": string, "fields": [{"label","value","link"(bool)}] },  // 4 fields e.g. Owner, Stage, Amount, Close',
        '  "aiPanel": { "title": string, "badge": string, "body": string, "sources": [string] },  // body = 2-3 sentence AI research summary; 3-4 grounding sources',
        '  "identity": { "title": "Account Details", "fields": [{"label","value"}] },  // 4 pairs',
        '  "timeline": { "title": "Conversation Insights", "month": string, "items": [{"title","sub","from","time","status","statusTone":"viewed|pending","body"}] }  // 3 items',
        "}",
      ].filter(Boolean).join("\n");
    }
    if (family === "assistantChat") {
      return [
        "You are generating a realistic Agentforce Sales Assistant conversation for this customer:",
        contextBlock, "", GUARD, "",
        "Return STRICT JSON (no markdown):",
        "{",
        '  "aiPanel": { "title": "Agentforce Sales Assistant", "badge": string, "body": string },',
        '  "chat": [  // 5 turns: agent greeting, user Q1, agent structured reply, user Q2, agent highlight reply',
        '    {"role":"agent","who":"Agentforce","greeting":string},  // 1 italic greeting line, no body',
        '    {"role":"user","who":string,"body":string},  // a pre-call / account question',
        '    {"role":"agent","who":"Agentforce","body":string,"sections":[{"title":string,"items":[string]}]},  // intro + 3-4 titled sections, ≤4 items each; items may use **bold**, *em*, [link] markup',
        '    {"role":"user","who":string,"body":string},  // a cross-sell / recommendation question',
        '    {"role":"agent","who":"Agentforce","body":string,"highlight":{"title":string,"body":string,"sub":string,"source":string}}  // intro + one callout box; source = "Sources: …"',
        "  ]",
        "}",
        "Ground everything in the account: real opportunities, cases, sentiment, contacts. Use **bold** for labels, [Name] for record links, *em* for asides.",
      ].filter(Boolean).join("\n");
    }
    if (family === "metricsAndTable") {
      return [
        "You are generating a realistic Salesforce analytics screen (KPI metric cards + a data table with a bar column) for this customer. It is either a Territory Plan or a Marketing Cloud attribution dashboard:",
        contextBlock, "", GUARD, "",
        "Return STRICT JSON (no markdown):",
        "{",
        '  "header": { "recordType": string, "name": string, "fields": [{"label","value"}] },',
        '  "metrics": [{"label","value","delta","tone":"up|down|flat"}],  // 4 KPI cards',
        '  "aiPanel": { "title": string, "badge": string, "body": string },  // 1-2 sentence Einstein recommendation',
        '  "table": { "title": string, "columns": [string], "rows": [[cell,...]], "barColumn": int }  // 4-5 cols, 4 rows; barColumn = 0-100 percent index',
        "}",
      ].filter(Boolean).join("\n");
    }
    if (family === "serviceCase") {
      return [
        "You are generating a realistic Service Cloud case screen with Einstein sentiment + an AI case summary + a customer/agent timeline for this customer:",
        contextBlock, "", GUARD, "",
        "Return STRICT JSON (no markdown). NOTE: sentiment.score.value is a SIGNED sentiment from -1 to 1 (negative = frustrated); do not recolor semantic status.",
        "{",
        '  "header": { "recordType": string, "name": string, "fields": [{"label","value"}] },  // Contact, Priority, Status, Channel',
        '  "sentiment": { "title": "Case Sentiment", "badge": string, "score": {"value"(-1..1),"of":1,"label","meta","insight"}, "body": string },',
        '  "aiPanel": { "title": "Case Summary", "badge": string, "body": string, "sources": [string] },',
        '  "timeline": { "title": "Case Timeline", "month": string, "items": [{"title","sub","from","time","status","statusTone":"viewed|pending","body"}] }  // 3 items',
        "}",
      ].filter(Boolean).join("\n");
    }
    if (family === "voiceConsole") {
      return [
        "You are generating a realistic Service Cloud Voice live-call console (a live transcript + AI agent-assist + next-best-action list) for this customer:",
        contextBlock, "", GUARD, "",
        "Return STRICT JSON (no markdown):",
        "{",
        '  "header": { "recordType": "Voice · Live Call", "name": string, "fields": [{"label","value"}] },',
        '  "call": { "status": string, "timer": string },',
        '  "transcript": { "title": "Live Transcript", "turns": [{"role":"user|agent","who":string,"body":string}] },  // 4 turns',
        '  "aiPanel": { "title": "Agent Assist", "badge": string, "body": string },',
        '  "list": [{"primary","secondary","badge":{"tone":"brand|good|neutral|bad","text"}}]  // 3 next-best actions',
        "}",
      ].filter(Boolean).join("\n");
    }
    if (family === "campaignBuilder") {
      return [
        "You are generating a realistic Marketing Cloud 'Prompt Campaign Builder' screen (a natural-language prompt + an AI-generated journey summary + estimated metrics + generated segments) for this customer:",
        contextBlock, "", GUARD, "",
        "Return STRICT JSON (no markdown):",
        "{",
        '  "header": { "recordType": string, "name": string, "fields": [{"label","value"}] },',
        '  "prompt": string,  // the marketer\'s natural-language campaign prompt',
        '  "aiPanel": { "title": "Prompt Campaign Builder", "badge": string, "body": string },',
        '  "metrics": [{"label","value","delta","tone":"up|down|flat"}],  // 3 cards: reach, lift, window',
        '  "list": [{"primary","secondary","badge":{"tone","text"}}]  // 3 generated segments',
        "}",
      ].filter(Boolean).join("\n");
    }
    if (family === "emailPreview") {
      return [
        "You are generating a realistic marketing email preview (Marketing Cloud 'Thursday Spotlight' style) for this customer:",
        contextBlock, "", GUARD, "",
        "Return STRICT JSON (no markdown):",
        "{",
        '  "email": { "from": string, "subject": string, "blocks": [{"type":"image|heading|paragraph|button","text","alt"}] }  // 5 blocks: hero image, heading, body paragraph, CTA button, footer line',
        "}",
      ].filter(Boolean).join("\n");
    }

    // Generic fallback prompt for any remaining family.
    return [
      "You are generating realistic Salesforce demo data for a '" + family + "' console screen for this customer:",
      contextBlock,
      "",
      "Return STRICT JSON (no markdown) describing the screen with a { header:{recordType,name,fields:[{label,value}]} } object plus any family-appropriate fields. Keep strings short and console-realistic.",
    ].join("\n");
  }

  // ── Deterministic fallback foundation (Gemini off/failed) ─────
  // Family-appropriate, customer-flavored, no hallucinated specifics beyond
  // plausible defaults. Every field the renderer shows has a value.
  function fallbackFoundation(screenId, cx) {
    var family = familyOf(screenId) || "recordWithScoreAndTimeline";
    var def = screenDef(screenId) || {};
    var cust = cx.customerName && cx.customerName !== "the customer" ? cx.customerName : "";
    var personaName = (cx.persona && cx.persona.name) || "Jordan Reyes";
    var personaRole = (cx.persona && cx.persona.role) || def.persona || "Buyer";
    var companyName = cust || "Sunbelt Advertising Specialties";

    if (family === "recordWithScoreAndTimeline") {
      return {
        screenId: screenId,
        header: {
          recordType: "Qualified Opportunity · Contact",
          name: personaName,
          fields: [
            { label: "Title", value: personaRole },
            { label: "Company", value: companyName },
            { label: "Phone", value: "📞 (813) 555-0187" },
            { label: "Email", value: (personaName.toLowerCase().replace(/[^a-z]+/g, ".")) + "@example.demo", link: true },
          ],
        },
        progress: { steps: 4, total: 4, label: "Qualified", action: "Change Converted Status" },
        score: {
          value: 87, of: 100, label: "High Intent", badge: "HIGH INTENT",
          meta: "5 weighted criteria · updated just now",
          insight: "Strong fit based on unified profile and engagement signals — prioritize a same-week follow-up with the assigned AE.",
          criteria: [
            { icon: "🏢", name: "Account fit", sub: "Matches ideal customer profile", pct: 80, score: "+20 / 25" },
            { icon: "📈", name: "Engagement velocity", sub: "Active in the last 7 days", pct: 100, score: "+25 / 25" },
            { icon: "🛒", name: "Product interest", sub: "New category for this account", pct: 75, score: "+15 / 20" },
            { icon: "💬", name: "Reply — expressed interest", sub: "Replied to agent outbound cadence", pct: 88, score: "+22 / 25" },
            { icon: "🔗", name: "Intent signal", sub: "Research activity detected", pct: 100, score: "+5 / 5" },
          ],
        },
        identity: {
          title: "Identity",
          fields: [
            { label: "Name", value: personaName },
            { label: "Title", value: personaRole },
            { label: "Company", value: companyName },
            { label: "Status", value: "Qualified" },
          ],
        },
        timeline: {
          title: "Activity", month: "This month",
          items: [
            { title: "Opportunity Created", sub: "AI SDR Agent completed qualification", from: personaName + " → SDR Agent", time: "2:14 PM", status: "Viewed", statusTone: "viewed",
              body: "Yes — we're interested. Can someone walk me through pricing? I usually order through our rep but haven't for a few months." },
            { from: "SDR Agent → " + personaName, time: "12:45 PM", status: "Viewed", statusTone: "viewed",
              body: "Great news — your interest is confirmed. Your assigned AE will reach out within 24 hours to walk through pricing and timelines." },
            { title: "Re: New for this quarter", sub: "Reply to agent outbound · Insights Found", from: "SDR Agent → " + personaName, time: "4:37 PM", status: "Viewed", statusTone: "viewed",
              body: "We have volume-based options for accounts like yours — a natural fit for your book of business." },
            { from: "SDR Agent · Initial Outbound", time: "9:00 AM", status: "SMS delivered", statusTone: "pending",
              body: "Hi — we noticed you haven't ordered in a while. We just launched something that's a natural fit. Interested in seeing more? Reply YES." },
          ],
        },
        _fallback: true,
      };
    }
    if (family === "recordWithAiPanel") {
      // eci-opportunity → transcript-with-highlights + stage bar + insight sections.
      if (screenId === "eci-opportunity") {
        return {
          screenId: screenId,
          header: {
            recordType: "Opportunity · " + companyName,
            name: companyName + " — Expansion",
            fields: [
              { label: "Owner", value: personaName },
              { label: "Stage", value: "Negotiation" },
              { label: "Amount", value: "$248,000" },
              { label: "Close", value: "This quarter" },
            ],
          },
          transcript: {
            title: "Call Insights — Einstein", badge: "ECI", meta: "Discovery call · 32 min",
            turns: [
              { who: personaName, roleColor: "customer", time: "04:12",
                body: "Honestly, the price is higher than we budgeted, and we're already using an incumbent tool.",
                highlights: [{ text: "the price is higher than we budgeted", tone: "objection" }, { text: "incumbent tool", tone: "objection" }] },
              { who: "AE", roleColor: "rep", time: "05:03",
                body: "Understood — let me show the phased rollout so you prove value before expanding, and I'll send the ROI model today.",
                highlights: [{ text: "send the ROI model today", tone: "action" }] },
              { who: personaName, roleColor: "customer", time: "18:44",
                body: "If you can get the technical team on the next call, that would move this forward.",
                highlights: [{ text: "get the technical team on the next call", tone: "action" }] },
            ],
          },
          stageBar: {
            labels: ["Qualify", "Discover", "Validate", "Negotiate", "Close"],
            segments: [{ state: "done" }, { state: "done" }, { state: "done" }, { state: "current" }, { state: "future" }],
          },
          aiPanel: {
            title: "Deal Risk & Next Step", badge: "AI GENERATED",
            body: "Two objections detected (price, incumbent). Momentum is positive — buyer requested a technical call. Recommended next step: send the ROI model and schedule the technical deep-dive this week.",
            sources: ["Call transcript", "Opportunity record", "Pricing model"],
          },
          sections: [
            { heading: "Competitive", body: "Incumbent tool referenced twice — position differentiated value on unified data and agentic automation, not price." },
            { heading: "Buying group", body: "Economic buyer engaged; technical evaluator not yet looped in. Add them to the next call to de-risk the close." },
          ],
          _fallback: true,
        };
      }
      // account-research-agent → donut header + AI research panel + account plan + research sections.
      return {
        screenId: screenId,
        header: {
          recordType: "Account · " + (cx.industry || "Enterprise"),
          name: companyName,
          fields: [
            { label: "Owner", value: personaName },
            { label: "Segment", value: "Enterprise" },
            { label: "Employees", value: "2,400" },
            { label: "HQ", value: "Austin, TX" },
          ],
        },
        donut: {
          value: "82", caption: "Fit score",
          segments: [
            { label: "Account fit", pct: 40, tone: "brand" },
            { label: "Engagement", pct: 27, tone: "good" },
            { label: "Intent", pct: 15, tone: "warn" },
          ],
        },
        donutTitle: "Account signals",
        aiPanel: {
          title: "Account Research — Agentforce", badge: "AI GENERATED",
          body: "Recent signals suggest expansion readiness: leadership change, new funding, and rising engagement across the buying group. Lead with the outcome that maps to " + companyName + "'s stated priorities.",
          sources: ["10-K filing", "News · funding", "Web engagement", "Past cases"],
        },
        identity: {
          title: "Account Plan",
          fields: [
            { label: "Primary goal", value: "Expand into new category" },
            { label: "Exec sponsor", value: personaName },
            { label: "Whitespace", value: "$1.1M" },
            { label: "Health", value: "Green" },
          ],
        },
        sections: [
          { heading: "Why now", body: "New funding round closed last quarter and a leadership change in operations — both classic expansion triggers for accounts in this segment." },
          { heading: "Recommended play", body: "Lead with the phased-rollout proof plan tied to their stated category goal; bring a peer reference from the same industry." },
          { heading: "Risks", body: "Incumbent relationship in an adjacent team — pre-empt by framing differentiated value on unified data." },
        ],
        sectionsTitle: "Research summary",
        _fallback: true,
      };
    }

    if (family === "assistantChat") {
      // Faithful to sales-assistant.html: a greeting, a pre-call briefing reply
      // (titled sections with dashed bullet items), and a cross-sell reply with
      // a highlight callout box. Grounded in the customer's account.
      var acct = companyName;
      var rep = personaName;
      return {
        screenId: screenId,
        aiPanel: { title: "Agentforce Sales Assistant", badge: "AGENTFORCE", body: "Grounded in this account's CRM data" },
        chat: [
          { role: "agent", who: "Agentforce",
            greeting: "Hi! I'm Agentforce, an AI assistant. I can search for information, summarize records, and draft messages. What can I help you with?" },
          { role: "user", who: rep, body: "Catch me up on " + acct + " before my call in 10 minutes" },
          { role: "agent", who: "Agentforce",
            body: "Here's your pre-call briefing for **" + acct + "**. Let me know if you need help with anything else!",
            sections: [
              { title: "Account Status", items: [
                "**Tier:** Regional · Growing (+38% YoY order volume)",
                "**Open Opportunities:** 3 (1 Qualification, 1 Proposal, 1 Negotiation)",
                "**Revenue:** $86K last quarter, $42K this quarter so far",
                "**Primary Contact:** [Lauren Bailey] · Purchasing Manager",
              ] },
              { title: "Recent Activity (Last 7 Days)", items: [
                "**P1 Case Escalated:** Rush order delayed, resolved via Service Rep Assistant. [Case #00042871]",
                "**Sentiment:** Was -0.68 (frustrated) → improved after resolution. Monitor for follow-up.",
                "**Last Human Touch:** 47 days before the P1 case — *this is the gap that led to frustration.*",
              ] },
              { title: "Top Leads from This Account", items: [
                "[Lauren Bailey] is Qualified with an **AI Lead Score of 87** and a ZoomInfo intent signal.",
              ] },
              { title: "Upcoming Opportunities", items: [
                "[Q4 Drinkware Program] in Qualification, closing Oct 2026, for **$24K**.",
                "[2027 Calendar Renewal] in Proposal, closing Dec 2026, for **$18K**.",
              ] },
            ] },
          { role: "user", who: rep, body: "What's our best cross-sell opportunity for this account based on their order history?" },
          { role: "agent", who: "Agentforce",
            body: "Based on " + acct + "'s order history and external signals, here's the top recommendation:",
            highlight: {
              title: "**Insulated Drinkware Program (NEW)**",
              body: acct + "'s book is heavy in Big Pens + wall calendars for realtor and insurance end-buyers. ZoomInfo detected drinkware supplier research in the last 60 days — a natural adjacent category that completes the kit.",
              sub: "**Suggested pricing:** Volume-based bulk at the multi-vertical distributor tier. Lead with a Q4 delivery commitment to lock the seasonal window.",
              source: "Sources: Product Catalog MCP · ZoomInfo Intent · Order History (8 quarters)",
            } },
        ],
        _fallback: true,
      };
    }

    if (family === "metricsAndTable") {
      // mc-next-attribution → stacked KPI cards + attribution funnel + campaign
      // table (bar column) + an Einstein interpretation panel.
      if (screenId === "mc-next-attribution") {
        return {
          screenId: screenId,
          subtitle: "Attribution · Q1 · AE-Reply → Opportunity Model · Last 90 days",
          metrics: [
            { label: "Attributed revenue · Q1", value: "$2.4M", delta: "Was $0 · attribution ON", tone: "up" },
            { label: "Campaigns tracked", value: "12", delta: "Spotlight (11) + promo (1)", tone: "flat" },
            { label: "AE-reply rate", value: "28%", delta: "of opened emails reach an AE", tone: "flat" },
            { label: "AE-reply → PO", value: "61%", delta: "close within 21 days", tone: "up" },
          ],
          funnelTitle: "AE-Reply Attribution Model · How email ties to PO",
          funnel: [
            { label: "1 · Sent", value: "312K", sub: "Spotlight, 90d" },
            { label: "2 · Opened", value: "89K", sub: "28.5% open rate" },
            { label: "3 · AE-Contacted", value: "25K", sub: "28% of opens reply to an AE" },
            { label: "4 · Opportunity", value: "15K", sub: "$2.4M closed-won" },
          ],
          table: {
            title: "Campaigns Ranked by Attributed Revenue",
            columns: ["Campaign", "Open", "AE-Reply", "Attributed", "Contribution"],
            rows: [
              ["America 250 pens · Apr 4", "32%", "34%", "$412K", 100],
              ["Realtor calendar prep · Mar 21", "30%", "29%", "$298K", 72],
              ["#4 industry ranking · Feb 18", "36%", "22%", "$241K", 58],
              ["Big Pen spotlight · Apr 25", "28%", "27%", "$219K", 53],
              ["Outdoor / Parks · May 9", "26%", "18%", "$142K", 34],
              ["Sales-support single-product", "41%", "12%", "$68K", 16],
            ],
            barColumn: 4,
          },
          aiPanel: {
            title: "Einstein Insight", badge: "AI",
            body: "The America 250 pens campaign is a 1.4× outperformer against your own baseline — patriotic-themed content is landing with top-tier distributors this cycle. Personalized campaigns drive 2.1× the attributed revenue per email vs. the generic send. Recommend shifting the Thursday cadence toward theme-of-week × distributor-affinity, which MC Next can run automatically.",
          },
          _fallback: true,
        };
      }
      // territory-planning → two-column: map+pins + growth table (left);
      // pre-call brief hero + recent activity + recommended play + coverage math (right).
      return {
        screenId: screenId,
        header: { recordType: "Territory · Long-Tail Growth Signals · Q1",
          name: "Growing Distributors · 40K Long-Tail",
          fields: [
            { label: "Owner", value: personaName + " (Support Team)" },
            { label: "Period", value: "This quarter" },
          ] },
        map: {
          label: "Long-Tail Distributors · Growth Signals · US + Canada",
          legend: [
            { tone: "hot", text: "Hot (≥30% growth)" },
            { tone: "warm", text: "Warm (10–30%)" },
            { tone: "cool", text: "Watch" },
          ],
          pins: [
            { tone: "hot", top: 38, left: 18, label: (cust || "Staples") + " · +38%", selected: true },
            { tone: "warm", top: 42, left: 32 },
            { tone: "warm", top: 55, left: 44 },
            { tone: "hot", top: 32, left: 52 },
            { tone: "warm", top: 60, left: 60 },
            { tone: "warm", top: 48, left: 68 },
            { tone: "hot", top: 44, left: 78 },
            { tone: "cool", top: 22, left: 24 },
            { tone: "cool", top: 70, left: 38 },
            { tone: "cool", top: 65, left: 72 },
            { tone: "cool", top: 34, left: 64 },
            { tone: "cool", top: 52, left: 24 },
          ],
        },
        table: {
          title: "Long-Tail Accounts Ranked by Growth Signal",
          columns: ["Account", "YoY Growth", "Last Touch", "Expansion $", "Signal"],
          rows: [
            [(cust || "Staples") + " Promotional", "+38%", "47 days", "$180K", 100],
            ["Regional Promo Co.", "+34%", "62 days", "$142K", 89],
            ["Midwest Merch Group", "+31%", "28 days", "$118K", 82],
            ["Coastal Branded Goods", "+28%", "19 days", "$96K", 74],
            ["Northern Promo Supply", "+22%", "91 days", "$81K", 58],
          ],
          barColumn: 4,
        },
        brief: {
          eyebrow: "Agentforce Pre-Call Brief",
          name: (cust || "Staples") + " Promotional Products",
          sub: "M. Reyes · Buyer · Clearwater, FL · Last touched 47 days ago",
          signals: [
            { k: "YoY Growth", v: "+38%" },
            { k: "Expansion $", v: "$180K" },
            { k: "Sentiment", v: "−0.72" },
          ],
        },
        activityTitle: "Recent Activity",
        activity: [
          { primary: "Rush-order complaint case opened", secondary: "Today · 09:47 AM · Auto-escalated to Tier 2", badge: { tone: "bad", text: "P1" } },
          { primary: "America 250 pen order placed", secondary: "2 weeks ago · 50K units · $180K", badge: { tone: "good", text: "+$180K" } },
          { primary: "MC Next Thursday email opened", secondary: "3 weeks ago · Clicked America 250 CTA", badge: { tone: "brand", text: "Signal" } },
          { primary: "Invoicing case (open)", secondary: "Case #00042854 · Awaiting finance", badge: { tone: "warn", text: "Watch" } },
        ],
        recommendedPlay: {
          title: "Agentforce Recommended Play",
          aiPanel: {
            title: "For the team · This week", badge: "AI",
            body: (cust || "Staples") + " has trended toward national-tier volume for three consecutive quarters, with $180K in Q3 orders and +38% YoY growth. Their AE hasn't touched them in 47 days, and a P1 service escalation opened this morning. Recommended play: personal outreach within 48 hours, positioning a shift from long-tail support to a named AE. Lead with the rush-order fix; anchor on 2027 realtor-calendar reserve pricing.",
          },
          cta: [
            { text: "📞 Book AE → account call", primary: true },
            { text: "📋 Full account brief" },
            { text: "🔄 Reassign to national team" },
          ],
        },
        coverage: {
          title: "Territory Coverage Math",
          rows: [
            { label: "Long-tail accounts", value: "40,281", badge: { tone: "neutral", text: "Today" } },
            { label: "Human reps assigned", value: "3 (support)", badge: { tone: "warn", text: "1:13,427" } },
            { label: "With Agentforce briefs", value: "Effective 3 → ~30", badge: { tone: "good", text: "10×" } },
          ],
        },
        _fallback: true,
      };
    }

    if (family === "serviceCase") {
      var caseHeader = {
        recordType: "Case · " + companyName,
        name: "Case #00042817 — Escalated",
        fields: [
          { label: "Contact", value: personaName },
          { label: "Priority", value: "High" },
          { label: "Status", value: "In progress" },
          { label: "Channel", value: "Voice + Chat" },
        ],
      };
      // case-summary-lwc → Einstein wrap-up summary + suggested reply + related cases + handle-time.
      if (screenId === "case-summary-lwc") {
        return {
          screenId: screenId,
          header: caseHeader,
          badges: [{ tone: "brand", text: "AI SUMMARY" }, { tone: "neutral", text: "Tier 2" }, { tone: "good", text: "Resolvable" }],
          aiPanel: {
            title: "Einstein Case Wrap-Up", badge: "AI GENERATED",
            body: "Customer reported a recurring billing error across two cycles. Prior agent applied a partial credit; issue persisted. Root cause: a proration rule mis-applied on plan change. Fix confirmed with billing engineering; full credit issued.",
            sources: ["Case history", "Billing record", "Chat transcript"],
          },
          cta: [{ text: "Post summary to case", primary: true }, { text: "Copy to email" }, { text: "Edit" }],
          suggestedReply: {
            groundedOn: "Grounded on the case + billing record",
            body: "Hi " + personaName.split(" ")[0] + " — thanks for your patience. We found the root cause (a proration rule on your plan change), issued a full credit for both cycles, and put a check in place so it won't recur. You'll see the credit within two business days.",
            actions: ["Send reply", "Edit", "Log"],
          },
          related: [
            { primary: "Case #00041902", secondary: "Same proration rule · resolved", badge: { tone: "good", text: "CLOSED" } },
            { primary: "Case #00040550", secondary: "Billing dispute · credit issued", badge: { tone: "good", text: "CLOSED" } },
          ],
          relatedTitle: "Related cases",
          coverage: {
            title: "Handle time",
            rows: [
              { label: "Time to summary", value: "18s", badge: { tone: "good", text: "−94%" } },
              { label: "Manual baseline", value: "~5 min" },
              { label: "Cases/day (agent)", value: "+22", badge: { tone: "good", text: "capacity" } },
            ],
            footer: "Einstein wrap-up removes after-call notes so agents close cases faster.",
          },
          _fallback: true,
        };
      }
      // sentiment-case → live sentiment bar + escalation timeline + recovery CTAs.
      return {
        screenId: screenId,
        header: caseHeader,
        badges: [{ tone: "bad", text: "NEGATIVE" }, { tone: "warn", text: "3rd contact" }, { tone: "brand", text: "Escalated" }],
        sentiment: {
          title: "Case Sentiment", badge: "EINSTEIN",
          bar: { value: -0.72, label: "Negative", meta: "Trending down · 3 interactions",
            insight: "Customer frustration is rising — recommend a supervisor callback and a goodwill credit to recover the relationship." },
          body: "",
        },
        cta: [{ text: "Request supervisor callback", primary: true }, { text: "Apply goodwill credit" }, { text: "Escalate to Tier 2" }],
        aiPanel: {
          title: "Recommended Resolution", badge: "AI GENERATED",
          body: "Recurring billing error across two cycles; partial credit did not resolve it. Root cause likely a proration rule. Escalate to billing engineering and confirm the fix with the customer today.",
          sources: ["Case history", "Billing record", "Chat transcript"],
        },
        timeline: {
          title: "Case Timeline", month: "Today",
          items: [
            { title: "Escalated to Tier 2", sub: "Sentiment threshold crossed", from: "Einstein", time: "11:20 AM",
              body: "Sentiment dropped below −0.7 — auto-flagged for supervisor review." },
            { from: personaName, time: "11:04 AM", status: "Received", statusTone: "pending",
              body: "This is the third time I've called about the same charge. I need this fixed today." },
            { from: "Agent", time: "10:58 AM", status: "Sent", statusTone: "viewed",
              body: "I understand the frustration — let me pull your billing history and get a specialist involved." },
          ],
        },
        _fallback: true,
      };
    }

    if (family === "voiceConsole") {
      return {
        screenId: screenId,
        header: {
          recordType: "Voice · Live Call",
          name: personaName + " — Inbound",
          fields: [
            { label: "Queue", value: "Support" },
            { label: "Wait", value: "0:12" },
            { label: "Account", value: companyName },
            { label: "Sentiment", value: "Neutral → Positive" },
          ],
        },
        call: { status: "On call — live", timer: "04:12" },
        transcript: {
          title: "Live Transcript",
          turns: [
            { role: "user", who: personaName, body: "Hi, I'm calling about an order that hasn't shipped yet." },
            { role: "agent", who: "Agent", body: "Thanks for calling — I can see the order. It looks like it's held on a payment review. Let me clear that for you." },
            { role: "user", who: personaName, body: "Great, how long will it take now?" },
            { role: "agent", who: "Agent", body: "It'll ship today and arrive within two business days. I've also added expedited handling at no charge." },
          ],
        },
        identity: {
          title: "Caller",
          fields: [
            { label: "Name", value: personaName },
            { label: "Account", value: companyName },
            { label: "Tier", value: "Priority" },
            { label: "Open cases", value: "1" },
          ],
        },
        sentiment: {
          title: "Live Sentiment", badge: "EINSTEIN",
          bar: { value: 0.35, label: "Neutral → Positive", meta: "Recovering this call",
            insight: "Sentiment rose after the payment hold was cleared — momentum is positive." },
        },
        aiPanel: {
          title: "Service Reply Assist", badge: "LIVE AI",
          body: "Caller intent: shipping delay. Order is on payment hold — one-click release available. Offer expedited shipping to recover sentiment.",
        },
        list: [
          { primary: "Release payment hold", secondary: "One click · order #88231", badge: { tone: "brand", text: "DO" } },
          { primary: "Add expedited shipping", secondary: "No charge · goodwill", badge: { tone: "good", text: "OFFER" } },
          { primary: "Send SMS confirmation", secondary: "After call", badge: { tone: "neutral", text: "QUEUE" } },
        ],
        knowledge: [
          { primary: "Payment hold policy", secondary: "KB-2041 · grounded", badge: { tone: "neutral", text: "KB" } },
          { primary: "Expedited shipping SLA", secondary: "KB-1188", badge: { tone: "neutral", text: "KB" } },
        ],
        knowledgeTitle: "Grounded knowledge",
        _fallback: true,
      };
    }

    if (family === "campaignBuilder") {
      return {
        screenId: screenId,
        subtitle: "Agentic Campaign Builder · Campaigns › New › Prompt-Native",
        prompt: "Give me an audience of distributors who haven't purchased in the last 12 months. Build a promotional offer around America 250 pens. Use our brand tone and voice — warm, direct, no fluff. Tie the campaign to revenue and open rate so I can share the report with Phil.",
        promptHighlights: [
          "distributors who haven't purchased in the last 12 months",
          "America 250 pens",
          "brand tone and voice",
          "revenue and open rate",
        ],
        promptMeta: "Grounded on Sales Cloud + Data Cloud · Runs in ~12s",
        buildLabel: "✨ Build campaign",
        steps: [
          { title: "Audience built ✓", preview: "4,281 distributors · 12mo lapsed", done: true },
          { title: "Content generated ✓", preview: "Subject + body + 3 A/B variants", done: true },
          { title: "Brand tone applied ✓", preview: "Matched to style guide", done: true },
          { title: "Report wired ✓", preview: "Revenue + open rate + attribution", done: true },
        ],
        previewCards: [
          {
            title: "Audience", icon: "🎯", badge: { tone: "good", text: "Built" }, kind: "count",
            count: "4,281", countSub: "distributors match your criteria",
            attrs: [
              { k: "Last purchase", v: "> 12 months ago" },
              { k: "Prior spend tier", v: "$5K – $50K" },
              { k: "Product affinity", v: "Political / Patriotic (39%)" },
              { k: "Geography", v: "US 82% · Canada 18%" },
              { k: "Data source", v: "Sales Cloud · Data Cloud" },
            ],
          },
          {
            title: "Content · Variant A (recommended)", icon: "✉️", badge: { tone: "brand", text: "Brand-tuned" }, kind: "email",
            subject: "Your book, your America 250 season",
            body: "Hey — it's been about a year since we last ran a full order together. With America 250 hitting peak buying season, your accounts in political and community-org verticals are asking distributors like you for branded pens right now. We've reserved Big Pen America 250 inventory at a locked-in unit cost through end of Q3. Reply to your rep to claim.",
          },
          {
            title: "Report (for Phil)", icon: "📊", badge: { tone: "good", text: "Pre-configured" }, kind: "attrs",
            attrs: [
              { k: "Revenue attributed", v: "Live tracking on" },
              { k: "Open rate benchmark", v: "12mo average" },
              { k: "CTR benchmark", v: "Industry-adjusted" },
              { k: "AE-reply funnel", v: "Distributor → AE → PO tied" },
              { k: "Delivery", v: "Weekly to Phil's inbox" },
              { k: "Dashboards", v: "MC Next + Sales Cloud" },
            ],
          },
          {
            title: "Ready to send", icon: "🚀", badge: { tone: "neutral", text: "Draft" }, kind: "cta",
            body: "Review the audience, content, and report — then send. No middleware. No re-warming IPs. Trusted domains inherited from MCE.",
            ctas: [
              { text: "Schedule for Thursday 9:00 AM", primary: true },
              { text: "Save as reusable template" },
            ],
          },
        ],
        _fallback: true,
      };
    }

    if (family === "emailPreview") {
      var recip = cust || "Staples Promotional Products";
      return {
        screenId: screenId,
        email: {
          from: companyName + " Marketing <marketing@example.com>",
          subject: "America 250 Pens + Your Calendar Season Prep",
          toTag: "To: " + recip,
          tabs: [
            { label: recip.split(" ")[0] + " · MC Next", active: true },
            { label: "Everyone · Today", active: false },
          ],
          personalized: {
            bannerTag: "MC Next · Personalized",
            bannerText: "America 250 · Political & Realtor Bundle",
            intro: "Hi " + recip.split(" ")[0] + " team — based on your recent order for political-org pens and your quarterly realtor calendar buys, here are four items your book is most likely buying this quarter.",
            products: [
              { emoji: "🖊️", name: "America 250 Big Pen", meta: "Your Q3 rush · restock" },
              { emoji: "📅", name: "2027 Realtor Wall Calendars", meta: "Season lead time · $1.20/unit" },
              { emoji: "🇺🇸", name: "USA-Proud Stress Balls", meta: "Match your political SKU affinity" },
              { emoji: "💧", name: "Custom Insulated Bottles", meta: "New · realtor gift-set upsell" },
            ],
            whyPicked: {
              title: "Why these four?",
              body: "MC Next pulled the last 8 quarters of purchase history from Sales Cloud, matched product affinity across political/realtor end-customer segments, and selected the four items with highest predicted response rate for your book.",
            },
            cta: "Reserve inventory for Q3 →",
            footer: "Attribution ON · This email is tracked back to the Sales Cloud opportunity when the rep receives their reply.",
          },
          generic: {
            bannerTag: "MCE · Same for all",
            bannerText: "Thursday Product Spotlight · Outdoor Theme",
            bannerAlt: true,
            intro: "Hi there — check out this week's hand-picked product spotlight, featuring four favorites the product team selected for you.",
            products: [
              { emoji: "⛺", name: "Outdoor Camp Chair", meta: "Featured item" },
              { emoji: "🔦", name: "Branded LED Flashlight", meta: "Featured item" },
              { emoji: "🎒", name: "Canvas Backpack", meta: "Featured item" },
              { emoji: "🧢", name: "Trucker Cap", meta: "Featured item" },
            ],
            whyPicked: {
              title: "Why these four?", muted: true,
              body: "The product team selected them around this week's outdoor theme. Every subscriber receives the same four products, regardless of purchase history.",
            },
            cta: "Shop this spotlight →", ctaMuted: true,
            footer: "Attribution OFF · 99% of resulting POs come via distributor-to-AE email reply. Marketing gets zero credit.",
            footerMuted: true,
          },
        },
        _fallback: true,
      };
    }

    if (family === "kpiTable") {
      var firstName = personaName.split(" ")[0];
      return {
        screenId: screenId,
        subtitle: "Prospecting Agent worked " + companyName + "'s territory overnight — scored accounts, surfaced buying signals, and drafted outreach.",
        kpis: [
          { value: "142", label: "Accounts scanned" },
          { value: "38", label: "New signals" },
          { value: "12", label: "High-intent", active: true },
          { value: "6", label: "Outreach drafted" },
        ],
        table: {
          title: "Prioritized accounts",
          columns: ["Account", "Score", "Segment", "Signal", "Owner", "Last touch", "Status"],
          rows: [
            { cells: ["Northwind Retail", "94", "Enterprise", "Funding round", "Unassigned", "31 days", "Ready"],
              sub: "Series C · $40M — hiring ops leadership",
              signal: { tone: "good", text: "HOT" }, tags: [{ tone: "brand", text: "Expansion" }, { tone: "neutral", text: "No rep" }], selected: true },
            { cells: ["Contoso Foods", "88", "Enterprise", "Exec change", personaName, "8 days", "Working"],
              sub: "New VP of Supply Chain — prior customer at last role",
              signal: { tone: "good", text: "WARM" }, tags: [{ tone: "brand", text: "Champion" }] },
            { cells: ["Fabrikam Inc.", "81", "Mid-market", "Web activity", "Unassigned", "60 days", "Ready"],
              sub: "Repeated pricing-page visits this week",
              signal: { tone: "warn", text: "INTENT" }, tags: [{ tone: "neutral", text: "Renewal soon" }] },
            { cells: ["Tailspin Toys", "76", "Mid-market", "Category launch", personaName, "14 days", "Working"],
              sub: "Launched a new product line matching our fit",
              signal: { tone: "warn", text: "INTENT" }, tags: [{ tone: "neutral", text: "Cross-sell" }] },
          ],
          footnote: "Scores blend account fit, engagement velocity, and third-party intent — refreshed every hour.",
        },
        aiPanel: {
          title: "Prospecting Agent", badge: "AGENTFORCE",
          body: "Hi " + firstName + " — 12 accounts crossed the high-intent threshold overnight. I've drafted grounded outreach for the top 6; Northwind Retail is unassigned and just raised a round. Want me to queue the cadence?",
          sources: ["Data Cloud", "News · funding", "Web engagement"],
        },
        _fallback: true,
      };
    }

    // Generic fallback for any remaining not-yet-specialized family.
    return {
      screenId: screenId,
      header: {
        recordType: def.label || "Record",
        name: companyName,
        fields: [
          { label: "Owner", value: personaName },
          { label: "Industry", value: cx.industry || "—" },
        ],
      },
      _fallback: true,
    };
  }

  // ── main: generate foundation + config for one screen ─────────
  // Resolves { found, config, usedGemini }. opts.onStatus(msg, frac) optional.
  function generate(screenId, state, opts) {
    opts = opts || {};
    var cx = ctxFrom(state);
    var status = opts.onStatus || function () {};
    var gen = global.HOLO_GEMINI;
    var family = familyOf(screenId) || "recordWithScoreAndTimeline";

    function assemble(found) {
      found.screenId = screenId;
      var brand = { name: cx.customerName, flatColors: cx.flatColors };
      if (state && state.brand && state.brand.colors) brand.colors = state.brand.colors;
      var sg = SCREENGEN();
      var config = sg ? sg.buildScreenConfig(family, found, brand, cx)
                      : Object.assign({ screenId: screenId, family: family }, found);
      return { found: found, config: config };
    }

    if (!gen) {
      status("Gemini unavailable — using a customer-flavored template.", 1);
      return Promise.resolve(Object.assign(assemble(fallbackFoundation(screenId, cx)), { usedGemini: false }));
    }

    status("Checking AI availability…", 0.1);
    return gen.isConfigured().then(function (ok) {
      if (!ok) {
        status("Gemini not configured — using a customer-flavored template.", 1);
        return Object.assign(assemble(fallbackFoundation(screenId, cx)), { usedGemini: false });
      }
      status("Generating " + screenId + " for " + cx.customerName + "…", 0.25);
      return gen.generate({ prompt: promptFor(family, cx), jsonMode: true, useCache: true, temperature: 0.4 })
        .then(function (text) {
          var parsed = parseJson(text);
          if (!parsed) {
            status("AI response wasn't usable — using a customer-flavored template.", 1);
            return Object.assign(assemble(fallbackFoundation(screenId, cx)), { usedGemini: false });
          }
          status("Assembling " + screenId + " configuration…", 0.9);
          return Object.assign(assemble(parsed), { usedGemini: true });
        })
        .catch(function () {
          status("AI call failed — using a customer-flavored template.", 1);
          return Object.assign(assemble(fallbackFoundation(screenId, cx)), { usedGemini: false });
        });
    });
  }

  // Synchronous, token-free config — for a first preview before "Generate".
  function fallbackScreenConfig(screenId, state) {
    var cx = ctxFrom(state || {});
    var family = familyOf(screenId) || "recordWithScoreAndTimeline";
    var found = fallbackFoundation(screenId, cx);
    var brand = { name: cx.customerName || "", flatColors: cx.flatColors };
    var sg = SCREENGEN();
    return sg ? sg.buildScreenConfig(family, found, brand, cx)
              : Object.assign({ screenId: screenId, family: family }, found);
  }

  global.HOLO_SCREENFOUND = {
    generate: generate,
    fallbackScreenConfig: fallbackScreenConfig,
    _parseJson: parseJson,
    _ctxFrom: ctxFrom,
  };
})(window);
