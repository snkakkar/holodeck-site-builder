// ════════════════════════════════════════════════════════════════
//  STORY VALIDATOR
//  Quality checks for the extracted story + generated slide plan.
//  Returns a list of issues ({severity, code, message, hint}) the
//  builder surfaces in the "Run Story Quality Check" modal and the
//  side panel.
// ════════════════════════════════════════════════════════════════

(function (global) {
  "use strict";

  function validateGeneratedStoryAndSlides(state) {
    const issues = [];
    if (!state) return { issues: issues, summary: { errors: 0, warnings: 0, info: 0 } };

    const f = state.storyFoundations || {};
    const personas = state.personas || [];
    const acts = state.storyActs || [];
    const slides = state.slides || [];
    const cx = state.cxComponents || [];

    // ── Foundations ───────────────────────────────────────────
    if (!f.businessProblem)   issues.push(err("foundation-no-problem",  "Story Foundations are incomplete: no business problem."));
    if (!f.currentStatePain)  issues.push(warn("foundation-no-pain",     "No current-state pain captured. The Intro will feel generic."));
    if (!f.futureStateVision) issues.push(err("foundation-no-vision",    "No future-state vision. Most slides will fall back to placeholder copy."));
    if (!Array.isArray(f.valueDrivers) || f.valueDrivers.length < 3) {
      issues.push(warn("foundation-thin-value",    "Fewer than 3 value drivers. Business Value slides will be light."));
    }

    // ── Personas / acts ───────────────────────────────────────
    if (!personas.length)  issues.push(err("no-personas", "No personas. Meet-the-Persona section can't render."));
    if (acts.length < 5)   issues.push(warn("few-acts", "Fewer than 5 story acts. The journey will feel thin."));

    // ── Slide layout diversity ────────────────────────────────
    const layouts = slides.map(function (s) { return s.layout; });
    const distinctLayouts = uniq(layouts).length;
    if (slides.length >= 4 && distinctLayouts < 3) {
      issues.push(err("repeat-layouts", "Several slides are using the same layout. Regenerate from Story Foundations."));
    }
    const execCount = layouts.filter(function (l) { return l === "executiveSummary"; }).length;
    if (execCount > 2) {
      issues.push(err("too-many-exec", "Several slides are using the same content. Regenerate from Story Foundations.",
                      "More than 2 slides are tagged executiveSummary. Cap at 1–2 (closing takeaway)."));
    }

    // ── Distinct content blocks ───────────────────────────────
    const blockSigs = slides.map(function (s) {
      return (s.contentBlocks || []).join("|") + "::" + (s.title || "");
    });
    const dupCount = blockSigs.length - uniq(blockSigs).length;
    if (dupCount >= 2) issues.push(warn("dup-blocks", dupCount + " slides share identical content blocks."));

    // ── Layout-specific data ──────────────────────────────────
    slides.forEach(function (s) {
      if (s.layout === "journeyTimeline" && !acts.length) {
        issues.push(err("journey-no-acts", "This Journey Map has no journey acts.",
                        "Slide “" + (s.title || "Journey") + "” needs storyActs to render a real timeline."));
      }
      if (s.layout === "unifiedProfile") {
        if (!(f.dataCloudMoments || []).length && !state.scriptText) {
          issues.push(warn("profile-no-signals", "“" + (s.title || "Unified Profile") + "” has no Data Cloud moments to show."));
        }
      }
      if (s.layout === "agentConversation" && !(f.agentforceMoments || []).length) {
        issues.push(err("agent-no-moments", "This Agentforce slide has no agent moments.",
                        "Slide “" + (s.title || "Agent moment") + "” needs at least one Agentforce moment."));
      }
      if (s.layout === "kpiScorecard" && !(f.valueDrivers || []).length) {
        issues.push(warn("kpi-no-drivers", "“" + (s.title || "KPI Scorecard") + "” has no value drivers — KPIs will be generic."));
      }
      if (s.layout === "embeddedCxComponent") {
        const ids = s.linkedCxComponentIds || [];
        const missing = ids.length === 0;
        const hasUrl = ids.some(function (id) {
          return cx.some(function (c) { return c.id === id && c.url; });
        });
        if (missing) issues.push(err("embedded-no-link", "Embedded CX slide is not linked to a CX component.",
                                     "Add an AubreyDemo URL in the CX Components step and link it here."));
        else if (!hasUrl) issues.push(warn("embedded-empty-url", "Linked CX components don't have URLs yet."));
      }
    });

    // ── Section coverage ──────────────────────────────────────
    const sectionIds = uniq(slides.map(function (s) { return s.sectionId || ""; }).filter(Boolean));
    ["intro", "journey-map", "meet-persona", "demo", "business-value"].forEach(function (req) {
      if (sectionIds.indexOf(req) < 0 && slides.length) {
        issues.push(info("section-missing-" + req, "No slides assigned to the " + sectionLabel(req) + " section."));
      }
    });

    // ── Summary counts ────────────────────────────────────────
    const summary = { errors: 0, warnings: 0, info: 0 };
    issues.forEach(function (i) {
      if (i.severity === "error")   summary.errors++;
      else if (i.severity === "warning") summary.warnings++;
      else summary.info++;
    });
    return { issues: issues, summary: summary };
  }

  function sectionLabel(id) {
    return ({ "intro": "Intro", "journey-map": "Journey Map",
              "meet-persona": "Meet the Persona", "demo": "Demo",
              "business-value": "Business Value" })[id] || id;
  }
  function err(code, message, hint)  { return { severity: "error",   code: code, message: message, hint: hint || "" }; }
  function warn(code, message, hint) { return { severity: "warning", code: code, message: message, hint: hint || "" }; }
  function info(code, message, hint) { return { severity: "info",    code: code, message: message, hint: hint || "" }; }
  function uniq(a) { const seen = {}; return a.filter(function (v) { if (seen[v]) return false; seen[v] = true; return true; }); }

  global.HOLO_VALIDATE_STORY = {
    validateGeneratedStoryAndSlides: validateGeneratedStoryAndSlides,
  };
})(window);
