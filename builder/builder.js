// ════════════════════════════════════════════════════════════════
//  HOLODECK BUILDER — main app shell
//  Routes between three top-level views:
//    • home     — projects dashboard (project-home.js)
//    • builder  — the 5-step authoring flow (this file)
//    • aiPrompt — copyable ChatGPT/Claude prompt (this file)
//
//  State lives in localStorage via project-store.js. Imports are
//  parsed + normalized by import-validator.js. Recommendation logic
//  comes from recommendation-rules.js. Wireframes from preview-renderer.js.
//  Exports from config-generator.js.
// ════════════════════════════════════════════════════════════════

(function () {
  "use strict";

  const RULES     = window.HOLO_RULES;
  const PREVIEW   = window.HOLO_PREVIEW;
  const CONFIG    = window.HOLO_CONFIG;
  const STORE     = window.HOLO_STORE;
  const HOME      = window.HOLO_HOME;
  const VALIDATOR = window.HOLO_VALIDATOR;
  const AI_PROMPT = window.HOLO_AI_PROMPT;
  const PARSER    = window.HOLO_PARSER;
  const VALIDATE_STORY = window.HOLO_VALIDATE_STORY;
  const ZIP       = window.HOLO_ZIP;
  const AUBREY    = window.HOLO_AUBREY;
  const AUTH      = window.HOLO_AUTH;

  // ─── App-level constants ──────────────────────────────────────
  // 8-step guided flow. Story used to be one step doing three things
  // (paste, foundations, regenerate). Splitting it into Script /
  // Foundations / Narrative makes each user decision its own surface
  // with one obvious next action.
  const STEPS = [
    { id: "connect",     num: "1",  label: "Connect Aubrey",        help: "Add API keys (optional) to pull content directly" },
    { id: "script",      num: "2",  label: "Script & Story",        help: "Pull from Aubrey or paste/upload your demo script" },
    { id: "setup",       num: "3",  label: "Setup",                 help: "Customer, audience, products" },
    { id: "foundations", num: "4",  label: "Story Foundations",     help: "Review what was extracted" },
    { id: "recs",        num: "5",  label: "Slide Selection",       help: "Customize the slide plan by section" },
    { id: "cx",          num: "6",  label: "CX Components",         help: "Embed live AubreyDemo screens (optional)" },
    { id: "assets",      num: "7",  label: "Assets",                help: "Upload images for the slides you selected (optional)" },
    { id: "preview",     num: "8",  label: "Preview",               help: "Review the full demo before exporting" },
    { id: "export",      num: "9",  label: "Export",                help: "Download the complete demo ZIP" },
  ];
  const INDUSTRIES = ["Retail","Consumer Goods","Hospitality","Travel","Financial Services","Healthcare","Other"];
  const AUDIENCES  = ["Executive","IT","Marketing","Sales","Service","Store Ops","Field Ops","Mixed"];
  const STAGES     = ["Vision","Discovery","Technical Validation","Executive Readout","RFP / POV"];
  const PRODUCTS   = ["Data Cloud","Agentforce","Sales Cloud","Service Cloud","Marketing Cloud","Commerce","Loyalty","MuleSoft","Tableau"];
  const TONES      = ["Executive","Tactical","Visionary","Technical","Playful","Premium"];

  // ─── Top-level app state ──────────────────────────────────────
  // view: which top-level page is showing.
  // state: the active project (only meaningful when view === "builder").
  const app = {
    view: "home",
    state: null,
    previewMode: "expanded",       // "compact" | "expanded"
    previewGrouping: "by-section", // "by-section" | "flat"
  };

  // ─── DOM helpers ──────────────────────────────────────────────
  function $(sel, root) { return (root || document).querySelector(sel); }
  function el(tag, attrs, children) {
    const node = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === "class") node.className = attrs[k];
      else if (k === "html") node.innerHTML = attrs[k];
      else if (k === "text") node.textContent = attrs[k];
      else if (k === "on") {
        Object.keys(attrs[k]).forEach(function (ev) { node.addEventListener(ev, attrs[k][ev]); });
      }
      else if (k === "checked" || k === "disabled" || k === "selected") {
        if (attrs[k]) node.setAttribute(k, k);
      }
      else node.setAttribute(k, attrs[k]);
    });
    (children || []).forEach(function (c) {
      if (c == null || c === false) return;
      node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    });
    return node;
  }
  function uid(prefix) { return STORE.uid(prefix); }
  function toast(msg) {
    const t = $("#bxToast");
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toast._timer);
    toast._timer = setTimeout(function () { t.hidden = true; }, 2400);
  }

  // ─── Persistence ──────────────────────────────────────────────
  function saveActive() {
    if (app.view !== "builder" || !app.state) return Promise.resolve();
    // The store writes the local cache synchronously inside saveProject,
    // so the indicator can flip to "Autosaved" immediately; the returned
    // Promise resolves when the Neon write-through completes (or falls
    // back to the dirty queue). Callers that tear down state await it.
    const p = STORE.saveProject(app.state);
    setSaveIndicator(false);
    return p;
  }
  let saveTimer = null;
  function commit() {
    setSaveIndicator(true);
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveActive, 250);
  }
  function setSaveIndicator(dirty) {
    const elIndicator = $("#bxSaveIndicator");
    if (!elIndicator) return;
    if (app.view !== "builder") {
      elIndicator.style.visibility = "hidden";
      return;
    }
    elIndicator.style.visibility = "";
    if (dirty) { elIndicator.classList.add("is-dirty"); elIndicator.textContent = "Saving…"; }
    else       { elIndicator.classList.remove("is-dirty"); elIndicator.textContent = "Autosaved"; }
  }

  // ─── Navigation between views ─────────────────────────────────
  function goHome() {
    // Save BEFORE tearing down state. The cache write is synchronous so
    // data is safe instantly; we still chain so a slow Neon write can't
    // be cancelled by the teardown.
    const save = (app.view === "builder" && app.state) ? saveActive() : Promise.resolve();
    save.then(function () {
      app.view = "home";
      app.state = null;
      STORE.setActiveProjectId(null);
      render();
    });
  }
  function goBuilder(projectId) {
    STORE.loadProject(projectId).then(function (state) {
      if (!state) {
        STORE.reconcile();
        toast("That project couldn't be opened.");
        goHome();
        return;
      }
      app.state = state;
      app.view = "builder";
      STORE.setActiveProjectId(projectId);
      recompute();
      render();
    });
  }
  function goAiPrompt() {
    const save = (app.view === "builder" && app.state) ? saveActive() : Promise.resolve();
    save.then(function () {
      app.view = "aiPrompt";
      render();
    });
  }
  function newProject() {
    STORE.createProject({}).then(function (state) {
      app.state = state;
      app.view = "builder";
      STORE.setActiveProjectId(state.id);
      recompute();
      render();
    });
  }

  // ─── Top-level render ─────────────────────────────────────────
  function render() {
    renderTopbar();
    renderShell();
  }

  function renderTopbar() {
    const left  = $("#bxTopbarLeft");
    const right = $("#bxTopbarActions");
    left.innerHTML = "";
    right.innerHTML = "";

    // Mark
    left.appendChild(el("div", { class: "bx-mark" }, [
      el("span", { class: "bx-mark-h", text: "Holodeck" }),
      el("span", { class: "bx-mark-sub", text: "Builder · Salesforce SE Workspace" }),
    ]));

    // Crumb when inside a project
    if (app.view === "builder" && app.state) {
      const sep = el("div", { class: "bx-crumb-sep", text: "/" });
      const crumb = el("button", { class: "bx-crumb",
        on: { click: function () { goHome(); } },
        title: "Back to projects" }, [
        el("span", { class: "bx-crumb-back", text: "← Projects" }),
      ]);
      const projLabel = el("div", { class: "bx-crumb-active" }, [
        el("span", { class: "bx-crumb-name", text: app.state.name || "Untitled" }),
        app.state.project && app.state.project.customerName
          ? el("span", { class: "bx-crumb-customer", text: app.state.project.customerName })
          : null,
      ]);
      left.appendChild(crumb);
      left.appendChild(sep);
      left.appendChild(projLabel);
    }

    // Right-side nav
    [
      ["home",     "Home",      function () { goHome(); }],
    ].forEach(function (n) {
      const isActive = (app.view === n[0]);
      right.appendChild(el("button", {
        class: "bx-nav-link" + (isActive ? " is-active" : ""),
        text: n[1],
        on: { click: n[2] },
      }));
    });

    if (app.view === "home" || app.view === "builder") {
      // Aubrey keys live in localStorage, not in project state.
      // The topbar button is the canonical, always-visible entry
      // point for managing them so the user can swap keys mid-build
      // without navigating back to Step 1.
      const aubreyBtn = aubreyKeysTopbarButton();
      if (aubreyBtn) right.appendChild(aubreyBtn);
    }

    if (app.view === "builder") {
      right.appendChild(actionBtn("Import", "bx-btn-ghost", function () { openImportModal(app.state.id); }));
      right.appendChild(actionBtn("Save", "bx-btn-secondary", function () { saveActive().then(function () { toast("Saved"); }); }));
      right.appendChild(actionBtn("Export", "bx-btn-primary", function () { openExportModal(); }));
    }

    // Sign-out is always available once authenticated (any non-login view).
    if (AUTH && AUTH.isAuthed() && app.view !== "login") {
      const u = AUTH.currentUser();
      if (u && u.email) {
        right.appendChild(el("span", { class: "bx-nav-user", title: u.email,
          text: u.email, style: "opacity:.7;font-size:12px;align-self:center;margin:0 4px;" }));
      }
      right.appendChild(actionBtn("Sign out", "bx-btn-ghost", function () { signOut(); }));
    }
  }

  function actionBtn(label, klass, onClick) {
    const b = el("button", { class: "bx-btn " + klass, text: label });
    b.addEventListener("click", onClick);
    return b;
  }

  function renderShell() {
    const shell = $("#bxShell");
    shell.innerHTML = "";

    // Always strip the quality footer first; only the builder view re-adds it.
    const stale = $("#bxQualityFooter");
    if (stale && stale.parentNode) stale.parentNode.removeChild(stale);

    if (app.view === "login") {
      shell.classList.add("is-single");
      const wrap = el("section", { class: "bx-page", id: "bxPage" });
      shell.appendChild(wrap);
      renderLoginPage(wrap);
      setSaveIndicator(false);
      return;
    }

    if (app.view === "home") {
      shell.classList.add("is-single");
      const wrap = el("section", { class: "bx-page", id: "bxPage" });
      shell.appendChild(wrap);
      HOME.render(wrap, {
        onOpen:      function (id) { goBuilder(id); },
        onNew:       function () { openNewProjectChooser(); },
        onImport:    function () { openImportModal(null); },
        onAiPrompt:  function () { goAiPrompt(); },
        onDuplicate: function (id, done) { STORE.duplicateProject(id).then(function () { done && done(); toast("Duplicated"); }); },
        onRename:    function (id, name, done) { STORE.renameProject(id, name).then(function () { done && done(); toast("Renamed"); }); },
        onDelete:    function (id, done) { STORE.deleteProject(id).then(function () { done && done(); toast("Deleted"); }); },
      });
      setSaveIndicator(false);
      return;
    }

    if (app.view === "aiPrompt") {
      shell.classList.add("is-single");
      const wrap = el("section", { class: "bx-page", id: "bxPage" });
      shell.appendChild(wrap);
      renderAiPromptPage(wrap);
      setSaveIndicator(false);
      return;
    }

    // Builder: stepper | main | side
    shell.classList.remove("is-single");
    const stepper = el("aside", { class: "bx-stepper" }, [
      el("ol", { class: "bx-step-list", id: "bxStepList" }),
      el("div", { class: "bx-stepper-foot" }, [
        el("div", { class: "bx-save-indicator", id: "bxSaveIndicator", text: "Autosaved" }),
        el("div", { class: "bx-help",
          html: "Built for non-technical SEs.<br/>Inputs save locally per project." }),
      ]),
    ]);
    const main = el("section", { class: "bx-main", id: "bxMain" });
    const side = el("aside", { class: "bx-side", id: "bxSide" }, [
      el("div", { class: "bx-side-head" }, [
        el("div", { class: "bx-side-title", id: "bxSideTitle", text: "Live Suggestions" }),
        el("div", { class: "bx-side-sub", id: "bxSideSub", text: "" }),
      ]),
      el("div", { class: "bx-side-body", id: "bxSideBody" }),
    ]);
    shell.appendChild(stepper); shell.appendChild(main); shell.appendChild(side);
    renderStepper(); renderMain(); renderSide();
    setSaveIndicator(false);

    // Persistent Quality Check strip — always visible while in the
    // builder so SEs see issues before reaching the export step.
    renderQualityFooter(shell);
  }

  function renderQualityFooter(shell) {
    if (!VALIDATE_STORY || !app.state) return;
    const result = VALIDATE_STORY.validateGeneratedStoryAndSlides(app.state);
    const { errors = 0, warnings = 0 } = result.summary || {};
    // Don't add the footer twice across re-renders.
    const existing = $("#bxQualityFooter");
    if (existing && existing.parentNode) existing.parentNode.removeChild(existing);

    const footer = el("button", {
      id: "bxQualityFooter",
      class: "bx-quality-footer" + (errors ? " has-errors" : warnings ? " has-warnings" : " is-clean"),
      "aria-label": "Open Story Quality Check",
    });
    const tone = errors ? "tone-red" : (warnings ? "tone-gold" : "tone-good");
    const dot  = el("span", { class: "bx-quality-dot " + tone });
    const text = errors  ? errors + " issue" + (errors === 1 ? "" : "s") + " to fix"
               : warnings? warnings + " warning" + (warnings === 1 ? "" : "s")
                         : "Story looks healthy";
    footer.appendChild(dot);
    footer.appendChild(el("span", { class: "bx-quality-text", text: text }));
    footer.appendChild(el("span", { class: "bx-quality-cta", text: "Run Story Quality Check →" }));
    footer.addEventListener("click", function () { openStoryQualityModal(); });
    document.body.appendChild(footer);
  }

  // ─── BUILDER: stepper ─────────────────────────────────────────
  function renderStepper() {
    const list = $("#bxStepList");
    list.innerHTML = "";
    STEPS.forEach(function (s) {
      const isActive = s.id === app.state.step;
      const status = stepStatus(s.id);
      const isLocked = status.state === "locked";
      const cls = "bx-step bx-step-" + status.state +
                  (isActive ? " is-active" : "") +
                  (isLocked ? " is-locked" : "");
      const li = el("li", {
        class: cls,
        "aria-current": isActive ? "step" : undefined,
        on: {
          click: function () {
            if (isLocked) {
              toast(status.lockReason || "Complete the previous step first");
              return;
            }
            app.state.step = s.id;
            renderShell();
            commit();
          },
        },
      }, [
        el("div", { class: "bx-step-num " + status.numClass, text: status.numText || s.num }),
        el("div", { class: "bx-step-meta" }, [
          el("div", { class: "bx-step-label", text: s.label }),
          el("div", { class: "bx-step-help", text: s.help }),
          el("div", { class: "bx-step-status bx-step-status-" + status.state, text: status.label }),
        ]),
      ]);
      list.appendChild(li);
    });
  }

  // ─── Step status engine ───────────────────────────────────────
  // Returns { state, label, numText, numClass, lockReason }
  // Possible states: not-started | needs-input | ready | generated
  //                  | review-needed | complete | optional | locked
  function stepStatus(id) {
    const s = app.state;
    if (!s) return { state: "not-started", label: "Not started" };

    const setupReady = !!(s.project.customerName && s.project.industry && s.project.audience && s.project.salesStage && (s.project.products || []).length);
    const hasScript      = !!(s.scriptText && s.scriptText.trim().length > 50);
    const foundationsHaveContent = !!(s.storyFoundations && (s.storyFoundations.businessProblem || s.storyFoundations.futureStateVision));
    const hasPersona     = (s.personas || []).length > 0;
    const hasActs        = (s.storyActs || []).length > 0;
    const slideCount     = (s.slides || []).length;
    const hasCx          = (s.cxComponents || []).length > 0;
    const hasSelections  = Object.keys(s.selectedRecIds || {}).filter(function (k) { return s.selectedRecIds[k]; }).length > 0;

    if (id === "connect") {
      const creds = getAubreyGlobalKeys();
      const haveAny = !!(creds.demoforgeKey || creds.scriptwriterKey || creds.pocketsicKey);
      if (haveAny) return st("complete", "Connected");
      return st("optional", "Optional");
    }
    if (id === "setup") {
      if (!s.project.customerName) return st("needs-input", "Add customer details");
      if (!setupReady)              return st("needs-input", "Needs input");
      return st("complete", "Complete");
    }
    if (id === "script") {
      // Script step is unlocked from the start now — Aubrey-driven
      // projects can land here directly from Connect without filling
      // out Setup first. (Setup still gates downstream recommendations.)
      if (!s.scriptText) return st("not-started", "Not started");
      if (!hasScript)    return st("needs-input", "Script too short");
      return st("complete", "Script captured");
    }
    if (id === "foundations") {
      if (!hasScript) return locked("Paste a script first");
      if (!foundationsHaveContent) return st("review-needed", "Run extract to populate");
      return st("generated", "Extracted from script");
    }
    if (id === "cx") {
      // Treated as optional — never locks downstream.
      if (hasCx)            return st("complete", (s.cxComponents.length) + " linked");
      if (s._cxSkipped)     return st("optional", "Skipped");
      return st("optional", "Optional");
    }
    if (id === "recs") {
      if (!foundationsHaveContent && !hasSelections && !slideCount) return locked("Review Story Foundations first");
      if (!slideCount) return st("review-needed", "Build slide plan");
      return st("complete", slideCount + " slides selected");
    }
    if (id === "preview") {
      if (!slideCount) return locked("Build a slide plan first");
      return st("ready", "Ready to review");
    }
    if (id === "export") {
      if (!slideCount) return locked("Build a slide plan first");
      return st("ready", "Ready to export");
    }
    return st("not-started", "Not started");

    function st(state, label) {
      return { state: state, label: label, numText: numFor(state), numClass: classFor(state) };
    }
    function locked(reason) {
      return { state: "locked", label: "Locked", lockReason: reason, numText: "🔒", numClass: "is-locked" };
    }
    function numFor(state) {
      if (state === "complete" || state === "generated") return "✓";
      if (state === "ready")     return "→";
      if (state === "optional")  return "—";
      return null; // use default number
    }
    function classFor(state) {
      return ({
        "complete":      "is-complete",
        "generated":     "is-complete",
        "review-needed": "is-warn",
        "needs-input":   "is-warn",
        "ready":         "is-ready",
        "optional":      "is-optional",
        "not-started":   "is-default",
        "locked":        "is-locked",
      })[state] || "is-default";
    }
  }

  // ─── BUILDER: main + side ─────────────────────────────────────
  function renderMain() {
    const main = $("#bxMain");
    main.innerHTML = "";
    // Migrate any legacy state.step values (older projects had "story";
    // "narrative" was removed when Recommended Narrative was retired).
    if (app.state.step === "story") app.state.step = "script";
    if (app.state.step === "narrative") app.state.step = "recs";
    const step = app.state.step;
    if      (step === "connect")     main.appendChild(viewConnect());
    else if (step === "setup")       main.appendChild(viewSetup());
    else if (step === "script")      main.appendChild(viewScript());
    else if (step === "foundations") main.appendChild(viewFoundations());
    else if (step === "cx")          main.appendChild(viewCxComponents());
    else if (step === "recs")        main.appendChild(viewRecommendations());
    else if (step === "assets")      main.appendChild(viewAssets());
    else if (step === "preview")     main.appendChild(viewPreview());
    else if (step === "export")      main.appendChild(viewExport());
    else                             main.appendChild(viewSetup());
  }

  function renderSide() {
    const title = $("#bxSideTitle");
    const sub   = $("#bxSideSub");
    const body  = $("#bxSideBody");
    body.innerHTML = "";
    const step = app.state.step;
    if (step === "connect") {
      title.textContent = "Quick start";
      sub.textContent = "Aubrey-driven projects need almost no typing";
      sideConnectHint(body);
      return;
    }
    if (step === "setup" || step === "script" || step === "foundations") {
      title.textContent = "Live Suggestions";
      sub.textContent = "We'll keep this updated as you fill things in";
      sideSuggestions(body);
    } else if (step === "recs") {
      title.textContent = "Selected so far";
      sub.textContent = countSelected() + " slides included";
      sideSelectedSummary(body);
    } else if (step === "preview") {
      title.textContent = "Plan health";
      sub.textContent = "Missing inputs surface here";
      sidePlanHealth(body);
    } else if (step === "cx") {
      title.textContent = "CX Components";
      sub.textContent = ((app.state.cxComponents || []).length) + " linked so far";
      sideCxSummary(body);
    } else if (step === "assets") {
      const lib = app.state.assetLibrary || {};
      const filled = Object.keys(lib).filter(function (k) { return lib[k]; }).length;
      title.textContent = "Assets";
      sub.textContent = filled
        ? filled + " uploaded so far"
        : "Upload anything you want to ship with the demo";
      sideAssetSummary(body);
    } else {
      title.textContent = "Ready to export";
      sub.textContent = "Snapshot of what you've built";
      sideExportSummary(body);
    }
  }

  // ─── Field helpers ────────────────────────────────────────────
  function field(opts) {
    const wrap = el("div", { class: "bx-field" });
    const labelEl = el("label", { class: "bx-label", text: opts.label });
    if (opts.help) labelEl.appendChild(el("span", { class: "bx-help-inline", text: opts.help }));
    wrap.appendChild(labelEl);
    let input;
    if (opts.type === "select") {
      input = el("select", { class: "bx-select" });
      input.appendChild(el("option", { value: "", text: opts.placeholder || "Select…" }));
      (opts.options || []).forEach(function (o) {
        const optEl = el("option", { value: o, text: o });
        if (opts.value === o) optEl.setAttribute("selected", "selected");
        input.appendChild(optEl);
      });
      input.addEventListener("change", function () { opts.onInput(input.value); });
    } else if (opts.type === "textarea") {
      input = el("textarea", { class: "bx-textarea" + (opts.large ? " bx-textarea-l" : ""),
        placeholder: opts.placeholder || "" });
      input.value = opts.value || "";
      input.addEventListener("input", function () { opts.onInput(input.value); });
    } else if (opts.type === "color") {
      input = el("div", { class: "bx-color-row" });
      const swatch = el("input", { type: "color", class: "bx-color-swatch", value: opts.value || "#b22234" });
      const text = el("input", { type: "text", class: "bx-input", value: opts.value || "#b22234" });
      swatch.addEventListener("input", function () { text.value = swatch.value; opts.onInput(swatch.value); });
      text.addEventListener("input", function () {
        if (/^#[0-9a-fA-F]{6}$/.test(text.value)) { swatch.value = text.value; opts.onInput(text.value); }
      });
      input.appendChild(swatch); input.appendChild(text);
    } else {
      input = el("input", { type: "text", class: "bx-input",
        placeholder: opts.placeholder || "", value: opts.value || "" });
      input.addEventListener("input", function () { opts.onInput(input.value); });
    }
    wrap.appendChild(input);
    return wrap;
  }
  function chips(opts) {
    const wrap = el("div", { class: "bx-chips" });
    opts.options.forEach(function (o) {
      const on = (opts.values || []).indexOf(o) !== -1;
      const c = el("button", { type: "button",
        class: "bx-chip" + (on ? " is-on" : "") + (opts.tone ? " tone-" + opts.tone : ""),
        text: o });
      c.addEventListener("click", function () { opts.onToggle(o); });
      wrap.appendChild(c);
    });
    return wrap;
  }

  // ─── STEP 1: SETUP ────────────────────────────────────────────
  function viewSetup() {
    const wrap = el("div");
    wrap.appendChild(stepHeader(
      "Step 1 · Setup",
      "Set up the customer demo",
      "Add the basic customer, audience, and Salesforce product context so the builder can recommend the right story structure. Two minutes here saves twenty later."
    ));
    const s = app.state;

    // Project name
    const c0 = el("div", { class: "bx-card" });
    c0.appendChild(el("div", { class: "bx-card-title", text: "Project name" }));
    c0.appendChild(el("div", { class: "bx-card-sub", text: "Shows up on the home page so you can find this later." }));
    c0.appendChild(field({
      label: "Project name",
      placeholder: "e.g. Acme — Vision deck",
      value: s.name,
      onInput: function (v) { s.name = v; commit(); renderTopbar(); },
    }));
    wrap.appendChild(c0);

    // Customer & demo basics
    const c1 = el("div", { class: "bx-card" });
    c1.appendChild(el("div", { class: "bx-card-title", text: "Customer & demo basics" }));
    c1.appendChild(el("div", { class: "bx-card-sub", text: "These shape the title slide and brand lockup." }));
    const grid1 = el("div", { class: "bx-grid-2" });
    grid1.appendChild(field({ label: "Customer name", placeholder: "e.g. Acme Retail",
      value: s.project.customerName,
      onInput: function (v) { s.project.customerName = v; commit(); renderTopbar(); renderSide(); } }));
    grid1.appendChild(field({ label: "Customer website", placeholder: "https://www.example.com",
      value: s.project.website, onInput: function (v) { s.project.website = v; commit(); } }));
    grid1.appendChild(field({ label: "Industry", type: "select", options: INDUSTRIES,
      value: s.project.industry,
      onInput: function (v) { s.project.industry = v; recompute(); renderShell(); commit(); } }));
    grid1.appendChild(field({ label: "Demo audience", type: "select", options: AUDIENCES,
      value: s.project.audience,
      onInput: function (v) { s.project.audience = v; recompute(); renderShell(); commit(); } }));
    grid1.appendChild(field({ label: "Sales stage", type: "select", options: STAGES,
      value: s.project.salesStage,
      onInput: function (v) { s.project.salesStage = v; recompute(); renderShell(); commit(); } }));
    grid1.appendChild(field({ label: "Tone", help: "(optional)", type: "select", options: TONES,
      value: s.project.tone, onInput: function (v) { s.project.tone = v; commit(); } }));
    c1.appendChild(grid1);
    c1.appendChild(field({ label: "Demo theme / creative direction", help: "(optional)",
      type: "textarea",
      placeholder: "e.g. The agentic guest journey from booking to post-trip",
      value: s.project.theme,
      onInput: function (v) { s.project.theme = v; commit(); } }));
    wrap.appendChild(c1);

    // Products
    const c2 = el("div", { class: "bx-card" });
    c2.appendChild(el("div", { class: "bx-card-title", text: "Salesforce products in the story" }));
    c2.appendChild(el("div", { class: "bx-card-sub", text: "Pick anything that shows up in the demo. The recommendation engine uses these heavily." }));
    c2.appendChild(chips({
      options: PRODUCTS, values: s.project.products || [],
      onToggle: function (v) {
        const arr = s.project.products || [];
        const i = arr.indexOf(v);
        if (i >= 0) arr.splice(i, 1); else arr.push(v);
        s.project.products = arr;
        recompute(); renderShell(); commit();
      },
    }));
    // Show a hint when products were auto-ticked from a script pull.
    // Only shows ones still ticked (so a manual uncheck makes it disappear).
    const autoTicked = (s._aubreyAutoTickedProducts || []).filter(function (p) {
      return (s.project.products || []).indexOf(p) !== -1;
    });
    if (autoTicked.length) {
      c2.appendChild(el("div", { class: "bx-help bx-mt-12",
        text: "✨ Auto-detected from Aubrey script: " + autoTicked.join(", ") +
              ". Uncheck anything that doesn't fit." }));
    }
    wrap.appendChild(c2);

    // Brand
    const c3 = el("div", { class: "bx-card" });
    const c3Head = el("div", { class: "bx-row bx-row-between" });
    const c3HeadL = el("div");
    c3HeadL.appendChild(el("div", { class: "bx-card-title", text: "Brand" }));
    c3HeadL.appendChild(el("div", { class: "bx-card-sub", text: "These flow into the generated config's brand block." }));
    c3Head.appendChild(c3HeadL);
    c3Head.appendChild(btn("✨ Pull brand from Aubrey", "bx-btn-secondary",
      function () { openAubreyBrandPicker(); }));
    c3.appendChild(c3Head);
    const grid3 = el("div", { class: "bx-grid-3" });
    grid3.appendChild(field({ label: "Primary color", type: "color", value: s.brand.primaryColor,
      onInput: function (v) { s.brand.primaryColor = v; commit(); } }));
    grid3.appendChild(field({ label: "Secondary color", type: "color", value: s.brand.secondaryColor,
      onInput: function (v) { s.brand.secondaryColor = v; commit(); } }));
    grid3.appendChild(field({ label: "Accent color", type: "color", value: s.brand.accentColor,
      onInput: function (v) { s.brand.accentColor = v; commit(); } }));
    c3.appendChild(grid3);
    // Logo: text path OR direct file upload (embedded as a data URL so it
    // travels with the project — no need to drop a file in demo/assets/ first).
    const logoWrap = el("div", { class: "bx-field" });
    const logoLabel = el("label", { class: "bx-label", text: "Logo" });
    logoLabel.appendChild(el("span", { class: "bx-help-inline",
      text: "(upload a file or paste a path)" }));
    logoWrap.appendChild(logoLabel);
    const logoRow = el("div", { class: "bx-color-row" });
    const logoText = el("input", { type: "text", class: "bx-input",
      placeholder: "e.g. assets/acme-logo.png", value: s.brand.logoPath || "" });
    logoText.addEventListener("input", function () {
      s.brand.logoPath = logoText.value; commit();
    });
    const logoFile = el("input", { type: "file", accept: "image/*",
      class: "bx-file-input", "aria-label": "Upload logo file" });
    logoFile.addEventListener("change", function () {
      const f = logoFile.files && logoFile.files[0];
      if (!f) return;
      const mb = f.size / (1024 * 1024);
      const sizeNote = mb > 8 ? " (" + mb.toFixed(1) + "MB — config will be larger)" : "";
      const reader = new FileReader();
      reader.onload = function () {
        s.brand.logoPath = String(reader.result || "");
        logoText.value = s.brand.logoPath;
        commit();
        toast("Logo uploaded" + sizeNote);
      };
      reader.onerror = function () { toast("Could not read that file"); };
      reader.readAsDataURL(f);
    });
    logoRow.appendChild(logoText);
    logoRow.appendChild(logoFile);
    logoWrap.appendChild(logoRow);
    c3.appendChild(logoWrap);
    wrap.appendChild(c3);

    // Presenter
    const c4 = el("div", { class: "bx-card" });
    c4.appendChild(el("div", { class: "bx-card-title", text: "Presenter" }));
    c4.appendChild(el("div", { class: "bx-card-sub", text: "Update before every demo. Appears on the intro slides." }));
    const grid4 = el("div", { class: "bx-grid-2" });
    grid4.appendChild(field({ label: "Presenter name", placeholder: "e.g. Jane Smith",
      value: s.project.presenterName, onInput: function (v) { s.project.presenterName = v; commit(); } }));
    grid4.appendChild(field({ label: "Presenter title", placeholder: "e.g. Senior Account Executive",
      value: s.project.presenterTitle, onInput: function (v) { s.project.presenterTitle = v; commit(); } }));
    c4.appendChild(grid4);
    wrap.appendChild(c4);

    wrap.appendChild(stepFooter("setup"));
    return wrap;
  }

  // ═══════════════════════════════════════════════════════════════
  //  Shared script-extraction helper (used by Step 2 + Step 3)
  //  Single source of truth: same parser pipeline, same logging,
  //  same toast messages on success / failure.
  // ═══════════════════════════════════════════════════════════════
  function runScriptExtraction() {
    const s = app.state;
    if (window.HOLO_DEBUG) console.log("[holo] SCRIPT_INPUT_RECEIVED", { length: (s.scriptText || "").length, source: "extract-button" });
    if (!PARSER) { toast("Story parser is not loaded — check your install"); return false; }
    if (!s.scriptText || !s.scriptText.trim()) {
      toast("Script text is empty — paste a script first");
      app.state.step = "script"; renderShell();
      return false;
    }
    let f;
    try {
      if (window.HOLO_DEBUG) console.log("[holo] PARSER_CALLED extractStoryFoundations", { length: s.scriptText.length });
      f = PARSER.extractStoryFoundations(s.scriptText, s);
    } catch (e) {
      toast("Parser threw: " + e.message);
      return false;
    }
    if (!f || !f.businessProblem) {
      toast("Parser ran but found no story signals — check the script has Synopsis / CX Summary / numbered steps");
      return false;
    }
    if (window.HOLO_DEBUG) console.log("[holo] PARSER_RESULT", {
      businessProblem: f.businessProblem.slice(0, 60),
      valueDrivers: f.valueDrivers.length,
      agentforceMoments: f.agentforceMoments.length,
      dataCloudMoments: f.dataCloudMoments.length,
    });
    PARSER.mergeExtractedStoryIntoState(f, s);
    if (!(s.storyActs || []).length) {
      const acts = PARSER.extractStoryActsFromScript(s.scriptText);
      s.storyActs = acts.map(function (a) { return Object.assign({ id: uid("act_") }, a); });
    }
    if (!(s.personas || []).length) {
      const desc = PARSER.extractPersonaDescription(s.scriptText);
      if (desc) {
        const name = (desc.match(/^([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/) || [, ""])[1];
        s.personas.push({
          id: uid("persona_"),
          name: name || "",
          role: "", goals: "", painPoints: "",
          demoRelevance: desc,
        });
      }
    }
    recompute();
    commit();
    toast("Foundations extracted — " + s.storyFoundations.valueDrivers.length + " value drivers, "
          + s.storyActs.length + " acts, " + s.personas.length + " persona" + (s.personas.length === 1 ? "" : "s"));
    return true;
  }

  // ═══════════════════════════════════════════════════════════════
  //  STEP 2: SCRIPT & STORY
  //  One job: capture the script. Personas + acts live here too
  //  because they often need manual edits even after extraction.
  // ═══════════════════════════════════════════════════════════════
  function viewScript() {
    const wrap = el("div");
    wrap.appendChild(stepHeader(
      "Step 2 · Script & Story",
      "Add your demo script",
      "Paste or upload the rough demo story. The builder extracts the narrative, personas, journey moments, and business value automatically."
    ));
    const s = app.state;

    // ── Paste / Upload card ──────────────────────────────────
    const c = el("div", { class: "bx-card bx-card-feature" });
    c.appendChild(el("div", { class: "bx-card-title", text: "Paste your demo script" }));
    c.appendChild(el("div", { class: "bx-card-sub", text: "Nothing is sent anywhere — extraction happens locally in your browser. The more structure your script has (Script Synopsis, CX Summary, numbered journey steps), the better the result." }));
    c.appendChild(field({
      label: "Script text",
      type: "textarea",
      large: true,
      placeholder: "Paste a rough demo script, story outline, or transcript here…",
      value: s.scriptText,
      onInput: function (v) { s.scriptText = v; recompute(); renderSide(); commit(); },
    }));
    // Upload-from-file shortcut
    const uploadRow = el("div", { class: "bx-row bx-mt-12 bx-row-center" });
    const fileLabel = el("label", { class: "bx-btn bx-btn-secondary", text: "📎 Upload from file" });
    const fileInput = el("input", { type: "file", style: "display: none;", accept: ".txt,.md,.json" });
    fileInput.addEventListener("change", function () {
      const f = fileInput.files && fileInput.files[0];
      if (!f) return;
      const reader = new FileReader();
      reader.onload = function () {
        s.scriptText = String(reader.result || "");
        recompute(); commit(); renderShell();
        toast("Loaded " + f.name);
      };
      reader.readAsText(f);
    });
    fileLabel.appendChild(fileInput);
    uploadRow.appendChild(fileLabel);
    uploadRow.appendChild(btn("✨ Pull script from Aubrey", "bx-btn-secondary",
      function () { openAubreyScriptPicker(); }));
    uploadRow.appendChild(el("div", { class: "bx-help bx-help-inline", text: "or drop in any .txt, .md, or .json file" }));
    c.appendChild(uploadRow);

    // Live signal preview
    if (s.scriptText) {
      const sigs = RULES.extractScriptSignals(s.scriptText);
      const keys = Object.keys(sigs);
      if (keys.length) {
        c.appendChild(el("div", { class: "bx-help bx-mt-12", text: "Signals detected in your script:" }));
        const row = el("div", { class: "bx-row bx-mt-6" });
        keys.sort(function (a, b) { return sigs[b] - sigs[a]; }).forEach(function (k) {
          row.appendChild(el("div", { class: "bx-rec-pill tone-good", text: k + " · " + sigs[k] }));
        });
        c.appendChild(row);
      }
    }
    wrap.appendChild(c);

    // ── Extract action ──────────────────────────────────────
    const action = el("div", { class: "bx-card bx-extract-card" });
    action.appendChild(el("div", { class: "bx-card-title", text: "Extract Story Foundations" }));
    action.appendChild(el("div", { class: "bx-card-sub",
      text: s.scriptText
        ? "Run the parser on your script to generate the business problem, future-state vision, story acts, personas, and value drivers."
        : "Paste a script above first, then click Extract." }));
    action.appendChild(el("div", { class: "bx-row bx-mt-12" }, [
      btn("✨ Extract Story Foundations", "bx-btn-primary", function () {
        if (runScriptExtraction()) {
          app.state.step = "foundations";
          renderShell();
        }
      }),
    ]));
    wrap.appendChild(action);

    // ── Personas ───────────────────────────────────────────
    const personasCard = el("div", { class: "bx-card" });
    personasCard.appendChild(el("div", { class: "bx-card-title", text: "Personas" }));
    personasCard.appendChild(el("div", { class: "bx-card-sub", text: "Who is the demo about? One persona is usually enough." }));
    const personaList = el("div", { class: "bx-list" });
    if (!s.personas.length) {
      personaList.appendChild(el("div", { class: "bx-empty",
        html: "No personas yet. They'll be auto-added after extraction, or <strong>add one manually</strong> below." }));
    }
    s.personas.forEach(function (p, idx) { personaList.appendChild(personaItem(p, idx)); });
    personasCard.appendChild(personaList);
    const personaActions = el("div", { class: "bx-row bx-mt-12" });
    const addPersona = el("button", { class: "bx-add-btn", text: "+ Add persona" });
    addPersona.addEventListener("click", function () {
      s.personas.push({ id: uid("persona_"), name: "", role: "", goals: "", painPoints: "", demoRelevance: "" });
      recompute(); renderMain(); commit();
    });
    personaActions.appendChild(addPersona);
    personaActions.appendChild(btn("✨ Pull persona from Aubrey", "bx-btn-secondary",
      function () { openAubreyPersonaPicker(); }));
    personasCard.appendChild(personaActions);
    wrap.appendChild(personasCard);

    // ── Story acts ─────────────────────────────────────────
    const actsCard = el("div", { class: "bx-card" });
    actsCard.appendChild(el("div", { class: "bx-card-title", text: "Journey acts" }));
    actsCard.appendChild(el("div", { class: "bx-card-sub", text: "Three to five acts is the sweet spot. Each act becomes a slide moment downstream." }));
    const actList = el("div", { class: "bx-list" });
    if (!s.storyActs.length) {
      actList.appendChild(el("div", { class: "bx-empty",
        html: "No acts yet. They'll be auto-extracted from numbered script steps. Or try a simple frame like <strong>Discover → Engage → Recover → Convert</strong>." }));
    }
    s.storyActs.forEach(function (a, idx) { actList.appendChild(actItem(a, idx)); });
    actsCard.appendChild(actList);
    const addAct = el("button", { class: "bx-add-btn", text: "+ Add act" });
    addAct.addEventListener("click", function () {
      s.storyActs.push({ id: uid("act_"), title: "", persona: "", channel: "", summary: "",
        demoMoment: "", salesforceCapabilities: "", businessValue: "", requiredAssets: "", notes: "" });
      recompute(); renderMain(); commit();
    });
    actsCard.appendChild(addAct);
    wrap.appendChild(actsCard);

    wrap.appendChild(stepFooter("script"));
    return wrap;
  }

  // ═══════════════════════════════════════════════════════════════
  //  STEP 3: STORY FOUNDATIONS
  //  A clean review panel grouped into Core Narrative / Key Moments
  //  / Business Value. Every field shows "Extracted" or "Missing"
  //  with a clear hint about how to fix it.
  // ═══════════════════════════════════════════════════════════════
  function viewFoundations() {
    const wrap = el("div");
    wrap.appendChild(stepHeader(
      "Step 3 · Story Foundations",
      "Review the extracted story",
      "These are the core narrative ingredients that will power the recommended slide plan. Edit any field — your changes are saved automatically."
    ));
    const s = app.state;
    const f = s.storyFoundations || {};
    const hasContent = !!(f.businessProblem || f.futureStateVision || (f.valueDrivers || []).length);

    // ── Action bar: re-run extract / quality check ────────
    const actionBar = el("div", { class: "bx-card bx-extract-card" });
    actionBar.appendChild(el("div", { class: "bx-card-title",
      text: hasContent ? "Story Foundations are ready" : "Run extraction to populate this step" }));
    actionBar.appendChild(el("div", { class: "bx-card-sub",
      text: hasContent
        ? "Looks good. You can edit fields below, or move on to Slide Selection."
        : "Paste a script in Step 2 and click Extract to populate the foundations." }));
    actionBar.appendChild(el("div", { class: "bx-row bx-mt-12" }, [
      hasContent
        ? btn("Re-run extraction", "bx-btn-secondary", function () {
            if (runScriptExtraction()) renderShell();
          })
        : btn("← Back to Script", "bx-btn-primary", function () {
            app.state.step = "script"; renderShell();
          }),
      btn("Run Story Quality Check", "bx-btn-secondary", function () { openStoryQualityModal(); }),
    ]));
    wrap.appendChild(actionBar);

    if (!hasContent) {
      wrap.appendChild(el("div", { class: "bx-empty bx-mt-18",
        html: "<strong>Nothing extracted yet.</strong> Paste a script in Step 2 and click Extract Story Foundations. The app fills the fields below automatically." }));
      wrap.appendChild(stepFooter("foundations"));
      return wrap;
    }

    // ── Core Narrative ────────────────────────────────────
    const coreFields = [
      ["businessProblem",      "Business problem"],
      ["currentStatePain",     "Current-state pain"],
      ["futureStateVision",    "Future-state vision"],
      ["primaryNarrative",     "Primary narrative"],
      ["transformationThesis", "Transformation thesis"],
      ["executiveTakeaway",    "Executive takeaway"],
    ];
    wrap.appendChild(foundationCard("Core Narrative",
      "The story arc that powers the Intro and Business Value sections.",
      coreFields, f, false));

    // ── Key Moments ────────────────────────────────────────
    const momentFields = [
      ["customerMoments",    "Customer moments"],
      ["operationalMoments", "Operational moments"],
      ["agentforceMoments",  "Agentforce moments"],
      ["dataCloudMoments",   "Data Cloud moments"],
      ["commerceMoments",    "Commerce moments"],
      ["marketingMoments",   "Marketing moments"],
      ["serviceMoments",     "Service moments"],
      ["loyaltyMoments",     "Loyalty moments"],
    ];
    wrap.appendChild(foundationCard("Key Moments",
      "Pull-out moments by capability area. These shape Demo-section slides.",
      momentFields, f, true));

    // ── Business Value ─────────────────────────────────────
    const valueFields = [
      ["valueDrivers",   "Value drivers"],
      ["assumptions",    "Assumptions"],
      ["openQuestions",  "Open questions"],
    ];
    wrap.appendChild(foundationCard("Business Value",
      "What outcomes the demo proves out, plus any flagged uncertainties.",
      valueFields, f, true));

    wrap.appendChild(stepFooter("foundations"));
    return wrap;
  }

  // Render one foundation card with grouped fields. listMode=true
  // means the field is a list (joined with "; " for editing).
  function foundationCard(title, sub, fields, foundationObj, listMode) {
    const card = el("div", { class: "bx-card" });
    card.appendChild(el("div", { class: "bx-card-title", text: title }));
    card.appendChild(el("div", { class: "bx-card-sub", text: sub }));
    fields.forEach(function (entry) {
      const key = entry[0];
      const label = entry[1];
      const raw = foundationObj[key];
      const isPopulated = listMode ? (Array.isArray(raw) && raw.length > 0)
                                    : (typeof raw === "string" && raw.trim().length > 0);
      const value = listMode
        ? (Array.isArray(raw) && raw.length ? raw.join("\n") : "")
        : (raw || "");

      const wrap = el("div", { class: "bx-foundation-field" });
      const head = el("div", { class: "bx-foundation-head" }, [
        el("label", { class: "bx-label", text: label }),
        isPopulated
          ? el("span", { class: "bx-rec-pill tone-good", text: "✓ Extracted" })
          : el("span", { class: "bx-rec-pill tone-gold", text: "Missing — add this to improve slide quality" }),
      ]);
      wrap.appendChild(head);

      if (listMode) {
        // Editable textarea, one item per line. Strip leading "• ".
        const editable = (Array.isArray(raw) ? raw.join("\n") : "");
        const ta = el("textarea", { class: "bx-textarea", placeholder: "One item per line",
          rows: Math.max(3, Math.min(8, (Array.isArray(raw) ? raw.length : 0) + 1)) });
        ta.value = editable;
        ta.addEventListener("input", function () {
          const items = ta.value.split(/\n/).map(function (l) { return l.replace(/^[-•*\s]+/, "").trim(); }).filter(Boolean);
          foundationObj[key] = items;
          recompute(); renderSide(); commit();
        });
        wrap.appendChild(ta);
      } else {
        const ta = el("textarea", { class: "bx-textarea",
          placeholder: "Edit if you want to refine the extracted text…",
          rows: Math.max(2, Math.min(6, Math.ceil((value || "").length / 80))) });
        ta.value = value;
        ta.addEventListener("input", function () {
          foundationObj[key] = ta.value;
          // Mirror to legacy state.story for downstream readers.
          mirrorFoundationField(key, ta.value);
          recompute(); renderSide(); commit();
        });
        wrap.appendChild(ta);
      }
      card.appendChild(wrap);
    });
    return card;
  }

  // Keep the legacy state.story.* in sync when the SE edits a
  // foundation field directly. recompute() reads from state.story
  // today; the long-term refactor (P1-3) collapses these.
  function mirrorFoundationField(key, value) {
    const s = app.state;
    const map = {
      "businessProblem":   "bigProblem",
      "currentStatePain":  "currentPain",
      "futureStateVision": "futureVision",
      "executiveTakeaway": "executiveTakeaway",
    };
    if (map[key]) s.story[map[key]] = value;
  }

  // (The standalone "Recommended Narrative" step was removed — every slide
  //  is now selectable and on by default in Step 5 · Slide Selection.)

  function personaItem(p, idx) {
    const item = el("div", { class: "bx-item" });
    item.appendChild(el("div", { class: "bx-item-head" }, [
      el("div", { class: "bx-item-handle", text: "Persona " + (idx + 1) }),
      el("div", { class: "bx-item-actions" }, [
        upBtn(function () { moveItem(app.state.personas, p.id, -1); }),
        downBtn(function () { moveItem(app.state.personas, p.id, 1); }),
        delBtn(function () { app.state.personas = app.state.personas.filter(function (x) { return x.id !== p.id; }); recompute(); renderMain(); commit(); }),
      ]),
    ]));
    const grid = el("div", { class: "bx-grid-2" });
    grid.appendChild(field({ label: "Name", value: p.name, onInput: function (v) { p.name = v; recompute(); renderSide(); commit(); } }));
    grid.appendChild(field({ label: "Role", value: p.role, onInput: function (v) { p.role = v; commit(); } }));
    grid.appendChild(field({
      label: "Pronouns", help: "drives the wishlist headline (\"Her top 3\" vs. \"His top 3\")",
      type: "select", value: p.pronouns || "",
      placeholder: "she/her (default)",
      options: ["she/her", "he/him", "they/them"],
      onInput: function (v) { p.pronouns = v; commit(); },
    }));
    item.appendChild(grid);
    item.appendChild(field({ label: "Goals", type: "textarea", value: p.goals, onInput: function (v) { p.goals = v; commit(); } }));
    item.appendChild(field({ label: "Pain points", type: "textarea", value: p.painPoints, onInput: function (v) { p.painPoints = v; commit(); } }));
    item.appendChild(field({ label: "Demo relevance", type: "textarea", value: p.demoRelevance, onInput: function (v) { p.demoRelevance = v; commit(); } }));
    return item;
  }

  function actItem(a, idx) {
    const item = el("div", { class: "bx-item" });
    item.appendChild(el("div", { class: "bx-item-head" }, [
      el("div", { class: "bx-item-handle", text: "Act " + (idx + 1) }),
      el("div", { class: "bx-item-actions" }, [
        upBtn(function () { moveItem(app.state.storyActs, a.id, -1); }),
        downBtn(function () { moveItem(app.state.storyActs, a.id, 1); }),
        delBtn(function () { app.state.storyActs = app.state.storyActs.filter(function (x) { return x.id !== a.id; }); recompute(); renderMain(); commit(); }),
      ]),
    ]));
    const grid = el("div", { class: "bx-grid-2" });
    grid.appendChild(field({ label: "Act title", value: a.title, onInput: function (v) { a.title = v; recompute(); renderSide(); commit(); } }));
    grid.appendChild(field({ label: "Persona", value: a.persona, onInput: function (v) { a.persona = v; commit(); } }));
    grid.appendChild(field({ label: "Channel / device", placeholder: "e.g. iPhone · SMS · Storefront",
      value: a.channel, onInput: function (v) { a.channel = v; commit(); } }));
    grid.appendChild(field({ label: "Salesforce capability", value: a.salesforceCapabilities,
      onInput: function (v) { a.salesforceCapabilities = v; commit(); } }));
    item.appendChild(grid);
    item.appendChild(field({ label: "What happens", type: "textarea", value: a.summary,
      onInput: function (v) { a.summary = v; recompute(); renderSide(); commit(); } }));
    item.appendChild(field({ label: "Demo asset / moment", value: a.demoMoment,
      onInput: function (v) { a.demoMoment = v; commit(); } }));
    item.appendChild(field({ label: "Business value", value: a.businessValue,
      onInput: function (v) { a.businessValue = v; commit(); } }));
    item.appendChild(field({ label: "Talk-track notes", type: "textarea", value: a.notes,
      onInput: function (v) { a.notes = v; commit(); } }));
    return item;
  }

  function upBtn(onClick)   { const b = el("button", { class: "bx-mini-btn", "aria-label": "Move up", text: "↑" });   b.addEventListener("click", onClick); return b; }
  function downBtn(onClick) { const b = el("button", { class: "bx-mini-btn", "aria-label": "Move down", text: "↓" }); b.addEventListener("click", onClick); return b; }
  function delBtn(onClick)  { const b = el("button", { class: "bx-mini-btn is-danger", "aria-label": "Remove", text: "✕" }); b.addEventListener("click", onClick); return b; }

  function moveItem(arr, id, delta) {
    const i = arr.findIndex(function (x) { return x.id === id; });
    if (i < 0) return;
    const j = i + delta;
    if (j < 0 || j >= arr.length) return;
    const tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
    renderMain(); commit();
  }

  // ─── STEP 3: CX COMPONENTS (AubreyDemo) ───────────────────────
  function viewCxComponents() {
    const wrap = el("div");
    wrap.appendChild(stepHeader(
      "Step 6 · CX Component Links",
      "Embed live demo screens (optional)",
      "Paste AubreyDemo component links here so the final holodeck can embed live demo moments in the Demo section. Skip this step if you don't have any yet — your demo will still work."
    ));
    const s = app.state;
    const components = s.cxComponents || [];

    // Strong empty state if nothing added yet — explains the value
    // and offers a clear "Skip" path so the user isn't stuck.
    if (!components.length) {
      const empty = el("div", { class: "bx-card" });
      empty.appendChild(el("div", { class: "bx-card-title", text: "No CX components yet" }));
      empty.appendChild(el("div", { class: "bx-card-sub",
        text: "AubreyDemo links let your Demo section embed live screens — agentic chat, storefront flows, service consoles. If you're not running aubreydemo.com scenes, skip this step." }));
      empty.appendChild(el("div", { class: "bx-help bx-mt-12",
        html: "<strong>How it works:</strong> Paste a /scene/.../frame URL → it shows up as an iframe slide in the Demo section. If a site blocks embedding, we'll show an open-in-new-tab fallback automatically." }));
      empty.appendChild(el("div", { class: "bx-row bx-mt-12" }, [
        btn("+ Add CX Component Link", "bx-btn-primary", function () { addCxComponent(); }),
        btn("✨ Pull CX components from Aubrey", "bx-btn-secondary",
          function () { openAubreyCxPicker(); }),
        btn("Skip — I don't have CX links yet", "bx-btn-secondary", function () {
          s._cxSkipped = true; commit();
          app.state.step = "assets"; renderShell();
        }),
      ]));
      wrap.appendChild(empty);
      wrap.appendChild(stepFooter("cx"));
      return wrap;
    }

    // Has components: list them.
    const list = el("div", { class: "bx-list" });
    components.forEach(function (c, i) { list.appendChild(cxItem(c, i)); });
    wrap.appendChild(list);

    const addRow = el("div", { class: "bx-row bx-mt-12" });
    const addBtn = el("button", { class: "bx-add-btn", text: "+ Add CX Component Link" });
    addBtn.addEventListener("click", function () { addCxComponent(); });
    addRow.appendChild(addBtn);
    addRow.appendChild(btn("✨ Pull CX components from Aubrey", "bx-btn-secondary",
      function () { openAubreyCxPicker(); }));
    wrap.appendChild(addRow);

    // Inline note about iframe behavior — sets expectations
    wrap.appendChild(el("div", { class: "bx-help bx-mt-18",
      html: "<strong>Note:</strong> Some websites block iframe embedding via X-Frame-Options or CSP. If that happens, the exported demo will automatically show an open-in-new-tab fallback link instead." }));

    wrap.appendChild(stepFooter("cx"));
    return wrap;

    function addCxComponent() {
      s.cxComponents = s.cxComponents || [];
      s.cxComponents.push({
        id: uid("cx_"), name: "New component", url: "",
        type: "web", sectionId: "demo",
        linkedStoryActIds: [], linkedSlideIds: [],
        deviceFrame: "desktop", iframeAllowed: true,
        fallbackMode: "link-card", status: "ready", notes: "",
      });
      s._cxSkipped = false;
      recompute(); renderMain(); commit();
    }
  }

  function cxItem(c, idx) {
    const item = el("div", { class: "bx-item" });
    item.appendChild(el("div", { class: "bx-item-head" }, [
      el("div", { class: "bx-item-handle", text: "Component " + (idx + 1) }),
      el("div", { class: "bx-item-actions" }, [
        upBtn(function () { moveItem(app.state.cxComponents, c.id, -1); }),
        downBtn(function () { moveItem(app.state.cxComponents, c.id, 1); }),
        delBtn(function () {
          app.state.cxComponents = app.state.cxComponents.filter(function (x) { return x.id !== c.id; });
          recompute(); renderMain(); commit();
        }),
      ]),
    ]));
    const grid = el("div", { class: "bx-grid-2" });
    grid.appendChild(field({ label: "Name", placeholder: "e.g. Personalized storefront",
      value: c.name, onInput: function (v) { c.name = v; commit(); } }));
    grid.appendChild(field({ label: "URL",
      help: "(http or https only)",
      placeholder: "https://aubreydemo.com/scene/…",
      value: c.url, onInput: function (v) {
        c.url = v;
        // Live URL validation
        const ok = /^https?:\/\//i.test(v);
        c.status = !v ? "needs-review" : (ok ? "ready" : "blocked");
        commit();
      } }));
    grid.appendChild(field({ label: "Type", type: "select",
      options: ["web", "mobile", "agent", "commerce", "service", "marketing", "data", "ad", "other"],
      value: c.type, onInput: function (v) { c.type = v; commit(); } }));
    grid.appendChild(field({ label: "Device frame", type: "select",
      options: ["desktop", "mobile", "tablet", "none"],
      value: c.deviceFrame, onInput: function (v) { c.deviceFrame = v; commit(); } }));
    item.appendChild(grid);

    // Linked slide — only the slides the SE put in the Demo section.
    // CX components are screens that live inside the demo flow, so
    // linking to a non-demo slide would never render correctly anyway.
    const demoSlides = (app.state.slides || []).filter(function (sl) {
      return sl.sectionId === "demo";
    });
    if (demoSlides.length) {
      const linkSel = el("select", { class: "bx-select" });
      linkSel.appendChild(el("option", { value: "", text: "(not linked)" }));

      const currentLink = (c.linkedSlideIds && c.linkedSlideIds[0]) || "";
      demoSlides.forEach(function (sl) {
        const label = (sl.title || "Untitled") + " · " + layoutLabelShort(sl.layout || "");
        const opt = el("option", { value: sl.id, text: label });
        if (currentLink === sl.id) opt.setAttribute("selected", "selected");
        linkSel.appendChild(opt);
      });
      linkSel.addEventListener("change", function () {
        c.linkedSlideIds = linkSel.value ? [linkSel.value] : [];
        // Rebuild so the slide's linkedCxComponentIds reflects the change
        buildSlidePlanFromSelections();
        commit();
      });
      item.appendChild(el("div", { class: "bx-field" }, [
        el("label", { class: "bx-label", text: "Linked demo slide" },
          [el("span", { class: "bx-help-inline", text: "(optional)" })]),
        linkSel,
      ]));
    } else {
      item.appendChild(el("div", { class: "bx-help bx-mt-6",
        html: "<strong>Tip:</strong> Pick demo slides in Step 5 first, then come back here to link this component to a specific demo screen." }));
    }
    item.appendChild(field({ label: "Notes", type: "textarea",
      value: c.notes, onInput: function (v) { c.notes = v; commit(); } }));

    // Live status pill
    const isUrl = /^https?:\/\//i.test(c.url || "");
    const status = el("div", { class: "bx-row bx-mt-12" });
    if (!c.url) status.appendChild(el("span", { class: "bx-rec-pill tone-gold", text: "URL needed" }));
    else if (!isUrl) status.appendChild(el("span", { class: "bx-rec-pill tone-red", text: "Invalid URL — must be http(s)" }));
    else if (!/aubreydemo\.com/i.test(c.url)) status.appendChild(el("span", { class: "bx-rec-pill tone-gold", text: "Not aubreydemo.com — verify iframe support" }));
    else status.appendChild(el("span", { class: "bx-rec-pill tone-good", text: "Ready to embed" }));
    item.appendChild(status);

    return item;
  }

  // ═══════════════════════════════════════════════════════════════
  //  STEP 7: ASSETS — uploads keyed by slot, scoped to selected slides
  // ═══════════════════════════════════════════════════════════════
  // Catalog of every shared asset slot the polished template /demo
  // can consume.  Keys MUST match what holodeck-adapter.asset(state, slot)
  // looks up.  layouts[] = which slide layouts make this slot visible
  // (so SEs only see what's relevant to the deck they built).
  // Persona slots auto-show whenever a persona exists OR a persona-
  // related slide is selected.
  const ASSET_CATALOG = [
    // Brand
    { slot: "brand.logoPath", group: "Brand", label: "Customer logo",
      help: "Shown in the top-left navigation and on the title slide.",
      always: true, accept: "image/*" },
    // Persona — surfaces whenever a persona card is in the deck.
    { slot: "persona.portrait", group: "Persona", label: "Persona portrait",
      help: "Square photo used on the persona card.",
      layouts: ["personaCard"], accept: "image/*" },
    { slot: "persona.heroBackground", group: "Persona", label: "Persona hero background",
      help: "Full-bleed environment shot behind the persona on the 'Meet the persona' page.",
      layouts: ["personaCard"], accept: "image/*" },
    { slot: "persona.heroGif", group: "Persona", label: "Persona hero GIF",
      help: "Looping moment of the persona — overlays the hero background.",
      layouts: ["personaCard"], accept: "image/*,video/mp4" },
    { slot: "persona.phoneGif", group: "Persona", label: "Persona phone GIF",
      help: "Animated screen shown inside the iPhone frame on persona slides.",
      layouts: ["personaCard", "deviceMoment"], accept: "image/*,video/mp4" },
    // Demo library — used by the polished demo Section's slide library.
    { slot: "storeExterior", group: "Demo backdrops", label: "Store exterior",
      help: "Photo of the customer's location / storefront.",
      layouts: ["deviceMoment", "embeddedCxComponent", "currentFutureState"], accept: "image/*" },
    { slot: "storeInterior", group: "Demo backdrops", label: "Store interior",
      help: "In-store moment used as a background panel.",
      layouts: ["deviceMoment", "embeddedCxComponent"], accept: "image/*" },
    { slot: "productHero", group: "Demo backdrops", label: "Product hero image",
      help: "The featured product / SKU shown on the right-rail card.",
      layouts: ["deviceMoment", "unifiedProfile", "embeddedCxComponent"], accept: "image/*" },
    { slot: "iPhoneRec", group: "Demo screens", label: "iPhone recommendation screen",
      help: "Static screenshot for the 'app recommends' moment.",
      layouts: ["deviceMoment", "agentConversation"], accept: "image/*" },
    { slot: "webBrowseGif", group: "Demo screens", label: "Web browse GIF",
      help: "Looping browse session for the storefront moment.",
      layouts: ["deviceMoment", "embeddedCxComponent"], accept: "image/*,video/mp4" },
    { slot: "laptopBrowsingGif", group: "Demo screens", label: "Laptop browsing GIF",
      help: "Looping desktop browse for laptop-frame slides.",
      layouts: ["deviceMoment", "embeddedCxComponent"], accept: "image/*,video/mp4" },
  ];

  // Compute which assets should show given the current slide plan.
  // We always surface "Brand" and (if any persona exists or any
  // selected slide is persona-related) the Persona group.  The rest
  // is derived from the layouts present in the deck.
  function relevantAssetItems(state) {
    const slides = state.slides || [];
    const layoutsInDeck = {};
    slides.forEach(function (sl) { if (sl.layout) layoutsInDeck[sl.layout] = true; });
    const hasPersona = (state.personas || []).length > 0;
    return ASSET_CATALOG.filter(function (item) {
      if (item.always) return true;
      if (item.group === "Persona" && hasPersona) return true;
      if (!item.layouts) return false;
      return item.layouts.some(function (l) { return layoutsInDeck[l]; });
    });
  }

  // ─── Persona stat / wishlist helpers ─────────────────────────
  // Stats and wishlist are arrays. The adapter has [TODO] defaults
  // for missing slots; the editors here read whatever the SE has
  // typed and lazily allocate the slot on first edit so we don't
  // serialize empty placeholders into state.
  function statValue(p, idx) {
    const row = (p.stats && p.stats[idx]) || {};
    return row.value || "";
  }
  function statLabel(p, idx) {
    const row = (p.stats && p.stats[idx]) || {};
    return row.label || "";
  }
  function setStat(p, idx, key, v) {
    p.stats = Array.isArray(p.stats) ? p.stats : [];
    while (p.stats.length <= idx) p.stats.push({ value: "", label: "" });
    p.stats[idx][key] = v;
  }
  function wishField(p, idx, key) {
    const row = (p.wishlist && p.wishlist[idx]) || {};
    return row[key] || "";
  }
  function setWish(p, idx, key, v) {
    p.wishlist = Array.isArray(p.wishlist) ? p.wishlist : [];
    while (p.wishlist.length <= idx) p.wishlist.push({ name: "", tag: "", detail: "", emoji: "" });
    p.wishlist[idx][key] = v;
  }

  // BVS metric overrides — kept on storyFoundations.bvsMetrics so
  // they round-trip through import/export alongside the rest of
  // foundations. Same lazy-allocate pattern as persona stats.
  function bvsField(f, idx, key) {
    const arr = (f && Array.isArray(f.bvsMetrics)) ? f.bvsMetrics : [];
    const row = arr[idx] || {};
    return row[key] || "";
  }
  function setBvs(f, idx, key, v) {
    f.bvsMetrics = Array.isArray(f.bvsMetrics) ? f.bvsMetrics : [];
    while (f.bvsMetrics.length <= idx) f.bvsMetrics.push({ value: "", label: "" });
    f.bvsMetrics[idx][key] = v;
  }
  // Mirror of the adapter's shortenLabel — kept local so we can show
  // the SE the same source chip as the slide will use.
  function shortenForUi(s) {
    s = String(s || "").replace(/\s+/g, " ").trim();
    const m = s.match(/^(?:higher|increased|improved|reduced|faster)\s+([\w\s\/]+?)(\s+through|\s+via|\s+from|$)/i);
    if (m) return m[1].trim().replace(/\b\w/g, function (c) { return c.toUpperCase(); });
    return s.split(/[.;]/)[0].slice(0, 32);
  }

  // Pending text fields the SE should still tweak. Each entry is an
  // editor descriptor: { label, source, type, get, set }. We render
  // them as inline form fields on Step 7 so the SE can polish copy
  // without bouncing back through canonical steps. `source` is just
  // a hint label so SEs know where the value normally lives.
  // Editors bind directly to the canonical state path, so edits show
  // up identically on Step 1/3/4/5 — no duplication, no drift.
  function pendingTextItems(state) {
    const out = [];
    const personas = state.personas || [];
    const f = state.storyFoundations = state.storyFoundations || {};

    if (!state.project.presenterName) {
      out.push({
        label: "Presenter name", source: "Step 1 · Setup",
        placeholder: "e.g. Jane Smith", type: "input",
        get: function () { return state.project.presenterName || ""; },
        set: function (v) { state.project.presenterName = v; },
      });
    }
    if (!state.project.presenterTitle) {
      out.push({
        label: "Presenter title", source: "Step 1 · Setup",
        placeholder: "e.g. Senior Account Executive", type: "input",
        get: function () { return state.project.presenterTitle || ""; },
        set: function (v) { state.project.presenterTitle = v; },
      });
    }
    if (!personas.length) {
      out.push({
        label: "No personas added", source: "Step 4 · Personas",
        readonly: true, hint: "Personas are needed for the 'Meet the persona' slide. Add one on Step 4.",
      });
    } else {
      personas.forEach(function (p, i) {
        const tag = p.name ? p.name : "Persona " + (i + 1);
        if (!p.name) {
          out.push({
            label: tag + " name", source: "Step 4 · Personas",
            placeholder: "e.g. Rachel Chen", type: "input",
            get: function () { return p.name || ""; },
            set: function (v) { p.name = v; },
          });
        }
        if (!p.role) {
          out.push({
            label: tag + " role", source: "Step 4 · Personas",
            placeholder: "e.g. Loyalty member · Suburban mom", type: "input",
            get: function () { return p.role || ""; },
            set: function (v) { p.role = v; },
          });
        }
        if (!p.painPoints && !p.goals) {
          out.push({
            label: tag + " quote / pain points", source: "Step 4 · Personas",
            placeholder: "What's the unspoken thing on their mind?",
            type: "textarea",
            get: function () { return p.painPoints || ""; },
            set: function (v) { p.painPoints = v; },
          });
        }
        // Pronouns drive the wishlist headline ("Her top 3..."
        // vs. "His top 3..."). We always surface this so the SE
        // can change it from the she/her default — the slide
        // emits hard-coded pronouns otherwise.
        out.push({
          label: tag + " pronouns", source: "Step 4 · Personas",
          type: "select",
          options: [
            { value: "",          label: "she/her (default)" },
            { value: "she/her",   label: "she/her" },
            { value: "he/him",    label: "he/him" },
            { value: "they/them", label: "they/them" },
          ],
          hint: "Used for the wishlist headline — \"Her top 3\" vs. \"His top 3\".",
          get: function () { return p.pronouns || ""; },
          set: function (v) { p.pronouns = v; },
        });
        // Persona stats — three slots that render above "Top
        // Moment / Tradition / Signal" on the persona card. The
        // adapter falls back to "[TODO]" when these are empty,
        // so each blank slot is genuinely worth surfacing here.
        ["Top Moment", "Tradition", "Signal"].forEach(function (defaultLabel, idx) {
          out.push({
            label: tag + " · stat #" + (idx + 1) + " value",
            source: "Persona card · " + defaultLabel,
            placeholder: "e.g. \"4th of July\"", type: "input",
            hint: "Big text shown on the persona card stat tile.",
            get: function () { return statValue(p, idx); },
            set: function (v) { setStat(p, idx, "value", v); },
          });
          out.push({
            label: tag + " · stat #" + (idx + 1) + " label",
            source: "Persona card · " + defaultLabel,
            placeholder: defaultLabel, type: "input",
            hint: "Small caption under the stat value.",
            get: function () { return statLabel(p, idx); },
            set: function (v) { setStat(p, idx, "label", v); },
          });
        });
        // Persona wishlist — three product slots. Each row has a
        // name and a detail line (the tag/emoji are decoration
        // and stay on their defaults).
        ["Top product", "Companion", "Complete the look"].forEach(function (defaultLabel, idx) {
          out.push({
            label: tag + " · wishlist #" + (idx + 1) + " name",
            source: "Persona card · " + defaultLabel,
            placeholder: "e.g. Paloma Outdoor Set", type: "input",
            get: function () { return wishField(p, idx, "name"); },
            set: function (v) { setWish(p, idx, "name", v); },
          });
          out.push({
            label: tag + " · wishlist #" + (idx + 1) + " detail",
            source: "Persona card · " + defaultLabel,
            placeholder: "e.g. Saved to cart · price-drop trigger", type: "input",
            get: function () { return wishField(p, idx, "detail"); },
            set: function (v) { setWish(p, idx, "detail", v); },
          });
        });
      });
    }
    // BVS metrics — five tiles on the Business Value slide. The
    // adapter falls back to "XX%" / "+$XX" / etc. when these are
    // empty, which is the fastest way to spot them in the live demo.
    // Default labels mirror the adapter so the source chip is honest
    // even before the SE writes anything.
    const bvsDefaults = [
      { value: "XX%",  label: "Conversion Lift"      },
      { value: "+$XX", label: "Average Order Value"  },
      { value: "XX%",  label: "Loyalty Enrollment"   },
      { value: "XXx",  label: "Repeat Purchase Rate" },
      { value: "XX%",  label: "Service Efficiency"   },
    ];
    const drivers = (f.valueDrivers || []);
    bvsDefaults.forEach(function (def, idx) {
      const driverLabel = drivers[idx] ? shortenForUi(drivers[idx]) : "";
      const sourceLabel = "Business Value tile · " + (driverLabel || def.label);
      out.push({
        label: "BVS metric #" + (idx + 1) + " value",
        source: sourceLabel,
        placeholder: def.value, type: "input",
        hint: "Big number on the Business Value slide (e.g. \"23%\", \"+$340\").",
        get: function () { return bvsField(f, idx, "value"); },
        set: function (v) { setBvs(f, idx, "value", v); },
      });
      out.push({
        label: "BVS metric #" + (idx + 1) + " label",
        source: sourceLabel,
        placeholder: driverLabel || def.label, type: "input",
        hint: "Small caption under the metric.",
        get: function () { return bvsField(f, idx, "label"); },
        set: function (v) { setBvs(f, idx, "label", v); },
      });
    });

    if (!f.executiveTakeaway) {
      out.push({
        label: "Executive takeaway", source: "Step 3 · Story Foundations",
        placeholder: "One-line summary the executive should walk away with",
        type: "textarea",
        get: function () { return f.executiveTakeaway || ""; },
        set: function (v) { f.executiveTakeaway = v; },
      });
    }
    if (!f.transformationThesis) {
      out.push({
        label: "Transformation thesis", source: "Step 3 · Story Foundations",
        placeholder: "From X today → to Y tomorrow",
        type: "textarea",
        get: function () { return f.transformationThesis || ""; },
        set: function (v) { f.transformationThesis = v; },
      });
    }
    (state.slides || []).forEach(function (sl) {
      const customised = state.customRecTitles && state.customRecTitles[sl.id];
      if (!customised && /^Slide \d/.test(sl.title)) {
        out.push({
          label: "Title for '" + sl.title + "'", source: "Step 5 · Slide Selection",
          placeholder: "Give this slide a real title",
          type: "input",
          get: function () { return sl.title || ""; },
          set: function (v) {
            sl.title = v;
            state.customRecTitles = state.customRecTitles || {};
            state.customRecTitles[sl.id] = v;
          },
        });
      }
    });
    return out;
  }

  function viewAssets() {
    const wrap = el("div");
    wrap.appendChild(stepHeader(
      "Step 7 · Assets",
      "Upload images for your deck (optional)",
      "We only show the slots that the slides you picked actually use. Anything you skip leaves a clean placeholder in the demo — you can still export and present without uploading anything."
    ));
    const s = app.state;
    s.assetLibrary = s.assetLibrary || {};

    const items = relevantAssetItems(s);
    if (!items.length) {
      const empty = el("div", { class: "bx-card" });
      empty.appendChild(el("div", { class: "bx-card-title", text: "No image slots needed yet" }));
      empty.appendChild(el("div", { class: "bx-card-sub",
        text: "Pick slides on Step 5 (Slide Selection) and we'll list out every image slot those slides can use. You can still polish text below." }));
      wrap.appendChild(empty);
    } else {
      // Group items by their `group` property in catalog order.
      const groups = [];
      const groupIndex = {};
      items.forEach(function (it) {
        if (groupIndex[it.group] == null) {
          groupIndex[it.group] = groups.length;
          groups.push({ label: it.group, items: [] });
        }
        groups[groupIndex[it.group]].items.push(it);
      });

      groups.forEach(function (g) {
        const card = el("div", { class: "bx-card" });
        card.appendChild(el("div", { class: "bx-card-title", text: g.label }));
        card.appendChild(el("div", { class: "bx-card-sub",
          text: g.label === "Brand"
            ? "Travels with the exported config — no need to drop into demo/assets/."
            : "These flow into every slide in your deck that uses them." }));
        g.items.forEach(function (it) { card.appendChild(assetRow(s, it)); });
        wrap.appendChild(card);
      });
    }

    // Pending text fields card — inline editors. None of these are
    // required to export; they're surfaced here so the SE can polish
    // default / empty copy in one place. Edits write straight to the
    // canonical state path, so changes show up on the source step too.
    const pending = pendingTextItems(s);
    const card = el("div", { class: "bx-card" });
    card.appendChild(el("div", { class: "bx-card-title", text: "Text still to update" }));
    card.appendChild(el("div", { class: "bx-card-sub",
      text: pending.length
        ? "Default copy you might want to replace before presenting. Saved as you type — none of this blocks export."
        : "Every default field has been filled in. You're good to go." }));
    pending.forEach(function (item) {
      card.appendChild(pendingTextRow(item));
    });
    wrap.appendChild(card);

    wrap.appendChild(stepFooter("assets"));
    return wrap;
  }

  // Single asset slot row: thumbnail + filename + file picker + clear.
  function assetRow(s, item) {
    // Brand assets live on state.brand.* for back-compat with the
    // Step 1 logo picker — everything else lives on assetLibrary.
    function read() {
      if (item.slot === "brand.logoPath") return s.brand.logoPath || "";
      return (s.assetLibrary && s.assetLibrary[item.slot]) || "";
    }
    function write(value) {
      if (item.slot === "brand.logoPath") { s.brand.logoPath = value; }
      else { s.assetLibrary[item.slot] = value; }
    }

    const wrap = el("div", { class: "bx-asset-row" });
    const thumb = el("div", { class: "bx-asset-thumb" });
    function refreshThumb() {
      thumb.innerHTML = "";
      const v = read();
      if (v) {
        const img = el("img", { src: v, alt: item.label, class: "bx-asset-img" });
        thumb.appendChild(img);
      } else {
        thumb.appendChild(el("div", { class: "bx-asset-thumb-placeholder", text: "No file" }));
      }
    }
    refreshThumb();
    wrap.appendChild(thumb);

    const meta = el("div", { class: "bx-asset-meta" });
    meta.appendChild(el("div", { class: "bx-asset-label", text: item.label }));
    meta.appendChild(el("div", { class: "bx-asset-help", text: item.help }));
    const status = el("div", { class: "bx-asset-status" });
    function refreshStatus() {
      status.innerHTML = "";
      const v = read();
      if (!v) {
        status.appendChild(el("span", { class: "bx-rec-pill tone-gold", text: "Empty" }));
      } else if (/^data:/i.test(v)) {
        status.appendChild(el("span", { class: "bx-rec-pill tone-good", text: "Uploaded" }));
      } else {
        status.appendChild(el("span", { class: "bx-rec-pill tone-good", text: "Path set" }));
      }
      // Surface the Aubrey origin if this slot was seeded by a CX pull
      // and the user hasn't replaced it. Cleared once the slot is empty
      // or has a different value than what Aubrey provided.
      if (item.slot === "productHero" && v && s._aubreySeededProductHero) {
        status.appendChild(el("span", { class: "bx-rec-pill tone-blue", text: "✨ Seeded from Aubrey" }));
      }
    }
    refreshStatus();
    meta.appendChild(status);
    wrap.appendChild(meta);

    const controls = el("div", { class: "bx-asset-controls" });
    const file = el("input", { type: "file", accept: item.accept || "image/*",
      class: "bx-file-input", "aria-label": "Upload " + item.label });
    file.addEventListener("change", function () {
      const f = file.files && file.files[0];
      if (!f) return;
      const mb = f.size / (1024 * 1024);
      // Soft warning over 8MB — data URLs are base64, so config size
      // grows ~33% on top of file size. We let SEs upload anyway since
      // GIFs and persona videos can legitimately be large; we just
      // surface that the export will be a chunky file.
      const sizeNote = mb > 8 ? " (" + mb.toFixed(1) + "MB — heads up, the export config will be larger)" : "";
      const reader = new FileReader();
      reader.onload = function () {
        write(String(reader.result || ""));
        if (item.slot === "productHero") s._aubreySeededProductHero = false;
        refreshThumb(); refreshStatus();
        commit();
        toast(item.label + " uploaded" + sizeNote);
      };
      reader.onerror = function () { toast("Could not read that file"); };
      reader.readAsDataURL(f);
    });
    controls.appendChild(file);

    const clear = el("button", { class: "bx-mini-btn is-danger",
      type: "button", "aria-label": "Clear", text: "Clear" });
    clear.addEventListener("click", function () {
      write(""); file.value = "";
      if (item.slot === "productHero") s._aubreySeededProductHero = false;
      refreshThumb(); refreshStatus(); commit();
    });
    controls.appendChild(clear);

    wrap.appendChild(controls);
    return wrap;
  }

  // Single pending-text row: label + source chip + inline editor.
  // Read-only items just show a hint (e.g. "no personas added yet").
  function pendingTextRow(item) {
    const wrap = el("div", { class: "bx-pending-row" });
    const head = el("div", { class: "bx-pending-head" }, [
      el("div", { class: "bx-pending-label", text: item.label }),
      item.source ? el("span", { class: "bx-pending-source", text: item.source }) : null,
    ]);
    wrap.appendChild(head);

    if (item.readonly) {
      wrap.appendChild(el("div", { class: "bx-pending-hint", text: item.hint || "" }));
      return wrap;
    }

    let input;
    if (item.type === "textarea") {
      input = el("textarea", { class: "bx-textarea", placeholder: item.placeholder || "" });
      input.value = item.get();
    } else if (item.type === "select") {
      input = el("select", { class: "bx-input" });
      (item.options || []).forEach(function (opt) {
        const o = el("option", { value: opt.value, text: opt.label });
        input.appendChild(o);
      });
      input.value = item.get();
    } else {
      input = el("input", { type: "text", class: "bx-input",
        placeholder: item.placeholder || "", value: item.get() });
    }
    const status = el("span", { class: "bx-rec-pill tone-gold bx-pending-pill", text: "Empty" });
    function refreshStatus() {
      const filled = !!String(input.value || "").trim();
      // Selects with a sensible blank default ("she/her") shouldn't
      // read as "Empty" — they read as "Default" instead.
      if (item.type === "select" && !filled) {
        status.textContent = "Default";
        status.className = "bx-rec-pill bx-pending-pill tone-gold";
        return;
      }
      status.textContent = filled ? "Saved" : "Empty";
      status.className = "bx-rec-pill bx-pending-pill " + (filled ? "tone-good" : "tone-gold");
    }
    refreshStatus();
    const evt = (item.type === "select") ? "change" : "input";
    input.addEventListener(evt, function () {
      item.set(input.value);
      refreshStatus();
      commit();
    });
    head.appendChild(status);
    wrap.appendChild(input);
    if (item.hint) wrap.appendChild(el("div", { class: "bx-pending-hint", text: item.hint }));
    return wrap;
  }

  // Side panel for Step 7: short progress summary.
  function sideAssetSummary(body) {
    const s = app.state;
    const items = relevantAssetItems(s);
    if (!items.length) {
      body.appendChild(el("div", { class: "bx-side-empty",
        text: "Pick slides on Step 5 — we'll surface every image slot they use." }));
      return;
    }
    const filled = items.filter(function (it) {
      if (it.slot === "brand.logoPath") return !!(s.brand && s.brand.logoPath);
      return !!(s.assetLibrary && s.assetLibrary[it.slot]);
    }).length;
    body.appendChild(el("div", { class: "bx-side-card" }, [
      el("div", { class: "bx-side-card-title", text: filled + " of " + items.length + " uploaded" }),
      el("div", { class: "bx-side-card-sub",
        text: filled === items.length
          ? "Every relevant slot has an asset. You're ready to preview."
          : "Anything left empty stays as a clean placeholder in the demo." }),
    ]));
  }

  // ─── STEP 6: SLIDE SELECTION (section-grouped) ────────────────
  // Two view modes: "grid" (card thumbnails, default) and "list"
  // (vertical rows with full title + status pill). Persists per
  // browser via localStorage so SEs don't have to re-pick each time.
  function getRecsViewMode() {
    try {
      const v = localStorage.getItem("bx-recs-view");
      return v === "list" ? "list" : "grid";
    } catch (e) { return "grid"; }
  }
  function setRecsViewMode(mode) {
    try { localStorage.setItem("bx-recs-view", mode); } catch (e) {}
  }

  function viewRecommendations() {
    const wrap = el("div");
    wrap.appendChild(stepHeader(
      "Step 5 · Slide Selection",
      "Every slide in your demo — toggle any off",
      "These are the exact slides that will be generated, grouped by section, all on by default. Turn off anything you don't want, rename inline, or expand a card for details."
    ));
    const s = app.state;

    if (!s.recommendations.length) {
      wrap.appendChild(el("div", { class: "bx-empty",
        html: "We need a bit more input before we can recommend things. <strong>Go back to Step 1 or 2</strong> and add a customer, audience, or products." }));
      wrap.appendChild(stepFooter("recs"));
      return wrap;
    }

    // Section-grouped plan (fixed sections from the manifest + demo from RULES).
    const plan = RULES.generateRecommendedNarrativePlan ? RULES.generateRecommendedNarrativePlan(s) : null;

    if (plan) {
      const banner = el("div", { class: "bx-card" });
      banner.appendChild(el("div", { class: "bx-card-title", text: "Your slide plan" }));
      banner.appendChild(el("div", { class: "bx-card-sub", text: "Every generated slide appears below, pre-selected. De-select any to drop it from the preview and the exported deck." }));
      banner.appendChild(el("div", { class: "bx-row bx-mt-12" }, [
        btn("Build slide plan from selections →", "bx-btn-primary", function () {
          buildSlidePlanFromSelections();
          app.state.step = "preview"; renderShell(); commit();
        }),
        btn("Run Story Quality Check", "bx-btn-ghost", function () { openStoryQualityModal(); }),
      ]));
      wrap.appendChild(banner);

      // View-mode toggle (Grid / List)
      const mode = getRecsViewMode();
      wrap.appendChild(viewModeToggle(mode));

      // Section-grouped recommendation cards
      plan.sections.forEach(function (sec) {
        const c = el("div", { class: "bx-card bx-section-card" });
        const selectedCount = sec.slides.filter(function (r) { return s.selectedRecIds[r.id]; }).length;
        const head = el("div", { class: "bx-section-head" }, [
          el("div", { class: "bx-section-num", text: String(sec.order) }),
          el("div", { class: "bx-section-meta" }, [
            el("div", { class: "bx-section-label", text: sec.label }),
            sec.purpose ? el("div", { class: "bx-section-purpose", text: sec.purpose }) : null,
          ]),
          el("div", { class: "bx-section-count", text: selectedCount + " of " + sec.slides.length + " selected" }),
        ]);
        c.appendChild(head);

        // Per-section bulk actions
        if (sec.slides.length) {
          c.appendChild(sectionBulkActions(sec));
        }

        if (!sec.slides.length) {
          c.appendChild(el("div", { class: "bx-empty",
            html: "No suggestions for this section yet. Add inputs in earlier steps." }));
        } else if (mode === "grid") {
          const grid = el("div", { class: "bx-rec-grid" });
          sec.slides.forEach(function (r) { grid.appendChild(recGridCard(r)); });
          c.appendChild(grid);
        } else {
          sec.slides.forEach(function (r) { c.appendChild(recCard(r)); });
        }
        wrap.appendChild(c);
      });
    } else {
      // Fallback: flat list (older logic)
      const groups = {
        slide:        { label: "Slides & Sections" },
        deviceMoment: { label: "Device Moments" },
        kpi:          { label: "KPI / Value Cards" },
      };
      const order = ["slide", "deviceMoment", "kpi"];
      order.forEach(function (key) {
        const items = s.recommendations.filter(function (r) { return r.type === key; });
        if (!items.length) return;
        const c = el("div", { class: "bx-card" });
        c.appendChild(el("div", { class: "bx-card-title", text: groups[key].label }));
        items.forEach(function (r) { c.appendChild(recCard(r)); });
        wrap.appendChild(c);
      });
      const action = el("div", { class: "bx-row bx-mt-18" });
      action.appendChild(btn("Build slide plan from selections →", "bx-btn-primary", function () {
        buildSlidePlanFromSelections();
        app.state.step = "preview"; renderShell(); commit();
      }));
      wrap.appendChild(action);
    }

    wrap.appendChild(stepFooter("recs"));
    return wrap;
  }

  // ─── View-mode segmented toggle (Grid / List) ────────────────
  function viewModeToggle(active) {
    const wrap = el("div", { class: "bx-recs-toolbar" });
    const seg = el("div", { class: "bx-segmented" });
    ["grid", "list"].forEach(function (mode) {
      const b = el("button", {
        type: "button",
        class: "bx-seg-btn" + (mode === active ? " is-on" : ""),
        text: mode === "grid" ? "Grid" : "List",
      });
      b.addEventListener("click", function () {
        if (mode === active) return;
        setRecsViewMode(mode);
        renderMain();
      });
      seg.appendChild(b);
    });
    wrap.appendChild(seg);
    return wrap;
  }

  // ─── Per-section "Select all / Clear" actions ───────────────
  function sectionBulkActions(sec) {
    const s = app.state;
    const bar = el("div", { class: "bx-section-actions" });
    const allLink = el("button", { type: "button", class: "bx-btn-link bx-section-link", text: "Select all" });
    const noneLink = el("button", { type: "button", class: "bx-btn-link bx-section-link", text: "Clear" });
    allLink.addEventListener("click", function () {
      sec.slides.forEach(function (r) { s.selectedRecIds[r.id] = true; });
      s.recommendations.forEach(function (r) { if (s.selectedRecIds[r.id]) r.selected = true; });
      buildSlidePlanFromSelections();
      renderMain(); renderSide(); commit();
    });
    noneLink.addEventListener("click", function () {
      sec.slides.forEach(function (r) { delete s.selectedRecIds[r.id]; });
      s.recommendations.forEach(function (r) { if (!s.selectedRecIds[r.id]) r.selected = false; });
      buildSlidePlanFromSelections();
      renderMain(); renderSide(); commit();
    });
    bar.appendChild(allLink);
    bar.appendChild(noneLink);
    return bar;
  }

  function recCard(r) {
    const isOn = !!app.state.selectedRecIds[r.id];
    const card = el("div", { class: "bx-rec" + (isOn ? " is-on" : "") });

    // Real checkbox — keyboard- and screen-reader-accessible.
    const checkboxId = "bx-rec-cb-" + r.id;
    const check = el("input", { type: "checkbox", class: "bx-rec-check", id: checkboxId });
    if (isOn) check.setAttribute("checked", "checked");
    check.addEventListener("change", function () { toggleRec(r.id); });
    check.addEventListener("click", function (e) { e.stopPropagation(); });

    const body = el("div", { class: "bx-rec-body" });

    // Header row: title + a single status pill. Capabilities, layout,
    // audience, and missing-inputs detail moves into the disclosure.
    const row = el("div", { class: "bx-rec-row" });
    const titleInput = el("input", { type: "text", class: "bx-input",
      style: "max-width: 380px; padding: 6px 10px; font-size: 13px; font-weight: 700;",
      "aria-label": "Slide title",
      value: app.state.customRecTitles[r.id] || r.title });
    titleInput.addEventListener("input", function () {
      app.state.customRecTitles[r.id] = titleInput.value; commit();
    });
    titleInput.addEventListener("click", function (e) { e.stopPropagation(); });
    row.appendChild(titleInput);

    // One single status badge — derived from the most important signal.
    row.appendChild(statusPill(r));

    body.appendChild(row);
    body.appendChild(el("div", { class: "bx-rec-why", text: r.rationale || "Suggested based on your inputs." }));

    // ── Details disclosure (collapsed by default) ─────────────
    const detailsRow = el("details", { class: "bx-rec-details" });
    const summary = el("summary", { class: "bx-rec-details-summary", text: "Details" });
    detailsRow.appendChild(summary);
    const detailsBody = el("div", { class: "bx-rec-details-body" });

    if (r.layout) {
      detailsBody.appendChild(detailRow("Layout", layoutLabelShort(r.layout)));
    }
    if ((r.capabilities || []).length) {
      detailsBody.appendChild(detailRow("Capabilities", r.capabilities.join(" · ")));
    }
    if ((r.audienceTags || []).length) {
      detailsBody.appendChild(detailRow("Audience", r.audienceTags.join(", ")));
    }
    if (r.missingInputs && r.missingInputs.length) {
      detailsBody.appendChild(detailRow("Missing", r.missingInputs.join(", ")));
    }
    if (r.layout === "embeddedCxComponent" && !(app.state.cxComponents || []).length) {
      detailsBody.appendChild(detailRow("Status", "Needs an AubreyDemo URL"));
    }
    if (typeof r.priority === "number") {
      detailsBody.appendChild(detailRow("Score", String(r.priority)));
    }
    detailsRow.appendChild(detailsBody);
    summary.addEventListener("click", function (e) { e.stopPropagation(); });
    body.appendChild(detailsRow);

    // The card itself is a label so clicking anywhere toggles the
    // checkbox — except inputs/buttons/details, which stop propagation.
    const label = el("label", { class: "bx-rec-label", for: checkboxId });
    label.appendChild(check);
    label.appendChild(body);
    card.appendChild(label);
    return card;
  }

  // ─── Grid-mode card: thumbnail + title + corner select badge ──
  // Stays state-compatible with recCard: same selectedRecIds key,
  // same toggleRec call. The thumbnail uses the existing PREVIEW
  // pipeline scaled inside a fixed-aspect frame so all cards align.
  function recGridCard(r) {
    const s = app.state;
    const isOn = !!s.selectedRecIds[r.id];

    // Build a transient "slide" shape so the preview renderer can
    // run before the user has built the slide plan. This mirrors
    // the real shape buildSlidePlanFromSelections would produce.
    const transientSlide = {
      id: r.id,
      title: s.customRecTitles[r.id] || r.title,
      layout: r.layout,
      sectionId: r.sectionId || (RULES.layoutToSectionId ? RULES.layoutToSectionId(r.layout) : ""),
      capabilities: r.capabilities ? r.capabilities.slice() : [],
      assets: [],
      contentBlocks: ((RULES.LAYOUTS && RULES.LAYOUTS[r.layout] && RULES.LAYOUTS[r.layout].blocks) || []).slice(),
      persona: (s.personas && s.personas[0]) ? s.personas[0].name : null,
      linkedCxComponentIds: [],
      missingInputs: r.missingInputs || [],
    };

    const card = el("div", {
      class: "bx-rec-gcard surface" + (isOn ? " is-on" : ""),
      role: "button",
      tabindex: "0",
      "aria-pressed": isOn ? "true" : "false",
    });

    // Click anywhere on the card toggles selection (except inputs).
    function toggle(e) { if (e) e.stopPropagation(); toggleRec(r.id); }
    card.addEventListener("click", function (e) {
      if (e.target.closest("input, button, summary, .bx-rec-gcard-title")) return;
      toggle();
    });
    card.addEventListener("keydown", function (e) {
      if (e.key === " " || e.key === "Enter") { e.preventDefault(); toggle(); }
    });

    // Corner select badge (acts as a visual checkbox)
    const badge = el("span", { class: "bx-rec-gcard-badge" + (isOn ? " is-on" : ""), "aria-hidden": "true" });
    if (isOn) badge.textContent = "✓";
    card.appendChild(badge);

    // Single status pill in top-right (re-uses existing styles)
    card.appendChild(statusPill(r));

    // Thumbnail frame holds a scaled-down .hp preview
    const thumb = el("div", { class: "bx-rec-gcard-thumb" });
    try {
      const inner = PREVIEW.renderSlidePreview(transientSlide, s, "compact");
      thumb.appendChild(inner);
    } catch (err) {
      thumb.appendChild(el("div", { class: "bx-rec-gcard-fallback", text: layoutLabelShort(r.layout) }));
    }
    card.appendChild(thumb);

    // Editable title (same field as list mode)
    const title = el("input", {
      type: "text",
      class: "bx-rec-gcard-title",
      "aria-label": "Slide title",
      value: s.customRecTitles[r.id] || r.title,
    });
    title.addEventListener("input", function () {
      s.customRecTitles[r.id] = title.value;
      commit();
    });
    title.addEventListener("click", function (e) { e.stopPropagation(); });
    card.appendChild(title);

    // Subline: layout label
    card.appendChild(el("div", { class: "bx-rec-gcard-meta", text: layoutLabelShort(r.layout) }));

    return card;
  }

  // Single derived status badge. Order of precedence: missing-input >
  // needs-iframe > required > recommended > optional.
  function statusPill(r) {
    if (r.missingInputs && r.missingInputs.length) {
      return el("span", { class: "bx-rec-pill tone-gold", text: "Needs input" });
    }
    if (r.layout === "embeddedCxComponent" && !(app.state.cxComponents || []).length) {
      return el("span", { class: "bx-rec-pill tone-gold", text: "Needs iframe" });
    }
    if (r.selectionStatus === "required")    return el("span", { class: "bx-rec-pill tone-red",  text: "Required" });
    if (r.selectionStatus === "recommended") return el("span", { class: "bx-rec-pill tone-good", text: "Recommended" });
    return el("span", { class: "bx-rec-pill", text: "Optional" });
  }

  function detailRow(label, value) {
    return el("div", { class: "bx-rec-detail-row" }, [
      el("span", { class: "bx-rec-detail-label", text: label }),
      el("span", { class: "bx-rec-detail-value", text: value }),
    ]);
  }

  function layoutLabelShort(layout) {
    return ({
      hero: "Hero", storyFoundation: "Story Foundation", currentFutureState: "Before/After",
      futureState: "Future State", journeyTimeline: "Journey", demoMap: "Demo Map",
      personaCard: "Persona", agentConversation: "Agent", unifiedProfile: "Profile",
      architecture: "Architecture", deviceMoment: "Device", embeddedCxComponent: "Embedded CX",
      kpiScorecard: "KPI", executiveSummary: "Takeaway", nextSteps: "Roadmap",
    })[layout] || layout;
  }

  function toggleRec(id) {
    app.state.selectedRecIds[id] = !app.state.selectedRecIds[id];
    app.state.recommendations.forEach(function (r) { if (r.id === id) r.selected = app.state.selectedRecIds[id]; });
    // Rebuild the slide plan from the current selections so Preview
    // and Export see exactly what the SE picked.  Without this, the
    // stored state.slides stays frozen at whatever was last built and
    // additional selections never reach the preview / ZIP.
    buildSlidePlanFromSelections();
    renderMain(); renderSide(); commit();
  }

  // ─── STEP 7: PREVIEW ──────────────────────────────────────────
  function viewPreview() {
    const wrap = el("div");
    wrap.appendChild(stepHeader(
      "Step 8 · Preview",
      "Preview the holodeck",
      "Review how the story will feel before downloading the complete demo package. What you see here is what the exported demo will render."
    ));

    // Runtime manifest: every slide the polished /demo template renders,
    // including the hardcoded intro / persona / journey-map / business-value
    // slides — merged with state.slides for the Demo section. SEs see the
    // full deck even before they pick layouts in Step 5.
    const runtimeSlides = (PREVIEW.enumerateRuntimeSlides ? PREVIEW.enumerateRuntimeSlides(app.state) : (app.state.slides || []));

    // ── Summary panel: total / sections / missing / ready? ──
    const s = app.state;
    const slides = s.slides || [];
    const cx = (s.cxComponents || []);
    const cxWithoutUrl = cx.filter(function (c) { return !c.url; }).length;
    const slidesNeedingCx = slides.filter(function (sl) {
      return sl.layout === "embeddedCxComponent" && (!(sl.linkedCxComponentIds || []).length);
    }).length;
    const slidesWithMissing = slides.filter(function (sl) { return (sl.missingInputs || []).length > 0; }).length;
    const sectionsCovered = new Set(runtimeSlides.map(function (sl) { return sl.sectionId; })).size;
    const summary = el("div", { class: "bx-card bx-preview-summary" });
    summary.appendChild(el("div", { class: "bx-card-title", text: "Demo summary" }));
    summary.appendChild(el("div", { class: "bx-summary-grid" }, [
      summaryStat(runtimeSlides.length, "slides total"),
      summaryStat(sectionsCovered + " / 5", "sections covered"),
      summaryStat(cx.length, "CX component" + (cx.length === 1 ? "" : "s")),
      summaryStat(slidesWithMissing, "slides need attention", slidesWithMissing > 0 ? "warn" : "good"),
    ]));
    if (slidesNeedingCx || cxWithoutUrl || slidesWithMissing) {
      const issues = el("ul", { class: "bx-preview-issues" });
      if (slidesNeedingCx)   issues.appendChild(el("li", { text: slidesNeedingCx + " embedded CX slide" + (slidesNeedingCx === 1 ? "" : "s") + " need a link" }));
      if (cxWithoutUrl)      issues.appendChild(el("li", { text: cxWithoutUrl + " CX component" + (cxWithoutUrl === 1 ? "" : "s") + " missing a URL" }));
      if (slidesWithMissing) issues.appendChild(el("li", { text: slidesWithMissing + " slide" + (slidesWithMissing === 1 ? "" : "s") + " flagged with missing inputs" }));
      summary.appendChild(issues);
    } else {
      summary.appendChild(el("div", { class: "bx-help bx-mt-12 bx-help-good",
        text: "✓ Everything looks good. Move on to Export when you're ready." }));
    }
    summary.appendChild(el("div", { class: "bx-row bx-mt-12" }, [
      btn("Continue to Export →", "bx-btn-primary", function () {
        app.state.step = "export"; renderShell();
      }),
      btn("▶ Preview Full Demo", "bx-btn-secondary", function () { openFullDemoModal(); }),
    ]));
    wrap.appendChild(summary);

    function summaryStat(value, label, tone) {
      return el("div", { class: "bx-summary-stat " + (tone ? "is-" + tone : "") }, [
        el("div", { class: "bx-summary-value", text: String(value) }),
        el("div", { class: "bx-summary-label", text: label }),
      ]);
    }

    // View controls: compact/expanded + by-section/flat
    // (Preview Full Demo button now lives in the summary card above.)
    const toolbar = el("div", { class: "bx-preview-toolbar" }, [
      el("div", { class: "bx-row" }, [
        el("div", { class: "bx-segmented" }, [
          modeBtn("compact",  "Compact"),
          modeBtn("expanded", "Expanded"),
        ]),
        el("div", { class: "bx-segmented" }, [
          groupBtn("by-section", "By section"),
          groupBtn("flat",       "Flat sequence"),
        ]),
      ]),
    ]);
    wrap.appendChild(toolbar);

    if (app.previewGrouping === "by-section") {
      // Section-grouped preview — uses the runtime manifest so SEs see
      // every slide the polished template will render, including the
      // intro / persona / BV slides that aren't in state.slides.
      const sections = (RULES.SLIDE_SECTIONS || []);
      sections.forEach(function (sec) {
        const slidesInSection = runtimeSlides.filter(function (sl) { return sl.sectionId === sec.id; });
        if (!slidesInSection.length) return;
        const sectionWrap = el("div", { class: "bx-preview-section" });
        const label = RULES.sectionLabelFor(sec, app.state);
        sectionWrap.appendChild(el("div", { class: "bx-preview-section-head" }, [
          el("div", { class: "bx-preview-section-num", text: String(sec.order) }),
          el("div", {}, [
            el("div", { class: "bx-preview-section-label", text: label }),
            sec.purpose ? el("div", { class: "bx-preview-section-purpose", text: sec.purpose }) : null,
          ]),
          el("div", { class: "bx-preview-section-count", text: slidesInSection.length + " slide" + (slidesInSection.length === 1 ? "" : "s") }),
        ]));
        const grid = el("div", { class: "bx-preview-grid bx-preview-" + app.previewMode });
        slidesInSection.forEach(function (sl, i) {
          const slide = Object.assign({}, sl, { order: i });
          grid.appendChild(makePreviewCard(slide));
        });
        sectionWrap.appendChild(grid);
        wrap.appendChild(sectionWrap);
      });
    } else {
      // Flat sequence — same merged manifest, in order.
      const grid = el("div", { class: "bx-preview-grid bx-preview-" + app.previewMode });
      runtimeSlides.forEach(function (sl, i) {
        const slide = Object.assign({}, sl, { order: i });
        grid.appendChild(makePreviewCard(slide));
      });
      wrap.appendChild(grid);
    }

    wrap.appendChild(el("div", { class: "bx-row bx-mt-18" }, [
      (function () { const b = el("button", { class: "bx-btn bx-btn-secondary", text: "← Back to slide plan" });
        b.addEventListener("click", function () { app.state.step = "recs"; renderShell(); }); return b; })(),
      (function () { const b = el("button", { class: "bx-btn bx-btn-primary", text: "Continue to export →" });
        b.addEventListener("click", function () { app.state.step = "export"; renderShell(); }); return b; })(),
    ]));
    return wrap;

    function modeBtn(id, label) {
      const isOn = app.previewMode === id;
      const b = el("button", { class: "bx-seg-btn" + (isOn ? " is-on" : ""), text: label });
      b.addEventListener("click", function () { app.previewMode = id; renderMain(); });
      return b;
    }
    function groupBtn(id, label) {
      const isOn = app.previewGrouping === id;
      const b = el("button", { class: "bx-seg-btn" + (isOn ? " is-on" : ""), text: label });
      b.addEventListener("click", function () { app.previewGrouping = id; renderMain(); });
      return b;
    }
    function makePreviewCard(slide) {
      // Synthetic runtime slides (intro hero, persona spotlight, BV
      // closing, etc.) aren't in state.slides — they're rendered by
      // the template at runtime. Move/remove don't apply to them.
      const handlers = { mode: app.previewMode };
      handlers.onEdit = function (s, anchorBtn) {
        openSlideTextPopover(s, anchorBtn);
      };
      if (!slide.synthetic) {
        handlers.onMoveUp   = function (id) { moveItem(app.state.slides, id, -1); renderSide(); };
        handlers.onMoveDown = function (id) { moveItem(app.state.slides, id, 1); renderSide(); };
        handlers.onRemove   = function (id) {
          app.state.slides = app.state.slides.filter(function (x) { return x.id !== id; });
          renderMain(); renderSide(); commit();
        };
      }
      return PREVIEW.renderPreviewCard(slide, app.state, handlers);
    }
  }

  // ─── Step 8 popover editor (Option #2) ────────────────────────
  // Renders the inline text editor next to whichever preview card
  // the SE clicked "Edit text" on. Edits flow through state-path
  // bindings (synthetic slides) or direct slide fields (state.slides),
  // and re-render the preview card in place so the SE sees their
  // change immediately.
  let _activePopover = null;
  function closeSlidePopover() {
    if (_activePopover && _activePopover.parentNode) {
      _activePopover.parentNode.removeChild(_activePopover);
    }
    _activePopover = null;
    document.removeEventListener("click", onDocClickForPopover, true);
    document.removeEventListener("keydown", onEscForPopover, true);
  }
  function onDocClickForPopover(e) {
    if (!_activePopover) return;
    if (_activePopover.contains(e.target)) return;
    // The Edit-text button itself toggles. If they clicked another
    // Edit button on a different card, let it through (the openSlide…
    // call below will close + reopen).
    if (e.target.closest && e.target.closest(".bx-mini-btn-edit")) return;
    closeSlidePopover();
  }
  function onEscForPopover(e) { if (e.key === "Escape") closeSlidePopover(); }
  function openSlideTextPopover(slide, anchorBtn) {
    closeSlidePopover();
    const card = anchorBtn.closest(".bx-preview");
    if (!card) return;
    const pop = PREVIEW.buildEditorPopover(slide, app.state, {
      onChange: function () {
        commit();
        // Re-render the preview body in place — keeps the popover open
        // and avoids tearing down the whole preview grid on each keystroke.
        const body = card.querySelector(".hp");
        if (body && body.parentNode) {
          const fresh = PREVIEW.renderSlidePreview(slide, app.state, app.previewMode);
          body.parentNode.replaceChild(fresh, body);
        }
      },
      onClose: closeSlidePopover,
    });
    // Anchor the popover absolutely so it sits beside the card no
    // matter where the SE has scrolled. We position it via getBoundingClientRect
    // and let CSS handle responsive collapse (under the card on narrow viewports).
    pop.style.position = "absolute";
    document.body.appendChild(pop);
    const r = card.getBoundingClientRect();
    const popW = 360;
    const margin = 12;
    let left = r.right + margin + window.scrollX;
    let top  = r.top + window.scrollY;
    // If we'd overflow the viewport on the right, flip to the left side.
    if (left + popW > window.innerWidth + window.scrollX - 12) {
      left = Math.max(12 + window.scrollX, r.left + window.scrollX - popW - margin);
    }
    pop.style.left = left + "px";
    pop.style.top  = top  + "px";
    pop.style.width = popW + "px";
    _activePopover = pop;
    // Defer doc-click binding so this very click doesn't close it.
    setTimeout(function () {
      document.addEventListener("click", onDocClickForPopover, true);
      document.addEventListener("keydown", onEscForPopover, true);
    }, 0);
  }

  // Section ordering used by the slide planner.
  const SECTION_ORDER = ["intro", "journey-map", "meet-persona", "demo", "business-value"];

  function buildSlidePlanFromSelections() {
    const s = app.state;
    const existingById = {};
    (s.slides || []).forEach(function (sl) { existingById[sl.id] = sl; });
    // Only DEMO-section recommendations become state.slides. The synthetic
    // intro/journey/persona/bv slides are rendered by buildSlideManifest from
    // the selection directly (they must NOT be pushed into state.slides, or
    // they'd be treated as authored demo slides and double-render).
    const fixedSections = RULES.MANIFEST_SECTIONS || ["intro", "journey-map", "meet-persona", "business-value"];
    const selectedRecs = s.recommendations.filter(function (r) {
      return s.selectedRecIds[r.id] && !r.synthetic && fixedSections.indexOf(r.sectionId || "demo") < 0;
    });

    // Sort: first by section order, then by priority within section.
    const ordered = selectedRecs.slice().sort(function (a, b) {
      const sa = SECTION_ORDER.indexOf(a.sectionId || "demo");
      const sb = SECTION_ORDER.indexOf(b.sectionId || "demo");
      if (sa !== sb) return sa - sb;
      // Within section, hero before others, takeaway last
      if (a.id === "slide-hero" && b.id !== "slide-hero") return -1;
      if (b.id === "slide-hero" && a.id !== "slide-hero") return 1;
      if (a.id === "slide-executive-takeaway" && b.id !== "slide-executive-takeaway") return 1;
      if (b.id === "slide-executive-takeaway" && a.id !== "slide-executive-takeaway") return -1;
      return b.priority - a.priority;
    });

    // Build map of slide.id -> [cxComponentId] from explicit user links.
    // Components without a linkedSlideIds entry fall back to "first embedded slot".
    const cxAll = s.cxComponents || [];
    const explicitBySlide = {};
    cxAll.forEach(function (c) {
      const slideId = (c.linkedSlideIds && c.linkedSlideIds[0]) || "";
      if (slideId) {
        explicitBySlide[slideId] = explicitBySlide[slideId] || [];
        explicitBySlide[slideId].push(c.id);
      }
    });
    const unassignedCx = cxAll.filter(function (c) {
      return !(c.linkedSlideIds && c.linkedSlideIds[0]);
    });

    s.slides = ordered.map(function (r) {
      const id = r.id;
      const existing = existingById[id];
      const persona = (s.personas && s.personas[0]) ? s.personas[0].name : null;
      // Resolve linked CX components for this slide:
      //   1) Honor explicit user links (cxComponent.linkedSlideIds[0] === slide.id).
      //   2) For embeddedCxComponent slides with no explicit link, fall back
      //      to the first unassigned component so we don't leave the slot empty.
      let linkedCx = (explicitBySlide[id] || []).slice();
      if (!linkedCx.length && r.layout === "embeddedCxComponent" && unassignedCx.length) {
        linkedCx = [unassignedCx[0].id];
      }
      const firstCx = linkedCx.length ? cxAll.find(function (c) { return c.id === linkedCx[0]; }) : null;
      const deviceFrame = firstCx ? (firstCx.deviceFrame || "") : "";

      // PROMOTION RULE: the demo runtime only renders an iframe when
      // slide.layout === "embeddedCxComponent". So if the SE explicitly
      // linked a CX component to this slide, promote the layout — the
      // user's intent is "this slide should be the live screen". We
      // remember the original layout so a later un-link can revert it.
      let effectiveLayout = r.layout;
      const wasExplicitlyLinked = !!(explicitBySlide[id] && explicitBySlide[id].length);
      if (wasExplicitlyLinked && effectiveLayout !== "embeddedCxComponent") {
        effectiveLayout = "embeddedCxComponent";
      }

      // Reuse existing slide so the user's edits (title, notes, assets) survive
      // re-renders, but always refresh the CX wiring from the current links.
      if (existing) {
        existing.linkedCxComponentIds = linkedCx;
        existing.deviceFrame = deviceFrame || existing.deviceFrame || "";
        if (wasExplicitlyLinked) {
          // Record the original layout once so we can revert if the SE
          // later clears the link.
          if (existing.layout !== "embeddedCxComponent" && !existing._originalLayout) {
            existing._originalLayout = existing.layout;
          }
          existing.layout = "embeddedCxComponent";
        } else if (existing._originalLayout && !linkedCx.length) {
          // Link removed — revert to the original recommendation layout.
          existing.layout = existing._originalLayout;
          delete existing._originalLayout;
        }
        return existing;
      }
      return {
        id: id,
        title: s.customRecTitles[id] || r.title,
        layout: effectiveLayout,
        sectionId: r.sectionId || RULES.layoutToSectionId(r.layout),
        selectionStatus: r.selectionStatus || "",
        selectionRationale: r.rationale || "",
        readinessStatus: (r.missingInputs && r.missingInputs.length) ? "missing-inputs" : "ready",
        capabilities: r.capabilities ? r.capabilities.slice() : [],
        assets: [],
        contentBlocks: ((RULES.LAYOUTS[r.layout] && RULES.LAYOUTS[r.layout].blocks) || []).slice(),
        speakerNotes: "",
        persona: persona,
        linkedCxComponentIds: linkedCx,
        deviceFrame: deviceFrame,
        missingInputs: r.missingInputs || [],
        _originalLayout: (wasExplicitlyLinked && r.layout !== "embeddedCxComponent") ? r.layout : undefined,
      };
    });

    // Reconcile slideSections so the home/export shows accurate counts.
    s.slideSections = (RULES.SLIDE_SECTIONS || []).map(function (sec) {
      return {
        id: sec.id,
        label: sec.label,
        order: sec.order,
        required: sec.required,
        purpose: sec.purpose,
        dynamicLabelTemplate: sec.dynamicLabelTemplate || "",
        slideIds: s.slides.filter(function (sl) { return sl.sectionId === sec.id; }).map(function (sl) { return sl.id; }),
      };
    });
    commit();
  }

  // ─── STEP 5: EXPORT ───────────────────────────────────────────
  function viewExport() {
    const wrap = el("div");
    wrap.appendChild(stepHeader(
      "Step 9 · Export",
      "Download your demo",
      "Use Complete Demo ZIP for a ready-to-run package. Use Config only when you want to update an existing demo folder."
    ));
    const s = app.state;
    // Use the polished adapter's output for the visible config — this
    // is the file that drives the /demo template, so the SE sees the
    // exact shape they'll get inside the ZIP.  Fall back to the legacy
    // builder config only if the adapter isn't loaded.
    const cfgJs   = (window.HOLO_ADAPTER && window.HOLO_ADAPTER.toPolishedHolodeckConfigJs)
      ? window.HOLO_ADAPTER.toPolishedHolodeckConfigJs(s)
      : CONFIG.toHolodeckConfigJs(s);
    const cfgJson = CONFIG.toJsonString(s);

    // ── Readiness checklist ───────────────────────────────────
    const checks = buildExportChecklist(s);
    const incomplete = checks.filter(function (c) { return !c.done; }).length;
    const checkCard = el("div", { class: "bx-card" });
    checkCard.appendChild(el("div", { class: "bx-card-title", text: "Export readiness" }));
    checkCard.appendChild(el("div", { class: "bx-card-sub",
      text: incomplete === 0
        ? "Everything looks good. You're ready to download."
        : incomplete + " item" + (incomplete === 1 ? "" : "s") + " still need attention. You can export anyway — the placeholders will be flagged in the README." }));
    const list = el("ul", { class: "bx-checklist" });
    checks.forEach(function (c) {
      list.appendChild(el("li", { class: "bx-checklist-item " + (c.done ? "is-done" : "is-pending") }, [
        el("span", { class: "bx-checklist-icon", text: c.done ? "✓" : "○" }),
        el("span", { class: "bx-checklist-label", text: c.label }),
        c.hint ? el("span", { class: "bx-checklist-hint", text: c.hint }) : null,
      ]));
    });
    checkCard.appendChild(list);
    wrap.appendChild(checkCard);

    // ── Primary: Complete Demo ZIP ────────────────────────────
    const zipCard = el("div", { class: "bx-card bx-card-feature" });
    zipCard.appendChild(el("div", { class: "bx-card-title", text: "Download Complete Demo ZIP" }));
    zipCard.appendChild(el("div", { class: "bx-card-sub",
      text: "Use this when you want a ready-to-run demo folder with HTML, CSS, JS, config, assets, and instructions." }));
    const zipFiles = el("ul", { class: "bx-zip-tree" }, [
      el("li", { text: "📄 README.md  ·  HOW_TO_RUN.md" }),
      el("li", { text: "📁 demo/" }, [
        el("ul", {}, [
          el("li", { text: "index.html" }),
          el("li", { text: "holodeck.config.js  ·  data/holodeck-config.json" }),
          el("li", { text: "css/styles.css" }),
          el("li", { text: "js/app.js  ·  js/renderer.js" }),
          el("li", { text: "assets/  (with ASSET_INSTRUCTIONS.md)" }),
        ]),
      ]),
      el("li", { text: "📁 source/  (builder metadata for re-import)" }),
    ]);
    zipCard.appendChild(zipFiles);
    zipCard.appendChild(el("div", { class: "bx-row bx-mt-12" }, [
      btn("⬇ Download Complete Demo ZIP", "bx-btn-primary", function () {
        if (incomplete > 0) {
          if (!confirm("You can export now, but " + incomplete + " item" + (incomplete === 1 ? "" : "s") +
                       " still need attention. Export anyway?")) return;
        }
        toast("Building polished demo ZIP…");
        Promise.resolve(window.HOLO_ZIP.downloadCompleteDemoZip(s)).then(function (payload) {
          if (payload && payload.mode === "legacy") {
            toast("Exported (offline mode — open the builder via http:// for the polished template)");
          } else {
            toast("Polished demo ZIP downloaded");
          }
        }).catch(function (e) {
          toast("Couldn't build the ZIP: " + (e && e.message || e));
        });
      }),
    ]));
    wrap.appendChild(zipCard);

    // ── Secondary: config-only ─────────────────────────────────
    const c1 = el("div", { class: "bx-card" });
    c1.appendChild(el("div", { class: "bx-card-title", text: "Config only" }));
    c1.appendChild(el("div", { class: "bx-card-sub", text: "Use these to update a demo folder you already have." }));
    c1.appendChild(el("div", { class: "bx-row" }, [
      btn("Download Config JS", "bx-btn-secondary", function () {
        CONFIG.downloadFile("holodeck.config.js", cfgJs, "text/javascript"); toast("Downloaded");
      }),
      btn("Download JSON", "bx-btn-secondary", function () {
        CONFIG.downloadFile("holodeck-builder.json", cfgJson, "application/json"); toast("Downloaded");
      }),
      btn("Copy Config JS", "bx-btn-link", function () {
        CONFIG.copyToClipboard(cfgJs).then(function () { toast("Copied"); });
      }),
      btn("Copy JSON", "bx-btn-link", function () {
        CONFIG.copyToClipboard(cfgJson).then(function () { toast("Copied"); });
      }),
    ]));
    wrap.appendChild(c1);

    // ── Live config preview ───────────────────────────────────
    const c2 = el("div", { class: "bx-card" });
    c2.appendChild(el("div", { class: "bx-card-title", text: "Generated config" }));
    c2.appendChild(el("div", { class: "bx-card-sub", text: "Read-only preview of the holodeck.config.js that will ship in the ZIP." }));
    c2.appendChild(el("pre", { class: "bx-code", text: cfgJs }));
    wrap.appendChild(c2);

    return wrap;
  }

  // Export readiness — the user-facing checklist surfaced on Step 8.
  // Each item has { label, done, hint? }. Order matches the wizard.
  function buildExportChecklist(s) {
    const out = [];
    const setupReady = !!(s.project.customerName && s.project.industry && s.project.audience && s.project.salesStage && (s.project.products || []).length);
    const f = s.storyFoundations || {};
    const foundationsReady = !!(f.businessProblem && f.futureStateVision);
    out.push({ label: "Project setup complete", done: setupReady, hint: setupReady ? "" : "Customer, industry, audience, stage, and products" });
    out.push({ label: "Story foundations populated", done: foundationsReady, hint: foundationsReady ? "" : "Run Extract Story Foundations on Step 2" });
    out.push({ label: "Personas added", done: (s.personas || []).length > 0 });
    out.push({ label: "Story acts captured", done: (s.storyActs || []).length >= 3, hint: ((s.storyActs || []).length >= 3) ? "" : "3+ acts recommended" });
    out.push({ label: "Recommended narrative applied", done: (s.slides || []).length > 0 });
    const cx = s.cxComponents || [];
    out.push({ label: "CX components ready or skipped", done: cx.length > 0 || s._cxSkipped,
               hint: cx.filter(function (c) { return !c.url; }).length > 0 ? "Some components are missing URLs" : "" });
    out.push({ label: "Slide plan reviewed", done: (s.slides || []).length >= 5,
               hint: ((s.slides || []).length >= 5) ? "" : "5+ slides recommended" });

    // Asset readiness — derived from the Step 7 Assets panel. We
    // count how many of the SLOTS THAT MATTER for this deck have an
    // upload, so a deck with no persona doesn't get penalised for an
    // empty persona image. "Done" when at least one of the relevant
    // slots is filled (the rest stay as clean placeholders).
    const cxUrls = cx.filter(function (c) { return c.url; }).length;
    const relevantAssets = relevantAssetItems(s);
    const filledAssets = relevantAssets.filter(function (it) {
      if (it.slot === "brand.logoPath") return !!(s.brand && s.brand.logoPath);
      return !!(s.assetLibrary && s.assetLibrary[it.slot]);
    }).length;
    out.push({
      label: "Demo assets uploaded",
      done: relevantAssets.length === 0 || filledAssets > 0,
      hint: relevantAssets.length === 0
        ? "No image slots needed for this deck."
        : filledAssets + " of " + relevantAssets.length + " uploaded · upload more on Step 7",
    });
    if (cx.length === 0) {
      out.push({
        label: "Live CX scene URLs added",
        done: false,
        hint: "Optional — paste AubreyDemo /frame URLs in Step 6 to embed live screens",
      });
    } else if (cxUrls < cx.length) {
      out.push({
        label: "All CX components have URLs",
        done: false,
        hint: (cx.length - cxUrls) + " of " + cx.length + " missing URLs",
      });
    }

    return out;
  }

  function btn(label, klass, onClick) {
    const b = el("button", { class: "bx-btn " + klass, text: label });
    b.addEventListener("click", onClick); return b;
  }

  function foundationRow(label, value) {
    return el("div", { class: "bx-foundation-row" }, [
      el("div", { class: "bx-foundation-label", text: label }),
      el("div", { class: "bx-foundation-value", text: value }),
    ]);
  }
  function foundationList(label, items) {
    const ul = el("ul", { class: "bx-foundation-ul" });
    items.forEach(function (it) { ul.appendChild(el("li", { text: it })); });
    return el("div", { class: "bx-foundation-row" }, [
      el("div", { class: "bx-foundation-label", text: label }),
      ul,
    ]);
  }

  // ─── Side panel renderers ─────────────────────────────────────
  function sideSuggestions(body) {
    const s = app.state;
    const p = s.project;
    const missing = [];
    if (!p.customerName) missing.push("Customer name");
    if (!p.industry)     missing.push("Industry");
    if (!p.audience)     missing.push("Audience");
    if (!p.salesStage)   missing.push("Sales stage");
    if (!(p.products || []).length) missing.push("At least one product");
    if (missing.length) {
      const card = el("div", { class: "bx-side-card" });
      card.appendChild(el("div", { class: "bx-side-card-t", text: "To unlock recommendations" }));
      const ul = el("ul", { style: "margin: 6px 0 0 16px; color: var(--bx-ink-2); font-size: 11px; line-height: 1.6;" });
      missing.forEach(function (m) { ul.appendChild(el("li", { text: m })); });
      card.appendChild(ul);
      body.appendChild(card);
    }
    const recs = (s.recommendations || []).slice(0, 6);
    if (recs.length) {
      body.appendChild(el("div", { class: "bx-side-h", text: "Top picks so far" }));
      recs.forEach(function (r) {
        const card = el("div", { class: "bx-side-card" });
        card.appendChild(el("div", { class: "bx-side-card-t", text: r.title }));
        card.appendChild(el("div", { class: "bx-side-card-s", text: r.rationale || "" }));
        body.appendChild(card);
      });
    } else if (!missing.length) {
      body.appendChild(el("div", { class: "bx-side-empty",
        html: "Once you add story acts or products, suggestions will appear here." }));
    }
    if (s.scriptText) {
      const sigs = RULES.extractScriptSignals(s.scriptText);
      const keys = Object.keys(sigs).sort(function (a, b) { return sigs[b] - sigs[a]; });
      if (keys.length) {
        body.appendChild(el("div", { class: "bx-side-h bx-mt-18", text: "Script signals" }));
        const card = el("div", { class: "bx-side-card" });
        const inner = el("div", { class: "bx-row" });
        keys.slice(0, 8).forEach(function (k) {
          inner.appendChild(el("span", { class: "bx-rec-pill", text: k + " · " + sigs[k] }));
        });
        card.appendChild(inner);
        body.appendChild(card);
      }
    }
  }
  function sideSelectedSummary(body) {
    const s = app.state;
    const selected = s.recommendations.filter(function (r) { return s.selectedRecIds[r.id]; });
    if (!selected.length) {
      body.appendChild(el("div", { class: "bx-side-empty",
        html: "Toggle recommendations on to start your slide plan." }));
      return;
    }
    selected.forEach(function (r) {
      const card = el("div", { class: "bx-side-card" });
      card.appendChild(el("div", { class: "bx-side-card-t", text: s.customRecTitles[r.id] || r.title }));
      card.appendChild(el("div", { class: "bx-side-card-s",
        text: (r.capabilities && r.capabilities.length) ? r.capabilities.join(" · ") : (RULES.LAYOUTS[r.layout] && RULES.LAYOUTS[r.layout].label) }));
      body.appendChild(card);
    });
  }
  function sidePlanHealth(body) {
    const s = app.state;
    if (!s.slides.length) {
      body.appendChild(el("div", { class: "bx-side-empty", html: "Build the plan from Step 3 to see health here." }));
      return;
    }
    const issues = [];
    s.slides.forEach(function (sl) {
      (sl.missingInputs || []).forEach(function (k) { issues.push(sl.title + ": " + k); });
    });
    if (!issues.length) {
      body.appendChild(el("div", { class: "bx-side-card" }, [
        el("div", { class: "bx-side-card-t", text: "Plan looks healthy" }),
        el("div", { class: "bx-side-card-s", text: "No missing inputs detected. Ship it." }),
      ]));
      return;
    }
    body.appendChild(el("div", { class: "bx-side-h", text: "Missing inputs" }));
    issues.slice(0, 12).forEach(function (line) {
      const card = el("div", { class: "bx-side-card" });
      card.appendChild(el("div", { class: "bx-side-card-s", text: line }));
      body.appendChild(card);
    });
  }
  function sideCxSummary(body) {
    const s = app.state;
    const components = s.cxComponents || [];
    if (!components.length) {
      body.appendChild(el("div", { class: "bx-side-empty",
        html: "<strong>Optional step.</strong> AubreyDemo CX components let the demo embed live screens. Skip if you don't have any yet." }));
      return;
    }
    components.forEach(function (c) {
      const card = el("div", { class: "bx-side-card" });
      card.appendChild(el("div", { class: "bx-side-card-t", text: c.name || "(unnamed)" }));
      const sub = c.url ? (c.type || "web") + " · " + (c.deviceFrame || "desktop") : "URL needed";
      card.appendChild(el("div", { class: "bx-side-card-s", text: sub }));
      body.appendChild(card);
    });
  }

  function sideExportSummary(body) {
    const s = app.state;
    [
      ["Slides", s.slides.length],
      ["Personas", s.personas.length],
      ["Story acts", s.storyActs.length],
      ["Selected recs", countSelected()],
      ["Products", (s.project.products || []).length],
    ].forEach(function (c) {
      const card = el("div", { class: "bx-side-card" });
      card.appendChild(el("div", { class: "bx-side-card-t", text: c[1] + " " + c[0] }));
      body.appendChild(card);
    });
    body.appendChild(el("div", { class: "bx-side-h bx-mt-18", text: "Pre-live items" }));
    const items = (CONFIG.buildSnapshot(s).buildNotes || []).slice(0, 6);
    items.forEach(function (i) {
      const card = el("div", { class: "bx-side-card" });
      card.appendChild(el("div", { class: "bx-side-card-s", text: "• " + i }));
      body.appendChild(card);
    });
  }
  function countSelected() {
    return Object.keys(app.state.selectedRecIds).filter(function (k) { return app.state.selectedRecIds[k]; }).length;
  }

  // ─── Step header / footer ─────────────────────────────────────
  function stepHeader(eyebrow, title, sub) {
    return el("div", { class: "bx-main-head" }, [
      el("div", { class: "bx-main-eyebrow", text: eyebrow }),
      el("h1",  { class: "bx-main-title", text: title }),
      el("p",   { class: "bx-main-sub", text: sub }),
    ]);
  }
  function stepFooter(stepId) {
    const wrap = el("div", { class: "bx-row bx-row-between bx-mt-24" });
    const i = STEPS.findIndex(function (s) { return s.id === stepId; });
    const prev = STEPS[i - 1];
    const next = STEPS[i + 1];
    const left = el("div");
    if (prev) {
      const b = el("button", { class: "bx-btn bx-btn-secondary", text: "← " + prev.label });
      b.addEventListener("click", function () { app.state.step = prev.id; renderShell(); commit(); });
      left.appendChild(b);
    }
    const right = el("div");
    if (next) {
      const b = el("button", { class: "bx-btn bx-btn-primary", text: next.label + " →" });
      b.addEventListener("click", function () { app.state.step = next.id; renderShell(); commit(); });
      right.appendChild(b);
    }
    wrap.appendChild(left); wrap.appendChild(right);
    return wrap;
  }

  // ─── Recompute recommendations from current state ─────────────
  function recompute() {
    if (!app.state) return;
    const s = app.state;
    const ctx = {
      customerName: s.project.customerName,
      website:      s.project.website,
      industry:     s.project.industry,
      audience:     s.project.audience,
      salesStage:   s.project.salesStage,
      products:     s.project.products,
      personas:     s.personas,
      storyActs:    s.storyActs,
      scriptText:   s.scriptText,
      bigProblem:        s.story.bigProblem,
      currentPain:       s.story.currentPain,
      futureVision:      s.story.futureVision,
      executiveTakeaway: s.story.executiveTakeaway,
      bvsMetrics:   s.bvsMetrics,
      scenes:       s.scenes,
    };
    const res = RULES.recommend(ctx);
    // Merge the synthetic manifest slides (intro/journey/persona/bv) into the
    // recommendation list so the selector is 1:1 with what gets generated.
    // RULES entries for those four fixed sections never render (the export
    // uses the synthetic slides), so drop them to avoid phantom cards.
    const manifestRecs = RULES.manifestRecommendations ? RULES.manifestRecommendations(s) : [];
    const fixedSections = RULES.MANIFEST_SECTIONS || ["intro", "journey-map", "meet-persona", "business-value"];
    const demoRules = res.recommendations.filter(function (r) {
      return fixedSections.indexOf(r.sectionId || "demo") < 0;
    });
    s.recommendations = manifestRecs.concat(demoRules);
    s.recommendations.forEach(function (r) {
      // Synthetic slides default ON (everything generated is selected);
      // demo recommendations keep the priority>=80 auto-select heuristic.
      if (s.selectedRecIds[r.id] == null) {
        if (r.synthetic || r.priority >= 80) s.selectedRecIds[r.id] = true;
      }
      r.selected = !!s.selectedRecIds[r.id];
    });
  }

  // ─── AI PROMPT VIEW ───────────────────────────────────────────
  function renderAiPromptPage(container) {
    container.innerHTML = "";
    container.appendChild(stepHeader(
      "AI Prompt",
      "Generate a config with ChatGPT or Claude",
      AI_PROMPT.PAGE_HELPER
    ));

    const c0 = el("div", { class: "bx-card" });
    c0.appendChild(el("div", { class: "bx-card-title", text: "How this works" }));
    c0.appendChild(el("ol", { class: "bx-numlist" }, [
      el("li", { text: "Copy the prompt below." }),
      el("li", { text: "Paste it into ChatGPT or Claude." }),
      el("li", { text: "Underneath the prompt, paste your customer notes, demo script, audience, products, and any context you have." }),
      el("li", { text: "The AI returns a JSON config." }),
      el("li", { html: "Come back here, click <strong>Import Config</strong>, and paste the JSON. The builder will auto-fill setup, personas, story acts, recommendations, slides, and assets." }),
    ]));
    container.appendChild(c0);

    const promptCard = el("div", { class: "bx-card" });
    promptCard.appendChild(el("div", { class: "bx-card-title", text: "AI Prompt" }));
    promptCard.appendChild(el("div", { class: "bx-card-sub", text: "Editable. Copy as-is, or tweak before sending." }));
    const promptArea = el("textarea", { class: "bx-textarea bx-textarea-xl" });
    promptArea.value = AI_PROMPT.getFullPrompt();
    promptCard.appendChild(promptArea);
    promptCard.appendChild(el("div", { class: "bx-row bx-mt-12" }, [
      btn("Copy AI Prompt", "bx-btn-primary", function () {
        CONFIG.copyToClipboard(promptArea.value).then(function () { toast("Prompt copied"); });
      }),
      btn("Reset prompt", "bx-btn-secondary", function () {
        promptArea.value = AI_PROMPT.getFullPrompt(); toast("Reset");
      }),
      btn("Import AI response", "bx-btn-primary", function () { openImportModal(null); }),
    ]));
    container.appendChild(promptCard);

    const schemaCard = el("div", { class: "bx-card" });
    schemaCard.appendChild(el("div", { class: "bx-card-title", text: "Config schema / template" }));
    schemaCard.appendChild(el("div", { class: "bx-card-sub", text: "Already inlined in the prompt above. Useful if you want the schema on its own." }));
    schemaCard.appendChild(el("pre", { class: "bx-code", text: AI_PROMPT.CONFIG_TEMPLATE }));
    schemaCard.appendChild(el("div", { class: "bx-row bx-mt-12" }, [
      btn("Copy schema", "bx-btn-secondary", function () {
        CONFIG.copyToClipboard(AI_PROMPT.CONFIG_TEMPLATE).then(function () { toast("Schema copied"); });
      }),
    ]));
    container.appendChild(schemaCard);

    const exCard = el("div", { class: "bx-card" });
    exCard.appendChild(el("div", { class: "bx-card-title", text: "Example: what to send the AI alongside the prompt" }));
    exCard.appendChild(el("div", { class: "bx-card-sub", text: "A short example — paste your own version under the prompt." }));
    exCard.appendChild(el("pre", { class: "bx-code", text: AI_PROMPT.EXAMPLE_INPUTS }));
    exCard.appendChild(el("div", { class: "bx-row bx-mt-12" }, [
      btn("Copy example", "bx-btn-secondary", function () {
        CONFIG.copyToClipboard(AI_PROMPT.EXAMPLE_INPUTS).then(function () { toast("Example copied"); });
      }),
    ]));
    container.appendChild(exCard);

  }

  // ─── New-project chooser ──────────────────────────────────────
  // Two doors: build in the UI from scratch, or seed from an AI prompt.
  function openNewProjectChooser() {
    const wrap = el("div", { class: "bx-newproj-chooser" });
    wrap.appendChild(el("p", { class: "bx-newproj-chooser-lede",
      text: "How do you want to start this holodeck?" }));

    const grid = el("div", { class: "bx-newproj-chooser-grid" });

    function chooserCard(emoji, title, body, onClick) {
      const card = el("button", { class: "bx-newproj-chooser-card", type: "button" }, [
        el("div", { class: "bx-newproj-chooser-emoji", text: emoji }),
        el("div", { class: "bx-newproj-chooser-title", text: title }),
        el("div", { class: "bx-newproj-chooser-body", text: body }),
      ]);
      card.addEventListener("click", onClick);
      return card;
    }

    grid.appendChild(chooserCard(
      "🛠",
      "Create from scratch in the builder",
      "Open an empty project and fill in customer, products, and personas step by step.",
      function () { closeModal(); newProject(); }
    ));
    grid.appendChild(chooserCard(
      "✨",
      "Generate with AI",
      "Paste a demo script or prompt and let AI extract foundations, personas, and slides for you.",
      function () { closeModal(); goAiPrompt(); }
    ));

    wrap.appendChild(grid);

    const actions = el("div", { class: "bx-modal-actions" });
    actions.appendChild(btn("Cancel", "bx-btn-secondary", closeModal));
    wrap.appendChild(actions);

    openModal("Start a new holodeck", wrap, "bx-modal-card-chooser");
  }

  // ─── Modals: Import / Export ──────────────────────────────────
  function openModal(title, bodyNode, modifierClass) {
    $("#bxModalTitle").textContent = title;
    const body = $("#bxModalBody");
    body.innerHTML = "";
    body.appendChild(bodyNode);
    const card = document.querySelector(".bx-modal-card");
    card.className = "bx-modal-card" + (modifierClass ? " " + modifierClass : "");
    $("#bxModal").hidden = false;
  }
  function closeModal() { $("#bxModal").hidden = true; }

  // targetProjectId: string → overwrite that project; null → create new.
  function openImportModal(targetProjectId) {
    const wrap = el("div");
    wrap.appendChild(el("p", { style: "margin: 0 0 12px; font-size: 13px; color: var(--bx-ink-2);",
      text: "Paste a JSON config (from ChatGPT/Claude or a previous export) or the contents of a holodeck.config.js file." }));
    const ta = el("textarea", { class: "bx-textarea bx-textarea-l", placeholder: "Paste here…" });
    wrap.appendChild(ta);
    const fileRow = el("div", { class: "bx-row bx-mt-12" });
    const fileLabel = el("label", { class: "bx-btn bx-btn-secondary", text: "…or pick a file" });
    const fileInput = el("input", { type: "file", style: "display: none;", accept: ".js,.json,.txt" });
    fileInput.addEventListener("change", function () {
      const f = fileInput.files && fileInput.files[0];
      if (!f) return;
      const reader = new FileReader();
      reader.onload = function () { ta.value = reader.result; };
      reader.readAsText(f);
    });
    fileLabel.appendChild(fileInput);
    fileRow.appendChild(fileLabel);
    wrap.appendChild(fileRow);

    const status = el("div", { class: "bx-mt-12" });
    wrap.appendChild(status);

    const actions = el("div", { class: "bx-modal-actions" });
    actions.appendChild(btn("Import", "bx-btn-primary", function () {
      status.innerHTML = "";
      const result = VALIDATOR.importConfig(ta.value);
      if (result.errors && result.errors.length) {
        result.errors.forEach(function (msg) {
          status.appendChild(el("div", { class: "bx-alert is-error", text: msg }));
        });
        return;
      }
      const imported = result.state;
      if (targetProjectId) {
        imported.id = targetProjectId;
        imported.createdAt = (app.state && app.state.createdAt) || new Date().toISOString();
      } else {
        imported.id = STORE.uid();
      }
      STORE.saveProject(imported).then(function () {
        (result.warnings || []).forEach(function (msg) {
          status.appendChild(el("div", { class: "bx-alert is-warn", text: msg }));
        });
        closeModal();
        goBuilder(imported.id);
        toast(targetProjectId ? "Project replaced from import" : "New project created from import");
      });
    }));
    actions.appendChild(btn("Cancel", "bx-btn-secondary", closeModal));
    wrap.appendChild(actions);
    openModal("Import config", wrap);
  }

  function openExportModal() {
    const cfgJs   = (window.HOLO_ADAPTER && window.HOLO_ADAPTER.toPolishedHolodeckConfigJs)
      ? window.HOLO_ADAPTER.toPolishedHolodeckConfigJs(app.state)
      : CONFIG.toHolodeckConfigJs(app.state);
    const cfgJson = CONFIG.toJsonString(app.state);
    const wrap = el("div");
    wrap.appendChild(el("p", { style: "margin: 0 0 14px; font-size: 13px; color: var(--bx-ink-2);",
      text: "Use Complete Demo ZIP for a ready-to-run package. Use Config only when updating an existing demo folder." }));
    wrap.appendChild(el("div", { class: "bx-modal-actions", style: "margin-top: 0; margin-bottom: 14px;" }, [
      btn("⬇ Download Complete Demo ZIP", "bx-btn-primary", function () {
        toast("Building polished demo ZIP…");
        Promise.resolve(window.HOLO_ZIP.downloadCompleteDemoZip(app.state)).then(function (payload) {
          toast(payload && payload.mode === "legacy" ? "Exported (offline mode)" : "Polished demo ZIP downloaded");
        }).catch(function (e) { toast("Couldn't build the ZIP: " + (e && e.message || e)); });
      }),
      btn("Download Config JS", "bx-btn-secondary", function () {
        CONFIG.downloadFile("holodeck.config.js", cfgJs, "text/javascript"); toast("Downloaded");
      }),
      btn("Download JSON", "bx-btn-secondary", function () {
        CONFIG.downloadFile("holodeck-builder.json", cfgJson, "application/json"); toast("Downloaded");
      }),
    ]));
    wrap.appendChild(el("pre", { class: "bx-code", text: cfgJs }));
    wrap.appendChild(el("div", { class: "bx-modal-actions" }, [
      btn("Copy Config JS", "bx-btn-secondary", function () { CONFIG.copyToClipboard(cfgJs).then(function () { toast("Copied"); }); }),
      btn("Copy JSON",      "bx-btn-secondary", function () { CONFIG.copyToClipboard(cfgJson).then(function () { toast("Copied"); }); }),
      btn("Close",          "bx-btn-ghost",     closeModal),
    ]));
    openModal("Export", wrap);
  }

  // ── Story Quality Check ──────────────────────────────────────
  function openStoryQualityModal() {
    if (!VALIDATE_STORY) { toast("Validator not loaded"); return; }
    const result = VALIDATE_STORY.validateGeneratedStoryAndSlides(app.state);
    const wrap = el("div");
    const summary = result.summary || { errors: 0, warnings: 0, info: 0 };

    wrap.appendChild(el("div", { class: "bx-row bx-mt-12" }, [
      el("span", { class: "bx-rec-pill " + (summary.errors ? "tone-red" : "tone-good"), text: summary.errors + " errors" }),
      el("span", { class: "bx-rec-pill " + (summary.warnings ? "tone-gold" : "tone-good"), text: summary.warnings + " warnings" }),
      el("span", { class: "bx-rec-pill", text: summary.info + " notes" }),
    ]));

    if (!result.issues.length) {
      wrap.appendChild(el("div", { class: "bx-empty bx-mt-18",
        html: "Looking good. <strong>Nothing flagged.</strong> Foundations, story acts, and slide layouts all check out." }));
    } else {
      const list = el("div", { class: "bx-mt-18", style: "display: flex; flex-direction: column; gap: 8px;" });
      result.issues.forEach(function (i) {
        const tone = i.severity === "error" ? "is-error" : (i.severity === "warning" ? "is-warn" : "is-info");
        const card = el("div", { class: "bx-alert " + tone });
        card.appendChild(el("div", { style: "font-weight: 700;", text: i.message }));
        if (i.hint) card.appendChild(el("div", { style: "margin-top: 4px; font-size: 11px; opacity: 0.85;", text: i.hint }));
        list.appendChild(card);
      });
      wrap.appendChild(list);
    }

    wrap.appendChild(el("div", { class: "bx-modal-actions" }, [
      btn("Close", "bx-btn-secondary", closeModal),
    ]));
    openModal("Story Quality Check", wrap);
  }

  // ── Preview Full Demo: a slide-by-slide expanded preview using
  //    the same renderer the exported demo will use ───────────
  function openFullDemoModal() {
    const slides = app.state.slides || [];
    const wrap = el("div", { class: "bx-fulldemo" });
    if (!slides.length) {
      wrap.appendChild(el("div", { class: "bx-empty",
        html: "No slides yet. Build the plan first." }));
      openModal("Preview Full Demo", wrap);
      return;
    }

    const stage = el("div", { class: "bx-fulldemo-stage" });
    const dotRow = el("div", { class: "bx-fulldemo-dots" });
    let current = 0;

    function go(i) {
      current = Math.max(0, Math.min(slides.length - 1, i));
      stage.innerHTML = "";
      const slide = Object.assign({}, slides[current], { order: current });
      stage.appendChild(PREVIEW.renderSlidePreview(slide, app.state, "expanded"));
      Array.prototype.forEach.call(dotRow.children, function (d, idx) {
        d.classList.toggle("is-on", idx === current);
      });
      counter.textContent = (current + 1) + " / " + slides.length;
      titleEl.textContent = slide.title || "Slide " + (current + 1);
    }

    slides.forEach(function (_, i) {
      const d = el("button", { class: "bx-fulldemo-dot", "aria-label": "Slide " + (i + 1) });
      d.addEventListener("click", function () { go(i); });
      dotRow.appendChild(d);
    });

    const head = el("div", { class: "bx-fulldemo-head" });
    const titleEl = el("div", { class: "bx-fulldemo-title", text: "" });
    const counter = el("div", { class: "bx-fulldemo-counter", text: "" });
    head.appendChild(titleEl); head.appendChild(counter);
    wrap.appendChild(head);
    wrap.appendChild(stage);

    const controls = el("div", { class: "bx-fulldemo-controls" });
    controls.appendChild(btn("← Prev", "bx-btn-secondary", function () { go(current - 1); }));
    controls.appendChild(dotRow);
    controls.appendChild(btn("Next →", "bx-btn-primary", function () { go(current + 1); }));
    wrap.appendChild(controls);

    // Keyboard navigation while modal is open
    function onKey(e) {
      if ($("#bxModal").hidden) { document.removeEventListener("keydown", onKey); return; }
      if (e.key === "ArrowRight" || e.key === " ") go(current + 1);
      else if (e.key === "ArrowLeft") go(current - 1);
      else if (e.key === "Home") go(0);
      else if (e.key === "End") go(slides.length - 1);
    }
    document.addEventListener("keydown", onKey);

    openModal("Preview Full Demo", wrap, "is-fulldemo");
    go(0);
  }

  // ═══════════════════════════════════════════════════════════════
  //  AUBREY DEMO INTEGRATION
  //  Additive — every existing manual control on Steps 1, 2, 6 is
  //  untouched. These helpers add a "Pull from Aubrey" affordance
  //  next to each, backed by aubrey-client.js. Credentials live in
  //  a global browser key repository shared by all projects in this
  //  builder, NEVER inside state.
  // ═══════════════════════════════════════════════════════════════

  // Maps the keywords HOLO_PARSER detects in script_data.rows[].talk
  // onto the PRODUCTS chip labels in Step 1. We use the parser's
  // capability buckets — not raw keyword scans — so the mapping
  // stays consistent with the rest of the recommendation engine.
  const AUBREY_CAPABILITY_TO_PRODUCT = {
    agentforce: "Agentforce",
    datacloud:  "Data Cloud",
    commerce:   "Commerce",
    marketing:  "Marketing Cloud",
    service:    "Service Cloud",
    loyalty:    "Loyalty",
  };

  // ── STEP 1 (Connect): credentials + jump-start CTAs ────────
  // Goal of this step: get content flowing in with as little
  // typing as possible. If the user has Aubrey keys, they can
  // pull a script (which then auto-populates brand, persona,
  // products, foundations) and skip straight to Foundations
  // review. If they don't, they can skip to Setup and stay
  // 100% manual. Either path is valid.
  function viewConnect() {
    const wrap = el("div");
    wrap.appendChild(stepHeader(
      "Step 1 · Connect Aubrey",
      "Pull from Aubrey, or skip to manual setup",
      "Optional. Add API keys to pull brand identity, demo scripts, personas, and CX components directly from the Aubrey ecosystem. With keys set, an Aubrey-driven project takes ~5 typed fields total."
    ));

    // Thin status banner that opens the same modal as the topbar
    // button. Keeping one source of truth for credentials means
    // the user can review or swap keys from here OR from any
    // other step via the topbar.
    wrap.appendChild(aubreyKeysBanner());

    // ── Quick start: pull a script as the foundation ─────────
    // The fastest path: pick a Scriptwriter script, which (with
    // the brand auto-fill side-effect) populates customer name,
    // industry, brand colors, persona, products, and foundations
    // in one go. Drops the user on Step 3 (Foundations review).
    const quick = el("div", { class: "bx-card bx-card-feature" });
    quick.appendChild(el("div", { class: "bx-card-title", text: "Start with an Aubrey demo script" }));
    quick.appendChild(el("div", { class: "bx-card-sub",
      text: "Recommended for Aubrey-driven projects. Pulling a script also fills customer name, industry, brand colors, persona, and Salesforce products by following the script's brand and persona links. You can change anything afterward." }));
    const quickRow = el("div", { class: "bx-row bx-mt-12" });
    quickRow.appendChild(btn("✨ Pull script from Aubrey →", "bx-btn-primary",
      function () { openAubreyScriptPicker(); }));
    quickRow.appendChild(btn("Or just pull a brand", "bx-btn-secondary",
      function () { openAubreyBrandPicker(); }));
    quick.appendChild(quickRow);
    wrap.appendChild(quick);

    // ── Manual path ──────────────────────────────────────────
    const manual = el("div", { class: "bx-card" });
    manual.appendChild(el("div", { class: "bx-card-title", text: "Building without Aubrey?" }));
    manual.appendChild(el("div", { class: "bx-card-sub",
      text: "No problem — every step has its own manual entry. Skip ahead to Setup and fill things in by hand. You can come back to this step any time to add API keys later." }));
    manual.appendChild(el("div", { class: "bx-row bx-mt-12" }, [
      btn("Skip to Setup →", "bx-btn-primary", function () {
        app.state.step = "setup"; renderShell(); commit();
      }),
    ]));
    wrap.appendChild(manual);

    wrap.appendChild(stepFooter("connect"));
    return wrap;
  }

  function getAubreyGlobalKeys() {
    if (!AUBREY) return {};
    if (AUBREY.globalKeys && typeof AUBREY.globalKeys.get === "function") {
      return AUBREY.globalKeys.get();
    }
    // Backward compatibility for older aubrey-client.js payloads.
    return (AUBREY.creds && typeof AUBREY.creds.load === "function") ? AUBREY.creds.load() : {};
  }
  function setAubreyGlobalKeys(partial) {
    if (!AUBREY) return {};
    if (AUBREY.globalKeys && typeof AUBREY.globalKeys.set === "function") {
      return AUBREY.globalKeys.set(partial || {});
    }
    return (AUBREY.creds && typeof AUBREY.creds.save === "function")
      ? AUBREY.creds.save(partial || {})
      : {};
  }

  function sideConnectHint(body) {
    const c = getAubreyGlobalKeys();
    const filled = ["email","demoforgeKey","scriptwriterKey","pocketsicKey"].filter(function (k) { return !!c[k]; }).length;
    const card = el("div", { class: "bx-side-card" });
    card.appendChild(el("div", { class: "bx-side-card-t",
      text: filled === 4 ? "All four set — you're good to pull" :
            filled > 0   ? "Partial setup — pull what you can" :
                           "No keys yet" }));
    card.appendChild(el("div", { style: "margin-top: 6px; color: var(--bx-ink-2); font-size: 11px; line-height: 1.6;",
      text: filled === 4
        ? "Pull a script to land on Foundations with brand + persona + products already filled in."
        : "You can build entirely by hand — every step has its own manual entry." }));
    const manage = el("button", { class: "bx-btn-link", style: "margin-top: 8px; font-size: 11px;",
      type: "button", text: "Manage keys →" });
    manage.addEventListener("click", openAubreyKeysModal);
    card.appendChild(manage);
    body.appendChild(card);
  }

  // ── Connections card on Step 1 ─────────────────────────────
  // mode:
  //   "inline" — used inside Step 1 Connect view (legacy callsite,
  //              still supported but the Connect step now collapses
  //              this to a thin status banner instead).
  //   "modal"  — used by the topbar "Aubrey Keys" modal. Adds masked
  //              previews, per-key Clear, and a "Test connections"
  //              row. The modal is the canonical edit surface — the
  //              topbar button is reachable from every builder step
  //              so mid-project key swaps don't require navigation.
  function aubreyConnectionsCard(mode) {
    mode = mode || "inline";
    if (!AUBREY) {
      const ph = el("div", { class: "bx-card" });
      ph.appendChild(el("div", { class: "bx-card-title", text: "Aubrey Demo connections" }));
      ph.appendChild(el("div", { class: "bx-card-sub", text: "Aubrey client failed to load." }));
      return ph;
    }
    const card = el("div", { class: "bx-card" });
    const head = el("div", { class: "bx-row bx-row-between" });
    const headL = el("div");
    headL.appendChild(el("div", { class: "bx-card-title", text: "Aubrey Demo connections" }));
    headL.appendChild(el("div", { class: "bx-card-sub",
      text: "Optional. Add API keys to pull brands, personas, scripts, and CX components from the Aubrey ecosystem. Keys are global across all projects in this browser and never enter project files or exports." }));
    head.appendChild(headL);
    head.appendChild(aubreyConnectionStatusPill());
    card.appendChild(head);

    const creds = getAubreyGlobalKeys();
    const grid = el("div", { class: "bx-grid-2 bx-mt-12" });

    // Email is treated like any other field but never masked.
    grid.appendChild(credRow({
      mode: mode, name: "email",
      label: "Email", help: "(required by DemoForge & Scriptwriter)",
      placeholder: "you@salesforce.com", value: creds.email, mask: false,
    }));
    grid.appendChild(credRow({
      mode: mode, name: "demoforgeKey",
      label: "DemoForge API key", help: "(starts with dmfg…)",
      placeholder: "dmfg…", value: creds.demoforgeKey, mask: true,
    }));
    grid.appendChild(credRow({
      mode: mode, name: "scriptwriterKey",
      label: "Scriptwriter API key", help: "(starts with dsw_…)",
      placeholder: "dsw_…", value: creds.scriptwriterKey, mask: true,
    }));
    grid.appendChild(credRow({
      mode: mode, name: "pocketsicKey",
      label: "Pocket SIC API key", help: "(starts with psk_…)",
      placeholder: "psk_…", value: creds.pocketsicKey, mask: true,
    }));
    card.appendChild(grid);

    if (mode === "modal") {
      // Test-connections strip — fires one read against each
      // configured API and shows a coloured pill per row.
      const testWrap = el("div", { class: "bx-card bx-mt-12", style: "padding: 12px;" });
      const testHead = el("div", { class: "bx-row bx-row-between" });
      testHead.appendChild(el("div", { class: "bx-card-title", text: "Test connections" }));
      const testBtn = btn("Run test", "bx-btn-secondary", function () { runConnectionTests(testResults); });
      testHead.appendChild(testBtn);
      testWrap.appendChild(testHead);
      const testResults = el("div", { id: "bxAubreyTestResults", class: "bx-row bx-mt-12" });
      testResults.appendChild(connectionTestPill("demoforge",   "DemoForge",   "idle"));
      testResults.appendChild(connectionTestPill("scriptwriter","Scriptwriter","idle"));
      testResults.appendChild(connectionTestPill("pocketsic",   "Pocket SIC",  "idle"));
      testWrap.appendChild(testResults);
      card.appendChild(testWrap);
    }

    card.appendChild(el("div", { class: "bx-help bx-mt-12",
      html: "Each key is independently optional. With all four set, every Aubrey-derived field on Steps 1, 2, and 6 can be pulled with one click — no typing for content Aubrey already produces." }));
    return card;
  }

  // Single credential row. In "inline" mode it's just a plain
  // `field()` like before. In "modal" mode it adds: masked preview
  // by default, Show/Hide toggle, and per-key Clear button.
  function credRow(opts) {
    if (opts.mode !== "modal") {
      return field({
        label: opts.label, help: opts.help,
        placeholder: opts.placeholder, value: opts.value,
        onInput: function (v) { saveAubreyField(opts.name, v); },
      });
    }
    const wrap = el("div", { class: "bx-field" });
    const labelEl = el("label", { class: "bx-label", text: opts.label });
    if (opts.help) labelEl.appendChild(el("span", { class: "bx-help-inline", text: opts.help }));
    wrap.appendChild(labelEl);

    // State local to this row — whether the value is currently
    // masked (only meaningful for `mask: true` rows that have a value).
    let revealed = !opts.mask || !opts.value;

    const row = el("div", { class: "bx-color-row" });
    const input = el("input", { type: "text", class: "bx-input",
      placeholder: opts.placeholder, value: maskValue(opts.value, opts.mask, revealed) });
    // Clicking into the field enters edit mode and shows the
    // full value so the user can edit it without copying out the
    // mask placeholders.
    input.addEventListener("focus", function () {
      if (revealed) return;
      revealed = true;
      input.value = getAubreyGlobalKeys()[opts.name] || "";
    });
    input.addEventListener("input", function () {
      saveAubreyField(opts.name, input.value);
    });
    input.addEventListener("blur", function () {
      // If the value is non-empty and the user typed (so it's
      // already saved), re-mask after blur — but only for keys.
      const stored = getAubreyGlobalKeys()[opts.name] || "";
      if (opts.mask && stored) {
        revealed = false;
        input.value = maskValue(stored, true, false);
      }
    });
    row.appendChild(input);

    if (opts.mask) {
      const showHide = el("button", { type: "button", class: "bx-mini-btn",
        text: revealed && opts.value ? "Hide" : "Show",
        title: "Toggle visibility" });
      showHide.addEventListener("click", function () {
        const stored = getAubreyGlobalKeys()[opts.name] || "";
        revealed = !revealed;
        input.value = revealed ? stored : maskValue(stored, true, false);
        showHide.textContent = revealed && stored ? "Hide" : "Show";
      });
      row.appendChild(showHide);
    }

    const clear = el("button", { type: "button", class: "bx-mini-btn is-danger",
      text: "Clear", title: "Clear this credential" });
    clear.addEventListener("click", function () {
      saveAubreyField(opts.name, "");
      input.value = "";
      revealed = true;
      // Reset Show/Hide label if present.
      const sh = row.querySelector("button.bx-mini-btn:not(.is-danger)");
      if (sh) sh.textContent = "Show";
    });
    row.appendChild(clear);

    wrap.appendChild(row);
    return wrap;
  }

  function maskValue(value, isMaskable, revealed) {
    if (!value) return "";
    if (!isMaskable || revealed) return value;
    // Show first 4 + last 5 characters, masked middle. Keys are
    // long enough (~70 chars) that this is unambiguous; for shorter
    // values (like an email, though we don't mask those) we fall
    // back to all-bullets.
    if (value.length <= 12) return "•".repeat(value.length);
    return value.slice(0, 4) + "…" + value.slice(-5);
  }

  function connectionTestPill(name, label, state) {
    const tone = ({ idle: "", ok: "tone-good", fail: "tone-red", skipped: "tone-gold" })[state] || "";
    const text = ({ idle: label + " — not tested", ok: label + " ✓ ok",
                    fail: label + " ✗ failed", skipped: label + " — no key" })[state] || label;
    return el("span", { class: "bx-rec-pill " + tone,
      "data-aubrey-test": name, text: text });
  }
  function setConnectionTestPill(container, name, state, msg) {
    const old = container.querySelector('[data-aubrey-test="' + name + '"]');
    if (!old) return;
    const labelMap = { demoforge: "DemoForge", scriptwriter: "Scriptwriter", pocketsic: "Pocket SIC" };
    const fresh = connectionTestPill(name, labelMap[name], state);
    if (state === "fail" && msg) fresh.textContent = labelMap[name] + " ✗ " + msg;
    old.parentNode.replaceChild(fresh, old);
  }
  function runConnectionTests(container) {
    const c = getAubreyGlobalKeys();
    // Reset pills to "testing"
    ["demoforge","scriptwriter","pocketsic"].forEach(function (n) {
      setConnectionTestPill(container, n, "idle");
      const old = container.querySelector('[data-aubrey-test="' + n + '"]');
      if (old) old.textContent = ({demoforge:"DemoForge",scriptwriter:"Scriptwriter",pocketsic:"Pocket SIC"})[n] + " · testing…";
    });

    // DemoForge
    if (!c.demoforgeKey || !c.email) setConnectionTestPill(container, "demoforge", "skipped");
    else AUBREY.demoforge.listBrands({ email: c.email, key: c.demoforgeKey })
      .then(function () { setConnectionTestPill(container, "demoforge", "ok"); })
      .catch(function (e) { setConnectionTestPill(container, "demoforge", "fail", e.message); });

    // Scriptwriter
    if (!c.scriptwriterKey || !c.email) setConnectionTestPill(container, "scriptwriter", "skipped");
    else AUBREY.scriptwriter.listScripts({ email: c.email, key: c.scriptwriterKey })
      .then(function () { setConnectionTestPill(container, "scriptwriter", "ok"); })
      .catch(function (e) { setConnectionTestPill(container, "scriptwriter", "fail", e.message); });

    // Pocket SIC
    if (!c.pocketsicKey) setConnectionTestPill(container, "pocketsic", "skipped");
    else AUBREY.pocketsic.listProjects({ key: c.pocketsicKey })
      .then(function () { setConnectionTestPill(container, "pocketsic", "ok"); })
      .catch(function (e) { setConnectionTestPill(container, "pocketsic", "fail", e.message); });
  }

  // The canonical credentials modal — accessible from the topbar
  // (every builder step) and from the Connect step's status banner.
  function openAubreyKeysModal() {
    const wrap = el("div");
    wrap.appendChild(aubreyConnectionsCard("modal"));
    const actions = el("div", { class: "bx-modal-actions" });
    actions.appendChild(btn("Close", "bx-btn-primary", function () {
      closeModal();
      // Refresh whichever surface might be showing the count
      // (topbar pill, Connect step banner, side panel hint).
      renderTopbar();
      if (app.state && app.state.step === "connect") renderShell();
    }));
    wrap.appendChild(actions);
    openModal("Aubrey Demo keys", wrap);
  }

  // Thin status banner used inside the Step 1 Connect view.
  // Mirrors the topbar pill but lives in the page so first-run
  // users see it before they think to look at the topbar.
  function aubreyKeysBanner() {
    const card = el("div", { class: "bx-card" });
    const head = el("div", { class: "bx-row bx-row-between" });
    const headL = el("div");
    headL.appendChild(el("div", { class: "bx-card-title", text: "🔑 Aubrey Demo keys" }));
    if (AUBREY) {
      const c = getAubreyGlobalKeys();
      const filled = ["email","demoforgeKey","scriptwriterKey","pocketsicKey"]
        .filter(function (k) { return !!c[k]; }).length;
      headL.appendChild(el("div", { class: "bx-card-sub",
        text: filled === 4
          ? "All four set — every Pull-from-Aubrey button on Steps 2 and 6 is ready to go."
          : filled > 0
            ? (filled + " of 4 set — fill in the rest to unlock more pulls.")
            : "No keys yet. Add them once and they'll be available from every step (top-right corner)." }));
    }
    head.appendChild(headL);
    head.appendChild(btn("Manage keys", "bx-btn-secondary", openAubreyKeysModal));
    card.appendChild(head);
    return card;
  }

  // Topbar button. Lives next to Import / Save / Export so it's
  // always one click away while the user is building.
  function aubreyKeysTopbarButton() {
    if (!AUBREY) return null;
    const c = getAubreyGlobalKeys();
    const filled = ["email","demoforgeKey","scriptwriterKey","pocketsicKey"]
      .filter(function (k) { return !!c[k]; }).length;
    const label = "🔑 Aubrey Keys · " + filled + "/4";
    return actionBtn(label, "bx-btn-ghost", openAubreyKeysModal);
  }
  function saveAubreyField(field, value) {
    const c = getAubreyGlobalKeys();
    c[field] = value;
    setAubreyGlobalKeys(c);
    // Refresh just the status pill so the user sees the chip
    // turn green/grey as they type — no full re-render.
    const pill = $("#bxAubreyStatusPill");
    if (pill && pill.parentNode) {
      pill.parentNode.replaceChild(aubreyConnectionStatusPill(), pill);
    }
  }
  function aubreyConnectionStatusPill() {
    const c = getAubreyGlobalKeys();
    const filled = ["email","demoforgeKey","scriptwriterKey","pocketsicKey"].filter(function (k) { return !!c[k]; }).length;
    const tone = filled === 4 ? "tone-good" : filled > 0 ? "tone-gold" : "";
    return el("span", { id: "bxAubreyStatusPill",
      class: "bx-rec-pill " + tone,
      text: filled === 4 ? "All 4 connected" : (filled + " of 4 set") });
  }

  // ── Shared pre-flight: is the right key present? ───────────
  function ensureAubreyKey(which) {
    const c = getAubreyGlobalKeys();
    const need = {
      demoforge:    { key: "demoforgeKey",    label: "DemoForge",    needsEmail: true  },
      scriptwriter: { key: "scriptwriterKey", label: "Scriptwriter", needsEmail: true  },
      pocketsic:    { key: "pocketsicKey",    label: "Pocket SIC",   needsEmail: false },
    }[which];
    if (!need) return c;
    const hasRequired = (AUBREY && AUBREY.globalKeys && typeof AUBREY.globalKeys.hasRequired === "function")
      ? AUBREY.globalKeys.hasRequired(which)
      : (!!c[need.key] && (!need.needsEmail || !!c.email));
    if (!hasRequired && !c[need.key]) {
      toast("Add your " + need.label + " API key under Setup → Aubrey Demo connections");
      app.state.step = "setup"; renderShell();
      return null;
    }
    if (!hasRequired && need.needsEmail && !c.email) {
      toast("Add your email under Setup → Aubrey Demo connections (required by " + need.label + ")");
      app.state.step = "setup"; renderShell();
      return null;
    }
    return c;
  }

  // ── Brand picker (DemoForge) ───────────────────────────────
  function openAubreyBrandPicker() {
    const creds = ensureAubreyKey("demoforge");
    if (!creds) return;
    const wrap = el("div");
    wrap.appendChild(el("p", { style: "margin: 0 0 12px; font-size: 13px; color: var(--bx-ink-2);",
      text: "Pick a brand from DemoForge. Customer name, industry, tone, primary + secondary color, and logo will be filled in. Existing values get overwritten — manual edits will be replaced." }));
    const status = el("div", { class: "bx-mt-12" });
    const list = el("div", { class: "bx-list bx-mt-12" });
    list.appendChild(el("div", { class: "bx-empty", text: "Loading brands…" }));
    wrap.appendChild(status); wrap.appendChild(list);
    const actions = el("div", { class: "bx-modal-actions" });
    actions.appendChild(btn("Cancel", "bx-btn-secondary", closeModal));
    wrap.appendChild(actions);
    openModal("Pull brand from Aubrey", wrap);

    AUBREY.demoforge.listBrands({ email: creds.email, key: creds.demoforgeKey })
      .then(function (brands) {
        list.innerHTML = "";
        if (!brands.length) {
          list.appendChild(el("div", { class: "bx-empty", text: "No brands found for this account." }));
          return;
        }
        brands.forEach(function (b) { list.appendChild(brandRow(b, creds)); });
      })
      .catch(function (e) {
        list.innerHTML = "";
        status.appendChild(el("div", { class: "bx-alert is-error", text: "DemoForge: " + e.message }));
      });
  }
  function brandRow(b, creds) {
    const item = el("div", { class: "bx-item" });
    const head = el("div", { class: "bx-item-head" }, [
      el("div", { class: "bx-item-handle", text: b.brand_name || b.name || ("Brand " + b.id) }),
      el("div", { class: "bx-item-actions" }, [
        btn("Use this brand", "bx-btn-primary", function () {
          importBrandFromAubrey(b.id, creds);
        }),
      ]),
    ]);
    item.appendChild(head);
    const meta = [];
    if (b.industry)    meta.push("Industry: " + b.industry);
    if (b.demo_type)   meta.push("Type: " + b.demo_type);
    if (b.persona_name) meta.push("Persona: " + b.persona_name);
    if (meta.length) item.appendChild(el("div", { class: "bx-help", text: meta.join(" · ") }));
    if (b.description) item.appendChild(el("div", { class: "bx-help bx-mt-6",
      text: String(b.description).slice(0, 180) + (b.description.length > 180 ? "…" : "") }));
    return item;
  }
  function importBrandFromAubrey(brandId, creds) {
    const s = app.state;
    toast("Loading brand from DemoForge…");
    AUBREY.demoforge.getBrand(brandId, { email: creds.email, key: creds.demoforgeKey })
      .then(function (resp) {
        const b = resp.brand;
        if (!b) throw new Error("Brand not found");
        // Fill brand-only fields. Project name is left untouched
        // because it's the user's internal label.
        if (b.brand_name)     s.project.customerName = b.brand_name;
        if (b.website_url)    s.project.website = b.website_url;
        if (b.industry)       s.project.industry = b.industry;
        if (b.tone)           s.project.tone = matchTone(b.tone);
        if (b.color_primary)   s.brand.primaryColor   = b.color_primary;
        if (b.color_secondary) s.brand.secondaryColor = b.color_secondary;
        const logoUrl = b.logo_url;
        const inlineLogo = logoUrl
          ? AUBREY.inlineImageAsDataUrl(logoUrl).catch(function () { return logoUrl; })
          : Promise.resolve("");
        return inlineLogo.then(function (logo) {
          if (logo) s.brand.logoPath = logo;
          // From the Connect step, advance to Setup so the user
          // can fill in the few fields Aubrey doesn't know about
          // (audience, sales stage, presenter, accent color).
          if (s.step === "connect") s.step = "setup";
          recompute(); renderShell(); commit();
          closeModal();
          toast("Brand imported from Aubrey: " + (b.brand_name || ""));
        });
      })
      .catch(function (e) {
        toast("Couldn't import brand: " + e.message);
      });
  }
  // The TONES dropdown only allows a fixed set — Aubrey returns
  // freeform paragraphs, so we softly snap to the closest option
  // by keyword and fall back to leaving it empty.
  function matchTone(text) {
    const t = String(text || "").toLowerCase();
    if (/exec|board|c-suite/.test(t))                       return "Executive";
    if (/vision|inspir/.test(t))                            return "Visionary";
    if (/technic|engineer|developer/.test(t))               return "Technical";
    if (/playful|fun|relax|friendly|casual/.test(t))        return "Playful";
    if (/premium|luxury|sophisticat|refined/.test(t))       return "Premium";
    if (/tactic|practical|how-to|operational/.test(t))      return "Tactical";
    return "";
  }

  // ── Persona picker (DemoForge) ─────────────────────────────
  // Adds (does not replace) a persona derived from the chosen
  // brand's persona_name + persona, and inlines persona_image_url
  // into assetLibrary["persona.portrait"] only if that slot is empty.
  function openAubreyPersonaPicker() {
    const creds = ensureAubreyKey("demoforge");
    if (!creds) return;
    const wrap = el("div");
    wrap.appendChild(el("p", { style: "margin: 0 0 12px; font-size: 13px; color: var(--bx-ink-2);",
      text: "Pick a brand — its persona will be added to your project (existing personas are kept). The persona portrait will be set on Step 7 if that slot is currently empty." }));
    const status = el("div", { class: "bx-mt-12" });
    const list = el("div", { class: "bx-list bx-mt-12" });
    list.appendChild(el("div", { class: "bx-empty", text: "Loading brands…" }));
    wrap.appendChild(status); wrap.appendChild(list);
    const actions = el("div", { class: "bx-modal-actions" });
    actions.appendChild(btn("Cancel", "bx-btn-secondary", closeModal));
    wrap.appendChild(actions);
    openModal("Pull persona from Aubrey", wrap);

    AUBREY.demoforge.listBrands({ email: creds.email, key: creds.demoforgeKey })
      .then(function (brands) {
        list.innerHTML = "";
        if (!brands.length) {
          list.appendChild(el("div", { class: "bx-empty", text: "No brands found." }));
          return;
        }
        brands.forEach(function (b) {
          if (!b.persona_name && !b.persona) return;
          list.appendChild(personaBrandRow(b, creds));
        });
        if (!list.children.length) {
          list.appendChild(el("div", { class: "bx-empty", text: "No brands with personas in this catalog." }));
        }
      })
      .catch(function (e) {
        list.innerHTML = "";
        status.appendChild(el("div", { class: "bx-alert is-error", text: "DemoForge: " + e.message }));
      });
  }
  function personaBrandRow(b, creds) {
    const item = el("div", { class: "bx-item" });
    item.appendChild(el("div", { class: "bx-item-head" }, [
      el("div", { class: "bx-item-handle", text: (b.persona_name || "Persona") + " · " + (b.brand_name || "") }),
      el("div", { class: "bx-item-actions" }, [
        btn("Add this persona", "bx-btn-primary", function () {
          importPersonaFromAubrey(b, creds);
        }),
      ]),
    ]));
    if (b.persona) {
      item.appendChild(el("div", { class: "bx-help",
        text: String(b.persona).slice(0, 220) + (b.persona.length > 220 ? "…" : "") }));
    }
    return item;
  }
  function importPersonaFromAubrey(b, creds) {
    const s = app.state;
    s.personas = s.personas || [];
    s.assetLibrary = s.assetLibrary || {};
    s.personas.push({
      id: uid("persona_"),
      name: b.persona_name || "",
      role: "",
      goals: "",
      painPoints: "",
      demoRelevance: b.persona || "",
    });
    const portraitTarget = "persona.portrait";
    const slotEmpty = !s.assetLibrary[portraitTarget];
    const portraitJob = (slotEmpty && b.persona_image_url)
      ? AUBREY.inlineImageAsDataUrl(b.persona_image_url)
          .then(function (dataUrl) { if (dataUrl) s.assetLibrary[portraitTarget] = dataUrl; })
          .catch(function () { /* leave slot empty on failure */ })
      : Promise.resolve();
    portraitJob.then(function () {
      recompute(); renderShell(); commit();
      closeModal();
      toast("Persona added: " + (b.persona_name || "(unnamed)"));
    });
  }

  // ── Script picker (Scriptwriter) ───────────────────────────
  // Replaces state.scriptText (matching the manual paste/upload
  // behavior) and auto-runs the existing extraction pipeline.
  // Side-effect: products checkboxes auto-tick from parser output.
  function openAubreyScriptPicker() {
    const creds = ensureAubreyKey("scriptwriter");
    if (!creds) return;
    const s = app.state;
    const wrap = el("div");
    wrap.appendChild(el("p", { style: "margin: 0 0 12px; font-size: 13px; color: var(--bx-ink-2);",
      text: "Pick a script from Scriptwriter. The Synopsis, CX Summary, persona description, and numbered script lines will replace the current Step 2 textarea, then the extractor runs automatically." }));
    if (s.scriptText && s.scriptText.trim()) {
      wrap.appendChild(el("div", { class: "bx-alert is-warn",
        text: "Heads up — your current script text will be replaced." }));
    }
    const status = el("div", { class: "bx-mt-12" });
    const list = el("div", { class: "bx-list bx-mt-12" });
    list.appendChild(el("div", { class: "bx-empty", text: "Loading scripts…" }));
    wrap.appendChild(status); wrap.appendChild(list);
    const actions = el("div", { class: "bx-modal-actions" });
    actions.appendChild(btn("Cancel", "bx-btn-secondary", closeModal));
    wrap.appendChild(actions);
    openModal("Pull script from Aubrey", wrap);

    AUBREY.scriptwriter.listScripts({ email: creds.email, key: creds.scriptwriterKey })
      .then(function (scripts) {
        list.innerHTML = "";
        if (!scripts.length) {
          list.appendChild(el("div", { class: "bx-empty", text: "No scripts found." }));
          return;
        }
        scripts.forEach(function (sc) { list.appendChild(scriptRow(sc, creds)); });
      })
      .catch(function (e) {
        list.innerHTML = "";
        status.appendChild(el("div", { class: "bx-alert is-error", text: "Scriptwriter: " + e.message }));
      });
  }
  function scriptRow(sc, creds) {
    const item = el("div", { class: "bx-item" });
    item.appendChild(el("div", { class: "bx-item-head" }, [
      el("div", { class: "bx-item-handle", text: sc.script_name || ("Script " + sc.id) }),
      el("div", { class: "bx-item-actions" }, [
        btn("Use this script", "bx-btn-primary", function () {
          importScriptFromAubrey(sc.id, creds);
        }),
      ]),
    ]));
    const meta = [];
    if (sc.brand_name)   meta.push("Brand: " + sc.brand_name);
    if (sc.industry)     meta.push("Industry: " + sc.industry);
    if (sc.demo_type)    meta.push("Type: " + sc.demo_type);
    if (sc.persona_name) meta.push("Persona: " + sc.persona_name);
    if (meta.length) item.appendChild(el("div", { class: "bx-help", text: meta.join(" · ") }));
    return item;
  }
  function importScriptFromAubrey(scriptId, creds) {
    const s = app.state;
    toast("Loading script from Scriptwriter…");
    AUBREY.scriptwriter.getScript(scriptId, { email: creds.email, key: creds.scriptwriterKey })
      .then(function (sc) {
        if (!sc) throw new Error("Script not found");
        const text = AUBREY.renderScriptRows(sc);
        if (!text) throw new Error("Script has no rows to render");
        s.scriptText = text;

        // Run the existing parser path so foundations + acts +
        // (if missing) personas populate.
        const ok = runScriptExtraction();
        if (ok) autoTickProductsFromScript(s);

        // Fill empty brand / customer / persona fields from the
        // script's brand metadata. We never overwrite a value the
        // user has already set. Color lookup goes through DemoForge
        // since Scriptwriter only carries name + logo, not hexes.
        seedBrandFromScript(sc, creds);

        // If we pulled from Connect (Step 1), jump straight to
        // Foundations review — that's the point of the Aubrey
        // happy path. From Step 2, stay on Script so the user can
        // tweak personas/acts before moving on.
        if (s.step === "connect" && ok) s.step = "foundations";

        closeModal();
        recompute(); renderShell(); commit();
      })
      .catch(function (e) {
        toast("Couldn't import script: " + e.message);
      });
  }

  // Fills any empty Setup / brand / persona field from a Scriptwriter
  // script payload. Then, if DemoForge creds are present, looks up
  // the matching brand (by brand_name) and fills color_primary /
  // color_secondary if those slots are still at their defaults.
  // Existing user values are preserved everywhere.
  function seedBrandFromScript(sc, creds) {
    const s = app.state;
    if (!s.project.customerName && sc.brand_name)   s.project.customerName = sc.brand_name;
    if (!s.project.website      && sc.website_url)  s.project.website      = sc.website_url;
    if (!s.project.industry     && sc.industry)     s.project.industry     = sc.industry;

    // Persona — only if there's no persona at all, or the existing
    // first persona is empty. The script-extraction path may have
    // already added one from the persona description; this step
    // just makes sure the name + paragraph are filled in.
    s.personas = s.personas || [];
    if (sc.persona_name || sc.persona) {
      let persona = s.personas[0];
      if (!persona) {
        persona = { id: uid("persona_"), name: "", role: "", goals: "", painPoints: "", demoRelevance: "" };
        s.personas.push(persona);
      }
      if (!persona.name && sc.persona_name)   persona.name = sc.persona_name;
      if (!persona.demoRelevance && sc.persona) persona.demoRelevance = sc.persona;
    }

    // Brand colors live in DemoForge, not Scriptwriter. If the user
    // has a DemoForge key + email, look up the matching brand by
    // name and fill primary/secondary if still default. Default
    // values come from project-store newBlankState().
    const DEFAULT_PRIMARY = "#b22234";
    const DEFAULT_SECONDARY = "#1a5fa0";
    const stillDefaultColors =
      (s.brand.primaryColor || DEFAULT_PRIMARY) === DEFAULT_PRIMARY &&
      (s.brand.secondaryColor || DEFAULT_SECONDARY) === DEFAULT_SECONDARY;
    const noLogoYet = !s.brand.logoPath;

    if (creds.demoforgeKey && creds.email && (stillDefaultColors || noLogoYet)) {
      AUBREY.demoforge.listBrands({ email: creds.email, key: creds.demoforgeKey })
        .then(function (brands) {
          const target = (sc.brand_name || "").trim().toLowerCase();
          const match = brands.find(function (b) {
            return (b.brand_name || "").trim().toLowerCase() === target;
          });
          if (!match) return;
          if (stillDefaultColors) {
            if (match.color_primary)   s.brand.primaryColor   = match.color_primary;
            if (match.color_secondary) s.brand.secondaryColor = match.color_secondary;
          }
          // Inline the logo so exports stay self-contained.
          const logoUrl = match.logo_url || sc.logo_url;
          if (noLogoYet && logoUrl) {
            return AUBREY.inlineImageAsDataUrl(logoUrl)
              .then(function (data) { if (data) s.brand.logoPath = data; })
              .catch(function () { s.brand.logoPath = logoUrl; });
          }
        })
        .then(function () {
          renderShell(); commit();
        })
        .catch(function () { /* silent — colors stay at defaults */ });
    } else if (noLogoYet && sc.logo_url) {
      // No DemoForge creds but Scriptwriter gave us a logo URL — use it.
      AUBREY.inlineImageAsDataUrl(sc.logo_url)
        .then(function (data) { if (data) { s.brand.logoPath = data; renderShell(); commit(); } })
        .catch(function () { /* leave empty */ });
    }
  }
  function autoTickProductsFromScript(s) {
    if (!PARSER || !PARSER.extractCapabilityMoments) return [];
    const buckets = PARSER.extractCapabilityMoments(s.scriptText || "");
    const detected = [];
    Object.keys(AUBREY_CAPABILITY_TO_PRODUCT).forEach(function (k) {
      if ((buckets[k] || []).length) detected.push(AUBREY_CAPABILITY_TO_PRODUCT[k]);
    });
    if (!detected.length) return [];
    s.project.products = s.project.products || [];
    const added = [];
    detected.forEach(function (p) {
      if (s.project.products.indexOf(p) === -1) {
        s.project.products.push(p); added.push(p);
      }
    });
    s._aubreyAutoTickedProducts = (s._aubreyAutoTickedProducts || []).concat(added);
    if (added.length) {
      toast("Auto-ticked from script: " + added.join(", "));
    }
    return added;
  }

  // ── CX components picker (Pocket SIC) ──────────────────────
  function openAubreyCxPicker() {
    const creds = ensureAubreyKey("pocketsic");
    if (!creds) return;
    const wrap = el("div");
    wrap.appendChild(el("p", { style: "margin: 0 0 12px; font-size: 13px; color: var(--bx-ink-2);",
      text: "Pick a Pocket SIC project. Each scene becomes a CX component (iframable scene URL), with type and device frame auto-mapped from channel. Existing CX components are kept." }));
    const status = el("div", { class: "bx-mt-12" });
    const list = el("div", { class: "bx-list bx-mt-12" });
    list.appendChild(el("div", { class: "bx-empty", text: "Loading projects…" }));
    wrap.appendChild(status); wrap.appendChild(list);
    const actions = el("div", { class: "bx-modal-actions" });
    actions.appendChild(btn("Cancel", "bx-btn-secondary", closeModal));
    wrap.appendChild(actions);
    openModal("Pull CX components from Aubrey", wrap);

    AUBREY.pocketsic.listProjects({ key: creds.pocketsicKey })
      .then(function (projects) {
        list.innerHTML = "";
        if (!projects.length) {
          list.appendChild(el("div", { class: "bx-empty", text: "No Pocket SIC projects found." }));
          return;
        }
        projects.forEach(function (p) { list.appendChild(pocketProjectRow(p, creds)); });
      })
      .catch(function (e) {
        list.innerHTML = "";
        status.appendChild(el("div", { class: "bx-alert is-error", text: "Pocket SIC: " + e.message }));
      });
  }
  function pocketProjectRow(p, creds) {
    const item = el("div", { class: "bx-item" });
    item.appendChild(el("div", { class: "bx-item-head" }, [
      el("div", { class: "bx-item-handle", text: p.name || ("Project " + p.id) }),
      el("div", { class: "bx-item-actions" }, [
        btn("Browse scenes →", "bx-btn-secondary", function () {
          openAubreyCxScenePicker(p, creds);
        }),
      ]),
    ]));
    const meta = [];
    if (p.brand_name)   meta.push("Brand: " + p.brand_name);
    if (p.industry)     meta.push("Industry: " + p.industry);
    if (p.persona_name) meta.push("Persona: " + p.persona_name);
    if (meta.length) item.appendChild(el("div", { class: "bx-help", text: meta.join(" · ") }));
    return item;
  }
  function openAubreyCxScenePicker(project, creds) {
    const wrap = el("div");
    wrap.appendChild(el("p", { style: "margin: 0 0 12px; font-size: 13px; color: var(--bx-ink-2);",
      text: "Pick the scenes you want to import as CX components. The first 'site' scene's hero image will be inlined into Step 7's productHero slot if that slot is empty." }));
    const status = el("div", { class: "bx-mt-12" });
    const list = el("div", { class: "bx-list bx-mt-12" });
    list.appendChild(el("div", { class: "bx-empty", text: "Loading scenes…" }));
    wrap.appendChild(status); wrap.appendChild(list);
    const actions = el("div", { class: "bx-modal-actions" });
    const importBtn = btn("Import selected", "bx-btn-primary", function () { /* set after load */ });
    importBtn.disabled = true;
    actions.appendChild(importBtn);
    actions.appendChild(btn("Back", "bx-btn-secondary", function () { openAubreyCxPicker(); }));
    actions.appendChild(btn("Cancel", "bx-btn-secondary", closeModal));
    wrap.appendChild(actions);
    openModal("Pocket SIC · " + (project.name || "Project " + project.id), wrap);

    AUBREY.pocketsic.getScenes(project.id, { key: creds.pocketsicKey })
      .then(function (scenes) {
        list.innerHTML = "";
        if (!scenes.length) {
          list.appendChild(el("div", { class: "bx-empty", text: "This project has no scenes." }));
          return;
        }
        const checkboxes = [];
        scenes.forEach(function (sc) {
          const row = el("div", { class: "bx-item" });
          const cb = el("input", { type: "checkbox", style: "margin-right: 10px;" });
          cb.checked = true; checkboxes.push({ cb: cb, scene: sc });
          const label = el("label", { class: "bx-row" });
          label.appendChild(cb);
          label.appendChild(el("div", {}, [
            el("div", { class: "bx-item-handle", text: sc.name || ("Scene " + sc.id) }),
            el("div", { class: "bx-help", text: "Channel: " + (sc.channel || "?") +
              " · URL: " + AUBREY.pocketsic.sceneUrl(sc.id) }),
          ]));
          row.appendChild(label);
          list.appendChild(row);
        });
        importBtn.disabled = false;
        importBtn.onclick = function () {
          const picked = checkboxes.filter(function (x) { return x.cb.checked; }).map(function (x) { return x.scene; });
          importScenesFromAubrey(picked);
        };
      })
      .catch(function (e) {
        list.innerHTML = "";
        status.appendChild(el("div", { class: "bx-alert is-error", text: "Pocket SIC: " + e.message }));
      });
  }
  function importScenesFromAubrey(scenes) {
    if (!scenes.length) { toast("Nothing selected"); return; }
    const s = app.state;
    s.cxComponents = s.cxComponents || [];
    s.assetLibrary = s.assetLibrary || {};
    scenes.forEach(function (sc) {
      const cx = AUBREY.sceneToCxComponent(sc);
      cx.id = uid("cx_");
      s.cxComponents.push(cx);
    });
    s._cxSkipped = false;

    // Side-effect: seed productHero from the first site scene's
    // hero image — only if the slot is currently empty (no
    // overwriting manual uploads).
    const heroUrl = AUBREY.pickProductHeroImage(scenes);
    const seedJob = (heroUrl && !s.assetLibrary["productHero"])
      ? AUBREY.inlineImageAsDataUrl(heroUrl)
          .then(function (dataUrl) {
            if (dataUrl) {
              s.assetLibrary["productHero"] = dataUrl;
              s._aubreySeededProductHero = true;
              toast("productHero seeded from Aubrey site scene");
            }
          })
          .catch(function () { /* ignore — user can upload manually */ })
      : Promise.resolve();

    seedJob.then(function () {
      closeModal();
      recompute(); renderShell(); commit();
      toast("Imported " + scenes.length + " CX component" + (scenes.length === 1 ? "" : "s"));
    });
  }

  // ─── Auth: login view ─────────────────────────────────────────
  // Passwordless: enter @salesforce.com email → emailed 6-digit code →
  // in. Same path for new and returning users (OTP sign-in auto-creates
  // the account). @salesforce.com is enforced client-side here (UX) and
  // authoritatively server-side via RLS on the verified JWT email claim.
  function renderLoginPage(wrap) {
    // step: "email" → enter address, "code" → enter the emailed OTP.
    const ui = { step: "email", email: "", otp: "", busy: false, error: "", notice: "" };

    function field(labelText, type, getKey) {
      const input = el("input", { class: "bx-input", type: type, value: ui[getKey] || "" });
      input.addEventListener("input", function () { ui[getKey] = input.value; });
      return { wrap: el("label", { class: "bx-field" }, [
        el("span", { class: "bx-field-label", text: labelText }), input,
      ]), input: input };
    }

    function paint() {
      wrap.innerHTML = "";
      const card = el("div", { class: "bx-login-card",
        style: "max-width:420px;margin:64px auto;display:flex;flex-direction:column;gap:14px;" });

      card.appendChild(el("div", { class: "bx-firstrun-mark", text: "🪐" }));
      card.appendChild(el("h1", { class: "bx-main-title",
        text: ui.step === "code" ? "Check your email" : "Holodeck Builder" }));
      card.appendChild(el("p", { class: "bx-main-sub", text:
        ui.step === "code"
          ? ("We sent a 6-digit code to " + ui.email + ". Enter it to sign in.")
          : "Enter your Salesforce email and we'll send you a sign-in code." }));

      if (ui.error)  card.appendChild(el("div", { class: "bx-alert is-error", text: ui.error }));
      if (ui.notice) card.appendChild(el("div", { class: "bx-alert is-warn", text: ui.notice }));

      if (ui.step === "code") {
        const otp = field("Sign-in code", "text", "otp");
        otp.input.setAttribute("inputmode", "numeric");
        otp.input.setAttribute("autocomplete", "one-time-code");
        card.appendChild(otp.wrap);
        card.appendChild(actionBtn(ui.busy ? "Verifying…" : "Verify & continue", "bx-btn-primary is-block", doVerify));
        card.appendChild(el("button", { class: "bx-link",
          on: { click: function () { if (!ui.busy) doResend(); } },
          text: "Resend code" }));
        card.appendChild(el("button", { class: "bx-link",
          on: { click: function () { if (!ui.busy) { ui.step = "email"; ui.otp = ""; ui.error = ""; ui.notice = ""; paint(); } } },
          text: "← Use a different email" }));
        wrap.appendChild(card);
        return;
      }

      const emailF = field("Salesforce email", "email", "email");
      emailF.input.setAttribute("autocomplete", "username");
      emailF.input.setAttribute("placeholder", "you@salesforce.com");
      card.appendChild(emailF.wrap);

      card.appendChild(actionBtn(ui.busy ? "Sending…" : "Email me a code", "bx-btn-primary is-block", doRequestCode));

      wrap.appendChild(card);
    }

    function guardEmail() {
      if (!AUTH.isSalesforceEmail(ui.email)) {
        ui.error = "Use your @salesforce.com email.";
        paint();
        return false;
      }
      return true;
    }

    function doRequestCode() {
      if (ui.busy || !guardEmail()) return;
      ui.busy = true; ui.error = ""; paint();
      AUTH.requestCode(ui.email)
        .then(function () { ui.busy = false; ui.step = "code"; ui.notice = ""; paint(); })
        .catch(function (err) { ui.busy = false; ui.error = (err && err.message) || "Could not send a code."; paint(); });
    }

    function doResend() {
      ui.busy = true; ui.error = ""; paint();
      AUTH.requestCode(ui.email)
        .then(function () { ui.busy = false; ui.notice = "A new code is on its way."; ui.error = ""; paint(); })
        .catch(function (err) { ui.busy = false; ui.error = (err && err.message) || "Could not resend the code."; paint(); });
    }

    function doVerify() {
      if (ui.busy) return;
      ui.busy = true; ui.error = ""; paint();
      AUTH.verifyOtp(ui.email, ui.otp)
        .then(function () { onAuthenticated(); })
        .catch(function (err) { ui.busy = false; ui.error = (err && err.message) || "That code didn't work."; paint(); });
    }

    paint();
  }

  // Transition from the login view into the authenticated app: migrate
  // any local work into the account, then land on home.
  function onAuthenticated() {
    return STORE.migrateLegacyIfPresent()
      .then(function () { return STORE.migrateLocalToAccount(); })
      .then(function () { return STORE.flushDirty(); })
      .then(function () { goHome(); });
  }

  function signOut() {
    AUTH.signOut()
      .then(function () { return STORE.clearCache(); })
      .then(function () {
        app.view = "login";
        app.state = null;
        render();
      });
  }

  // ─── Boot ─────────────────────────────────────────────────────
  function boot() {
    $("#bxModal").addEventListener("click", function (e) {
      if (e.target === $("#bxModal")) closeModal();
    });
    document.addEventListener("click", function (e) {
      const action = e.target.getAttribute && e.target.getAttribute("data-action");
      if (action === "close-modal") closeModal();
    });

    // Auth gate: no Data API calls until we have a verified session.
    AUTH.init().then(function (user) {
      if (!user) {
        app.view = "login";
        render();
        return;
      }
      // Authenticated: lift legacy/local work, retry any dirty rows, land home.
      onAuthenticated();
    });
  }

  boot();
})();
