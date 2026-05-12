// ════════════════════════════════════════════════════════════════
//  STORY PARSER
//  Heuristics-based extractor that turns a free-form demo script
//  into structured Story Foundations + Story Acts the builder can
//  feed into recommendations, slides, and previews.
//
//  This parser is deliberately not At-Home-specific. It looks for
//  generic markers ("Script Synopsis:", "Chapter N", "Section -",
//  "Channel -", "Device -", numbered steps) and capability keywords.
//
//  Public API:
//    HOLO_PARSER.parseDemoScript(text)
//    HOLO_PARSER.extractStoryFoundations(text, existingState?)
//    HOLO_PARSER.extractScriptSynopsis(text)
//    HOLO_PARSER.extractCxSummary(text)
//    HOLO_PARSER.extractPersonaDescription(text)
//    HOLO_PARSER.extractJourneySections(text)
//    HOLO_PARSER.extractChannelsAndDevices(text)
//    HOLO_PARSER.extractNumberedSteps(text)
//    HOLO_PARSER.extractStoryActsFromScript(text)
//    HOLO_PARSER.extractCapabilityMoments(text)
//    HOLO_PARSER.extractValueDrivers(text)
//    HOLO_PARSER.extractAssetNeeds(text)
//    HOLO_PARSER.mergeExtractedStoryIntoState(extracted, state)
// ════════════════════════════════════════════════════════════════

(function (global) {
  "use strict";

  // ─── Capability keyword map ───────────────────────────────────
  // Each entry: a label (used for moment phrases) and the regex
  // that flags a sentence as belonging to that capability bucket.
  const CAPABILITY_RULES = [
    { key: "agentforce", label: "Agentforce", re: /\b(agentforce|ai agent|ai assistant|design assistant|service agent|shopper agent|chat agent|conversational|autonomous|topic|action|copilot)\b/i },
    { key: "datacloud",  label: "Data Cloud", re: /\b(data cloud|cdp|unified profile|propensity|first[\s-]party|segment|audience|identity resolution|real[\s-]time signal|browsing history|behavioral data)\b/i },
    { key: "commerce",   label: "Commerce",   re: /\b(commerce|b2c commerce|cart|checkout|product page|storefront|wishlist|product recommendation|cross[\s-]sell|aov|order|sku)\b/i },
    { key: "marketing",  label: "Marketing",  re: /\b(marketing|email|sms|journey|campaign|personalization|mcp|nurture|push notification|imessage|whatsapp|paid media|advertising|instagram|facebook|linkedin|tiktok|ad creative|price drop|re[\s-]engagement|hosting tips|post[\s-]purchase content)\b/i },
    { key: "service",    label: "Service",    re: /\b(service|case|exchange|return|order servicing|support|contact center|handoff|warranty|repair|defect|reorder)\b/i },
    { key: "loyalty",    label: "Loyalty",    re: /\b(loyalty|points|tier|member|rewards|lifetime value|ltv|repeat purchase)\b/i },
    { key: "retail",     label: "Retail",     re: /\b(store|associate|clienteling|in[\s-]store|pos|inventory|aisle|fitting room|kiosk)\b/i },
    { key: "hospitality",label: "Hospitality",re: /\b(guest|booking|reservation|trip|property|concierge|on[\s-]property|pre[\s-]arrival|post[\s-]trip)\b/i },
  ];

  // ─── Channel + device detection ───────────────────────────────
  const CHANNEL_PATTERNS = [
    /\binstagram\b/i, /\bfacebook\b/i, /\blinkedin\b/i, /\btiktok\b/i,
    /\bwebsite\b/i, /\bstorefront\b/i, /\bcommerce\b/i, /\bweb chat\b/i,
    /\bsms\b/i, /\bemail\b/i, /\bimessage\b/i, /\bwhatsapp\b/i,
    /\bin[\s-]store\b/i, /\bpos\b/i, /\bkiosk\b/i,
    /\bmobile app\b/i, /\bphone call\b/i, /\bcontact center\b/i,
    /\bpresentation\b/i,
  ];
  const DEVICE_PATTERNS = [
    /\b(macbook|laptop|desktop)\b/i,
    /\b(iphone|android|phone|mobile)\b/i,
    /\b(ipad|tablet)\b/i,
    /\b(in[\s-]store|kiosk|pos|store)\b/i,
  ];
  const DEVICE_LABELS = ["MacBook", "iPhone", "iPad", "In-store"];

  // ─── Public: parseDemoScript ──────────────────────────────────
  function parseDemoScript(text) {
    const norm = normalizeText(text || "");
    const synopsis = extractScriptSynopsis(norm);
    const cxSummary = extractCxSummary(norm);
    const personaDesc = extractPersonaDescription(norm);
    const journeySections = extractJourneySections(norm);
    const channelDevice = extractChannelsAndDevices(norm);
    const numbered = extractNumberedSteps(norm);
    const acts = extractStoryActsFromScript(norm);
    const capabilityMoments = extractCapabilityMoments(norm);
    const valueDrivers = extractValueDrivers(norm);
    const assetNeeds = extractAssetNeeds(norm);
    return {
      synopsis: synopsis,
      cxSummary: cxSummary,
      personaDescription: personaDesc,
      journeySections: journeySections,
      channels: channelDevice.channels,
      devices: channelDevice.devices,
      numberedSteps: numbered,
      storyActs: acts,
      capabilityMoments: capabilityMoments,
      valueDrivers: valueDrivers,
      assetNeeds: assetNeeds,
    };
  }

  // ─── Top-level: extractStoryFoundations ───────────────────────
  // Returns the foundations object. existingState is optional —
  // when present, we use it to enrich (industry, products, etc.).
  function extractStoryFoundations(text, existingState) {
    if (!text || typeof text !== "string") return blankFoundations();
    const parsed = parseDemoScript(text);
    const f = blankFoundations();

    // ── Narrative & vision ──────────────────────────────────
    f.primaryNarrative = parsed.synopsis || parsed.cxSummary
      || firstNSentences(text, 2);
    f.transformationThesis = parsed.synopsis
      ? distill(parsed.synopsis, "transformation")
      : (parsed.cxSummary ? distill(parsed.cxSummary, "transformation") : "");

    f.businessProblem    = inferBusinessProblem(parsed, text);
    f.currentStatePain   = inferCurrentStatePain(parsed, text);
    f.futureStateVision  = inferFutureStateVision(parsed, text);
    f.executiveTakeaway  = inferExecutiveTakeaway(parsed, text);

    // ── Customer / operational moments ──────────────────────
    f.customerMoments      = uniq(parsed.capabilityMoments.commerce
                                  .concat(parsed.capabilityMoments.marketing)
                                  .concat(parsed.capabilityMoments.retail)
                                  .concat(parsed.capabilityMoments.hospitality)
                                  .concat(parsed.numberedSteps.map(function (s) { return s.summary; })))
                              .filter(Boolean).slice(0, 12);
    f.operationalMoments   = uniq(parsed.capabilityMoments.datacloud
                                  .concat(parsed.numberedSteps.filter(isOperationalNote).map(function (s) { return s.summary; })))
                              .slice(0, 12);

    f.agentforceMoments    = uniq(parsed.capabilityMoments.agentforce).slice(0, 10);
    f.dataCloudMoments     = uniq(parsed.capabilityMoments.datacloud).slice(0, 10);
    f.commerceMoments      = uniq(parsed.capabilityMoments.commerce).slice(0, 10);
    f.marketingMoments     = uniq(parsed.capabilityMoments.marketing).slice(0, 10);
    f.serviceMoments       = uniq(parsed.capabilityMoments.service).slice(0, 10);
    f.loyaltyMoments       = uniq(parsed.capabilityMoments.loyalty).slice(0, 10);

    f.valueDrivers         = parsed.valueDrivers.length
      ? parsed.valueDrivers.slice(0, 8)
      : defaultValueDrivers(parsed, existingState);

    f.assumptions          = collectAssumptions(parsed, text);
    f.openQuestions        = collectOpenQuestions(text);

    return f;
  }

  function blankFoundations() {
    return {
      businessProblem: "", currentStatePain: "", futureStateVision: "",
      primaryNarrative: "", transformationThesis: "", executiveTakeaway: "",
      customerMoments: [], operationalMoments: [],
      agentforceMoments: [], dataCloudMoments: [],
      commerceMoments: [], marketingMoments: [],
      serviceMoments: [], loyaltyMoments: [],
      valueDrivers: [], assumptions: [], openQuestions: [],
    };
  }

  // ─── Section extractors ───────────────────────────────────────
  function extractScriptSynopsis(text)    { return blockAfter(text, /script\s*synopsis\s*:?/i); }
  function extractCxSummary(text)         { return blockAfter(text, /cx\s*summary\s*:?/i); }
  function extractPersonaDescription(text){ return blockAfter(text, /persona\s*description\s*:?/i); }

  // Pulls the lines after a header until the next header / blank gap.
  function blockAfter(text, headerRe) {
    if (!text) return "";
    const lines = String(text).split(/\r?\n/);
    let start = -1;
    for (let i = 0; i < lines.length; i++) {
      if (headerRe.test(lines[i].trim())) {
        // Same-line content?
        const inline = lines[i].replace(headerRe, "").trim();
        if (inline) return cleanBlock([inline].concat(lines.slice(i + 1, i + 6)).join(" "));
        start = i + 1; break;
      }
    }
    if (start < 0) return "";
    const collected = [];
    for (let j = start; j < lines.length; j++) {
      const l = lines[j].trim();
      if (!l) { if (collected.length) break; continue; }
      // Stop at the next header-ish line ("Word:" or "Chapter N" or "Section -")
      if (/^(chapter\s+\d|section\s*-|channel\s*-|device\s*-)/i.test(l)) break;
      if (/^[a-z][\w \-/]{0,48}:\s*$/i.test(l) && !/^talk track:/i.test(l)) break;
      collected.push(l);
      if (collected.join(" ").length > 800) break;
    }
    return cleanBlock(collected.join(" "));
  }

  // ─── Journey sections (Chapter / Section / phase) ─────────────
  // A journey section maps to a "phase" used downstream when
  // grouping acts.
  function extractJourneySections(text) {
    const lines = String(text || "").split(/\r?\n/);
    const out = [];
    let chapter = null;
    lines.forEach(function (raw) {
      const l = raw.trim();
      const chapM = l.match(/^chapter\s+(\d+)\s*[—:\-]?\s*(.*)$/i);
      if (chapM) {
        chapter = { chapter: chapM[2].trim() || ("Chapter " + chapM[1]), sections: [] };
        out.push(chapter);
        return;
      }
      const secM = l.match(/^section\s*[-–]\s*(.*)$/i);
      if (secM && chapter) chapter.sections.push(secM[1].trim());
      else if (secM && !chapter) {
        chapter = { chapter: "", sections: [secM[1].trim()] };
        out.push(chapter);
      }
    });
    return out;
  }

  // ─── Channels and devices ─────────────────────────────────────
  function extractChannelsAndDevices(text) {
    const lines = String(text || "").split(/\r?\n/);
    const channels = [];
    const devices  = [];
    lines.forEach(function (raw) {
      const l = raw.trim();
      let m;
      if ((m = l.match(/^channel\s*[-–:]\s*(.*)$/i))) channels.push(m[1].trim());
      if ((m = l.match(/^device\s*[-–:]\s*(.*)$/i)))  devices.push(m[1].trim());
    });
    // Plus a global sweep so we still find channels mentioned inline
    const lower = (text || "").toLowerCase();
    CHANNEL_PATTERNS.forEach(function (p) {
      const m = lower.match(p);
      if (m) channels.push(titleCase(m[0]));
    });
    return { channels: uniq(channels.map(titleCase)), devices: uniq(devices.map(titleCase)) };
  }

  // ─── Numbered steps ───────────────────────────────────────────
  // Returns one entry per numbered step. Multi-line steps are
  // joined. Talk-track and Notes lines following a step are folded
  // into that step's summary/notes.
  function extractNumberedSteps(text) {
    const lines = String(text || "").split(/\r?\n/);
    const out = [];
    let cur = null;
    function push() { if (cur && cur.summary) out.push(cur); cur = null; }

    // Track the most recent Channel - / Device - so each step gets
    // the right context.
    let curChannel = "", curDevice = "";

    lines.forEach(function (raw) {
      const l = raw.trim();
      let m;
      if ((m = l.match(/^channel\s*[-–:]\s*(.*)$/i))) curChannel = m[1].trim();
      if ((m = l.match(/^device\s*[-–:]\s*(.*)$/i)))  curDevice  = m[1].trim();

      const stepM = l.match(/^(\d+)[.)]\s+(.*)$/);
      if (stepM) {
        push();
        cur = { number: Number(stepM[1]), summary: stepM[2].trim(), notes: "",
                channel: curChannel, device: curDevice };
        return;
      }
      if (!cur) return;

      const noteM = l.match(/^notes?\s*:\s*(.*)$/i);
      if (noteM) { cur.notes = (cur.notes ? cur.notes + " " : "") + noteM[1].trim(); return; }
      const talkM = l.match(/^talk\s*track\s*:\s*(.*)$/i);
      if (talkM) { cur.summary = (cur.summary ? cur.summary + " " : "") + talkM[1].trim(); return; }

      // A blank or another "header" line ends the step
      if (!l || /^(chapter\s+\d|section\s*-|channel\s*-|device\s*-)/i.test(l)) { push(); return; }
      // Continuation
      cur.summary = (cur.summary + " " + l).replace(/\s+/g, " ").trim();
    });
    push();

    // Filter out crossed-out / strikethrough rows ("~~text~~") and "DEPRECATED"
    return out.filter(function (s) {
      if (/^~~.*~~$/.test(s.summary)) return false;
      if (/\bdeprecated\b/i.test(s.summary)) return false;
      return s.summary.length > 4;
    });
  }

  // ─── Story acts ──────────────────────────────────────────────
  // We treat every numbered step that introduces a customer/demo
  // moment as an act, but we collapse adjacent steps that share a
  // section so a multi-step "AI Design Assistant" beat doesn't
  // explode into 4 acts.
  function extractStoryActsFromScript(text) {
    const steps = extractNumberedSteps(text);
    const sections = annotateStepsWithSections(text, steps);
    const grouped = groupStepsBySection(sections);
    return grouped.map(function (g, i) {
      const first = g.steps[0] || {};
      const summary = uniq(g.steps.map(function (s) { return s.summary; })).join(" ");
      const notes = uniq(g.steps.map(function (s) { return s.notes; })).filter(Boolean).join(" • ");
      const channel = first.channel || g.channel || "";
      const device  = first.device  || g.device  || "";
      const caps = capabilityLabelsFor(summary + " " + notes);
      return {
        order: i,
        title: g.title || first.summary && firstSentence(first.summary, 8) || ("Act " + (i + 1)),
        chapter: g.chapter || "",
        section: g.section || "",
        persona: "",
        channel: channel,
        device: device,
        summary: summary,
        demoMoment: first.summary || "",
        salesforceCapabilities: caps.join(", "),
        businessValue: extractBusinessValueFromSummary(summary),
        requiredAssets: extractAssetHintsFromSummary(summary),
        notes: notes,
      };
    });
  }

  function annotateStepsWithSections(text, steps) {
    const lines = String(text || "").split(/\r?\n/);
    let chapter = "", section = "", channel = "", device = "";
    const stepsByLine = {};
    let stepIdx = 0;
    lines.forEach(function (raw, lineIdx) {
      const l = raw.trim();
      let m;
      if ((m = l.match(/^chapter\s+\d+\s*[—:\-]?\s*(.*)$/i))) { chapter = m[1].trim() || chapter; return; }
      if ((m = l.match(/^section\s*[-–:]\s*(.*)$/i)))         { section = m[1].trim(); return; }
      if ((m = l.match(/^channel\s*[-–:]\s*(.*)$/i)))         { channel = m[1].trim(); return; }
      if ((m = l.match(/^device\s*[-–:]\s*(.*)$/i)))          { device  = m[1].trim(); return; }
      if (/^\d+[.)]\s+/.test(l) && stepIdx < steps.length) {
        steps[stepIdx]._chapter = chapter;
        steps[stepIdx]._section = section;
        steps[stepIdx].channel = steps[stepIdx].channel || channel;
        steps[stepIdx].device  = steps[stepIdx].device  || device;
        stepIdx++;
      }
    });
    return steps;
  }

  function groupStepsBySection(steps) {
    const out = [];
    let cur = null;
    steps.forEach(function (s) {
      const sectionKey = (s._section || "") + "|" + (s._chapter || "");
      if (!cur || cur._key !== sectionKey) {
        cur = {
          _key: sectionKey,
          chapter: s._chapter || "",
          section: s._section || "",
          channel: s.channel || "",
          device:  s.device  || "",
          steps: [],
          title: s._section || s._chapter || "",
        };
        out.push(cur);
      }
      cur.steps.push(s);
    });
    return out;
  }

  function capabilityLabelsFor(text) {
    const out = [];
    CAPABILITY_RULES.forEach(function (r) { if (r.re.test(text || "")) out.push(r.label); });
    return uniq(out);
  }

  // ─── Capability moments ──────────────────────────────────────
  // For each capability bucket, we walk every sentence and pick the
  // ones that contain at least one matching keyword. We then phrase
  // them as compact moment strings.
  function extractCapabilityMoments(text) {
    const sentences = sentenceSplit(text || "");
    const buckets = { agentforce: [], datacloud: [], commerce: [], marketing: [], service: [], loyalty: [], retail: [], hospitality: [] };
    sentences.forEach(function (s) {
      CAPABILITY_RULES.forEach(function (r) {
        if (r.re.test(s)) buckets[r.key].push(toMomentPhrase(s));
      });
    });
    Object.keys(buckets).forEach(function (k) { buckets[k] = uniq(buckets[k]).slice(0, 12); });
    return buckets;
  }

  // Trims a sentence into a moment phrase: drops persona names down
  // to "the customer" feel, caps at ~120 chars, removes "talk track:"
  // prefixes.
  function toMomentPhrase(sentence) {
    let s = String(sentence || "").trim();
    s = s.replace(/^talk\s*track\s*:\s*/i, "");
    s = s.replace(/^notes?\s*:\s*/i, "");
    s = s.replace(/^\d+[.)]\s+/, "");
    s = s.replace(/\s+/g, " ");
    if (s.length > 140) s = s.slice(0, 137).replace(/\s+\S*$/, "") + "…";
    return s;
  }

  // ─── Value drivers ───────────────────────────────────────────
  function extractValueDrivers(text) {
    const lines = String(text || "").split(/\r?\n/);
    const out = [];
    const vdRe = /(higher|increased|improved|reduced|faster|connected|consistent|better|more)\s+([\w\-/]+(?:\s+[\w\-/]+){0,5})/i;
    let inValueBlock = false;
    lines.forEach(function (raw) {
      const l = raw.trim();
      if (/^business\s+value\s*:?$/i.test(l)) { inValueBlock = true; return; }
      if (!l) { if (inValueBlock && out.length) inValueBlock = false; return; }
      if (inValueBlock) {
        out.push(stripPunct(l));
        return;
      }
      const m = l.match(vdRe);
      if (m && /(conversion|aov|order value|loyalty|lifetime|ltv|service|retention|productivity|engagement|friction|consistency)/i.test(l)) {
        out.push(stripPunct(l));
      }
    });
    return uniq(out).filter(function (s) { return s.length > 8 && s.length < 240; }).slice(0, 8);
  }

  // ─── Asset needs ─────────────────────────────────────────────
  function extractAssetNeeds(text) {
    const refs = [];
    const lines = String(text || "").split(/\r?\n/);
    lines.forEach(function (raw) {
      const l = raw.trim();
      if (/scene|screen|mockup|gif|video|image|asset/i.test(l)) {
        refs.push(stripPunct(l).slice(0, 160));
      }
    });
    return uniq(refs).slice(0, 12);
  }

  // ─── Heuristic inferences ────────────────────────────────────
  function inferBusinessProblem(parsed, fullText) {
    // 1. CX Summary's first 1–2 sentences if present
    const cx = parsed.cxSummary || "";
    const summary = parsed.synopsis || "";
    let candidate = "";
    if (cx) candidate = firstNSentences(cx, 2);
    else if (summary) candidate = firstNSentences(summary, 2);
    if (!candidate) {
      // 3. Reach for a sentence with "fragmented", "disconnected", "siloed"
      const m = fullText.match(/[^.!?\n]*\b(fragmented|disconnected|siloed|inconsistent|legacy|manual)\b[^.!?\n]*[.!?]/i);
      if (m) candidate = m[0].trim();
    }
    if (candidate) return cleanBlock(candidate);
    // Last resort: synthesize from caps
    const caps = parsed.capabilityMoments;
    if (caps.commerce.length || caps.marketing.length) {
      return "Disconnected shopper interactions across advertising, commerce, messaging, and service make it hard to turn intent into conversion and loyalty.";
    }
    return "";
  }

  function inferCurrentStatePain(parsed, fullText) {
    const m = fullText.match(/[^.!?\n]*\b(abandon|drop[\s-]off|hesitation|considered purchase|miss|disconnected|generic|manual|repeat themselves|start over)\b[^.!?\n]*[.!?]/i);
    if (m) return cleanBlock(m[0]);
    if (parsed.cxSummary) {
      // Try to find pain implicit in second sentence
      const s = sentenceSplit(parsed.cxSummary);
      if (s[1]) return cleanBlock(s[1]);
    }
    return "";
  }

  function inferFutureStateVision(parsed, fullText) {
    if (parsed.cxSummary) return cleanBlock(parsed.cxSummary);
    if (parsed.synopsis)  return cleanBlock(parsed.synopsis);
    const m = fullText.match(/[^.!?\n]*\b(connected|unified|personalized|agentic|orchestrate|seamless|recognize)\b[^.!?\n]*[.!?]/i);
    if (m) return cleanBlock(m[0]);
    return "";
  }

  function inferExecutiveTakeaway(parsed, fullText) {
    // Find a closing/value statement
    const close = fullText.match(/(connected[^.!?\n]+(?:conversion|aov|loyalty|lifetime)[^.!?\n]*[.!?])/i)
              || fullText.match(/(higher\s+conversion[^.!?\n]*[.!?])/i);
    if (close) return cleanBlock(close[0]);
    if (parsed.synopsis) {
      const s = sentenceSplit(parsed.synopsis);
      return cleanBlock(s[s.length - 1] || s[0] || "");
    }
    return "";
  }

  function defaultValueDrivers(parsed, state) {
    const out = [];
    if (parsed.capabilityMoments.commerce.length)   out.push("Higher conversion through timely re-engagement");
    if (parsed.capabilityMoments.commerce.length)   out.push("Increased average order value through AI-assisted cross-sell");
    if (parsed.capabilityMoments.loyalty.length || parsed.capabilityMoments.marketing.length) out.push("Improved loyalty and lifetime value through personalized follow-up");
    if (parsed.capabilityMoments.service.length)    out.push("Reduced service friction through automated order servicing");
    out.push("More consistent customer experience across digital and physical channels");
    return uniq(out).slice(0, 6);
  }

  function isOperationalNote(step) {
    return /\b(data cloud|propensity|signal|trigger|automation|orchestrat|grounding|grounds answers|product information)\b/i.test(step.summary + " " + step.notes);
  }

  function collectAssumptions(parsed, fullText) {
    const out = [];
    if (/\bmcp\b/i.test(fullText) && !/multi-channel personalization|marketing cloud personalization/i.test(fullText)) {
      out.push("The script references MCP; preserve this term but do not invent implementation details unless provided.");
    }
    if (/loyalty/i.test(fullText) && !/loyalty management|tier|points/i.test(fullText)) {
      out.push("The script references loyalty participation, but exact loyalty program mechanics are not specified.");
    }
    return out;
  }

  function collectOpenQuestions(text) {
    const lines = String(text || "").split(/\r?\n/);
    const out = [];
    let inBlock = false;
    lines.forEach(function (raw) {
      const l = raw.trim();
      if (/^open\s+questions?\s*:?$/i.test(l)) { inBlock = true; return; }
      if (inBlock) {
        if (!l) { inBlock = false; return; }
        out.push(stripPunct(l));
      }
    });
    // Plus any sentence that ends with "?"
    const qs = String(text || "").match(/[^.!?\n]*\?\s*/g) || [];
    qs.forEach(function (q) { if (q.trim().length > 12) out.push(q.trim()); });
    return uniq(out).slice(0, 8);
  }

  // ─── Normalize a parsed packet into builder state ────────────
  function mergeExtractedStoryIntoState(extracted, state) {
    if (!extracted || !state) return state;
    state.story = state.story || {};
    state.story.bigProblem        = state.story.bigProblem        || extracted.businessProblem;
    state.story.currentPain       = state.story.currentPain       || extracted.currentStatePain;
    state.story.futureVision      = state.story.futureVision      || extracted.futureStateVision;
    state.story.executiveTakeaway = state.story.executiveTakeaway || extracted.executiveTakeaway;
    state.story.agentforceMoments = state.story.agentforceMoments || extracted.agentforceMoments.join("; ");
    state.story.dataCloudMoments  = state.story.dataCloudMoments  || extracted.dataCloudMoments.join("; ");
    state.story.businessValueMoments = state.story.businessValueMoments || extracted.valueDrivers.join("; ");
    state.story.keyCustomerMoments   = state.story.keyCustomerMoments   || extracted.customerMoments.slice(0, 6).join("; ");
    state.story.operationalMoments   = state.story.operationalMoments   || extracted.operationalMoments.slice(0, 6).join("; ");
    state.storyFoundations = extracted;
    return state;
  }

  // ─── String helpers ──────────────────────────────────────────
  function normalizeText(t) {
    return String(t || "")
      .replace(/ /g, " ")
      .replace(/[‘’]/g, "'")
      .replace(/[“”]/g, '"')
      .replace(/\r\n/g, "\n");
  }
  function uniq(arr) {
    const seen = {};
    return arr.filter(function (v) {
      const key = String(v || "").trim().toLowerCase();
      if (!key || seen[key]) return false;
      seen[key] = true; return true;
    });
  }
  function cleanBlock(s) {
    return String(s || "").replace(/\s+/g, " ").trim();
  }
  function sentenceSplit(t) {
    if (!t) return [];
    return String(t).split(/(?<=[.!?])\s+(?=[A-Z0-9])/g)
      .map(function (s) { return s.trim(); })
      .filter(Boolean);
  }
  function firstNSentences(t, n) {
    return sentenceSplit(t).slice(0, n).join(" ").trim();
  }
  function firstSentence(t, maxWords) {
    const s = sentenceSplit(t)[0] || "";
    if (!maxWords) return s;
    const words = s.split(/\s+/);
    if (words.length <= maxWords) return s;
    return words.slice(0, maxWords).join(" ") + "…";
  }
  function stripPunct(s) {
    return String(s || "").replace(/^[\s•\-–—*\.]+/, "").trim();
  }
  function titleCase(s) {
    s = String(s || "").trim();
    if (!s) return "";
    return s.replace(/\w\S*/g, function (w) {
      return w.charAt(0).toUpperCase() + w.slice(1);
    });
  }
  function distill(s, kind) {
    const sentences = sentenceSplit(s);
    if (!sentences.length) return "";
    if (kind === "transformation") {
      // Look for the sentence with "from … to …" or "leverages … to …"
      const m = sentences.find(function (x) { return /\b(from|leverages?|use[sd]?|connect[s]?|combines?)\b.*\bto\b/i.test(x); });
      if (m) return cleanBlock(m);
    }
    return cleanBlock(sentences[sentences.length - 1] || sentences[0]);
  }

  function extractBusinessValueFromSummary(s) {
    const m = String(s || "").match(/(higher|increased|improved|reduced|connected|consistent|faster)\s+\w+(?:\s+\w+){0,4}/i);
    return m ? cleanBlock(m[0]) : "";
  }
  function extractAssetHintsFromSummary(s) {
    const out = [];
    const re = /(scene|screen|gif|mockup|asset|hero banner|product page|chat window|return label|order confirmation|exchange flow)/ig;
    let m; while ((m = re.exec(s || ""))) out.push(m[0].toLowerCase());
    return uniq(out).join(", ");
  }

  // ─── Public API ──────────────────────────────────────────────
  global.HOLO_PARSER = {
    parseDemoScript: parseDemoScript,
    extractStoryFoundations: extractStoryFoundations,
    extractScriptSynopsis: extractScriptSynopsis,
    extractCxSummary: extractCxSummary,
    extractPersonaDescription: extractPersonaDescription,
    extractJourneySections: extractJourneySections,
    extractChannelsAndDevices: extractChannelsAndDevices,
    extractNumberedSteps: extractNumberedSteps,
    extractStoryActsFromScript: extractStoryActsFromScript,
    extractCapabilityMoments: extractCapabilityMoments,
    extractValueDrivers: extractValueDrivers,
    extractAssetNeeds: extractAssetNeeds,
    mergeExtractedStoryIntoState: mergeExtractedStoryIntoState,
    blankFoundations: blankFoundations,
    CAPABILITY_RULES: CAPABILITY_RULES,
  };
})(window);
