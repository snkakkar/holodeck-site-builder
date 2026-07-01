// ════════════════════════════════════════════════════════════════
//  AI CONFIG PROMPT
//  Constants for the "Generate Config with AI" page.
// ════════════════════════════════════════════════════════════════

(function (global) {
  "use strict";

  // ─── JSON schema (copyable + inlined into the prompt) ─────────
  const CONFIG_TEMPLATE = `{
  "project": {
    "id":           "p_<short-id>",
    "name":         "<Customer> Holodeck — <Theme>",
    "customerName": "Acme Retail",
    "website":      "https://www.acme.com",
    "industry":     "Retail",
    "audience":     "Executive",
    "salesStage":   "Vision",
    "products":     ["Agentforce", "Data Cloud", "Commerce"],
    "theme":        "The agentic shopper journey"
  },
  "brand": {
    "logoUrl":         "assets/acme-logo.png",
    "primaryColor":    "#b22234",
    "secondaryColor":  "#1a5fa0",
    "accentColor":     "#f5c06a",
    "tone":            "Premium",
    "visualDirection": "Editorial, warm photography",
    "notes":           "Confirm with marketing"
  },
  "storyFoundations": {
    "businessProblem":      "<one-paragraph problem grounded in the script>",
    "currentStatePain":     "<one-paragraph pain — abandons, hesitations, fragmentation>",
    "futureStateVision":    "<one-paragraph vision — agentic, connected, personalized>",
    "primaryNarrative":     "<the demo's spine — usually a paraphrase of the script synopsis>",
    "transformationThesis": "<one-sentence: from X to Y by doing Z>",
    "executiveTakeaway":    "<one-sentence close>",
    "customerMoments":      ["Personalized ad", "Site personalization", "Wishlist", "..."],
    "operationalMoments":   ["Data Cloud propensity scoring", "..."],
    "agentforceMoments":    ["AI design assistant answers product questions", "..."],
    "dataCloudMoments":     ["High-propensity buyer identification", "..."],
    "commerceMoments":      ["Personalized B2C Commerce landing", "..."],
    "marketingMoments":     ["Price-drop SMS", "..."],
    "serviceMoments":       ["iMessage exchange", "..."],
    "loyaltyMoments":       ["..."],
    "valueDrivers":         ["Higher conversion through ...", "Increased AOV through ...", "Loyalty / LTV through ...", "Reduced service friction"],
    "assumptions":          ["MCP referenced; do not invent implementation details"],
    "openQuestions":        ["Which BVS metrics for the close?"]
  },
  "personas": [
    { "id": "persona_1", "name": "Rachel", "role": "Annual host",
      "goals": "Throw the perfect 4th of July BBQ", "painPoints": "Generic emails",
      "demoRelevance": "Anchors the entire shopper journey" }
  ],
  "storyActs": [
    { "id": "act_1", "title": "Discover", "persona": "Rachel", "channel": "In-store",
      "summary": "December visit captures email at checkout", "demoMoment": "POS scene",
      "salesforceCapabilities": "Data Cloud", "businessValue": "Anonymous to known",
      "requiredAssets": "Store interior photo", "notes": "open the demo here" }
  ],
  "cxComponents": [
    { "id": "cx_1", "name": "Personalized storefront",
      "url": "https://aubreydemo.com/scene/123/frame", "type": "commerce",
      "sectionId": "demo", "linkedStoryActIds": ["act_2"], "linkedSlideIds": [],
      "deviceFrame": "desktop", "iframeAllowed": true, "fallbackMode": "link-card",
      "status": "ready", "notes": "" }
  ],
  "slideSections": [
    { "id": "intro",          "label": "Intro",         "order": 1, "required": true,
      "purpose": "Establish the customer, business challenge, and Salesforce vision",
      "slideIds": ["slide_1", "slide_2"] },
    { "id": "journey-map",    "label": "Journey Map",   "order": 2, "required": true,
      "purpose": "Show the end-to-end customer journey",
      "slideIds": ["slide_3"] },
    { "id": "meet-persona",   "label": "Meet {primaryPersonaFirstName}",
      "order": 3, "required": true,
      "purpose": "Introduce the persona before any demo moment",
      "slideIds": ["slide_4"] },
    { "id": "demo",           "label": "Demo",          "order": 4, "required": true,
      "purpose": "Walk through the agent / commerce / device moments",
      "slideIds": ["slide_5", "slide_6", "slide_7"] },
    { "id": "business-value", "label": "Business Value", "order": 5, "required": true,
      "purpose": "Tie the demo back to outcomes",
      "slideIds": ["slide_8", "slide_9"] }
  ],
  "slides": [
    { "id": "slide_1", "title": "Acme, Reimagined",
      "layout": "hero", "sectionId": "intro",
      "selected": true, "selectionStatus": "required",
      "selectionRationale": "Every holodeck opens with the customer + theme.",
      "readinessStatus": "ready", "missingInputs": [],
      "order": 0, "contentBlocks": [], "capabilities": [],
      "linkedCxComponentIds": [], "deviceFrame": "",
      "speakerNotes": "Open with the date and the customer name." },
    { "id": "slide_3", "title": "End-to-End Customer Journey",
      "layout": "journeyTimeline", "sectionId": "journey-map",
      "selectionStatus": "required",
      "selectionRationale": "3+ acts in the script — show them as a timeline.",
      "readinessStatus": "ready", "order": 2 },
    { "id": "slide_5", "title": "AI Design Assistant",
      "layout": "agentConversation", "sectionId": "demo",
      "selectionStatus": "recommended",
      "selectionRationale": "Agentforce is a selected product and the script has a clear AI moment.",
      "readinessStatus": "ready", "order": 4 },
    { "id": "slide_6", "title": "Embedded Personalized Storefront",
      "layout": "embeddedCxComponent", "sectionId": "demo",
      "selectionStatus": "recommended",
      "selectionRationale": "An AubreyDemo CX component is provided.",
      "readinessStatus": "needs-iframe",
      "linkedCxComponentIds": ["cx_1"], "deviceFrame": "desktop",
      "order": 5 }
  ],
  "assets": [
    { "id": "asset_1", "name": "Store interior photo", "type": "image",
      "source": "assets/acme-store.jpg", "status": "needed",
      "recommendedFor": ["slide_2"], "notes": "Daylight, no people" }
  ],
  "recommendations": [],
  "buildNotes": [
    "Replace XX% / +$XX BVS placeholders with approved values",
    "Confirm CX component URLs render in an iframe before presenting"
  ]
}`;

  // ─── Example user inputs ──────────────────────────────────────
  const EXAMPLE_INPUTS = `Customer: Acme Retail (https://www.acme.com)
Industry: Retail
Audience: Executive
Sales stage: Vision
Salesforce products: Agentforce, Data Cloud, Commerce, Marketing Cloud

Big problem: Acme has rich first-party data but no agentic moments and no
unified profile across channels.

Future-state vision: Every email, ad, SMS, and storefront interaction is
personalized and connected.

Persona: Rachel — annual host who throws a 4th of July BBQ.

Journey: in-store visit → spring email → June Instagram ad → personalized
storefront → abandon cart → agentic SMS → Shopper Agent purchase →
post-purchase nurture.

CX components (AubreyDemo):
- Personalized storefront: https://aubreydemo.com/scene/1059/frame  (commerce, desktop)
- Agentic SMS:             https://aubreydemo.com/scene/1061/frame  (marketing, mobile)
- Shopper Agent:           https://aubreydemo.com/scene/1060/frame  (agent, mobile)`;

  // ─── The prompt itself ────────────────────────────────────────
  const PROMPT = [
    "You are a Salesforce SE generating a Holodeck demo config. The SE will",
    "paste your output into the Holodeck Builder to auto-fill the project.",
    "",
    "── SE INPUTS — READ FIRST ──",
    "<<SE_INPUTS>>",
    "",
    "── EXTRACT STORY FOUNDATIONS FIRST ──",
    "Before generating any slides, read the script and pull out:",
    "  • businessProblem, currentStatePain, futureStateVision",
    "  • primaryNarrative, transformationThesis, executiveTakeaway",
    "  • customerMoments, operationalMoments",
    "  • agentforceMoments, dataCloudMoments, commerceMoments,",
    "    marketingMoments, serviceMoments, loyaltyMoments",
    "  • valueDrivers (3+), assumptions, openQuestions",
    "",
    "Mapping rules from script structure:",
    "  Script Synopsis    → primaryNarrative / transformationThesis",
    "  CX Summary         → businessProblem, futureStateVision, customerMoments",
    "  Persona Description → personas",
    "  Chapter headings   → story act groups",
    "  Section -          → journey phase labels",
    "  Channel - / Device - → channels & devices for subsequent acts",
    "  Numbered rows      → storyActs",
    "  Notes column       → buildNotes / assumptions",
    "  BVS / close        → valueDrivers, executiveTakeaway",
    "",
    "── BUILD THE SLIDE PLAN BY SECTION ──",
    "Group every slide into one of five sections, in this order:",
    "  1. intro          — Hero, Story Foundation, Current vs Future",
    "  2. journey-map    — Journey Timeline, Demo Map",
    "  3. meet-persona   — Persona Card, Unified Profile teaser",
    "  4. demo           — Agent Conversation, Unified Profile, Device",
    "                      Moments, Embedded CX Components, Architecture",
    "                      (only for technical audiences)",
    "  5. business-value — KPI Scorecard, Executive Takeaway, Next Steps",
    "",
    "Tag each slide:",
    "  selectionStatus: \"required\" | \"recommended\" | \"optional\"",
    "  selectionRationale: one sentence, repeatable to a peer",
    "  readinessStatus: \"ready\" | \"missing-inputs\" | \"needs-asset\" | \"needs-iframe\"",
    "  missingInputs: human-readable list",
    "",
    "── RULES ──",
    "1. Return ONE valid JSON object matching the schema. No prose, no markdown",
    "   fences, no extra keys.",
    "2. Don't invent customer facts (names, metrics, specs). Use \"[TODO: …]\"",
    "   placeholders and note assumptions in storyFoundations.assumptions.",
    "3. Tailor the slide plan to the audience: Executive → trim architecture,",
    "   keep value/outcome; IT/Technical → add architecture, integration,",
    "   governance; Retail/CG → shopper journey, clienteling, loyalty,",
    "   post-purchase; Hospitality/Travel → guest profile, booking,",
    "   on-property, disruption, concierge.",
    "4. Lean into selected products: Agentforce → agent moments; Data Cloud",
    "   → unified profile; Commerce → storefront; etc.",
    "5. Distinct slides only. Do NOT use executiveSummary on more than 1–2",
    "   slides (the closing takeaway). Use storyFoundation, currentFutureState,",
    "   futureState for the Intro section instead.",
    "6. If the SE provides AubreyDemo CX component URLs, create a",
    "   `cxComponents` entry per URL and add an `embeddedCxComponent` slide in",
    "   the Demo section linked to it. Pick a sensible deviceFrame:",
    "   commerce/web → desktop, marketing/SMS/agent → mobile.",
    "7. Allowed slide layouts (use only these): hero, storyFoundation,",
    "   currentFutureState, futureState, journeyTimeline, demoMap,",
    "   personaCard, agentConversation, unifiedProfile, architecture,",
    "   deviceMoment, embeddedCxComponent, kpiScorecard, executiveSummary,",
    "   nextSteps.",
    "8. Stable string IDs: persona_1, act_1, slide_1, asset_1, cx_1.",
    "   slide.order is the 0-based array index.",
    "9. Even from thin inputs, produce 5–8 slides, 1 persona, 3–4 story acts,",
    "   3+ value drivers, and concrete assets (\"Store photo\", not \"image\").",
    "",
    "── SCHEMA ──",
    "<<SCHEMA>>",
  ].join("\n");

  // The original literal placeholder — used when the SE hasn't
  // supplied any real inputs, so the copy-paste flow still reads
  // sensibly.
  const SE_INPUTS_PLACEHOLDER = [
    "[Paste customer notes, demo script, audience, products, brand, persona,",
    " pain, vision, and any AubreyDemo CX component links here. Missing fields",
    " → use sensible defaults or [TODO:] placeholders.]",
  ].join("\n");

  // getFullPrompt(inputsText?) — when inputsText is a non-empty
  // string it replaces the SE INPUTS placeholder with real content;
  // otherwise the bracketed placeholder is kept.
  function getFullPrompt(inputsText) {
    const inputs = (typeof inputsText === "string" && inputsText.trim())
      ? inputsText.trim()
      : SE_INPUTS_PLACEHOLDER;
    return PROMPT
      .replace("<<SE_INPUTS>>", inputs)
      .replace("<<SCHEMA>>", CONFIG_TEMPLATE);
  }

  // ─── Build an SE-inputs block from builder state ──────────────
  // Formats app.state into the same human-readable shape as
  // EXAMPLE_INPUTS so the model sees a familiar structure. Only
  // emits lines for fields that are actually populated.
  function buildInputsBlock(state) {
    if (!state) return "";
    const p  = state.project || {};
    const sf = state.storyFoundations || {};
    const lines = [];

    const products = Array.isArray(p.products) ? p.products.filter(Boolean) : [];
    if (p.customerName || p.website) {
      lines.push("Customer: " + (p.customerName || "[TODO: customer]") +
        (p.website ? " (" + p.website + ")" : ""));
    }
    if (p.industry)   lines.push("Industry: " + p.industry);
    if (p.audience)   lines.push("Audience: " + p.audience);
    if (p.salesStage) lines.push("Sales stage: " + p.salesStage);
    if (products.length) lines.push("Salesforce products: " + products.join(", "));
    if (p.tone)  lines.push("Tone: " + p.tone);
    if (p.theme) lines.push("Theme: " + p.theme);

    // Extracted foundations, when present, sharpen the model's read.
    if (sf.businessProblem)   lines.push("", "Big problem: " + sf.businessProblem);
    if (sf.futureStateVision) lines.push("Future-state vision: " + sf.futureStateVision);
    if (sf.primaryNarrative)  lines.push("Primary narrative: " + sf.primaryNarrative);

    const personas = Array.isArray(state.personas) ? state.personas.filter(Boolean) : [];
    if (personas.length) {
      lines.push("", "Personas:");
      personas.forEach(function (per) {
        const bits = [per.name, per.role].filter(Boolean).join(" — ");
        lines.push("- " + (bits || "[TODO: persona]") +
          (per.goals ? (" · goals: " + per.goals) : ""));
      });
    }

    const vds = Array.isArray(sf.valueDrivers) ? sf.valueDrivers.filter(Boolean) : [];
    if (vds.length) {
      lines.push("", "Value drivers:");
      vds.forEach(function (v) { lines.push("- " + v); });
    }

    // The raw script last (it's the longest) so the structured
    // fields above are read first.
    if (state.scriptText && state.scriptText.trim()) {
      lines.push("", "── DEMO SCRIPT ──", state.scriptText.trim());
    }

    return lines.join("\n").trim();
  }

  // ─── Story-parse prompt (Step 2 BETA Gemini extractor) ────────
  // Asks Gemini to parse a raw script into the same storyFoundations
  // shape the regex parser produces, plus storyActs / personas /
  // customerName / products, as ONE JSON object. The builder funnels
  // the result through the existing mergeExtractedStoryIntoState
  // pipeline, so the output here must match those field names.
  const STORY_PARSE_PROMPT = [
    "You are parsing a rough Salesforce demo script into structured story",
    "foundations for the Holodeck Builder. Read the SCRIPT below and return",
    "ONE valid JSON object (no prose, no markdown fences) with EXACTLY these keys:",
    "",
    "{",
    '  "businessProblem": "<one paragraph>",',
    '  "currentStatePain": "<one paragraph>",',
    '  "futureStateVision": "<one paragraph>",',
    '  "primaryNarrative": "<the demo spine, ~1-2 sentences>",',
    '  "transformationThesis": "<one sentence: from X to Y by doing Z>",',
    '  "executiveTakeaway": "<one sentence close>",',
    '  "customerMoments": ["..."],',
    '  "operationalMoments": ["..."],',
    '  "agentforceMoments": ["..."],',
    '  "dataCloudMoments": ["..."],',
    '  "commerceMoments": ["..."],',
    '  "marketingMoments": ["..."],',
    '  "serviceMoments": ["..."],',
    '  "loyaltyMoments": ["..."],',
    '  "valueDrivers": ["..."],',
    '  "assumptions": ["..."],',
    '  "openQuestions": ["..."],',
    '  "storyActs": [{ "title": "", "persona": "", "channel": "", "summary": "", "demoMoment": "", "salesforceCapabilities": "", "businessValue": "", "notes": "" }],',
    '  "personas": [{ "name": "", "role": "", "goals": "", "painPoints": "", "demoRelevance": "" }],',
    '  "customerName": "",',
    '  "website": "",',
    '  "industry": "",',
    '  "audience": "",',
    '  "salesStage": "",',
    '  "tone": "",',
    '  "theme": "",',
    '  "products": ["Agentforce", "Data Cloud", "..."]',
    "}",
    "",
    "RULES:",
    "1. Every array key MUST be present — use [] when there's nothing to add.",
    "2. Do NOT invent customer facts (names, metrics, specs). Use \"[TODO: …]\"",
    "   and record the assumption in assumptions[].",
    "3. products[] = only Salesforce products actually implied by the script.",
    "4. Keep prose tight; these fill form fields, not slides.",
    "4a. storyActs[].title = a SHORT customer-facing narrative phrase (≤5 words,",
    "    e.g. \"The abandoned cart\", \"Her welcome back\"). NEVER a production/scene",
    "    label like \"Split-Screen 1\", \"Screen 2\", \"Act 1\", or \"Scene 3\".",
    "5. SETUP FIELDS — fill these only from what the script actually says:",
    "   • website  — a real URL/domain only if one appears or is clearly implied;",
    "     otherwise \"\".",
    "   • theme    — a short phrase naming the demo's central storyline (free text).",
    "   • industry, audience, salesStage, tone — pick the SINGLE closest value from",
    "     the allowed list below, or \"\" if none fits. Do NOT invent a new value.",
    "       industry   ∈ [Retail, Consumer Goods, Hospitality, Travel,",
    "                     Financial Services, Healthcare, Other]",
    "       audience   ∈ [Executive, IT, Marketing, Sales, Service, Store Ops,",
    "                     Field Ops, Mixed]",
    "       salesStage ∈ [Vision, Discovery, Technical Validation,",
    "                     Executive Readout, RFP / POV]",
    "       tone       ∈ [Executive, Tactical, Visionary, Technical, Playful,",
    "                     Premium]",
    "",
    "── SCRIPT ──",
    "<<SCRIPT>>",
  ].join("\n");

  function getStoryParsePrompt(scriptText) {
    return STORY_PARSE_PROMPT.replace("<<SCRIPT>>", String(scriptText || ""));
  }

  // ─── Persona-card copy prompt (Assets step "Generate all") ────
  // Given one persona + demo context, asks Gemini for the small
  // copy fields the persona card needs: three stat tiles, a three-
  // item wishlist, and a short quote / pain-point line. Returns ONE
  // JSON object. The builder gap-fills only the empty fields, so the
  // model's job is to propose plausible, on-theme values grounded in
  // the persona + script — not to invent customer metrics.
  const PERSONA_COPY_PROMPT = [
    "You are filling in the persona card for a Salesforce demo. Using the",
    "PERSONA and DEMO CONTEXT below, return ONE valid JSON object (no prose,",
    "no markdown fences) with EXACTLY these keys:",
    "",
    "{",
    '  "painPoints": "<one short sentence — the unspoken thing on their mind>",',
    '  "stats": [',
    '    { "value": "<short, e.g. \\"4th of July\\">", "label": "Top Moment" },',
    '    { "value": "<short>", "label": "Tradition" },',
    '    { "value": "<short>", "label": "Signal" }',
    "  ],",
    '  "wishlist": [',
    '    { "name": "<product/offer ≤4 words, matched to the persona\'s buyer context>", "detail": "<short buyer-context phrase, e.g. \\"Saved to cart · price-drop trigger\\" or \\"Comparing venue packages\\">" },',
    '    { "name": "<product/offer ≤4 words, matched to the persona\'s buyer context>", "detail": "<short buyer-context phrase>" },',
    '    { "name": "<product/offer ≤4 words, matched to the persona\'s buyer context>", "detail": "<short buyer-context phrase>" }',
    "  ]",
    "}",
    "",
    "RULES:",
    "1. Keep every value SHORT — these are tiles and list rows, not paragraphs.",
    "2. Ground everything in the persona + demo theme. Stay on-industry.",
    "3. WISHLIST must be CONTEXTUAL to how THIS persona buys. First infer the",
    "   buyer context from their role + goals + demo relevance:",
    "   (a) B2C / CONSUMER (shopping for themselves) → real, believable retail",
    "       items they'd personally buy, tailored to the industry:",
    "         • Retail / Consumer Goods → apparel, home, beauty, gear, gadgets",
    "         • Hospitality / Travel → stays, experiences, luggage, travel gear",
    "         • Financial Services → accounts, cards, savings/investment plans",
    "         • Healthcare → wellness products, memberships, devices",
    "       detail = a short shopper-context phrase (e.g. \"Saved to cart\").",
    "   (b) B2B / BUSINESS BUYER (a planner, procurement, ops, or anyone buying",
    "       on behalf of an organization or event — NOT for personal use) →",
    "       the business-relevant offers THIS role is evaluating or buying for",
    "       the org/event, e.g.:",
    "         • Event planner → venue packages, catering / AV add-ons, group",
    "           experiences, corporate booking or bulk options",
    "         • Procurement → vendor plans, SLAs, volume / tier upgrades",
    "       detail = a short buyer-context phrase (e.g. \"Comparing venue",
    "       packages\", \"Group rate · 40 guests\") — NOT personal-shopper phrasing.",
    "   When in doubt, ask: is this person buying for THEMSELVES, or for their",
    "   organization/event? Match the wishlist to that. Each name ≤ 4 words.",
    "4. NEVER put Salesforce products, features, or clouds in the wishlist — no",
    "   \"Agentforce\", \"Data Cloud\", \"Marketing Cloud\", \"Commerce Cloud\",",
    "   \"Service Cloud\", \"Slack\", \"Tableau\", \"Einstein\", or any CRM/platform",
    "   capability. The wishlist is what the SHOPPER wants, not what we're pitching.",
    "5. Do NOT invent specific customer metrics or prices.",
    "6. Always return all three stats and all three wishlist rows.",
    "",
    "── PERSONA ──",
    "<<PERSONA>>",
    "",
    "── DEMO CONTEXT ──",
    "<<CONTEXT>>",
  ].join("\n");

  // getPersonaCopyPrompt(persona, context) — persona is the persona
  // object; context is a short string (theme/industry/vision/etc.).
  function getPersonaCopyPrompt(persona, context) {
    const p = persona || {};
    const personaLines = [
      p.name ? ("Name: " + p.name) : "",
      p.role ? ("Role: " + p.role) : "",
      p.goals ? ("Goals: " + p.goals) : "",
      p.painPoints ? ("Known pain points: " + p.painPoints) : "",
      p.demoRelevance ? ("Demo relevance: " + p.demoRelevance) : "",
    ].filter(Boolean).join("\n") || "[no persona detail provided]";
    return PERSONA_COPY_PROMPT
      .replace("<<PERSONA>>", personaLines)
      .replace("<<CONTEXT>>", String(context || "[no extra context]"));
  }

  // ─── Agent conversation script ────────────────────────────────
  // Generates the chat thread shown on the agentConversation slide.
  // The script MUST be contextual to the loaded demo story — never a
  // generic shopping/retail conversation unless the story itself is
  // retail. The agent greets first as the company's AI agent; the
  // customer raises the persona's real pain; the agent grounds every
  // answer in the actual demo acts + business value and ends with a
  // concrete next step.
  const AGENT_CHAT_PROMPT = [
    "You are scripting a short, realistic conversation between a company's",
    "AI agent and a customer, shown on a phone during a Salesforce demo.",
    "Using the DEMO CONTEXT below, return ONE valid JSON object (no prose,",
    "no markdown fences) with EXACTLY this shape:",
    "",
    "{",
    '  "turns": [',
    '    { "from": "agent", "text": "<short message>" },',
    '    { "from": "user",  "text": "<short message>" },',
    '    { "from": "agent", "kind": "card",',
    '      "card": { "eyebrow": "<2-3 words>", "title": "<short>", "sub": "<one short line>", "cta": "<2-3 words>" } }',
    "  ]",
    "}",
    "",
    "RULES:",
    "1. The FIRST turn is the agent greeting as the company's agent, e.g.",
    '   "Hi, I\'m the <Company> agent — here to help with <use case>."',
    "2. The customer then raises the persona's real pain in their own words.",
    "3. The agent grounds answers in the ACTUAL demo acts and business value",
    "   below — reference the real moment/capability, not generic features.",
    "4. EXACTLY ONE turn may be a card (kind:\"card\"); make it the agent's",
    "   recommended next step tied to a demo act. All other turns are plain",
    "   text with no card/kind. The card is optional — omit it if it doesn't",
    "   fit the story.",
    "5. The conversation ENDS with the agent offering a clear next step",
    "   (e.g. \"want me to set that up?\").",
    "6. Keep every message SHORT — these are chat bubbles, one or two lines.",
    "7. Stay strictly on this story's industry and use case. Do NOT make it a",
    "   shopping/retail conversation unless the story is genuinely retail.",
    "8. Aim for 6-9 turns total.",
    "",
    "── DEMO CONTEXT ──",
    "<<CONTEXT>>",
  ].join("\n");

  // getAgentChatPrompt(context) — context is a string assembled by the
  // caller from company/industry + persona + story acts + business value.
  function getAgentChatPrompt(context) {
    return AGENT_CHAT_PROMPT.replace("<<CONTEXT>>", String(context || "[no context provided]"));
  }

  const PAGE_HELPER = [
    "We pre-fill the SE Inputs below from your project (script, setup fields,",
    "and any extracted foundations). Review or edit them, then Copy the prompt",
    "into ChatGPT/Claude and bring the JSON back with Import Config — or, if",
    "Gemini is configured on the server, click Generate with Gemini to fill",
    "the fields directly.",
  ].join(" ");

  global.HOLO_AI_PROMPT = {
    PROMPT: PROMPT,
    CONFIG_TEMPLATE: CONFIG_TEMPLATE,
    EXAMPLE_INPUTS: EXAMPLE_INPUTS,
    PAGE_HELPER: PAGE_HELPER,
    getFullPrompt: getFullPrompt,
    buildInputsBlock: buildInputsBlock,
    STORY_PARSE_PROMPT: STORY_PARSE_PROMPT,
    getStoryParsePrompt: getStoryParsePrompt,
    PERSONA_COPY_PROMPT: PERSONA_COPY_PROMPT,
    getPersonaCopyPrompt: getPersonaCopyPrompt,
    AGENT_CHAT_PROMPT: AGENT_CHAT_PROMPT,
    getAgentChatPrompt: getAgentChatPrompt,
  };
})(window);
